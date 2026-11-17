// Manage team accounts by hand (Heard sends no email, so there's no self-service sign-up or reset).
//
// Locally:     cd app/apps/server && bun scripts/users.ts <command>
// In Docker:   docker compose -f docker-compose.heard.yml --env-file deploy/heard.env \
//                exec server bun apps/server/scripts/users.ts <command>
//
// Commands:
//   list
//   add <email> "<Name>" [--org <slug>] [--role member|admin|owner] [--password <pw>]
//   set-password <email> [--password <pw>]
//
// Without --password a random one is generated and printed once. Share it privately.
import { randomBytes } from "node:crypto"
import { auth } from "@crikket/auth"
import { db } from "@crikket/db"
import { account, member, organization, user } from "@crikket/db/schema/auth"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"

const ROLES = new Set(["member", "admin", "owner"])

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index > -1 ? args[index + 1] : undefined
}

function newPassword(): string {
  return randomBytes(12).toString("base64url")
}

async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Passwords need at least 8 characters.")
  }
  const context = await auth.$context
  return context.password.hash(password)
}

async function findOrganization(slug?: string) {
  if (slug) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.slug, slug),
    })
    if (!org) throw new Error(`No organization with slug "${slug}".`)
    return org
  }
  const orgs = await db.select().from(organization).limit(2)
  if (orgs.length !== 1) {
    throw new Error(
      "There's more than one organization (or none): pass --org <slug>. Run `list` to see slugs."
    )
  }
  return orgs[0]
}

async function list() {
  const rows = await db
    .select({
      email: user.email,
      name: user.name,
      org: organization.slug,
      role: member.role,
    })
    .from(user)
    .leftJoin(member, eq(member.userId, user.id))
    .leftJoin(organization, eq(organization.id, member.organizationId))
  for (const row of rows) {
    console.log(
      `${row.email.padEnd(36)} ${row.name.padEnd(24)} ${row.org ?? "-"} (${row.role ?? "no org"})`
    )
  }
}

async function add(args: string[]) {
  const [email, name] = args
  if (!(email && name)) {
    throw new Error(
      'Usage: add <email> "<Name>" [--org <slug>] [--role member|admin|owner]'
    )
  }
  const role = option(args, "role") ?? "member"
  if (!ROLES.has(role)) throw new Error("Role must be member, admin or owner.")
  const org = await findOrganization(option(args, "org"))
  const password = option(args, "password") ?? newPassword()
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await db.query.user.findFirst({
    where: eq(user.email, normalizedEmail),
  })
  if (existing) throw new Error(`${normalizedEmail} already has an account.`)

  const userId = nanoid(32)
  const now = new Date()
  const hash = await hashPassword(password)
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      // Nothing to verify without email; the admin vouches for the address.
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(account).values({
      id: nanoid(32),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hash,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(member).values({
      id: nanoid(32),
      organizationId: org.id,
      userId,
      role,
      createdAt: now,
    })
  })

  console.log(`Added ${normalizedEmail} to ${org.name} as ${role}.`)
  if (!option(args, "password")) console.log(`Temporary password: ${password}`)
}

async function setPassword(args: string[]) {
  const [email] = args
  if (!email) throw new Error("Usage: set-password <email> [--password <pw>]")
  const target = await db.query.user.findFirst({
    where: eq(user.email, email.trim().toLowerCase()),
  })
  if (!target) throw new Error(`No account for ${email}.`)
  const password = option(args, "password") ?? newPassword()
  const hash = await hashPassword(password)
  const updated = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(
      and(eq(account.userId, target.id), eq(account.providerId, "credential"))
    )
    .returning({ id: account.id })
  if (updated.length === 0) {
    await db.insert(account).values({
      id: nanoid(32),
      userId: target.id,
      accountId: target.id,
      providerId: "credential",
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
  console.log(`Password updated for ${target.email}.`)
  if (!option(args, "password")) console.log(`Temporary password: ${password}`)
}

const [command, ...rest] = process.argv.slice(2)
try {
  if (command === "list") await list()
  else if (command === "add") await add(rest)
  else if (command === "set-password") await setPassword(rest)
  else {
    console.log(
      'Commands: list | add <email> "<Name>" [--org <slug>] [--role member|admin|owner] [--password <pw>] | set-password <email> [--password <pw>]'
    )
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  process.exit()
}
