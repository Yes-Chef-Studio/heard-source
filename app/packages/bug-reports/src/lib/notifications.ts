import { db } from "@crikket/db"
import { notification } from "@crikket/db/schema/bug-report"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { nanoid } from "nanoid"

export type NotificationType = "report_created" | "client_comment"

// Never fails the action that triggered it: a missed notification beats a lost report or comment.
export async function createNotification(input: {
  organizationId: string
  type: NotificationType
  bugReportId?: string | null
  commentId?: string | null
  capturePublicKeyId?: string | null
  actorName?: string | null
}): Promise<void> {
  try {
    await db.insert(notification).values({
      id: nanoid(16),
      organizationId: input.organizationId,
      type: input.type,
      bugReportId: input.bugReportId ?? null,
      commentId: input.commentId ?? null,
      capturePublicKeyId: input.capturePublicKeyId ?? null,
      actorName: input.actorName ?? null,
    })
  } catch (error) {
    reportNonFatalError("Failed to create notification", error)
  }
}
