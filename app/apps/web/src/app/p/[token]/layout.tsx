import type { AppRouterClient } from "@crikket/api/routers/index"
import { env } from "@crikket/env/web"
import { siteConfig } from "@crikket/shared/config/site"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { Metadata } from "next"
import type { ReactNode } from "react"

// Client share links are secret: never index them or leak them through referrers.
const base: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  try {
    const client: AppRouterClient = createORPCClient(
      new RPCLink({ url: `${env.NEXT_PUBLIC_SERVER_URL}/rpc` })
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
