import { env } from "@crikket/env/web"
import "@crikket/ui/styles/dashboard.css"
import { siteConfig } from "@crikket/shared/config/site"
import type { Metadata } from "next"
import { Geist, Geist_Mono, IBM_Plex_Mono, Unbounded } from "next/font/google"
import NextTopLoader from "nextjs-toploader"
import Providers from "@/components/providers"

// Yes Chef brand type, as on yeschef.studio: Unbounded for headings, Geist for text, IBM Plex
// Mono for labels and code. Geist Mono is kept only for the Heard wordmark (see heard-logo.tsx).
// next/font self-hosts these at build time, so no request goes to Google at runtime.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const unbounded = Unbounded({
  subsets: ["latin"],
  variable: "--font-unbounded",
})
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      {
        url: "/favicon/favicon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/favicon/favicon-96x96.png",
        sizes: "96x96",
        type: "image/png",
      },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon/favicon.ico"],
  },
  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "default",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      className={`${geist.variable} ${unbounded.variable} ${plexMono.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <NextTopLoader />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
