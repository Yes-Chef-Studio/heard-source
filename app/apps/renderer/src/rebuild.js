// Runs inside headless Chromium on the server. Rebuilds a client's DOM snapshot into a
// sandboxed iframe (scripts never execute) sized to the client's viewport, then restores scroll.
import {
  createCache,
  createMirror,
  rebuildIntoSandboxedIframe,
} from "rrweb-snapshot"

const forceLayout = (doc) => doc.documentElement.offsetHeight
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// How far past the bottom of the viewport an image still counts as "in view". Covers small layout
// shifts while other assets arrive.
const VIEW_MARGIN = 200
const POLL_MS = 25
// Gap before the second look that confirms nothing new started loading.
const CONFIRM_MS = 5
// Past the soft timeout, the wait goes on only while something finished loading this recently.
const PROGRESS_MS = 400
const DECODE_TIMEOUT_MS = 1000
const SRC = "data-heard-src"
const SRCSET = "data-heard-srcset"
const URL_IN_CSS = /url\((["']?)(.*?)\1\)/g
const IMAGE_PROPERTIES = [
  "backgroundImage",
  "maskImage",
  "borderImageSource",
  "listStyleImage",
  "content",
]

// Scripting is off in the sandbox, and browsers ignore loading="lazy" when scripting is off, so a
// rebuilt page would download every image on it at once. Park the image URLs before the rebuild;
// loadImagesInView() puts back only the ones the screenshot needs.
function deferImages(snap) {
  // rrweb writes every key of `attributes` onto the element, so the original must really go.
  const park = (attrs, from, to) => {
    attrs[to] = attrs[from]
    Reflect.deleteProperty(attrs, from)
  }
  const visit = (node, parentTag) => {
    const attrs = node.type === 2 && node.attributes
    const isImg = attrs && node.tagName === "img"
    const isPictureSource =
      attrs && node.tagName === "source" && parentTag === "picture"
    if (
      isImg &&
      typeof attrs.src === "string" &&
      !attrs.src.startsWith("data:")
    ) {
      park(attrs, "src", SRC)
    }
    if ((isImg || isPictureSource) && typeof attrs.srcset === "string") {
      park(attrs, "srcset", SRCSET)
    }
    for (const child of node.childNodes || []) visit(child, node.tagName)
  }
  visit(snap)
}

function restoreImage(img) {
  const picture =
    img.parentElement?.tagName === "PICTURE" ? img.parentElement : null
  for (const source of picture
    ? picture.querySelectorAll(`source[${SRCSET}]`)
    : []) {
    source.setAttribute("srcset", source.getAttribute(SRCSET))
    source.removeAttribute(SRCSET)
  }
  const srcset = img.getAttribute(SRCSET)
  const src = img.getAttribute(SRC)
  img.loading = "eager"
  if (srcset !== null) img.setAttribute("srcset", srcset)
  if (src !== null) img.setAttribute("src", src)
  img.removeAttribute(SRCSET)
  img.removeAttribute(SRC)
}

// Start loading parked images that are in the viewport or anywhere above it (an image above the
// viewport can still push the visible content down once its real size is known). Images further
// down can't affect the picture, and images that aren't rendered at all (display:none menus,
// closed tabs) never do. Everything is loaded when `all` is set.
function loadImagesInView(state, all) {
  const limit = state.viewport.height + VIEW_MARGIN
  for (const img of state.parked) {
    if (!all) {
      const rects = img.getClientRects()
      if (!rects.length || rects[0].top > limit) continue
    }
    state.parked.delete(img)
    restoreImage(img)
    state.watched.push(img)
  }
}

function inView(rect, viewport) {
  return (
    rect.bottom > -VIEW_MARGIN &&
    rect.top < viewport.height + VIEW_MARGIN &&
    rect.right > -VIEW_MARGIN &&
    rect.left < viewport.width + VIEW_MARGIN &&
    (rect.width > 0 || rect.height > 0)
  )
}

// CSS images (backgrounds, masks, ::before/::after content) have no load state to read. For each
// one in view, load the same URL through an Image in the same document: it shares the document's
// fetch, and its `complete` flag flips whether the download succeeds or fails.
function probeCssImages(state) {
  const { doc, win, viewport, probes } = state
  const add = (value) => {
    if (!value || value === "none" || !value.includes("url(")) return
    for (const match of value.matchAll(URL_IN_CSS)) {
      const url = match[2]
      // `url(#id)` points at an SVG mask/filter/gradient inside the page, not at a file.
      if (
        !url ||
        url.startsWith("data:") ||
        url.startsWith("#") ||
        probes.has(url)
      )
        continue
      const probe = new win.Image()
      probe.src = url
      probes.set(url, probe)
    }
  }
  for (const element of doc.body ? doc.body.querySelectorAll("*") : []) {
    if (!inView(element.getBoundingClientRect(), viewport)) continue
    for (const pseudo of [null, "::before", "::after"]) {
      const style = win.getComputedStyle(element, pseudo)
      if (pseudo && style.content === "none") continue
      for (const property of IMAGE_PROPERTIES) add(style[property])
    }
    const tag = element.tagName
    if (tag === "VIDEO" && element.poster) add(`url("${element.poster}")`)
    else if (tag === "image" && element.href?.baseVal)
      add(`url("${element.href.baseVal}")`)
  }
}

// Poll rather than listen: WebKit doesn't reliably fire load events for resources inside the
// sandboxed rebuild iframe, which made every Safari render sit out the full timeout.
function pendingAssets(state) {
  const waiting = []
  for (const link of state.doc.querySelectorAll('link[rel="stylesheet"]')) {
    if (!link.sheet) waiting.push(`css ${link.href}`)
  }
  for (const img of state.watched) {
    if (!img.complete) waiting.push(`img ${img.currentSrc || img.src}`)
  }
  for (const [url, probe] of state.probes) {
    if (!probe.complete) waiting.push(`css-img ${url}`)
  }
  // Check individual faces: Firefox can leave FontFaceSet.status at "loading" indefinitely inside
  // the sandboxed iframe even after every face has finished.
  if (
    state.doc.fonts &&
    [...state.doc.fonts].some((face) => face.status === "loading")
  )
    waiting.push("fonts")
  return waiting
}

// Waits for what the screenshot shows: stylesheets, fonts, and images in or above the viewport.
//
// Web fonts only start loading once layout needs a glyph from them, and an image that just got its
// size can move others into view, so each pass forces layout and looks again; the page counts as
// settled after two clean passes in a row. Timers, not animation frames: a frame would make the
// browser paint a page that isn't finished. One stuck asset can hold the screenshot for at most
// `timeoutMs`; while assets are still arriving steadily (a busy server, not a dead URL) the wait
// may run on to `hardTimeoutMs`.
async function waitForAssets(state, scroll, timeoutMs, hardTimeoutMs) {
  const started = performance.now()
  let clean = 0
  let waiting = []
  let fewest = Number.POSITIVE_INFINITY
  let lastProgress = started
  for (;;) {
    waiting = checkAssets(state, scroll, clean > 0)
    clean = waiting.length ? 0 : clean + 1
    if (clean >= 2) break
    const now = performance.now()
    if (waiting.length < fewest) lastProgress = now
    fewest = waiting.length || Number.POSITIVE_INFINITY
    const elapsed = now - started
    const stuck = elapsed > timeoutMs && now - lastProgress > PROGRESS_MS
    if (stuck || elapsed > hardTimeoutMs) break
    await sleep(clean ? CONFIRM_MS : POLL_MS)
  }
  return waiting
}

// One pass: lay the page out at the reviewer's scroll position, start loading what that brings
// into view, and report what is still loading. `settled` means the previous pass found nothing
// pending, which is the moment to look for anything new.
function checkAssets(state, scroll, settled) {
  const { doc, win } = state
  win.scrollTo(scroll.x, scroll.y)
  forceLayout(doc)
  // The page is shorter than the scroll position asks for: images further down are holding the
  // layout open, so they are needed after all.
  const clamped = win.scrollY < scroll.y - 1 || win.scrollX < scroll.x - 1
  if (settled && clamped) state.loadAll = true
  loadImagesInView(state, state.loadAll)
  if (settled || !state.probed) probeCssImages(state)
  state.probed = true
  return pendingAssets(state)
}

// Scripts are disabled in the sandbox, and per the HTML spec a <canvas> in a scriptless document
// renders its fallback content, never its bitmap. Paint the frame grabbed on the reviewer's side as
// the canvas's CSS background instead. Keeping the <canvas> element (rather than swapping in an
// <img>) matters: sites position canvases with tag selectors like `body > canvas {position:fixed}`.
//
// Without scripting the canvas is no longer a replaced element, so it loses its intrinsic size and
// collapses to 0x0 unless CSS sizes it. Restore the size from the width/height attributes, and the
// aspect ratio when CSS sets only the width.
function paintCanvases(snap, mirror) {
  const painted = []
  ;(function walk(n) {
    if (n.type === 2 && n.tagName === "canvas" && n.attributes?.rr_dataURL) {
      const canvas = mirror.getNode(n.id)
      if (canvas) {
        canvas.textContent = ""
        canvas.style.backgroundImage = `url("${n.attributes.rr_dataURL}")`
        canvas.style.backgroundSize = "100% 100%"
        canvas.style.backgroundRepeat = "no-repeat"
        painted.push(canvas)
      }
    }
    for (const child of n.childNodes || []) walk(child)
  })(snap)

  for (const canvas of painted) {
    const win = canvas.ownerDocument.defaultView
    const w = Number(canvas.getAttribute("width")) || 300
    const h = Number(canvas.getAttribute("height")) || 150
    if (win.getComputedStyle(canvas).display === "inline")
      canvas.style.display = "inline-block"
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) canvas.style.width = `${w}px`
    if (!rect.height) canvas.style.aspectRatio = `${w} / ${h}`
    if (!canvas.getBoundingClientRect().height) canvas.style.height = `${h}px`
  }
  return painted.length
}

// Show each video's grabbed frame as its poster, and stop it loading so the poster stays up.
// Keeping the <video> element preserves its sizing and object-fit.
function freezeVideos(doc) {
  let count = 0
  for (const video of doc.querySelectorAll("video[data-heard-frame]")) {
    video.poster = video.getAttribute("data-heard-frame")
    video.removeAttribute("data-heard-frame")
    video.removeAttribute("autoplay")
    video.removeAttribute("src")
    for (const source of video.querySelectorAll("source")) source.remove()
    video.preload = "none"
    count++
  }
  return count
}

// The request body reaches the page still gzip-compressed, as base64: a megabyte of JSON text is
// slow to push through the browser's control channel, the compressed bytes are a fifth of that.
async function readPayload(gzipBase64) {
  const compressed = await fetch(
    `data:application/octet-stream;base64,${gzipBase64}`
  )
  return new Response(
    compressed.body.pipeThrough(new DecompressionStream("gzip"))
  ).json()
}

// The snapshot records the DOM, not how far each CSS animation had run, so every animation starts
// again from zero in the rebuilt page and the screenshot would catch entrance animations halfway
// (faded, offset). The reviewer was looking at a page that had settled, so jump animations that
// end to their end state. Looping animations keep running, and scroll-driven ones follow the
// restored scroll position.
function finishAnimations(doc, win) {
  let finished = 0
  for (const animation of doc.getAnimations?.() ?? []) {
    try {
      if (!(animation.timeline instanceof win.DocumentTimeline)) continue
      const end = animation.effect?.getComputedTiming().endTime
      if (!Number.isFinite(Number(end))) continue
      animation.finish()
      finished++
    } catch {
      // Not finishable (zero playback rate, detached target): leave it as it is.
    }
  }
  return finished
}

// WebKit and Firefox decode large images off the main thread and can paint a frame without them.
// Chromium is launched with that turned off (--disable-checker-imaging); for the others, ask for
// the images in view to be decoded before the screenshot. Never waits long: a decode that fails
// or drags on is the same as before this existed.
function decodeImagesInView(state) {
  const decodes = []
  for (const img of state.watched) {
    const visible = img.complete && img.naturalWidth > 0 && img.decode
    if (visible && inView(img.getBoundingClientRect(), state.viewport)) {
      decodes.push(img.decode().catch(() => undefined))
    }
  }
  return Promise.race([Promise.all(decodes), sleep(DECODE_TIMEOUT_MS)])
}

window.HeardRender = {
  /**
   * `payload` is the widget's request body, either as the JSON text it arrived in (cheapest to hand
   * to the page) or already parsed. `viewport` and `scroll` are the server-validated values.
   */
  async rebuild(payload, viewport, scroll, options = {}) {
    const t0 = performance.now()
    const snap = (
      typeof payload === "string" ? await readPayload(payload) : payload
    ).snapshot
    const t00 = performance.now()
    const deferOffscreen = options.deferOffscreenImages !== false
    if (deferOffscreen) deferImages(snap)
    const root = document.getElementById("root")
    const mirror = createMirror()
    const { iframe } = rebuildIntoSandboxedIframe(snap, {
      root,
      mirror,
      cache: createCache(),
      hackCss: options.hackCss === true,
      iframeAttributes: {
        width: String(viewport.width),
        height: String(viewport.height),
        style: `position:fixed;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;border:0;`,
      },
    })
    // Keep the page unpainted while it loads. Layout still runs (the asset wait depends on it),
    // but the browser doesn't paint, decode and rasterize half-loaded states only to throw them
    // away; the one full paint happens for the screenshot.
    iframe.style.visibility = "hidden"
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    // Scripts are disabled in the sandbox, so <noscript> content (and rrweb's script placeholders)
    // would render. The reviewer had JS on, so hide it.
    const hide = doc.createElement("style")
    // Chromium also forces native video controls on when scripting is disabled.
    hide.textContent =
      "noscript{display:none!important}" +
      "video::-webkit-media-controls,video::-webkit-media-controls-enclosure{display:none!important}"
    ;(doc.head || doc.documentElement).appendChild(hide)
    const canvases = paintCanvases(snap, mirror)
    const videos = freezeVideos(doc)
    const t1 = performance.now()

    const state = {
      doc,
      win,
      viewport,
      parked: new Set(doc.querySelectorAll(`img[${SRC}],img[${SRCSET}]`)),
      // Images that were never parked (data: URLs, or parking turned off) are already loading.
      watched: [...doc.images].filter(
        (img) => !(img.hasAttribute(SRC) || img.hasAttribute(SRCSET))
      ),
      probes: new Map(),
    }
    // waitForAssets scrolls first so it loads what is in view at the reviewer's scroll position,
    // and re-applies the scroll on every pass in case late fonts/images shifted the layout.
    const stalled = await waitForAssets(
      state,
      scroll,
      options.assetTimeoutMs ?? 2500,
      options.assetHardTimeoutMs ?? 6000
    )
    const animations =
      options.finishAnimations === false ? 0 : finishAnimations(doc, win)
    win.scrollTo(scroll.x, scroll.y)
    iframe.style.visibility = ""
    if (options.decodeImages) await decodeImagesInView(state)
    return {
      animations,
      scrolledTo: { x: win.scrollX, y: win.scrollY },
      stalled,
      canvases,
      videos,
      images: {
        loaded: state.watched.length,
        skipped: state.parked.size,
        css: state.probes.size,
      },
      ms: {
        read: Math.round(t00 - t0),
        rebuild: Math.round(t1 - t00),
        assets: Math.round(performance.now() - t1),
      },
    }
  },
}
