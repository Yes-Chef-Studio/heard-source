// End-to-end smoke test for a running Heard deployment (docker-compose.heard.yml). Used by CI.
//   node smoke.mjs --api http://localhost:3000 --web http://localhost:3001 --key crk_... --origin https://allowed.example
//
// Checks: API and web respond; the site check allows only the key's listed origin; a real DOM
// snapshot renders to an image (JPEG) through the API on the engine matching each reviewer browser; an
// unlisted origin is refused.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) throw new Error(`--${name} is required`);
  return args[i + 1];
};
const API = arg("api");
const WEB = arg("web");
const KEY = arg("key");
const ORIGIN = arg("origin");
const OTHER = "https://production-site.example";

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

// 1. Services up
const apiRoot = await fetch(API).catch((e) => e);
check(apiRoot.ok, "API responds", apiRoot.status ?? apiRoot.message);
const webRoot = await fetch(`${WEB}/login`, { redirect: "manual" }).catch((e) => e);
check(webRoot.status > 0 && webRoot.status < 500, "Web app responds", webRoot.status ?? webRoot.message);

// 2. Site check: only the listed origin may show the widget
const siteCheck = async (origin) => {
  const r = await fetch(`${API}/api/embed/site-check?key=${encodeURIComponent(KEY)}`, { headers: { origin } });
  return { status: r.status, cors: r.headers.get("access-control-allow-origin"), body: await r.json() };
};
const allowed = await siteCheck(ORIGIN);
check(allowed.body.allowed === true, "Site check allows the listed staging origin", JSON.stringify(allowed.body));
check(allowed.cors === ORIGIN, "Site check is readable cross-origin", allowed.cors);
const denied = await siteCheck(OTHER);
check(denied.body.allowed === false, "Site check refuses an unlisted (production) origin", JSON.stringify(denied.body));
const badKey = await fetch(`${API}/api/embed/site-check?key=crk_nope`, { headers: { origin: ORIGIN } }).then((r) => r.json());
check(badKey.allowed === false, "Site check refuses an unknown key");

// 3. Snapshot a real page with the capture script, then render it through the API
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("https://example.com/", { waitUntil: "load" });
await page.addScriptTag({ content: readFileSync(new URL("./dist/widget.js", import.meta.url), "utf8") });
const payload = await page.evaluate(() => window.HeardCapture.capture());
await browser.close();

const reviewers = {
  chromium: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  webkit: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
};
const render = (origin, userAgent) =>
  fetch(`${API}/api/embed/render-snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-crikket-public-key": KEY },
    body: JSON.stringify({ snapshot: payload.snapshot, viewport: payload.viewport, scroll: payload.scroll, userAgent }),
  });

for (const [engine, ua] of Object.entries(reviewers)) {
  const started = Date.now();
  const r = await render(ORIGIN, ua);
  const bytes = Buffer.from(await r.arrayBuffer());
  // The renderer returns JPEG (smaller, faster to encode); accept PNG too.
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const type = r.headers.get("content-type") || "";
  const used = r.headers.get("x-render-engine");
  check(
    r.status === 200 && (isJpeg || isPng) && type.startsWith("image/"),
    `Render via API for a ${engine} reviewer returns an image`,
    `${r.status}, ${type}, ${bytes.length} bytes, ${Date.now() - started} ms`
  );
  check(used === engine, `  rendered on ${engine}`, `x-render-engine=${used}`);
  if (isPng) writeFileSync(`smoke-${engine}.png`, bytes);
}

const refused = await render(OTHER, reviewers.chromium);
check(refused.status === 403, "Render refuses an unlisted origin", refused.status);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
