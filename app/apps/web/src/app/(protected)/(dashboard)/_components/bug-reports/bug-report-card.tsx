"use client"

import {
  BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS,
  BUG_REPORT_SUBMISSION_STATUS_OPTIONS,
  type BugReportStatus,
  type BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import type { Category } from "@crikket/shared/constants/categories"
import { DEFAULT_PRIORITY } from "@crikket/shared/constants/priorities"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"
import { Card, CardContent } from "@crikket/ui/components/ui/card"
import { Checkbox } from "@crikket/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crikket/ui/components/ui/dropdown-menu"
import {
  Clapperboard,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  Link2,
  MoreVertical,
  Play,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import {
  CategoryPicker,
  PriorityBadge,
} from "@/components/bug-reports/category-picker"
import { EditBugReportSheet } from "@/components/bug-reports/edit-bug-report-sheet"
import { StatusPicker } from "@/components/bug-reports/status-picker"

import { VISIBILITY_OPTIONS } from "./filters"
import type { BugReportListItem } from "./types"

interface BugReportCardProps {
  report: BugReportListItem
  isChecked: boolean
  isMutating: boolean
  onToggleSelection: (checked: boolean) => void
  onRequestDelete: () => void
  onRetryDebuggerIngestion: () => void
  onReportUpdated: () => Promise<void>
  onUpdateReport: (input: {
    status?: BugReportStatus
    category?: Category | null
    visibility?: BugReportVisibility
  }) => void
}

export function BugReportCard({
  report,
  isChecked,
  isMutating,
  onToggleSelection,
  onRequestDelete,
  onRetryDebuggerIngestion,
  onReportUpdated,
  onUpdateReport,
}: BugReportCardProps) {
  const isPrivate = report.visibility === "private"
  const isReady =
    report.submissionStatus === BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready
  const isRetryable =
    report.debuggerIngestionStatus ===
      BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.failed &&
    report.submissionStatus === BUG_REPORT_SUBMISSION_STATUS_OPTIONS.failed
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)

  const handleCopyLink = async () => {
    if (!isReady) {
      toast.error("Share link is unavailable until the report is ready")
      return
    }

    const shareUrl = `${window.location.origin}/s/${report.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Share link copied")
    } catch (error) {
      reportNonFatalError("Failed to copy bug report share link", error)
      toast.error("Failed to copy link")
    }
  }

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link
        aria-label={`Open ${report.title}`}
        className="absolute inset-0 z-10"
        href={`/s/${report.id}`}
      />
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="relative aspect-video overflow-hidden bg-muted">
          <div
            className={`absolute top-2.5 left-2.5 z-20 transition-opacity ${isChecked ? "" : "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"}`}
          >
            <Checkbox
              aria-label={`Select ${report.title}`}
              checked={isChecked}
              onCheckedChange={(checked) => onToggleSelection(checked === true)}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            />
          </div>

          <div className="absolute top-2.5 right-2.5 z-20 transition-opacity md:opacity-0 md:has-[[data-popup-open]]:opacity-100 md:group-hover:opacity-100 md:focus-within:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                render={
                  <Button
                    aria-label="Report actions"
                    className="h-8 w-8 bg-background/90 backdrop-blur-sm"
                    disabled={isMutating}
                    size="icon-sm"
                    variant="outline"
                  />
                }
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Copy className="size-4" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isReady}
                  onClick={() =>
                    window.open(`/s/${report.id}`, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="size-4" />
                  Open in new tab
                </DropdownMenuItem>
                {isRetryable ? (
                  <DropdownMenuItem onClick={onRetryDebuggerIngestion}>
                    <RotateCcw className="size-4" />
                    Retry debugger ingest
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Privacy</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => {
                      if (value !== report.visibility) {
                        onUpdateReport({
                          visibility: value as BugReportVisibility,
                        })
                      }
                    }}
                    value={report.visibility}
                  >
                    {VISIBILITY_OPTIONS.map((visibilityOption) => (
                      <DropdownMenuRadioItem
                        key={visibilityOption.value}
                        value={visibilityOption.value}
                      >
                        {visibilityOption.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsEditSheetOpen(true)}>
                  <Edit3 className="size-4" />
                  Edit report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onRequestDelete}
                  variant="destructive"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <MediaPreview report={report} />

          <div className="pointer-events-none absolute bottom-2 left-2 z-20">
            <MediaTypeBadge attachmentType={report.attachmentType} />
          </div>

          {report.attachmentType === "video" ? (
            <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-white text-xs">
              <Clock className="h-3 w-3" />
              {report.duration}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="min-w-0 space-y-1.5">
            <h3
              className="line-clamp-2 font-semibold text-[15px] text-foreground leading-snug"
              title={report.title}
            >
              {report.title}
            </h3>
            <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
              {report.uploader ? (
                <span
                  className="truncate"
                  title={report.reporterEmail ?? report.uploader.name}
                >
                  {report.uploader.name}
                </span>
              ) : null}
              {report.uploader ? (
                <span aria-hidden="true" className="opacity-50">
                  ·
                </span>
              ) : null}
              <time
                className="shrink-0"
                dateTime={new Date(report.createdAt).toISOString()}
                title={new Date(report.createdAt).toLocaleString()}
              >
                {formatShortDate(report.createdAt)}
              </time>
              {isPrivate ? null : (
                <span
                  className="inline-flex shrink-0 items-center gap-1"
                  title="Anyone with the link can view this ticket"
                >
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <Globe className="size-3" />
                  Public
                </span>
              )}
            </p>
            {report.url ? (
              <p
                className="flex min-w-0 items-center gap-1.5 text-muted-foreground/80 text-xs"
                title={report.url}
              >
                <Link2 className="size-3 shrink-0" />
                <span className="truncate">{formatPagePath(report.url)}</span>
              </p>
            ) : null}
          </div>

          {report.description ? (
            <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
              {report.description}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
            <StatusPicker
              disabled={isMutating}
              onChange={(status) => onUpdateReport({ status })}
              status={report.status}
            />
            {report.priority === DEFAULT_PRIORITY ? null : (
              <PriorityBadge priority={report.priority} />
            )}
            <CategoryPicker
              category={report.category}
              className={
                report.category
                  ? undefined
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
              }
              disabled={isMutating}
              onChange={(category) => onUpdateReport({ category })}
            />
            {report.submissionStatus !==
            BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready ? (
              <Chip>
                {formatSubmissionStatusLabel(report.submissionStatus)}
              </Chip>
            ) : null}
            {report.debuggerIngestionStatus ===
            BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.failed ? (
              <Chip>Debugger ingest failed</Chip>
            ) : null}
            {report.tags.slice(0, 2).map((tag) => (
              <Chip key={tag}>
                <Tag className="size-3" />
                {tag}
              </Chip>
            ))}
            {report.tags.length > 2 ? (
              <Chip>+{report.tags.length - 2}</Chip>
            ) : null}
          </div>

          {report.debuggerIngestionError ? (
            <p className="line-clamp-2 text-amber-700 text-xs">
              {report.debuggerIngestionError}
            </p>
          ) : null}
        </div>
      </CardContent>
      <EditBugReportSheet
        onOpenChange={setIsEditSheetOpen}
        onUpdated={onReportUpdated}
        open={isEditSheetOpen}
        report={{
          id: report.id,
          title: report.title,
          tags: report.tags,
          status: report.status,
          priority: report.priority,
          category: report.category,
          visibility: report.visibility,
        }}
      />
    </Card>
  )
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

function formatShortDate(value: string | Date) {
  return SHORT_DATE.format(new Date(value))
}

// The page part of the URL ("/services"); the host is the same for every ticket in a project.
function formatPagePath(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/"
  } catch {
    return url
  }
}

function formatSubmissionStatusLabel(
  status: BugReportCardProps["report"]["submissionStatus"]
) {
  switch (status) {
    case BUG_REPORT_SUBMISSION_STATUS_OPTIONS.processing:
      return "Processing"
    case BUG_REPORT_SUBMISSION_STATUS_OPTIONS.failed:
      return "Submission failed"
    default:
      return "Ready"
  }
}

function MediaTypeBadge({
  attachmentType,
}: {
  attachmentType: BugReportListItem["attachmentType"]
}) {
  if (attachmentType === "video") {
    return (
      <Badge className="border-white/15 bg-black/75 text-white backdrop-blur-sm hover:bg-black/75">
        <Clapperboard className="size-3" />
        Video
      </Badge>
    )
  }

  return null
}

function MediaPreview({ report }: { report: BugReportListItem }) {
  if (report.thumbnail) {
    return (
      <Image
        alt={report.title}
        className="object-cover transition-transform group-hover:scale-105"
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 20vw"
        src={report.thumbnail}
      />
    )
  }

  if (report.attachmentType === "video" && report.attachmentUrl) {
    return <VideoThumbnail report={report} />
  }

  if (report.attachmentType === "screenshot" && report.attachmentUrl) {
    return (
      <Image
        alt={report.title}
        className="object-cover transition-transform group-hover:scale-105"
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 20vw"
        src={report.attachmentUrl}
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Play className="h-12 w-12 text-muted-foreground" />
    </div>
  )
}

function VideoThumbnail({ report }: { report: BugReportListItem }) {
  const hasSeekedRef = useRef(false)

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      if (hasSeekedRef.current) {
        return
      }

      const player = event.currentTarget
      const durationSeconds =
        Number.isFinite(player.duration) && player.duration > 0
          ? player.duration
          : 0
      const targetSeconds =
        durationSeconds > 0
          ? Math.min(Math.max(durationSeconds * 0.2, 0.15), durationSeconds / 2)
          : 0

      hasSeekedRef.current = true

      if (targetSeconds <= 0) {
        return
      }

      const handleSeeked = () => {
        player.pause()
      }

      player.addEventListener("seeked", handleSeeked, { once: true })

      try {
        player.currentTime = targetSeconds
      } catch {
        hasSeekedRef.current = false
      }
    },
    []
  )

  return (
    <>
      <video
        aria-hidden="true"
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
        muted
        onLoadedMetadata={handleLoadedMetadata}
        playsInline
        preload="metadata"
        src={report.attachmentUrl}
        tabIndex={-1}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/20 bg-black/60 p-3 text-white shadow-sm backdrop-blur-sm">
          <Play className="size-5 fill-current" />
        </div>
      </div>
    </>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px]">
      {children}
    </span>
  )
}
