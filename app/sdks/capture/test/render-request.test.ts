import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  postRenderRequest,
  resetRenderRequestState,
} from "../src/media/render-request"

const config = {
  host: "https://api.example.test",
  key: "crk_test",
  submitPath: "/api/embed/bug-reports",
  zIndex: 1,
}
const body = JSON.stringify({ snapshot: { type: 0, text: "x".repeat(5000) } })

type Sent = {
  gzip: boolean
  contentType: string | null
  bytes: number
  // The JSON the server would see, after undoing the compression.
  json: string
}

const realFetch = globalThis.fetch
let sent: Sent[] = []
let respond: (request: Sent, index: number) => Response | Promise<Response>

function image(type = "image/jpeg"): Response {
  return new Response(new Blob(["picture"], { type }), {
    headers: { "content-type": type, "x-render-ms": "123" },
  })
}

async function gunzip(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"))
  return await new Response(stream).text()
}

beforeEach(() => {
  resetRenderRequestState()
  sent = []
  respond = () => image()
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (init?.signal?.aborted) throw init.signal.reason
    const headers = new Headers(init?.headers)
    const payload = init?.body
    const request: Sent = {
      gzip: headers.get("x-heard-body-encoding") === "gzip",
      contentType: headers.get("content-type"),
      bytes: payload instanceof Blob ? payload.size : String(payload).length,
      json: payload instanceof Blob ? await gunzip(payload) : String(payload),
    }
    sent.push(request)
    return respond(request, sent.length - 1)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("postRenderRequest", () => {
  it("sends the snapshot gzipped and returns whatever image type comes back", async () => {
    const rendered = await postRenderRequest(config, body)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.gzip).toBe(true)
    expect(sent[0]?.json).toBe(body)
    expect(sent[0]?.contentType).toBe("application/json")
    expect(sent[0]?.bytes).toBeLessThan(body.length)
    expect(rendered.gzip).toBe(true)
    expect(rendered.blob.type).toBe("image/jpeg")
    expect(rendered.renderMs).toBe("123")
  })

  for (const status of [400, 415, 502]) {
    it(`retries once uncompressed after a ${status}, and remembers`, async () => {
      respond = (request) =>
        request.gzip ? new Response("no", { status }) : image("image/png")

      const first = await postRenderRequest(config, body)
      expect(sent.map((request) => request.gzip)).toEqual([true, false])
      expect(sent[1]?.json).toBe(body)
      expect(first.gzip).toBe(false)
      expect(first.blob.type).toBe("image/png")

      await postRenderRequest(config, body)
      expect(sent.map((request) => request.gzip)).toEqual([true, false, false])
    })
  }

  it("retries uncompressed when the gzip request is blocked outright (CORS preflight)", async () => {
    respond = (request) => {
      if (request.gzip) throw new TypeError("Failed to fetch")
      return image()
    }

    const rendered = await postRenderRequest(config, body)
    expect(sent.map((request) => request.gzip)).toEqual([true, false])
    expect(rendered.gzip).toBe(false)
  })

  it("keeps trying gzip if the uncompressed retry fails as well", async () => {
    respond = () => new Response("bad snapshot", { status: 400 })
    await expect(postRenderRequest(config, body)).rejects.toThrow(
      "Snapshot render failed (400)."
    )
    expect(sent.map((request) => request.gzip)).toEqual([true, false])

    respond = () => image()
    await postRenderRequest(config, body)
    expect(sent.at(-1)?.gzip).toBe(true)
  })

  it("does not retry other failures", async () => {
    respond = () => new Response("slow down", { status: 429 })
    await expect(postRenderRequest(config, body)).rejects.toThrow(
      "Snapshot render failed (429)."
    )
    expect(sent).toHaveLength(1)
  })

  it("stops without retrying when aborted", async () => {
    const controller = new AbortController()
    respond = () =>
      new Promise((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          const error = new Error("aborted")
          error.name = "AbortError"
          reject(error)
        })
      })

    const pending = postRenderRequest(config, body, controller.signal)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()

    await expect(pending).rejects.toThrow("aborted")
    expect(sent).toHaveLength(1)
  })

  it("rejects a response that isn't an image", async () => {
    respond = () =>
      new Response("{}", { headers: { "content-type": "application/json" } })
    await expect(postRenderRequest(config, body)).rejects.toThrow(
      "Snapshot render returned no image."
    )
  })
})
