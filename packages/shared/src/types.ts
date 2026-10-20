// Trenchscope API contract: domain + DTO types shared by server and web.
// Field naming is camelCase; comments note the closest GMGN field where one
// exists so analytics stay comparable with the reference product.
// Conventions:
//   - timestamps are epoch milliseconds
//   - "rate"/"ratio" fields are 0..1 fractions (format with formatPercent)
//   - USD amounts end in "Usd"; native-asset amounts end in "Native"
//
// The contract is split by domain under ./types/ and re-exported from here, so
// '@trenchscope/shared' and './types' keep exporting every name:
//   common   sides, stat windows, resolutions, wallet periods, lifecycle / tag enums,
//            trade preset ids, ApiError, Paged
//   tokens   token summaries / details, security, holders, trades, candles, early
//            buyers, narratives, search; "Lists & filters"
//   wallets  wallet profiles, risk flags, leaderboard, followed wallets, Monitor feed,
//            signals and signal subscriptions, wallet calls
//   trading  quotes, swaps, sell initials, orders, strategies, portfolio, copy trade,
//            sniper, alerts; "Token launch ("Cooking")"
//   account  accounts, settings and trade presets, watchlist, blacklist,
//            notifications, rewards
//   live     server meta (mode, chain market info, live status); "Live mode: funding,
//            withdrawals and account security" (endpoints, rules, error codes)
//   ws       "Realtime protocol (WebSocket at /ws)": channels and messages
// Contract changes are additive; a rename keeps a deprecated alias (docs/BUILD-PLAN.md §3).

export * from './types/common';
export * from './types/tokens';
export * from './types/wallets';
export * from './types/trading';
export * from './types/account';
export * from './types/live';
export * from './types/ws';
