> **Being rewritten.** The positioning changed: Trenchscope is now marketed as a real multi-chain memecoin trading terminal (Solana, Base, Robinhood Chain) with self-custody, not a simulator. Every "sim", "paper trading" and "no real funds" line below is out of date. Don't post from this file until it is rewritten. For today, use `marketing/x/TODAY.md`.

# Trenchscope claims ledger

| | |
|---|---|
| **Purpose** | The single source of truth for what the X account, the warm-up posts, the launch thread and the AI "larp" trailer may say about Trenchscope and about the memecoin market. |
| **Compiled** | Tue 2026-10-20, from `README.md`, `docs/PRD.md`, `docs/research/gmgn-research.md`, and a source-code check of `apps/web/src`, `apps/server/src` and `packages/shared/src`. |
| **Verified against** | Branch `claude/viral-social-content-assets-gd3bn8`, last product commit `aed67a3`. A 2-hour simulator run (`apps/server/scripts/sim-report.ts 120`, seed `trenchscope`) was executed today for the in-sim numbers in section 4.3. |
| **Rule of use** | If a claim is not in section 2 (safe claims) or section 4 (stats), do not post it. If it is in section 5 (must not claim), never post it, even as a joke. Every post that shows the product or a number carries a disclaimer from section 6. |
| **Placeholders** | No live URL or confirmed handle exists. Use `[LINK]` and `@trenchscope`. Never write "live now", "sign up" or "try it" with a real-looking URL. |

**Traffic lights used below.** GREEN: post as written. AMBER: post only with the caveat or wording shown. RED: never post.

---

## 0. The ten rules that matter most

1. **It is a simulator.** Every market, token, wallet, KOL, price and PnL in the product is simulated. Trading is paper only. There is no wallet, no deposit and no real chain.
2. **There is no token.** No airdrop, no presale, no "points become something". Points stay inside the app.
3. **No profit talk.** No "100x", "guaranteed", "free money", "print", "become profitable", "never get rugged again". Paper trading builds reps, not returns.
4. **No invented traction.** No user counts, waitlist sizes, volumes, testimonials or partners. We have none yet.
5. **Every PnL visual says SIMULATED / PAPER on the image itself.** The app does **not** generate share cards yet, so the watermark has to be added by hand (section 7).
6. **Real-world stats are hedged and sourced.** Use "~", "lately", "on major launchpads". Never call non-graduation a "rug" or a "scam" (section 4.4).
7. **No competitors, no affiliations.** Don't name other terminals or launchpads in posts, don't compare fees, and don't use their feature names. That includes "Almost bonded" and "P1/P2/P3", which **are still in our own UI** (section 7).
8. **No sim cashtags.** Never write `$TICKER` for a simulated token. On X, a cashtag pulls up a real asset's price card.
9. **The product has no AI.** The trailer is AI-generated. The terminal is not "AI-powered". Don't blur the two.
10. **No roadmap promises.** Real-chain adapters are possible later and are **not promised**. Never say "mainnet soon" or "live trading coming".

---

## 1. Built vs specified: what the code actually ships

The PRD describes more than v1 ships. The PRD is not evidence. The code is.

### 1.1 Built and demo-able (verified in code)

Paper accounts (guest + username/password), per-chain paper wallets and a faucet. Simulator: 4 chains, 8 fictional launchpads, bonding curve → AMM migration, rugs, slow rugs, pump-and-dumps, snipers, bundlers, insiders, smart money, KOLs, whales, bots and sandwich bots. Trenches board, Trending, New Pairs, Narratives. Token page with live candles from 1s to 1d, an audit checklist and a rug ratio. Trade panel with Market, Limit and Auto, presets, quote preview, risk gate, TP/SL/trailing, dev-sell and migration triggers. Wallet pages, leaderboards, Monitor, 13 signal types, copy trading, sniping, alerts and notifications, portfolio with an equity curve, watchlist, rewards/referral (paper), settings with risk thresholds, hotkeys, dark and light themes, and a phone layout.

### 1.2 Specified in the PRD but NOT built (do not claim, do not show)

| PRD item | What the code actually has | Evidence |
|---|---|---|
| Persistent **SIM badge in the header** (PRD §1.5) | No header badge. The "Simulated market · paper trading" notice appears in the **desktop footer only** (hidden below the `md` breakpoint), plus the phone nav drawer, the sign-in modal, the trade-panel footer and the Rewards page | `components/layout/TopBar.tsx` (no badge); `AppShell.tsx` (`StatusBar className="hidden md:flex"`); `StatusBar.tsx:57`; `MobileNav.tsx:140` |
| **Share / PnL cards** with an unremovable SIMULATED watermark and a `/share/:id` verify page (PRD §6.21, D15; P1) | **Not built.** The wallet page's "Share" button only copies the page URL | grep for share card / watermark finds nothing; `components/wallet/WalletHeader.tsx:48-57` |
| **Risk acknowledgement before the first trade** (PRD §6.22, P0) | Not built. A high-risk confirm dialog exists (see SC-08) | No acknowledgement component or storage found |
| **Safety score 0–100 with listed deductions** (D2) | Not built. The product has a composite **rug ratio** (0–1), a low/medium/high **risk level** and a colour-coded **audit checklist** | `apps/server/src/analytics/tokens/security.ts:434-447, 470-597` |
| **Copycat detection** by name/symbol/image hash (D7) | The copycat badge exists, but the **simulator** sets the flag when it clones a hot token. Analytics does not detect it | `apps/server/src/sim/behaviors/launch.ts:111`; `analytics/tokens/index.ts:588` |
| All-in **fee ledger**, per-fill breakdown page, ">3% non-platform fee" warning (D3) | Partial. The quote shows platform + network fees as one line (split in the hover title) and the receipt stores them separately. There is no ledger page and no 3% warning | `components/token/trade/QuotePreview.tsx:108-111` |
| Copy-trade **gates, backtest, KOL dump detection** (D10) | Not built. A 0–100 **copy score** exists | `analytics/wallets/metrics.ts:344` |
| **Density modes**, **command palette**, full keyboard map (D11, D12) | Not built. Hotkeys exist (SC-27) | — |
| Multi-chain "All" monitor (D9) | Not built (one chain at a time via the chain switcher) | — |
| Landing telemetry (D13), Explain-PnL replay, **Unsold** PnL bucket (D5) | Not built | `types.ts:392-403` (5 buckets, no Unsold) |
| Nightly ground-truth validation job (D16) | A **test** checks label precision/recall against the sim's hidden archetypes. There is no nightly job | `apps/server/test/analytics-wallets.test.ts:1108` |
| Watchlist **groups**, scenario presets (`rug_wave`, ...), coach-mark tour | Not found | — |
| Playwright E2E suite | The `pnpm e2e` script exists, but no Playwright config or specs exist | `apps/web/package.json`; no `playwright.config*` |
| WCAG 2.2 AA audit | Not verified. Don't claim accessibility compliance | — |
| Web push, installable PWA, passkeys, zh-CN, synthetic social pulse, X tracker, call-outs, token launch, public API, real-chain adapters | Not built (P1/P2) | — |

---

## 2. Safe claims (with file evidence)

Paths are relative to the repo root. Line numbers are as of commit `aed67a3`.

| ID | Claim | Approved CT-style wording (example) | Evidence | Light |
|---|---|---|---|---|
| SC-01 | Paper trading only. No real funds, no wallet, no real chain | "fake money. real-feeling trenches." / "nothing to connect. nothing to lose." | `README.md:13` ("Simulated market · paper trading only. Nothing here touches real funds or real chains."); `components/common/SimBanner.tsx:4,13-15`; `components/token/trade/TradePanel.tsx:157-160`; `docs/PRD.md:56,59` | GREEN |
| SC-02 | One click makes a guest paper account funded on 4 chains: **50 SOL, 15 BNB, 3 ETH on Base, 3 ETH on Ethereum** (all paper) | "one click and you're holding 50 paper sol. go lose it." | `components/layout/AuthModal.tsx:53-75`; `packages/shared/src/chains.ts:43,58,73,88` | GREEN |
| SC-03 | Paper wallets refill from a faucet (once a minute per chain) | "got rugged? hit the faucet. try again." | `apps/server/src/accounts/service.ts:42` (`FAUCET_COOLDOWN_MS = 60_000`); `components/layout/AccountControls.tsx:16-24,50` | GREEN |
| SC-04 | A built-in market simulator runs the whole thing live: launches on bonding curves, migrations to an AMM, rugs, slow rugs, pump-and-dumps, snipers, bundlers, insiders, smart money, KOL calls, whales, bots, sandwich bots | "a whole fake trench running 24/7. rugs included." | `README.md:9-11`; `apps/server/src/sim/world.ts:40-52` (12 archetypes); `sim/behaviors/fate.ts:17-26,83-84`; sim-report run (section 4.3) | GREEN |
| SC-05 | The sim is seeded and deterministic, and fast-forwards about 90 minutes of history on boot, so every board is full the moment it starts | "boot it up and the trench is already cooking" (avoid "cooking" as a feature name) | `README.md:38-39,53-54`; `apps/server/src/app.ts:34` | GREEN |
| SC-06 | Four simulated chains (Solana, BNB Chain, Base, Ethereum), each with its own fictional launchpads and curves, plus a fictional DEX | "4 chains. 8 made-up launchpads. 1 made-up dex. 0 real money." | `packages/shared/src/chains.ts:118-152` (Moonpit, Bonkfire, Rayforge, FourPad, BNB Rocket, ClawLab, BaseDrop, EtherForge; TrenchSwap) | GREEN (say "simulated" when naming chains) |
| SC-07 | Live three-column launch board: new → near graduation → migrated, with per-column filters and sorting, pause-on-hover (shows "Paused · N new") and one-click quick buy | "new. near grad. migrated. watch the whole lifecycle in one screen." | `pages/TrenchesPage.tsx:1-3,35`; `components/discovery/TrenchesColumn.tsx:19-23,108,250-251`; `components/trade/QuickBuyButton.tsx` | GREEN (never call the middle column "almost bonded" in copy) |
| SC-08 | Risk gate: buying a honeypot or high-risk token opens a "High-risk token" dialog that lists the reasons before you can "Buy anyway" | "it literally asks 'you sure?' before you ape the rug." | `components/token/model.ts:119-129`; `components/token/trade/useTradeExecutor.tsx:52-108` | GREEN |
| SC-09 | Every token shows an audit checklist with its own thresholds and hints: LP burned, top-10 share, dev holding, insiders, snipers, bundlers, fresh wallets, bots, wash trading, smart-money count, rug ratio (plus honeypot/tax/open-source/renounced on EVM chains) | "top 10, dev, insiders, snipers, bundlers. all on the card. all explained." | `apps/server/src/analytics/tokens/security.ts:470-597`; `components/token/SecurityPanel.tsx`; `components/discovery/TokenBadges.tsx` | GREEN |
| SC-10 | A composite rug ratio and a low/medium/high risk level, built from holder, dev and contract signals | "every token gets a rug ratio. most of them are not low." | `security.ts:434-447` | GREEN (don't say "predicts rugs" or quote accuracy) |
| SC-11 | Cost before you click: a live quote with expected and minimum received, price impact (warns above 3%, danger above 10%), execution price, fees (platform + network) and route (curve or pool) | "see your price impact before you click, not after you cry." | `components/token/trade/QuotePreview.tsx:42-45,91-119` | GREEN |
| SC-12 | A simulated 0.8% platform fee, shown on the trade panel | "even the fees are fake. 0.8%, shown up front." | `packages/shared/src/chains.ts:160`; `TradePanel.tsx:159` | AMBER: always say "simulated". Never compare it to anyone's real fee |
| SC-13 | Realistic paper fills: 120–600 ms simulated confirmation latency (+150 ms with anti-MEV), so price can move and slippage can fail. Trades in the public mempool can get sandwiched unless anti-MEV is on, and the fill toast shows the MEV loss | "you can even get sandwiched. with fake money. character building." | `apps/server/src/trading/execution.ts:1-7,38,328-333`; `useTradeExecutor.tsx:38` | GREEN |
| SC-14 | Order types: limit buy/sell on price or market cap, take-profit, stop-loss, trailing stop, dev-sell exit, migration buy, migration sell | "set a dev-sell exit. sleep. wake up not rugged (in the sim)." | `apps/server/src/trading/schemas.ts:67-75`; `trading/orders.ts:1-6`; `components/token/trade/AutoForm.tsx:1-3,43-66` | GREEN |
| SC-15 | Copy trading: fixed or ratio sizing, a per-token cap, mirror sells, up to 20 tasks (paper) | "copy a smart wallet with fake money and find out what 'exit liquidity' feels like." | `apps/server/src/trading/copytrade.ts:1-13` | GREEN (never imply copy-trading profits) |
| SC-16 | Sniping tasks: new launches (keyword / dev / launchpad / safety filters), a specific dev's next launch, or the moment a token migrates (paper) | "snipe migrations without sniping your own savings." | `apps/server/src/trading/sniper.ts:1-13`; `schemas.ts:166` | GREEN |
| SC-17 | Alerts: price, market cap, 5-minute change, a wallet's trades, new launches matching a keyword, smart-money buy clusters. They land in a notification bell and toasts | "set an alert on a wallet. get pinged when it apes." | `apps/server/src/trading/alerts.ts:1-4`; `schemas.ts:192`; `components/layout/NotificationsBell.tsx` | GREEN |
| SC-18 | 13 signal types: price spike, ATH, market-cap milestone, smart buy, KOL buy, large buy, smart-money cluster, bundler sell, dev sell, migration, community takeover, paid boost, KOL call | "13 signal types. 2 of them are 'the dev is selling'." (dev sell + bundler sell) | `packages/shared/src/types.ts:489-502`; `apps/server/src/analytics/wallets/signals.ts:24-36,180-304` | GREEN |
| SC-19 | Wallet labels: smart money, KOL, sniper, bundler, insider, dev, whale, fresh, bot, sandwich bot (plus top holder, following, you) | "every wallet gets a label. some of them are 'insider'." | `types.ts:45-58`; `components/common/WalletTags.tsx` | GREEN |
| SC-20 | Smart money is earned from behaviour (early entries that later 2x'd, tested against a base rate, plus profitability). It is not hand-picked. The labels are checked against the sim's hidden ground truth | "smart money isn't a vibe here. it's a hit rate." | `apps/server/src/analytics/wallets/index.ts:62-110` (`SMART_RULE`); `apps/server/test/analytics-wallets.test.ts:1108-1143` | AMBER: no accuracy numbers (they vary a lot by chain), and no "works on real chains" |
| SC-21 | Insider / bundler / sniper tags use block timing and wallet-funding links on each token | "bought in the launch block? bundler. funded by the dev? insider." | `apps/server/src/analytics/tokens/track.ts:209-271`; `security.ts:48-90` | AMBER: describe it as how the sim tags wallets, not as a real-chain detector |
| SC-22 | Wallet pages: 1D/7D/30D/All PnL, win rate, PnL distribution, daily PnL calendar, a style title, badges and a 0–100 copy score | "every wallet gets a report card. yours too." | `types.ts:392-437`; `analytics/wallets/metrics.ts:344-356`; `components/wallet/WalletCards.tsx:1,52` | GREEN |
| SC-23 | Leaderboards for smart money, KOLs, snipers, whales and all wallets over 1D/7D/30D, with follow and copy | "leaderboard of fake whales. study them." | `pages/LeaderboardPage.tsx:1-3,31-41` | GREEN |
| SC-24 | Monitor: live trades from smart money, KOLs or wallets you follow, with side, size and rug-risk filters, pause, and "hot by smart money" (2+ smart wallets in 30 minutes) | "watch smart money move in real time. fake smart money. real lesson." | `pages/MonitorPage.tsx:1-3,43-46`; `components/monitor/HotBySmartMoney.tsx:1-2` | GREEN |
| SC-25 | Token page: live candles at 8 resolutions (1s, 15s, 1m, 5m, 15m, 1h, 4h, 1d), price or market cap, trade markers, plus activity, holders, top traders, position, orders and dev-tokens tabs | "1-second candles. watch the rug in 4k." | `pages/TokenPage.tsx:1-3`; `types.ts:18-19`; `components/token/tabs/*` | GREEN |
| SC-26 | Dev track record and status: launched/migrated counts on hover and in the dev panel, plus dev status (holding / sold part / sold all / bought more) | "dev launched 14 coins, migrated 0. cool cool cool." (illustrative, in-sim) | `components/discovery/TokenHoverSummary.tsx:116`; `TokenBadges.tsx:41-46`; `components/token/DevPanel.tsx` | GREEN |
| SC-27 | Copycat and paid-boost badges on cards ("Copycat — reuses an earlier token's name or image", "Boosted — paid promotion"), and a filter to hide copycats | "copycats get flagged. paid boosts get labelled as paid." | `TokenBadges.tsx:139-141`; `components/token/TokenHeader.tsx:81-83`; `components/discovery/filters.ts:117` | AMBER: say "flags", never "detects". In v1 the sim provides the flag |
| SC-28 | Wash-trading flag, computed from fast round-trip volume | "wash-traded volume gets called out." | `apps/server/src/analytics/tokens/index.ts:500` | GREEN |
| SC-29 | Trending (windows + server-side sorts), New Pairs and Narratives (heat-ranked themes), with 30+ filters | "30+ filters. hide copycats, hide wash trading, hide dev-sold." | `pages/TrendingPage.tsx:1-2`; `pages/NewPairsPage.tsx:1-2`; `pages/NarrativesPage.tsx:1-2`; `apps/server/src/analytics/filters.ts:30-110` (~33 fields) | GREEN |
| SC-30 | Hotkeys: on Trenches, 1/2/3 pick a column, J/K and H/L move, Enter opens, B quick-buys, Esc clears; on the token page, B and S switch buy/sell; `/` opens search | "j/k through the trench. b to buy. keyboard only." | `pages/TrenchesPage.tsx:39-46`; `TradePanel.tsx:85-91`; `components/layout/TopBar.tsx:26` | GREEN (say "hotkeys", not "full keyboard map" or "command palette") |
| SC-31 | Risk chip thresholds are user-adjustable | "set your own red lines." | `components/account/settings/DisplaySettingsForm.tsx:90` | GREEN |
| SC-32 | PnL cost basis includes fees | "pnl that counts your fees. painful. accurate." | `apps/server/src/sim/world.ts:749` | AMBER: don't claim "conformance-tested" or "Explain PnL" |
| SC-33 | Portfolio with an equity curve (1h/6h/24h/7d), positions, history and orders | "equity curve go down. in the sim. which is the point." | `pages/PortfolioPage.tsx:6,20-21`; `components/account/EquityChart.tsx` | GREEN |
| SC-34 | Dark-first with a light theme, and a phone layout (bottom tab bar + drawers) | — | `components/layout/AppShell.tsx`; `MobileNav.tsx`; `hooks/useTheme.ts`; `apps/web/src/index.css:12-37` | GREEN |
| SC-35 | No token. Points are in-app only and show your activity | "no token. no airdrop. the only thing you farm here is experience." | `docs/PRD.md:77,1970`; `pages/RewardsPage.tsx:201-202` | GREEN |
| SC-36 | Original brand: our own scope-reticle logo, our own palette, and fictional tokens, launchpads and KOL personas ("handles are invented; never real people") | — | `components/layout/Logo.tsx`; `apps/server/src/sim/names.ts:1-3,405`; `components/common/ChainIcon.tsx:5` (original letter marks, not chain logos) | GREEN |
| SC-37 | Web-only terminal (no extension, no bot, no app to install) | "no extension. no tg bot. no keys. just a tab." | `docs/PRD.md:57,74`; `apps/web` | GREEN |

---

## 3. Features built: the screen-recordable shot list

Everything below exists in the code and can be recorded locally (`pnpm dev` → http://localhost:5173 → Sign in → Quick start). For hygiene before recording, see section 7.

| ID | Shot | Route / how | What makes it pop |
|---|---|---|---|
| FB-01 | Guest onboarding: one click, then paper balances on 4 chains | Any page → Sign in → Quick start | The "50 SOL / 15 BNB / 3 ETH / 3 ETH" grid and the "Start paper trading" button |
| FB-02 | Trenches board streaming new launches | `/sol/trenches` | Cards sliding in, curve-progress rings, risk chips going red |
| FB-03 | Pause on hover | Hover a column | "Paused · N new" badge while new tokens buffer |
| FB-04 | Keyboard trading on the board | `/sol/trenches`, keys `1`/`2`/`3`, `J`/`K`, `B` | Selection moves, quick buy, fill toast |
| FB-05 | Token hover summary with dev record | Hover a token avatar | "N launched · M migrated" for the dev |
| FB-06 | Token page with live 1s candles and trade markers | `/sol/token/:address`, resolution `1s` | Markers coloured by wallet class |
| FB-07 | Audit checklist with green/amber/red rows and the rug ratio | Token page, Safety/Audit panel | Insiders / snipers / bundlers rows and their hints |
| FB-08 | Risk gate dialog | Try to buy a high-risk or honeypot token | "High-risk token: …" with reasons, then "Buy anyway" |
| FB-09 | Quote preview with a price-impact warning | Type a big amount in Market | "Very high impact — consider a smaller size or splitting the order." |
| FB-10 | Getting sandwiched (anti-MEV off, big pool trade) | Migrated token, large buy, anti-MEV off | Fill toast with "MEV −x" |
| FB-11 | Exit plan: buy with TP / SL / trailing attached; Auto tab dev-sell and migration-sell | Trade panel → Auto | Orders appear in the Orders tab and fire |
| FB-12 | A limit order on market cap | Trade panel → Limit | Order line on the chart, fill when hit |
| FB-13 | A rug in real time | Watch the New column or the Signals page for a "Dev sell" / "Bundler sell" | Candles collapse while bearish signals stack up. Easy to catch: ~1 in 3 sim launches is scripted to rug or dump (section 4.3) |
| FB-14 | Signals feed | `/sol/signals` | 13 kinds, filter chips, bullish/bearish cards |
| FB-15 | Monitor live feed + hot by smart money | `/sol/monitor` | Smart/KOL trades streaming, rug-risk filter |
| FB-16 | Leaderboards | `/sol/leaderboard` | Smart Money / KOL / Snipers / Whales tabs, 1D/7D/30D |
| FB-17 | Wallet report card | Click any leaderboard wallet | PnL calendar, distribution, style title, copy score |
| FB-18 | Copy-trade a smart wallet | Wallet page → Copy, or `/sol/copytrade` | The task card's stats ticking as copies fill |
| FB-19 | Migration snipe | `/sol/sniper` → migration task | The task fires on graduation |
| FB-20 | Alerts → bell + toast | `/alerts`, wallet-trade or price alert | The toast landing |
| FB-21 | Portfolio equity curve + faucet top-up | `/portfolio`, Deposit pill | The curve plus the "Paper wallet topped up" toast |
| FB-22 | Narratives heat ranking | `/sol/narratives` | Theme cards expanding into their top tokens |
| FB-23 | Trending with filters | `/sol/trending` | "Hide copycats", "Hide wash trading", "Safe only" |
| FB-24 | Chain switch | Chain switcher | The same terminal on BNB / Base / ETH (all simulated) |
| FB-25 | Light/dark toggle and phone layout | Theme toggle; narrow viewport | Tab bar + drawers |
| FB-26 | The footer status bar | Desktop, bottom of the screen | "Live · NNms", trades/s, **"Simulated market · paper trading"**. Keep it in frame |

Not recordable (not built): share/PnL cards, safety score, command palette, density modes, multi-chain monitor, copy backtest, fee ledger, Explain-PnL, risk acknowledgement, onboarding tour.

---

## 4. Killer stats about the real memecoin market

### 4.1 Source and confidence (read this first)

- All real-market numbers below come from **`docs/research/gmgn-research.md` §13.4** ("Empirical lifecycle statistics", marked **[S] secondary**) and **§13.2**, unless noted. Two are restated in `docs/PRD.md` §1.2.
- §0.1 defines [S] as: platform docs read through search snippets or dated mirrors, blog and X posts, third-party reviews, YouTube walkthroughs, and third-party code. **§13.4 gives no per-statistic URL.** §0.2 also warns that third-party figures "must be re-verified before they appear in any marketing comparison".
- **Before any stat goes out, the owner should re-check it** against a public dashboard or primary post, add "~", give the month, and use "on the biggest solana launchpad" or "on major launchpads" instead of naming a platform. If anyone asks for the source, answer in a reply. Don't add a link to the main post.

### 4.2 Real-market stats

| ID | Stat (as given in the research doc) | Post-ready wording | Source as given | Honest caveat | Light |
|---|---|---|---|---|---|
| KS-01 | Graduation rate on pump.fun ~2.6% in Oct 2026, which means **~97% never graduate** | "~97 out of 100 launches never make it off the curve. lately." | R§13.4 (pump.fun, "~2.6% in Oct 2026"); PRD §1.2 ("~97% never graduate") | The rate swings a lot by month: 0.6–1.0% before the BOOST change (Jul 2026), 2.5–6.7% around BOOST. Say "lately" or "in october". **"Never graduated" ≠ "rugged" ≠ "scam"** | AMBER |
| KS-02 | After graduation, **73% fall below 40% of the migration price within 20 min** (i.e. lose 60%+) | "made it off the curve? congrats. ~73% of those are down 60%+ within 20 minutes." | R§13.4; PRD §1.2 ("73% of graduates lose 60%+ within 20 minutes") | One secondary dataset, one launchpad, unknown sample window. Keep the "~" and "within 20 min". Don't extrapolate to "all memecoins" | AMBER |
| KS-03 | Only **19.7% of graduates keep ≥$5k liquidity at 24h** | "~1 in 5 graduates still has $5k+ liquidity a day later." | R§13.4 | Same dataset caveat. "1 in 5" is a rounding of 19.7%. Applies to graduates, not all launches | AMBER |
| KS-04 | **27k–50k launches per day** on pump.fun in 2026 | "somewhere between 27k and 50k new coins a day. on one launchpad." | R§13.4 | A range across 2026, not today's number. Don't present it as current daily volume | AMBER |
| KS-05 | Non-graduates last **about 9h on average** | "the average coin that doesn't graduate is dead in ~9 hours." | R§13.4 | Average, with a heavy skew. "Dead" is our word for inactivity, so say "goes quiet" if challenged | AMBER |
| KS-06 | Median time to graduate **~5 min**; **81% of graduates do it within 1h** | "if it's going to bond, it usually does it fast. median ~5 min." | R§13.4 (Sep 2025 sample: 4.4 min, ~457 curve trades) | The 4.4-min figure is from a Sep 2025 sample. The 1h share applies to graduates only | AMBER |
| KS-07 | Graduation by initial dev buy: **no dev buy 0.34%**, 0.05–0.2 SOL 5.70%, **>5 SOL 7.98%** | "coins where the dev bought nothing graduated ~0.3% of the time." | R§13.4 | Correlation, not a strategy. Never frame it as "buy when the dev buys" (that's advice and an invitation to get bundled) | AMBER |
| KS-08 | Once ~25 SOL is raised on the curve, **12.4% graduate vs a 2.62% base rate**; with ≤1 SOL left, **99.6% graduate** | "the last 1 sol of the curve fills 99.6% of the time. the first 25 is where coins go to die." | R§13.2 (evidence quoted under an [I] recommendation for the near-completion cut) | Cited as evidence inside an inferred design note. Treat it as secondary and re-verify first | AMBER |
| KS-09 | Other launchpads: graduation **1.3%** (peak 47.8k launches in one day), **up to 2.26%** (peak 19,620/day), **0.8%**, **~1.4%**, **1.55%** | "on every major launchpad in the data, fewer than ~3 in 100 launches graduate." | R§13.4 table (Four.meme, LetsBonk, Believe, Pons v2, SunPump) | Different periods and definitions. Use only the aggregate "fewer than ~3 in 100" and don't name the platforms. Spikes exist (KS-01) | AMBER |
| KS-10 | One Base launchpad: ~13k launches/day, **>95% lose liquidity within 48h** | "on one base launchpad, >95% of launches lose their liquidity within 2 days." | R§13.4 (Clanker) | No-curve launchpad, a different mechanic. Don't name it | AMBER |
| KS-11 | Hidden costs: a ~1% platform fee plus priority and tip fees "silently add up to 10%+" on small trades | Only as worked math, e.g. "0.1 sol buy, 1% fee + 0.005 priority + 0.005 tip = ~11% gone before the chart moves." | PRD §1.2 (an assertion in our own PRD, not a measured stat) | Not a sourced statistic. Competitor fees in R§17 were "recalled, not re-fetched" (R§20, last paragraph). Never attribute it to a named product. Show the arithmetic, or don't post it | AMBER |

### 4.3 In-sim stats (Trenchscope's own simulator, clearly labelled as SIM)

These are facts about **our simulator**, not about the real market. Always say "in the sim".

| ID | Stat | Post-ready wording | Source | Caveat | Light |
|---|---|---|---|---|---|
| SIM-01 | Fate mix by design: **60% duds, 12% rugs, 8% slow rugs, 11% pump-and-dumps, 7% runners, 2% moons**, so **~31% of sim launches are scripted to rug or dump** | "in our sim, ~1 in 3 launches is scripted to rug or dump. we didn't make it up, we made it realistic-ish." (say "realistic-ish" or "calibrated", never "accurate") | `apps/server/src/sim/behaviors/fate.ts:83-84` (`BASE_WEIGHTS = [60, 12, 8, 11, 7, 2]`) | Design weights, adjusted per dev reputation (`fate.ts:95-100`). Not a real-world rug rate. Don't imply "1 in 3 real coins is a rug" | AMBER |
| SIM-02 | One 2-hour run today (seed `trenchscope`): **1,077 SOL launches, 46 migrated (4.27%), 203 rug events**. Across 4 chains: ~1,979 tokens, ~11k wallets, ~182k trades, ~32 trades/s live | "ran the sim for 2 hours: 1,077 launches on sim-sol. 46 made it. 203 rugs. sounds about right." | `apps/server/scripts/sim-report.ts 120` output, 2026-10-20 | One run. The numbers change per seed and run. 4.27% sits slightly above the PRD's 2–4% target. Never present these as users, volume or traction | AMBER |
| SIM-03 | Calibration targets: graduation 2–4%, median time to graduate ~5 min with ~80% inside 1h, 60–75% of graduates below 40% of migration MC within 20 min | "the sim is tuned to real launchpad base rates, so it hurts like the real thing." | `docs/PRD.md:197` (SIM-21) | These are targets. Only graduation was measured today (SIM-02). Say "tuned to", not "matches" | AMBER |

### 4.4 Stat hygiene

- **Not graduating is not rugging.** Most non-graduates are duds that die quietly. Never write "97% are rugs" or "97% are scams".
- Keep the "~" and the time window ("within 20 min", "at 24h", "lately").
- One stat per post. Put the source in the replies, not in the main post (links are deprioritised).
- Never mix a real stat and a sim stat in one sentence without labelling the sim one.

---

## 5. Must not claim (RED)

| ID | Never say / imply | Why |
|---|---|---|
| MNC-01 | Real trading, real money, real chains: "trade on Solana", "connect your wallet", "deposit", "withdraw", "live on mainnet", "non-custodial" | v1 is a simulator with paper trading only (PRD §1.5, §2.2) |
| MNC-02 | Any token, ticker, airdrop, presale, whitelist, "points → allocation", "early users get rewarded", "farm points", "TGE", "wen token? soon" | PRD non-goal: no token of our own. Points are in-app only (PRD §2.2, §13.3) |
| MNC-03 | Profit or performance promises: "100x", "guaranteed", "free money", "print", "make money", "get rich", "become profitable", "beat the trenches", "never get rugged again", "rug-proof", "avoid every rug" | No profit promises and no financial advice. Paper practice does not guarantee real results |
| MNC-04 | Our signals, labels or copy trading make money: "our signals hit 2x X% of the time", "copy smart money and win", screenshots of the Signals page "Hit 2x+" tile or the Rewards rebates as performance | These are sim numbers about fictional tokens and wallets (`pages/SignalsPage.tsx:86`; `pages/RewardsPage.tsx`) |
| MNC-05 | Invented traction: user counts, waitlist sizes, "thousands of degens", "$X volume traded", "N trades/sec" as real activity, testimonials, "traders love it", KOL quotes, partner or investor logos, "backed by" | None exist. Sim throughput is not user activity |
| MNC-06 | Accuracy claims: "90% accurate smart-money detection", "detects every insider", "predicts rugs", "rug detector that works" | Label quality is measured only in the sim and varies widely by chain (`analytics/wallets/index.ts:62-85`). No real-chain validation exists |
| MNC-07 | "AI-powered", "AI signals", "machine learning", "our AI spots rugs" | The product has no AI or ML component (no model or LLM code in `apps/`). Only the trailer is AI-generated |
| MNC-08 | Speed claims: "fastest terminal", "0 ms", "sub-second execution", "beats every bot" | Latency is simulated (120–600 ms). There is no landing telemetry (D13 not built) |
| MNC-09 | "First" or "only" paper-trading memecoin terminal | Unverified. Competitor facts were "recalled, not re-fetched" (R§20), and a third-party "papertrench" project appears in the research sources (R§20) |
| MNC-10 | Competitor names, comparisons or digs: "GMGN killer", "better than [terminal]", "cheaper fees than", "unlike [X]…"; naming any terminal, bot or launchpad in posts | Brand rule plus project rules. Competitor facts are unverified |
| MNC-11 | Competitor-distinctive labels or look: "Almost bonded", "Degen Audit", "Sky Eye", "P1/P2/P3", "Cooking", "SnipeX", and other terminals' board names ("Pulse", "Final Stretch", "Memescope", "About to Graduate", "Neo Vision"), their logos, mascots or colours | PRD brand rule (`docs/PRD.md:18`). Note: "Almost bonded" and "P1/P2/P3" are still in our UI (section 7) |
| MNC-12 | Features that are not built: share/PnL cards, verified PnL, a "safety score", a risk acknowledgement flow, a command palette or "full keyboard map", density modes, a multi-chain "All" monitor, copy-trade backtest / gates / KOL-dump detection, landing telemetry, a fees ledger, Explain-PnL, Telegram bot, extension, mobile app or PWA install, web push, passkeys, Chinese UI, X/social tracker, public API, token launcher, call-outs | Section 1.2 |
| MNC-13 | Roadmap promises: "real-chain trading coming", "mainnet soon", "live mode Q1", "real data soon" | Real-chain adapters are a P2 possibility and **not promised** (PRD §13.3) |
| MNC-14 | Affiliation or endorsement: with Solana, BNB Chain, Base, Ethereum, any launchpad, DEX, KOL, exchange or VC | None exists. Chain names are used only to describe the simulation |
| MNC-15 | Real people, KOLs or brands in posts, the trailer or thumbnails: real KOL names or faces, look-alikes, tagging KOLs to farm reach, real project logos | Hard honesty rule. The sim KOLs are fictional (`sim/names.ts:405`) |
| MNC-16 | Sim tokens as if real: `$TICKER` cashtags of sim tokens, "this coin is pumping", treating sim tickers, KOL @handles or token socials as real | On X a cashtag pulls up a real asset. Sim names are invented and may collide with real ones |
| MNC-17 | Safety or security for funds: "protects your bags", "secure your funds", "anti-rug protection" | There are no funds. Say "no real money at stake" |
| MNC-18 | "Risk-free trading" in a financial-promo tone | Technically true for paper, but it reads like a financial promotion. Prefer "fake money" or "nothing real at stake" |
| MNC-19 | Learning outcomes: "learn to trade profitably", "become a better trader guaranteed", "graduate to real money" | We can offer practice, not outcomes |
| MNC-20 | Stat distortions: "97% of memecoins are rugs/scams", unhedged precision ("exactly 2.6%"), presenting 2025 or older samples as "now", naming the launchpad the stat came from in the main post | Section 4.4 |
| MNC-21 | "Live now", "sign up at …", "join the beta", "download" | No live URL or beta exists yet. Use `[LINK]` |
| MNC-22 | Engagement manipulation: follow-for-follow, pods, giveaways for follows/RTs, bought followers or engagement, bot replies, mass-tagging, cross-account duplicate posting | X platform rules. Organic growth only |
| MNC-23 | Implying the AI trailer shows real footage, real people, real gains or real events | It's an AI-generated dramatization. Label it (section 6) |

---

## 6. Required disclaimers (short forms)

Copy these exactly or keep their meaning. Lowercase is fine.

| ID | Where | Text | Length |
|---|---|---|---|
| DIS-01 | **X bio** | `paper-trade the trenches. simulated market · fake money · no token · nfa` | 72 chars |
| DIS-02 | Any post that shows the product, a feature or a number from the app | `sim market · paper trading · nfa` (end of post, or in the first reply on a thread) | 32 chars |
| DIS-03 | Any post with a real-market stat | Keep "~" + a time window + "on major launchpads" in the post. In the first reply: `source: launchpad lifecycle data, [month] 2026 (secondary). approximate.` | ~70 chars |
| DIS-04 | **Any PnL / ROI / balance image** (screenshots, mock cards, thumbnails) | A watermark burned into the image, not just in the caption: **`SIMULATED · PAPER TRADE`** | — |
| DIS-05 | App footage in videos (corner bug, the whole time the app is on screen) | `SIM · PAPER TRADING` | 19 chars |
| DIS-06 | **Video end card** | `AI-generated dramatization. Fictional people, tokens and events.` / `Trenchscope is a simulated market with paper trading only. No real funds. No token. Not financial advice.` | 2 lines |
| DIS-07 | Trailer post caption | `ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa` (and turn on X's AI / altered-media label if one is offered) | 80 chars |
| DIS-08 | Pinned reply / FAQ for "wen token" | `there is no trenchscope token. no airdrop, no presale, no points-to-token. anyone selling you one is scamming you.` | 115 chars |
| DIS-09 | Pinned reply / FAQ, anti-phishing | `we never dm first and never ask for keys or a wallet. there's nothing to connect.` | 82 chars |
| DIS-10 | Bio link page / thread footer | `not affiliated with any chain, launchpad or trading platform.` | 62 chars |
| DIS-11 | Any post or video showing sim tokens, wallets or KOLs | `all tokens, wallets and kols shown are fictional sim entities.` | 62 chars |
| DIS-12 | Launch-thread final tweet (combined) | `trenchscope is a simulated market. paper trading only, no real funds, no token, not financial advice. [LINK]` | ~110 chars |

---

## 7. Footage, screenshot and design hygiene (product-specific gotchas)

1. **SIM label coverage.** The app has **no header SIM badge**. On desktop the footer shows "Simulated market · paper trading", so keep the bottom bar in frame or add DIS-05. On phone-width recordings the notice is hidden (it lives in the drawer), so **always add DIS-05**.
2. **No share cards exist.** Every PnL visual is made by us and must carry DIS-04 in the pixels. Don't call a mock-up an "in-app share card".
3. **Competitor labels in our UI.** The Trenches middle column is titled **"Almost bonded"** (`apps/web/src/components/discovery/TrenchesColumn.tsx:21`, also `pages/TrenchesPage.tsx:186` and `README.md:19`). The execution presets are labelled **"P1/P2/P3"** (`components/token/trade/PresetBar.tsx:16`, `components/account/FormBits.tsx:43`). The PRD brand rule calls both distinctively GMGN's. Before recording hero footage, ask the owner to rename them in-app (e.g. "Near grad" and "S1/S2/S3"), or crop/blur them. Never use either label in copy.
4. **Fake socials can be real.** Sim tokens get generated `x.com/...`, `t.me/...` and website URLs (`apps/server/src/sim/names.ts:386-402`) that may belong to real accounts or domains. Don't click, show or quote them on camera.
5. **KOL handles are invented, but `@`-handles might exist on X** (`sim/names.ts:406-421`). Don't zoom into them, don't tag them, and blur them in close-ups.
6. **Tickers are generated and can collide with real coins or brands** (e.g. the run today produced PUDGE, BASED, FROGO). Don't feature a ticker in post copy, and **never cashtag one**. Prefer frames where tickers are small or generic.
7. **Native prices in the footer (SOL/BNB/ETH) are simulated** and won't match real prices. Don't show them as market data.
8. **Wallet 7D/30D stats only cover the sim's runtime** (90-minute warm-up by default). Don't present them as long track records.
9. **Signals "Hit 2x+" and Rewards "rebates / cashback" show sim values.** Don't screenshot them as performance or earnings.
10. **Brand tokens match the built UI:** bg `#0A0C10`, panel `#11141A`, fg `#E6E9F0`, muted `#8C94A3`, accent flare amber `#FFB547`, up `#22D687`, down `#FF5468`, KOL `#C084FC`, whale `#38BDF8`, insider `#F472B6`, plus smart `#4ADE80`, dev `#FB923C`, sniper `#F87171`, bundler `#FACC15`, fresh `#2DD4BF` (`apps/web/src/index.css:12-37`). Fonts: Inter + JetBrains Mono (`apps/web/tailwind.config.js:44-45`). Logo: `components/layout/Logo.tsx`.

---

## 8. Pre-post checklist (run on every post, image and video)

- [ ] Every product claim maps to a safe-claim ID (SC-xx) or a feature (FB-xx).
- [ ] Every number is either a KS-xx stat (hedged, with a time window, source ready in a reply) or a SIM-xx stat (labelled "in the sim").
- [ ] Nothing from section 5 appears, including in images, alt text and video voice-over.
- [ ] The right disclaimer from section 6 is present (bio DIS-01; product DIS-02; stat DIS-03; PnL image DIS-04; video DIS-05/06/07).
- [ ] No competitor names, labels, colours or UI; no "Almost bonded" or "P1/P2/P3" visible in hero frames.
- [ ] No real people, KOLs, brands, cashtags or sim social links.
- [ ] No link in warm-up posts; `[LINK]` only in the launch thread.
- [ ] Organic only: no pods, no follow-for-follow, no mass-tags, no duplicate cross-account posts.
