# Trenchscope architecture

Trenchscope is a web-only memecoin trading terminal: our own spinoff of the GMGN product surface
(Trenches, Trending, token pages with audits, smart-money tracking, copy trading, sniping, limit /
TP / SL / trailing orders) running against a **deterministic market simulator** with **paper trading**.

```
┌──────────────────────────── apps/web (Vite + React) ────────────────────────────┐
│ pages/*  components/{ui,common,layout,discovery,token,wallet,monitor,account}    │
│ lib/api.ts (typed REST)   lib/ws.ts (one socket, ref-counted channels)           │
└───────────────▲──────────────────────────────────────────────▲──────────────────┘
                │ REST /api/*                                    │ WebSocket /ws
┌───────────────┴──────────── apps/server (Fastify) ─────────────┴──────────────────┐
│ app.ts  composition root · persistence.ts (v8 snapshots) · ws/hub.ts (channels)   │
│                                                                                    │
│  accounts/   auth, sessions, settings, follows, watchlist, notifications, rewards  │
│  trading/    quotes, swaps, orders (limit/TP/SL/trailing/dev-sell/migration),      │
│              strategies, copy trade, sniper, alerts, portfolio                     │
│  analytics/  tokens/: summaries, security & rug ratio, holders, lists, search      │
│              wallets/: classification, profiles, leaderboards, feeds, signals      │
│  sim/        world.ts  ledger: tokens, curves, pools, wallets, positions, candles  │
│              engine.ts tick loop + warmup fast-forward                             │
│              market.ts agent-based market: launches, archetypes, rugs, migrations  │
└────────────────────────────────────────────────────────────────────────────────────┘
                 packages/shared: types (API contract), chains, math, formatters
```

## Principles

- **One ledger.** Every swap (simulated agent or human paper trade) goes through
  `World.executeSwap`, which prices against the bonding curve or AMM pool, updates reserves,
  balances, positions (average-cost PnL), holder sets, candles (8 resolutions) and minute buckets,
  then emits a `trade` event. Analytics never sees a different history than the chart.
- **Observable-only analytics.** The simulator keeps hidden state (token fate, hype, agent
  archetype/skill). Analytics, classification and risk scores use only what a real indexer could see
  (trades, balances, funding links, blocks, timestamps), so the same code would run on real chain data.
- **Contract first.** `packages/shared/src/types.ts` + `docs/API.md` define every DTO, endpoint and
  channel. Server modules implement interfaces in `apps/server/src/context.ts`.
- **Realtime by channel.** The hub groups subscriptions by `(channel, params)` so each distinct query
  (e.g. a Trenches filter set) is computed once per cadence and fanned out.
- **Deterministic simulation.** All randomness flows through a seeded `Rng`; the sim clock
  (`world.now`) follows wall time live and fast-forwards during warmup so the market is populated on
  boot.

## Market model

- Bonding curves are constant-product on virtual reserves with a cap on real tokens (pump-style:
  ~30 SOL virtual, 793.1M curve tokens, ~$70-90k graduation market cap). Completing the curve moves
  the remaining liquidity into a constant-product AMM pool with burned LP.
- Launchpads, DEXes and chain parameters live in `packages/shared/src/chains.ts`.
- Agents: retail, bots, snipers, smart money, KOLs (with calls), whales, sandwich bots, serial devs,
  bundlers and insiders funded by devs, fresh wallets, exchange funders.

## Persistence

`persistence.ts` writes the world + every module's `serialize()` output with `node:v8` to
`DATA_DIR/snapshot.bin` (atomic rename) every `SNAPSHOT_EVERY_MS` and on shutdown. Without a
snapshot the server seeds a population and fast-forwards `WARMUP_MINUTES` of history.

## Swapping in real data

The simulator sits behind the `World` ledger and its events. A real-chain adapter would populate
`World` from an indexer (trades, pools, balances) and route user orders to a signer instead of
`executeSwap`; analytics, trading rules, API and UI stay unchanged.
