import { env } from "@crikket/env/web"
import { polarClient } from "@polar-sh/better-auth"
import type { BetterAuthClientOptions } from "better-auth/client"
import {
  adminClient,
  emailOTPClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

// Server-side (SSR, metadata) calls use HEARD_INTERNAL_SERVER_URL when set, so the dashboard reaches
// the API over localhost instead of going out and back through the public domain (on Cloudflare a
// container can't reach its own public address). Browsers always use the public URL.
const serverBaseURL =
  typeof window === "undefined" && process.env.HEARD_INTERNAL_SERVER_URL
    ? process.env.HEARD_INTERNAL_SERVER_URL
    : env.NEXT_PUBLIC_SERVER_URL

const adminPlugin = adminClient()
const emailOtpPlugin = emailOTPClient()
const organizationPlugin = organizationClient()
const polarPlugin: ReturnType<typeof polarClient> = polarClient()

type AuthClientOptions = {
  baseURL: string
  plugins: [
    typeof adminPlugin,
    typeof emailOtpPlugin,
    typeof organizationPlugin,
    typeof polarPlugin,
  ]
}

type AuthClient<Option extends BetterAuthClientOptions> = ReturnType<
  typeof createAuthClient<Option>
>

export const authClient: AuthClient<AuthClientOptions> = createAuthClient({
  baseURL: serverBaseURL,
  plugins: [adminPlugin, emailOtpPlugin, organizationPlugin, polarPlugin],
})
