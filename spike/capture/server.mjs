// Spike server: serves the widget, accepts captures from real browsers, renders approaches A + B,
// and shows the comparison gallery. Local use only — no auth, permissive CORS.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { chromium } from "playwright";
import { renderFresh, renderSnapshot, dataUrlToBuffer } from "./lib/render.mjs";
import { CAPTURES_DIR, listCaptures, newCaptureId, renderGallery, saveCapture } from "./lib/store.mjs";

const PORT = Number(process.env.PORT || 4400);
const MAX_BODY = 60 * 1024 * 1024;
const widgetJs = () => readFileSync(new URL("./dist/widget.js", import.meta.url));

let browserPromise;
const getBrowser = () => (browserPromise ??= chromium.launch());

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...cors, "content-type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("Payload too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function processCapture(id, payload, meta) {
  const browser = await getBrowser();
  const [snap, fresh] = await Promise.all([renderSnapshot(browser, payload), renderFresh(browser, payload)]);
  meta.results.snapshot = { file: snap.png ? "snapshot.png" : null, ms: snap.ms, error: snap.error };
  meta.results.fresh = { file: fresh.png ? "fresh.png" : null, ms: fresh.ms, error: fresh.error };
  meta.status = "done";
  saveCapture(id, meta, { "snapshot.png": snap.png, "fresh.png": fresh.png });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");

    if (req.method === "GET" && url.pathname === "/widget.js") {
      return send(res, 200, widgetJs(), "application/javascript; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, renderGallery(listCaptures()), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname.startsWith("/captures/")) {
      const rel = normalize(decodeURIComponent(url.pathname.slice("/captures/".length)));
      const file = join(CAPTURES_DIR, rel);
      if (!file.startsWith(CAPTURES_DIR) || !existsSync(file) || !statSync(file).isFile()) {
        return send(res, 404, "Not found");
      }
      const type = file.endsWith(".png") ? "image/png" : "application/json";
      return send(res, 200, readFileSync(file), type);
    }

    if (req.method === "POST" && url.pathname === "/capture") {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);
      if (!payload?.snapshot || !payload?.viewport || !payload?.url) return send(res, 400, "Missing fields");

      const id = newCaptureId();
      const meta = {
        id,
        source: "widget",
        url: payload.url,
        title: payload.title,
        browser: payload.userAgent,
        userAgent: payload.userAgent,
        viewport: payload.viewport,
        scroll: payload.scroll,
        capturedAt: payload.capturedAt,
        snapshotBytes: Buffer.byteLength(JSON.stringify(payload.snapshot)),
        snapshotMs: payload.snapshotMs,
        status: "rendering",
        results: {
          dom: {
            file: payload.domToImage?.png ? "dom.png" : null,
            ms: payload.domToImage?.ms,
            error: payload.domToImage?.error,
          },
        },
      };
      saveCapture(id, meta, {
        "dom.png": dataUrlToBuffer(payload.domToImage?.png),
        "snapshot.json": JSON.stringify(payload.snapshot),
      });
      processCapture(id, payload, meta).catch((error) => {
        meta.status = `failed: ${error.message}`;
        saveCapture(id, meta);
      });
      return send(res, 202, JSON.stringify({ id }), "application/json");
    }

    send(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    send(res, 500, String(error.message || error));
  }
});

server.listen(PORT, () => {
  console.log(`Capture spike running at http://localhost:${PORT}`);
  console.log(`Embed: <script src="http://localhost:${PORT}/widget.js" data-heard-auto></script>`);
});
