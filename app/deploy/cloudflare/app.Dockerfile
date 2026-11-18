# Heard API + dashboard in one image for Cloudflare Containers (see wrangler.jsonc).
# Build context: the app/ directory.
FROM oven/bun:1.3.5-alpine

WORKDIR /app
ENV NODE_ENV=production

# Public URL, baked into the dashboard's client bundle at build time.
ARG HEARD_URL
ENV NEXT_PUBLIC_SITE_URL=${HEARD_URL} \
    NEXT_PUBLIC_APP_URL=${HEARD_URL} \
    NEXT_PUBLIC_SERVER_URL=${HEARD_URL} \
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false

COPY package.json bun.lock turbo.json tsconfig.json biome.jsonc ./
COPY apps ./apps
COPY packages ./packages
COPY sdks ./sdks

RUN bun install --frozen-lockfile
RUN bun run --filter server build
RUN bun run build -- --filter=web

COPY deploy/cloudflare/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000 3001
CMD ["/start.sh"]
