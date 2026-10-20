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
| GET | `/api/meta` | | `MetaResponse` (`chains[].congestion` and congestion-scaled `chains[].priorityFee`, see below; demo mode: `sim.scenario` = the `SIM_SCENARIO` preset id) |
| GET | `/api/search` | `q` (name, symbol, token address, wallet address, KOL label), `chain?` (a chain or `all`) | `SearchResult` (max 20 tokens, 10 wallets) |

### Network congestion

Each chain has a simulated load level (`sim/congestion.ts`), advanced every 5s of sim time with the
seeded rng and published as `ChainMarketInfo.congestion = { level: 0..1, label }` on `/api/meta` and the
`market` channel:

- `fast` / `slow` = the chain's trades/s as EMAs with 60s / 30min time constants (both start at the first
  rate seen; during the start-up warm-up, which grows the market from nothing, `slow` follows `fast` so
  that ramp does not read as congestion); `surge = clamp((fast / slow - 1) / 2, 0, 0.5)`.
- Launch rush: on average every 30 min per chain `rush` jumps to `max(rush, U(0.5, 0.9))`, then decays as
  `e^(-t / 4min)`; while it lasts the chain also launches up to `1 + 2·rush` times as many tokens.
- `level = min(1, 0.15 + surge + rush)`; `label`: `normal` < 0.4 ≤ `busy` < 0.7 ≤ `congested`.
- `priorityFee` tiers (native) = base × `(1 + 3·max(0, level − 0.2))` (about 3x when congested), with
  `low` = 0.5x and `high` = 3x the `medium` base (sol 0.0001, bsc 0.0001, base 0.00001, eth 0.0008).

Swaps feel it (see Trading): landing latency grows with the level, and while `congested` a bid below the
current `low` tier can fail to land.

## Market data (analytics module)

| Method | Path | Query / body | Response |
|---|---|---|---|
| GET | `/api/:chain/trenches` | `filters?` = JSON `Partial<Record<TrenchesColumn, TokenFilters>>`, `limit?` (per column, default 60, max 100) | `TrenchesSnapshot` |
| GET | `/api/:chain/trending` | `window` (`StatWindow`, default `1h`), `sort?` (`TrendingSort`, default `hot`), `order?`, `filters?` JSON `TokenFilters`, `limit?` (default 100) | `TrendingSnapshot` |
| GET | `/api/:chain/new-pairs` | `filters?`, `limit?` | `TokenSummary[]` (migrated tokens, newest pool first) |
| POST | `/api/:chain/trenches`, `/api/:chain/trending`, `/api/:chain/new-pairs` | the same params as a JSON body, `filters` as an object (not a string) | as the GET twin (for exclusion lists too long for a URL) |
| GET | `/api/:chain/tokens/:address` | | `TokenDetail` |
| GET | `/api/:chain/tokens/:address/candles` | `resolution` (`Resolution`, default `1m`), `limit?` (default 500, max 2000) | `CandleResponse` |
| GET | `/api/:chain/tokens/:address/trades` | `filter?` = `all\|buy\|sell\|dev\|smart\|kol\|sniper\|insider\|bundler\|whale\|fresh\|following\|mine`, `wallet?`, `minUsd?`, `limit?` (default 100, max 500), `before?` (ms), `beforeId?` | `Trade[]` newest first (paging: see below) |
| GET | `/api/:chain/tokens/:address/holders` | `tag?` (`all\|smart\|kol\|sniper\|bundler\|insider\|dev\|whale\|fresh\|bot\|sandwich\|top_holder\|following\|you`), `limit?` (default 100, max 500) | `Position[]` (curve/pool venue row first: `addrType` `curve` with a label in `wallet`, or `pool` with the pool address) |
| GET | `/api/:chain/tokens/:address/top-traders` | `tag?`, `sort?` = `pnl\|realized\|unrealized\|bought\|sold`, `order?`, `limit?` | `Position[]` |
| GET | `/api/:chain/tokens/:address/early-buyers` | | `EarlyBuyersResponse`: the first `EARLY_BUYERS_LIMIT` (70) distinct buyers by rank, and status counts |
| GET | `/api/:chain/tokens/:address/dev` | | `DevInfo` |
| GET | `/api/:chain/tokens/:address/signals` | `limit?` (default 200, max 500) | `Signal[]` newest first: the token's signals the chain's signal rings still hold (chart markers); later ones arrive on `token:<chain>:<address>` as `signals` |
| GET | `/api/:chain/wallets/:address` | | `WalletProfile` |
| GET | `/api/:chain/wallets/:address/holdings` | `includeClosed?` (`1`), `sort?` = `value\|pnl\|recent`, `limit?` (default 200, max 1000) | `TokenPositionRow[]` |
| GET | `/api/:chain/wallets/:address/activity` | `type?` = `all\|buy\|sell`, `limit?`, `before?`, `beforeId?` | `FeedItem[]` (with `positionEvent`; paging: see below) |
| GET | `/api/:chain/wallets/:address/created-tokens` | `limit?` (default 100, max 500) | `DevToken[]` newest first: tokens the wallet launched that still exist |
| GET | `/api/:chain/wallets/:address/calls` | `limit?` (default 50, max 200) | `WalletCalls` |
| GET | `/api/:chain/wallets/:address/risk` | | `WalletRiskReport` (risk check, see below) |
| GET | `/api/:chain/leaderboard` | `tag?` = `smart\|kol\|sniper\|whale\|all`, `period?` (`1d\|7d\|30d`), `sort?` = `pnl\|winRate\|volume\|tokens\|pnlRate`, `order?` = `desc\|asc` (default `desc`), `limit?` | `LeaderboardRow[]` |
| GET | `/api/:chain/feed` | `kind` = `smart\|kol\|follow\|all` (default `all`), `limit?` | `FeedItem[]` newest first, with `positionEvent` (`follow` 🔒) |
| GET | `/api/:chain/signals` | `kind?` (`SignalKind`), `limit?`, `quality?` (`1`: leave out `lowQuality` tokens), `before?` (ms: strictly older) | `Signal[]` newest first (token-level context below) |
| GET | `/api/:chain/callouts` | `filter?` (`CalloutFilter`: `all\|kol\|hits`, default `all`), `limit?` (default 100, max 500) | `Signal[]` (`kol_call`) newest first |
| GET | `/api/:chain/narratives` | | `Narrative[]` by heat |

Limits above the documented maximum are clamped; zero or non-numeric limits return 400. EVM addresses
are accepted in any case. To page token trades or wallet activity, pass the last row's trade as the cursor:
`before=<timestamp>&beforeId=<id>` continues right after that trade (many trades share a millisecond, so
`before` alone, which keeps only trades strictly older, skips the rest of a split millisecond). When the
cursor trade has left the server's history `before` applies alone; `beforeId` without `before` then returns
an empty page. Broadcast channels carry no viewer-relative tags (`you`, `following`) or remarks,
in their subscribe snapshot as in later pushes (only `feed:<chain>:follow` is per viewer): clients add them
locally; REST responses (search included) include them when a token is presented.

- `TokenSummary.initialLiquidityUsd` is the launch-time liquidity, or the pool's initial liquidity once
  migrated (`TokenDetail` inherits it).
- `TokenRef.rugRatio` / `riskLevel` (on feed items, holdings, signals, narratives, search) come from the
  token's latest security read, at most ~30s old. Always set by the server; optional in the type.
- List exclusions (blacklists): `TokenFilters.excludeAddresses` / `excludeCreators` (at most 500 each, 1-100
  characters per entry; EVM addresses compare case-insensitively) hide those tokens / tokens created by
  those wallets in Trenches, Trending and New Pairs, over REST and the list channels; `excludeKeywords`
  hides name / symbol matches. The server never applies a user's stored blacklist on its own: clients
  merge it into each list's filters. A JSON `filters` query param may be up to 64 KB; send a whole
  blacklist (or one per Trenches column) with the POST twins or a WS `sub` (messages up to 256 KB).
- `FeedItem.positionEvent` (wallet activity, Monitor feeds and the `feed` channel, portfolio activity) says
  what the trade did to the maker's position, read off the trade (`makerHoldRate` is the share held after
  it; dust = 1e-7 of supply): `open` = a buy from no (dust) balance (a first buy, or a re-entry after a
  close), `add` = a buy while holding, `reduce` = a sell that leaves a balance, `close` = a sell down to dust.
  `isFirstBuy` / `isClose` keep their meaning (only the very first buy is a first buy).
- Early buyers: the first 70 distinct wallets to buy the token (venue accounts never trade; a dev buy in
  the creation block is rank 1, with the `dev` tag), recorded at trade time with the size of that first buy, so reads are O(70).
  Each row: `rank`, wallet tags (token-relative + platform + viewer) and label, `firstBuyAt` and its `block`,
  totals over all its buys (`boughtUsd` incl. fees, `boughtTokens`), the bag now (`balance`, `holdRate`),
  `realizedPnlUsd`, `unrealizedPnlUsd` (balance × price − cost basis), and `status` against the first buy:
  `sold_all` (dust left), `sold_part` (less than the first buy), `added` (more), else `holding`.
  `summary` counts each status and sums the rows' `holdRate` (`holdRateTotal`). Wallets the simulator
  pruned drop out without renumbering.
- `TokenSecurity.safety` (every summary, list row and detail): see "Safety score" below.
- Signals (REST, the `signals:<chain>` and token channels, notifications) carry token-level context for the
  grouped feed: `firstTriggerMcUsd` (market cap at the token's first signal of any kind), `timesFired` /
  `timesFiredByKind` (signals the token fired so far, kept with the signal engine's per-token state),
  `cur` (`holders`, `top10` = top-10 share of supply, `liquidityUsd`, from the token's summary at most ~30s old)
  and `lowQuality` (the PRD §8.9 quality pre-filter: rug ratio > 0.3, wash trading or a honeypot). Always set
  by the server; optional in the type.
- `WalletProfile.createdTokenCount` counts the same tokens `/created-tokens` lists (launches the simulator
  has since deleted are left out of both).
- `WalletPeriodStats` (profile `stats`, leaderboard rows) measures volume the same way in every period:
  `buyVolumeUsd` is the fee-inclusive buy cost (the same as `totalCostUsd`; `avgBuyUsd` = cost / buys) and
  `sellVolumeUsd` the sell proceeds net of fees. `all` still counts positions in tokens the simulator has
  since deleted (realized PnL only).
- Calls: a call is a `kol_call` signal; it **hits** once `maxMultiple >= 2`. `/calls` returns the wallet's
  calls newest first plus `hitRate7d` / `hitRate30d` (hits / calls made in the window, 0 without calls) and
  `avgMaxMultiple` (mean over the last 30d, 0 without calls). Stats cover the caller's last 200 calls and
  still count calls on tokens the simulator deleted (those are left out of `calls`). `/callouts` reads the
  chain's last 1000 calls: `kol` keeps callers currently tagged `kol`, `hits` keeps calls that hit.

### Wallet risk check

`WalletRiskReport` (`/wallets/:address/risk`, wallet-side analytics `risk.ts`) flags what a viewer should know before
following or copying a wallet, from observable data only. `flags` come in a fixed order, each with `level`
(`ok` / `warn` / `bad`, or `unknown` when there is nothing to judge: never shown as a pass), a display `value`,
the `count` behind it, `rate` (its share of the sample, null when none applies), the `definition` clients show
in a tooltip, and up to 5 `addresses`. `level` is `high` with any `bad` flag, `medium` with any `warn`, else `low`.

- `phishing` (address poisoning): native transfers under $0.01 received from an address whose first and last 4
  characters (after `0x`, case-insensitive, on EVM) match a wallet it really transacted with: its funder or one
  of its last 6 non-dust transfer partners (either direction). `warn` from 1, `bad` at 5+ or from 2+ distinct
  look-alikes; `addresses` = the look-alike senders (clients never offer them for copying). The last 50 dust
  transfers per wallet are kept. `unknown` in live mode (native transfers are not indexed there yet).
- `wash`: tokens in the wallet's recent trades (activity ring: 100, 1000 for accounts) bought and sold back within
  60s at least twice (the token page's wash-volume rule). `warn` from 1 token, `bad` at 3+ tokens making 30%+
  of the tokens sampled.
- `flagged_funder`: the wallet's first funder launched tokens classed as rugged (`DevToken.rugged`). `warn` at 1,
  `bad` at 2+; `addresses` = the funder; `unknown` without a funding link.
- `new_large`: first funded < 24h ago and already put $2K+ (fee-inclusive buys, all time) into tokens; `bad` at
  $10K+; `unknown` when the wallet's age is unknown (live wallets seen only through their trades).
- `serial_rugger`: its own launches classed as rugged, `warn` at 1, `bad` at 3+.
- `honeypot`: tokens traded whose contract blocks selling; `bad` above 10% of tokens traded.
- `fast_trades`: share of its last 100 round trips (first buy to first sell of a token) closed within 5s;
  `warn` above 10%, `bad` above 30%.

In the simulator, address poisoners spray dust (0.6 campaigns per minute on Solana, scaled per chain, 3-12
wallets each) from one look-alike per exchange hot wallet to wallets that wallet funded.

### Safety score

`TokenSecurity.safety = { score, band, coverage, reasons }` is derived deterministically from the other
security fields (formula in `analytics/tokens/security.ts`, after PRD §8.6.1 without the price section):

- Deductions in two sections; within a field only its worst tier applies:
  - contract: SOL mint authority active 25, freeze authority active 20; EVM source not verified 15,
    ownership not renounced 8; max(buy, sell) tax > 10% 25 / > 5% 10; migrated with < 95% of LP burned 12.
  - holders: top 10 > 50% 25 / > 30% 14 / > 20% 6; dev holds > 5% 20 / > 2% 10; bundler volume share
    > 30% 20 / > 15% 10 / > 5% 4; snipers hold > 15% 15 / > 5% 6; insiders hold > 5% 12 / > 1% 5; bots
    > 70% 12 / > 50% 6 and fresh wallets > 50% 8 of holders; wash trading 10.
- `score = 100 − 0.5625·min(100, contract) − 0.4375·min(100, holders)` (the PRD weights renormalised
  without the price section), capped (the lowest cap applies: honeypot 0; SOL mint or freeze authority
  active 25; `rugRatio` ≥ 0.5 59, ≥ 0.3 79; EVM honeypot or verification flag unknown 79; EVM pool LP
  < 95% burned 79), then rounded.
- `band`: a hard gate (honeypot, or an active SOL mint / freeze authority) is `danger`; otherwise coverage
  < 0.5 is `unknown`; otherwise `safe` ≥ 70, `caution` 40-69, `danger` < 40.
- `coverage` (0..1, 2 decimals) = known / applicable checks: SOL mint + freeze or EVM honeypot + source +
  owner, tax, LP once migrated, the 7 holder checks (known once anyone holds the token), wash trading and
  the rug ratio.
- `reasons`: one per field (`key` = the `SecurityCheck` key: `mint`, `freeze`, `honeypot`, `open_source`,
  `renounced`, `tax`, `lp`, `top10`, `dev`, `bundlers`, `snipers`, `insiders`, `bots`, `fresh`, `wash`, `rug`,
  or `unverified` for unknown EVM flags), with a display `label`, `level` `warn` / `bad` and `impact` = points
  × section weight (scaled down when a section passes 100) plus whatever the binding cap removed, rounded
  to 0.1. Largest impact first, at most 6 (when more apply: the 5 largest and one `key: 'other'` reason,
label "N more checks", carrying the rest); impacts add up to `100 − score` (before rounding, unless
  the score floors at 0).

## Accounts (accounts module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/guest` | `{ referralCode? }` | `AuthResponse` (instant paper account; `account.isGuest` true) |
| POST | `/api/auth/register` | `{ username, password, referralCode? }` | `AuthResponse` (called with a guest's token, upgrades that guest in place; a code binds only before the account's first trade, so a guest that already traded keeps `referredBy: null`) |
| POST | `/api/auth/login` | `{ username, password }` | `AuthResponse` (401 `invalid_credentials` for a wrong username or password; a 🔒 endpoint's 401 for a missing or revoked session is `unauthorized`) |
| POST | `/api/auth/logout` 🔒 | | `{ ok: true }` |
| GET | `/api/me` 🔒 | | `Account` |
| GET | `/api/settings` 🔒 | | `UserSettings` |
| PUT | `/api/settings` 🔒 | deep-partial `UserSettings` | `UserSettings` |
| POST | `/api/wallet/faucet` 🔒 | `{ chain }` | `UserWallet` (tops the paper wallet back up to the starter balance; 1/min/chain) |
| GET | `/api/follows` 🔒 | `?chain=` | `FollowedWallet[]` (`label` / `tags`: the wallet's current public label and platform tags) |
| POST | `/api/follows` 🔒 | `{ chain, address, remark?, group?, notify? }` | `FollowedWallet` |
| PATCH | `/api/follows/:chain/:address` 🔒 | `{ remark?, group?, notify? }` | `FollowedWallet` |
| DELETE | `/api/follows/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/watchlist` 🔒 | | `WatchlistResponse` `{ items: WatchlistItem[], tokens: TokenSummary[], groups: WatchlistGroup[] }` |
| POST | `/api/watchlist` 🔒 | `{ chain, address, groupIds?, note? }` | `WatchlistItem` (adding a listed token applies `groupIds` / `note` to it) |
| PATCH | `/api/watchlist/:chain/:address` 🔒 | `{ groupIds?, note? }` | `WatchlistItem` |
| DELETE | `/api/watchlist/:chain/:address` 🔒 | | `{ ok: true }` |
| GET | `/api/watchlist/groups` 🔒 | | `WatchlistGroup[]` by `order` |
| POST | `/api/watchlist/groups` 🔒 | `{ name, color? }` | `WatchlistGroup` (appended last) |
| PATCH | `/api/watchlist/groups/:id` 🔒 | `{ name?, color?, order? }` (`color: null` removes it) | `WatchlistGroup` |
| DELETE | `/api/watchlist/groups/:id` 🔒 | | `{ ok: true }` (its items stay listed, without that group) |
| GET | `/api/blacklist` 🔒 | | `Blacklist` `{ tokens, creators, keywords }` |
| POST | `/api/blacklist` 🔒 | `{ kind: 'token'\|'creator'\|'keyword', chain?, value }` | `Blacklist` |
| DELETE | `/api/blacklist/:kind/:value` 🔒 | `?chain=` (tokens / creators; any chain when omitted) | `Blacklist` (404 when nothing matched) |
| GET | `/api/notifications` 🔒 | `?limit=` | `AppNotification[]` newest first |
| POST | `/api/notifications/read` 🔒 | `{ ids? }` (all when omitted) | `{ ok: true }` |
| GET | `/api/rewards` 🔒 | | `RewardsSummary` |

Watchlist groups (`WATCHLIST_LIMITS`): at most 20 per account; names 1-24 characters after trimming,
without control / invisible characters, unique ignoring case (409 `duplicate`), and never "All": the
"All" tab is implicit (every item) and never stored. `color` is `#rrggbb` (stored lower-cased). `order` is
the 0-based position; PATCHing it moves the group there and renumbers the others. Items file under any
number of groups (`groupIds`, duplicates dropped, unknown ids 400); an empty list or a blank `note` (at
most 140 characters) removes the field. Groups and notes persist in the accounts snapshot.

Blacklist (`BLACKLIST_LIMITS`): up to 500 tokens, 500 creators and 50 keywords, newest first. Tokens and
creators need `chain` and must exist on it (404 otherwise); EVM addresses are stored lower-cased. Keywords
are stored trimmed, lower-cased and without a leading `$` (1-32 characters). Re-adding an entry is a no-op.
The server stores the lists; clients apply them through `TokenFilters` exclusions (see Market data).

`AppNotification.level` tells toasts the outcome: `success` for fills (orders, copies, snipes, a launch
graduating), `error` for failed trades and a paused copy task; absent for neutral notices.
`RewardsSummary.referralLink` is relative (`/?ref=CODE`); clients prefix their own origin.

Guest and register calls are limited per client IP (`ACCOUNT_CREATIONS_PER_IP` per 10 minutes, 429 with
`retry-after`). Logins are limited per client IP (`LOGIN_ATTEMPTS_PER_IP` per 10 minutes, whatever the
username) and to 10 attempts per username per client IP per 10 minutes (429 with `retry-after`), counted
whether or not the username exists; a correct password from another address is not locked out. While the
server's password-hashing queue is full, login and register answer 503 `busy` with `retry-after: 1`.
Guest accounts idle for 30 days (no sign-in, authenticated request or fill) are deleted with their paper
wallets and sessions, unless they still have open orders, copy-trade or sniper tasks, alerts, invitees, a
token they launched, or a wallet someone follows.
Logging out also revokes the session on open WebSockets (the socket receives `{ op: 'auth', ok: false }`
and loses the `user` channel).

## Trading (trading module)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/trade/quote` 🔒 | `QuoteRequest` | `Quote` (400 `quote_unavailable` when the trade cannot be priced) |
| POST | `/api/trade/swap` 🔒 | `SwapRequest` | `SwapReceipt` (200 with `ok:false` + `error` for trade-level failures like slippage; 429 `rate_limited` with `retry-after` past 10 manual swaps per account per second) |
| POST | `/api/trade/initials` 🔒 | `SellInitialsRequest` `{ chain, token, presetId? }` | `SellInitialsQuote` (read-only sizing of "sell initials", see below) |
| GET | `/api/orders` 🔒 | `?status=open\|history&chain=&token=` | `Order[]` |
| POST | `/api/orders` 🔒 | `CreateOrderRequest` | `Order` |
| DELETE | `/api/orders/:id` 🔒 | | `Order` |
| GET | `/api/portfolio` 🔒 | `?chain=all\|sol\|...` | `PortfolioSummary` (positions carry `walletRole`) |
| GET | `/api/portfolio/activity` 🔒 | `?chain=&limit=` | `FeedItem[]` |
| GET | `/api/portfolio/calendar` 🔒 | `?chain=all\|sol\|...` | `PortfolioCalendar` `{ chain, days }`: daily realized PnL over the last 30 UTC days (oldest first), the wallet page's calendar series (`stats['30d'].dailyPnl`) summed over the account's wallets on those chains, bundle wallets included |
| GET/POST | `/api/copytrade` 🔒 | POST body: `Omit<CopyTradeTask,'id'\|'createdAt'\|'stats'\|'consecutiveFailures'>` | `CopyTradeTask[]` / `CopyTradeTask` |
| PATCH/DELETE | `/api/copytrade/:id` 🔒 | PATCH: partial task | `CopyTradeTask` / `{ ok: true }` |
| GET/POST | `/api/sniper` 🔒 | POST body: `Omit<SniperTask,'id'\|'createdAt'\|'buysDone'\|'lastTriggeredAt'>` | `SniperTask[]` / `SniperTask` |
| PATCH/DELETE | `/api/sniper/:id` 🔒 | | `SniperTask` / `{ ok: true }` |
| GET/POST | `/api/alerts` 🔒 | POST body: `Omit<AlertRule,'id'\|'createdAt'\|'lastTriggeredAt'>` | `AlertRule[]` / `AlertRule` |
| PATCH/DELETE | `/api/alerts/:id` 🔒 | | `AlertRule` / `{ ok: true }` |

Holding alerts (`AlertRule.kind: 'holding'`, PRD §9.4): `holding` = `HoldingAlertSpec { basis ('vs_cost' default |
'5m_change'), upPct (default 20), downPct, devSell, liquidityDropPct, minPositionUsd (default 10), cooldownMin
(default 60, 1-10080) }`, at least one trigger on (null = off; drops at most 100%). The rule watches every
position the account's chain wallet holds (or only `token`, which must exist on the chain), positions worth less
than `minPositionUsd` excluded. Every second: `vs_cost` compares the position's value with its cost basis
(average cost incl. fees), `5m_change` uses the token's 5-minute price change; `upPct` / `downPct` fire while the
move is at least that big; `liquidityDropPct` fires while liquidity is that far below its high since the rule
started watching the position. On trades: `devSell` fires when the creator or a dev-team wallet sells at least 20%
of its bag in one trade (not the account's own sells). Each (position, trigger) fires again only after
`cooldownMin` (repeating rules); `repeat: false` switches the rule off after its first notification. A closed
position is forgotten, so a re-entry starts a fresh watch. Notifications are `kind: 'alert'` with the token
("$PEPE up 52% vs your cost", "Dev sold 60% of their $PEPE", "$PEPE liquidity down 45%"). Holding rules count
toward the 100 alerts per account.

Signal subscriptions (`AlertRule.kind: 'signal_subscription'`, PRD §9.4): `signals` =
`SignalSubscriptionSpec { name (<= 40), groups: SignalFilterGroup[] (1-5), maxPerHour (1-120, default 30) }`;
`token` / `wallet` are null. A fired signal matches when any group does; inside a group every set bound must
hold (inclusive, null = open): `kinds` (empty = any), `mcMin` / `mcMax` (market cap now), `triggerMcMin` /
`triggerMcMax` (market cap at the signal), `minLiquidityUsd`, `minHolders`, `maxTop10` (0..1), `minSmart`
(smart-money holders), `minAgeMin` / `maxAgeMin` (token age), `launchpads` (ids on the rule's chain, 400
otherwise), `excludeRisk` (default true: skip `lowQuality` tokens). A bound on a value the server cannot
read never passes. Rules are indexed by (chain, kind); matching starts once the engine is live (never during
warmup). Delivery is in-app (`notification` on `user`, `kind: 'signal'`, `token` = the token): a token's
first match goes out within a second; matches on it within 60s of that notification are merged into the next
one ("$PEPE: Smart money buy · KOL buy", body = the latest detail, its market cap, "· N signals" when merged,
and the subscription's name). Past `maxPerHour` notifications in the last hour, matches are dropped. `repeat:
false` switches the rule off after its first notification, like other alerts.

Sell initials (`/api/trade/initials`): the sell that takes out what the position cost and leaves the rest
as a free ride. The target is the PnL engine's cost basis of the tokens still held (`costBasisUsd`: average
cost incl. platform and network fees, already reduced by earlier sells), in native at the rate the position
was bought at (`targetNative = costBasisUsd × boughtNative / boughtUsd`, exact for a single buy). The sale is
priced like a manual sell with `presetId` (default: the active sell preset): venue curve or pool, sell tax,
platform fee and the preset's network fee. `status`: `ok` with `tokens` = the smallest amount whose net
proceeds (`expectedOutNative`) reach the target (`sellRate` = tokens / balance); `under_water` when selling
the whole bag would return less (`exitValueNative` < `targetNative`); `no_position`; `nothing_to_recover`
(no cost basis). Nothing is sold: clients place it as a swap with `amountKind: 'tokens'`, so the usual
slippage check applies and a price move before it lands changes what comes back.

Landing under congestion: the simulated confirmation latency (120-600ms, +150ms anti-MEV) is stretched
× `(1 + 3·max(0, level − 0.2)·w)`, with `w` = 1 for a bid (priority fee, plus the tip on the anti-MEV route)
below the current `medium` tier, 0.5 below `high`, 0.25 at or above it. While the chain is `congested`, a
bid below the current `low` tier fails to land with probability `0.25 + (level − 0.7)` (25-55%): a 200
receipt with `ok: false` and `error` `"transaction expired: priority fee too low for current congestion"`;
nothing is charged. Orders, copy trades and snipes go through the same path. Draws use the sim rng.

Portfolio: rows are the account's open positions with `walletRole: 'main'` (its chain wallet) or `'bundle'`
(a bundle wallet of one of its launches: same token, separate row and `wallet`). Bundle wallets count
everywhere in the summary: native balance, holdings value, realized / unrealized PnL and the equity curve.
`winRate` = tokens with positive total PnL (open or closed, the bundles' bags merged into their token) /
tokens traded.

Copy trading pauses itself: `CopyTradeTask.consecutiveFailures` counts failed copies in a row (a
successful copy resets it); at `COPY_AUTO_PAUSE_FAILURES` (3) the task is disabled and the owner gets a
`copytrade` notification (`level: 'error'`) naming the last error. Re-enabling it (PATCH `enabled: true`)
resets the count. A target buy that completes the curve is skipped (nothing is tradable until the pool
opens), without a notification or a failure. So is a mirror sell too small for its proceeds to cover the
fees: its share stays with the task and leaves with a later mirror sell or the target's exit. Mirror sells only touch tokens the task bought: any sell from
the account's wallet (by hand, a strategy leg) caps what the task still holds at the wallet balance, and a
target sell that lands while a copy buy is still confirming is applied to that buy when it lands.

Exit strategies (`SwapRequest.strategy`): take-profit legs and a trailing leg's activation measure from
the fee-inclusive cost per token of the fill, never below the spot price right after it; stop-loss legs
from the average fill price without tax and venue fee, never above that spot; an immediately armed
trailing stop starts its peak at that spot (`Order.refPriceUsd` / `peakPriceUsd`). Percent sells
(strategy legs, orders, `amountKind: 'percent'` swaps) size themselves from the holding minus what sells
still in flight will take, so two "sell 50%" legs that trigger together leave 25%; a sell that lands after
another sell of the same bag landed first sells what is left, its `minOut` scaled to that share. A dev-sell exit never
fires on sells by its own account's wallets (a launcher's own sells).

## Token launch (trading module)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/launch/config` | | `LaunchConfig`: launchpad curves per chain (graduation market cap at the current native price), `launchFeeNative`, `glyphs` + `glyphNarratives`, `reservedTickers`, `limits` |
| POST | `/api/launch` 🔒 | `LaunchRequest` | `LaunchResponse` `{ token: TokenDetail, receipts: SwapReceipt[] }` |

Reserved tickers (`LaunchConfig.reservedTickers`): well-known memecoins, the chains' native and stable
assets (`SOL`, `ETH`, `BNB`, `USDC`, `USDT`, `WETH`) and the brand (`TRENCH`, `TRENCHSCOPE`). A symbol, or a
name, is refused (`symbol: this ticker is reserved` / `name: this name is reserved`) when it reads as one
after folding: compatibility forms decomposed (NFKD: full-width, math alphanumerics, ligatures), accents
dropped, Cyrillic / Greek / small-capital look-alikes mapped to Latin, then upper-cased with everything but
A-Z0-9 removed (so `Ѕ.О.L`, `ＵＳＤＴ`, `ΒΝΒ` and `Trеnch Ѕcope` are all refused; `Solar` is fine).

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
  exits (`source: 'strategy'`), created once the whole creation block has filled, so they measure from the
  price after the bundle buys (the launcher's own buys never trip them). Fills are pushed on `user` like
  any swap.
- Bundle wallets follow the launcher out: whenever the account sells a token it launched, each bundle
  wallet sells the same share of its bag (a `fill` on `user` for each, like their launch buys) and the
  proceeds return to the account's wallet.
- The simulated market adopts the launch: snipers, smart money, KOLs and retail trade it like their own
  launches, and its hidden outcome leans on what the launch shows (socials, description, a 1-6% dev buy
  help; a heavy dev bag hurts; bundles draw snipers and flippers). Scripted dev-side dumps never sell the
  launcher's or its bundles' tokens. When the token migrates the launcher gets a `system` notification
  (`level: 'success'`). Launched tokens are never pruned.
- At most 5 launches per account per hour (429 `rate_limited`, `retry-after` = seconds until the oldest
  launch of the hour ages out).

## WebSocket `/ws`

Client → server: `WsClientMessage` (`auth`, `sub`, `unsub`, `ping`). Server → client: `WsServerMessage`.
A `sub` gets an `ack` and normally an immediate snapshot `data` message. Re-sending `sub` for the same
channel replaces its params (the old subscription is dropped only once the new one is in, so nothing
buffered for the channel is lost). A connection's messages are handled one at a time, in order.

Limits: channel names are exact (`market`, `user`, `trenches:<chain>`, `trending:<chain>`,
`newpairs:<chain>`, `signals:<chain>`, `feed:<chain>:<kind>`, `token:<chain>:<address>`; extra segments
are rejected); at most 300 subscriptions per connection (`error` "at most 300 subscriptions per
connection"), whose params may total at most 1024 KB of JSON (`error` "subscription params over 1024 KB
per connection"; a whole blacklist in every list filter fits); params nested deeper than 16 levels are
rejected; a frame that is not a JSON object with a string `op` gets
`{ op: 'error', message: 'invalid message' }`. At most `WS_CONNECTIONS_PER_IP` (20) sockets per client
IP (local loopback clients exempt); extra sockets are closed with code 1008. Only frames over 16 KB are
compressed (permessage-deflate). Backpressure: while over 2 MB of a socket's frames are unsent it misses
public pushes (the next snapshot repairs them), but never `user` events; a socket over 8 MB behind when
one is due is closed, so the client reconnects and resyncs. Liveness: the server pings every
15 s and closes sockets that sent nothing (a pong counts) for 45 s, or whose send buffer stayed over
2 MB for 15 s. Clients should check the other direction too: the web client pings every 10 s and drops
(and reconnects) a socket that delivered no frame at all within 5 s of a ping, since a half-open
connection can stay open for minutes. Address segments of channel names (`token:<chain>:<address>`,
`wallet:<chain>:<address>`) must be in the server's canonical form (EVM lower-case), unlike REST paths;
the web client normalizes them.

| Channel | `type` | Payload | Cadence / params |
|---|---|---|---|
| `market` | `market` | `ChainMarketInfo[]` (with `congestion`) | every 5s |
| `trenches:<chain>` | `trenches` | `TrenchesSnapshot` | every 1s; params `{ filters?, limit? }` (as REST; filters as an object) |
| `trending:<chain>` | `trending` | `TrendingSnapshot` | every 2s; params `{ window, sort?, order?, filters?, limit? }` |
| `newpairs:<chain>` | `newpairs` | `TokenSummary[]` | every 2s; params `{ filters?, limit? }` |
| `token:<chain>:<address>` | `token` | `TokenDetail` | every 1s while trades happen |
|  | `trades` | `Trade[]` (oldest first within batch) | batched ~250ms |
|  | `candle` | `{ resolution, candle: Candle }` | on change; params `{ resolution }` |
|  | `signals` | `Signal[]` | when the token fires a signal (chart markers) |
| `feed:<chain>:<smart\|kol\|follow\|all>` | `feed` | `FeedItem[]` | batched ~500ms (`follow` needs auth) |
| `signals:<chain>` | `signals` | `Signal[]` | on trigger |
| `wallet:<chain>:<address>` | `trades` | `Trade[]` | batched ~500ms |
| `user` (auth) | `notification` | `AppNotification` | on event |
|  | `order` | `Order` | on create/fill/cancel/fail |
|  | `balance` | `UserWallet` | after the wallet's native balance changes |
|  | `fill` | `SwapReceipt` | after any swap executed for the user (manual, order, copy, snipe) |

## Security headers

Every response (API, errors and the served SPA) carries:

- `content-security-policy`: `default-src 'self'`; `script-src 'self'` plus the `'sha256-…'` hash of each
  inline `<script>` in the built `index.html` (computed at startup from `WEB_DIST`; the theme bootstrap);
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (style attributes in component and chart
  markup); `font-src 'self' https://fonts.gstatic.com data:`; `img-src 'self' data: blob:`;
  `connect-src 'self' ws: wss:`; `manifest-src 'self'`; `worker-src 'self'`; `object-src 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.
- `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`,
  `x-frame-options: DENY`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.

A rebuilt `index.html` with a changed inline script needs a server restart to pick up its hash.
