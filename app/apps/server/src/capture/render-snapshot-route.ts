// Heard: turns a DOM snapshot from the capture widget into a screenshot.
//
// The widget serializes the page (rrweb-snapshot) instead of asking for screen-share permission.
// This route authorizes it like the other embed routes (public key + allowed origin + rate limit)
// and forwards it to the renderer service, which rebuilds the DOM on the reviewer's browser engine
// and returns a PNG. The widget then shows that PNG in its normal review/annotate/submit flow.
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
    const authorization = await authorizeCaptureSubmitRequest({
      request: input.request,
      route,
    })
    if (authorization instanceof Response) {
      return authorization
    }
    keyId = authorization.keyId
    origin = authorization.origin

    // Forward the raw body; the renderer validates the payload shape and enforces its own limits.
    const body = await input.request.arrayBuffer()
    if (body.byteLength > MAX_SNAPSHOT_BODY_BYTES) {
      throw new ORPCError("PAYLOAD_TOO_LARGE", {
        message: "Snapshot is too large.",
      })
    }

    const rendererResponse = await fetch(
      new URL("/render", env.RENDERER_URL),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.RENDERER_SECRET
            ? { "x-renderer-secret": env.RENDERER_SECRET }
            : undefined),
        },
        body,
        signal: AbortSignal.timeout(RENDERER_TIMEOUT_MS),
      }
    )

    if (!rendererResponse.ok) {
      const detail = await rendererResponse.text().catch(() => "")
      return buildJsonResponse(
        {
          code: "RENDER_FAILED",
          message: "Could not render the page snapshot.",
          detail: detail.slice(0, 300),
        },
        {
          status: rendererResponse.status === 400 ? 400 : 502,
          headers: authorization.rateLimitHeaders,
        }
      )
    }

    return new Response(rendererResponse.body, {
      status: 200,
      headers: {
        ...authorization.rateLimitHeaders,
        "content-type": "image/png",
        "cache-control": "no-store",
        "x-render-engine": rendererResponse.headers.get("x-render-engine") ?? "",
        "x-render-ms": rendererResponse.headers.get("x-render-ms") ?? "",
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
