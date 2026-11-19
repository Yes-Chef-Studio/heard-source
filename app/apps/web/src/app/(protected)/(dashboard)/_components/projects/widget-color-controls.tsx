"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Input } from "@crikket/ui/components/ui/input"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Pencil } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { client, orpc } from "@/utils/orpc"

// Colour of the widget's "Report issue" tab on this project's sites. Null = Heard's default.
const PRESETS = [
  "#111111",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
]
const HEX = /^#[0-9a-f]{6}$/
// Matches the widget's default tab (near-black).
const DEFAULT_PREVIEW = "#171717"

function readableTextOn(hex: string): string {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  // Same rule as the widget (sdks/capture/src/ui/launcher-color.ts).
  return 1.05 / (luminance + 0.05) >= 3 ? "#ffffff" : "#111111"
}

function normalize(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  return HEX.test(withHash) ? withHash : null
}

function TabPreview({ color }: { color: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-28 w-24 items-center justify-end overflow-hidden rounded-md border bg-muted/40"
    >
      <div
        className="flex rotate-180 items-center gap-1.5 rounded-r-md px-1.5 py-2.5 font-semibold text-[11px] shadow-md [writing-mode:vertical-rl]"
        style={{ background: color, color: readableTextOn(color) }}
      >
        Report issue
        <Pencil className="size-3 rotate-180" />
      </div>
    </div>
  )
}

export function WidgetColorControls({
  projectId,
  widgetColor,
}: {
  projectId: string
  widgetColor: string | null
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(widgetColor ?? "")

  useEffect(() => setDraft(widgetColor ?? ""), [widgetColor])

  const save = useMutation({
    mutationFn: async (color: string | null) =>
      client.project.setWidgetColor({ projectId, color }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: orpc.project.key() })
      toast.success(
        result.widgetColor
          ? "Tab colour saved. Sites update within a minute."
          : "Back to the default colour."
      )
    },
    onError: (error) => toast.error(error.message || "Couldn't save colour"),
  })

  const parsed = normalize(draft)
  const preview = parsed ?? widgetColor ?? DEFAULT_PREVIEW
  const dirty = parsed !== null && parsed !== widgetColor
  const pick = (color: string | null) => {
    setDraft(color ?? "")
    if (color !== widgetColor) save.mutate(color)
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      <TabPreview color={preview} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium text-sm">Widget colour</p>
          <p className="text-muted-foreground text-xs">
            The "Report issue" tab on this project's sites. Match the client's
            brand, or pick one that stands out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            aria-label="Default colour"
            aria-pressed={widgetColor === null}
            className="relative h-7 rounded-full border px-2.5 text-xs hover:bg-muted aria-pressed:border-foreground"
            disabled={save.isPending}
            onClick={() => pick(null)}
            type="button"
          >
            Default
          </button>
          {PRESETS.map((color) => (
            <button
              aria-label={`Use ${color}`}
              aria-pressed={widgetColor === color}
              className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-foreground"
              disabled={save.isPending}
              key={color}
              onClick={() => pick(color)}
              style={{ background: color }}
              type="button"
            >
              {widgetColor === color ? (
                <Check
                  className="size-3.5"
                  style={{ color: readableTextOn(color) }}
                />
              ) : null}
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (dirty) save.mutate(parsed)
          }}
        >
          <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border">
            <span className="sr-only">Pick any colour</span>
            <span
              className="absolute inset-0"
              style={{ background: preview }}
            />
            <input
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => setDraft(event.target.value)}
              type="color"
              value={preview}
            />
          </label>
          <Input
            aria-invalid={draft !== "" && parsed === null}
            aria-label="Hex colour"
            className="h-8 w-28 font-mono text-xs"
            maxLength={7}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="#ff6b35"
            value={draft}
          />
          <Button
            disabled={!dirty || save.isPending}
            size="sm"
            type="submit"
            variant="outline"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </div>
    </div>
  )
}
