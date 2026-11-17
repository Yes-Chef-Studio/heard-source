// API check for projects, client share links, shared comments and notifications.
// Creates a throwaway user, org, project and report, then deletes them.
// Usage: node e2e-projects-api.mjs [--api http://localhost:3100] [--web http://localhost:3101]
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const API = arg("--api", "http://localhost:3100");
const WEB = arg("--web", "http://localhost:3101");
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
// Public calls: no cookies at all.
async function anon(path, json) {
  const res = await fetch(`${API}/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB },
    body: JSON.stringify({ json }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, data: body?.json };
}

try {
  const page = await (await browser.newContext()).newPage();
  const headers = { origin: WEB, "content-type": "application/json" };
  const team = async (path, json) => {
    const res = await page.request.post(`${API}/rpc/${path}`, { headers, data: { json } });
    const body = await res.json().catch(() => null);
    return { status: res.status(), data: body?.json };
  };

  let res = await page.request.post(`${API}/api/auth/sign-up/email`, {
    headers,
    data: { email: `e2e-${tag}@example.test`, password: randomBytes(12).toString("hex"), name: "Team Member" },
  });
  userId = (await res.json()).user?.id;
  res = await page.request.post(`${API}/api/auth/organization/create`, { headers, data: { name: `E2E ${tag}`, slug: `e2e-${tag}` } });
  orgId = (await res.json()).id;
  await page.request.post(`${API}/api/auth/organization/set-active`, { headers, data: { organizationId: orgId } });
  check("setup user and org", Boolean(userId && orgId));

  // Two projects; reports in each, plus one with no project.
  await db.query(
    `insert into capture_public_key (id, organization_id, key, label, allowed_origins) values
     ('p_a_${tag}', $1, 'crk_a_${tag}', 'Acme staging', ARRAY['https://acme.webflow.io']),
     ('p_b_${tag}', $1, 'crk_b_${tag}', 'Other client', ARRAY['https://other.webflow.io'])`,
    [orgId]
  );
  const statuses = ["to_do", "planning", "blocked", "client_action", "fast_follow", "final_check", "cancelled"];
  for (const [i, status] of statuses.entries()) {
    await db.query(
      `insert into bug_report (id, organization_id, capture_public_key_id, title, url, attachment_type, submission_status, status, priority, reporter_name, reporter_email)
       values ($1, $2, $3, $4, 'https://acme.webflow.io/pricing?x=1', 'screenshot', 'ready', $5, 'high', 'Clarisa', 'clarisa@acme.example')`,
      [`a${i}_${tag}`, orgId, `p_a_${tag}`, `Acme ${status}`, status]
    );
  }
  await db.query(
    `insert into bug_report (id, organization_id, capture_public_key_id, title, url, attachment_type, submission_status)
     values ('b0_${tag}', $1, 'p_b_${tag}', 'Other report', 'https://other.webflow.io/', 'screenshot', 'ready'),
            ('n0_${tag}', $1, null, 'No project', 'https://elsewhere.example/', 'screenshot', 'ready'),
            ('pr_${tag}', $1, 'p_a_${tag}', 'Still processing', 'https://acme.webflow.io/', 'screenshot', 'processing')`,
    [orgId]
  );

  // Team: projects.
  let r = await team("project/list", undefined);
  const acme = r.data?.projects?.find((p) => p.id === `p_a_${tag}`);
  check("projects listed with counts", acme?.reportCount === 8 && acme?.openCount === 6, JSON.stringify({ total: acme?.reportCount, open: acme?.openCount }));
  check("unassigned count", r.data?.unassignedCount === 1, String(r.data?.unassignedCount));
  check("no share link by default", acme?.shareToken === null);

  r = await team("bugReport/list", { projectId: `p_a_${tag}`, perPage: 50 });
  check("report list filters by project", r.data?.items?.length === 8, String(r.data?.items?.length));
  r = await team("bugReport/listSites", { projectId: `p_a_${tag}` });
  check("page filter scoped to project", r.data?.length === 1 && r.data[0].site === "https://acme.webflow.io", JSON.stringify(r.data?.map((s) => s.site)));

  r = await team("project/regenerateShareLink", { projectId: `p_a_${tag}` });
  const token = r.data?.shareToken;
  check("share link created", typeof token === "string" && token.length >= 30, token?.slice(0, 6));

  // Public: share link.
  r = await anon("share/getProject", { token });
  check("public project loads without sign-in", r.status === 200 && r.data?.name === "Acme staging", String(r.status));
  check("client status counts", JSON.stringify(r.data?.counts) === JSON.stringify({ received: 1, in_progress: 1, blocked: 1, needs_input: 1, fast_follow: 1, done: 1, not_planned: 1 }), JSON.stringify(r.data?.counts));

  r = await anon("share/listReports", { token });
  const items = r.data ?? [];
  check("only this project's ready reports", items.length === 7 && items.every((i) => i.id.startsWith("a")), `${items.length} items`);
  const sample = items[0] ?? {};
  check("no internal fields leak", !("priority" in sample) && !("tags" in sample) && !("reporterEmail" in sample) && !("organizationId" in sample), Object.keys(sample).join(","));
  check("client statuses mapped", items.find((i) => i.title === "Acme fast_follow")?.status === "fast_follow" && items.find((i) => i.title === "Acme blocked")?.status === "blocked" && items.find((i) => i.title === "Acme cancelled")?.status === "not_planned");
  r = await anon("share/listReports", { token, status: "done" });
  check("filter by client status", r.data?.length === 1 && r.data[0].title === "Acme final_check", String(r.data?.length));

  r = await anon("share/getReport", { token, reportId: `b0_${tag}` });
  check("can't open another project's report", r.status === 404, String(r.status));
  r = await anon("share/getReport", { token, reportId: `pr_${tag}` });
  check("can't open a still-processing report", r.status === 404, String(r.status));
  r = await anon("share/getProject", { token: "x".repeat(32) });
  check("wrong token refused", r.status === 404, String(r.status));

  // Comments: team then client, one shared thread.
  await team("bugReport/addComment", { bugReportId: `a0_${tag}`, body: "Thanks, looking at this today." });
  r = await anon("share/addComment", { token, reportId: `a0_${tag}`, name: "Clarisa", email: "clarisa@acme.example", body: "Great, also the footer on mobile." });
  check("client can comment with name and email", r.status === 200, String(r.status));
  r = await anon("share/addComment", { token, reportId: `a0_${tag}`, name: "Clarisa", email: "not-an-email", body: "x" });
  check("client comment needs a valid email", r.status === 400, String(r.status));
  r = await anon("share/getReport", { token, reportId: `a0_${tag}` });
  const thread = r.data?.comments ?? [];
  check("client sees the whole thread", thread.length === 2 && thread[0].source === "team" && thread[0].authorName === "Team Member" && thread[1].source === "client", JSON.stringify(thread.map((c) => `${c.source}:${c.authorName}`)));
  check("no emails in the public thread", thread.every((c) => !("authorEmail" in c) && !("email" in c)));
  r = await team("bugReport/listComments", { bugReportId: `a0_${tag}` });
  const clientComment = r.data?.find((c) => c.source === "client");
  check("team sees client comment with email", clientComment?.author?.name === "Clarisa" && clientComment?.author?.email === "clarisa@acme.example");

  // Notifications.
  r = await team("notification/unreadCount", undefined);
  check("client comment creates a notification", r.data?.count === 1, String(r.data?.count));
  r = await team("notification/list", {});
  const n = r.data?.items?.[0];
  check("notification has context", n?.type === "client_comment" && n?.actorName === "Clarisa" && n?.projectName === "Acme staging" && n?.reportTitle === "Acme to_do" && n?.unread === true, JSON.stringify(n));
  await team("notification/markAllRead", undefined);
  r = await team("notification/unreadCount", undefined);
  check("mark all read", r.data?.count === 0, String(r.data?.count));
  r = await anon("notification/list", {});
  check("notifications need sign-in", r.status === 401, String(r.status));

  // Regenerating kills the old link.
  r = await team("project/regenerateShareLink", { projectId: `p_a_${tag}` });
  const oldToken = token;
  r = await anon("share/getProject", { token: oldToken });
  check("old link stops working after regenerate", r.status === 404, String(r.status));
  await team("project/disableShareLink", { projectId: `p_a_${tag}` });
  r = await team("project/get", { projectId: `p_a_${tag}` });
  check("link can be turned off", r.data?.shareToken === null);
} catch (error) {
  check("test ran without errors", false, error.message.split("\n")[0]);
} finally {
  await browser.close();
  if (orgId) await db.query("delete from organization where id = $1", [orgId]);
  if (userId) await db.query(`delete from "user" where id = $1`, [userId]);
  console.log("cleanup: throwaway user, org, projects and reports deleted");
  await db.end();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
