import * as capture from "./eager"
import type { CaptureGlobalApi } from "./types"

declare global {
  interface Window {
    Heard?: CaptureGlobalApi
    // Kept for older embeds and the local test bookmarklet.
    CrikketCapture?: CaptureGlobalApi
  }
}

if (typeof window !== "undefined") {
  window.Heard = capture
  window.CrikketCapture = capture
}
