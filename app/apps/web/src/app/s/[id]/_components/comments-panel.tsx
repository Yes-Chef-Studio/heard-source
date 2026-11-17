"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Textarea } from "@crikket/ui/components/ui/textarea"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { client, orpc } from "@/utils/orpc"

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  return date.toLocaleString()
}

const WHITESPACE = /\s+/

function initials(name: string): string {
  return name
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

// Team-only conversation on a report. Cmd/Ctrl+Enter posts.
export function CommentsPanel({ bugReportId }: { bugReportId: string }) {
  const [draft, setDraft] = useState("")
  const commentsQuery = useQuery(
    orpc.bugReport.listComments.queryOptions({ input: { bugReportId } })
  )

  const addMutation = useMutation({
    mutationFn: async (body: string) =>
      client.bugReport.addComment({ bugReportId, body }),
    onSuccess: () => {
      commentsQuery.refetch().catch(() => {
        // The next refetch picks it up.
      })
    },
    onError: (error, body) => {
      // Give the text back unless they've started a new comment.
      setDraft((current) => (current.trim() ? current : body))
      toast.error(error.message || "Couldn't post comment")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => client.bugReport.deleteComment({ id }),
    onSuccess: async () => {
      await commentsQuery.refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Couldn't delete comment")
    },
  })

  // Takes the text box's current value: a shortcut pressed right after typing can run before
  // React re-renders with the new draft. Clears the box straight away so the next comment can
  // be typed while this one saves.
  const submit = (text: string = draft) => {
    const body = text.trim()
    if (body) {
      setDraft("")
      addMutation.mutate(body)
    }
  }

  const comments = commentsQuery.data ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {commentsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {!commentsQuery.isLoading && comments.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            No comments yet. Start the conversation below.
          </p>
        ) : null}
        {comments.map((comment) => (
          <div className="group flex gap-3" key={comment.id}>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[11px]">
              {initials(comment.author?.name ?? "?")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-sm">
                  {comment.author?.name ?? "Deleted user"}
                </span>
                <span
                  className={`rounded border px-1 py-px text-[10px] uppercase tracking-wide ${comment.source === "client" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" : "text-muted-foreground"}`}
                >
                  {comment.source === "client" ? "Client" : "Team"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatWhen(comment.createdAt)}
                </span>
                {comment.isOwn ? (
                  <button
                    aria-label="Delete comment"
                    className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(comment.id)}
                    type="button"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {comment.source === "client" && comment.author?.email ? (
                <a
                  className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                  href={`mailto:${comment.author.email}`}
                >
                  {comment.author.email}
                </a>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {comment.body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Textarea
          maxLength={5000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit(event.currentTarget.value)
            }
          }}
          placeholder="Write a comment…"
          rows={3}
          value={draft}
        />
        {/* Button on the left: the feedback launcher sits in the bottom-right corner. */}
        <div className="flex items-center gap-3">
          <Button disabled={!draft.trim()} size="sm" type="submit">
            {addMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : null}
            Comment
          </Button>
          <span className="text-muted-foreground text-xs">
            Clients see these comments on the project's share link. Cmd+Enter to
            post.
          </span>
        </div>
      </form>
    </div>
  )
}
