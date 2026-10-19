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
| GET | `/api/search` | `q` (name, symbol, token address, wallet address, KOL label), `chain?` | `SearchResult` (max 20 tokens, 10 wallets) |

## Market data (analytics module)

| Method | Path | Query / body | Response |
|---|---|---|---|
| GET | `/api/:chain/trenches` | `filters?` = JSON `Partial<Record<TrenchesColumn, TokenFilters>>`, `limit?` (per column, default 60, max 100) | `TrenchesSnapshot` |
| GET | `/api/:chain/trending` | `window` (`StatWindow`, default `1h`), `sort?` (`TrendingSort`, default `hot`), `order?`, `filters?` JSON `TokenFilters`, `limit?` (default 100) | `TrendingSnapshot` |
| GET | `/api/:chain/new-pairs` | `filters?`, `limit?` | `TokenSummary[]` (migrated tokens, newest pool first) |
| GET | `/api/:chain/tokens/:address` | | `TokenDetail` |
| GET | `/api/:chain/tokens/:address/candles` | `resolution` (`Resolution`, default `1m`), `limit?` (default 500) | `CandleResponse` |
| GET | `/api/:chain/tokens/:address/trades` | `filter?` = `all\|buy\|sell\|dev\|smart\|kol\|sniper\|insider\|bundler\|whale\|fresh\|following\|mine`, `wallet?`, `minUsd?`, `limit?` (default 100), `before?` (ms) | `Trade[]` newest first |
| GET | `/api/:chain/tokens/:address/holders` | `tag?` (`all` or a `WalletTag`), `limit?` (default 100) | `Position[]` (curve/pool rows first with `addrType`) |
| GET | `/api/:chain/tokens/:address/top-traders` | `tag?`, `sort?` = `pnl\|realized\|unrealized\|bought\|sold`, `order?`, `limit?` | `Position[]` |
| GET | `/api/:chain/tokens/:address/dev` | | `DevInfo` |
| GET | `/api/:chain/wallets/:address` | | `WalletProfile` |
| GET | `/api/:chain/wallets/:address/holdings` | `includeClosed?` (`1`), `sort?` = `value\|pnl\|recent` | `TokenPositionRow[]` |
| GET | `/api/:chain/wallets/:address/activity` | `type?` = `all\|buy\|sell`, `limit?`, `before?` | `FeedItem[]` |
| GET | `/api/:chain/leaderboard` | `tag?` = `smart\|kol\|sniper\|whale\|all`, `period?` (`1d\|7d\|30d`), `sort?` = `pnl\|winRate\|volume\|tokens\|pnlRate`, `limit?` | `LeaderboardRow[]` |
| GET | `/api/:chain/feed` | `kind` = `smart\|kol\|follow\|all`, `limit?` | `FeedItem[]` newest first (`follow` 🔒) |
| GET | `/api/:chain/signals` | `kind?` (`SignalKind`), `limit?` | `Signal[]` newest first |
| GET | `/api/:chain/narratives` | | `Narrative[]` by heat |

## Accounts (accounts module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/guest` | `{ referralCode? }` | `AuthResponse` (instant paper account) |
| POST | `/api/auth/register` | `{ username, password, referralCode? }` | `AuthResponse` |
| POST | `/api/auth/login` | `{ username, password }` | `AuthResponse` |
| POST | `/api/auth/logout` 🔒 | | `{ ok: true }` |
| GET | `/api/me` 🔒 | | `Account` |
| GET | `/api/settings` 🔒 | | `UserSettings` |
| PUT | `/api/settings` 🔒 | deep-partial `UserSettings` | `UserSettings` |
| POST | `/api/wallet/faucet` 🔒 | `{ chain }` | `UserWallet` (tops the paper wallet back up to the starter balance; 1/min/chain) |
| GET | `/api/follows` 🔒 | `?chain=` | `FollowedWallet[]` |
| POST | `/api/follows` 🔒 | `{ chain, address, remark?, group?, notify? }` | `FollowedWallet` |
| PATCH | `/api/follows/:chain/:address` 🔒 | `{ remark?, group?, notify? }` | `FollowedWallet` |
| DELETE | `/api/follows/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/watchlist` 🔒 | | `{ items: WatchlistItem[], tokens: TokenSummary[] }` |
| POST | `/api/watchlist` 🔒 | `{ chain, address }` | `WatchlistItem` |
| DELETE | `/api/watchlist/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/notifications` 🔒 | `?limit=` | `AppNotification[]` newest first |
| POST | `/api/notifications/read` 🔒 | `{ ids? }` (all when omitted) | `{ ok: true }` |
| GET | `/api/rewards` 🔒 | | `RewardsSummary` |

## Trading (trading module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/trade/quote` 🔒 | `QuoteRequest` | `Quote` |
| POST | `/api/trade/swap` 🔒 | `SwapRequest` | `SwapReceipt` (200 with `ok:false` + `error` for trade-level failures like slippage) |
| GET | `/api/orders` 🔒 | `?status=open\|history&chain=&token=` | `Order[]` |
| POST | `/api/orders` 🔒 | `CreateOrderRequest` | `Order` |
| DELETE | `/api/orders/:id` 🔒 | | `Order` |
| GET | `/api/portfolio` 🔒 | `?chain=all\|sol\|...` | `PortfolioSummary` |
| GET | `/api/portfolio/activity` 🔒 | `?chain=&limit=` | `FeedItem[]` |
| GET/POST | `/api/copytrade` 🔒 | POST body: `Omit<CopyTradeTask,'id'\|'createdAt'\|'stats'>` | `CopyTradeTask[]` / `CopyTradeTask` |
| PATCH/DELETE | `/api/copytrade/:id` 🔒 | PATCH: partial task | `CopyTradeTask` / `{ ok: true }` |
| GET/POST | `/api/sniper` 🔒 | POST body: `Omit<SniperTask,'id'\|'createdAt'\|'buysDone'\|'lastTriggeredAt'>` | `SniperTask[]` / `SniperTask` |
| PATCH/DELETE | `/api/sniper/:id` 🔒 | | `SniperTask` / `{ ok: true }` |
| GET/POST | `/api/alerts` 🔒 | POST body: `Omit<AlertRule,'id'\|'createdAt'\|'lastTriggeredAt'>` | `AlertRule[]` / `AlertRule` |
| PATCH/DELETE | `/api/alerts/:id` 🔒 | | `AlertRule` / `{ ok: true }` |

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
