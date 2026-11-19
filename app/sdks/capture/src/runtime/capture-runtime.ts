import { LazyDebuggerCollector } from "../debugger/lazy-debugger-collector"
import {
  captureScreenshot,
  type SnapshotCapture,
  startDisplayRecording,
  startSnapshotCapture,
} from "../media/lazy-capture-media"
import type {
  CapturedMedia,
  CaptureInitOptions,
  CaptureRuntimeConfig,
  CaptureRuntimeController,
  CaptureSubmissionDraft,
  CaptureSubmitTransport,
  RecordingController,
  ReviewSnapshot,
} from "../types"
import { mountCaptureUi } from "../ui/mount-capture-ui"
import type { CaptureReviewSubmitOptions, MountedCaptureUi } from "../ui/types"
import {
  normalizeHost,
  normalizeKey,
  normalizeSubmitPath,
  normalizeZIndex,
} from "../utils"
import { prefetchCaptureCode } from "./prefetch-capture-code"
import { getSiteColor, isSiteAllowed, warmRenderer } from "./site-check"
import { afterPressReleased, SpeculativeCapture } from "./speculative-capture"

const NO_SCREENSHOT_MESSAGE =
  "The screenshot couldn't be taken, so the report wasn't sent. Try the screenshot again."

export class CaptureSdkRuntime implements CaptureRuntimeController {
  private runtimeConfig: CaptureRuntimeConfig | null = null
  private submitTransport: CaptureSubmitTransport | undefined
  private mountedTarget: HTMLElement | null = null
  private mountedUi: MountedCaptureUi | null = null
  private readonly debuggerCollector = new LazyDebuggerCollector()
  private activeRecording: RecordingController | null = null
  private currentMedia: CapturedMedia | null = null
  private currentReview: ReviewSnapshot | null = null
  // A screenshot started ahead of time, when the tab was pressed (see speculative-capture.ts).
  private speculation: SpeculativeCapture | null = null
  // The screenshot the review screen is waiting for, and the request behind it.
  private pendingScreenshot: Promise<Blob | null> | null = null
  private pendingCapture: SnapshotCapture | null = null
  // Bumped whenever the capture in progress stops being wanted (reset, close, a new capture).
  private captureGeneration = 0
  // The last screenshot attempt ended with no picture (and nothing has replaced it since).
  private screenshotFailed = false

  init(options: CaptureInitOptions): CaptureRuntimeController {
    const config: CaptureRuntimeConfig = {
      key: normalizeKey(options.key),
      host: normalizeHost(options.host),
      submitPath: normalizeSubmitPath(options.submitPath),
      zIndex: normalizeZIndex(options.zIndex),
    }

    this.runtimeConfig = config
    this.submitTransport = options.submitTransport

    if (options.autoMount ?? true) {
      this.whenSiteAllowed(config, () => this.mount(options.mountTarget))
    }

    return this
  }

  // Run `action` only if this site is on the key's allowed list, and only if init() hasn't been
  // called again (or destroy()) while the check was in flight.
  private whenSiteAllowed(
    config: CaptureRuntimeConfig,
    action: () => void
  ): void {
    isSiteAllowed(config).then((allowed) => {
      if (!allowed) {
        console.info("[heard] Feedback widget is not enabled for this site.")
        return
      }
      if (this.runtimeConfig === config) action()
    })
  }

  isInitialized(): boolean {
    return this.runtimeConfig !== null
  }

  getConfig(): CaptureRuntimeConfig | null {
    return this.runtimeConfig
  }

  mount(target?: HTMLElement): void {
    const config = this.getRuntimeConfig()
    this.ensureBrowserContext()

    if (this.mountedTarget) {
      return
    }

    const mountTarget = target ?? document.body
    this.mountedUi = mountCaptureUi(
      mountTarget,
      config.zIndex,
      {
        onLauncherIntent: () => {
          this.prepareForCapture()
        },
        onLauncherPress: () => {
          this.handleLauncherPress()
        },
        onOpenChooser: (source) => {
          this.openChooser(source === "launcher")
        },
        onClose: () => {
          this.close()
        },
        onStartVideo: () => {
          return this.startRecording()
        },
        onTakeScreenshot: async () => {
          await this.takeScreenshot()
        },
        onStopRecording: async () => {
          const blob = await this.stopRecording()
          if (!blob) {
            throw new Error("Recording capture failed.")
          }
        },
        onSubmit: (draft, options) => {
          return this.submit(draft, options).then(() => undefined)
        },
        onReset: () => {
          this.reset()
        },
      },
      getSiteColor(config)
    )
    this.mountedTarget = mountTarget
  }

  unmount(): void {
    this.cancelScreenshot()
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.mountedUi?.unmount()
    this.mountedUi = null
    this.debuggerCollector.dispose()
    this.mountedTarget = null
  }

  open(): void {
    const config = this.getRuntimeConfig()
    this.prepareForCapture()
    this.whenSiteAllowed(config, () => {
      if (!this.mountedTarget) {
        this.mount()
      }

      this.beginSpeculativeCapture(true)
      this.mountedUi?.store.openChooser()
    })
  }

  close(): void {
    this.cancelScreenshot()
    this.setUiHidden(false)
    this.mountedUi?.store.close()
  }

  // Heard: a click on the tab is likely (hover, focus) or has happened. Wake the renderer and
  // fetch whatever code the next steps need, so neither is waited for after the click.
  prepareForCapture(): void {
    if (!this.runtimeConfig) return
    warmRenderer(this.runtimeConfig)
    prefetchCaptureCode()
  }

  // Heard: copy the page and start rendering it now, on the bet that "Take screenshot" comes
  // next. `afterPaint` lets whatever the widget is about to show get on screen before the copy.
  beginSpeculativeCapture(afterPaint = false): void {
    const config = this.runtimeConfig
    if (!config || typeof document === "undefined") return
    if (this.activeRecording || this.pendingScreenshot) return
    if (this.speculation?.isUsable()) return

    this.discardSpeculation()
    try {
      this.speculation = new SpeculativeCapture(config, { afterPaint })
    } catch {
      // Purely an optimisation: the screenshot is taken the normal way when asked for.
      this.speculation = null
    }
  }

  private discardSpeculation(): void {
    this.speculation?.discard()
    this.speculation = null
  }

  // Takes over a capture the lazy launcher started before this runtime existed.
  adoptSpeculativeCapture(speculation: SpeculativeCapture): void {
    this.discardSpeculation()
    this.speculation = speculation
  }

  private handleLauncherPress(): void {
    this.prepareForCapture()
    this.beginSpeculativeCapture()
    const pressed = this.speculation
    if (!pressed) return

    // If no click follows the press (which would open the chooser), drop the capture rather
    // than leave a render running for nobody.
    afterPressReleased(() => {
      const chooserOpen = this.mountedUi?.store.getSnapshot()?.overlayOpen
      if (this.speculation === pressed && !chooserOpen) {
        this.discardSpeculation()
      }
    })
  }

  // The tab was clicked, or the reviewer asked to start over (Retake, Report another).
  private openChooser(keepSpeculation: boolean): void {
    const speculation = keepSpeculation ? this.speculation : null
    this.speculation = null
    this.reset()
    this.speculation = speculation
    this.prepareForCapture()
    this.beginSpeculativeCapture(true)
    this.mountedUi?.store.openChooser()
  }

  destroy(): void {
    this.reset()
    this.unmount()
    this.runtimeConfig = null
    this.submitTransport = undefined
  }

  async startRecording(): Promise<{ startedAt: number }> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()
    this.cancelScreenshot()
    this.abortActiveRecording()
    await this.debuggerCollector.startRecordingSession()

    try {
      await this.hideUiForCapture()
      const controller = await startDisplayRecording()
      // Heard: bring the widget back once sharing has started, so the "Stop recording" bar is
      // visible on the page (the browser's own "Stop sharing" button is easy to miss).
      this.setUiHidden(false)
      this.debuggerCollector.markRecordingStarted(controller.startedAt)
      this.activeRecording = controller
      controller.finished
        .then(async (result) => {
          if (this.activeRecording !== controller) {
            return
          }

          this.activeRecording = null
          await this.finalizeCapturedMedia({
            blob: result.blob,
            captureType: "video",
            durationMs: result.durationMs,
          })
        })
        .catch(() => undefined)

      return {
        startedAt: controller.startedAt,
      }
    } catch (error) {
      this.setUiHidden(false)
      this.debuggerCollector.clearSession()
      throw error
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.activeRecording) {
      return null
    }

    const recording = this.activeRecording
    this.activeRecording = null

    const result = await recording.stop()
    await this.finalizeCapturedMedia({
      blob: result.blob,
      captureType: "video",
      durationMs: result.durationMs,
    })

    return result.blob
  }

  // Heard: the review screen opens straight away with a placeholder; the picture is dropped in
  // when it arrives. The page is rendered from a DOM snapshot server-side (no permission prompt);
  // the browser's screen capture is the fallback if the renderer is unavailable.
  takeScreenshot(): Promise<Blob | null> {
    const config = this.getRuntimeConfig()
    this.ensureBrowserContext()
    this.cancelPendingScreenshot()
    const generation = this.captureGeneration

    // Use the render started when the tab was pressed if the page still looks the same (or if
    // it has already failed, which sends this straight to the fallback); otherwise copy the page
    // now, after the review screen has had a chance to paint.
    const speculation = this.speculation
    this.speculation = null
    let capture: SnapshotCapture | null = null
    if (speculation?.isUsable() || speculation?.hasFailed()) {
      capture = speculation.take()
    } else {
      speculation?.discard()
      try {
        capture = startSnapshotCapture(config, { afterPaint: true })
      } catch (error) {
        console.warn("[heard] snapshot screenshot could not start", error)
      }
    }

    this.clearMedia()
    this.currentReview = null
    this.pendingCapture = capture
    this.mountedUi?.store.showScreenshotPending({
      aspectRatio:
        window.innerWidth > 0 ? window.innerHeight / window.innerWidth : null,
    })

    const pending = this.finishScreenshot(capture, generation).finally(() => {
      if (this.pendingScreenshot === pending) {
        this.pendingScreenshot = null
        this.pendingCapture = null
      }
    })
    this.pendingScreenshot = pending
    return pending
  }

  private async finishScreenshot(
    capture: SnapshotCapture | null,
    generation: number
  ): Promise<Blob | null> {
    const isCurrent = () => generation === this.captureGeneration

    // What led up to the screenshot. Closed off right away so that typing in the review form
    // while the picture renders doesn't end up in the report's activity log.
    await this.debuggerCollector.startScreenshotSession()
    if (!isCurrent()) return null
    const review = this.debuggerCollector.finalizeSession()

    let blob: Blob
    try {
      if (!capture) throw new Error("Snapshot capture is unavailable.")
      blob = await capture.result
    } catch (snapshotError) {
      if (!isCurrent()) return null
      console.warn(
        "[heard] snapshot screenshot failed, falling back to screen capture",
        snapshotError
      )
      this.mountedUi?.store.showScreenshotFallback()
      try {
        await this.hideUiForCapture()
        blob = await captureScreenshot()
      } catch (error) {
        if (isCurrent()) {
          this.setUiHidden(false)
          this.debuggerCollector.clearSession()
          this.screenshotFailed = true
          this.mountedUi?.store.showScreenshotFailed()
        }
        throw error
      }
    }

    if (!isCurrent()) return null
    this.setUiHidden(false)
    const media = this.setMedia({
      blob,
      captureType: "screenshot",
      durationMs: null,
    })
    this.currentReview = review
    this.mountedUi?.store.showScreenshotReady({
      media,
      warnings: review.warnings,
      summary: review.debuggerSummary,
    })
    return blob
  }

  // Stops waiting for the screenshot in progress, and for the one started ahead of time.
  private cancelScreenshot(): void {
    this.discardSpeculation()
    this.cancelPendingScreenshot()
  }

  private cancelPendingScreenshot(): void {
    this.captureGeneration += 1
    this.screenshotFailed = false
    this.pendingCapture?.abort()
    this.pendingCapture = null
    this.pendingScreenshot = null
  }

  async submit(
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) {
    const config = this.getRuntimeConfig()
    // Heard: "Send report" can be clicked while the screenshot is still rendering; wait for it.
    const pendingScreenshot = this.pendingScreenshot
    if (pendingScreenshot) {
      const blob = await pendingScreenshot.catch(() => null)
      if (!blob) throw new Error(NO_SCREENSHOT_MESSAGE)
    }
    if (this.screenshotFailed) throw new Error(NO_SCREENSHOT_MESSAGE)
    if (!(this.currentMedia && this.currentReview)) {
      throw new Error(
        "No capture is ready to submit. Start a recording or take a screenshot first."
      )
    }

    const { submitCapturedReport } = await import("./submit-captured-report")
    const media =
      this.currentMedia.captureType === "screenshot" &&
      options?.screenshotBlobOverride
        ? {
            ...this.currentMedia,
            blob: options.screenshotBlobOverride,
          }
        : this.currentMedia
    const result = await submitCapturedReport({
      config,
      draft,
      media,
      review: this.currentReview,
      submitTransport: this.submitTransport,
    })

    if (this.mountedUi) {
      this.mountedUi.store.showSuccess(result.shareUrl)
    }

    return result
  }

  reset(): void {
    this.cancelScreenshot()
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.clearMedia()
    this.currentReview = null
    this.debuggerCollector.clearSession()
  }

  private setMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): CapturedMedia {
    this.clearMedia()

    this.currentMedia = {
      blob: input.blob,
      captureType: input.captureType,
      durationMs: input.durationMs,
      objectUrl: URL.createObjectURL(input.blob),
    }

    return this.currentMedia
  }

  private clearMedia(): void {
    if (!this.currentMedia) {
      return
    }

    URL.revokeObjectURL(this.currentMedia.objectUrl)
    this.currentMedia = null
  }

  private finalizeCapturedMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): void {
    this.setUiHidden(false)

    const review = this.debuggerCollector.finalizeSession()
    const media = this.setMedia(input)

    this.currentReview = review
    if (!this.mountedUi) {
      return
    }

    this.mountedUi.store.showReview({
      media,
      warnings: review.warnings,
      summary: review.debuggerSummary,
    })
  }

  private abortActiveRecording(): void {
    if (!this.activeRecording) {
      return
    }

    this.activeRecording.abort()
    this.activeRecording = null
  }

  private async hideUiForCapture(): Promise<void> {
    this.setUiHidden(true)
    await waitForNextPaint()
  }

  private setUiHidden(hidden: boolean): void {
    this.mountedUi?.setHidden(hidden)
  }

  private getRuntimeConfig(): CaptureRuntimeConfig {
    if (!this.runtimeConfig) {
      throw new Error(
        "Capture SDK is not initialized. Call capture.init({ key }) first."
      )
    }

    return this.runtimeConfig
  }

  private ensureBrowserContext(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Capture SDK can only run in a browser environment.")
    }
  }
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}
