import type { BugReportStatus } from "@crikket/shared/constants/bug-report"
import { Button } from "@crikket/ui/components/ui/button"
import { Separator } from "@crikket/ui/components/ui/separator"
import { Home } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  StatusBadge,
  StatusPicker,
} from "@/components/bug-reports/status-picker"
import { HeardLogo } from "@/components/heard-logo"
import type { SharedBugReport } from "./types"

interface BugReportHeaderProps {
  data: SharedBugReport
  editAction?: ReactNode
  // Set for team members; shows the status as a dropdown instead of a badge.
  onStatusChange?: (status: BugReportStatus) => void
}

export function BugReportHeader({
  data,
  sidebarTrigger,
  editAction,
  onStatusChange,
}: BugReportHeaderProps & { sidebarTrigger?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="md:hidden">{sidebarTrigger}</div>
        <Link
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          href="/"
        >
          <HeardLogo className="text-foreground" markClassName="size-5" />
        </Link>
        <Separator className="h-5 shrink-0" orientation="vertical" />
        <div className="flex min-w-0 items-center gap-2">
          <h1
            className="truncate font-medium text-sm"
            title={data.title ?? "Untitled"}
          >
            {data.title ?? "Untitled Bug Report"}
          </h1>
          {onStatusChange ? (
            <StatusPicker
              className="hidden shrink-0 sm:inline-flex"
              onChange={onStatusChange}
              status={data.status}
            />
          ) : (
            <StatusBadge
              className="hidden shrink-0 sm:inline-flex"
              status={data.status}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-muted-foreground text-xs sm:inline-block">
          {new Date(data.createdAt).toLocaleString()}
        </span>
        <Separator className="hidden sm:block" orientation="vertical" />
        {editAction}
        <Button
          nativeButton={false}
          render={
            <Link href="/">
              <Home />
              <span className="sr-only">Dashboard</span>
            </Link>
          }
          size="sm"
          variant="ghost"
        />
      </div>
    </header>
  )
}
