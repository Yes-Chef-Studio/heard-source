// Snapshot renderer. Internal service: the API server forwards widget snapshots here and gets a PNG
// back. Rebuilds the DOM in a sandboxed, scriptless iframe and screenshots it on the reviewer's
// browser engine (WebKit for Safari/iOS, Firefox for Firefox), falling back to Chromium.
//
// POST /render  { snapshot, viewport: {width,height,dpr}, scroll: {x,y}, userAgent }  -> image/png
// GET  /health
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";
import { guardContext } from "./network-guard.mjs";

const PORT = Number(process.env.RENDERER_PORT || process.env.PORT || 3102);
const HOST = process.env.RENDERER_HOST || "127.0.0.1";
const SECRET = process.env.RENDERER_SECRET || "";
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT = Number(process.env.RENDERER_CONCURRENCY || 3);
const MAX_DIMENSION = 4000;

if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("RENDERER_SECRET is required in production.");
}

const rebuildJs = readFileSync(new URL("../dist/rebuild.js", import.meta.url), "utf8");
const BLANK_PAGE =
  '<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#fff}</style></head><body><div id="root"></div></body></html>';

// ---- engines ---------------------------------------------------------------------------------

const ENGINES = { chromium, webkit, firefox };
const launched = new Map();

async function getBrowser(name) {
  let pending = launched.get(name);
  if (!pending) {
    pending = ENGINES[name].launch();
    launched.set(name, pending);
    pending
      .then((browser) => browser.on("disconnected", () => launched.delete(name)))
      .catch(() => launched.delete(name));
  }
  return pending;
}

/** All iOS browsers are WebKit. Desktop Safari is WebKit. Firefox (not FxiOS) is Gecko. */
export function engineForUserAgent(ua = "") {
  if (/iPhone|iPad|iPod/.test(ua)) return "webkit";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser/.test(ua)) return "webkit";
  return "chromium";
}

// ---- rendering -------------------------------------------------------------------------------

async function renderOn(engine, { snapshot, viewport, scroll }) {
  const browser = await getBrowser(engine);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: Math.min(Math.max(viewport.dpr || 1, 1), 2),
    javaScriptEnabled: true, // our rebuild script needs it; the client's page scripts never run
  });
  let timer;
  try {
    await guardContext(context);
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${RENDER_TIMEOUT_MS} ms`)), RENDER_TIMEOUT_MS);
    });
    return await Promise.race([
      deadline,
      (async () => {
        const page = await context.newPage();
        await page.setContent(BLANK_PAGE);
        await page.addScriptTag({ content: rebuildJs });
        const info = await page.evaluate(
          ({ snapshot, viewport, scroll }) => window.HeardRender.rebuild(snapshot, viewport, scroll),
          { snapshot, viewport, scroll },
        );
        const png = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } });
        return { png, info };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    // Closing the context aborts anything still hanging inside it.
    await context.close().catch(() => {});
  }
}

async function render(payload) {
  const t0 = Date.now();
  const primary = engineForUserAgent(payload.userAgent);
  try {
    const result = await renderOn(primary, payload);
    return { ...result, engine: primary, ms: Date.now() - t0 };
  } catch (error) {
    if (primary === "chromium") throw error;
    const result = await renderOn("chromium", payload);
    return {
      ...result,
      engine: "chromium",
      fallbackReason: `${primary}: ${String(error?.message || error).split("\n")[0]}`,
      ms: Date.now() - t0,
    };
  }
}

// Simple semaphore so a burst of captures can't spawn unbounded browser contexts.
let active = 0;
const queue = [];
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => queue.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

// ---- http ------------------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  res.writeHead(status, {
    "content-type": isBuffer ? "image/png" : "application/json",
    ...headers,
  });
  res.end(isBuffer ? body : JSON.stringify(body));
}

function authorized(req) {
  if (!SECRET) return true;
  const given = Buffer.from(String(req.headers["x-renderer-secret"] || ""));
  const expected = Buffer.from(SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Snapshot too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validate(body) {
  const { snapshot, viewport, scroll } = body || {};
  const ok =
    snapshot && typeof snapshot === "object" && snapshot.type === 0 &&
    viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) &&
    viewport.width > 0 && viewport.height > 0 &&
    viewport.width <= MAX_DIMENSION && viewport.height <= MAX_DIMENSION;
  if (!ok) throw Object.assign(new Error("Invalid render payload"), { status: 400 });
  return {
    snapshot,
    viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height), dpr: Number(viewport.dpr) || 1 },
    scroll: { x: Math.round(Number(scroll?.x) || 0), y: Math.round(Number(scroll?.y) || 0) },
    userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 512) : "",
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, active, queued: queue.length });
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "Not found" });
    if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });

    const payload = validate(await readJson(req));
    const result = await withSlot(() => render(payload));
    console.log(
      `render ${payload.viewport.width}x${payload.viewport.height} on ${result.engine} in ${result.ms} ms` +
        (result.fallbackReason ? ` (fallback: ${result.fallbackReason})` : "") +
        (result.info?.stalled?.length ? ` stalled=${result.info.stalled.length}` : ""),
    );
    return send(res, 200, result.png, {
      "x-render-engine": result.engine,
      "x-render-ms": String(result.ms),
      ...(result.fallbackReason ? { "x-render-fallback": result.fallbackReason.slice(0, 200) } : {}),
    });
  } catch (error) {
    const status = error?.status || 500;
    if (status === 500) console.error("render failed", error);
    return send(res, status, { error: String(error?.message || error).split("\n")[0] });
  }
});

server.listen(PORT, HOST, () => console.log(`Renderer listening on http://${HOST}:${PORT}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await Promise.all([...launched.values()].map((p) => p.then((b) => b.close()).catch(() => {})));
    process.exit(0);
  });
}
