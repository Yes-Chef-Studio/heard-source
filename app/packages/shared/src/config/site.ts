export const siteConfig = {
  // Product name everywhere in the UI (tab titles, wordmark, emails). Rename here.
  name: "Heard",
  title: "Heard",
  description: "Client feedback on staging sites, by Yes Chef Studio.",
  keywords: [
    "bug reporting",
    "bug tracker",
    "issue reporting",
    "developer tools",
    "open source",
  ],
  seo: {
    titleTemplate: "%s | Heard",
    canonicalPath: "/",
    locale: "en_US",
    openGraphType: "website" as const,
    twitterCard: "summary_large_image" as const,
    defaultOgImage: "/og.png",
  },
  author: {
    name: "Yes Chef Studio",
    twitter: "",
  },
  // Heard is a fork of Crikket (AGPL-3.0): https://github.com/redpangilinan/crikket
  // AGPL section 13: everyone who uses Heard over the network (clients included) must be
  // offered its source. `source` is the public copy kept current by scripts/publish-source.sh.
  links: {
    source: "https://github.com/Yes-Chef-Studio/heard-source",
    upstream: "https://github.com/redpangilinan/crikket",
    repo: "https://github.com/brandonhorvaticpersonal/heard",
    github: "https://github.com/brandonhorvaticpersonal",
    twitter: "",
  },
}
