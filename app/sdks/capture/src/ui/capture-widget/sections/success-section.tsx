import { siteConfig } from "@crikket/shared/config/site"
import type { CaptureUiHandlers, CaptureUiState } from "../../types"
import { CheckIcon } from "../components/icons"
import { Button } from "../components/primitives/button"

export function SuccessSection(props: {
  state: CaptureUiState
  handlers: CaptureUiHandlers
}): React.JSX.Element {
  return (
    <section className="grid gap-6 p-6 pt-8 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-green-600/15 text-green-600">
          <CheckIcon className="h-5 w-5" />
        </span>
        <div className="grid gap-1">
          <strong className="text-lg">Thanks, it's sent</strong>
          <p className="m-0 text-muted-foreground text-sm">
            The team has your report and will follow up.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          className="w-full"
          disabled={props.state.busy}
          onClick={props.handlers.onRetry}
          type="button"
          variant="outline"
        >
          Report another
        </Button>
        <Button
          className="w-full"
          disabled={props.state.busy}
          onClick={props.handlers.onClose}
          type="button"
        >
          Done
        </Button>
      </div>

      {/* AGPL-3.0 section 13: offer the source to everyone using the widget. */}
      <p className="m-0 text-muted-foreground text-xs">
        Powered by {siteConfig.name}, open source (AGPL-3.0).{" "}
        <a
          href={siteConfig.links.source}
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
          target="_blank"
        >
          Source code
        </a>
      </p>
    </section>
  )
}
