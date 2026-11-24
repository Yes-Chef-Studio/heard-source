// Heard: SQL for the dashboard's browser, device and person filters. Nothing is stored for these;
// they are derived per row from device_info (see @crikket/shared/constants/device for the rule,
// which these expressions mirror one to one) and from the reporter columns.
import { bugReport } from "@crikket/db/schema/bug-report"
import {
  BROWSER_UA_PATTERNS,
  DEVICE_UA_PATTERNS,
  MOBILE_MAX_VIEWPORT_WIDTH,
  VIEWPORT_WIDTH_PATTERN,
} from "@crikket/shared/constants/device"
import { type SQL, sql } from "drizzle-orm"

const userAgent = sql`coalesce(${bugReport.deviceInfo}->>'browser', '')`
const viewportWidth = sql`substring(${bugReport.deviceInfo}->>'viewport' from ${VIEWPORT_WIDTH_PATTERN})::int`

export const reportBrowser: SQL<string> = sql<string>`(CASE
  WHEN ${userAgent} ~ ${BROWSER_UA_PATTERNS.edge} THEN 'edge'
  WHEN ${userAgent} ~ ${BROWSER_UA_PATTERNS.firefox} THEN 'firefox'
  WHEN ${userAgent} ~ ${BROWSER_UA_PATTERNS.otherChromium} THEN 'other'
  WHEN ${userAgent} ~ ${BROWSER_UA_PATTERNS.chrome} THEN 'chrome'
  WHEN ${userAgent} ~ ${BROWSER_UA_PATTERNS.safari} THEN 'safari'
  ELSE 'other'
END)`

// Null when the report has neither a user agent nor a readable viewport.
export const reportDevice: SQL<string | null> = sql<string | null>`(CASE
  WHEN ${userAgent} = '' AND ${viewportWidth} IS NULL THEN NULL
  WHEN ${userAgent} ~ ${DEVICE_UA_PATTERNS.tablet}
    OR (${userAgent} ~ ${DEVICE_UA_PATTERNS.android} AND ${userAgent} !~ ${DEVICE_UA_PATTERNS.mobile})
    THEN 'tablet'
  WHEN ${userAgent} ~ ${DEVICE_UA_PATTERNS.mobile}
    OR ${viewportWidth} < ${MOBILE_MAX_VIEWPORT_WIDTH}
    THEN 'mobile'
  ELSE 'desktop'
END)`

// Widget reports carry a self-reported name and email; dashboard and extension uploads have a
// signed-in user instead. The "user" table is written out by hand (not as a Drizzle column) so
// these work inside relational queries, which re-alias every column they find to the root table.
const signedInEmail = sql`(select u.email from "user" u where u.id = ${bugReport.reporterId})`
const signedInName = sql`(select u.name from "user" u where u.id = ${bugReport.reporterId})`

export const reportPersonEmail: SQL<string | null> = sql<
  string | null
>`coalesce(nullif(trim(${bugReport.reporterEmail}), ''), ${signedInEmail})`
export const reportPersonName: SQL<string | null> = sql<
  string | null
>`coalesce(nullif(trim(${bugReport.reporterName}), ''), ${signedInName})`

// One person = one email (case-insensitive); reports without an email fall back to the name.
export const reportPersonKey: SQL<string | null> = sql<
  string | null
>`lower(coalesce(${reportPersonEmail}, ${reportPersonName}))`
