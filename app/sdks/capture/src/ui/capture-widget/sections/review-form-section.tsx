import { useEffect, useRef, useState } from "react"
import type { CaptureSubmissionDraft } from "../../../types"
import type { CaptureReviewSubmitOptions, CaptureUiState } from "../../types"
import { MediaPreview } from "../components/media-preview"
import { Button } from "../components/primitives/button"
import { cn } from "../components/primitives/cn"
import { Field, FieldError } from "../components/primitives/field"
import { FIELD_CLASSES } from "../components/primitives/field-classes"
import { Input } from "../components/primitives/input"
import { Label } from "../components/primitives/label"
import { Textarea } from "../components/primitives/textarea"
import { ScreenshotAnnotationEditor } from "../components/screenshot-annotation-editor"
import { useReviewForm } from "../hooks/use-review-form"
import { capturePriorityOptions } from "../utils/review-form-schema"
import {
  createAnnotatedScreenshotBlob,
  type ScreenshotAnnotation,
} from "../utils/screenshot-annotations"

interface ReviewFormSectionProps {
  formKey: string
  isSubmitting: boolean
  state: CaptureUiState
  onCancel: () => void
  // Tries the screenshot again after it failed, keeping what's in the form.
  onRetakeScreenshot: () => void
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
}

// The left-hand side: the screenshot to mark up (or the placeholder while it is on its way), or
// the recorded video.
function ReviewMedia(props: {
  annotations: ScreenshotAnnotation[]
  disabled: boolean
  onAnnotationsChange: (annotations: ScreenshotAnnotation[]) => void
  onRetakeScreenshot: () => void
  state: CaptureUiState
}): React.JSX.Element {
  const { media, screenshotStatus } = props.state
  if (media?.captureType === "screenshot" || screenshotStatus !== "idle") {
    return (
      <ScreenshotAnnotationEditor
        annotations={props.annotations}
        disabled={props.disabled}
        onChange={props.onAnnotationsChange}
        onRetry={props.onRetakeScreenshot}
        placeholderAspectRatio={props.state.screenshotAspectRatio}
        src={media?.objectUrl ?? null}
        status={media ? "idle" : screenshotStatus}
      />
    )
  }

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black">
        <MediaPreview media={media} />
      </div>
    </div>
  )
}

export function ReviewFormSection({
  formKey,
  isSubmitting,
  state,
  onCancel,
  onRetakeScreenshot,
  onSubmit,
}: ReviewFormSectionProps): React.JSX.Element {
  const [annotations, setAnnotations] = useState<ScreenshotAnnotation[]>([])
  const previousMediaObjectUrlRef = useRef(state.media?.objectUrl)

  useEffect(() => {
    if (previousMediaObjectUrlRef.current === state.media?.objectUrl) {
      return
    }

    previousMediaObjectUrlRef.current = state.media?.objectUrl
    setAnnotations([])
  }, [state.media?.objectUrl])

  // Name and email are remembered after the first report; show them as one line until changed.
  const [editingReporter, setEditingReporter] = useState(
    () =>
      !(
        state.reviewDraft.reporterName?.trim() &&
        state.reviewDraft.reporterEmail?.trim()
      )
  )

  const form = useReviewForm({
    initialDraft: state.reviewDraft,
    onSubmit: async (draft) => {
      let submitOptions: CaptureReviewSubmitOptions | undefined

      if (state.media?.captureType === "screenshot" && annotations.length > 0) {
        const screenshotBlobOverride = await createAnnotatedScreenshotBlob({
          annotations,
          imageUrl: state.media.objectUrl,
          sourceType: state.media.blob.type,
        })

        submitOptions = screenshotBlobOverride
          ? { screenshotBlobOverride }
          : undefined
      }

      onSubmit(draft, submitOptions)
    },
  })

  const showReporterFields =
    editingReporter ||
    Boolean(form.visibleErrors.reporterName || form.visibleErrors.reporterEmail)

  return (
    <section
      className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(0,1.5fr)_360px]"
      key={formKey}
    >
      <div className="flex min-h-[320px] min-w-0 flex-col border-b bg-muted/20 lg:border-r lg:border-b-0">
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <ReviewMedia
            annotations={annotations}
            disabled={state.busy || isSubmitting}
            onAnnotationsChange={setAnnotations}
            onRetakeScreenshot={onRetakeScreenshot}
            state={state}
          />
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto p-6 pt-7 lg:px-7">
        <div className="grid gap-6">
          <p className="m-0 pr-10 font-semibold text-lg">Report an issue</p>

          <form className="grid gap-6" onSubmit={form.handleSubmit}>
            {showReporterFields ? (
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={Boolean(form.visibleErrors.reporterName)}>
                  <Label htmlFor={`${formKey}-reporter-name`}>Your name</Label>
                  <Input
                    aria-invalid={Boolean(form.visibleErrors.reporterName)}
                    autoComplete="name"
                    id={`${formKey}-reporter-name`}
                    maxLength={100}
                    onBlur={() => {
                      form.touchField("reporterName")
                    }}
                    onChange={(event) => {
                      form.setFieldValue(
                        "reporterName",
                        event.currentTarget.value
                      )
                    }}
                    placeholder="Jane Smith"
                    value={form.draft.reporterName ?? ""}
                  />
                  {form.visibleErrors.reporterName ? (
                    <FieldError errors={[form.visibleErrors.reporterName]} />
                  ) : null}
                </Field>
                <Field data-invalid={Boolean(form.visibleErrors.reporterEmail)}>
                  <Label htmlFor={`${formKey}-reporter-email`}>
                    Your email
                  </Label>
                  <Input
                    aria-invalid={Boolean(form.visibleErrors.reporterEmail)}
                    autoComplete="email"
                    id={`${formKey}-reporter-email`}
                    maxLength={200}
                    onBlur={() => {
                      form.touchField("reporterEmail")
                    }}
                    onChange={(event) => {
                      form.setFieldValue(
                        "reporterEmail",
                        event.currentTarget.value
                      )
                    }}
                    placeholder="jane@company.com"
                    type="email"
                    value={form.draft.reporterEmail ?? ""}
                  />
                  {form.visibleErrors.reporterEmail ? (
                    <FieldError errors={[form.visibleErrors.reporterEmail]} />
                  ) : null}
                </Field>
              </div>
            ) : (
              <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm">
                <span className="text-muted-foreground">Sending as</span>
                <span className="font-medium">{form.draft.reporterName}</span>
                <span className="text-muted-foreground">
                  ({form.draft.reporterEmail})
                </span>
                <button
                  className="text-foreground text-sm underline underline-offset-2 hover:opacity-80"
                  onClick={() => setEditingReporter(true)}
                  type="button"
                >
                  Change
                </button>
              </p>
            )}
            <Field data-invalid={Boolean(form.visibleErrors.title)}>
              <Label htmlFor={`${formKey}-title`}>What's the issue?</Label>
              <Input
                aria-invalid={Boolean(form.visibleErrors.title)}
                id={`${formKey}-title`}
                maxLength={200}
                onBlur={() => {
                  form.touchField("title")
                }}
                onChange={(event) => {
                  form.setFieldValue("title", event.currentTarget.value)
                }}
                placeholder="e.g. The button overlaps the text on mobile"
                value={form.draft.title}
              />
              {form.visibleErrors.title ? (
                <FieldError errors={[form.visibleErrors.title]} />
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.visibleErrors.description)}>
              <Label htmlFor={`${formKey}-description`}>
                Details{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                aria-invalid={Boolean(form.visibleErrors.description)}
                className="min-h-28 resize-y"
                id={`${formKey}-description`}
                maxLength={4000}
                onBlur={() => {
                  form.touchField("description")
                }}
                onChange={(event) => {
                  form.setFieldValue("description", event.currentTarget.value)
                }}
                placeholder="What did you expect to see? Anything else we should know?"
                value={form.draft.description}
              />
              {form.visibleErrors.description ? (
                <FieldError errors={[form.visibleErrors.description]} />
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.visibleErrors.priority)}>
              <Label htmlFor={`${formKey}-priority`}>Priority</Label>
              <select
                aria-invalid={Boolean(form.visibleErrors.priority)}
                className={cn("h-10 px-3", FIELD_CLASSES)}
                id={`${formKey}-priority`}
                onBlur={() => {
                  form.touchField("priority")
                }}
                onChange={(event) => {
                  form.setFieldValue(
                    "priority",
                    event.currentTarget
                      .value as CaptureSubmissionDraft["priority"]
                  )
                }}
                value={form.draft.priority}
              >
                {capturePriorityOptions.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
              {form.visibleErrors.priority ? (
                <FieldError errors={[form.visibleErrors.priority]} />
              ) : null}
            </Field>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button
                className="h-10 w-full"
                disabled={state.busy || isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Sending…" : "Send report"}
              </Button>
              <Button
                className="h-10 w-full"
                disabled={state.busy || isSubmitting}
                onClick={onCancel}
                type="button"
                variant="outline"
              >
                Retake
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
