#!/bin/sh
# Runs the API (port 3000) and the dashboard (port 3001) side by side. If either stops, the
# container exits so Cloudflare starts a fresh one.
set -u

PORT=3000 bun /app/apps/server/dist/index.mjs &
api=$!

cd /app/apps/web
bun run start -- --port 3001 --hostname 0.0.0.0 &
web=$!

trap 'kill $api $web 2>/dev/null' TERM INT

while kill -0 "$api" 2>/dev/null && kill -0 "$web" 2>/dev/null; do
  sleep 5
done

echo "[heard] a process stopped; exiting" >&2
kill "$api" "$web" 2>/dev/null
exit 1
