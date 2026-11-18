// Invite links: Heard sends no email, so an admin copies the invitation link from Settings and
// sends it themselves. Whoever opens it picks a name and password and lands in the workspace.
// The invitation id (32 random characters) is the secret in the link; it works once and expires.
import { randomBytes } from "node:crypto"
import { auth } from "@crikket/auth"
import { db } from "@crikket/db"
import {
  account,
  invitation,
  member,
  organization,
  user,
} from "@crikket/db/schema/auth"
import { ORPCError } from "@orpc/server"
import { and, eq, gt, sql } from "drizzle-orm"
import { z } from "zod"

import { o } from "../index"

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

function newId(): string {
  return Array.from(
    randomBytes(32),
    (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]
  ).join("")
}

const invitationIdSchema = z.string().min(16).max(64)

export type InviteStatus = "pending" | "expired" | "used"

export interface InviteSummary {
  email: string
  organizationName: string
  role: string
  status: InviteStatus
  // True when this email already has a Heard account (they sign in and accept instead).
  hasAccount: boolean
}

async function findInvite(invitationId: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      expired: sql<boolean>`${invitation.expiresAt} <= now()`,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, invitationId))
    .limit(1)
  return row ?? null
}

async function emailHasAccount(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1)
  return Boolean(row)
}

export const getInvite = o
  .input(z.object({ invitationId: invitationIdSchema }))
  .handler(async ({ input }): Promise<InviteSummary> => {
    const invite = await findInvite(input.invitationId)
    if (!invite) {
      throw new ORPCError("NOT_FOUND", { message: "Invite not found" })
    }
    let status: InviteStatus = "pending"
    if (invite.status !== "pending") status = "used"
    else if (invite.expired) status = "expired"
    return {
      email: invite.email,
      organizationName: invite.organizationName,
      role: invite.role ?? "member",
      status,
      hasAccount: await emailHasAccount(invite.email),
    }
  })

export const createAccountFromInvite = o
  .input(
    z.object({
      invitationId: invitationIdSchema,
      name: z.string().trim().min(1).max(100),
      password: z.string().min(8).max(128),
    })
  )
  .handler(async ({ input }): Promise<{ email: string }> => {
    const invite = await findInvite(input.invitationId)
    if (!invite || invite.status !== "pending" || invite.expired) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "This invite link has expired or was already used. Ask your Heard admin for a new one.",
      })
    }
    const email = invite.email.toLowerCase()
    if (await emailHasAccount(email)) {
      throw new ORPCError("CONFLICT", {
        message:
          "You already have a Heard account. Sign in to accept the invite.",
      })
    }

    const hash = await (await auth.$context).password.hash(input.password)
    const userId = newId()
    const now = new Date()

    await db.transaction(async (tx) => {
      // Claim the invite first so two submissions can't both use it.
      const claimed = await tx
        .update(invitation)
        .set({ status: "accepted" })
        .where(
          and(
            eq(invitation.id, invite.id),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, sql`now()`)
          )
        )
        .returning({ id: invitation.id })
      if (claimed.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This invite link was already used.",
        })
      }
      await tx.insert(user).values({
        id: userId,
        email,
        name: input.name,
        // The admin invited this address; there's no email to verify it with.
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(account).values({
        id: newId(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: hash,
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(member).values({
        id: newId(),
        organizationId: invite.organizationId,
        userId,
        role: invite.role ?? "member",
        createdAt: now,
      })
    })

    return { email }
  })

export const inviteRouter = {
  get: getInvite,
  createAccount: createAccountFromInvite,
}
