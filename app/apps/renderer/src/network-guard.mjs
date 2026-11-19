// Snapshots come from reviewers' browsers, so every URL inside them is untrusted. Without this guard
// a snapshot could reference an internal host (cloud metadata, the database, localhost admin
// panels) and the renderer would fetch it and hand back a screenshot of the response.
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import {
  CACHEABLE_TYPES,
  cacheKey,
  cacheTtlMs,
  createAssetCache,
} from "./asset-cache.mjs"

const ALLOW_PRIVATE = process.env.RENDERER_ALLOW_PRIVATE_NETWORK === "1"

// Shared by every render. RENDERER_ASSET_CACHE_MB=0 turns it off.
const CACHE_MB = Number(process.env.RENDERER_ASSET_CACHE_MB ?? 256)
export const assetCache =
  CACHE_MB > 0 ? createAssetCache({ maxBytes: CACHE_MB * 1024 * 1024 }) : null

const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/
const UNIQUE_LOCAL_V6 = /^f[cd]/
const LINK_LOCAL_V6 = /^fe[89ab]/
const BRACKETS = /^\[|\]$/g
// Response headers that describe the encoded body; see pageHeaders().
const BODY_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
])
const ignore = () => undefined

function ipv4ToInt(ip) {
  // biome-ignore lint/suspicious/noBitwiseOperators: packs the four octets into one 32-bit number
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([base, bits]) => [
  ipv4ToInt(base),
  // biome-ignore lint/suspicious/noBitwiseOperators: network mask for a CIDR prefix length
  bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0,
])

export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip)
    // biome-ignore lint/suspicious/noBitwiseOperators: compares the network part of two addresses
    return BLOCKED_V4.some(([base, mask]) => (n & mask) === (base & mask))
  }
  const v6 = ip.toLowerCase()
  if (v6 === "::" || v6 === "::1") return true
  const mapped = v6.match(MAPPED_V4)
  if (mapped) return isPrivateAddress(mapped[1])
  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
  return (
    UNIQUE_LOCAL_V6.test(v6) || LINK_LOCAL_V6.test(v6) || v6.startsWith("ff")
  )
}

const verdicts = new Map()

async function hostAllowed(hostname) {
  if (ALLOW_PRIVATE) return true
  const host = hostname.replace(BRACKETS, "")
  if (isIP(host)) return !isPrivateAddress(host)
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  )
    return false
  const cached = verdicts.get(host)
  if (cached && cached.expires > Date.now()) return cached.allowed
  let allowed = false
  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    allowed =
      addresses.length > 0 &&
      addresses.every(({ address }) => !isPrivateAddress(address))
  } catch {
    allowed = false
  }
  verdicts.set(host, { allowed, expires: Date.now() + 60_000 })
  return allowed
}

const MAX_REDIRECTS = 5

// Playwright only calls the route handler for the first URL of a redirect chain, so a public URL
// that redirects to an internal one would get past a continue(). Instead, fetch server-side, follow
// redirects ourselves, and check every hop.
async function fetchGuarded(route) {
  let url = route.request().url()
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await route.fetch({
      url,
      maxRedirects: 0,
      // The browser's own Accept-Encoding may include zstd (Firefox does), which Playwright's
      // fetch can't decode; the browser would then get compressed bytes as an SVG/font.
      headers: {
        ...route.request().headers(),
        "accept-encoding": "gzip, deflate, br",
      },
    })
    const location = response.headers().location
    if (!(response.status() >= 300 && response.status() < 400 && location))
      return response
    const next = new URL(location, url)
    if (
      !(
        (next.protocol === "http:" || next.protocol === "https:") &&
        (await hostAllowed(next.hostname))
      )
    ) {
      throw new Error(`Blocked redirect to ${next.origin}`)
    }
    url = next.href
  }
  throw new Error("Too many redirects")
}

// Responses headed for the page. Fonts are always fetched in CORS mode, and the rebuilt page has an
// opaque ("null") origin. On the reviewer's page, self-hosted fonts were same-origin and needed no
// CORS header; here they'd be blocked. The page is a scriptless sandbox, so allowing any origin is
// harmless. route.fetch() hands back a decoded body, so the original encoding/length headers would
// be wrong. Firefox trusts them and fails to decode (dropped web fonts on daddyyankee.com).
function pageHeaders(responseHeaders) {
  const headers = { "access-control-allow-origin": "*" }
  for (const [name, value] of Object.entries(responseHeaders)) {
    if (!(BODY_HEADERS.has(name) || name === "access-control-allow-origin")) {
      headers[name] = value
    }
  }
  return headers
}

// Downloads one asset (all redirect hops checked) and stores it when the response allows.
async function fetchAndStore(route, key, cache) {
  const request = route.request()
  const response = await fetchGuarded(route)
  const headers = pageHeaders(response.headers())
  const ttl = cacheTtlMs({
    method: request.method(),
    resourceType: request.resourceType(),
    requestHeaders: request.headers(),
    status: response.status(),
    headers,
  })
  if (!ttl) return { response, headers }
  const stored = {
    status: response.status(),
    headers,
    body: await response.body(),
  }
  cache.set(key, stored, ttl)
  return { stored }
}

// Two renders of the same site at once (or one page using an image twice) share a single download.
const inFlight = new Map()

async function fulfillGuarded(route, cache) {
  const request = route.request()
  const cacheable =
    cache &&
    request.method() === "GET" &&
    CACHEABLE_TYPES.has(request.resourceType())
  try {
    if (!cacheable) {
      const response = await fetchGuarded(route)
      return await route.fulfill({
        response,
        headers: pageHeaders(response.headers()),
      })
    }
    const key = cacheKey(request.url(), request.headers())
    const hit = cache.get(key)
    if (hit) return await route.fulfill(hit)

    const shared = inFlight.get(key)
    if (shared) {
      const stored = await shared.catch(() => null)
      if (stored) return await route.fulfill(stored)
    }
    const download = fetchAndStore(route, key, cache)
    const pending = download.then((result) => result.stored ?? null)
    pending.catch(ignore)
    inFlight.set(key, pending)
    try {
      const result = await download
      return await route.fulfill(
        result.stored ?? { response: result.response, headers: result.headers }
      )
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key)
    }
  } catch {
    return route.abort("failed").catch(ignore)
  }
}

/**
 * Route every request in a browser context through the guard. Only http(s) to public addresses
 * passes, including every redirect hop; data: and blob: never reach the network layer.
 *
 * Cached assets are served only after the same host check as a live request, and only responses
 * whose whole redirect chain passed the guard are ever stored.
 *
 * Residual risk: DNS rebinding between our lookup and Playwright's own fetch. Production should also run
 * the renderer on a network with no route to internal services (egress-only).
 */
export async function guardContext(context, { cache = assetCache } = {}) {
  await context.route("**/*", async (route) => {
    let url
    try {
      url = new URL(route.request().url())
    } catch {
      return route.abort("blockedbyclient")
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return route.abort("blockedbyclient")
    if (!(await hostAllowed(url.hostname)))
      return route.abort("blockedbyclient")
    return fulfillGuarded(route, cache)
  })
}
