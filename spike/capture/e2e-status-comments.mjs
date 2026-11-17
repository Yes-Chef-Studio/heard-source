// End-to-end check for the status dropdown, comments and priorities, against a running local stack.
// Creates a throwaway user + org, exercises the UI, then deletes them.
// Usage: node e2e-status-comments.mjs [--web http://localhost:3101] [--api http://localhost:3100]
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WEB = arg("--web", "http://localhost:3101");
const API = arg("--api", "http://localhost:3100");
const require = createRequire(process.env.PG_FROM || "/Users/user/heard-devtools/package.json");
const pg = require("pg");
const db = new pg.Client(process.env.DATABASE_URL || "postgres://heard:heard@localhost:5433/heard");
await db.connect();

const tag = randomBytes(4).toString("hex");
const email = `e2e-${tag}@example.test`;
const password = randomBytes(12).toString("hex");
let userId;
let orgId;
let reportIdForDebug;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => msg.type() === "error" && browserErrors.push(`console: ${msg.text()}`));
  page.on("response", (r) => r.url().includes("/rpc/") && r.status() >= 400 && browserErrors.push(`rpc ${r.status()} ${r.url()}`));
  globalThis.browserErrors = browserErrors;
  const headers = { origin: WEB, "content-type": "application/json" };

  let res = await page.request.post(`${API}/api/auth/sign-up/email`, {
    headers,
    data: { email, password, name: "E2E Tester" },
  });
  check("sign up throwaway user", res.ok(), String(res.status()));
  userId = (await res.json()).user?.id;

  res = await page.request.post(`${API}/api/auth/organization/create`, {
    headers,
    data: { name: `E2E ${tag}`, slug: `e2e-${tag}` },
  });
  check("create throwaway org", res.ok(), String(res.status()));
  orgId = (await res.json()).id;
  await page.request.post(`${API}/api/auth/organization/set-active`, {
    headers,
    data: { organizationId: orgId },
  });

  const reportId = `e2e${tag}`;
  reportIdForDebug = reportId;
  await db.query(
    `insert into bug_report (id, organization_id, title, description, url, attachment_type, submission_status, reporter_name, reporter_email)
     values ($1, $2, 'E2E report', 'Created by the e2e test', 'https://staging.example.test/pricing', 'screenshot', 'ready', 'Clarisa Client', 'clarisa@client.example')`,
    [reportId, orgId]
  );
  const fresh = await db.query("select status, priority from bug_report where id = $1", [reportId]);
  check("new reports default to To do / Normal", fresh.rows[0].status === "to_do" && fresh.rows[0].priority === "normal", JSON.stringify(fresh.rows[0]));

  // Dashboard card: status chip opens the grouped dropdown.
  await page.goto(`${WEB}/feedback`, { waitUntil: "networkidle", timeout: 120_000 });
  const chip = page.getByRole("button", { name: "Change status" }).first();
  await chip.waitFor({ timeout: 60_000 });
  check("card shows the reviewer", await page.getByText("From Clarisa Client").first().isVisible());
  check("card shows status chip", (await chip.innerText()).toUpperCase().includes("TO DO"), await chip.innerText());
  await chip.click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  const menuText = (await menu.innerText()).toUpperCase();
  const expected = ["TO DO", "PLANNING", "BLOCKED / CONFUSED", "CLIENT ACTION", "FAST FOLLOW", "FINAL CHECK", "CANCELLED", "CLOSED", "ACTIVE", "DONE"];
  const missing = expected.filter((label) => !menuText.includes(label));
  check("dropdown lists all statuses and groups", missing.length === 0, missing.join(", ") || "all present");
  await page.screenshot({ path: "e2e-status-menu.png" });
  await page.getByRole("menuitem", { name: /client action/i }).click();
  await page.waitForTimeout(1500);
  check("clicking the chip didn't open the report", !page.url().includes("/s/"), page.url());
  const afterCard = await db.query("select status from bug_report where id = $1", [reportId]);
  check("status saved from card", afterCard.rows[0].status === "client_action", afterCard.rows[0].status);
  check("card chip updated", (await chip.innerText()).toUpperCase().includes("CLIENT ACTION"), await chip.innerText());

  // Report page: header dropdown + comments.
  await page.goto(`${WEB}/s/${reportId}?tab=comments`, { waitUntil: "networkidle", timeout: 120_000 });
  const headerChip = page.getByRole("button", { name: "Change status" });
  await headerChip.waitFor({ timeout: 60_000 });
  await headerChip.click();
  await page.getByRole("menuitem", { name: /final check/i }).click();
  await page.waitForTimeout(1500);
  const afterHeader = await db.query("select status from bug_report where id = $1", [reportId]);
  check("status saved from report page", afterHeader.rows[0].status === "final_check", afterHeader.rows[0].status);

  // The page renders desktop and mobile layouts; the desktop one comes first.
  const box = page.getByPlaceholder("Write a comment…").first();
  await box.waitFor({ timeout: 30_000 });
  await box.fill("Logo is clipped on mobile. Can we check the header padding?");
  await page.getByRole("button", { name: "Comment", exact: true }).first().click();
  await page.locator("p", { hasText: "Logo is clipped on mobile" }).first().waitFor({ timeout: 15_000 });
  await box.fill("Second comment via Cmd+Enter");
  await box.press("Meta+Enter");
  await page.locator("p", { hasText: "Second comment via Cmd+Enter" }).first().waitFor({ timeout: 15_000 });
  const comments = await db.query("select body from bug_report_comment where bug_report_id = $1 order by created_at", [reportId]);
  check("comments saved", comments.rowCount === 2, `${comments.rowCount} rows`);
  check("author name shown", await page.getByText("E2E Tester").first().isVisible());
  await page.screenshot({ path: "e2e-comments.png" });

  await page.getByText("Second comment via Cmd+Enter").first().hover();
  await page.getByRole("button", { name: "Delete comment" }).nth(1).click();
  await page.getByText("Second comment via Cmd+Enter").first().waitFor({ state: "detached", timeout: 15_000 });
  const afterDelete = await db.query("select count(*)::int n from bug_report_comment where bug_report_id = $1", [reportId]);
  check("own comment deleted", afterDelete.rows[0].n === 1);

  // Details tab shows the new priority label.
  await page.goto(`${WEB}/s/${reportId}?tab=details`, { waitUntil: "networkidle" });
  await page.getByText("Normal: Nice to fix").first().waitFor({ timeout: 30_000 });
  check("priority label on report", await page.getByText("Normal: Nice to fix").first().isVisible());
  check("reviewer name on report", await page.getByText("Clarisa Client").first().isVisible());
  check("reviewer email on report", await page.getByRole("link", { name: "clarisa@client.example" }).first().isVisible());

  // Comments are team-only: a signed-out visitor can't list them.
  const anon = await fetch(`${API}/rpc/bugReport/listComments`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB },
    body: JSON.stringify({ json: { bugReportId: reportId } }),
  });
  check("comments API refuses signed-out requests", anon.status === 401 || anon.status === 403, String(anon.status));
} catch (error) {
  check("test ran without errors", false, error.message.split("\n")[0]);
  const open = browser.contexts()[0]?.pages()[0];
  if (open) {
    console.log("url at failure:", open.url());
    if (reportIdForDebug) console.log("comments in db:", (await db.query("select body from bug_report_comment where bug_report_id = $1", [reportIdForDebug])).rows.map((r) => r.body));
    console.log((globalThis.browserErrors ?? []).slice(-8).join("\n"));
    await open.screenshot({ path: "e2e-failure.png" }).catch(() => {});
  }
} finally {
  await browser.close();
  if (orgId) await db.query("delete from organization where id = $1", [orgId]);
  if (userId) await db.query(`delete from "user" where id = $1`, [userId]);
  const left = await db.query(`select count(*)::int n from "user" where email = $1`, [email]);
  console.log(left.rows[0].n === 0 ? "cleanup: throwaway user and org deleted" : "cleanup: FAILED, user still present");
  await db.end();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
