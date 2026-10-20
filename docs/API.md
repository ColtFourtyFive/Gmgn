# Trenchscope API contract

All types referenced here live in `packages/shared/src/types.ts`. JSON everywhere.
Auth: `Authorization: Bearer <token>` (token from `/api/auth/*`). Endpoints marked 🔒 return
`401 {error}` without it; others accept anonymous callers but return viewer-relative fields
(`following`/`you` tags, remarks, `isFollowed`) when a token is present.
Errors: non-2xx with `{ error: string, code?: string }`. Unknown token/wallet → 404.

`:chain` is one of `sol | bsc | base | eth`. Query params that carry objects (filters) are
JSON-encoded strings (`?filters=%7B...%7D`).

## Meta & search

| Method | Path | Query / body | Response |
|---|---|---|---|
| GET | `/api/health` | | `{ ok, now, tokens, clients, tps }` |
| GET | `/api/meta` | | `MetaResponse` |
| GET | `/api/search` | `q` (name, symbol, token address, wallet address, KOL label), `chain?` (a chain or `all`) | `SearchResult` (max 20 tokens, 10 wallets) |

## Market data (analytics module)

| Method | Path | Query / body | Response |
|---|---|---|---|
| GET | `/api/:chain/trenches` | `filters?` = JSON `Partial<Record<TrenchesColumn, TokenFilters>>`, `limit?` (per column, default 60, max 100) | `TrenchesSnapshot` |
| GET | `/api/:chain/trending` | `window` (`StatWindow`, default `1h`), `sort?` (`TrendingSort`, default `hot`), `order?`, `filters?` JSON `TokenFilters`, `limit?` (default 100) | `TrendingSnapshot` |
| GET | `/api/:chain/new-pairs` | `filters?`, `limit?` | `TokenSummary[]` (migrated tokens, newest pool first) |
| GET | `/api/:chain/tokens/:address` | | `TokenDetail` |
| GET | `/api/:chain/tokens/:address/candles` | `resolution` (`Resolution`, default `1m`), `limit?` (default 500, max 2000) | `CandleResponse` |
| GET | `/api/:chain/tokens/:address/trades` | `filter?` = `all\|buy\|sell\|dev\|smart\|kol\|sniper\|insider\|bundler\|whale\|fresh\|following\|mine`, `wallet?`, `minUsd?`, `limit?` (default 100, max 500), `before?` (ms) | `Trade[]` newest first |
| GET | `/api/:chain/tokens/:address/holders` | `tag?` (`all\|smart\|kol\|sniper\|bundler\|insider\|dev\|whale\|fresh\|bot\|sandwich\|top_holder\|following\|you`), `limit?` (default 100, max 500) | `Position[]` (curve/pool venue row first: `addrType` `curve` with a label in `wallet`, or `pool` with the pool address) |
| GET | `/api/:chain/tokens/:address/top-traders` | `tag?`, `sort?` = `pnl\|realized\|unrealized\|bought\|sold`, `order?`, `limit?` | `Position[]` |
| GET | `/api/:chain/tokens/:address/dev` | | `DevInfo` |
| GET | `/api/:chain/wallets/:address` | | `WalletProfile` |
| GET | `/api/:chain/wallets/:address/holdings` | `includeClosed?` (`1`), `sort?` = `value\|pnl\|recent`, `limit?` (default 200, max 1000) | `TokenPositionRow[]` |
| GET | `/api/:chain/wallets/:address/activity` | `type?` = `all\|buy\|sell`, `limit?`, `before?` | `FeedItem[]` |
| GET | `/api/:chain/wallets/:address/created-tokens` | `limit?` (default 100, max 500) | `DevToken[]` newest first: tokens the wallet launched that still exist |
| GET | `/api/:chain/wallets/:address/calls` | `limit?` (default 50, max 200) | `WalletCalls` |
| GET | `/api/:chain/leaderboard` | `tag?` = `smart\|kol\|sniper\|whale\|all`, `period?` (`1d\|7d\|30d`), `sort?` = `pnl\|winRate\|volume\|tokens\|pnlRate`, `order?` = `desc\|asc` (default `desc`), `limit?` | `LeaderboardRow[]` |
| GET | `/api/:chain/feed` | `kind` = `smart\|kol\|follow\|all` (default `all`), `limit?` | `FeedItem[]` newest first (`follow` 🔒) |
| GET | `/api/:chain/signals` | `kind?` (`SignalKind`), `limit?` | `Signal[]` newest first |
| GET | `/api/:chain/callouts` | `filter?` (`CalloutFilter`: `all\|kol\|hits`, default `all`), `limit?` (default 100, max 500) | `Signal[]` (`kol_call`) newest first |
| GET | `/api/:chain/narratives` | | `Narrative[]` by heat |

Limits above the documented maximum are clamped; zero or non-numeric limits return 400. EVM addresses
are accepted in any case. Broadcast channels carry no viewer-relative tags (`you`, `following`): clients
add them locally; REST responses include them when a token is presented.

- `TokenSummary.initialLiquidityUsd` is the launch-time liquidity, or the pool's initial liquidity once
  migrated (`TokenDetail` inherits it).
- `TokenRef.rugRatio` / `riskLevel` (on feed items, holdings, signals, narratives, search) come from the
  token's latest security read, at most ~30s old. Always set by the server; optional in the type.
- `WalletProfile.createdTokenCount` counts the same tokens `/created-tokens` lists (launches the simulator
  has since deleted are left out of both).
- Calls: a call is a `kol_call` signal; it **hits** once `maxMultiple >= 2`. `/calls` returns the wallet's
  calls newest first plus `hitRate7d` / `hitRate30d` (hits / calls made in the window, 0 without calls) and
  `avgMaxMultiple` (mean over the last 30d, 0 without calls). Stats cover the caller's last 200 calls and
  still count calls on tokens the simulator deleted (those are left out of `calls`). `/callouts` reads the
  chain's last 1000 calls: `kol` keeps callers currently tagged `kol`, `hits` keeps calls that hit.

## Accounts (accounts module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/guest` | `{ referralCode? }` | `AuthResponse` (instant paper account; `account.isGuest` true) |
| POST | `/api/auth/register` | `{ username, password, referralCode? }` | `AuthResponse` (called with a guest's token, upgrades that guest in place) |
| POST | `/api/auth/login` | `{ username, password }` | `AuthResponse` |
| POST | `/api/auth/logout` 🔒 | | `{ ok: true }` |
| GET | `/api/me` 🔒 | | `Account` |
| GET | `/api/settings` 🔒 | | `UserSettings` |
| PUT | `/api/settings` 🔒 | deep-partial `UserSettings` | `UserSettings` |
| POST | `/api/wallet/faucet` 🔒 | `{ chain }` | `UserWallet` (tops the paper wallet back up to the starter balance; 1/min/chain) |
| GET | `/api/follows` 🔒 | `?chain=` | `FollowedWallet[]` (`label` / `tags`: the wallet's current public label and platform tags) |
| POST | `/api/follows` 🔒 | `{ chain, address, remark?, group?, notify? }` | `FollowedWallet` |
| PATCH | `/api/follows/:chain/:address` 🔒 | `{ remark?, group?, notify? }` | `FollowedWallet` |
| DELETE | `/api/follows/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/watchlist` 🔒 | | `{ items: WatchlistItem[], tokens: TokenSummary[] }` |
| POST | `/api/watchlist` 🔒 | `{ chain, address }` | `WatchlistItem` |
| DELETE | `/api/watchlist/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/notifications` 🔒 | `?limit=` | `AppNotification[]` newest first |
| POST | `/api/notifications/read` 🔒 | `{ ids? }` (all when omitted) | `{ ok: true }` |
| GET | `/api/rewards` 🔒 | | `RewardsSummary` |

`AppNotification.level` tells toasts the outcome: `success` for fills (orders, copies, snipes, a launch
graduating), `error` for failed trades and a paused copy task; absent for neutral notices.
`RewardsSummary.referralLink` is relative (`/?ref=CODE`); clients prefix their own origin.

Guest and register calls are limited per client IP (`ACCOUNT_CREATIONS_PER_IP` per 10 minutes, 429 with
`retry-after`). Logins are limited to 10 attempts per account per 10 minutes. Logging out also revokes the
session on open WebSockets (the socket receives `{ op: 'auth', ok: false }` and loses the `user` channel).

## Trading (trading module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/trade/quote` 🔒 | `QuoteRequest` | `Quote` (400 `quote_unavailable` when the trade cannot be priced) |
| POST | `/api/trade/swap` 🔒 | `SwapRequest` | `SwapReceipt` (200 with `ok:false` + `error` for trade-level failures like slippage) |
| GET | `/api/orders` 🔒 | `?status=open\|history&chain=&token=` | `Order[]` |
| POST | `/api/orders` 🔒 | `CreateOrderRequest` | `Order` |
| DELETE | `/api/orders/:id` 🔒 | | `Order` |
| GET | `/api/portfolio` 🔒 | `?chain=all\|sol\|...` | `PortfolioSummary` |
| GET | `/api/portfolio/activity` 🔒 | `?chain=&limit=` | `FeedItem[]` |
| GET/POST | `/api/copytrade` 🔒 | POST body: `Omit<CopyTradeTask,'id'\|'createdAt'\|'stats'\|'consecutiveFailures'>` | `CopyTradeTask[]` / `CopyTradeTask` |
| PATCH/DELETE | `/api/copytrade/:id` 🔒 | PATCH: partial task | `CopyTradeTask` / `{ ok: true }` |
| GET/POST | `/api/sniper` 🔒 | POST body: `Omit<SniperTask,'id'\|'createdAt'\|'buysDone'\|'lastTriggeredAt'>` | `SniperTask[]` / `SniperTask` |
| PATCH/DELETE | `/api/sniper/:id` 🔒 | | `SniperTask` / `{ ok: true }` |
| GET/POST | `/api/alerts` 🔒 | POST body: `Omit<AlertRule,'id'\|'createdAt'\|'lastTriggeredAt'>` | `AlertRule[]` / `AlertRule` |
| PATCH/DELETE | `/api/alerts/:id` 🔒 | | `AlertRule` / `{ ok: true }` |

Copy trading pauses itself: `CopyTradeTask.consecutiveFailures` counts failed copies in a row (a
successful copy resets it); at `COPY_AUTO_PAUSE_FAILURES` (3) the task is disabled and the owner gets a
`copytrade` notification (`level: 'error'`) naming the last error. Re-enabling it (PATCH `enabled: true`)
resets the count.

## Token launch (trading module)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/launch/config` | | `LaunchConfig`: launchpad curves per chain (graduation market cap at the current native price), `launchFeeNative`, `glyphs` + `glyphNarratives`, `reservedTickers`, `limits` |
| POST | `/api/launch` 🔒 | `LaunchRequest` | `LaunchResponse` `{ token: TokenDetail, receipts: SwapReceipt[] }` |

- Validation (400, `invalid_input`, message `field: reason`): `launchpad` must be on `chain`; `name` 1-32
  characters without control / zero-width / bidi / line-separator characters or stacked accents (4+
  combining marks in a row) and not a reserved ticker; `symbol` 1-10 of A-Z0-9 after upper-casing and
  dropping a leading `$`, not in `reservedTickers`; `description` at most 280 (same character rules,
  newlines allowed); `socials` must be `https:` links without credentials (twitter on x.com /
  twitter.com, telegram on t.me / telegram.me, website any host) and are stored canonicalized, blank means
  none; `logoGlyph` from `glyphs` (it sets the token's narrative); `devBuyNative`
  0..`limits.maxDevBuyNative[chain]`; `bundleWallets` 0-4 with `bundleBuyNative` up to
  `limits.maxBundleBuyNative[chain]`; bundles and `strategy` need a dev buy (bundle wallets only sell
  alongside it).
- Cost: `launchFeeNative[chain]` + each creation-block buy (amount + 0.8% platform fee + the network fee of
  `presetId`, default the active buy preset). The whole cost is checked first (400 `insufficient_balance`,
  nothing deployed). Bundle wallets are new paper wallets of the account, funded from its wallet with
  exactly their buy plus fees; they show up as bundlers (and raise the token's rug ratio).
- The creator is the account's chain wallet. The dev buy and the bundles fill in the creation block,
  without latency, slippage or MEV; receipts list the dev buy first, and its `orders` are the `strategy`
  exits (`source: 'strategy'`). Fills are pushed on `user` like any swap.
- Bundle wallets follow the launcher out: whenever the account sells a token it launched, each bundle
  wallet sells the same share of its bag and the proceeds return to the account's wallet.
- The simulated market adopts the launch: snipers, smart money, KOLs and retail trade it like their own
  launches, and its hidden outcome leans on what the launch shows (socials, description, a 1-6% dev buy
  help; a heavy dev bag hurts; bundles draw snipers and flippers). Scripted dev-side dumps never sell the
  launcher's or its bundles' tokens. When the token migrates the launcher gets a `system` notification
  (`level: 'success'`). Launched tokens are never pruned.
- At most 5 launches per account per hour (429 `rate_limited`).

## WebSocket `/ws`

Client → server: `WsClientMessage` (`auth`, `sub`, `unsub`, `ping`). Server → client: `WsServerMessage`.
A `sub` gets an `ack` and normally an immediate snapshot `data` message. Re-sending `sub` for the same
channel replaces its params.

| Channel | `type` | Payload | Cadence / params |
|---|---|---|---|
| `market` | `market` | `ChainMarketInfo[]` | every 5s |
| `trenches:<chain>` | `trenches` | `TrenchesSnapshot` | every 1s; params `{ filters?, limit? }` (as REST) |
| `trending:<chain>` | `trending` | `TrendingSnapshot` | every 2s; params `{ window, sort?, order?, filters?, limit? }` |
| `newpairs:<chain>` | `newpairs` | `TokenSummary[]` | every 2s; params `{ filters?, limit? }` |
| `token:<chain>:<address>` | `token` | `TokenDetail` | every 1s while trades happen |
|  | `trades` | `Trade[]` (oldest first within batch) | batched ~250ms |
|  | `candle` | `{ resolution, candle: Candle }` | on change; params `{ resolution }` |
| `feed:<chain>:<smart\|kol\|follow\|all>` | `feed` | `FeedItem[]` | batched ~500ms (`follow` needs auth) |
| `signals:<chain>` | `signals` | `Signal[]` | on trigger |
| `wallet:<chain>:<address>` | `trades` | `Trade[]` | batched ~500ms |
| `user` (auth) | `notification` | `AppNotification` | on event |
|  | `order` | `Order` | on create/fill/cancel/fail |
|  | `balance` | `UserWallet` | after the wallet's native balance changes |
|  | `fill` | `SwapReceipt` | after any swap executed for the user (manual, order, copy, snipe) |
