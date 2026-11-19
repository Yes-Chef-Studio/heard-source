import { afterEach, describe, expect, it, mock } from "bun:test"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { z } from "zod"

const CAPTURE_TOKEN_ROUTE_PATH = fileURLToPath(
  new URL("../src/capture/token-route.ts", import.meta.url)
)
const CAPTURE_UPLOAD_SESSION_ROUTE_PATH = fileURLToPath(
  new URL("../src/capture/upload-session-route.ts", import.meta.url)
)
const CAPTURE_FINALIZE_ROUTE_PATH = fileURLToPath(
  new URL("../src/capture/finalize-route.ts", import.meta.url)
)
const RENDER_SNAPSHOT_ROUTE_PATH = fileURLToPath(
  new URL("../src/capture/render-snapshot-route.ts", import.meta.url)
)
const CAPTURE_SUBMIT_PROTECTION_PATH = fileURLToPath(
  new URL("../src/capture/protection.ts", import.meta.url)
)

const replayKeys = new Set<string>()
const rateLimitedPrefixes = new Set<string>()
const validOrigin = "https://example.com"
const mockedEnv: {
  BETTER_AUTH_URL: string
  CAPTURE_SUBMIT_TOKEN_SECRET: string
  CORS_ORIGINS: string[]
  RENDERER_SECRET: string | undefined
  RENDERER_URL: string | undefined
  TURNSTILE_SECRET_KEY: string | undefined
  TURNSTILE_SITE_KEY: string | undefined
  UPSTASH_REDIS_REST_TOKEN: string | undefined
  UPSTASH_REDIS_REST_URL: string | undefined
} = {
  BETTER_AUTH_URL: "https://app.crikket.io",
  CAPTURE_SUBMIT_TOKEN_SECRET: "01234567890123456789012345678901",
  CORS_ORIGINS: ["https://app.crikket.io"],
  RENDERER_SECRET: "renderer_secret",
  RENDERER_URL: "http://renderer.internal",
  TURNSTILE_SECRET_KEY: "turnstile_secret",
  TURNSTILE_SITE_KEY: "turnstile_site",
  UPSTASH_REDIS_REST_TOKEN: "upstash_token",
  UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
}
const publicKeyRecord = {
  allowedOrigins: [validOrigin],
  createdAt: new Date(),
  createdBy: null,
  id: "key_123",
  key: "crk_test",
  label: "Example",
  organizationId: "org_123",
  revokedAt: null,
  rotatedAt: null,
  status: "active" as const,
  updatedAt: new Date(),
}
let activePublicKeyValue = publicKeyRecord.key
let activePublicKeyStatus: "active" | "revoked" = "active"

mock.module("@crikket/env/server", () => ({
  env: mockedEnv,
}))

mock.module("@crikket/bug-reports/lib/capture-public-key", () => ({
  isCaptureOriginAllowed: (input: {
    origin: string
    record: { allowedOrigins: string[]; status: string }
  }) => {
    return (
      input.record.status === "active" &&
      input.record.allowedOrigins.includes(input.origin)
    )
  },
  isCapturePublicKeyActive: (record: { status: string }) => {
    return record.status === "active"
  },
  normalizeCaptureOrigin: (value: string) => {
    try {
      const parsed = new URL(value)
      return `${parsed.protocol}//${parsed.host}`.toLowerCase()
    } catch {
      return null
    }
  },
  resolveCapturePublicKey: (key: string) => {
    if (key !== activePublicKeyValue) {
      return null
    }

    return {
      ...publicKeyRecord,
      key: activePublicKeyValue,
      status: activePublicKeyStatus,
    }
  },
}))

mock.module("@crikket/bug-reports/lib/upload-session", () => ({
  createBugReportUploadSessionInputSchema: z.object({
    attachmentType: z.enum(["video", "screenshot"]),
    captureContentType: z.string().optional(),
    description: z.string().optional(),
    debuggerSummary: z
      .object({
        actions: z.number().int().nonnegative(),
        logs: z.number().int().nonnegative(),
        networkRequests: z.number().int().nonnegative(),
      })
      .optional(),
    deviceInfo: z.unknown().optional(),
    hasDebuggerPayload: z.boolean().optional(),
    metadata: z.unknown().optional(),
    priority: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    visibility: z.string().optional(),
  }),
  finalizeBugReportUploadInputSchema: z.object({
    id: z.string().min(1),
    captureContentType: z.string().optional(),
    captureSizeBytes: z.number().int().nonnegative().optional(),
    debuggerContentEncoding: z.string().optional(),
    debuggerSizeBytes: z.number().int().nonnegative().optional(),
  }),
  createBugReportUploadSession: async () => ({
    bugReportId: "br_123",
    captureUpload: {
      headers: {
        "content-type": "image/png",
      },
      key: "organizations/org_123/bug-reports/br_123/capture/screenshot.png",
      method: "PUT" as const,
      url: "https://storage.example.com/capture-upload",
    },
    debuggerUpload: {
      headers: {
        "content-type": "application/json",
      },
      key: "organizations/org_123/bug-reports/br_123/debugger/payload.json.gz",
      method: "PUT" as const,
      url: "https://storage.example.com/debugger-upload",
    },
  }),
  finalizeBugReportUpload: async () => ({
    debugger: {
      dropped: { actions: 0, logs: 0, networkRequests: 0 },
      persisted: { actions: 1, logs: 2, networkRequests: 3 },
      requested: { actions: 1, logs: 2, networkRequests: 3 },
      warnings: [],
    },
    id: "br_123",
    shareUrl: "/s/br_123",
    warnings: [],
  }),
}))

mock.module("@upstash/redis", () => ({
  Redis: class Redis {
    set(key: string, _value: string, options?: { nx?: boolean; px?: number }) {
      if (options?.nx && replayKeys.has(key)) {
        return null
      }

      replayKeys.add(key)
      return "OK"
    }
  },
}))

mock.module("@upstash/ratelimit", () => ({
  Ratelimit: class Ratelimit {
    prefix: string

    constructor(input: { prefix: string }) {
      this.prefix = input.prefix
    }

    static fixedWindow(limit: number, window: string) {
      return { limit, window }
    }

    limit(key: string) {
      if (rateLimitedPrefixes.has(`${this.prefix}:${key}`)) {
        return {
          limit: 1,
          remaining: 0,
          reset: Date.now() + 60_000,
          success: false,
        }
      }

      return {
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60_000,
        success: true,
      }
    }
  },
}))

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  mockedEnv.RENDERER_URL = "http://renderer.internal"
  activePublicKeyStatus = "active"
  activePublicKeyValue = publicKeyRecord.key
  mockedEnv.CAPTURE_SUBMIT_TOKEN_SECRET = "01234567890123456789012345678901"
  mockedEnv.TURNSTILE_SECRET_KEY = "turnstile_secret"
  mockedEnv.TURNSTILE_SITE_KEY = "turnstile_site"
  mockedEnv.UPSTASH_REDIS_REST_TOKEN = "upstash_token"
  mockedEnv.UPSTASH_REDIS_REST_URL = "https://upstash.example.com"
  replayKeys.clear()
  rateLimitedPrefixes.clear()
  mock.restore()
})

describe("capture token route", () => {
  it("rejects requests without an origin", async () => {
    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        reasonCode: "missing_origin",
      },
    })
  })

  it("rejects disallowed origins", async () => {
    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          origin: "https://evil.example.com",
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        reasonCode: "disallowed_origin",
      },
    })
  })

  it("returns a challenge-required response before token minting", async () => {
    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          origin: validOrigin,
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      challenge: {
        provider: "turnstile",
        siteKey: "turnstile_site",
      },
      code: "CAPTURE_CHALLENGE_REQUIRED",
    })
  })

  it("mints a token after successful challenge verification", async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ hostname: "example.com", success: true }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          }
        )
      )
    )
    globalThis.fetch = Object.assign(() => fetchMock(), {
      preconnect: originalFetch.preconnect,
    }) as typeof fetch

    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        body: JSON.stringify({ turnstileToken: "turnstile_response" }),
        headers: {
          origin: validOrigin,
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      token: expect.any(String),
    })

    globalThis.fetch = originalFetch
  })

  it("mints a token without challenging when turnstile is unset", async () => {
    mockedEnv.TURNSTILE_SECRET_KEY = undefined
    mockedEnv.TURNSTILE_SITE_KEY = undefined

    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          origin: validOrigin,
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      token: expect.any(String),
    })
  })

  it("returns rate-limited when the token bucket blocks the request", async () => {
    rateLimitedPrefixes.add("crikket:rate-limit:capture:token:key:key_123")

    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          origin: validOrigin,
          "content-type": "application/json",
          "x-crikket-public-key": publicKeyRecord.key,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    })
  })

  it("rejects revoked keys immediately", async () => {
    activePublicKeyStatus = "revoked"

    const { handleCaptureToken } = await import(CAPTURE_TOKEN_ROUTE_PATH)
    const response = await handleCaptureToken({
      request: new Request("https://api.crikket.io/api/embed/capture-token", {
        headers: {
          origin: validOrigin,
          "content-type": "application/json",
          "x-crikket-public-key": activePublicKeyValue,
        },
        method: "POST",
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        reasonCode: "inactive_public_key",
      },
    })
  })
})

describe("capture upload session route", () => {
  it("rejects create-upload-session requests that are missing a token", async () => {
    const { handleCaptureUploadSession } = await import(
      CAPTURE_UPLOAD_SESSION_ROUTE_PATH
    )
    const response = await handleCaptureUploadSession({
      request: createUploadSessionRequest(),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        reasonCode: "missing_submit_token",
      },
    })
  })

  it("creates an upload session with a valid submit token", async () => {
    const { createCaptureSubmitToken } = await import(
      CAPTURE_SUBMIT_PROTECTION_PATH
    )
    const authorization = createCaptureSubmitToken({
      keyId: publicKeyRecord.id,
      origin: validOrigin,
    })
    expect(authorization).not.toBeNull()

    const { handleCaptureUploadSession } = await import(
      CAPTURE_UPLOAD_SESSION_ROUTE_PATH
    )
    const response = await handleCaptureUploadSession({
      request: createUploadSessionRequest({
        headers: {
          "x-crikket-capture-token": authorization!.token,
        },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      bugReportId: "br_123",
      captureUpload: {
        method: "PUT",
        url: "https://storage.example.com/capture-upload",
      },
      debuggerUpload: {
        method: "PUT",
        url: "https://storage.example.com/debugger-upload",
      },
      finalizeToken: expect.any(String),
    })
  })

  it("rejects the old value after key rotation and accepts the new one", async () => {
    const oldKey = activePublicKeyValue
    activePublicKeyValue = "crk_rotated"

    const { handleCaptureUploadSession } = await import(
      CAPTURE_UPLOAD_SESSION_ROUTE_PATH
    )
    const oldKeyResponse = await handleCaptureUploadSession({
      request: createUploadSessionRequest({
        headers: {
          "x-crikket-capture-token": "tok_legacy",
          "x-crikket-public-key": oldKey,
        },
      }),
    })

    expect(oldKeyResponse.status).toBe(401)
    await expect(oldKeyResponse.json()).resolves.toMatchObject({
      data: {
        reasonCode: "invalid_public_key",
      },
    })

    const newKeyResponse = await handleCaptureUploadSession({
      request: createUploadSessionRequest({
        headers: {
          "x-crikket-capture-token": "invalid.token",
          "x-crikket-public-key": activePublicKeyValue,
        },
      }),
    })

    expect(newKeyResponse.status).toBe(401)
    await expect(newKeyResponse.json()).resolves.toMatchObject({
      data: {
        reasonCode: "invalid_submit_token",
      },
    })
  })
})

describe("capture finalize route", () => {
  it("finalizes without a finalize token when capture protection is disabled", async () => {
    mockedEnv.CAPTURE_SUBMIT_TOKEN_SECRET = ""

    const { handleCaptureFinalize } = await import(CAPTURE_FINALIZE_ROUTE_PATH)
    const response = await handleCaptureFinalize({
      request: createFinalizeRequest(),
      shareOrigin: "https://app.crikket.io",
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: "br_123",
      reportId: "br_123",
      shareUrl: "https://app.crikket.io/s/br_123",
    })
  })

  it("rejects finalize requests without a finalize token", async () => {
    const { handleCaptureFinalize } = await import(CAPTURE_FINALIZE_ROUTE_PATH)
    const response = await handleCaptureFinalize({
      request: createFinalizeRequest(),
      shareOrigin: "https://app.crikket.io",
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        reasonCode: "missing_finalize_token",
      },
    })
  })

  it("finalizes an uploaded report with a valid finalize token", async () => {
    const { createCaptureFinalizeToken } = await import(
      CAPTURE_SUBMIT_PROTECTION_PATH
    )
    const authorization = createCaptureFinalizeToken({
      keyId: publicKeyRecord.id,
      origin: validOrigin,
      reportId: "br_123",
    })
    expect(authorization).not.toBeNull()

    const { handleCaptureFinalize } = await import(CAPTURE_FINALIZE_ROUTE_PATH)
    const response = await handleCaptureFinalize({
      request: createFinalizeRequest({
        headers: {
          "x-crikket-capture-finalize-token": authorization!.token,
        },
      }),
      shareOrigin: "https://app.crikket.io",
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: "br_123",
      reportId: "br_123",
      shareUrl: "https://app.crikket.io/s/br_123",
    })
  })
})

function createUploadSessionRequest(input?: {
  headers?: Record<string, string>
}): Request {
  return new Request(
    "https://api.crikket.io/api/embed/bug-report-upload-session",
    {
      body: JSON.stringify({
        attachmentType: "screenshot",
        captureContentType: "image/png",
        description: "Broken button",
        debuggerSummary: {
          actions: 1,
          logs: 2,
          networkRequests: 3,
        },
        hasDebuggerPayload: true,
        metadata: {
          durationMs: 0,
          pageTitle: "Checkout",
          sdkVersion: "1.0.0",
        },
        priority: "high",
        title: "Checkout is broken",
        url: "https://example.com/checkout",
        visibility: "private",
      }),
      headers: {
        "content-type": "application/json",
        origin: validOrigin,
        "x-crikket-public-key": publicKeyRecord.key,
        ...input?.headers,
      },
      method: "POST",
    }
  )
}

function createFinalizeRequest(input?: {
  headers?: Record<string, string>
}): Request {
  return new Request("https://api.crikket.io/api/embed/bug-report-finalize", {
    body: JSON.stringify({
      id: "br_123",
      captureContentType: "image/png",
      captureSizeBytes: 7,
      debuggerContentEncoding: "gzip",
      debuggerSizeBytes: 42,
    }),
    headers: {
      "content-type": "application/json",
      origin: validOrigin,
      "x-crikket-public-key": publicKeyRecord.key,
      ...input?.headers,
    },
    method: "POST",
  })
}

describe("render snapshot route", () => {
  const snapshotRequest = (
    headers: Record<string, string>,
    body: string | Uint8Array
  ) =>
    new Request("https://api.crikket.io/api/embed/render-snapshot", {
      body,
      headers: {
        "content-type": "application/json",
        origin: validOrigin,
        "x-crikket-public-key": publicKeyRecord.key,
        ...headers,
      },
      method: "POST",
    })

  function stubRenderer(response: () => Response) {
    const calls: { body: Uint8Array; headers: Headers; url: string }[] = []
    globalThis.fetch = mock(async (url: URL | string, init?: RequestInit) => {
      calls.push({
        body: new Uint8Array(init?.body as ArrayBuffer),
        headers: new Headers(init?.headers),
        url: String(url),
      })
      return await Promise.resolve(response())
    }) as unknown as typeof fetch
    return calls
  }

  const jpeg = () =>
    new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: {
        "content-length": "3",
        "content-type": "image/jpeg",
        "server-timing": "rebuild;dur=12.0, shot;dur=30.5",
        "x-render-engine": "chromium",
        "x-render-ms": "57",
      },
    })

  it("forwards a gzip body untouched and returns the renderer's image", async () => {
    const calls = stubRenderer(jpeg)
    const compressed = gzipSync(
      new TextEncoder().encode(JSON.stringify({ snapshot: { type: 0 } }))
    )
    const { handleRenderSnapshot } = await import(RENDER_SNAPSHOT_ROUTE_PATH)
    const response = await handleRenderSnapshot({
      request: snapshotRequest({ "x-heard-body-encoding": "gzip" }, compressed),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(response.headers.get("content-length")).toBe("3")
    expect(response.headers.get("x-render-engine")).toBe("chromium")
    expect(response.headers.get("x-render-ms")).toBe("57")
    const timing = response.headers.get("server-timing") ?? ""
    expect(timing).toContain("auth;dur=")
    expect(timing).toContain("upload;dur=")
    expect(timing).toContain("renderer;dur=")
    expect(timing).toContain("render-rebuild;dur=12.0")
    expect(timing).toContain("render-shot;dur=30.5")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff])
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("http://renderer.internal/render")
    expect(calls[0]?.headers.get("x-heard-body-encoding")).toBe("gzip")
    expect(calls[0]?.headers.get("x-renderer-secret")).toBe("renderer_secret")
    expect(calls[0]?.body).toEqual(new Uint8Array(compressed))
  })

  it("forwards a plain JSON body without an encoding header", async () => {
    const calls = stubRenderer(jpeg)
    const body = JSON.stringify({ snapshot: { type: 0 } })
    const { handleRenderSnapshot } = await import(RENDER_SNAPSHOT_ROUTE_PATH)
    const response = await handleRenderSnapshot({
      request: snapshotRequest({}, body),
    })

    expect(response.status).toBe(200)
    expect(calls[0]?.headers.has("x-heard-body-encoding")).toBe(false)
    expect(new TextDecoder().decode(calls[0]?.body)).toBe(body)
  })

  it("rejects an encoding it does not understand before calling the renderer", async () => {
    const calls = stubRenderer(jpeg)
    const { handleRenderSnapshot } = await import(RENDER_SNAPSHOT_ROUTE_PATH)
    const response = await handleRenderSnapshot({
      request: snapshotRequest({ "x-heard-body-encoding": "br" }, "x"),
    })

    expect(response.status).toBe(415)
    expect(calls).toHaveLength(0)
  })

  it("does not forward snapshots from origins the key does not allow", async () => {
    const calls = stubRenderer(jpeg)
    const { handleRenderSnapshot } = await import(RENDER_SNAPSHOT_ROUTE_PATH)
    const response = await handleRenderSnapshot({
      request: snapshotRequest({ origin: "https://evil.example" }, "{}"),
    })

    expect(response.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it("passes on the renderer's verdict for a bad or oversized body", async () => {
    stubRenderer(
      () =>
        new Response(JSON.stringify({ error: "Snapshot too large" }), {
          status: 413,
        })
    )
    const { handleRenderSnapshot } = await import(RENDER_SNAPSHOT_ROUTE_PATH)
    const response = await handleRenderSnapshot({
      request: snapshotRequest({ "x-heard-body-encoding": "gzip" }, "x"),
    })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: "RENDER_FAILED",
    })
  })
})
