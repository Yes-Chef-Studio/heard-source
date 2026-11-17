import { siteConfig } from "@crikket/shared/config/site"
import { cn } from "@crikket/ui/lib/utils"

// AGPL-3.0 section 13: users interacting with Heard over a network are offered its source.
export function SourceNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      {siteConfig.name} is open source under the AGPL-3.0, based on Crikket.{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href={siteConfig.links.source}
        rel="noopener noreferrer"
        target="_blank"
      >
        Source code
      </a>
    </p>
  )
}
