# Trenchscope architecture

Trenchscope is a web-only memecoin trading terminal: our own spinoff of the GMGN product surface
(Trenches, Trending, token pages with audits, smart-money tracking, copy trading, sniping, limit /
TP / SL / trailing orders, token launches). It runs in one of two modes per deployment: **demo**
(`MODE=demo`, default), against a **deterministic market simulator** with **paper trading**; or
**live** (`MODE=live`), against real Solana data with real swaps from per-user embedded wallets
(see [Live mode](#live-mode) below and the runbook in [LIVE.md](LIVE.md)).

```
┌───────────────────────────── apps/web (Vite + React) ─────────────────────────────┐
│ pages/*        one file per route (routes.tsx: the route table App renders)         │
│ copy/          wording that differs by mode (demo / live) and chain                 │
│ components/    ui · common · layout · trade        design system, shell, trading   │
│                discovery · token · wallet · monitor · signals · callouts ·          │
│                launch · share · account            page areas                      │
│ lib/api.ts     typed REST client      lib/ws.ts  one socket, ref-counted channels   │
│ store/         session · ui · toasts · dock · tour (zustand)                        │
└────────────────▲─────────────────────────────────────────────────▲─────────────────┘
                 │ REST /api/*                                       │ WebSocket /ws
┌────────────────┴─────────────── apps/server (Fastify) ─────────────┴─────────────────┐
│ app.ts          composition root, security headers, per-IP limits, static web          │
│ persistence.ts  v8 snapshots          ws/hub.ts  channels grouped by (channel, params) │
│                                                                                        │
│ accounts/   auth, sessions, settings, follows, watchlist + groups, blacklist,          │
│             notifications, rewards                                                     │
│ trading/    execution (quotes, swaps, fees, latency, MEV, congestion landing),         │
│             orders (limit / TP / SL / trailing / dev-sell / migration), strategies,    │
│             copytrade, sniper, alerts, portfolio, launch ("cooking")                   │
│ analytics/  tokens/   summaries, security + rug ratio + safety score, holders,         │
│                       top traders, early buyers, lists (trenches/trending/new pairs),  │
│                       narratives, search, list channels                                │
│             wallets/  classification tags, profiles & period stats, style & copy       │
│                       score, leaderboards, feeds, signals, call-outs                   │
│ sim/        world.ts      ledger: tokens, curves, pools, wallets, positions, candles   │
│             engine.ts     tick loop + warmup fast-forward                              │
│             market.ts     agent market (demo): launches, fates, rugs, migrations       │
│             behaviors/    roster, launch, fate, trader, scheduler                      │
│             congestion.ts per-chain network congestion                                 │
│             scenarios.ts  SIM_SCENARIO presets; groundTruth.ts offline truth export    │
│ live/       config.ts · services.ts (RPC connection, signer) · market.ts (LiveMarket)  │
│             feed/       PumpPortal client, message schemas, ingest, tracked-token cap  │
│             enrich/     metadata (SSRF-guarded), prices, on-chain security, lookup     │
│             execution/  LiveVenue: pump curve / Jupiter, tx assembly, Jito, confirm,   │
│                         fill parsing, per-account send lanes                           │
│             signer/     Turnkey (production), local-dev keystore (development)         │
│             wallets/    balance sync, deposits, withdrawals, /api/wallet/* routes      │
│ store/      SQLite durable store (live): state blobs, audit, fills, transfers          │
└────────────────────────────────────────────────────────────────────────────────────────┘
                 packages/shared: types (API contract), chains, math, formatters
```

## Principles

- **One ledger.** Every swap (simulated agent or human paper trade) goes through
  `World.executeSwap`, which prices against the bonding curve or AMM pool, updates reserves,
  balances, positions (average-cost PnL), holder sets, candles (8 resolutions) and minute buckets,
  then emits a `trade` event. Analytics never sees a different history than the chart.
- **Observable-only analytics.** The simulator keeps hidden state (token fate, hype, agent
  archetype/skill). Analytics, classification and risk scores use only what a real indexer could see
  (trades, balances, funding links, blocks, timestamps); hidden state is used only in tests to
  measure classifier quality (rug-ratio AUC, smart-money precision/recall).
- **Contract first.** `packages/shared/src/types.ts` + `docs/API.md` define every DTO, endpoint and
  channel. Server modules talk through the interfaces in `apps/server/src/context.ts`.
- **Realtime by channel.** The hub groups subscriptions by `(channel, params)` so each distinct query
  (e.g. a Trenches filter set) is computed once per cadence and fanned out (queries that differ only in
  viewers' blacklist exclusions share one computation and, when nothing shown is hidden, one payload);
  each connection's messages are handled in order, subscriptions are capped per socket, sockets per IP,
  and a heartbeat closes silent or stalled peers; frames are compressed
  with permessage-deflate. Private data flows only on the authenticated `user` channel, indexed by
  account and revoked on logout.
- **Deterministic simulation.** All randomness flows through a seeded `Rng`; the sim clock
  (`world.now`) follows wall time live and fast-forwards during warmup so the market is populated on
  boot.
- **Bounded memory.** Tokens are capped per chain (oldest dormant tokens nobody references are
  pruned; open orders and alerts pin theirs). Simulated wallets' positions in a pruned token go with
  it (folded into `WalletState.pruned`, so all-time wallet stats still count them; account wallets
  keep theirs), and single-use crew and launcher wallets left with nothing live (newcomer wallets
  after a day idle) are swept from the world and the agent roster. Per-token and per-wallet histories
  are ring buffers.

## Market model

- Bonding curves are constant-product on virtual reserves with a cap on real tokens (pump-style:
  ~30 SOL virtual, 793.1M curve tokens, ~$70-90k graduation market cap). Completing the curve moves
  the remaining liquidity into a constant-product AMM pool with burned LP.
- Launchpads, DEXes and chain parameters live in `packages/shared/src/chains.ts`.
- Agents: retail, bots, snipers, smart money, KOLs (with calls), whales, sandwich bots, serial devs,
  bundlers and insiders funded by devs, fresh wallets, exchange funders, address poisoners (dust from
  look-alikes of the exchange wallets). Each launch draws a hidden
  fate (dud, rug, slow rug, pump & dump, runner, moon); user launches are adopted by the market with
  a fate drawn from observable launch quality and are never rugged on the user's behalf.
- Congestion rises with throughput and periodic launch rushes; it scales fee suggestions and makes
  under-priced transactions fail to land.
- Scenario presets (`sim/scenarios.ts`, env `SIM_SCENARIO`, demo mode only): `normal` (default),
  `rug_wave`, `cto_pump`, `bundle_launch`, `honeypot_evm`, `quiet`. A preset only rescales the hidden
  mix (launch rate, order flow, fate weights, bundle rate and size, EVM honeypots, CTO and revival
  odds, the seeded population, address poisoning); agents behave the same. `/api/meta` names the
  running preset (`sim.scenario`), never its parameters.

## Persistence

Demo mode persists through snapshots only (below). Live mode adds the durable store (see
[Live mode](#durable-store-live)): accounts and trading state are restored from the store and written
as `null` into snapshots; world, market and analytics still use the snapshot.

`persistence.ts` writes the world + every module's `serialize()` output with `node:v8` to
`DATA_DIR/snapshot.bin` (atomic rename) every `SNAPSHOT_EVERY_MS` (15 minutes by default) and on
shutdown; `SNAPSHOT_EVERY_MS=0` turns persistence off (no snapshot is restored at boot or written, not
even on shutdown). The file is a sequence of frames (root sections split per field, long arrays such as tokens,
wallets and analytics tracks in chunks of 200), so the periodic save serializes and writes it a slice
at a time with the sim held (`Engine.hold`) instead of blocking requests and sockets for seconds; the
shutdown save writes the same format in one pass, and single-blob files from earlier versions still
load. Snapshots keep only recent trades (100 per token) and no 1s candles, but still grow with the
tokens and wallets tracked. Without a snapshot the server seeds a population and fast-forwards
`WARMUP_MINUTES` of history.

## Testing

- `apps/server/test`: unit + integration tests per module (vitest), including simulator realism
  and determinism, classifier evaluations, money/PnL math, order triggers, auth and hub behaviour.
- `apps/web/src/**/*.test.*`: component and hook tests (vitest + jsdom).
- `apps/web/e2e`: Playwright end-to-end suite against the real server serving the built app.
- `apps/server/scripts`: `sim-report.ts` (market realism report), `soak.ts` (memory/snapshot soak) and
  `fake-pumpportal.ts` (dev/test: a local stand-in for the PumpPortal feed).
- Live mode: `live-*.test.ts`, `store.test.ts`, `security.test.ts`, `accounts-live.test.ts` and
  `live-integration.test.ts`, all offline (fixtures, fake RPC, local feed server).
  `ground-truth.ts` (runs a seed + scenario and writes JSON with wallet archetypes, token fates and
  true launch cohorts next to what analytics derived, plus the label precision / recall report; offline
  only, no HTTP route).

## Live mode

The simulator sits behind the `World` ledger and its events, so live mode swaps two seams and keeps
everything else (analytics, orders, copy trading, sniping, alerts, API, WebSocket, UI):

- **`MarketSource`** (`context.ts`): `MarketSim` (demo) or `LiveMarket` (`live/market.ts`), chosen in
  `app.ts` by `config.mode`. Optional `ensureToken` / `ensureWallet` load a mint or wallet the World has
  not seen (live: from chain, shared in-flight lookups, negative cache; demo: plain lookups); token
  routes, search, the token channel, wallet routes, follows, copy trading and alerts call them.
- **`Venue`** (`trading/execution.ts`): `SimVenue` (demo, the ledger with simulated latency, congestion
  and MEV) or `LiveVenue` (`live/execution/venue.ts`). The `Executor` keeps idempotency, rate limits,
  in-flight sell reservations and the post-fill fan-out for both.

Live mode serves Solana only: an HTTP `preValidation` hook and a hub channel guard refuse other chains
(`chain_not_enabled`); guests, the faucet and token launches are disabled.

### Live data flow

```
PumpPortal WS ──► feed/pumpportal.ts (one socket; subscribeNewToken + subscribeMigration always,
                  token / account trade subscriptions diffed and batched; ping/stale/backoff)
             ──► feed/messages.ts (zod; bad frames counted and dropped; text sanitized)
             ──► LiveMarket queue ──(engine tick, never during a snapshot hold)──► feed/ingest.ts
                    create  → World.addExternalToken (launch curve) + the dev's initial buy
                    trade   → World.recordExternalTrade (post-trade reserves, newTokenBalance,
                              dedupe by signature|wallet|token; unknown mints parked until loaded)
                    migrate → World.completeCurve + migrateExternal (canonical PumpSwap pool, LP burned)
             ──► World events ──► analytics ──► REST + hub channels (unchanged)
enrich/: metadata.ts (IPFS gateways; https only, private-address and DNS-rebinding guards, size and
         time caps) · prices.ts (Jupiter Price v3: SOL/USD, held / protected tokens) · security.ts
         (mint/freeze authorities, top holders → World.syncHolderBalance) · lookup.ts (on-demand mints)
         · budget.ts (LIVE_RPC_RPS shared budget, page loads first)
feed/tracker.ts: at most LIVE_MAX_TRACKED_TOKENS streamed; idle ones dropped; tokens held by an
         account, watch-listed, pinned by orders / alerts or open in a client are protected.
```

### Live execution flow

```
POST /api/trade/swap (or an order / copy / snipe) ─► Executor ─► LiveVenue.run
  per-account lane (shared with withdrawals):
    plan   pump curve (SDK math on chain reserves) while on a SOL-quoted curve, else Jupiter v1 quote
    check  SOL balance − lamports committed to this account's unconfirmed sends ≥ spend + fees + rent
    build  v0 tx: compute budget · [buy: platform fee] · swap (curve or Jupiter route + lookup tables)
           · [sell: platform fee on min-out, after unwrap] · [anti-MEV: Jito tip last]
    sign   SignerApi (Turnkey) → same message bytes + valid ed25519 signature checked
    send   Jito block engine (anti-MEV, bundleOnly) or RPC with preflight; refusals vs ambiguous errors
  confirm  signature status until lastValidBlockHeight (rebroadcast the same bytes, never re-sign);
           timeout → tracked in the background, receipt carries the txHash
  settle   getTransaction → balance deltas (token, SOL, fee, tip, rent) → World.recordExternalTrade
           on the account's wallet (or fees added when the feed booked it first) → LiveFillRecord
           → fan-out: exit orders, `fill` + `balance` pushes, rewards volume
```

Embedded wallets: registration calls `SignerApi.createWallet` first and creates the account's World
wallet **at the embedded address**, so feed trades of that address and our own fills land on one
position. `live/wallets/` keeps balances in sync from chain (`World.syncWalletBalances`, reads that
raced the account's own transaction dropped), scans deposits from a persisted cursor, and runs
withdrawals (2FA, whitelist, rate limit; recorded `pending` → `sent` with signature before broadcast →
`confirmed` / `failed`; resumed after a restart, never re-sent).

### Durable store (live)

`store/sqlite.ts` (`node:sqlite`, WAL, `synchronous=FULL`, file mode 0600, versioned migrations):

| Table | Content |
|---|---|
| `state` | Module blobs (`accounts`, `trading`, `live-wallets` cursors) with a codec that keeps bigint / Map / Set |
| `audit` | Append-only (UPDATE / DELETE refused by triggers): sign-ins, 2FA, whitelist, swaps sent / refused / failed, withdrawals |
| `fills` | Confirmed swaps, unique per (account, signature) |
| `transfers` | Deposits and withdrawals, upserted by id, unique `clientId` per account, a final status never reopened |

`store/sync.ts` writes accounts at most 500 ms after a change (immediately for registration, 2FA,
whitelist, session revocation and code checks) and trading every 3 s when changed, ~500 ms after a
fill and on close. Live mode always opens the store, whatever `SNAPSHOT_EVERY_MS` says.

### Security in live mode

TOTP (RFC 6238, SHA-1, 30 s, ±1 step, replay-protected, `node:crypto` only) with secrets sealed by
AES-256-GCM under `SECRETS_KEY`; salted recovery codes; a code-check lockout; a delayed withdrawal
whitelist; sliding session expiry; password change revoking every session. The server never holds raw
keys in production (Turnkey signs within its policies); the local-dev signer is refused when
`NODE_ENV=production`.

### The web app in live mode

`lib/mode.ts` holds the mode from `/api/meta` (cached per origin so a live site does not flash demo
copy); `useMode` / `useIsLive` / `useEnabledChains` / `useLiveStatus` read it. In live mode the chain
switcher becomes a static Solana chip and routes to other chains redirect; guest quick start, the
faucet, token launch and simulated-market notices disappear; sign-in gains a 2FA step; the account
menu adds Deposit (address + QR), Withdraw (whitelisted destinations, TOTP, exact base-unit amounts,
one `clientId` per attempt) and Security (2FA enrolment with one-time recovery codes, whitelist,
password change, security events); a one-time real-funds acknowledgement precedes the first trade;
the header shows Live with a health dot and a banner appears when trading is unavailable.

### Testing live mode without the network

Every external service is replaced by fixtures or local fakes: `test/fixtures/pumpportal`, `rpc`
(a fake `Connection`) and `jupiter`; a local `ws` server for the feed; stubbed `fetch` and DNS.
`apps/server/scripts/fake-pumpportal.ts` (dev/test only) serves synthetic or replayed PumpPortal
frames, and `test/live-integration.test.ts` boots the whole app in live mode against it with the
local-dev signer and an on-disk store.
