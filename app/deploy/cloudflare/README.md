# Heard on Cloudflare

Live at **https://heard.yeschef-dev.fyi**.

| Piece | Where |
|---|---|
| Worker `heard` | Routes the domain to the containers (`src/index.ts`) |
| App container (`basic`) | API on port 3000 + dashboard on 3001 (`app.Dockerfile`, `start.sh`) |
| Renderer container (`standard-2`, one instance) | Playwright screenshots; only the API can reach it, at `http://renderer.internal` |
| Database | Neon Postgres, AWS us-east-1 |
| Files | R2 bucket `heard` (Eastern North America) |

Containers run in Eastern North America (`ENAM`) to sit next to the database. The App
container sleeps after 30 quiet minutes and wakes on the next request in a few seconds.

## Deploying

Merging to `main` deploys automatically: the **Heard** checks run, then **Deploy to Cloudflare**
migrates the database, builds both images and deploys. To redeploy by hand: GitHub, Actions tab,
"Deploy to Cloudflare", Run workflow.

## Secrets (GitHub repository secrets)

| Name | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token `heard-deploy`. **Expires 2027-11-18**: make a new one before then |
| `CLOUDFLARE_ACCOUNT_ID` | Yes Chef's Cloudflare account |
| `DATABASE_URL` | Neon connection string (pooling off) |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | R2 API token for the `heard` bucket |
| `BETTER_AUTH_SECRET`, `CAPTURE_SUBMIT_TOKEN_SECRET`, `RENDERER_SECRET` | Random; changing `BETTER_AUTH_SECRET` signs everyone out |

The deploy copies these into the Worker as secrets; the Worker passes them to the containers.

## Accounts

Sign-up is off. Add people from a machine with the repo, pointing at the production database:

    cd app/apps/server
    DATABASE_URL='<neon string>' BETTER_AUTH_SECRET='<same as production>' \
      BETTER_AUTH_URL=https://heard.yeschef-dev.fyi CORS_ORIGINS=https://heard.yeschef-dev.fyi \
      bun scripts/users.ts add someone@yeschef.studio "Their Name"

## Checking locally

    npm ci && npm run check     # type-check and a dry-run deploy (no Docker needed)
