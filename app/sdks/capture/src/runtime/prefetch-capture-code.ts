// Heard: downloads the pieces of the widget that are loaded on demand (the review screen, the
// page copier, the recorder, the submit step) before they are needed, so that nothing waits on
// the network once the reviewer clicks. Called when a click on the tab looks likely.
//
// Only the npm (ESM) build is split into pieces; in the script-tag build these resolve at once.
import { prefetchCaptureMedia } from "../media/lazy-capture-media"
import { preloadReviewFormSection } from "../ui/capture-widget/review-form-loader"

let prefetched = false

export function prefetchCaptureCode(): void {
  if (prefetched) return
  prefetched = true
  try {
    prefetchCaptureMedia()
    preloadReviewFormSection()
    import("../debugger/debugger-collector").catch(() => undefined)
    import("./submit-captured-report").catch(() => undefined)
  } catch {
    // Not available here; each piece still loads when it is first used.
  }
}
