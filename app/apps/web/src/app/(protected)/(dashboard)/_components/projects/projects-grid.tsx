"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Skeleton } from "@crikket/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Folder, FolderOpen, Link2, Plus } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { formatRelativeTime, formatSite } from "@/lib/relative-time"
import { orpc } from "@/utils/orpc"

interface FolderCardProps {
  href: string
  name: string
  sites: string[]
  reportCount: number
  openCount?: number
  lastReportAt?: string | null
  shared?: boolean
  muted?: boolean
}

function FolderCard({
  href,
  name,
  sites,
  reportCount,
  openCount,
  lastReportAt,
  shared,
  muted,
}: FolderCardProps) {
  return (
    <Link
      className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
      href={href as Route}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="relative">
          <Folder
            className={`size-10 ${muted ? "text-muted-foreground" : "text-foreground"} transition-opacity group-hover:opacity-0`}
            strokeWidth={1.5}
          />
          <FolderOpen
            className={`absolute inset-0 size-10 opacity-0 transition-opacity group-hover:opacity-100 ${muted ? "text-muted-foreground" : "text-foreground"}`}
            strokeWidth={1.5}
          />
        </div>
        {shared ? (
          <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Link2 className="size-3" />
            Client link on
          </span>
        ) : null}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="truncate font-semibold" title={name}>
          {name}
        </h3>
        <p
          className="truncate text-muted-foreground text-xs"
          title={sites.map(formatSite).join(", ")}
        >
          {sites.length > 0 ? sites.map(formatSite).join(", ") : "No site"}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 text-xs">
        <span>
          <strong className="font-semibold">{reportCount}</strong>{" "}
          {reportCount === 1 ? "report" : "reports"}
          {openCount !== undefined ? (
            <span className="text-muted-foreground"> · {openCount} open</span>
          ) : null}
        </span>
        {lastReportAt ? (
          <span className="text-muted-foreground">
            {formatRelativeTime(lastReportAt)}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <Folder
        className="mx-auto size-10 text-muted-foreground"
        strokeWidth={1.5}
      />
      <h2 className="mt-3 font-semibold">No projects yet</h2>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
        Create a project in Settings with the client's staging URLs, then paste
        its script tag into the site. Feedback from that site lands in the
        project's folder.
      </p>
      <Button
        className="mt-4"
        nativeButton={false}
        render={<Link href="/settings/keys" />}
        size="sm"
      >
        <Plus />
        New project
      </Button>
    </div>
  )
}

export function ProjectsGrid() {
  const query = useQuery(orpc.project.list.queryOptions())
  const projects = query.data?.projects ?? []
  const unassigned = query.data?.unassignedCount ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            One folder per client site. Open a folder to see its feedback.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/settings/keys" />}
          size="sm"
          variant="outline"
        >
          <Plus />
          New project
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton className="h-40 rounded-lg" key={key} />
          ))}
        </div>
      ) : null}

      {query.isLoading || projects.length > 0 || unassigned > 0 ? null : (
        <EmptyState />
      )}

      {projects.length > 0 || unassigned > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <FolderCard
              href={`/projects/${project.id}`}
              key={project.id}
              lastReportAt={project.lastReportAt}
              name={project.name}
              openCount={project.openCount}
              reportCount={project.reportCount}
              shared={Boolean(project.shareToken)}
              sites={project.sites}
            />
          ))}
          {unassigned > 0 ? (
            <FolderCard
              href="/projects/none"
              muted
              name="No project"
              reportCount={unassigned}
              sites={[]}
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}
