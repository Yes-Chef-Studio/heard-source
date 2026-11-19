import type { CaptureRuntimeConfig } from "../types"

// Heard: ask the API whether this page's site is on the key's allowed list before showing any UI.
// The same snippet is typically published to staging and production alike, so this is what keeps
// the widget off the live site. Fails closed: if the check can't complete, the widget stays hidden
// (submissions would be rejected server-side anyway). The answer also carries the project's tab
// colour, so the launcher can be painted before it appears.
interface SiteVerdict {
  allowed: boolean
  color: string | null
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const cache = new Map<string, Promise<SiteVerdict>>()
const colors = new Map<string, string | null>()

function cacheKeyFor(config: CaptureRuntimeConfig): string {
  return `${config.host}\n${config.key}`
}

export function checkSite(config: CaptureRuntimeConfig): Promise<SiteVerdict> {
  const cacheKey = cacheKeyFor(config)
  let pending = cache.get(cacheKey)
  if (!pending) {
    const url = `${config.host}/api/embed/site-check?key=${encodeURIComponent(config.key)}`
    pending = fetch(url, { method: "GET", credentials: "omit" })
      .then((response) => (response.ok ? response.json() : { allowed: false }))
      .then((body: { allowed?: unknown; color?: unknown }) => ({
        allowed: body?.allowed === true,
        color:
          typeof body?.color === "string" && HEX_COLOR.test(body.color)
            ? body.color
            : null,
      }))
      .catch(() => ({ allowed: false, color: null }))
      .then((verdict) => {
        if (verdict.allowed) colors.set(cacheKey, verdict.color)
        else cache.delete(cacheKey)
        return verdict
      })
    cache.set(cacheKey, pending)
  }
  return pending
}

export function isSiteAllowed(config: CaptureRuntimeConfig): Promise<boolean> {
  return checkSite(config).then((verdict) => verdict.allowed)
}

// The project's tab colour, once the site check has answered (null = Heard's default).
export function getSiteColor(config: CaptureRuntimeConfig): string | null {
  return colors.get(cacheKeyFor(config)) ?? null
}

// Wakes the screenshot renderer ahead of time (see renderer-warmup-route.ts on the server).
// Fire and forget; at most once every two minutes per page.
const WARM_EVERY_MS = 120_000
let lastWarmAt = 0

export function warmRenderer(config: CaptureRuntimeConfig): void {
  const now = Date.now()
  if (now - lastWarmAt < WARM_EVERY_MS) return
  lastWarmAt = now
  const url = `${config.host}/api/embed/renderer-warmup?key=${encodeURIComponent(config.key)}`
  fetch(url, { method: "GET", credentials: "omit", keepalive: true }).catch(
    () => {
      lastWarmAt = 0
    }
  )
}
