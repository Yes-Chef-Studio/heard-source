// Heard: screenshot via DOM snapshot + server render, replacing getDisplayMedia as the default.
//
// Why: screen-share capture needs a permission prompt, behaves differently per browser, and is the
// main source of reviewer complaints. In-browser DOM-to-image (html-to-image etc.) misses canvases,
// video frames, and many CSS features. Serializing the DOM and rendering it on the reviewer's own
// engine server-side matched real screenshots at 97-100% across our test sites.
import { snapshot } from "rrweb-snapshot"
import type { CaptureRuntimeConfig } from "../types"
import { postRenderRequest } from "./render-request"

const WIDGET_SELECTOR = "[data-heard-widget]"
const MAX_VIDEO_FRAME_WIDTH = 1280
// Stands in for canvases that are nowhere near the visible part of the page: the renderer still
// treats the canvas as painted (and keeps its size), but no pixels are encoded or uploaded.
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

interface SerializedNode {
  type: number
  tagName?: string
  attributes?: Record<string, string | number | boolean>
  childNodes?: SerializedNode[]
}

type PixelSource = string | Promise<string | null>

// What the page looked like at the moment it was copied. Used to tell whether a copy made ahead
// of time (see runtime/speculative-capture.ts) still matches the page.
export interface CopiedPage {
  href: string
  scrollX: number
  scrollY: number
  viewportWidth: number
  viewportHeight: number
}

export interface SnapshotCaptureOptions {
  signal?: AbortSignal
  // Let the browser paint once before copying the page. Copying blocks the page for a moment, so
  // when the widget has just changed what it shows, that change gets on screen first.
  afterPaint?: boolean
  // Called once the page has been copied (a fraction of a second), before the server render.
  onPageCopied?: (page: CopiedPage) => void
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function blobToDataUrl(blob: Blob | null): Promise<string | null> {
  if (!blob) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

// toBlob copies the canvas's pixels right away and encodes them off the main thread, so the WebP
// encode (about ten times slower than JPEG or PNG) overlaps with copying the DOM instead of
// holding it up.
function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<string | null> {
  return new Promise<Blob | null>((resolve) => {
    // A tainted canvas (cross-origin image or video without CORS) throws here, inside the
    // promise, so the callers' try/catch can't see it. Treat it as "no pixels" so one video
    // thumbnail can't fail the whole screenshot; the renderer falls back to the poster.
    try {
      canvas.toBlob(resolve, "image/webp", quality)
    } catch {
      resolve(null)
    }
  }).then(blobToDataUrl)
}

// The screenshot shows the visible part of the page only, so anything further than a screen away
// from it can't be in the picture.
function isNearViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  if (!(rect.width && rect.height)) return false
  const marginX = window.innerWidth
  const marginY = window.innerHeight
  return (
    rect.bottom > -marginY &&
    rect.top < window.innerHeight + marginY &&
    rect.right > -marginX &&
    rect.left < window.innerWidth + marginX
  )
}

function grabCanvas(canvas: HTMLCanvasElement): PixelSource | null {
  if (!(canvas.width && canvas.height)) return null
  if (canvas.closest(WIDGET_SELECTOR)) return null
  if (!isNearViewport(canvas)) return BLANK_PIXEL
  try {
    return encodeCanvas(canvas, 0.85)
  } catch {
    // Tainted canvas.
    return null
  }
}

function grabVideoFrame(video: HTMLVideoElement): PixelSource | null {
  if (video.readyState < 2 || !video.videoWidth) return null
  try {
    const scale = Math.min(1, MAX_VIDEO_FRAME_WIDTH / video.videoWidth)
    const frame = document.createElement("canvas")
    frame.width = Math.round(video.videoWidth * scale)
    frame.height = Math.round(video.videoHeight * scale)
    frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height)
    return encodeCanvas(frame, 0.8)
  } catch {
    // Tainted video: the renderer shows its poster instead.
    return null
  }
}

/**
 * WebGL canvases clear their drawing buffer after each composited frame, so reading them at any
 * other time returns blank pixels. Reading inside requestAnimationFrame runs right after the site's
 * own render callback in the same frame, while the pixels are still there. Videos get their current
 * frame drawn to a canvas. Cross-origin content without CORS is tainted and skipped.
 *
 * Must be called from inside a requestAnimationFrame callback.
 */
function grabPixels(): Map<Element, PixelSource> {
  const images = new Map<Element, PixelSource>()
  for (const canvas of document.querySelectorAll("canvas")) {
    const pixels = grabCanvas(canvas)
    if (pixels) images.set(canvas, pixels)
  }
  for (const video of document.querySelectorAll("video")) {
    const pixels = grabVideoFrame(video)
    if (pixels) images.set(video, pixels)
  }
  return images
}

function walk(node: SerializedNode, visit: (node: SerializedNode) => void) {
  visit(node)
  for (const child of node.childNodes ?? []) walk(child, visit)
}

// Attach grabbed pixels to serialized nodes. Both walks are in document order.
function attachPixels(
  serialized: SerializedNode,
  pixels: Map<Element, PixelSource>
): Promise<unknown> {
  const live = {
    canvas: [...document.querySelectorAll("canvas")],
    video: [...document.querySelectorAll("video")],
  }
  const seen = { canvas: 0, video: 0 }
  const pending: Promise<void>[] = []
  walk(serialized, (node) => {
    if (
      node.type !== 2 ||
      !(node.tagName === "canvas" || node.tagName === "video")
    )
      return
    const tag = node.tagName
    const element = live[tag][seen[tag]++]
    const source = element ? pixels.get(element) : undefined
    const attributes = node.attributes
    if (!(source && attributes)) return
    const name = tag === "canvas" ? "rr_dataURL" : "data-heard-frame"
    pending.push(
      Promise.resolve(source).then((dataUrl) => {
        if (dataUrl) attributes[name] = dataUrl
      })
    )
  })
  return Promise.all(pending)
}

function describePage(): CopiedPage {
  return {
    href: location.href,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
}

async function takeSnapshot(
  options: SnapshotCaptureOptions
): Promise<{ body: string; copyMs: number }> {
  if (options.afterPaint) await nextFrame()
  await nextFrame()
  options.signal?.throwIfAborted()

  // Still inside the animation frame here (promise continuations run before it ends).
  const startedAt = performance.now()
  const page = describePage()
  const pixels = grabPixels()
  const serialized = snapshot(document, {
    inlineStylesheet: true,
    inlineImages: false,
    recordCanvas: false,
    blockSelector: WIDGET_SELECTOR,
  }) as SerializedNode | null
  if (!serialized) throw new Error("Could not serialize the page.")
  const pixelsAttached = attachPixels(serialized, pixels)
  const copyMs = performance.now() - startedAt
  options.onPageCopied?.(page)

  await pixelsAttached
  const body = JSON.stringify({
    snapshot: serialized,
    viewport: {
      width: page.viewportWidth,
      height: page.viewportHeight,
      dpr: window.devicePixelRatio || 1,
    },
    scroll: { x: page.scrollX, y: page.scrollY },
    userAgent: navigator.userAgent,
  })
  return { body, copyMs }
}

export async function captureSnapshotScreenshot(
  config: CaptureRuntimeConfig,
  options: SnapshotCaptureOptions = {}
): Promise<Blob> {
  const startedAt = performance.now()
  const { body, copyMs } = await takeSnapshot(options)
  const snapshotMs = performance.now() - startedAt
  const rendered = await postRenderRequest(config, body, options.signal)

  // Timings for whoever is tuning this; nothing the reviewer needs to see.
  console.debug(
    `[heard] screenshot ${Math.round(performance.now() - startedAt)} ms: ` +
      `page copy ${Math.round(copyMs)} ms (ready after ${Math.round(snapshotMs)} ms), ` +
      `upload ${formatKb(rendered.sentBytes)}${rendered.gzip ? ` gzip (from ${formatKb(body.length)}, ${Math.round(rendered.encodeMs)} ms)` : ""}, ` +
      `request ${Math.round(rendered.requestMs)} ms` +
      `${rendered.renderMs ? `, render ${rendered.renderMs} ms` : ""}` +
      `${rendered.serverTiming ? `, server-timing ${rendered.serverTiming}` : ""}, ` +
      `${rendered.blob.type} ${formatKb(rendered.blob.size)}`
  )
  return rendered.blob
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} kB`
}
