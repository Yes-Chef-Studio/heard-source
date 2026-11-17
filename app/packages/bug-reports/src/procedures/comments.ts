import { db } from "@crikket/db"
import { user } from "@crikket/db/schema/auth"
import { bugReport, bugReportComment } from "@crikket/db/schema/bug-report"
import { ORPCError } from "@orpc/server"
import { and, asc, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import { protectedProcedure } from "./context"
import { requireActiveOrgId } from "./helpers"

export interface BugReportCommentItem {
  id: string
  body: string
  createdAt: string
  // Team comments: the signed-in member. Client comments: id is null, name/email self-reported.
  author: {
    id: string | null
    name: string
    image: string | null
    email: string | null
  } | null
  source: "team" | "client"
  isOwn: boolean
}

// One thread per report, shared with the client on the project's share link.
// Team procedures: the report must belong to the viewer's active organization.
async function requireReportInOrg(reportId: string, organizationId: string) {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, reportId),
      eq(bugReport.organizationId, organizationId)
    ),
    columns: { id: true },
  })
  if (!report) {
    throw new ORPCError("NOT_FOUND", { message: "Report not found" })
  }
}

function resolveAuthor(row: {
  source: string
  authorId: string | null
  authorName: string | null
  authorImage: string | null
  clientName: string | null
  clientEmail: string | null
}): BugReportCommentItem["author"] {
  if (row.source === "client") {
    return {
      id: null,
      name: row.clientName ?? "Client",
      image: null,
      email: row.clientEmail,
    }
  }
  return row.authorId
    ? {
        id: row.authorId,
        name: row.authorName ?? "Unknown",
        image: row.authorImage ?? null,
        email: null,
      }
    : null
}

export const listBugReportComments = protectedProcedure
  .input(z.object({ bugReportId: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<BugReportCommentItem[]> => {
    const organizationId = requireActiveOrgId(context.session)
    await requireReportInOrg(input.bugReportId, organizationId)

    const rows = await db
      .select({
        id: bugReportComment.id,
        body: bugReportComment.body,
        createdAt: bugReportComment.createdAt,
        authorId: user.id,
        authorName: user.name,
        authorImage: user.image,
        source: bugReportComment.source,
        clientName: bugReportComment.authorName,
        clientEmail: bugReportComment.authorEmail,
      })
      .from(bugReportComment)
      .leftJoin(user, eq(user.id, bugReportComment.authorId))
      .where(
        and(
          eq(bugReportComment.bugReportId, input.bugReportId),
          eq(bugReportComment.organizationId, organizationId)
        )
      )
      .orderBy(asc(bugReportComment.createdAt))

    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: resolveAuthor(row),
      source: row.source === "client" ? "client" : "team",
      isOwn: row.authorId === context.session.user.id,
    }))
  })

export const addBugReportComment = protectedProcedure
  .input(
    z.object({
      bugReportId: z.string().min(1),
      body: z.string().trim().min(1).max(5000),
    })
  )
  .handler(async ({ context, input }): Promise<{ id: string }> => {
    const organizationId = requireActiveOrgId(context.session)
    await requireReportInOrg(input.bugReportId, organizationId)

    const id = nanoid(12)
    await db.insert(bugReportComment).values({
      id,
      bugReportId: input.bugReportId,
      organizationId,
      authorId: context.session.user.id,
      source: "team",
      body: input.body,
    })
    return { id }
  })

// Authors can delete their own comments.
export const deleteBugReportComment = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<{ id: string }> => {
    const organizationId = requireActiveOrgId(context.session)
    const deleted = await db
      .delete(bugReportComment)
      .where(
        and(
          eq(bugReportComment.id, input.id),
          eq(bugReportComment.organizationId, organizationId),
          eq(bugReportComment.authorId, context.session.user.id)
        )
      )
      .returning({ id: bugReportComment.id })

    if (deleted.length === 0) {
      throw new ORPCError("NOT_FOUND", { message: "Comment not found" })
    }
    return { id: input.id }
  })
