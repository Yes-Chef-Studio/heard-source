import { env } from "@crikket/env/web"

// Server-side (SSR, metadata) calls use HEARD_INTERNAL_SERVER_URL when set, so the dashboard reaches
// the API over localhost instead of going out and back through the public domain (on Cloudflare a
// container can't reach its own public address). Browsers always use the public URL.
export const apiBaseURL =
  typeof window === "undefined" && process.env.HEARD_INTERNAL_SERVER_URL
    ? process.env.HEARD_INTERNAL_SERVER_URL
    : env.NEXT_PUBLIC_SERVER_URL

export const rpcURL = `${apiBaseURL}/rpc`
