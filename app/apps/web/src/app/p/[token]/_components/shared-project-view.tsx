"use client"

import {
  CLIENT_STATUSES,
  type ClientStatus,
} from "@crikket/shared/constants/bug-report"
import { cn } from "@crikket/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { ImageIcon, MessageSquare, Play } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { CategoryBadge } from "@/components/bug-reports/category-picker"
import { formatRelativeTime, formatSite } from "@/lib/relative-time"
import { saveOnTicketClick } from "@/lib/ticket-nav"
import { type client, orpc } from "@/utils/orpc"
import {
  ClientStatusBadge,
  ShareError,
  ShareLoading,
  ShareShell,
} from "./shared-ui"

type SharedReport = Awaited<ReturnType<typeof client.share.listReports>>[number]

function Thumbnail({ report }: { report: SharedReport }) {
  if (report.attachmentType === "video" && report.attachmentUrl) {
    return (
      <>
        <video
          className="size-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={report.attachmentUrl}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 p-3 text-white">
            <Play className="size-5 fill-current" />
          </span>
        </span>
      </>
    )
  }
  if (report.attachmentUrl) {
    return (
      <img
        alt=""
        className="size-full object-cover object-top"
        loading="lazy"
        src={report.attachmentUrl}
      />
    )
  }
  return (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <ImageIcon className="size-8" />
    </span>
  )
}

function TicketCard({
  token,
  report,
}: {
  token: string
  report: SharedReport
}) {
  return (
    <Link
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
      href={`/p/${token}/t/${report.id}` as Route}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Thumbnail report={report} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold text-sm leading-snug">
            {report.title}
          </h3>
          <ClientStatusBadge className="shrink-0" status={report.status} />
        </div>
        <p
          className="truncate text-muted-foreground text-xs"
          title={report.page}
        >
          {report.page}
        </p>
        <CategoryBadge category={report.category} className="w-fit" />
        <div className="mt-auto flex items-center justify-between gap-2 text-muted-foreground text-xs">
          <span className="truncate">
            {report.reporterName ? `${report.reporterName} · ` : ""}
            {formatRelativeTime(report.createdAt)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <MessageSquare className="size-3.5" />
            {report.commentCount}
          </span>
        </div>
      </div>
    </Link>
  )
}

function StatusFilter({
  counts,
  value,
  onChange,
}: {
  counts: Record<ClientStatus, number>
  value: ClientStatus | null
  onChange: (value: ClientStatus | null) => void
}) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "bg-background hover:bg-muted"
    )
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={chip(value === null)}
        onClick={() => onChange(null)}
        type="button"
      >
        All <span className="opacity-70">{total}</span>
      </button>
      {CLIENT_STATUSES.filter((status) => counts[status.value] > 0).map(
        (status) => (
          <button
            className={chip(value === status.value)}
            key={status.value}
            onClick={() => onChange(status.value)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            {status.label}{" "}
            <span className="opacity-70">{counts[status.value]}</span>
          </button>
        )
      )}
    </div>
  )
}

export function SharedProjectView({ token }: { token: string }) {
  const [status, setStatus] = useState<ClientStatus | null>(null)
  const projectQuery = useQuery({
    ...orpc.share.getProject.queryOptions({ input: { token } }),
    retry: false,
    meta: { silent: true },
  })
  const reportsQuery = useQuery({
    ...orpc.share.listReports.queryOptions({
      input: { token, status: status ?? undefined },
    }),
    enabled: projectQuery.isSuccess,
    retry: false,
    meta: { silent: true },
  })

  if (projectQuery.isLoading) {
    return <ShareLoading />
  }
  if (projectQuery.isError || !projectQuery.data) {
    return <ShareError />
  }

  const project = projectQuery.data
  const reports = reportsQuery.data ?? []

  return (
    <ShareShell
      subtitle={`Feedback on ${project.sites.map(formatSite).join(", ")}`}
      title={project.name}
      token={token}
    >
      <div className="space-y-5">
        <StatusFilter
          counts={project.counts}
          onChange={setStatus}
          value={status}
        />
        {reportsQuery.isLoading ? <ShareLoading /> : null}
        {reportsQuery.isSuccess && reports.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background p-10 text-center text-muted-foreground text-sm">
            {status
              ? "No tickets with this status."
              : "No feedback yet. Tickets your team leaves on the site will appear here."}
          </div>
        ) : null}
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onClickCapture={(event) =>
            saveOnTicketClick(event, () => ({
              kind: "client",
              token,
              ids: reports.map((report) => report.id),
            }))
          }
        >
          {reports.map((report) => (
            <TicketCard key={report.id} report={report} token={token} />
          ))}
        </div>
      </div>
    </ShareShell>
  )
}
