"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import { Button } from "@crikket/ui/components/ui/button"
import { Field, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "nextjs-toploader/app"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { client } from "@/utils/orpc"

interface InvitationClientViewProps {
  invitationId: string
}

const MIN_PASSWORD = 8

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function InvitationClientView({
  invitationId,
}: InvitationClientViewProps) {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const invite = useQuery({
    queryKey: ["invite", invitationId],
    queryFn: () => client.invite.get({ invitationId }),
    retry: false,
    meta: { silent: true },
  })

  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${invitationId}`
  const loginHref = `/login?callbackURL=${encodeURIComponent(callbackUrl)}`

  const joinWorkspace = async (organizationId?: string) => {
    if (organizationId) {
      await authClient.organization.setActive({ organizationId })
    }
    router.push("/")
    router.refresh()
  }

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.organization.acceptInvitation({
        invitationId,
      })
      if (error) throw error
      await joinWorkspace(data?.invitation?.organizationId)
    },
    onSuccess: () => toast.success("You've joined the workspace"),
    onError: (error) =>
      toast.error(errorMessage(error, "Couldn't accept the invite")),
  })

  if (invite.isPending || sessionPending) {
    return (
      <Shell description="One moment.">
        <p className="text-muted-foreground text-sm">Loading invite…</p>
      </Shell>
    )
  }

  if (invite.isError || invite.data.status !== "pending") {
    return (
      <Shell description="This invite link can't be used.">
        <p className="text-muted-foreground text-sm">
          It has expired or was already used. Ask your Heard admin for a new
          link.
        </p>
        {session ? null : (
          <Button onClick={() => router.push("/login")} variant="outline">
            Go to sign in
          </Button>
        )}
      </Shell>
    )
  }

  const { email, organizationName } = invite.data

  if (session) {
    const sameEmail = session.user.email.toLowerCase() === email.toLowerCase()
    return (
      <Shell description={`You've been invited to ${organizationName}.`}>
        {sameEmail ? (
          <Button
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
            size="lg"
          >
            {acceptMutation.isPending ? "Joining…" : `Join ${organizationName}`}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            This invite is for {email}, but you're signed in as{" "}
            {session.user.email}. Sign out, then open the link again.
          </p>
        )}
      </Shell>
    )
  }

  if (invite.data.hasAccount) {
    return (
      <Shell description={`You've been invited to ${organizationName}.`}>
        <p className="text-muted-foreground text-sm">
          {email} already has a Heard account. Sign in to accept.
        </p>
        <Button onClick={() => router.push(loginHref as never)} size="lg">
          Sign in to accept
        </Button>
      </Shell>
    )
  }

  return (
    <Shell
      description={`You've been invited to ${organizationName}. Choose a password to finish.`}
    >
      <CreateAccountForm
        email={email}
        invitationId={invitationId}
        onDone={joinWorkspace}
      />
    </Shell>
  )
}

function Shell({
  description,
  children,
}: {
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <AuthShell description={description} title="Join Heard">
        <div className="flex flex-col gap-4">{children}</div>
      </AuthShell>
    </main>
  )
}

function CreateAccountForm({
  email,
  invitationId,
  onDone,
}: {
  email: string
  invitationId: string
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      await client.invite.createAccount({ invitationId, name, password })
      const { error } = await authClient.signIn.email({ email, password })
      if (error) throw error
      await onDone()
    },
    onSuccess: () => toast.success("Welcome to Heard"),
    onError: (error) =>
      setProblem(errorMessage(error, "Couldn't create your account")),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setProblem("Add your name.")
    if (password.length < MIN_PASSWORD) {
      return setProblem(`Use at least ${MIN_PASSWORD} characters.`)
    }
    if (password !== confirm) return setProblem("The passwords don't match.")
    setProblem(null)
    create.mutate()
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="invite-email">Email</FieldLabel>
        <Input disabled id="invite-email" value={email} />
      </Field>
      <Field>
        <FieldLabel htmlFor="invite-name">Your name</FieldLabel>
        <Input
          autoComplete="name"
          id="invite-name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="invite-password">Password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="invite-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="invite-confirm">Confirm password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="invite-confirm"
          onChange={(event) => setConfirm(event.target.value)}
          type="password"
          value={confirm}
        />
      </Field>
      {problem ? (
        <p className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      <Button disabled={create.isPending} size="lg" type="submit">
        {create.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  )
}
