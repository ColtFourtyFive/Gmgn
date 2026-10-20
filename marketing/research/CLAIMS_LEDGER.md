# Trenchscope claims ledger

| | |
|---|---|
| **Purpose** | The single list of what the X account, the warm-up posts, the launch thread, the trailer and the website may say about Trenchscope and about the memecoin market. |
| **Follows** | `research/POSITIONING.md` (the binding brief). If the two disagree, POSITIONING wins and this file gets fixed. The approved Day-1 copy is `x/TODAY.md`. |
| **Verified against** | The product code in `apps/web/src`, `apps/server/src` and `packages/shared/src`, at the last product commit `d3fc838` on branch `claude/viral-social-content-assets-gd3bn8`. Line numbers are as of that commit. |
| **Path shorthand** | `web/` = `apps/web/src/`, `server/` = `apps/server/src/`, `shared/` = `packages/shared/src/`. |
| **Rule of use** | If a claim is not in section 2 (product claims) or section 4 (market stats), don't post it. If it is in section 5, never post it, not even as a joke. Every post, image and video carries the disclaimers section 6 requires. |
| **Counts** | Numbers in brackets are X-weighted characters, measured with `xlen.py`. Every allowed line fits in one post with room left over. |
| **Placeholders** | There's no live URL and the handle isn't confirmed yet. Use `[LINK]` and `@trenchscope`. |

**Status key**

| Status | Meaning |
|---|---|
| **GREEN** | The code does this today, and the wording matches what the code does. The owner still makes one check before launch: is it in the live build, running on real chain data (check F-1, section 8)? |
| **OWNER** | Not in the code, or only in the simulator. Post it only after the owner confirms it's true in the live build. The rows say so where a warm-up tease form exists. |
| **AMBER** | A real-market stat. Post it only with the hedges shown. |
| **RED** | Never post (section 5). |

---

## 0. The ten rules that matter most

1. **The code has no real trading yet.** Real execution, self-custody and Robinhood Chain are OWNER claims (section 1). A warm-up teaser may name them once the owner ticks **C-0** (they're in the launch build). Nothing says "live", "trade now" or carries a link until **C-1** and **K-1** pass: real trading works on every chain the post names (section 8).
2. **Launch-day posts are gated.** Post them only once real trading works. If a chain isn't ready, drop it from the copy and the header.
3. **No dates.** Not in any post, image or video. Use relative words ("lately", "this week" only in the gated launch copy).
4. **No profit talk.** It's a tool, not an opportunity. No "profit", "returns", "earn", "make money", "100x", "risk-free", "guaranteed".
5. **No fake results.** Demo data is never a result. A PnL number appears only from a real trade the owner made on the live product, with `your results will differ.`
6. **Label every frame.** Product shots carry `UI shown with demo data`. AI shots carry `AI-generated`, plus X's "Made with AI" label.
7. **Quote the definitions exactly** (section 2). Snipers bought "within 3 blocks of launch", not "in the first block". The audit is "reference only". Copycats are "flagged", never "detected".
8. **No competitors, no chain endorsement.** No other terminal, bot or launchpad by name. Chains are named only as supported chains: Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain.
9. **No token talk.** Don't mention a Trenchscope token, airdrop or points at all unless the owner confirms a plan.
10. **No cashtags, no real tickers in product shots, no real people.**

---

## 1. What the code is today (read this before claiming anything)

The positioning markets a real terminal. The code is still the simulator build. Here is the gap, stated plainly:

| Area | What the code has | Evidence | So |
|---|---|---|---|
| **Execution** | No real execution on any chain. Trades are priced and filled against the in-memory simulator ledger. No package or source file contains a chain SDK, RPC client, wallet adapter, signer, private relay or bundle client. | `server/trading/execution.ts:1-7` ("Paper-trade execution"); `server/sim/world.ts` (`executeSwap`); `apps/web/package.json` and `apps/server/package.json` (no chain dependencies); a grep for viem, ethers, @solana/web3, wagmi, walletconnect, jito and flashbots finds nothing | "Trade on [chain]" is **OWNER**, one check per chain (SC-43) |
| **Custody** | No keys at all. Accounts are server-side guest or username/password accounts, and the balances are server-held paper balances. No key generation, import or signing. | `server/accounts/credentials.ts`, `server/accounts/service.ts`; `web/components/layout/AuthModal.tsx` | "Self-custody" and "you keep your keys" are **OWNER** (SC-46) |
| **Chains** | Four chain ids: `sol`, `bsc`, `base`, `eth`. The UI's chain switcher shows SOL, BSC, Base and ETH. The round chain mark (`ChainIcon`) is filled with each chain's **brand colour** (sol `#9945FF`, bsc `#F0B90B`, base `#0052FF`, eth `#627EEA`) and Ethereum's mark is the ether symbol `Ξ`. It renders in the top bar, the chain switcher, the status bar, search results, token and wallet headers and account tables | `shared/chains.ts:5-7,48,63,78,93`; `web/components/layout/ChainSwitcher.tsx`; `web/components/common/ChainIcon.tsx:6,17-26` | Robinhood Chain is in **no file**: **OWNER** (SC-45). The chain marks break POSITIONING's no-brand-colours rule: recolour before capture (section 7.11, SC-36) |
| **Data** | Every token, wallet, KOL, price and trade comes from the simulator. The analytics read only observable data (trades, blocks, timestamps, balances, funding links), so in principle the rules carry over to real chains. | `server/analytics/tokens/track.ts:1-3`; `server/analytics/wallets/index.ts:6-9` | The rules are GREEN. That the live build feeds them real chain data is check F-1 |
| **Sim-only inputs** | Some features read values the simulator hands over, with no detection rule behind them: KOL identity, dev-team wallets, the copycat flag, the paid-boost flag, the CTO flag, KOL calls, and the bundler-sell signal (it reads the simulator's bundler list). Token cohorts are also merged with the simulator's own lists. | `server/analytics/wallets/index.ts:55` (`kol` is identity, not computed); `server/sim/behaviors/launch.ts:111,156`; `server/sim/market.ts:611,623`; `server/analytics/wallets/signals.ts:247`; `server/analytics/tokens/security.ts:48-77` | Each is **OWNER** until the live build has a real source for it |
| **Fee** | `PLATFORM_FEE_RATE = 0.008` is a simulator setting, shown in the trade-panel footer. | `shared/chains.ts:160`; `web/components/token/trade/TradePanel.tsx:157-160` | Never quote a fee number (SC-12) |
| **Footage** | Marketing capture mode: the real UI on demo data, with sim-only wording hidden or rewritten. | `marketing/tools/capture-mode.js` | Every frame carries DEMO (section 6) and follows section 7 |

---

## 2. Product claims (POSITIONING "What the product does", items 1 to 8)

IDs carried over from the simulator-era ledger keep their number when the meaning survives. Retired IDs are listed in 2.10 and are never reused.

### 2.1 The board (item 1)

| ID | What the code does (quote this) | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-07 | Three columns, updating in real time: **New**, **Near graduation**, **Migrated**. Each column has its own filters and sort. Hovering pauses a column ("Paused · N new" while new tokens buffer). Each card has a one-click quick buy. | "new launches, near graduation, migrated. one screen, in real time." (66) | `web/pages/TrenchesPage.tsx:1-3`; `web/components/discovery/TrenchesColumn.tsx:19-23,251`; `web/components/trade/QuickBuyButton.tsx` | GREEN. Say "near graduation" or "near grad". Never "almost bonded" |
| SC-07b | Every card's avatar has a **curve-progress ring** (bonding-curve progress, turns green when full) and a row of **risk chips**: Top 10, Dev, Insiders, Snipers, Bundlers, Fresh. A chip turns red past the viewer's threshold. | "every card gets a curve-progress ring and risk chips that go red past your limits." (82) | `web/components/common/TokenAvatar.tsx:14-15,30`; `web/components/discovery/TokenBadges.tsx:87-110` | GREEN |
| SC-31 | The chip thresholds are user settings. Defaults: top 10 **30%**, dev **30%**, insiders **5%**, bundlers **10%**, snipers **10%**. Fresh is fixed at **30%**. | "set your own red lines. the chips go red when a coin crosses them." (66) | `server/accounts/settings.ts:75`; `web/components/account/settings/DisplaySettingsForm.tsx:90`; `web/components/discovery/TokenBadges.tsx:12` | GREEN |
| SC-29 | Trending (time windows plus server-side sorts), New Pairs and Narratives (themes ranked by heat), with 30+ filter fields: hide dev sold, hide wash trading, a bundler-share range, LP burned, socials, and more. | "30+ filters. hide wash trading, hide dev-sold, cap the bundler share." (69) | `web/pages/TrendingPage.tsx`, `NewPairsPage.tsx`, `NarrativesPage.tsx`; `server/analytics/filters.ts:28-112`; `web/components/discovery/filters.ts:110-128` | GREEN. Never say "safe" in copy, even though the UI has "Safe" and "Safe contract" presets (section 7) |

### 2.2 Wallet tags (item 2)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-19 | Tags: **smart money, KOL, sniper, bundler, insider, dev, whale, fresh, bot**, plus MEV (sandwich bot), Top 10, Following and You. Every tag except KOL runs on a code rule (table below), and our posts quote those rules. | "smart money, sniper, bundler, insider, dev, whale, fresh, bot. every tag runs on a rule, and we post the rules." (111) | `shared/types.ts:45-58`; rules in the table below | GREEN for the rule-based tags. KOL is OWNER (SC-19k), so it stays out of "every tag runs on a rule". Not "every wallet gets a tag": most wallets match no rule |
| SC-19t | **The in-app tooltip defines the tag.** It doesn't today. The tooltips are generic and some are wrong: Whale "Holds a large native balance or position", Bot "High-frequency trading bot", Fresh "Newly created wallet with little history", Sniper "first blocks", Bundler "likely linked to the dev", Insider "accumulated early" (rules 1 and 2 have no time limit), Smart "statistically proven record of profitable trades" (profit wording), KOL "a publicly known influencer wallet" (an identity claim) | — | `web/components/common/WalletTags.tsx:16-28` | OWNER (F-8). Never "hover any tag and it tells you exactly what it means", "published definition, shown in its tooltip" or "hover a tag for what it means" until the live build's tooltips carry the rules below. Dev task: rewrite the `WALLET_TAG_META` descriptions to these rules and drop "profitable" |
| SC-21 | Sniper, bundler and insider are tagged per token from block timing and funding links. The exact rules are in the table below. | "sniper: bought within 3 blocks of launch." (41) / "bundler: bought in the same block the coin was created. six wallets, one trench coat." (85) / "funded by the dev? insider. funded by the dev's funder? also insider." (69) | `server/analytics/tokens/track.ts:8-13,21-22,207-212,234-256` | GREEN. Use the definitions below, word for word in substance |
| SC-20 | Smart money is earned from behaviour over a rolling 7 days, and it's not hand-picked (rule below). | "smart money isn't a vibe. it's a 7-day hit rate: entries that later ran 2x, tested against the chain's base rate." (113) | `server/analytics/wallets/index.ts:62-107,423-441` | GREEN. No accuracy numbers (MNC-06). Don't repeat the tooltip's "statistically proven… profitable" in copy |
| SC-21d | Dev = the wallet that created the token. The code also counts "dev team" wallets, but the simulator assigns those. | "dev: the wallet that made the coin. we watch what it does next." (63) | `server/analytics/tokens/track.ts:99-101` (`isDevGroup`); `server/sim/behaviors/launch.ts:156` (dev team is sim-assigned) | GREEN for the creator. "Dev team" is OWNER |
| SC-19k | KOL = an identity label supplied by the simulator (fictional personas). The code has no rule that finds KOL wallets. | — | `server/analytics/wallets/index.ts:55`; `server/sim/names.ts` | OWNER: needs a live source, plus a policy for labelling real people's wallets (MNC-15) |

**Tag definitions** (posts may quote these; they're what the code does):

| Tag | Rule in the code | Constants | Evidence |
|---|---|---|---|
| **Sniper** (on a token) | Bought in the **1st to 3rd block after the creation block**. Excludes the creator, the dev team and creation-block buyers. | `SNIPER_BLOCKS = 3` | `server/analytics/tokens/track.ts:9-10,21,210` |
| **Sniper** (wallet tag) | **5+ snipes**, and snipes are **at least 10%** of the tokens the wallet bought. | `SNIPER_MIN_SNIPES = 5`, `SNIPER_MIN_SHARE = 0.1` | `server/analytics/wallets/index.ts:108-115,412`; `server/analytics/wallets/tracker.ts:197-199` |
| **Bundler** | Bought **in the same block the token was created**, other than the creator. On the audit, "Bundlers" is the **share of the token's traded volume** from those wallets. | — | `server/analytics/tokens/track.ts:8,209`; `server/analytics/tokens/index.ts:476,496` |
| **Insider** (`classifyInsider`) | Checked on a wallet's first buy of the token (dev wallets excluded). The wallet is an insider if its **first funder** (the first wallet that sent it native coin) is **(1)** the creator or a dev-team wallet, or **(2)** the same wallet that funded the creator, unless that funder is a labelled public entity such as an exchange hot wallet. **(3)** If one private funder has funded **3 or more** wallets whose first buys all landed **within 10 minutes of launch**, all of them are tagged. Rules 1 and 2 have no time limit. | `EARLY_WINDOW_MS = 10 * 60_000`; group size `>= 3` | `server/analytics/tokens/track.ts:11-13,22,234-256`; `server/analytics/tokens/security.ts:66-77`; `server/sim/world.ts:463-466` (first funder only) |
| **Dev** | The token's creator (plus dev-team wallets, which the simulator assigns). | — | `server/analytics/tokens/track.ts:99-101` |
| **Smart money** | Rolling 7 days. **3+ entries** (first buys; launch-team entries don't count). **60%+ of them later ran 2x or more** in market cap. A one-sided z-score against the chain's base hit rate must be **at least 1.5**. Win rate **55%+**. 7-day PnL (realized + unrealized) at least **$2,000** (sol, bsc), **$1,200** (base) or **$2,500** (eth). Bots, MEV bots and snipers never qualify. The tag stays while hit rate and win rate are 50%+ and PnL is at least half the floor. | `SMART_RULE` | `server/analytics/wallets/index.ts:62-107,423-441` |
| **Whale** | Has traded, and holds **$100k+** in native balance **or** averages **$10k+** per buy. | `WHALE_MIN_BALANCE_USD`, `WHALE_MIN_AVG_BUY_USD` | `server/analytics/wallets/index.ts:116-117,415-419` |
| **Fresh** | First funded **under 24 hours ago** and has positions in **fewer than 15** tokens. | `FRESH_MAX_AGE_MS`, `FRESH_MAX_TOKENS` | `server/analytics/wallets/index.ts:118-119,421` |
| **Bot** | Trades faster than **max(200/day, 5 × the chain's median active-trader rate)**, with a **median hold under 2 minutes** across its last round trips (5+). | `BOT_MIN_TRADES_PER_DAY`, `BOT_RATE_MULT`, `BOT_MAX_MEDIAN_HOLD_MS` | `server/analytics/wallets/index.ts:121-134,406-411` |
| **MEV** (sandwich bot) | **5+ sandwiches**, making up **at least 25%** of its sells. | `SANDWICH_MIN`, `SANDWICH_MIN_SHARE` | `server/analytics/wallets/index.ts:135-139,403` |
| **KOL** | An identity label, not computed (see SC-19k). | — | `server/analytics/wallets/index.ts:55` |

Block times differ by chain (the code assumes 0.4 s on sol, 0.75 s on bsc, 2 s on base and 12 s on eth, at `shared/chains.ts:41,56,71,86`). Don't convert "3 blocks" into seconds in copy. The UI's own tooltips are looser than the code and sometimes wrong (SC-19t): the Snipers chip says "first-block buyers", the Bundler tag says "likely linked to the dev" and the Insider tag says "accumulated early". In copy, use the table above, never the tooltips.

### 2.3 Token audit (item 3)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-09 | Every token has an audit checklist. Each row is rated good (green), warn (amber), bad (red) or info against a set threshold (table below), with a hover hint on **most red rows**. Not every non-green row has a hint: Bot degens has none at any level; Smart money has none (amber at 0, info at 1–2); Buy/sell tax in amber (up to 10%) and Dev holding in amber have none; Contract verified and Ownership renounced have none when "Unknown" (amber), and Mint/Freeze none when "Unknown" (info). The panel calls itself reference only. | "every token gets an audit: top 10, dev, insiders, snipers, bundlers, fresh wallets, bots, wash trading, lp, taxes. green, amber, red." (133) | `server/analytics/tokens/security.ts:470-597`; `web/components/token/SecurityPanel.tsx` | GREEN. It's a reference, not a guarantee: never "safe", "audited", "verified safe". Never "a hint on anything that isn't green" |
| SC-10 | **Rug ratio** (0–100%): a noisy-OR of 16 weighted signals (dev hold, bundlers, insiders, snipers, top 10, dev history, serial launcher, mint/freeze, honeypot, honeypot unknown, closed source, owner not renounced, tax, LP not burned, dev dump, wash trading). **Risk level**: high if it's a honeypot; otherwise low under 10%, medium up to 30%, high above 30%. | "every token gets a rug ratio and a risk level. most of them are not low." (72) | `server/analytics/tokens/security.ts:362-447` | GREEN. Never "predicts rugs" or any accuracy figure (the code comments' AUC numbers are simulator-only) |
| SC-48 | **Holders by tag**: count and share of supply held by smart, KOL, sniper, bundler, insider, whale, fresh, bot and dev wallets, plus the top 10 and top 100. | "holders broken down by tag: how much the snipers, bundlers, insiders and the dev still hold." (92) | `web/components/token/HolderStrip.tsx`; `server/analytics/tokens/security.ts:133-205` | GREEN |
| SC-49 | **Funding links**: every holder row, the dev panel and the wallet header show **"Funded by"**, the first wallet that sent this wallet native coin. The wallet header adds the amount. | "every holder row shows who funded the wallet. follow the money one hop back." (76) | `web/components/token/tabs/HoldersTab.tsx:136-139`; `web/components/token/DevPanel.tsx:51-52`; `web/components/wallet/WalletHeader.tsx:143-146`; `server/sim/world.ts:463-466` | GREEN. It's one hop (the first funder), not a full funding graph |
| SC-26 | Dev record and status: coins launched and migrated (on hover and in the dev panel), and dev status: holding, sold part (over 10% of peak), sold all (under 0.1% of peak left), bought more. | "hover the dev: coins launched, coins migrated. some devs have plenty of the first and none of the second." (105) | `server/analytics/tokens/security.ts:210-227`; `web/components/discovery/TokenHoverSummary.tsx`; `web/components/token/DevPanel.tsx` | GREEN. No invented counts in copy |
| SC-28 | **Wash trading** is flagged when, in the last hour, the token had **20+ swaps** and **30%+ of its volume** came from wallets cycling buy/sell within 60 seconds (their 2nd round trip onward; labelled MEV bots excluded). | "wash-traded volume gets called out." (35) | `server/analytics/tokens/track.ts:23-27,214-232`; `server/analytics/tokens/index.ts:500` | GREEN |
| SC-27 | Copycat and paid-boost badges, and a "hide copycats" filter. The simulator sets both flags; the code has no detection logic. | "copycats get flagged. paid boosts get labelled as paid." (55) | `server/sim/behaviors/launch.ts:111`; `server/sim/market.ts:611`; `web/components/discovery/TokenBadges.tsx` | OWNER. Never "detects" |

**Audit thresholds** (`server/analytics/tokens/security.ts:470-597`):

| Row | Green | Amber | Red | Notes |
|---|---|---|---|---|
| Mint / Freeze authority (sol) | renounced | — | active | unknown = info |
| Honeypot (evm) | no | unknown ("sell path untested") | yes | |
| Contract verified (evm) | yes | unknown | no | |
| Ownership renounced (evm) | yes | no or unknown | — | |
| Buy / sell tax | 0 | up to 10% | above 10% | the larger of the two |
| LP burned | 99%+ | 50% to 99% | under 50% | "on curve" before migration = info |
| Top 10 holders | under 20% | 20% to 50% | above 50% | hint shows the top 100 share |
| Dev holding | up to 2% | up to 10% | above 10% | shows sold part / sold all / bought more |
| Insiders (share held) | up to 5% | up to 15% | above 15% | |
| Snipers (count) | under 5 | 5 to 20 | above 20 | also shows the share they hold |
| Bundlers (share of volume) | up to 10% | up to 30% | above 30% | |
| Fresh wallets (share of holders) | up to 10% | up to 30% | above 30% | |
| Bot degens (share of holders) | up to 50% | up to 70% | above 70% | |
| Wash trading | no | — | yes | rule in SC-28 |
| Smart money (holders) | 3+ | — | — | 1–2 = info, 0 = amber |
| Rug ratio | under 10% | 10% to 30% | above 30% | SC-10 |

### 2.4 The risk prompt (item 4)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-08 | **Trigger:** a **buy** submitted from the token page's trade panel (**Market** or **Auto** tab) when the token is a **honeypot** or its **risk level is high** (rug ratio above 30%). **Dialog:** "High-risk token: …" lists the reasons: honeypot, the high risk level with its rug ratio, every red audit row, and taxes above 10%. **Buy anyway** stays disabled until you tick "I understand the risks and want to buy". **Not covered:** sells, one-click quick buy (board cards and lists), limit orders, copy trades, sniper tasks and migration snipes. A separate setting, "Confirm trades", asks before every trade-panel trade. | "buy a high-risk coin from the trade panel and it lists the reasons, then makes you tick a box before you can buy anyway." (120) / "it literally asks 'you sure?' before you ape the rug." (53) | `web/components/token/model.ts:119-129`; `web/components/token/trade/useTradeExecutor.tsx:53-61,66-110`; `MarketForm.tsx:21`; `AutoForm.tsx:78`; `web/components/trade/QuickBuyButton.tsx:28-40` (no gate); `web/components/account/settings/DisplaySettingsForm.tsx:83` | GREEN for the trade panel |
| SC-08c | The short form "risky buys ask first." (21). It's only true for every buy if quick buy also goes through the prompt. | "risky buys ask first." (21) | as above | OWNER: true once quick buy routes through the prompt in the live build. Until then, scope it to the trade panel |

The dialog's subtitle in the code is sim wording ("Our simulated audit flagged this token…"). Capture mode rewrites it to "Our audit flagged this token. Review the reasons before you buy." Check the live build's wording before quoting it.

### 2.5 Orders (item 5)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-14 | **Market**, **Limit** (buy or sell at a price or market cap) and **Auto**. Auto attaches an exit strategy to the buy (take-profit ladder, stop-loss, trailing stop with an optional activation gain, dev-sell exit, migration sell), arms a migration snipe, or places exits on a position you already hold. Exit orders run server-side. | "market, limit, auto. attach take-profit, stop-loss, trailing and a dev-sell exit to the buy itself." (99) | `server/trading/schemas.ts:67-75`; `server/trading/orders.ts:1-6,32-41`; `web/components/token/trade/AutoForm.tsx:1-4` | GREEN. On a self-custody build, how server-side exits sign is check K-2 |
| SC-41 | **Dev-sell exit:** fires when the creator (or a dev-team wallet) sells **at least X% of that wallet's holding in one trade**. X is 10, 20, 50 or 80%, **default 20%**. It then sells 25, 50 or 100% of your position (or the share set in the buy's strategy) through the normal swap path. It **reacts after** the dev's sell; it can't get ahead of it. **Two places in the Auto tab:** on the **Buy** side ("Buy with exit strategy"), the StrategyEditor's "Sell when dev sells" sets the share to sell and the threshold is fixed at the 20% default; the buy toasts "Bought … · N exit orders". The **10/20/50/80% selector** ("≥ 20% of dev bag") and the **"Dev-sell exit armed"** toast are only on the **Sell** side ("Sell on dev sell"), which needs a position you already hold. | "dev-sell exit: when the dev sells 20%+ of their bag in one trade, your sell fires right after." (94) / "the dev wrote an exit. now so can you." (38) | `server/trading/orders.ts:29,149,183-184,263-271`; `web/components/token/trade/AutoForm.tsx:43-48,112,155-162,201-208`; `web/components/trade/StrategyEditor.tsx:145`; `web/components/token/trade/useTradeExecutor.tsx:39-43` | GREEN. Never "exit before the dev", "beat the dev" or "front-run the dev" |
| SC-50 | **Presets:** three slots (S1, S2, S3) per side and per chain, each with slippage (or auto), priority fee, anti-MEV on/off and a tip. | "three presets per side, per chain: slippage (or auto), priority fee, anti-mev." (78) | `web/components/token/trade/PresetBar.tsx`; `web/hooks/useSettings.ts:20-35` | GREEN. Say "presets" or "S1/S2/S3", never "P1/P2/P3" |
| SC-13 | **Anti-MEV** is a toggle on each preset, with a tip. In the code, "on" means a simulated private route: the tip is added to the network fee, about 150 ms is added to the confirmation time, and the trade can't be sandwiched. "Off" means a pool trade with over 1% price impact can be sandwiched, and the fill toast shows "MEV −x". | "anti-mev toggle on every preset." (32) | `server/trading/execution.ts:37-41,211,288,328-333`; `web/components/token/trade/PresetBar.tsx:128`; `web/components/token/trade/useTradeExecutor.tsx:38` | GREEN for the toggle |
| SC-13o | What anti-MEV does on each real chain. | "anti-mev: your trade goes through a private route for a small tip, so it's harder to sandwich." (94) | none (no real relay in the code) | OWNER, per chain. Never "no sandwiches", "MEV-proof" or "can't be sandwiched", even though the in-app tooltip says "no sandwich attacks" (section 7) |
| SC-11 | **Cost before you confirm.** The quote under the amount shows: **you receive** (after token tax and the venue's fee), **min received** at your slippage, **price impact** (amber above 3%, red above 10% with "Very high impact — consider a smaller size or splitting the order."), **exec price**, **fees** (platform + network, where network = base + priority fee + anti-MEV tip; the split shows on hover), and **route** (bonding curve or AMM pool). | "see the damage before you click: what you get, min received, price impact, fees, route." (87) | `web/components/token/trade/QuotePreview.tsx:42-45,91-119`; `server/trading/execution.ts:207-232` | GREEN |
| SC-12 | **The platform fee number.** The code holds a simulator placeholder of 0.8%. | Only after it's final: "the fee is on the quote before you confirm. every trade." (56). Never a number until then | `shared/chains.ts:160`; `web/components/token/trade/TradePanel.tsx:157-160` | OWNER. Never quote 0.8% or any other number until the owner confirms the final fee. Keep the footer fee line out of frame (capture mode hides it) |

### 2.6 Speed (item 6)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-30 | **Hotkeys.** On the board: 1/2/3 pick a column, J/K move between tokens, H/L between columns, Enter opens, B quick-buys, Esc clears. On the token page: B and S open buy and sell. `/` focuses search (tokens and wallets by name, ticker or pasted address). On Monitor: P pauses. Hotkeys can be switched off. | "j/k through the trench. b to buy. / to search. keyboard first." (62) | `web/pages/TrenchesPage.tsx:39-46`; `web/components/token/trade/TradePanel.tsx:85-91`; `web/components/layout/TopBar.tsx:26`; `web/components/layout/Omnibox.tsx:142`; `web/pages/MonitorPage.tsx:94` | GREEN. Say "hotkeys" |
| SC-44 | **Command palette.** POSITIONING item 6 lists one. The code has none: `/` is a search box, not a command palette. | — | grep for a command palette or cmdk finds nothing; `web/hooks/useHotkeys.ts:5` only mentions "mod+k" as a key-syntax example | OWNER, and not in the code. Don't post until the live build has one |
| — | Speed in numbers. Confirmation latency in the code is simulated (120–600 ms), and the UI prints it: every trade-panel fill toast reads "Bought X … @ price · **NNNms** · N exit orders", and the inline result line under the button shows the same figure. The status bar also prints the feed's ping ("NNms"). Quick-buy toasts don't carry it | — | `server/trading/execution.ts:37-38`; `web/components/token/trade/useTradeExecutor.tsx:42`; `web/components/token/trade/shared.tsx:65`; `web/components/layout/StatusBar.tsx:36`; `web/hooks/useUserChannel.ts:22-31` (quick buy, no latency) | RED (MNC-08) unless measured on the live build and the measurement is published. **In footage:** blur the `· NNNms` segment of any fill toast, keep the inline result line (`TradeResultLine`) out of punch-ins, and crop the status bar (section 7.1) |

### 2.7 Tracking (item 7)

| ID | What the code does | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-15 | **Copy trading:** mirror a wallet's buys at a fixed size or a ratio of its size, with a per-token cap. Mirror mode sells the same share whenever the target sells, touching only tokens the task bought. Up to 20 tasks. | "copy a wallet with your own size, a per-token cap and mirror sells." (67) | `server/trading/copytrade.ts:1-13` | GREEN. Never imply copying makes money (MNC-04) |
| SC-16 | **Sniper tasks:** buy new launches matching keyword, dev, launchpad and safety filters, a specific dev's next launch, or a token the moment it migrates. Launch filters run a tick after creation, so the dev's first buy is visible first. Up to 20 tasks. | "sniper tasks: new launches that match your filters, a dev's next coin, or the moment a coin migrates." (101) | `server/trading/sniper.ts:1-13`; `server/trading/schemas.ts:166` | GREEN. Never "first in", "beat the bots" or "block 0" |
| SC-18 | **Signals:** 13 kinds: price spike, ATH, market-cap milestone, smart buy, KOL buy, large buy, smart-money cluster, bundler sell, dev sell, migration, community takeover, paid boost, KOL call. A dev-sell signal fires when the creator or a dev-team wallet sells 20%+ of its holding in one trade (at most one every 30 seconds per token). | "13 signal types. one of them is just 'the dev is selling'." (58) | `shared/types.ts:489-502`; `server/analytics/wallets/signals.ts:24-36,46,229-253`; `web/components/signals/meta.ts` | GREEN for the logic. The number "13" is OWNER: KOL buy, KOL call, CTO, boost and bundler sell read simulator-supplied data |
| SC-17 | **Alerts:** price or market-cap level, 5-minute change, a wallet's trades, new launches matching a keyword, and smart-money buy clusters. They land in the notification bell and as toasts. | "set an alert on a wallet. get pinged when it apes." (50) | `server/trading/alerts.ts:1-4`; `server/trading/schemas.ts:192`; `web/components/layout/NotificationsBell.tsx` | GREEN |
| SC-24 | **Monitor:** trades in real time from smart money, KOLs or wallets you follow, filtered by side, size and rug risk, with pause. **Hot by smart money** = tokens bought by **2+ smart wallets in the last 30 minutes**. | "watch smart money move in real time. hot = 2+ smart wallets in 30 minutes." (74) | `web/pages/MonitorPage.tsx`; `web/components/monitor/HotBySmartMoney.tsx:25,80` | GREEN |
| SC-51 | **Watchlist.** | "watchlist the ones you're not ready to ape." (43) | `web/pages/WatchlistPage.tsx` | GREEN |
| SC-22 | **Wallet pages:** 1D/7D/30D/All PnL, win rate, PnL distribution, a daily PnL calendar, a style title, badges and a 0–100 copy score. | "every wallet gets a report card: pnl by period, win rate, a pnl calendar, a copy score." (87) | `shared/types.ts:392-437`; `server/analytics/wallets/metrics.ts:344-356`; `web/components/wallet/WalletCards.tsx` | GREEN. Never show a demo wallet's PnL as a result (MNC-19) |
| SC-23 | **Leaderboards** for smart money, KOLs, snipers, whales and all wallets over 1D/7D/30D, with follow and copy. | "leaderboards for smart money, kols, snipers and whales. study them." (67) | `web/pages/LeaderboardPage.tsx` | GREEN |
| SC-25 | **Token page:** candles at 1s, 15s, 1m, 5m, 15m, 1h, 4h and 1d, in price or market cap, with trade markers, plus tabs for activity, holders, top traders, position, orders and dev tokens. | "1-second candles. watch the rug in 4k." (38) | `web/pages/TokenPage.tsx`; `shared/types.ts:18-19`; `web/components/token/tabs/*` | GREEN |
| SC-32 | **PnL counts fees.** A buy's cost basis includes the platform and network fees. Sell proceeds are net of fees. | "pnl that counts your fees. painful. accurate." (45) | `server/sim/world.ts:647-648,749` | GREEN |
| SC-33 | **Portfolio:** an equity curve (1h/6h/24h/7d), positions, history and orders. | "portfolio, positions, orders, history and an equity curve. it counts your fees." (79) | `web/pages/PortfolioPage.tsx`; `web/components/account/EquityChart.tsx` | GREEN |

### 2.8 Multi-chain, custody and execution (item 8, plus POSITIONING "What we're marketing")

| ID | Claim | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| SC-42 | One terminal, one chain at a time through the chain switcher. The UI has four: SOL, BSC, Base, ETH. | "one terminal for sol, base, bsc and eth. pick the chain, same screen." (69) | `shared/chains.ts:5-7`; `web/components/layout/ChainSwitcher.tsx` | GREEN for the UI. Real data on each chain is check F-1 |
| SC-43 | **Real execution on Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain.** The code has no real execution on any chain (section 1). | Warm-up (no "live", no link): "one memecoin terminal for solana, base, bnb chain, ethereum and robinhood chain." (80). Each chain named needs its own check | none | OWNER, one check per chain. Warm-up teasers: **C-0** (the chain is in the launch build). "Live" copy: **C-1** (real execution works). Drop any chain that isn't ready from the copy and the header |
| SC-45 | **Robinhood Chain support.** Not in any file. | "robinhood chain too." (20). Always "robinhood chain", never "robinhood" on its own | none | OWNER (C-0 for teasers, C-1 for "live" copy). Not in UI shots until the live build has it (section 7) |
| SC-46 | **Self-custody:** users hold their keys, and the team never touches funds. The code has no keys; balances are server-side (section 1). | "you keep your keys." (19) / "self-custody. you keep your keys." (33) | none | OWNER. Warm-up (bio, header, pin, teasers): **C-0** (self-custody is in the launch build). "Live" copy: **K-1** and **K-2**. `x/TODAY.md` already uses "you keep your keys", so C-0 is ticked before the pin (PIN-v2) goes up |
| SC-47 | **It's live.** | Launch day only, posted only once real trading works: "trenchscope is live. trade and track memecoins on solana, base, bsc, ethereum and robinhood chain. you keep your keys." (118). Drop any chain or claim that fails its check | — | OWNER, gated on C-1, K-1 and F-1. Add RISK |

### 2.9 Brand and other

| ID | Claim | Allowed wording | Evidence | Status |
|---|---|---|---|---|
| LINES | POSITIONING's lines: "see who's really buying." / "see who's really buying, before you do." / "the trenches, with a scope." / "everyone in the trenches is larping. the wallets aren't." / "field guide to the trenches, ep.01". "larp the trenches." is retired. | as written in POSITIONING | `research/POSITIONING.md` "Lines" | GREEN (they rest on SC-19/SC-21) |
| SC-34 | Dark by default with a light theme, and a phone layout (bottom tab bar and drawers). | "dark by default, light if you must, and it works on your phone." (63) | `web/components/layout/AppShell.tsx`; `web/components/layout/MobileNav.tsx`; `web/hooks/useTheme.ts` | GREEN |
| SC-36 | Original brand: our own scope-reticle logo and palette. The UI's chain marks are letters, not the chains' logos, **but** each is filled with that chain's brand colour (Solana purple, BNB yellow, Base blue, Ethereum's `#627EEA`) and Ethereum's letter is the ether symbol `Ξ`. | "our own scope, our own colours." (31) | `web/components/layout/Logo.tsx`; `web/components/common/ChainIcon.tsx:6,17-26`; `shared/chains.ts:48,63,78,93`; `web/index.css:12-37` | OWNER (F-7): true once `ChainIcon` uses neutral tokens (panel-3 background, fg letter) and a plain letter for eth, in the live build or in capture mode. Until then, don't post it, and keep chain marks out of frame (section 7.11) |
| SC-37 | Web terminal, no extension or Telegram bot. | "no extension. no tg bot. just a tab." (36) | `apps/web` | OWNER: the live product may differ. The old "no keys" wording is retired (it contradicts self-custody) |
| SC-52 | **Unknown shows as `--`, not `0%`.** True only for values the client receives as missing: a risk chip shows `--` when its value is null or non-finite, and the holder strip shows `--` when a tag's hold rate is null. But the token-security rates are typed as plain numbers, and the server sends **0** when it has no data (bundler share with no volume yet, fresh-wallet share with no holders), so those chips read `0%`. The Holders tab's unknown "Funded by" cell renders `—`, not `--` | "unknown shows as --, not 0%." (28), only once dev ships the fix | `web/components/common/indicators.tsx:22,32`; `web/components/token/HolderStrip.tsx:21,71-77`; `shared/types.ts:101-117` (non-null numbers); `server/analytics/tokens/index.ts:496,498` (0 for no data); `web/components/token/tabs/HoldersTab.tsx:139` (`—`) | OWNER. Not a brand promise yet. Dev task: return null for "no data" on the server, then this row can go GREEN |

### 2.10 Retired IDs (never reuse)

SC-01 to SC-06 (paper trading, faucet, the simulator, deterministic boot, the four simulated chains), SC-35 (the "no token" claim: we don't mention a token at all now, MNC-02), and SIM-01 to SIM-03 (in-sim stats). Old FB-01 (guest onboarding), FB-21 (faucet) and FB-26 (the SIM footer) are retired from the shot list.

---

## 3. Shot list for capture mode

Record in marketing capture mode (section 7) on demo data. Every frame carries DEMO. Routes are relative to the app root, and `:chain` is `sol`, `bsc`, `base` or `eth`.

| ID | Shot | Route / how | What makes it pop | Claim |
|---|---|---|---|---|
| FB-02 | The board streaming new launches | `/sol/trenches` | Cards sliding in, curve rings filling, risk chips going red | SC-07 |
| FB-03 | Pause on hover | Hover a column | "Paused · N new" while tokens buffer | SC-07 |
| FB-04 | Keyboard on the board | `/sol/trenches`, keys `1`/`2`/`3`, `J`/`K`, `B` | Selection moves, quick buy, fill toast (the quick-buy toast has no latency figure; a trade-panel toast does: blur it) | SC-30 |
| FB-05 | Dev record on hover | Hover a token avatar | "N launched · M migrated" | SC-26 |
| FB-06 | Token page, 1s candles, trade markers | `/sol/token/:address`, resolution `1s` | Markers coloured by wallet tag | SC-25 |
| FB-07 | Audit checklist and rug ratio | Token page, audit panel | Insiders, snipers and bundlers rows with hints | SC-09, SC-10 |
| FB-07b | Holders by tag and "Funded by" | Token page, holder strip, Holders tab | Sniper/bundler/insider shares; the funder column | SC-48, SC-49 |
| FB-08 | The risk prompt | Trade panel, Market buy on a high-risk token | Reasons list, tick box, "Buy anyway" | SC-08 |
| FB-09 | Price-impact warning | Big amount in Market | "Very high impact — consider a smaller size or splitting the order." Blur the Fees value and the Route venue name (section 7.3) | SC-11 |
| FB-10 | Getting sandwiched (anti-MEV off, big pool trade) | Migrated token, large buy | Fill toast with "MEV −x" | SC-13 (show as a demo, never as protection proof) |
| FB-11 | Buy with exits; dev-sell exit armed | Trade panel → Auto. **Buy side:** "Buy with exit strategy", the StrategyEditor ladder and "Sell when dev sells" %, then the "Bought … · N exit orders" toast (blur `· NNNms` and the ticker). **Sell side** (needs a held position): "Sell on dev sell" with the "≥ 20% of dev bag" selector and the "Dev-sell exit armed" toast | The exits in the Orders tab | SC-14, SC-41 |
| FB-12 | Limit on market cap | Trade panel → Limit | Order line on the chart | SC-14 |
| FB-13 | A dev sell in real time | Signals page or the New column | "Dev sell" signal, candles collapsing | SC-18, SC-41 |
| FB-14 | Signals feed | `/sol/signals` | Filter chips, bullish/bearish cards. Keep the "Hit 2x+" tile out | SC-18 |
| FB-15 | Monitor and hot by smart money | `/sol/monitor` | Trades streaming, rug-risk filter | SC-24 |
| FB-16 | Leaderboards | `/sol/leaderboard` | Tabs and periods. No PnL close-ups | SC-23 |
| FB-17 | Wallet report card | `/sol/address/:address` | Calendar, distribution, copy score. Blur the PnL figures in close-ups | SC-22 |
| FB-18 | Copy-trade task | `/sol/copytrade` | The task card | SC-15 |
| FB-19 | Migration snipe | `/sol/sniper` | The task firing on graduation | SC-16 |
| FB-20 | Alert → bell and toast | `/alerts` | The toast landing | SC-17 |
| FB-22 | Narratives | `/sol/narratives` | Theme cards opening into tokens | SC-29 |
| FB-23 | Trending with filters | `/sol/trending` | "Hide wash trading", "Hide dev sold" (not the "Safe" preset) | SC-29 |
| FB-24 | Chain switch | Chain switcher, or by route | The same terminal on SOL, BSC, Base and ETH. Four chains only. Chain chips only once F-7 lands (neutral marks); otherwise crop them and show the chain name as text | SC-42 |
| FB-25 | Light/dark toggle and phone layout | Theme toggle; narrow viewport | Tab bar and drawers (keep the drawer's sim notice out of frame) | SC-34 |

Not recordable (not built): command palette, share/PnL cards, safety score, density modes, a multi-chain "All" monitor, copy backtest, fee ledger, Explain-PnL, onboarding tour. Also not recordable: Robinhood Chain, a real wallet connection and a real fill, until the live build has them.

---

## 4. Real-market stats (AMBER)

### 4.1 Source and confidence (read this first)

- The numbers come from **`docs/research/gmgn-research.md` §13.4** ("Empirical lifecycle statistics", marked **[S] secondary**) and **§13.2**, unless noted. Two are restated in `docs/PRD.md` §1.2.
- §0.1 defines [S] as platform docs read through search snippets or dated mirrors, blog and X posts, third-party reviews, YouTube walkthroughs and third-party code. **§13.4 gives no per-statistic URL**, and §0.2 says third-party figures "must be re-verified before they appear in any marketing comparison".
- **Before a stat goes out, the owner re-checks it** the day before (check S-1) against a public dashboard or primary post. Keep the "~" and the time window. Say "on the biggest solana launchpad" or "on major launchpads", never the platform's name. Put the source in a reply, not the main post.
- **No dates in posted copy.** The "Source as given" column is internal. In posts, the time window is "lately" or a duration ("within 20 minutes").

### 4.2 The stats

| ID | Stat (as given in the research doc) | Post-ready wording | Source as given | Honest caveat | Status |
|---|---|---|---|---|---|
| KS-01 | Graduation on the biggest solana launchpad ~2.6% recently, so **~97% never graduate** | "~97 out of 100 launches never make it off the curve. lately." (60) | R§13.4 ("~2.6% in Oct 2026"); PRD §1.2 | The rate swings a lot by month (0.6–1.0% before the launchpad's "BOOST" change, 2.5–6.7% around it, per R§13.4). Say "lately". **Not graduating ≠ rugged ≠ scam** | AMBER |
| KS-02 | After graduation, **73% fall below 40% of the migration price within 20 min** (so they lose 60%+) | "made it off the curve? congrats. ~73% of those are down 60%+ within 20 minutes." (79) | R§13.4; PRD §1.2 | One secondary dataset, one launchpad, unknown sample window. Keep "~" and "within 20 minutes". Not "all memecoins" | AMBER |
| KS-03 | Only **19.7% of graduates keep $5k+ liquidity at 24h** | "~1 in 5 graduates still has $5k+ liquidity a day later." (55) | R§13.4 | "1 in 5" rounds 19.7%. Graduates only | AMBER |
| KS-04 | **27k–50k launches a day** on one launchpad | "somewhere between 27k and 50k new coins a day. on one launchpad." (64) | R§13.4 (range across the year) | A range, not today's number | AMBER |
| KS-05 | Non-graduates last **about 9h on average** | "the average coin that doesn't graduate goes quiet in ~9 hours." (62) | R§13.4 | An average with heavy skew | AMBER |
| KS-06 | Median time to graduate **~5 min**; **81% of graduates do it within 1h** | "if it's going to bond, it usually does it fast. median ~5 minutes." (66) | R§13.4: "median ~5 min" is the headline figure; the doc also cites an older sample of 4.4 min (~457 curve trades) | Graduates only (both the median and the 1h share). In copy say "in one dataset", not "in an older sample" | AMBER |
| KS-07 | Graduation by the dev's first buy: **none 0.34%**, 0.05–0.2 SOL 5.70%, **>5 SOL 7.98%** | "coins where the dev bought nothing graduated ~0.3% of the time." (63) | R§13.4 | Correlation, not a strategy. Never "buy when the dev buys" (that's advice, and an invitation to get bundled) | AMBER |
| KS-08 | Once ~25 SOL is raised on the curve, **12.4% graduate vs a 2.62% base rate**; with ≤1 SOL left, **99.6% graduate** | "the last 1 sol of the curve fills 99.6% of the time. the first 25 is where coins go to die." (91) | R§13.2 (evidence under an inferred design note) | Secondary; re-verify first | AMBER |
| KS-09 | Other launchpads graduate **0.8% to 2.26%** | "on every major launchpad in the data, fewer than ~3 in 100 launches graduate." (77) | R§13.4 table | Different periods and definitions. Only the aggregate; never name the platforms | AMBER |
| KS-10 | One base launchpad: ~13k launches/day, **>95% lose liquidity within 48h** | "on one base launchpad, >95% of launches lose their liquidity within 2 days." (75) | R§13.4 | A no-curve launchpad, different mechanics. Don't name it | AMBER |
| KS-11 | Hidden costs: a ~1% platform fee plus priority and tip fees "silently add up to 10%+" on small trades | Only as worked maths: "0.1 sol buy, 1% fee + 0.005 priority + 0.005 tip = ~11% gone before the chart moves." (84) | PRD §1.2 (our own assertion, not a measured stat) | Not a sourced stat. Post only after our own fee is final and shown in-app (SC-12), because the first reply will be "and yours?". Never attribute it to a named product | AMBER |

### 4.3 Stat hygiene

- **Not graduating is not rugging.** Most non-graduates are duds that go quiet. Never "97% are rugs" or "97% are scams".
- Keep the "~" and the time window ("within 20 minutes", "a day later", "lately").
- One stat per post. The source goes in the first reply (the STAT line, section 6).
- Never use demo-data numbers as market stats.

---

## 5. Never say (RED)

| ID | Never say or imply | Why |
|---|---|---|
| MNC-01 | **"Live" before it's live:** "live", "live now", "trade now", "sign up", "try it", "launching", "soon", a link, or a real-looking URL, until real trading works on every chain the post names. "Live" appears only in the gated launch-day posts. **One exception, owner decision (a):** a single product-level `soon.` closing D7-P4 (`x/WARMUP_WEEK.md`), not attached to any chain or feature, posted only if the launch gate hasn't already passed. Never in replies, never twice | POSITIONING "What we never do"; section 1 |
| MNC-02 | **A Trenchscope token, in any form:** token, ticker, airdrop, presale, whitelist, TGE, "points", "points → allocation", "early users get rewarded", "wen token? soon". Also referral rebates, cashback and rewards (they read as "earn") | POSITIONING: no token talk unless the owner confirms the plan. Rebates may count as incentives under crypto-promotion rules (check L-1) |
| MNC-03 | **Profit promises:** "make money", "profit", "returns", "earn", "guaranteed", "risk-free", "100x", "print", "free money", "get rich", "become profitable", "beat the trenches", "never get rugged again", "avoid every rug" | POSITIONING. It's a tool, not an opportunity. No financial advice |
| MNC-04 | **Our tools make money:** "our signals hit 2x X% of the time", "copy smart money and win", the Signals "Hit 2x+" tile, a smart wallet's PnL as proof | Implied performance claims. On demo data they're also fiction |
| MNC-05 | **Fake results or traction:** invented trades, PnL, win rates, volumes, user counts, waitlist sizes, testimonials, "traders love it", partner or investor logos, "backed by". A PnL appears only from a real trade the owner made on the live product, with RESULTS | POSITIONING. None exist yet |
| MNC-06 | **Accuracy claims:** "detects every insider", "predicts rugs", "90% accurate", any precision, recall or AUC figure | Measured only on the simulator (`server/analytics/wallets/index.ts:62-85`; `server/analytics/tokens/security.ts:379-382`). No real-chain validation exists |
| MNC-07 | **"AI-powered"**, "AI signals", "machine learning", "our AI spots rugs" | The product has no AI or ML. Only the trailer and teasers are AI-generated |
| MNC-08 | **Superlatives:** "fastest", "lowest fees", "cheapest", "0 ms", "sub-second", "beats the bots", "first in" | POSITIONING: only if measured, with the measurement published. Latency in the code is simulated |
| MNC-09 | **"First" or "only"** memecoin / multi-chain / self-custody terminal | Unverified |
| MNC-10 | **Competitors:** names, logos, "better than X", "X killer", "unlike [terminal]", fee comparisons, naming any terminal, bot or launchpad in posts | POSITIONING; competitor facts are unverified |
| MNC-11 | **Competitor-distinctive labels or look:** "Almost bonded", "P1/P2/P3", "Degen Audit", "Sky Eye", "Cooking", "SnipeX", "Pulse", "Final Stretch", "Memescope", "About to Graduate", "Neo Vision", their logos, mascots or colours | Brand rule (`docs/PRD.md:18`). The UI now says "Near graduation" and S1/S2/S3 (`web/components/discovery/TrenchesColumn.tsx:21`; `web/hooks/useSettings.ts:20-24`) |
| MNC-12 | **Features that aren't built:** a command palette, share/PnL cards, a 0–100 safety score, a risk-acknowledgement onboarding, density modes, a multi-chain "All" monitor, copy-trade backtests or KOL-dump detection, a fee ledger, Explain-PnL, a Telegram bot, an extension, a mobile app or PWA install, web push, passkeys, a Chinese UI, an X tracker, a public API, a token launcher, copycat "detection" | Not in the code (section 2, SC-44, SC-27) |
| MNC-13 | **Roadmap promises:** "soon" or "coming soon" for a chain or feature, "next week", "Q1", "robinhood chain soon", "part of what we're shipping". The D7-P4 `soon.` (MNC-01's one exception) is product-level only and never sits next to a chain list | No dates (rule 3); only claim what the live build has |
| MNC-14 | **Chain endorsement:** Robinhood, Coinbase/Base, Binance/BNB or Ethereum logos, brand colours or wording that implies a partnership ("official", "partnered with", "powered by", "backed by", "built with"). "Robinhood" on its own (it names the brokerage, not the chain). "Binance" or "Coinbase" for the chains | POSITIONING. Chains are named as supported chains only |
| MNC-15 | **Real people:** real KOL names, faces, handles or look-alikes; tagging KOLs to farm reach; showing a KOL-tagged wallet's identity | Honesty rule. The demo KOLs are invented and their handles might exist on X |
| MNC-16 | **Real tokens:** real tickers in product shots or mockups, any $cashtag, generated demo tickers in post copy | POSITIONING: it reads as shilling. On X a cashtag pulls up a real asset |
| MNC-17 | **Absolute safety:** "safe", "audited", "verified safe", "rug-proof", "anti-rug protection", "protects your bags", "secure your funds", "blocks rugs", "can't get sandwiched", "MEV-proof", "exits before the dev" | The audit is a reference (SC-09); the risk prompt asks, it doesn't block (SC-08); anti-MEV lowers risk at best (SC-13o); the dev-sell exit reacts after the dev (SC-41) |
| MNC-18 | **Calls and advice:** "buy this", "entry here", price targets, "aping this", any "nfa but…" call on a specific coin | We're the scope, not the caller. It's financial advice in all but name |
| MNC-19 | **Demo data as real:** demo-data PnL, balances, volumes, holder counts or wallet stats presented as real market data or as results; a hero PnL from demo data | POSITIONING footage rules |
| MNC-20 | **Stat distortions:** "97% of memecoins are rugs/scams", unhedged precision ("exactly 2.6%"), naming the launchpad a stat came from in the main post | Section 4.3 |
| MNC-21 | **Dates:** any calendar date, weekday-plus-date, month or year in a post, image or video | POSITIONING: no dates |
| MNC-22 | **Engagement manipulation:** follow-for-follow, pods, follow/RT giveaways, bought followers or engagement, bot replies, mass-tagging, duplicate posts across accounts | X platform rules. Organic only |
| MNC-23 | **AI as real:** implying the trailer or a teaser shows real footage, real people, real gains or real events; AI-generated UI, numbers or PnL | Label AI work (section 6). Numbers come only from the real UI |

---

## 6. Required disclaimers

The texts are exact (from POSITIONING). Don't reword them, translate their case, or shorten them, except where a short form is listed.

| ID | Exact text | Count | Where | Placement rule |
|---|---|---|---|---|
| **RISK** | `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` | 92 | Every launch-day post about trading. The trailer end card. The website. | **In the post itself**, as its last line, not only in a reply (a risk warning has to travel with the promotion). Plan copy for 280 − 92 − 2 = **186** characters before it. On the end card, at least 3 seconds on screen and legible on a phone. |
| RISK-short | `high risk · nfa` | 15 | Image cards (feature cards, stat cards) | Burned into the card, bottom edge. It doesn't replace RISK in a launch-day post. |
| **DEMO** | `UI shown with demo data` | 23 | Every product screenshot or recording | **Burned into the pixels**: a corner, every frame the UI is on screen, legible at phone size (about 2% of the frame height or more, high contrast). Also in the alt text. A caption alone isn't enough. |
| **AI** | `AI-generated` | 12 | Every AI still or clip (trailer, teasers, field-guide stills) | Burned into the pixels while the AI shot is on screen. **Also** turn on X's "Made with AI" label, and start the alt text with "AI-generated". In a mixed edit, AI shots carry AI and UI shots carry DEMO. |
| **CUSTODY** | `we will never DM you first, ask for your seed phrase, or ask you to send funds.` | 79 | The pinned self-reply. The reply bank. The launch thread. | In the pinned self-reply from day one (`x/TODAY.md` PIN-r1 uses it, adding "anywhere. if someone does, it isn't us."). One post in the launch thread. Reply with it to any "dm me" or "support" impersonator. |
| **CHAINS** | `not affiliated with any chain, launchpad or exchange named.` | 59 | Trailer end card. Website footer. | Below RISK on the end card. Every page footer of the website. |
| RESULTS | `your results will differ.` | 25 | Any post or image with a real PnL number | Only for a real trade the owner made on the live product (MNC-05). Next to the number, in the pixels and in the post. |
| STAT | `source: launchpad lifecycle data (secondary). approximate, and it moves month to month.` | 87 | First reply to any post with a KS stat | Adjust "launchpad lifecycle data" to the re-verified source (S-1), with no dates. |

**Old disclaimer IDs → new:** DIS-01 (bio) → retired (use the bio in `x/TODAY.md`). DIS-02 (product posts) → DEMO, plus RISK on launch day. DIS-03 (stats) → STAT. DIS-04 (PnL watermark) → retired, since demo PnL is never shown as a result (RESULTS covers real trades). DIS-05 (video corner bug) → DEMO. DIS-06 (end card) → AI + RISK + CHAINS. DIS-07 (trailer caption) → AI + X's "Made with AI" label. DIS-08 (token FAQ) → retired (MNC-02). DIS-09 (anti-phishing) → CUSTODY. DIS-10 (affiliation) → CHAINS. DIS-11 (fictional entities) → DEMO. DIS-12 (launch-thread footer) → RISK + CUSTODY.

---

## 7. Footage and design hygiene

1. **Marketing capture mode for every product capture.** Load `marketing/tools/capture-mode.js` with `page.addInitScript({ path })` before navigating. It hides the sim notices, Faucet and Top up, and the trade-panel fee line, and it rewrites sim phrasing. The data stays demo data.
   - It doesn't catch every sim string. Keep these out of frame: the sign-in/guest modal, the SimBanner body text (the phone nav drawer), Account settings ("Paper wallets", "Paper account"), the copy-trade and sniper form footers ("paper trading on a simulated market"), the Sniper page footer ("Paper trading only."), the Rewards/referral page, the signed-out trade-panel and Position-tab prompts ("paper balance", "start paper trading"), and the "Faucet failed" toast.
   - **Frame check before export:** scan every frame (OCR, or by eye at 100%) for `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`, `ms` (the simulated latency in trade-panel fill toasts and the inline result line, and the status bar's ping: section 2.6), and the demo venue names `TrenchSwap`, `Moonpit`, `Bonkfire`, `Rayforge`, `FourPad`, `BNB Rocket`, `ClawLab`, `BaseDrop`, `EtherForge` (the quote's Route row and launchpad badges: "TrenchSwap" reads as an exchange we own, and the launchpad names echo real brands). Any hit is a re-take, a crop or a blur.
2. **DEMO on every product frame** (section 6). Re-record on live data after launch and swap the assets in.
3. **Blur generated tickers and KOL handles in close-ups.** Demo tickers can collide with real coins, and demo `@handles` might be real X accounts. Never click, show or quote generated token socials (x.com, t.me, website links). Prefer frames where tickers are small. **Also blur:** the `· NNNms` latency in any fill toast; on the quote (`QuotePreview`), the **Fees** value (priced from the simulator's 0.8% placeholder, `PLATFORM_FEE_RATE`, and split out in its hover title) and the **Route** venue name (`TrenchSwap` or a demo launchpad), keeping the "bonding curve" / "AMM pool" part if wanted; and demo launchpad badges.
4. **No hero PnL from demo data.** No PnL, balance, win rate, equity curve or leaderboard PnL as the subject of a shot, a thumbnail or a card. Incidental numbers in a wide shot are fine with DEMO. A PnL appears only from a real owner trade on the live product, with RESULTS.
5. **AI label on AI shots** (section 6). Never composite real UI into an AI shot so it looks like real footage, and never generate UI or numbers with AI.
6. **No Robinhood Chain in the UI until it exists.** The chain switcher shows SOL, BSC, Base and ETH. Don't mock up a fifth entry, add a Robinhood Chain row to a screenshot, or show its name in a UI frame. It appears in copy only (SC-45). If any chain isn't ready at launch, keep it out of the header art and the copy too.
7. **No "Live" badge in pre-launch footage.** The UI shows "Live" as a connection badge (`web/components/layout/StatusBar.tsx:11`, `web/components/discovery/LiveStatus.tsx:19`, `web/components/token/tabs/ActivityTab.tsx:189`). Until launch, crop or blur it, because a warm-up frame mustn't say "live" (MNC-01).
8. **Words in the UI that copy must not use.** The discovery presets "Safe" and "Safe contract" (`web/components/discovery/filters.ts:119,125`), and the anti-MEV tooltip's "no sandwich attacks" / "no sandwich risk" (`web/components/token/trade/PresetBar.tsx:128`; `web/components/account/settings/TradingSettings.tsx:145,166`). Don't feature them in close-ups. The owner may want to rename them before launch.
9. **Keep out of frame:** the Signals "Hit 2x+" tile and the Rewards rebates/cashback (MNC-04, MNC-02), and the trade-panel footer fee (SC-12).
10. **Demo values aren't market data.** Native prices in the footer and every wallet's 7D/30D stats come from the demo run. Don't present them as real prices or long track records.
11. **No chain or competitor logos or colours.** The UI's chain marks are letters, but `ChainIcon` fills them with each chain's brand colour (Solana purple `#9945FF`, BNB yellow `#F0B90B`, Base blue `#0052FF`, Ethereum `#627EEA`) and uses the ether symbol `Ξ` for eth (`web/components/common/ChainIcon.tsx:6,17-26`; `shared/chains.ts:48,63,78,93`). So they are **not** safe in frame as built. **Before any capture** (check F-7), either recolour `ChainIcon` to neutral tokens (`panel-3` background, `fg` letter) with a plain `E` for eth, or override it in `marketing/tools/capture-mode.js` (a CSS rule on `span[role="img"][title="Solana"]` etc. with `!important` beats the inline style; rewrite the `Ξ` text node). If neither lands, crop every chain chip out of frame (top bar, status bar, search results, token header) and show the chain only as text. Don't add official chain logos, Robinhood green or feather, Binance yellow or the Coinbase blue mark to any asset. Don't show any other terminal's UI.
12. **Brand tokens match the built UI:** bg `#0A0C10`, panel `#11141A`, fg `#E6E9F0`, muted `#8C94A3`, accent flare amber `#FFB547`, up `#22D687`, down `#FF5468`, KOL `#C084FC`, whale `#38BDF8`, insider `#F472B6`, smart `#4ADE80`, dev `#FB923C`, sniper `#F87171`, bundler `#FACC15`, fresh `#2DD4BF` (`web/index.css:12-37`). Fonts: Inter and JetBrains Mono (`apps/web/tailwind.config.js:44-45`). Logo: `web/components/layout/Logo.tsx` and `marketing/brand/logo`.

---

## 8. Owner checks before launch

Each one must be true of the live build before any post claims it. If a check fails, drop the claim (or the chain) from every post, image and header. Don't soften it.

- [ ] **C-0 Launch build (warm-up teasers only):** the owner confirms that each chain the warm-up names (Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain) and self-custody are **in the launch build**, and that the K-2 answer is on its way. This gate covers the bio, the header, the pin (PIN-v2), D1-P3, D3-P2 6/ and D4-P4 from Day 1. It never covers "live", "trade now" or a link. A chain that won't be in the launch build comes out of the warm-up copy and the header now.
- [ ] **C-1 Chains ("live" copy):** real execution works on each chain the copy names: Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain. Tick each chain separately. Any chain that fails comes out of the copy and the header (SC-43, SC-45).
- [ ] **K-1 Custody ("live" copy):** self-custody is true. Users hold their keys, and the team never touches funds (SC-46).
- [ ] **K-2 Custody, automated trades:** limit orders, auto exits (TP/SL/trailing/dev-sell), copy trades and sniper tasks run server-side in the code. Confirm how they sign in the live build without the team holding keys. If they use delegated or session keys, the custody line must describe that accurately before it's posted.
- [ ] **F-1 Features:** every feature in a post is in the live build, running on real chain data for each chain it names: wallet tags, funding links, the audit, the risk prompt, auto exits, and the rest of section 2.
- [ ] **F-2 Sim-only inputs:** the live build has a real source (or drops the feature) for KOL identity, dev-team wallets, copycat and paid-boost flags, CTO, KOL calls and the bundler-sell signal (section 1). Labelling real people's wallets as KOLs needs a policy (MNC-15).
- [ ] **F-3 Risk prompt scope:** quick buy goes through the risk prompt, or copy says "on the trade panel" (SC-08, SC-08c).
- [ ] **F-4 Anti-MEV:** what anti-MEV does on each chain, and in-app copy that doesn't promise "no sandwich attacks" (SC-13o).
- [ ] **F-5 Command palette:** built, or dropped from POSITIONING item 6 (SC-44).
- [ ] **F-6 Sim wording:** the live build shows no "paper", "simulated", "faucet" or guest-balance wording. The risk prompt's subtitle is final.
- [ ] **F-7 Chain marks:** `ChainIcon` uses neutral colours and a plain letter for eth, in the live build or in capture mode, before any capture shows a chain chip (SC-36, section 7.11).
- [ ] **F-8 Tag tooltips:** the live build's `WALLET_TAG_META` descriptions state the section 2.2 rules, with "profitable" removed, before any post points people at the tooltips (SC-19t).
- [ ] **Fees:** the real fee is shown in-app before every trade. Quote a number in marketing only once it's final (SC-12).
- [ ] **L-1 Legal:** check the rules for marketing a crypto trading product where your users are, and add geo-blocking or the required risk warnings where needed. The UK, for example, has a specific regime for crypto promotions (it can require prescribed risk-warning wording and approval of the promotion by an authorised firm, and it restricts incentives such as referral bonuses). Get advice before launch-day posts, and before turning on referral rebates in any market.
- [ ] **S-1 Stats:** re-verify any real-market stat the day before it posts (section 4).
- [ ] **T-1 Token:** confirm there's no token plan to mention. If there is one, it comes back here as a claim before anyone posts about it (MNC-02).
- [ ] **D-1 Domain and handle:** the real domain and handle are set. No link appears anywhere until real trading works (MNC-01).

---

## 9. Pre-post checklist (every post, image and video)

- [ ] Every product claim maps to an SC row, and its status is GREEN, or OWNER with the owner check ticked.
- [ ] Every number is a KS stat (hedged, with a time window, the STAT reply ready) or a real owner trade with RESULTS. No demo-data number is presented as real.
- [ ] Nothing from section 5 appears, including in images, alt text and voice-over.
- [ ] Disclaimers: DEMO on product frames, AI on AI shots (plus X's label), RISK on launch-day trading posts and the end card, CUSTODY in the pinned reply and the launch thread, CHAINS on the end card and the website.
- [ ] No dates. No "live", "trade now" or link unless it's a gated launch-day post and real trading works.
- [ ] Chains named only as supported chains, with no logos or brand colours. No Robinhood Chain in UI frames.
- [ ] No competitor names, labels or UI. No real people, real tickers or cashtags. Demo tickers and handles blurred in close-ups.
- [ ] Frame check done for sim words, `ms` latency, demo venue names, the Fees value and the "Live" badge (section 7). Chain chips neutral (F-7) or out of frame.
- [ ] The post is ≤ 280 X-weighted characters (measured with `xlen.py`). Bios are ≤ 160.
- [ ] Organic only: no pods, no follow-for-follow, no mass-tags, no duplicate posts across accounts.
