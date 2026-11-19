import { Button } from "../components/primitives/button"

export function ChooserSection(props: {
  busy: boolean
  onStartVideo: () => void
  onTakeScreenshot: () => void
}): React.JSX.Element {
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
