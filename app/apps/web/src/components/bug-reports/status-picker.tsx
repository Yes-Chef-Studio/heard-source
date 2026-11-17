"use client"

import {
  BUG_REPORT_STATUS_GROUP_LABELS,
  BUG_REPORT_STATUSES,
  type BugReportStatus,
  type BugReportStatusGroup,
  getBugReportStatusMeta,
} from "@crikket/shared/constants/bug-report"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crikket/ui/components/ui/dropdown-menu"
import { cn } from "@crikket/ui/lib/utils"
import { Check, ChevronDown } from "lucide-react"

const GROUP_ORDER: BugReportStatusGroup[] = [
  "not_started",
  "active",
  "done",
  "closed",
]

// Ring for "to do", a filling pie for active, a check for done/closed. Mirrors the ClickUp icons.
export function StatusIcon({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const meta = getBugReportStatusMeta(status)
  const size = cn("size-3.5 shrink-0", className)

  if (meta.group === "not_started") {
    return (
      <svg aria-hidden="true" className={size} viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          fill="none"
          r="6.5"
          stroke={meta.color}
          strokeDasharray="2.2 1.8"
          strokeWidth="1.6"
        />
      </svg>
    )
  }

  if (meta.group === "active") {
    const activeIndex = BUG_REPORT_STATUSES.filter(
      (item) => item.group === "active"
    ).findIndex((item) => item.value === meta.value)
    const fraction = 0.25 + activeIndex * 0.2
    const angle = fraction * 2 * Math.PI
    const x = 8 + 4 * Math.sin(angle)
    const y = 8 - 4 * Math.cos(angle)
    const largeArc = fraction > 0.5 ? 1 : 0
    return (
      <svg aria-hidden="true" className={size} viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          fill="none"
          r="6.5"
          stroke={meta.color}
          strokeWidth="1.6"
        />
        <path
          d={`M8 8 L8 4 A4 4 0 ${largeArc} 1 ${x} ${y} Z`}
          fill={meta.color}
        />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" className={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" fill={meta.color} r="7.5" />
      <path
        d="M4.8 8.2 7 10.3 11.2 5.9"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const meta = getBugReportStatusMeta(status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 font-medium text-[11px] uppercase tracking-wide",
        className
      )}
    >
      <StatusIcon status={status} />
      {meta.label}
    </span>
  )
}

interface StatusPickerProps {
  status: BugReportStatus
  onChange: (status: BugReportStatus) => void
  disabled?: boolean
  className?: string
}

// A status chip that opens a grouped dropdown of every status.
export function StatusPicker({
  status,
  onChange,
  disabled,
  className,
}: StatusPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change status"
        className={cn(
          "relative z-20 inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 font-medium text-[11px] uppercase tracking-wide transition-colors hover:bg-muted disabled:opacity-50",
          className
        )}
        disabled={disabled}
        onClick={(event) => {
          // Cards are links; don't navigate when opening the menu.
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <StatusIcon status={status} />
        {getBugReportStatusMeta(status).label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {GROUP_ORDER.map((group, index) => {
          const items = BUG_REPORT_STATUSES.filter(
            (item) => item.group === group
          )
          return (
            <DropdownMenuGroup key={group}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              {group === "not_started" ? null : (
                <DropdownMenuLabel>
                  {BUG_REPORT_STATUS_GROUP_LABELS[group]}
                </DropdownMenuLabel>
              )}
              {items.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (item.value !== status) {
                      onChange(item.value)
                    }
                  }}
                >
                  <StatusIcon status={item.value} />
                  <span
                    className={cn(
                      "flex-1 uppercase tracking-wide",
                      item.value === status && "font-semibold"
                    )}
                  >
                    {item.label}
                  </span>
                  {item.value === status ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
