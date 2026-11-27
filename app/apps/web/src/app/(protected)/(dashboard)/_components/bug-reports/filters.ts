import {
  BUG_REPORT_SORT_OPTIONS,
  BUG_REPORT_STATUSES,
  BUG_REPORT_VISIBILITY_OPTIONS,
  type BugReportSort,
  type BugReportStatus,
  type BugReportVisibility,
  OPEN_STATUS_VALUES,
} from "@crikket/shared/constants/bug-report"
import {
  CATEGORIES,
  type Category,
  NO_CATEGORY_LABEL,
} from "@crikket/shared/constants/categories"
import {
  BROWSERS,
  type Browser,
  DEVICES,
  type Device,
} from "@crikket/shared/constants/device"
import { PRIORITIES, type Priority } from "@crikket/shared/constants/priorities"

export const STATUS_OPTIONS: Array<{ value: BugReportStatus; label: string }> =
  BUG_REPORT_STATUSES.map(({ value, label }) => ({ value, label }))

export const PRIORITY_FILTER_OPTIONS: Array<{
  value: Priority
  label: string
  color: string
}> = PRIORITIES.map(({ value, label, description, color }) => ({
  value,
  label: `${label}: ${description}`,
  color,
}))

// "none" filters to tickets without a category.
export type CategoryFilter = Category | "none"
export const NO_CATEGORY_FILTER = "none" satisfies CategoryFilter

export const CATEGORY_FILTER_OPTIONS: Array<{
  value: CategoryFilter
  label: string
  color?: string
}> = [
  ...CATEGORIES.map(({ value, label, color }) => ({ value, label, color })),
  { value: NO_CATEGORY_FILTER, label: NO_CATEGORY_LABEL },
]

export const BROWSER_OPTIONS: ReadonlyArray<{ value: Browser; label: string }> =
  BROWSERS

export const DEVICE_OPTIONS: ReadonlyArray<{ value: Device; label: string }> =
  DEVICES

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
  { value: BUG_REPORT_SORT_OPTIONS.status, label: "Status" },
]

export interface DashboardFilters {
  statuses: BugReportStatus[]
  priorities: Priority[]
  categories: CategoryFilter[]
  visibilities: BugReportVisibility[]
  // Heard: the page path the report was filed on, across the sites in scope. Empty means all.
  pagePath: string
  // Derived from the report's user agent and viewport; see @crikket/shared/constants/device.
  browsers: Browser[]
  devices: Device[]
  // A reporter key from listReporters (email, or name when there is no email). Empty means all.
  reporter: string
}

export const EMPTY_FILTERS: DashboardFilters = {
  statuses: [...OPEN_STATUS_VALUES],
  priorities: [],
  categories: [],
  visibilities: [],
  pagePath: "",
  browsers: [],
  devices: [],
  reporter: "",
}

// The default Status filter ("Open": everything but closed and cancelled).
export function isDefaultStatusFilter(statuses: BugReportStatus[]): boolean {
  return (
    statuses.length === OPEN_STATUS_VALUES.length &&
    OPEN_STATUS_VALUES.every((value) => statuses.includes(value))
  )
}

export function countActiveFilters(filters: DashboardFilters): number {
  return (
    (isDefaultStatusFilter(filters.statuses) ? 0 : 1) +
    filters.priorities.length +
    filters.categories.length +
    filters.visibilities.length +
    filters.browsers.length +
    filters.devices.length +
    (filters.pagePath ? 1 : 0) +
    (filters.reporter ? 1 : 0)
  )
}

export function formatCategoryLabel(category: CategoryFilter): string {
  return (
    CATEGORY_FILTER_OPTIONS.find((option) => option.value === category)
      ?.label ?? category
  )
}

export function formatBrowserLabel(browser: Browser): string {
  return (
    BROWSER_OPTIONS.find((option) => option.value === browser)?.label ?? browser
  )
}

export function formatDeviceLabel(device: Device): string {
  return (
    DEVICE_OPTIONS.find((option) => option.value === device)?.label ?? device
  )
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
