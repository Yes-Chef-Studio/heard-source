"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { cn } from "@crikket/ui/lib/utils"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Bell, Loader2, MessageSquare, Sparkles } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useRef } from "react"

import { formatRelativeTime } from "@/lib/relative-time"
import { client, orpc } from "@/utils/orpc"

type NotificationItem = Awaited<
  ReturnType<typeof client.notification.list>
>["items"][number]

function NotificationRow({ item }: { item: NotificationItem }) {
  const isComment = item.type === "client_comment"
  const title = item.reportTitle ? `“${item.reportTitle}”` : "a report"
  const href = item.bugReportId
    ? `/s/${item.bugReportId}?tab=${isComment ? "comments" : "details"}`
    : "/"

  return (
    <Link
      className={cn(
        "flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
        item.unread && "border-foreground/20 bg-muted/40"
      )}
      href={href as Route}
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {isComment ? (
          <MessageSquare className="size-4" />
        ) : (
          <Sparkles className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {isComment ? (
            <>
              <strong className="font-semibold">
                {item.actorName ?? "A client"}
              </strong>{" "}
              commented on {title}
            </>
          ) : (
            <>
              New feedback from{" "}
              <strong className="font-semibold">
                {item.actorName ?? "a reviewer"}
              </strong>{" "}
              on {title}
            </>
          )}
        </p>
        {isComment && item.commentPreview ? (
          <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
            {item.commentPreview}
          </p>
        ) : null}
        <p className="mt-1 text-muted-foreground text-xs">
          {item.projectName ? `${item.projectName} · ` : ""}
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>
      {item.unread ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-foreground">
          <span className="sr-only">Unread</span>
        </span>
      ) : null}
    </Link>
  )
}

export function NotificationsList() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery(
    orpc.notification.list.infiniteOptions({
      initialPageParam: undefined as string | undefined,
      input: (before) => ({ limit: 30, before }),
      getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    })
  )

  const markRead = useMutation({
    mutationFn: async () => client.notification.markAllRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.notification.unreadCount.key(),
      })
    },
  })

  // Viewing the list counts as reading it. The rows keep their unread styling for this visit.
  const marked = useRef(false)
  useEffect(() => {
    if (query.isSuccess && !marked.current) {
      marked.current = true
      markRead.mutate()
    }
  }, [query.isSuccess, markRead])

  const items = query.data?.pages.flatMap((page) => page.items) ?? []

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Bell className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground text-sm">
          Nothing yet. New feedback and client comments show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-2">
      {items.map((item) => (
        <NotificationRow item={item} key={item.id} />
      ))}
      {query.hasNextPage ? (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          size="sm"
          variant="outline"
        >
          {query.isFetchingNextPage ? (
            <Loader2 className="animate-spin" />
          ) : null}
          Load more
        </Button>
      ) : null}
    </div>
  )
}
