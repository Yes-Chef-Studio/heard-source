import { describe, expect, it } from "bun:test"
import { gunzipSync, gzipSync } from "node:zlib"
import { decodeBody, readBody } from "../src/body.mjs"

const request = (buffers, headers = {}) => ({
  headers,
  [Symbol.asyncIterator]() {
    const chunks = buffers[Symbol.iterator]()
    return { next: () => Promise.resolve(chunks.next()) }
  },
})
const failure = (promise) =>
  promise.then(
    () => null,
    (error) => error
  )

describe("readBody", () => {
  const json = JSON.stringify({
    snapshot: { type: 0 },
    text: "héllo ✓".repeat(500),
  })

  it("reads a plain body and compresses it for the page", async () => {
    const half = Math.floor(json.length / 2)
    const body = await readBody(
      request([
        Buffer.from(json.slice(0, half)),
        Buffer.from(json.slice(half)),
      ]),
      1_000_000
    )
    expect(body.text).toBe(json)
    expect(gunzipSync(body.gzipped).toString("utf8")).toBe(json)
  })

  it("decompresses a gzip body and passes the original bytes on", async () => {
    const compressed = gzipSync(json)
    const body = await readBody(
      request([compressed], { "x-heard-body-encoding": "gzip" }),
      1_000_000
    )
    expect(body.text).toBe(json)
    expect(body.gzipped).toBe(compressed)
  })

  it("rejects a body larger than the limit while reading", async () => {
    const error = await failure(
      readBody(request([Buffer.alloc(600), Buffer.alloc(600)]), 1000)
    )
    expect(error?.status).toBe(413)
  })

  it("rejects a small gzip body that expands past the limit", async () => {
    const bomb = gzipSync(Buffer.alloc(5_000_000))
    expect(bomb.length).toBeLessThan(10_000)
    const error = await failure(
      readBody(request([bomb], { "x-heard-body-encoding": "gzip" }), 1_000_000)
    )
    expect(error?.status).toBe(413)
  })
})

describe("decodeBody", () => {
  it("treats a missing or identity encoding as plain bytes", async () => {
    const raw = Buffer.from("{}")
    expect(await decodeBody(raw, undefined, 100)).toBe(raw)
    expect(await decodeBody(raw, "identity", 100)).toBe(raw)
  })

  it("accepts the header value in any case", async () => {
    expect((await decodeBody(gzipSync("{}"), " GZIP ", 100)).toString()).toBe(
      "{}"
    )
  })

  it("answers 400 for bytes that are not gzip and 415 for other encodings", async () => {
    expect(
      (await failure(decodeBody(Buffer.from("{}"), "gzip", 100)))?.status
    ).toBe(400)
    expect(
      (await failure(decodeBody(Buffer.from("{}"), "br", 100)))?.status
    ).toBe(415)
  })
})
