# Deploying Trenchscope

Trenchscope ships as one Node process (Fastify API + WebSocket hub + the built web app on one port)
that runs in one of two modes from the same image:

- **live** (`MODE=live`): real chains (Solana, Base, Robinhood Chain, BNB Chain, Ethereum), real
  funds, embedded Turnkey wallets. See [LIVE.md](LIVE.md) for what live mode does.
- **demo** (`MODE=demo`, the default): the market simulator with paper trading. No secrets.

A production deployment runs **both**, as separate processes with separate data directories. This
document covers how to run them, configure them, keep them backed up and watched, and what to do when
something goes wrong. The files it refers to live in [`deploy/`](../deploy), the
[`Dockerfile`](../Dockerfile) and [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Contents

1. [Architecture of a deployment](#architecture-of-a-deployment)
2. [Running it](#running-it): Docker Compose + Caddy, Fly.io, systemd
3. [The image](#the-image)
4. [Environment reference](#environment-reference)
5. [Secrets management](#secrets-management)
6. [TLS, reverse proxy and TRUST_PROXY](#tls-reverse-proxy-and-trust_proxy)
7. [Health, readiness and shutdown](#health-readiness-and-shutdown)
8. [Backups and the restore drill](#backups-and-the-restore-drill)
9. [Monitoring and logging](#monitoring-and-logging)
10. [Scaling limits](#scaling-limits)
11. [RPC providers](#rpc-providers)
12. [Releases and rollback](#releases-and-rollback)
13. [Go-live security checklist](#go-live-security-checklist)
14. [Incident runbook](#incident-runbook)

## Architecture of a deployment

```
                         Internet (HTTPS, HTTP/3, WSS)
                                      │
                      ┌───────────────┴────────────────┐
                      │ Caddy: TLS (ACME), HSTS,       │   app.example.com  -> live:8787
                      │ WebSocket pass-through,        │   demo.example.com -> demo:8787
                      │ X-Forwarded-For (1 hop),       │   /metrics -> 404 (internal only)
                      │ X-Request-Id                   │
                      └───────┬─────────────────┬──────┘
                              │                 │
        ┌─────────────────────┴───────┐   ┌─────┴─────────────────────────┐
        │ live  (MODE=live)           │   │ demo  (MODE=demo)             │
        │ API + /ws + web, :8787      │   │ API + /ws + web, :8787        │
        │ volume live-data -> /data   │   │ volume demo-data -> /data     │
        │   trenchscope.db (SQLite)   │   │   snapshot.bin                │
        │   snapshot.bin, backups/    │   │   backups/                    │
        └──────────────┬──────────────┘   └───────────────────────────────┘
                       │ outbound only
     Solana RPC + WS (Helius / Triton) · PumpPortal feed · Jupiter · Jito block engine
     Turnkey (signing) · EVM RPCs (Alchemy, ...) · KyberSwap · IPFS gateways

        Prometheus (optional, compose profile "monitoring") scrapes live:8787 and demo:8787
        on the private network with a bearer token.
```

- **Two processes, two volumes.** A live server never loads a demo snapshot (and the other way
  round), the demo never holds live secrets, and a simulator bug cannot touch real funds.
  `DEMO_URL` on the live server links its UI to the demo site.
- **State.** Each server keeps its world in memory. Demo mode persists it as `DATA_DIR/snapshot.bin`
  (every `SNAPSHOT_EVERY_MS` and on shutdown). Live mode also keeps money and security records
  (accounts, 2FA, withdrawal whitelist, fills, transfers, audit log) in a SQLite store,
  `DATA_DIR/trenchscope.db` (WAL mode, written synchronously), owned by the live team's store
  module: see [LIVE.md](LIVE.md).
- **One port.** The API (`/api/*`), the WebSocket (`/ws`), the ops endpoints (`/healthz`,
  `/readyz`, `/metrics`) and the static web app share port 8787.

## Running it

### Docker Compose with Caddy (one host)

Needs a host with Docker Engine + Compose v2, ports 80 and 443 open, and DNS A/AAAA records for both
domains pointing at it.

```bash
git clone <repo> trenchscope && cd trenchscope/deploy
cp .env.example .env                 # LIVE_DOMAIN, DEMO_DOMAIN, ACME_EMAIL, TRENCHSCOPE_VERSION
cp live.env.example live.env         # live secrets: fill in, then
chmod 600 live.env
cp demo.env.example demo.env
docker compose up -d --build         # builds the image, starts live, demo and Caddy
docker compose ps                    # live/demo "healthy" once /healthz answers
curl -fsS https://$LIVE_DOMAIN/readyz
```

`deploy/docker-compose.yml` runs both services from one image with a read-only root filesystem,
`/tmp` as tmpfs, all capabilities dropped, `no-new-privileges`, `init: true` (signals reach Node),
`stop_grace_period: 60s` (time to write the snapshot), log rotation, and only `expose` (no host
ports) for the app containers: they are reachable through Caddy only. Optional monitoring:
`docker compose --profile monitoring up -d` adds Prometheus (see [Monitoring](#monitoring-and-logging)).

### Fly.io

`deploy/fly/live.toml` and `deploy/fly/demo.toml` describe one app each, with one Machine on one
volume mounted at `/data`, `/healthz` as the health check, `kill_timeout = 60s`, and Machines that
never auto-stop (orders, copy trading and snipers run server-side). From the repository root:

```bash
fly apps create trenchscope-live
fly volumes create trenchscope_live_data --app trenchscope-live --region iad --size 10
fly secrets set --app trenchscope-live SECRETS_KEY=... TURNKEY_ORGANIZATION_ID=... \
  TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... SOLANA_RPC_URL=... METRICS_TOKEN=...
fly deploy . --config deploy/fly/live.toml
fly scale count 1 --app trenchscope-live      # never more than one Machine (see Scaling limits)
```

Do the same with `deploy/fly/demo.toml` (no secrets beyond `METRICS_TOKEN`). The Fly proxy is the one
hop in front, so `TRUST_PROXY=1` is set in the toml. Fly's proxy routes every path, `/metrics`
included: keep `METRICS_TOKEN` set there.

### systemd (no containers)

`deploy/systemd/trenchscope@.service` is a template unit: `trenchscope@live` and `trenchscope@demo`,
each with `/etc/trenchscope/<instance>.env` (root-owned, mode 600) and its own state directory
`/var/lib/trenchscope/<instance>`. The instance name is the `MODE`; give each env file its own `PORT`
(e.g. 8787 and 8788). The unit binds to 127.0.0.1, runs as an unprivileged `trenchscope` user with
a strict sandbox (`ProtectSystem=strict`, empty capability set, syscall filter), and allows 60 s to
stop.

```bash
sudo useradd --system --home /var/lib/trenchscope --shell /usr/sbin/nologin trenchscope
sudo git clone <repo> /opt/trenchscope && sudo chown -R "$USER" /opt/trenchscope && cd /opt/trenchscope
sudo corepack enable && pnpm install --frozen-lockfile     # the service user only needs read access
pnpm --filter @trenchscope/web build
pnpm install --frozen-lockfile --prod        # drop dev dependencies after the build
sudo install -d -m 700 /etc/trenchscope
sudo install -m 600 deploy/live.env.example /etc/trenchscope/live.env   # then edit; add PORT=8787
sudo install -m 600 deploy/demo.env.example /etc/trenchscope/demo.env   # then edit; add PORT=8788
sudo cp deploy/systemd/trenchscope@.service deploy/systemd/trenchscope-backup@.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trenchscope@live trenchscope@demo \
  trenchscope-backup@live.timer trenchscope-backup@demo.timer
```

The unit expects Node 22 at `/usr/bin/node` (NodeSource / distribution packages); adjust `ExecStart`
otherwise. Put Caddy on the host with `deploy/Caddyfile`, replacing the upstreams `live:8787` /
`demo:8787` by `127.0.0.1:8787` / `127.0.0.1:8788`.

## The image

The [`Dockerfile`](../Dockerfile) is multi-stage:

| Stage | What it does |
|---|---|
| `base` | Node 22 (pinned by digest), pnpm from `package.json` `packageManager` through corepack, workspace manifests |
| `build` | `pnpm install --frozen-lockfile`, then `pnpm --filter @trenchscope/web build` (typecheck + Vite build) |
| `prod` | `pnpm install --frozen-lockfile --prod --filter "@trenchscope/server..."`: only the server's and shared package's production dependencies, plus their sources |
| `runtime` | the `prod` tree + `apps/web/dist`; no pnpm, no dev dependencies |

At run time it is `node --import tsx src/index.ts` in `/app/apps/server` (TypeScript through tsx, as
in development), user `node` (uid 1000), code owned by root (read-only to the app), `NODE_ENV=production`,
`MODE=demo` unless overridden, `DATA_DIR=/data` (a volume), `WEB_DIST=/app/apps/web/dist`, port 8787,
`HEALTHCHECK` on `/healthz` with a 120 s start period (a fresh demo fast-forwards its history first).
tsx caches compiled files under `/tmp`, so a read-only root filesystem needs a writable `/tmp`.

To build from a registry mirror (e.g. Docker Hub rate limits), override the base image:
`docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22.22.0-bookworm-slim@sha256:... .`

## Environment reference

`deploy/live.env.example` lists every variable with comments; `deploy/demo.env.example` the demo
subset. Unset optional values take the default in the table. In live mode a missing optional piece
never stops the server: the features that need it stay off, the reason is logged at boot and counted
by `/readyz` (`live.problems`).

### Core

| Variable | Mode | Default | Meaning |
|---|---|---|---|
| `MODE` | both | `demo` | `live` (real chains, real funds) or `demo` (simulator, paper trading) |
| `NODE_ENV` | both | `production` in the image | `production` refuses development shortcuts (`LOCAL_KEYSTORE_KEY`) |
| `PORT` / `HOST` | both | `8787` / `0.0.0.0` | Listen address |
| `DATA_DIR` | both | `.data` (`/data` in the image) | Snapshot, SQLite store, local backups. One per deployment |
| `WEB_DIST` | both | `apps/web/dist` if built (`/app/apps/web/dist` in the image) | Static web build served at `/` |
| `TRUST_PROXY` | both | off | Trusted reverse-proxy hops in X-Forwarded-For (`1` behind Caddy or Fly) |
| `DEMO_URL` | live | none | Public URL of the demo deployment, linked from the live UI |
| `SNAPSHOT_EVERY_MS` | both | `900000` | Snapshot cadence; also on shutdown and restored at boot; `0` = no persistence |
| `ACCOUNT_CREATIONS_PER_IP` | both | `30` | Guest/register calls per IP per 10 min |
| `LOGIN_ATTEMPTS_PER_IP` | both | `60` | Sign-in attempts per IP per 10 min (`0` = unlimited) |
| `WS_CONNECTIONS_PER_IP` | both | `20` | Concurrent WebSockets per IP (`0` = unlimited) |

### Demo simulator

| Variable | Default | Meaning |
|---|---|---|
| `SIM_SEED` | `trenchscope` | Seed of the deterministic simulator |
| `WARMUP_MINUTES` | `90` | History fast-forwarded on a fresh start |
| `TRADE_LATENCY_MS` | random 120-600 ms | Fixed simulated confirmation latency |

### Live: accounts security

| Variable | Default | Meaning |
|---|---|---|
| `SECRETS_KEY` | none (required) | Key encrypting 2FA (TOTP) secrets and other sensitive account data at rest; 32 random bytes (`openssl rand -hex 32`; format in [LIVE.md](LIVE.md)) |
| `WHITELIST_DELAY_HOURS` | see [LIVE.md](LIVE.md) | Delay before a newly whitelisted withdrawal address can be used |
| `LIVE_SESSION_TTL_DAYS` | see [LIVE.md](LIVE.md) | Lifetime of a live-mode session |

### Live: wallets and Solana

| Variable | Default | Meaning |
|---|---|---|
| `TURNKEY_ORGANIZATION_ID`, `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY` | none | Turnkey API credentials; all three or wallets and trading stay off |
| `TURNKEY_API_BASE_URL` | `https://api.turnkey.com` | Turnkey API |
| `LOCAL_KEYSTORE_KEY` | none | **Development only**: 32-byte hex key for locally encrypted dev keypairs; ignored with `NODE_ENV=production` |
| `SOLANA_RPC_URL` | none | HTTPS JSON-RPC; unset disables balances, holders, deposits and trading |
| `SOLANA_WS_URL` | derived from `SOLANA_RPC_URL` | WebSocket RPC |
| `PUMPPORTAL_WS_URL` | `wss://pumpportal.fun/api/data` | pump.fun / PumpSwap launches, trades, migrations |
| `LIVE_MAX_TRACKED_TOKENS` | `3000` (min 100) | Tokens streamed at once; least active dropped beyond it |
| `JUPITER_API_URL` | `https://lite-api.jup.ag`, or `https://api.jup.ag` with a key | Swap routing API |
| `JUPITER_API_KEY` | none | Jupiter API key |
| `JITO_BLOCK_ENGINE_URL` | `https://mainnet.block-engine.jito.wtf` | MEV-protected sends |
| `IPFS_GATEWAYS` | `https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/` | Gateways tried in order for token metadata; the first also serves token images |

### Live: fees and EVM chains

| Variable | Default | Meaning |
|---|---|---|
| `PLATFORM_FEE_BPS` | `80` (0-300) | Platform fee per swap, basis points |
| `FEE_WALLET_ADDRESS` | none | Solana wallet receiving fees (unset: not collected, reported) |
| `EVM_FEE_WALLET_ADDRESS` | none | 0x wallet receiving fees on every EVM chain |
| `LIVE_CHAINS` | every supported EVM chain | Comma-separated chains enabled in live mode (`sol,base,robinhood,bsc,eth`) |
| `BASE_RPC_URL`, `ROBINHOOD_RPC_URL`, `BSC_RPC_URL`, `ETH_RPC_URL` | public RPCs | HTTP RPCs, comma-separated, tried in order before the rate-limited public fallbacks |
| `BASE_WS_URL`, `ROBINHOOD_WS_URL`, `BSC_WS_URL`, `ETH_WS_URL` | none (HTTP polling) | WebSocket RPC for subscriptions |
| `BASE_PRIVATE_RPC_URL`, `ROBINHOOD_PRIVATE_RPC_URL`, `BSC_PRIVATE_RPC_URL`, `ETH_PRIVATE_RPC_URL` | none | Private / MEV-protected endpoint for sending transactions |
| `KYBERSWAP_API_URL` | `https://aggregator-api.kyberswap.com` | EVM swap aggregator |
| `KYBERSWAP_CLIENT_ID` | `trenchscope` | Client id sent to KyberSwap |

### Operations

| Variable | Default | Meaning |
|---|---|---|
| `METRICS` | on | `0` disables `/metrics` (404) |
| `METRICS_TOKEN` | none (open) | Bearer token required on `/metrics` |
| `ACCESS_LOG` | off | `1`: one JSON line per HTTP request (method, route template, path without query, status, ms, IP, request id) |
| `LOG_LEVEL` | `info` | Level of the JSON logger (`trace` ... `fatal`, `silent`) |
| `BACKUP_DIR` | `DATA_DIR/backups` | Where `scripts/backup-db.ts` writes |
| `BACKUP_KEEP` | `14` | Backups kept by rotation |

Compose interpolation (`deploy/.env`): `LIVE_DOMAIN`, `DEMO_DOMAIN`, `ACME_EMAIL`, `TRENCHSCOPE_VERSION`.

## Secrets management

**Secrets** are: `SECRETS_KEY`, the Turnkey API key pair, RPC URLs that embed API keys
(`SOLANA_RPC_URL`, `*_RPC_URL`, `*_WS_URL`), `JUPITER_API_KEY`, `METRICS_TOKEN`; and the data
directory itself (password hashes, session digests, encrypted 2FA secrets, audit log).

- **Never commit them.** `deploy/.gitignore` ignores `*.env` and token files; only `*.example`
  templates are tracked, with placeholder values. `.dockerignore` keeps `.env*`, keys and `deploy/`
  out of the build context, so no secret is ever baked into an image layer: pass them at run time
  (`env_file`, `fly secrets`, systemd `EnvironmentFile`).
- **File permissions.** Env files mode 600, owned by root (systemd reads them before dropping
  privileges) or the deploying user (compose). The server creates `DATA_DIR` 700 and the snapshot
  600; backups are written 700/600.
- **Keep them out of logs.** The JSON logger (`apps/server/src/ops/log.ts`) redacts values under keys
  matching `/key|secret|token|password|authorization|cookie/i` and scrubs URL credentials, secret query
  parameters (`?api-key=`), bearer tokens and path-embedded RPC keys (`/v2/<key>`) from strings. Caddy
  redacts `Authorization` and `Cookie` headers in its access log by default.
- **One set per environment.** Staging and production never share a Turnkey organization, API key,
  `SECRETS_KEY` or RPC key.

### Turnkey API key custody

The server holds a Turnkey **API key**, not private keys: wallet keys stay in Turnkey's secure
enclaves and every signature is checked against Turnkey policies.

- Create a dedicated API user for the server with a policy that allows only what the platform does
  (signing transactions for the platform's wallets); no permission to export keys, delete wallets
  or change policies. Organization root credentials stay with two people, offline (hardware
  authenticators), never on a server.
- Store `TURNKEY_API_PRIVATE_KEY` in a secret manager (1Password / Vault / cloud KMS-backed store)
  and inject it at deploy time; nobody needs it on a laptop.
- Rotate on a schedule (e.g. quarterly) and on any suspicion: create a new API key for the API user,
  deploy it, confirm trading works, then delete the old key in Turnkey. Deleting the key in Turnkey
  is also the fastest way to stop all signing (see the [runbook](#incident-runbook)).

### SECRETS_KEY

- Generate with `openssl rand -hex 32`; store it in the secret manager **and** in an offline escrow
  (two-person access). Without it the 2FA secrets in `trenchscope.db` cannot be decrypted: every 2FA
  user is locked out of sensitive actions.
- Keep it apart from database backups: a backup plus the key is everything an attacker needs.
- **Rotation** re-encrypts stored data, so it is a maintenance operation, not an env change: stop
  the live server, take a backup, run the re-encryption procedure documented in [LIVE.md](LIVE.md)
  with the old and the new key, start with the new key, verify a 2FA login, then retire the old key.
  If the module does not provide one yet, do not change `SECRETS_KEY` on a running system.
- If the key may be compromised, treat the TOTP seeds as compromised too: rotate the key and require
  every user to re-enroll 2FA.

## TLS, reverse proxy and TRUST_PROXY

`deploy/Caddyfile` gets and renews certificates automatically (Let's Encrypt / ZeroSSL; ports 80 and
443 must be reachable), redirects HTTP to HTTPS, serves HTTP/3, compresses responses (zstd / gzip),
sets HSTS and passes WebSocket upgrades through. It also:

- answers `/metrics` with 404 on the public hosts (Prometheus scrapes the containers directly);
- sets `X-Request-Id` to a fresh UUID on every proxied request; the server keeps it (as it trusts
  the proxy) and echoes it in the `x-request-id` response header, so a user-reported id finds both
  the Caddy and the server log lines;
- keeps WebSockets open for up to 5 minutes across config reloads (`stream_close_delay`).

**TRUST_PROXY** tells the server how many proxies in front of it append to `X-Forwarded-For`. The
client IP (used by the per-IP limits on sign-ups, sign-ins and sockets) is the entry the outermost
trusted proxy appended; entries a client sends itself are ignored.

| Setup | TRUST_PROXY |
|---|---|
| Caddy (compose, systemd host) or the Fly proxy | `1` |
| Cloudflare (proxied DNS) -> Caddy -> server, with Caddy's `trusted_proxies` set to Cloudflare's ranges (otherwise Caddy replaces the header and every client looks like a Cloudflare edge) | `2` |
| Server reachable directly (no proxy) | unset |

Never publish the app port to the internet with `TRUST_PROXY` set: a client talking to it directly
could pick its own address. Compose only `expose`s it; systemd binds 127.0.0.1. With another proxy
(nginx, a cloud load balancer), forward `Upgrade` / `Connection` headers for `/ws`, raise idle
timeouts above the 15 s WebSocket heartbeat (e.g. `proxy_read_timeout 120s`), and append the client
address to `X-Forwarded-For`.

## Health, readiness and shutdown

| Endpoint | Meaning | Status |
|---|---|---|
| `GET /healthz` | Liveness: the process answers and its event loop turns. `{status, uptimeSeconds, eventLoopDelayP99Ms}` | always 200 when it answers |
| `GET /readyz` | Readiness: the engine (market clock, tickers) runs; in live mode the market feed is connected and, when `SOLANA_RPC_URL` is set, the RPC passes its probe. Lists per-chain live status (when the live market reports it), `degraded` parts (a chain whose own feed or RPC is down, a missing durable store) and the number of configuration problems; never URLs, keys or error messages | 200 ready, 503 not ready |
| `GET /metrics` | Prometheus text format (below) | 200; 401 without the `METRICS_TOKEN` bearer; 404 with `METRICS=0` |
| `GET /api/health` | Legacy app health (tokens, clients, tps) | 200 |

Use `/healthz` for container and platform health checks (restarts, routing) and `/readyz` for
alerting, deploy verification and, with several upstreams, load-balancer membership. With a single
instance, routing on `/readyz` would take the whole site offline whenever an upstream feed is down.

**Shutdown.** On SIGTERM / SIGINT the server stops the live market and the engine, finishes a
background snapshot in progress, writes a final snapshot and closes HTTP and WebSockets. It exits
non-zero if closing fails, and gives up after 45 s so the supervisor's grace period (60 s:
`stop_grace_period`, `TimeoutStopSec`, `kill_timeout`) never has to SIGKILL it mid-write (the
snapshot is written to a temp file and renamed, so even a kill leaves the previous one intact).
The engine stopping first makes `/readyz` report 503 while the process drains.

## Backups and the restore drill

What to back up, per deployment: `DATA_DIR/trenchscope.db` (live: the durable money and security
records) and `DATA_DIR/snapshot.bin` (the world, accounts, orders and analytics state).
`apps/server/scripts/backup-db.ts` takes an online backup while the server runs:

- the database through `VACUUM INTO` (a consistent copy inside one read transaction; in WAL mode
  writers continue), then checked with `PRAGMA quick_check`;
- the snapshot by plain copy (the server replaces it by atomic rename, so the copy is a whole file);
- into `BACKUP_DIR/trenchscope-<UTC timestamp>/` with a `manifest.json` (sizes, sha256), written to a
  temp directory and renamed; the newest `BACKUP_KEEP` are kept; exits 0 with a message when there is
  nothing to back up yet.

```bash
docker compose exec -T live node --import tsx scripts/backup-db.ts             # compose
systemctl start trenchscope-backup@live                                       # systemd (timer: every 6 h)
fly ssh console --app trenchscope-live -C "sh -c 'cd /app/apps/server && node --import tsx scripts/backup-db.ts'"   # Fly.io
(cd apps/server && DATA_DIR=/path/to/data npx tsx scripts/backup-db.ts --keep 30)    # anywhere
```

With compose, schedule it from the host's cron, e.g.
`17 */6 * * * cd /srv/trenchscope/deploy && docker compose exec -T live node --import tsx scripts/backup-db.ts`.

**Get them off the host.** Local backups share the disk with the data. Ship `BACKUP_DIR` to object
storage with client-side encryption (restic or rclone crypt) after each run, with a retention policy
(e.g. 4 x 6-hourly, 14 daily, 8 weekly). On Fly, also keep the platform's daily volume snapshots.
Backups contain password hashes and encrypted 2FA secrets: same access controls as production.

**Recovery point.** A restore loses what happened after the backup. On-chain state (balances,
confirmed swaps, deposits, withdrawals) is the source of truth: after a restore, reconcile recent
fills and transfers against the chain (see [LIVE.md](LIVE.md)) before re-enabling withdrawals.

### Restore drill (monthly, and before go-live)

1. Pick the latest off-host backup; check every file against `manifest.json`
   (`sha256sum trenchscope.db snapshot.bin`).
2. Restore into a scratch directory and boot a throwaway instance on another port **without signing
   credentials** (no `TURNKEY_*`), so it cannot move funds:
   ```bash
   mkdir -p /tmp/drill && cp backup/trenchscope.db backup/snapshot.bin /tmp/drill/
   sudo chown -R 1000:1000 /tmp/drill && sudo chmod 700 /tmp/drill    # the image's user
   docker run --rm -p 127.0.0.1:9787:8787 -v /tmp/drill:/data -e MODE=live -e SECRETS_KEY=... trenchscope:<tag>
   curl -s 127.0.0.1:9787/api/health      # tokens / state restored; log shows "restored snapshot from ..."
   ```
   Sign in with a test account and check its history, whitelist and 2FA (proves `SECRETS_KEY` matches).
3. Record the time it took (the recovery time objective) and anything that surprised you.

### Real restore

1. Pause trading (runbook) and stop the server: `docker compose stop live`.
2. Move the current data aside (keep it for the post-mortem), including the database's `-wal` /
   `-shm` files: a leftover WAL would be replayed on top of the restored database. Then copy the
   backup's `trenchscope.db` and `snapshot.bin` into `DATA_DIR`, owned by the server user (uid 1000
   in the image), mode 600. With compose, through a one-off container on the volume (a backup from
   off-host goes in first with `docker compose cp <dir> live:/data/restore`):
   ```bash
   docker compose run --rm --no-deps --entrypoint sh live -c '
     set -e; B=/data/backups/trenchscope-<timestamp>; A=/data/broken-$(date +%Y%m%d%H%M)
     mkdir -m 700 -p "$A"; mv /data/trenchscope.db* /data/snapshot.bin "$A"/ 2>/dev/null || true
     for f in trenchscope.db snapshot.bin; do
       if [ -f "$B/$f" ]; then cp "$B/$f" /data/ && chmod 600 "/data/$f"; fi
     done; ls -la /data'
   ```
3. Start (`docker compose start live`), check `/readyz` and the boot log ("restored snapshot from
   ..."), reconcile against the chain, then resume trading.

## Monitoring and logging

### Metrics

`/metrics` (Prometheus text format 0.0.4, no client library) exports:

| Family | Metrics |
|---|---|
| Process | `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes`, `nodejs_external_memory_bytes`, `process_cpu_{user,system}_seconds_total`, `process_start_time_seconds`, `process_uptime_seconds` |
| Event loop | `nodejs_eventloop_lag_{p50,p99,max,mean}_seconds`: delay beyond the sampling interval over the last 15 s window (`perf_hooks.monitorEventLoopDelay`) |
| HTTP | `trenchscope_http_requests_total{method,route,status}`, `trenchscope_http_request_duration_seconds{method,route}` (histogram). `route` is the route template (`/api/:chain/tokens/:address`), `static` for web assets, `unmatched` for 404s and the SPA fallback; series per metric are capped |
| WebSocket | `trenchscope_ws_connections`, `trenchscope_ws_channels{family}`, `trenchscope_ws_subscriptions{family}`, `trenchscope_ws_subscription_groups{family}` (distinct computations per push) |
| Engine | `trenchscope_engine_running`, `trenchscope_engine_trades_per_second`, `trenchscope_engine_tick_seconds`, `trenchscope_engine_clock_lag_seconds` |
| World | `trenchscope_world_tokens{chain}`, `trenchscope_world_tokens_active{chain}`, `trenchscope_world_wallets{chain}`, `trenchscope_world_trades_total` |
| Live | `trenchscope_live_feed_connected{chain}`, `trenchscope_live_rpc_healthy{chain}`, `trenchscope_live_trading_enabled{chain}`, `trenchscope_live_tracked_tokens{chain}`, `trenchscope_live_feed_last_event_age_seconds{chain}`, `trenchscope_live_config_problems` |
| Info | `trenchscope_info{mode,node_version} 1` |

Server modules add counters for events only they see through `counter()` from
`apps/server/src/ops`, e.g.
`counter('trenchscope_rpc_errors_total', 'RPC calls that failed', ['chain']).inc({ chain })`.
The alert rules expect `trenchscope_rpc_errors_total{chain}`, `trenchscope_tx_sent_total{chain}` and
`trenchscope_tx_failed_total{chain}` from the live execution and RPC code.

Scrape on the private network with the token (`deploy/prometheus/prometheus.yml`; the compose
profile `monitoring` runs it with `deploy/prometheus/alerts.yml`):

```yaml
- job_name: trenchscope
  metrics_path: /metrics
  authorization: { type: Bearer, credentials_file: /etc/prometheus/live.token }
  static_configs: [{ targets: ["live:8787"], labels: { deployment: live } }]
```

### What to alert on

`deploy/prometheus/alerts.yml` implements these; tune thresholds on real traffic.

| Signal | Rule (starting point) | Why |
|---|---|---|
| Event-loop lag | `nodejs_eventloop_lag_p99_seconds > 0.5` for 5m | One thread serves everything: lag delays requests, pushes and order triggers |
| Live feed down | `trenchscope_live_feed_connected == 0` for 2m | Lists, prices and positions go stale |
| Live feed lag | `trenchscope_live_feed_last_event_age_seconds > 120` for 5m (per chain) | Connected but silent feed |
| RPC health / errors | `trenchscope_live_rpc_healthy == 0` for 2m; `rate(trenchscope_rpc_errors_total[5m]) > 1` | Balances, deposits, trading |
| Failed transactions | `rate(trenchscope_tx_failed_total[15m]) / rate(trenchscope_tx_sent_total[15m]) > 0.2` | Fees too low, RPC / Jito problems, slippage |
| Trading disabled | `trenchscope_live_trading_enabled == 0` for 5m | Signer, RPC or router missing |
| WebSocket connections | drop below half the hourly average | Proxy, TLS or socket-cap problems |
| 5xx rate, API p99 | > 2 % for 10m; p99 > 1 s | Errors and saturation |
| Engine | `trenchscope_engine_running == 0`, clock lag > 5 s | Nothing ticks |
| Up / readiness | `up == 0`; an external probe of `/readyz` (blackbox exporter or uptime service) | Outages users see |
| Memory, disk | RSS > 3.5 GB; free space on the data volume < 20 %; newest backup older than 12 h | Capacity, backup health |

### Logs

The server logs to stdout/stderr (collected by Docker's json-file driver with rotation, journald under
systemd, `fly logs`). `ACCESS_LOG=1` adds one JSON line per request with the request id; the JSON
logger in `apps/server/src/ops/log.ts` (`createLogger`, `redact`, `requestIdOf`) is pino-shaped and
can also be handed to Fastify as `loggerInstance`. Ship logs to a store with retention and access
control; they contain IP addresses.

## Scaling limits

- **One process per deployment.** The world (tokens, wallets, positions, candles), sessions, the
  WebSocket hub and order / copy-trade / sniper automation live in that process's memory, and live
  mode's SQLite store has one writer. Two instances on one data directory would corrupt it; two
  instances with separate data would double-execute automation and split users. Run exactly one
  (`fly scale count 1`; no replicas in compose).
- **Scale up, not out.** The work is single-threaded JavaScript: event-loop lag is the saturation
  signal. Give it a fast core and memory (live: 4 GB to start; demo: 2 GB; snapshots of a busy demo
  world are tens of MB and grow with the tokens and wallets tracked). Raise
  `NODE_OPTIONS=--max-old-space-size=...` with the container memory. Lower `LIVE_MAX_TRACKED_TOKENS`
  before adding hardware when the live feed dominates.
- **Sockets.** Each subscription group is computed once per push and fanned out, so many viewers of
  the same lists are cheap; many distinct filter sets are not (`trenchscope_ws_subscription_groups`).
  Per-IP socket caps protect against single clients.
- **SQLite** handles the live store's write rate comfortably (synchronous, WAL); it rules out a
  second writer, not volume. Keep the data volume on local SSD (not network file systems).
- Going beyond one process needs an architectural change (shared store, a feed-ingestion worker,
  a pub/sub fan-out tier) and is out of scope for this deployment.

## RPC providers

| Chain | Recommendation |
|---|---|
| Solana | **Helius** or **Triton** (dedicated or staked endpoints for trading, WebSocket support, Jito for sends). Public RPC is not usable for a trading platform. |
| Robinhood Chain | **Alchemy**, the officially recommended provider for Robinhood Chain (HTTPS + WSS endpoints of a Robinhood Chain mainnet app). |
| Base, BNB Chain, Ethereum | Any reputable provider (Alchemy, QuickNode, Infura, Chainstack, ...). Configure two (comma-separated `*_RPC_URL`), a WebSocket endpoint, and a private / MEV-protected send endpoint (e.g. Flashbots Protect on Ethereum) in `*_PRIVATE_RPC_URL`. |

Without `*_RPC_URL` the EVM chains fall back to rate-limited public endpoints (reported at boot):
fine for demo-like smoke tests, not for production. `apps/server/scripts/evm-rpc-check.ts` checks
every configured EVM RPC (block, gas price, chain id) read-only.

## Releases and rollback

- CI (`.github/workflows/ci.yml`) runs on every push and pull request: typecheck, server and web
  tests, web build, a Docker build with a container smoke test (`/healthz`, `/readyz`, `/metrics`,
  the web root, graceful stop), and the Playwright suite (non-blocking).
- Tag images with the git sha (`TRENCHSCOPE_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build`)
  so a rollback is `TRENCHSCOPE_VERSION=<previous> docker compose up -d`.
- Take a backup before every live deploy. A rollback across a snapshot format change
  (`SNAPSHOT_VERSION`) or a store migration needs the backup taken before the upgrade.
- Deploy live outside peak hours: a deploy restarts the process (seconds of downtime; WebSocket
  clients reconnect and resubscribe).

## Go-live security checklist

Key custody
- [ ] Turnkey API user with a least-privilege signing policy; root credentials offline with two people; API key in a secret manager, rotation scheduled.
- [ ] `SECRETS_KEY` generated fresh for production, stored in the secret manager and in offline escrow, not alongside backups.
- [ ] `NODE_ENV=production` (no `LOCAL_KEYSTORE_KEY` anywhere); fee wallets are addresses whose keys are held outside the platform.
- [ ] No secret in git history, images or CI logs (`deploy/*.env` ignored; `docker history` clean).

User protection
- [ ] Withdrawal whitelist on, with `WHITELIST_DELAY_HOURS` long enough for a user to notice a change; 2FA required for withdrawals and whitelist edits; audit log reviewed.
- [ ] `LIVE_SESSION_TTL_DAYS` set deliberately; sign-out revokes sockets.

Edge
- [ ] TLS via Caddy (or equivalent) with HSTS; HTTP redirects to HTTPS; app port not published; `TRUST_PROXY` equals the real hop count.
- [ ] Rate limits set (`ACCOUNT_CREATIONS_PER_IP`, `LOGIN_ATTEMPTS_PER_IP`, `WS_CONNECTIONS_PER_IP`) and verified from outside (the per-IP counters see real client IPs).
- [ ] CSP and security headers present on every response (`curl -I https://app...`); no inline script beyond the hashed ones.
- [ ] `/metrics` 404 from the internet and token-protected inside; `/readyz` reveals no secrets.

Supply chain
- [ ] Builds from `pnpm-lock.yaml` with `--frozen-lockfile`; dependency versions pinned; base images pinned by digest; updates via reviewed PRs (Dependabot / Renovate), never auto-merged for runtime dependencies.
- [ ] GitHub Actions pinned to versions (SHA pinning preferred); CI has read-only permissions; branch protection requires CI.

Operations
- [ ] Backups scheduled, shipped off-host, encrypted; a restore drill done and timed.
- [ ] Alerts routed to a pager; on-call knows this runbook; the kill switch (below) rehearsed.
- [ ] Least-privilege support access: production shell / Fly / Turnkey / secret-manager access limited to named on-call engineers with MFA; support staff work from the admin UI and the audit log, never the database; every access logged.
- [ ] Container hardening as in compose (non-root, read-only root, no capabilities, no-new-privileges) or the systemd sandbox.

## Incident runbook

Start an incident log (time, who, what) before acting; keep it through the post-mortem.

### Pause trading (stop all signing)

Fastest first:

1. **Turnkey** (no deploy, takes effect at once): disable / delete the server's API key, or switch its
   policy to deny signing. Every swap, order, copy trade, sniper and withdrawal stops; the site
   stays up so users see their positions. Undo by issuing a new API key (`TURNKEY_API_*`) and restarting.
2. **Take the live API off the edge**: in the Caddyfile, answer the live host with a maintenance
   response (`respond "Trading is paused for maintenance" 503`) and `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
   The process keeps running (automation included): combine with step 1.
3. **Stop the live server**: `docker compose stop live` (writes its snapshot). Nothing runs; nothing
   is served. The demo stays up.

Then post a status notice and link users to the demo site meanwhile.

### Rotate keys

| Secret | How |
|---|---|
| Turnkey API key | New API key for the API user; update `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY`; `docker compose up -d live`; verify a small trade; delete the old key in Turnkey |
| `SECRETS_KEY` | Maintenance procedure in [Secrets management](#secrets_key); if compromised, require 2FA re-enrollment |
| RPC / Jupiter keys | Create the new key at the provider, update the env, restart, revoke the old one; check `trenchscope_live_rpc_healthy` |
| `METRICS_TOKEN` | Update the env and `deploy/prometheus/*.token` together; restart; reload Prometheus |
| ACME / TLS | Caddy renews automatically; on key compromise, revoke at the CA and remove `caddy-data` to force new certificates |

User sessions are revoked by the accounts module (see [LIVE.md](LIVE.md)); after a credential
leak, invalidate sessions and notify affected users.

### Common incidents

| Symptom | First checks | Action |
|---|---|---|
| `/readyz` 503, `checks.feed: down` | `trenchscope_live_feed_connected`, provider status (PumpPortal), boot log | Wait for reconnect; if prolonged, post a notice; trading on stale prices is the risk: pause if prices diverge |
| `checks.rpc: down`, RPC errors | Provider status page, `trenchscope_rpc_errors_total`, quota | Switch to the backup provider (`*_RPC_URL` list order), restart |
| Failed transaction spike | Congestion, priority fees, Jito status, slippage settings | Raise fee tiers / pause snipers; pause trading if funds are at risk |
| Event-loop lag high | CPU, `trenchscope_ws_subscription_groups`, recent deploy | Roll back a bad deploy; lower `LIVE_MAX_TRACKED_TOKENS`; scale up the machine |
| Memory climbing | `process_resident_memory_bytes`, tokens / wallets gauges | Restart during low traffic (state persists); open an issue with the trend |
| Disk full | Data volume usage, `BACKUP_DIR`, logs | Lower `BACKUP_KEEP` / ship backups off-host; grow the volume |
| Suspected compromise | Audit log, Turnkey activity log, withdrawals | Pause trading via Turnkey immediately, rotate every secret, preserve logs and data for forensics, notify users as required |

### After the incident

Restore service, reconcile balances and pending transfers against the chain, write the post-mortem
(timeline, impact, root cause, follow-ups), and rehearse any step of this runbook that did not work.
