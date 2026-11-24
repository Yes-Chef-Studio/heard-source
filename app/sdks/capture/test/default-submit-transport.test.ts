import { afterEach, describe, expect, it, mock } from "bun:test"

import {
  defaultSubmitTransport,
  prepareSubmitToken,
  resetSubmitTransportState,
} from "../src/transport/default-submit-transport"
import type { CaptureSubmitRequest } from "../src/types"

const originalFetch = globalThis.fetch

const request = {
  config: {
    host: "https://api.crikket.io",
    key: "crk_transport",
    submitPath: "/api/embed/bug-reports",
    zIndex: 2_147_483_640,
  },
  report: {
    captureType: "screenshot",
    title: "Checkout issue",
    description: "Button is disabled",
    priority: "high",
    visibility: "public",
    pageUrl: "https://example.com/checkout",
    pageTitle: "Checkout",
    durationMs: null,
    deviceInfo: {
      browser: "bun-test",
    },
    debuggerSummary: {
      actions: 1,
      logs: 2,
      networkRequests: 3,
    },
    debuggerPayload: {
      actions: [],
      logs: [],
      networkRequests: [],
    },
    media: new Blob(["capture"], { type: "image/png" }),
  },
} satisfies CaptureSubmitRequest

afterEach(() => {
  resetSubmitTransportState()
  mock.restore()
  globalThis.fetch = originalFetch
})

function installFetchMock(
  responseFactory: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => Promise<Response>
) {
  const fetchMock = mock(responseFactory)

  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetchMock(input, init),
    {
      preconnect: originalFetch.preconnect,
    }
  )

  return fetchMock
}

describe("default submit transport regression", () => {
  it("mints a submit token, creates an upload session, uploads artifacts, and finalizes the report", async () => {
    const fetchMock = installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        if (String(input).endsWith("/capture-token")) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "tok_123" }), {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            })
          )
        }

        if (String(input).endsWith("/bug-report-upload-session")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                bugReportId: "br_123",
                captureUpload: {
                  headers: {
                    "content-type": "image/png",
                  },
                  method: "PUT",
                  url: "https://storage.example.com/capture-upload",
                },
                debuggerUpload: {
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "PUT",
                  url: "https://storage.example.com/debugger-upload",
                },
                finalizeToken: "fin_123",
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              }
            )
          )
        }

        if (
          String(input).startsWith("https://storage.example.com/") &&
          init?.method === "PUT"
        ) {
          return Promise.resolve(new Response(null, { status: 200 }))
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({ report: { id: "br_123", url: "/s/br_123" } }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            }
          )
        )
      }
    )

    const result = await defaultSubmitTransport(request)

    expect(result).toEqual({
      reportId: "br_123",
      shareUrl: "https://api.crikket.io/s/br_123",
      raw: {
        report: {
          id: "br_123",
          url: "/s/br_123",
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.crikket.io/api/embed/capture-token"
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.crikket.io/api/embed/bug-report-upload-session"
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-capture-token": "tok_123",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://storage.example.com/capture-upload"
    )
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: {
        "content-type": "image/png",
      },
      method: "PUT",
    })
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "https://storage.example.com/debugger-upload"
    )
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: {
        "content-type": "application/json",
      },
      method: "PUT",
    })
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      "https://api.crikket.io/api/embed/bug-report-finalize"
    )
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-capture-finalize-token": "fin_123",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
  })

  it("surfaces json error payloads and falls back when the response is not json", async () => {
    installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1]
      ) =>
        Promise.resolve(
          String(input).endsWith("/capture-token")
            ? new Response(JSON.stringify({ token: "tok_123" }), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              })
            : new Response(JSON.stringify({ message: "Origin not allowed." }), {
                status: 403,
                headers: {
                  "content-type": "application/json",
                },
              })
        )
    )

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Origin not allowed."
    )

    installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1]
      ) =>
        Promise.resolve(
          String(input).endsWith("/capture-token")
            ? new Response(JSON.stringify({ token: "tok_123" }), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              })
            : new Response("upstream exploded", {
                status: 502,
                headers: {
                  "content-type": "text/plain",
                },
              })
        )
    )

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Capture submission failed with status 502."
    )
  })

  it("fails before making network requests when the upload is too large", async () => {
    const fetchMock = installFetchMock(() => {
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    const oversizedRequest = {
      ...request,
      report: {
        ...request.report,
        captureType: "video",
        media: {
          size: 96 * 1024 * 1024,
          type: "video/webm",
        } as Blob,
      },
    } satisfies CaptureSubmitRequest

    await expect(defaultSubmitTransport(oversizedRequest)).rejects.toThrow(
      "This recording is too large to upload reliably. Retry with a shorter recording or a screenshot."
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const uploadSessionPayload = {
  bugReportId: "br_123",
  captureUpload: {
    headers: { "content-type": "image/png" },
    method: "PUT",
    url: "https://storage.example.com/capture-upload",
  },
  debuggerUpload: {
    headers: { "content-type": "application/json" },
    method: "PUT",
    url: "https://storage.example.com/debugger-upload",
  },
  finalizeToken: "fin_123",
}

// A server that answers every step of a submission. `overrides` replaces the answer for URLs
// ending in the given suffix; returning undefined from one falls through to the default.
function installSubmitServer(
  overrides: Record<
    string,
    (init?: Parameters<typeof fetch>[1]) => Promise<Response> | undefined
  > = {}
) {
  let tokens = 0
  return installFetchMock((input, init) => {
    const url = String(input)
    for (const [suffix, respond] of Object.entries(overrides)) {
      const response = url.endsWith(suffix) ? respond(init) : undefined
      if (response) return response
    }
    if (url.endsWith("/capture-token")) {
      tokens += 1
      return Promise.resolve(json({ token: `tok_${tokens}` }))
    }
    if (url.endsWith("/bug-report-upload-session")) {
      return Promise.resolve(json(uploadSessionPayload))
    }
    if (url.startsWith("https://storage.example.com/")) {
      return Promise.resolve(new Response(null, { status: 200 }))
    }
    return Promise.resolve(json({ id: "br_123", shareUrl: "/s/br_123" }))
  })
}

function calledUrls(fetchMock: ReturnType<typeof installFetchMock>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]).split("/").at(-1))
}

function sessionToken(
  fetchMock: ReturnType<typeof installFetchMock>,
  index: number
): string | undefined {
  const headers = fetchMock.mock.calls[index]?.[1]?.headers as
    | Record<string, string>
    | undefined
  return headers?.["x-crikket-capture-token"]
}

describe("default submit transport speed", () => {
  it("uploads the capture and the debugger payload at the same time", async () => {
    const started: string[] = []
    const release: Array<() => void> = []
    const hold = (name: string) => () => {
      started.push(name)
      return new Promise<Response>((resolve) => {
        release.push(() => resolve(new Response(null, { status: 200 })))
      })
    }
    installSubmitServer({
      "/capture-upload": hold("capture"),
      "/debugger-upload": hold("debugger"),
    })

    const submitted = defaultSubmitTransport(request)
    while (started.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // Both are in flight before either has been answered.
    expect(started).toEqual(["capture", "debugger"])
    for (const finish of release) finish()
    expect((await submitted).reportId).toBe("br_123")
  })

  it("fails the submission when either upload fails", async () => {
    installSubmitServer({
      "/debugger-upload": () =>
        Promise.resolve(new Response(null, { status: 403 })),
    })

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Artifact upload failed with status 403."
    )
  })

  it("uses a submit token fetched ahead of time instead of asking again", async () => {
    const fetchMock = installSubmitServer()

    prepareSubmitToken(request.config)
    expect(calledUrls(fetchMock)).toEqual(["capture-token"])

    await defaultSubmitTransport(request)

    expect(calledUrls(fetchMock)).toEqual([
      "capture-token",
      "bug-report-upload-session",
      "capture-upload",
      "debugger-upload",
      "bug-report-finalize",
    ])
    expect(sessionToken(fetchMock, 1)).toBe("tok_1")
  })

  it("asks for a new token for each report: a token is used once", async () => {
    const fetchMock = installSubmitServer()

    prepareSubmitToken(request.config)
    await defaultSubmitTransport(request)
    await defaultSubmitTransport(request)

    expect(
      calledUrls(fetchMock).filter((name) => name === "capture-token")
    ).toHaveLength(2)
    expect(sessionToken(fetchMock, 6)).toBe("tok_2")
  })

  it("keeps a token that is still fresh rather than fetching another", async () => {
    const fetchMock = installSubmitServer()

    prepareSubmitToken(request.config)
    prepareSubmitToken(request.config)
    prepareSubmitToken(request.config)

    expect(calledUrls(fetchMock)).toEqual(["capture-token"])
    await defaultSubmitTransport(request)
    expect(sessionToken(fetchMock, 1)).toBe("tok_1")
  })

  it("does not use a token prepared for another key", async () => {
    const fetchMock = installSubmitServer()

    prepareSubmitToken({ ...request.config, key: "crk_other" })
    await defaultSubmitTransport(request)

    expect(
      calledUrls(fetchMock).filter((name) => name === "capture-token")
    ).toHaveLength(2)
    expect(sessionToken(fetchMock, 2)).toBe("tok_2")
  })

  it("does not use a token that has gone stale", async () => {
    const fetchMock = installSubmitServer()
    const realNow = Date.now
    try {
      prepareSubmitToken(request.config)
      // Five minutes on: past the token's life on the server.
      Date.now = () => realNow() + 5 * 60 * 1000
      await defaultSubmitTransport(request)
    } finally {
      Date.now = realNow
    }

    expect(sessionToken(fetchMock, 2)).toBe("tok_2")
  })

  it("gets a new token when the one fetched ahead of time is turned down", async () => {
    let sessions = 0
    const fetchMock = installSubmitServer({
      "/bug-report-upload-session": () => {
        sessions += 1
        return sessions === 1
          ? Promise.resolve(
              json({ message: "Capture submit token is invalid." }, 401)
            )
          : undefined
      },
    })

    prepareSubmitToken(request.config)
    const result = await defaultSubmitTransport(request)

    expect(result.reportId).toBe("br_123")
    expect(calledUrls(fetchMock).slice(0, 4)).toEqual([
      "capture-token",
      "bug-report-upload-session",
      "capture-token",
      "bug-report-upload-session",
    ])
    expect(sessionToken(fetchMock, 3)).toBe("tok_2")
  })

  it("reports a refused token as before when none was fetched ahead of time", async () => {
    const fetchMock = installSubmitServer({
      "/bug-report-upload-session": () =>
        Promise.resolve(
          json({ message: "Capture submit token is invalid." }, 401)
        ),
    })

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Capture submit token is invalid."
    )
    expect(calledUrls(fetchMock)).toEqual([
      "capture-token",
      "bug-report-upload-session",
    ])
  })

  it("falls back to asking at submit time when the early request fails", async () => {
    let tokenRequests = 0
    const fetchMock = installSubmitServer({
      "/capture-token": () => {
        tokenRequests += 1
        return tokenRequests === 1
          ? Promise.resolve(json({ message: "Too many attempts." }, 429))
          : undefined
      },
    })

    prepareSubmitToken(request.config)
    const result = await defaultSubmitTransport(request)

    expect(result.reportId).toBe("br_123")
    expect(tokenRequests).toBe(2)
    expect(sessionToken(fetchMock, 2)).toBe("tok_1")
  })
})
