import {
  isCaptureOriginAllowed,
  resolveCapturePublicKey,
} from "@crikket/bug-reports/lib/capture-public-key"
import { buildJsonResponse } from "./shared"
import { getCaptureRequestOrigin } from "./security"

// Heard: the widget asks this before showing itself. The same script tag is usually published to
// both staging and production (Webflow site-wide custom code, a shared theme, etc.), so the
// widget must stay invisible on any site that isn't in the key's allowed list. Submissions are
// still checked server-side on every request; this only controls whether the button appears.
//
// Always answers 200 with {allowed}, so a disallowed site gets a quiet "no" rather than an error
// in its console. Responses are cached briefly by the browser to keep page loads cheap.
const VERDICT_CACHE_SECONDS = 60
const verdicts = new Map<string, { allowed: boolean; expires: number }>()

export async function handleSiteCheck(input: {
  request: Request
}): Promise<Response> {
  // Key in the query string keeps this a "simple" CORS request (no preflight round trip).
  const publicKey = (
    new URL(input.request.url).searchParams.get("key") ??
    input.request.headers.get("x-crikket-public-key") ??
    ""
  ).trim()
  const origin = getCaptureRequestOrigin(input.request)
  let allowed = false

  if (publicKey && origin) {
    const cacheKey = `${publicKey}\n${origin}`
    const cached = verdicts.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      allowed = cached.allowed
    } else {
      const record = await resolveCapturePublicKey(publicKey)
      allowed = record ? isCaptureOriginAllowed({ origin, record }) : false
      if (verdicts.size > 5000) verdicts.clear()
      verdicts.set(cacheKey, {
        allowed,
        expires: Date.now() + VERDICT_CACHE_SECONDS * 1000,
      })
    }
  }

  return buildJsonResponse(
    { allowed },
    {
      status: 200,
      headers: {
        "cache-control": `private, max-age=${VERDICT_CACHE_SECONDS}`,
        vary: "Origin",
      },
    }
  )
}
