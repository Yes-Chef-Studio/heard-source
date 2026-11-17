# Local development

Runs with no Docker or Homebrew. Postgres is `embedded-postgres` and S3 is `moto`, both installed under `.devtools/` (gitignored).

## One-time setup
```bash
mkdir -p .devtools && cd .devtools
echo '{"name":"heard-devtools","private":true}' > package.json
npm install bun@1.3.5 embedded-postgres@17.11.0-beta.19
python3 -m venv venv && venv/bin/pip install 'moto[server]==5.2.5'
cd ../app && ../.devtools/node_modules/.bin/bun install
npx --prefix apps/renderer playwright install chromium webkit firefox
```
Then create `app/apps/server/.env` and `app/apps/web/.env`. Copy from the `.env.example` files and set the ports below. The API also needs `RENDERER_URL=http://127.0.0.1:3102` and `RENDERER_SECRET=devsecret`.

Run migrations once infra is up: `cd app && bun run db:migrate`.

## Run
```bash
dev/up.sh
```
| Service | URL |
|---|---|
| Web app | http://localhost:3101 |
| API | http://localhost:3100 |
| Renderer | http://127.0.0.1:3102 |
| Postgres | postgres://heard:heard@localhost:5433/heard |
| S3 (moto) | http://localhost:9000, bucket `heard` |

## Gotchas
- Bun's `--hot` does not reload `.env`, so restart the API after editing it.
- In dev, Chrome blocks a public https page from calling `localhost` (Local Network Access), and Safari blocks it as mixed content. Test the widget on local http pages, or expose the API through an https tunnel.
- The renderer blocks private and loopback addresses unless `RENDERER_ALLOW_PRIVATE_NETWORK=1`. `up.sh` sets it so localhost sites can be captured. Never set it in production.
