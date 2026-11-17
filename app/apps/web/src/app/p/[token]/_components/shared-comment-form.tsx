"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Input } from "@crikket/ui/components/ui/input"
import { Label } from "@crikket/ui/components/ui/label"
import { Textarea } from "@crikket/ui/components/ui/textarea"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { client } from "@/utils/orpc"

// Same key the widget uses on the client's site. This page is on another origin, so it
// usually starts empty here and is remembered after the first comment.
const STORAGE_KEY = "heard:reporter"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Identity {
  name: string
  email: string
}

function loadIdentity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Identity>
    const name = typeof parsed.name === "string" ? parsed.name.trim() : ""
    const email = typeof parsed.email === "string" ? parsed.email.trim() : ""
    return name && EMAIL_PATTERN.test(email) ? { name, email } : null
  } catch {
    return null
  }
}

function saveIdentity(identity: Identity) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // Private mode: they'll be asked again next time.
  }
}

function validate(identity: Identity): string | null {
  if (!identity.name.trim())
    return "Add your name so the team knows who wrote this."
  if (!EMAIL_PATTERN.test(identity.email.trim()))
    return "Enter a valid email address."
  return null
}

export function SharedCommentForm({
  token,
  reportId,
  onPosted,
}: {
  token: string
  reportId: string
  onPosted: () => void
}) {
  const [saved, setSaved] = useState<Identity | null>(null)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [identity, setIdentity] = useState<Identity>({ name: "", email: "" })
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = loadIdentity()
    setSaved(stored)
    if (stored) setIdentity(stored)
  }, [])

  const askIdentity = !saved || editingIdentity

  const post = useMutation({
    mutationFn: async (input: Identity & { body: string }) =>
      client.share.addComment({
        token,
        reportId,
        name: input.name.trim(),
        email: input.email.trim(),
        body: input.body,
      }),
    onSuccess: (_result, input) => {
      const next = { name: input.name.trim(), email: input.email.trim() }
      saveIdentity(next)
      setSaved(next)
      setEditingIdentity(false)
      onPosted()
    },
    onError: (mutationError, input) => {
      setError(mutationError.message || "Couldn't post your comment.")
      // Give the text back unless they've started a new one.
      setDraft((current) => (current.trim() ? current : input.body))
    },
  })

  // Takes the box's current value: a shortcut can fire before React re-renders.
  const submit = (text: string = draft) => {
    const body = text.trim()
    if (!body) return
    const who = askIdentity ? identity : (saved as Identity)
    const problem = validate(who)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setDraft("")
    post.mutate({ ...who, body })
  }

  return (
    <form
      className="space-y-3 rounded-lg border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {askIdentity ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="share-name">Your name</Label>
            <Input
              autoComplete="name"
              id="share-name"
              maxLength={100}
              onChange={(event) =>
                setIdentity((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Jane Smith"
              value={identity.name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-email">Your email</Label>
            <Input
              autoComplete="email"
              id="share-email"
              maxLength={200}
              onChange={(event) =>
                setIdentity((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="jane@company.com"
              type="email"
              value={identity.email}
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Commenting as{" "}
          <strong className="text-foreground">{saved?.name}</strong>{" "}
          <button
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setEditingIdentity(true)}
            type="button"
          >
            Change
          </button>
        </p>
      )}
      <Textarea
        aria-label="Your comment"
        maxLength={5000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit(event.currentTarget.value)
          }
        }}
        placeholder="Write a reply…"
        rows={3}
        value={draft}
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button disabled={!draft.trim()} size="sm" type="submit">
          {post.isPending ? <Loader2 className="animate-spin" /> : null}
          Post reply
        </Button>
        <span className="text-muted-foreground text-xs">
          The Yes Chef team sees your name and email.
        </span>
      </div>
    </form>
  )
}
