# Heard renderer: rebuilds DOM snapshots and screenshots them on Chromium, WebKit or Firefox.
# The Playwright image ships all three browsers plus their system libraries, pinned to the same
# version as the `playwright` package below. Keep the two in lockstep.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /renderer
ENV NODE_ENV=production \
    RENDERER_HOST=0.0.0.0 \
    RENDERER_PORT=3102 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY apps/renderer/package.json ./
# esbuild is a dev dependency, needed once to bundle the in-page rebuild script.
RUN npm install --include=dev --no-audit --no-fund && \
    npm cache clean --force
COPY apps/renderer/src ./src
RUN npx esbuild src/rebuild.js --bundle --format=iife --target=es2020 --minify --outfile=dist/rebuild.js && \
    npm prune --omit=dev

# Run as the unprivileged user the image provides.
USER pwuser
EXPOSE 3102
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3102/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
