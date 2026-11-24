import { describe, expect, it } from "bun:test"
import {
  CATEGORIES,
  normalizeCategory,
} from "@crikket/shared/constants/categories"
import {
  classifyBrowser,
  classifyDevice,
} from "@crikket/shared/constants/device"

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  operaWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1",
  chromeAndroidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxAndroidPhone:
    "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0",
}

describe("classifyBrowser", () => {
  it("names the four browsers the team filters on", () => {
    expect(classifyBrowser(UA.chromeMac)).toBe("chrome")
    expect(classifyBrowser(UA.safariMac)).toBe("safari")
    expect(classifyBrowser(UA.firefoxWindows)).toBe("firefox")
    expect(classifyBrowser(UA.edgeWindows)).toBe("edge")
  })

  it("reads the iOS and Android builds as the same browser", () => {
    expect(classifyBrowser(UA.safariIphone)).toBe("safari")
    expect(classifyBrowser(UA.chromeIphone)).toBe("chrome")
    expect(classifyBrowser(UA.chromeAndroidPhone)).toBe("chrome")
    expect(classifyBrowser(UA.firefoxAndroidPhone)).toBe("firefox")
  })

  it("files everything else, and missing user agents, under other", () => {
    expect(classifyBrowser(UA.operaWindows)).toBe("other")
    expect(classifyBrowser("curl/8.7.1")).toBe("other")
    expect(classifyBrowser(undefined)).toBe("other")
    expect(classifyBrowser("")).toBe("other")
  })
})

describe("classifyDevice", () => {
  it("is desktop for a desktop user agent on a wide viewport", () => {
    expect(
      classifyDevice({ userAgent: UA.chromeMac, viewport: "1440x900" })
    ).toBe("desktop")
    expect(
      classifyDevice({ userAgent: UA.chromeMac, viewport: "768x900" })
    ).toBe("desktop")
  })

  it("is mobile for a mobile user agent, whatever the viewport", () => {
    expect(
      classifyDevice({ userAgent: UA.safariIphone, viewport: "390x844" })
    ).toBe("mobile")
    expect(
      classifyDevice({ userAgent: UA.chromeAndroidPhone, viewport: "915x412" })
    ).toBe("mobile")
    expect(
      classifyDevice({ userAgent: UA.firefoxAndroidPhone, viewport: undefined })
    ).toBe("mobile")
  })

  it("is mobile for a desktop user agent on a viewport under 768px", () => {
    expect(
      classifyDevice({ userAgent: UA.chromeMac, viewport: "767x900" })
    ).toBe("mobile")
    expect(classifyDevice({ userAgent: "", viewport: "375x667" })).toBe(
      "mobile"
    )
  })

  it("is tablet for tablet user agents, even on a narrow viewport", () => {
    expect(
      classifyDevice({ userAgent: UA.safariIpad, viewport: "744x1133" })
    ).toBe("tablet")
    expect(
      classifyDevice({
        userAgent: UA.chromeAndroidTablet,
        viewport: "1280x800",
      })
    ).toBe("tablet")
  })

  it("has no device when there is nothing to go on", () => {
    expect(classifyDevice({ userAgent: undefined, viewport: undefined })).toBe(
      null
    )
    expect(classifyDevice({ userAgent: "", viewport: "not a viewport" })).toBe(
      null
    )
  })
})

describe("normalizeCategory", () => {
  it("keeps known slugs and reads anything else as no category", () => {
    for (const category of CATEGORIES) {
      expect(normalizeCategory(category.value)).toBe(category.value)
    }
    expect(normalizeCategory("Copy")).toBe(null)
    expect(normalizeCategory("")).toBe(null)
    expect(normalizeCategory(null)).toBe(null)
    expect(normalizeCategory(undefined)).toBe(null)
  })
})
