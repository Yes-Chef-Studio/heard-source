import { siteConfig } from "@crikket/shared/config/site"
import { cn } from "@crikket/ui/lib/utils"

// The Heard mark: a speech bubble with an H. Uses currentColor so it follows the theme.
export function HeardMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      viewBox="0 0 64 64"
    >
      <path
        d="M16 6h32a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12H27l-12 10v-10.4A12 12 0 0 1 4 36V18A12 12 0 0 1 16 6z"
        fill="currentColor"
      />
      <path
        className="stroke-background"
        d="M22 15v26M42 15v26M22 28h20"
        fill="none"
        strokeLinecap="round"
        strokeWidth="6"
      />
    </svg>
  )
}

export function HeardLogo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string
  markClassName?: string
  wordClassName?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <HeardMark className={markClassName} />
      <span
        className={cn("font-bold font-wordmark tracking-tight", wordClassName)}
      >
        {siteConfig.name.toLowerCase()}
      </span>
    </span>
  )
}
