"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ExternalLink } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useCallback, useMemo } from "react"

import { CategoryBadge } from "@/components/bug-reports/category-picker"
import { TicketNav } from "@/components/ticket-nav"
import { formatRelativeTime } from "@/lib/relative-time"
import { type client, orpc } from "@/utils/orpc"
import { SharedCommentForm } from "./shared-comment-form"
import {
  ClientStatusBadge,
  ShareError,
  ShareLoading,
  ShareShell,
} from "./shared-ui"

type SharedTicket = Awaited<ReturnType<typeof client.share.getReport>>

function Media({ ticket }: { ticket: SharedTicket }) {
  if (!ticket.attachmentUrl) {
    return null
  }
  if (ticket.attachmentType === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: screen recordings of a website, no speech track
      <video
        className="w-full rounded-lg border bg-black"
        controls
        playsInline
        preload="metadata"
        src={ticket.attachmentUrl}
      />
    )
  }
  return (
    <a
      className="block overflow-hidden rounded-lg border bg-background"
      href={ticket.attachmentUrl}
      rel="noopener noreferrer"
      target="_blank"
      title="Open full size"
    >
      <img alt={ticket.title} className="w-full" src={ticket.attachmentUrl} />
    </a>
  )
}

function Thread({ ticket }: { ticket: SharedTicket }) {
  if (ticket.comments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No comments yet. Add one below.
      </p>
    )
  }
  return (
    <ol className="space-y-4">
      {ticket.comments.map((comment) => (
        <li className="rounded-lg border bg-background p-3" key={comment.id}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-sm">{comment.authorName}</span>
            {comment.source === "team" ? (
              <span className="rounded border px-1 py-px text-[10px] uppercase tracking-wide">
                Yes Chef
              </span>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {comment.body}
          </p>
        </li>
      ))}
    </ol>
  )
}

export function SharedTicketView({
  token,
  reportId,
}: {
  token: string
  reportId: string
}) {
  const query = useQuery({
    ...orpc.share.getReport.queryOptions({ input: { token, reportId } }),
    retry: false,
    meta: { silent: true },
  })
  // Every ticket on the link, newest first, for the arrows when not opened from the list.
  const listQuery = useQuery({
    ...orpc.share.listReports.queryOptions({ input: { token } }),
    retry: false,
    meta: { silent: true },
  })
  const allIds = useMemo(
    () => listQuery.data?.map((report) => report.id),
    [listQuery.data]
  )
  const ticketHref = useCallback((id: string) => `/p/${token}/t/${id}`, [token])

  if (query.isLoading) {
    return <ShareLoading />
  }
  if (query.isError || !query.data) {
    return <ShareError message="This ticket isn't available." />
  }

  const ticket = query.data
  return (
    <ShareShell token={token}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          href={`/p/${token}` as Route}
        >
          <ArrowLeft className="size-4" />
          All tickets
        </Link>
        <TicketNav
          currentId={reportId}
          fallbackIds={allIds}
          hrefFor={ticketHref}
          kind="client"
          token={token}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Media ticket={ticket} />
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ClientStatusBadge status={ticket.status} />
              <CategoryBadge category={ticket.category} />
            </div>
            <h1 className="font-bold text-2xl tracking-tight">
              {ticket.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              {ticket.reporterName ? `${ticket.reporterName} · ` : ""}
              {formatRelativeTime(ticket.createdAt)}
            </p>
            {ticket.url ? (
              <a
                className="inline-flex max-w-full items-center gap-1 text-sm underline-offset-2 hover:underline"
                href={ticket.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="truncate">{ticket.page}</span>
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            ) : null}
            {ticket.description ? (
              <p className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm leading-relaxed">
                {ticket.description}
              </p>
            ) : null}
          </div>
          <section className="space-y-3">
            <h2 className="font-semibold">Comments</h2>
            <Thread ticket={ticket} />
            <SharedCommentForm
              onPosted={() => {
                query.refetch()
              }}
              reportId={reportId}
              token={token}
            />
          </section>
        </div>
      </div>
    </ShareShell>
  )
}
