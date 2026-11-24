// Heard: the browser and device a report was filed from, derived from what the widget stores in
// device_info: `browser` is the full user-agent string and `viewport` is "<width>x<height>".
//
// The patterns are plain alternations so the same source works as a JavaScript RegExp (here) and
// as a Postgres regular expression (the list filter in @crikket/bug-reports). Keep them that way.

export const BROWSERS = [
  { value: "chrome", label: "Chrome" },
  { value: "safari", label: "Safari" },
  { value: "firefox", label: "Firefox" },
  { value: "edge", label: "Edge" },
  { value: "other", label: "Other" },
] as const

export type Browser = (typeof BROWSERS)[number]["value"]

export const BROWSER_VALUES = BROWSERS.map((item) => item.value) as [
  Browser,
  ...Browser[],
]

export const DEVICES = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
] as const

export type Device = (typeof DEVICES)[number]["value"]

export const DEVICE_VALUES = DEVICES.map((item) => item.value) as [
  Device,
  ...Device[],
]

// Checked in this order; the first match wins. Edge, Opera and Samsung Internet all carry
// "Chrome/" and "Safari/" in their user agent, and Chrome carries "Safari/", hence the order.
export const BROWSER_UA_PATTERNS = {
  edge: "Edg(e|A|iOS)?/",
  firefox: "(Firefox|FxiOS)/",
  // Chromium browsers the team did not ask for by name. They count as "other".
  otherChromium: "(OPR|SamsungBrowser)/",
  chrome: "(Chrome|CriOS|Chromium)/",
  safari: "Safari/",
} as const

export const DEVICE_UA_PATTERNS = {
  tablet: "iPad|Tablet|PlayBook|Silk|Kindle",
  android: "Android",
  // Android phones say "Mobile"; Android tablets do not.
  mobile: "Mobi|iPhone|iPod|Windows Phone",
} as const

// A viewport narrower than this counts as mobile even with a desktop user agent.
export const MOBILE_MAX_VIEWPORT_WIDTH = 768

// The leading width of "<width>x<height>".
export const VIEWPORT_WIDTH_PATTERN = "^([0-9]{1,6})x"

function matches(pattern: string, value: string): boolean {
  return new RegExp(pattern).test(value)
}

export function classifyBrowser(userAgent: string | null | undefined): Browser {
  const ua = userAgent ?? ""
  if (matches(BROWSER_UA_PATTERNS.edge, ua)) return "edge"
  if (matches(BROWSER_UA_PATTERNS.firefox, ua)) return "firefox"
  if (matches(BROWSER_UA_PATTERNS.otherChromium, ua)) return "other"
  if (matches(BROWSER_UA_PATTERNS.chrome, ua)) return "chrome"
  if (matches(BROWSER_UA_PATTERNS.safari, ua)) return "safari"
  return "other"
}

export function parseViewportWidth(
  viewport: string | null | undefined
): number | null {
  const match = new RegExp(VIEWPORT_WIDTH_PATTERN).exec(viewport ?? "")
  return match?.[1] ? Number(match[1]) : null
}

// Tablet first (by user agent), then mobile (mobile user agent, or a viewport narrower than
// 768px), otherwise desktop. A report with neither a user agent nor a viewport has no device.
export function classifyDevice(input: {
  userAgent: string | null | undefined
  viewport: string | null | undefined
}): Device | null {
  const ua = input.userAgent ?? ""
  const width = parseViewportWidth(input.viewport)
  if (ua === "" && width === null) return null

  if (
    matches(DEVICE_UA_PATTERNS.tablet, ua) ||
    (matches(DEVICE_UA_PATTERNS.android, ua) &&
      !matches(DEVICE_UA_PATTERNS.mobile, ua))
  ) {
    return "tablet"
  }
  if (
    matches(DEVICE_UA_PATTERNS.mobile, ua) ||
    (width !== null && width < MOBILE_MAX_VIEWPORT_WIDTH)
  ) {
    return "mobile"
  }
  return "desktop"
}
