// The dashboard's Notifications tab: new reports and client comments for the active org.
import { db } from "@crikket/db"
import {
  bugReport,
  bugReportComment,
  capturePublicKey,
  notification,
  notificationReadState,
} from "@crikket/db/schema/bug-report"
import { and, count, desc, eq, gt, lt, sql } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure } from "./context"
import { requireActiveOrgId } from "./helpers"

export interface NotificationItem {
  id: string
  type: "report_created" | "client_comment"
  createdAt: string
  unread: boolean
  actorName: string | null
  bugReportId: string | null
  reportTitle: string | null
  projectId: string | null
  projectName: string | null
  // First 200 characters of the client's comment, for client_comment.
  commentPreview: string | null
}

async function getLastReadAt(userId: string, organizationId: string) {
  const state = await db.query.notificationReadState.findFirst({
    where: and(
      eq(notificationReadState.userId, userId),
      eq(notificationReadState.organizationId, organizationId)
    ),
  })
  return state?.lastReadAt ?? new Date(0)
}

export const listNotifications = protectedProcedure
  .input(
    z
      .object({
        limit: z.number().int().min(1).max(100).default(50),
        // createdAt of the last item from the previous page.
        before: z.string().datetime().optional(),
      })
      .optional()
  )
  .handler(
    async ({
      context,
      input,
    }): Promise<{ items: NotificationItem[]; nextBefore: string | null }> => {
      const organizationId = requireActiveOrgId(context.session)
      const lastReadAt = await getLastReadAt(
        context.session.user.id,
        organizationId
      )
      const limit = input?.limit ?? 50

      const rows = await db
        .select({
          id: notification.id,
          type: notification.type,
          createdAt: notification.createdAt,
          actorName: notification.actorName,
          bugReportId: notification.bugReportId,
          reportTitle: bugReport.title,
          projectId: notification.capturePublicKeyId,
          projectName: capturePublicKey.label,
          commentBody: bugReportComment.body,
        })
        .from(notification)
        .leftJoin(bugReport, eq(bugReport.id, notification.bugReportId))
        .leftJoin(
          capturePublicKey,
          eq(capturePublicKey.id, notification.capturePublicKeyId)
        )
        .leftJoin(
          bugReportComment,
          eq(bugReportComment.id, notification.commentId)
        )
        .where(
          and(
            eq(notification.organizationId, organizationId),
            input?.before
              ? lt(notification.createdAt, new Date(input.before))
              : undefined
          )
        )
        .orderBy(desc(notification.createdAt))
        .limit(limit + 1)

      const page = rows.slice(0, limit)
      return {
        items: page.map((row) => ({
          id: row.id,
          type: row.type as NotificationItem["type"],
          createdAt: row.createdAt.toISOString(),
          unread: row.createdAt > lastReadAt,
          actorName: row.actorName,
          bugReportId: row.bugReportId,
          reportTitle: row.reportTitle,
          projectId: row.projectId,
          projectName: row.projectName,
          commentPreview: row.commentBody
            ? row.commentBody.slice(0, 200)
            : null,
        })),
        nextBefore:
          rows.length > limit
            ? (page.at(-1)?.createdAt.toISOString() ?? null)
            : null,
      }
    }
  )

export const getUnreadNotificationCount = protectedProcedure.handler(
  async ({ context }): Promise<{ count: number }> => {
    const organizationId = requireActiveOrgId(context.session)
    const lastReadAt = await getLastReadAt(
      context.session.user.id,
      organizationId
    )
    const [row] = await db
      .select({ value: count() })
      .from(notification)
      .where(
        and(
          eq(notification.organizationId, organizationId),
          gt(notification.createdAt, lastReadAt)
        )
      )
    return { count: Number(row?.value ?? 0) }
  }
)

export const markNotificationsRead = protectedProcedure.handler(
  async ({ context }): Promise<{ ok: true }> => {
    const organizationId = requireActiveOrgId(context.session)
    // Database clock, like notification.createdAt: a JS Date can differ by the server's
    // timezone offset in timestamp-without-timezone columns.
    const now = sql`now()`
    await db
      .insert(notificationReadState)
      .values({
        userId: context.session.user.id,
        organizationId,
        lastReadAt: now,
      })
      .onConflictDoUpdate({
        target: [
          notificationReadState.userId,
          notificationReadState.organizationId,
        ],
        set: { lastReadAt: now },
      })
    return { ok: true }
  }
)
