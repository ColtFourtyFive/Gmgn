# Trenchscope architecture

Trenchscope is a web-only memecoin trading terminal: our own spinoff of the GMGN product surface
(Trenches, Trending, token pages with audits, smart-money tracking, copy trading, sniping, limit /
TP / SL / trailing orders, token launches) running against a **deterministic market simulator**
with **paper trading**.

```
┌───────────────────────────── apps/web (Vite + React) ─────────────────────────────┐
│ pages/*        one file per route (App.tsx)                                         │
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
│             market.ts     agent market: launches, fates, rugs, migrations, pruning     │
│             behaviors/    roster, launch, fate, trader, scheduler                      │
│             congestion.ts per-chain network congestion                                 │
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
  bundlers and insiders funded by devs, fresh wallets, exchange funders. Each launch draws a hidden
  fate (dud, rug, slow rug, pump & dump, runner, moon); user launches are adopted by the market with
  a fate drawn from observable launch quality and are never rugged on the user's behalf.
- Congestion rises with throughput and periodic launch rushes; it scales fee suggestions and makes
  under-priced transactions fail to land.

## Persistence

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
- `apps/server/scripts`: `sim-report.ts` (market realism report) and `soak.ts` (memory/snapshot soak).

## Swapping in real data

The simulator sits behind the `World` ledger and its events. A real-chain adapter would populate
`World` from an indexer (trades, pools, balances) and route user orders to a signer instead of
`executeSwap`; analytics, trading rules, API and UI stay unchanged.
