import type { CaptureUiHandlers, CaptureUiState } from "../types"
import { CaptureWidgetView } from "./capture-widget-view"
import { CaptureLauncherButton } from "./components/capture-launcher-button"
import { CloseIcon } from "./components/icons"
import { Card, CardContent } from "./components/primitives/card"
import { RecordingDock } from "./sections/recording-dock"

export function CaptureWidgetShell(props: {
  zIndex: number
  state: CaptureUiState
  handlers: CaptureUiHandlers
  isSubmitPending: boolean
  recordingTime: string
}): React.JSX.Element {
  const isBusy = props.state.busy || props.isSubmitPending
  const isReviewView = props.state.view === "review"

  return (
    <div className="heard-capture-root">
      {props.state.recordingDockOpen ? null : (
        <CaptureLauncherButton
          disabled={isBusy}
          onClick={props.handlers.onLauncherClick}
          onIntent={props.handlers.onLauncherIntent}
          onPress={props.handlers.onLauncherPress}
          zIndex={props.zIndex}
        />
      )}

      {props.state.overlayOpen ? (
        <div
          className="fixed inset-0 z-[var(--capture-overlay-z-index)] grid overflow-y-auto bg-black/60 p-4"
          style={{
            ["--capture-overlay-z-index" as string]: String(props.zIndex + 1),
          }}
        >
          <Card
            aria-label="Report an issue"
            aria-modal="true"
            className={
              isReviewView
                ? "relative m-auto flex h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden border-border/80 bg-card text-card-foreground shadow-2xl"
                : "relative m-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-[480px] flex-col overflow-hidden border-border/80 bg-card text-card-foreground shadow-2xl"
            }
            role="dialog"
          >
            <button
              aria-label="Close"
              className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
              disabled={isBusy}
              onClick={props.handlers.onClose}
              type="button"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            {props.state.errorMessage ? (
              <p
                className="mx-5 mt-5 rounded-md border bg-muted px-3 py-2 text-sm"
                role="alert"
              >
                {props.state.errorMessage}
              </p>
            ) : null}

            <CardContent
              className={
                isReviewView
                  ? "min-h-0 flex-1 overflow-hidden px-0 pb-0"
                  : "min-h-0 overflow-y-auto px-0 pb-0"
              }
            >
              <CaptureWidgetView
                handlers={props.handlers}
                isBusy={isBusy}
                isSubmitPending={props.isSubmitPending}
                state={props.state}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {props.state.recordingDockOpen ? (
        <RecordingDock
          busy={isBusy}
          onStopRecording={props.handlers.onStopRecording}
          recordingTime={props.recordingTime}
          zIndex={props.zIndex}
        />
      ) : null}
    </div>
  )
}
