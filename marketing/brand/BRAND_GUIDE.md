> **Being rewritten.** The positioning changed: Trenchscope is now marketed as a real multi-chain memecoin trading terminal (Solana, Base, Robinhood Chain) with self-custody, not a simulator. Every "sim", "paper trading" and "no real funds" line below is out of date. Don't post from this file until it is rewritten. For today, use `marketing/x/TODAY.md`.

# Trenchscope Brand Guide

| | |
|---|---|
| **Version** | 1.1, Tue 2026-10-20 (honesty and virality review against the claims ledger and the code; X account warm-up starts today; trailer + launch thread Tue 2026-10-27) |
| **Applies to** | The X account, every post, image, clip and thread, the AI "larp" trailer, profile art, and any future landing page |
| **Built from** | `apps/web/src/index.css` (tokens), `apps/web/tailwind.config.js` (type, motion), `apps/web/public/favicon.svg` and `components/layout/Logo.tsx` (logo), `README.md`, `docs/PRD.md` §1, §3, §6.21, §11.5, §12–14 |
| **Companion docs** | `marketing/research/CLAIMS_LEDGER.md` (what we may say: SC-xx safe claims, KS-xx stats, MNC-xx never-say, DIS-xx disclaimers) and `marketing/research/CT_PLAYBOOK.md` (how X ranks posts and how to warm the account up). If this guide and the claims ledger disagree on a claim, **the ledger wins**. |
| **Logo files** | `marketing/brand/logo/` (SVG masters) and `marketing/brand/logo/png/` (raster exports) |
| **Placeholders** | Handle `@trenchscope` (not yet confirmed by the owner) and `[LINK]` (no live URL exists) |

---

## 0. The brand on one page

- **What it is.** A web-only memecoin trading terminal with hotkeys, for four simulated chains (Solana, BNB Chain, Base, Ethereum). v1 runs on a deterministic market simulator. **Paper trading only**: no real funds, no wallet, no real chains.
- **The honest edge.** On CT, "larping" means pretending. Paper trading *is* larping, and we say so first. Trenchscope is where you larp the trenches: fake money, with rugs, snipers, bundlers and insiders that feel like the real thing (they are simulated, and "tuned to" real base rates, never "the same as").
- **The promise.** *See who's really buying.* Every token card shows who holds it (top 10, dev, insiders, snipers, bundlers), wallets carry labels (smart money, KOL, sniper, bundler, insider, dev, whale, fresh, bot), and every audit check shows its threshold and a hint (SC-09, SC-19). In v1, "who" means labelled **sim** wallets.
- **Primary tagline.** `larp the trenches.` **Promise line.** `see who's really buying.`
- **Voice.** A sharp trader with jokes. Lowercase, short, specific, self-deprecating. No hype, no hashtags, no exclamation marks, almost no emojis.
- **Look.** A navy-black terminal with one flare of amber. Market colours only carry meaning. Numbers are set in mono.
- **Never.** A token, airdrop or presale. Profit promises. Invented traction. Competitor names or labels. Real people. A PnL image without **SIMULATED** in the pixels.

---

## 1. Positioning

### 1.1 Positioning statement

> **For** memecoin traders and the trench-curious who are tired of getting rugged blind,
> **Trenchscope is** a web trading terminal that shows you **who is really buying**: snipers, bundlers, insiders, the dev and smart money, with every audit check explained and the fees in the quote before you click.
> **Unlike** learning the trenches with real money, Trenchscope v1 runs a whole simulated market with **paper trading**. You can larp the whole lifecycle (launch, curve, migration, rug) with fake money and real-feeling mechanics.
> **Because** the trenches are hard enough already. You should get to see the board before you jump in.

*Internal positioning only. The "unlike" is the alternative of risking real money, never another product. Don't paste this block into posts (MNC-10).*

### 1.2 One-liners by length

| Length | Line |
|---|---|
| 3 words | larp the trenches. |
| 1 line (PRD) | see who's really buying, before you do. |
| 1 sentence | a memecoin trading terminal on a simulated market: watch the snipers, bundlers and insiders, and trade it all with fake money. |
| Elevator (≈40 words) | Trenchscope is a memecoin trading terminal on a live simulated market across four chains, rugs, snipers, bundlers and insiders included. Every token shows its risk checks. You paper-trade it all with fake money and hotkeys. Nothing real is at stake. |

### 1.3 Proof points (each maps to a claims-ledger ID)

| Proof | Say it like | Ledger |
|---|---|---|
| Who holds it, on every card | "top 10, dev, insiders, snipers, bundlers. all on the card. all explained." | SC-09, SC-19, SC-21 |
| A whole fake trench, live | "a whole fake trench. rugs included." | SC-04, SC-05 (don't say "24/7": nothing is hosted yet, so there is no uptime to promise) |
| Nothing to connect | "fake money. real-feeling trenches." / "nothing to connect. nothing to lose." | SC-01, SC-37 |
| A respawn button | "got rugged? hit the faucet. try again." | SC-02, SC-03 |
| Cost before click | "see your price impact before you click, not after you cry." | SC-11, SC-12 (fees are simulated: always say so) |
| It asks if you're sure | "it lists the red flags, then makes you click 'buy anyway'. you will click 'buy anyway'." | SC-08 (the dialog is titled "High-risk token" and fires on honeypots and high-risk tokens) |
| Smart money is a hit rate | "smart money isn't a vibe here. it's a hit rate." | SC-20 (no accuracy numbers. If asked: "earned from entries that later 2x'd, against a base rate. in the sim.") |
| Hotkeys | "j/k through the trench. b to buy." | SC-30 ("hotkeys", never "keyboard-only" or "full keyboard map") |
| Unknown means unknown | "unknown shows as `--`, not `0%`. a zero you can't verify is a lie with good formatting." | Built: risk chips and holder rates render `--` for unknown values (`components/common/indicators.tsx:32`, `components/token/HolderStrip.tsx:76`). Not yet a ledger SC: add it before posting. Use `--` (what the app shows), not `—` |

### 1.4 What we are not

| Not | Why it matters |
|---|---|
| A token, coin or points-to-token scheme | PRD non-goal. Points are in-app only. Never cashtag the brand (`$TRENCH`, `$SCOPE`) |
| A live-money trading platform | v1 is a simulator. Real-chain adapters are a possibility, **not a promise** (MNC-13) |
| "AI-powered" | The product has no AI. Only the trailer and key art are AI-made (MNC-07) |
| A signals or alpha seller | Sim signals are about fictional tokens. No hit rates as performance (MNC-04) |
| "The first" or "the only" | Unverified, so don't claim it (MNC-09) |
| Anyone's affiliate, partner or rival | No affiliations. No competitor names in posts, ever (MNC-10, MNC-14) |

---

## 2. Brand story

**The trench.** Memecoin trading happens in the trenches: thousands of new coins a day on bonding-curve launchpads. On major launchpads, fewer than ~3 in 100 launches make it off the curve lately. Of the few that graduate, ~73% are down 60%+ within 20 minutes in one sample (KS-01, KS-02, KS-09: secondary data, hedged, re-verify before posting, never "97% are rugs"). Often, bundlers, snipers and insiders take supply in the first blocks, and late buyers become the exit liquidity.

**What's broken.** These are the trader's pains we design against. They are not claims about any named tool, so never aim them at one (MNC-10):

1. **Risk numbers you have to take on faith.** A percentage is only useful if you know what it counts and where the red line is. And "0%" is not the same as "we don't know".
2. **Costs that are easy to forget.** A platform fee, plus priority and tip fees. On a small ticket these add up before the chart has moved (show the arithmetic; never attribute it to a named product, KS-11).
3. **Practice costs real money.** Most people find out what a bundled launch looks like by buying one.

**Why a scope.** Trench periscopes let soldiers see over the parapet without putting their heads up. That is the product: see the whole board (who's buying, who's linked to the dev, who's already selling) without putting a real bag on the line. The logo is a scope reticle with a chart line climbing out of a dip. In other words, a way out of the trench.

**Why a larp.** Paper trading is larping. We say it first. Trenchscope is a fake market with the whole cast: bonding curves, migrations, rugs, slow rugs, snipers, bundlers and sandwich bots, all simulated. You get rugged for free, hit the faucet and go again. Being honest about the joke is what makes everything else believable.

**What we promise.** Every audit check shows its threshold and a hint. Fees and price impact show in the quote before you click (simulated). Unknown values show as `--`, not `0%`. Everything we post says sim. **What we don't promise.** Profits, outcomes, accuracy, real-chain trading, a token, or "never get rugged again". (The app itself has no header SIM badge, so the SIM bug on our footage does that job: §13.)

---

## 3. Audience

CT archetypes mapped to the PRD personas (PRD §3). Launch priority: **A1 and A5 first** (largest reach plus the clearest honest hook), then A2 and A3. A4 and A6 are low priority.

| # | CT archetype | PRD persona | Who they are on CT | What they want | Our hook | Content that lands | Careful |
|---|---|---|---|---|---|---|---|
| A1 | **The trench rat** | P-1 "Trench sniper" (Kai) | Lives on launch boards. 50–200 trades a day. Posts "aped" screenshots | Speed, hotkeys, the risk chips on the card, decisions in under 5 s | "j/k through the trench. b to buy." / "scope it before you ape it." | Keyboard clips, spot-the-rug puzzles, POV memes | Makes no speed claims (MNC-08). They will test every claim |
| A2 | **The wallet watcher** | P-2 "Smart-money follower" (Maya) | Follows 30–200 wallets, lives in alerts, copy-trades | Wallets worth following, alerts when they buy, copying without becoming exit liquidity | "smart money isn't a vibe. it's a hit rate." | Wallet report cards, Monitor clips, "what exit liquidity feels like" (paper) | Never imply copy-trading profits (SC-15, MNC-04) |
| A3 | **The thread sleuth** | P-3 "Researcher" (Dev) | Writes "dev funded 14 wallets" threads, rarely trades fast | Holder tables, insider and bundler links, dev history | "bought in the launch block? bundler. funded by the dev? insider." | Rug autopsies, glossary threads, mechanism quote-posts | Describe how the **sim** tags wallets, not a real-chain detector (SC-21) |
| A4 | **The caller** | P-4 "Caller/KOL" (Rin) | Has followers, posts calls | A verifiable track record | Low priority for launch. Verified share cards are P1 and not built | Nothing targeted. Never tag callers to farm reach | No paid KOL deals: X's Paid Partnerships policy lists crypto as ineligible (CT_PLAYBOOK §1.1, §3.9) |
| A5 | **The trench tourist** | P-5 "Newcomer" (Sam) | Curious, has watched friends get rugged, scared of losing money | To understand curves, migrations and rugs without risk | "get rugged for free." / "the trenches, with a respawn button." | Explainers, "trench dictionary", POV memes, guess-the-fate | No outcome promises ("learn to trade profitably" is MNC-19). No "risk-free" promo tone (MNC-18) |
| A6 | **The builder** | P-6 "Builder" (Ana) | Dev-Twitter adjacent, likes build-in-public | A deterministic sim, a stable API (P2) | "shipped:" changelog posts | Build-in-public screenshots | Don't promise a public API (not built) |
| A7 | **The spectator / meme lord** (not a PRD persona) | — | Doesn't trade much, reposts what's funny | Good jokes about the trenches | The self-aware larp, the trailer | Trailer, loss-porn diaries (watermarked) | Amplifiers, not users. Never bait them with giveaways |

---

## 4. Voice

### 4.1 Pillars

**Pillar 1: Honest larp.** We are in on the joke first. Fake money is the feature, never the fine print.

| Do | Don't |
|---|---|
| "paper trading is just larping with extra steps. we built the extra steps." | "Start earning today, risk-free!" |
| "got rugged? hit the faucet. try again." | "Never get rugged again." |
| "fake money. real-feeling trenches." | "Real trading experience. Real results." |

**Pillar 2: Receipts, not vibes.** Be specific and mechanism-first. Name the wallet behaviour, the block, the threshold. If we can't show it, we don't say it.

| Do | Don't |
|---|---|
| "funded by the dev wallet 6 minutes before launch. bought 2 blocks in. that's not a believer. that's an insider." (in-sim example) | "our AI detects every rug" |
| "unknown shows as `--`, not `0%`. a zero you can't verify is a lie with good formatting." | "the most accurate data in crypto" |
| "~97 of 100 launches on major launchpads never leave the curve lately. most aren't rugs. they just die quietly." | "97% of memecoins are scams" |

**Pillar 3: Trench humour.** Gallows humour from someone who has been rugged too. We laugh at the trenches and at ourselves, never at a named person.

| Do | Don't |
|---|---|
| "my paper bag got bundled. the faucet refilled it. growth." | "LFG 100x incoming #memecoin #solana" with a rocket and a fire emoji |
| "dev launched 14 coins, migrated 0. cool cool cool." (in-sim) | Dunking on a real dev, KOL or project by name |
| "all of the rugs. none of the rent money." | "ngmi if you still get rugged lol" |

**Pillar 4: The calm one in the group chat.** Plain language for newcomers, with depth for the sweats. Warm, never condescending. We explain and never advise.

| Do | Don't |
|---|---|
| "a bonding curve is a vending machine that raises the price every time someone buys. when it's full, the coin moves to a dex pool. that's 'graduating'." | "if you don't know what a bonding curve is, you're exit liquidity" |
| "you can even get sandwiched. with fake money. character building." | "buy when the dev buys, it graduates 8% of the time" (that is advice, KS-07) |
| "nfa. it's literally fake money." | "this one's going to send, trust" |

### 4.2 Style mechanics

- **Case.** Posts and replies are lowercase. Proper names may stay lowercase too (trenchscope, solana) in posts. Formal surfaces (end cards, the logo, any docs) use **Trenchscope**: one word, capital T. Never "TrenchScope", "Trench Scope" or "TS".
- **Length.** First line is the hook and works on its own. 1–3 short lines. Threads are 4–6 posts, and the first post stands alone.
- **Character limit.** Every post fits **280** as X counts it, or is marked **long-form (Premium)** in the draft. X weights characters: `·`, `—`, `×` and plain ASCII count 1; `→`, `≥`, `−` (true minus), `…` and every emoji count 2; any URL counts 23. Count with these rules, not a word processor. A disclaimer line (DIS-02, 32 chars) counts too, so leave room for it.
- **Numbers.** Use digits ("14 coins", "~73%"). Real-world stats always carry "~", a time window and "on major launchpads". In-sim numbers always say "in the sim".
- **Hashtags.** None. **Emojis.** Rare: at most one, and only when it is the joke. **Cashtags.** Never for sim tokens, never for the brand (MNC-16).
- **Mentions.** Don't tag strangers, KOLs or projects to get noticed.
- **Links.** None during warm-up. On launch day `[LINK]` goes in the first self-reply.
- **Punctuation.** Full stops are fine, and so is a dry "." at the end. **No exclamation marks.** If a line needs one to land, the line is wrong.
- **Replies.** Written by a person, one at a time. Never automated, scheduled in bulk or reused (X clusters duplicate replies as spam: CT_PLAYBOOK §3.4, §4.3). No "gm", "this", "🔥" replies, no product drop in most replies.

### 4.3 Words we use and words we avoid

| Use | Avoid (and why) |
|---|---|
| paper, sim, simulated, fake money, larp | risk-free (MNC-18), real trading, live trading, mainnet |
| practice, reps, see, scope, read the board | learn to profit, beat the trenches, guaranteed (MNC-03, MNC-19) |
| flags, labels, tags, shows | detects, predicts, accurate, AI-powered (MNC-06, MNC-07) |
| real-feeling, realistic-ish, tuned to | full-fidelity, matches the real market, "same as mainnet" (SIM-03 says "tuned to") |
| every audit check explained | "every number explained" (only the audit checks carry thresholds and hints) |
| near grad, migrated, graduated | "almost bonded", "cooking", "P1/P2/P3" and other competitors' labels (MNC-11) |
| hotkeys | "keyboard-only", "full keyboard map", "command palette" (not built, MNC-12) |
| points (in-app) | airdrop, allocation, farm, TGE, wen token (MNC-02) |
| `[LINK]`, launch day only, in the first self-reply | "live now", "sign up", "join the beta", "24/7" (MNC-21) |

---

## 5. CT vocabulary, used correctly

Use the words the trenches use, and use them right. Definitions follow the in-app tooltips (`components/common/WalletTags.tsx`) so our posts and our product say the same thing.

| Term | What it means | How we use it | Careful |
|---|---|---|---|
| **the trenches** | The launchpad meme-coin market: new coins on bonding curves, fast trading, high mortality | Our home turf. "larp the trenches." | — |
| **launchpad** | A site where anyone mints a coin on a bonding curve in seconds | "8 made-up launchpads. 1 made-up dex. 0 real money." (sim) | Never name a real launchpad in posts. Don't name the sim launchpads either: several echo real brands |
| **bonding curve / the curve** | Price rises automatically with each buy. Once the curve fills, the coin graduates | "a vending machine that raises the price every buy." | Curve-fill stats (KS-08) are secondary and must be re-verified before posting |
| **bonded / graduated / migration** | The curve filled and liquidity moved ("migrated") to an AMM pool. In the sim the DEX is the fictional TrenchSwap and LP is burned | Our lifecycle labels: **new · near grad · migrated** | Never say "almost bonded" (a competitor's label) |
| **CA** | Contract address. "drop the ca" | "every sim coin has a ca. it's fake too." | Never post a real CA. Sim CAs are random, only resolve inside the sim, and never go in post copy (one could collide with a real address and read as a shill). Never imply you can paste a real CA and trade it |
| **dev** | The token creator's wallet (or the dev team's) | "dev holds 4%." | — |
| **dev sold / dev dumped** | The creator sold some or all of their supply. Often the start of a rug | One of our 13 signals. "13 signal types. the one you learn to fear is 'dev sell'." | — |
| **rug / rugged / rug pull** | Insiders pull liquidity or dump supply, and the price goes to ~zero | "get rugged for free." | **Not graduating ≠ a rug.** Most non-graduates are duds that die quietly (ledger §4.4) |
| **slow rug** | The dev or insiders bleed supply out over hours | "slow rugs: the sim has those too." | — |
| **sniper** | A wallet that bought within the first blocks after launch | "sniped in block 1. paper-handed by block 40." | In the sim: a buy within 3 blocks after the creation block. Block 0 buyers are tagged bundlers, not snipers |
| **bundler / bundle** | Wallets that buy in the same block as token creation, likely linked to the dev, to grab supply cheaply and look like organic demand | "see the bundlers before they see you." | In the sim: any non-creator wallet that buys in the creation block. Describe it as how the sim tags wallets, not a real-chain detector |
| **insider** | A wallet funded by or linked to the dev that accumulated early | "funded by the dev? insider." | In the sim: funded by the dev, the dev team or the dev's funder, or one of 3+ early buyers (first 10 min) funded by the same private wallet (`analytics/tokens/track.ts`). Sim only |
| **fresh wallet** | A newly created wallet with little history. Often a burner | "40% fresh wallets. totally organic." | — |
| **top 10** | Share of supply held by the ten largest holders. High means concentrated and fragile | "top 10 holds 61%. that's not a community, that's a group chat." | — |
| **smart money** | Wallets with a statistically strong record of early, profitable entries | "smart money isn't a vibe here. it's a hit rate." | In the sim it's earned from behaviour. No accuracy numbers, no real-chain claims |
| **KOL / caller** | Key opinion leader: an influencer whose buys move price. A caller posts "calls" | "kol buy" is a sim signal | Sim KOLs are fictional. Never name, tag or depict real ones |
| **whale** | A wallet with a large balance or position | "a leaderboard of fake whales. somehow still humbling." | — |
| **bot / MEV / sandwich** | Automated traders. A sandwich bot front-runs and back-runs your swap | "you can even get sandwiched. with fake money." | — |
| **CTO** | Community takeover: the dev abandons the coin and holders take over its socials | "community takeover" is a sim signal | — |
| **ape / aped** | Buy fast, usually without research | "scope it before you ape it." | — |
| **jeet** | Someone who sells at the first green candle | Know it, don't lead with it. Prefer "paper hands" | Some read its origin as a slur aimed at South Asian traders. Never aim it at people. Self-reference only, if ever |
| **paper hands / diamond hands** | Sells too early / holds through anything | "paper hands welcome." (paper trading pun) | — |
| **bags / bagholder** | Your position / stuck holding a coin that dumped | "my paper bag got bundled." | — |
| **exit liquidity** | The late buyers that early holders sell into | "find out what 'exit liquidity' feels like, with fake money." | — |
| **larp** | Live-action role play. On CT: pretending (fake rich, fake insider) | Our honest edge: paper trading is larping, and we say it first | Never use "larp" to accuse a named person |
| **pnl / roi** | Profit and loss / return | "pnl that counts your fees. painful. honest." | Every PnL image says SIMULATED · PAPER TRADE |
| **mc / mcap, ath** | Market cap; all-time high | "limit order on market cap." | — |
| **send it / runner / moon** | A coin that keeps going up | Only in jokes about the sim | Never as a prediction |
| **nfa / dyor** | Not financial advice / do your own research | "nfa. it's literally fake money." | Using "nfa" doesn't make advice okay. Still give no advice |
| **gm** | Good morning | Only if it says something else too | Bare "gm" replies are spam signals on X |

---

## 6. Taglines, ranked

Ranked by honesty, then ownability, then shareability. Use lowercase in posts. In formal lockups and end cards, sentence case is allowed ("Larp the trenches.").

| Rank | Tagline | Job | Notes |
|---|---|---|---|
| 1 | **larp the trenches.** | Primary brand line: bio, banner, end card | Three words, honest, ownable. Turns the insult into the product |
| 2 | **see who's really buying.** | Promise line: launch thread, product clips | From the PRD one-liner. Long form: "see who's really buying, before you do." In v1, "who" means labelled sim wallets |
| 3 | **scope it before you ape it.** | Action line: CTAs, keyboard clips | Puts the brand name to work |
| 4 | **get rugged for free.** | Newcomer hook: explainers, pinned post | The honest joke in four words |
| 5 | **fake money. real-feeling trenches.** | Credibility line: clips that show curves, migrations, sandwiches | Ledger wording (SC-01). "Real-feeling", never "real", "accurate" or "results" |
| 6 | **the trenches, with a respawn button.** | Faucet and onboarding posts | Gamer-literate. The faucet really refills (SC-03) |
| 7 | **see the bundlers before they see you.** | Audit and risk-chip posts | Specific tag, built-in tension |
| 8 | **paper hands welcome.** | Merch-tier pun, replies, loss-porn diaries | Pun on paper trading plus paper hands |
| 9 | **all of the rugs. none of the rent money.** | Humour posts, trailer tag | Funny and true. Keep the "rent money" framing, never "zero risk" |
| 10 | **even the fees are fake. still shown before you click.** | Fee and quote clips, build-in-public | SC-11, SC-12. The 0.8% is a simulated fee: never compare it to anyone's real fee |

**Retired before use:** "the only place getting rugged is free" (an "only" claim, MNC-09), "never get rugged again" (MNC-03), "risk-free trenches" (MNC-18), "trade smarter" (outcome promise, MNC-19), "every number explained" (overclaim: only the audit checks carry definitions), "a fake trench running 24/7" (nothing is hosted yet), "fake money. real mechanics." ("real" invites a fidelity claim we can't back; use "real-feeling").

---

## 7. Name and logo

### 7.1 Name

- **Trenchscope**: one word, capital T, rest lowercase. In posts, all-lowercase "trenchscope" is fine.
- The wordmark splits the name into **Trench** (foreground colour) and **scope** (flare amber). That split is part of the logo. Plain text never needs it.
- Never abbreviate to "TS", never cashtag it, never translate it.

### 7.2 The mark

A **scope reticle**: an amber ring with **four crosshair ticks** at 12, 3, 6 and 9 o'clock, framing a light **rising chart line** (rise, dip, breakout: the line climbing out of the trench). On a tile it sits inside a dark rounded square.

Construction on a 32 × 32 grid (from `favicon.svg` / `Logo.tsx`):

| Part | Geometry | Colour (dark / light) |
|---|---|---|
| Tile (optional) | 32 × 32, corner radius 8 (25% of side) | `#0D1016` tile ink in exported files (`#1F242D` panel-3 in the app header) / `#FFFFFF` |
| Ring | Centre (16, 16), r = 9, stroke 2.4 | `#FFB547` / `#D97D00` |
| Ticks | Four strokes of 4.5 units (3.5→8 and 24→28.5 on each axis), stroke 2.4, round caps. They pierce the ring and stop at its inner edge | `#FFB547` / `#D97D00` |
| Chart line | Polyline (10.6, 18.6) → (13.6, 15.5) → (16.2, 17.9) → (21.4, 12.6), stroke 2, round caps and joins | `#E6E9F0` / `#14171F` |
| Wordmark | "Trench" + "scope", Inter SemiBold (600), tracking −0.025em, outlined in files | Trench `#E6E9F0` + scope `#FFB547` / Trench `#14171F` + scope `#D97D00` |

Horizontal lockup proportions (mark height = H): gap between mark and wordmark ≈ 0.18 H, wordmark cap height ≈ 0.56 H, vertically centred. Stacked lockup: the wordmark sits ≈ 0.17 H below the mark, centred.

### 7.3 Files

| File (in `marketing/brand/logo/`) | Use |
|---|---|
| `mark-tile-dark.svg` / `png/mark-tile-dark.png` (1024) | **X avatar** (export 400 × 400), app icon, any busy background. The ticks reach 78% of the tile's half-width, so the mark survives X's circle crop |
| `mark-tile-light.svg` | Avatar or app icon on light surfaces |
| `mark-dark.svg` / `mark-light.svg` | Mark without the tile, on brand dark or light backgrounds |
| `mark-mono-white.svg` / `mark-mono-black.svg` / `mark-mono-amber.svg` | One-colour uses: video overlays, stamps, watermarks, engraving |
| `lockup-horizontal-dark.svg` / `-light.svg` | Default lockup on dark or light (transparent background) |
| `lockup-horizontal-dark-bg.svg` / `-light-bg.svg` | Lockup with background and built-in clear space (padding ≈ 0.31 H). Use for press, decks and link previews |
| `lockup-stacked-dark.svg` / `-light.svg` | Square-ish placements: end cards, the 1:1 post sign-off |
| `wordmark-dark.svg` / `-light.svg` | Wordmark only, when the mark is already on screen |
| `png/icon-16/32/48/180/192/512.png` | Favicons and touch icons |

### 7.4 Clear space and minimum size

- **Clear space:** at least **¼ of the mark's height** on every side (the tile's corner radius). For lockups, measure from the mark's height. Nothing (text, UI, disclaimers, crop edge) enters that zone.
- **Minimum size (digital):** tile mark 16 px (favicon only), mark without tile 20 px, horizontal lockup 120 px wide, stacked lockup 72 px wide. **On social, use at least 48 px** for the mark and 200 px for the horizontal lockup on a 1080-wide canvas.
- **Minimum size (print):** mark 5 mm, horizontal lockup 25 mm wide.
- Don't redraw the mark at small sizes. The 16 px favicon already keeps the chart line.

### 7.5 Backgrounds

| Background | Use |
|---|---|
| Brand dark (`#0A0C10`, `#11141A`, `#171B22`) | **Default.** Full-colour dark version |
| Brand light (`#F4F5F8`, `#FFFFFF`) | Light version (deep amber `#D97D00` ring, ink `#14171F` line) |
| AI key art or video | Place on the darkest, calmest area. Use the **tile** version or **mono white**. The local background must be dark enough that the ring keeps ≥ 3:1 contrast |
| Amber fields | Mono black (`#0A0C10`) only. Never amber on amber |
| Mid-tone, busy or photographic backgrounds without a dark area | Use the tile, or don't place the logo there |

### 7.6 Don'ts

1. Don't recolour the ring (no green, red, purple or gradient rings), and don't swap the ring and line colours.
2. Don't rotate the reticle or move the ticks off 12, 3, 6 and 9.
3. Don't put a coin, token, ticker or chain logo inside the reticle. That reads as "our token".
4. Don't re-typeset the wordmark, change its colour split, or set it in another font.
5. Don't stretch, skew, outline, bevel, emboss or drop-shadow the logo. Glows and flares belong to the art behind the logo, never to the logo itself.
6. Don't redraw the chart line as a rocket, a "100x" arrow or a moonshot.
7. Don't lock the logo up with any other brand's mark, or imitate a competitor's colours or mascot.
8. Don't place it on mid-tone amber, yellow or busy art without the tile.
9. Don't animate it in a way that breaks it apart permanently. The signature reveal in §12 ends on the intact mark.

---

## 8. Colour

All values are converted from the `r g b` triplets in `apps/web/src/index.css`. Dark is the default; the light theme is a full peer.

### 8.1 Core (surfaces and text)

| Token | Dark HEX | Light HEX | Role |
|---|---|---|---|
| `bg` | **#0A0C10** | #F4F5F8 | Page background, the "night" of every canvas |
| `panel` | **#11141A** | #FFFFFF | Cards, panels, caption plates |
| `panel-2` | #171B22 | #F7F8FA | Inputs, nested surfaces |
| `panel-3` | #1F242D | #ECEEF3 | Raised chips, progress-bar tracks, the in-app logo tile |
| `line` | #222731 | #E2E5EC | Hairlines, the terminal grid |
| `line-strong` | #303744 | #CDD2DC | Emphasised dividers, scrollbars |
| `fg` | **#E6E9F0** | #14171F | Primary text, the logo's chart line |
| `muted` | **#8C94A3** | #606878 | Secondary text, disclaimers |
| `faint` | #5C6372 | #8C93A1 | Table heads, tertiary labels, unknown values (`—`) |
| `accent` (flare amber) | **#FFB547** | **#D97D00** | Brand, focus, CTAs, the scope ring, the curve fill |
| `accent-fg` | #140E02 | #140E02 | Text on amber |
| tile ink (assets only) | #0D1016 | — | Logo tile in exported favicons and avatars |

### 8.2 Market (meaning only)

| Token | Dark HEX | Light HEX | Meaning |
|---|---|---|---|
| `up` | **#22D687** | #009458 | Price up, buy, healthy chip, curve complete |
| `up-fg` | #03160D | #FFFFFF | Text on up |
| `down` | **#FF5468** | #DE2C46 | Price down, sell, risky chip, rug |
| `down-fg` | #FFFFFF | #FFFFFF | Text on down |
| `warn` | #FFC107 | #B47D00 | Warning states (dev sold part, top-10 holder tag) |
| `info` | #5CA4FF | #1E6EE6 | Neutral information, "following", dev sold all |

### 8.3 Wallet tags (chips and labels only)

| Tag | Dark HEX | Light HEX |
|---|---|---|
| `smart` (smart money) | #4ADE80 | #16A34A |
| `kol` | **#C084FC** | #9333EA |
| `dev` | #FB923C | #EA580C |
| `sniper` | #F87171 | #DC2626 |
| `insider` | **#F472B6** | #DB2777 |
| `bundler` | #FACC15 | #CA8A04 |
| `whale` | **#38BDF8** | #0284C7 |
| `fresh` | #2DD4BF | #0D9488 |
| `bot` | #94A3B8 | #64748B |

### 8.4 Usage ratios (per frame or post image)

| Share | Colours | Rule |
|---|---|---|
| **~70%** | `bg`, `panel`, `panel-2/3`, `line` | The canvas is night. Steps between panels do the separating, not borders |
| **~15%** | `fg`, `muted`, `faint` | Text and UI |
| **~8–10%** | Flare amber | **One amber focal point per frame**: the reticle, the CTA, the hero number's rim. Never an amber background field above ~10% |
| **~4%** | `up` / `down` | Only where something actually went up or down |
| **~1–2%** | Wallet-tag colours | Only on chips and labels, always with a text label |

### 8.5 Colour rules

- **Green and red always mean up and down.** Never use them as decoration or as the brand colour. The brand colour is amber.
- **Amber is not a warning.** `warn` (#FFC107), `bundler` (#FACC15) and `dev` (#FB923C) sit close to amber. In marketing art, keep them inside labelled chips so they never compete with the brand flare.
- **Never use colour alone.** Every chip has a text label (PRD §11.7). "SNIPER 12%", never just a red dot.
- **Gradients:** allowed are a vertical `bg → panel`, an amber **radial flare** (#FFB547 at ≤35% alpha fading to transparent), and a faint cyan (`whale`) depth haze at ≤15%. Banned are rainbow, purple-to-green "crypto" gradients, gold-coin gradients and neon overload.
- **Contrast (WCAG):** on `bg`, fg is 16.1:1, muted 6.4:1, amber 11.1:1, up 10.3:1 and down 6.3:1. `faint` is only 3.3:1, so use it for labels ≥ 14 px or decoration only. White on `down` is 3.1:1, so bold and large only. **Light theme:** amber #D97D00 on white is 3.05:1, so use it for graphics and text ≥ 24 px only. Text on an amber button is always `#140E02`.

---

## 9. Typography

| Family | Use | Weights | Features |
|---|---|---|---|
| **Inter** | Headlines, UI, captions, body | 400 / 500 / 600. 700 for hero headlines only | `cv11` (single-storey a), `ss01` (open digits), `tnum`, as set on `body` in `index.css` |
| **JetBrains Mono** | **All numbers that matter** (prices, %, PnL, market cap, multiples), addresses, chips, stamps, hotkeys, disclaimers | 500 / 600 | Tabular by default |

Both are free (SIL OFL) and on Google Fonts. The fallback stack is `ui-sans-serif, system-ui` / `ui-monospace, SFMono-Regular`.

**In-app scale (for reference).** 10 / 11 / 12 / 13 (base) / 14 px, and the PRD scale 11–32 px. Radius 6 px for controls and 10 px for cards, on a 4 px grid.

### 9.1 Social sizes

| Canvas | Headline (Inter 600–700) | Sub (Inter 500) | Hero number (Mono 600) | Chips / labels (Mono 600, UPPERCASE, +4% tracking) | Disclaimer (Mono 500, muted) |
|---|---|---|---|---|---|
| X post 1200 × 675 (16:9) | 72–88 px, line height 1.05, tracking −2% | 32–40 px | 96–160 px | 22–26 px | 20–22 px |
| Square 1080 × 1080 | 80–96 px | 36–44 px | 120–200 px | 24–28 px | 22–24 px |
| Vertical 1080 × 1920 | 96–120 px | 44–52 px | 160–240 px | 28–32 px | 26–28 px |
| X header 1500 × 500 | 64–80 px | 28–32 px | — | 20–24 px | 18–20 px |
| Video captions 1920 × 1080 | Inter 600, **56–64 px**, 3–6 words a line, 2 lines max, bottom third, 8% safe margin, on a `bg` plate at 60–70% | — | — | — | — |
| Video captions 1080 × 1920 | Inter 600, **64–76 px**, keep above the bottom 20% (platform UI) | — | — | — | — |

**Rules.**
- Nothing under **20 px on a 1080-wide canvas** (it becomes unreadable on a phone).
- Headlines are lowercase or sentence case. UPPERCASE is for mono chips, stamps and the SIM bug only.
- Numbers: mono and tabular. In images, always show the sign (`+312%`, `−84%`, with a true minus U+2212; in post text use a plain hyphen, because X counts `−` as 2 characters). Multiples use × (`3.2×`). Compact money (`$1.2M`). Tiny prices use subscript zeros (`0.0₅123`, as the app formats them). **Unknown is `--`, never `0%`** (the app's own glyph, so a screenshot and a mock always agree).
- One typeface pairing per asset. No display fonts, no script, no pixel fonts, no meme Impact text.

---

## 10. Graphic motifs

| Motif | What it is | How to use it | Don't |
|---|---|---|---|
| **Scope reticle** | The ring plus four ticks from the mark, at any scale | Frame the subject of a post (a wallet, a chip, a candle). Transition wipes. Huge and cropped in key art (stroke ≈ 2.4/32 of the diameter) | Gun sights, bullet holes or anything aimed at a person |
| **Crosshair ticks** | The four ticks used alone as corner brackets ("target lock") | Mark the region of a screenshot that matters. Lock-on animation (§12) | Rotating them, or more than four |
| **Curve progress** | The bonding-curve bar: a `panel-3` track with an amber fill that **turns green at 100%**. On cards, an amber progress ring around the token avatar that also turns green when full, and a % label that turns amber at ≥ 80% | Countdowns, teasers ("trailer: curve 80%"), section dividers, a loading motif | Implying a token sale or "presale progress". Avoid "bonded" next to "almost" (MNC-11) |
| **Risk chips** | Pills with 6 px radius, Mono, an optional 10 px icon, label then value. **Healthy:** `up` text on up/10%. **Risky:** `down` text on down/15%. **Unknown:** `faint` text on `panel-3` showing `--`. **Tags:** tag colour on tag/12% | Hero elements in posts ("TOP 10 61%", "BUNDLER 12%", "DEV SOLD"). Rows of chips as texture | Chips without labels. Inventing chip types the app doesn't have |
| **Terminal grid** | A 4 px base grid, 1 px `line` hairlines, and panels separated by tone steps (bg → panel → panel-2) | Layout skeleton for every static asset. Subtle 32/64 px grid backgrounds at 4–6% | Heavy borders, skeuomorphic bezels |
| **Scanlines** | Horizontal 1–2 px lines at 3–6% opacity, with light grain and a slight vignette (CRT war-room feel) | Key art, trailer, teaser frames, headers | Over small text or chips, or above 8% opacity (it hurts legibility and compression) |
| **The rising line** | The mark's rise-dip-breakout polyline, used as a stroke graphic | Sign-offs, dividers, a "way out of the trench" beat | Turning it into a rocket or a parabolic "100x" curve |
| **SIM stamp** | `SIM · PAPER TRADING` in Mono 600 uppercase, amber 1.5 px outline, 6 px radius | Corner bug on all app footage (DIS-05), stamp on mock cards | Hiding it, shrinking it below the size in §13, or making it look optional |
| **Radar sweep** | A conic amber sweep over concentric rings, with blips coloured by wallet tag (KOL purple, whale cyan, insider pink) | Teasers, the trailer, "smart money" content | Blips that imply real wallets or real addresses |
| **`--` not `0%`** | The unknown glyph as a brand symbol of honesty. It is what the risk chips render (`components/common/indicators.tsx:32`) | Build-in-public posts, merch-tier jokes | Swapping in `—`: the app shows `--`, and CT will check |

---

## 11. AI art direction (key art, teasers, trailer frames)

### 11.1 The look

- **Cinematic night.** 80% of the frame in shadow: navy-black (#0A0C10 to #1F242D), with low-key lighting and volumetric haze.
- **One flare.** A single **flare-amber rim or key light** (#FFB547, like warm sodium or tungsten) carves out the subject. Horizontal anamorphic amber lens flares. A faint cool cyan fill (#38BDF8 at low intensity) for depth only.
- **Film language.** 35 mm or anamorphic look, shallow depth of field, fine grain, slow push-ins, high contrast but deep blacks without crushed highlights.
- **Metaphors.** The **scope or periscope** (seeing over the trench wall), **radar** (who's moving), the **war room** (a command bunker of curved monitors and a glowing radar table), the **trench** itself (rendered as earthworks whose walls are layered green and red candlesticks, with amber signal flares over no-man's-land), the **curve** (a glowing amber ramp or bridge over a chasm, with a gate at the top), and the **rug** (a literal ornate carpet yanked from under a table, as a comic beat).
- **Tone.** Self-aware blockbuster. Obviously dramatized, a little absurd. It is a trailer for a trading terminal. The joke is how seriously it takes itself.

### 11.2 Hard rules

1. **NO text** in generated images: no letters, numbers, UI or signage. Type is added in post with brand fonts. Zoom in and reject any frame with hallucinated glyphs.
2. **NO real people** and no look-alikes. Humans appear only as **anonymous silhouettes**: backlit, from behind, hooded or helmeted, faces in shadow. No celebrities, no KOL likenesses, no identifiable faces. No AI-influencer or presenter characters.
3. **NO coins with real logos.** No Bitcoin, Ethereum, Solana or BNB symbols, no meme-coin mascots (no frogs, shiba dogs or other known characters), no exchange or brand marks. If a coin is needed, it's a **blank, unbranded matte disc** or an abstract light token.
4. **NO real brands, UIs, flags, military insignia or real conflict imagery.** War-room and trench are stylized metaphors. No weapons pointed at people, no casualties, no gore, nothing that reads as footage of a real war.
5. **NO money rain, lambos, yachts, rockets-to-the-moon, piles of cash** (profit imagery breaks the honesty rules).
6. **Label it.** Captions say "ai-generated" (DIS-07). The trailer end card carries DIS-06. Turn on X's AI or altered-media label if it is offered.
7. The **product has no AI**. AI art never implies an "AI-powered" product (MNC-07).

### 11.3 Prompt template

```
[SUBJECT], [SETTING]. cinematic night scene, deep navy-black shadows (#0A0C10),
single flare-amber rim light (#FFB547) carving the subject, faint cool cyan fill,
volumetric haze, horizontal anamorphic amber lens flare, 35mm film grain,
shallow depth of field, low-key lighting, high contrast, moody, epic scale,
dramatized movie-trailer still, [CAMERA: e.g. slow low-angle push-in, 40mm anamorphic],
[ASPECT]
```

**Negative prompt (always):**
`text, letters, words, numbers, typography, watermark, signature, logo, brand, UI, screen text, real person, celebrity, recognizable face, face in focus, crypto logo, bitcoin symbol, ethereum symbol, coin with emblem, mascot, frog, dog, flag, military insignia, weapon pointed at people, gore, blood, money, cash, lamborghini, rocket, cartoon, low quality, oversaturated, neon rainbow`

### 11.4 Key-art shot list

| # | Name | Subject + setting (drop into the template) | Best aspect |
|---|---|---|---|
| K1 | **The Periscope** | A weathered brass-and-glass trench periscope rising above an earthen parapet at night. Its lens reflects a field of distant amber signal flares | 16:9, 3:1 crop for the X header |
| K2 | **The War Room** | An underground command bunker: a circular radar table glowing amber in the centre, curved dark monitors around the walls, anonymous hooded silhouettes leaning over the table, rain dripping through concrete | 16:9 |
| K3 | **The Trench** | A long trench at blue hour whose walls are layered stacks of glowing green and red candlestick bars like sediment. A lone silhouette in the trench looks up at an amber flare arcing overhead | 16:9 and 9:16 |
| K4 | **The Sweep** | An enormous radar dish or scope screen in darkness, an amber sweep beam crossing it, small coloured blips (purple, cyan, pink) scattering as the beam passes | 1:1 and 16:9 |
| K5 | **The Curve** | A glowing amber ramp-bridge spanning a dark chasm, rising in a smooth curve to a gate of light at the top. Tiny silhouettes climb it; some fall off into the dark | 16:9 |
| K6 | **The Rug** | A long banquet table of blank unbranded metal discs on an ornate carpet in a dark hall, frozen mid-moment as the carpet is yanked away and the discs fly into the air, lit by one amber spotlight. Comic, slow-motion | 16:9 |
| K7 | **The Respawn** | A dark bunker in total blackness. One amber lamp flickers on above a single empty chair facing a dark monitor (the faucet, the retry) | 9:16 and 1:1 |
| K8 | **The Lock** | Extreme macro of a precision optical reticle (lens glass, etched ring, four tick marks) with an amber flare blooming across the glass. Abstract, no gun | 1:1 (avatar backdrop, end card) |

### 11.5 Composition and post-production

- **Safe zones.** X header 1500 × 500: keep the subject in the centre 1100 × 360 and the bottom-left ~400 × 200 dark (the avatar overlaps it). 9:16 frames: subject in the centre third. Frame 0 of every video is designed as its thumbnail.
- **Leave negative space** (dark, calm) where the logo, captions or disclaimer will sit.
- **Grade to the palette:** blacks to #0A0C10, highlights warm toward amber, greens and reds only where they carry meaning (candles).
- **Add in post, never generate:** logo, type, chips, scanlines, SIM stamp, disclaimers.
- **Reject** a frame for any hallucinated glyph, a recognizable face, a real logo, a malformed hand in the foreground, or anything that looks like real combat footage.
- **Consistency.** Lock a seed or reference image per scene and animate approved stills with image-to-video (e.g. Higgsfield). Don't generate trailer shots from scratch, or they won't match.

---

## 12. Motion principles

1. **Motion means market.** Green flash = up, red flash = down, amber = focus or brand. Nothing moves just to look busy.
2. **Fast in, calm out.** UI-style motion uses the app's timings: fade 140 ms, pop-in 140 ms (scale 0.97 → 1), slide-in 240 ms (8 px), drawers 200–220 ms on `cubic-bezier(0.2, 0.8, 0.2, 1)`, value flash 900 ms ease-out, curve fill 500 ms. Social transitions run 300–600 ms. Cut on the beat.
3. **Signature moves.**
   - **The lock.** Four ticks slide in from outside and the ring settles from 108% to 100% (200 ms ease-out), then one amber pulse. Use it to point at a chip, wallet or candle.
   - **The sweep.** A radar sweep reveals the next element (600–900 ms, linear).
   - **The climb.** A curve bar fills amber, then flashes green at 100%. Use it for "migrated" moments and teaser countdowns.
   - **The flash.** Numbers tick in mono with up or down background flashes, like the board.
   - **The stamp.** `SIM · PAPER TRADING` pops in (140 ms) and stays.
   - **Logo reveal (~1.2 s).** The ring draws on (400 ms), the ticks slide in with a 40 ms stagger (200 ms), the chart line draws left to right (300 ms), and an amber glint crosses the ring (300 ms). It always ends on the intact mark.
4. **Trailer grammar.** Hard cuts. Slow 2–4% push-ins over 3 s. Anamorphic flares. Bass-hit cuts. A hook in the first second. Burned-in captions (autoplay is muted). The end card holds at least **3 s** so the disclaimer can be read.
5. **Product footage.** 1080p capture, no cursor jitter, a keyboard overlay for hotkey clips, the SIM bug on screen the whole time. Pause-on-hover and genuine sim fills at real speed, never sped-up or edited pumps. Blur sim KOL `@handles`, sim token socials and tickers in close-ups (ledger §7, items 4–6), and check the labels in frame: the app now reads "Near graduation" and "S1/S2/S3" (`components/discovery/TrenchesColumn.tsx:21`, `hooks/useSettings.ts:21-25`), so never use older footage that still shows "Almost bonded" or "P1/P2/P3" (ledger §7, item 3).
6. **Safety.** **No more than 3 flashes per second** (WCAG 2.3.1) and no full-screen red strobes. Provide a calm cut. In-app motion respects `prefers-reduced-motion`.
7. **Don't.** Spinning 3D coins, money rain, rocket trails, fake parabolic pumps, glitch effects over disclaimers, shaky-cam on UI.

---

## 13. Disclaimers

Exact wording lives in `CLAIMS_LEDGER.md` §6. This section covers **where they go and how they look**.

| Asset | Required | Placement and style |
|---|---|---|
| X bio | DIS-01 meaning (paper / sim / no token / nfa) | Inside the bio text (see §14.2 options) |
| Any post showing the product, a feature or an app number | DIS-02 `sim market · paper trading · nfa` | End of the post, or the first self-reply on a thread |
| Any post with a real-market stat | DIS-03 | "~" + time window + "on major launchpads" in the post. Source line in the first reply |
| **Any PnL / ROI / balance image** | DIS-04 `SIMULATED · PAPER TRADE` | **Burned into the pixels**, overlapping the hero number so it can't be cropped out. Mono 600 uppercase, ≥ 6% of image height, 25–35% opacity band or a solid amber-outline stamp. Share cards are **not built**, so every PnL visual is a hand-made mock and is never called an "in-app share card" |
| App footage (all of it) | DIS-05 `SIM · PAPER TRADING` | Corner bug, top-right, Mono 600 uppercase, 24–28 px on 1080p, amber outline pill on a `bg`/80% plate, 48 px margin, **on screen the whole time the app is**. The app has no header SIM badge, and phone layouts hide the footer notice, so the bug is mandatory |
| Video end card | DIS-06 (two lines) | Under the stacked lockup, Inter 500, muted, ≥ 28 px on 1080p, held ≥ 3 s |
| Trailer post caption | DIS-07 | In the caption itself. Turn on X's AI label if offered |
| "wen token" replies | DIS-08 | Pinned FAQ reply, verbatim |
| Anti-phishing | DIS-09 | Pinned FAQ reply. Repeat it whenever impersonators appear |
| Bio link page / thread footer | DIS-10 | Footer line |
| Posts showing sim tokens, wallets or KOLs | DIS-11 | Reply or caption |
| Launch-thread last post | DIS-12 | Final post, with `[LINK]` |

**Disclaimer design rules.** Disclaimers are part of the brand, not an apology. Set them in Mono, muted (`#8C94A3`) on dark, never below the minimum sizes above, never under scanlines or glitch effects, never animated away.

---

## 14. X account kit

### 14.1 Handle options

The owner must check availability, and **pick once**: X publicly counts username changes. X handles are ≤ 15 characters (letters, digits, underscore). Avoid "papertrench": a third-party project with that name appears in our research sources.

| # | Handle | Length | Rationale |
|---|---|---|---|
| 1 | `@trenchscope` | 11 | The exact brand name. First choice |
| 2 | `@trenchscope_` | 12 | Closest fallback. Looks the same in conversation |
| 3 | `@usetrenchscope` | 14 | Standard product-account pattern. Reads as a tool |
| 4 | `@trenchscopehq` | 13 | Signals "official account" for impersonation defence |
| 5 | `@trenchscopexyz` | 14 | Crypto-native suffix. Pairs with a possible .xyz domain |
| 6 | `@trenchscope_sim` | 15 | Puts the honesty in the handle. Every reply says "sim" |
| 7 | `@trenchscopeapp` | 14 | Clear and neutral. Reads as a tool, not a coin |
| 8 | `@scopethetrench` | 14 | Verb-first, on-voice. Echoes "scope it before you ape it" |
| 9 | `@larpthetrench` | 13 | Owns the larp angle. Best for meme reach, weakest for brand recall |
| 10 | `@thetrenchscope` | 14 | Brand name with an article. Clean fallback if 1–4 are taken |

### 14.2 Bio options (all ≤ 160 characters, counted)

| # | Bio | Chars |
|---|---|---|
| B1 | `larp the trenches. a memecoin trading terminal on a simulated market: rugs, snipers, bundlers, insiders, all fake. paper trading only · no token · nfa` | 150 |
| B2 | `see who's really buying, with fake money. a paper-trading terminal for the trenches. simulated market · no wallet · no token · nfa` | 130 |
| B3 | `the trenches, with a respawn button. paper-trade launches, migrations and dev sells on a simulated market. no real funds · no token · nfa` | 137 |
| B4 | `paper trading is just larping with extra steps. we built the extra steps. simulated memecoin market · fake money · no token · nfa` | 129 |
| B5 | `get rugged for free. a memecoin terminal where every coin, wallet and rug is simulated. paper trading only · no token · nfa` | 123 |
| B6 | `the rugs feel real. the money isn't. paper-trade the trenches. simulated market · fake money · no token · nfa` | 109 |

Recommended: **B1** for launch (it leads with the primary tagline and lists the cast). **B4** is the fallback if the account leans harder into the joke. **B6** carries DIS-01 word for word, if the owner wants the exact ledger text. No link in the bio during warm-up, and never a shortener.

### 14.3 Recurring content series

| Series | Concept | Cadence |
|---|---|---|
| **spot the rug** | Two or three sim token cards with chips cropped or blurred: "one of these is bundled. which one are you aping?" Reveal the chips in a hand-written self-reply 2–4 h later, with the mechanism (e.g. "4 wallets bought in the creation block. that's the bundle."). Tickers blurred, never cashtagged. DIS-02 on the post, DIS-11 in the reveal | 2× a week in warm-up (from Wed Oct 21), then weekly |
| **rug autopsy** | A 15–25 s sim replay of a launch dying: bundlers in the creation block, snipers right behind, a bundler sell, the dev sell, the candles collapsing. Caption names the tells in the order they happened ("watch the bundlers leave before you do."). SIM bug on screen | Weekly (Fridays). 1–2× a week after launch |
| **trench dictionary** | One term per card (bundler, insider, fresh wallet, CTO, migration) with its plain definition and how the sim tags it (§5). A 4–6 post micro-thread once a week | 2–3 cards a week + 1 thread (Thursdays) |
| **guess the fate** | Post a fresh sim launch at T+0: "fresh sim launch. graduates, rugs, or dies quietly? call it." Reveal with the replay later. A simulator can do this honestly: the sim sets the fate and the reveal is a replay of what happened. No ticker in the copy. DIS-11 in the reply. A reply prompt only: never "like/RT to win" | 2× a week from launch week |
| **paper bag diaries** | Self-deprecating sim PnL confessions from real sim sessions, losses included and never curated into a "strategy", with **SIMULATED · PAPER TRADE** burned in. "my paper bag got bundled. the faucet refilled it. growth." | Weekly (weekends) |
| **shipped:** | Build-in-public changelog: a screenshot of a chip, filter, hotkey or fix **that actually merged this week**. Template: "shipped: [the change]. [why, in one line]." Never present an existing feature as new, never post a roadmap item, never name competitors | 1–2× a week (Mondays and Thursdays) |

Space originals ≥ 2–3 h apart. Posts are link-free in warm-up. Replies are hand-written, one at a time, never automated or reused. No series is ever "engage to win", and no follow-for-follow, pods, giveaways or bought engagement (MNC-22, CT_PLAYBOOK §3.9, §4).

### 14.4 Profile art specs

- **Avatar.** `mark-tile-dark.png` → 400 × 400. Circle-crop safe as-is.
- **Header.** 1500 × 500. Key art K1 or K3, graded to the palette. Optional small `larp the trenches.` in Inter 600 at 64–80 px, centre-right. Bottom-left ~400 × 200 kept dark for the avatar. No URL, no date during warm-up.
- **Pinned post (warm-up).** Link-free, and never edited to add a link. Use **PIN-A** from `marketing/x/PROFILE.md` §9.2 ("we built a fake memecoin market so you can get rugged for free.", 276 / 280) with `marketing/x/posts/screen-trenches.png` (SIM stamp burned in), then the FAQ self-replies from §9.4 (DIS-08 to DIS-11). Don't re-post PIN-A's lines as an original later (duplicate text).

---

## 15. Pre-flight checklist (every asset)

- [ ] The voice passes the four pillars: honest, specific, funny without punching down, explains without advising.
- [ ] Every claim maps to a ledger SC-xx. Every number is KS-xx (hedged: "~", a time window, "on major launchpads", source in the first reply) or SIM-xx ("in the sim"). No real stat and sim stat in one sentence unless the sim one is labelled.
- [ ] Nothing from ledger §5 (MNC-xx) appears: no token, profit promise, traction, accuracy, "AI-powered", "first/only", competitor, real person.
- [ ] Colours: one amber focal point. Green and red only for up and down. Every chip carries a label.
- [ ] Type: Inter + JetBrains Mono, numbers in mono, nothing under 20 px on a 1080 canvas.
- [ ] Logo: correct version for the background, clear space respected, unaltered.
- [ ] Disclaimer: SIM bug on app footage, SIMULATED · PAPER TRADE in the pixels of any PnL, AI label on generated media.
- [ ] AI art: no text, no real people, no real coin logos, no brands or insignia, no profit imagery.
- [ ] X hygiene: no hashtags, no exclamation marks, no link in warm-up, no mass tags, no duplicate text, no cashtags.
- [ ] Length: ≤ 280 as X counts it (§4.2), or marked long-form (Premium). The count includes the disclaimer line.
- [ ] Organic only: no follow-for-follow, pods, follow/RT giveaways, bought engagement, automated or templated replies (MNC-22).
