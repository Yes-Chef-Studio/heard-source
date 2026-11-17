// Heard: screenshot via DOM snapshot + server render, replacing getDisplayMedia as the default.
//
// Why: screen-share capture needs a permission prompt, behaves differently per browser, and is the
// main source of reviewer complaints. In-browser DOM-to-image (html-to-image etc.) misses canvases,
// video frames, and many CSS features. Serializing the DOM and rendering it on the reviewer's own
// engine server-side matched real screenshots at 97-100% across our test sites.
import { snapshot } from "rrweb-snapshot"
import type { CaptureRuntimeConfig } from "../types"

const WIDGET_SELECTOR = "[data-heard-widget]"
const RENDER_PATH = "/api/embed/render-snapshot"
const RENDER_TIMEOUT_MS = 45_000
const MAX_VIDEO_FRAME_WIDTH = 1280

interface SerializedNode {
  type: number
  tagName?: string
  attributes?: Record<string, string | number | boolean>
  childNodes?: SerializedNode[]
}

/**
 * WebGL canvases clear their drawing buffer after each composited frame, so a plain toDataURL()
 * returns blank pixels. Reading inside requestAnimationFrame runs right after the site's own render
 * callback in the same frame, while the pixels are still there. Videos get their current frame
 * drawn to a canvas. Cross-origin content without CORS is tainted and skipped.
 */
function grabPixels(): Promise<Map<Element, string>> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const images = new Map<Element, string>()
      for (const canvas of document.querySelectorAll("canvas")) {
        if (!(canvas.width && canvas.height)) continue
        if (canvas.closest(WIDGET_SELECTOR)) continue
        try {
          images.set(canvas, canvas.toDataURL("image/webp", 0.85))
        } catch {
          // Tainted canvas.
        }
      }
      for (const video of document.querySelectorAll("video")) {
        if (video.readyState < 2 || !video.videoWidth) continue
        try {
          const scale = Math.min(1, MAX_VIDEO_FRAME_WIDTH / video.videoWidth)
          const frame = document.createElement("canvas")
          frame.width = Math.round(video.videoWidth * scale)
          frame.height = Math.round(video.videoHeight * scale)
          frame
            .getContext("2d")
            ?.drawImage(video, 0, 0, frame.width, frame.height)
          images.set(video, frame.toDataURL("image/webp", 0.8))
        } catch {
          // Tainted video: the renderer shows its poster instead.
        }
      }
      resolve(images)
    })
  })
}

function walk(node: SerializedNode, visit: (node: SerializedNode) => void) {
  visit(node)
  for (const child of node.childNodes ?? []) walk(child, visit)
}

async function takeSnapshot(): Promise<SerializedNode> {
  const pixels = await grabPixels()
  const serialized = snapshot(document, {
    inlineStylesheet: true,
    inlineImages: false,
    recordCanvas: false,
    blockSelector: WIDGET_SELECTOR,
  }) as SerializedNode | null
  if (!serialized) throw new Error("Could not serialize the page.")

  // Attach grabbed pixels to serialized nodes. Both walks are in document order.
  const live = {
    canvas: [...document.querySelectorAll("canvas")],
    video: [...document.querySelectorAll("video")],
  }
  const seen = { canvas: 0, video: 0 }
  walk(serialized, (node) => {
    if (
      node.type !== 2 ||
      !(node.tagName === "canvas" || node.tagName === "video")
    )
      return
    const tag = node.tagName
    const element = live[tag][seen[tag]++]
    const dataUrl = element ? pixels.get(element) : undefined
    if (!(dataUrl && node.attributes)) return
    if (tag === "canvas") node.attributes.rr_dataURL = dataUrl
    else node.attributes["data-heard-frame"] = dataUrl
  })
  return serialized
}

export async function captureSnapshotScreenshot(
  config: CaptureRuntimeConfig
): Promise<Blob> {
  const serialized = await takeSnapshot()
  const response = await fetch(`${config.host}${RENDER_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-crikket-public-key": config.key,
    },
    body: JSON.stringify({
      snapshot: serialized,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      userAgent: navigator.userAgent,
    }),
    credentials: "omit",
    mode: "cors",
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Snapshot render failed (${response.status}).`)
  }
  const blob = await response.blob()
  if (!blob.type.startsWith("image/") || blob.size === 0) {
    throw new Error("Snapshot render returned no image.")
  }
  return blob
}
