// Public, no sign-in: a project's client share link (/p/<token>).
// Everything is scoped to the project behind the token, and only client-safe fields leave here:
// no priority, tags, debug logs or internal status names. Comments are one shared thread.
import { db } from "@crikket/db"
import { user } from "@crikket/db/schema/auth"
import {
  bugReport,
  bugReportComment,
  capturePublicKey,
} from "@crikket/db/schema/bug-report"
import {
  BUG_REPORT_SUBMISSION_STATUS_OPTIONS,
  CLIENT_STATUSES,
  type ClientStatus,
  statusesForClientStatus,
  toClientStatus,
} from "@crikket/shared/constants/bug-report"
import { ORPCError } from "@orpc/server"
import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import { createNotification } from "../lib/notifications"
import { resolveCaptureUrl } from "../lib/storage"
import { o } from "./context"
import { reportPage } from "./list-bug-reports"

const tokenSchema = z.string().min(16).max(100)
const clientStatusValues = CLIENT_STATUSES.map((s) => s.value) as [
  ClientStatus,
  ...ClientStatus[],
]

export interface SharedProject {
  name: string
  sites: string[]
  counts: Record<ClientStatus, number>
}

export interface SharedReportItem {
  id: string
  title: string
  description: string | null
  url: string | null
  page: string
  attachmentType: "video" | "screenshot" | null
  // Signed media URL; expires, so refetch rather than store.
  attachmentUrl: string | null
  reporterName: string | null
  status: ClientStatus
  commentCount: number
  createdAt: string
}

export interface SharedComment {
  id: string
  body: string
  createdAt: string
  authorName: string
  // "team" = posted by a signed-in Yes Chef member; "client" = self-reported name.
  source: "team" | "client"
}

async function requireProjectByToken(token: string) {
  const project = await db.query.capturePublicKey.findFirst({
    where: eq(capturePublicKey.shareToken, token),
  })
  if (!project) {
    // Same answer for wrong, regenerated and disabled links.
    throw new ORPCError("NOT_FOUND", { message: "This link isn't active." })
  }
  return project
}

const readyReport = eq(
  bugReport.submissionStatus,
  BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready
)

async function requireReportInProject(projectId: string, reportId: string) {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, reportId),
      eq(bugReport.capturePublicKeyId, projectId),
      readyReport
    ),
  })
  if (!report) {
    throw new ORPCError("NOT_FOUND", { message: "Ticket not found" })
  }
  return report
}

async function toSharedReport(
  report: typeof bugReport.$inferSelect,
  page: string,
  commentCount: number
): Promise<SharedReportItem> {
  return {
    id: report.id,
    title: report.title || "Untitled feedback",
    description: report.description,
    url: report.url,
    page,
    attachmentType:
      report.attachmentType === "video" ||
      report.attachmentType === "screenshot"
        ? report.attachmentType
        : null,
    attachmentUrl: await resolveCaptureUrl({ captureKey: report.captureKey }),
    reporterName: report.reporterName,
    status: toClientStatus(report.status),
    commentCount,
    createdAt: report.createdAt.toISOString(),
  }
}

export const getSharedProject = o
  .input(z.object({ token: tokenSchema }))
  .handler(async ({ input }): Promise<SharedProject> => {
    const project = await requireProjectByToken(input.token)
    const rows = await db
      .select({ status: bugReport.status, value: count() })
      .from(bugReport)
      .where(and(eq(bugReport.capturePublicKeyId, project.id), readyReport))
      .groupBy(bugReport.status)

    const counts = Object.fromEntries(
      clientStatusValues.map((value) => [value, 0])
    ) as Record<ClientStatus, number>
    for (const row of rows) {
      counts[toClientStatus(row.status)] += Number(row.value)
    }
    return { name: project.label, sites: project.allowedOrigins, counts }
  })

export const listSharedReports = o
  .input(
    z.object({
      token: tokenSchema,
      status: z.enum(clientStatusValues).optional(),
    })
  )
  .handler(async ({ input }): Promise<SharedReportItem[]> => {
    const project = await requireProjectByToken(input.token)
    const rows = await db
      .select({ report: bugReport, page: reportPage })
      .from(bugReport)
      .where(
        and(
          eq(bugReport.capturePublicKeyId, project.id),
          readyReport,
          input.status
            ? inArray(bugReport.status, statusesForClientStatus(input.status))
            : undefined
        )
      )
      .orderBy(desc(bugReport.createdAt))
      .limit(500)

    const ids = rows.map((row) => row.report.id)
    const commentCounts = ids.length
      ? await db
          .select({ id: bugReportComment.bugReportId, value: count() })
          .from(bugReportComment)
          .where(inArray(bugReportComment.bugReportId, ids))
          .groupBy(bugReportComment.bugReportId)
      : []
    const countById = new Map(commentCounts.map((c) => [c.id, Number(c.value)]))

    return Promise.all(
      rows.map((row) =>
        toSharedReport(row.report, row.page, countById.get(row.report.id) ?? 0)
      )
    )
  })

export const getSharedReport = o
  .input(z.object({ token: tokenSchema, reportId: z.string().min(1) }))
  .handler(
    async ({
      input,
    }): Promise<SharedReportItem & { comments: SharedComment[] }> => {
      const project = await requireProjectByToken(input.token)
      const report = await requireReportInProject(project.id, input.reportId)
      const [pageRow] = await db
        .select({ page: reportPage })
        .from(bugReport)
        .where(eq(bugReport.id, report.id))

      const comments = await db
        .select({
          id: bugReportComment.id,
          body: bugReportComment.body,
          createdAt: bugReportComment.createdAt,
          source: bugReportComment.source,
          clientName: bugReportComment.authorName,
          teamName: user.name,
        })
        .from(bugReportComment)
        .leftJoin(user, eq(user.id, bugReportComment.authorId))
        .where(eq(bugReportComment.bugReportId, report.id))
        .orderBy(asc(bugReportComment.createdAt))

      return {
        ...(await toSharedReport(
          report,
          pageRow?.page ?? "/",
          comments.length
        )),
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          source: c.source === "client" ? "client" : "team",
          authorName:
            (c.source === "client" ? c.clientName : c.teamName) ?? "Unknown",
        })),
      }
    }
  )

// Simple in-memory limit per link: enough to stop a script flooding a project.
const COMMENT_WINDOW_MS = 10 * 60 * 1000
const COMMENTS_PER_WINDOW = 30
const recentComments = new Map<string, number[]>()

function assertCommentRateLimit(token: string) {
  const now = Date.now()
  const times = (recentComments.get(token) ?? []).filter(
    (t) => now - t < COMMENT_WINDOW_MS
  )
  if (times.length >= COMMENTS_PER_WINDOW) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many comments in a short time. Try again in a few minutes.",
    })
  }
  times.push(now)
  recentComments.set(token, times)
}

export const addSharedComment = o
  .input(
    z.object({
      token: tokenSchema,
      reportId: z.string().min(1),
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(200),
      body: z.string().trim().min(1).max(5000),
    })
  )
  .handler(async ({ input }): Promise<{ id: string }> => {
    const project = await requireProjectByToken(input.token)
    const report = await requireReportInProject(project.id, input.reportId)
    assertCommentRateLimit(input.token)

    const id = nanoid(12)
    await db.insert(bugReportComment).values({
      id,
      bugReportId: report.id,
      organizationId: report.organizationId,
      authorId: null,
      source: "client",
      authorName: input.name,
      authorEmail: input.email,
      body: input.body,
    })

    await createNotification({
      organizationId: report.organizationId,
      type: "client_comment",
      bugReportId: report.id,
      commentId: id,
      capturePublicKeyId: project.id,
      actorName: input.name,
    })
    return { id }
  })
