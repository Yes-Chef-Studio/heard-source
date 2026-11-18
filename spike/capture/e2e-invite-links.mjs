// Browser check for invite links (Heard sends no email). Creates a throwaway owner and org,
// invites someone, copies the link from Settings, creates the account from the link signed out,
// and checks the link can't be reused. Deletes everything it creates.
// Usage: node e2e-invite-links.mjs [--web http://localhost:3101] [--api http://localhost:3100]
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

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const tag = randomBytes(4).toString("hex");
const ownerEmail = `owner-${tag}@example.test`;
const inviteeEmail = `invitee-${tag}@example.test`;
let orgId;
const browser = await chromium.launch();

try {
  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ownerCtx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB });
  const owner = await ownerCtx.newPage();
  const headers = { origin: WEB, "content-type": "application/json" };
  await owner.request.post(`${API}/api/auth/sign-up/email`, {
    headers,
    data: { email: ownerEmail, password: randomBytes(12).toString("hex"), name: "Owner Test" },
  });
  let res = await owner.request.post(`${API}/api/auth/organization/create`, {
    headers,
    data: { name: `Invite ${tag}`, slug: `invite-${tag}` },
  });
  orgId = (await res.json()).id;
  await owner.request.post(`${API}/api/auth/organization/set-active`, { headers, data: { organizationId: orgId } });

  // Invite through the Settings form.
  await owner.goto(`${WEB}/settings/organization`, { waitUntil: "domcontentloaded" });
  const emailBox = owner.getByPlaceholder("teammate@example.com");
  await emailBox.waitFor({ timeout: 30_000 });
  await emailBox.fill(inviteeEmail);
  await owner.getByRole("button", { name: /^(Invite|Send invite|Invite member)/i }).click();
  await owner.getByText("Invite created. Copy its link below").waitFor({ timeout: 15_000 });
  check("invite created with copy-link message", true);
  await owner.getByText(inviteeEmail).waitFor({ timeout: 15_000 });
  await owner.getByRole("button", { name: "Copy link" }).first().click();
  await owner.getByText("Link copied.").waitFor({ timeout: 10_000 });
  const link = await owner.evaluate(() => navigator.clipboard.readText());
  check("copy link puts the invite URL on the clipboard", /\/invite\/[A-Za-z0-9]{32}$/.test(link), link.replace(/[A-Za-z0-9]{32}$/, "…"));

  // Invitee: fresh browser, signed out.
  const invitee = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await invitee.goto(link, { waitUntil: "domcontentloaded" });
  await invitee.getByRole("button", { name: "Create account" }).waitFor({ timeout: 30_000 });
  check("link opens the create-account form", (await invitee.getByLabel("Email").inputValue()) === inviteeEmail);
  check("shows the workspace name", (await invitee.getByText(`Invite ${tag}`).count()) >= 1);
  const overflow = await invitee.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("fits a phone", overflow <= 0, `${overflow}px overflow`);

  await invitee.getByLabel("Your name").fill("Invitee Test");
  await invitee.getByLabel("Password", { exact: true }).fill("short");
  await invitee.getByLabel("Confirm password").fill("short");
  await invitee.getByRole("button", { name: "Create account" }).click();
  check("short password refused", await invitee.getByText("Use at least 8 characters.").isVisible());
  const password = `pw-${randomBytes(6).toString("hex")}`;
  await invitee.getByLabel("Password", { exact: true }).fill(password);
  await invitee.getByLabel("Confirm password").fill(`${password}x`);
  await invitee.getByRole("button", { name: "Create account" }).click();
  check("mismatched passwords refused", await invitee.getByText("The passwords don't match.").isVisible());
  await invitee.getByLabel("Confirm password").fill(password);
  await invitee.getByRole("button", { name: "Create account" }).click();
  globalThis.__invitee = invitee;
  await invitee.waitForURL((u) => !u.pathname.startsWith("/invite"), { timeout: 30_000 });
  await invitee.getByRole("heading", { name: "Projects" }).first().waitFor({ timeout: 30_000 });
  check("lands signed in on the dashboard", !invitee.url().includes("/login"), new URL(invitee.url()).pathname);

  const row = (
    await db.query(
      `select m.role, u.name, u.email_verified, i.status
       from "user" u join member m on m.user_id = u.id
       join invitation i on i.email = u.email and i.organization_id = m.organization_id
       where u.email = $1 and m.organization_id = $2`,
      [inviteeEmail, orgId]
    )
  ).rows[0];
  check("member of the workspace with the invited role", row?.role === "member" && row?.name === "Invitee Test", JSON.stringify(row));
  check("invite marked used", row?.status === "accepted");

  // Signed out again, the link is spent.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(link, { waitUntil: "domcontentloaded" });
  await stranger.getByText("It has expired or was already used.").waitFor({ timeout: 30_000 });
  check("link can't be reused", true);

  // API refuses a second account from the same invite.
  const replay = await stranger.request.post(`${API}/rpc/invite/createAccount`, {
    headers,
    data: { json: { invitationId: link.split("/").pop(), name: "Replay", password: "another-password" } },
  });
  check("API refuses replay", replay.status() === 400, String(replay.status()));
} catch (error) {
  check("test ran without errors", false, error.message.split("\n")[0]);
  const p = globalThis.__invitee;
  if (p) {
    console.log("invitee url:", p.url());
    console.log("invitee text:", (await p.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
    await p.screenshot({ path: "invite-fail.png" }).catch(() => {});
  }
} finally {
  await browser.close();
  if (orgId) await db.query("delete from organization where id = $1", [orgId]);
  await db.query(`delete from "user" where email = any($1)`, [[ownerEmail, inviteeEmail]]);
  console.log("cleanup: throwaway users, org and invites deleted");
  await db.end();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
