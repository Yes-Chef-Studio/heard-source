// Browser check for project folders, the client share link and notifications.
// Creates a throwaway user, org, project and reports, then deletes them.
// Usage: node e2e-projects-ui.mjs [--web http://localhost:3101] [--api http://localhost:3100]
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WEB = arg("--web", "http://localhost:3101");
const API = arg("--api", "http://localhost:3100");
const SHOTS = arg("--shots", ".");
const require = createRequire(process.env.PG_FROM || "/Users/user/heard-devtools/package.json");
const pg = require("pg");
const db = new pg.Client(process.env.DATABASE_URL || "postgres://heard:heard@localhost:5433/heard");
await db.connect();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const tag = randomBytes(4).toString("hex");
let userId;
let orgId;
const browser = await chromium.launch();
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on("response", (r) => r.url().includes("/rpc/") && r.status() >= 500 && errors.push(`${label} ${r.status()} ${r.url()}`));
};

try {
  const team = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  watch(team, "team");
  const headers = { origin: WEB, "content-type": "application/json" };
  let res = await team.request.post(`${API}/api/auth/sign-up/email`, {
    headers,
    data: { email: `e2e-${tag}@example.test`, password: randomBytes(12).toString("hex"), name: "Brandon Test" },
  });
  userId = (await res.json()).user?.id;
  res = await team.request.post(`${API}/api/auth/organization/create`, { headers, data: { name: `E2E ${tag}`, slug: `e2e-${tag}` } });
  orgId = (await res.json()).id;
  await team.request.post(`${API}/api/auth/organization/set-active`, { headers, data: { organizationId: orgId } });

  const projectId = `p_${tag}`;
  await db.query(
    `insert into capture_public_key (id, organization_id, key, label, allowed_origins)
     values ($1, $2, $3, 'Acme staging', ARRAY['https://acme.webflow.io'])`,
    [projectId, orgId, `crk_${tag}`]
  );
  const rows = [
    ["to_do", "Logo clipped on mobile", "/"],
    ["client_action", "Which hero image?", "/pricing"],
    ["fast_follow", "Footer spacing", "/about"],
    ["final_check", "Typo in heading", "/pricing"],
  ];
  for (const [i, [status, title, path]] of rows.entries()) {
    await db.query(
      `insert into bug_report (id, organization_id, capture_public_key_id, title, description, url, attachment_type, submission_status, status, reporter_name, reporter_email, created_at)
       values ($1, $2, $3, $4, 'Seen on Safari, iPhone.', $5, 'screenshot', 'ready', $6, 'Clarisa', 'clarisa@acme.example', now() - ($7 || ' hours')::interval)`,
      [`r${i}_${tag}`, orgId, projectId, title, `https://acme.webflow.io${path}`, status, String(i)]
    );
  }

  // Dashboard: projects home.
  await team.goto(`${WEB}/`, { waitUntil: "networkidle" });
  const folder = team.getByRole("link", { name: /Acme staging/ });
  await folder.waitFor({ timeout: 30_000 });
  check("project folder on home", await folder.isVisible());
  check("folder shows counts", (await folder.innerText()).includes("4 reports") && (await folder.innerText()).includes("3 open"), (await folder.innerText()).replace(/\n/g, " | "));
  await team.screenshot({ path: `${SHOTS}/ui-projects.png` });
  await folder.click();
  await team.waitForURL(`**/projects/${projectId}`);
  await team.getByText("Logo clipped on mobile").first().waitFor({ timeout: 30_000 });
  check("project page lists its reports", (await team.getByRole("button", { name: "Change status" }).count()) === 4);

  // Share link.
  await team.getByRole("button", { name: "Create client link" }).click();
  const linkBox = team.getByLabel("Client link");
  await linkBox.waitFor({ timeout: 15_000 });
  const shareUrl = await linkBox.inputValue();
  check("client link created", /\/p\/[\w-]{30,}$/.test(shareUrl), shareUrl.replace(/\/p\/.*/, "/p/…"));
  await team.screenshot({ path: `${SHOTS}/ui-project-page.png` });

  // Client: fresh browser, no cookies.
  const clientCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const clientPage = await clientCtx.newPage();
  watch(clientPage, "client");
  await clientPage.goto(shareUrl, { waitUntil: "networkidle" });
  await clientPage.getByRole("heading", { name: "Acme staging" }).waitFor({ timeout: 30_000 });
  check("share page opens signed out", true);
  check("client status labels", (await clientPage.getByRole("button", { name: /Needs your input/ }).count()) === 1 && (await clientPage.getByRole("button", { name: /Fast follow/ }).count()) === 1);
  check("no internal status names", (await clientPage.getByText(/client action|final check/i).count()) === 0);
  await clientPage.screenshot({ path: `${SHOTS}/ui-share.png` });
  await clientPage.getByRole("button", { name: /Done/ }).click();
  await clientPage.waitForTimeout(800);
  check("filter by status", (await clientPage.getByRole("link", { name: /Typo in heading/ }).count()) === 1 && (await clientPage.getByRole("link", { name: /Footer spacing/ }).count()) === 0);
  await clientPage.getByRole("button", { name: /^All/ }).click();
  await clientPage.getByRole("link", { name: /Which hero image/ }).click();
  await clientPage.getByRole("heading", { name: "Which hero image?" }).waitFor({ timeout: 15_000 });

  // First comment asks for identity; empty email is refused.
  await clientPage.getByLabel("Your name").waitFor({ timeout: 10_000 });
  check("asks for name and email", await clientPage.getByLabel("Your email").isVisible());
  await clientPage.getByLabel("Your comment").fill("Use the second one please.");
  await clientPage.getByRole("button", { name: "Post reply" }).click();
  check("needs a name first", await clientPage.getByText("Add your name so the team knows who wrote this.").isVisible());
  await clientPage.getByLabel("Your name").fill("Clarisa Client");
  await clientPage.getByLabel("Your email").fill("clarisa@acme.example");
  await clientPage.getByLabel("Your comment").fill("Use the second one please.");
  await clientPage.getByRole("button", { name: "Post reply" }).click();
  await clientPage.getByText("Use the second one please.").waitFor({ timeout: 15_000 });
  check("client comment posted", true);
  check("remembers the client", await clientPage.getByText("Commenting as").isVisible());
  await clientPage.getByLabel("Your comment").fill("And crop it tighter.");
  await clientPage.getByLabel("Your comment").press("Meta+Enter");
  await clientPage.getByText("And crop it tighter.").waitFor({ timeout: 15_000 });
  check("second comment without retyping identity", true);
  await clientPage.screenshot({ path: `${SHOTS}/ui-share-ticket.png` });

  // Team sees it: notification badge, notifications page, tagged comment.
  await team.goto(`${WEB}/notifications`, { waitUntil: "networkidle" });
  await team.getByText("commented on").first().waitFor({ timeout: 15_000 });
  check("notification listed", (await team.getByText("Clarisa Client").count()) >= 1);
  await team.screenshot({ path: `${SHOTS}/ui-notifications.png` });
  await team.goto(`${WEB}/s/r1_${tag}?tab=comments`, { waitUntil: "networkidle" });
  await team.getByText("Use the second one please.").first().waitFor({ timeout: 15_000 });
  check("team sees client comment tagged", (await team.getByText("Client", { exact: true }).count()) >= 1);
  await team.getByPlaceholder("Write a comment…").first().fill("Done, swapped it.");
  await team.getByRole("button", { name: "Comment", exact: true }).first().click();
  await team.locator("p", { hasText: "Done, swapped it." }).first().waitFor({ timeout: 15_000 });
  await clientPage.reload({ waitUntil: "networkidle" });
  await clientPage.getByText("Done, swapped it.").waitFor({ timeout: 15_000 });
  check("client sees team reply with Yes Chef tag", (await clientPage.getByText("Yes Chef", { exact: true }).count()) >= 1);

  // Mobile layout.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await phone.goto(shareUrl, { waitUntil: "networkidle" });
  await phone.getByRole("heading", { name: "Acme staging" }).waitFor({ timeout: 15_000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("share page fits a phone", overflow <= 0, `${overflow}px overflow`);
  await phone.screenshot({ path: `${SHOTS}/ui-share-phone.png`, fullPage: true });

  // Regenerate kills the old link.
  await team.goto(`${WEB}/projects/${projectId}`, { waitUntil: "networkidle" });
  await team.getByRole("button", { name: "Regenerate" }).click();
  await team.getByRole("button", { name: "Regenerate link" }).click();
  await team.waitForTimeout(1500);
  await clientPage.goto(shareUrl, { waitUntil: "networkidle" });
  await clientPage.getByText("This link isn't active.").waitFor({ timeout: 15_000 });
  check("old link stops working", true);
} catch (error) {
  check("test ran without errors", false, error.message.split("\n")[0]);
} finally {
  if (errors.length) console.log(errors.slice(0, 8).join("\n"));
  await browser.close();
  if (orgId) await db.query("delete from organization where id = $1", [orgId]);
  if (userId) await db.query(`delete from "user" where id = $1`, [userId]);
  console.log("cleanup: throwaway user, org, project and reports deleted");
  await db.end();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
