// Local dev infrastructure without Homebrew/Docker: embedded Postgres 17 + moto (S3 emulator).
// moto keeps objects in memory, so its request recorder logs every write to
// .devtools/s3-recording.jsonl and we replay it on start. Uploaded screenshots survive restarts.
// Delete that file to start with an empty bucket.
// Usage: node dev/infra.mjs   (Ctrl+C stops both)
// Requires: .devtools/ set up per dev/README.md.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// HEARD_DEVTOOLS lets the tools and data live outside iCloud-synced folders.
const devtools = process.env.HEARD_DEVTOOLS || join(root, ".devtools");
const require = createRequire(join(devtools, "package.json"));
const EmbeddedPostgres = require("embedded-postgres").default;

const PG_PORT = 5433;
const S3_PORT = 9000;
const dataDir = join(devtools, "pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "heard",
  password: "heard",
  port: PG_PORT,
  persistent: true,
});

if (!existsSync(join(dataDir, "PG_VERSION"))) {
  console.log("Initialising Postgres data directory…");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("heard");
} catch {
  // Already exists.
}
console.log(`Postgres: postgres://heard:heard@localhost:${PG_PORT}/heard`);

const recording = join(devtools, "s3-recording.jsonl");
const hadRecording = existsSync(recording) && statSync(recording).size > 0;
const moto = spawn(join(devtools, "venv/bin/moto_server"), ["-H", "127.0.0.1", "-p", String(S3_PORT)], {
  stdio: "inherit",
  env: { ...process.env, MOTO_ENABLE_RECORDING: "True", MOTO_RECORDER_FILEPATH: recording },
});

const s3 = `http://127.0.0.1:${S3_PORT}`;
// moto can take a while to boot on a busy machine; wait for it rather than guessing.
for (let attempt = 0; ; attempt++) {
  try {
    await fetch(`${s3}/moto-api/`);
    break;
  } catch (error) {
    if (attempt > 120) throw error;
    await new Promise((r) => setTimeout(r, 500));
  }
}

if (hadRecording) {
  const replay = await fetch(`${s3}/moto-api/recorder/replay-recording`, { method: "POST" });
  console.log(`S3: restored previous uploads (${replay.status === 200 ? "ok" : `replay status ${replay.status}`})`);
}

// Bucket + CORS so browsers can PUT to presigned URLs.
await fetch(`${s3}/heard`, { method: "PUT" });
await fetch(`${s3}/heard?cors`, {
  method: "PUT",
  headers: { "content-type": "application/xml" },
  body: `<CORSConfiguration><CORSRule><AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>`,
});
console.log(`S3 (moto): http://localhost:${S3_PORT}  bucket=heard`);

const shutdown = async () => {
  moto.kill();
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
