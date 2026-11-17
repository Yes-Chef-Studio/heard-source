// End-to-end check for reviewer name/email capture in the widget, against a running local stack.
// Uses the test page (http://localhost:4500) and its key. Deletes the reports it creates.
// Usage: node e2e-reporter.mjs [--page http://localhost:4500]
import { createRequire } from "node:module";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const PAGE = arg("--page", "http://localhost:4500");
const require = createRequire(process.env.PG_FROM || "/Users/user/heard-devtools/package.json");
const pg = require("pg");
const db = new pg.Client(process.env.DATABASE_URL || "postgres://heard:heard@localhost:5433/heard");
await db.connect();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const created = [];
const startedAt = new Date();

async function openReview(page) {
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.getByRole("button", { name: /take screenshot/i }).click();
  await page.getByRole("button", { name: "Submit Report" }).waitFor({ timeout: 60_000 });
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Report an issue" }).waitFor({ timeout: 30_000 });

  // First visit: fields empty, and the form refuses to submit without them.
  await openReview(page);
  const name = page.getByLabel("Your name");
  const email = page.getByLabel("Your email");
  check("name and email fields shown", (await name.isVisible()) && (await email.isVisible()));
  check("fields start empty", (await name.inputValue()) === "" && (await email.inputValue()) === "");
  await page.getByRole("button", { name: "Submit Report" }).click();
  await page.getByText("Add your name so the team knows who sent this.").waitFor({ timeout: 5_000 });
  check("name required", true);
  check("email required", await page.getByText("Add your email so the team can follow up.").isVisible());

  await name.fill("Clarisa Test");
  await email.fill("not-an-email");
  await page.getByRole("button", { name: "Submit Report" }).click();
  check("invalid email rejected", await page.getByText("Enter a valid email address.").isVisible());

  await email.fill("clarisa@client.example");
  await page.getByLabel("Title").fill("E2E reporter check");
  await page.screenshot({ path: "e2e-reporter-form.png" });
  await page.getByRole("button", { name: "Submit Report" }).click();

  const saved = async () => {
    for (let i = 0; i < 60; i++) {
      const r = await db.query(
        `select id, reporter_name, reporter_email, capture_public_key_id from bug_report
         where title = 'E2E reporter check' and created_at >= $1 order by created_at desc`,
        [startedAt]
      );
      if (r.rowCount > created.length) return r.rows[0];
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return null;
  };
  const row = await saved();
  if (row) created.push(row.id);
  check("report saved", Boolean(row));
  check("reporter name stored", row?.reporter_name === "Clarisa Test", row?.reporter_name);
  check("reporter email stored", row?.reporter_email === "clarisa@client.example", row?.reporter_email);
  check("capture key recorded", Boolean(row?.capture_public_key_id), row?.capture_public_key_id);

  // Next report from the same browser: prefilled.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Report an issue" }).waitFor({ timeout: 30_000 });
  await openReview(page);
  check(
    "remembered on next report",
    (await page.getByLabel("Your name").inputValue()) === "Clarisa Test" &&
      (await page.getByLabel("Your email").inputValue()) === "clarisa@client.example"
  );
  await page.getByLabel("Title").fill("E2E reporter check");
  await page.getByRole("button", { name: "Submit Report" }).click();
  const second = await saved();
  if (second) created.push(second.id);
  check("second report saved without retyping", second?.reporter_name === "Clarisa Test");
} catch (error) {
  check("test ran without errors", false, error.message.split("\n")[0]);
  const open = browser.contexts()[0]?.pages()[0];
  if (open) await open.screenshot({ path: "e2e-failure.png" }).catch(() => {});
} finally {
  await browser.close();
  if (created.length) {
    await db.query("delete from bug_report where id = any($1)", [created]);
    console.log(`cleanup: deleted ${created.length} test report(s)`);
  }
  await db.end();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
