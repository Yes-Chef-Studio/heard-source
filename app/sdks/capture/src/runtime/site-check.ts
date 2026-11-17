import type { CaptureRuntimeConfig } from "../types"

// Heard: ask the API whether this page's site is on the key's allowed list before showing any UI.
// The same snippet is typically published to staging and production alike, so this is what keeps
// the widget off the live site. Fails closed: if the check can't complete, the widget stays hidden
// (submissions would be rejected server-side anyway).
const cache = new Map<string, Promise<boolean>>()

export function isSiteAllowed(config: CaptureRuntimeConfig): Promise<boolean> {
  const cacheKey = `${config.host}\n${config.key}`
  let pending = cache.get(cacheKey)
  if (!pending) {
    const url = `${config.host}/api/embed/site-check?key=${encodeURIComponent(config.key)}`
    pending = fetch(url, { method: "GET", credentials: "omit" })
      .then((response) => (response.ok ? response.json() : { allowed: false }))
      .then((body: { allowed?: unknown }) => body?.allowed === true)
      .catch(() => false)
      .then((allowed) => {
        if (!allowed) cache.delete(cacheKey)
        return allowed
      })
    cache.set(cacheKey, pending)
  }
  return pending
}
