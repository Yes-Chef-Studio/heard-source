import {
  BUG_REPORT_SORT_OPTIONS,
  BUG_REPORT_STATUSES,
  BUG_REPORT_VISIBILITY_OPTIONS,
  type BugReportSort,
  type BugReportStatus,
  type BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import { PRIORITIES, type Priority } from "@crikket/shared/constants/priorities"

export const STATUS_OPTIONS: Array<{ value: BugReportStatus; label: string }> =
  BUG_REPORT_STATUSES.map(({ value, label }) => ({ value, label }))

export const PRIORITY_FILTER_OPTIONS: Array<{
  value: Priority
  label: string
}> = PRIORITIES.map(({ value, label, description }) => ({
  value,
  label: `${label}: ${description}`,
}))

export const VISIBILITY_OPTIONS: Array<{
  value: BugReportVisibility
  label: string
}> = [
  { value: BUG_REPORT_VISIBILITY_OPTIONS.private, label: "Private" },
  { value: BUG_REPORT_VISIBILITY_OPTIONS.public, label: "Public" },
]

export const SORT_OPTIONS: Array<{ value: BugReportSort; label: string }> = [
  { value: BUG_REPORT_SORT_OPTIONS.newest, label: "Newest" },
  { value: BUG_REPORT_SORT_OPTIONS.oldest, label: "Oldest" },
  { value: BUG_REPORT_SORT_OPTIONS.updated, label: "Recently Updated" },
  {
    value: BUG_REPORT_SORT_OPTIONS.priorityHigh,
    label: "Priority: High to Low",
  },
  {
    value: BUG_REPORT_SORT_OPTIONS.priorityLow,
    label: "Priority: Low to High",
  },
]

export interface DashboardFilters {
  statuses: BugReportStatus[]
  priorities: Priority[]
  visibilities: BugReportVisibility[]
  // Heard: site (scheme + host) and page path the report was filed on. Empty means all.
  site: string
  pagePath: string
}

export const EMPTY_FILTERS: DashboardFilters = {
  statuses: [],
  priorities: [],
  visibilities: [],
  site: "",
  pagePath: "",
}

const URL_SCHEME = /^https?:\/\//

export function formatSiteLabel(site: string): string {
  return site.replace(URL_SCHEME, "")
}

export function formatStatusLabel(status: BugReportStatus): string {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  )
}

export function formatPriorityLabel(priority: Priority): string {
  return (
    PRIORITY_FILTER_OPTIONS.find((option) => option.value === priority)
      ?.label ?? priority
  )
}

export function formatVisibilityLabel(visibility: BugReportVisibility): string {
  return (
    VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ??
    visibility
  )
}
