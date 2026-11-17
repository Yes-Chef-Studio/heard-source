import "@crikket/env/web"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    // Heard: local dev storage (moto S3) is on localhost:9000, which Next 16's optimizer blocks as
    // a private address. Allowed in development only.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      return []
    }

    return [
      {
        source: "/ph/:path*",
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
      },
    ]
  },
}

export default nextConfig
