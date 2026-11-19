import type { CaptureRuntimeConfig, RecordingController } from "../types"
import type { CopiedPage, SnapshotCaptureOptions } from "./capture-snapshot"

export type { CopiedPage } from "./capture-snapshot"

export async function captureScreenshot(): Promise<Blob> {
  const mediaModule = await import("./capture-screenshot")
  return mediaModule.captureScreenshot()
}

export async function captureSnapshotScreenshot(
  config: CaptureRuntimeConfig,
  options?: SnapshotCaptureOptions
): Promise<Blob> {
  const mediaModule = await import("./capture-snapshot")
  return mediaModule.captureSnapshotScreenshot(config, options)
}

// A snapshot screenshot that is under way: the page copy, then the server render.
export interface SnapshotCapture {
  result: Promise<Blob>
  // Settles with the page as it was when copied, or null if the copy never happened.
  pageCopied: Promise<CopiedPage | null>
  abort: () => void
}

export function startSnapshotCapture(
  config: CaptureRuntimeConfig,
  options?: { afterPaint?: boolean }
): SnapshotCapture {
  const controller = new AbortController()
  let reportCopied: (page: CopiedPage | null) => void = () => undefined
  const pageCopied = new Promise<CopiedPage | null>((resolve) => {
    reportCopied = resolve
  })
  const result = captureSnapshotScreenshot(config, {
    afterPaint: options?.afterPaint,
    onPageCopied: reportCopied,
    signal: controller.signal,
  }).finally(() => {
    reportCopied(null)
  })
  // Whoever takes the capture over handles a failure; until then it must not surface as an
  // unhandled rejection (a capture made ahead of time is often thrown away).
  result.catch(() => undefined)

  return {
    result,
    pageCopied,
    abort: () => {
      controller.abort()
    },
  }
}

export async function startDisplayRecording(): Promise<RecordingController> {
  const mediaModule = await import("./start-display-recording")
  return mediaModule.startDisplayRecording()
}

// Fetches the code the capture and review steps need, so nothing is left to download once the
// reviewer has clicked. (The script-tag build has it all in one file already.)
export function prefetchCaptureMedia(): void {
  import("./capture-snapshot").catch(() => undefined)
  import("./capture-screenshot").catch(() => undefined)
  import("./start-display-recording").catch(() => undefined)
}
