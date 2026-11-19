import { describe, expect, it } from "bun:test"
import { cacheKey, cacheTtlMs, createAssetCache } from "../src/asset-cache.mjs"

const image = (overrides = {}) => ({
  method: "GET",
  resourceType: "image",
  requestHeaders: {},
  status: 200,
  headers: { "cache-control": "public, max-age=600" },
  ...overrides,
})
const response = (bytes) => ({
  status: 200,
  headers: {},
  body: Buffer.alloc(bytes),
})

describe("cacheTtlMs", () => {
  it("uses max-age, minus the time already spent in a CDN", () => {
    expect(cacheTtlMs(image())).toBe(600_000)
    expect(
      cacheTtlMs(
        image({ headers: { "cache-control": "max-age=600", age: "480" } })
      )
    ).toBe(120_000)
  })

  it("caps long lifetimes and gives a default when none is stated", () => {
    expect(
      cacheTtlMs(
        image({ headers: { "cache-control": "max-age=31536000, immutable" } })
      )
    ).toBe(3_600_000)
    expect(cacheTtlMs(image({ headers: {} }))).toBe(300_000)
  })

  it("never stores no-store responses", () => {
    expect(
      cacheTtlMs(image({ headers: { "cache-control": "no-store" } }))
    ).toBe(0)
    expect(
      cacheTtlMs(
        image({
          headers: { "cache-control": "private, No-Store, max-age=600" },
        })
      )
    ).toBe(0)
  })

  it("keeps must-revalidate style responses only briefly", () => {
    expect(
      cacheTtlMs(image({ headers: { "cache-control": "no-cache" } }))
    ).toBe(60_000)
    expect(
      cacheTtlMs(
        image({
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        })
      )
    ).toBe(60_000)
    expect(
      cacheTtlMs(
        image({ headers: { "cache-control": "max-age=100", age: "5000" } })
      )
    ).toBe(60_000)
  })

  it("only stores successful GETs for images, fonts and stylesheets", () => {
    expect(cacheTtlMs(image({ resourceType: "font" }))).toBeGreaterThan(0)
    expect(cacheTtlMs(image({ resourceType: "stylesheet" }))).toBeGreaterThan(0)
    expect(cacheTtlMs(image({ resourceType: "document" }))).toBe(0)
    expect(cacheTtlMs(image({ resourceType: "media" }))).toBe(0)
    expect(cacheTtlMs(image({ resourceType: "fetch" }))).toBe(0)
    expect(cacheTtlMs(image({ method: "POST" }))).toBe(0)
    expect(cacheTtlMs(image({ status: 404 }))).toBe(0)
    expect(cacheTtlMs(image({ status: 206 }))).toBe(0)
  })

  it("skips anything tied to a caller or a partial request", () => {
    expect(cacheTtlMs(image({ requestHeaders: { range: "bytes=0-99" } }))).toBe(
      0
    )
    expect(
      cacheTtlMs(image({ requestHeaders: { authorization: "Bearer x" } }))
    ).toBe(0)
    expect(cacheTtlMs(image({ requestHeaders: { cookie: "a=b" } }))).toBe(0)
    expect(
      cacheTtlMs(
        image({
          headers: { "set-cookie": "a=b", "cache-control": "max-age=600" },
        })
      )
    ).toBe(0)
    expect(
      cacheTtlMs(
        image({ headers: { vary: "*", "cache-control": "max-age=600" } })
      )
    ).toBe(0)
  })
})

describe("cacheKey", () => {
  it("separates engines and accepted formats for the same URL", () => {
    const url = "https://cdn.example.com/hero"
    const chromium = cacheKey(url, {
      accept: "image/avif,image/webp,*/*",
      "user-agent": "Chrome",
    })
    expect(
      cacheKey(url, {
        accept: "image/avif,image/webp,*/*",
        "user-agent": "Chrome",
      })
    ).toBe(chromium)
    expect(
      cacheKey(url, { accept: "image/webp,*/*", "user-agent": "Chrome" })
    ).not.toBe(chromium)
    expect(
      cacheKey(url, {
        accept: "image/avif,image/webp,*/*",
        "user-agent": "Safari",
      })
    ).not.toBe(chromium)
    expect(
      cacheKey(`${url}?v=2`, {
        accept: "image/avif,image/webp,*/*",
        "user-agent": "Chrome",
      })
    ).not.toBe(chromium)
  })
})

describe("createAssetCache", () => {
  it("returns what was stored until it expires", () => {
    let now = 1000
    const cache = createAssetCache({ now: () => now })
    const stored = response(10)
    expect(cache.set("a", stored, 500)).toBe(true)
    expect(cache.get("a")).toBe(stored)
    now += 499
    expect(cache.get("a")).toBe(stored)
    now += 1
    expect(cache.get("a")).toBeUndefined()
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
  })

  it("refuses entries with no lifetime or over the per-entry limit", () => {
    const cache = createAssetCache({ maxBytes: 100, maxEntryBytes: 40 })
    expect(cache.set("zero", response(10), 0)).toBe(false)
    expect(cache.set("big", response(41), 1000)).toBe(false)
    expect(cache.size).toBe(0)
  })

  it("evicts the least recently used entries to stay under the byte cap", () => {
    const cache = createAssetCache({ maxBytes: 100, maxEntryBytes: 100 })
    cache.set("a", response(40), 1000)
    cache.set("b", response(40), 1000)
    cache.get("a") // "b" is now the least recently used
    cache.set("c", response(40), 1000)
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")).toBeDefined()
    expect(cache.get("c")).toBeDefined()
    expect(cache.bytes).toBe(80)
    expect(cache.stats.evicted).toBe(1)
  })

  it("replaces an entry without double counting its size", () => {
    const cache = createAssetCache({ maxBytes: 100 })
    cache.set("a", response(60), 1000)
    cache.set("a", response(30), 1000)
    expect(cache.bytes).toBe(30)
    expect(cache.size).toBe(1)
  })
})
