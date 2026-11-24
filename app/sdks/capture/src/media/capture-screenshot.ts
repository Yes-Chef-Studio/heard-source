import { fitWithinLongEdge, SCREEN_CAPTURE_FORMAT } from "./capture-size"
import {
  assertBrowserTabSurface,
  canvasToBlob,
  prepareCaptureVideo,
  releaseCaptureVideo,
  requestDisplayStream,
} from "./display-capture"

export async function captureScreenshot(): Promise<Blob> {
  const stream = await requestDisplayStream(false)
  assertBrowserTabSurface(stream)
  const video = document.createElement("video")

  try {
    const track = stream.getVideoTracks()[0]
    if (!track) {
      throw new Error("No video track available for screenshot capture.")
    }

    await prepareCaptureVideo(video, stream)

    const width = video.videoWidth
    const height = video.videoHeight
    if (!(width > 0 && height > 0)) {
      throw new Error("Captured screen dimensions were invalid.")
    }

    const size = fitWithinLongEdge(width, height)
    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Failed to initialize screenshot canvas.")
    }

    context.imageSmoothingQuality = "high"
    context.drawImage(video, 0, 0, size.width, size.height)
    return canvasToBlob(
      canvas,
      SCREEN_CAPTURE_FORMAT.type,
      SCREEN_CAPTURE_FORMAT.quality
    )
  } finally {
    releaseCaptureVideo(video)
    for (const currentTrack of stream.getTracks()) {
      currentTrack.stop()
    }
  }
}
