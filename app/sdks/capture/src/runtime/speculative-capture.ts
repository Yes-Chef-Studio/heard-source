// Heard: a screenshot started before the reviewer has asked for one.
//
// Clicking the "Report issue" tab almost always ends in "Take screenshot", and the server render
// is the slow part. So the page is copied and sent off as the tab is pressed; if the reviewer then
// picks "Take screenshot" and the page hasn't changed, that render is used and the wait is shorter
// by however long they took to choose. Anything else (video, closing, a page that moved on) throws
// it away and cancels the request.
import {
  type CopiedPage,
  type SnapshotCapture,
  startSnapshotCapture,
} from "../media/lazy-capture-media"
import type { CaptureRuntimeConfig } from "../types"
import { type PageChangeWatcher, watchPageChanges } from "./page-change-watcher"

// A page can change in ways nothing reports (video, canvas, CSS animation), so a copy isn't
// trusted for long.
export const SPECULATIVE_CAPTURE_MAX_AGE_MS = 20_000

// After the mouse button comes up on the tab, how long to wait for the click that should follow
// before deciding the press went nowhere (dragged off the tab, say).
const PRESS_WITHOUT_CLICK_MS = 400

// A press on the tab is nearly always followed by a click. Runs `check` shortly after the button
// is released, so a capture started on the press can be dropped if no click came.
export function afterPressReleased(check: () => void): void {
  const onRelease = () => {
    window.removeEventListener("pointerup", onRelease, true)
    window.removeEventListener("pointercancel", onRelease, true)
    setTimeout(check, PRESS_WITHOUT_CLICK_MS)
  }
  window.addEventListener("pointerup", onRelease, true)
  window.addEventListener("pointercancel", onRelease, true)
}

export interface SpeculativeCaptureDeps {
  start: (
    config: CaptureRuntimeConfig,
    options?: { afterPaint?: boolean }
  ) => SnapshotCapture
  watch: (page: CopiedPage) => PageChangeWatcher
  now: () => number
}

const defaultDeps: SpeculativeCaptureDeps = {
  start: startSnapshotCapture,
  watch: watchPageChanges,
  now: () => Date.now(),
}

export class SpeculativeCapture {
  private readonly capture: SnapshotCapture
  private readonly deps: SpeculativeCaptureDeps
  private watcher: PageChangeWatcher | null = null
  private copiedAt: number | null = null
  private expiry: ReturnType<typeof setTimeout> | null = null
  private failed = false
  private unwatched = false
  private finished = false

  constructor(
    config: CaptureRuntimeConfig,
    options?: { afterPaint?: boolean },
    deps: SpeculativeCaptureDeps = defaultDeps
  ) {
    this.deps = deps
    this.capture = deps.start(config, options)
    this.capture.pageCopied.then((page) => {
      if (!page || this.finished) return
      this.copiedAt = deps.now()
      try {
        this.watcher = deps.watch(page)
        // Past its shelf life the copy won't be used whatever the page does; stop listening.
        this.expiry = setTimeout(() => {
          this.watcher?.stop()
        }, SPECULATIVE_CAPTURE_MAX_AGE_MS)
      } catch {
        // No way to tell whether the page changes, so don't vouch for this copy.
        this.unwatched = true
      }
    })
    this.capture.result.catch(() => {
      this.failed = true
    })
  }

  // True while this capture can still stand in for one taken right now.
  isUsable(): boolean {
    if (this.finished || this.failed || this.unwatched) return false
    // Not copied yet: it will be copied in a moment, which is as current as it gets.
    if (this.copiedAt === null) return true
    if (this.deps.now() - this.copiedAt > SPECULATIVE_CAPTURE_MAX_AGE_MS) {
      return false
    }
    return !this.watcher?.hasChanged()
  }

  // The render was tried and didn't work. Trying the same thing again right away would mostly
  // just make the reviewer wait twice before the fallback.
  hasFailed(): boolean {
    return this.failed && !this.finished
  }

  // Hands the capture over to the caller, who now owns its outcome.
  take(): SnapshotCapture {
    this.finish()
    return this.capture
  }

  discard(): void {
    if (this.finished) return
    this.finish()
    this.capture.abort()
  }

  private finish(): void {
    this.finished = true
    if (this.expiry !== null) clearTimeout(this.expiry)
    this.expiry = null
    this.watcher?.stop()
    this.watcher = null
  }
}
