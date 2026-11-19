// Projects: each capture key is a project (one client site, with its staging URLs).
// Team-only procedures for the dashboard's project folders and their client share links.
import { randomBytes } from "node:crypto"
import { db } from "@crikket/db"
import { bugReport, capturePublicKey } from "@crikket/db/schema/bug-report"
import { ORPCError } from "@orpc/server"
import { and, count, desc, eq, max, sql } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure } from "./context"
import { requireActiveOrgId } from "./helpers"

// Statuses that still need work (not done, closed or cancelled).
const OPEN_STATUSES = sql`('to_do', 'planning', 'blocked', 'client_action', 'fast_follow')`

export interface ProjectSummary {
  id: string
  name: string
  sites: string[]
  status: string
  reportCount: number
  openCount: number
  lastReportAt: string | null
  // Null when the project has no client share link.
  shareToken: string | null
  // The widget tab colour (#rrggbb); null uses Heard's default.
  widgetColor: string | null
}

export const WIDGET_COLOR_PATTERN = /^#[0-9a-f]{6}$/

function newShareToken(): string {
  return randomBytes(24).toString("base64url")
}

async function requireProject(projectId: string, organizationId: string) {
  const project = await db.query.capturePublicKey.findFirst({
    where: and(
      eq(capturePublicKey.id, projectId),
      eq(capturePublicKey.organizationId, organizationId)
    ),
  })
  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }
  return project
}

async function summarize(organizationId: string, projectId?: string) {
  const keys = await db.query.capturePublicKey.findMany({
    where: projectId
      ? and(
          eq(capturePublicKey.organizationId, organizationId),
          eq(capturePublicKey.id, projectId)
        )
      : eq(capturePublicKey.organizationId, organizationId),
    orderBy: [desc(capturePublicKey.createdAt)],
  })

  const stats = await db
    .select({
      projectId: bugReport.capturePublicKeyId,
      total: count(),
      open: sql<number>`SUM(CASE WHEN ${bugReport.status} IN ${OPEN_STATUSES} THEN 1 ELSE 0 END)`,
      last: max(bugReport.createdAt),
    })
    .from(bugReport)
    .where(eq(bugReport.organizationId, organizationId))
    .groupBy(bugReport.capturePublicKeyId)

  const byProject = new Map(stats.map((row) => [row.projectId, row]))

  const projects: ProjectSummary[] = keys.map((key) => {
    const row = byProject.get(key.id)
    return {
      id: key.id,
      name: key.label,
      sites: key.allowedOrigins,
      status: key.status,
      reportCount: Number(row?.total ?? 0),
      openCount: Number(row?.open ?? 0),
      lastReportAt: row?.last ? row.last.toISOString() : null,
      shareToken: key.shareToken ?? null,
      widgetColor: key.widgetColor ?? null,
    }
  })

  // Most recently active first; projects with no reports by creation date.
  projects.sort(
    (a, b) =>
      (b.lastReportAt ?? "").localeCompare(a.lastReportAt ?? "") ||
      a.name.localeCompare(b.name)
  )

  const unassigned = byProject.get(null)
  return {
    projects,
    unassignedCount: Number(unassigned?.total ?? 0),
  }
}

export const listProjects = protectedProcedure.handler(({ context }) => {
  const organizationId = requireActiveOrgId(context.session)
  return summarize(organizationId)
})

export const getProject = protectedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<ProjectSummary> => {
    const organizationId = requireActiveOrgId(context.session)
    const { projects } = await summarize(organizationId, input.projectId)
    const project = projects[0]
    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    return project
  })

// Creates the client share link, or replaces it (the old link stops working).
export const regenerateProjectShareLink = protectedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<{ shareToken: string }> => {
    const organizationId = requireActiveOrgId(context.session)
    await requireProject(input.projectId, organizationId)
    const shareToken = newShareToken()
    await db
      .update(capturePublicKey)
      .set({ shareToken })
      .where(eq(capturePublicKey.id, input.projectId))
    return { shareToken }
  })

export const disableProjectShareLink = protectedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<{ ok: true }> => {
    const organizationId = requireActiveOrgId(context.session)
    await requireProject(input.projectId, organizationId)
    await db
      .update(capturePublicKey)
      .set({ shareToken: null })
      .where(eq(capturePublicKey.id, input.projectId))
    return { ok: true }
  })

// Sets the colour of the widget's "Report issue" tab on this project's sites (null = default).
// Sites pick it up within about a minute (the site check is cached briefly).
export const setProjectWidgetColor = protectedProcedure
  .input(
    z.object({
      projectId: z.string().min(1),
      color: z
        .string()
        .trim()
        .toLowerCase()
        .regex(WIDGET_COLOR_PATTERN, "Use a hex colour like #ff6b35")
        .nullable(),
    })
  )
  .handler(
    async ({ context, input }): Promise<{ widgetColor: string | null }> => {
      const organizationId = requireActiveOrgId(context.session)
      await requireProject(input.projectId, organizationId)
      await db
        .update(capturePublicKey)
        .set({ widgetColor: input.color })
        .where(eq(capturePublicKey.id, input.projectId))
      return { widgetColor: input.color }
    }
  )
