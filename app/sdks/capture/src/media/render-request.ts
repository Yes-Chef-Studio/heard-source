// Heard: sends a copied page to the API's render route and returns the picture.
import type { CaptureRuntimeConfig } from "../types"

const RENDER_PATH = "/api/embed/render-snapshot"
const RENDER_TIMEOUT_MS = 45_000
const BODY_ENCODING_HEADER = "x-heard-body-encoding"

export interface RenderedSnapshot {
  blob: Blob
  gzip: boolean
  sentBytes: number
  encodeMs: number
  requestMs: number
  // From the response headers, when the server exposes them.
  renderMs: string | null
  serverTiming: string | null
}

// Set once a server has turned a compressed body away, so the rest of the page session doesn't
// pay for a failed attempt each time.
let gzipRefused = false

export function resetRenderRequestState(): void {
  gzipRefused = false
}

export async function gzipText(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null
  try {
    const compressed = new Blob([text])
      .stream()
      .pipeThrough(new CompressionStream("gzip"))
    return await new Response(compressed).blob()
  } catch {
    return null
  }
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
}

// One signal that fires on the caller's abort or after the timeout, whichever comes first.
// (AbortSignal.any would do this, but it's missing from browsers only a couple of years old.)
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  signal?.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException("Snapshot render timed out.", "TimeoutError")
    )
  }, timeoutMs)
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    },
  }
}

function send(
  config: CaptureRuntimeConfig,
  body: Blob | string,
  gzip: boolean,
  signal: AbortSignal
): Promise<Response> {
  return fetch(`${config.host}${RENDER_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-crikket-public-key": config.key,
      ...(gzip ? { [BODY_ENCODING_HEADER]: "gzip" } : undefined),
    },
    body,
    credentials: "omit",
    mode: "cors",
    // The reviewer is waiting on this one.
    priority: "high",
    signal,
  })
}

// How a server that can't take a compressed body shows it: 400 or 415 if it checks; 500 or 502 if
// it (or the renderer behind it, mid-deploy) tries to read the gzip bytes as JSON; or its CORS
// preflight refuses the extra header, which the browser reports as a network error. Statuses that
// a plain body wouldn't change (not allowed, rate limited, too large, timed out) are left alone.
const MAYBE_GZIP_STATUSES = new Set([400, 415, 500, 502])

function gzipWasRefused(outcome: Response | Error): boolean {
  if (outcome instanceof Response) {
    return MAYBE_GZIP_STATUSES.has(outcome.status)
  }
  return !isAbort(outcome)
}

async function sendWithFallback(
  config: CaptureRuntimeConfig,
  json: string,
  compressed: Blob | null,
  signal: AbortSignal
): Promise<{ response: Response; gzip: boolean }> {
  if (compressed) {
    const outcome = await send(config, compressed, true, signal).catch(
      (error: unknown) =>
        error instanceof Error ? error : new Error(String(error))
    )
    if (!gzipWasRefused(outcome)) {
      if (outcome instanceof Response) return { response: outcome, gzip: true }
      throw outcome
    }
    // Retry once as plain JSON. Only hold it against gzip if the plain body then goes through:
    // otherwise the problem was the network or the snapshot itself.
    const response = await send(config, json, false, signal)
    if (response.ok) gzipRefused = true
    return { response, gzip: false }
  }
  return { response: await send(config, json, false, signal), gzip: false }
}

export async function postRenderRequest(
  config: CaptureRuntimeConfig,
  json: string,
  signal?: AbortSignal
): Promise<RenderedSnapshot> {
  const encodeStartedAt = performance.now()
  const compressed = gzipRefused ? null : await gzipText(json)
  const requestStartedAt = performance.now()
  const timeout = withTimeout(signal, RENDER_TIMEOUT_MS)
  try {
    const { response, gzip } = await sendWithFallback(
      config,
      json,
      compressed,
      timeout.signal
    )
    if (!response.ok) {
      throw new Error(`Snapshot render failed (${response.status}).`)
    }
    const blob = await response.blob()
    if (!blob.type.startsWith("image/") || blob.size === 0) {
      throw new Error("Snapshot render returned no image.")
    }
    return {
      blob,
      gzip,
      sentBytes: gzip && compressed ? compressed.size : json.length,
      encodeMs: requestStartedAt - encodeStartedAt,
      requestMs: performance.now() - requestStartedAt,
      renderMs: response.headers.get("x-render-ms") || null,
      serverTiming: response.headers.get("server-timing") || null,
    }
  } finally {
    timeout.done()
  }
}
