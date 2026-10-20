# syntax=docker/dockerfile:1
#
# Trenchscope: one image for both deployments (MODE=live and MODE=demo). One
# Node process serves the API, the WebSocket and the built web app on one port;
# the server runs its TypeScript through tsx, as in development.
#
#   docker build -t trenchscope .
#   docker run -p 8787:8787 -v trenchscope-demo:/data trenchscope                          # demo
#   docker run -p 8787:8787 -v trenchscope-live:/data --env-file live.env -e MODE=live trenchscope
#
# See docs/DEPLOY.md and deploy/ (compose with Caddy, systemd, Fly.io).

# Pinned by tag and digest (multi-arch index of node:22.22.0-bookworm-slim); bump both together.
# Override to build from a mirror: --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22.22.0-bookworm-slim@sha256:…
ARG NODE_IMAGE=node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94

# ---- base: Node + the pnpm version package.json pins ("packageManager"), through corepack
# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable && corepack install
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# ---- build: every dependency, then the web app (tsc --noEmit && vite build)
FROM base AS build
RUN --mount=type=cache,id=trenchscope-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
# the web typecheck covers tests that import server modules
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @trenchscope/web build

# ---- prod: the server and the shared package with production dependencies only
FROM base AS prod
RUN --mount=type=cache,id=trenchscope-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@trenchscope/server..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

# ---- runtime: no pnpm, no dev dependencies, code owned by root and read-only to the app user
# hadolint ignore=DL3006
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    MODE=demo \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist
COPY --from=prod /app /app
COPY --from=build /app/apps/web/dist /app/apps/web/dist
# Snapshots, the SQLite store and local backups live on the volume; the server keeps them owner-only.
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
VOLUME ["/data"]
USER node
# Run from apps/server so `--import tsx` resolves the server's tsx dependency.
WORKDIR /app/apps/server
EXPOSE 8787
# Liveness only (readiness, /readyz, also needs the live feed and RPC; see docs/DEPLOY.md).
# The start period covers the warmup fast-forward of a fresh demo world.
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=4 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# SIGTERM: the server stops the market, writes its snapshot and closes (allow ~60 s: stop_grace_period).
STOPSIGNAL SIGTERM
CMD ["node", "--import", "tsx", "src/index.ts"]
