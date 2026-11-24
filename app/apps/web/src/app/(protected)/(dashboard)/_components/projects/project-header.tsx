"use client"

import { ConfirmationDialog } from "@crikket/ui/components/dialogs/confirmation-dialog"
import { Button } from "@crikket/ui/components/ui/button"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crikket/ui/components/ui/popover"
import { Skeleton } from "@crikket/ui/components/ui/skeleton"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  RefreshCcw,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { formatSite } from "@/lib/relative-time"
import { client, orpc } from "@/utils/orpc"
import { WidgetColorControls } from "./widget-color-controls"

function shareUrl(token: string): string {
  return `${window.location.origin}/p/${token}`
}

function ShareLinkControls({
  projectId,
  shareToken,
}: {
  projectId: string
  shareToken: string | null
}) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<"regenerate" | "off" | null>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.project.key() })
  }

  const regenerate = useMutation({
    mutationFn: async () => client.project.regenerateShareLink({ projectId }),
    onSuccess: async (result) => {
      await refresh()
      setConfirm(null)
      try {
        await navigator.clipboard.writeText(shareUrl(result.shareToken))
        toast.success("Client link copied")
      } catch {
        toast.success("Client link created")
      }
    },
    onError: (error) => toast.error(error.message || "Couldn't create link"),
  })

  const disable = useMutation({
    mutationFn: async () => client.project.disableShareLink({ projectId }),
    onSuccess: async () => {
      await refresh()
      setConfirm(null)
      toast.success("Client link turned off")
    },
    onError: (error) => toast.error(error.message || "Couldn't turn off link"),
  })

  const url = shareToken ? shareUrl(shareToken) : null

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="sm" variant={url ? "outline" : "default"}>
              <Link2 />
              {url ? "Client link" : "Create client link"}
              {url ? <ChevronDown className="text-muted-foreground" /> : null}
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-[26rem] max-w-[calc(100vw-2rem)]"
        >
          <PopoverHeader>
            <PopoverTitle>Client link</PopoverTitle>
            <PopoverDescription className="text-xs">
              {url
                ? "Anyone with this link can see this project's tickets and comments, and comment under any name."
                : "Share it with the client so they can see this project's tickets and reply."}
            </PopoverDescription>
          </PopoverHeader>
          {url ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Client link"
                  className="h-8 flex-1 font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={url}
                />
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(url)
                    toast.success("Client link copied")
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Copy />
                  Copy
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <a
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-muted"
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-4" />
                  Open
                </a>
                <Button
                  onClick={() => setConfirm("regenerate")}
                  size="sm"
                  variant="ghost"
                >
                  <RefreshCcw />
                  Regenerate
                </Button>
                <Button
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirm("off")}
                  size="sm"
                  variant="ghost"
                >
                  Turn off
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="self-start"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate()}
              size="sm"
            >
              <Link2 />
              {regenerate.isPending ? "Creating…" : "Create and copy link"}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <ConfirmationDialog
        confirmText="Regenerate link"
        description="The current link stops working for everyone who has it. You'll need to send the new link to the client."
        isLoading={regenerate.isPending}
        onConfirm={async () => {
          await regenerate.mutateAsync()
        }}
        onOpenChange={(open) => setConfirm(open ? "regenerate" : null)}
        open={confirm === "regenerate"}
        title="Regenerate the client link?"
      />
      <ConfirmationDialog
        confirmText="Turn off link"
        description="The link stops working. You can create a new one later."
        isLoading={disable.isPending}
        onConfirm={async () => {
          await disable.mutateAsync()
        }}
        onOpenChange={(open) => setConfirm(open ? "off" : null)}
        open={confirm === "off"}
        title="Turn off the client link?"
        variant="destructive"
      />
    </>
  )
}

export function ProjectHeader({ projectId }: { projectId: string }) {
  const isUnassigned = projectId === "none"
  const query = useQuery(
    orpc.project.get.queryOptions({
      input: { projectId },
      enabled: !isUnassigned,
    })
  )
  const project = query.data

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
        href="/"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>
      {isUnassigned ? (
        <div>
          <h1 className="font-bold text-3xl tracking-tight">No project</h1>
          <p className="mt-1 text-muted-foreground">
            Reports that didn't come through a project's script.
          </p>
        </div>
      ) : null}
      {!isUnassigned && query.isLoading ? (
        <Skeleton className="h-24 w-full max-w-xl" />
      ) : null}
      {project ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-bold text-3xl tracking-tight">
              {project.name}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {project.sites.map(formatSite).join(", ")} · {project.reportCount}{" "}
              {project.reportCount === 1 ? "report" : "reports"},{" "}
              {project.openCount} open
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <WidgetColorControls
              projectId={project.id}
              widgetColor={project.widgetColor}
            />
            <ShareLinkControls
              projectId={project.id}
              shareToken={project.shareToken}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
