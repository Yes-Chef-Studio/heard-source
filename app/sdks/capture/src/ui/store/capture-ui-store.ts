import { BUG_REPORT_VISIBILITY_OPTIONS } from "@crikket/shared/constants/bug-report"
import { DEFAULT_PRIORITY as SHARED_DEFAULT_PRIORITY } from "@crikket/shared/constants/priorities"
import type {
  CaptureDebuggerSummary,
  CapturedMedia,
  CapturePriority,
} from "../../types"
import { loadReporterIdentity } from "../reporter-identity"
import type { CaptureUiState, CaptureUiStore } from "../types"

const DEFAULT_PRIORITY: CapturePriority = SHARED_DEFAULT_PRIORITY
const DEFAULT_SUMMARY: CaptureDebuggerSummary = {
  actions: 0,
  logs: 0,
  networkRequests: 0,
}

export function createCaptureUiStore(): CaptureUiStore {
  let state = createInitialState()
  const listeners = new Set<() => void>()
  let pendingReviewCount = 0

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const patchState = (patch: Partial<CaptureUiState>) => {
    state = {
      ...state,
      ...patch,
    }
    notify()
  }

  const showReview = (input: {
    media: CapturedMedia
    warnings: string[]
    summary: CaptureDebuggerSummary
  }) => {
    const reporter = loadReporterIdentity()
    patchState({
      overlayOpen: true,
      recordingDockOpen: false,
      recordingStartedAt: null,
      view: "review",
      errorMessage: null,
      busy: false,
      screenshotStatus: "idle",
      screenshotAspectRatio: null,
      media: input.media,
      warnings: [...input.warnings],
      summary: input.summary,
      shareUrl: "",
      copyLabel: "Copy Link",
      reviewDraft: {
        title: "",
        description: "",
        priority: DEFAULT_PRIORITY,
        visibility: BUG_REPORT_VISIBILITY_OPTIONS.private,
        reporterName: reporter.name,
        reporterEmail: reporter.email,
      },
      reviewFormKey: input.media.objectUrl,
    })
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    patchState,
    openChooser: () => {
      patchState({
        overlayOpen: true,
        recordingDockOpen: false,
        recordingStartedAt: null,
        view: "chooser",
        errorMessage: null,
        busy: false,
        screenshotStatus: "idle",
      })
    },
    close: () => {
      patchState({
        overlayOpen: false,
        recordingDockOpen: false,
        recordingStartedAt: null,
        busy: false,
        screenshotStatus: "idle",
        errorMessage: null,
      })
    },
    showRecording: (startedAt) => {
      patchState({
        overlayOpen: false,
        recordingDockOpen: true,
        recordingStartedAt: startedAt,
        view: "recording",
        errorMessage: null,
        busy: false,
        screenshotStatus: "idle",
      })
    },
    showReview,
    showSuccess: (shareUrl) => {
      patchState({
        overlayOpen: true,
        recordingDockOpen: false,
        recordingStartedAt: null,
        view: "success",
        errorMessage: null,
        busy: false,
        screenshotStatus: "idle",
        shareUrl: shareUrl ?? "",
        copyLabel: "Copy Link",
      })
    },
    showError: (message) => {
      patchState({
        errorMessage: message,
      })
    },
    showScreenshotPending: (input) => {
      const retrying =
        state.overlayOpen &&
        state.view === "review" &&
        state.media === null &&
        state.screenshotStatus !== "idle"
      if (retrying) {
        // Same review screen, so whatever has been typed into the form stays.
        patchState({
          errorMessage: null,
          screenshotStatus: "pending",
          screenshotAspectRatio: input.aspectRatio,
        })
        return
      }

      const reporter = loadReporterIdentity()
      pendingReviewCount += 1
      patchState({
        overlayOpen: true,
        recordingDockOpen: false,
        recordingStartedAt: null,
        view: "review",
        errorMessage: null,
        busy: false,
        screenshotStatus: "pending",
        screenshotAspectRatio: input.aspectRatio,
        media: null,
        warnings: [],
        summary: { ...DEFAULT_SUMMARY },
        shareUrl: "",
        copyLabel: "Copy Link",
        reviewDraft: {
          title: "",
          description: "",
          priority: DEFAULT_PRIORITY,
          visibility: BUG_REPORT_VISIBILITY_OPTIONS.private,
          reporterName: reporter.name,
          reporterEmail: reporter.email,
        },
        reviewFormKey: `screenshot-${pendingReviewCount}`,
      })
    },
    showScreenshotFallback: () => {
      patchState({ screenshotStatus: "fallback" })
    },
    showScreenshotFailed: () => {
      patchState({ screenshotStatus: "failed" })
    },
    showScreenshotReady: (input) => {
      const waiting =
        state.view === "review" &&
        state.media === null &&
        state.screenshotStatus !== "idle"
      if (!waiting) {
        showReview(input)
        return
      }

      // The form (and its key) is left alone: the reviewer may already be typing in it.
      patchState({
        overlayOpen: true,
        screenshotStatus: "idle",
        media: input.media,
        warnings: [...input.warnings],
        summary: input.summary,
      })
    },
    setTitleIfEmpty: (value) => {
      if (state.reviewDraft.title.trim().length > 0) {
        return
      }

      patchState({
        reviewDraft: {
          ...state.reviewDraft,
          title: value.slice(0, 200),
        },
      })
    },
    destroy: () => {
      state = createInitialState()
      listeners.clear()
    },
  }
}

function createInitialState(): CaptureUiState {
  return {
    view: "chooser",
    overlayOpen: false,
    recordingDockOpen: false,
    busy: false,
    screenshotStatus: "idle",
    screenshotAspectRatio: null,
    errorMessage: null,
    recordingStartedAt: null,
    warnings: [],
    summary: { ...DEFAULT_SUMMARY },
    media: null,
    shareUrl: "",
    copyLabel: "Copy Link",
    reviewDraft: {
      title: "",
      description: "",
      priority: DEFAULT_PRIORITY,
      visibility: BUG_REPORT_VISIBILITY_OPTIONS.private,
      reporterName: "",
      reporterEmail: "",
    },
    reviewFormKey: "",
  }
}
