// Snapshot renderer. Internal service: the API server forwards widget snapshots here and gets an
// image back. Rebuilds the DOM in a sandboxed, scriptless iframe and screenshots it on Chromium
// (or, with RENDERER_MATCH_ENGINE=1, on the reviewer's own engine: WebKit for Safari/iOS, Firefox
// for Firefox, falling back to Chromium).
//
// POST /render  { snapshot, viewport: {width,height,dpr}, scroll: {x,y}, userAgent }  -> image/jpeg
//               The body may be gzip-compressed, marked with `x-heard-body-encoding: gzip`.
// POST /warmup  launches the browser and fills the page pool
// GET  /health
import { timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { chromium, firefox, webkit } from "playwright"
import { readBody } from "./body.mjs"
import { assetCache, guardContext } from "./network-guard.mjs"

const PORT = Number(process.env.RENDERER_PORT || process.env.PORT || 3102)
const HOST = process.env.RENDERER_HOST || "127.0.0.1"
const SECRET = process.env.RENDERER_SECRET || ""
const MAX_BODY_BYTES = 40 * 1024 * 1024
const RENDER_TIMEOUT_MS = 15_000
// Renders on one vCPU take turns on the processor, so more at once only makes each one slower;
// two lets a second reviewer start while the first render is waiting on the network.
const MAX_CONCURRENT = Number(process.env.RENDERER_CONCURRENCY || 2)
const MAX_DIMENSION = 4000
// Heard: render on the reviewer's own engine (WebKit for Safari, Firefox for Firefox) only when
// RENDERER_MATCH_ENGINE=1. Off by default: on a 1-vCPU container WebKit/Firefox cold-start slowly
// and could time out (24 s worst case measured), while Chromium is already running. The report
// still records the reviewer's browser.
const MATCH_ENGINE = process.env.RENDERER_MATCH_ENGINE === "1"
// Pixel density of the screenshot. 1 by default: retina (2x) is 4x the pixels to paint and encode,
// roughly doubling render time on the container, for detail feedback screenshots don't need.
const MAX_DPR = Math.min(
  Math.max(Number(process.env.RENDERER_MAX_DPR) || 1, 1),
  2
)
// JPEG encodes 2-3x faster than PNG and is a third of the size on a typical marketing page.
const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }
const DEFAULT_FORMAT = FORMATS[process.env.RENDERER_IMAGE_FORMAT]
  ? process.env.RENDERER_IMAGE_FORMAT
  : "jpeg"
const IMAGE_QUALITY = Math.min(
  Math.max(Number(process.env.RENDERER_IMAGE_QUALITY) || 85, 1),
  100
)
// How long one screenshot may wait for images and fonts in view: `ASSET_WAIT_MS` when an asset is
// simply not arriving, up to `ASSET_HARD_WAIT_MS` while assets are still coming in.
const ASSET_WAIT_MS = Number(process.env.RENDERER_ASSET_WAIT_MS) || 2500
const ASSET_HARD_WAIT_MS = Math.max(
  Number(process.env.RENDERER_ASSET_HARD_WAIT_MS) || 6000,
  ASSET_WAIT_MS
)
// Chromium pages kept ready (context created, rebuild script loaded) so a render starts at once.
const POOL_SIZE = Math.max(Number(process.env.RENDERER_POOL_SIZE ?? 2), 0)

// Chromium normally draws a frame before large images are decoded and fills them in a frame later
// ("checker imaging"), so a screenshot of the first frame can miss them. Decode during raster
// instead: the first frame is complete. RENDERER_CHROMIUM_ARGS adds more switches (space-separated).
const CHROMIUM_ARGS = [
  "--disable-checker-imaging",
  ...(process.env.RENDERER_CHROMIUM_ARGS || "").split(" ").filter(Boolean),
]

if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("RENDERER_SECRET is required in production.")
}

const rebuildJs = readFileSync(
  new URL("../dist/rebuild.js", import.meta.url),
  "utf8"
)
// The rebuild script is part of the page, so a pooled page needs no second round trip to load it.
const RENDER_PAGE =
  "<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#fff}</style></head>" +
  `<body><div id="root"></div><script>${rebuildJs.replaceAll("</script", "<\\/script")}</script></body></html>`

// ---- engines ---------------------------------------------------------------------------------

const ENGINES = { chromium, webkit, firefox }
const IOS = /iPhone|iPad|iPod/
const FIREFOX = /Firefox\//
const SAFARI = /Safari\//
const NOT_SAFARI = /Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser/
const ignore = () => undefined
const launched = new Map()

function getBrowser(name) {
  let pending = launched.get(name)
  if (!pending) {
    pending = ENGINES[name].launch(
      name === "chromium" ? { args: CHROMIUM_ARGS } : {}
    )
    launched.set(name, pending)
    pending
      .then((browser) =>
        browser.on("disconnected", () => {
          launched.delete(name)
          if (name === "chromium") pool.length = 0
        })
      )
      .catch(() => launched.delete(name))
  }
  return pending
}

/** All iOS browsers are WebKit. Desktop Safari is WebKit. Firefox (not FxiOS) is Gecko. */
export function engineForUserAgent(ua = "") {
  if (IOS.test(ua)) return "webkit"
  if (FIREFOX.test(ua)) return "firefox"
  if (SAFARI.test(ua) && !NOT_SAFARI.test(ua)) return "webkit"
  return "chromium"
}

// ---- pages -----------------------------------------------------------------------------------

// Every render gets its own browser context (no cookies, storage or cache shared with any other
// render) and the context is closed afterwards. A slot is used for exactly one render.
async function createSlot(engine, shape) {
  const browser = await getBrowser(engine)
  const context = await browser.newContext({
    viewport: { width: shape.width, height: shape.height },
    deviceScaleFactor: shape.dpr,
    javaScriptEnabled: true, // our rebuild script needs it; the client's page scripts never run
  })
  try {
    await guardContext(context)
    const page = await context.newPage()
    await page.setContent(RENDER_PAGE)
    // Chromium: talk to the page directly for the screenshot, skipping Playwright's preparation
    // round trips.
    const cdp = engine === "chromium" ? await context.newCDPSession(page) : null
    return { engine, context, page, cdp, ...shape }
  } catch (error) {
    await context.close().catch(ignore)
    throw error
  }
}

// Spare Chromium slots, built ahead of time in the shape of the latest request (reviewers tend to
// send several screenshots from the same window).
const pool = []
let creating = 0
let poolShape = { width: 1440, height: 900, dpr: 1 }

function fillPool() {
  const jobs = []
  while (pool.length + creating < POOL_SIZE) {
    creating++
    jobs.push(
      createSlot("chromium", poolShape)
        .then((slot) => pool.push(slot))
        .catch((error) =>
          console.error(
            "page pool: could not prepare a page",
            String(error?.message || error)
          )
        )
        .finally(() => creating--)
    )
  }
  return Promise.all(jobs)
}

async function takeSlot(engine, shape) {
  if (engine !== "chromium") return createSlot(engine, shape)
  poolShape = shape
  while (pool.length > 0) {
    // Pixel density is fixed when a context is created; the viewport can still be resized.
    let index = pool.findIndex(
      (s) =>
        s.dpr === shape.dpr &&
        s.width === shape.width &&
        s.height === shape.height
    )
    if (index < 0) index = pool.findIndex((s) => s.dpr === shape.dpr)
    if (index < 0) break
    const [slot] = pool.splice(index, 1)
    try {
      if (slot.page.isClosed()) throw new Error("page closed")
      if (slot.width !== shape.width || slot.height !== shape.height) {
        await slot.page.setViewportSize({
          width: shape.width,
          height: shape.height,
        })
      }
      return { ...slot, ...shape, pooled: true }
    } catch {
      slot.context.close().catch(ignore)
    }
  }
  return createSlot(engine, shape)
}

// ---- rendering -------------------------------------------------------------------------------

async function screenshot(slot, format) {
  const quality = format === "png" ? undefined : IMAGE_QUALITY
  if (slot.cdp) {
    const { data } = await slot.cdp.send("Page.captureScreenshot", {
      format,
      quality,
      // Only changes PNG (a faster, larger encode); PNG is the on-request format, keep it small.
      optimizeForSpeed: format !== "png",
    })
    return Buffer.from(data, "base64")
  }
  // WebKit and Firefox can't encode WebP.
  const type = format === "webp" ? "jpeg" : format
  return slot.page.screenshot({
    type,
    quality: type === "png" ? undefined : quality,
    clip: { x: 0, y: 0, width: slot.width, height: slot.height },
  })
}

async function renderOn(engine, { data, viewport, scroll, format }) {
  const t0 = performance.now()
  const shape = {
    width: viewport.width,
    height: viewport.height,
    dpr: Math.min(Math.max(viewport.dpr || 1, 1), MAX_DPR),
  }
  let slot
  let timer
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${RENDER_TIMEOUT_MS} ms`)),
        RENDER_TIMEOUT_MS
      )
    })
    return await Promise.race([
      deadline,
      (async () => {
        slot = await takeSlot(engine, shape)
        const t1 = performance.now()
        const info = await slot.page.evaluate(
          ([payload, view, at, options]) =>
            window.HeardRender.rebuild(payload, view, at, options),
          [
            data,
            viewport,
            scroll,
            {
              assetTimeoutMs: ASSET_WAIT_MS,
              assetHardTimeoutMs: ASSET_HARD_WAIT_MS,
              decodeImages: engine !== "chromium",
            },
          ]
        )
        const t2 = performance.now()
        const image = await screenshot(slot, format)
        const t3 = performance.now()
        const usedFormat = slot.cdp || format !== "webp" ? format : "jpeg"
        return {
          image,
          info,
          contentType: FORMATS[usedFormat],
          timing: {
            setup: t1 - t0,
            transfer: t2 - t1 - info.ms.read - info.ms.rebuild - info.ms.assets,
            read: info.ms.read,
            rebuild: info.ms.rebuild,
            assets: info.ms.assets,
            shot: t3 - t2,
          },
          pooled: Boolean(slot.pooled),
        }
      })(),
    ])
  } finally {
    clearTimeout(timer)
    // Closing the context aborts anything still hanging inside it. Refill the pool afterwards, not
    // during the render, so preparing the next page never competes with this one for the CPU.
    const closing = slot
      ? slot.context.close().catch(ignore)
      : Promise.resolve()
    closing
      .then(() => (launched.has("chromium") ? fillPool() : null))
      .catch(ignore)
  }
}

async function render(payload) {
  const t0 = Date.now()
  const primary = MATCH_ENGINE
    ? engineForUserAgent(payload.userAgent)
    : "chromium"
  try {
    const result = await renderOn(primary, payload)
    return { ...result, engine: primary, ms: Date.now() - t0 }
  } catch (error) {
    if (primary === "chromium") throw error
    const result = await renderOn("chromium", payload)
    return {
      ...result,
      engine: "chromium",
      fallbackReason: `${primary}: ${String(error?.message || error).split("\n")[0]}`,
      ms: Date.now() - t0,
    }
  }
}

// Simple semaphore so a burst of captures can't spawn unbounded browser contexts.
let active = 0
const queue = []
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT)
    await new Promise((resolve) => queue.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

// ---- http ------------------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body)
    ? body
    : Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": payload.length,
    ...headers,
  })
  res.end(payload)
}

function authorized(req) {
  if (!SECRET) return true
  const given = Buffer.from(String(req.headers["x-renderer-secret"] || ""))
  const expected = Buffer.from(SECRET)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error("Invalid render payload"), { status: 400 })
  }
}

function validate(body) {
  const { snapshot, viewport, scroll } = body || {}
  const ok =
    snapshot &&
    typeof snapshot === "object" &&
    snapshot.type === 0 &&
    viewport &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0 &&
    viewport.width <= MAX_DIMENSION &&
    viewport.height <= MAX_DIMENSION
  if (!ok)
    throw Object.assign(new Error("Invalid render payload"), { status: 400 })
  return {
    viewport: {
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      dpr: Number(viewport.dpr) || 1,
    },
    scroll: {
      x: Math.round(Number(scroll?.x) || 0),
      y: Math.round(Number(scroll?.y) || 0),
    },
    userAgent:
      typeof body.userAgent === "string" ? body.userAgent.slice(0, 512) : "",
    format: FORMATS[body.format] ? body.format : DEFAULT_FORMAT,
  }
}

function serverTiming(entries) {
  return Object.entries(entries)
    .map(([name, ms]) => `${name};dur=${Math.max(ms, 0).toFixed(1)}`)
    .join(", ")
}

function handleHealth(res) {
  return send(res, 200, {
    ok: true,
    active,
    queued: queue.length,
    pool: pool.length,
    cache: assetCache
      ? {
          entries: assetCache.size,
          bytes: assetCache.bytes,
          ...assetCache.stats,
        }
      : null,
  })
}

// Heard: the widget asks for this when someone shows interest (page load, hovering the tab), so
// the container is awake, the browser launched and a page ready before they take a screenshot.
async function handleWarmup(req, res) {
  const body = await readBody(req, MAX_BODY_BYTES)
    .then(({ text }) => JSON.parse(text))
    .catch(() => ({}))
  const engine = MATCH_ENGINE
    ? engineForUserAgent(
        typeof body?.userAgent === "string" ? body.userAgent : ""
      )
    : "chromium"
  await getBrowser(engine).catch(ignore)
  await fillPool()
  return send(res, 200, { ok: true, engine, pool: pool.length })
}

function logRender(payload, result) {
  const images = result.info?.images
  const stalled = result.info?.stalled?.length
  console.log(
    [
      `render ${payload.viewport.width}x${payload.viewport.height} on ${result.engine} in ${result.ms} ms`,
      result.fallbackReason ? `(fallback: ${result.fallbackReason})` : "",
      serverTiming(result.timing).replaceAll(";dur=", "=").replaceAll(",", ""),
      `images=${images?.loaded}+${images?.css}css skipped=${images?.skipped}`,
      `${Math.round(result.image.length / 1024)}kB`,
      result.pooled ? "" : "(no pooled page)",
      stalled ? `stalled=${stalled}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  )
}

async function handleRender(req, res) {
  const t0 = performance.now()
  const { text, gzipped } = await readBody(req, MAX_BODY_BYTES)
  // The page gets the compressed bytes and parses the snapshot itself; only the small fields
  // are validated and passed from here.
  const payload = {
    ...validate(parse(text)),
    data: gzipped.toString("base64"),
  }
  const t1 = performance.now()
  const result = await withSlot(() => {
    payload.queued = performance.now() - t1
    return render(payload)
  })
  logRender(payload, result)
  return send(res, 200, result.image, {
    "content-type": result.contentType,
    "x-render-engine": result.engine,
    "x-render-ms": String(result.ms),
    "server-timing": serverTiming({
      body: t1 - t0,
      queue: payload.queued,
      ...result.timing,
    }),
    ...(result.fallbackReason
      ? { "x-render-fallback": result.fallbackReason.slice(0, 200) }
      : {}),
  })
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return handleHealth(res)
    const known = req.url === "/warmup" || req.url === "/render"
    if (!(req.method === "POST" && known)) {
      return send(res, 404, { error: "Not found" })
    }
    if (!authorized(req)) return send(res, 401, { error: "Unauthorized" })
    return await (req.url === "/warmup"
      ? handleWarmup(req, res)
      : handleRender(req, res))
  } catch (error) {
    const status = error?.status || 500
    if (status === 500) console.error("render failed", error)
    return send(res, status, {
      error: String(error?.message || error).split("\n")[0],
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Renderer listening on http://${HOST}:${PORT}`)
  // Start Chromium and prepare pages now rather than on the first screenshot.
  getBrowser("chromium")
    .then(fillPool)
    .catch((error) => console.error("chromium prelaunch failed", error))
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close()
    await Promise.all(
      [...launched.values()].map((p) => p.then((b) => b.close()).catch(ignore))
    )
    process.exit(0)
  })
}
