import type {
  CaptureDebuggerSummary,
  CapturedMedia,
  CaptureSubmissionDraft,
} from "../types"

export interface CaptureReviewSubmitOptions {
  screenshotBlobOverride?: Blob
}

export interface CaptureUiState {
  view: "chooser" | "recording" | "review" | "success"
  overlayOpen: boolean
  recordingDockOpen: boolean
  busy: boolean
  // Heard: the review screen opens as soon as "Take screenshot" is clicked, before the picture
  // exists. "pending": on its way. "fallback": the server render failed and the browser's own
  // screen capture is being tried. "failed": no picture; the reviewer can try again.
  // "idle": nothing outstanding (the picture, if any, is in `media`).
  screenshotStatus: "idle" | "pending" | "fallback" | "failed"
  // Height / width of the picture that is on its way, so its placeholder has the right shape.
  screenshotAspectRatio: number | null
  errorMessage: string | null
  recordingStartedAt: number | null
  warnings: string[]
  summary: CaptureDebuggerSummary
  media: CapturedMedia | null
  shareUrl: string
  copyLabel: string
  reviewDraft: CaptureSubmissionDraft
  reviewFormKey: string
}

export interface CaptureUiHandlers {
  onLauncherClick: () => void
  // The pointer is over the tab, or it has keyboard focus: a click is likely.
  onLauncherIntent: () => void
  // The mouse button has gone down on the tab: a click is all but certain.
  onLauncherPress: () => void
  onClose: () => void
  onStartVideo: () => void
  onTakeScreenshot: () => void
  onStopRecording: () => void
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
  onCancel: () => void
  onRetry: () => void
  onCopyLink: () => void
  onOpenLink: () => void
}

export interface CaptureUiCallbacks {
  onLauncherIntent: () => void
  onLauncherPress: () => void
  // Clears the previous capture, if any, and shows the chooser.
  onOpenChooser: (source: "launcher" | "restart") => void
  onClose: () => void
  onStartVideo: () => Promise<{ startedAt: number }>
  onTakeScreenshot: () => Promise<void>
  onStopRecording: () => Promise<void>
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
  onReset: () => void
}

export interface CaptureUiStore {
  getSnapshot: () => CaptureUiState
  subscribe: (listener: () => void) => () => void
  patchState: (patch: Partial<CaptureUiState>) => void
  openChooser: () => void
  close: () => void
  showRecording: (startedAt: number) => void
  showReview: (input: {
    media: CapturedMedia
    warnings: string[]
    summary: CaptureDebuggerSummary
  }) => void
  showSuccess: (shareUrl?: string) => void
  showError: (message: string) => void
  setTitleIfEmpty: (value: string) => void
  // Opens the review screen with a placeholder where the screenshot will go.
  showScreenshotPending: (input: { aspectRatio: number | null }) => void
  showScreenshotFallback: () => void
  showScreenshotFailed: () => void
  // Puts the finished screenshot into the review screen that is already open.
  showScreenshotReady: (input: {
    media: CapturedMedia
    warnings: string[]
    summary: CaptureDebuggerSummary
  }) => void
  destroy: () => void
}

export interface MountedCaptureUi {
  setHidden: (hidden: boolean) => void
  store: CaptureUiStore
  unmount: () => void
}
