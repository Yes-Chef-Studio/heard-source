import { Suspense } from "react"
import type { CaptureUiHandlers, CaptureUiState } from "../types"
import { getReviewFormSection } from "./review-form-loader"
import { ChooserSection } from "./sections/chooser-section"
import { SuccessSection } from "./sections/success-section"

export function CaptureWidgetView(props: {
  handlers: CaptureUiHandlers
  isBusy: boolean
  isSubmitPending: boolean
  state: CaptureUiState
}): React.JSX.Element | null {
  if (props.state.view === "chooser") {
    return (
      <ChooserSection
        busy={props.isBusy}
        onStartVideo={props.handlers.onStartVideo}
        onTakeScreenshot={props.handlers.onTakeScreenshot}
      />
    )
  }

  if (props.state.view === "review") {
    // Already loaded by the time it is needed (see review-form-loader.ts); the Suspense fallback
    // is only for the rare case that it isn't.
    const ReviewFormSection = getReviewFormSection()
    return (
      <Suspense fallback={<ReviewSectionFallback />}>
        <ReviewFormSection
          formKey={props.state.reviewFormKey}
          isSubmitting={props.isSubmitPending}
          onCancel={props.handlers.onCancel}
          onRetakeScreenshot={props.handlers.onTakeScreenshot}
          onSubmit={props.handlers.onSubmit}
          state={props.state}
        />
      </Suspense>
    )
  }

  if (props.state.view === "success") {
    return <SuccessSection handlers={props.handlers} state={props.state} />
  }

  return null
}

function ReviewSectionFallback(): React.JSX.Element {
  return (
    <section className="grid gap-2 px-5 py-8 text-muted-foreground text-sm">
      <p>Preparing review form...</p>
    </section>
  )
}
