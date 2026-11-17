// Local widget test host on http://localhost:4500.
//   /                    test page with the feedback widget (pass ?key=crk_... once; it's remembered)
//   /capture.global.js   the built capture SDK, for injecting into other local pages via bookmarklet
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SDK = fileURLToPath(new URL("../app/sdks/capture/dist/capture.global.js", import.meta.url));
const API = process.env.HEARD_API || "http://localhost:3100";
const PORT = 4500;
// Default key for the local test org, so the page works in any browser without pasting a key.
// Lives in .devtools/ (gitignored). A key saved on the page or passed as ?key= takes priority.
let defaultKey = "";
try {
  defaultKey = readFileSync(fileURLToPath(new URL("../.devtools/test-key", import.meta.url)), "utf8").trim();
} catch {}

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Heard widget test</title>
<style>
  body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#111;background:#f6f4ef}
  header{padding:24px 32px;background:#111;color:#fff;display:flex;justify-content:space-between;align-items:center}
  main{max-width:880px;margin:0 auto;padding:32px 16px}
  .hero{background:linear-gradient(135deg,#ff5a1f,#ffb21f);color:#fff;border-radius:16px;padding:48px 32px;margin-bottom:32px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:32px 0}
  .card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
  canvas{width:100%;height:220px;border-radius:12px;display:block;background:#222}
  code{background:#eee;padding:2px 6px;border-radius:4px;word-break:break-all}
  .setup{background:#fff;border:2px dashed #ff5a1f;border-radius:12px;padding:20px}
</style></head><body>
<header><strong>Widget test page</strong><span id="status"></span></header>
<main>
  <div id="setup" class="setup" hidden>
    <p><strong>Paste your capture key</strong>. Find it in the web app under Settings, then Public keys. The key's allowed origins must include <code>http://localhost:4500</code>.</p>
    <form onsubmit="event.preventDefault();localStorage.setItem('heardKey',this.k.value.trim());location.search='';">
      <input name="k" placeholder="crk_..." style="width:70%;padding:8px"> <button>Save</button>
    </form>
  </div>
  <section class="hero"><h1>Leave feedback on this page</h1><p>Click the feedback button in the corner, take a screenshot, annotate it and submit. No screen-share prompt should appear.</p></section>
  <canvas id="gl"></canvas>
  <div class="grid">
    <div class="card"><h3>Typography</h3><p>Checks that fonts and layout survive the server render.</p></div>
    <div class="card"><h3>Scroll</h3><p>Scroll down before capturing and the screenshot should match where you are.</p></div>
    <div class="card"><h3>Canvas</h3><p>The animated canvas above should appear in the capture at its current frame.</p></div>
  </div>
  ${Array.from({ length: 8 }, (_, i) => `<p>Section ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join("")}
  <h3>Test any other local page</h3>
  <p>Drag this to your bookmarks bar, open a local http page (e.g. <code>http://localhost:3001</code>), and click it. Add that page's origin to the key's allowed origins first.</p>
  <p><a id="bm" href="#">Heard feedback</a></p>
</main>
<script>
  const params = new URLSearchParams(location.search);
  if (params.get("key")) localStorage.setItem("heardKey", params.get("key"));
  const key = localStorage.getItem("heardKey") || ${JSON.stringify(defaultKey)};
  document.getElementById("bm").href = "javascript:(()=>{const s=document.createElement('script');s.src='http://localhost:${PORT}/capture.global.js';s.onload=()=>CrikketCapture.init({key:'" + (key || "PASTE_KEY") + "',host:'${API}'});document.head.appendChild(s)})()";
  // Animated 2D canvas so captures prove they grab the current frame.
  const c = document.getElementById("gl"), x = c.getContext("2d");
  (function draw(t) {
    c.width = c.clientWidth; c.height = c.clientHeight;
    x.fillStyle = "#222"; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 12; i++) { x.fillStyle = "hsl(" + (i * 30 + t / 20) % 360 + ",80%,60%)"; x.beginPath(); x.arc(c.width / 2 + Math.cos(t / 900 + i) * c.width / 3, c.height / 2 + Math.sin(t / 700 + i) * 70, 18, 0, 7); x.fill(); }
    requestAnimationFrame(draw);
  })(0);
  if (!key) { document.getElementById("setup").hidden = false; document.getElementById("status").textContent = "no key"; }
  else {
    const s = document.createElement("script");
    s.src = "/capture.global.js";
    s.onload = () => { CrikketCapture.init({ key, host: "${API}" }); document.getElementById("status").textContent = "widget loaded"; };
    s.onerror = () => { document.getElementById("status").textContent = "SDK not built: run dev/up.sh"; };
    document.head.appendChild(s);
  }
</script></body></html>`;

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/capture.global.js") {
    try {
      res.writeHead(200, { "content-type": "text/javascript", "access-control-allow-origin": "*", "cache-control": "no-store" });
      return res.end(await readFile(SDK));
    } catch {
      res.writeHead(404);
      return res.end("SDK not built");
    }
  }
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(page);
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`Widget test page: http://localhost:${PORT}`));
