"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { client, orpc } from "@/utils/orpc"

// Colour of the widget's "Report issue" tab on this project's sites. Null = Heard's default.
const PRESETS = [
  { value: "#111111", label: "Black" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Purple" },
  { value: "#db2777", label: "Pink" },
  { value: "#e11d48", label: "Red" },
  { value: "#ea580c", label: "Orange" },
  { value: "#ca8a04", label: "Gold" },
  { value: "#16a34a", label: "Green" },
  { value: "#0891b2", label: "Teal" },
]
const DEFAULT = "__default__"
const CUSTOM = "__custom__"
const HEX = /^#[0-9a-f]{6}$/
// Matches the widget's default tab (near-black).
const DEFAULT_PREVIEW = "#171717"

function normalize(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  return HEX.test(withHash) ? withHash : null
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15"
      style={{ background: color }}
    />
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
  const isPreset = PRESETS.some((preset) => preset.value === widgetColor)
  const [customOpen, setCustomOpen] = useState(
    widgetColor !== null && !isPreset
  )

  useEffect(() => {
    setDraft(widgetColor ?? "")
    setCustomOpen(
      widgetColor !== null &&
        !PRESETS.some((preset) => preset.value === widgetColor)
    )
  }, [widgetColor])

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
  const current = widgetColor ?? DEFAULT_PREVIEW
  const preview = customOpen ? (parsed ?? current) : current
  const dirty = parsed !== null && parsed !== widgetColor

  let selectValue = DEFAULT
  if (customOpen) selectValue = CUSTOM
  else if (widgetColor) selectValue = widgetColor
  const selectedLabel =
    selectValue === DEFAULT
      ? "Default"
      : selectValue === CUSTOM
        ? "Custom"
        : (PRESETS.find((preset) => preset.value === selectValue)?.label ??
          "Custom")

  const onSelect = (value: string) => {
    if (value === CUSTOM) {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    const color = value === DEFAULT ? null : value
    setDraft(color ?? "")
    if (color !== widgetColor) save.mutate(color)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        disabled={save.isPending}
        onValueChange={(value) => onSelect(String(value ?? DEFAULT))}
        value={selectValue}
      >
        <SelectTrigger
          aria-label="Widget colour"
          className="w-[170px]"
          size="sm"
        >
          <SelectValue>
            <Swatch color={preview} />
            <span className="text-muted-foreground">Tab:</span>
            {selectedLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>
            <Swatch color={DEFAULT_PREVIEW} />
            Default
          </SelectItem>
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              <Swatch color={preset.value} />
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-full bg-[conic-gradient(#e11d48,#ca8a04,#16a34a,#0891b2,#7c3aed,#e11d48)]"
            />
            Custom…
          </SelectItem>
        </SelectContent>
      </Select>
      {customOpen ? (
        <form
          className="flex items-center gap-2"
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
            autoFocus
            className="h-8 w-24 font-mono text-xs"
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
      ) : null}
    </div>
  )
}
