"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { cn } from "@crikket/ui/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import {
  readTicketList,
  saveTicketList,
  type TicketList,
} from "@/lib/ticket-nav"
import { client } from "@/utils/orpc"

interface TicketNavProps {
  currentId: string
  hrefFor: (id: string) => string
  // Used when the ticket wasn't opened from a list in this tab (client links only).
  fallbackIds?: string[]
  // Only follow a saved list of this kind (and, for client links, this token).
  kind: TicketList["kind"]
  token?: string
  className?: string
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

// On the dashboard, reaching the end of the loaded list loads the next page of the same list.
async function loadMore(list: TicketList): Promise<TicketList> {
  if (list.kind !== "dashboard" || !list.hasMore) return list
  const page = Math.floor(list.ids.length / list.pageSize) + 1
  const result = await client.bugReport.list({
    ...(list.input as Parameters<typeof client.bugReport.list>[0] & object),
    page,
    perPage: list.pageSize,
  })
  const seen = new Set(list.ids)
  const next: TicketList = {
    ...list,
    ids: [
      ...list.ids,
      ...result.items.map((item) => item.id).filter((id) => !seen.has(id)),
    ],
    hasMore: result.pagination.hasNextPage,
  }
  saveTicketList(next)
  return next
}

export function TicketNav({
  currentId,
  hrefFor,
  fallbackIds,
  kind,
  token,
  className,
}: TicketNavProps) {
  const router = useRouter()
  const [list, setList] = useState<TicketList | null>(null)

  useEffect(() => {
    const saved = readTicketList()
    const matches =
      saved?.kind === kind &&
      (saved.kind !== "client" || saved.token === token) &&
      saved.ids.includes(currentId)
    if (matches) {
      setList(saved)
    } else if (fallbackIds?.includes(currentId)) {
      setList(
        kind === "client" && token
          ? { kind: "client", token, ids: fallbackIds }
          : null
      )
    } else {
      setList(null)
    }
  }, [currentId, fallbackIds, kind, token])

  // Last loaded ticket on the dashboard: fetch the next page so "next" can appear.
  const index = list ? list.ids.indexOf(currentId) : -1
  const atLoadedEnd =
    list?.kind === "dashboard" && list.hasMore && index === list.ids.length - 1
  useEffect(() => {
    if (!(atLoadedEnd && list)) return
    let cancelled = false
    loadMore(list)
      .then((next) => {
        if (!cancelled) setList(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [atLoadedEnd, list])

  const prevId = list && index > 0 ? list.ids[index - 1] : undefined
  const nextId =
    list && index >= 0 && index < list.ids.length - 1
      ? list.ids[index + 1]
      : undefined

  // Left and right arrow keys, unless typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (isTyping(event.target)) return
      const id =
        event.key === "ArrowLeft"
          ? prevId
          : event.key === "ArrowRight"
            ? nextId
            : undefined
      if (id) {
        event.preventDefault()
        router.push(hrefFor(id) as Route)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hrefFor, nextId, prevId, router])

  if (!list || index < 0 || list.ids.length < 2) {
    return null
  }

  const total = `${list.ids.length}${list.kind === "dashboard" && list.hasMore ? "+" : ""}`

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <NavButton
        href={prevId ? hrefFor(prevId) : undefined}
        label="Previous ticket (←)"
      >
        <ChevronLeft />
      </NavButton>
      <span className="min-w-12 text-center text-muted-foreground text-xs tabular-nums">
        {index + 1} of {total}
      </span>
      <NavButton
        href={nextId ? hrefFor(nextId) : undefined}
        label="Next ticket (→)"
      >
        <ChevronRight />
      </NavButton>
    </div>
  )
}

function NavButton({
  href,
  label,
  children,
}: {
  href?: string
  label: string
  children: React.ReactNode
}) {
  if (!href) {
    return (
      <Button aria-label={label} disabled size="icon-sm" variant="outline">
        {children}
      </Button>
    )
  }
  return (
    <Button
      aria-label={label}
      nativeButton={false}
      render={<Link href={href as Route} title={label} />}
      size="icon-sm"
      variant="outline"
    >
      {children}
    </Button>
  )
}
