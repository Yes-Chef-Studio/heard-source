import {
  buildDebuggerArtifactForUpload,
  type DirectUploadTarget,
  uploadArtifactToStorage,
} from "@crikket/capture-core/upload/client"
import type { CaptureSubmitRequest, CaptureSubmitResult } from "../types"
import { runTurnstileChallenge } from "./turnstile"

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//
const BUG_REPORTS_PATH_SUFFIX = "/bug-reports"
const CAPTURE_CHALLENGE_REQUIRED_CODE = "CAPTURE_CHALLENGE_REQUIRED"
const FILE_SIZE_LIMIT_MESSAGE =
  "This recording is too large to upload reliably. Retry with a shorter recording or a screenshot."
// The server's submit tokens last five minutes; one fetched ahead of time is used for four.
const PREPARED_TOKEN_MAX_AGE_MS = 4 * 60 * 1000

type CaptureConfig = CaptureSubmitRequest["config"]

interface SubmitToken {
  // Undefined when the server doesn't ask for one.
  token: string | undefined
}

interface PreparedSubmitToken {
  scope: string
  startedAt: number
  // Null if it couldn't be had without the reviewer (a challenge) or at all.
  result: Promise<SubmitToken | null>
}

let preparedToken: PreparedSubmitToken | null = null

function tokenScope(config: CaptureConfig): string {
  return `${config.host}\n${config.submitPath}\n${config.key}`
}

function isPreparedTokenUsable(
  prepared: PreparedSubmitToken | null,
  config: CaptureConfig
): prepared is PreparedSubmitToken {
  return (
    prepared !== null &&
    prepared.scope === tokenScope(config) &&
    Date.now() - prepared.startedAt < PREPARED_TOKEN_MAX_AGE_MS
  )
}

// Heard: sending a report starts with a request for a submit token, which needs nothing the
// reviewer types. Asking for it when the review screen opens takes that round trip out of the
// wait after "Send report". Purely an optimisation: without a usable token the submit asks for
// one itself, as before. One that is still fresh is kept rather than replaced, so retaking a
// screenshot several times doesn't use up the token rate limit.
export function prepareSubmitToken(config: CaptureConfig): void {
  if (isPreparedTokenUsable(preparedToken, config)) return

  const entry: PreparedSubmitToken = {
    scope: tokenScope(config),
    startedAt: Date.now(),
    result: requestSubmitToken(config, undefined)
      .then((outcome) =>
        outcome.kind === "token" ? { token: outcome.token } : null
      )
      .catch(() => null),
  }
  preparedToken = entry
  entry.result.then((token) => {
    if (!token && preparedToken === entry) preparedToken = null
  })
}

// A token is good for one submission, so taking it uses it up.
function takePreparedSubmitToken(
  config: CaptureConfig
): Promise<SubmitToken | null> {
  const prepared = preparedToken
  preparedToken = null
  return isPreparedTokenUsable(prepared, config)
    ? prepared.result
    : Promise.resolve(null)
}

export function resetSubmitTransportState(): void {
  preparedToken = null
}

export async function defaultSubmitTransport(
  request: CaptureSubmitRequest
): Promise<CaptureSubmitResult> {
  const uploadSessionRequest = buildUploadSessionRequest(request)
  const uploadSessionUrl = `${request.config.host}${resolveUploadSessionPath(
    request.config.submitPath
  )}`
  const finalizeUrl = `${request.config.host}${resolveFinalizePath(
    request.config.submitPath
  )}`
  // Compressing the activity log needs nothing from the server, so it runs alongside the first
  // requests instead of between the two uploads.
  const debuggerArtifactReady = buildDebuggerArtifactForUpload(
    request.report.debuggerPayload
  )
  // Reported where it is awaited below; if an earlier step fails first, not at all.
  debuggerArtifactReady.catch(() => undefined)

  const createUploadSession = (token: string | undefined) =>
    fetch(uploadSessionUrl, {
      method: "POST",
      headers: {
        ...(token ? { "x-crikket-capture-token": token } : undefined),
        "content-type": "application/json",
        "x-crikket-public-key": request.config.key,
      },
      body: JSON.stringify(uploadSessionRequest),
      credentials: "omit",
      mode: "cors",
    })

  const prepared = await takePreparedSubmitToken(request.config)
  let uploadSessionResponse = await createUploadSession(
    prepared ? prepared.token : await fetchCaptureSubmitToken(request)
  )
  if (prepared && uploadSessionResponse.status === 401) {
    // The token fetched ahead of time was turned down (expired, say): get one now.
    uploadSessionResponse = await createUploadSession(
      await fetchCaptureSubmitToken(request)
    )
  }

  const uploadSessionPayload = await parseResponsePayload(uploadSessionResponse)
  if (!uploadSessionResponse.ok) {
    throw new Error(
      getResponseErrorMessage(
        uploadSessionPayload,
        uploadSessionResponse.status
      )
    )
  }

  const uploadSession = parseUploadSessionPayload(uploadSessionPayload)
  // The picture and the activity log go to storage side by side rather than one after the other.
  const [, debuggerArtifact] = await Promise.all([
    uploadArtifactToStorage(uploadSession.captureUpload, request.report.media),
    debuggerArtifactReady.then(async (artifact) => {
      if (uploadSession.debuggerUpload && artifact) {
        await uploadArtifactToStorage(
          uploadSession.debuggerUpload,
          artifact.blob,
          {
            contentEncoding: artifact.contentEncoding,
          }
        )
      }
      return artifact
    }),
  ])

  const response = await fetch(finalizeUrl, {
    method: "POST",
    headers: {
      ...(uploadSession.finalizeToken
        ? { "x-crikket-capture-finalize-token": uploadSession.finalizeToken }
        : undefined),
      "content-type": "application/json",
      "x-crikket-public-key": request.config.key,
    },
    body: JSON.stringify({
      id: uploadSession.bugReportId,
      captureContentType:
        request.report.media.type ||
        (request.report.captureType === "screenshot"
          ? "image/png"
          : "video/webm"),
      captureSizeBytes: request.report.media.size,
      debuggerContentEncoding: debuggerArtifact?.contentEncoding,
      debuggerSizeBytes: debuggerArtifact?.blob.size,
    }),
    credentials: "omit",
    mode: "cors",
  })

  const responsePayload = await parseResponsePayload(response)
  if (!response.ok) {
    throw new Error(getResponseErrorMessage(responsePayload, response.status))
  }

  return {
    shareUrl: resolveShareUrl(
      request.config.host,
      resolveString(responsePayload, ["shareUrl", "url"])
    ),
    reportId: resolveString(responsePayload, ["id", "reportId"]),
    raw: responsePayload,
  }
}

function buildUploadSessionRequest(request: CaptureSubmitRequest): {
  attachmentType: CaptureSubmitRequest["report"]["captureType"]
  captureContentType?: string
  category: NonNullable<CaptureSubmitRequest["report"]["category"]> | null
  description: string
  debuggerSummary: CaptureSubmitRequest["report"]["debuggerSummary"]
  deviceInfo?: CaptureSubmitRequest["report"]["deviceInfo"]
  hasDebuggerPayload: boolean
  metadata: {
    durationMs?: number
    pageTitle: string
    submittedVia: string
  }
  priority: CaptureSubmitRequest["report"]["priority"]
  reporter?: CaptureSubmitRequest["report"]["reporter"]
  title: string
  url: string
  visibility: CaptureSubmitRequest["report"]["visibility"]
} {
  if (request.report.media.size > 95 * 1024 * 1024) {
    throw new Error(FILE_SIZE_LIMIT_MESSAGE)
  }

  return {
    title: request.report.title,
    description: request.report.description,
    priority: request.report.priority,
    category: request.report.category ?? null,
    visibility: request.report.visibility,
    reporter: request.report.reporter,
    attachmentType: request.report.captureType,
    url: request.report.pageUrl,
    metadata: {
      durationMs: request.report.durationMs ?? undefined,
      pageTitle: request.report.pageTitle,
      submittedVia: "capture-sdk",
    },
    deviceInfo: request.report.deviceInfo,
    captureContentType: request.report.media.type || undefined,
    debuggerSummary: request.report.debuggerSummary,
    hasDebuggerPayload: Boolean(request.report.debuggerPayload),
  }
}

type SubmitTokenOutcome =
  | { kind: "token"; token: string | undefined }
  | { kind: "challenge"; siteKey: string }

// One request to the token route. Throws if the server refuses outright.
async function requestSubmitToken(
  config: CaptureConfig,
  turnstileToken: string | undefined
): Promise<SubmitTokenOutcome> {
  const tokenUrl = `${config.host}${resolveCaptureTokenPath(config.submitPath)}`
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-crikket-public-key": config.key,
    },
    body: JSON.stringify(
      turnstileToken ? { turnstileToken } : { turnstileToken: undefined }
    ),
    credentials: "omit",
    mode: "cors",
  })

  if (
    response.status === 404 ||
    response.status === 405 ||
    response.status === 501
  ) {
    return { kind: "token", token: undefined }
  }

  const responsePayload = await parseResponsePayload(response)
  if (response.ok) {
    return { kind: "token", token: resolveString(responsePayload, ["token"]) }
  }

  const challenge = resolveChallenge(responsePayload)
  if (
    isChallengeRequired(responsePayload) &&
    challenge?.provider === "turnstile" &&
    challenge.siteKey &&
    !turnstileToken
  ) {
    return { kind: "challenge", siteKey: challenge.siteKey }
  }

  throw new Error(getResponseErrorMessage(responsePayload, response.status))
}

async function fetchCaptureSubmitToken(
  request: CaptureSubmitRequest
): Promise<string | undefined> {
  let turnstileToken: string | undefined

  for (const _attempt of [0, 1] as const) {
    const outcome = await requestSubmitToken(request.config, turnstileToken)
    if (outcome.kind === "token") {
      return outcome.token
    }

    turnstileToken = await runTurnstileChallenge(outcome.siteKey)
  }

  throw new Error("Anti-bot verification could not be completed.")
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return undefined
  }

  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function getResponseErrorMessage(payload: unknown, status: number): string {
  if (!isRecord(payload)) {
    return `Capture submission failed with status ${status}.`
  }

  const message = resolveString(payload, ["message", "error"])
  return message ?? `Capture submission failed with status ${status}.`
}

function isChallengeRequired(payload: unknown): boolean {
  return isRecord(payload) && payload.code === CAPTURE_CHALLENGE_REQUIRED_CODE
}

function resolveChallenge(
  payload: unknown
): { provider?: string; siteKey?: string } | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const challenge = payload.challenge
  if (!isRecord(challenge)) {
    return undefined
  }

  return {
    provider:
      typeof challenge.provider === "string" ? challenge.provider : undefined,
    siteKey:
      typeof challenge.siteKey === "string" ? challenge.siteKey : undefined,
  }
}

function resolveString(
  payload: unknown,
  keys: readonly string[]
): string | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  for (const key of keys) {
    const candidate = payload[key]
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }

  const nestedReport = payload.report
  if (!isRecord(nestedReport)) {
    return undefined
  }

  for (const key of keys) {
    const candidate = nestedReport[key]
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }

  return undefined
}

function resolveShareUrl(
  host: string,
  shareUrl: string | undefined
): string | undefined {
  if (!shareUrl) {
    return undefined
  }

  if (ABSOLUTE_HTTP_URL_REGEX.test(shareUrl)) {
    return shareUrl
  }

  return `${host}${shareUrl.startsWith("/") ? shareUrl : `/${shareUrl}`}`
}

function resolveCaptureTokenPath(submitPath: string): string {
  const normalizedSubmitPath = submitPath.endsWith("/")
    ? submitPath.slice(0, -1)
    : submitPath

  if (normalizedSubmitPath.endsWith(BUG_REPORTS_PATH_SUFFIX)) {
    return `${normalizedSubmitPath.slice(0, -BUG_REPORTS_PATH_SUFFIX.length)}/capture-token`
  }

  return `${normalizedSubmitPath}/token`
}

function resolveUploadSessionPath(submitPath: string): string {
  const normalizedSubmitPath = submitPath.endsWith("/")
    ? submitPath.slice(0, -1)
    : submitPath

  if (normalizedSubmitPath.endsWith(BUG_REPORTS_PATH_SUFFIX)) {
    return `${normalizedSubmitPath.slice(0, -BUG_REPORTS_PATH_SUFFIX.length)}/bug-report-upload-session`
  }

  return `${normalizedSubmitPath}/upload-session`
}

function resolveFinalizePath(submitPath: string): string {
  const normalizedSubmitPath = submitPath.endsWith("/")
    ? submitPath.slice(0, -1)
    : submitPath

  if (normalizedSubmitPath.endsWith(BUG_REPORTS_PATH_SUFFIX)) {
    return `${normalizedSubmitPath.slice(0, -BUG_REPORTS_PATH_SUFFIX.length)}/bug-report-finalize`
  }

  return `${normalizedSubmitPath}/finalize`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseUploadSessionPayload(payload: unknown): {
  bugReportId: string
  captureUpload: DirectUploadTarget
  debuggerUpload?: DirectUploadTarget
  finalizeToken?: string
} {
  if (!isRecord(payload)) {
    throw new Error("Capture upload session response was invalid.")
  }

  const bugReportId =
    typeof payload.bugReportId === "string" ? payload.bugReportId : undefined
  if (!bugReportId) {
    throw new Error("Capture upload session response was missing bugReportId.")
  }

  return {
    bugReportId,
    captureUpload: parseUploadTarget(payload.captureUpload),
    debuggerUpload: payload.debuggerUpload
      ? parseUploadTarget(payload.debuggerUpload)
      : undefined,
    finalizeToken:
      typeof payload.finalizeToken === "string"
        ? payload.finalizeToken
        : undefined,
  }
}

function parseUploadTarget(value: unknown): DirectUploadTarget {
  if (
    !isRecord(value) ||
    value.method !== "PUT" ||
    typeof value.url !== "string"
  ) {
    throw new Error("Capture upload target response was invalid.")
  }

  const headers = isRecord(value.headers)
    ? Object.fromEntries(
        Object.entries(value.headers).filter(
          (entry): entry is [string, string] => {
            return typeof entry[1] === "string"
          }
        )
      )
    : {}

  return {
    url: value.url,
    method: "PUT",
    headers,
  }
}
