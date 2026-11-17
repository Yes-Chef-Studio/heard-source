// Automated scoring run. For each URL × reviewer browser × viewport × scroll position:
//   - load the page in that browser (Chromium / WebKit≈Safari / Firefox) and take a real screenshot
//     (ground truth = what the reviewer actually sees)
//   - run the capture script in-page (snapshot + DOM-to-image)
//   - render A on the server with the reviewer's engine (15 s limit, Chromium fallback); B on Chromium
//   - score every approach against ground truth
//
// Usage: node harness.mjs <url> [url...] [--browsers chromium,webkit,firefox] [--widths 1440,390] [--scrolls 0,1200]
//        [--click "<selector>"]   interact before capturing (e.g. open a menu) to test page state
//        [--server-engine match|chromium]   render with the reviewer's engine (default) or always Chromium
//        [--export <dir>]   also save each view's snapshot + ground truth, for replay on another OS
//                           with crossos.mjs (e.g. Mac captures rendered on Linux)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";
import { renderFresh, renderSnapshotWithFallback, scoreAgainst, settle, dataUrlToBuffer } from "./lib/render.mjs";
import { newCaptureId, saveCapture } from "./lib/store.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value.split(",").map((s) => s.trim()).filter(Boolean);
};
const browsers = opt("browsers", ["chromium", "webkit", "firefox"]);
const widths = opt("widths", ["1440", "390"]).map(Number);
const scrolls = opt("scrolls", ["0", "1200"]).map(Number);
const click = opt("click", [])[0];
const serverEngine = opt("server-engine", ["match"])[0];
const exportDir = opt("export", [])[0];
let exported = 0;
const urls = args.filter((a) => !a.startsWith("--"));
if (!urls.length) {
  console.error("Usage: node harness.mjs <url> [url...] [--browsers ...] [--widths ...] [--scrolls ...]");
  process.exit(1);
}

const engines = { chromium, webkit, firefox };
const widgetJs = readFileSync(new URL("./dist/widget.js", import.meta.url), "utf8");
const heightFor = (w) => (w >= 1000 ? 900 : 844);

const renderers = {};
const rendererFor = async (name) => {
  const engine = serverEngine === "match" ? name : "chromium";
  return (renderers[engine] ??= await engines[engine].launch());
};
const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);
const diffBrowser = await chromium.launch();
const diffPage = await (await diffBrowser.newContext()).newPage();
const rows = [];

for (const browserName of browsers) {
  const reviewer = await engines[browserName].launch();
  for (const url of urls) {
    for (const width of widths) {
      for (const scrollY of scrolls) {
        const viewport = { width, height: heightFor(width) };
        const label = `${browserName} ${width}px @${scrollY}${click ? ` click(${click})` : ""} ${url}`;
        const context = await reviewer.newContext({ viewport, deviceScaleFactor: 1, bypassCSP: true });
        try {
          const page = await context.newPage();
          await settle(page, url, { x: 0, y: scrollY });
          if (click) {
            await page.click(click, { timeout: 5000 });
            await page.waitForTimeout(1000);
          }
          const truth = await page.screenshot();
          await page.addScriptTag({ content: widgetJs });
          const payload = await withTimeout(page.evaluate(() => window.HeardCapture.capture()), 60000, "In-page capture");

          const primary = await rendererFor(browserName);
          const chromiumRenderer = await rendererFor("chromium");
          const [snap, fresh] = await Promise.all([
            renderSnapshotWithFallback(primary, chromiumRenderer, payload),
            renderFresh(chromiumRenderer, payload),
          ]);
          const domPng = dataUrlToBuffer(payload.domToImage?.png);
          const [sSnap, sFresh, sDom] = await Promise.all([
            scoreAgainst(diffPage, truth, snap.png),
            scoreAgainst(diffPage, truth, fresh.png),
            scoreAgainst(diffPage, truth, domPng),
          ]);

          const id = newCaptureId();
          saveCapture(
            id,
            {
              id,
              source: "harness",
              url: payload.url,
              title: payload.title,
              browser: browserName,
              serverEngine: snap.engine,
              interaction: click || null,
              userAgent: payload.userAgent,
              viewport: payload.viewport,
              scroll: payload.scroll,
              capturedAt: payload.capturedAt,
              snapshotBytes: Buffer.byteLength(JSON.stringify(payload.snapshot)),
              snapshotMs: payload.snapshotMs,
              status: "done",
              results: {
                truth: { file: "truth.png" },
                snapshot: { file: snap.png && "snapshot.png", diffFile: sSnap.diffPng && "snapshot.diff.png", ms: snap.ms, error: snap.error, match: sSnap.match },
                fresh: { file: fresh.png && "fresh.png", diffFile: sFresh.diffPng && "fresh.diff.png", ms: fresh.ms, error: fresh.error, match: sFresh.match },
                dom: { file: domPng && "dom.png", diffFile: sDom.diffPng && "dom.diff.png", ms: payload.domToImage?.ms, error: payload.domToImage?.error, match: sDom.match },
              },
            },
            {
              "truth.png": truth,
              "snapshot.png": snap.png,
              "fresh.png": fresh.png,
              "dom.png": domPng,
              "snapshot.diff.png": sSnap.diffPng,
              "fresh.diff.png": sFresh.diffPng,
              "dom.diff.png": sDom.diffPng,
            },
          );
          if (exportDir) {
            const dir = `${exportDir}/${String(++exported).padStart(3, "0")}`;
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/truth.png`, truth);
            writeFileSync(
              `${dir}/case.json`,
              JSON.stringify({
                label,
                browser: browserName,
                platform: process.platform,
                sourceMatch: sSnap.match,
                payload: { snapshot: payload.snapshot, viewport: payload.viewport, scroll: payload.scroll, userAgent: payload.userAgent, url: payload.url },
              }),
            );
          }
          rows.push({ label, snapshot: sSnap.match, fresh: sFresh.match, dom: sDom.match, kb: Math.round(Buffer.byteLength(JSON.stringify(payload.snapshot)) / 1024) });
          console.log(`✓ ${label}  A=${sSnap.match ?? "ERR"}%  B=${sFresh.match ?? "ERR"}%  C=${sDom.match ?? "ERR"}%${snap.error ? `  [A: ${snap.error}]` : ""}  [A via ${snap.engine}, ${snap.ms} ms]${payload.domToImage?.error ? `  [C: ${payload.domToImage.error}]` : ""}`);
        } catch (error) {
          console.log(`✗ ${label}  ${String(error.message || error).split("\n")[0]}`);
        } finally {
          await context.close();
        }
      }
    }
  }
  await reviewer.close();
}

for (const r of Object.values(renderers)) await r.close();
await diffBrowser.close();

const avg = (k) => {
  const v = rows.map((r) => r[k]).filter((x) => typeof x === "number");
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–";
};
console.log(`\n${rows.length} captures. Avg match vs ground truth:  A snapshot=${avg("snapshot")}%  B reload=${avg("fresh")}%  C DOM-to-image=${avg("dom")}%`);
console.log("Gallery: npm start, then open http://localhost:4400");
