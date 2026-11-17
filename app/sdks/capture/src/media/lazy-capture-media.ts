import type { CaptureRuntimeConfig, RecordingController } from "../types"

export async function captureScreenshot(): Promise<Blob> {
  const mediaModule = await import("./capture-screenshot")
  return mediaModule.captureScreenshot()
}

export async function captureSnapshotScreenshot(
  config: CaptureRuntimeConfig
): Promise<Blob> {
  const mediaModule = await import("./capture-snapshot")
  return mediaModule.captureSnapshotScreenshot(config)
}

export async function startDisplayRecording(): Promise<RecordingController> {
  const mediaModule = await import("./start-display-recording")
  return mediaModule.startDisplayRecording()
}
