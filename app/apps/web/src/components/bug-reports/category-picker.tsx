"use client"

import {
  CATEGORIES,
  type Category,
  getCategoryMeta,
  NO_CATEGORY_LABEL,
} from "@crikket/shared/constants/categories"
import {
  getPriorityColor,
  getPriorityLabel,
  PRIORITIES,
} from "@crikket/shared/constants/priorities"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crikket/ui/components/ui/dropdown-menu"
import { cn } from "@crikket/ui/lib/utils"
import { Check, ChevronDown } from "lucide-react"
import type { CSSProperties } from "react"

const CHIP_CLASSES =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium text-[11px]"

// A light wash of the colour behind normal foreground text, so the label keeps its contrast in
// both light and dark mode whatever the colour is.
export function tintStyle(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
  }
}

export function ColorDot({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  )
}

// A colour dot and a label on one line, for select items and select triggers.
export function ColorLabel({
  color,
  label,
}: {
  color?: string
  label: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {color ? <ColorDot color={color} /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

export function PriorityBadge({
  priority,
  label: customLabel,
  className,
}: {
  priority: string
  // Defaults to the short label ("High").
  label?: string
  className?: string
}) {
  const color = getPriorityColor(priority)
  const label =
    customLabel ??
    PRIORITIES.find((item) => item.value === priority)?.label ??
    priority
  return (
    <span
      className={cn(CHIP_CLASSES, className)}
      style={tintStyle(color)}
      title={`Priority: ${getPriorityLabel(priority)}`}
    >
      <ColorDot color={color} />
      {label}
    </span>
  )
}

// Renders nothing for a ticket without a category.
export function CategoryBadge({
  category,
  className,
}: {
  category: string | null | undefined
  className?: string
}) {
  const meta = getCategoryMeta(category)
  if (!meta) {
    return null
  }
  return (
    <span className={cn(CHIP_CLASSES, className)} style={tintStyle(meta.color)}>
      <ColorDot color={meta.color} />
      {meta.label}
    </span>
  )
}

interface CategoryPickerProps {
  category: Category | null
  onChange: (category: Category | null) => void
  disabled?: boolean
  className?: string
}

// A category chip that opens a dropdown of every category, like StatusPicker.
export function CategoryPicker({
  category,
  onChange,
  disabled,
  className,
}: CategoryPickerProps) {
  const meta = getCategoryMeta(category)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={meta ? "Change category" : "Set category"}
        className={cn(
          CHIP_CLASSES,
          "relative z-20 transition-opacity hover:opacity-80 disabled:opacity-50",
          meta ? null : "border-dashed text-muted-foreground",
          className
        )}
        disabled={disabled}
        onClick={(event) => {
          // Cards are links; don't navigate when opening the menu.
          event.preventDefault()
          event.stopPropagation()
        }}
        style={meta ? tintStyle(meta.color) : undefined}
      >
        {meta ? <ColorDot color={meta.color} /> : null}
        {meta?.label ?? "Category"}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          {CATEGORIES.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onClick={(event) => {
                event.stopPropagation()
                if (item.value !== category) {
                  onChange(item.value)
                }
              }}
            >
              <ColorDot color={item.color} />
              <span
                className={cn(
                  "flex-1",
                  item.value === category && "font-semibold"
                )}
              >
                {item.label}
              </span>
              {item.value === category ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation()
            if (category !== null) {
              onChange(null)
            }
          }}
        >
          <span className="flex-1 text-muted-foreground">
            {NO_CATEGORY_LABEL}
          </span>
          {category === null ? <Check className="size-4" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
