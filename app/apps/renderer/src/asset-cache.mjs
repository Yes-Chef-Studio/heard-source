// In-memory cache for the images, fonts and stylesheets that rebuilt pages load. Every render runs
// in a fresh browser context (no shared browser cache), so without this a second screenshot of the
// same site downloads every asset again. Least-recently-used entries go first once the byte cap is
// reached.
//
// Requests from the renderer never carry cookies or credentials, so a cached response is one any
// anonymous client would have received for that URL.

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024
const DEFAULT_MAX_ENTRY_BYTES = 8 * 1024 * 1024
// Used when a response gives no max-age, like a browser's heuristic freshness.
const DEFAULT_TTL_MS = 5 * 60_000
// A reviewer usually takes a few screenshots of one page within a minute. Assets served with
// `no-cache`, `max-age=0` or an expired age (common on staging sites and preview deployments) are
// still reused for this long instead of being downloaded again for every screenshot.
const MIN_TTL_MS = 60_000
// Never trust an asset for longer than this, however long its max-age: reviewers look at sites that
// are being changed, and a replaced image must show up soon.
const MAX_TTL_MS = 60 * 60_000

const NO_STORE = /\bno-store\b/
const NO_CACHE = /\bno-cache\b/
const MAX_AGE = /\bmax-age\s*=\s*"?(\d+)/

export const CACHEABLE_TYPES = new Set(["image", "font", "stylesheet"])

/**
 * How long a response may be reused, in ms. 0 means don't cache it.
 * Only plain successful GETs for images, fonts and stylesheets qualify, and never `no-store`.
 * `private` is fine: this cache stands in for the single anonymous browser that made the request.
 */
export function cacheTtlMs(
  { method, resourceType, requestHeaders = {}, status, headers = {} },
  limits = {}
) {
  const defaultTtl = limits.defaultTtlMs ?? DEFAULT_TTL_MS
  const minTtl = limits.minTtlMs ?? MIN_TTL_MS
  const maxTtl = limits.maxTtlMs ?? MAX_TTL_MS
  if (method !== "GET" || status !== 200) return 0
  if (!CACHEABLE_TYPES.has(resourceType)) return 0
  if (
    requestHeaders.range ||
    requestHeaders.authorization ||
    requestHeaders.cookie
  )
    return 0
  if (headers["set-cookie"]) return 0
  if ((headers.vary || "").trim() === "*") return 0

  const directives = String(headers["cache-control"] || "").toLowerCase()
  if (NO_STORE.test(directives)) return 0
  if (NO_CACHE.test(directives)) return minTtl
  const maxAge = directives.match(MAX_AGE)
  if (!maxAge) return defaultTtl
  // Subtract the time the response already spent in a CDN cache.
  const age = Number(headers.age) || 0
  return Math.min(Math.max((Number(maxAge[1]) - age) * 1000, minTtl), maxTtl)
}

/**
 * Stylesheets and images can differ per browser (font formats, AVIF/WebP), so the engine's
 * User-Agent and Accept headers are part of the key.
 */
export function cacheKey(url, requestHeaders = {}) {
  return `${requestHeaders["user-agent"] || ""}\n${requestHeaders.accept || ""}\n${url}`
}
export function createAssetCache(options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxEntryBytes = Math.min(
    options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES,
    maxBytes
  )
  const now = options.now ?? Date.now
  // A Map iterates in insertion order; re-inserting on every hit keeps the oldest entry first.
  const entries = new Map()
  let bytes = 0
  const stats = { hits: 0, misses: 0, stored: 0, evicted: 0 }

  function remove(key) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    bytes -= entry.size
  }

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry || entry.expires <= now()) {
        if (entry) remove(key)
        stats.misses++
        return
      }
      entries.delete(key)
      entries.set(key, entry)
      stats.hits++
      return entry.response
    },
    /** `response` is { status, headers, body: Buffer }. Returns whether it was stored. */
    set(key, response, ttlMs) {
      const size = response.body.length
      if (!(ttlMs > 0) || size > maxEntryBytes) return false
      remove(key)
      while (bytes + size > maxBytes && entries.size > 0) {
        remove(entries.keys().next().value)
        stats.evicted++
      }
      entries.set(key, { response, size, expires: now() + ttlMs })
      bytes += size
      stats.stored++
      return true
    },
    clear() {
      entries.clear()
      bytes = 0
    },
    get bytes() {
      return bytes
    },
    get size() {
      return entries.size
    },
    stats,
  }
}
