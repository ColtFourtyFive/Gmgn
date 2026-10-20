# Trenchscope

A web-only, multi-chain **memecoin trading terminal** — our own spinoff of the product category
GMGN.ai defined (Trenches, Trending, token audits, smart-money and KOL tracking, copy trading,
sniping, limit / take-profit / stop-loss / trailing orders), rebuilt from scratch with an original
brand and design.

Trenchscope ships with a **deterministic market simulator** and **paper trading**, so the whole
product works end to end with no wallet, RPC or market-data API: bonding-curve launchpads, AMM
migrations, rugs, snipers, bundlers, insiders, smart money, KOL calls and whales all happen live
in the browser.

> Simulated market · paper trading only. Nothing here touches real funds or real chains.

## Features

| Area | What you get |
|---|---|
| **Trenches** | Three live columns (New · Near graduation · Migrated) per chain, compact token cards with curve progress, risk chips (top 10, dev, insiders, snipers, bundlers), smart/KOL counts, badges, hover previews, one-click buy, per-column filters and presets, pause-on-hover, keyboard trading |
| **Trending / New Pairs / Narratives** | 1m–24h windows, server-side sorts and 30+ filters, heat-ranked narratives |
| **Token page** | Live candles (1s–1d, price/market-cap), wallet-class trade markers, buy/sell panel with P1/P2/P3 presets, auto slippage, anti-MEV, quote preview, limit orders, exit strategies (TP/SL ladders, trailing, dev-sell, migration-sell), risk gate; audit panel with rug ratio, holder structure, dev history; live activity, holders, top traders, position, orders |
| **Wallets** | Wallet profiles with 1D/7D/30D/All PnL, win rate, PnL distribution, style title, speed, badges, copy score; leaderboards for smart money, KOLs, snipers, whales |
| **Monitor & signals** | Live smart-money / KOL / followed-wallet feeds, smart-money convergence, 13 signal types (smart buys, KOL calls, migrations, dev sells, ATHs, price spikes, ...) |
| **Automation** | Copy trading (fixed/ratio, filters, mirror sells, exit strategies), sniping (new launches, migrations, dev launches), price / market-cap / wallet / keyword alerts |
| **Account** | One-click guest paper account (or username/password), per-chain paper wallets with a faucet, portfolio with equity curve, watchlist, notifications, referral rewards, settings |
| **Chains** | Solana, BNB Chain, Base, Ethereum — each with its own launchpads, curves and DEX |

## Quick start

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
pnpm dev            # API on :8787 (with WebSocket), web on :5173 (proxies /api and /ws)
```

Open http://localhost:5173 and click **Sign in → Quick start** for a guest paper account.
On boot the server fast-forwards `WARMUP_MINUTES` (default 90) of market history in a few seconds,
so every list is populated immediately.

Production-style single process (API serves the built web app):

```bash
pnpm build
pnpm start          # http://localhost:8787
```

## Configuration (server environment)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `SIM_SEED` | `trenchscope` | Seed of the deterministic simulator |
| `SIM_SCENARIO` | `normal` | Demo mode only: simulator preset `normal`, `rug_wave`, `cto_pump`, `bundle_launch`, `honeypot_evm` or `quiet` (unknown = `normal` with a warning; ignored in live mode) |
| `WARMUP_MINUTES` | `90` | History fast-forwarded on a fresh start |
| `DATA_DIR` | `.data` | Where snapshots are written |
| `SNAPSHOT_EVERY_MS` | `900000` | Periodic snapshot cadence; snapshots are also written on shutdown and restored at boot (`0` = persistence off: nothing is restored or saved, not even on shutdown) |
| `TRADE_LATENCY_MS` | random 120–600 ms | Fixed simulated confirmation latency |
| `ACCOUNT_CREATIONS_PER_IP` | `30` | Guest/register calls per IP per 10 minutes |
| `LOGIN_ATTEMPTS_PER_IP` | `60` | Login calls per IP per 10 minutes, any username (`0` = unlimited) |
| `WS_CONNECTIONS_PER_IP` | `20` | Concurrent WebSocket connections per client IP (`0` = unlimited; local loopback clients exempt) |
| `TRUST_PROXY` | off | Trust `X-Forwarded-For` behind a reverse proxy: `1`/`true` = one proxy in front, `N` = a chain of N; the client IP is the entry the outermost trusted proxy appended, so entries a client sends itself are ignored |
| `WEB_DIST` | `apps/web/dist` if built | Static web build to serve |

## Repository layout

```
packages/shared   API contract (types), chains & launchpads, curve/AMM math, formatters
apps/server       Fastify API + WebSocket hub, market simulator, analytics, accounts, trading
apps/web          React terminal UI (Vite, Tailwind, lightweight-charts)
docs/             API.md (REST + WS contract), ARCHITECTURE.md, PRD.md, research/
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit and
[docs/API.md](docs/API.md) for every endpoint and channel.

## Development

```bash
pnpm typecheck                      # all packages
pnpm test                           # server + web unit/integration tests
(cd apps/server && npx tsx scripts/sim-report.ts 120)                 # simulator realism report
(cd apps/server && node --expose-gc --import tsx scripts/soak.ts 360)  # memory / snapshot soak
(cd apps/server && npx tsx scripts/ground-truth.ts --minutes 60 --scenario rug_wave)  # ground-truth export + label report
pnpm e2e                            # builds the web app, then runs the Playwright end-to-end suite (desktop + mobile)
```
