// Cross-OS replay: render snapshots exported on one OS (harness.mjs --export) with this machine's
// engines, and score them against the original ground truth. Answers "do Mac Safari captures look
// right when rendered by Linux WebKit in production?"
//
// Usage: node crossos.mjs <export-dir> [--out results.json] [--diffs <dir>]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";
import { renderSnapshotWithFallback, scoreAgainst } from "./lib/render.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const out = flag("out");
const diffs = flag("diffs");
const dir = args[0];
if (!dir) {
  console.error("Usage: node crossos.mjs <export-dir> [--out results.json] [--diffs <dir>]");
  process.exit(1);
}

const engines = { chromium, webkit, firefox };
const launched = {};
const engine = async (name) => (launched[name] ??= await engines[name].launch());
const diffBrowser = await chromium.launch();
const diffPage = await (await diffBrowser.newContext()).newPage();
const rows = [];

for (const id of readdirSync(dir).sort()) {
  let c;
  try {
    c = JSON.parse(readFileSync(`${dir}/${id}/case.json`, "utf8"));
  } catch {
    continue;
  }
  const truth = readFileSync(`${dir}/${id}/truth.png`);
  const result = await renderSnapshotWithFallback(await engine(c.browser), await engine("chromium"), c.payload);
  const score = await scoreAgainst(diffPage, truth, result.png);
  if (diffs && score.diffPng) {
    mkdirSync(diffs, { recursive: true });
    writeFileSync(`${diffs}/${id}.diff.png`, score.diffPng);
    writeFileSync(`${diffs}/${id}.render.png`, result.png);
    writeFileSync(`${diffs}/${id}.truth.png`, truth);
  }
  const row = {
    id,
    label: c.label,
    browser: c.browser,
    sourcePlatform: c.platform,
    sourceMatch: c.sourceMatch,
    match: score.match,
    engine: result.engine,
    ms: result.ms,
    error: result.error,
  };
  rows.push(row);
  const delta = typeof row.match === "number" && typeof row.sourceMatch === "number" ? (row.match - row.sourceMatch).toFixed(1) : "?";
  console.log(`${id}  ${c.label}  ${c.platform}=${row.sourceMatch}%  ${process.platform}=${row.match ?? "ERR"}%  (${delta})  [${row.engine}, ${row.ms} ms]${row.error ? `  ${row.error}` : ""}`);
}

for (const b of Object.values(launched)) await b.close();
await diffBrowser.close();

const avg = (list, key) => {
  const v = list.map((r) => r[key]).filter((x) => typeof x === "number");
  return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)) : null;
};
const summary = {};
for (const b of ["chromium", "webkit", "firefox"]) {
  const list = rows.filter((r) => r.browser === b);
  if (list.length) {
    summary[b] = {
      views: list.length,
      source: avg(list, "sourceMatch"),
      here: avg(list, "match"),
      lowest: Math.min(...list.map((r) => r.match ?? 0)),
    };
  }
}
console.log(`\nReplayed ${rows.length} views on ${process.platform}.`);
for (const [b, s] of Object.entries(summary)) {
  console.log(`  ${b.padEnd(8)}  ${s.views} views  source avg ${s.source}%  here avg ${s.here}%  lowest ${s.lowest}%`);
}
if (out) writeFileSync(out, JSON.stringify({ platform: process.platform, summary, rows }, null, 2));
