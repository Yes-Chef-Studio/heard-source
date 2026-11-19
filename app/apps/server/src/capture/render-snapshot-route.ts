// Heard: turns a DOM snapshot from the capture widget into a screenshot.
//
// The widget serializes the page (rrweb-snapshot) instead of asking for screen-share permission.
// This route authorizes it like the other embed routes (public key + allowed origin + rate limit)
// and forwards it to the renderer service, which rebuilds the DOM in a headless browser and returns
// an image (JPEG by default). The widget then shows that image in its normal review/annotate/submit
// flow.
//
// The widget may gzip the JSON body and say so with `x-heard-body-encoding: gzip` (a custom header
// rather than Content-Encoding, which proxies in front of the API may act on). The compressed bytes
// are forwarded untouched and the renderer decompresses them, so this server only relays.
//
// The response carries a `server-timing` header: `auth` (key, origin and rate-limit checks), `upload`
// (reading the request body), `renderer` (the whole round trip to the renderer) and the renderer's
// own breakdown prefixed with `render-`.
import { env } from "@crikket/env/server"
import { ORPCError } from "@orpc/server"
import { assertCaptureRequestBodyLength } from "./security"
import {
  authorizeCaptureSubmitRequest,
  buildJsonResponse,
  toCaptureErrorResponse,
} from "./shared"

const MAX_SNAPSHOT_BODY_BYTES = 40 * 1024 * 1024
const RENDERER_TIMEOUT_MS = 40_000
const BODY_ENCODING_HEADER = "x-heard-body-encoding"
const IMAGE_CONTENT_TYPE = /^image\/(jpeg|png|webp)$/
const SERVER_TIMING_SEPARATOR = /\s*,\s*/

function readBodyEncoding(request: Request): "gzip" | null {
  const value = request.headers.get(BODY_ENCODING_HEADER)?.trim().toLowerCase()
  if (!value || value === "identity") {
    return null
  }
  if (value === "gzip") {
    return "gzip"
  }
  throw new ORPCError("UNSUPPORTED_MEDIA_TYPE", {
    data: { reasonCode: "unsupported_body_encoding" },
    message: "Unsupported snapshot body encoding.",
  })
}

function formatTiming(name: string, durationMs: number): string {
  return `${name};dur=${Math.max(durationMs, 0).toFixed(1)}`
}

// The renderer reports where its time went; keep those entries, namespaced.
function prefixRendererTimings(header: string | null): string[] {
  if (!header) {
    return []
  }
  return header
    .split(SERVER_TIMING_SEPARATOR)
    .filter((entry) => entry.length > 0)
    .slice(0, 12)
    .map((entry) => `render-${entry}`)
}

export async function handleRenderSnapshot(input: {
  request: Request
}): Promise<Response> {
  const route = "/api/embed/render-snapshot"
  let keyId: string | null = null
  let origin: string | null = null

  try {
    if (!env.RENDERER_URL) {
      throw new ORPCError("NOT_IMPLEMENTED", {
        data: { reasonCode: "renderer_disabled" },
        message: "Snapshot rendering is not configured.",
      })
    }

    assertCaptureRequestBodyLength(input.request, MAX_SNAPSHOT_BODY_BYTES)
    const bodyEncoding = readBodyEncoding(input.request)
    const startedAt = performance.now()
    const authorization = await authorizeCaptureSubmitRequest({
      request: input.request,
      route,
    })
    if (authorization instanceof Response) {
      return authorization
    }
    keyId = authorization.keyId
    origin = authorization.origin
    const authorizedAt = performance.now()

    // Forward the raw body; the renderer validates the payload shape and enforces its own limits
    // (including the decompressed size of a gzip body).
    const body = await input.request.arrayBuffer()
    if (body.byteLength > MAX_SNAPSHOT_BODY_BYTES) {
      throw new ORPCError("PAYLOAD_TOO_LARGE", {
        message: "Snapshot is too large.",
      })
    }
    const uploadedAt = performance.now()

    const rendererResponse = await fetch(new URL("/render", env.RENDERER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bodyEncoding
          ? { [BODY_ENCODING_HEADER]: bodyEncoding }
          : undefined),
        ...(env.RENDERER_SECRET
          ? { "x-renderer-secret": env.RENDERER_SECRET }
          : undefined),
      },
      body,
      signal: AbortSignal.timeout(RENDERER_TIMEOUT_MS),
    })
    const renderedAt = performance.now()
    const serverTiming = [
      formatTiming("auth", authorizedAt - startedAt),
      formatTiming("upload", uploadedAt - authorizedAt),
      formatTiming("renderer", renderedAt - uploadedAt),
      ...prefixRendererTimings(rendererResponse.headers.get("server-timing")),
    ].join(", ")

    if (!rendererResponse.ok) {
      const detail = await rendererResponse.text().catch(() => "")
      const passthroughStatus = [400, 413, 415].includes(
        rendererResponse.status
      )
      return buildJsonResponse(
        {
          code: "RENDER_FAILED",
          message: "Could not render the page snapshot.",
          detail: detail.slice(0, 300),
        },
        {
          status: passthroughStatus ? rendererResponse.status : 502,
          headers: {
            ...authorization.rateLimitHeaders,
            "server-timing": serverTiming,
          },
        }
      )
    }

    const contentType = rendererResponse.headers.get("content-type") ?? ""
    const contentLength = rendererResponse.headers.get("content-length")
    return new Response(rendererResponse.body, {
      status: 200,
      headers: {
        ...authorization.rateLimitHeaders,
        "content-type": IMAGE_CONTENT_TYPE.test(contentType)
          ? contentType
          : "image/jpeg",
        ...(contentLength ? { "content-length": contentLength } : undefined),
        "cache-control": "no-store",
        "x-render-engine":
          rendererResponse.headers.get("x-render-engine") ?? "",
        "x-render-ms": rendererResponse.headers.get("x-render-ms") ?? "",
        "server-timing": serverTiming,
      },
    })
  } catch (error) {
    return toCaptureErrorResponse(error, {
      keyId,
      method: input.request.method,
      origin,
      route,
    })
  }
}
