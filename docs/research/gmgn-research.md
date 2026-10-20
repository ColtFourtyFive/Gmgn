# GMGN research dossier

> Engineering reference for Trenchscope, our own web-only spinoff. It covers what GMGN (gmgn.ai) is, every surface it ships, each feature's data fields, formulas, thresholds, enums and classification rules (exact field names kept), plus the competitive landscape, a glossary and sources.
>
> **Compiled:** 2026-10-20. **Product spec:** see [`docs/PRD.md`](../PRD.md). This file is research only. Never copy GMGN names, logos, colours or marketing copy into the product.

**Contents:** 0 Conventions · 1 What GMGN is · 2 Chains · 3 Shell & routes · 4 Discovery (Trenches, Trending, tags, Hot, Search, Watchlist, Heat rank) · 5 Token page · 6 Trading & execution · 7 Wallet analytics · 8 Tracking, social, alerts · 9 Signals · 10 Accounts & business · 11 UI language · 12 Internal API & WebSocket · 13 Launchpad mechanics · 14 Holder-metric derivations · 15 PnL accounting · 16 Data sourcing & execution backend · 17 Competitive landscape · 18 Glossary · 19 Open questions · 20 Sources

## 0. How to read this document

### 0.1 Confidence markers

| Marker | Meaning |
|---|---|
| **[P] primary** | Read directly from GMGN's own published npm package `gmgn-cli@1.6.7` (its `dist/` code and its `skills/*/SKILL.md` and `references/*.md` files). These are the most reliable facts here: exact endpoint paths, field names, enums, defaults, and measured data quirks written by GMGN's own engineers. |
| **[S] secondary** | GMGN docs (docs.gmgn.ai, read through search snippets or dated GitHub mirrors), GMGN blog and X posts, third-party reviews, YouTube walkthroughs, live-DOM fixtures and selectors in third-party GMGN browser extensions, and third-party code that calls GMGN's internal web API. |
| **[I] inferred** | Our reconstruction or recommendation where GMGN publishes nothing. These are design proposals, not GMGN facts. |

### 0.2 Research limits

- gmgn.ai and docs.gmgn.ai, along with most vendor doc domains, could not be reached directly from the research sandbox (DNS/proxy). The web-search budget ran out partway through. Doc content therefore came from search snippets, dated mirrors (`github.com/Amal-David/docingest`, captures from 2025-11 to 2026-08) and third-party research files.
- All fee percentages, referral tiers, chain lists and launch dates from third parties must be re-verified before they appear in any marketing comparison.
- GMGN's internal web API is undocumented. Its shapes come from third-party code dated 2024 to Oct 2026, and paths drift.

### 0.3 Units and conventions used by GMGN (apply everywhere) [P]

- Every rate is a **fraction from 0 to 1**, including fields whose names end in `_percentage` (`"0.2609"` = 26.09%). Multiply by 100 only for display. `rug_ratio` is 0–1 and must never be multiplied twice.
- Numbers are often **decimal strings**. Parse with `parseFloat` for display and use decimal arithmetic for money.
- **Absent, null or `""` means unknown**, never 0 or false. On `buy_tax`, `"0"` means a real 0% while `""` means untested.
- Timestamps are Unix **seconds**, except order objects (ms), call-outs `create_time` (ms) and kline `time` (disputed: documented as s, measured as ms).
- PnL ratios are multipliers: 1.5 = +150%, 0 = break-even, −0.5 = −50%.
- `price_{w}` (for example `price_5m`) is the **price at the start of window w**, not a percent change. Change = `price / price_w − 1`.
- `liquidity` in rank and search rows is the **sum of both pool sides** (about 2× one-sided depth).
- Metric coverage varies by chain. A chain-wide metric that is missing must render as `n/a`, never `0%`.

---

## 1. What GMGN is

GMGN ("GMGN.AI — The Fastest Multi-Chain Meme…") is a **multi-chain memecoin trading terminal** built around launchpad bonding-curve tokens. It has five pillars:

1. **Discovery.** *Trenches* is a three-column live board of launchpad tokens (New → Almost bonded → Migrated). Alongside it sit *Trending* (rankings by swap activity), *Hot searches* (rankings by visit heat), a *Signals* feed of 21 event types, an omnibox search and a watchlist.
2. **Due diligence.** The token page has a TradingView-style chart, a contract-security audit, and a holder-structure audit covering top-10, dev, insiders/"rat traders", snipers, bundlers, phishing, fresh wallets, bots and "vanish". It also has wallet-class tags on every trader row, dev history, and a bubble map.
3. **Execution.** One-click quick-buy, P1/P2/P3 fee presets, anti-MEV routing, limit orders, TP/SL and trailing exits, Dev-sell and Migration triggers, copy trading, the SnipeX social sniper, multi-wallet batch trading and token launch ("cooking"). Trades go through custodial server-held trading wallets.
4. **Tracking and social.** Smart Money, KOL and followed-wallet live feeds, a Monitor square that shows inflow from followed wallets, cluster/convergence signals, call-outs (喊单) and paid declarations (宣言), an X (Twitter) tracker, and wallet and price alerts delivered over web, push and Telegram.
5. **Wallet intelligence.** Wallet pages with PnL, win rate, PnL distribution buckets, a phishing check, holdings and activity. A global tag taxonomy (`smart_degen`, `renowned`, `sniper`, `fresh_wallet`, …) feeds leaderboards for copy-trade discovery.

**Business model [S]:** a flat ~1% fee on every buy and sell, a referral rebate of 10–30% of referees' fees, a points programme ("Credits", earned only by trading), paid pinned call-outs (Declarations), and paid API plans (Free/Plus/Pro). Distribution runs through the web app (core), per-chain Telegram trading bots and alert bots, a mobile app, and an AI-agent CLI and skills package (`gmgn-cli`, 15+ skills, Ed25519-signed OpenAPI at `https://openapi.gmgn.ai`).

**Tech signals [S]:** Next.js (Pages Router) and React, Tailwind with semantic tokens, a partial Chakra UI layer, an in-house `pi-` component kit, Sentry, react-virtuoso virtual lists, a TradingView chart, and a SharedWorker multiplexing WebSockets across tabs. The default font is Geist.

---

## 2. Chains and capability matrix

### 2.1 Chain ids [P]

- **Tradable (CLI `VALID_CHAINS`):** `sol, bsc, base, eth, arbitrum, hyperevm, robinhood, arc, stable`. `monad` is present but commented out.
- **Read-only (call-outs, search):** `tron, monad, megaeth, xlayer`, for 13 in total. `CALLOUT_CHAINS` is `sol,bsc,eth,base,megaeth,hyperevm,tron,monad,xlayer,robinhood,arbitrum,arc,stable`.
- **Search** accepts any `/^[a-z][a-z0-9_]{1,19}$/`. Omit `chain` to search everything; `chain=all` upstream returns empty.
- **Address formats:** SOL base58 `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`. All EVM chains use `/^0x[0-9a-fA-F]{40}$/`, and the client lower-cases EVM addresses.
- **Web UI (2026) [S]:** a multi-select chip row whose defaults are Solana, BSC and Hood (Robinhood). Twelve meme chains are available, and mixed lists show a chain badge on each avatar. "Fusion" mode marks each row with a per-chain colour stripe whose colour the user can customise.

### 2.2 Feature availability [P]

| Chain | Swap | Limit | TP/SL (condition orders) | smart_trade V1 | Signals | KOL/SM feed | Cooking | Anti-MEV |
|---|---|---|---|---|---|---|---|---|
| sol | Y | Y | Y | Y | Y | Y | pump, bonk, bags | Y (off/normal/secure) |
| bsc | Y | Y | Y | Y | Y | Y | fourmeme, flap | Y on swap, **N on cooking (400)** |
| base | Y | Y | Y | Y | N | Y | klik, clanker | **N** |
| eth | Y | Y | Y | Y | N | Y | N | Y (+`gas_level`, `auto_fee` ETH-only) |
| robinhood | Y | Y | Y | Y | Y | Y | trench, pons (native only) | ? |
| arbitrum, hyperevm | Y | Y | validator allows; undocumented | **N (V2 only)** | N | Y | N | ? |
| arc, stable | Y | **limit_order only** | **N** | **N** | Y | Y | N | ? |

### 2.3 Currencies, fees and block times

- **Currency tokens [P]:**
  - sol: SOL `So11111111111111111111111111111111111111112`, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - bsc: BNB `0x0000…0000`, USDC `0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d`
  - base: ETH `0x0…0`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - eth: ETH `0x0…0`
- **Fee minimums [P]:**
  - SOL `priority_fee` ≥ 0.00001 SOL (cooking ≥ 0.0001); `tip_fee` SOL ≥ 0.00001, BSC ≥ 0.000001 BNB.
  - `gas_price` BSC ≥ 0.05 gwei, BASE/ETH ≥ 0.01 gwei.
  - EIP-1559 minimums: BSC 50,000,000 wei; BASE/ETH 200,000 wei.
- **Block times (simulator clock):**
  - SOL slot ~400 ms [I]; BSC ~0.45 s after Fermi (0.75 s Maxwell, 1.5 s Lorentz) [S]; Base 2 s with 200 ms flashblocks [S]; ETH 12 s; Arbitrum ~0.25 s [I]; Robinhood ~100 ms [S].
  - Arc is a Circle L1 with USDC as gas (18 dp native, 6 dp ERC-20) [S]. Stable (chain 988) uses USDT0 as gas [S].

### 2.4 Measured per-chain field coverage [P]

Share of rows carrying a non-zero value:

| Field | sol | bsc | robinhood | base | eth |
|---|---|---|---|---|---|
| bot_degen_rate | 100% | 100% | 100% | 0% | 0% |
| bundler_rate | 92% | 70% | 62% | 0% | 0% |
| rug_ratio | 95% | 0% | 0% | 18% | 0% |
| bluechip_owner_percentage | 38% | – | – | – | – |
| visiting_count | 97% | 95% | 96% | 49% | 21% (arc 10%, stable 21%) |
| dev_team_hold_rate | 38% | 5–21% (range across other chains) | 5–21% | 5–21% | 5–21% |

Holder counts cannot be compared across chains, because app-account chains such as robinhood inflate them. `entrapment_ratio` has a median of 0.07 on sol and 0.88 on eth, so no absolute cut works across chains. About 3% of base/eth values fall outside [0,1].

---

## 3. Global shell, routes and navigation

### 3.1 Routes [S]

Primary nav, left to right: **Trenches (`/`)**, **Trending (`/trend`)**, **CopyTrade (`/copytrade`, older `/trade`)**, **Monitor (`/monitor`)**, **Track (`/follow`)** and **Portfolio (`/portfolio`)**. Rewards/Referral lives at `/referral?chain=` and may be a 7th nav item or sit in the account menu.

| Route | Purpose |
|---|---|
| `/{chain}/token/{address}` | Token page. Query `?tab=holders\|holder\|top_trader\|dev_token`, `?activityTag=kol`, `?symbol=` |
| `/{chain}/address/{wallet}` | Wallet page (a scraper also used `/sol/wallet/`) |
| `/trend?chain=&tab=hotsearch\|…` | Trending, with tabs Trending / New coins / Surge / xStocks / Pump Live / Next blue chips / Hot Search |
| `/follow?chain=&target=xTracker&tab=follow&groupid=` | Track / X tracker |
| `/monitor?chain=` | Monitor square |
| `/discover?chain=&tab=renowned\|pump_smart` | Legacy wallet discovery |
| `/new-pair?chain=sol&tab=home` | Legacy new pools; filter state is encoded in the query (`mihc` min holder count, `mac` max age `30m`, `mair` max insider rate…) [I meanings] |
| `/meme?chain=sol&tab=new_creation\|completing\|soaring\|complete` | Legacy Memescope |
| `/snipex?chain=sol`, `/bot`, `/ai?chain=bsc&tab=api_management\|paid_plans`, `/ai/generateapi?pbk=`, `/app`, `/blog/{lang}/{slug}`, `/static/tos.html` | Misc |
| `/r/{code}`, `?ref={code}`, `/{page}/{code}?chain=`, `/{chain}/token/{code}_{ca}` | Referral links. The invite code is embedded in almost every shareable path; Telegram uses `t.me/<bot>?start=i_{code}` |

Chain slugs seen: `sol, bsc, base, eth, robinhood, tron, monad, arbitrum, hyperevm, arc, stable, xlayer, megaeth`, plus `?chain=hype` for HyperEVM. No dedicated settings route was found; settings open as modals and popovers. The token-page title format is `SYMBOL ↑/↓ $MCAP | <brand>` (for example `RT $4.11K`).

### 3.2 Header [S]

Logo · nav · multi-chain chip selector · global search (`/` hotkey; tokens by name/ticker/CA and wallets by address/ENS/X handle) · watchlist ticker strip · Deposit (QR + address + buy with card) · wallet pill (balance, copy address; dropdown: My Wallet, Wallet Manager, Withdraw, Logout) · Connect (Telegram / Phantom / app QR / email-Google) · feature-update bell · language · settings gear.

Mobile web (430 px) puts logo, chain pill, balance, "0 Alert", search and settings in the header. A fixed bottom nav (55 px, horizontal scroll) holds Trenches, Trending, CopyTrade, Monitor, Track and Portfolio.

### 3.3 Footer and dockable panels [S]

- A fixed **~32 px footer**. Its left lane scrolls and holds panel toggles: Wallet Tracker, Social/X Tracker, Watchlist, Holding (`data-testid holding-float-toggle` → floating `position-table-floating`), Instant Trade, Signal, Leaderboard, Trending, Monitor, plus per-feed sound switches and native price tickers. A non-shrinking right lane shows connection status and a built-in latency check.
- **Floating windows** can be dragged (long-press or header drag) or snapped into a side dock. The dock holds **at most 3 columns**, and windows can stack vertically inside a column. Wallet Tracker tabs: Wallet / Track / Callout / Monitor. Social Tracker tabs: Mine / Featured / Recommended.
- Tracker feed rows have a fixed height. Card mode is two lines (~64.5 px); table mode has five columns (Time, Name, Token, Amount, MC; ~44 px rows). A 5 px chain-colour bar sits on the left edge. New items prepend, play a sound and add a red unread bubble.

### 3.4 Hotkeys (Trenches) [S, official docs]

- A keyboard icon turns green when hotkeys are enabled.
- **Pause live feed on hover** freezes a column while the pointer is over it.
- **X Preview** = `X`: hover a card and press X for a tweet/profile popup. **Web Preview** = `V`: hover and press V for a website popup that auto-plays YouTube/TikTok/Instagram.
- **Mode A ("Simple"):** hover a column, hold the Auxiliary key (`Z`) and press a Row key. This forces pause-on-hover.
- **Mode B ("Combo", keyboard only):** hold the Pause key (`Space`), hold a Column key (New / Almost bonded / Migrated), then press a Row key.
- Large row-number watermarks (1, 2, 3…) appear on the targeted cards.
- A buy fires immediately with the column's Quick Buy amount and active preset. There is no confirmation.
- Global: `/` focuses search and `Esc` closes popups. Default column keys are undocumented.

---

## 4. Discovery surfaces

All lists share one row schema, **RankItem** (security, dev, smart-money, social and DexScreener-marketing fields). That means one row component and one filter engine can power every list.

### 4.1 Trenches: three-column live launchpad board [P + S]

**Columns.** Current labels are New / Almost bonded / Migrated (CN: 新创建 / 即将打满 / 已开盘). Older labels were "New Creation / Completing / Completed", and one third party writes "Recently Bonded". API keys are `new_creation`, `near_completion` (**returned under `data.pump`**) and `completed`.

**Request [P]:** `POST /v1/trenches?chain=<chain>`

```json
{ "version": "v2",
  "new_creation":   { "filters": ["offchain","onchain"], "launchpad_platform_v2": true, "limit": 80,
                      "launchpad_platform": ["…"], "quote_address_type": [4,5,3,1,13,0], "min_*": 0, "max_*": 0 },
  "near_completion": { … }, "completed": { … } }
```

- `limit` is at most 80, default 80.
- Default `quote_address_type` per chain: sol `[4,5,3,1,13,0]`; bsc `[6,7,1,16,8,3,9,10,2,17,18,0]`; base `[11,3,12,13,0]`; eth `[20,11,8,3,12,1,0]`; robinhood `[11,20,24,12,0]`. The integers are opaque quote-asset classes.
- If `launchpad_platform` is omitted, sol/bsc/base/eth/robinhood apply a fixed server default allow-list and arc/stable apply no filter. Passing values replaces the default.
- Response: `data.new_creation[]`, `data.pump[]`, `data.completed[]`, each an array of RankItem. A full SOL response measured about 757 KB.
- Rate-limit weight 2.

**Row fields [P]:**

- Identity and lifecycle: `address, symbol, name, launchpad_platform, exchange, usd_market_cap, liquidity, total_supply, created_timestamp, open_timestamp (completed only), complete_timestamp, complete_cost_time (s creation→completion)`.
- Activity: `swaps_1m, swaps_1h, swaps_24h, volume_1h, volume_24h, buys_24h, sells_24h, net_buy_24h, holder_count`.
- Security: `renounced_mint, renounced_freeze_account, burn_status, rug_ratio, top_10_holder_rate, rat_trader_amount_rate, bundler_trader_amount_rate, is_wash_trading, sniper_count, suspected_insider_hold_rate, open_source ('yes'|'no'|'unknown'), owner_renounced ('yes'|'no'|'unknown'), is_honeypot ('yes'|'no'|'' on SOL), buy_tax (0.03=3%)`.
- Dev and smart money: `dev_team_hold_rate, creator_token_status (creator_hold|creator_close), creator_balance_rate, smart_degen_count, renowned_count`.
- Social and marketing: `twitter, telegram, website, instagram, tiktok, has_at_least_one_social, x_user_follower, cto_flag, dexscr_ad, dexscr_update_link, dexscr_trending_bar, dexscr_boost_fee`.
- Also present: `progress` / `launchpad_progress` (0–1), `launchpad_status`, `initial_liquidity`, `total_fee`, `bot_degen_count`, `top70_sniper_hold_rate`, `entrapment_ratio`, `fresh_wallet_rate`, `private_vault_hold_rate`, `dev_token_burn_ratio`, `lock_percent`, `creator_close`.
- Legacy pump rows also carry `king_of_the_hill_timestamp, koth_duration, reply_count, image_dup, zset_ts, zset_action, zset_source, creator_created_inner_count, creator_created_open_count, creator_created_open_ratio`.

**Server-side Metrics filters [P]** (`min_*`/`max_*`, inclusive, AND-combined, ratios as 0–1):

`volume_24h, net_buy_24h, swaps_24h, buys_24h, sells_24h, visiting_count, progress (0–1; 1 = completed), marketcap, liquidity, created (duration: '30s','0.5m','5m'; bare number = minutes, with a warning; regex /^\d+(\.\d+)?[sm]$/), holder_count, top_holder_rate, rug_ratio, bundler_rate, insider_ratio, entrapment_ratio ('Phishing'), private_vault_hold_rate ('vanish'), top70_sniper_hold_rate, bot_count, bot_degen_rate, fresh_wallet_rate, total_fee, smart_degen_count, renowned_count (KOL), creator_balance_rate, creator_created_count, creator_created_open_count, creator_created_open_ratio, x_follower, twitter_rename_count, tg_call_count`.

**Presets [P]:**

- `safe` = `{max_rug_ratio:0.3, max_bundler_rate:0.3, max_insider_ratio:0.3}`
- `smart-money` = `{min_smart_degen_count:1}`
- `strict` = safe + `{min_smart_degen_count:1, min_volume_24h:1000}`

Merge order: the preset is applied first, then explicit flags overwrite it. GMGN advertises "60+ data metrics" for Trenches filtering.

**Token Audit, social and exclusion filters [S]:**

- Audit checkboxes: Not honeypot, Verified/open-source, Renounced (mint/freeze on SOL; owner on EVM), Not counterfeit (no duplicate image/social), LP burnt, Locked.
- Social checkboxes: at least 1 social, Only Tweet, Dex AD Paid, X, Telegram, Website.
- Exclude RapidLaunch-vamped tokens (BSC/SOL, live since Oct 2025).
- Keyword include/exclude (up to 5 comma-separated keywords).
- Blacklist manager: deployer, CA, keyword, website, X handle.
- Dev status: hold / sold all / burned.
- No mint, No blacklist, Exclude wash trading, Migrated only.
- Filter JSON can be shared via Import/Export. Reset and Apply buttons; nothing takes effect until Apply.
- The CLI body has no boolean tag array, so these toggles are probably applied client-side or through undocumented keys [I].

**Launchpad allow-lists [P]** (case-sensitive; ~50 total; all selected by default; the UI has "Unselect All"):

- **SOL:** `Pump.fun, pump_mayhem, pump_mayhem_agent, pump_agent, letsbonk, bonkers, bags, memoo, liquid, bankr, zora, surge, anoncoin, moonshot_app, wendotdev, heaven, sugar, token_mill, believe, trendsfun, trends_fun, jup_studio, Moonshot, boop, ray_launchpad, meteora_virtual_curve, xstocks`. Trending adds `pool_ray, pool_meteora, pool_pump_amm, pool_orca`.
- **BSC:** `fourmeme, fourmeme_agent, bn_fourmeme, four_xmode_agent, cubepeg, likwid, goplus_creator, goplus_skills, openfour, flap, flap_stocks, flap_aioracle, clanker, lunafun`, plus trending `pool_uniswap, pool_pancake`.
- **Base:** `clanker, bankr, flaunch, zora, zora_creator, baseapp, basememe, virtuals_v2, klik`.
- **ETH:** `trench, clanker, klik, livo, stroid, pool_uniswap_v2, pool_uniswap_v3, printr`.
- **Arc:** `dyorfun_v3, dyorswap, trench, onmifun, sharcfun, klik`. **Stable:** `dyorfun_v3, dyorswap, trench`.
- **Robinhood (observed):** `pons_v2, longxyz, bankr`.

Vocabulary drifts across endpoints. Token info `launchpad` uses short ids (`pump, moonshot, ray_launchpad, stonkfun, meteora_virtual_curve, openfour, fourmeme, flap`), and search uses `pump, moonshot, raydium, pinksale`. Build an alias table. Vanity suffixes are platform defaults, not risk signals: Flap ends in 7777 (tax) or 8888 (standard); four.meme ends in `ffff` (openfour) or `4444`.

**Sorting [P]:** applied per column, client-side. `sort_by ∈ smart_degen_count | renowned_count | volume_24h | volume_1h | swaps_24h | swaps_1h | rug_ratio | holder_count | usd_market_cap | created_timestamp`. Direction defaults to desc, except `rug_ratio`, which defaults to **asc**. String-numeric fields (`usd_market_cap, liquidity, volume_1h, volume_24h`) must be parsed first. Missing values sort as 0. Market-cap sort was added to Almost bonded [S].

**Recommended column metrics [P]:** New: Created age / Liquidity / Swaps 1h / Smart degens / Social. Almost bonded: Market cap / Swaps 1h / Smart degens / Social. Migrated: Market cap / Volume 1h / Smart degens / Social.

**Card anatomy [S]** (from a live BSC card DOM, Sept 2026):

- Fixed **124 px** card, 14 px padding, 8 px gap, ~360 px default column width, fixed-row virtual list.
- 72×72 avatar (square or circle) with a bonding-curve progress ring and a launchpad corner badge; the image zooms on hover.
- Title row (20 px): bold SYMBOL, truncated name, copy-CA, note/rename icon.
- Badge row (16 px): platform/tax badges, for example `Tax x%` or `Tax b%/s%`.
- Social row (16 px): age (`6s`, `4h`), X (hover preview), website, Telegram, video platforms, search-on-X, AI narrative, then counters: holders, pro/bot traders, KOLs, **dev X/Y** (graduated/created, which links to `?tab=dev_token`), and same-image count.
- Pool row: quote-token tag.
- Right stats stack (58 px): **`MC $4K`, `V $0`, `F 0.01`**. F is total fees paid by traders (priority + tip + trading) in native units. TX count with a buy/sell split is optional.
- Bottom 24 px metrics row: six % chips (order inferred: Top10, Dev, Insiders, Bundlers, Phishing, Snipers), a `DS` chip with a duration (meaning undocumented; likely DexScreener-paid with time since payment), and the Quick Buy pill (`⚡ amount`, `data-testid quickbuy`, user-customisable colours).
- Hover actions: hide token, blacklist dev.
- The dev chip shows "Run" or sold-all when `creator_token_status=creator_close`.
- Migrated-card hover shows "bonded in Xs".

**Badge rules [P]:**

| Badge | Rule |
|---|---|
| Burnt LP | `burn_status=='burn'` |
| Mint renounced | `renounced_mint==1` (SOL) |
| Freeze renounced | `renounced_freeze_account==1` |
| Dev sold | `creator_token_status=='creator_close'` |
| Dev burnt | `dev_token_burn_ratio>0` |
| CTO | `cto_flag==1` |
| Dex Paid | `dexscr_ad==1` |
| Boosted | `dexscr_boost_fee>0` |
| Trending bar | `dexscr_trending_bar==1` |
| Socials updated | `dexscr_update_link==1` |
| Honeypot | `is_honeypot==1`. EVM only; empty on SOL means "not applicable", not safe |
| Locked | `lock_percent>=0.5`. bsc/robinhood default to 0.95, so it is meaningless there |
| High initial liquidity / Low liquidity | > $300k initial / < $4k current [S] |

Also badged: Hot (many TXs), OG, RapidLaunch/vamped, Livestream, Wash trading, Tax %. Hover popovers: token tweets, project X profile, AI narrative summary. A Snipers popover covers the first 70 buyers (Hold, Sell Partial, Buy More, Sell All, Transferred).

**Metrics Threshold panel [S]** (user-adjustable; red when value > threshold): Top 10 30%, DEV 30%, Insiders 5%, Phishing 5%, Bundlers 10%, Fresh Wallet 10%, Sniper 10%, Rugged 10%. Top-100 is shown but has no threshold. GMGN calls these "editable defaults, not safety standards". Older docs said Top10 "Yes" when below 30% and flagged DEV at ≥10%.

**Display/Customize panel [S]:** Quick Buy style (Large / Compact / Special-animated) and colour; large MC text; avatar square or circle; progress ring on/off; density compact or spaced; decimals; auto-translate; same-image count; clicking the name copies the ticker; metric visibility.

**Live feed [S]:** new tokens stream in at the top. Hovering pauses the column and buffers incoming rows [I]. Third parties report Trending refreshes every minute and new pools within about 2 s. Presets (P1/P2/P3) and the Quick Buy amount are set per column.

**Quality flag (GMGN skill rubric) [P]:**

- **Pass** = `smart_degen_count>=3 AND rug_ratio<0.2 AND !is_wash_trading`.
- **Skip** = `rug_ratio>0.3 OR is_wash_trading OR is_honeypot==1`.
- Otherwise **Watch**.

**Sanitisation [P]:** token metadata is attacker-controlled. Strip C0/C1 controls, zero-width characters and bidi overrides (U+202A–202E, U+2066–2069, …). Replace injection-shaped text with `[filtered]` and treat that marker as a risk signal. Never auto-follow `website` (SSRF risk). Truncate symbols to 11–12 characters in tables.

### 4.2 Trending / Hot ranking [P + S]

`GET /v1/market/rank?chain&interval&limit&order_by&direction&filters[]&platforms[]&min_*&max_*` (weight 3, wrapped `{code, data:{rank}}`).

- `interval ∈ 1m|5m|1h|6h|24h`, default 1h. Older docs list 1m/5m/30m/1h.
- `limit` default and max 100.
- `order_by ∈ default | swaps | marketcap | history_highest_market_cap | liquidity | volume | holder_count | smart_degen_count | renowned_count | gas_fee | price | change1m | change5m | change1h | creation_timestamp`. Direction defaults to desc. `default` ranks by swap activity in the interval.

**RankItem fields:** `address, symbol, name, logo, chain, total_supply, creator, launchpad_platform, exchange, open_timestamp, creation_timestamp, rank (1=hottest), hot_level (unnormalised, compare within one result set only), price, market_cap, liquidity, volume, history_highest_market_cap, initial_liquidity, price_change_percent, price_change_percent1m/5m/1h, swaps, buys, sells, holder_count, gas_fee, renounced_mint, renounced_freeze_account, is_honeypot, is_open_source, is_renounced, buy_tax, sell_tax, burn_status, top_10_holder_rate, rug_ratio, is_wash_trading, rat_trader_amount_rate, bundler_rate, entrapment_ratio, sniper_count, bot_degen_count, bot_degen_rate, dev_team_hold_rate, top70_sniper_hold_rate, lock_percent, creator_token_status, creator_close, dev_token_burn_ratio, smart_degen_count, renowned_count, bluechip_owner_percentage, visiting_count, twitter_username, website, telegram, cto_flag, dexscr_ad, dexscr_update_link, dexscr_trending_bar, dexscr_boost_fee`.

**Range filters [P]:**

- `min/max_volume, liquidity, marketcap, history_highest_marketcap, swaps, holder_count, gas_fee, renowned_count, smart_degen_count, bot_degen_count, visiting_count, price_change_percent`.
- `insider_rate, bundler_rate, entrapment_ratio`: the last three exclude tokens that lack the field. `insider_rate` is never populated by the API.
- `top10_holder_rate, top70_sniper_hold_rate`.
- `dev_team_hold_rate`: min also excludes `creator_close`.
- `min/max_created`: a duration with an m/h/d suffix; a bare number is rejected. Cutoff = now − duration.

**UI columns [S]:** watch star · Token (logo, symbol, name, launchpad, socials, age, CTO/Dex-paid/updated icons, fire) · Age · Liq (Liq/MC or Liq/Initial) · MC · Holders · TXs (buys/sells) · Volume · Price · 1m%/5m%/1h% · Smart money · KOL · Degen Audit chips · Quick Buy. The first column is sticky (`bg-100/95`). Display rule: show 24h change as `n/a` when the token is younger than 1 day.

### 4.3 Boolean safety-tag vocabulary (canonical predicates) [P]

**Trending tags:**

- SOL: `renounced, frozen, burn, token_burnt, has_social, not_social_dup, not_image_dup, dexscr_update_link, not_wash_trading, is_internal_market, is_out_market`.
- EVM: `not_honeypot, verified, renounced, locked, token_burnt, has_social, not_social_dup, not_image_dup, dexscr_update_link, is_internal_market, is_out_market`.

**Defaults when omitted:** SOL `[renounced, frozen]`; EVM `[not_honeypot, verified, renounced]`. Omitting filters does not mean "no filter".

**Hot-search tags and their predicates:**

| Tag | Pass predicate |
|---|---|
| `renounced` | sol: `renounced_mint==1`; EVM: `is_renounced==1` (nil passes) |
| `frozen` | `renounced_freeze_account==1` (sol only; non-sol fails) |
| `is_burnt` | `burn_status=='burn'` |
| `token_burnt` | `dev_token_burn_ratio>0` |
| `not_wash_trading` | `!is_wash_trading` |
| `not_honeypot` | `is_honeypot==0` (nil passes) |
| `verified` | `is_open_source==1` (nil passes) |
| `locked` | `lock_percent>=0.5` |
| `has_social` | twitter OR telegram OR website present |
| `distribed` | `0 < top_10_holder_rate <= 0.3` |
| `not_risk` | sol: liquidity≥4000 AND mint renounced AND top10<0.3 AND freeze renounced AND LP burned. EVM: not honeypot AND liquidity≥4000 AND open-source AND renounced AND lock≥0.5 |
| `img_not_duplicate` | `image_dup=='0'` |
| `social_not_duplicate` | `twitter_dup==0 AND telegram_dup==0 AND website_dup==0` |
| `creator_hold` / `creator_close` | not creator_close / `creator_token_status=='creator_close'` |
| `dexscr_update_link` | `> 0` |
| `launching` / `migrated` | `launchpad_status=='0'` / `=='1'` (pair both to allow both) |
| `hide_b20` / `hide_non_b20` | Base b20 token standard |

Unknown tags are silently ignored. **A list made only of unknown tags disables the server defaults**: one measured case returned a superset that included honeypots. Validate tags strictly. Hot-search does not recognise `dexscr_ad, dexscr_trending_bar, dexscr_boost, cto_flag, is_internal_market, is_out_market, not_image_dup, not_social_dup`.

### 4.4 Hot searches [P]

`POST /v1/market/hot_searches` with body `{params:[{label:'hot-search', chain, interval, filters?, limit?<=500, min_*/max_*, min_created/max_created}]}`. Weight 3.

- Response `data[]`: `{interval, chain, version, tokens[] (RankItem + 1-based rank)}`. `version` is persisted for WebSocket reconnect.
- Sorted by `visiting_count` (search/visit heat) descending. Results are a global cross-chain top 500 split per chain.
- `price_change_percent` bounds work only on 1m/5m/1h. Short codes such as `v_c, mc, s` are mapped server-side. `all` is not a valid chain; repeat the chain instead.
- The size of the default chain set is unclear (5, 7 or 9 depending on the doc).
- UI: the Hot list in the search empty state (rank, logo, symbol, chain badge, price, MC, heat).

### 4.5 Omnibox search [P]

`GET /v1/market/search?q&chain?&launchpad_platform[]?(≤50)&is_og?&is_launched?&order_by?=weight` (weight 1).

- **Query normalisation:** strip U+0000–001F, 007F–009F, 00AD, 034F, 061C, 180E, 200B–200F, 202A–202E, 2060–2064, 2066–206F, FEFF and FFF9–FFFB, then trim. The query must be 1–100 code points.
- **`coins[]`:** `chain, address, name, symbol, price, mcp, holder_count, liquidity (two-sided), volume_24h, volume_1h, swaps_5m/1h/6h/24h, ath_market_cap (can be absurd, e.g. $345T), created_at (0=unknown), buy_tax, sell_tax, total_buy_tax, total_sell_tax, is_honeypot (tri-state), twitter_rename_count, twitter_change_flag, cto_flag, kol_count, is_og, creator, launchpad_platform, launchpad_status, progress`.
- **`wallets[]`** (max 50): `chain, address, twitter_username, wallet_tags[]`. Filters apply to coins only. `order_by=weight` drops honeypots, which is a convenience, not a security gate.
- **Anti-copycat ranking (token-buy skill):**
  - Match tiers: address 4.0 > exact symbol 3.0 > exact name 2.0 > normalised 1.5/1.2 (strip spaces, `-`, `_` and punctuation; case- and width-insensitive; ignore a leading `$`) > fuzzy 0.
  - Within a tier, score = geometric mean of (one-sided depth, 24h volume, `credible_cap=min(mcap, max(depth,vol)*50)`, `min(holders,50000)`) × an age prior capped at 4.1×.
  - Auto-lock when exactly one candidate passes depth ≥ $30K and volume ≥ $50K, or when #1 leads #2 by more than 5×. Otherwise ask the user.
  - Always show the largest-MC exact match. Never default to Solana.
- The token page has "Same Name Tokens" and "Avatar Reused Tokens" lists (`image_dup_count`).

### 4.6 Watchlist (followed tokens with groups) [P]

- `GET /v1/user/follow_tokens?chain&wallet_address&group_id(all_group|default|<id>)&interval&order_by(created_at|swaps|volume|market_cap|liquidity|price|open_timestamp)&direction&limit&cursor&search_text` → `{cursor, all_following, is_recommend, followings[{address, symbol, name, chain, price, price_change_percent, volume, liquidity, market_cap, swaps, group_ids[], open_timestamp}]}` (weight 3).
- `GET /v1/user/follow_token_groups` → `[{chain, group_id, group_name, rank}]` (weight 1).
- Groups are scoped per chain and per wallet. `direction` is required when `order_by` is set. When the list is empty, recommended rows come back with `is_recommend=true`.
- UI: star on every row, then a group picker; group tabs; interval selector; notes and rename (web edit icon, long-press in the app).
- The CLI exposes no write endpoints. Model: `user_watchlist(user_id, chain, token_address, group_ids[], note, alias, created_at)`, `watchlist_group(id, user_id, chain, name, rank)`.

### 4.7 New Pairs (legacy) [S]

New DEX pools inside a recency window (1m to 24h). Columns: Token, Age, Creation time, Liq/Initial (= liquidity / initial_liquidity), MC, Holders, 1h TXs, change, and Degen Audit (MintDisable, Blacklist, Burn pool % (100% best), Top 10 "Yes" when below 30%). Its current equivalent is Trending with the `pool_*` platforms sorted by `creation_timestamp desc` [I].

### 4.8 Heat Rank: curated cross-chain hot list (0–100) [P]

**Inputs:** trending rows for 1h/6h/24h with `--min-marketcap 500000 --min-liquidity 100000 --max-created 7d --limit 100`. Tags: SOL `[renounced, frozen, not_wash_trading]`; bsc/base/eth `[not_honeypot, verified, renounced]`.

**Gates:**

- Liquidity ≥ 100k, pool/mcap ≥ 1.5%, present in both the 24h and 1h lists.
- Real volume = `vol*(1−bot_degen_rate)`.
- Mature tokens (true age ≥ 2d): real 24h volume ≥ 800k, turnover ≥ 5%, real 1h volume ≥ 20.8k.
- Young tokens (< 2d): real 1h volume ≥ 150k, liquidity ≥ 200k, top10 ≤ 25%, ATH position ≥ 0.45, holders ≥ 800, smart ≥ 20 or KOL ≥ 10.
- Both tracks: rug ≤ 0.15, dev ≤ 5%, holders ≥ 500, top10 ≤ 30%, bundler ≤ max(60%, chain leave-one-out p90), bot ≤ 85%, not wash, not honeypot, open age ≤ 7d, entrapment ≤ 1, top70 sniper ≤ 30%.
- Drawdown: price below 10% of ATH is always excluded; below 20% is excluded when 1h volume is under half the daily rate.
- **Unverified rows** need imbalance ≤ 0.35, liquidity ≥ 250k, smart ≥ 20 or KOL ≥ 10, top10 ≤ 25%, presence in the 6h list, and a score of at least 68.

**Score:** `100*(0.14*vacc + 0.22*size + 0.08*pos + 0.15*grow + 0.13*smart + 0.14*qual + 0.08*heat + 0.06*fresh)`, where:

- `vacc = max(1h*24/24h, 6h*4/24h)` shrunk toward 1 by `vol/(vol+3M)`.
- `pos = min(1, mc/ath/0.8)`, or 0.5 if ATH is unknown, above 50× mc, or above 1e10.
- `grow = 0.6*pct(holders/day)+0.4*pct(KOL/day)`.
- `qual = 0.55*(1−top10/0.30)+0.45*pct(liq)`.
- `heat = 0.6*pct(turnover)+0.4*pct(visiting)`.
- `smart = 0.6*pct(log sm)+0.4*pct(log kol)`.
- `fresh = clamp((7−age_d)/5)`.

Percentiles are within-chain when the chain has n ≥ 5. MIN_SCORE 60, TOP_N 10, no padding. Output: candidates → passed → listed, a table, near-misses, empty chains and a diff against the last run.

### 4.9 Lifecycle stage classifier [P]

| Stage | Rule |
|---|---|
| Early | created < 1h AND smart=0 AND kol=0 |
| Breakout | smart≥3 and rising, `swaps_1h >> swaps_24h/24`, 1h change > 20% |
| Distribution | creator_close, KOLs buying, smart money plateauing |
| Decline | volume and holders falling, high `rat_trader_amount_rate`, smart=0 |

**Quality table (Pass / Watch / Skip):**

- smart: ≥3 / 1–2 / 0
- rug: <0.1 / 0.1–0.3 / >0.3
- dev: `creator_close` passes, `creator_hold` skips
- wash: true skips
- top10: <0.20 / 0.20–0.50 / >0.50
- liquidity: >$50k / $10–50k / <$10k
- social: yes / no (weak signal)

**Strong combo:** smart≥3 + rug<0.2 + creator_close + no wash + liq>$50k.

### 4.10 AI narrative card [P]

Two fields:

- **叙事背景 (narrative background):** the token's hook and who is behind it.
- **传播观察 (spread observation):** independently verified spread facts only.

The card always ends with a disclaimer. An optional score must carry an inline caveat. Inputs: symbol, name, dev fields, links, fee distribution, launchpad. Search by CA, $SYMBOL and name, in both recency and relevance order, and merge the results (reach differed 10–100× between the two orders). Verify every claim and check for ticker collisions, same-name tokens, launchpad ≠ issuer, CTO self-disclosure, fee routing and dead citations. Budget is about 30 tool calls. The card never names a platform as a source and never shows raw field names.

### 4.11 Global call-out feed as discovery [P]

See §8.5. Cards show call MC, the multiplier since the call, the thesis, and the caller's current holding in USD. Filters: KOL-only, Declaration-only, Safe-only, holding range.

---

## 5. Token detail page (`/{chain}/token/{address}`)

### 5.1 Data sources [P]

| Endpoint | Weight | Use |
|---|---|---|
| `GET /v1/token/info` | 1 | Identity, price windows, pool, dev, link, stat, wallet_tags_stat, fee_distribution |
| `GET /v1/token/security` | 1 | Contract audit, taxes, lock, concentration, rug/insider ratios |
| `GET /v1/token/pool_info` | 1 | Pool card |
| `GET /v1/market/token_kline` | 2 (1s: 3, Pro only, ≤500 candles) | Chart |
| `GET /v1/market/token_top_holders`, `/token_top_traders` | 5 each | Holders / Traders tabs |
| `GET /v1/user/created_tokens` | 2 | Dev history |
| `GET /v1/user/wallet_activity`, `wallet_holdings` (signed), `wallet_token_balance`, `GET /v1/trade/strategy/orders` (signed), `GET /v1/trade/gas_price` | — | My trades, position, orders |

**Existence check [P].**

- Only `info.symbol` decides whether a token exists. `security.address` and `info.address` echo back for unknown addresses, and kline can return 100 candles for a token that does not exist.
- If `symbol` is empty, probe wallet stats (30d). `buy+sell>0` or `pnl_stat.token_num>0` means the address is a wallet, so route to the wallet page. Otherwise show "no record".
- A bare `0x` address is ambiguous across 8 EVM chains. Probe them **sequentially** (parallel probes trigger rate-limit bans).

### 5.2 Layout [S]

- **Desktop:** left column (collapsible), center, and right column.
  - Left: Wallet Tracker dock, or lists: Holding / Watchlist / Followed (with sound) / Trending / Pump.
  - Center: header bar (`BaseInfoBar`), then the chart, a draggable divider, and the bottom tabs.
  - Right: socials, trade module, token info/security, first-70-buyers, pool info.
- **Multichart:** up to 8 charts, cross-chain, each with its own resolution. The selected chart drives the header, Activity and trade panels.

### 5.3 Header [P + S]

Logo (zooms on hover) · watch star · SYMBOL · name · age · short CA + copy · explorer link · dev X/Y link · note edit · socials · stats strip (MC large, Price in subscript-zero format, Liq; on wide screens also 24h Vol, buys/sells, net buy, holders, Top10, burn %, mint/blacklist flags).

**Fields:**

- `address, symbol, name, decimals, logo, banner, creation_timestamp, open_timestamp, og, launchpad, launchpad_platform`
- `link.{twitter_username, website, telegram, discord, instagram, tiktok, youtube, description, gmgn, geckoterminal, verify_status}`
- `dev.{cto_flag, dexscr_ad, dexscr_update_link, dexscr_boost_fee, dexscr_trending_bar, *_ts, twitter_name_change_history[{twitter_username, rename_timestamp}], twitter_del_post_token_count, twitter_create_token_count}`
- `image_dup_count`, `price.hot_level`

**Rules:**

- **Age** = now − `open_timestamp`, falling back to `creation_timestamp`. If both are 0, show "age unknown" (BONK returns 0 and would otherwise read as 56 years). Format as `Nh` below 48h and `N.Nd` from 48h up.
- `image_dup_count>0` means the logo is shared. It does not say who copied whom (RAY shows 12).
- Twitter rename history and deleted posts are account-level history. Show them as info, not penalties (for example USDC: circlepay→circle→arc).
- Normalise `info.launchpad` through an alias map.

### 5.4 Bonding-curve block [P]

- `launchpad_status`: 0 = not opened, 1 = live (on curve), 2 = migrated. This conflicts with the hot-search tags, where `launching='0'` and `migrated='1'`.
- `launchpad_progress` is 0–1, so Progress % = `launchpad_progress × 100`.
- Other fields: `migrated_pool`, `migration_market_cap`, `migration_market_cap_quote`, `is_on_curve` (holder rows).
- **Cannot assess:** before migration the curve holds roughly all supply. If float < 2%, show "cannot assess" instead of concentration percentages.
- **Fee-sharing panel:** rendered only when `fee_distribution.platform_data.show` is true (pump).
  - Fields: `fee_authority, is_locked, bonus_category (creator_reward, cashback), list[FeeShareHolder{wallet, royalty_bps (10000=100%), is_creator, has_claimed_fee, username, pfp, twitter_username}]`.
  - Bankr variant: `deployer, fee_recipient, list[]`.
- **Chart:** a blue "M" marks migration.

### 5.5 Stats strip [P]

**Fields:**

- `price.price`, and `price.price_{1m,5m,1h,6h,24h}` (price at the start of each window)
- `buys_{w}, sells_{w}, swaps_{w}, volume_{w}, buy_volume_{w}, sell_volume_{w}`
- `hot_level, liquidity, holder_count, total_supply, circulating_supply, max_supply, ath_price, locked_ratio`

**Formulas:**

- **MCap** = `price × circulating_supply`. Do not use `total_supply` when the two differ. Check: `ath_price × circulating_supply == dev.ath_token_info.ath_mc`.
- Window change = `price/price_w − 1`. On tokens younger than the window, `price_24h` is the launch price, which produces huge ratios.
- Net flow = `buy_volume_w − sell_volume_w`.
- Makers (unique traders) are **not** in the API and must be computed [I].

### 5.6 Chart [P + S]

- **Kline:** `chain, address, resolution (1s Pro | 30s? | 1m | 5m | 15m | 1h | 4h | 1d), from, to` → `list[]{time, open, high, low, close, volume, amount}`, defaulting to 100 candles. Sort ascending. Drop candles whose close/high/low is missing or ≤0. The docs contradict each other on which of volume/amount is USD and which is token count, so expose explicit `volume_usd` and `volume_base` names. MCap candles are client-side: price OHLC × circulating supply.
- **Internal [S]:** the TradingView symbol is `<chain>/<mint>/USD/MCAP`, so the default axis is MCAP. `/api/v1/token_mcap_candles/{chain}/{addr}?resolution&from&to(ms)&limit(1000; ≤9991)&pool_type=tpool`.
- **Toolbar:** Price|MCap, USD|native (divide by the wrapped-native USD price), resolutions, fx indicators (plus GMGN holding indicators: Holders, Top10, Insiders, KOL, Bundlers, Snipers), drawing tools, Show/Hide trades, multichart, fullscreen.
- **Display → Makers:** plot markers for KOL, Tracked/Followed, My position, Dev, Top traders, Snipers, Insiders, Fresh and Whales.
- **Display → Lines:** Migration MC, ATH, my average cost (bought and sold), price-alert lines, draggable order lines (limit/TP/SL), Following entry line, Calls line, top-holder average cost (N = 10 or 30), and call markers (Fomo Thesis / Fomo Top / X Call avatars).
- **Right-click:** "Hide marks on bars" (dev icons) and move scale left/right.
- **Markers:** snap to the bucket at `floor(ts/res)*res`. Classify the maker by tags: `smart_degen|pump_smart`→Smart; `renowned|kol`→KOL; `whale`→Whale; `fresh_wallet`→Fresh; `sniper`; `creator|dev_team`→Dev; `rat_trader`; followed set; own set. When several trades share a candle, aggregate them into a count bubble [I]. The marker letters and colours are undocumented.

### 5.7 Security / Token Audit panel [P]

**SOL fields:** `renounced_mint, renounced_freeze_account, burn_status ('burn'|'none'|'')`. On EVM these are struct defaults; hide them.

**EVM fields:**

- `is_honeypot` (bool or 'yes'/'no'), `honeypot` (0 safe, 1 honeypot, −1 untested), `can_not_sell`
- `is_open_source` / `open_source ('yes'|'no'|'unknown')`, `is_renounced` / `owner_renounced`, `is_blacklist`
- `buy_tax, sell_tax, total_buy_tax, total_sell_tax` (fraction strings)
- `lock_summary.{is_locked, lock_percent, lock_detail[{percent, is_blackhole, address}]}`, `lp_holders` (≤10), `privileges` (always null)

**Risk fields:** `top_10_holder_rate, dev_team_hold_rate, creator_balance_rate, creator_token_status, suspected_insider_hold_rate, rug_ratio, is_wash_trading, rat_trader_amount_rate, bundler_trader_amount_rate, sniper_count`.

**Rules:**

- **Tri-state everywhere.** Absent, null or `''` = Unknown (grey), never "pass".
- **Lock evaluation order:** `lock_detail[].is_blackhole` (burned; strongest) → `lock_percent` → never `is_locked` alone. PEPE reports is_locked=true with lock_percent 0.00009. MEME reports is_locked=true and lock_percent '0' while 95% sits at the blackhole. CLMM/v3/v4/DLMM pools have no LP token, so LP lock is N/A.
- **Honeypot fallback chain:** `is_honeypot` → `honeypot` int → `can_not_sell` → `sells_24h>0` means not a honeypot. Tokenised-equity false positive: honeypot=true but `sells_24h>500`, `sell_vol_24h>$100K` and sell/buy ratio 0.3–3 → downgrade to unknown. If a holdings row says honeypot=true but `history_total_sells>0`, the honeypot flag is refuted.
- **BSC Total Tax** = token tax + phase base fee (curve fee before migration, pool swap fee after).

**Quick-card thresholds:**

| Check | Green / Yellow / Red |
|---|---|
| honeypot | yes = hard stop |
| open_source, owner_renounced | yes / unknown / no |
| SOL mint/freeze | not renounced = red |
| rug_ratio | <0.10 / 0.10–0.30 / >0.30 |
| top_10 | <20% / 20–50% / >50% |
| creator status | creator_close green; creator_hold red/yellow |
| tax | 0 / 1–5% / >10% red |
| sniper_count | <5 / 5–20 / >20 |
| smart wallets | ≥3 / 1–2 / 0 (bearish only) |

GMGN sources the checks from third parties (GoPlus for SOL; honeypot.is and others for EVM) and labels them "reference only" [S].

### 5.8 Holder-structure strip [P]

**Fields:**

- `stat.{holder_count, top_10_holder_rate, dev_team_hold_rate, creator_hold_rate, creator_token_balance, creator_created_count, top_rat_trader_percentage, top_bundler_trader_percentage, top_entrapment_trader_percentage, top_bot_degen_percentage, bot_degen_count, bot_degen_rate, fresh_wallet_rate, top70_sniper_hold_rate, private_vault_hold_rate ('vanish')}`
- `wallet_tags_stat.{smart_wallets, renowned_wallets, sniper_wallets, rat_trader_wallets, bundler_wallets, whale_wallets, fresh_wallets (capped ~1000), top_wallets}`. These are **counts**.

**Rules:**

- The `top_*_trader_percentage` fields are shares of an **analysed trader cohort**, not of supply. For example 4Stock: 1068/0.5416 ≈ 1,972 wallets against 20,930 holders. Label them "% of analysed traders".
- `top_bot_degen_percentage == bot_degen_rate`.
- `dev.top_10_holder_rate` is the dev-linked share *inside* the top 10, **not** the dev's own holding. Use `stat.creator_hold_rate` for that.
- **Unpopulated block:** treat it as unknown if `stat.holder_count==0` while `info.holder_count>0`, or if all ten of these are 0: creator_hold_rate, top_bundler_trader_percentage, top70_sniper_hold_rate, top_rat_trader_percentage, top_entrapment_trader_percentage, bot_degen_rate, fresh_wallet_rate, private_vault_hold_rate, creator_created_count, stat.top_10_holder_rate.
- Use whichever of `security.top_10_holder_rate` and `stat.top_10_holder_rate` is non-zero.

### 5.9 Wallet tag taxonomy on rows [P]

- **Platform tags:** `smart_degen, pump_smart, renowned, kol, fresh_wallet, wash_trader, sandwich_bot, mev_bot, fomo`, plus front-end tags `gmgn, axiom, photon, bullx, trojan, …`.
- **Token tags (`maker_token_tags`):** `creator, dev_team, bundler, rat_trader, sniper, whale, top_holder, transfer_in, paper_hands`.
- **Holder/trader `tag` filter enum:** `smart_degen | renowned | fresh_wallet | dev | sniper | rat_trader | bundler | transfer_in | dex_bot | bluechip_owner`. `dex_bot` covers Axiom, Photon, BullX, Trojan, GMGN, Drops, PepeBoost and Padre.
- Other fields: `wallet_tag_v2` (TOP1…TOPn), `maker_info.tag_rank {tag: rank}` (for example `{kol:854}`).
- A wallet can carry several tags; deduplicate when summing groups.

### 5.10 Bottom tabs

**Activity [S].** A live trade feed.

- Columns: Age · Type (Buy/Sell/Add/Remove/Burn/Transfer) · MC at trade · Amount · Total USD · Gas · Trader (tags) · tx.
- Wallet-class chips: Smart Money, KOL/VC, Whales, Fresh, Snipers, Top holders, Dev, Followed, Insiders, Bundlers. Selecting one plots those trades on the chart.
- Also: min/max USD, maker search, `revert` (oldest first = early buyers), pause on hover.
- Internal: `GET /vas/api/mul-region/token_trades_v2/{chain}/{addr}` (`limit 50, cursor, event[], tag[], following, remarks, min/max_amount_usd, from, to, revert, maker`) → `{history[], next}`.
- Row fields: `maker, event, base_amount, quote_amount, amount_usd, price_usd, timestamp, tx_hash, gas_usd, total_trade, is_following, is_open_or_close, maker_tags[], maker_token_tags[], maker_name, maker_twitter_*` and per-maker PnL fields.
- Transfers are not trades; exclude them from volume. `transferOut` (filter value) maps to `transfer_out` (event).
- Cluster signal: ≥3 smart wallets trading the same direction within 30 min.

**Holders [P].** `GET /v1/market/token_top_holders`.

- Params: `limit (20 default, ≤100), order_by (amount_percentage | profit | unrealized_profit | buy_volume_cur | sell_volume_cur), direction, tag`.
- Row fields:
  - `address, account_address, addr_type (0 wallet, 1 burn/dead, 2 exchange/pool), exchange, wallet_tag_v2, native_balance, balance/amount_cur, usd_value, amount_percentage (0–1 of total supply), is_on_curve, is_new, is_suspicious, transfer_in`
  - `buy/sell_volume_cur, buy/sell_amount_cur, sell_amount_percentage, buy/sell_tx_count_cur, netflow_usd, netflow_amount, avg_cost, avg_sold, history_bought_cost/_fee, history_sold_income/_fee, total_cost, profit, profit_change, realized_profit, realized_pnl, unrealized_profit, unrealized_pnl (null if none)`
  - `transfer fields, start_holding_at, end_holding_at, last_active_timestamp, tags[], maker_token_tags[], native_transfer{from_address, amount, timestamp}, token_transfer_in/out`
- Rules:
  - The UI shows % of **total** supply. Top-10 excludes addr_type 1 and 2.
  - Also show cumulative Top-100 (example: Top10 17.33% while Top100 held over 50%).
  - The token's own contract can appear as addr_type 0. Split it out as "Contract self-held".
  - Zero cost requires `avg_cost<=0 AND unrealized_pnl null`. Never infer it from `buy_tx_count_cur=0`, because some chains do not index buys.
  - A `native_transfer.from_address` shared by 3 or more wallets suggests one operator.
  - Remaining % = 1 − `sell_amount_percentage` [I].
- A bubble-map entry point is available.

**Top Traders [P].** `GET /v1/market/token_top_traders`, same schema. `profit_change = profit/total_cost`, `realized_pnl = realized/buy cost`. Presets: Smart + profit desc; Smart + sell_volume desc (exit signal); KOL + unrealized; KOL + profit asc; Sniper + amount_percentage.

**Dev Tokens (`?tab=dev_token`) [P].**

- Dev fields: `dev.creator_address, creator_token_balance, creator_token_status, fund_from, fund_from_ts, creator_open_count, ath_token_info{ath_token, ath_mc, symbol, …}`.
- `GET /v1/user/created_tokens?order_by(market_cap|token_ath_mc)&direction&migrate_state(migrated|non_migrated)` → `last_create_timestamp, inner_count, open_count, open_ratio, creator_ath_info, tokens[{token_address, symbol, create_timestamp, is_open, market_cap, token_ath_mc, pool_liquidity, liquidity_less_4k, holders, swap_1h, volume_1h, launchpad_platform, is_pump, bundler_rate, cto_flag, total_fee, coin_creator_fee}]`.
- Rules:
  - Total launches = `max(inner_count+open_count, len(tokens))`. tokens[] is capped at about 101, newest first.
  - A token is **alive** when `is_open AND pool_liquidity>=4000`.
  - Distrust ATH values above 10,000× the current footprint unless holders ≥ 500, and reject anything above $50B.
  - `creator_close` means the position is closed, not necessarily sold.
- The user can blacklist a dev.

**Liquidity [S].** `token_liquidity` add/remove events, LP providers (`token_liquidity_detail`), pool trend.

**Pool card [P].**

- Fields: `pool_address, quote_address, quote_symbol, exchange (pump_amm, raydium, meteora_dlmm, meteora_damm_v2, uniswap_v3/v4, pancake_v2/v3…), liquidity, base_reserve, quote_reserve, base_reserve_value, quote_reserve_value, fee_ratio (0.1 = 0.1%), creation_timestamp, initial_liquidity, biggest_pool_address`.
- **One-side depth** = `min(base_reserve_value, quote_reserve_value)` if both are > 0, else `liquidity/2`.
- If `biggest_pool != pool_address`, the depth is a lower bound. `initial_liquidity` is 0 on migrated pools, meaning unknown.

**Positions / Orders (logged in).** Holdings fields as in §7.6. `avg buy = accu_cost/balance`. Orders come from `strategy/orders` filtered to this token, with order lines on the chart (§6.9). The Orders tab categories are Limit, Auto Trading, Migrated Snipe, Sell on Dev Sell, Buy on Dev Sell, and Advanced.

**BC Owners [S].** Older tab name. Most likely means bluechip owners (`bluechip_owner_percentage`).

### 5.11 Right-column panels [S]

- Socials card with a phishing warning.
- Degen Audit: NoMint, Blacklist, Burnt %, Top10, Insiders, rug probability, rug history; EVM honeypot/verified/renounced/locked/tax.
- **First-70 buyers** grid: Hold / Bought more / Sold part / Sold all / Transferred, sniper % at launch vs now, Top-10 now. Internal `/api/v1/tokens/top_buyers` returns `holders.statusNow{hold, bought_more, sold_part, sold, transfered, holding_rate, smart_*…}`.
- Pool info (main pool only).

### 5.12 Scoring engines published in GMGN's skills [P] (rebuildable)

**(a) Contract DD composite, 0–100.**

- **Weights:** contract 0.45, holders 0.35, price 0.20. If a section has no data, renormalise (with no price data: 0.5625 / 0.4375).
- **Deduction rule:** each section starts at 100. Within a field take only the single worst tier; never sum tiers.
- **CONTRACT.**
  - SOL: mint not renounced −25; freeze not renounced −20.
  - EVM: honeypot → composite 0 (exemption cap 59); honeypot missing → cap 79; open_source false −15, missing → cap 79; renounced false −8; blacklist −20.
  - All chains: max tax >10% −25, >5% −10.
  - LP not locked −12. On bsc/base/eth/robinhood/arc/stable this also caps at 79; skipped on arbitrum/hyperevm.
  - Liquidity <$10K −15, <$50K −6. Pool shrink (`liq/initial<0.5`) −10.
  - `creator_created_count` ≥500 −18, ≥200 −14, ≥50 −10, ≥10 −6, ≥3 −3.
  - `image_dup_count>0` −6. Candles <8 −12, 8–23 −6.
- **HOLDERS.**
  - top10 >50% −25, >30% −14, >20% −6.
  - holders <200 −12, <500 −5.
  - creator_hold >5% −20, >2% −10.
  - bundler >30% −20, >15% −10, >5% −4.
  - top70_sniper >15% −15, >5% −6.
  - rat >5% −12, >1% −5.
  - entrapment >50% −22, >20% −16, >5% −10.
  - bot >70% −12, >50% −6.
  - fresh >50% −8.
  - private_vault >5% −8.
- **PRICE** (needs ≥8 candles; window = last min(96, N) candles):
  - drawdown `1−C[-1]/max(H)` >70% −30, >50% −18, >30% −8.
  - worst candle `(C−O)/O` < −50% −14, < −30% −7.
  - `price/price_24h<0.5` −10.
  - `vol_ratio=mean(V[-20:])/mean(V[-40:-20])` <0.20 −18 (needs ≥40 candles).
- **CAPS** (take the lowest): rug ≥0.50 → 59; rug 0.30–0.50 → 79; missing honeypot or open-source → 79; unlocked LP on meme EVM chains → 79; downgraded honeypot → 59.
- **Bands:** ≥80 buyable; ≥60 buyable with conditions; ≥40 not advised; <40 do not buy.
- **Coverage:** executed / inventory (23 checks on SOL, 25 on EVM). ≥80% sufficient, ≥50% low, otherwise insufficient. `rug_ratio` is never evidence of safety (302 of 400 rows read 0).

**(b) Holder chip analysis (float-rebased).**

- **Float** = 1 − burn − DEX share. Holdings are expressed as a share of float. If float <2% or there are no holders → Cannot Assess.
- **Derived values:** supply = median(balance/amount_percentage). Entry MC = supply × avg_cost. Zero-cost = balance>0, buy_tx=0, no cost basis. Risk wallets = union of rat_trader, bundler, sniper, fresh_wallet and wash_trader.
- **Linked funding:**
  - Same-source groups: ≥3 wallets sharing a funder and *coherent* (funded within 6h of each other, or amounts within ±15% of the mean).
  - Same-window groups: 300 s sliding window, ≥2 wallets. A spread ≤60 s marks a scripted batch.
- **Status by `sell_amount_percentage`:** 0 holding, >0 light, ≥0.3 selling, ≥0.8 heavy, balance 0 cleared.
- **Diamond hands** = has cost basis AND sell_tx=0 AND balance>0.
- **Top-5 pressure:** zero-cost → High; unrealised >100% → High; >10% → Med; −10..10% → Low; below that → Low (trapped).
- **Rating:**
  - Not Recommended if rat >5% of float, largest wallet >10% of float, or a dev sock puppet exists.
  - Warnings: dev holds >1%, airdrop >20%, risk wallets >35%, linked >15%, contract self-held >10%.
  - 2+ warnings → Caution; 1 → Light Position; 0 → Normal.
- **Flags (red / yellow):** Top10 >60 / >40; Top20 >75 / >55; airdrop >25 / >10; risk >35 / >15; linked >25 / >10; diamond >60 good, >35 mid.
- **Chip quality:** risk >30% red; clean ≥50% green; ≥30% yellow.
- **Buying power:** native USD 0 / ≤200 / 200–1200 / >1200.

**(c) Dev Score (CONDUCT / POWER / TOTAL).**

- **DUMP** = pulled out ≥1.5× what was put in AND first sell within 30 s.
- **Severity** = `clamp((multiple−1)/3) × clamp((120−first_sell_s)/120)`.
- **CONDUCT** = `max(0, 100 − 55·mean_sev − clamp((CTO_rate−0.30)/0.70)·10) − factory_pen − opaque_pen`.
  - `factory_pen = 45·clamp((log10(max(20,inner))−log10 20)/(log10 500−log10 20))`
  - `opaque_pen` = 15 (and TOTAL capped at 74) when the flagship shows creator_close with no exit row.
  - Shrink if raw >60: `60+(raw−60)·w`, where `w = min(1,coins/5)·min(1,career_days/30)`.
- **POWER** = min(100, B1+B2+B3+B4):
  - B1 = `clamp((log10(min(ath,5e10))−5)/4)·60`
  - B2 = 0 with no $1M coin, otherwise `min(25, 11+5·log2(successes))`
  - B3 = 10 if the flagship is alive
  - B4 = `10·(0.5·survival+0.3·graduation+0.2·(1−median dd))·min(1,sampled/5)`
- **TOTAL** = `CONDUCT + max(0, min(1,successes/3)·(POWER−50)/50·15)`.
- **Gates:**
  - LP pull → sys (CONDUCT cap 45, TOTAL cap 49).
  - <5 traded coins with ≥2 dumps or a dumped flagship → sys. <5 otherwise → often_unproven (caps 65/74).
  - Dump rate >75% or dumped flagship → sys. 0 dumps across ≥5 coins → none. Rate ≤30% → rare. Otherwise often (CONDUCT −20, TOTAL cap 74).
- **Bands:** ≥75 buyable, ≥50 mixed, ≥30 avoid, otherwise stay_away.
- **Not a person:** ATH >$50B, N<1, or N>20000 with no graduations or ATH <$1M.

**(d) K-line pattern classifier.**

- Needs ≥8 candles.
- **Inputs:**
  - `trend_up`: SMA9 vs SMA21.
  - `slope`: mean of C[-5:] vs mean of C[-24:-19] when N≥24, otherwise C[-1]/C[0]−1.
  - `volatility`: mean of (H−L)/C over the last 14 candles.
  - `drawdown` = `(maxH−C[-1])/maxH`.
  - `vol_ratio` = `V[-1]/mean(V[-21:-1])`.
  - `up_from_low`.
- **Patterns** (first match wins):
  - Vertical run-up: slope>0.25, dd<0.12
  - Uptrend channel: slope>0.08, dd<0.25
  - Breakdown: dd>0.55, slope<−0.10
  - Bounce off lows: dd>0.55, slope>0.02
  - Distribution at highs: dd>0.35, |slope|<0.08
  - Slow bleed: slope<−0.20
  - Basing: |slope|<0.05, vol<0.05, up_from_low<0.20
  - Wide chop: |slope|<0.08, vol>0.08
  - Otherwise: Bullish / Bearish / Sideways consolidation
- **Score**, starting from 50:
  - trend ±12
  - slope >0.15 +15; 0.02–0.15 +6; < −0.15 −15; −0.15..−0.02 −6
  - vol_ratio >3: green +8, red −10; vol_ratio <0.3 −5
  - dd >0.60 −15; 0.30–0.60 −6; <0.05 +8
  - divergence −10
  - clamp to 0–100

### 5.13 Pre-buy checks in the trade module [P]

- **Volume:** 24h ≥ $50K and 1h swaps ≥ 10.
- **Vol/pool bands:** pool <$100K → 0.30–15; $100K–1M → 0.15–12; ≥$1M → 0.05–30. Above the band with ≥150 holders is a breakout (allow); above it with few holders is wash trading (block); below it is a dead pool (block).
- **Depth:** one side ≥ $30K. **Impact** ≤ 3%.
- **Direction:**
  - 5m drop ≥10% → hard stop.
  - 5m drop 5–10% → degrade: limit at `price×(1−|5m drop|)`, wait, or reduce size.
  - Net selling across all three windows → degrade.
  - 24h up ≥100× with negative flow → warn.
- **Warnings** (2 or more = fail): top10 >50%, creator >5%, not open source, age <24h, rat >15%, holders <200, entrapment >30%, bot >60%, bundler wallets/holders >5%, fresh >30%.
- **Shell rule:** MC ≥ $1M with <100 holders = fail.
- **Slippage** = 2% + tax + impact×1.5 + |5m change|×0.5. Floor 1%, cap 15% (if the result exceeds the cap, do not raise slippage; ask the user to cut size). Add 3% when listed <1h.
- **EVM gas units:** v2 150K, v3 180K, v4 200K, unknown 200K.

---

## 6. Trading and execution

### 6.1 Market swap [P]

`POST /v1/trade/swap` (signed, weight 10).

**Request fields:**

- `chain, from_address (lower-cased on EVM), input_token, output_token`
- `input_amount`: a string in smallest units, or `'0'` when `input_amount_bps` is used.
- `input_amount_bps`: `'1'..'10000'`. Sells only, and only when the input is **not** a currency token.
- `slippage` (0–100, where 30 = 30%) **xor** `auto_slippage`. `min_output_amount`.
- `is_anti_mev`, `priority_fee` (SOL), `tip_fee`.
- `gas_price` (wei; the CLI takes gwei ×1e9) **xor** `gas_level` (low|average|high, ETH only). `auto_fee` (ETH, condition orders only).
- `max_fee_per_gas`, `max_priority_fee_per_gas`.
- `condition_orders[]` (≤10), `sell_ratio_type` (`buy_amount` default | `hold_amount`).

**Response:** `order_id, hash, status, error_code, error_status, strategy_order_id, report{…}`.

**Rules:**

- Amount and percent are mutually exclusive, and one of them is required.
- Fee flags are chain-gated. A flag sent on the wrong chain returns 400.
- Condition orders are rejected on arc and stable. EIP-1559 minimums are enforced only when `condition_orders` is present.
- A human must confirm the trade. The CLI enforces a typed `yes`. Headless use needs both `GMGN_ALLOW_AUTOMATED_TRADES=1` and `--yes`.
- Advertised submission time is under 0.3 s end to end, through the same RPC routing as the web app.
- Explorer links: solscan, bscscan, basescan, etherscan `/tx/<hash>`.

### 6.2 Quote [P]

`GET /v1/trade/quote` (weight 10; the docs disagree on whether it needs signed auth).

- **Request:** `chain, from_address, input_token, output_token, input_amount, slippage`.
- **Response:** `input_amount, output_amount, min_output_amount, slippage`. There is **no price-impact field**.
- **Inferred impact** for a constant-product pool: `amount_usd/(depth_usd+amount_usd)` using one-side depth [I].
- **Risk level** from `rug_ratio`: <0.1 Low, 0.1–0.3 Medium, >0.3 High, which requires a second confirmation. `is_honeypot='yes'` aborts.

### 6.3 Slippage [S + P]

- Integer 0–100, or Auto. In strategy orders, `slippage=0` means auto.
- The Telegram bot distinguishes turbo slippage from anti-MEV slippage.
- GMGN's guidance: use Auto for manual trades and a fixed value for automated or limit orders. Recommended fixed values are 30–35% for auto, limit and pending orders, and 50%+ for new or hot coins. CLI examples default to 30.
- The skill formula for automatic slippage is in §5.13.

### 6.4 Fee tiers: P1/P2/P3 [P]

`GET /v1/trade/gas_price` (weight 1) returns:

`auto, auto_mev, last_block, high, average, low, suggest_base_fee, *_prio_fee, *_prio_fee_mixed, native_token_usd_price, *_estimate_time (s), *_orign`.

- P1 Economy, P2 Standard and P3 Turbo (经济/标准/极速) map to low, average and high. **P2 is the default**, and "auto" is a fourth option. Presets are saved per chain.
- **Never** compute a tier as `suggest_base_fee + prio_fee`. On BSC, prio is legitimately 0 and high is about 4.7× base.
- On SOL, read only `*_prio_fee_mixed`. `*_prio_fee` is a placeholder value of `1`.
- **Measured SOL values:** auto 0.00025 SOL (UI default); low, average and high 0.001, 0.005 and 0.01 SOL; `auto_mev` (Jito bribe) about 0.001 SOL.
- **EVM cost** = tier_wei × gas_units / 1e18 × native USD price.
- **Warnings:**
  - Below P1: "may not fill".
  - Above 5× P3: "overpaying won't be faster".
  - Tiers more than 50× apart (2–10× is normal), or another chain's template returned: show "reference only".
- **Docs guidance [S]:** priority and tip each from 0.0001 to 2 SOL. Use 0.002 SOL when speed does not matter, ≥0.006 SOL for auto and limit orders, and ≥0.01 SOL for trades above 1 SOL.

### 6.5 Anti-MEV [P + S]

- Default **on**. Supported on sol, bsc and eth, but **not on base**. For cooking it is SOL only.
- API modes `off | normal | secure`. UI modes: Off (all nodes, fastest), Reduced (limited nodes, may still be front-run) and Secure (safe nodes, slower, with compensation). Mapping normal→Reduced is inferred.
- The docs require priority ≥0.002 SOL when anti-MEV is on.
- For copy trading the docs recommend anti-MEV off with a 0.002–0.006 SOL priority fee.
- On 25 Oct 2024, after BSC anti-sandwich nodes were bypassed, 729 users were compensated [S].

### 6.6 Condition orders (TP / SL / trailing) [P]

- **Types:** `order_type ∈ profit_stop | loss_stop | profit_stop_trace | loss_stop_trace`, with `side:'sell'`.
- **`price_scale`** is a % string: a gain for TP (`'100'` = +100%, i.e. 2×) or a drop for SL (`'65'` fires at 35% of entry). It is optional for `loss_stop_trace`.
- **`sell_ratio`** is a % of position. **`drawdown_rate`** is the trailing pullback %.
- Up to 10 sub-orders. The response carries `cid, check_price, status cancel|success|failed`.
- `check_price` = open × (1 ± scale/100) [I].
- **`buy_amount` mode:** sells a fixed token quantity, computed at creation as `sell_ratio`% of the original fill.
- **`hold_amount` mode:** sells `sell_ratio`% of whatever is held when the order triggers, including later top-ups.
- **Trailing SL:** stop = `max_seen_price × (1−d)`, armed immediately, only ever ratchets up.
- **Trailing TP:** dormant until `price ≥ open×(1+scale)`, then fires when `price ≤ peak×(1−d)`. Docs example: TP 20% with 5% drawdown on a $140 buy exits at +28.9%.
- Suggested pairs: +50%/10%, +100%/15%, +200%/20%. When both TTP and TSL are on, the smaller drawdown applies once TP is reached [S].
- Auto-sell is **per purchase**: several buys create overlapping sell sets [S]. The trigger price is not the fill price.
- In the Telegram bot, TP/SL is valid for 24h and sell amounts must sum to 100%.

### 6.7 Limit orders and smart trade [P]

**Limit orders.** `POST /v1/trade/strategy/create` (weight 5) with `order_type=limit_order`.

- `sub_order_type ∈ buy_low | buy_high | stop_loss | take_profit`.
- `check_price` is required. `open_price` is optional.
- `amount_in` **xor** `amount_in_percent`.
- `limit_price_mode ∈ exact | slippage`, default slippage.
- `expire_in` in seconds. The UI offers 1h, 24h and 3d. In the Telegram bot the trigger can be a price or ±% and expires after 3 days by default.
- `sell_ratio_type`. Fees are required on SOL (priority and tip) and BSC (gas).
- The response includes `order_id` and `is_update`, which is true when the server upserted an existing order.
- arbitrum, hyperevm, arc and stable support limit_order only.

**Smart trade.** `order_type=smart_trade, sub_order_type=mix_trade`. It needs one `{order_type:'buy_low', side:'buy', check_price < open_price}` plus at least one TP/SL, a required `sell_param` (TradeParam) and an optional `buy_param`.

**TradeParam:** `slippage, priority_fee, tip_fee, gas_price, max_fee_per_gas, max_priority_fee_per_gas, auto_slippage, is_anti_mev, anti_mev_mode, auto_fee, auto_tip, max_tip_fee, fee, custom_rpc`.

### 6.8 Order lifecycle [P]

`GET /v1/trade/query_order` (weight 5).

- **Statuses:** `pending → processed → confirmed | failed | expired`.
- **Report** (present only when `state=30` and `status='successful'`): `input_token(_decimals), swap_mode ExactIn|ExactOut, input_amount, output_token(_decimals), output_amount, quote/base token, decimals and amounts, price, price_usd, height, order_height, gas_native, gas_usd`.
- **Polling:** swaps poll 3 times at 5 s intervals, then report a timeout. Cooking polls every 2 s for up to 30 s. Never report success before `confirmed`, and never auto-retry a failure.

### 6.9 Order book [P + S]

**List.** `GET /v1/trade/strategy/orders` (weight 1).

- Params: `chain, type open|history, from_address, group_tag LimitOrder|STMix (required), base_token, page_token, limit`.
- Each row:
  - `order_id, order_type, sub_order_type, base/quote_token, open_price, open_amount, quote_investment`
  - `profit_stop(_type), loss_stop(_type), drawdown_rate, dev_sell_ratio, sell_ratio, sell_ratio_type, record_high_price`
  - `expire_time, create_time, close_time` (ms), `close_price, close_amount, close_sell_model, reason_code, reason_by`
  - `status open|closed, strategy_status running|stopped`
  - `is_anti_mev, anti_mev_mode, auto_slippage, priority_fee, gas_price`
  - `condition_orders[]`
  - `order_statistic{buy_amount, buy_quote_price, buy_usdt_price, quote_profit, sell_amount, sell_num, success_sell_amount, success_sell_num, usdt_profit}`
  - `token_balance, token_price, token_logo, token_name, total_supply, version, wallet_address, prepare_status, place_action`

**Cancel.** `POST /v1/trade/strategy/cancel` (weight 2) with `{chain, from_address, order_id, order_type, close_sell_model}`.

**UI.** The token page's Orders tab has categories Limit, Auto Trading, Migrated Snipe, Sell on Dev Sell, Buy on Dev Sell and Advanced. The mobile app adds "Close All Orders".

### 6.10 Multi-wallet batch [P]

`POST /v1/trade/multi_swap` (weight 10).

- Request: `accounts[1..100]`, plus `input_amount{wallet: amt}`, `input_amount_bps{wallet: bps}` or `output_amount{wallet: out}`. TP/SL is set per wallet on a best-effort basis.
- Response: `data[]{account, success, error, error_code, result}`.
- Each wallet executes independently.

### 6.11 Automation triggers [S]

- **Dev Sell.** Fires when `dev_actual_sell_ratio_in_one_tx ≥ dev_sell_ratio`, then sells `sell_ratio`% of the user's position. One task per token. It can be created automatically from the buy panel. A "Buy on Dev Sell" variant also exists, with undocumented semantics.
- **Migrated Snipe / Migrated Sell.** SOL only. Must be created *before* the DEX adds the official LP. One task per token. Settings: buy amount, TP%, SL%, slippage, priority fee, anti-MEV.
- **SnipeX.** Watches X handles for a contract address in a tweet, reply, profile update or repost, then auto-buys. Filters: burnt-LP ≥ X%, Skip Holdings, Snipe If Immigrating, max token age, MC and liquidity range, plus TP/SL. Limits: at most 10 concurrent tasks, each lasting 7 days. SOL only, Telegram-wallet users only. The handle must exist, must not be protected, and must not duplicate another running or paused task.
- **TG Auto Buy.** Buys automatically when a contract address is pasted, if `market_cap ≤ max_mc AND liquidity ≥ min_liq`. Has quick-buy and quick-sell presets.

### 6.12 Copy trade [S]

**Buy modes:**

- Fixed Buy: same amount every time.
- Max Buy: follows the target's amount, capped at a maximum.
- Fixed Ratio (third-party reports): ratio × the target's spend.

**Sell modes:**

- Copy Sell (default on): sells the same proportion the target sold, and only on tokens this task bought.
- Not Sell.
- TP&SL or batch TP&SL: computed on the copy position's average cost. Enabling it stops copy-sells.

**Filters:** MC min/max (evaluated when the target buys), liquidity min/max, token age min/max (from token creation), min burnt-LP %, min/max copy amount (the target's trade size), Increase Times (re-buys per token; 0 = never re-buy; resets after a full close), platforms, and a token blacklist of up to 20 entries. Also Lightning mode (1 s on-chain).

**Limits and costs:**

- At most 10 tasks. Older docs say SOL and Telegram-login only.
- Exit rules have no priority between them; the first condition met fires, and each is computed on what remains of the position.
- A task auto-pauses after 3 consecutive failures (failed copies are retried 1–3×). Resuming is manual.
- Error codes: B1/K2 = insufficient gas; D1/L1/L2 = no route (liquidity removed or token migrating).
- Cost per copy = amount + priority fee + 1% fee. Keep at least 0.05 SOL in reserve.
- Recommended settings: slippage 30–35% (50%+ for hot tokens), priority ≥0.006 SOL.
- The task detail page shows Positions, Success, Failed (with reason) and Filtered/Skipped.

### 6.13 Cooking (token launch) [P]

`POST /v1/cooking/create_token` (signed, weight 5, asynchronous). `GET /v1/cooking/statistics` returns `[{launchpad, token_count}]` (weight 1).

**Supported launchpads:**

| Chain | dex | raise token |
|---|---|---|
| sol | pump | '' (SOL), USDC |
| sol | bonk | '' (SOL), USD1 |
| sol | bags | SOL only |
| bsc | fourmeme | BNB, USD1, USDT |
| bsc | flap | BNB only |
| base | klik, clanker | WETH fixed |
| robinhood | trench, pons | native only |

**Fields:**

- `name/symbol` (≤100 chars), `description` (≤500), `image` (base64 ≤2 MB) **or** `image_url`, website/twitter/telegram (http(s) only)
- `buy_amt`: always **human native units**, even when raising in a stable (`native = quote_amount×quote_price/native_price`)
- Execution: `slippage|auto_slippage, fee, priority_fee (≥0.0001), tip_fee, gas_price (raw wei here)`, `dev_gas, dev_priority, dev_tip, dev_max_fee_per_gas, approve_vision v1|v2 (default v2), source`
- Pump only: `is_mayhem, is_cashback, is_buy_back`
- Fee shares: `pump_fee_share_list[{provider solana|twitter|github, username, basic_points}]` summing to 10000. `bags_fee_share_list` (provider twitter|solana|kick|github) + `dev_wallet_bps` summing to 10000.
- `flap_rate_conf{tax_rate (V5) | buy_tax_rate+sell_tax_rate (V6) bps, mkt_bps, deflation_bps, dividend_bps, lp_bps (sum 10000), recipient_type gift|split, twitter_account, split_conf[{recipient,bps}] (sum 10000), minimum_share_balance ≥10000, beneficiary}`
- `fourmeme_rate_conf{fee_plan, fee_rate (whole %), burn_rate, divide_rate, liquidity_rate, recipient_rate (sum 100), recipient_address, min_sharing}`
- `bonk_model`
- `buy_wallets[{from_address, buy_amt}]`: bundle buys; pump ≤12, fourmeme ≤3, none elsewhere
- `snip_buy_wallets[...]`: ≤10
- `buy_trade_config` / `sell_trade_config` (TradeParam)
- `sell_configs[{sell_type delay_sell|limit_order, delay_sec, delay_mili_sec (takes precedence), sell_ratio ('1'=100%), check_price (USD market cap), wallet_addresses[]}]`

**Server behaviour:** creates `pending_sell` orders for the main and bundle wallets and `signal_cooking` orders for snipers. The new mint comes back in `report.output_token`. Pump.fun's own `create_v2` now **rejects cashback** (deprecated in favour of holder rewards) [S].

### 6.14 Fees and failures [S + P]

- **Fees:** ~1% platform fee on every successful buy and sell. Network, priority and tip fees go to validators. Referred users may pay 0.9% [S, unverified].
- **Withdrawals:** web only, whitelisted addresses, and Google Authenticator required.
- **Error codes:**
  - `40003701`: insufficient token balance.
  - `ERROR_RATE_LIMIT_BLOCKED`: repeated identical business errors.
  - 429 `RATE_LIMIT_EXCEEDED | RATE_LIMIT_BANNED | RATE_LIMIT_BANNED_MAX` with `reset_at`.
  - 403 `PLAN_UPGRADE_REQUIRED | PRO_PLAN_REQUIRED`.
  - "jupiter has no route": wrong currency address.

---

## 7. Wallet analytics and portfolio

### 7.1 API surface [P]

| Route | Notes |
|---|---|
| `GET /v1/user/wallet_stats?period=7d\|30d` (w3) | Returns a bare object, or an array for batches. Fields: `realized_profit, realized_profit_pnl\|pnl, unrealized_profit, winrate, bought_cost\|total_cost, buy, sell, bought_fee, sold_fee, native_balance, last_timestamp, pnl_stat{…}, common{…}` |
| `POST /v1/user/wallet_profits {period 1d\|7d\|30d\|all, wallet_addresses ≤100}` (w3) | `list[{wallet_address, realized_profit, realized_profit_cost, buy, sell, unrealized_profit, total_realized_profit, total_realized_profit_cost, total_profit, total_cost}]`. Matched gmgn.ai's public leaderboard to the last digit |
| `GET /v1/user/wallet_holdings` (signed; w2) | `limit` 20, max 50; `order_by usd_value(default)\|last_active_timestamp\|realized_profit\|unrealized_profit\|total_profit\|history_bought_cost\|history_sold_income`; `hide_abnormal` (false), `hide_airdrop` (true), `hide_closed` (true), `hide_open`, `interval` (24h, undocumented), `tx30d`. Returns `{list, next}` |
| `GET /v1/user/wallet_activity?type[]=buy\|sell\|transferIn\|transferOut\|add\|remove&token&cursor&limit` (w3) | Page size 50. Values above 50 silently fall back to 20. Returns `{activities, next}` |
| `GET /v1/user/created_tokens` (w2), `GET /v1/user/info` (w2), `wallet_token_balance` (w2) | |

**Contract-address check:** an address is a token contract, not a wallet, when all of these hold: `buy+sell=0`, `token_num=0`, `created_token_count=0` and all-time buy is 0. Show "no trading record", never "made $0". Strip the CLI's `[gmgn-cli]` notice lines before parsing.

### 7.2 Header / identity (`common`) [P]

**Fields:** `avatar, name, ens, tag, tags[], twitter_username, twitter_name, followers_count, is_blue_verified, follow_count (GMGN users following), remark_count, created_token_count, created_at (first funding tx = wallet age), fund_from, fund_from_address, fund_amount`, plus `native_balance` and `last_timestamp`.

**Rules:**

- Wallet age < 30 days → "new wallet" badge.
- Idle for more than 48h → stale warning.
- An absent `common` block means the identity service is down. Omit the section silently.

**UI [S]:** avatar, name with a remark button, X link with a blue check, tag chips, address and copy, the period selector (1D/7D/30D/All), Follow (choose group, name and emoji), Copy Trade and Share.

### 7.3 PnL summary [P]

**ROI formulas by period:**

- 7D/30D: `realized_profit_pnl` (fallback `pnl`) = `realized/bought_cost`.
- 1D: `realized_profit/realized_profit_cost`.
- All: `total_realized_profit/total_realized_profit_cost`.
- A cost ≤0 means unknown.

**Rules:**

- The 1D window is **rolling**. Pulling again minutes later can read 15–20% lower.
- Win rate counts sold positions only and ignores the size of wins.
- Fee drag = `(bought_fee+sold_fee)/realized`. ≥0.30 flags a problem.
  - Under 0.95: "fees ate X% of profit".
  - Under 1: "almost all".
  - 1 or more: "paid more in fees than earned".

**Formats:** ≥1M → `$1.23M`; ≥1K → `$73.0K`; <20 → `$12.3`; otherwise `$456`. Percentages use one decimal below 10%, integers above.

**Layout [S]:** a 3-card grid: [P&L + daily calendar heatmap] [Analysis + phishing check] [PnL distribution + entry-MC distribution]. Below it, tabs: Recent PnL / Holdings / Activity / Deployed Tokens, each with a share button.

### 7.4 PnL distribution buckets (token counts) [P]

**Fields (`pnl_stat`):** `pnl_gt_5x_num` (>500%), `pnl_2x_5x_num` (200–500%), `pnl_0x_2x_num` (0–200%; web name `pnl_lt_2x_num`), `pnl_nd5_0x_num` (−50% to 0; web `pnl_minus_dot5_0x_num`), `pnl_lt_nd5_num` (<−50%; web `pnl_lt_minus_dot5_num`), `token_num` (sum of the buckets; does not reliably follow the period), `winrate`, `avg_holding_period`.

**Rules:**

- **Unsold tokens sit at 0 inside the 0–200% band**, so that band is not a win count.
- `lt50_share = lt_nd5/max(1,token_num)`.
- Reconciliation note: `unsettled = max(0, x0_2 − round(winrate×token_num))`. Show it when token_num ≥20 and unsettled ≥ 25% of x0_2.
- `avg_holding_period` includes never-sold bags. Measured on real wallets it was 1,728–22,931× the true median round trip, so **do not use it**. Use the median **copy window** (first buy → first sell per token) instead.

### 7.5 Phishing check / risk card [S]

**Fields (web API):** `risk.{token_active, token_honeypot(_ratio), no_buy_hold(_ratio), sell_pass_buy(_ratio), fast_tx(_ratio)}`. Each ratio = count/token_active. UI labels: Blacklist/honeypot buys · Didn't buy (received only) · Sold > Bought · Buy/Sell within 5 s (the token-page docs say 10 s).

**Rebuild rules:**

- `no_buy_hold` = held tokens with 0 buys and transfer-ins > 0.
- `sell_pass_buy` = sold amount > bought amount.
- `fast_tx` = sell − buy ≤ 5 s.

### 7.6 Holdings and activity [P]

**Holding rows:**

- `token.{token_address, symbol, name, price, is_honeypot, launchpad_platform, liquidity, total_supply, creation_timestamp}`
- `balance, usd_value, accu_cost (basis of what is still held), history_bought_cost, history_sold_income, realized_profit, unrealized_profit, total_profit, total_profit_pnl, realized_profit_pnl, unrealized_profit_pnl, history_total_buys/sells/transfer_ins/outs, start_holding_at, end_holding_at (0 if open), last_active_timestamp, wallet_token_tags`

**Holding rules:**

- `avg_cost = accu_cost/balance`.
- Hold-to-zero: `total_profit_pnl ≤ −0.9` with 0 sells.
- Bag-hold: open, `unrealized_pnl ≤ −0.5`, cost ≥ $50.
- Ticket size = `history_bought_cost/history_total_buys`.
- Honeypot is refuted when the wallet has any sells.
- Recent PnL = holdings with `hide_closed=false`, ordered by `last_active_timestamp` desc.

**Activity rows:** `tx_hash, event_type (read event_type ?? type), token{address, symbol, total_supply}, token_amount, cost_usd, buy_cost_usd, price, price_usd, timestamp, gas_usd, priority_fee, tip_fee, launchpad_platform`.

**Activity rules:**

- Realised PnL on a sell row = `cost_usd − buy_cost_usd`. If `buy_cost_usd` is missing, skip the row; never treat it as 0.
- Entry MC = `price_usd × total_supply`.
- 24h posture: Distributing if sells > 2× buys; Accumulating if buys > 2× sells; otherwise Rotating.

### 7.7 Wallet tag taxonomy (global) [P + S]

- **Severity:**
  - veto: `wash_trader` (only when corroborated), `sandwich_bot`, `mev_bot`.
  - warn: `kol, top_followed, top_renamed, sniper, rat_trader, bundler, insider, dev, fresh_wallet`.
  - good: `smart_money, bluechip_owner`.
  - neutral: `whale, gmgn, photon, bullx, maestro, pepeboost`.
  - Unknown tags are shown verbatim as neutral.
- **No single tag may change a verdict on its own.**
- **Leaderboard categories [S]:** All, Smart Money (`smart_degen` + `pump_smart`), Launchpad SM (`launchpad_smart`), KOL/VC (`renowned`), LIVE, Fresh Wallet, Sniper (`snipe_bot`), Top Followed, Top Renamed, Top Dev.
- **Leaderboard columns:** Wallet, PnL %/$, Win rate, TXs (buy/sell), Volume, Net inflow, Avg cost, Avg hold, 7D distribution bar, Balance, Last active, Follow/Copy.
- **Scraped field names:** `realized_profit_7d, pnl_7d, winrate_7d, txs_7d, net_inflow_7d, daily_profit_7d, avg_holding_period_7d, pnl_*_num_7d, tag_rank`.
- GMGN does **not** publish numeric criteria for smart_degen, KOL, whale, fresh wallets or sniper.

### 7.8 Wallet style title: a 20-cell grid [P]

**Frequency level** (perDay = (buy+sell)/days): **L1** <1; **L2** 1–<10; **L3** 10–50; **L4** >50.

**P&L level** (first match wins):

- **P5:** pnl>0.5 AND token_num≥5 AND (winrate≥0.5 OR lt50<0.15)
- **P4:** pnl>0.1 (review variant: L4 with pnl>0.03 and realized>0)
- **P1:** lt50≥0.40 AND realized<0
- **P3:** |pnl|≤0.10
- **P2:** realized<0 OR pnl<0
- otherwise P3

**Titles:**

| Freq | P5 | P4 | P3 | P2 | P1 |
|---|---|---|---|---|---|
| L4 | money printer | full-auto grinder | worn down | gas burner | self-destruct |
| L3 | harvester | active winner | spinning top | fee donor | bleeding out |
| L2 | old hunter | steady hand | lukewarm | retail loser | deep underwater |
| L1 | one-shot | zen winner | bystander | toe in the water | wiped out |

- No title is shown when there are no trades or token_num <5.
- **Speed subtitle** (median copy window, needs ≥3 round trips): <60 s flash flipper; <1d intraday; <7d swing; otherwise long hold.
- **Badges:**
  - lottery: winrate<0.35 AND gt5≥1
  - sniper: median entry MC <$100k
  - scales in: buys per token ≥3. Scales out: sells per token ≥3.
  - concentrated: top-3 ≥70% of buy USD with ≥5 tokens
  - hoarding: buy/sell ≥3. Distributing: sell/buy ≥3.
  - fixed hours: ≥70% of trades in one 6h window, with ≥20 rows
  - whale: avg buy ≥$10k
  - launcher: created > half of token_num
  - official tag
  - new wallet: <30d
  - insufficient sample: <20 trades
  - wash flag
- **Render:** a pill showing `{emoji} {title} · {speed}`. Click to expand a popover (not hover). Conclusions only; never show the methodology.

### 7.9 Copy-trade scores and backtest [P]

**TRACK score** = 100 × Σw·f, with:

- tail 0.34: `1−lt_n50/tn`
- upside 0.28: `(gt5+x2_5+x0_2)/tn`
- roi 0.16: `clamp((roi+0.05)/0.35)`
- win 0.10: `clamp(winrate/0.5)`
- size 0.12: `clamp((tn−20)/300)`

**COPY score:**

- entry 0.22: `clamp(0.12+(1−entry_under_100k))`
- profit 0.22: `clamp(avg_trade_usd/80)`
- hold 0.20: `clamp((1−flip×1.6)×clamp(avg_hold_s/172800+0.15))`
- feasible 0.18: `clamp(1−trades/2500)`
- edge 0.18: `clamp(1−0.6·entry_under_100k−0.6·flip)`

**Backtest** (latency 3 s, slippage 5%, gas $0.2):

- `wallet_pct = clamp(realized/bought_cost, −0.9, 3)`
- `drift = latency×0.015×(0.3+0.7×entry_under_100k)`
- `copy_pct = wallet_pct − drift − 2×slippage − gas/avg_buy`
- `copy_7d = realized×copy_pct/wallet_pct`

**Self-dealing.** Applies when `created_token_count > 0.5×max(1,tn)`. Both scores are multiplied by **0.45**, and a Dev reputation score is computed:

`s = 0.25+0.55·surv−0.30·clamp((inner−50)/950)+0.15·ath_track·surv−0.35·sec_risk`, where `ath_track = clamp((log10 ath−5)/2)`.

**Verdicts:**

| Condition | Verdict |
|---|---|
| Dev with rep <40 | red |
| Dev with rep ≥40 | yellow |
| track ≥65 and copy <35 | "learn, don't copy" |
| track ≥60 and copy ≥55 | green, small copy |
| track <40 | red |
| otherwise | yellow |

**Style tags:**

- Bot/Quant: ≥2000 trades in 7d
- Flash flipper: flip ≥0.3
- Sniper: ≥80% of entries <$100k
- Diamond hands: avg hold ≥5d and trades <200
- Whale: avg buy ≥$5k
- High win-rate: ≥0.65 with ≥15 trades
- Quick-draw: hold <1h, flip <0.3, ≥30 trades
- Obscure hunter: median entry <$30k
- True skill: realized >$20k with big losses ≤5%

### 7.10 Copy dossier: four gates [P]

- **FORM** (7d vs all-time ROI):
  - never worked: ra≤0 and r7≤0
  - broken down: ra>0.1 and r7≤−0.1
  - heating up: r7>max(0.1, ra)
  - steady: |diff|≤0.15
  - cooling: r7<ra−0.15
- **G1 Authenticity** fails on any of:
  - corroborated wash trading (conviction share <0.5)
  - launcher wallet
  - token_num <5
  - one-coin record: realised >0, ≤1 coin ≥2×, ≥8 tokens, losers >50%
  - pcr ≥0.75 when trusted (≥3 winners and ≥8 rows)
  - Note: `conviction_share` ≥0.5 refutes `wash_trader`.
- **G2 Currency** fails on: broken or never-worked form, or r7≤0 and r30≤0.
- **G3 Reachability** fails on any of:
  - copy window <3× latency
  - median entry MC <$30k
  - sandwich or MEV tag
  - ≥10k followers on sub-$1M caps
  - gas drag ≥25%
  - average buy <$50
  - >100 trades/day
- **G4 Survivability** fails on any of: ≥2 unrefuted honeypots, lt50 ≥0.35, or ≥3 hold-to-zero positions.
- **Verdict order:** NO READ → DO NOT COPY (with cause) → stopped making money → HOLD OFF → WATCH, DO NOT COPY → COPY THE BUYS NOT THE EXITS → COPYABLE AT SMALL SIZE.
- **Size cap** = 0.5 × average buy.
- **Caliber:**
  - top-tier: ra ≥$500k, wr ≥0.55, hl ≤0.10, n ≥50
  - seriously good: ra ≥$100k with wr ≥0.5 or hl ≤0.15, n ≥20
  - solid: hl ≤0.20 and wr ≥0.40
  - otherwise unremarkable
  - Also: loses money; was good, not any more; record unreadable.

### 7.11 Trading portrait (3-line review) [P]

- **Lines:** tag, one-line recap (money made or lost + top strength + top problem), and one next step. The next step is phrased "Next step" when you view your own wallet and "Reference advice" for others.
- **Hold-split groups:** ≤60 s, ≤30 m, ≤6 h, >6 h. Fires when the dominant group holds ≥40% with ROI <5% and another group with n ≥10 has ROI ≥15%.
- **Discipline rules** (need ≥30 closed positions):
  - A. Hold losers: losers' hold ≥2× winners'.
  - B. Size losers: losers' ticket ≥1.5× winners'.
  - C. Bad adds: ROI with adds ≤ ROI single − 10pp.
  - D. Bag-hold: ≥3 open positions down ≥50% with cost ≥$50.
- **Strengths:** clean stops (lt50 <0.05), win rate ≥0.6, payoff ≥2.
- Platform tags are not shown in this module.

### 7.12 Batch compare and leaderboards [P]

Up to 100 wallets per call. Money values are decimal strings. ROI per row is computed as in §7.3.

---

## 8. Tracking, social and alerts

### 8.1 Live wallet feeds [P]

| Feed | Route | Limits | `is_open_or_close` semantics |
|---|---|---|---|
| Smart Money | `GET /v1/user/smartmoney?chain&limit` | 1–200, default 100, weight 1 | **0 = opened/added, 1 = closed/reduced** |
| KOL | `GET /v1/user/kol` | same | same as Smart Money |
| Followed wallets | `GET /v1/trade/follow_wallet` (signed) | `limit` 1–100 (default 10), weight 10, `side`, `filters[]`, `min/max_amount_usd` | **1 = full open/close, 0 = partial** (the opposite convention) |

**Row fields**

- Smart Money / KOL rows: `transaction_hash, maker, side, base_address, base_token.{symbol, launchpad}, amount_usd, token_amount, price_usd, buy_cost_usd, is_open_or_close, timestamp, maker_info.{twitter_username, tags}`.
- Follow rows add: `id, quote_address, base_amount, quote_amount, cost_usd, price, price_now, price_change (ratio: 6.66 means +566%), launchpad(_platform), migrated_pool_exchange, base_token.{logo, hot_level, total_supply, token_create_time, token_open_time}, maker_info.{name, twitter_name, tag_rank}, balance_info`, plus `next_page_token`.

**Rule:** normalise the two `is_open_or_close` conventions to a single enum: open | add | reduce | close.

### 8.2 Signal strength and red flags [P]

**Strength scale**

| Level | Condition |
|---|---|
| Weak | 1 KOL buy |
| Medium | 2–3 smart-money buys in the same direction, OR 1 smart-money full open |
| Strong | ≥3 smart wallets in the same direction within 30 min |
| Very Strong | Strong cluster + full opens + a KOL joining |

**Red flags**

- Smart money doing a full close.
- Only KOLs buying, with zero smart money.
- KOLs buying while smart money sells (divergence).
- One large buy with no follow-through.

KOL entries usually come after smart money, so a KOL buy alone is a late signal.

### 8.3 Follow management [S]

- **Follow / remark / emoji.** Follow from the wallet page, a feed row, or the holder and trader tables. The remark is a private nickname. `follow_count` and `remark_count` count other users who have done the same.
- **Bulk import/export.** Import takes a plain list `[addr1,addr2,...]`. Export produces JSON `[{address, name, emoji}]`. Up to 2,000 addresses can be tracked.
- **Follow caps.** Older docs say 100 on the web. A Nov 2024 VIP update raised it to 300 (500 on application).
- **Per-wallet bell.** Pauses alerts without unfollowing.
- **Following list.** Columns: emoji+nick, address, tags, balance, 1d/7d PnL, win rate, last active.

### 8.4 Monitor Square / Sky Eye [S]

**Monitor Square** ranks tokens by inflow from followed, Smart Money and KOL wallets.

- Windows: 1m / 5m / 1h / 6h / 24h.
- Each card shows: MC, volume, socials, net inflow, how many tracked wallets bought (avatar stack), buys/sells, and time. Hide icon bottom-left, Quick Buy bottom-right. Expanding a card shows about 8 wallet rows.
- Filters: `volume, marketCap, netInflow, walletCount, holderCount, tokenAge, dexs[], metrics[], migrate_status`.
- Internal `follow_cards` payload:
  - `token{…}`
  - `wallets[{wallet_address, twitter_name, avatar, balance, net_inflow, amount_total, buys, sells, side, is_open_or_close, timestamp}]`

**Sky Eye (天眼信号)** is listed as "in development" in the official CN README. It aggregates per token: smart/KOL buys, call-outs, and MC change since the first signal.

**Inferred formula:** `net_inflow = Σbuy_usd − Σsell_usd` by tracked wallets in the window, ranked by smart net inflow with ≥2 distinct buyers. [I]

### 8.5 Call-outs (喊单) and declarations (宣言) [P]

- **Global feed:** `POST /v1/callout/global` with `{chains[1..20], limit 0–50, page_token, only_kol, only_declaration, only_safe, min_holding_usd, max_holding_usd}`. Weight 3.
- **Wallet record:** `POST /v1/callout/get_record` with `{chain, call_wallet, call_token?, limit, page_token}`. Returns the last 30 days plus `summary.{7d,30d}.{total_calls, avg_multiplier, best_multiplier, hit_2x_count, top_tokens}`.
- **Record fields:** `ulid, chain, call_wallet, call_token, call_price, call_mc, call_thesis.{source_content, translation_content{lang:text}}, create_time (ms), multiplier (= current/call price, a ratio), token_symbol, token_logo, token_price, is_safe (safe|risk|unknown), is_kol, twitter_username, current_holding_usd, unrealized_profit, callback_count`.
- **Pagination:** `next_page_token` expires after 24h. When filters are applied, a page can return more rows than `limit`, so decide whether more pages exist from the token alone.
- **Errors:** 400 (expired cursor), 502 `CALLOUT_API_UNAVAILABLE` (13 s timeout), 503 `CALLOUT_CURSOR_UNAVAILABLE`.
- **Semantics:**
  - A declaration is paid, pinned visibility. It is not a quality signal.
  - "Calling ≠ holding": flag a run-up when the caller's holding is ≈0.
  - Hit rate = `hit_2x_count/total_calls` over 30d.
  - Calls render as chart avatar markers: Fomo Thesis (the caller must hold), Fomo Top, X Call.

### 8.6 X Tracker and SnipeX [S]

**X Tracker**

- Sources: 2,000+ curated accounts (Top Subscriptions: Master / Trader / KOL) plus "Mine". Custom non-top accounts are capped at 5.
- Event types: Tweet, Reply, Retweet, Quote, Update Bio. Community tools add avatar, name, banner, follow/unfollow, delete, pin.
- Features:
  - CA/Token-only filter.
  - Detected CA chips with a `⚡ xx SOL` quick buy.
  - Keyword rules (colour + sound, added Dec 2025).
  - Per-account sounds.
  - Pin handle.
- **CA regexes:** SOL base58 32–44 characters, validated on-chain; EVM `0x[a-fA-F0-9]{40}`.

**Internal WS payload** `twitter_user_monitor_basic`:

- `i, ti (tweet id), tw ∈ tweet|repost|reply|quote|delete_post|follow|unfollow|photo|description|other, stw, ts (ms)`
- `u{s handle, n, a, f followers}, ut[]`
- `c{t text, m[{t,u}]}`
- `si, su, sc`
- `f{f{s,n,d,a,b,f}}`
- `p{ba, aa, bd, d, bb, ab}`

**Social-risk signals**

- Twitter Rename Alert.
- `twitter_rename_count`, `dev.twitter_name_change_history`, deleted-post count.
- Blacklists by X handle, CA, dev, keyword, or website.
- Blacklisted devs show a red chef-hat icon. A "Search DEV" button looks the dev up on X.

### 8.7 Alerts and notifications [S]

- **Price/MC alerts.** A native narrow toast (`RemindToast`). A token bell lets the user choose metric, condition, target and channel (added ~Nov 2025).
- **Holding price alert.** Per-chain `push_switch_dict.holding_signal: open|close` from `POST /api/v1/notification/user_config_list` with body `{}`. That call returns rows for 13 chains. Mobile push uses JPush/FCM.
- **Wallet alerts.**
  - Channels: web notifications with sound, mobile push, Telegram Alert Bot (`/add` ≤10 wallets, `/set` all/buy/sell).
  - VIP zero-latency group bot: 300–500 wallets, ≤10 bot tokens, `/groupid`.
  - Rebinding Telegram after unbinding is not supported.
- **Push categories (app).** AI Signal, monitored-address activity, AM/PM brief, CTO, Dex paid.
- **Floating "Trade Alert" window.**

---

## 9. Signals feed and signal-type definitions

### 9.1 API [P]

`POST /v1/market/token_signal`, weight 1.

- Body: `{chain ∈ sol|bsc|robinhood|arc|stable, groups:[{signal_type[], mc_min, mc_max, trigger_mc_min, trigger_mc_max, total_fee_min, total_fee_max, min_create_or_open_ts, max_create_or_open_ts}]}`.
- Groups are OR'd; fields within a group are AND'd.
- Each group returns at most 50 rows. Groups run in parallel and are merged by `trigger_at` desc.
- There is no cursor.
- If `signal_type` is omitted, types 1–13 and 17–21 are returned. Types **14/15/16 return HTTP 400** (the README still shows `[14,16]`).

**Item fields:** `id, token_address, signal_type, trigger_at (s), trigger_mc, first_trigger_mc (token-scoped, any type), market_cap (now), ath (ATH MC), signal_times, signal_times_by_type{type:count}, cur_data{top_10_holder_rate, holder_count, liquidity}, data (opaque snapshot at trigger; omits volume/swaps)`.

### 9.2 Signal types [P names; trigger rules I]

GMGN publishes **no** thresholds, windows, ladders or cooldowns. The triggers below are our proposals, anchored on GMGN's own published numbers.

| # | Enum | Meaning | Proposed trigger [I] |
|---|---|---|---|
| 1 | SignalType1 | K-line spike | On candle close: green, `vol_ratio=V[-1]/mean(V[-21:-1])≥3` (GMGN's own ">3 = volume-backed push" rule), candle vol ≥ $2k, ≥10 swaps, body ≥20% / 10% / 6% / 4% for MC <100k / <1M / <10M / ≥10M. Cooldown 15m; re-fire at ≥1.3× |
| 2 | DexAd | Dex Screener ad bought | New `tokenAd` order, approved; dedup by paymentTimestamp |
| 3 | DexUpdateLink | Paid profile/socials | `tokenProfile` approved or link-set diff |
| 4 | DexTrendingBar | Trending-bar ad | `trendingBarAd` approved |
| 5 | DexBoost | Boost bought | `totalAmount` increased; coalesce 5m |
| 6 | PriceUp | Price spike | Δ5m ≥30% (MC <1M) / ≥15%; or Δ1h ≥100% / ≥50%; or Δ1m ≥20% (MC <300k); vol5m ≥ $5k; buys ≥ sells; liq ≥ $5k. Cooldown 30m; re-fire ≥1.5× |
| 7 | PriceATH | New ATH | Age ≥60m (or migrated), MC ≥ $100k, sane prior ATH (unknown if ≤0, >1e10 or >50×mc); new MC >1.05× prior ATH after ≥60m consolidation, or ≥1.5× the last ATH signal. Cooldown 60m |
| 8 | McpKeyLevel | MC key level | Ladder 50K, 100K, 300K, 500K, 1M, 3M, 5M, 10M, 30M, 50M, 100M, 300M, 1B. Cross up and hold for one 1m close. Each level fires once and re-arms after <50% for 24h. Multi-level jumps emit the highest level |
| 9 | Live | Launchpad livestream | First appearance in the currently-live set; ends after 3 missed polls; re-fire after a 30m gap |
| 10 | BundlerSell | Bundlers dumping | 5m window: Σ bundler sells ≥1% of supply or ≥ max($1k, 1% of liquidity). Strong at ≥5%. Cooldown 10m |
| 11 | Cto | Community takeover | Once per token |
| 12 | SmartDegenBuy | Smart money buy | 30m window: ≥2 distinct `smart_degen` buyers, Σ ≥ $500, net >0; or 1 full open ≥ $1k. Re-fire on wallet-count steps [2,3,5,8,13,21] |
| 13 / 19 | PlatformCall / V2 | Platform call / call-out | V2: a call from a KOL, or a 30d record with ≥5 calls and hit-2× ≥0.3, or a declaration. 1 per caller per token per 24h; coalesce callers within 10m |
| 14 | LargeAmountBuy | Single large buy (API-rejected) | amount ≥ max(L(mc), 2% of liq), L = $2k / 5k / 10k / 25k by MC tier; excludes bot/bundler/sniper/dev. Cooldown 5m |
| 15 | MultiBuy | Burst of buyers (API-rejected) | ≥5 distinct non-bot buyers each ≥ $100 within 60s; wallets sharing a funder count as 1. Cooldown 10m |
| 16 | MultiLargeBuy | Several large buys (API-rejected) | ≥3 wallets meeting the type-14 bar within 10m. Cooldown 30m |
| 17 | BagsClaims | Bags fee claim | Per claim tx ≥ $50; dedup by signature; coalesce 10m |
| 18 | PumpClaims | Pump creator-fee claim | `CollectCreatorFee` / `collect_coin_creator_fee` / `distribute_creator_fees`, ≥ $50 (`claim_cashback` excluded) |
| 20 | KOLBuy | KOL buy | ≥ $100, an open or add; coalesce 5m; dedup per (token, KOL) for 6h; divergence warning if smart money is selling |
| 21 | BankerClaims | Bankr fee claim (Base) | ClankerFeeLocker `ClaimTokens*` ≥ $50 |

**Engine state per token:** `first_trigger_at/mc, signal_times, signal_times_by_type, last_trigger_at[type], last_trigger_value[type], armed_levels, live_session_id, seen_order_ids, seen_tx_signatures`.

**Dedup key:** `sha1(chain|token|type|bucket)`.

**Derived metrics:** `now_multiple = market_cap/trigger_mc`, `peak_multiple = ath/first_trigger_mc` (guarded).

**Legacy web signal feed [S].** `/defi/quotation/v1/signals` carried `buy_duration, buy_usd, tx_count, smart_buy, smart_sell, signal_1h_count, first_entry_price, is_first, previous_signals[], recent_buys{smart_wallets, smart_buy_usd, following_wallets, following_buy_usd}`.

**UI categories.** Dex Paid (Ad, Boost, Bar, Update Social), Price Alert (Price Up, ATH, Key MC), Smart Money, KOL, Platform Call, Other (Pump Live, CTO). Filters: Age, MC, Total Fees.

**AI skills catalogue** adds: smart-money exit signal (cluster sells), price-surge with rug filter, watchlist price swing.

---

## 10. Accounts, platform and business model

### 10.1 Login and wallets [S]

**Login**

- Methods: Connect Telegram via `@gmgnaibot` (a one-time login link), Connect Phantom (custodial account bound to that wallet), app QR scan.
- Plain plugin-wallet signing is also possible, but it has **no anti-MEV and no automation**.
- No email, social, or passkey login was found.

**Custodial wallets**

- One SOL wallet, one EVM address shared across ETH/Base/BSC, and one Tron wallet, all auto-created at first login.
- Up to 10 wallets can be created or imported. Wallet actions: Primary (default), Rename, Archive (closes that wallet's orders and copy tasks).
- Multi-select buys across wallets.
- WSOL→SOL convert.
- Private-key export policy is contradictory: EN docs say export is prohibited; CN docs say a one-time export is allowed.

**Deposit**

- Address + QR per chain family, with a wrong-network warning.
- Buy with card.
- Consolidate (many→one) and Distribute (one→many) require 2FA and only list assets above $10.

**Withdraw** (web only since 25 Mar 2025)

- Requires a Google Authenticator bind and a whitelist. Adding or editing a whitelist entry needs 2FA. Transfers to whitelisted addresses skip 2FA.
- Locks: **3h after any whitelist change**, **24h after rebinding 2FA**.
- `canWithdraw = has_2fa && to∈whitelist && now ≥ whitelist_changed_at+3h && now ≥ totp_rebound_at+24h`.

### 10.2 Fees, referral, credits [S]

**Fees.** 1% per trade (sole platform revenue). Referred users pay 0.9% per one third party; other claims are unverified. DefiLlama reports over $292M in cumulative fees.

**Referral**

- Code format: custom or 8 random characters.
- Bound on the first visit before the user's first trade, and shared across web, extension, and Telegram bots.
- Referrer earns 10–30% of the invitee's fees, rising with volume. Higher rates are available by application.
- Group bots carry codes.

**Credits** (since 30 Sep 2025)

- Earned only by trading. Third-party figures: +1 per SOL/BSC trade ≥ $10, and +100 per $1,000 of daily volume, subject to a daily cap.
- Redeemed in a Credits Store with scheduled drops, fulfilled through a Google Form.
- There is no GMGN token.

**Declarations.** Paid, pinned call-outs.

### 10.3 Developer API and agent offering [P]

- **Host:** `https://openapi.gmgn.ai`.
- **Key creation:** generate an Ed25519 (or RSA) keypair locally and upload the SPKI public key via `gmgn.ai/ai/generateapi?pbk=`. The key is bound to the account and its wallets. An IPv4 whitelist is required when swap capability is enabled.
- **Public demo key:** `gmgn_solbscbaseethmonadtron` (read-only).
- **Exist auth:** `X-APIKEY` + query `timestamp` (±5 s) + `client_id` (UUID; replays rejected within 7 s).
- **Signed auth:** adds `X-Signature = base64(sign('{sub_path}:{sorted_query_string}:{body}:{timestamp}'))`. Ed25519 signs raw bytes; RSA uses PSS-SHA256 with salt 32.
- **Response envelope:** `{code (0 ok), data, error, message, upgrade_url, upgrade_message, reset_at}`.
- **Rate limits:** leaky bucket per plan as rate/capacity: Free 5/5, Plus 20/20, Pro 50/50.
  - Throughput ≈ rate/weight per second. Burst = floor(capacity/weight).
  - Weight > capacity returns 403 `PLAN_UPGRADE_REQUIRED`, so weight-10 trading routes cannot succeed on Free [I].
  - Each request during a ban adds 5 s, up to 5 min (`RATE_LIMIT_BANNED_MAX`).
  - The client retries once only for GETs with a wait ≤ 5 s.
- **Weights:**

| Group | Routes and weights |
|---|---|
| Token | info/security/pool 1, holders/traders 5, kline 2 |
| Market | rank 3, trenches 2, signal 1, hot 3, search 1 |
| Wallet | holdings 2, user/info 2, activity 3, stats 3, profits 3, token_balance 2, created 2 |
| Follow / feeds | follow_tokens 3, groups 1, follow_wallet 10, kol/smartmoney 1, callout 3 |
| Trading | swap/multi_swap/quote 10, query_order 5, strategy create 5 / cancel 2 / list 1, gas 1 |
| Cooking | create 5, stats 1 |

- **CLI:** `gmgn-cli` (MIT, Node ≥18) plus 15 skills (token, contract-dd, holder-analysis, market, portfolio, wallet-analysis/score/style/review, track, callout, token-buy, swap, cooking, kline-pattern; also dev-score, narrative, heat-rank).
  - Targets: Claude Code, Cursor, Cline, Codex CLI, OpenCode, OpenClaw.
  - Credentials stored in `~/.config/gmgn/.env` (chmod 600).
  - Output sanitised with `[filtered]`.

### 10.4 Telegram, app, extensions [S]

**Telegram bots**

- Trading: SOL `@GMGN_sol_bot` (with backups), ETH `@GMGN_swap_bot`, Base, BSC, Tron.
- Login: `@gmgnaibot`.
- Group bots: CA lookup `@GMGNAI_bot`; smart-money alerts `@Alert_GMGNBOT` (`/set`).
- Behaviour: pasting a CA opens a trade card or auto-buys. Limit orders expire after 3 days.

**Mobile app.** Track (Follow / Activity), push, long-press notes on Favorites, Rewards, Multi-Wallet Trading (Apr 2026).

**Extensions.** No official extension. Third-party ones fill gaps: GMGN Go, First Token Sniper, CoinLinker, 985gmgn-helper (dev-record badges, starred wallets, multi-chain monitor, large alert cards).

### 10.5 Safety guidance [S]

- Fake bots exist that swap capital `I` for lowercase `l`.
- Admins never DM first.
- Phishing links appear on token pages.
- Revoke unknown approvals.
- One phishing incident cost users more than $700k.
- Disclosures: transactions are irreversible; the in-app wallet is a hot wallet.

---

## 11. UI/UX design language (reference only, do not copy)

### 11.1 Palette, type, radius [S]

**2025 mobile capture**

| Role | Values |
|---|---|
| Page | `#111214` (`bg-50` `#0c0c0f`) |
| Inputs | `#1f2024`, `#26282b` |
| Lines | `#212229`, `#27282e`, `#2d2f33` |
| Text | `#f0f5f5`, `#c4cccc`, `#757e80` (the most-used colour), `#5d6466` |
| Primary / up | mint `#86d99f` |
| Down | `#f26682` |
| Info / link | `#647eff` (blue), `#6db4f7` (links) |
| Warn | `#ffd039` / `#f2c366` |

**2026 desktop wallet page**

| Role | Values |
|---|---|
| Nav | `#0a0a0a` |
| Page | `#121212` |
| Card | `#1f1f1f`, no border |
| Pill / button | `#242424` / `#262626` |
| Text | `#f5f5f5`, `#cccccc`, `#808080` |
| Up / down | green `#4db77e`, red `#c9534b` |
| Caveats | gold `#c9a227` |
| Spacing | card radius 12 px, gutter 22 px |

**Type and radius**

- Font: Geist, mostly weight 500.
- Sizes: 12 px dominant, then 14, 11, 16 (symbols), 10, 13, and 32 (hero).
- Line heights: 14 / 18 / 20. Numbers use −0.2 px tracking.
- Radius scale: 6 px dominant, then 4, 9999, 8, 16.
- Chain accents in Fusion mode: sol `#7b44f2`, bsc `#eab204`, base `#3073ff`, eth `#4d84f7`, robinhood `#9fc700`, … (user-overridable).

### 11.2 Number and time formatting [S]

- **Tiny prices:** subscript zeros, e.g. `$0.0₅3518` = 0.000003518. In observed samples, 0.00019 rendered plainly.
- **USD:** `$791.9`, `$4.93`, `$307`, `$3.9K`, `$255.83M`. Some P&L columns show full values up to 10K (`+$9,941.8`) before switching to K.
- **P&L:** `+$30.27`, `-$0.45 (-99.71%)`.
- **Percent:** one decimal in tables, two in headers; a trailing `.0` is trimmed.
- **Addresses:** first 4 + `...` + last 4.
- **Ages:** `25s / 4m / 1h / 21d`; fresh ages are shown in green. Relative times read `2m ago`.
- **Empty states:** `$0 (--)` and "No Data".

### 11.3 Behaviours [S + I]

- Virtualised fixed-height lists; new rows prepend.
- Hovering a list pauses it.
- Row hover changes the background and reveals hidden actions such as blacklist.
- Tags expand on click, not hover; conclusions live in popovers.
- Value-change flash and skeletons were not verified on GMGN.

**Common complaints, i.e. opportunities**

- Price-alert toast is too small.
- Tracker feed is noisy, with no pin, star, or colour per wallet.
- Monitor shows only one chain at a time.
- Dev record is missing from cards.
- No copycat warning.
- Mobile hides holder structure.
- Login walls.
- 1% fee.

---

## 12. Internal web API and WebSocket protocol [S]

### 12.1 REST

**Envelope and conventions**

- Response: `{code:0, msg|message, reason, data}`. Example errors: 40000300 (legacy tokens endpoint retired since 2026-10), 40002307.
- Path families: `/api/v1` (core), `/vas/api/v1` (lists), `/vas/api/mul-region`, `/defi/quotation/v1` (legacy), `/mrwapi/v1`, `/trs/api/v1` (trenches), `/wallet-api`, `/mrtapi`.
- Chain is a path segment. Arrays are sent either repeated or bracketed.
- Logged-in requests carry `Authorization: Bearer`. A 401 triggers one refresh, then a retry.
- Per-IP 429s hit all endpoints at once.

**Key endpoints**

- **Token bootstrap:** `POST /mrwapi/v1/multi_token_full_info {chain, addresses:[a]}` is the hard dependency. `POST /api/v1/mutil_window_token_info` (sic) batches ≤10 addresses with ≤4 in parallel.
- **Token stats and counters:**
  - `token_stat` (5 s)
  - `token_price_info` (windows 1m/5m/15m/1h/6h/24h)
  - `/vas/api/v1/token_holder_stat` and `token_trader_stat` (30 s)
  - `token_wallet_tags_stat`
  - `token_liquidity_stats` (10 s)
  - `token_trends?trends_type=avg_holding_balance|holder_count|top10_holder_percent|top100_holder_percent|bundler_percent|insider_percent|bot_degen_percent|entrapment_percent` (60 s) → `trends.{type}[{timestamp,value}]`
- **Candles:** `token_candles` / `token_mcap_candles`.
  - At most 9,991 bars per request; page in windows of ≤6,000.
  - Jump-to-creation resolution by token age: ≤2.5h → 1s, ≤37h → 15s, ≤3d → 30s, ≤6d → 1m, ≤31d → 5m, ≤93d → 15m, ≤187d → 30m, ≤375d → 1h, else 4h.
- **Chart marks:** `tg_calls/klines`, `discord_calls/klines`, `follow/agged_token_trades`, `remark/agged_token_trades`, `fomo/top_wallet_agg`, `agged_token_transfers`.
- **Security and dev:**
  - `token_security_sol|evm`, `mutil_window_token_security_launchpad`, `token_lock_info`
  - `tokens/rug_history` → `{history, holder_rugged_num, holder_token_num}`
  - `token_rug_info` → `rug_ratio, rugged_tokens[]`
  - `token_bundler_stat` → `{bundler_count, bundler_max_hold_ratio, bundler_swap_quote_amount, bundler_swap_ratio}`
  - `token_fee_info` → `tax_allocation{marketing, dividend,…}`
  - `recommend_slippage` → `{recommend_slippage, has_tax, display_slippage, volatility}`
  - `token_link`, `token_dev_info`, `token_logo_history`
  - `logo/logo_dup_detail`, `similar_coin_max_and_earliest` (OG namesake)
  - `dev_created_tokens` (`marcket_cap` sic)
  - `native_transfer`
- **Wallets:** `/defi/quotation/v1/smartmoney/{chain}/walletNew/{addr}?period` (flat PnL buckets + `risk{}`), `/api/v1/wallet_stat/{chain}/{addr}/{period}`, `wallet_holdings`, `wallet_activity`, `rank/{chain}/wallets/{period}?tag[]&orderby&direction&limit&min/max_*`.
- **Lists:**
  - `rank/{chain}/swaps/{period}`, `bluechip_rank`, `pairs/{chain}/new_pairs/{period}`
  - `POST /trs/api/v1/trenches_rank`, which uses abbreviated keys `lp, lpp, qa, qs, s_tal, f{}`
  - `smartmoney_cards`, `kol_cards`
  - `dex_trades_polling` (60 s; chain 24h trades/volume/traders/created/migrated, plus `topLaunchpads`/`topProtocols` with change rates)
- **Bootstrap:** `user_config/get {modules}`, `show_remark_tokens`, `follow/following_wallets_v2`, `remark_tokens`, `notification/user_config_list`, `wallet-api/dex/v1/get_coins`.

### 12.2 WebSocket

**URL evolution:** `wss://ws.gmgn.ai/stream` (2024) → `ws.gmgn.ai/quotation` (2025) → `wss://gmgn.ai/ws` (Feb 2026) → same-origin `/v2/ws`, `/trs_ws`, `/rrs_ws` (Sep 2026). A SharedWorker fans out to tabs; it uses plugins such as `pumpRank-<chain>`.

**Frames**

- Client: `{action:'subscribe'|'unsubscribe'|'heartbeat', channel, f:'w' (required), id, data:[{chain, addresses, interval}], access_token?, retry?:1}`.
- Ack: `{action, id, channel, code:0, msg:'success'}`.
- Push: `{channel, data:[...]}`.
- Heartbeat: `{action:'heartbeat', client_ts}` ↔ `{…, srv_ts}`. Sent every ~5 s (main) / 10 s (account); a connection is dead after 90 s of silence.
- Reconnect backoff: 1 s → 30 s, then resubscribe.

**Channels**

| Channel | Payload / notes |
|---|---|
| `new_pool_info` | `{c, rg, p:[{a pool, ex, ba base, qa, qr, il, iqr, l launchpad, lpp, p_oc, ot, pts, pt, qs, sid, bti{…}}]}`. `bti` short keys: `s n l ts v1m..v24h s1m..s24h p hc pcp1m..1h br bs isa hl lqdt t10hr t70_shr rm rfa mc ctr cbr cts d_ff rtar bop sdc rc pg dx_ad dx_ul dx_tb dx_bf snp cto d_cic d_coc d_ccc dhr ihr s_ihp s_os s_or s_bt s_st std` |
| `new_pair_update`, `new_launched_info`, `token_social_info` | New-pair and token-social updates |
| `trenches_update` / `trenches_delta` | `data.t[{c, a, f{…}}]`. The worker emits **PATCH** frames `{kind 1, seq, targetLen, replaces[{i, id, data|null}]}` and **SNAP_SHOT** frames (kind 2) on a gap; a Map variant uses upserts/removals |
| `token_stat` | `{a, c, p, p5m, pcp5m}`. Subscribe to every visible token; cap 200 per frame |
| `token_activity` | `{a, e, pu, au, t, ca, m}`. Batched; >500 KB at peak; throttle per mint ≥100 ms |
| `kline` (formerly `token_kline`) | `{a, i, o, h, l, c, v, t, n}` |
| `chain_stat` | SOL `route_info` with `gk` and `d.{p,a,b,rbh,rs,sc}='<ms>:<slot>:<b64>'`; EVM gas + coin price |
| `following_wallet_activity` | `{s, n, m, bs, ba, cu, au, pu, bts, bct, ts, h, ooc, cnt processed\|confirm, id, nm}`. Two-phase delivery. Labels: buy+ooc1 New, buy+ooc0 Add, sell+ooc1 Close all, sell+ooc0 Reduce |
| `wallet_trade_data` | Addresses + access_token |
| `twitter_user_monitor_basic`, `…_token`, `…express`, `…translation` | X tracker streams |
| Account channels | `wallet_balance, swap_order_info, strategy_order_info, limit_order_info, tg_order_info, tg_processed_order_info, tg_monitor, user_config_update, personal_remind_event, public_broadcast, major_coin_price` |

**Cadences**

| Data | Interval / mechanism |
|---|---|
| token_stat (REST) | 5 s |
| token_prices | 10 s |
| comments | 10 s |
| liquidity | 10 s |
| holder/trader counts | 30 s |
| top_buyers | 30 s |
| trends | 60 s |
| dex_trades_polling | 60 s |
| security staleTime | 60 s |
| Activity | REST first page + WS only |
| Trenches | Snapshot + PATCH |
| Charts | REST history + WS bar |

Rule: list membership comes from REST/snapshot, row values come from WS deltas, and counts are polled.

### 12.3 Internal ↔ OpenAPI naming drift (choose one canonical name each)

- `orderby` (internal) vs `order_by` (OpenAPI).
- Insider family: `rat_trader_amount_rate` (volume) vs `top_rat_trader_percentage` (cohort) vs `suspected_insider_hold_rate` (holding) vs `insider_percent` (series) vs `ihr`. Note `insider_rate` is never sent.
- Bundler family: `bundler_trader_amount_rate` vs `bundler_rate` (creation-block share of supply) vs `top_bundler_trader_percentage` vs `bundler_count`.
- Market cap: `market_cap` vs `usd_market_cap` vs `mc` vs `marcket_cap`.
- Wallet PnL: flat `pnl_lt_minus_dot5_num` (internal) vs nested `pnl_stat.pnl_lt_nd5_num` (OpenAPI).
- The wallet `risk{}` block exists only internally.

---

## 13. Launchpad, DEX and lifecycle mechanics (simulator ground truth)

### 13.1 Lifecycle model [P + I]

Lifecycle: CREATED → BONDING (0 < progress < 1) → COMPLETE (curve full) → MIGRATED (pool created, `open_timestamp` set).

- **Pump.fun sequence [S]:** `TradeEvent → CompleteEvent → PostCompleteBuyEvent → migrate`. After COMPLETE, trades fail with `BondingCurveComplete` until migration.
- **Detecting migration:** use `CompletePumpAmmMigrationEvent`, deduped by mint. Do not use the withdraw-authority mention; only 70% of those transactions are real migrations.
- **No-curve platforms** (clanker, zora, flaunch, klik, heaven, xstocks, pool_*): `progress = null` and `open_timestamp = created_timestamp`.
- **Age:** compute from `creation_timestamp`. `open_timestamp` is the migration time; a token can sit on its curve for weeks.

### 13.2 Progress conventions [S + I]

Two native conventions exist:

- **Token mode:** fraction of curve tokens sold. Used by pump, four.meme, flap and trench.
- **Quote mode:** quote raised ÷ threshold. Used by LaunchLab, Meteora DBC and Pons.

Store both. Pump.fun numbers: vT0 = 1,073M, vQ0 = 30 SOL, curve tokens S = 793.1M, k = 32,190M SOL·tokens, supply 1B.

- `progress_quote = (32190/(1073 − 793.1·p_t) − 30)/85.005`
- `MC_SOL = 32190e15/(1073e6 − 793.1e6·p_t)²`

| p_t (token sold) | MC SOL | ≈ USD @ $119 | p_q (quote) |
|---|---|---|---|
| 0.00 | 28.0 | $3.3k | 0.00 |
| 0.50 | 70.4 | $8.4k | 0.21 |
| 0.60 | 90.3 | $10.8k | 0.28 |
| 0.70 | 120.1 | $14.3k | 0.38 |
| 0.80 | 167.4 | $20k | 0.51 |
| 0.90 | 249.5 | $29.8k | 0.70 |
| 0.95 | 315 | $37.6k | 0.83 |
| 1.00 | 410.9 | $49k | 1.00 |

**Recommended `near_completion` cut [I]:** `progress_tokens ≥ 0.60` (equivalently `progress_quote ≥ 0.28`, about 25 SOL raised), with hysteresis back to "new" below 0.50. Evidence: once 25 SOL is raised, 12.4% of tokens graduate, versus a 2.62% base rate. With ≤1 SOL left, 99.6% graduate. GMGN's real cut is undocumented. Codex uses graduationPercent ≥ 80.

### 13.3 Venue catalogue [S]

| Platform family | Curve | Graduation | Target | Fees |
|---|---|---|---|---|
| **Pump.fun** (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`) | x·y=k on virtual reserves; vT 1.073B, vSOL 30, real 793.1M, supply 1B (Token-2022, 6 dp) | `real_token_reserves==0`; ~85.005 SOL raised; MC 410.9 SOL | PumpSwap (`pAMMBay6…`) canonical pool index 0, seeded 206.9M + ~84.99 SOL, LP burned; `pool_migration_fee` 15,000,001 lamports | Curve 1.25% (0.95% protocol + 0.30% creator); older docs 1% |
| Pump variants | same | same | same | `pump_mayhem` (AI-agent trading; reserved fee recipients; no synthetic migration), `pump_agent` (auto-buyback), cashback (deprecated), holder rewards (fee streamed to holders) |
| **PumpSwap** fee tiers by MC (lamports) | — | — | — | Tiered lp/protocol/creator bps: 0 → 2/93/30 (1.25%); 420 SOL → 20/5/95; then the creator share steps down through 1,470…93,330 to 20/5/5 (0.30%) at ≥98,240 SOL. USDC tiers start at 59k |
| **Raydium LaunchLab** (letsbonk, bonkers, ray_launchpad, stonkfun) | same reserves (vA 1,073,025,605,596,382; vB 30,000,852,951 lamports), sell 793.1M | quote mode, `total_fund_raising_b` 85 SOL (USD1 6,250) | Raydium CPMM (0.25% + 0.05% creator) | 0.25% protocol + platform fee (cap 5%) + creator (cap 0.5%); observed 1.25% |
| **Meteora DBC** (meteora_virtual_curve, jup_studio, moonshot_app, believe, trends_fun, bags) | partner-configurable (up to 16–20 segments) | `quoteReserve ≥ migrationQuoteThreshold` | DAMM v2 | base ≥0.25%, anti-snipe schedulers up to 99%; migration fee options 0.25/0.30/1/2/4/6%. Jupiter Studio Meme preset: 16k → 69k MC, ~17.94k USDC |
| **Bags** | DBC; supply 1B (9 dp); threshold 85 SOL; start MC ~29 SOL; graduation MC ~500 SOL | quote | DAMM v2 | Fee modes 2/2, 0.25/1, 1/0.25; social fee-share (≤100 claimers) |
| **Moonshot (Moonit)** | 800M on curve | ~$75k MC, 88 SOL | DAMM v2 (LP locked) | 1% |
| **boop** | ~743.2M | ~86 SOL | Raydium / Meteora | holder rewards pushed |
| **heaven** | own AMM, no graduation | — | — | creator tier 1.5% / community tier 0.1% |
| **Four.meme** (TokenManager2 `0x5c95…762b`) | (offers+vt)(vq+funds)=K; 800M on curve, 200M to pool | 24 BNB gross (~18 net), or 12,000 USDT | PancakeSwap v2 (LP burned) | 1% (min 0.001 BNB); X Mode anti-snipe 100%→1% by ~block 6; OpenFour adds creator incentives 0.02–1% |
| **Flap** (Portal `0xe2cE…9De0`) | (x+h)(y+r)=K; BSC r=6.14, h=107036752; 800M sold | ~16 BNB (code floor 14) | PancakeSwap | 1% + tax 1/3/5/10%; `FlapTokenProgressChanged` (wad) |
| **Clanker v4** | none; Uniswap v4 pool, 100B supply, start ~10 ETH MC | — | — | Static 1% (dynamic 1–5%); protocol takes 20% of LP fees; sniper fee 66.7%→4.2% over 15 s |
| **Zora** | none; v4 + Doppler | — | — | 1% (creator 0.50%…); launch fee 99% decaying over 10 s |
| **Trench** | 800M sold; ETH raise ~6 ETH (MC ~29.9 ETH); Robinhood ~5 ETH | token mode | ETH Uniswap V2 (LP burned) / RH Uniswap V3 1% | 1.25% ETH / 1% RH (0.3% to dev) |
| **Pons v2** (Robinhood) | phantom quote 1.68 ETH | 4.2 ETH net (quote mode) | Uniswap v4 locked | 1% + creator tax; snipe tax 99% over 3–5 s; graduation ~1.4% |
| **virtuals_v2** | VIRTUAL-paired | 42,000 VIRTUAL | Uniswap V2 (LP locked 10y) | 1% tax |

### 13.4 Empirical lifecycle statistics (simulator calibration) [S]

**pump.fun**

- Launches: 27k–50k per day in 2026.
- Graduation rate: 0.6–1.0% before BOOST (Jul 2026); 2.5–6.7% around BOOST; ~2.6% in Oct 2026.
- Graduation by initial dev buy: none 0.34%; 0.05–0.2 SOL 5.70%; more than 5 SOL 7.98%.
- Time to graduate: median ~5 min (Sep 2025 sample 4.4 min, ~457 curve trades); 81% graduate within 1h. A lognormal fit is ln-min σ≈2.83 [I].
- Lifespan: non-graduates last about 9h on average.
- After graduation: 73% fall below 40% of the migration price within 20 min; 19.7% keep ≥$5k liquidity at 24h.

**Other launchpads**

| Launchpad | Statistic |
|---|---|
| LetsBonk | Peak 19,620 launches/day; graduation up to 2.26% |
| Four.meme | Peak 47.8k launches in one day; graduation 1.3% |
| Clanker | ~13k launches/day; >95% lose liquidity within 48h |
| Believe | Graduation 0.8% |
| Pons v2 | Graduation ~1.4% |
| SunPump | Graduation 1.55% |

**GMGN live mix**

- SOL 24h trending top-100: pump 55 / ray_launchpad 28 / stonkfun 11 / meteora_virtual_curve 6.
- BSC Trenches: flap 137–150 of 180 rows; four.meme 30–43.

### 13.5 Exchange enum [P]

`pump_amm, raydium, meteora_damm_v2, meteora_dlmm, uniswap_v2/v3/v4, pancakeswap, pancake_v2/v3`.

Recommended normalised set: `pump_amm, raydium_amm_v4, raydium_cpmm, raydium_clmm, meteora_damm_v1/v2, meteora_dlmm, orca_whirlpool, pancake_v2/v3, uniswap_v2/v3/v4, kumbaya_v3, dyorswap, launchpad_curve:<platform>`.

---

## 14. Holder-risk metric derivation spec (our deterministic definitions) [I, anchored on P/S]

GMGN computes all labels server-side and does not publish the definitions. GMGN's glossary pages, reached second-hand, give these meanings:

- **Dev team** = creator + bundled buyers.
- **Sniper** = bought "within the first few blocks after trading opened".
- **Insider** = holds tokens but did not buy after open.
- **Suspected insider** = shares creation time, funding source and transfer time with other holders.
- **Phishing** = received tokens by transfer.

The conflicts in GMGN's own fields come from mixing three kinds of number:

- **hold**: current balance ÷ supply
- **volume**: share of bought volume
- **cohort**: count share of an analysed-trader cohort

**Resolution for our product: every chip shows the current holding share of effective supply D.** Volume and cohort rates appear only in tooltips and advanced filters.

### 14.1 Universe and denominator

- `D = total_supply − balance(burn/dead addresses)`.
- **Excluded from every numerator and from Top-10 ranking:** burn/dead addresses, pools/vaults (including the bonding-curve account), the token contract (reported as "Contract self-held"), launchpad PDAs, lockers (reported as "Locked"), labelled CEX hot wallets (reported as "CEX"), and private vaults (reported as "vanish").
- Index all holders, not just the top 100.
- **Float view** = 1 − burn − DEX share. Below 2% float the token is "Cannot assess".

### 14.2 Labels (token-scoped unless noted)

**Dev team**

- Members:
  - the creator;
  - wallets in the creation transaction or the same-slot creation bundle;
  - wallets whose first native funding came from the creator or a team member within 7d before their first acquisition;
  - recipients of token transfers from the creator or team, excluding burn, pool, locker and contract addresses.
- Membership is retroactive and never removed automatically.
- Status: `hold` (balance ≥ 1 token, no sells), `sold_part`, `creator_close` (balance < 1 token).

**Bundler**

- ≥2 distinct buyers in one block linked by a hard signal: same tx (multi-signer), same Jito bundle (same tip), same fee payer, or the creation bundle.
- Timing fallback: ≥3 buyers in the same block within the first 100 blocks after open, none of them routers or MEV.
- The creator is excluded.
- Becomes a global tag after appearing in ≥3 tokens within 30d.
- Related metrics:
  - `bundle_initial_rate` = non-creator creation-bundle buys / D (our analogue of GMGN `bundler_rate`).
  - `bundler_volume_rate` = bundler buys / all eligible buys.

**Sniper**

- Among the first 70 distinct non-creator buyers (`early_buyers`), a wallet whose first buy lands in blocks `b_o … b_o+3`, or within 1.6 s on chains with blocks under 400 ms. dev_team is excluded.
- `b_o` = the creation block for curve tokens, or the first liquidity-add block for DEX launches. Migration does not count as a new open.
- Tag is frozen at first buy. `sniper_count` ≤ 70.
- Early-buyer status: sold_all > transferred > sold_part > bought_more > hold, where sold_all means balance < 1% of peak.

**Insider (rat_trader)** — an eligible non-creator wallet that matches any of:

- **(A)** acquired with no buy after open, from an insider sender (≤2 hops) or before open;
- **(B)** dev-funded: first funder is a dev_team member, or the creator's own first funder, within 72h;
- **(C)** shared-funder cluster: ≥3 wallets with the same non-service funder that are *coherent* (funded within a 6h span, or amounts within ±15% of the mean);
- **(D)** batch-funded: ≥2 wallets funded within 60 s.

Service funders are excluded: CEX, bridges, launchpad fee accounts, Jito tip accounts, relayers, and hubs that funded ≥1,000 wallets in 24h. Becomes a global tag after appearing in ≥3 tokens within 30d.

**Fresh wallet**

- `fresh_at_entry` = wallet age at first acquisition < 24h, OR (age < 7d AND 0 prior tokens). Frozen at entry.
- Global `fresh_wallet` tag while age < 7d and ≤2 lifetime tokens.

**Phishing (our definition)**

- Holder whose entire balance arrived by transfer from a spray sender (≥5 recipients within 10 min, amounts within ±15%), or via an address-poisoning dust transfer.
- GMGN's `entrapment_ratio` semantics are unknown: its eth median is 0.88, so it may measure trapped or underwater traders.

**Rugged** (`creator_rug_ratio`)

- Prior launches older than 24h, newest 100.
- A launch counts as rugged if: liquidity < $4k, dev_team pulled ≥50% of LP, or dev_team sold ≥80% of their peak within 30 min.
- Never-graduated launches with no dump count as "failed", not rugged.
- Value is null when N < 3.

**Smart money** (daily, 30d window, 2-day hysteresis):

- token_num ≥ 10
- realized ≥ $5k
- pnl ≥ 0.30
- winrate ≥ 0.45 or lt50 < 0.15
- ≤100 trades/day
- not a launcher
- top coin ≤60% of profit
- not a corroborated wash trader

`pump_smart` is the same test restricted to curve tokens (≥10 tokens).

**KOL**

- `kol`: verified X binding with ≥5,000 followers. Demoted below 4,000 on two consecutive weekly checks.
- `renowned`: curated list.
- `top_followed`: ≥10,000 followers.

**Whale**

- Token-scoped: max(position, cumulative buy) ≥ $10k. Sticky.
- Global badge: 30d average buy ≥ $10k with ≥5 buys.
- $5k marks the single-trade Large buy signal.

**Bot / sandwich / MEV**

- `bot_degen`: ≥2,000 trades in 7d, or >100 trades/day, or flip rate ≥30% (sell within 5 s).
- `sandwich_bot`: ≥3 front-run/back-run pairs in 7d.
- `dex_bot`: provenance only.

**Wash trading**

- Wallet: ≥30% of 7d volume is round trips ≤60 s with |PnL| < 1%, or circular trades within a funding cluster.
- Token: ≥30% of 24h volume.

**Other tags**

- `top_holder`: rank ≤ 10.
- `transfer_in`: any inbound transfer.
- `paper_hands`: sold ≥50% within 5 min of first buy.
- `bluechip_owner`: holds ≥$1k of top-100 tokens for ≥30d.

**Recompute cadence**

| Item | Cadence |
|---|---|
| Holding-share chips | Every block batch: ≤2 s for tokens < 24h old, ≤60 s otherwise |
| Tags | At event time, frozen |
| Insider clusters | Every 5 min (tokens < 24h), hourly after |
| Global labels | Daily at 00:05 UTC |
| KOL followers | Weekly |

### 14.3 Default chip thresholds (red when > threshold) [S]

Top10 30% · DEV 30% · Insiders 5% · Phishing 5% · Bundlers 10% · Fresh 10% · Snipers 10% · Rugged 10%.

Other GMGN bands:

- Top10: <20% clean, 20–50% caution, >50% danger.
- Contract-DD tiers: §5.12.
- Community screens:
  - At launch: dev ≤3%, bundlers <10%, snipers <7%, insiders <5%.
  - After bonding: unsold snipers <12%, first-70 holding <20%, insiders <2%.

### 14.4 Test vector TV1 (token, supply 1,000M, D=1,000M, curve holds 777M)

Expected results after 30 trades and 2 transfer events:

| Metric | Expected value |
|---|---|
| Top10 | **13.50%** |
| DEV | **0%** (creator_close) |
| dev_team | 4.00% |
| Insiders (I1–I3, shared funder F) | 3.50% |
| Snipers (S1–S4 + I1, slots 1000–1003; R1 at slot 1004 excluded) | 5.40%, `sniper_count` 5 |
| Bundlers (D1, D2, B1–B3) | 5.40% |
| Phishing (P1–P6 spray from R1) | 0.30% |
| Fresh (FR1, FR2, X1) | 2.80% (count ratio 10.0%) |
| Rugged | 3/12 = **25% (red)** |
| bundle_initial_rate | 5.00% |
| bundler_volume_rate | 25.17% |
| insider_volume_rate | 13.27% |
| De-duplicated risk set | 15.6% |
| Float-basis view (float 22.3%) | Top10 60.5% red → "Not recommended" |

The full fixture is in the research JSON. The PRD appendix reproduces it.

---

## 15. PnL accounting engine [P semantics + I spec]

**GMGN evidence.** GMGN exposes a single `accu_cost` per position (avg = accu_cost/balance), one `buy_cost_usd` per sell row, and `Entry MC = total_supply × avg_cost`. It never mentions lots or FIFO. Conclusion: a **moving weighted-average cost per (chain, wallet, token)**, with no lots.

**Our algorithm** (decimal math; integer base units):

- **BUY(q, cost_in incl. fees):** `avg_acq_ts = (qty·avg_acq_ts + q·t)/(qty+q)`, then `qty += q`, `cost += cost_in`.
- **SELL(q, proceeds_net):**
  - `q_cov = min(q, qty)`
  - `basis = cost·q_cov/qty`
  - `realized += proceeds_net·(q_cov/q) − basis`
  - `cost −= basis`, `qty −= q_cov`
  - If `q > qty` (oversell): backfill history first. If that fails, add an implicit inflow at the execution price (0 PnL on the excess) and set the `basis_incomplete` flag.
- **Close:** when qty is dust (< 1e−6 of the cycle's max, or value < $0.01), write the residual into realized and increment `cycle_id`. The next buy starts a fresh average.

**Identities and ratios:**

- `A = B_net − C_R − transfer_out_cost`
- `U = V − A`
- `T = R + U + transfer_pnl`
- `T == S_net + V + transfer_out_value − B_net`
- `total_profit_pnl = T/B_net`
- `realized_profit_pnl = R/C_R`
- `unrealized_profit_pnl = U/A` (null when balance is 0)

**Fees**

- Buy cost includes the platform fee plus network, priority and tip.
- Sell proceeds are net of the same.
- `history_bought_cost` and `history_sold_income` stay gross, as GMGN does.
- ATA rent is excluded. Fees on failed transactions are wallet-level unattributed costs.
- Win and loss use net values, so a flat round trip is a loss.

**Transfers** (rules applied in order):

1. **Internal** (linked wallets, or a matched out/in pair within 0.5% and 10 min): carry basis, no PnL.
2. **CEX withdrawal:** cost = FMV at receipt.
3. **Other external:** cost = FMV, tagged `transfer_in`.
4. **Airdrop/spam** (never bought, and spam, or FMV < $1, or ≥20 recipients): cost 0, hidden.

- Transfer-out removes basis at average cost. `transfer_pnl` is shown separately and is never included in realized PnL or win rate.
- `non_trade_position` is set when >50% of the cycle came in by external transfer. Such positions are excluded from win rate, buckets and leaderboards.

**Valuation**

- Mark price comes from the deepest live pool (last trade < 15 min). Fallbacks: liquidity-weighted median, then last trade (marked stale), then curve price.
- **Rugged** (depth < $100, LP pulled > 90%, or pool closed): mark = 0.
- **Honeypot** (no sells by anyone in 24h): value 0.
- **Dust** < $1: hidden.
- Exit value is shown in a tooltip and simulated against the pool.

**Win rate.** Computed per token per period, over tokens with ≥1 in-period sell, excluding non-trade, airdrop and basis-incomplete tokens.

- WIN when realized > 0. Exactly 0 is a non-win.
- Partial sells are summed per token.
- `win_rate_gmgn_parity = wins/token_num`.
- Show "–" when fewer than 5 tokens settled.

**Buckets.** Use `r = realized/realized_cost` and add a 6th bar, **Unsold**. Partial sells use the cost of units sold.

**Periods.** Rolling 24h/168h/720h windows and All. Realized PnL is attributed at sell time.

- `roi = realized/realized_cost` for every period.
- `capital_roi = realized/bought_cost` (GMGN-stats parity).
- `unrealized_now` is a snapshot.

**Daily calendar**

- `day_value` = Σ row realized (net) for sells whose local date is D, plus that day's unattributed fees.
- Timezone = viewer's IANA zone (switchable to UTC). Built from hourly UTC rollups (15-min for :30/:45 offsets).
- Intensity = `min(1, |v|/P95)` on a sqrt scale.

**Multi-wallet**

- Merged position row: `merged_avg = ΣA/Σqty`.
- Group realized = sum of per-wallet realized (per-wallet basis is the default).
- Internal transfers are de-duplicated.

**Conformance vectors TV1–TV10.** These cover moving average vs FIFO, fees, transfer-in, internal transfer, periods/calendar across time zones, oversell, rug, dust close and re-entry, win rate/buckets, quote conversions, and multi-wallet. Reproduced in PRD Appendix C.

---

## 16. Independent data sourcing and execution backend (for future real-chain adapters) [S]

| Feature | Primary | Fallback | Licence risk |
|---|---|---|---|
| SOL ingestion | Own Yellowstone gRPC ×2 vendors (Helius LaserStream Business $499/mo; Shyft $199–649; Triton ~$2.9k); `vote=false`, `max_receive_message_length` ≥64 MB, resume from_slot−32 | Codex `onLaunchpadTokenEventBatch`, PumpPortal | Low |
| EVM ingestion | Own nodes + `eth_subscribe logs`; Base flashblocks (200 ms); BSC fast finality | BlockRazor/bloXroute streams | Low |
| Candles, holders, PnL, cohorts | Own jobs | Codex (only vendor with sniper/bundler/insider held-% for launchpad tokens), Birdeye (CU pricing), Solana Tracker | Medium for display |
| Security | Own mint/freeze/Token-2022 checks; forked EVM buy/sell sim | GoPlus (keyless; HTTP 200 + code 4029 when limited), honeypot.is v2, RugCheck, Jupiter `/shield` | Medium |
| dexscr_* flags | DEX Screener WS + `/orders/v1` | none | **HIGH**: ToS bans competing products and redistribution |
| X social | X API pay-per-use ($0.005 post read, $0.01 user read; 2M/mo cap) | none recommended | Medium / HIGH for scrapers |
| Labels | Own PnL-ledger scoring | Nansen/Arkham/Codex for validation only | Medium–High |
| SOL execution | Direct program builders + Jupiter Swap v2 `/build` (no Jupiter fee) | `/order+/execute` (50 bps on tokens < 24h) | Low |
| SOL landing | Parallel Jito + Helius Sender + Nozomi + 0slot + bloXroute + Astralane (tips ≥0.00001–0.001 SOL); durable-nonce variants to avoid double buys | own RPC | Low |
| BSC / ETH / Base landing | 48 Club Privacy RPC + BlockRazor `/fullprivacy` / Flashbots Protect `/fast` / sequencer RPC | bloXroute, MEV Blocker | Low |
| Fee collection | In-tx SystemProgram transfer (SOL); allow-listed fee-router multicall (EVM); never arbitrary calldata (Maestro Router2 lesson) | Jupiter `platformFeeBps`, 0x `swapFeeBps`, OKX `feePercent` | Low |
| Custody | Turnkey (Nitro enclaves + policy engine) or AWS KMS Ed25519/secp256k1 + Nitro signer | Privy, Fireblocks, Dfns, … (solana-keychain adapters) | Contractual |

**Incident lessons**

| Incident | Date | Loss | Root cause |
|---|---|---|---|
| DEXX | Nov 2024 | ~$21–30M | Plaintext key export |
| Banana Gun | Sep 2024 | ~$3M | Telegram message oracle |
| Maestro Router2 | Oct 2023 | 280 ETH | Arbitrary calldata |
| Solareum | Mar 2024 | — | DPRK insider |
| Thunder Terminal | Dec 2023 | — | Leaked MongoDB URL |
| Pump.fun | May 2024 | — | Ex-dev withdrawal authority |
| Axiom | Feb 2026 | — | Insider lookups |
| bs58-encrypt-utils | Jul 2025 | — | Malicious dependency |

**Controls drawn from these:**

- E2E-encrypted, rate-limited key export.
- Withdrawal allowlists with 24–48h cooldowns.
- Exact approvals and allow-listed router targets.
- Least-privilege support tooling.
- Pinned dependencies.

**Provider interface:** `Clock, Rng, ChainStream, Decoder, MarketDataProvider, SecurityProvider, PromoProvider, SocialProvider, LabelProvider, PriceFeed, FeeOracle, Router, Signer, Submitter, TxTracker`, each with Real, Replay and Sim implementations.

| Mode | ChainStream | Execution | Other |
|---|---|---|---|
| dev | Sim | Sim | — |
| paper | Real | SimRouter/SimSubmitter on real pool state | — |
| replay | ReplayChainStream | — | virtual clock |
| prod | Real | Real | Real |

---

## 17. Competitive landscape [S/I; competitor facts recalled, not re-fetched]

| Product | Type | Signature features | Fees (re-verify) | Weak spots |
|---|---|---|---|---|
| **GMGN** | Web terminal + TG bots + app + agent API | Deepest labels (13 chains, `smart_degen/renowned/rat_trader/bundler/sniper/insider/fresh/dex_bot`), 21 signals, call-outs, trailing TP/SL, 100-wallet batch, cooking, signed OpenAPI | ~1% | 1% fee, noisy tracker, small alert toasts, single-chain monitor, no dev record on cards, mobile depth, login walls |
| **Axiom** | Web terminal | Pulse 3-column board (New Pairs / Final Stretch / Migrated) with per-column filters (Protocols, Keywords, Audit, $ Metrics, Socials: `dev_migrations`, `global_fees_paid`, `twitter_reuses`, pro traders, DEX paid); floating instant-trade panel and Sell Init; MEV Off/Reduced/Secure; Hyperliquid perps (builder code); yield on idle SOL; wallet + X tracker | 0.95% → 0.75% by tier; cashback 0.05–0.25%; referral 30/3/2% | Clutter, CPU-heavy, insider lookups incident (2026) |
| **Photon** | Web terminal | Memescope (New / About to Graduate / Graduated), limit orders, simple layout | 1% | Fewer analytics, phishing clones |
| **BullX Neo** | Web terminal (TG auth) | Neo Vision board, multi-chart grid, sniper | ~1% | TG auth friction, migration downtime |
| **Padre** (owned by Pump.fun since Oct 2025) | Pro terminal | Dockable panel workspace, X tracker, first-party Pump data | ? | Launchpad vertical integration means it is not neutral |
| **Banana Gun / Trojan / Maestro / Bloom** | TG bots + web | First-block sniping, anti-rug, AFK copy trade, DCA, multi-wallet, Bloom extension quick-buy on X | 0.5–1%; Trojan 0.9% with referral; Banana 40% revenue share | Bot-key hacks, TG UX |
| **DEX Screener** | Charts / screener | Trending, Boosts (Golden Ticker at 500), Enhanced Token Info ($299), ads, free API | Free + paid promos | No execution; "DEX paid" gets read as legitimacy |
| **Birdeye / Codex / Moralis** | Data | Security tab, top traders, data APIs | Subscription | — |
| **Cielo** | Wallet alerts | Multi-chain wallet tracker, granular TG alert rules | Freemium | — |
| **Nansen / Arkham** | Labels | Smart Money cohorts, published label methodology | Subscription / credits | Expensive, not memecoin-native |
| **Pump.fun** | Launchpad UI | Board, livestreams, creator rewards, PumpSwap; acquired Kolscan and Padre | Curve 1.25% | Its own launches only |

**Complaint catalogue → differentiator map [I]:**

| Complaint | Our answer |
|---|---|
| Fees | All-in pre-trade cost preview |
| Speed | Landing telemetry + smart retry |
| MEV | Landed price vs. quote |
| Rugs | Explainable safety score + hard gates + dev reputation on cards |
| UX clutter | Density / performance modes + hotkeys |
| Wrong PnL | Explainable ledger replay |
| Security | Passkeys, allowlists, scoped automation consent |
| Copy trading as exit liquidity | Copy gates + KOL dump detection |
| Paid marketing read as trust | Neutral "spend" badges |
| Mobile | Responsive PWA |
| Learning curve | First-class paper trading |

---

## 18. Glossary

| Term | Meaning |
|---|---|
| Trenches (战壕) | Live board of launchpad tokens in three lifecycle columns: New / Almost bonded / Migrated |
| new_creation / near_completion (`pump` key) / completed | Trenches categories |
| Bonding curve / on curve (内盘) | Launchpad price-discovery phase. `progress` / `launchpad_progress` run 0–1. `is_on_curve`; `inner_count` = tokens still on the curve |
| Migrated / graduated (外盘 / 毕业 / 已开盘) | Curve complete, liquidity moved to a DEX pool. `launchpad_status=2`, `open_count`, blue "M" marker |
| launchpad_platform vs exchange | Where the token launched (Pump.fun, letsbonk, fourmeme…) vs the current DEX (pump_amm, raydium, meteora_damm_v2…) |
| is_internal_market / is_out_market | Trending tags meaning on curve / graduated |
| smart_degen (Smart Money) / pump_smart | Algorithm-tagged profitable wallets. `smart_degen_count` |
| renowned / kol (KOL) | Influencer, fund or public-figure wallets. `renowned_count` |
| rat_trader (Insiders, 老鼠仓) | Insider/sneak wallets. `rat_trader_amount_rate` = volume share. `suspected_insider_hold_rate` = holding share |
| Suspected insider | Holders sharing creation time, funding source and transfer time |
| bundler (捆绑 / 打包买入) | Wallets buying in one coordinated same-block bundle at launch. `bundler_rate` = creation-block share of supply. `bundler_trader_amount_rate` = volume share |
| sniper (狙击) | Bought within the first blocks after open. `sniper_count`. `top70_sniper_hold_rate` = current holding of first-70 snipers |
| First 70 buyers | The first 70 non-creator buyers, each with a status: hold / bought more / sold part / sold all / transferred |
| entrapment ("Phishing") | `entrapment_ratio` / `top_entrapment_trader_percentage`. GMGN UI calls it "Phishing". Semantics unclear |
| private vault ("vanish") | `private_vault_hold_rate` |
| fresh_wallet | New wallet with no history. `fresh_wallet_rate` |
| bot_degen | Bot trader wallets. Real volume = `vol × (1 − bot_degen_rate)` |
| dex_bot | Wallet trading via a bot front-end (Axiom, Photon, BullX, Trojan, GMGN, Drops, PepeBoost, Padre) |
| bluechip_owner | Holder that also holds bluechip memecoins. `bluechip_owner_percentage` |
| dev / creator / dev_team | Token creator and associated wallets |
| creator_hold / creator_close | Dev still holds vs dev's position closed (not necessarily sold). Token info uses hold / sell |
| CTO (`cto_flag`) | Community takeover after the dev abandoned the token |
| Dex Paid (`dexscr_ad / dexscr_update_link / dexscr_trending_bar / dexscr_boost_fee`) | DexScreener marketing purchases |
| rug_ratio | 0–1 rug-risk score. >0.3 = high risk; ≥0.5 = labelled rug. Mostly SOL only. 0 is not proof of safety |
| hot_level | Unnormalised heat level. Compare only within one result set |
| visiting_count | Search/visit heat, used by the Hot searches ranking |
| OG (`is_og`) | Original token of a narrative or name, as opposed to copycats |
| distribed | Hot-search tag: top-10 holder rate in (0, 0.3] |
| not_risk | Composite low-risk tag (see §4.3) |
| quote_address_type | Opaque integer quote-asset classes sent in the Trenches request |
| Metrics Threshold | Trenches settings that turn chips red (Top10 30, DEV 30, Insiders 5, Phishing 5, Bundlers / Fresh / Sniper / Rugged 10) |
| Degen Audit | Legacy table audit column: MintDisable, Blacklist, Burn pool %, Top 10 |
| RapidLaunch / vamped | Tokens deployed by copycat "vamp" tools |
| Same Name / Avatar Reused Tokens | Copycat lists. `image_dup_count` |
| Call-out (喊单) / Declaration (宣言) / callback (跟喊) | Public call with a price/MC snapshot / paid pinned call / a call that references an earlier one |
| multiplier | Current price ÷ call price |
| Fomo Thesis / Fomo Top / X Call | Chart avatar markers for calls |
| P1 / P2 / P3 | Fee presets Economy / Standard / Turbo = gas low / average / high. Default P2 |
| Priority fee / Tip (bribe, Jito tip) | Validator priority fee / private-relay payment |
| Anti-MEV (off / normal / secure) | Protected routing. UI labels Off / Reduced / Secure |
| Condition order | TP/SL/trailing sell rule attached to a buy (`profit_stop, loss_stop, profit_stop_trace, loss_stop_trace`) |
| price_scale / drawdown_rate / sell_ratio_type | Trigger % from entry / trailing pullback % / `buy_amount` vs `hold_amount` sizing |
| STMix / LimitOrder | Strategy order groups |
| smart_trade / mix_trade | Dip-buy entry plus TP/SL bracket |
| Cooking | GMGN's token launch flow (create + dev buy + bundle/sniper wallets + auto-sell) |
| Dev Sell / Migrated Snipe / Migrated Sell / SnipeX | Automation triggers on dev selling / migration / X posts |
| Copy window | Median seconds from first buy to first sell per token |
| Copy-tradeability score | 0–100 measure of whether a follower can capture a wallet's edge |
| Self-dealing discount | ×0.45 applied to launcher wallets' scores |
| Caliber / Form | Wallet record grade / 7d-vs-all-time trajectory |
| CONDUCT / POWER / TOTAL | Dev score axes |
| Float | 1 − burn − DEX share of supply |
| Entry MC | total_supply × avg_cost |
| Diamond hands | Holders with a cost basis, no sells, still holding |
| accu_cost / avg_cost | Cost basis of the open position / average buy price |
| buy_cost_usd | Cost basis of the units sold on a sell row |
| pnl_stat buckets | Token counts by realized ROI: >500%, 200–500%, 0–200%, −50–0%, <−50% |
| is_open_or_close | Position-boundary flag (semantics differ by feed) |
| Monitor Square / Sky Eye (天眼) | Follow-inflow board / aggregate signal page (in development) |
| Fusion mode | Mixed multi-chain feed with chain-colour stripes |
| Real volume | Volume with the bot share removed |
| Leaky bucket rate/capacity | API plan limits (Free 5/5, Plus 20/20, Pro 50/50) |

---

## 19. Open questions (consolidated)

1. **Trenches mechanics.**
   - The `near_completion` progress cutoff.
   - Whether `progress` is token-mode or quote-mode.
   - The `data.pump` vs `near_completion` key.
   - Where no-curve tokens bucket.
   - What `quote_address_type` codes mean.
   - What `filters:['offchain','onchain']` means.
2. **Enum conflicts.** `launchpad_status` is 0/1/2 in token info but '0'/'1' in hot-search. Dev status is `creator_hold/creator_close` vs `hold/sell`.
3. **Card details.** Exact Trenches card chip order. Meaning of `DS` and its duration. Default chart marker legend. Default hotkey column/row keys.
4. **Undefined metrics.** Sniper window, bundler detection, insider rules, entrapment, private vault, bot_degen, fresh-wallet age, rug_ratio formula, hot_level formula, smart money/KOL/whale criteria and refresh cadence. None are published.
5. **Insiders chip source.** Which field drives "Insiders": `suspected_insider_hold_rate`, `rat_trader_amount_rate` or `top_rat_trader_percentage`? The same question applies to Snipers and Bundlers.
6. **Kline data.** Units of volume vs amount (USD vs token). Time unit (s vs ms).
7. **Win rate.** Denominator (sold tokens vs `token_num`). Bucket edge inclusivity. Whether realized PnL is net of fees. Whether `accu_cost` uses FMV for transfer-ins. Whether stats windows are rolling or day-aligned.
8. **Signals.** Thresholds, Key MC ladder and cooldowns for all 21 types. Whether 14–16 still exist on the web. 13 vs 19 semantics. The Base chain for type 21. Contents of the `data` payload.
9. **Fees and plans.** Exact platform fee per chain and side. How the fee is deducted (input vs output). Referral tiers and invitee discount. Prices of API plans.
10. **Copy trade.** Chains covered in 2026, full filter list, Fixed Ratio semantics, per-task blacklist.
11. **Private-key export.** Policy (EN docs vs CN docs).
12. **Login methods.** Whether email, social or passkey login exists. Multi-wallet caps per chain.
13. **Live-stream status.** No official Pump.fun API exists for it.
14. **Licensing.** DEX Screener's ToS bans competitors. Usage and licensing for X API, Nansen and Arkham.
15. **UI.** Desktop light-theme palette. Exact desktop nav order. Full footer button list. PnL share card layout.

---

## 20. Sources

**Primary source:** GMGN's own npm package **`gmgn-cli@1.6.7`** (MIT), unpacked locally. This includes `Readme.md`, `Readme.zh.md`, `dist/validate.js`, `dist/client/OpenApiClient.js`, `dist/client/signer.js`, `dist/commands/{market,token,portfolio,track,swap,cooking,callout,config}.js`, `dist/config.js`, `dist/confirm.js`, `dist/sanitize.js`, `dist/output.js`, and the skill docs `skills/gmgn-{market,token,contract-dd,holder-analysis,portfolio,wallet-analysis,wallet-score,wallet-style,wallet-review,track,callout,token-buy (references/fields.md, thresholds.md, resolution.md, pitfalls.md),swap,cooking,kline-pattern,dev-score (references/scoring.md, fields.md, glossary.md),narrative (references/interfaces.md, patterns.md),heat-rank}/SKILL.md`. Unless marked otherwise, every **[P]** fact comes from this package. Repository: https://github.com/GMGNAI/gmgn-skills (also `docs/cli-usage.md`, discussion #83).

**GMGN first-party web**

- https://gmgn.ai/blog/how-to-choose-a-chain-for-meme-trading/
- https://gmgn.ai/blog/meme-rotation-signals-on-robinhood-chain/
- https://gmgn.ai/blog/buy-memecoins-on-arc-vs-robinhood/
- https://gmgn.ai/blog/how-to-buy-new-robinhood-chain-launches/
- https://gmgn.ai/blog/what-to-check-after-finding-a-trending-memecoin/
- https://gmgn.ai/blog/what-is-a-meme-coin-bundle/
- https://gmgn.ai/blog/how-to-find-meme-coins-earlier/
- https://gmgn.ai/blog/how-to-read-fomo-calls-on-gmgn-chart/
- https://gmgn.ai/blog/how-to-tell-if-a-meme-coin-is-safe/
- https://gmgn.ai/blog/how-beginners-trade-meme-coins-safely/
- https://gmgn.ai/blog/how-to-check-bsc-token-taxes-on-gmgn/
- https://gmgn.ai/blog/how-to-set-take-profit-stop-loss-on-gmgn
- https://gmgn.ai/blog/how-to-track-copy-solana-smart-money/
- https://gmgn.ai/blog/how-to-track-smart-money-with-ai-agents/
- https://gmgn.ai/static/tos.html · https://gmgn.ai/portfolio · https://gmgn.ai/ai/skills/multi-wallet-buy

**GMGN docs** (read via search snippets and dated mirrors)

- https://docs.gmgn.ai/index/gmgn-meme-trading-guide · /index/meme · /index/featured-icon-definition · /index/new-pair · /index/trending · /index/trenches-hotkeys · /index/discover · /index/wallet-radar · /index/q-a · /index/quick-start · /index/safety-tip · /index/cooking
- /index/follow-monitor-square-follow-watchlist · /index/follow-watchlist-following-wallet-detail-page-activity · /index/wallet-detail-page · /index/wallets-import-export · /index/insider-traders-snipers-first-70-buyers
- /index/token-page-chart-multicharts-activity-trading-system · /index/trading-system · /index/gmgn-fees-settings · /index/transaction-limit-order-failure · /index/auto-sell-auto-sell-take-profit-stop-loss · /index/trailing-stop-loss · /index/trailing-take-profit · /index/auto-buy-auto-buy-limit-buy · /index/alert-sniper-new-following-limit-orders · /index/auto-trading-dev-sell · /index/auto-trading-migrated-snipe · /index/auto-trading-migrated-sell · /index/snipex · /index/copy-trade-copy-smart-money-automatically-earn-sol
- /index/x-tracker · /index/wallet-alert-on-telegram · /index/zero-latency-wallet-tracking-bot · /index/gmgn-telegram-bot-list · /index/gmgn-tg-alert-channel-bot · /index/gmgn-tg-sniper-bot-sol · /index/invite-gmgnai_bot · /index/invite-alert_gmgnbot · /index/gmgn-app-tutorial
- /index/tg-wallet-connect-tg-multi-wallet-system · /index/tg-wallet-import-export-private-key-deposit-withdraw · /index/referral-link · /index/cooperation-referral-share-transaction-profits · /index/cooperation-referral-refer-friends-to-earn-rebate-30-rebates-easily-earn-over-usd8000-monthly · /index/cooperation-referral-invite-bots-to-telegram-group-to-earn-trading-commissions-automatically · /index/gmgn-agent-api · /index/gmgn-callout-openapi · /index/cooperation-api-integrate-gmgn-eth-base-bsc-trading-api/get-the-available-routing-for-eth-base-bsc-transactions
- CN: https://docs.gmgn.ai/cn · /cn/dao-ru-dao-chu-guan-zhu-qian-bao · /cn/qian-bao-gen-dan-gen-dan-cong-ming-qian-zi-dong-zhuan-sol · /cn/gmgn-shou-xu-fei-he-chang-jian-fei-yong-she-zhi · /cn/jiao-yi-gua-dan-shi-bai-yuan-yin · /cn/tui-te-jian-kong · /cn/tui-te-gua-dao · /cn/tg-jian-kong-qian-bao-tong-zhi · /cn/zi-dong-jiao-yi-gen-sui-dev-zi-dong-mai · /cn/tg-qian-bao-dao-ru-dao-chu-si-yao-chong-zhi-ti-qu · /cn/he-zuo-api-shu-ju-zhua-qu-ip-bai-ming-dan · /cn/guan-zhu-jian-kong-guang-chang-guan-zhu-shou-cang
- https://memecoin.gmgn.ai/memecoin-jiao-yi-jiao-cheng-chatgpt/jiao-cheng/kai-qi-tong-zhi-tui-song · https://memecoin.gmgn.ai/memecoin-jiao-yi-jiao-cheng-gemini/jiao-cheng/bu-ding-shou-ji-zen-me-di-yi-shi-jian-gan-zhi-lian-shang-dong-tai
- Docs mirror: https://github.com/Amal-David/docingest (snapshots of docs.gmgn.ai 2026-07-25, docs.dexscreener.com, docs.nansen.ai, api.rugcheck.xyz, docs.flap.sh, clanker.gitbook.io, blockrazor.gitbook.io, docs.48.club, astralane.gitbook.io, docs.bloxroute.com, docs.axiom.trade, docs.trojanonsolana.com, docs.maestrobots.com, pumpportal.fun, dev.jup.ag, docs.x.com, trench.today)

**GMGN on X**

- https://x.com/gmgnai/status/2039060780545724645 · /1981031077062840520 · /1963882916460769393 · /1874076085039882349 · /1818523913640714704 · /1888931562093486463 · /2085733804489220402 · /1861703454273699928 · /1871764649374584873 · /1914320483694289032 · /1995898701244670139 · /1973328387134660671 · /1942789098365943960 · /1936315512587534668 · /1777673576050741320 · /1784909908695269825 · /1919605561731026975 · /1973201529059549593 · /2039329186821885956
- https://x.com/gmgnapp001/status/2039330564872994983 · https://x.com/CryptoRugMunch/status/1855630653972267101 · https://x.com/oooooyoung/status/1910554281411043424 · https://x.com/NFTCPS/status/2021079532011389311 · https://x.com/haze0x/status/1874074165143285989 · https://x.com/SuperDegen/status/2112154222779121888

**Third-party articles, reviews and listings**

- https://apify.com/muhammetakkurtt/gmgn-trenches-scraper · https://apify.com/muhammetakkurtt/gmgn-dexscreener-paid-signals-scraper · https://apify.com/muhammetakkurtt/gmgn-token-traders-scraper · https://apify.com/muhammetakkurtt/gmgn-copytrade-wallet-scraper · https://apify.com/parsebird/gmgn-copytrade-wallet-scraper
- https://meme-insider.com/en/article/gmgn-ai-unveils-trenches-market-cap-sorting-boost-your-meme-token-trading-game/ · https://solanacompass.com/projects/GMGN · https://bytwork.com/en/companies/gmgn · https://www.bitrue.com/blog/gmgn-twitter-rename-alert-crypto-scammers · https://www.bitget.com/news/detail/12560605364390 · https://www.bitget.com/news/detail/12560605432129 · https://www.bitget.com/zh-CN/news/detail/12560604554601
- https://upwelllaw.com/en/insights/gmgn-beginners-guide · https://www.cryptopotato.com/gmgn-review/ · https://www.bitkub.com/en/blog/gmgn-review-2026-features-fees-trading-tools-safety-izAYGrKhQy4hL9ZztYuAfC · https://coincodecap.com/gmgn-review · https://coincodecap.com/best-settings-for-gmgn-bot · https://defillama.com/protocol/gmgn · https://airdropalert.com/blogs/gmgn-review/ · https://cryptosbeginner.com/gmgn-ai-review/ · https://www.datawallet.com/crypto/gmgn-explained · https://iq.wiki/wiki/gmgn
- https://gmgn-app.gitbook.io/gmgn-app-tutorial/tutorial/copy-trade · https://shutdafudup.com/gmgn-copy-trade-settings-and-strategy/ · https://gmgn-ai.net/faq · https://gmgn-ai.net/gmgn-trading · https://note.com/kitune_777/n/nccfac2ad01a0 · https://note.com/kitune_777/n/n5b9bcd92fa1a · https://grenade.tw/blog/gmgn-ai-tutorial/
- https://techflowpost.substack.com/p/meme-gmgn-p-p · https://techflowpost.com/newsletter/detail_79264.html · https://finance.sina.com.cn/blockchain/roll/2025-03-27/doc-ineqzwyx8317760.shtml · https://phemex.com/news/article/gmgn-restores-twitter-monitoring-functionality-11758 · https://www.odaily.news/en/newsflash/424604
- https://madeonsol.com/compare/gmgn-vs-phantom · https://madeonsol.com/blog/solana-referral-affiliate-programs · https://intercom.help/cryptoreferralcodes/en/articles/15519886-gmgn-ai-referral-code-cointellus-2026 · https://intercom.help/cryptoreferralcodes/en/articles/17052096-how-to-use-gmgn-referral-code-cointellus-full-guide-2026 · https://intercom.help/promocodereferral/en/articles/14277238-what-is-the-gmgn-referral-code-btmwcvbb-and-how-to-use-it-in-2026
- https://play.google.com/store/apps/details?id=com.gmgn.app · https://chromewebstore.google.com/detail/nipccajfbdodfpbnnjaohckbjgiaodkk · https://chromeboard.com/extension/coinlinker-hidoadjbhlmgoojobnpmffopfoebgjfl

**YouTube walkthroughs (2025–2026)**

- https://www.youtube.com/watch?v=NysmSF4s2wo · https://www.youtube.com/watch?v=iIPzkKSc1cg · https://www.youtube.com/watch?v=ti0_LwdyN0w · https://www.youtube.com/watch?v=lpXunMrwTSY · https://www.youtube.com/watch?v=rPdATLfNVpM · https://www.youtube.com/watch?v=-aidVeOuMGk · https://www.youtube.com/watch?v=ypWrP2_KasI · https://www.youtube.com/watch?v=KubSKpqRNes · https://www.youtube.com/watch?v=YOw7YnWCFAA · https://www.youtube.com/watch?v=yEcOB6EKskY · https://www.youtube.com/watch?v=Xy7vrfJcGIg

**Third-party code using GMGN's web UI or internal API** (DOM fixtures, selectors, captured payloads)

- https://github.com/0xuezhang985/985gmgn-helper · https://github.com/uu-z/gmgn-pixel-perfect-fork-poc · https://github.com/OnlyTerp/papertrench · https://github.com/GMGNAI/skillmarket-demos · https://github.com/Oxjade/neko-chan · https://github.com/Tech-Melon/FlapFeeInfo · https://github.com/Tech-Melon/GmgnTwitterTgAlert · https://github.com/Tech-Melon/GmgnTwitterAudioPlayer · https://github.com/EkoTerminal/eko
- https://github.com/1f1n/Dragon · https://github.com/YAN-XBT/HOODRADAR · https://github.com/moreshk/twitter-dm-automator · https://github.com/whiteowl-engine/WhiteOwl · https://github.com/nicolostancato-web/whale-radar · https://github.com/lyhistory/lyhistory.github.io · https://github.com/AnyaReese/tg-TUApps-collector · https://github.com/GojoCookz/savethewood · https://github.com/bryanstevensacosta/onchain-bot · https://github.com/MoonRichWeb3/go_robinhood_meme_v1 · https://github.com/Orionxer/crypto · https://github.com/ranxi2001/ranxi2001.github.io · https://github.com/aturX/web3-blog-backup · https://github.com/h10086733/gmgn_fetch · https://github.com/dongziair/memetracker · https://github.com/PiccoloNiccolo/nought · https://github.com/ifcode/gmgn-wallet-holdings
- https://github.com/fachebot/sol-grid-bot · https://github.com/fachebot/evm-grid-bot · https://github.com/oyi77/1ai-nexus · https://github.com/Jarang-Mandi/rangefinder · https://github.com/bibbycodes/multichain-auto-wallet-tracker · https://github.com/alax-mx/GeckoSdk · https://github.com/andyvauliln/trading_bot · https://github.com/mawwalker/solana-smart-signal · https://github.com/ian05012/solana-memecoin-dataset · https://github.com/tr4m0ryp/GMGN_Trading_Bot · https://github.com/ChipaDevTeam/GmGnAPI · https://github.com/ChainBench/OpenChainBench · https://github.com/cccccccccccccdsf/dawaweew · https://github.com/Past-Tang/gmgn-ca-query-gui
- https://github.com/neversi/solana-hackaton · https://github.com/awaqawaqawaq/VisualScan · https://github.com/TRW-TeamG/tati-backend · https://github.com/iamarketings/Solana-AI-Trading-Bot · https://github.com/maxpandelakis-boop/Meme-Bot · https://github.com/ItVen/GmgnParser · https://github.com/DracoR22/handi-cat_wallet-tracker · https://github.com/nirholas/kol-quest · https://github.com/nirholas/scrape-smart-wallets · https://github.com/nirholas/three.ws · https://github.com/nirholas/crypto-vision · https://github.com/alimirash/GMGN · https://github.com/kevinpauljacob/gmgn-scraper-ts-2 · https://github.com/No-Trade-No-Life/Yuan · https://github.com/MarcinWalendowski/agentic-solana-bot · https://github.com/Ry0x7/RSB · https://github.com/mnathanail/argus-trench · https://github.com/RunTimeAdmin/ScamHound
- https://github.com/muratmula/ai-robinhood-chain · https://github.com/kaiserern/Kaiser.charon · https://github.com/fciaf420/moonbags · https://github.com/wardere83/aicoinup · https://github.com/aaurix/dex_crawler_ts · https://github.com/senyka0/gmgn-sniper-bot · https://github.com/uu-z/gmgm-poc. Also two repositories named "fomo-helper" (mock-gmgn.html, headless capture 2026-09-05) and "big-flappa-vamper-mega".

**Launchpad, DEX and protocol sources**

- https://github.com/pump-fun/pump-public-docs · https://github.com/nirholas/pump-swap-sdk · https://github.com/nirholas/pump-fun-sdk · https://github.com/nirholas/paired.exchange · https://github.com/raydium-io/raydium-sdk-V2 · https://github.com/raydium-io/raydium-docs-v1 · https://github.com/MeteoraAg/dynamic-bonding-curve-sdk · https://github.com/MeteoraAg/damm-v2-sdk · https://github.com/jup-ag/docs · https://github.com/bagsfm/bags-sdk · https://github.com/clanker-devco/clanker-sdk · https://github.com/ourzora/zora-protocol
- https://github.com/chainstacklabs/pumpfun-bonkfun-bot · https://github.com/GoldenFarFR/ARIA · https://github.com/mirrorworld-universe/forgex-cli · https://github.com/bigmacman1129/solana-sniper-copy-trading-bot · https://github.com/macdarenz-droid/Meme-snipe · https://github.com/sm33f3r/floor-mop · https://github.com/DemidovVladimir/delta_neutral_lp · https://github.com/jgouiza-debug/pumpfun-sniper-bot · https://github.com/tenequm/skills · https://github.com/the-curb/CURB · https://github.com/Russiansky777/robinhood-chain-alpha · https://github.com/hey-research-lab/hey-research-open · https://github.com/hey-research-lab/awesome-robinhood-chain · https://github.com/0xD3bt/Trench-Tools
- https://github.com/bubbleflap/fullvps3 · https://github.com/ttma1046/launchmeow · https://github.com/okx/plugin-store · https://github.com/sanbir/evm-hack-registry · https://github.com/LeoYeAI/openclaw-master-skills · https://github.com/DefiLlama/dimension-adapters · https://github.com/makibytes/chaincheck · https://github.com/GetBlock-io/getblock-docs · https://github.com/reclear-io/llmref · https://github.com/OpenClawTrade/launchpadv3 · https://github.com/programmablehq/PROGRAMMABLE · https://github.com/duneanalytics/spellbook · https://github.com/zLikeMario/dyor-fun · https://github.com/Uniswap/UniswapX · https://github.com/circlefin/skills · https://github.com/ProjectOpenSea/opensea-sdk

**Data, execution and security infrastructure sources**

- https://github.com/rpcpool/yellowstone-grpc · https://github.com/helius-labs/core-ai · https://github.com/helius-labs/helius-sdk · https://github.com/agiprolabs/claude-trading-skills · https://github.com/Codex-Data/skills · https://github.com/openclaw/openclaw · https://github.com/NegativeBounce/api-library · https://github.com/dorukardahan/twitterapi-io-mcp · https://github.com/novnski/docs-v2 · https://github.com/GLEECBTC/komodo-defi-sdk-flutter · https://github.com/api-evangelist/coingecko · https://github.com/api-evangelist/blockaid
- https://github.com/sushi-labs/sushiswap · https://github.com/theselfruleorg/polyrob · https://github.com/withfabricxyz/spandex · https://github.com/enkryptcom/enKrypt · https://github.com/0xfnzero/sol-trade-sdk · https://github.com/skyyycodes/solana-payments-skill · https://github.com/flashbots/flashbots-docs · https://github.com/1f1n/solana-check-contested-wallets · https://github.com/JulienCouzinie/Grafolana · https://github.com/solana-foundation/solana-keychain · https://github.com/MetalLegBob/solana-vibes-kit · https://github.com/yeee3642/data · https://github.com/Auditware/AuditVault · https://github.com/SunWeb3Sec/DeFiHackLabs · https://github.com/ChipaDevTeam/AxiomTradeAPI-py
- https://github.com/openSVM/dexscreener-mcp-server · https://github.com/FritzHeider/Botsensai-Agentic · https://github.com/henryoman/TrenchClaw · https://github.com/Vex-Foundation/Vex · https://github.com/BankkRoll/pumpfun-apis · https://github.com/alsk1992/CloddsBot · https://github.com/outerheaven199X/Bags-SDK-hackathon · https://github.com/DefaultPerson/solana-dex-parser-go · https://github.com/bankrwrapped/wrapped

Competitor facts in §17 (Axiom, Photon, BullX, Padre, Banana Gun, Trojan, Maestro, Bloom, DEX Screener, Birdeye, Cielo, Nansen, Pump.fun) were recalled from public docs and reviews read before this research run and were **not re-fetched**. Re-verify them before publishing any comparison.
