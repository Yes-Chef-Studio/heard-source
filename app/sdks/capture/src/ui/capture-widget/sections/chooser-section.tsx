import { Button } from "../components/primitives/button"

export function ChooserSection(props: {
  busy: boolean
  capturingScreenshot: boolean
  onStartVideo: () => void
  onTakeScreenshot: () => void
}): React.JSX.Element {
  if (props.capturingScreenshot) {
    return (
      <section
        aria-live="polite"
        className="grid justify-items-center gap-3 p-8 text-center"
      >
        <svg
          aria-hidden="true"
          className="h-7 w-7 animate-spin text-foreground"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            cx="12"
            cy="12"
            opacity="0.2"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
        <div className="grid gap-1">
          <p className="m-0 font-semibold text-base">Taking screenshot…</p>
          <p className="m-0 text-muted-foreground text-sm">
            This takes a few seconds.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="grid gap-4 p-5 pt-6">
      <div className="grid gap-1 pr-8">
        <p className="m-0 font-semibold text-base">Report an issue</p>
        <p className="m-0 text-muted-foreground text-sm">
          Take a screenshot to mark up, or record a short video.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onStartVideo}
          type="button"
        >
          Record video
        </Button>
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onTakeScreenshot}
          type="button"
          variant="outline"
        >
          Take screenshot
        </Button>
      </div>
    </section>
  )
}
