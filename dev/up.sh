#!/usr/bin/env bash
# Start the whole local stack: Postgres + S3 (moto), API (3100), web (3101), renderer (3102),
# widget test page (4500).
# Ctrl+C stops everything. Logs go to .devtools/logs/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.devtools/node_modules/.bin:$PATH"
LOGS="$ROOT/.devtools/logs"
mkdir -p "$LOGS"

pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

node "$ROOT/dev/infra.mjs" >"$LOGS/infra.log" 2>&1 &
pids+=($!)
until grep -q "S3 (moto)" "$LOGS/infra.log" 2>/dev/null; do sleep 0.5; done
echo "infra     postgres :5433, s3 :9000"

# Renderer: allow private network in dev so localhost sites can be captured.
( cd "$ROOT/app/apps/renderer" && bun run build >/dev/null &&
  RENDERER_SECRET="${RENDERER_SECRET:-devsecret}" RENDERER_ALLOW_PRIVATE_NETWORK=1 exec node src/server.mjs ) >"$LOGS/renderer.log" 2>&1 &
pids+=($!)
echo "renderer  http://127.0.0.1:3102"

# The capture SDK and capture-core must be built before the web app can import them.
( cd "$ROOT/app" && bunx turbo run build --filter=@crikket-io/capture... >/dev/null )

( cd "$ROOT/app/apps/server" && exec bun run --hot src/index.ts ) >"$LOGS/server.log" 2>&1 &
pids+=($!)
echo "api       http://localhost:3100"

# Port 3001 (Crikket's default) is taken by other local projects, so the web app runs on 3101.
( cd "$ROOT/app/apps/web" && exec bunx next dev --port 3101 ) >"$LOGS/web.log" 2>&1 &
pids+=($!)
echo "web       http://localhost:3101"

node "$ROOT/dev/widget-host.mjs" >"$LOGS/widget-host.log" 2>&1 &
pids+=($!)
echo "test page http://localhost:4500"

echo "logs      $LOGS"
wait
