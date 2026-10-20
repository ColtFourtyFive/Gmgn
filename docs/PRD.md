# Trenchscope: Product Requirements Document

| | |
|---|---|
| **Product** | Trenchscope, a web-only, multi-chain memecoin trading terminal (our own spinoff) |
| **Status** | v1 scope frozen in this document. P0 must ship in v1. |
| **Date** | 2026-10-20 |
| **Research base** | [`docs/research/gmgn-research.md`](research/gmgn-research.md). Section refs below look like *R§4.1*. |
| **Related** | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/API.md`](API.md), `packages/shared/src/types.ts` (API contract) |

**Priority legend.**
- **P0**: must ship in v1. Release is blocked without it.
- **P1**: next release. Design it now and leave contract hooks for it.
- **P2**: later or exploratory.

Each requirement carries an id (e.g. `TR-07`) so engineers and QA can trace it. Where this PRD extends the existing contract in `packages/shared/src/types.ts`, it says **(contract change)**.

**Brand rule.** Trenchscope is an original product. Do **not** reuse GMGN's name, logo, mascot, colours, icon set, marketing copy, page titles, or labels that are distinctively GMGN's (e.g. "Almost bonded", "Degen Audit", "Sky Eye", "P1/P2/P3", "Cooking", "SnipeX"). We copy *capabilities* and *information architecture*, never *expression*. Field names in this PRD are our own. GMGN field names show up only in mapping notes.

---

## 1. Vision and positioning

### 1.1 One-liner
> **Trenchscope: see who is really buying, before you do.** A fast, keyboard-first web terminal for launchpad tokens. Every risk number is explained, every fee is shown up front, and new traders can practise in a full-fidelity paper market first.

### 1.2 Problem
Memecoin traders work in a market where most launches die within hours (on reference launchpads ~97% never graduate, and 73% of graduates lose 60%+ within 20 minutes). Insiders, bundlers and snipers capture early supply. Today's terminals (GMGN, Axiom, Photon, BullX) are fast and data-rich, but they share the same failings:
1. **Opaque risk numbers.** Raw percentages with undocumented definitions, conflicting fields, and "0%" shown where the value is really "unknown".
2. **Hidden costs.** A ~1% platform fee plus priority and tip fees users forget about. On small trades these silently add up to 10%+.
3. **Noisy feeds and UIs.** CPU-heavy boards, tiny alert toasts, unstarred and unsorted tracker feeds, a single-chain monitor.
4. **Wrong PnL.** Transfers treated as zero-cost buys, fees ignored, unsold tokens inflating the "0–200%" bucket.
5. **No safe place to learn.** Practice means real money.

### 1.3 Product principles
1. **Observable-only analytics.** Every label, score and chip is computed from data a real indexer could see (trades, balances, funding links, blocks, timestamps). The simulator's hidden truth (token fate, agent archetype) is used only to *validate* the analytics, never to *drive* them.
2. **Explain every number.** Every chip, score and label has a tooltip with its definition, inputs and threshold. "Unknown" is shown as `—` / `n/a`, never as `0`.
3. **Cost before click.** The all-in cost of a trade is visible before execution.
4. **One ledger.** Charts, PnL, holder tables and signals all read the same event history (`World.executeSwap`, see ARCHITECTURE.md).
5. **Keyboard-first, density-adjustable.** Power users never need the mouse. Beginners get a calm "Focus" density.
6. **Swappable data plane.** Every external dependency sits behind a typed provider interface (§4.3), so real chain adapters can replace the simulator later without UI or analytics changes.

### 1.4 Positioning vs. incumbents (summary; detail in §12)

| | GMGN | Axiom | Photon | **Trenchscope v1** |
|---|---|---|---|---|
| Label depth | Deepest | Medium | Low | GMGN-level, **with published definitions** |
| Fee transparency | Low | Low | Low | **All-in cost preview + fee ledger** |
| Platform fee | ~1% | 0.75–0.95% | 1% | **0.8% (simulated)** |
| Paper trading | No | No | No | **First-class, the only mode in v1** |
| PnL correctness | Field quirks | Complaints | Complaints | **Moving-average ledger with replay + conformance tests** |
| Keyboard | Partial | Partial | Partial | **Full map + command palette** |
| Data plane | Proprietary | Proprietary | Proprietary | Simulator now, provider-pluggable later |

### 1.5 Constraints that shape v1
- **No blockchain RPC and no market-data API access** in the build/runtime environment. v1 runs entirely on a **deterministic market simulator** (§5) with **paper trading** (simulated balances). There are no real funds, real keys or on-chain transactions.
- **Web app only.** No Telegram bot, no browser extension, no native mobile app. Useful bot and extension features are folded into the web app (§9.7): quick paste-CA trade box, web push, an in-app social pulse in place of the X tracker, and floating panels in place of the extension overlays. The layout is responsive (desktop, tablet, phone; installable PWA is P1).
- Simulated chains in v1: `sol`, `bsc`, `base`, `eth` (`packages/shared/src/chains.ts`). Launchpad and DEX names are fictional (Moonpit, Bonkfire, Rayforge, FourPad, BNB Rocket, ClawLab, BaseDrop, EtherForge; DEX: TrenchSwap).
- Every simulated surface is clearly labelled: a persistent **SIM** badge in the header and a "Simulated market, no real funds" line in the footer. Shared PnL cards carry an unremovable "SIMULATED" watermark.

---

## 2. Goals, non-goals, success metrics

### 2.1 Goals (v1)
- G1. Parity with the GMGN core loop: discover → diligence → trade → track → review, all on simulated data (R§4–§9).
- G2. Every risk metric is deterministic, documented, and validated against simulator ground truth.
- G3. Realtime feel: Trenches updates ≤1 s, trade fills visible ≤300 ms after submit (sim).
- G4. Correct, explainable PnL that passes all conformance vectors (Appendix C).
- G5. Accessible (WCAG 2.2 AA), dark-first with a light theme, responsive.

### 2.2 Non-goals (v1)
- Real-chain trading, custody, deposits/withdrawals, KYC, fiat on-ramp.
- Telegram/Discord bots, browser extension, native apps.
- Real X/Twitter data (licence and cost risk, R§16). A synthetic social pulse replaces it.
- Perpetuals, yield on idle balance (Axiom features; P2 at most).
- A token of our own. Points are in-app only.

### 2.3 Success metrics (measured in sim / beta)

| Metric | Target |
|---|---|
| Time-to-first-paper-trade for a new visitor (guest) | ≤ 60 s median |
| Trenches p95 frame time while streaming | ≤ 16 ms (60 fps) on a 2020 laptop |
| WS event → DOM p95 | ≤ 150 ms |
| Label precision / recall vs simulator ground truth (sniper, bundler, insider, dev team) | ≥ 0.90 / ≥ 0.85 |
| Smart-money label precision vs ground truth `smart` archetype | ≥ 0.80 |
| PnL conformance vectors passing | 100% |
| D7 retention of registered (non-guest) users in beta | ≥ 35% |
| Accessibility audit (axe) critical issues | 0 |

---

## 3. Personas

| Persona | Who | Jobs to be done | Key surfaces | Must-have |
|---|---|---|---|---|
| **P-1 "Trench sniper" (Kai)** | 22, trades 50–200×/day, 1–5 SOL tickets, lives in the launch board | Spot a launch in the first minutes, decide in under 5 s, buy with one key, exit on TP/SL | Trenches, hotkeys, quick buy, presets, instant-trade panel, TP/SL bracket | ≤1 s board latency, hotkeys, risk chips, dev record on the card |
| **P-2 "Smart-money follower" (Maya)** | 30, part-time, follows 30–200 wallets | Find wallets worth copying, get alerted when they buy, copy safely | Leaderboard, wallet page, Monitor, copy trade, alerts | Explainable copy score, cluster signals, noise control |
| **P-3 "Researcher" (Dev)** | Analyst, writes threads, rarely trades fast | Diligence a token: holders, insiders, dev history, chart | Token page, holder analysis, dev panel, signals | Full holder tables with tags, float view, DD score with reasons |
| **P-4 "Caller/KOL" (Rin)** | Has followers, posts calls | Publish calls, show a verified track record | Call-outs (P2), share cards, wallet page | Verifiable PnL card, hit rate |
| **P-5 "Newcomer" (Sam)** | Curious, afraid of losing money | Learn how launchpads, curves and rugs work without risk | Guest paper account, onboarding, Focus density, explainers | Instant guest account, plain-language tooltips, safety gates |
| **P-6 "Builder" (Ana)** | Developer, P2 | Script against the market, backtest | API keys, webhooks (P2) | Stable contract, rate limits |

Design for P-1 and P-2 first, keep the default UI comfortable for P-5, and expose depth for P-3.

---

## 4. System context and architecture constraints

### 4.1 Topology (as built; see ARCHITECTURE.md)
`apps/web` (Vite + React, one ref-counted WebSocket) ↔ `apps/server` (Fastify: `accounts/`, `trading/`, `analytics/`, `sim/`, `ws/hub.ts`) ↔ `packages/shared` (types, chains, math, formatters).

### 4.2 Requirements
- **AR-01 (P0)** Every swap, whether by an agent or a user, goes through one ledger function that updates reserves, balances, positions, holders, candles (8 resolutions: `1s, 15s, 1m, 5m, 15m, 1h, 4h, 1d`) and minute buckets, and emits a `trade` event.
- **AR-02 (P0)** Analytics modules may only read observable state: trades, balances, transfers, funding edges, block/slot, timestamps, token metadata and pool state. The import graph must enforce that analytics code cannot read `Archetype`, hidden token fate, or agent skill. A lint rule or module boundary test is required.
- **AR-03 (P0)** Deterministic: all randomness comes from the seeded `Rng`. Same seed + same user actions ⇒ byte-identical event log.
- **AR-04 (P0)** Persistence: periodic `node:v8` snapshot plus snapshot on shutdown. A cold start seeds and fast-forwards `WARMUP_MINUTES` of history so the board is populated on boot.
- **AR-05 (P0)** Realtime via channel hub: subscriptions grouped by `(channel, params)`, each distinct query computed once per cadence and fanned out (§11.2).

### 4.3 Data-provider interface (pluggable real chains later)
- **AR-10 (P0)** Define the interfaces below in `apps/server/src/context.ts` (or `packages/shared`). v1 ships the **Sim** implementations. Real implementations are out of scope but the contract must allow them (R§16).

| Interface | Responsibility | Sim impl | Future real impl |
|---|---|---|---|
| `Clock` | `now()`, `slot(chain)`, `sleep()` | sim clock (wall-following, fast-forward) | wall clock |
| `Rng` | seeded random | xoshiro-family | n/a |
| `ChainStream` | subscribe to raw chain events by program/account/wallet | world event bus | Yellowstone gRPC / eth logs |
| `MarketDataProvider` | token snapshot, candles, holders, trades | World ledger | own indexer / Codex fallback |
| `SecurityProvider` | authority, tax, honeypot, LP lock | sim token flags | on-chain checks + GoPlus/honeypot.is |
| `PromoProvider` | paid-promotion events (ads/boosts) | synthetic promo agent | DEX Screener (licence permitting) |
| `SocialProvider` | posts/mentions/renames | synthetic social pulse | X API |
| `PriceFeed` | native USD price | sim random walk | own pools / oracle |
| `FeeOracle` | gas/priority tiers + ETA | sim congestion model | Helius / feeHistory |
| `Router` + `Submitter` + `TxTracker` | quote, build, land, track | `executeSwap` with simulated latency/failures | direct venue builders, Jito/Sender, private RPCs |
| `Signer` | sign | no-op (paper) | enclave / KMS |

- **AR-11 (P0)** Provider responses carry `provenance {providerId, fetchedAt, commitment}`. The UI shows a "SIM" source badge.
- **AR-12 (P1)** Modes: `sim` (all Sim), `paper` (real data, sim execution), `replay` (archived events, virtual clock), `live`. v1 ships `sim` only.

---

## 5. Market simulator requirements

The simulator is the product's data plane in v1. It must be realistic enough that analytics, signals and trading features behave as they would on real chains, and deterministic enough for tests.

### 5.1 Chains (as configured)

| id | name | native | native USD start | block ms | base network fee | starter paper balance |
|---|---|---|---|---|---|---|
| `sol` | Solana | SOL | 185 | 400 | 0.000005 | 50 SOL |
| `bsc` | BNB Chain | BNB | 610 | 750 | 0.00005 | 15 BNB |
| `base` | Base | ETH | 3400 | 2000 | 0.000002 | 3 ETH |
| `eth` | Ethereum | ETH | 3400 | 12000 | 0.0015 | 3 ETH |

- **SIM-01 (P0)** Native prices follow a seeded random walk (σ per minute configurable, default 0.08%), mean-reverting to start ±30%.
- **SIM-02 (P0)** Each chain has a congestion state (calm / busy / congested), a 3-state Markov chain that changes every 5–30 min. It drives fee-tier prices and landing-latency distributions (§7.5).

### 5.2 Launchpads and curves
- **SIM-10 (P0)** Constant-product curve on virtual reserves: `vT·vQ = k`, with `vT = vT0 − sold` and `vQ = vQ0 + raised`. Spot price = `vQ/vT`. Buy out = `vT − k/(vQ + in·(1−fee))`. The curve completes when real curve tokens hit 0.

| Launchpad | Chain | Supply | vNative | vTokens | Curve tokens | Fee | Migration fee | Weight |
|---|---|---|---|---|---|---|---|---|
| Moonpit | sol | 1e9 | 30 | 1.073e9 | 793.1M | 1% | 1.5 SOL | 0.62 |
| Bonkfire | sol | 1e9 | 30 | 1.073e9 | 793.1M | 1% | 1.5 SOL | 0.28 |
| Rayforge | sol | 1e9 | 30 | 1.073e9 | 800M | 1.25% | 1 SOL | 0.10 |
| FourPad | bsc | 1e9 | 8 | 1.073e9 | 800M | 1% | 0.3 BNB | 0.8 |
| BNB Rocket | bsc | 1e9 | 8 | 1.073e9 | 800M | 1% | 0.3 BNB | 0.2 |
| ClawLab | base | 1e11 | 1.6 | 1.073e11 | 8e10 | 1% | 0.05 ETH | 0.7 |
| BaseDrop | base | 1e9 | 1.6 | 1.073e9 | 800M | 1% | 0.05 ETH | 0.3 |
| EtherForge | eth | 1e9 | 1.8 | 1.073e9 | 800M | 1% | 0.08 ETH | 1.0 |

- **SIM-11 (P0)** On completion: emit `curve_complete`, then on the same or next block `migrated`. Remaining curve liquidity minus the migration fee seeds a constant-product **TrenchSwap** pool (fee 0.25% SOL/BSC, 0.30% Base/ETH). LP is 100% burned. Set `openedAt`, `migratedPool`, `migrationMarketCapUsd`.
- **SIM-12 (P0)** Progress is stored in both conventions: `progress` (token-mode = sold/curveTokens, the canonical UI value) and `progressQuote` (raised/expected raise) (R§13.2).
- **SIM-13 (P1)** A "no-curve" launch style (direct pool at creation, like v4 launchers) on Base: `progress = null`, `openedAt = createdAt`.
- **SIM-14 (P1)** EVM tax tokens: buy/sell tax 0–10% on a configurable share of BSC launches. Honeypot tokens (sell reverts) on a small share of EVM launches (default 0.5%).

### 5.3 Agent archetypes (hidden ground truth)
Each simulated wallet has an `Archetype` (`retail | smart | kol | sniper | bundler | insider | dev | whale | fresh | bot | sandwich | user`) and per-wallet skill/size parameters. **Analytics must never read these** (AR-02).

| Archetype | Behaviour model (defaults; all configurable) |
|---|---|
| `dev` | Creates tokens on Poisson arrivals. 0–3 SOL dev buy. Fate drawn per token: `organic` (holds), `slow_rug` (sells 20–60% across hours), `hard_rug` (sells ≥80% within 2–30 min), `cto_abandon` (sells all, then community takes over), `runner` (holds through migration). A serial-dev subset launches 20–500 tokens with a low graduation rate. Devs pre-fund bundlers/insiders from their own wallet or a shared funder. |
| `bundler` | Buys in the **creation block/bundle** (same slot, shared fee payer/tip) on dev-designated launches; 2–12 wallets per bundle; exits on dev's signal. |
| `insider` (rat) | Funded by the dev or the dev's funder ≤72 h before launch; buys in the first minutes or receives tokens by transfer; distributes into strength. |
| `sniper` | Buys within blocks 0–3 after open on many launches; sells into the first pump (median hold 30–300 s). |
| `smart` | Skilled discretionary traders: enter early on tokens whose *hidden fate* is good with probability p_skill (0.6–0.8), size 0.5–5 SOL, cut losses at −30–50%, take profit in tranches. Their activity must make them **discoverable** by the observable smart-money rule (§8.4). |
| `kol` | Has a public label and follower count. Buys after smart money (lag 2–30 min), posts **calls** (§9.6), sometimes dumps into followers ("calling ≠ holding"). |
| `whale` | Large balance, few trades, $10k+ tickets on migrated tokens. |
| `fresh` | Newly funded wallets (age < 24 h) that buy once; some are insider-controlled. |
| `bot` | High-frequency small trades (≥100/day), volume and wash patterns on a subset of tokens. |
| `sandwich` | Front-runs/back-runs user and agent swaps when the victim has anti-MEV off and slippage ≥ 3%. Extracts value, recorded as `mevLossNative` on the victim. |
| `retail` | Hawkes-process momentum buyers and panic sellers; FOMO amplified by signals (boost, KOL calls, ATH). |
| `user` | Human paper accounts. |

- **SIM-20 (P0)** Exchange funders: a small set of "CEX hot wallet" funders that fund many wallets. These must be excluded as service funders by insider clustering (§8.3).
- **SIM-21 (P0)** Lifecycle calibration targets on `sol` defaults: graduation rate 2–4% of launches; median time-to-graduate ~5 min with ~80% inside 1 h; ~95% of non-graduates inactive within 24 h; 60–75% of graduates fall below 40% of migration MC within 20 min (R§13.4). Launch rate is configurable, default 20–40 launches/min per chain on sol, scaled down on others.
- **SIM-22 (P0)** Promotions: a promo agent buys "boosts", "profile updates" and "ad slots" on a share of tokens (default 5%), emitting `promo` events with amount and timestamp (feeds the promo badges and signals 2–5).
- **SIM-23 (P0)** Community takeover: after a `cto_abandon` dev exits, a community wallet group may "claim" the token (emits `cto` event; sets `ctoFlag`).
- **SIM-24 (P1)** Fee claims: creators accumulate creator fees (0.3% of curve volume) and claim them periodically (emits `fee_claim`).
- **SIM-25 (P1)** Synthetic social pulse: each token gets 0–N synthetic "posts" from KOL personas and the dev persona (with contract-address mentions, renames and deletions). Feeds the social panel and "renamed handle" risk.
- **SIM-26 (P1)** Live streams: a share of tokens (1%) go "live" for 5–60 min, which boosts retail flow.
- **SIM-27 (P0)** Scenario presets and seeds: `normal`, `rug_wave`, `cto_pump`, `bundle_launch`, `honeypot_evm`, `quiet`. These are selectable by admin env var for demos and tests.
- **SIM-28 (P0)** Ground-truth export: a test-only API or CLI dumps wallet archetypes, token fates and true labels for analytics validation (§2.3 metrics). It is never exposed to clients.

### 5.4 Execution realism (paper trading)
- **SIM-30 (P0)** Fills price against curve or pool state at the **landing block**. The landing delay is sampled from the chain's congestion state and the user's fee tier (§7.5), so price can move between quote and fill.
- **SIM-31 (P0)** Failures: insufficient balance, slippage exceeded, route unavailable (pool closed / migrating), token not sellable (honeypot), expired (not landed before blockhash/deadline). Failure rates depend on fee tier and congestion.
- **SIM-32 (P0)** MEV: with anti-MEV **off**, the `sandwich` archetype can sandwich user orders; the receipt records `mevLossNative`. With anti-MEV **on**, landing is slightly slower (+1 block p50) and sandwiching is impossible.
- **SIM-33 (P0)** Fees per fill: platform fee 0.8% of the native leg (`PLATFORM_FEE_RATE = 0.008`), launchpad/DEX fee inside the price, network fee (base + priority per tier), tip (anti-MEV). Each is reported separately on the receipt.


---

## 6. Information architecture and page specifications

### 6.1 Global shell

**Layout (desktop ≥1280 px).**
- Top bar, 52 px.
- Optional market ticker strip, 28 px.
- Page outlet.
- Right dock: 0–3 columns of docked panels, 320–420 px each.
- Fixed footer, 32 px.

**Tablet (768–1279 px).** The dock becomes a slide-over drawer.

**Phone (<768 px).** The top bar collapses to logo, chain pill, search, balance, and avatar. A fixed bottom tab bar (56 px) holds **Trenches · Trending · Monitor · Portfolio · More**. Docked panels open as full-screen sheets.

| Id | Element | Spec | Pri |
|---|---|---|---|
| SH-01 | Logo + "SIM" badge | Logo links to `/:lastChain/trenches`. An amber `SIM` pill sits beside the logo. Its tooltip reads "Simulated market. Balances are paper funds." | P0 |
| SH-02 | Primary nav | **Trenches · Trending · New Pairs · Monitor · Signals · Leaderboard · Copy Trade · Portfolio**. **More** opens a menu: Narratives, Sniper, Watchlist, Alerts, Rewards, Settings. The active item uses the `--accent` underline. All links keep the current `:chain`. | P0 |
| SH-03 | Chain selector | A pill shows chain icon + name. The dropdown lists `sol, bsc, base, eth`, each with its native price and 24h change. Selecting a chain swaps `:chain` in the URL and keeps the same page. The last chain is remembered in localStorage (`lastChain`). Keyboard: `Alt+1..4`. | P0 |
| SH-04 | Multi-chain "All" mode | Adds `all` as a chain option on Trending, Monitor feeds, Signals, and Leaderboard. Mixed lists show a 3 px left chain-colour stripe and a chain badge on each avatar. The user can recolour chains in Settings. | P1 |
| SH-05 | Global search | Input placeholder: "Search token, address, wallet, KOL…". Hotkey `/`. Opens the search overlay (§6.20). | P0 |
| SH-06 | Paste-CA quick trade | If the pasted string is a valid address on any chain, the overlay goes straight to a **Quick Trade** card with the token header, preset buy buttons, and a link to the full page. This replaces the Telegram "paste CA" flow. | P0 |
| SH-07 | Wallet pill | Shows the native balance of the active paper wallet on the current chain, e.g. `◎ 48.21`. The dropdown has: wallet switcher (multi-wallet P1), copy address, **Top up (faucet)**, Portfolio, Settings, Log out. | P0 |
| SH-08 | Notifications bell | Shows an unread count, capped at `99+`. The dropdown lists the latest 20, with "Mark all read" and a link to `/alerts?tab=inbox`. | P0 |
| SH-09 | Account | Guest users see **Save account**, which converts the guest to a registered account in place. Registered users see an avatar menu. | P0 |
| SH-10 | Footer | **Left:** native price tickers for all chains with 24h change, plus a market-pulse chip (launches/min, graduations/hour). **Centre:** dock toggles: Positions, Feed, Monitor, Signals, Watchlist, Instant Trade (each shows an unread dot). **Right:** sound master toggle, connection status dot (green <300 ms RTT, amber <1 s, red disconnected), RTT in ms, and the sim clock. | P0 |
| SH-11 | Dockable panels | Panels: **Positions** (my open positions), **Live feed** (smart/KOL/followed tabs), **Monitor** (inflow board mini), **Signals** (mini feed), **Watchlist**, **Instant Trade**. Each can float (draggable, resizable) or dock in up to 3 columns, stacking vertically within a column. Layout is persisted per user (server) with a localStorage mirror. | P1 (Positions + Instant Trade P0) |
| SH-12 | Command palette | `Ctrl/Cmd+K`. Fuzzy search over tokens, wallets, pages, and actions ("Buy 0.5 on current token", "Toggle density", "Pause feeds"). | P1 |
| SH-13 | Toasts | Top-right stack (bottom on phone), max 3 visible, 8 s default, paused on hover. Big-card variant for price alerts and fills (§9.4). | P0 |
| SH-14 | Theme / density | Header menu: Theme (Dark / Light / System); Density (Focus / Standard / Pro). | P0 (density P1) |
| SH-15 | Onboarding | The first visit creates a guest paper account automatically (≤1 s, no form). A 4-step coach-mark tour covers board, card, quick buy, and safety chips. It can be skipped and replayed from Settings. | P0 |

### 6.2 Route inventory

All chain-scoped routes are `/:chain/...` where `chain ∈ sol|bsc|base|eth`; `all` is added P1 where noted. Tab and filter state lives in the query string so views can be shared.

| Route | Page | Pri | Notes |
|---|---|---|---|
| `/` | Redirect to `/:lastChain/trenches` | P0 | |
| `/:chain/trenches` | Trenches (launch board) | P0 | `?preset=`, `?density=` |
| `/:chain/trending` | Trending ranking | P0 | `?window=1m\|5m\|1h\|6h\|24h&sort=&order=&tab=trending\|hot\|surge\|new` |
| `/:chain/new-pairs` | New pools (graduated tokens) | P0 | |
| `/:chain/narratives` | Narrative heat map | P1 | |
| `/:chain/token/:address` | Token page | P0 | `?tab=activity\|holders\|traders\|dev\|liquidity\|positions\|orders\|events&res=1m&filter=` |
| `/:chain/address/:address` | Wallet page | P0 | `?period=1d\|7d\|30d\|all&tab=recent\|holdings\|activity\|created\|calls` |
| `/:chain/leaderboard` | Wallet leaderboard | P0 | `?tag=smart\|kol\|sniper\|whale\|fresh\|dev\|all&period=` |
| `/:chain/monitor` | Monitor (feeds + inflow board + convergence) | P0 | `?tab=smart\|kol\|following\|inflow` |
| `/:chain/signals` | Signals feed | P0 | `?kinds=&preset=` |
| `/:chain/copytrade` | Copy-trade tasks | P0 | |
| `/:chain/sniper` | Automation tasks (migration snipe, launch sniper, social sniper) | P1 (migration snipe P0 via token page) | |
| `/:chain/callouts` | Call-out feed | P2 | |
| `/:chain/launch` | Launch a token (paper) | P2 | |
| `/portfolio` | Portfolio (all chains) | P0 | `?chain=all\|sol…&tab=holdings\|history\|orders\|calendar` |
| `/watchlist` | Watchlist with groups | P0 | `?group=` |
| `/alerts` | Alert rules + notification inbox | P0 | `?tab=inbox\|price\|wallet\|signal` |
| `/rewards` | Points + referral | P1 | |
| `/settings` | Settings | P0 | `?section=` |
| `/share/:cardId` | Public share card + verification | P1 | |
| `/_ui` | Component gallery (dev only) | P0 (internal) | |
| `*` | Not found | P0 | |

**Legacy aliases (P2).** `/:chain/trend` redirects to `trending`. `/:chain/follow` redirects to `monitor`.

### 6.3 Page template (applies to every page)

Every page spec below lists the following: **Purpose · Layout · Components · Columns/filters/tabs · Interactions · Realtime · States**. All pages follow these rules:
- **Loading.** Skeletons match the final layout (same row heights). A spinner is never shown alone for longer than 300 ms.
- **Empty.** Illustration-free text plus one primary action, for example "No tokens match these filters. Reset filters".
- **Error.** An inline banner shows the error code and a Retry action. Data that has already loaded stays on screen and gets a "stale" clock icon.
- **Disconnected WS.** A banner reads "Live updates paused, reconnecting…". Lists freeze and show a "stale" badge. On reconnect the client resubscribes and receives a fresh snapshot.
- **Numbers.** Formatting follows §11.4. Unknown values render as `—` with the tooltip "Not available for this token/chain".

---

### 6.4 Trenches (`/:chain/trenches`) [P0]

**Purpose.** A live board of launchpad tokens across their lifecycle, for spotting and acting on launches within seconds (R§4.1).

**Layout.** A page header bar sits above three equal columns: **New** (`new`), **Near graduation** (`almost`), and **Graduated** (`migrated`). The `TrenchesColumn` ids are unchanged. Each column scrolls independently and is virtualised with fixed card height.
- Desktop: 3 columns.
- Tablet: 2 columns plus a tab for the third.
- Phone: one column, with segmented tabs [New | Near grad. | Graduated] and swipe between them.

**Page header bar.**

| Id | Control | Spec |
|---|---|---|
| TR-01 | Column tabs (phone) | Segmented control showing a per-column count |
| TR-02 | Quick-buy amount | One input per column, in native units. Defaults: sol 0.5, bsc 0.1, base/eth 0.02. Stored per chain per column. |
| TR-03 | Execution preset | Selector `Slot 1 / Slot 2 / Slot 3` (§7.4), one per column |
| TR-04 | Filters button | Opens the per-column filter drawer. Shows a badge with the active filter count. |
| TR-05 | Preset chips | **Safe · Smart money · Strict** (`FILTER_PRESETS`). Applying one merges it into the column's filters, and explicit user values win. |
| TR-06 | Pause all | Freezes all columns; the `P` hotkey does the same. Buffered count appears as "N new" pills. |
| TR-07 | Hotkeys toggle | Keyboard icon, highlighted with `--accent` when armed |
| TR-08 | Display menu | Density, avatar shape, progress ring on/off, metric chip set, quick-buy size, large MC text |
| TR-09 | Thresholds | Opens the Risk Thresholds panel (TR-30) |

**Columns: membership rules** (server):
- `new`: on curve, `progress < 0.60`. Leaves this column when progress reaches 0.60. It cannot return to `new` unless progress drops below 0.50 (hysteresis).
- `almost`: on curve, `progress ≥ 0.60`, not complete.
- `migrated`: graduated, ordered by `openedAt` desc.
- No-curve launches (P1) go straight to `migrated`.
- Each column holds 60 rows by default (max 100). The default order is newest first (`createdAt` desc) for `new`, progress desc for `almost`, and `openedAt` desc for `migrated`.
- Per-column sort options: `smartDegenCount, kolCount, volume1h, volume24h, swaps1h, swaps24h, rugRatio (asc default), holderCount, marketCap, createdAt, progress`.

**Token card (fixed 116 px Standard / 96 px Pro / 132 px Focus).**

| Region | Content |
|---|---|
| Avatar 64 px | Generated identicon or the token image, inside a **progress ring** (curve %, amber→green). Launchpad badge in the bottom-right corner. Hovering zooms the avatar to 160 px. |
| Title line | **SYMBOL** (bold, truncated at 12 characters), name (muted, truncated), copy-CA button, star (watchlist) |
| Meta line | Age (`12s`, `4m`, `3h`, `2d`; green when under 60 s), social icons (X / TG / web; muted when absent), **dev record chip** `D 2/37` (graduated/created, coloured by best-ever peak MC: grey <$100k, blue $100k–1M, purple $1M–10M, gold ≥$10M; tooltip lists the dev's last 5 tokens), copycat badge `⧉ 3` when the name or image duplicates other tokens |
| Stats stack (right) | `MC $12.4K` · `Vol $3.1K` (1h; window configurable) · `Fees 0.84` (native: Σ network + priority + tip paid by traders, a proxy for organic demand) · `TX 41/12` (buys/sells 1h) · `H 87` (holders) |
| Counters | `★ 2` smart · `◎ 1` KOL (icon colours `--smart`, `--kol`) |
| Risk chip row | Seven chips, each value then label: **Top10 · Dev · Insiders · Snipers · Bundlers · Fresh · Rug**. Plus a **Phishing** chip (P1). A chip is red when above its threshold (TR-30) and neutral otherwise. Unknown shows `—`. Each chip's tooltip gives its definition and formula (§8). |
| Status badges | `Dev sold` (creator closed), `Dev +` (dev bought more), `CTO`, `Promo` (paid promotion, neutral grey with a spend tooltip), `LIVE` (P1), `Wash` (red), `Honeypot` (red, EVM), `Tax 3/5` (EVM), `LP 🔥` (burned, migrated only) |
| Quick buy | Pill `⚡ 0.5` at the bottom right, using the column's amount and preset. While the hotkey modifier is held, a large row-number watermark replaces it. |
| Safety score | Badge 0–100 (§8.6) in the top-right corner, coloured red <40, amber 40–69, green ≥70 |

**Interactions.**
- TR-20: clicking the card opens the token page (Ctrl/Cmd/middle-click opens a new tab). Clicking quick buy executes immediately. A confirmation is required only when the amount exceeds the user's confirm-above threshold (default 2× the column quick amount) or the safety score is below the gate (§7.10).
- TR-21: hovering a column pauses it. Incoming cards buffer and a "N new" pill appears at the top; clicking the pill or leaving the column flushes them. Reordering never happens under the cursor.
- TR-22: hover actions are hide token (per chain, stored server-side) and blacklist dev (hides all tokens by that creator). Both can be undone from Settings → Blacklist.
- TR-23 hotkeys (§11.6):
  - **Mode A:** hover a column, hold `Z`, press `1–9` to buy that row.
  - **Mode B:** hold `Space`, hold `Q/W/E` (column), press `1–9`.
  - `X` with a card hovered previews its socials. `V` previews the website. Both are sim-only popovers.
- TR-24: keyboard navigation. `J/K` moves selection down/up within a column, `H/L` switches column, `Enter` opens, `B` buys the selection.

**Filter drawer (per column).** These fields map onto `TokenFilters` (contract), with additions marked **(contract change)**. Tabs:
- **Launchpads**: multi-select with logos, Select all, Clear.
- **Metrics**: min/max for age (s/m/h), market cap, liquidity, volume (window select), swaps, holders, progress %, top10 %, dev hold %, insider hold %, sniper hold %, bundler %, fresh %, rug ratio, smart count, KOL count, dev created count, dev graduated count, **dev graduation rate (contract change)**, **fees paid (contract change)**, **net buy (contract change)**, price change %.
- **Audit**: require socials / X / TG / website, hide dev-sold, only dev-sold, hide copycats, hide wash trading, safe only (EVM: not honeypot + verified + renounced; SOL: mint+freeze renounced), LP burned, promoted only, **min safety score (contract change)**.
- **Keywords**: include and exclude, up to 5 each, matched case-insensitively against name and symbol.

Footer actions: **Reset · Apply** (changes take effect only on Apply), **Save as preset** (named, per chain, up to 10), **Export/Import JSON** (P1).

**Risk thresholds panel (TR-30).** Defaults: Top10 30%, Dev 30%, Insiders 5%, Phishing 5%, Snipers 10%, Bundlers 10%, Fresh 10%, Rug risk 30% (§8.6.2). The dev-record chip turns red when creator rug history is above 10%. Thresholds are editable per user and used for chip colouring only, never for filtering. A "Reset to defaults" button is provided. Show the copy: "Colour cues, not safety guarantees."

**Realtime.** The board subscribes to `trenches:<chain>` with `{filters, limit}`. The server recomputes once per second per distinct filter set and pushes a full snapshot. A **P1** upgrade switches to seq-numbered list deltas (`op:'list'`, §11.2). The client diffs by address so card DOM nodes stay stable. Value changes flash for 400 ms (green when up, red when down) unless reduced motion is on.

**States.**
- Loading: 8 skeleton cards per column.
- Empty column: "No launches match. Loosen filters".
- All columns paused: the header shows "Paused". Press `P` to resume.

### 6.5 Trending (`/:chain/trending`) [P0]

**Purpose.** Ranks active tokens by activity over a time window (R§4.2).

**Layout.**
- Tabs: **Trending** (default, `sort=hot`) · **Hot searches** (P1: our own visit heat) · **Surging** (P1: preset sort by 5m change with min volume) · **New** (age < 24 h).
- Window selector: `1m · 5m · 1h (default) · 6h · 24h`.
- Filter drawer: the same `TokenFilters` plus safety tags.
- Table with a sticky header and a sticky first column. Virtualised, up to 100 rows.

**Columns.** The default visible set is marked ●. Users can toggle each column in the column chooser.

| Column | Field | Sort key |
|---|---|---|
| ● # | rank | |
| ● Token | avatar, symbol, name, launchpad, age, socials, badges | |
| ● Age | `createdAt` (curve) / `openedAt` | `age` |
| ● Liquidity | one-side depth ×2, matching the reference convention; tooltip shows one-side depth | `liquidity` |
| ● MC | | `marketCap` |
| ● Holders | | `holders` |
| ● TXs | buys/sells over the window | `swaps` |
| ● Volume | over the window | `volume` |
| ● Price | subscript format | |
| ● 1m % / 5m % / 1h % | change | `priceChange` |
| ● Smart / KOL | counts | `smartDegenCount`, `kolCount` |
| ● Audit | compact chips: Top10, Dev, Insiders, Snipers, Bundlers, plus mint/freeze/LP icons | |
| ● Safety | score 0–100 | **(contract change)** `safety` |
| Net buy | window | `netBuy` |
| ATH MC | `athMarketCapUsd` (guarded) | |
| Heat | 0–100 heat score (§8.10) | `hot` |
| ● Quick buy | ⚡ | |

**Interactions.** Clicking a header sorts (asc/desc toggle, with a tri-state icon). A row opens the token page. The star adds to the watchlist. Hovering shows a mini 1h sparkline.

**Realtime.** `trending:<chain>` (params `{window, sort, order, filters, limit}`), every 2 s. Rows reorder with a 200 ms FLIP animation (disabled with reduced motion). Rank movement arrows ▲▼ show for 5 s.

**Display rules.** 24h change shows `n/a` when the token is younger than 24 h. A window change on a token younger than the window shows `n/a`.

**States.** Empty: "No tokens traded in this window." Loading: 12 skeleton rows.

### 6.6 New Pairs (`/:chain/new-pairs`) [P0]

**Purpose.** Shows freshly graduated or opened pools (R§4.7).

**Layout.** A single table with a window selector (`5m · 1h · 6h · 24h`) and filters.

**Columns.** Token · Pool age · Graduated in (time from creation to graduation) · Liq / Initial liq (×growth) · MC · Holders · 1h TXs · 5m/1h % · Audit (mint/freeze renounced, LP burned %, Top10 <30% ✓) · Smart · Safety · Quick buy.

**Realtime.** `newpairs:<chain>` every 2 s. New rows slide in at the top.

**Empty.** "No graduations in this window."

### 6.7 Narratives (`/:chain/narratives`) [P1]

**Purpose.** Groups tokens into themes (keyword and glyph clusters) and ranks the themes by heat.

**Layout.** A grid of narrative cards: glyph, name, token count, 1h/24h volume, MC, volume-weighted 1h change, heat 0–100, and the top 5 tokens as chips. Clicking a card opens a filtered Trending view (`?narrative=id`).

**Logic.** Narrative assignment uses name and symbol keyword dictionaries (sim names come from themed pools). Heat = 0.5·pct(vol1h) + 0.3·pct(Δ token count 1h) + 0.2·pct(change1h). **Realtime:** REST, refreshed every 30 s.


### 6.8 Token page (`/:chain/token/:address`) [P0]

**Purpose.** Diligence and trade a single token: chart, audit, holder structure, dev record, trades, and the trade ticket (R§5).

**Layout.**
- **Desktop ≥1440 px** (3 columns):
  - Left rail (280 px, collapsible): tabs **Positions · Watchlist · Following · Trending**. Each is a compact token list for fast switching.
  - Centre: header bar, then chart (resizable height; default 46% of the viewport), then the bottom tabs.
  - Right column (360 px): trade panel, then the Safety & Audit card, Holder structure, Early buyers, Dev card, Pool card, and Socials.
- **1024–1439 px:** the left rail is hidden behind a toggle.
- **Phone:** header, then segmented tabs **Chart · Trade · Audit · Activity · Holders · More**. A sticky bottom bar holds Buy/Sell buttons that open the trade sheet.
- **Document title:** `SYMBOL $MC ▲/▼ · Trenchscope`, updated at most once per second.

#### 6.8.1 Header bar (TK-H)

| Id | Element | Spec |
|---|---|---|
| TK-H1 | Identity | Avatar (zooms on hover), watch star, **SYMBOL**, name, age, chain badge, launchpad badge, CA (first4…last4) with copy button and full value on hover, dev record chip `D 2/37` (links to the Dev tab), remark/rename icon (private note, P1) |
| TK-H2 | Socials | X / TG / Website icons. Sim links open a sim preview popover and never navigate externally. A "renamed N×" warning badge shows if the social handle was renamed (P1, SIM-25). |
| TK-H3 | Stats strip | **Price** (subscript format) · **MC** (large) · **Liquidity** (tooltip: one-side depth; "lower bound" note if multiple pools) · **Holders** · **24h Vol** · **Buys/Sells 24h** · **Net buy 24h** · **Top10 %** · **ATH MC** with "−x% from ATH" · **Supply** |
| TK-H4 | Window strip | Tabs `1m · 5m · 1h · 6h · 24h`. Each shows % change, buys/sells, buy vol/sell vol (bar), swaps, and net flow. Change = `price/priceAtWindowStart − 1`, shown as `n/a` if the token is younger than the window. |
| TK-H5 | Bonding block (curve tokens only) | Progress bar (`progress` token mode; tooltip also shows quote-mode %), status chip **On curve / Graduating / Graduated**, "≈ X native to graduate", graduation MC. After graduation: "Graduated in 4m 12s" plus a pool link. |
| TK-H6 | Quick actions | ⚡ quick-buy buttons (the 4 presets of the active slot), Share (§6.21), Alert bell (create price/MC alert, §9.4), Open multichart (P2) |
| TK-H7 | Copycat banner | If ≥1 other token shares the normalised symbol/name or image hash: "3 tokens share this name. This one is #1 by MC / earliest". Links open a list ordered by MC with the earliest marked "Original". |

#### 6.8.2 Chart (TK-C) [P0]
- **TK-C1** Engine: TradingView Lightweight Charts (open source; MIT/Apache) or an equivalent. **Do not** embed TradingView's proprietary widget.
- **TK-C2** Toolbar:
  - Resolutions `1s · 15s · 1m · 5m · 15m · 1h · 4h · 1d` (default `1m` before graduation and `5m` after).
  - **Price | MCap** toggle (default MCap).
  - **USD | Native** toggle.
  - Log scale.
  - Indicators: volume (on), MA/EMA, VWAP (P1), RSI (P1). **Holder-structure overlays** (P1): holders, Top10 %, insider %, sniper %, from the `series` endpoint (§8.7).
  - Fullscreen, screenshot (P2).
- **TK-C3** MCap OHLC = price OHLC × circulating supply at bucket time. USD/native conversion divides by the native USD price at bucket time.
- **TK-C4** History: `GET /api/:chain/tokens/:address/candles?resolution&limit≤2000&before?`. Paginate leftward when scrolling. Empty buckets carry the previous close forward with zero volume.
- **TK-C5** Live: `token:<chain>:<address>` channel `candle` updates the last bar. A new bar starts when the bucket time advances.
- **TK-C6** **Trade markers** (Display → Markers): Dev, Smart, KOL, Whale, Sniper, Insider, Bundler, Fresh, Following, **Mine**. Each marker is a circle with a letter (D, S, K, W, N, I, B, F, ★ or the followed wallet's emoji, and B/S filled for mine) in the tag colour token. Buys point up, sells point down. Several markers in one bar collapse into a count bubble whose tooltip lists the trades. Markers snap to `floor(ts/res)*res`.
- **TK-C7** **Lines** (Display → Lines):
  - my average cost (dashed `--accent`) and my average sell
  - open order lines (limit/TP/SL/trailing, draggable to edit trigger; P1 drag)
  - price-alert lines
  - migration MC line
  - ATH line
  - top-10 holders' average cost (P1)
  - call markers (KOL calls as avatar pins; P1)
- **TK-C8** Event markers: signal icons (§8.9) on their trigger bars (toggle "Signals"). A blue `G` marks graduation.
- **TK-C9** Right-click menu: hide markers on bars, add a horizontal line, create an alert at this price, create a limit order at this price.
- **TK-C10** Empty or new tokens: with fewer than 2 candles, show "Waiting for trades…" along with the curve price.

#### 6.8.3 Trade panel (TK-T) [P0]
Specified fully in §7 (trading engine). Layout:
1. **Wallet row:** active paper wallet and balance. Multi-wallet selection is P1.
2. **Tabs:** **Buy · Sell · Auto**.
   - Buy sub-mode: **Market · Limit**.
   - Sell sub-mode: **Market · Limit**.
3. **Amount:**
   - Buy: 4 preset chips (native) plus a custom input with `≈ $` conversion and balance.
   - Sell: % chips `25 · 50 · 75 · 100` plus a custom % or token amount, and **Sell initials** (recovers the invested native amount, P0).
4. **Limit:** trigger type Price | MCap | % from now. Value. Direction is inferred (below = dip buy or stop, above = breakout or take profit). Expiry `1h · 24h · 3d · 7d · GTC`.
5. **Execution preset row:** `Slot 1/2/3` selector plus a summary like `Slip auto · Prio Std · MEV on · Tip 0.001` and a gear icon that opens the preset editor (§7.4).
6. **Exit plan (bracket):** "Add TP/SL" checkbox. Up to 10 rows of {type TP | SL | Trailing TP | Trailing SL, trigger %, sell %, trailing drawdown %}, plus a sell basis toggle (**% of this buy** | **% of holding at trigger**). Validation: on the "of this buy" basis, the sum of sell % per side must be ≤100.
7. **Cost preview (always visible, P0):** platform fee (0.8%) · network fee · priority · tip · est. price impact · max slippage. **Total cost % of trade** is red above 5%. Shows est. receive / min receive.
8. **Safety gate line:** safety score with its top-3 reasons. A hard-block reason (honeypot, tax >25%, blacklisted dev) changes the CTA to "Type SYMBOL to confirm".
9. **CTA:** green `Buy 0.5 SOL` / red `Sell 50%`. With insufficient balance: `Insufficient balance (need 0.512 incl. fees)` plus a **Top up** link (faucet).
10. **My position mini:** balance, value, avg cost, unrealised $/%, realised $, invested, and a "Share" link.

The **Auto** tab holds token-specific automations (§7.8):
- **Sell on dev sell:** dev sells ≥X% in one trade → sell Y%.
- **Buy on graduation**, **Sell on graduation**.
- **Trailing exit only.**

#### 6.8.4 Right-column cards

**Safety & Audit (TK-A) [P0].**
- Header: safety score 0–100 with band (Avoid <40 · Caution 40–69 · OK ≥70), coverage label, and an "Explain" disclosure listing every deduction with its field value (§8.6).
- **SOL-like checks:** Mint authority renounced · Freeze authority renounced · LP burned % (migrated) · Metadata mutable (P1).
- **EVM-like checks:** Honeypot (sell simulation) · Verified source · Ownership renounced · Blacklist function · Buy tax / Sell tax · LP locked/burned %.
- **Common rows:** Top10 % · Dev hold % (+ status: holding / sold part / sold all / bought more) · Dev team % · Insiders % · Snipers % (count) · Bundlers % (+ launch bundle %) · Fresh % · Phishing % (P1) · Bot traders % (of analysed traders) · Wash trading flag · Creator rug history % · Copycats.
- Every row is green, amber, red, or grey (unknown), using the thresholds in Appendix B.
- **Tri-state rule:** unknown is never shown as pass.
- Footer: "Simulated checks. Reference only."

**Holder structure (TK-S) [P0].**
- Stacked bar showing supply split: Curve/Pool · Burned · Dev team · Insiders · Snipers · Bundlers · Fresh · Smart · KOL · Other wallets. The total is 100% of effective supply plus excluded buckets. Each segment has a hover tooltip.
- Counts row: Smart N · KOL N · Whales N · Snipers N · Insiders N · Bundlers N · Fresh N.
- **View toggle: Supply basis | Float basis** (float = 1 − burned − pools/curve). Float basis is disabled below 2% float ("Cannot assess before graduation").
- Linked-funding summary (P1): "2 funding clusters hold 6.5%" with an expand.

**Early buyers (TK-E) [P0].** A grid of the first 70 buyers as dots, coloured by status: **Holding · Added · Sold part · Sold all · Transferred**. Summary line: `Holding 31 · Added 4 · Part 12 · Sold 20 · Moved 3 · still hold 21.0% of supply`. Sniper dots get an outline. Clicking a dot opens that wallet's mini card.

**Dev card (TK-D) [P0].**
- Creator address (copy, open wallet), funding source and time (`funded by 7xQ… 2h before launch`).
- Status chip, dev holding %, dev-team holding %.
- Launches: total / graduated / rate, best token (peak MC), last 5 launches.
- **Dev score** CONDUCT/POWER/TOTAL and band (P1, §8.8).
- Actions: Follow dev, **Blacklist dev**.

**Pool card (TK-P) [P0, migrated only].** DEX (TrenchSwap), pair `SYMBOL/SOL`, pool address, reserves on both sides with USD, liquidity, fee %, created at, initial liquidity and growth ×, LP burned %, LP holders.

**Socials (TK-L) [P1].** Synthetic social pulse: latest posts mentioning the token, rename history, deleted-post count. Shows "SIM" source.

#### 6.8.5 Bottom tabs

All tabs are virtualised. Tab state lives in `?tab=`.

| Tab | Pri | Content |
|---|---|---|
| **Activity** | P0 | Live trade tape (see below) |
| **Holders** | P0 | Top holders (see below) |
| **Top traders** | P0 | All traders ranked by PnL |
| **Dev tokens** | P0 | Creator's launches |
| **Liquidity** | P1 | Add/remove events, LP providers |
| **Positions** | P0 (logged-in) | My position(s) in this token |
| **Orders** | P0 (logged-in) | My open/history orders for this token |
| **Events** | P1 | Signal history for this token (§8.9) |
| **Comments** | P2 | Community thread (moderated) |

**Activity (TK-B1).**
- Columns: Age · Type (Buy/Sell/Add/Remove/Transfer/Burn/Claim) · MC at trade · Amount (tokens) · Total (USD / native toggle) · Price · Trader (avatar, label/remark, tag chips, `TOP3` rank badge) · Fees (tooltip: platform/network/priority/tip) · Tx (sim hash, copy).
- Filters: class chips **All · Smart · KOL · Whale · Fresh · Sniper · Insider · Bundler · Dev · Top holders · Following · Mine**; side Buy/Sell; min/max USD; maker search; **Oldest first** (early buyers).
- Realtime: `token:<chain>:<address>` `trades` batches (~250 ms) are prepended. Hovering pauses the tape and a "N new" pill appears.
- Clicking a trader opens a mini wallet card: PnL on this token, holding, first buy, tags, and Follow / Copy / Open.
- Selecting a class chip also enables that class's chart markers.
- Data: `GET /api/:chain/tokens/:address/trades?filter&wallet&minUsd&limit≤500&before`.

**Holders (TK-B2).**
- First rows are venue rows, each with a label: **Bonding curve**, **TrenchSwap pool**, **Burn**, **Token contract**. These are excluded from Top10.
- Columns: # (rank `TOP1…`) · Holder (avatar, label/remark, tags, funding source icon) · % supply (bar) · Amount · Value · Avg cost · Bought (USD / tx) · Sold (USD / tx) · Unrealised PnL · Realised PnL · Total PnL (%) · Remaining % (of bought) · Held for · Last active · ☆ follow.
- Filters: tag chips (`all, smart, kol, sniper, bundler, insider, dev, whale, fresh, bot, sandwich, top_holder, following, you`); sort by % held (default), PnL, unrealised, bought, sold.
- Summary bar: Top10 % · Top20 % · Top100 % (cumulative) · holder count · "Contract self-held X%" when present.
- Zero-cost rows show a "received" badge. Zero cost requires no cost basis; it is never inferred from a zero buy count.
- Data: `GET /api/:chain/tokens/:address/holders?tag&limit≤500`, refreshed by WS (`token` detail, 1 s).

**Top traders (TK-B3).** Same row schema. Sort by PnL desc by default; also realised, unrealised, bought, sold, asc/desc.
- Preset chips: "Best smart", "Smart exiting" (sell vol desc), "KOL holding gains", "Worst KOLs", "Snipers still holding".
- Data: `GET /api/:chain/tokens/:address/top-traders`.

**Dev tokens (TK-B4).**
- Summary: created · graduated · graduation rate · best peak MC · median time to graduate · rugged count (§8.3 "Rugged").
- Table: Token · Created · Status (On curve / Graduated / Dead) · Peak MC · Current MC · Holders · Liquidity · 1h vol · Bundler % · CTO · Rugged? · link.
- Sort by created (desc), peak MC, MC. Filter graduated / not.
- Data: `GET /api/:chain/tokens/:address/dev`.

**Positions (TK-B5).** For each of the user's wallets: balance, value, avg cost, invested, realised, unrealised, total PnL $/%, buys/sells, held since, plus Quick sell 25/50/100 and Share.

**Orders (TK-B6).**
- Open | History toggle.
- Columns: Kind · Side · Trigger (type + value, with distance from current) · Amount · Exit plan rows · Status · Created · Expires · Cancel.
- Open orders are also drawn as chart lines (TK-C7).

#### 6.8.6 Realtime and states
- On open, subscribe to `token:<chain>:<address>` with `{resolution}`. Receives `token` (TokenDetail ~1 s while active), `trades` (~250 ms batches), and `candle`.
- **Not found:** the address is not a token on this chain. If it is a known wallet, redirect to `/:chain/address/:address` with a toast "That's a wallet". Otherwise show "No token at this address on {chain}" plus a search-across-chains suggestion. For a bare EVM `0x` address, probe chains one at a time, never in parallel.
- **Dead token** (no trades in 24 h and liquidity < $100): a grey banner "Inactive token" with last trade time.
- **Rugged:** a red banner "Liquidity removed / dev dumped" with the evidence link.


### 6.9 Wallet page (`/:chain/address/:address`) [P0]

**Purpose.** Show a wallet's identity, performance, behaviour, holdings and history, and answer one question: should I follow or copy this wallet? (R§7)

**Layout.**
- **Header row:** avatar, label/remark (editable), tags, chain, address and copy, wallet age, funding source, native balance, and last active. A warning appears when the wallet has been idle for more than 48 h.
- **Header controls:** a period selector (**1D · 7D · 30D · All**, default 7D) and a USD/native toggle.
- **Header actions:** **Follow** (choose group, remark and emoji), **Copy trade**, **Alert**, **Share**.
- **Below the header:** a three-card grid, then the portrait strip (P1), then tabs.
- **Phone:** all cards stack in one column.

**Card 1: PnL (WP-1) [P0].**
- Realised PnL ($, ROI %), unrealised, total including open positions, win rate (`n/N tokens`, with the denominator always shown), buys/sells, total bought, fees paid, and native balance.
- **Daily PnL calendar** for the selected month in the viewer's timezone (§8.12). Cells are green or red, with intensity scaled to `min(1,|v|/P95)` on a square-root scale. The tooltip shows the date, realised $, number of sells, wins/losses and fees.
- Every period exposes the same fields, including 1D and All, which GMGN omits.

**Card 2: Behaviour (WP-2) [P0].**
- Style title chip (§8.4.3) with a speed subtitle.
- Median copy window, median entry MC, average buy size, trades per day, average hold (median of per-sell hold), fee drag %, and 24 h posture (Accumulating / Distributing / Rotating / Quiet).
- **Risk check:** honeypot tokens traded, received-only tokens, sold more than bought, buy→sell within 5 s. Each shows a count and a percentage of tokens traded, with red bars above thresholds (§8.4.5).

**Card 3: Distribution (WP-3) [P0].**
- Six bars counting tokens by realised ROI: `>500% · 200–500% · 0–200% · −50–0% · <−50% · Unsold`.
- Entry-MC histogram showing p25, p50 and p75 bands with labels: <$30k "pre-graduation", <$100k "sniper range", <$300k "small cap", <$3M "mid cap", otherwise "large cap".

**Copy assessment card (WP-4) [P1].**
- Two scores: track-record score and copy-tradeability score. Each is 0–100 with factor bars.
- **Four gates:** Authenticity, Currency, Reachability, Survivability. Each shows ✅, ❌ or ⚪ (unmeasured) and the number that decided it.
- A verdict line (e.g. 🟢 "Copyable at small size: start ≤ 0.6 SOL, land within 40 s").
- Backtest inputs (latency s, slippage %, gas $) with live recompute (§8.5).

**Portrait strip (WP-5) [P1].** Three lines:
- style title
- one-line recap: money made or lost, plus top strength and top problem
- next step, phrased "Next step" on the user's own wallet and "Reference advice" on others (§8.4.6)

**Tabs.**

| Tab | Pri | Columns / content |
|---|---|---|
| **Recent PnL** | P0 | All tokens traded, closed included, sorted by last active. Columns: Token · Last active · Unrealised · Realised · Total ($ / %) · Bought (total / avg price) · Sold (total / avg) · Balance / position % · Buys/Sells · Held for · Share |
| **Holdings** | P0 | Open positions. Columns: Token (badges: honeypot, rugged, stale price) · Balance · Value · Avg cost · Unrealised $/% · Realised · Total · Bought / Sold · Held for · Last active. Toggles: hide dust (<$1), hide airdrops (default on), hide closed (default on), hide abnormal (default off). Sort: value (default), PnL, recent, bought, sold. Total portfolio value at the top. |
| **Activity** | P0 | Rows: Time · Type (Buy/Sell/Transfer in/Transfer out/Add/Remove) · Token · Amount · USD · Price/MC · Realised PnL on sells ($, %) · Fees · Tx. Filter chips by type and by token. Cursor-paged by 50. |
| **Created tokens** | P0 when the wallet is a creator | Same as Dev tokens (TK-B4) |
| **Calls** | P2 | Call-out record with 7d/30d hit rate |

**Realtime.** Subscribes to `wallet:<chain>:<address>`, which delivers trade batches about every 500 ms. New activity rows prepend. Card 1 recomputes every 10 s.

**Empty and edge states.**
- No trades: "This wallet has no trading record on {chain}."
- A token address entered here: "That's a token" redirects to the token page.
- An unrated wallet with fewer than 5 settled tokens shows "Not enough history to rate" in place of the style title and scores.

### 6.10 Leaderboard (`/:chain/leaderboard`) [P0]

**Purpose.** Help users find wallets to inspect, follow or copy (R§7.7).

**Controls.**
- Category tabs: **Smart money · KOL · Snipers · Whales · Fresh winners (P1) · Top devs (P1) · Most followed (P1) · All**
- Period: **1D · 7D · 30D**
- Search by label or address
- Filter drawer with min/max for PnL %, realised $, win rate, trades, volume, average buy

**Columns.**
- Rank · Wallet (avatar, label, tags, tag rank) · Native balance · PnL % · Realised $ · Win rate (n/N) · Trades (buys/sells) · Volume · Average hold · Distribution mini-bar (5 buckets) · Last active
- **Copy score** (P1)
- Follow ☆
- **Copy** button, which opens the copy-task sheet pre-filled

**Data.** `GET /api/:chain/leaderboard?tag&period&sort=pnl|winRate|volume|tokens|pnlRate&limit`. REST, refreshed every 30 s. The page is capped at 100 rows.

**Empty.** "No wallets qualify for this category yet."

### 6.11 Monitor (`/:chain/monitor`) [P0]

**Purpose.** Watch what smart money, KOLs and followed wallets are doing in real time, both trade by trade and aggregated per token (R§8.1, §8.2, §8.4).

**Layout.**
- Tabs: **Smart money · KOL · Following · Inflow board**.
- Desktop shows the Convergence panel as a right sidebar. On phone it collapses into a top carousel.

**Feed tabs (MN-1) [P0].**
- Rows: time-ago · BUY/SELL pill · position-event badge (**Open / Add / Reduce / Close**) · token (avatar, symbol, launchpad, age) · amount $ (and native) · MC at trade · maker (avatar, label/remark, emoji, tags, tag rank) · **x since trade** (`price_now/price_at_trade`) · quick buy.
- **Filters:** side, min/max USD, MC range, token age range, "first buy only", wallet multi-select, group (Following), **hide stablecoin/native tokens**.
- **Noise control (P0):**
  - collapse identical repeat buys by the same wallet on the same token within 20 s into one row with "×N"
  - **starred wallets** are pinned and coloured
  - per-wallet mute
- **Realtime.** Subscribes to `feed:<chain>:<smart|kol|follow|all>` in batches of about 500 ms. Hovering a row pauses the feed. Sound is configurable per wallet in the Following tab.

**Inflow board (MN-2) [P1].**
- Token cards ranked by **net inflow from the selected cohort** (Smart, KOL, Following or All) over a window (`5m · 1h · 6h · 24h`).
- Card fields: token, MC, net inflow $, distinct buyers/sellers (avatar stack), buys/sells, first-buy time, and MC at first cohort buy → now (×), plus hide and quick buy.
- Filters: min wallets, MC range, age, launchpad, graduated status.
- `netInflow = Σ buy_usd − Σ sell_usd` over cohort trades in the window. Ranked by net inflow, requiring at least 2 distinct buyers.

**Convergence panel (MN-3) [P0].** Clusters where three or more distinct cohort wallets traded the same token in the same direction within 30 minutes.
- Row example: "**5 smart wallets · all BUY · $42.3k · within 14 min**".
- Strength label: **Weak · Medium · Strong · Very strong** (§8.9.2).
- Red-flag badges: smart full-closes, KOL-only buying, KOLs buying while smart wallets sell (divergence).
- Empty state: "No convergence right now."

### 6.12 Signals (`/:chain/signals`) [P0]

**Purpose.** A real-time stream of notable token events, with saved filter groups that can also drive push alerts (R§9).

**Layout.**
- **Header controls:**
  - kind chips grouped as **Price** (Price spike, ATH, MC level, Candle spike·P1) · **Smart/KOL** (Smart buy, KOL buy, Large buy, Multi buy, Multi large buy·P1, Smart exit·P1) · **Promo** (Promotion, CTO) · **Risk** (Bundler sell, Dev sell) · **Lifecycle** (Graduation, Live·P1, Fee claim·P1) · **Calls** (KOL call)
  - range filters: MC at trigger, current MC, token age, fees paid
  - **Quality filter** toggle, default on, which hides tokens with rug >0.3, wash trading or honeypot
  - **Groups builder:** an OR of AND-groups, the same schema as alert subscriptions
  - **Subscribe** button
- **Feed rows:** token (avatar, symbol, age, launchpad) · kind badge plus a key detail ("5 smart wallets bought $4.1k in 9 min", "Crossed $1M MC") · time · MC at trigger → now (×N, coloured) · first-trigger MC · peak MC (× guarded) · fired ×N (per-kind tooltip) · holders · Top10 · liquidity · quick buy.
- When a token fires several kinds within 60 s, its rows collapse into one row with stacked badges. Expanding a row shows the maker list or the order/claim detail.

**Data.** `GET /api/:chain/signals?kind&limit` plus `signals:<chain>`, pushed on trigger. **(Contract change)** adds `groups` (JSON), `before` cursor, and per-signal `firstTriggerMcUsd`, `timesFired`, `timesFiredByKind`, `curHolderCount`, `curTop10Rate`, `curLiquidityUsd`, `payload`.

**Empty.** "No signals match. Try enabling more kinds."

### 6.13 Copy trade (`/:chain/copytrade`) [P0]

**Purpose.** Create and monitor automated copy tasks (R§6.12, §7.9–7.10).

**Layout.**
- **Top:** **New copy task** button and a "Discover wallets" link to the Leaderboard.
- **Task list**, one card per task: target label/address, status (Running / Paused with reason), invested, realised and unrealised PnL, number of copies, last copy time, and Pause/Resume, Edit, Delete.
- **Task detail drawer** with tabs **Positions · Copied · Failed (reason) · Skipped (rule hit) · Settings**.

**Create/Edit sheet (CT-1).**

| Field | Type / default | Pri |
|---|---|---|
| Target wallet | address (validated) + live mini-stats (7D PnL, win rate, last trade, **copy score** and gate summary) | P0 |
| Task name | text | P0 |
| From wallet | active paper wallet; multi-wallet P1 | P0 |
| Buy mode | **Fixed** (amount) · **Proportional** (ratio × target spend) · **Max-capped** (target amount capped at max) | P0 |
| Amount / ratio / cap | native | P0 |
| Sell mode | **Mirror sells** (proportional; only tokens this task bought; default) · **Don't sell** · **Exit plan** (TP/SL rows, computed on the task position's average cost; disables mirroring) | P0 |
| Filters | MC min/max at target's buy, liquidity min/max, token age min/max, launchpads, **min safety score** (default 40), max buys per token (re-buy count; 0 = never re-buy; resets on full close), min/max target trade size (USD), token blacklist (≤20), skip if the target is the token's dev | P0 |
| Execution | preset slot, or custom slippage/priority/anti-MEV | P0 |
| Budget | daily spend cap, max concurrent positions | P0 |
| Auto-pause | after 3 consecutive failures (fixed) | P0 |

**Engine rules.** See §7.9.

**Realtime.** `user` channel `fill` and `order` events update the counters live. A paused task shows a banner with the reason and a "Resume" action.

**Limits.** 10 active tasks per user (P0); configurable later.

**Empty.** "No copy tasks yet. Find a wallet on the Leaderboard."

### 6.14 Sniper and automations (`/:chain/sniper`) [P1; migration snipe P0 via token page]

**Purpose.** One page that lists every automation task (R§6.11).

**Task types.**
- **Graduation snipe** (buy at migration; P0 from the token page Auto tab)
- **Graduation exit** (P0)
- **Dev-sell exit** (P0)
- **Launch sniper** (P1): rule-based auto-buy of new launches matching filters (launchpad, dev record, socials, safety, max dev buy %, daily budget, cooldown)
- **Social sniper** (P2): buys when a followed sim KOL persona posts a contract address; at most 10 tasks, 7-day life, burnt-LP minimum

**List columns.** Type · Target (token or rule) · Amount · Exit plan · Status (Armed / Triggered / Expired / Failed) · Hits today / spend today · Created · Actions.

**Empty.** "No automations. Arm one from any token's Auto tab."

### 6.15 Portfolio (`/portfolio`) [P0]

**Purpose.** All of the user's paper wallets and positions across chains.

**Layout.**
- **Header:** total value (32 px), Total PnL ($, %), realised, unrealised, 24 h change, and fees paid. Chain filter: **All · sol · bsc · base · eth**.
- **Actions:** **Top up** (faucet: refills to the starter balance, once per minute per chain), **Reset paper account** (P1, two-step confirm), **Export CSV** (P1).
- **Tabs:**
  - **Holdings** (as Wallet Holdings plus a chain column)
  - **History** (closed positions)
  - **Activity**
  - **Orders** (all open strategy orders: kind, token, trigger, amount, status, cancel; "Cancel all" with confirm)
  - **Calendar** (daily PnL, all chains, viewer timezone)
  - **Fees** (P1: platform / network / priority / tip / MEV loss totals per day)
- **Wallet manager (P1):** create up to 5 paper wallets per chain, rename, set primary, archive (closes that wallet's orders and copy tasks).

**Realtime.** `user` channel `balance`, `fill`, `order`, plus token tickers for held tokens (`token_stat`-style coalesced ticks, P1).

**Empty.** "No positions yet. Your paper wallet has ◎ 50.00. Start on Trenches."

### 6.16 Watchlist (`/watchlist`) [P0]

**Layout.**
- Group tabs: **All · Default · custom groups**. Groups can be added, renamed, reordered (drag) and deleted; these are P0 except reorder.
- Interval selector `1m · 5m · 1h · 6h · 24h`.
- Search.
- **Table:** star · Token (chain badge) · Price · Δ% (interval) · MC · Liquidity · Volume · Swaps · Holders · Safety · Note (P1) · Added · Quick buy.
- **Sort:** added (default), price, change, MC, liquidity, volume, swaps, age.
- A token can belong to several groups. The star on any page opens a group picker; a plain click adds the token to Default.

**Realtime.** Coalesced price ticks for visible rows (~1 s).

**Empty.** "Star tokens anywhere to watch them here." A recommended-tokens block below shows the top 5 trending.

**(Contract change)** Watchlist items gain `groupIds[]`, `note`, and `alias`. New CRUD endpoints for groups.

### 6.17 Alerts and notification inbox (`/alerts`) [P0]

**Tabs.** **Inbox · Price alerts · Wallet alerts · Signal subscriptions · Delivery** (channels and quiet hours).

**Inbox.**
- **Rows:** category icon · title · body · token/wallet chip · time · read state.
- **Filters:** All / Signals / Wallets / Price / Orders / System; chain; token search.
- **Actions:** mark read, mark all read, archive.
- **Grouping:** notifications that share a group key within 5 minutes collapse into one row with "×N".
- **Retention:** 30 days (order fills 90).

Each of the other tabs lists rules with an enable toggle, last triggered time, 24 h hit count, edit and delete. Rule schemas are in §9.

### 6.18 Rewards (`/rewards`) [P1]

**Points.**
- Earned only by paper trading:
  - +1 per trade ≥ $10 (paper USD)
  - +100 per $1,000 of daily volume
  - daily cap (default 1,000)
- History list and a daily progress bar.
- A store is P2.

**Referral.**
- Personal code and link (`/?ref=CODE`), copy button and QR.
- Invitee count, invitee volume, and simulated rebate (25% of the invitee's platform fees, credited as paper native).
- Invitees get a 10% fee discount (0.72%).
- **Binding:** a code binds only before the account's first trade.

### 6.19 Settings (`/settings`) [P0]
Sections and fields are specified in §10.

### 6.20 Search overlay and command palette [P0 search; P1 palette]

**Search overlay.** Opened with `/` or a click on the search box.
- **Empty state:** **Recent searches** (local, 10) and **Hot now** (top 10 by our visit heat on the current chain, P1; trending fallback in P0).
- **Results:**
  - **Tokens:** up to 20 rows of symbol, name, chain badge, price, MC, liquidity, 24 h volume, holders, age, short contract address, and a ⚠ copycat badge.
  - **Wallets:** up to 10 rows of address, label, tags, and chain.
- **Scope:** current chain or All chains.
- **Ranking:** match tier (address 4 > exact symbol 3 > exact name 2 > normalised 1.5/1.2 > fuzzy). Within a tier, the geometric mean of one-side depth, 24 h volume, credible cap and min(holders, 50k). The largest-MC exact match is always shown.
- **Query normalisation:** strip control, zero-width and bidi characters; trim; 1–100 characters; ignore a leading `$`; case- and width-insensitive.
- **Keyboard:** ↑/↓, Enter, Tab to switch section, Esc to close.

### 6.21 Share card and verification [P1]

**Card.** Generated server-side as a PNG at 1200×675 (X) and 1080×1080.
- **Contents:** our brand mark, token symbol/logo/chain, big ROI % (green or red), multiple (×), PnL $ (hideable), invested → returned, average entry MC → average exit MC, held for, wallet label, date, referral QR and code, an unremovable **SIMULATED** watermark, and a verify URL.
- **Options:** hide $ amounts, USD/native, 4 background themes.
- **Actions:** download, copy image, share-to-X intent link.
- `/share/:cardId` recomputes the snapshot from the ledger and shows "Verified ✓" or "Values differ from ledger".

### 6.22 Auth and onboarding [P0]
- **Guest:** created automatically on first visit (`POST /api/auth/guest`), with paper wallets funded at starter balances on all chains.
- **Save account:** username and password (passkeys P1) upgrade the guest in place. Login/logout are rate limited (§11.8).
- **Coach-mark tour:** 4 steps (SH-15).
- **Risk acknowledgement:** shown before the first trade. It states that the market is simulated, there are no real funds, and nothing is financial advice. The acknowledgement is stored.

### 6.23 Call-outs (`/:chain/callouts`) [P2]
- **Feed:** global call-outs from sim KOL personas and users. Each shows the caller, token, call MC → now (×), thesis text, whether the caller still holds ($), safety state, and the callback count.
- **Filters:** KOL only, safe only, holding range.
- **Composer (users):** thesis ≤280 characters. Allowed only while holding the token. Snapshots price and MC.
- **Caller card:** 7d and 30d calls, average multiple, best multiple, hit-2× rate. A "Sold within 1 h of calling" warning appears where it applies.

### 6.24 Launch a token (`/:chain/launch`) [P2]
- **Form:** launchpad, name (≤32), symbol (≤10), image (generated identicon or upload ≤1 MB), description (≤500), socials (http(s)), and dev buy (native).
- **Options:** sniper wallets (≤3 of the user's own paper wallets, P2) and auto-sell rules.
- Every bundle or sniper wallet is publicly disclosed on the token page ("Creator-linked wallets").
- Text passes the sanitisation in §11.8.
- The same confirmation flow as trades applies (§7.10).

### 6.25 Misc pages
- `*` Not found [P0]: "Nothing here" with links to Trenches and Search.
- `/_ui` [P0 internal]: component gallery covering every chip, badge, card, table row and state, in both themes.


---

## 7. Trading engine requirements (paper)

### 7.1 Paper wallets and balances
- **TE-01 (P0)** Each account gets one paper wallet per chain, created at signup (guest included) and funded with the starter balance (§5.1). The wallet address is a normal simulated address and shows up in every holder and activity list like any other wallet. Tag: `you` (viewer-relative).
- **TE-02 (P0)** **Faucet**: `POST /api/wallet/faucet {chain}` tops the native balance back up to the starter balance, at most once per minute per chain. Faucet credits are logged as deposits and are **excluded from PnL**.
- **TE-03 (P1)** Up to 5 paper wallets per chain (create, rename, primary, archive). Transfers between your own wallets are internal: basis carries over and no PnL is booked (§8.12).
- **TE-04 (P0)** The balance check before a trade includes `amount + platform fee + network fee + priority + tip`. A failed check returns `insufficient_balance` with the amount needed.

### 7.2 Order types

| Kind (`OrderKind`) | Trigger | Pri | Notes |
|---|---|---|---|
| Market buy/sell | immediate | P0 | `POST /api/trade/swap` |
| `limit_buy` | price / MC crosses `below` (dip) or `above` (breakout) | P0 | amount in native |
| `limit_sell` | price / MC crosses `above` (take profit) or `below` (stop) | P0 | amount as % of holding or token amount |
| `take_profit` | change from entry ≥ +X% | P0 | entry = avg cost at creation (or fill price for bracket legs) |
| `stop_loss` | change from entry ≤ −X% | P0 | |
| `trailing_stop` | drop of X% from peak. Armed immediately (trailing SL), or once change ≥ `activateAtChangePct` (trailing TP) | P0 | peak updates on every tick and only ratchets up |
| `dev_sell` | the dev sells ≥ `devSellThreshold` of their holding in one trade | P0 | then sell Y% |
| `migration_buy` | the token graduates | P0 | must be armed before graduation |
| `migration_sell` | the token graduates | P0 | |
| Exit plan (bracket) | up to 10 TP/SL/trailing legs attached to a buy | P0 | legs are created after the parent fill |
| `smart_entry` (dip entry + bracket) | price ≤ trigger → buy → arm legs | P1 | **(contract change)** |
| `dca` | N orders every T within price bounds | P2 | |
| Launch sniper rule | new launch matches filters | P1 | §7.8 |

### 7.3 Market orders: quote and swap
- **TE-10 (P0)** `POST /api/trade/quote` with `{chain, token, side, amount, amountKind: native|token|percent, presetSlot | overrides}` returns:
  - `{amountIn, expectedOut, minOut, priceImpact, avgPrice, platformFeeNative, networkFeeNative, priorityFeeNative, tipNative, totalCostPct, safety{score, reasons[], hardBlock?}, etaMs{p50,p90}, quoteId, expiresAt}`
  - The quote is valid for 5 s or until the price moves more than 0.5%, whichever comes first.
- **TE-11 (P0)** Swap request `{quoteId? , chain, token, side, amount, amountKind, slippagePct | autoSlippage, feeTier: eco|std|turbo|auto|custom, priorityFee?, antiMev, tip?, exitPlan?, clientOrderId}`.
  - **Idempotency**: repeating the same `clientOrderId` within 60 s returns the original receipt.
- **TE-12 (P0)** Percent sells are allowed only when the input is a token, never a native/quote currency. Percent → bps conversion uses `Math.round(pct*100)` and clamps to `(0, 10000]`.
- **TE-13 (P0)** **Sell initials**: sell `min(100%, invested_native / position_value_native)`. Only available when a position exists and invested > proceeds so far. Transfers-in are ignored.
- **TE-14 (P0)** Price impact (curve or constant-product pool) is computed exactly from reserves: `impact = 1 − (out/in)/(spot)`. Warn above 3%; require typed confirmation above 15%.
- **TE-15 (P0)** Receipt `SwapReceipt`:
  - `{ok, error?, side, token, nativeAmount, tokenAmount, avgPriceUsd, priceImpact, platformFeeNative, networkFeeNative, priorityFeeNative, tipNative, mevLossNative, txHash, block, submittedAt, landedAt, latencyMs, attempts, orders[]}`
  - **(contract change)** adds the priority, tip, block and attempts fields.
  - Realised PnL for the trade appears on sells.

### 7.4 Execution presets, slippage, priority, anti-MEV
- **TE-20 (P0)** **Three preset slots** per chain, labelled `Slot 1 / 2 / 3` with user-renamable labels (defaults "Calm / Fast / Snipe"). Each slot has separate **Buy** and **Sell** settings:
  - slippage: `auto` or 1–100%
  - fee tier: `eco | std | turbo | auto | custom`, with a custom priority fee
  - anti-MEV: on/off
  - tip
  - quick amounts: 4 buy amounts in native, 4 sell percentages
- **TE-21 (P0)** **Defaults**:

  | | Slot 1 "Calm" | Slot 2 "Fast" (default) | Slot 3 "Snipe" |
  |---|---|---|---|
  | Buy slippage | auto | auto | 30% |
  | Sell slippage | auto | auto | 30% |
  | Fee tier | eco | std | turbo |
  | Anti-MEV | on | on | off |
  | Tip | auto | auto | 0 |

  Default quick buys: sol `0.1 · 0.5 · 1 · 2`, bsc `0.05 · 0.1 · 0.3 · 1`, base/eth `0.01 · 0.02 · 0.05 · 0.1`. Default sells: `25 · 50 · 75 · 100`.
- **TE-22 (P0)** **Auto slippage** = `2% + token tax + priceImpact×1.5 + |5m change|×0.5`, with a floor of 1% and a cap of 15%.
  - If the formula exceeds 15%, keep 15% and show "Reduce size or split".
  - Add +3% for tokens under 1 h old.
  - On EVM tax tokens, slippage must be ≥ the buy tax.
- **TE-23 (P0)** **Fee tiers** come from the sim `FeeOracle`. Per chain it reports `eco/std/turbo/auto` priority fees in native units, plus ETA p50/p90 in ms and the current congestion level. Example SOL calm: eco 0.0005, std 0.002, turbo 0.006, auto 0.001. Congested: ×3.
  - Show each tier's USD cost and ETA.
  - Custom fee below eco: warning "may not land".
  - Custom fee above 5× turbo: warning "won't be faster".
  - Never auto-correct a user value.
- **TE-24 (P0)** **Anti-MEV**:
  - On: no sandwich risk, +1 block median latency, tip charged (default 0.001 SOL; EVM 0).
  - Off: sandwich risk modelled when slippage ≥ 3% (§5.4). The receipt shows the MEV loss.
  - Anti-MEV on with an eco fee warns "may land slowly".
- **TE-25 (P1)** Copy-trade and automation tasks can override any preset field.

### 7.5 Landing and fee simulation
- **TE-30 (P0)** Landing delay in blocks is sampled from a per-chain distribution keyed by `(congestion, feeTier, antiMev)`. Default p50 (blocks): turbo 1, std 1–2, eco 2–4. Congested: ×2. Anti-MEV: +1.
- **TE-31 (P0)** Failure probability by tier (calm / congested): turbo 0.5%/2%, std 1%/5%, eco 3%/15%.
  - Failure codes: `expired`, `slippage_exceeded`, `insufficient_balance`, `route_unavailable` (pool migrating/closed), `not_sellable` (honeypot), `rate_limited`.
  - Failed transactions charge network + priority fees but not the platform fee or tip.
- **TE-32 (P0)** **Fee accounting** per fill: the platform fee of 0.8% of the native leg is taken from the input on buys and from the output on sells. Launchpad/DEX fees are already inside the price. Network, priority and tip are separate lines.
- **TE-33 (P1)** Smart retry for user-initiated orders. If an order does not land within 2 blocks and price is within slippage, retry with priority ×1.5, up to 3 attempts, never above the user's max fee. Each attempt is shown in the order timeline.
- **TE-34 (P1)** **Landing telemetry**: a public `/status` panel shows p50/p95 landing time and success rate per chain and tier over the last 1 h and 24 h. It is computed from all fills, agents included.

### 7.6 Limit orders
- **TE-40 (P0)** Fields:
  - `{chain, token, kind: limit_buy|limit_sell, triggerType: price|mcap|change, triggerValue, direction: above|below, amount, amountKind, expiresAt | ttl: 1h|24h|3d|7d|gtc, presetSlot|overrides, exitPlan? (buys)}`
- **TE-41 (P0)** Triggers are evaluated on every trade tick for the token. Fire on a crossing:
  - `prev < trigger ≤ curr` for `above`
  - `prev > trigger ≥ curr` for `below`
  - For `change`, the reference is the price at creation.
  - Triggers use the **last trade price**, and fire only if the pool mid price agrees within 2% (wick guard).
- **TE-42 (P0)** On fire, claim the order atomically, then execute it like a market order using the order's own preset. On failure, retry once (P0) or with smart retry (P1). After that the order goes to `failed` with a reason.
- **TE-43 (P0)** Upsert rule: identical `(token, kind, direction, triggerValue)` for the same wallet updates the existing open order instead of duplicating it. The response carries `isUpdate: true`. **(contract change)**
- **TE-44 (P0)** At most 50 open orders per account per chain.

### 7.7 Exit plans: TP, SL and trailing
- **TE-50 (P0)** Up to 10 legs, each `{type: tp|sl|trailing_tp|trailing_sl, triggerPct, sellPct, drawdownPct?}`.
  - TP trigger = `entry × (1 + triggerPct/100)`.
  - SL trigger = `entry × (1 − triggerPct/100)`.
  - Trailing SL is armed immediately with stop = `peak × (1 − d)`.
  - Trailing TP is dormant until the TP price is reached, then fires when price ≤ `peak × (1 − d)`.
- **TE-51 (P0)** **Sell basis**:
  - `ofBuy` (default) fixes a token quantity at creation (sellPct × filled quantity).
  - `ofHolding` sells sellPct of the holding at trigger time.
  - Validation for `ofBuy`: Σ TP legs ≤ 100% and Σ SL legs ≤ 100%.
  - Each leg sells at most what remains, so there is never an oversell.
- **TE-52 (P0)** Entry reference for a bracket = the parent fill's average price **including fees** for TP and **excluding fees** for SL. This avoids premature triggers.
- **TE-53 (P0)** When one SL leg fires for 100%, cancel the remaining legs. When the position is closed manually, cancel all legs and send a notification.
- **TE-54 (P0)** Legs appear as chart lines with live "distance to trigger %". Trailing legs show their current stop price.
- **TE-55 (P1)** Suggested pairs shown as hints: TP +50% with 10% trailing, +100% with 15%, +200% with 20%.

### 7.8 Event automations
- **TE-60 (P0)** **Dev-sell exit**: `{token, devSellThreshold (default 0.3 = 30% of dev holding in one trade), sellPct (default 100)}`. One task per token. Created from the token page Auto tab, or from the Buy panel checkbox "Exit if dev dumps".
- **TE-61 (P0)** **Graduation buy**: `{token, amount, exitPlan?}`. It must be created while the token is on the curve. It fires on the `migrated` event at the first pool block and uses the turbo tier by default.
- **TE-62 (P0)** **Graduation sell**: `{token, sellPct}`.
- **TE-63 (P1)** **Launch sniper** rule:
  - Filters: `{launchpads[], maxDevBuyPct, requireSocials, minDevGraduationRate, maxDevLaunches, devBlacklist, minSafety}`.
  - Settings: `amount, exitPlan, maxBuysPerDay, dailyBudget, cooldownSec`.
  - Evaluated at creation plus N blocks (default 1).
  - It skips launches where the dev sold ≥20% within 60 s, or where the curve completed in under 60 s (bundle pump).
- **TE-64 (P2)** **Social sniper**: watches sim KOL personas for contract-address posts. Settings: `minBurnLpPct, skipIfHolding, maxAgeMin`. At most 10 tasks, each living 7 days.
- **TE-65 (P0)** All automations need an explicit **automation consent** per task. The consent has a daily spend cap and expiry (default 30 days), is shown on creation, and can be revoked in Settings.

### 7.9 Copy-trade engine
- **TE-70 (P0)** Listens to the target's trades on the in-process event bus with zero added latency. Each copy then follows the landing simulation, so a copier **lands later than the target**. Expected drift should be visible in the UI.
- **TE-71 (P0)** On a target **buy**:
  1. Apply filters: MC range at target buy, liquidity, age, launchpads, min safety, target trade size range, max buys per token, blacklist, skip-if-dev.
  2. Compute size:
     - Fixed: amount
     - Proportional: `targetSpendNative × ratio`
     - Max-capped: `min(targetSpend, cap)`
  3. Enforce the daily budget and max concurrent positions.
  4. Execute and attach the exit plan if configured.
- **TE-72 (P0)** On a target **sell**, when mirroring: `sellPct = targetSold / targetHoldingBeforeSell`, applied to the task's position. This only touches tokens this task bought.
- **TE-73 (P0)** Exit-plan mode computes TP/SL on the task position's average cost, which is recomputed after adds. Mirroring is disabled in this mode.
- **TE-74 (P0)** After 3 consecutive failures the task auto-pauses with the reason (`insufficient_balance`, `no_route`, `slippage`, …) and sends a notification. Resume is manual.
- **TE-75 (P0)** Task records:
  - `copy_execution{targetTx, side, targetAmount, ourAmount, status: success|failed|filtered, failCode, filterRuleHit, ourTx, ts}`
  - `stats{copies, spentNative, receivedNative, realizedUsd, unrealizedUsd}`
- **TE-76 (P1)** **Copy guardrails**:
  - Warn on targets that fail the Reachability gate (copy window < 3× our latency, median entry MC < $30k, sandwich/MEV tags, > 100 trades/day).
  - Warn on Authenticity failures (wash trading, launcher wallet, one-coin record).
  - Show "this wallet dumped on followers N times in 7d" (KOL dump detection: sold > 50% within 60 min after a call or after followers' copies landed).

### 7.10 Confirmations, safety gates, errors
- **TE-80 (P0)** **Confirmation policy**:
  - Quick-buy and hotkey buys execute immediately when amount ≤ the user's confirm-above threshold (default 2× the column quick amount; set in Settings) and no gate fires.
  - Otherwise show a compact confirm sheet: token, amount, all-in cost, safety reasons.
- **TE-81 (P0)** **Hard gates**: these require typing the symbol to proceed and can never be bypassed by automation.
  - Honeypot (EVM sell sim fails)
  - Buy + sell tax > 25%
  - Dev blacklisted by the user
  - Token flagged rugged (liquidity < $100 after LP pull)
- **TE-82 (P0)** **Soft gates**, which warn and need an extra click:
  - Safety score below the user's gate (default 40)
  - Price impact > 3%
  - 5m drop ≥ 10% ("falling knife": suggests a limit at `price × (1 − |5m drop|)`)
  - All-in non-platform fees > 3% of trade size
- **TE-83 (P0)** Automations (copy, sniper, orders) apply the hard gates, plus the task's own min-safety rule.
- **TE-84 (P0)** Error envelope: `{error, code}`. Codes:
  `insufficient_balance, slippage_exceeded, expired, route_unavailable, not_sellable, quote_unavailable, order_limit_reached, invalid_amount, percent_on_currency, rate_limited, hard_gate, automation_consent_required`.
- **TE-85 (P0)** Never auto-retry a user's market order after a failure except through smart retry (P1). Never loop on the same error. Retry buttons always re-quote.

### 7.11 Order lifecycle and events
- **TE-90 (P0)** Status machine:
  - Swaps: `pending → landed (filled) | failed | expired`.
  - Orders: `open → filled | cancelled | failed | expired`.
  - Exit-plan legs are child orders with `parentId`. **(contract change)**
- **TE-91 (P0)** Every transition emits a `user` channel event (`order`, `fill`) and an inbox notification (fills, failures, auto-pauses). Toast style: green for a fill, red for a failure, amber for a pause.
- **TE-92 (P0)** The order timeline in the order detail lists created, armed, triggered (with trigger price), submitted (with tier), landed (block, latency) and filled (amounts and fees).

### 7.12 Multi-wallet trading [P1]
Select 1–5 of the user's paper wallets per chain with per-wallet amounts or "split evenly". Fills run concurrently and independently, and results show per wallet. A warning appears: "Buying from several of your own wallets will mark you as a bundler in analytics."


---

## 8. Analytics requirements

All formulas in this section are deterministic and use only observable data (AR-02). Fractions are stored as 0–1 and displayed as %. "Unknown" is `null` and renders as `—`. Every metric has a tooltip that states its definition. Research basis: R§5.12, R§7, R§14, R§15.

### 8.1 Holder universe and denominators [P0]
- **AN-01** Effective supply: `D = totalSupply − Σ balance(burn/dead addresses)`.
- **AN-02** **Excluded addresses.** These are kept out of every numerator and out of the Top-N ranking. Each excluded class is reported as its own venue row:
  - the bonding-curve account and AMM pools/vaults (`addrType: curve|pool`)
  - burn/dead addresses
  - the token contract ("Contract self-held", warn when > 10%)
  - locker contracts (P1)
  - labelled CEX/funder hot wallets
- **AN-03** `holderCount` counts eligible wallets with balance > 0. Only these have `addrType: wallet`.
- **AN-04** All holders are indexed, not only the top 100.
- **AN-05** **Float view** (holder analysis, P1): `float = 1 − burn − pools/curve`. When float < 2%, every float metric reads "Cannot assess".
- **AN-06** Each chip is independent and tag sets may overlap. A de-duplicated "risk total" is the union of insider ∪ bundler ∪ sniper ∪ fresh ∪ wash-trader holdings, shown in a tooltip with the overlap amount.

### 8.2 Security audit fields [P0]
`TokenSecurity` **(contract change if absent)**. Every value is tri-state `true | false | null`.

| Field | SOL-like | EVM-like | Source in sim | Display |
|---|---|---|---|---|
| `mintRenounced` | ✓ | — (hidden) | launch flags | red if false |
| `freezeRenounced` | ✓ | — | launch flags | red if false |
| `lpBurnedPct` | migrated only | migrated only | migration (100% default) | green = 100% |
| `lpLockedPct` | — | P1 | | ≥ 50% ok |
| `isHoneypot` | — | ✓ (sell simulation against the pool at the current block) | token flag | **hard red** |
| `isOpenSource` | — | ✓ | flag | yes / unknown / no → green / amber / red |
| `ownerRenounced` | — | ✓ | flag | same |
| `hasBlacklist` | — | ✓ | flag | red if true |
| `buyTax`, `sellTax` | — | ✓ (fractions; `0` is a real 0%, `null` means untested) | flag | 0 green, ≤ 5% amber, > 10% red |
| `metadataMutable` | P1 | — | flag | amber |
| `copycatCount` | ✓ | ✓ | name/symbol/image-hash index | amber if > 0 |
| `socialRenameCount` | P1 | P1 | social pulse | amber if > 0 |

- **AN-10** **Honeypot fallback chain** (for future real data): explicit flag → simulated sell → "any sell by anyone in 24 h" means not a honeypot.
  - If our own wallet's holding shows sells, the honeypot flag is refuted.
  - Tokenised-asset false positive (P2): flag = true, but > 500 sells in 24 h, > $100k sold, and sell/buy ratio between 0.3 and 3 → downgrade to unknown.

### 8.3 Token-scoped labels and holder-risk chips [P0]
Labels are computed per token at event time. They can be **added retroactively but are never removed automatically**.

| Label | Rule |
|---|---|
| **open block `b_o`** | The creation block for curve tokens. The first liquidity-add block for no-curve launches. Graduation is **not** a new open. |
| **dev** | The creator. |
| **dev_team** | `{dev}` ∪ wallets that bought in the creation tx or the creation-slot bundle ∪ wallets whose **first native funding** came from the dev or a team member ≤ 7 d before their first acquisition ∪ recipients of token transfers from the dev or team (excluding burn, pool, locker, and contract addresses). |
| **bundler** | ≥ 2 distinct buyers in one block linked by a hard signal: same tx (multi-signer), same bundle (sim: same `bundleId`/tip account), same fee payer, or the creation bundle. **Fallback:** ≥ 3 buyers in the same block within the first 100 blocks after `b_o`, none of them routers or known MEV bots. The dev keeps the `dev` label and is not a bundler. |
| **sniper** | Within the first 70 distinct non-dev buyers (`earlyBuyers`), the first buy lands in blocks `b_o … b_o+3` (or within ≤ 1.6 s on chains with < 400 ms blocks). dev_team members are excluded. The label is frozen at the first buy. |
| **insider** | An eligible non-dev wallet matching any of: **(A)** acquired tokens with no buy after open, from an insider or dev-team sender (≤ 2 hops), or before open; **(B)** first native funder is dev_team, or is the dev's own first funder, ≤ 72 h before the first acquisition; **(C)** shared-funder cluster: ≥ 3 acquiring wallets with the same non-service first funder and *coherent* funding (timestamps span ≤ 6 h **or** amounts within ±15% of the mean); **(D)** batch-funded: ≥ 2 such wallets funded within 60 s. **Service funders are excluded:** labelled CEX/exchange funders, launchpad fee accounts, and any hub that funded ≥ 1,000 wallets in 24 h. |
| **fresh** | `freshAtEntry`: wallet age at first acquisition < 24 h, OR (age < 7 d AND 0 prior distinct tokens). Age = time since first inbound native funding. Frozen at entry. |
| **phishing** (P1) | Entire balance arrived by transfer from a **spray sender**: ≥ 5 recipients within 10 min, amounts within ±15%, sender not dev_team or insider. |
| **whale** | max(current position USD, cumulative buy USD) ≥ $10,000. Sticky. |
| **top_holder** | Eligible rank ≤ 10. |
| **transfer_in** | Any inbound token transfer into the current position. |

**Chips (all are current holding share of D unless noted):**

| Chip | Formula | Default red > | Tooltip extras |
|---|---|---|---|
| **Top10** | Σ top-10 eligible balances / D. Ties broken by earliest acquisition, then address. | 30% | Top20 / Top100 cumulative |
| **Dev** | balance(dev) / D, plus status | 30% | Status: `hold` (≥ 1 token, no sells) / `sold_part` / `sold_all` (balance < 1 token) / `bought_more`; dev_team % |
| **Insiders** | Σ insider balances / D | 5% | insider volume share = insider buys / all eligible buys; cluster count |
| **Snipers** | Σ sniper balances / D | 10% | `sniperCount` (≤ 70); early-buyers still holding % |
| **Bundlers** | Σ bundler balances / D | 10% | **launch bundle %** = non-dev creation-bundle buys / D; bundler volume share |
| **Fresh** | Σ fresh balances / D | 10% | count ratio = fresh holders / holderCount |
| **Phishing** (P1) | Σ phishing balances / D | 5% | spray sender address |
| **Rug** | `rugRisk` (§8.6.2) | 30% | top contributing factors |
| **Bot traders** (audit card only) | bot-tagged traders / analysed traders (first 2,000 traders) | 60% | labelled "% of analysed traders", **never** "% of supply" |

**Early-buyer status** (first 70; first match wins, in this order):
1. `sold_all`: balance < 1% of peak
2. `transferred`: outbound transfer > 0
3. `sold_part`: sold > 0
4. `bought_more`: later buys and no sells
5. `holding`

**Creator rug history** (`creatorRugRatio`; dev chip tooltip, dev card, filter `devRugRatio` **(contract change)**):
- Scope: the creator's launches older than 24 h, newest 100.
- A launch counts as **rugged** if:
  - it reached a pool and now has < $4k liquidity, **or**
  - dev_team removed ≥ 50% of LP (EVM, P1), **or**
  - dev_team sold ≥ 80% of its peak holding within 30 min of open.
- Launches that never graduated and saw no dump count as "failed", not rugged.
- Value = rugged / N. Null when N < 3.

**Recompute cadence:**

| What | When |
|---|---|
| Holding-share chips | Every block batch that touches the token. ≤ 2 s for tokens < 24 h old, ≤ 60 s otherwise. |
| Labels | At the triggering event, then frozen |
| Insider clusters | Every 5 min while the token is < 24 h old, hourly after |
| Bot-trader cohort | Every 5 min while < 24 h old, hourly after |

### 8.4 Wallet classification (platform-wide) [P0 unless noted]

#### 8.4.1 Global tags

| Tag | Rule (rolling windows, recomputed daily at 00:05 sim-UTC, hysteresis noted) |
|---|---|
| **smart** | Over a 30 d window, all of: `tokenNum ≥ 10`, `realizedUsd ≥ $5,000`, `pnl = realized/realizedCost ≥ 0.30`, (`winRate ≥ 0.45` OR `lt50Share < 0.15`), trades/day ≤ 100, not a launcher (`createdTokens ≤ tokenNum/2`), largest single token ≤ 60% of positive realised, not a corroborated wash trader. Dropped only after 2 consecutive failing days. `tagRank` = rank by realised USD. |
| **launchpad_smart** (P1) | The `smart` rule restricted to curve-phase trades, with ≥ 10 such tokens. |
| **kol** | Sim persona with a public label and ≥ 5,000 followers. Demoted below 4,000 (sim follower counts drift). Real data later: verified X binding required. |
| **top_followed** (P1) | ≥ 10,000 followers, or ≥ 500 Trenchscope users following the wallet. |
| **sniper** (global) | Token-scoped sniper on ≥ 50% of ≥ 5 distinct tokens traded in 30 d. Fallback: ≥ 80% of entries below $100k MC. |
| **bundler** / **insider** (global) | Token-scoped label on ≥ 3 distinct tokens within 30 d. |
| **whale** (global badge) | 30 d average buy ≥ $10,000 with ≥ 5 buys. |
| **fresh** (global) | Wallet age < 7 d AND ≤ 2 lifetime tokens. Expires automatically. |
| **bot** | ≥ 2,000 trades in 7 d, OR > 100 trades/day, OR flip rate ≥ 30% (sell within 5 s of buy, needs ≥ 10 round trips). |
| **sandwich** | ≥ 3 front-run + back-run pairs around a victim in the same block within 7 d. |
| **wash_trader** (P1) | ≥ 30% of 7 d volume is round trips ≤ 60 s with \|PnL\| < 1% of size, or circular trades within a funding cluster. It is **refuted** (hidden) when conviction share ≥ 0.5 (§8.5). |
| **dev** (global) | Created ≥ 1 token. Considered a "launcher" when created > 0.5 × max(1, tokenNum). |

**Tag severity** is used by verdicts and colour.
- veto: `sandwich`, corroborated `wash_trader`
- warn: `kol, top_followed, sniper, insider, bundler, dev, fresh`
- good: `smart`
- neutral: `whale`, `bot` provenance
- **No single tag may change a verdict on its own.**

#### 8.4.2 Wallet metrics

| Metric | Definition |
|---|---|
| `perDay` | (buys + sells) / days in the period |
| `avgBuyUsd` | boughtCost / buys |
| `copyWindowS` | Median over tokens of (first sell after first buy − first buy). Needs ≥ 3 round trips. |
| `entryMc p25/p50/p75` | Quantiles of `priceUsd × totalSupply` across buy rows, ignoring zeros |
| `entryUnder100k` | Share of buy entries below $100k MC |
| `flipRate` | Sells within 5 s of the preceding buy / buy→sell pairs (≥ 10 pairs) |
| `feeDrag` | fees / realised. Bands: < 0.95 "fees ate X%", < 1 "almost all", ≥ 1 "more than earned" |
| `posture24h` | Distributing if sells > 2× buys; Accumulating if buys > 2× sells; otherwise Rotating; Quiet if none |
| `convictionShare` | Positive realised gains from positions where realised ≥ cost or realised/sells ≥ $1k, divided by all positive realised. Needs ≥ 3 gainers. |
| `pcr` | Largest winning total / Σ positive totals. Trusted only with ≥ 3 winners and ≥ 8 positions. |
| `holdToZero` | Positions with total PnL ≤ −90% and no sells |
| `lt50Share`, `smallLossShare` | Bucket counts / max(1, tokenNum) |

#### 8.4.3 Style title (20-cell grid) [P1]
- **Frequency:** L1 < 1/day · L2 1–<10 · L3 10–50 · L4 > 50.
- **P&L level** (first match wins):
  - **P5**: pnl > 0.5 AND tokenNum ≥ 5 AND (winRate ≥ 0.5 OR lt50 < 0.15)
  - **P4**: pnl > 0.1
  - **P1**: lt50 ≥ 0.40 AND realised < 0
  - **P3**: \|pnl\| ≤ 0.10
  - **P2**: realised < 0 OR pnl < 0
  - otherwise P3
- **Titles** (our wording):

| | P5 | P4 | P3 | P2 | P1 |
|---|---|---|---|---|---|
| L4 | Print Machine | Grinder | Treadmill | Gas Burner | Self-Destruct |
| L3 | Harvester | Active Winner | Spinner | Fee Donor | Bleeding Out |
| L2 | Old Hunter | Steady Hand | Idler | Retail Loser | Underwater |
| L1 | One-Shot | Zen Winner | Watcher | Toe-Dipper | Wiped Out |

- No title when there are no trades or tokenNum < 5.
- **Speed subtitle** (median copy window): < 60 s Flash · < 1 d Intraday · < 7 d Swing · otherwise Long hold.
- **Badges:**
  - Lottery: winRate < 0.35 & gt5 ≥ 1
  - Sniper: median entry < $100k
  - Scales in / Scales out: ≥ 3 buys / sells per token
  - Concentrated: top-3 ≥ 70% of buy USD with ≥ 5 tokens
  - Hoarding / Distributing: buy/sell ≥ 3 / sell/buy ≥ 3
  - Fixed hours: ≥ 70% of trades in one 6 h window, ≥ 20 rows over ≥ 12 h
  - Whale: avgBuy ≥ $10k
  - Launcher
  - New wallet: < 30 d
  - Low sample: < 20 trades
  - Wash flag
- Badges expand on click into a popover with the triggering number. Never on hover-only.

#### 8.4.4 Hold-time and discipline [P1]
Built from closed positions only, with ≥ 30 closed.
- **Hold-split groups:** ≤ 60 s, ≤ 30 min, ≤ 6 h, > 6 h. Each shows n, share and ROI.
- **Discipline rules:**
  - **A. Holds losers:** ≥ 10 winners & ≥ 10 losers, median loser hold ≥ 2× winner hold.
  - **B. Sizes losers:** median loser ticket ≥ 1.5× winner ticket (ticket = boughtCost/buys).
  - **C. Bad adds:** ROI(≥ 3 buys) ≤ ROI(single buy) − 10 pp, with ≥ 10 positions in each group.
  - **D. Bag-holds:** ≥ 3 open positions at ≤ −50% with cost ≥ $50.

#### 8.4.5 Wallet risk check [P0]
- `tokensTraded` (window).
- Each count is shown with its ratio to `tokensTraded`:
  - `honeypotTokens`
  - `receivedOnlyTokens` (held, 0 buys, transfer-in > 0)
  - `soldMoreThanBought`
  - `fastRoundTrips` (sell − buy ≤ 5 s)
- **Red thresholds:** honeypot > 10%, receivedOnly > 30%, soldMoreThanBought > 10%, fast > 30%.

#### 8.4.6 Portrait (3 lines) [P1]
- **Recap template:** "{You/They} {made/lost} {$} over {period}, {strength}, but {problem}."
- **Strength** (first match): clean stops (lt50 < 0.05), win rate ≥ 60%, payoff ≥ 2:1.
- **Problem order (own wallet):** heavy loss (lt50 ≥ 0.35), net loss, hold-split, B, A, C, D, fee drag ≥ 0.30, decline vs. the previous window (ROI < 0.75× the previous), small losses ≥ 0.35, launcher.
- The **next-step sentence** comes from a fixed table per problem × voice. It is never free text.
- Shows "No read" when tokenNum < 5.

### 8.5 Copy scores, gates and backtest [P1]
- **Track score** = `100·(0.34·tail + 0.28·upside + 0.16·roi + 0.10·win + 0.12·size)`
  - `tail = 1 − lt50/tn`
  - `upside = (gt5 + x2_5 + x0_2)/tn` (excluding unsold)
  - `roi = clamp((roi + 0.05)/0.35)`
  - `win = clamp(winRate/0.5)`
  - `size = clamp((tn − 20)/300)`
- **Copy score** = `100·(0.22·entry + 0.22·profit + 0.20·hold + 0.18·feasible + 0.18·edge)`
  - `entry = clamp(0.12 + (1 − entryUnder100k))`
  - `profit = clamp(avgTradeUsd/80)`
  - `hold = clamp((1 − flip·1.6)·clamp(avgHoldS/172800 + 0.15))`
  - `feasible = clamp(1 − trades/2500)`
  - `edge = clamp(1 − 0.6·entryUnder100k − 0.6·flip)`
- **Self-dealing discount:** launcher wallets get both scores × 0.45, and a Dev reputation is shown instead (§8.8).
- **Backtest** (defaults: latency 3 s, slippage 5%, gas $0.20):
  - `walletPct = clamp(realized/boughtCost, −0.9, 3)`
  - `drift = latency·0.015·(0.3 + 0.7·entryUnder100k)`
  - `copyPct = walletPct − drift − 2·slippage − gas/avgBuy`
  - `copy7d = realized·copyPct/walletPct`
- **Gates:**
  - **G1 Authenticity** fails on any of:
    - corroborated wash trading
    - launcher
    - tokenNum < 5 (⚪)
    - one-coin record (realised > 0, ≤ 1 coin ≥ 2×, ≥ 8 tokens, losers > 50%)
    - pcr ≥ 0.75 (trusted)
  - **G2 Currency** fails when form is broken/never-worked or 7 d and 30 d ROI are both ≤ 0.
  - **G3 Reachability** fails on any of:
    - copyWindow < 3× latency
    - median entry < $30k
    - sandwich tag
    - ≥ 10k followers on sub-$1M caps
    - feeDrag ≥ 0.25
    - avgBuy < $50
    - > 100 trades/day
  - **G4 Survivability** fails on any of: ≥ 2 honeypots, lt50 ≥ 0.35, ≥ 3 hold-to-zero.
- **Form** (7 d ROI r7 vs all-time ra):
  - Never worked: ra ≤ 0 & r7 ≤ 0
  - Broken down: ra > 0.1 & r7 ≤ −0.1
  - Heating up: r7 > max(0.1, ra)
  - Steady: \|r7 − ra\| ≤ 0.15
  - Cooling: r7 < ra − 0.15
- **Verdict order:**
  1. NO READ
  2. DO NOT COPY (with cause)
  3. HOLD OFF (G1 unmeasurable)
  4. WATCH, DON'T COPY (G3 ✗, or G3 + G4 ✗)
  5. COPY THE BUYS, NOT THE EXITS (G4 ✗)
  6. COPYABLE AT SMALL SIZE (all ✅; size cap = 0.5 × avgBuy)
- ⚪ never renders as ✅.

### 8.6 Safety score and rug risk [P0]

#### 8.6.1 Safety score (0–100)
Adapted from R§5.12(a). The score has three sections, each starting at 100. Within one field, apply only the **single worst** matching tier, then clamp each section to 0–100.

**Weights:** contract 0.45, holders 0.35, price 0.20. If the price section has no data, renormalise to 0.5625 / 0.4375.

**CONTRACT deductions**

| Condition | Effect |
|---|---|
| Mint not renounced | −25 |
| Freeze not renounced | −20 |
| Honeypot | composite = 0 |
| Not open source | −15 |
| Open-source flag unknown | cap 79 |
| Owner not renounced | −8 |
| Blacklist function present | −20 |
| Max tax > 10% / > 5% | −25 / −10 |
| LP not burned or locked (migrated) | −12 |
| Liquidity < $10k / < $50k | −15 / −6 |
| Liquidity / initial < 0.5 | −10 |
| Creator launches ≥ 500 / ≥ 200 / ≥ 50 / ≥ 10 / ≥ 3 | −18 / −14 / −10 / −6 / −3 |
| Copycat > 0 | −6 |
| Candles < 8 / < 24 | −12 / −6 |

**HOLDERS deductions**

| Condition | Effect |
|---|---|
| Top10 > 50% / > 30% / > 20% | −25 / −14 / −6 |
| Holders < 200 / < 500 | −12 / −5 |
| Dev hold > 5% / > 2% | −20 / −10 |
| Bundlers > 30% / > 15% / > 5% | −20 / −10 / −4 |
| Snipers > 15% / > 5% | −15 / −6 |
| Insiders > 5% / > 1% | −12 / −5 |
| Phishing > 50% / > 20% / > 5% | −22 / −16 / −10 |
| Bot traders > 70% / > 50% | −12 / −6 |
| Fresh > 50% | −8 |

**PRICE deductions** (requires ≥ 8 candles at 15m; uses the last min(96, N) candles)

| Condition | Effect |
|---|---|
| Drawdown `1 − C[-1]/maxH` > 70% / > 50% / > 30% | −30 / −18 / −8 |
| Worst candle < −50% / < −30% | −14 / −7 |
| price/price24h < 0.5 | −10 |
| Volume ratio `mean(V[-20:])/mean(V[-40:-20])` < 0.20 (needs ≥ 40 candles) | −18 |

**Caps** (the lowest cap applies)

| Condition | Cap |
|---|---|
| rugRisk ≥ 0.50 | 59 |
| rugRisk 0.30–0.50 | 79 |
| Missing honeypot or open-source data | 79 |
| Unlocked LP on EVM | 79 |

**Bands:** ≥ 80 OK · 60–79 Conditions · 40–59 Caution · < 40 Avoid. The UI collapses these to three colours: green ≥ 70, amber 40–69, red < 40.

**Coverage** = checks executed ÷ (executed + skipped). Coverage is "sufficient" at ≥ 80%, "low" at ≥ 50%, and "insufficient" below that. It is shown alongside the score.

**Explain view:** every deduction is listed with its field, value and points.

#### 8.6.2 Rug risk `rugRisk` (0–1)
The existing filter key `rugRatio` maps to this value. Each sub-score is clamped to 0–1.

| Sub-score | Formula / rule |
|---|---|
| `s_creator` | `creatorRugRatio`. If null: 0.2 prior. If the dev has ≥ 20 launches with graduation rate < 5%: 0.6. |
| `s_team` | devTeamHold / 0.20 |
| `s_insider` | insiderHold / 0.15 |
| `s_bundler` | bundlerHold / 0.20 |
| `s_conc` | (top10 − 0.20) / 0.40 |
| `s_dump` | Share of dev_team's peak holding sold within 30 min of open |
| `s_lp` | 1 if migrated with LP not burned or locked, else 0 |
| `s_auth` | 1 if mint or freeze not renounced, or blacklist, else 0 |

`rugRisk = clamp01(0.22·s_creator + 0.15·s_team + 0.15·s_insider + 0.10·s_bundler + 0.10·s_conc + 0.18·s_dump + 0.05·s_lp + 0.05·s_auth)`

Hard overrides:
- Honeypot sets `rugRisk = 1`.
- Liquidity pulled (> 90%) sets `rugRisk = 1` and the token status to `rugged`.

**Bands:** < 0.1 Low · 0.1–0.3 Medium · > 0.3 High. A row is "quick disqualified" when rugRisk > 0.3, wash trading is flagged, or the token is a honeypot.

**Validation target:** AUC ≥ 0.80 against the simulator's hidden fate (`hard_rug` ∪ `slow_rug`) at token age 10 min (§8.13).

### 8.7 Token metrics [P0]
- **Market cap:** `marketCapUsd = priceUsd × circulatingSupply`. In the sim, circulating supply equals total supply minus burn.
- **Window stats** for `1m, 5m, 1h, 6h, 24h`: volume (buy and sell), swaps, buys, sells, unique makers (distinct wallets), net buy, and `priceAtWindowStart`.
- **Change:** `price/priceAtWindowStart − 1`. Shows `n/a` when the token is younger than the window.
- **ATH guard:** `athMarketCapUsd` is treated as unknown when ≤ 0, > 1e10, or > 50 × the current market cap.
- **Liquidity:**
  - `liquidityUsd` = 2 × one-side depth. This is the display convention.
  - `depthUsd` = min(base, quote) side value. Used for impact and gates.
- **`feesPaidNative`:** Σ (network + priority + tip) paid by all traders on the token. A proxy for organic activity.
- **`makers{window}`:** distinct traders in the window. **(contract change)**
- **Series endpoint (P1):** `GET /api/:chain/tokens/:address/series?metrics=holders,top10,top100,insider,bundler,bot,fresh,avgHoldingUsd&resolution=auto` returns `{series:{metric:[[tMs,value]]}}`. It is refreshed every 60 s and powers the chart overlays and audit sparklines.

### 8.8 Dev score [P1]
Adapted from R§5.12(c).

**Dump detection (per traded coin)**
- A coin counts as a DUMP when the dev's pull multiple is ≥ 1.5 **and** the dev's first sell came ≤ 30 s after open.
- `severity = clamp((mult − 1)/3) × clamp((120 − firstSellS)/120)`

**CONDUCT**
- `raw = max(0, 100 − 55·meanSeverity − clamp((ctoRate − 0.3)/0.7)·10) − factoryPen − opaquePen`
  - `factoryPen = 45·clamp((log10(max(20, onCurveCount)) − log10 20)/(log10 500 − log10 20))`
- Thin-record shrink applies when raw > 60: `60 + (raw − 60)·min(1, coins/5)·min(1, careerDays/30)`.

**POWER** = min(100, B1 + B2 + B3 + B4)

| Term | Value |
|---|---|
| B1 | `clamp((log10(min(peakMc, 5e10)) − 5)/4)·60` |
| B2 | 0 if no coin reached $1M, else `min(25, 11 + 5·log2(successes))` |
| B3 | 10 if the flagship coin is still alive |
| B4 | `10·(0.5·survival + 0.3·gradRate + 0.2·(1 − median drawdown))·min(1, sampled/5)` |

**TOTAL** = `CONDUCT + max(0, min(1, successes/3)·(POWER − 50)/50·15)`

**Gates** (first match)

| Condition | Tier | Caps |
|---|---|---|
| LP pull | systematic | CONDUCT ≤ 45, TOTAL ≤ 49 |
| < 5 traded coins with ≥ 2 dumps or a dumped flagship | systematic | same |
| < 5 traded coins otherwise | unproven | 65 / 74 |
| Dump rate > 75%, or flagship dumped | systematic | same |
| 0 dumps over ≥ 5 coins | none | — |
| Dump rate ≤ 30% | rare | no cap |
| Otherwise | often | CONDUCT −20, TOTAL ≤ 74 |

**Bands:** ≥ 75 Trusted · ≥ 50 Mixed · ≥ 30 Avoid · otherwise Stay away.

Self-snipe rate and launch-bundle % are **disclosed but never scored**.

### 8.9 Signals engine [P0]

#### 8.9.1 Kinds and triggers
These extend the existing `SignalKind`. Each signal record contains:

`{id, chain, kind, token, title, detail, marketCapAtTrigger, firstTriggerMcUsd, timesFired, timesFiredByKind, maxMultiple, wallets[], payload, createdAt}` **(contract change for new fields)**

State per token: `firstTriggerAt/Mc`, `lastTriggerAt[kind]`, `lastTriggerValue[kind]`, `armedLevels`.

Dedup key: `hash(chain|token|kind|bucket)`.

**Derived multiples:**
- `nowMultiple = mc/marketCapAtTrigger`
- `peakMultiple = athMcSinceTrigger/firstTriggerMc`, guarded

| Kind | Pri | Trigger | Cooldown / re-fire |
|---|---|---|---|
| `price_spike` | P0 | Δ5m ≥ 30% (MC < $1M) / ≥ 15% otherwise; or Δ1h ≥ 100% / ≥ 50%; or Δ1m ≥ 20% (MC < $300k). Also requires vol5m ≥ $5k, buys ≥ sells, and liquidity ≥ $5k. | 30 min; re-fire early at ≥ 1.5× the last trigger price |
| `ath` | P0 | Age ≥ 60 min or graduated; MC ≥ $100k; prior ATH sane; MC > 1.05× prior ATH, set after ≥ 60 min of consolidation, or ≥ 1.5× the last ATH signal | 60 min |
| `mcap_level` | P0 | Ladder: $50k, 100k, 300k, 500k, 1M, 3M, 5M, 10M, 30M, 50M, 100M, 300M, 1B. Crossed upward and held for one 1m close. A multi-level jump emits the highest level only. | Once per level. Re-arms after MC stays < 50% of the level for 24 h. |
| `smart_buy` | P0 | 30 min window: ≥ 2 distinct `smart` buyers, Σ ≥ $500, net > 0. Or a single smart full-open ≥ $1k. | 30 min. Re-fire at wallet-count steps [2, 3, 5, 8, 13, 21]. |
| `kol_buy` | P0 | KOL open/add ≥ $100. Buys within 5 min are coalesced. | Per (token, KOL) 6 h. Divergence flag when smart wallets are net selling. |
| `large_buy` | P0 | Single buy ≥ max(L, 2% of liquidity), with L = $2k / $5k / $10k / $25k for MC < $100k / < $1M / < $10M / ≥ $10M. Excludes bot, bundler, sniper and dev wallets. | 5 min, coalesced |
| `multi_buy` | P0 | ≥ 5 distinct non-bot buyers each ≥ $100 within 60 s. Wallets sharing a funder count as one. | 10 min. Re-fire at 2× buyers. |
| `multi_large_buy` | P1 | ≥ 3 wallets each meeting the `large_buy` bar within 10 min | 30 min |
| `bundler_sell` | P0 | Within 5 min: bundler sells ≥ 1% of supply, or ≥ max($1k, 1% of liquidity). Strong at ≥ 5%. | 10 min. Re-fire when the cumulative amount doubles. |
| `dev_sell` | P0 | Dev sells ≥ 20% of holding in one trade, or dev_team cumulative ≥ 50% | Per tranche |
| `migration` | P0 | Graduation event | Once |
| `cto` | P0 | Community takeover event | Once per token |
| `boost` (promo) | P0 | Promo agent purchase (ad / profile / boost / bar sub-type in payload) | Dedup by order id. Boosts coalesce over 5 min. |
| `kol_call` | P0 | Call by a sim KOL persona (§9.6) | One per caller per token per 24 h |
| `candle_spike` | P1 | 1m candle close: green, `V[-1]/mean(V[-21:-1]) ≥ 3`, volume ≥ $2k, ≥ 10 swaps, body ≥ 20% / 10% / 6% / 4% by MC tier | 15 min; re-fire at ≥ 1.3× |
| `smart_exit` | P1 | ≥ 3 smart wallets selling or full-closing within 30 min | 30 min |
| `live` | P1 | Sim live stream start | Once per session; 30 min gap |
| `fee_claim` | P1 | Creator claims fees ≥ $50 | Coalesce 10 min |

**Quality pre-filter** (on by default in the feed and in push alerts): hide signals for tokens where rugRisk > 0.3, wash trading is flagged, or the token is a honeypot.

**Severity:**
- `strong` when smart ≥ 3, rugRisk < 0.2, dev sold out, no wash trading, and liquidity > $50k.
- `notable` for a 1h change > 20% with smart ≥ 3.
- Otherwise `info`.

#### 8.9.2 Convergence (clusters) and strength
- A **cluster** forms when ≥ 3 distinct cohort wallets trade the same token in the same direction within 30 min. The panel lists clusters of ≥ 2 wallets.

| Strength | Condition |
|---|---|
| Weak | 1 KOL buy |
| Medium | 2–3 smart buys in the same direction, or 1 smart full-open |
| Strong | ≥ 3 smart wallets in the same direction within 30 min |
| Very strong | Strong cluster + full opens + a KOL joining |

- **Red flags:** smart full-close; KOL-only buying; KOLs buying while smart wallets sell; a single large buy with no follow-through within 10 min.
- **Position events** are normalised from trades: `open` (qty before = 0), `add`, `reduce`, `close` (qty after ≤ dust).

### 8.10 Heat score (Trending `hot` sort) [P0, simplified]
`heat = 100·(0.30·pct(swaps_w) + 0.25·pct(uniqueMakers_w) + 0.20·pct(volume_w) + 0.15·pct(volumeAccel) + 0.10·pct(visits_w))`

- `pct` is the percentile within the chain's candidate set.
- `volumeAccel = vol_w / (vol_24h·w/24h)`.
- `visits_w` counts our own debounced token-page views and searches. Before enough telemetry exists (P0), its weight goes to swaps.

**Curated "Hot list" [P2]:** gates and a composite score as in R§4.8, MIN_SCORE 60, at most 10, no padding.

### 8.11 Lifecycle stage and quality flag [P1]

| Stage | Rule |
|---|---|
| **Early** | age < 1 h, smart = 0, KOL = 0 |
| **Breakout** | smart ≥ 3 and rising, swaps1h > 3 × swaps24h/24, 1h change > 20% |
| **Distribution** | dev sold out, KOLs buying, smart count flat or falling over 1 h |
| **Decline** | 1h volume < 50% of the 6h average, holders falling, smart = 0 |

**Quality flag**
- **Pass:** smart ≥ 3, rugRisk < 0.2, not wash trading.
- **Skip:** rugRisk > 0.3, wash trading, or honeypot.
- **Watch:** anything else.

Shown as a dot next to the safety score.

### 8.12 PnL accounting [P0]
Spec: R§15. Conformance vectors: Appendix C.

- **AN-60 Cost basis.** Moving weighted-average cost per `(chain, wallet, token)`, with no lots. A full close (qty ≤ dust: < 1e−6 of the cycle maximum, or value < $0.01) books the residual to realised, increments `cycleId`, and starts a fresh average on the next buy. Money uses decimal arithmetic (`NUMERIC(38,18)`-equivalent); token amounts are integer base units.
- **AN-61 Fees.** Buy cost includes the platform fee, network fee, priority fee and tip. Sell proceeds are net of all of them. `boughtUsd`/`soldUsd` stay gross, and fees are tracked in separate fields. Failed-tx fees are a wallet-level "unattributed" cost: they count toward period PnL but are never attached to a token. Win/loss uses net figures.
- **AN-62 Transfers.** Rules apply in order:
  1. Internal (own wallets): carry basis, book no PnL.
  2. Exchange-funder withdrawal: basis = FMV at receipt.
  3. Other external: basis = FMV, tagged `transfer_in`.
  4. Airdrop or spam (never bought, FMV < $1, or ≥ 20 recipients): basis 0, hidden.

  Transfer-out removes basis at average cost. `transferPnl` is reported separately. `nonTradePosition` = more than 50% of the cycle quantity arrived by external transfer; these positions are excluded from win rate, buckets and leaderboards.
- **AN-63 Oversell.** Backfill first. If quantity is still missing, add an implicit inflow at the sell price so the excess books 0 PnL, and flag `basisIncomplete`.
- **AN-64 Valuation.**
  - Mark price comes from the deepest live pool (last trade < 15 min old). Fallbacks, in order: liquidity-weighted median, last trade (marked stale), curve price.
  - Rugged (depth < $100, or > 90% of LP pulled) → mark = 0.
  - Honeypot with no sells by anyone in 24 h → value 0.
  - Dust < $1 is hidden by default.
  - Exit value (simulated full sale) is shown in a tooltip.
- **AN-65 Identities.** These must hold to within 1e−9 USD:
  - `A = B_net − C_R − transferOutCost`
  - `U = V − A`
  - `T = R + U + transferPnl`
  - `T = S_net + V + transferOutValue − B_net`
- **AN-66 Ratios.**
  - `totalPnlPct = T/B_net`
  - `realizedPnlPct = R/C_R`
  - `unrealizedPnlPct = U/A` (null when no balance)
  - Multiple = 1 + totalPnlPct
- **AN-67 Periods.** Rolling windows: 1D = 24 h, 7D = 168 h, 30D = 720 h, plus All. Realised PnL is attributed at sell time.
  - `roi = realized/realizedCost`, the headline figure for every period.
  - `capitalRoi = realized/boughtCost`, labelled.
  - `unrealizedNow` is a snapshot.
  - Win rate, fees, buckets and tokenNum are available for **every** period.
- **AN-68 Win rate.** Per token per period, over tokens with ≥ 1 in-period sell, excluding non-trade, airdrop and basis-incomplete tokens. WIN when the summed in-period realised > 0; exactly 0 counts as a non-win. Shown as `n/N`. Renders "—" when fewer than 5 tokens settled. Secondary figures: `winRateSells`, `tokensInProfit`.
- **AN-69 Buckets.** Use `r = tokenRealized/tokenRealizedCost`:
  - `>5` → gt5
  - `(2,5]`
  - `[0,2]`
  - `[−0.5,0)`
  - `< −0.5`
  - plus a separate **Unsold** count
- **AN-70 Daily calendar.** Day value = Σ net realised of sells on that local date, plus that day's unattributed fees. Timezone is the viewer's IANA zone (switchable to UTC). Built from hourly UTC rollups, or 15-min rollups for :30/:45 offsets, so DST days work.
- **AN-71 Multi-wallet.** Merged row: `avg = ΣA/Σqty`. Group realised = Σ per-wallet realised (per-wallet basis is the default). Internal transfers are removed. Pooled-basis view is P2.
- **AN-72 Explain (P1).** The position drawer has an "Explain" tab showing the ledger replay: each event with qty Δ, cost Δ, average after and realised. A "Report wrong PnL" action attaches that replay.

### 8.13 Validation against ground truth [P0]
- **AN-80** A nightly CI job runs fixed seeds for 6 sim hours on each scenario (SIM-27) and reports, against hidden truth:
  - precision and recall of the sniper, bundler, insider, dev_team, fresh and smart labels
  - rugRisk AUC
  - safety-score separation (median score of rugs vs. organic tokens)
  - signal precision: share of `smart_buy` signals followed by +50% within 1 h, compared with the base rate

  Any regression of more than 5 points fails the build.
- **AN-81** Unit tests cover:
  - every formula in this section using hand-computed fixtures, including **Appendix D TV-H1**
  - PnL vectors TV1–TV10


---

## 9. Tracking, copy trading and alerts

### 9.1 Follows (wallet tracking) [P0]
- **TK-01** Users can follow a wallet from four places: its wallet page, any feed row, holder and trader rows, and the leaderboard.
  - Following record: `FollowedWallet{chain, address, remark (≤32), emoji (P1), group (≤20 groups, P1), notify: bool, sound (P1), color (P1), starred (P1), createdAt}`.
- **TK-02** Limits: 300 follows per chain, extendable later.
- **TK-03** Remarks are private to the user. Wherever that wallet appears in the app (feeds, holders, chart markers), the remark replaces its label. Public aggregates (`followCount`, `remarkCount`, P1) appear on the wallet page.
- **TK-04 (P1)** Bulk import accepts a pasted list (`[addr1, addr2]`, newline- or comma-separated). Addresses are de-duplicated, validated per chain, and capped at 2,000. Export produces JSON `[{address, remark, emoji, group}]`. Import upserts remarks by address.
- **TK-05** Per-wallet bell: turning `notify` off silences that wallet's alerts without unfollowing it.

### 9.2 Live feeds [P0]
- Channels: `feed:<chain>:smart|kol|follow|all`, sent as batches of `FeedItem` about every 500 ms.
- `FeedItem` fields:
  - `{id, chain, ts, side, positionEvent: open|add|reduce|close, token{ref, launchpad, ageS}, amountUsd, amountNative, priceUsd, mcAtTrade, wallet{address, label, remark?, tags[], tagRank?}, txHash}`
  - `positionEvent` is a **(contract change)**.
- The client computes `priceNowMultiple` locally from the token ticker.
- Client-side noise rules:
  - collapse consecutive same-wallet, same-token, same-side rows within 20 s into one row marked "×N"
  - hide native and stablecoin base tokens
  - show starred wallets first (P1)

### 9.3 Watchlist [P0]
`WatchlistItem{chain, address, groupIds[], note? (P1), alias? (P1), addedAt}` and `WatchlistGroup{id, name, rank}`. Limits: 20 groups and 500 items. CRUD endpoints are listed in Appendix E.

### 9.4 Alert rules [P0]
All rules share these fields: `{id, enabled, channels: ('in_app'|'web_push'|'email'|'webhook')[], sound?, note?, createdAt, lastTriggeredAt, triggerCount, expiresAt? (default +30 d for price)}`. Price and wallet alerts are P0. Signal subscriptions are P0 (in-app only). Web push is P1. Email and webhook are P2.

| Type | Fields | Evaluation |
|---|---|---|
| **Price / MC alert** | `{chain, token, metric: price\|mcap, condition: above\|below\|pct_up\|pct_down, target? , pct?, baseValue (snapshot), repeat: once\|every, cooldownSec (default 300)}` | Checked on every tick. `above` fires when `prev < target ≤ curr`, `below` when `prev > target ≥ curr`, `pct_*` against `baseValue`. In `once` mode the rule moves to the triggered state. In `every` mode it re-arms after the cooldown, and only once the value has moved back across the target by more than 0.5% (hysteresis). If the condition is already true when the user creates the rule, show a confirm prompt rather than firing. Limits: 100 per user, 20 per token. |
| **Holding alert** | `{chain, enabled, thresholdPct (default +20%), basis: '5m_change'\|'vs_cost', cooldownMin (default 60), minPositionUsd (10)}` | Applies to every held token on that chain. It fires only if the balance is still above 0. |
| **Wallet alert** | Per followed wallet: `{events: buy\|sell\|add_liq\|remove_liq\|transfer_in\|transfer_out\|launch, minUsd, maxUsd, positionFilter: all\|open_close_only, tokenMcMin/Max}` | Driven by the follow feed. Events for the same wallet, token and side within 30 s coalesce into one alert carrying the summed USD. |
| **Signal subscription** | `{name, chain, groups:[{kinds[], mcMin, mcMax, triggerMcMin, triggerMcMax, feesMin, feesMax, minAgeMin, maxAgeMin, minLiquidity, maxTop10, minHolders, minSmart, launchpads[], excludeRisk: bool}], quietHours?, maxPerHour (30)}` | Groups are OR'd together; the fields inside a group are AND'd. Matching uses an inverted index on `(chain, kind)`. Signals for the same token within 60 s merge into one notification. |
| **Order / automation events** | system rules, always on | Covers fills, failures, auto-pauses, expiries, and gate blocks. |

### 9.5 Notification centre and delivery [P0]
- `AppNotification{id (ULID), category: signal|wallet|price|holding|order|copytrade|automation|system, sourceType, sourceId, chain?, token?, wallet?, title, body, severity: info|notable|strong|critical, payload, dedupKey, groupKey, createdAt, readAt?, archivedAt?}`.
- Delivery:
  - **In-app toast**, for price alerts, fills and failures. The large card is 360 px wide with logo, target and current value, a direction colour, and a click-through. It auto-dismisses after 15 s, pauses on hover, and stacks up to 3.
  - **Inbox** entry.
  - **Web push** via a service worker with VAPID (P1).
  - **Email digest** (P2).
  - **Signed webhook**, HMAC-SHA256 header `X-Trenchscope-Signature`, retried 3× with backoff of 5 s, 30 s and 2 min (P2).
- Rate limits per user per channel: in-app 60/min, web push 20/min, webhook 120/min, email 10/h. When a limit overflows, notifications switch to a 5-minute digest. Any rule that exceeds 200 hits per hour is auto-paused and the user is notified.
- **Quiet hours** suppress push and email but still write to the inbox.
- **Sounds (P1):** a different sound per category and per followed wallet, with a master mute in the footer. Sounds only play once the user has interacted with the page, to respect browser autoplay rules.

### 9.6 KOL calls and call-outs
- **(P0)** Simulated KOL personas post **calls**: token, price and MC at call, and a short thesis drawn from templates. Each call emits a `kol_call` signal and a chart avatar marker. The caller's card shows calls over 7 and 30 days, average multiple, best multiple, and hit-2× rate (hit = the multiple reaches ≥ 2× within 7 days). When the caller sold more than 50% of the position within 60 minutes of calling, the card shows a "**Sold after calling**" warning.
- **(P2)** User call-outs, as specified in §6.23.

### 9.7 Bot and extension features folded into the web app

| Typical bot/extension feature | Trenchscope web equivalent | Pri |
|---|---|---|
| Paste CA → trade card / auto-buy | Paste anywhere → Quick Trade card (SH-06). Auto-buy on paste is off by default and gated by Settings plus a safety gate. | P0 |
| Wallet alerts in Telegram | In-app inbox and toasts; web push | P0 / P1 |
| Group smart-money bot | Monitor page with convergence; shareable read-only Monitor link (P2) | P0 |
| Limit/TP/SL via bot commands | Order panel and the Orders page | P0 |
| Quick-buy buttons injected into X / screeners (extension) | Floating **Instant Trade** panel (draggable; buy and sell presets for the focused token) and the social pulse panel with ⚡ chips next to detected contract addresses | P0 / P1 |
| X tracker with sounds | Synthetic social pulse (SIM-25) with keyword rules (colour + sound) | P1 |
| Multi-chart overlay extensions | Multichart workspace (2×2 grid, sync crosshair) | P2 |
| Dev-record badges (third-party extension) | Native dev record chip on cards (TR card) | P0 |
| Starred/coloured wallets, de-duplicated tracker (extension) | Native (§9.2) | P1 |

---

## 10. Settings

`UserSettings` is stored server-side and mirrored to localStorage for instant boot. Settings changed on one device propagate to the others over the `user` channel (`settings` event; **contract change**).

| Section | Fields | Pri |
|---|---|---|
| **Account** | username, password change, passkeys (P1), sessions/devices list with revoke (P1), log out everywhere, delete account (P1), **reset paper account** (P1) | P0 |
| **Trading** | 3 preset slots per chain (TE-20/21). Default slot. Confirm-above threshold per chain. Safety gate minimum (default 40). Auto-buy on paste (default off). Default exit plan template (P1). | P0 |
| **Quick amounts** | 4 buy amounts per chain and 4 sell percentages; per-column quick-buy amounts for Trenches | P0 |
| **Display** | Theme (Dark/Light/System); density (Focus/Standard/Pro); number style (compact on/off; subscript prices on/off); default currency (USD/native); timezone (auto/UTC/IANA); 24 h clock; avatar shape; progress ring; chip set on cards; reduced motion (auto from OS / on / off); colour-blind palette (P1); chain colours (P1) | P0 |
| **Risk thresholds** | Card chip thresholds (TR-30) | P0 |
| **Hotkeys** | Enable trading hotkeys (default **off**); mode A/B; rebind all keys; cheat sheet (`?`) | P0 (rebind P1) |
| **Notifications** | Per-category × channel matrix; quiet hours; sounds; holding alert per chain | P0 (push P1) |
| **Blacklist** | Hidden tokens, blacklisted devs, keywords; import/export (P1) | P0 |
| **Automation consent** | List of active consents with caps and expiry, each revocable | P0 |
| **Language** | English (P0); 简体中文 (P1) | P0 |
| **Privacy** | Hide my wallet labels on public share cards; opt out of "most followed" counts (P1) | P1 |
| **About** | Version, simulator seed/scenario (read-only), "Simulated market" disclosure, terms | P0 |

---

## 11. Non-functional requirements

### 11.1 Performance and latency SLOs

| Path | Target |
|---|---|
| Sim trade event → server analytics update (chips, windows) | ≤ 50 ms p50 / 200 ms p99 |
| Server push → client DOM (WS) | ≤ 150 ms p95 |
| Trenches snapshot cadence | 1 s; P1 deltas ≤ 250 ms |
| Token page `trades` batches | ~250 ms |
| Quote API | ≤ 50 ms p95 |
| Swap submit → receipt (sim, excluding simulated landing delay) | ≤ 100 ms p95 |
| REST list endpoints | ≤ 150 ms p95 at 100 rows |
| First contentful paint (cold, 4G) | ≤ 2.0 s; JS initial bundle ≤ 250 KB gz (route-split) |
| Trenches scroll / stream | 60 fps; ≤ 16 ms per frame p95; ≤ 1 layout reflow per animation frame |
| Server capacity (single node) | 2,000 concurrent WS clients, 200 trades/s sim throughput, ≤ 1.5 GB RSS |

### 11.2 Realtime protocol (WebSocket `/ws`) [P0]
- **One socket per browser tab** in P0. P1 shares one socket per browser through a SharedWorker or BroadcastChannel leader election, which also keeps heartbeats alive in background tabs.
- **Client → server:** `{op:'auth', token}`, `{op:'sub', id, channel, params}`, `{op:'unsub', id}`, `{op:'ping', t}`.
- **Server → client:** `{op:'ack', id}`, `{op:'data', channel, type, payload, seq?}`, `{op:'pong', t, serverT}`, `{op:'error', id?, code, message}`, `{op:'auth', ok}`.
  - These match the existing `WsClientMessage`/`WsServerMessage`. `seq` and `serverT` are **contract changes**.
- **Channels:** as in API.md (`market`, `trenches:<chain>`, `trending:<chain>`, `newpairs:<chain>`, `token:<chain>:<address>`, `feed:<chain>:<kind>`, `signals:<chain>`, `wallet:<chain>:<address>`, `user`). Additions:
  - `tickers:<chain>` (coalesced ≤ 1/s price ticks for a list of addresses, max 200; P1)
  - `convergence:<chain>` (P0)
  - `inflow:<chain>:<cohort>:<window>` (P1)
  - `status` (landing telemetry, P1)
- **Liveness:** the client pings every 15 s. The server closes the socket after 45 s of silence. The client reconnects with exponential backoff (0.5 s → 30 s with jitter), re-authenticates, and resubscribes to everything, which yields a fresh snapshot per channel.
- **Ordering (P1):** a per-subscription monotonic `seq`. On a gap the client re-subscribes with `sinceSeq`. The server replays from a 60 s ring buffer or sends a full snapshot.
- **List deltas (P1):** `{type:'list', seq, len, ops:[{i, id, row?}]}`. The client applies ops to its ordered id array; a row-less op reuses the cached row. An empty ops list with an unchanged length acts as a heartbeat.
- **Backpressure:** each connection has a send-queue cap of 2 MB. On overflow the server drops coalescible deltas for the slow subscription and marks it stale (the next snapshot repairs it). Order, fill and balance events are never dropped.
- **Caps:** at most 300 subscriptions per socket and 200 addresses per ticker subscription.
- **Fan-out:** the hub computes each distinct `(channel, paramsHash)` once per cadence. Identical filter sets across users share one computation.
- **Visibility:** the client unsubscribes from rows that scroll offscreen (IntersectionObserver, 5 s grace). The header token stays subscribed.

### 11.3 REST conventions [P0]
- JSON everywhere. Errors use non-2xx statuses with the body `{error, code?}`. Limits above the maximum are clamped; zero or non-numeric limits return 400 (API.md).
- Object filters travel as JSON-encoded query strings. Lists use opaque cursors (`before` ms or a cursor token) and never offsets, so they stay stable under inserts.
- Freshness headers per resource: token detail 1 s, counts 5 s, series 60 s.
- Every endpoint is rate-limited per account and per IP (§11.8).

### 11.4 Number, time and address formatting [P0]
All formatting lives in `packages/shared/src/format.ts` and is covered by unit tests. Numbers use **tabular numerals** everywhere (`font-variant-numeric: tabular-nums`).

**Price (`formatPrice`, USD or native).** Branches are evaluated in order:

| Range | Rule | Examples |
|---|---|---|
| null / NaN / ≤ 0 | `—` (0 → `$0`) | |
| p ≥ 1,000,000 | compact, 2 dp: `$1.23M` | |
| 1 ≤ p < 1,000,000 | 2 decimals with thousands separators | `$185.20`, `$12,345.67` |
| 0.0001 ≤ p < 1 | 4 significant digits, trailing zeros trimmed | `$0.5123`, `$0.01234`, `$0.00019` |
| p < 0.0001 | **subscript-zero**: `0.0` + subscript(z) + 4 significant digits, trailing zeros trimmed. z = number of zeros between the decimal point and the first significant digit. | `0.000003518` → `$0.0₅3518`; `0.00000041` → `$0.0₆41` |

- Subscript digits use Unicode `₀₁₂₃₄₅₆₇₈₉`. z ≥ 10 uses multi-digit subscripts (`₁₂`).
- The element carries `aria-label` with the plain decimal ("0.000003518 dollars") and a `title` attribute with the full value.
- A user setting can turn subscript off, falling back to scientific notation `3.518e-6`.

**USD amounts (`formatUsd`, market cap, volume, liquidity, value).**

| Range | Rule | Examples |
|---|---|---|
| \|v\| ≥ 1e9 | 2 dp + B | `$1.23B` |
| \|v\| ≥ 1e6 | 2 dp + M | `$255.83M` |
| \|v\| ≥ 1e3 | 1 dp + K | `$3.9K`, `$131.4K` |
| \|v\| ≥ 1 | ≤ 4 significant digits, trailing zeros trimmed | `$791.9`, `$47.36`, `$307` |
| 0 < \|v\| < 1 | 2 dp | `$0.45` |
| 0 < \|v\| < 0.01 | `<$0.01` | |

- Compact mode can be turned off in Settings; full values then use thousands separators.

**Signed PnL.** An explicit `+`, an ASCII `-` (with an aria-label "minus"), and colour from the sign. Format: `+$30.27` · `-$0.45 (-99.71%)`. Colour is never the only cue (§11.7).

**Percent (`formatPct`).**
- Table cells: 1 dp. Headers and dialogs: 2 dp. A trailing `.0` is trimmed.
- \|v\| ≥ 1,000% → compact `+1.2K%`.
- Change fields always show a sign.
- A null value renders `—`. An "n/a by rule" value renders `n/a`.

**Multiples.** `2.13×` below 10×, `24×` from 10×, `1.2K×` from 1,000×.

**Native amounts.** ≥ 1 → 2–4 dp (`12.34 SOL`). < 1 → 4 significant digits (`0.00251`). Units come from the chain's `nativeSymbol`; icon variants use `◎`, `BNB`, `Ξ`.

**Token amounts.** Compact K/M/B with 2 dp (`793.10M`). Exact values appear in the tooltip.

**Counts.** Thousands separators (`1,202`). Compact from 100K (`131.4K`).

**Age / relative time.** < 60 s `Ns` · < 60 m `Nm` · < 24 h `Nh` · < 365 d `Nd` · otherwise `Ny`. Ages under 60 s are shown in `--up`. Relative times read `2m ago`. Absolute times appear in tooltips in the viewer's timezone (`YYYY-MM-DD HH:mm:ss`).

**Durations.** `4m 12s`, `3.2h`, `5.1d`.

**Addresses / hashes.** First 4 + `…` + last 4 (`EHcb…pump`). EVM addresses are shown checksum-cased with the `0x` prefix counted outside the first 4. Full value on hover. Every display has a copy button.

**Symbols.** Truncated at 12 characters with an ellipsis. Names truncated at 24.

**Unknown vs zero.** `null` → `—`; real zero → `0` / `0%`. Never coerce.

### 11.5 Theme and design tokens [P0]
- **Dark-first.** The light theme is a full peer (P0), and System follows `prefers-color-scheme`.
- Tokens are CSS custom properties holding RGB triplets (`apps/web/src/index.css`): `--bg, --panel, --panel-2, --panel-3, --line, --line-strong, --fg, --muted, --faint, --accent (brand: flare amber), --accent-fg, --up, --down, --warn, --info`, plus tag tokens `--smart, --kol, --dev, --sniper, --insider, --bundler, --whale, --fresh, --bot`. Each has a dark and a light value.

| Token | Dark | Light |
|---|---|---|
| bg / panel / panel-2 / panel-3 | 10 12 16 / 17 20 26 / 23 27 34 / 31 36 45 | 244 245 248 / 255 255 255 / 247 248 250 / 236 238 243 |
| fg / muted / faint | 230 233 240 / 140 148 163 / 92 99 114 | 20 23 31 / 96 104 120 / 140 147 161 |
| accent | 255 181 71 | 217 125 0 |
| up / down | 34 214 135 / 255 84 104 | 0 148 88 / 222 44 70 |

- **Type.** Inter (or a system UI stack) for text with tabular numerals; JetBrains Mono (or similar) for addresses and hashes. Scale: 11 / 12 (body in dense tables) / 13 / 14 / 16 / 20 / 28 / 32. Weights 400 / 500 / 600.
- **Shape.** Radius 6 px for controls and 10 px for cards. Spacing on a 4 px grid. Cards have no borders in dark mode and are separated by panel steps; light mode uses 1 px `--line` borders.
- **Motion.** 120–200 ms ease-out. Value flash 400 ms. No motion at all under `prefers-reduced-motion` or the user override.
- **Iconography.** Our own icon set (Lucide-style, MIT). No third-party brand marks except the chain logos used for identification.

### 11.6 Keyboard map [P0 navigation; trading hotkeys P0 behind opt-in]

| Key | Action |
|---|---|
| `/` | Focus search |
| `Ctrl/Cmd+K` | Command palette (P1) |
| `?` | Hotkey cheat sheet |
| `Esc` | Close popover, sheet or modal |
| `J` / `K` | Move selection down / up in lists |
| `H` / `L` | Previous / next Trenches column |
| `Enter` | Open selected |
| `P` | Pause / resume all live feeds |
| `G` then `T` / `R` / `M` / `S` / `P` / `W` | Go to Trenches / Trending / Monitor / Signals / Portfolio / Watchlist |
| `Alt+1..4` | Switch chain |
| `B` | Buy the selected or focused token with the active quick amount |
| `1`–`4` (token page) | Buy preset amount 1–4 |
| `Shift+1`–`4` | Sell 25 / 50 / 75 / 100% |
| `Shift+I` | Sell initials |
| `Alt+Q/W/E` | Switch preset slot 1 / 2 / 3 |
| `T` | Open exit-plan editor |
| `C` | Copy contract address |
| `X` / `V` (hover) | Social / website preview |
| `S` | Star (watchlist) |
| `M` | Mute alerts for 15 min |
| Trenches Mode A | Hover column + hold `Z` + `1–9` |
| Trenches Mode B | Hold `Space` + hold `Q/W/E` (column) + `1–9` |

- Trading hotkeys are **off by default**. They act only on the focused token and respect the confirm-above threshold.
- All keys can be rebound (P1). Hotkeys never fire while focus is in a text input.
- While a trading modifier is held, number watermarks appear on Trenches cards.

### 11.7 Accessibility [P0]
- WCAG 2.2 AA throughout. Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI glyphs) in both themes. CI runs axe and fails on critical issues.
- **Never colour alone.** Up and down values carry ▲/▼ and a sign. Risk chips carry an icon (✓ / ! / ?) as well as colour. The colour-blind palette (P1) swaps green/red for blue/orange.
- **Full keyboard operability** with a visible focus ring (2 px `--accent`). There is a skip-to-content link.
- **Virtualised lists** use `role="grid"` or `role="list"` with `aria-rowcount` and `aria-rowindex`.
- **Screen-reader live regions.**
  - A polite region announces fills, failures and alerts, throttled to one announcement every 2 s with merging.
  - Streaming lists do **not** announce each row. Instead an "N new tokens" summary is announced at most every 10 s. The user can enable or disable it.
- **Charts** offer a data-table alternative (last 50 candles) and a text summary ("Price up 34% in 1h, high $x").
- **Tooltips and popovers** open on focus as well as hover. Click-to-expand content is reachable with Enter or Space.
- **Motion.** Respect `prefers-reduced-motion`: no flashes, no FLIP animations, and the progress ring has no animation.
- **Targets.** Minimum 24×24 px on desktop and 44×44 px on touch.
- **Zoom.** The layout must work at 200% browser zoom and at a 320 px viewport width with no horizontal page scroll. Tables scroll inside their own container.

### 11.8 Security, privacy and abuse [P0]
- **Auth.** Bearer session tokens (httpOnly cookie optional, P1). Passwords hashed with argon2id or scrypt. Rate limits:
  - guest and register: `ACCOUNT_CREATIONS_PER_IP` per 10 min
  - login: 10 attempts per username per client IP per 10 min (unknown usernames count too), and `LOGIN_ATTEMPTS_PER_IP` per 10 min
  - trading: 10 swaps/s per account
  - order create: 5/s
  - REST reads: 50/s per account and 100/s per IP
  - Exceeding a limit returns 429 with `retry-after`.
- **Logout** revokes the session on open sockets: `{op:'auth', ok:false}` is sent and the `user` channel is dropped.
- **Untrusted token metadata.** Names, symbols, descriptions, social links and call theses are all untrusted.
  - Strip C0/C1 controls, zero-width characters and bidi overrides (U+202A–202E, U+2066–2069, U+200B–200F, U+FEFF, …).
  - Cap lengths.
  - Render as text only, never as HTML.
  - Neutralise instruction-like text such as "[system]" or "ignore previous instructions" with `[filtered]`. A filtered marker is itself a risk flag.
  - Links must be `http(s)`, open with `rel="noopener noreferrer nofollow"`, and show a "leaving Trenchscope" interstitial. The server never fetches user-supplied URLs (SSRF).
- **Automation consent** (TE-65): scoped and expiring. Every automated fill references its consent id.
- **CSP.** No inline scripts; self-hosted fonts. Images are generated identicons or uploads, re-encoded server-side and size-limited.
- **Privacy.** No third-party trackers in P0. Analytics are first-party and anonymised. Wallet remarks are private. The "most followed" aggregate is opt-out.
- **Legal copy.** "Simulated market for education and entertainment. No real assets. Not financial advice." This appears in the footer, at onboarding, and on share cards.

### 11.9 Internationalisation [P0 en; P1 zh-CN]
All strings are externalised from day one, using ICU message format with pluralisation. Number and date formatting is locale-aware, but **compact suffixes stay K/M/B** across locales. Layouts must tolerate 30% longer strings. Right-to-left languages are out of scope.

### 11.10 Responsive and PWA
- **Breakpoints.** < 640 phone, 640–1023 tablet, 1024–1439 laptop, ≥ 1440 desktop.
- **Phone.** Bottom tab bar, single-column Trenches with swipe, a sticky trade bar on the token page, and full-screen sheets in place of docked panels. Thumb-zone placement for Buy and Sell.
- **PWA (P1).** Installable manifest, offline shell (with an offline banner, no stale trading), and Web Push.

### 11.11 Persistence and determinism [P0]
- Snapshots are written on an interval (`SNAPSHOT_EVERY_MS`) and on shutdown, using atomic rename. A restored world continues from the snapshot clock.
- Same seed, same scenario and same user action script must produce identical event logs. CI checks this by comparing hashes over a 10-minute run.
- Schema version in the snapshot (current v8). Migrations are forward-only. An incompatible snapshot triggers a reseed, logged at WARN.

### 11.12 Observability [P0]
- Structured JSON logs. Metrics:
  - tick duration
  - trades/s
  - WS clients and subscriptions
  - per-channel compute ms
  - send-queue bytes
  - dropped deltas
  - REST p50/p95
  - order fire latency
  - landing outcomes per tier
- `/api/health` returns `{ok, now, tokens, clients, tps}`.
- An admin-only debug panel (P1) shows the seed, scenario and congestion state per chain.

### 11.13 Testing [P0]
- **Unit:** formatters (Appendix A cases), curve and AMM maths, every analytics formula (§8), PnL vectors (Appendix C), holder vector (Appendix D), and signal triggers with crafted tick sequences.
- **Contract:** REST and WS payloads validated against `packages/shared` types (zod or tsd).
- **Simulation:** determinism hash, calibration targets (SIM-21), and the ground-truth validation job (AN-80).
- **E2E (Playwright):**
  1. guest onboarding → quick buy from Trenches → see fill toast and position
  2. place limit plus bracket → trigger → fill
  3. follow wallet → feed row → wallet alert
  4. create copy task → copies on the target's buy
  5. price alert fires
  6. theme toggle and keyboard-only buy flow
  7. phone viewport Trenches swipe
- **Performance:** a Trenches streaming benchmark in headless Chrome (frame-time budget) and a WS soak with 2,000 clients.

### 11.14 Browser support
The last 2 versions of Chrome, Edge, Firefox and Safari (desktop and iOS). No IE. WebSocket and ES2022 are required.


---

## 12. Differentiators vs GMGN (from competitor research, R§17)

| # | Gap observed in GMGN / incumbents | Trenchscope answer | Where | Pri |
|---|---|---|---|---|
| D1 | Risk numbers are opaque and mix three kinds of figure: holding share, volume share and cohort share. Unknown values show as "0%" | One rule throughout: **every chip is the current holding share of effective supply**, with published definitions, tri-state unknowns (`—`), and chain-aware `n/a` | §8.1–8.3, §11.4 | P0 |
| D2 | No single verdict a beginner can read | **Explainable Safety score** (0–100) listing every deduction, plus **hard gates** on honeypot, tax and blacklisted dev | §8.6, TE-81 | P0 |
| D3 | Hidden costs (1% platform fee plus forgotten priority and tip fees) | **All-in cost preview** on every trade, a per-fill fee breakdown, a fees ledger, a lower 0.8% platform fee, and a warning when non-platform fees exceed 3% | §6.8.3, TE-32 | P0 |
| D4 | No safe way to learn | **First-class paper trading**: instant guest account, faucet, scenario presets, risk acknowledgement | §5, §6.22 | P0 |
| D5 | Users complain of "wrong PnL" | Fee-inclusive **moving-average ledger** with transfer, airdrop and oversell rules. Win rate and buckets for *every* period, an **Unsold** bucket, and an "Explain PnL" replay | §8.12 | P0 (explain P1) |
| D6 | Dev track record is not visible on cards (third-party extensions add it) | **Dev record chip on every card** (graduated/created plus peak-MC tier), creator rug history, and a Dev score | TR card, §8.8 | P0 (score P1) |
| D7 | Copycats go unflagged | **Copycat detection**: normalised name, symbol and image hash; card badge and token-page banner naming the original | TK-H7 | P0 |
| D8 | Tracker is noisy; alert toasts are tiny | Feed **de-duplication**, starred and coloured wallets, per-wallet sounds, **large alert cards**, and rule-level rate limits with auto digest | §9.2, §9.5 | P0 / P1 |
| D9 | Monitor shows one chain at a time | Multi-chain "All" mode with chain stripes | SH-04 | P1 |
| D10 | Copy trading turns followers into exit liquidity | **Copy-tradeability score and four gates**, a backtest that models latency drift, a size cap, and KOL dump detection | §8.5, TE-76 | P1 |
| D11 | UI is cluttered and CPU-heavy | **Density modes** (Focus / Standard / Pro), virtualised fixed-height lists, coalesced updates, a 60 fps budget, and pause on hover | §11.1, SH-14 | P0 / P1 |
| D12 | Hotkeys are partial and undocumented | **Full keyboard map**, cheat sheet and command palette. Trading hotkeys are opt-in | §11.6 | P0 |
| D13 | Every terminal claims to be "fastest" with no proof | **Landing telemetry** (p50/p95 and success rate per tier), shown publicly | TE-34 | P1 |
| D14 | Paid promotion reads as legitimacy | Promo badges are neutral grey and labelled "spend", never added to safety | TR card, §8.6 | P0 |
| D15 | Fake PnL screenshots | **Verified share cards** with a ledger-recomputed verify page | §6.21 | P1 |
| D16 | Labels are not validated | **Nightly precision and recall against simulator ground truth** for every label | AN-80 | P0 |
| D17 | Accessibility is ignored | WCAG 2.2 AA, colour-independent cues, screen-reader summaries | §11.7 | P0 |
| D18 | Closed data plane | Provider-interface architecture, ready for real chains (paper and live modes later) | §4.3 | P0 (interfaces) |

---

## 13. Scope

### 13.1 P0: must ship in v1
1. **Market simulator.** 4 chains (`sol/bsc/base/eth`), 8 launchpads, curve → TrenchSwap graduation with burned LP, and 12 agent archetypes with hidden fates. Also: congestion states, promos and CTO events, scenario presets, determinism, snapshot persistence and warm-up, ground-truth export (SIM-01…33).
2. **Data-provider interfaces** with Sim implementations and provenance badges (AR-10/11).
3. **Global shell.** Nav, chain selector, search overlay, paste-CA quick trade, wallet pill with faucet, notification bell, footer status and tickers, SIM badge, Positions and Instant Trade panels, dark and light themes, guest onboarding and tour.
4. **Trenches.** Three lifecycle columns, full token card (risk chips, dev record, copycat, safety, promo/CTO/dev-sold badges, quick buy), per-column filters and presets, risk-threshold panel, pause on hover, opt-in hotkeys (Modes A/B), 1 s realtime.
5. **Trending** (windows, sorts, filters, column set) and **New Pairs**.
6. **Token page.**
   - Header, stats and window strip, bonding block.
   - Chart: price/MCap, USD/native, 8 resolutions, trade markers, average-cost and order lines, signal markers.
   - Trade panel: market and limit, preset slots, exit plan, cost preview, safety gate, sell initials, Auto tab with dev-sell and graduation buy/sell.
   - Cards: Safety & Audit, Holder structure, Early buyers, Dev, Pool.
   - Tabs: Activity, Holders, Top traders, Dev tokens, Positions, Orders.
7. **Wallet page.** PnL card with daily calendar, behaviour, risk check, distribution with Unsold, tabs (Recent PnL, Holdings, Activity, Created tokens), and Follow/Copy/Alert actions.
8. **Leaderboard** (smart / KOL / sniper / whale / all; 1D/7D/30D) with Follow and Copy.
9. **Monitor.** Smart, KOL and Following feeds with position events and noise control, plus the convergence panel with strength labels and red flags.
10. **Signals.** 13 kinds (price_spike, ath, mcap_level, smart_buy, kol_buy, large_buy, multi_buy, bundler_sell, dev_sell, migration, cto, boost, kol_call), quality filter, grouped feed, in-app subscriptions.
11. **Trading engine.**
    - Quote and swap with idempotency.
    - Execution: preset slots, fee tiers, auto slippage, anti-MEV.
    - Simulation of landing latency, failures and sandwiches, with a fee breakdown.
    - Orders: limit, TP/SL/trailing exit plans, dev-sell exit, graduation buy/sell.
    - Confirmation policy, hard and soft gates, error codes, order lifecycle events.
12. **Copy trade.** Task page plus engine: fixed, proportional and max-capped sizing; mirror sells or exit plan; filters; budgets; auto-pause; 10 tasks.
13. **Portfolio** (holdings, history, activity, orders, calendar; faucet) and **Watchlist** with groups.
14. **Alerts and notifications.** Price/MC, holding, wallet and signal-subscription rules; inbox; big toast cards; rate limits and auto-digest; automation-consent records.
15. **Analytics.** Holder universe and float, tri-state security fields, token labels (dev team, bundler, sniper, insider, fresh, whale, top holder) and chips, creator rug history, global tags (smart, kol, sniper, bundler, insider, whale, fresh, bot, sandwich, dev), wallet metrics and risk check, Safety score and rugRisk, window stats and makers, heat score, signal engine with convergence, PnL engine (AN-60…71), nightly ground-truth validation (AN-80).
16. **Settings.** Account, trading presets, quick amounts, display, risk thresholds, hotkeys, notifications, blacklist, automation consent, language (en).
17. **Non-functional.**
    - Performance: SLOs and the 60 fps Trenches budget.
    - Protocol: WS with heartbeats and resubscribe; REST conventions.
    - UI: number/time/address formatting including subscript-zero prices; dark and light tokens; phone/tablet/desktop layouts; WCAG 2.2 AA.
    - Security: auth and rate limits, metadata sanitisation, CSP.
    - Determinism and persistence tests, observability, Playwright E2E suite.

### 13.2 P1: next release
- Multi-chain "All" mode.
- Full dock panel set, density modes, command palette.
- Narratives; Hot-searches and Surging tabs.
- Holder-structure chart overlays and the series endpoint.
- Wallet copy assessment (scores, gates, backtest), style title and badges, portrait strip; dev score; copy guardrails with KOL dump detection.
- Inflow board.
- Launch-sniper rules, smart_entry orders.
- Multi-wallet trading (≤5 wallets), smart retry, landing telemetry status.
- WS `seq`/list deltas, ticker channel, SharedWorker socket sharing.
- Web Push and installable PWA.
- Rewards and referral.
- Verified share cards.
- Synthetic social pulse with rename history; live streams; fee claims; phishing label; wash-trader tag; lifecycle stage and quality flag; candle_spike, smart_exit and multi_large_buy signals.
- Liquidity and Events tabs.
- Explain-PnL replay.
- Follow import/export, emoji, groups, starred and coloured wallets, sounds.
- Passkeys, sessions list, reset paper account, wallet manager.
- zh-CN; colour-blind palette; hotkey rebinding.

### 13.3 P2: later / exploratory
- User call-outs and caller pages.
- Token launch with disclosed creator-linked wallets.
- Social sniper; DCA orders; multichart workspace; comments.
- Curated "hot list" with gates.
- Pooled-basis portfolio view.
- Email digest and signed webhooks; public API with keys and webhooks.
- Legacy route aliases.
- Real-chain adapters: `paper` mode (real data, simulated execution) and later `live` mode, behind the provider interfaces (R§16).
- Out of scope even for P2 unless revisited: perpetuals, yield on idle balance, our own token.

---

## 14. Risks, open decisions and assumptions

| # | Item | Default decision in this PRD | Owner |
|---|---|---|---|
| Q1 | `near_completion` cut-off | Token-mode progress ≥ 0.60, hysteresis below 0.50 | Product |
| Q2 | Sniper window | Blocks `b_o…b_o+3` (≤ 1.6 s on fast chains), first 70 buyers | Analytics |
| Q3 | Insider clustering parameters | 6 h / ±15% coherence; 60 s batch; service-funder exclusion at ≥ 1,000 wallets/24 h | Analytics |
| Q4 | Smart-money thresholds | §8.4.1; tune until ground-truth precision ≥ 0.80 | Analytics |
| Q5 | Platform fee | 0.8% (sim); referral invitee discount 10% | Product |
| Q6 | Win-rate denominator | Settled tokens only; GMGN-parity value shown in a tooltip | Product |
| Q7 | Rug-risk weights | §8.6.2; refit after the first validation run (AUC ≥ 0.80) | Analytics |
| Q8 | Trenches realtime | Snapshot per second in P0; list deltas in P1 if CPU or bandwidth exceed budget | Eng |
| Q9 | Guest data retention | Guest accounts are kept 30 days after last activity, then purged | Eng |
| Q10 | Legal | Footer and onboarding disclaimers; no real assets. Review before any real-data mode | Legal |
| R1 | Sim realism too low, so analytics look trivial | Calibration targets SIM-21 plus scenario presets; analytics validated only through observable data (AR-02) | Eng |
| R2 | Performance under 2,000 clients | Hub-level fan-out per params hash, coalescing, backpressure | Eng |
| R3 | Future licensing for real data (DEX Screener, X) | Provider interfaces; promo and social data stay simulated until licensed | Product/Legal |

---

## Appendix A: Formatter conformance cases (`packages/shared/src/format.ts`)

| Input | Function | Expected |
|---|---|---|
| 0.000003518 | price | `$0.0₅3518` |
| 0.0000035180 | price | `$0.0₅3518` (trailing zeros trimmed) |
| 0.00000041 | price | `$0.0₆41` |
| 0.00019 | price | `$0.00019` |
| 0.012345 | price | `$0.01235` (4 sig) |
| 0.5 | price | `$0.5` |
| 185.2 | price | `$185.20` |
| 1234567 | price | `$1.23M` |
| null | price | `—` |
| 791.9 | usd | `$791.9` |
| 307 | usd | `$307` |
| 3900 | usd | `$3.9K` |
| 131400 | usd | `$131.4K` |
| 255830000 | usd | `$255.83M` |
| 0.004 | usd | `<$0.01` |
| −0.45 / −0.9971 | pnl | `-$0.45 (-99.71%)` |
| 30.27 | pnl | `+$30.27` |
| 0.416 | pct (table) | `+41.6%` |
| 1.0 | pct (table) | `+100%` |
| 12.3 | pct | `+1.2K%` |
| 2.134 | multiple | `2.13×` |
| 24.6 | multiple | `25×` |
| 25 s / 4 min / 21 d | age | `25s` / `4m` / `21d` |
| `EHcbXk…9pump` | address | `EHcb…pump` |

## Appendix B: Threshold reference (all user-visible colouring)

| Metric | Green | Amber | Red | Notes |
|---|---|---|---|---|
| Top10 (supply basis) | < 20% | 20–30% | > 30% (chip) / > 50% (danger) | Float basis: red > 60, amber > 40 |
| Top20 (float) | | > 55% | > 75% | |
| Dev hold | ≤ 2% | 2–30% | > 30% (chip); safety deduction > 5% | |
| Insiders | ≤ 1% | 1–5% | > 5% | |
| Snipers | ≤ 5% | 5–10% | > 10% | sniperCount: < 5 / 5–20 / > 20 |
| Bundlers | ≤ 5% | 5–10% | > 10% | launch bundle % shown separately |
| Fresh | ≤ 5% | 5–10% | > 10% | |
| Phishing (P1) | 0 | ≤ 5% | > 5% | |
| Bot traders (% analysed) | ≤ 50% | 50–60% | > 60% | |
| Rug risk | < 0.1 | 0.1–0.3 | > 0.3 | > 0.3 = quick disqualify |
| Creator rug history | ≤ 5% | 5–10% | > 10% | null when < 3 launches |
| Safety score | ≥ 70 | 40–69 | < 40 | default gate 40 |
| Tax (EVM) | 0 | ≤ 5% | > 10% (5–10% amber) | > 25% hard gate |
| Liquidity | > $50k | $10–50k | < $10k | |
| Smart wallets | ≥ 3 | 1–2 | 0 (bearish only, never red) | |
| Price impact | ≤ 1% | 1–3% | > 3% warn; > 15% typed confirm | |
| Non-platform fees / trade | ≤ 1% | 1–3% | > 3% warn | |
| Wallet risk check | | | honeypot > 10%, received-only > 30%, sold > bought > 10%, fast > 30% | |
| Fee drag | < 0.10 | 0.10–0.25 | ≥ 0.25 (copy gate), ≥ 0.30 (problem) | |

## Appendix C: PnL conformance vectors (fees 0 unless stated; supply 1B for MC)

- **TV1 Moving average, partial sell, re-buy.**
  - Steps:
    1. Buy 1,000,000 T for $100.
    2. Buy 1,000,000 for $300.
    3. Sell 500,000 for $250. Then `buyCost=$100`, `realized=$150`, `qty=1.5M`, `cost=$300`, `avg=$0.0002`.
  - At a mark of $0.0004: `V=$600`, `U=$300`, `T=$450`, `totalPnlPct=1.125`, `realizedPnlPct=1.5`. For reference, FIFO gives R $200 / U $250 and LIFO gives R $100 / U $350, with T=$450 in all three methods.
  - Then buy 500,000 for $300. Result: `qty=2M`, `cost=$600`, `avg=$0.0003`, lifetime average buy $0.00028. At $0.0004: `V=$800`, `U=$200`, `R=$150`, `T=$350`, `totalPnlPct=0.5`.
- **TV2 Fees.**
  - Buy: $100 debited, of which the 1% platform fee is $1. Network $0.01, priority $0.04, tip $0.20. Result: `cost=$100.25`, `boughtUsd=$100`, fees $1.25.
  - Sell at a gross $150: platform $1.50, network $0.01, priority $0.04, tip $0.20. Result: `proceedsNet=$148.25`, `realized=$48.00` (+47.88%), $51 before fees, fee drag 6.25%, **WIN**.
  - Variant with a gross sale of $99: proceeds $97.76, `realized=−$2.49`, **LOSS**.
- **TV3 Transfer-in.**
  - Steps:
    1. Receive 2,000,000 T from an external address at a mark of $0.00005 (FMV $100).
    2. Buy 1,000,000 for $80.
    3. Sell 3,000,000 for $270.
  - Result: cost before the sale $180, average $0.00006, `realized=$90`, ROI 0.5. With zero-cost basis instead, `realized=$190`. `nonTradePosition=true`, so the position is excluded from win rate.
- **TV4 Internal transfer.**
  - Steps:
    1. Wallet A buys 1,000,000 for $100.
    2. A sends 400,000 to B (same user).
    3. B sells 400,000 for $80.
  - At a mark of $0.00015: A has cost $60, V $90, U $30. B has carried basis $40 and realised $40. Group: R $40, U $30, T $70. Counts: 1 buy, 1 sell, 0 transfers, 1/1 wins. A zero-cost treatment for B would wrongly give T=$110.
- **TV5 Periods and calendar** (now = 2026-10-20 12:00 UTC).
  - Trades:
    - Buy 10,000 T at $1.00 on 10-10 09:00.
    - Sell 4,000 at $1.50 on 10-15 10:00: +$2,000.
    - Sell 4,000 at $0.80 on 10-19 18:00: −$800.
    - Buy 2,000 at $0.90 on 10-20 08:00.
  - Position at a mark of $1.00: qty 4,000, cost $3,800, average $0.95, U $200.
  - Period results:

    | Period | R | ROI | capitalRoi | Win | Other |
    |---|---|---|---|---|---|
    | 1D | −$800 | −0.20 | −0.444 | 0/1 | |
    | 7D | $1,200 | 0.15 | 0.667 | tokens 1/1, sells 1/2 | |
    | 30D | $1,200 | 0.15 | 0.1017 | | |
    | All | $1,200 | | | | T $1,400, totalPnlPct 0.1186 |

  - Calendar:

    | Timezone | Entries |
    |---|---|
    | UTC | 10-15 +$2,000; 10-19 −$800 |
    | Asia/Shanghai | 10-15 +$2,000; **10-20** −$800 |
    | America/Los_Angeles | 10-15 +$2,000; 10-19 −$800 |

- **TV6 Oversell.** Indexed buy of 1,000 T for $10, then a sell of 1,500 T for $30. The implicit inflow of 500 at $0.02 adds $10, so basis = $20, `realized=$10`, ROI 0.5, `basisIncomplete=true`. A naive zero basis would give $20 and ROI 2.0.
- **TV7a Rug.** Buy 5,000,000 for $500. Last trade at $0.00008, then LP removed. Result: rugged, V=$0, U=−$500, totalPnlPct −1.0, hold-to-zero +1, excluded from win rate, bucket Unsold. A last-price valuation would wrongly show V $400.
- **TV7b Dust close and re-entry.**
  - Buy 1,000,000 for $100, then sell 999,999.9 for $200. Result: basis $99.99999, realised $100.00001. The remaining 0.1 T is dust, so the cycle closes and the residual is written off, giving `realized=$100.00000`.
  - Re-buy 500,000 for $100. Result: cycle 2, average $0.0002, new `startHoldingAt`.
- **TV8 Win rate and buckets** (one 7D window; each token bought for $100):

  | Token | Activity | Realised | r |
  |---|---|---|---|
  | A | Sold all for $700 | +$600 | 6.0 |
  | B | Sold half (basis $50) for $200 | +$150 | 3.0 |
  | C | Sold all for $90 | −$10 | −0.10 |
  | D | Sold $30 / $20 / $10 against basis $25 / $25 / $50 | −$40 | −0.40 |
  | E | Sold for $20 | −$80 | −0.80 |
  | F | Unsold | | |

  - Expected:
    - tokenNum 6, settled 5, wins 2, so `winRate=40%`. GMGN parity 33.3%; per-sell 3/7.
    - Buckets: gt5 1, 2–5× 1, 0–2× 0, −50–0 2, <−50% 1, Unsold 1.
    - R $620, realisedCost $450, ROI 1.378, bought $600, capitalRoi 1.033.
- **TV9 Quotes.**
  - Buy T with 2 SOL at SOL = $150, then sell all for 3 WSOL at SOL = $100. Result: cost $300, proceeds $300, `realized=$0` (counted as a non-win), `realizedNative=+1 SOL`.
  - Stablecoin quote valued at the oracle price: 300 USDC at $0.998 gives $299.40.
  - Token-to-token swap: two legs with the same tx hash, the sell valued at the USD value of the token received.
- **TV10 Multi-wallet.**
  - A buys 1,000,000 for $100. B buys 1,000,000 for $300. Group at a mark of $0.00025: qty 2M, cost $400, average $0.0002, V $500, U $100.
  - A then sells 1,000,000 for $250. Group realised = $150 using per-wallet basis (pooled basis would give $50). Remaining: qty 1M, cost $300, V $250, U −$50, T $100 under either method.

## Appendix D: Holder-metric vector TV-H1

**Setup.** Curve token, supply 1,000M, no burn, so `D = 1,000M`. Unsold supply sits in the curve account and is excluded. Open = creation slot 1000. Slot length 0.4 s. Price is quoted as USD per 1M tokens; the current price is $500 (MC $500k).

**Funding**

| Wallet(s) | Funding | Other facts |
|---|---|---|
| C (creator) | Exchange-funded | Age 40 d |
| D1, D2 | Funded by C at t−7200 s and t−7190 s, 3 SOL each | |
| I1, I2, I3 | Funded by F (non-service, unlinked to C) at t−1800, −1750 and −1700 s, 2 SOL each | |
| FR1 | First funded 3 h before buying | 0 prior tokens |
| FR2 | First funded 20 h before buying | 0 prior tokens |
| X1 | First funded 1 h before slot 1700 | 0 prior tokens |
| B1–B3 | Share fee payer G | |
| K1 | | KOL (48k followers) |
| SM1 | | Smart |
| P1–P6 | | Old wallets that never bought |
| All others | | > 30 d old, with history |

**Trades** (amounts in M tokens, prices in $ per 1M)

| # | Slot | Trade |
|---|---|---|
| T1 | 1000 | C buy 30 @ $4 (create tx) |
| T2 | 1000 | D1 buy 25 @ $5 (same bundle) |
| T3 | 1000 | D2 buy 25 @ $6 (same bundle) |
| T4 | 1001 | S1 buy 18 @ $8 |
| T5 | 1001 | I1 buy 15 @ $9 |
| T6 | 1002 | S2 buy 18 @ $11 |
| T7 | 1002 | S3 buy 16 @ $12 (separate tx, payer and funder) |
| T8 | 1003 | S4 buy 14 @ $14 |
| T9 | 1004 | R1 buy 10 @ $15 |
| T10 | 1010 | I2 buy 12 @ $18 |
| T11 | 1012 | I3 buy 12 @ $20 |
| T12–T14 | 1020 | B1, B2, B3 buy 8 each @ $25 (3 signers, payer G) |
| T15 | 1050 | FR1 buy 9 @ $40 |
| T16 | 1060 | FR2 buy 9 @ $45 |
| T17 | 1100 | K1 buy 6 @ $80 |
| T18 | 1150 | SM1 buy 7 @ $120 |
| T19 | 1200 | S1 sell 18 @ $200 |
| T20 | 1210 | W1 buy 20 @ $560 ($11,200) |
| T21 | 1250 | D1 sell 10 @ $520 |
| T22 | 1300 | R2 buy 5 @ $540 |
| T23 | 1310 | R3 buy 5 @ $550 |
| T24 | 1320 | R4 buy 4 @ $560 |
| T25 | 1330 | S2 sell 9 @ $540 |
| T26 | 1400 | R5 buy 4 @ $520 |
| T27 | 1410 | C sell 30 @ $500 (creator exits) |
| T28 | 1450 | R6 buy 3 @ $480 |
| T29 | 1460 | R7 buy 3 @ $490 |
| T30 | 1500 | I2 sell 4 @ $500 |
| X-a | 1700 | Transfer D2 → X1, 10 |
| X-b | 1800 | Transfer R1 → P1…P6, 0.5 each (one tx) |

**Creator history.** 12 prior launches older than 24 h: 2 pooled launches now under $4k liquidity, 1 curve dump (90% sold in 12 min), 9 failed with no dump.

**Expected final balances** (M): D1 15, D2 15, I1 15, S2 9, S3 16, S4 14, R1 7, I2 8, I3 12, B1–B3 8 each, FR1 9, FR2 9, K1 6, SM1 7, W1 20, R2 5, R3 5, R4 4, R5 4, R6 3, R7 3, X1 10, P1–P6 0.5 each. C and S1 hold 0.
- Eligible total 223M; curve 777M.
- 30 holders; 25 distinct traders.

**Expected labels**

| Label | Wallets | Notes |
|---|---|---|
| dev | C | |
| dev_team | C, D1, D2, X1 | |
| bundler | D1, D2, B1, B2, B3 | {S1, I1} and {S2, S3} are **not** bundles |
| sniper | S1, I1, S2, S3, S4 | R1 at slot 1004 is excluded |
| insider | I1, I2, I3 | Applied retroactively at T11 |
| fresh | FR1, FR2, X1 | |
| phishing | P1–P6 | |
| whale | W1 | |
| kol | K1 | |
| smart | SM1 | |

**Expected chips** (D = 1,000M)

| Chip | Value | Composition / notes |
|---|---|---|
| Top10 | 13.50% | W1 20, S3 16, D1 15, D2 15, I1 15, S4 14, I3 12, X1 10, S2 9, FR1 9. FR2 loses the tie on later entry. |
| Dev | 0% | Status `sold_all` |
| dev_team | 4.00% | |
| Insiders | 3.50% | |
| Snipers | 5.40% | Count 5 |
| Bundlers | 5.40% | |
| Phishing | 0.30% | |
| Fresh | 2.80% | Count ratio 10.0% |
| Creator rug history | 25% | **Red** |

**Secondary values:** launch bundle % 5.00%, bundler volume share 25.17%, insider volume share 13.27%, insider cohort share 12.0%, early buyers still hold 21.0%.
- Early-buyer status: S1 `sold_all`; S2, D1 and I2 `sold_part`; D2 and R1 `transferred`; everyone else `holding`.
- De-duplicated risk set: 15.6%, against a per-category sum of 17.1%. The 1.5% overlap is I1, counted as both insider and sniper.
- Linked funding: window groups {D1, D2} (tight batch) and {I1, I2, I3}; same-source group F → {I1, I2, I3}. Related share 6.5%.
- Float view (float 22.3%): Top10 60.5% red, Top20 92.4% red, insiders 15.7% red, so the verdict is **Not recommended**.

**Mid-stream checks**
- After T8: Top10 16.1%, Dev 3.0%, dev_team 8.0%, Bundlers 5.0%, Snipers 8.1%, Insiders 0% (no cluster yet).
- After T11: Insiders 3.9%.

## Appendix E: Contract changes (delta vs current `docs/API.md` and `types.ts`)

| Area | Change | Pri |
|---|---|---|
| `TokenFilters` | add `devGraduationRate`, `devRugRatio`, `feesPaidNative`, `netBuyUsd`, `minSafety`, `phishingHoldRate` (P1); `rugRatio` = `rugRisk` | P0 |
| `TokenSummary` / `TokenDetail` | add `safety{score, band, coverage, reasons[]}`, `rugRisk`, `progressQuote`, `feesPaidNative`, `makers{window}`, `copycatCount`, `creatorRugRatio`, `devRecord{created, graduated, bestPeakMcUsd}`, `promo{lastAt, kinds[]}`, tri-state `TokenSecurity` | P0 |
| Holders | `addrType: wallet\|curve\|pool\|burn\|contract\|locker\|cex`; `fundedBy{address, at}`; `remainingPct` | P0 |
| `Signal` | add `firstTriggerMcUsd`, `timesFired`, `timesFiredByKind`, `cur{holders, top10, liquidity}`, `payload`, `severity`; `GET /signals?groups=&before=` | P0 |
| `FeedItem` | add `positionEvent: open\|add\|reduce\|close` | P0 |
| Orders | `isUpdate` on upsert; `parentId` for exit-plan legs; `smart_entry` kind (P1); consent id on automated orders | P0 |
| `SwapReceipt` | add `priorityFeeNative`, `tipNative`, `block`, `attempts` | P0 |
| Quote | `safety`, `etaMs`, `totalCostPct`, `quoteId`, `expiresAt` | P0 |
| Watchlist | groups CRUD: `GET/POST/PATCH/DELETE /api/watchlist/groups`; items get `groupIds[]`, `note`, `alias` | P0 (note/alias P1) |
| Alerts | rule types `price`, `holding`, `wallet`, `signal_subscription`; `channels[]`, `repeat`, `cooldownSec` | P0 |
| Settings | presets per chain (3 slots × buy/sell), quick amounts, thresholds, hotkeys, notification matrix, blacklist, consents; `user` channel `settings` event | P0 |
| WS | `serverT` in pong; `convergence:<chain>` channel; `seq` + list deltas, `tickers:<chain>`, `inflow:…`, `status` (P1) | P0 / P1 |
| New REST | `GET /api/:chain/convergence`; `GET /api/:chain/tokens/:address/series` (P1); `GET /api/:chain/inflow` (P1); `GET /api/status/landing` (P1); `POST /api/share` + `GET /api/share/:id` (P1); `GET/POST/DELETE /api/blacklist`; `GET/DELETE /api/consents` | mixed |


---

## Appendix F: v1 implementation status

Status of the §13.1 P0 scope in the current build. ✅ shipped · ◐ partial (gap noted) · ⏳ deferred.

| # | P0 item | Status | Notes |
|---|---|---|---|
| 1 | Market simulator | ✅ | 4 chains, 8 launchpads, curve → TrenchSwap graduation with burned LP, 12 wallet archetypes with hidden fates, congestion + launch rushes, boosts/CTO, determinism, compact v8 snapshots, warm-up. ⏳ scenario presets and ground-truth export (realism is reported by `scripts/sim-report.ts` and classifier evals in tests). |
| 2 | Data-provider interfaces | ◐ | The `World` ledger + events is the provider boundary (see ARCHITECTURE "Swapping in real data"); every page carries the simulated-market notice. ⏳ explicit provider interfaces and per-field provenance badges. |
| 3 | Global shell | ✅ | Nav, chain selector, omnibox (paste address → navigate), command palette, wallet pill + faucet, notification bell, status bar with chain tickers and congestion, simulated-market badge, Instant Trade / Positions dock, dark + light, guest quick start, onboarding tour, PWA manifest. |
| 4 | Trenches | ✅ | Three lifecycle columns, full cards (risk chips, safety, dev record, copycat/CTO/boost/dev-sold badges, quick buy), per-column filters + presets, risk thresholds, pause on hover, hotkeys, 1 s realtime, blacklist merge. |
| 5 | Trending, New Pairs | ✅ | Windows, server sorts, filters, initial liquidity. |
| 6 | Token page | ✅ | Header, stats windows, bonding block, chart (price/MCap, USD/native, 8 resolutions, wallet-class markers, avg-cost and order lines), trade panel (market/limit/auto, presets, exit plans, quote + cost preview, safety gate), Safety & Audit, holder structure, early buyers, dev, pool cards, Activity/Holders/Top traders/Position/Orders/Dev tokens tabs, signal markers on the chart (toggle "Signals", hover tooltips, keyboard list; `GET /tokens/:address/signals` + live `signals` on the token channel), "sell initials" in the trade panel and positions views (`POST /trade/initials` sizes it from the PnL engine's cost basis; disabled with the reason under water). |
| 7 | Wallet page | ✅ | PnL card + daily calendar, analysis (style, speed, badges, copy score), distribution, Recent PnL/Holdings/Activity/Created tokens/Calls tabs, Follow/Copy/Share, risk check card (address poisoning from look-alike dust, wash-trading round trips, flagged funder, new wallet with size, rugs created, honeypots, 5s flips; definitions in tooltips; `GET /wallets/:address/risk`). ⏳ received-only / sold-more-than-bought rows (no token transfers in the simulator). |
| 8 | Leaderboard | ✅ | Smart/KOL/sniper/whale/all, 1D/7D/30D, sort + order, Follow/Copy. |
| 9 | Monitor | ✅ | Smart/KOL/Following/All feeds with position events, noise filters, pause, smart-money convergence panel, following manager with import/export. |
| 10 | Signals | ✅ | 13 kinds, filters, hit stats, call-outs page with caller ranking, grouped feed (one row per token: stacked kinds, first-trigger MC, times fired per kind, holders / top 10 / liquidity), quality filter (default on), Subscribe → in-app signal subscriptions (`signal_subscription` alert rules: OR of AND-groups, 60s per-token merge, per-hour cap). ⏳ groups builder (several groups) on the Signals page (the API takes up to 5). |
| 11 | Trading engine | ✅ | Quote/swap with idempotency, presets, fee tiers, auto slippage, anti-MEV, simulated latency/landing failures/sandwiches, limit, TP/SL/trailing exit plans, dev-sell, migration buy/sell, risk gate, lifecycle events. |
| 12 | Copy trade | ✅ | Fixed/ratio sizing with per-token cap, mirror sells or exit plan, filters, auto-pause after 3 failures. |
| 13 | Portfolio, Watchlist | ✅ | Positions (incl. launch bundle wallets), orders, history, activity, equity curve, daily PnL calendar tab (the wallet page's calendar over all the account's wallets, `GET /portfolio/calendar`), faucet; watchlist with groups and notes. ⏳ calendar in the viewer's timezone (UTC for now, like the wallet page). |
| 14 | Alerts & notifications | ✅ | Price/MC/change/wallet/new-token/smart-buy rules, holding alerts (moves vs cost or in 5m, dev sells, liquidity drain; per-position cooldown), signal subscriptions (inbox filter "Signals"), inbox, toasts with levels. ⏳ digests, web push / email / webhook channels. |
| 15 | Analytics | ✅ | Holder universe, tri-state security, token labels and chips, creator rug history, global tags, wallet metrics, safety score + rug ratio, window stats + makers, heat score, signal engine, PnL engine; classifier quality measured in tests. |
| 16 | Settings | ✅ | Account, trading presets, quick amounts, display (theme, USD/native for the token page's chart and stats, flashes, compact rows, trade confirmation, a sound on fills and alerts), risk thresholds, hotkeys, blacklist. ⏳ notification matrix, automation consent records, per-category sounds, languages beyond English. |
| 17 | Non-functional | ✅ | Realtime WS with resubscribe, subscript-zero formatting, theme tokens, responsive layouts, accessibility checks (axe) in E2E, auth + rate limits + CSP + input sanitisation, determinism and persistence tests, Playwright E2E suite. |

Beyond P0, v1 also ships these P1/P2 items: token launch with bundle wallets, PnL share cards, command palette, narratives, rewards & referrals, wallet copy scores and style titles, follow import/export, call-outs.
