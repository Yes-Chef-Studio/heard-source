export const BUG_REPORT_STATUS_OPTIONS = {
  toDo: "to_do",
  planning: "planning",
  blocked: "blocked",
  clientAction: "client_action",
  fastFollow: "fast_follow",
  finalCheck: "final_check",
  cancelled: "cancelled",
  closed: "closed",
} as const

export type BugReportStatus =
  (typeof BUG_REPORT_STATUS_OPTIONS)[keyof typeof BUG_REPORT_STATUS_OPTIONS]

export type BugReportStatusGroup = "not_started" | "active" | "done" | "closed"

export const BUG_REPORT_STATUS_GROUP_LABELS: Record<
  BugReportStatusGroup,
  string
> = {
  not_started: "Not started",
  active: "Active",
  done: "Done",
  closed: "Closed",
}

// Display order, label, group and color for every status. The one place to change them.
export const BUG_REPORT_STATUSES: ReadonlyArray<{
  value: BugReportStatus
  label: string
  group: BugReportStatusGroup
  color: string
}> = [
  { value: "to_do", label: "To do", group: "not_started", color: "#9ca3af" },
  { value: "planning", label: "Planning", group: "active", color: "#4f5bd5" },
  {
    value: "blocked",
    label: "Blocked / confused",
    group: "active",
    color: "#e5484d",
  },
  {
    value: "client_action",
    label: "Client action",
    group: "active",
    color: "#f5c518",
  },
  {
    value: "fast_follow",
    label: "Fast follow",
    group: "active",
    color: "#f76b15",
  },
  {
    value: "final_check",
    label: "Final check",
    group: "done",
    color: "#3b82f6",
  },
  { value: "cancelled", label: "Cancelled", group: "done", color: "#e5484d" },
  { value: "closed", label: "Closed", group: "closed", color: "#2f855a" },
]

export const DEFAULT_BUG_REPORT_STATUS: BugReportStatus = "to_do"

// Hidden from ticket lists unless someone picks them in the Status filter.
export const HIDDEN_BY_DEFAULT_STATUSES: readonly BugReportStatus[] = [
  "cancelled",
  "closed",
]

// What the Status filter shows by default: everything still in play.
export const OPEN_STATUS_VALUES: readonly BugReportStatus[] =
  BUG_REPORT_STATUSES.map((option) => option.value).filter(
    (value) => !HIDDEN_BY_DEFAULT_STATUSES.includes(value)
  )

export function getBugReportStatusMeta(status: string) {
  return (
    BUG_REPORT_STATUSES.find((option) => option.value === status) ??
    BUG_REPORT_STATUSES[0]
  )
}

export const BUG_REPORT_VISIBILITY_OPTIONS = {
  public: "public",
  private: "private",
} as const

export type BugReportVisibility =
  (typeof BUG_REPORT_VISIBILITY_OPTIONS)[keyof typeof BUG_REPORT_VISIBILITY_OPTIONS]

export const BUG_REPORT_SUBMISSION_STATUS_OPTIONS = {
  processing: "processing",
  ready: "ready",
  failed: "failed",
} as const

export type BugReportSubmissionStatus =
  (typeof BUG_REPORT_SUBMISSION_STATUS_OPTIONS)[keyof typeof BUG_REPORT_SUBMISSION_STATUS_OPTIONS]

export const BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS = {
  notUploaded: "not_uploaded",
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const

export type BugReportDebuggerIngestionStatus =
  (typeof BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS)[keyof typeof BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS]

export const BUG_REPORT_SORT_OPTIONS = {
  newest: "newest",
  oldest: "oldest",
  updated: "updated",
  priorityHigh: "priority_high",
  priorityLow: "priority_low",
  // Workflow order: To do first, Closed last (BUG_REPORT_STATUSES order).
  status: "status",
} as const

export type BugReportSort =
  (typeof BUG_REPORT_SORT_OPTIONS)[keyof typeof BUG_REPORT_SORT_OPTIONS]

// What clients see on a project's share link. Internal statuses collapse into these.
export const CLIENT_STATUSES = [
  { value: "received", label: "Received", color: "#9ca3af" },
  { value: "in_progress", label: "In progress", color: "#4f5bd5" },
  { value: "blocked", label: "Blocked", color: "#e5484d" },
  { value: "needs_input", label: "Needs your input", color: "#f5c518" },
  { value: "fast_follow", label: "Fast follow", color: "#f76b15" },
  { value: "done", label: "Done", color: "#2f855a" },
  { value: "not_planned", label: "Not planned", color: "#9ca3af" },
] as const

export type ClientStatus = (typeof CLIENT_STATUSES)[number]["value"]

const CLIENT_STATUS_BY_STATUS: Record<BugReportStatus, ClientStatus> = {
  to_do: "received",
  planning: "in_progress",
  blocked: "blocked",
  fast_follow: "fast_follow",
  client_action: "needs_input",
  final_check: "done",
  closed: "done",
  cancelled: "not_planned",
}

export function toClientStatus(status: string): ClientStatus {
  return CLIENT_STATUS_BY_STATUS[status as BugReportStatus] ?? "received"
}

// Internal statuses behind each client status, for filtering the share page.
export function statusesForClientStatus(
  clientStatus: ClientStatus
): BugReportStatus[] {
  return (Object.keys(CLIENT_STATUS_BY_STATUS) as BugReportStatus[]).filter(
    (status) => CLIENT_STATUS_BY_STATUS[status] === clientStatus
  )
}
