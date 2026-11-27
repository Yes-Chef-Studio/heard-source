import type { AppRouterClient } from "@crikket/api/routers/index"
import { siteConfig } from "@crikket/shared/config/site"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { Metadata } from "next"
import type { ReactNode } from "react"
import { rpcURL } from "@/lib/api-url"

// Client share links are secret: never index them or leak them through referrers.
// "same-origin" sends the referrer to Heard itself only, never to other sites. (Not "no-referrer":
// the feedback widget's site check needs to see that requests come from Heard's own pages.)
const base: Metadata = {
  robots: { index: false, follow: false },
  referrer: "same-origin",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  try {
    const client: AppRouterClient = createORPCClient(
      new RPCLink({ url: rpcURL })
    )
    const project = await client.share.getProject({ token })
    return { ...base, title: `${project.name} feedback` }
  } catch {
    return { ...base, title: `${siteConfig.name} feedback` }
  }
}

export default function ShareLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-muted/30">{children}</div>
}
