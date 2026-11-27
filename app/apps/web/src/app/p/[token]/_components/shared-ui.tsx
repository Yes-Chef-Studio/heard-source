"use client"

import { CLIENT_STATUSES } from "@crikket/shared/constants/bug-report"
import { cn } from "@crikket/ui/lib/utils"
import { CircleAlert, Loader2 } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { HeardFeedbackButton } from "@/components/heard-feedback"
import { HeardLogo } from "@/components/heard-logo"
import { SourceNotice } from "@/components/source-notice"

export function clientStatusMeta(value: string) {
  return CLIENT_STATUSES.find((status) => status.value === value)
}

export function ClientStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const meta = clientStatusMeta(status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 font-medium text-xs",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: meta?.color ?? "#9ca3af" }}
      />
      {meta?.label ?? status}
    </span>
  )
}

export function ShareShell({
  token,
  title,
  subtitle,
  children,
}: {
  token: string
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 border-b pb-5">
        <Link className="w-fit text-foreground" href={`/p/${token}` as Route}>
          <HeardLogo markClassName="size-6" wordClassName="text-xl" />
        </Link>
        {title ? (
          <div>
            <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
      </header>
      {children}
      <footer className="mt-12 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <SourceNotice />
        <HeardFeedbackButton />
      </footer>
    </div>
  )
}

export function ShareLoading() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function ShareError({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <CircleAlert className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-3 font-semibold text-lg">
        {message ?? "This link isn't active."}
      </h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Ask your Yes Chef contact for a new one.
      </p>
    </div>
  )
}
