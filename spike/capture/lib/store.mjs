// File-based capture store + comparison gallery. Spike only: no DB, no auth.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const CAPTURES_DIR = new URL("../captures/", import.meta.url).pathname;

export const METHODS = [
  { key: "truth", label: "Ground truth", note: "What the reviewer saw (harness only)" },
  { key: "snapshot", label: "A · Snapshot → server render", note: "DOM snapshot rebuilt in headless Chromium" },
  { key: "fresh", label: "B · Server reloads URL", note: "Fresh load at same viewport/scroll; loses page state" },
  { key: "dom", label: "C · DOM-to-image in browser", note: "html-to-image, the typical widget approach" },
];

export function newCaptureId() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

export function saveCapture(id, meta, files = {}) {
  const dir = join(CAPTURES_DIR, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, buf] of Object.entries(files)) {
    if (buf) writeFileSync(join(dir, name), buf);
  }
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
}

export function listCaptures() {
  if (!existsSync(CAPTURES_DIR)) return [];
  return readdirSync(CAPTURES_DIR)
    .filter((id) => existsSync(join(CAPTURES_DIR, id, "meta.json")))
    .map((id) => JSON.parse(readFileSync(join(CAPTURES_DIR, id, "meta.json"), "utf8")))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function average(captures, key) {
  const vals = captures.map((c) => c.results?.[key]?.match).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function badge(match) {
  if (typeof match !== "number") return "";
  const tone = match >= 97 ? "good" : match >= 90 ? "ok" : "bad";
  return `<span class="badge ${tone}">${match}% match</span>`;
}

export function renderGallery(captures) {
  const scored = captures.filter((c) => c.results?.truth?.file);
  const byBrowser = {};
  for (const c of scored) (byBrowser[c.browser || "unknown"] ??= []).push(c);

  const summaryRows = Object.entries(byBrowser)
    .map(
      ([browser, list]) =>
        `<tr><td>${esc(browser)}</td><td>${list.length}</td>${["snapshot", "fresh", "dom"]
          .map((k) => `<td>${average(list, k) ?? "–"}${average(list, k) != null ? "%" : ""}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  const cards = captures
    .map((c) => {
      const cells = METHODS.map((m) => {
        const r = c.results?.[m.key];
        if (!r) return "";
        const img = r.file
          ? `<a href="/captures/${esc(c.id)}/${esc(r.file)}" target="_blank"><img loading="lazy" src="/captures/${esc(c.id)}/${esc(r.file)}" alt="${esc(m.label)}"></a>`
          : `<div class="missing">${esc(r.error || "No image")}</div>`;
        const diff = r.diffFile
          ? ` · <a href="/captures/${esc(c.id)}/${esc(r.diffFile)}" target="_blank">diff</a>`
          : "";
        const ms = typeof r.ms === "number" ? `${r.ms} ms` : "";
        return `<figure><figcaption><strong>${esc(m.label)}</strong> ${badge(r.match)}<br><small>${esc(ms)}${diff}${r.error && r.file ? ` · ${esc(r.error)}` : ""}</small></figcaption>${img}</figure>`;
      }).join("");
      return `<article id="${esc(c.id)}">
        <header>
          <h2><a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.title || c.url)}</a></h2>
          <p>${esc(c.browser || "")} · ${esc(c.viewport?.width)}×${esc(c.viewport?.height)} · scroll ${esc(c.scroll?.y)}px · snapshot ${esc(Math.round((c.snapshotBytes || 0) / 1024))} KB in ${esc(c.snapshotMs)} ms · ${esc(c.source)} · <span class="status">${esc(c.status)}</span></p>
        </header>
        <div class="row">${cells}</div>
      </article>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Capture Spike</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--good:#15803d;--ok:#a16207;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--good:#4ade80;--ok:#facc15;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1600px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}a{color:inherit}
p.lede{color:var(--muted);margin:0 0 20px}
table{border-collapse:collapse;margin:0 0 28px;background:var(--card);border:1px solid var(--line)}
th,td{padding:8px 14px;border-bottom:1px solid var(--line);text-align:left;font-variant-numeric:tabular-nums}
article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 20px}
article h2{font-size:15px;margin:0}article header p{margin:2px 0 12px;color:var(--muted);font-size:12px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
figure{margin:0}figcaption{font-size:12px;margin-bottom:6px;min-height:36px}small{color:var(--muted)}
img{width:100%;border:1px solid var(--line);border-radius:6px;display:block}
.missing{border:1px dashed var(--line);border-radius:6px;padding:24px;color:var(--bad);font-size:12px}
.badge{font-size:11px;font-weight:600;padding:1px 6px;border-radius:99px;border:1px solid currentColor}
.good{color:var(--good)}.ok{color:var(--ok)}.bad{color:var(--bad)}
</style></head><body><main>
<h1>Capture spike</h1>
<p class="lede">Three screenshot approaches compared side by side. Match % is scored against the ground-truth screenshot, so it only appears on harness runs.</p>
${summaryRows ? `<table><thead><tr><th>Reviewer browser</th><th>Captures</th><th>A · Snapshot</th><th>B · Reload</th><th>C · DOM-to-image</th></tr></thead><tbody>${summaryRows}</tbody></table>` : ""}
${cards || "<p>No captures yet. Run the harness or click the widget on a page.</p>"}
</main></body></html>`;
}
