"use client"

import { env } from "@crikket/env/web"
import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"

import { toast } from "sonner"

import type { OrganizationInvitationRow } from "./types"

interface PendingInvitationsProps {
  invitations: OrganizationInvitationRow[]
  canManageMembers: boolean
  cancelingInvitationId: string | null
  onCancelInvitation: (invitationId: string) => Promise<void>
}

function inviteLink(invitationId: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/invite/${invitationId}`
}

async function copyInviteLink(invitationId: string, email: string) {
  try {
    await navigator.clipboard.writeText(inviteLink(invitationId))
    toast.success(
      `Link copied. Send it to ${email} yourself; Heard doesn't email it.`
    )
  } catch {
    toast.error("Couldn't copy. Select the link and copy it by hand.")
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

export function PendingInvitations({
  invitations,
  canManageMembers,
  cancelingInvitationId,
  onCancelInvitation,
}: PendingInvitationsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pending Invitations</CardTitle>
        <p className="text-muted-foreground text-sm">
          Heard doesn't send emails. Copy each invite link and send it
          privately; it works once and expires after two days.
        </p>
      </CardHeader>
      <CardContent>
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <div className="space-y-3">
            {invitations.map((invitation) => {
              const isCanceling =
                cancelingInvitationId === invitation.invitationId

              return (
                <div
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={invitation.invitationId}
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{invitation.email}</p>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <Badge variant="outline">{invitation.role}</Badge>
                      <span>Invited {formatDate(invitation.createdAt)}</span>
                      <span>Expires {formatDate(invitation.expiresAt)}</span>
                    </div>
                  </div>
                  {canManageMembers ? (
                    <div className="flex gap-2">
                      <Button
                        onClick={() =>
                          copyInviteLink(
                            invitation.invitationId,
                            invitation.email
                          )
                        }
                        size="sm"
                      >
                        Copy link
                      </Button>
                      <Button
                        disabled={isCanceling}
                        onClick={async () =>
                          onCancelInvitation(invitation.invitationId)
                        }
                        size="sm"
                        variant="outline"
                      >
                        {isCanceling ? "Canceling..." : "Cancel invite"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
