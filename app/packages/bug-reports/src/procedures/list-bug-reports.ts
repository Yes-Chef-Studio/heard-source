import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import {
  BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS,
  BUG_REPORT_SORT_OPTIONS,
  BUG_REPORT_STATUSES,
  BUG_REPORT_SUBMISSION_STATUS_OPTIONS,
  type BugReportDebuggerIngestionStatus,
  type BugReportSort,
  type BugReportSubmissionStatus,
  DEFAULT_BUG_REPORT_STATUS,
} from "@crikket/shared/constants/bug-report"
import {
  CATEGORY_VALUES,
  type Category,
  normalizeCategory,
} from "@crikket/shared/constants/categories"
import { BROWSER_VALUES, DEVICE_VALUES } from "@crikket/shared/constants/device"
import {
  DEFAULT_PRIORITY,
  PRIORITY_OPTIONS,
  type Priority,
} from "@crikket/shared/constants/priorities"
import {
  buildPaginationMeta,
  type PaginatedResult,
} from "@crikket/shared/lib/server/pagination"
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { z } from "zod"
import {
  reportBrowser,
  reportDevice,
  reportPersonEmail,
  reportPersonKey,
  reportPersonName,
} from "../lib/report-facets"
import { isExpiringSignedUrl, resolveCaptureUrl } from "../lib/storage"
import {
  formatDurationMs,
  isAttachmentType,
  isStatus,
  isVisibility,
  statusValues,
  visibilityValues,
} from "../lib/utils"
import { protectedProcedure } from "./context"
import { requireActiveOrgId } from "./helpers"

const priorityValues = Object.values(PRIORITY_OPTIONS) as [
  Priority,
  ...Priority[],
]
const sortValues = Object.values(BUG_REPORT_SORT_OPTIONS) as [
  BugReportSort,
  ...BugReportSort[],
]
// Heard: reports are grouped by the site (scheme + host) and page (path, without query, hash or
// trailing slash) they were filed on. Works for any platform, not just Webflow.
export const reportSite = sql<string>`lower(substring(${bugReport.url} from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+'))`
export const reportPage = sql<string>`coalesce(nullif(regexp_replace(substring(${bugReport.url} from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+([^?#]*)'), '/+$', ''), ''), '/')`

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

export interface BugReportListItem {
  id: string
  title: string
  description: string | undefined
  duration: string
  thumbnail: string | undefined
  attachmentUrl: string | undefined
  attachmentType: "video" | "screenshot" | undefined
  uploader?: {
    name: string
    avatar: string | undefined
  }
  // Set when the report came from the widget: who said they sent it.
  reporterEmail: string | undefined
  visibility: "public" | "private"
  status: (typeof statusValues)[number]
  submissionStatus: BugReportSubmissionStatus
  debuggerIngestionStatus: BugReportDebuggerIngestionStatus
  debuggerIngestionError: string | undefined
  priority: Priority
  // Null when the ticket has no category.
  category: Category | null
  tags: string[]
  url: string | undefined
  createdAt: string
  updatedAt: string
}

export interface BugReportDashboardStats {
  total: number
  open: number
  inProgress: number
  resolved: number
  closed: number
  untriaged: number
  mine: number
  privateCount: number
  publicCount: number
}

const listBugReportsInputSchema = z
  .object({
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional(),
    search: z
      .string()
      .max(200)
      .transform((value) => value.trim())
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    statuses: z.array(z.enum(statusValues)).max(statusValues.length).optional(),
    priorities: z
      .array(z.enum(priorityValues))
      .max(priorityValues.length)
      .optional(),
    visibilities: z
      .array(z.enum(visibilityValues))
      .max(visibilityValues.length)
      .optional(),
    // "none" lists tickets without a category.
    categories: z
      .array(z.enum([...CATEGORY_VALUES, "none"]))
      .max(CATEGORY_VALUES.length + 1)
      .optional(),
    // Kept for old links and API callers; the dashboard no longer sends it.
    site: z.string().max(500).optional(),
    // Page path, with or without a site.
    pagePath: z.string().max(2000).optional(),
    // Derived from device_info; see @crikket/shared/constants/device for the rule.
    browsers: z
      .array(z.enum(BROWSER_VALUES))
      .max(BROWSER_VALUES.length)
      .optional(),
    devices: z
      .array(z.enum(DEVICE_VALUES))
      .max(DEVICE_VALUES.length)
      .optional(),
    // A reporter key from listReporters: their email, or their name when there is no email.
    reporter: z.string().trim().min(1).max(200).optional(),
    // Project = capture key. "none" lists reports not linked to any project.
    projectId: z.string().min(1).max(100).optional(),
    sort: z.enum(sortValues).default(BUG_REPORT_SORT_OPTIONS.newest),
  })
  .optional()

function normalizePagination(input: z.infer<typeof listBugReportsInputSchema>) {
  const rawPage = input?.page ?? DEFAULT_PAGE
  const rawPerPage = input?.perPage ?? DEFAULT_PAGE_SIZE
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
  const perPage = Number.isFinite(rawPerPage)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(rawPerPage)))
    : DEFAULT_PAGE_SIZE

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
    limit: perPage,
  }
}

function buildOrderBy(sort: BugReportSort) {
  const priorityWeight = sql<number>`
    CASE
      WHEN ${bugReport.priority} = 'high' THEN 0
      WHEN ${bugReport.priority} = 'normal' THEN 1
      WHEN ${bugReport.priority} = 'low' THEN 2
      ELSE 3
    END
  `

  if (sort === BUG_REPORT_SORT_OPTIONS.status) {
    const statusOrder = sql.join(
      BUG_REPORT_STATUSES.map(
        (option, index) =>
          sql`WHEN ${bugReport.status} = ${option.value} THEN ${index}`
      ),
      sql` `
    )
    return [
      asc(
        sql<number>`CASE ${statusOrder} ELSE ${BUG_REPORT_STATUSES.length} END`
      ),
      desc(bugReport.createdAt),
    ]
  }

  if (sort === BUG_REPORT_SORT_OPTIONS.oldest) {
    return [asc(bugReport.createdAt)]
  }

  if (sort === BUG_REPORT_SORT_OPTIONS.updated) {
    return [desc(bugReport.updatedAt)]
  }

  if (sort === BUG_REPORT_SORT_OPTIONS.priorityHigh) {
    return [asc(priorityWeight), desc(bugReport.createdAt)]
  }

  if (sort === BUG_REPORT_SORT_OPTIONS.priorityLow) {
    return [desc(priorityWeight), desc(bugReport.createdAt)]
  }

  return [desc(bugReport.createdAt)]
}

function normalizeInt(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0)
}

function normalizePriority(value: unknown): Priority {
  return priorityValues.includes(value as Priority)
    ? (value as Priority)
    : DEFAULT_PRIORITY
}

function normalizeDuration(metadata: Record<string, unknown> | null): string {
  const duration = metadata?.duration
  if (typeof duration === "string" && duration.length > 0) {
    return duration
  }

  const durationMs = metadata?.durationMs
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return formatDurationMs(Math.max(0, Math.floor(durationMs)))
  }

  return "0:00"
}

interface BugReportListRecord {
  id: string
  title: string | null
  description: string | null
  metadata: unknown
  captureKey: string | null
  attachmentType: string | null
  debuggerIngestionError: string | null
  debuggerIngestionStatus: string
  submissionStatus: string
  visibility: string
  status: string
  priority: string
  category: string | null
  tags: string[] | null
  url: string | null
  createdAt: Date
  updatedAt: Date
  reporterName: string | null
  reporterEmail: string | null
  reporter: {
    name: string | null
    image: string | null
  } | null
}

// Widget reports carry a self-reported name; dashboard uploads have a signed-in user.
function resolveUploader(
  report: BugReportListRecord
): BugReportListItem["uploader"] {
  const widgetName = report.reporterName?.trim()
  if (widgetName) {
    return { name: widgetName, avatar: undefined }
  }
  const userName = report.reporter?.name?.trim()
  return userName
    ? { name: userName, avatar: report.reporter?.image ?? undefined }
    : undefined
}

async function mapBugReportListItem(
  report: BugReportListRecord
): Promise<BugReportListItem> {
  const metadata = report.metadata as Record<string, unknown> | null
  const attachmentType = isAttachmentType(report.attachmentType)
    ? report.attachmentType
    : undefined
  const attachmentUrl = await resolveCaptureUrl({
    captureKey: report.captureKey,
  })
  const thumbnailUrl =
    typeof metadata?.thumbnailUrl === "string" &&
    !isExpiringSignedUrl(metadata.thumbnailUrl)
      ? metadata.thumbnailUrl
      : undefined
  const uploader = resolveUploader(report)

  return {
    id: report.id,
    title: report.title || "Untitled Bug Report",
    reporterEmail: report.reporterEmail ?? undefined,
    description: report.description ?? undefined,
    duration: normalizeDuration(metadata),
    thumbnail:
      thumbnailUrl ??
      (attachmentType === "screenshot"
        ? (attachmentUrl ?? undefined)
        : undefined),
    attachmentUrl: attachmentUrl ?? undefined,
    attachmentType,
    visibility: isVisibility(report.visibility) ? report.visibility : "private",
    status: isStatus(report.status) ? report.status : DEFAULT_BUG_REPORT_STATUS,
    submissionStatus:
      report.submissionStatus === BUG_REPORT_SUBMISSION_STATUS_OPTIONS.failed ||
      report.submissionStatus ===
        BUG_REPORT_SUBMISSION_STATUS_OPTIONS.processing ||
      report.submissionStatus === BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready
        ? report.submissionStatus
        : BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready,
    debuggerIngestionStatus:
      report.debuggerIngestionStatus ===
        BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.notUploaded ||
      report.debuggerIngestionStatus ===
        BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.pending ||
      report.debuggerIngestionStatus ===
        BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.processing ||
      report.debuggerIngestionStatus ===
        BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.completed ||
      report.debuggerIngestionStatus ===
        BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.failed
        ? report.debuggerIngestionStatus
        : BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS.completed,
    debuggerIngestionError: report.debuggerIngestionError ?? undefined,
    priority: normalizePriority(report.priority),
    category: normalizeCategory(report.category),
    tags: Array.isArray(report.tags) ? report.tags : [],
    url: report.url ?? undefined,
    uploader,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  }
}

type ListBugReportsInput = z.infer<typeof listBugReportsInputSchema>

function buildSearchFilters(input: ListBugReportsInput): SQL[] {
  if (!input?.search) {
    return []
  }
  const searchValue = `%${input.search}%`
  const searchCondition = or(
    ilike(bugReport.title, searchValue),
    ilike(bugReport.description, searchValue),
    ilike(bugReport.url, searchValue),
    ilike(bugReport.reporterName, searchValue),
    ilike(bugReport.reporterEmail, searchValue)
  )
  return searchCondition ? [searchCondition] : []
}

// Project = capture key. "none" means reports not linked to any project.
function buildProjectFilter(projectId: string | undefined): SQL | undefined {
  if (!projectId) {
    return
  }
  return projectId === "none"
    ? isNull(bugReport.capturePublicKeyId)
    : eq(bugReport.capturePublicKeyId, projectId)
}

function buildCategoryFilter(
  categories: NonNullable<NonNullable<ListBugReportsInput>["categories"]>
): SQL | undefined {
  const slugs = Array.from(
    new Set(categories.filter((value) => value !== "none"))
  )
  const conditions = [
    slugs.length > 0 ? inArray(bugReport.category, slugs) : undefined,
    categories.includes("none") ? isNull(bugReport.category) : undefined,
  ]
  return or(...conditions)
}

// Status, priority, category, visibility and project: plain column filters.
function buildFieldFilters(input: ListBugReportsInput): SQL[] {
  const filters: Array<SQL | undefined> = []

  if (input?.statuses && input.statuses.length > 0) {
    filters.push(inArray(bugReport.status, Array.from(new Set(input.statuses))))
  }

  if (input?.priorities && input.priorities.length > 0) {
    filters.push(
      inArray(bugReport.priority, Array.from(new Set(input.priorities)))
    )
  }

  if (input?.categories && input.categories.length > 0) {
    filters.push(buildCategoryFilter(input.categories))
  }

  if (input?.visibilities && input.visibilities.length > 0) {
    filters.push(
      inArray(bugReport.visibility, Array.from(new Set(input.visibilities)))
    )
  }

  filters.push(buildProjectFilter(input?.projectId))

  return filters.filter((filter): filter is SQL => filter !== undefined)
}

// Site, page, browser, device and person: derived from the URL, device_info and the reporter.
function buildFacetFilters(input: ListBugReportsInput): SQL[] {
  const filters: SQL[] = []

  if (input?.site) {
    filters.push(sql`${reportSite} = ${input.site.toLowerCase()}`)
  }

  if (input?.pagePath) {
    // Reports without a URL have no page, though reportPage reads "/" for them.
    filters.push(
      sql`${reportSite} is not null and ${reportPage} = ${input.pagePath}`
    )
  }

  if (input?.browsers && input.browsers.length > 0) {
    filters.push(
      inArray(reportBrowser, Array.from(new Set<string>(input.browsers)))
    )
  }

  if (input?.devices && input.devices.length > 0) {
    filters.push(
      inArray(reportDevice, Array.from(new Set<string>(input.devices)))
    )
  }

  if (input?.reporter) {
    filters.push(sql`${reportPersonKey} = ${input.reporter.toLowerCase()}`)
  }

  return filters
}

export const listBugReports = protectedProcedure
  .input(listBugReportsInputSchema)
  .handler(
    async ({ context, input }): Promise<PaginatedResult<BugReportListItem>> => {
      const activeOrgId = requireActiveOrgId(context.session)
      const { page, perPage, offset, limit } = normalizePagination(input)

      const filters = [
        eq(bugReport.organizationId, activeOrgId),
        ...buildSearchFilters(input),
        ...buildFieldFilters(input),
        ...buildFacetFilters(input),
      ]

      const whereClause =
        filters.length === 1 ? filters[0] : (and(...filters) ?? filters[0])
      const orderBy = buildOrderBy(
        input?.sort ?? BUG_REPORT_SORT_OPTIONS.newest
      )

      const [countResult, bugReports] = await Promise.all([
        db.select({ value: count() }).from(bugReport).where(whereClause),
        db.query.bugReport.findMany({
          where: whereClause,
          orderBy,
          limit,
          offset,
          with: {
            reporter: true,
          },
        }),
      ])

      const totalCount = countResult[0]?.value ?? 0

      const items = await Promise.all(
        bugReports.map((report) =>
          mapBugReportListItem(report as BugReportListRecord)
        )
      )

      return {
        items,
        pagination: buildPaginationMeta(totalCount, page, perPage),
      }
    }
  )

export const getBugReportDashboardStats = protectedProcedure.handler(
  async ({ context }): Promise<BugReportDashboardStats> => {
    const activeOrgId = requireActiveOrgId(context.session)

    const [result] = await db
      .select({
        total: count(),
        // open = not started or active; inProgress = active; resolved = final check;
        // closed = closed or cancelled; untriaged = still "to do".
        open: sql<number>`SUM(CASE WHEN ${bugReport.status} IN ('to_do', 'planning', 'blocked', 'client_action', 'fast_follow') THEN 1 ELSE 0 END)`,
        inProgress: sql<number>`SUM(CASE WHEN ${bugReport.status} IN ('planning', 'blocked', 'client_action', 'fast_follow') THEN 1 ELSE 0 END)`,
        resolved: sql<number>`SUM(CASE WHEN ${bugReport.status} = 'final_check' THEN 1 ELSE 0 END)`,
        closed: sql<number>`SUM(CASE WHEN ${bugReport.status} IN ('closed', 'cancelled') THEN 1 ELSE 0 END)`,
        untriaged: sql<number>`SUM(CASE WHEN ${bugReport.status} = 'to_do' THEN 1 ELSE 0 END)`,
        mine: sql<number>`SUM(CASE WHEN ${bugReport.reporterId} = ${context.session.user.id} THEN 1 ELSE 0 END)`,
        privateCount: sql<number>`SUM(CASE WHEN ${bugReport.visibility} = 'private' THEN 1 ELSE 0 END)`,
        publicCount: sql<number>`SUM(CASE WHEN ${bugReport.visibility} = 'public' THEN 1 ELSE 0 END)`,
      })
      .from(bugReport)
      .where(eq(bugReport.organizationId, activeOrgId))

    return {
      total: normalizeInt(result?.total),
      open: normalizeInt(result?.open),
      inProgress: normalizeInt(result?.inProgress),
      resolved: normalizeInt(result?.resolved),
      closed: normalizeInt(result?.closed),
      untriaged: normalizeInt(result?.untriaged),
      mine: normalizeInt(result?.mine),
      privateCount: normalizeInt(result?.privateCount),
      publicCount: normalizeInt(result?.publicCount),
    }
  }
)

export interface BugReportSiteSummary {
  site: string
  count: number
  pages: Array<{ page: string; count: number }>
}

// Every site and page the org has reports for, with counts, for the dashboard's site/page filter.
export const listBugReportSites = protectedProcedure
  .input(
    z.object({ projectId: z.string().min(1).max(100).optional() }).optional()
  )
  .handler(async ({ context, input }): Promise<BugReportSiteSummary[]> => {
    const activeOrgId = requireActiveOrgId(context.session)

    const rows = await db
      .select({ site: reportSite, page: reportPage, value: count() })
      .from(bugReport)
      .where(
        and(
          eq(bugReport.organizationId, activeOrgId),
          sql`${reportSite} is not null`,
          buildProjectFilter(input?.projectId)
        )
      )
      .groupBy(reportSite, reportPage)

    const sites = new Map<string, BugReportSiteSummary>()
    for (const row of rows) {
      if (!row.site) continue
      const value = normalizeInt(row.value)
      let entry = sites.get(row.site)
      if (!entry) {
        entry = { site: row.site, count: 0, pages: [] }
        sites.set(row.site, entry)
      }
      entry.count += value
      entry.pages.push({ page: row.page, count: value })
    }

    return Array.from(sites.values())
      .map((entry) => ({
        ...entry,
        pages: entry.pages.sort((a, b) => a.page.localeCompare(b.page)),
      }))
      .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site))
  })

export interface BugReportReporterSummary {
  // What the list filter takes: the email, or the name when there is no email. Lower-cased.
  key: string
  name: string | undefined
  email: string | undefined
  count: number
}

// Everyone who has filed a report in scope, with counts, for the dashboard's person filter.
export const listBugReportReporters = protectedProcedure
  .input(
    z.object({ projectId: z.string().min(1).max(100).optional() }).optional()
  )
  .handler(async ({ context, input }): Promise<BugReportReporterSummary[]> => {
    const activeOrgId = requireActiveOrgId(context.session)

    const rows = await db
      .select({
        key: reportPersonKey,
        name: sql<string | null>`max(${reportPersonName})`,
        email: sql<string | null>`max(${reportPersonEmail})`,
        value: count(),
      })
      .from(bugReport)
      .where(
        and(
          eq(bugReport.organizationId, activeOrgId),
          sql`${reportPersonKey} is not null`,
          buildProjectFilter(input?.projectId)
        )
      )
      .groupBy(reportPersonKey)

    return rows
      .flatMap((row) =>
        row.key
          ? [
              {
                key: row.key,
                name: row.name ?? undefined,
                email: row.email ?? undefined,
                count: normalizeInt(row.value),
              },
            ]
          : []
      )
      .sort(
        (a, b) =>
          (a.name ?? a.key).localeCompare(b.name ?? b.key) ||
          a.key.localeCompare(b.key)
      )
  })
