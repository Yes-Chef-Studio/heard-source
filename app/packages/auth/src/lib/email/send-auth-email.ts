import { env } from "@crikket/env/server"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { Resend } from "resend"

type SendAuthEmailInput = {
  to: string
  subject: string
  text: string
  react: ReactElement
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const fromEmail = env.RESEND_FROM_EMAIL
const fromName = "Heard"

export const sendAuthEmail = async ({
  to,
  subject,
  text,
  react,
}: SendAuthEmailInput): Promise<void> => {
  // Heard runs without email: accounts are created and reset by an admin
  // (apps/server/scripts/users.ts). Set RESEND_API_KEY to turn emails back on.
  if (!resendClient) {
    console.warn(
      `[email] Email is off (no RESEND_API_KEY). Not sent: ${subject}`
    )
    return
  }

  if (!fromEmail) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL. Set RESEND_FROM_EMAIL in apps/server/.env."
    )
  }

  const html = await render(react)

  const { error } = await resendClient.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  })

  if (error) {
    throw new Error(`Failed to send auth email: ${error.message}`)
  }
}
