// Renders the Heard mark to the PNG/ICO sizes the dashboard uses. Run: node brand/render-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../spike/capture/package.json", import.meta.url));
const { chromium } = require("playwright");
const mark = readFileSync(new URL("./mark-bubble-h.svg", import.meta.url), "utf8");
const out = new URL("../app/apps/web/public/favicon/", import.meta.url);

// Transparent mark for small favicons; padded on a white tile for app/home-screen icons.
const transparent = (s) => `<html><body style="margin:0;background:transparent"><div style="width:${s}px;height:${s}px">${mark.replace("<svg", '<svg width="100%" height="100%"')}</div></body></html>`;
const tile = (s) => `<html><body style="margin:0"><div style="width:${s}px;height:${s}px;background:#fff;display:flex;align-items:center;justify-content:center"><div style="width:${s * 0.62}px;height:${s * 0.62}px">${mark.replace("<svg", '<svg width="100%" height="100%"')}</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(html, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
writeFileSync(new URL("favicon-96x96.png", out), await png(transparent(96), 96));
writeFileSync(new URL("apple-touch-icon.png", out), await png(tile(180), 180));
writeFileSync(new URL("web-app-manifest-192x192.png", out), await png(tile(192), 192));
writeFileSync(new URL("web-app-manifest-512x512.png", out), await png(tile(512), 512));

// ICO with PNG payloads (supported by every current browser).
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(transparent(s), s));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
writeFileSync(new URL("favicon.ico", out), Buffer.concat([header, ...entries, ...images]));
await browser.close();
console.log("icons written");
