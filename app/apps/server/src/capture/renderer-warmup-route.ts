import {
  isCaptureOriginAllowed,
  resolveCapturePublicKey,
} from "@crikket/bug-reports/lib/capture-public-key"
import { env } from "@crikket/env/server"
import { getCaptureRequestOrigin } from "./security"

// Heard: wakes the renderer before it's needed. The renderer container sleeps when idle, and
// waking it plus launching a browser is most of a slow first screenshot. The widget calls this
// when it appears on an allowed site and when someone hovers the tab; the screenshot that follows
// then only pays for the render itself.
//
// Answers 204 straight away and warms in the background. Only allowed sites trigger a warm-up,
// and at most one per engine every WARM_INTERVAL_MS, so page views can't keep the renderer busy.
const WARM_INTERVAL_MS = 60_000
const lastWarm = new Map<string, number>()

const IOS = /iPhone|iPad|iPod/
const FIREFOX = /Firefox\//
const SAFARI = /Safari\//
const NOT_SAFARI = /Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser/

// Same choice as the renderer's engineForUserAgent (apps/renderer/src/server.mjs).
function engineKey(userAgent: string): string {
  if (IOS.test(userAgent)) return "webkit"
  if (FIREFOX.test(userAgent)) return "firefox"
  if (SAFARI.test(userAgent) && !NOT_SAFARI.test(userAgent)) return "webkit"
  return "chromium"
}

export async function handleRendererWarmup(input: {
  request: Request
}): Promise<Response> {
  const done = new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  })
  if (!env.RENDERER_URL) return done

  const publicKey = (
    new URL(input.request.url).searchParams.get("key") ?? ""
  ).trim()
  const origin = getCaptureRequestOrigin(input.request)
  if (!(publicKey && origin)) return done

  const userAgent = (input.request.headers.get("user-agent") ?? "").slice(
    0,
    512
  )
  const engine = engineKey(userAgent)
  const now = Date.now()
  if (now - (lastWarm.get(engine) ?? 0) < WARM_INTERVAL_MS) return done

  const record = await resolveCapturePublicKey(publicKey)
  if (!(record && isCaptureOriginAllowed({ origin, record }))) return done

  lastWarm.set(engine, now)
  fetch(new URL("/warmup", env.RENDERER_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.RENDERER_SECRET
        ? { "x-renderer-secret": env.RENDERER_SECRET }
        : {}),
    },
    body: JSON.stringify({ userAgent }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => {
    // Let the next request try again.
    lastWarm.delete(engine)
  })
  return done
}
