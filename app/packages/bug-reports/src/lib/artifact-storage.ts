import { z } from "zod"

const bugReportArtifactKindValues = [
  "capture",
  "thumbnail",
  "debugger",
] as const

export const bugReportArtifactKindSchema = z.enum(bugReportArtifactKindValues)

export type BugReportArtifactKind = z.infer<typeof bugReportArtifactKindSchema>

export function buildCaptureArtifactKey(input: {
  organizationId: string
  bugReportId: string
  captureType: "video" | "screenshot"
  // Heard: screenshots arrive as JPEG (the snapshot renderer's format), PNG or WebP; the key's
  // extension follows the type so a downloaded file opens correctly.
  contentType?: string
}): string {
  return (
    buildBugReportArtifactBasePath(input) +
    getCaptureFilename(input.captureType, input.contentType)
  )
}

export function buildThumbnailArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `${buildBugReportArtifactBasePath(input)}thumbnail.png`
}

export function buildDebuggerArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/debugger/payload.json.gz`
}

function buildBugReportArtifactBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/capture/`
}

function buildBugReportBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `organizations/${input.organizationId}/bug-reports/${input.bugReportId}`
}

const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function getCaptureFilename(
  captureType: "video" | "screenshot",
  contentType?: string
): string {
  if (captureType === "video") {
    return "video.webm"
  }

  const extension = SCREENSHOT_EXTENSIONS[contentType ?? ""] ?? "png"
  return `screenshot.${extension}`
}
