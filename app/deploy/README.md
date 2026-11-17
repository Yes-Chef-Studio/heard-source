# Deploying Heard

One Docker Compose file runs everything: `docker-compose.heard.yml` in `app/`.

| Service | Image | Port | Notes |
|---|---|---|---|
| server | `apps/server/Dockerfile` | 3000 | API. Runs migrations first via the one-shot `migrate` service. |
| web | `apps/web/Dockerfile` | 3001 | Dashboard. Shares the server's network namespace. |
| renderer | `apps/renderer/Dockerfile` | internal | Playwright with Chromium, WebKit and Firefox. Only the API can reach it. |
| postgres | `postgres:17-alpine` | internal | Data in the `postgres_data` volume. |
| storage (SeaweedFS) | optional (`--profile local-storage`) | 9000 | Use Cloudflare R2 instead in production. |

## First deploy (any Linux server with Docker)

```bash
git clone <repo> heard && cd heard/app
cp deploy/heard.env.example deploy/heard.env   # fill in URLs, secrets and storage
docker compose -f docker-compose.heard.yml --env-file deploy/heard.env up -d --build
```

Put a TLS proxy in front, for example Caddy with two hosts: `api.<domain>` → `:3000` and `app.<domain>` → `:3001`. Cloudflare DNS proxying also works.

Sizing: the renderer is the heavy part. A render takes 0.4–4 s (measured on a Mac), and up to three run at once. Start with a 4 GB / 2 vCPU server. Memory per render hasn't been measured on Linux yet.

## Security notes

- The renderer loads whatever URLs a snapshot references. It sits on its own Docker network with the API only, so it can't reach Postgres or storage. Its network guard also blocks private addresses at every redirect hop. CI checks the isolation.
- `RENDERER_SECRET` must match between the server and the renderer. The compose file passes the same value to both.
- Set `ALLOWED_SIGNUP_DOMAINS` so only your team can create accounts.

## Restricting the widget to staging

Each capture key has a list of allowed sites (Settings → Public keys). The widget asks the API before it shows itself, and stays hidden on any site that isn't listed. So the same script tag can be published to staging and production (as Webflow site-wide custom code does), and clients only see it on staging. Submissions are also checked server-side on every request. A change to the list takes up to a minute to apply.

## CI

`.github/workflows/heard.yml` (repo root) builds all three images, boots the stack with SeaweedFS storage, and runs `spike/capture/smoke.mjs`. That checks the site lock, renders on all three engines through the API, and checks the renderer's network isolation. Run it manually with "accuracy" ticked to run the screenshot-accuracy harness on Linux.

## Accounts (no email)

Heard sends no email, and self sign-up is off (`DISABLE_SIGNUP=true`). Add people and reset
passwords from the server:

```bash
docker compose -f docker-compose.heard.yml --env-file deploy/heard.env exec server \
  bun apps/server/scripts/users.ts add jane@yeschef.studio "Jane Smith" --role member
docker compose -f docker-compose.heard.yml --env-file deploy/heard.env exec server \
  bun apps/server/scripts/users.ts set-password jane@yeschef.studio
docker compose -f docker-compose.heard.yml --env-file deploy/heard.env exec server \
  bun apps/server/scripts/users.ts list
```

Without `--password`, a random password is printed once. Send it privately and ask them to keep it.

## Source code (AGPL-3.0)

Heard is a modified version of Crikket, which is AGPL-3.0. Clients use it over the network
(widget and share links), so they must be able to get the source of the running version. The
widget, share pages and sign-in page link to the public source repository
(`siteConfig.links.source`). After deploying a new version, publish its source:

```bash
scripts/publish-source.sh
```

