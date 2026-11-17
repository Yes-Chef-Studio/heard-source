// Server-side rendering + scoring shared by the server and the harness.
import { readFileSync } from "node:fs";
// Same network layer as the production renderer (font CORS, redirect checks).
import { guardContext } from "../../../app/apps/renderer/src/network-guard.mjs";

const rendererJs = readFileSync(new URL("../dist/renderer.js", import.meta.url), "utf8");

const BLANK_PAGE =
  '<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#fff}</style></head><body><div id="root"></div></body></html>';

async function timed(fn) {
  const t0 = Date.now();
  try {
    const png = await fn();
    return { png, ms: Date.now() - t0, error: null };
  } catch (error) {
    return { png: null, ms: Date.now() - t0, error: String(error?.message || error).split("\n")[0] };
  }
}

/**
 * Approach A with engine matching: try the reviewer's engine (e.g. WebKit for Safari) under a hard
 * time limit, and fall back to Chromium if it errors or runs over.
 */
export async function renderSnapshotWithFallback(primary, fallback, payload, timeoutMs = 15000) {
  if (primary === fallback) return { ...(await renderSnapshot(fallback, payload, timeoutMs)), engine: "chromium" };
  const first = await renderSnapshot(primary, payload, timeoutMs);
  if (first.png) return { ...first, engine: primary.browserType().name() };
  const second = await renderSnapshot(fallback, payload, timeoutMs);
  return {
    ...second,
    ms: first.ms + second.ms,
    engine: `chromium (fallback: ${first.error})`,
  };
}

/** Approach A: rebuild the client's DOM snapshot and screenshot it. */
export async function renderSnapshot(browser, { snapshot, viewport, scroll }, timeoutMs = 15000) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await guardContext(context);
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Render timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await timed(() => Promise.race([deadline, (async () => {
      const page = await context.newPage();
      await page.setContent(BLANK_PAGE);
      await page.addScriptTag({ content: rendererJs });
      await page.evaluate(
        ({ snapshot, viewport, scroll }) => window.HeardRender.rebuild(snapshot, viewport, scroll),
        { snapshot, viewport, scroll },
      );
      return page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } });
    })()]));
  } finally {
    clearTimeout(timer);
    // Closing the context aborts anything still hanging inside it.
    await context.close().catch(() => {});
  }
}

/** Approach B: load the URL fresh on the server at the same viewport + scroll. Loses page state. */
export async function renderFresh(browser, { url, viewport, scroll }) {
  const protocol = new URL(url).protocol;
  if (protocol !== "https:" && protocol !== "http:") {
    return { png: null, ms: 0, error: `Refusing to load ${protocol} URL` };
  }
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  try {
    return await timed(async () => {
      const page = await context.newPage();
      await settle(page, url, scroll);
      return page.screenshot();
    });
  } finally {
    await context.close();
  }
}

/** Load a page, scroll, and give Webflow interactions time to finish. */
export async function settle(page, url, scroll) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.evaluate(({ x, y }) => window.scrollTo(x, y), scroll);
  await page.waitForTimeout(1500);
}

/**
 * Compare a candidate image against ground truth. Returns % of pixels whose max channel
 * difference is within tolerance, plus a diff image (mismatches in red).
 */
export async function scoreAgainst(diffPage, truthPng, candidatePng) {
  if (!truthPng || !candidatePng) return { match: null, diffPng: null };
  const toDataUrl = (buf) =>
    typeof buf === "string" ? buf : `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  const result = await diffPage.evaluate(
    async ({ a, b, tolerance }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.naturalWidth;
      const h = ia.naturalHeight;
      const pixels = (img) => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
      };
      const da = pixels(ia).data;
      const db = pixels(ib).data;
      const out = new OffscreenCanvas(w, h);
      const octx = out.getContext("2d");
      const diff = octx.createImageData(w, h);
      let same = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        if (d <= tolerance) {
          same++;
          const g = (da[i] + da[i + 1] + da[i + 2]) / 3;
          diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = 255 - (255 - g) * 0.25;
        } else {
          diff.data[i] = 230; diff.data[i + 1] = 30; diff.data[i + 2] = 30;
        }
        diff.data[i + 3] = 255;
      }
      octx.putImageData(diff, 0, 0);
      const blob = await out.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { match: (same / (w * h)) * 100, diffB64: btoa(bin) };
    },
    { a: toDataUrl(truthPng), b: toDataUrl(candidatePng), tolerance: 40 },
  );
  return { match: Math.round(result.match * 10) / 10, diffPng: Buffer.from(result.diffB64, "base64") };
}

export function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null;
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}
