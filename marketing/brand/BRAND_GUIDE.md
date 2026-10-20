# Trenchscope Brand Guide

| | |
|---|---|
| **Version** | 2.0: the live-terminal positioning. Rewritten against `research/POSITIONING.md` and the rewritten claims ledger, and checked against the product code (`apps/web/src`, `apps/server/src`) |
| **Applies to** | The X account, every post, image, clip and thread, the trailer (*Field Guide to the Trenches, EP.01*), profile art and the website |
| **Built from** | `apps/web/src/index.css` (colour tokens), `apps/web/tailwind.config.js` (type, motion), `apps/web/public/favicon.svg` and `components/layout/Logo.tsx` (logo), `research/POSITIONING.md` (lines, claims, never-do list, footage rules, disclaimers) |
| **Order of authority** | 1. `research/POSITIONING.md` (the binding brief). 2. `research/CLAIMS_LEDGER.md` (what we may say: SC-xx product claims with GREEN/OWNER status, KS-xx market stats, MNC-xx never-say, the RISK/DEMO/AI/CUSTODY/CHAINS disclaimers, the owner checks). 3. This guide (how it looks and sounds). If this guide disagrees with either, **they win** and this file gets fixed. |
| **Approved Day-1 kit** | `marketing/x/TODAY.md` (profile, pin, Day-1 posts). This guide stays consistent with it. Where the ledger flags a phrase in it, §14 says so and offers a measured fix for the owner to choose |
| **Platform research** | `research/CT_PLAYBOOK.md` (how X ranks posts, warm-up, spam triggers) and `research/AI_VIDEO_NOTES.md` (trailer craft) |
| **Logo files** | `marketing/brand/logo/` (SVG masters) and `marketing/brand/logo/png/` (raster exports) |
| **Placeholders** | Handle `@trenchscope` (not yet confirmed) and `[LINK]` (no live URL yet) |
| **Counts** | Numbers in brackets are X-weighted characters, measured with `xlen.py`. Every post line here is ≤ 280 and every bio ≤ 160 |

---

## 0. The brand on one page

- **What it is.** A memecoin trading terminal for the trenches. You trade and track launchpad coins across **Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain** from one screen, with **self-custody**: you keep your keys.
- **Where we are.** Real trading goes live this week. The warm-up **teases** a real terminal. Launch-day posts say it's live, and go out **only once real trading works** on the chains they name. The code in this repo is still the simulator build (ledger §1), so real execution, self-custody and Robinhood Chain are **OWNER** claims: warm-up teasers need **C-0** (they're in the launch build), and "live" copy needs **C-1** and **K-1** (ledger §8).
- **The promise.** *See who's really buying.* Snipers, bundlers, insiders, the dev and smart money get tagged by rule, and our posts quote the rules. Every token gets an audit with a rug ratio. A high-risk buy from the trade panel lists its reasons and makes you confirm. Auto exits include a dev-sell exit. The cost is in the quote before you confirm.
- **Lines.** Tagline `see who's really buying.` Brand line `the trenches, with a scope.` CT hook `everyone in the trenches is larping. the wallets aren't.` Trailer series *Field Guide to the Trenches, EP.01*.
- **Voice.** A sharp trader with jokes, narrated like a deadpan wildlife documentary. Lowercase, short, specific, dry. No hype, no hashtags, no exclamation marks, almost no emojis.
- **Look.** A navy-black terminal with one flare of amber. Market colours only carry meaning. Numbers are set in mono.
- **Never.** Profit promises. Fake results. Dates. "Live" before it's live. A token. Competitor names. Chain logos or anything that implies a partnership. Real tickers in product shots. Real people.

---

## 1. Positioning

### 1.1 Positioning statement

> **For** memecoin traders who are tired of getting rugged blind,
> **Trenchscope is** a trading terminal for the trenches that shows you **who is really buying**: snipers, bundlers, insiders, the dev and smart money, each tag defined, every token audited, and the cost in the quote before you confirm.
> **It trades and tracks** launchpad coins across Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain from one screen, and **you keep your keys**.
> **Unlike** trading off a chart and a vibe, you see the wallets behind the candles before you put your bag up.
> **Because** everyone in the trenches is larping. The wallets aren't.

*Internal only. The "unlike" is the alternative of trading blind, never another product (MNC-10). The chain list and "you keep your keys" are OWNER claims (SC-43, SC-45, SC-46). Don't paste this block into posts.*

### 1.2 One-liners by length

| Length | Line | Count |
|---|---|---|
| Tagline | see who's really buying. | 24 |
| Long form | see who's really buying, before you do. | 39 |
| Brand line | the trenches, with a scope. | 27 |
| 1 sentence | a memecoin trading terminal for solana, base, bnb chain, ethereum and robinhood chain. see who's really buying before you do, and keep your keys. | 145 |
| Elevator (≈48 words, formal case: website, press) | Trenchscope is a memecoin trading terminal for the trenches. Trade and track launchpad coins on Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain from one screen. Every tag runs on a rule, and we post the rules. Every token gets an audit, and you keep your keys. | 272 |

The 1-sentence line and the elevator carry OWNER claims (chains, custody). In the warm-up they need C-0; in "live" copy, C-1 and K-1. Drop any chain that fails its check. "Every tag runs on a rule" leaves KOL out on purpose (SC-19k); it never says the tooltips define the tags (SC-19t).

### 1.3 Proof points (each maps to a claims-ledger ID)

Use the ledger's wording. Status is the ledger's: GREEN means the code does it today (the owner still confirms it's in the live build, check F-1). OWNER means don't post until the owner check is ticked.

| Proof | Say it like | Count | Ledger | Status |
|---|---|---|---|---|
| The board | "new launches, near graduation, migrated. one screen, in real time." | 66 | SC-07 | GREEN |
| Risk on every card | "every card gets a curve-progress ring and risk chips that go red past your limits." | 82 | SC-07b, SC-31 | GREEN |
| Tags, by rule | "smart money, sniper, bundler, insider, dev, whale, fresh, bot. every tag runs on a rule, and we post the rules." | 111 | SC-19 | GREEN. KOL stays out of the list (SC-19k is OWNER). Never "every wallet gets a tag", and never point at the tooltips: they don't carry the rules yet (SC-19t, F-8) |
| The definitions | "sniper: bought within 3 blocks of launch." / "bundler: bought in the same block the coin was created. six wallets, one trench coat." / "funded by the dev? insider. funded by the dev's funder? also insider." | 41 / 85 / 69 | SC-21 | GREEN |
| The audit | "every token gets an audit: top 10, dev, insiders, snipers, bundlers, fresh wallets, bots, wash trading, lp, taxes. green, amber, red." | 133 | SC-09, SC-10 | GREEN. A reference, never "safe" or "audited" |
| Follow the money | "every holder row shows who funded the wallet. follow the money one hop back." | 76 | SC-49 | GREEN. One hop, not a graph |
| It asks first | "buy a high-risk coin from the trade panel and it lists the reasons, then makes you tick a box before you can buy anyway." | 120 | SC-08 | GREEN for the trade panel. Quick buy skips it (SC-08c) |
| Dev-sell exit | "dev-sell exit: when the dev sells 20%+ of their bag in one trade, your sell fires right after." | 94 | SC-41 | GREEN. It reacts **after** the dev, never "before" |
| Cost before you confirm | "see the damage before you click: what you get, min received, price impact, fees, route." | 87 | SC-11 | GREEN. Never a fee number (SC-12) |
| Hotkeys | "j/k through the trench. b to buy. / to search. keyboard first." | 62 | SC-30 | GREEN. Not "command palette" (SC-44) |
| Tracking | "copy a wallet with your own size, a per-token cap and mirror sells." / "watch smart money move in real time. hot = 2+ smart wallets in 30 minutes." | 67 / 74 | SC-15, SC-24 | GREEN. Never imply copying makes money |
| Fees in the PnL | "pnl that counts your fees. painful. accurate." | 45 | SC-32 | GREEN |
| Unknown means unknown | "unknown shows as --, not 0%. a zero you can't verify is a lie with good formatting." | 83 | SC-52. Only half true today: chips and the holder strip show `--` for null values (`components/common/indicators.tsx:32`, `components/token/HolderStrip.tsx:76`), but the server sends 0 when it has no data, so some chips read `0%` | **OWNER**: don't post until dev returns null for "no data" (SC-52) |
| Five chains | "one memecoin terminal for solana, base, bnb chain, ethereum and robinhood chain." | 80 | SC-43, SC-45 | OWNER, one check per chain: C-0 in the warm-up, C-1 for "live" copy |
| Keys | "you keep your keys." | 19 | SC-46 | OWNER: C-0 in the warm-up, K-1 and K-2 for "live" copy |

### 1.4 What we are not

| Not | Why it matters |
|---|---|
| An opportunity | It's a tool. No "profit", "returns", "earn", "make money", "100x" (MNC-03). No PnL except a real owner trade with RESULTS (MNC-05) |
| A custodian | Self-custody is the claim: we never hold keys or funds (OWNER, K-1, K-2). So we never ask for a seed phrase, never DM first (CUSTODY) |
| A partner of any chain | Chains are named as supported chains only. No logos, brand colours, "official", "powered by" (MNC-14) |
| A token | We don't mention a Trenchscope token, airdrop or points at all unless the owner confirms a plan (MNC-02, check T-1). Never cashtag the brand |
| "AI-powered" | The product has no AI or ML. Only the trailer and teasers are AI-made (MNC-07) |
| A safety guarantee | The audit is a reference, the risk prompt asks and doesn't block, anti-MEV lowers risk at best, the dev-sell exit reacts after the dev (MNC-17) |
| A signals or alpha seller | No hit rates as performance, no calls (MNC-04, MNC-18) |
| "The first", "the only", "the fastest" | Unverified or unmeasured (MNC-08, MNC-09) |

---

## 2. Brand story

**The trench.** Memecoin trading happens in the trenches: thousands of new coins a day on bonding-curve launchpads. On major launchpads, fewer than ~3 in 100 launches make it off the curve lately, and of the few that graduate, ~73% are down 60%+ within 20 minutes in one sample (KS-01, KS-02, KS-09: secondary data, AMBER, hedged, re-verified the day before posting, never "97% are rugs"). Bundlers, snipers and insiders often take supply in the first blocks, and late buyers become the exit liquidity.

**What's broken.** These are the trader's pains we design against. They are not claims about any named tool, so never aim them at one (MNC-10):

1. **Demand you can't see behind.** A bundle looks like organic buying. An insider looks like a believer. The chart shows the candles, not who made them.
2. **Risk numbers you have to take on faith.** A percentage is only useful if you know what it counts. And "0%" is not the same as "we don't know".
3. **Costs that are easy to forget.** A platform fee, plus priority and tip fees. On a small ticket they add up before the chart has moved (show the arithmetic only once our own fee is final, KS-11, SC-12).

**Why a scope.** Trench periscopes let soldiers see over the parapet without putting their heads up. That is the product: see the whole board (who's buying, who's linked to the dev, who's already selling) before you put your bag up. The logo is a scope reticle with a chart line climbing out of a dip. In other words, a way out of the trench.

**Why "everyone is larping".** On CT, larping means pretending: fake rich, fake conviction, fake organic demand. The wallets don't pretend. Block timing and funding links are what they are. That's the honest edge, and it's the only way we use the word now: about *other people's* posturing, never about our product, and never aimed at a named person. ("larp the trenches." is retired: it meant paper trading.)

**Why a field guide.** The trenches have species. The whale, the sniper, the bundler (six wallets in a trench coat), the insider, the dev. We narrate them like a wildlife documentary shot as a war epic: deadpan, a little absurd, and every species card carries its **real** in-app wallet tag and the ledger's definition.

**What we promise.** Every tag except KOL runs on a code rule, and our posts quote the rules. Every audit row is rated green, amber or red against a set threshold. Fees and price impact are in the quote before you confirm. You keep your keys (OWNER). **What we don't promise.** Profits, outcomes, accuracy, safety, speed, "never get rugged again", or anything about a token.

---

## 3. Audience

CT archetypes mapped to the PRD personas (PRD §3). Launch priority: **A1, A2 and A8 first** (they trade, and they feel the product fastest), then A3 and A5. A4 and A6 are low priority.

| # | CT archetype | PRD persona | Who they are on CT | What they want | Our hook | Content that lands | Careful |
|---|---|---|---|---|---|---|---|
| A1 | **The trench rat** | P-1 "Trench sniper" (Kai) | Lives on launch boards. 50–200 trades a day. Posts "aped" screenshots | Speed, hotkeys, the risk chips on the card, decisions in under 5 s | "j/k through the trench. b to buy." / "scope it before you ape it." | Keyboard clips, spot-the-rug puzzles, POV memes | No speed claims (MNC-08). They will test every claim on launch day |
| A2 | **The wallet watcher** | P-2 "Smart-money follower" (Maya) | Follows 30–200 wallets, lives in alerts, copy-trades | Wallets worth following, alerts when they buy, copying without becoming exit liquidity | "smart money isn't a vibe. it's a 7-day hit rate." | Monitor clips, wallet report cards (PnL blurred on demo data), the smart-money definition | Never imply copy-trading profits (SC-15, MNC-04). No demo wallet PnL as a result (MNC-19) |
| A3 | **The thread sleuth** | P-3 "Researcher" (Dev) | Writes "dev funded 14 wallets" threads, rarely trades fast | Holder tables, insider and bundler links, dev history | "bought in the launch block? bundler. funded by the dev? insider." | Rug autopsies, trench dictionary threads, the definitions table | Quote the code's rules exactly (ledger §2.2). Never "detects every insider" (MNC-06) |
| A4 | **The caller** | P-4 "Caller/KOL" (Rin) | Has followers, posts calls | A verifiable track record | Low priority. Nothing targeted | — | No paid KOL deals: X's Paid Partnerships policy lists crypto as ineligible (CT_PLAYBOOK §1.1, §3.9). Never tag callers to farm reach |
| A5 | **The trench tourist** | P-5 "Newcomer" (Sam) | Curious, has watched friends get rugged | To understand curves, migrations and rugs | "everything in the trenches wants your bag." / the trench dictionary | Explainers, field-guide species cards, POV memes | This is now a real-money product: no "easy", "learn to trade", "start small and win" framing (MNC-03). RISK on every launch-day trading post. Where users are matters legally (check L-1) |
| A6 | **The builder** | P-6 "Builder" (Ana) | Dev-Twitter adjacent, likes build-in-public | Changelogs, how the tags work | "shipped:" posts (after launch) | Build-in-public screenshots | Don't promise a public API (not built, MNC-12) |
| A7 | **The spectator / meme lord** (not a PRD persona) | — | Doesn't trade much, reposts what's funny | Good jokes about the trenches | The field guide, the trailer | Trailer, species cards, the CT hook | Amplifiers, not users. Never bait them with giveaways |
| A8 | **The chain hopper** (not a PRD persona) | — | Trades whichever chain is hot this week: sol, then base, then bsc | One screen for every chain, keys in their own hands | "one memecoin terminal for solana, base, bnb chain, ethereum and robinhood chain." / "you keep your keys." | Chain-switch clips (four chains in UI), the five-chain pill | OWNER claims (C-1 per chain, K-1). Never "robinhood" alone, never chain logos. Robinhood Chain in copy only, not in UI frames |

---

## 4. Voice

### 4.1 Pillars

**Pillar 1: Straight about risk.** It's real money now. We say what the tool does and where it stops, before anyone asks. Being honest about the limits is what makes the rest believable.

| Do | Count | Don't |
|---|---|---|
| "it lists the red flags, makes you tick a box, then lets you buy anyway. it's a scope, not a babysitter." | 103 | "Never get rugged again." |
| "dev-sell exit: your sell fires right after the dev's. after, not before. we built a scope, not a time machine." | 110 | "Exit before the dev dumps." |
| "anti-mev sends your trade through a private route for a small tip. harder to sandwich. not impossible. harder." (OWNER per chain, SC-13o) | 110 | "MEV-proof. Zero sandwiches." |
| "memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa." (RISK, verbatim) | 92 | "Trade safely with Trenchscope." |

**Pillar 2: Receipts, not vibes.** Mechanism first. Name the block, the funder, the rule. If the code doesn't do it, we don't say it.

| Do | Count | Don't |
|---|---|---|
| "sniper: bought within 3 blocks of launch." | 41 | "our AI detects every rug" |
| "funded by the dev? insider. funded by the dev's funder? also insider." | 69 | "the most accurate data in crypto" |
| "smart money isn't a vibe. it's a 7-day hit rate: entries that later ran 2x, tested against the chain's base rate." | 113 | "97% of memecoins are scams" |
| "~97 out of 100 launches never make it off the curve. lately." (KS-01, AMBER, STAT in the first reply) | 60 | "exactly 2.6% graduate" |

**Pillar 3: The field guide.** Deadpan wildlife documentary, shot like a war film. Gallows humour from someone who has been rugged too. We laugh at the trenches and at ourselves, never at a named person.

| Do | Count | Don't |
|---|---|---|
| "the bundler is six wallets in a trench coat." | 44 | "LFG 100x incoming #memecoin #solana" with a rocket and a fire emoji |
| "here we observe the insider. funded by the dev. early. suspiciously early." | 74 | Dunking on a real dev, KOL or project by name |
| "top 10 holds most of the supply. that's not a community, that's a group chat." | 77 | "ngmi if you still get rugged lol" |
| "everyone in the trenches is larping. the wallets aren't." | 56 | "everyone else is larping. we're the real ones." (a competitor dig in disguise) |

**Pillar 4: The calm one in the group chat.** Plain language for newcomers, depth for the sweats. Warm, never condescending. We explain and never advise.

| Do | Count | Don't |
|---|---|---|
| "a bonding curve is a vending machine that raises the price every time someone buys. when it's full, the coin moves to a dex pool. that's 'graduating'." | 150 | "if you don't know what a bonding curve is, you're exit liquidity" |
| "the audit is a reference, not a verdict. green, amber or red, each against a set threshold." | 91 | "buy when the dev buys, it graduates 8% of the time" (that is advice, KS-07) |
| "nfa." closing a RISK line | — | "this one's going to send, trust" |

### 4.2 Style mechanics

- **Case.** Posts and replies are lowercase. Proper names may stay lowercase too (trenchscope, solana) in posts. Formal surfaces (end cards, the logo, the website, docs) use **Trenchscope**: one word, capital T. Never "TrenchScope", "Trench Scope" or "TS". Disclaimers keep their exact case (`UI shown with demo data`, `AI-generated`, `DM`).
- **Length.** First line is the hook and works on its own. 1–3 short lines. Threads are 4–6 posts, and the first post stands alone. **The one exception is the launch thread** (`x/LAUNCH_DAY.md` §3: the trailer + T1–T10), a guided tour where every stop names the product and so carries RISK. The owner may cut it to six stops instead (LAUNCH_DAY §3 has the cut).
- **Character limit.** Every post fits **280** as X counts it. Measure with `python3 xlen.py file.json` (JSON `{name: text}`) and put the count next to the draft. X weights characters: `·`, `—`, `×` and plain ASCII count 1; `→`, `≥`, `−` (true minus), `…` and every emoji count 2; any URL counts 23. A launch-day trading post ends with RISK (92), so the copy before it gets **186** (280 − 92 − 2 for the line break). Bios are ≤ 160.
- **Chain names.** In full: **Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain**, in that order. Short forms in tight copy: `sol`, `base`, `bsc`, `eth`, `robinhood chain`. Never "robinhood" on its own (that's the brokerage), never "binance chain" or "coinbase chain". Named as supported chains only, never as partners (MNC-14). If a chain fails its check (C-1), it leaves the copy and the header.
- **No dates.** No calendar date, weekday-plus-date, month or year in any post, image, video or alt text (MNC-21). "lately", "within 20 minutes", "a day later" are fine. "this week" appears only in gated launch-day copy. Internal schedules use Day 1 … Day 7, Launch day, L+1, L+2.
- **"Live".** Only in launch-day posts, which are **gated: post only once real trading works**. Before that: no "live", "live now", "trade now", "sign up", "try it", "launching", "join the beta", "soon" (MNC-01, MNC-13). **One exception (owner decision, ledger MNC-01):** the single product-level `soon.` that closes D7-P4, with no chain list in that post, posted only if the launch gate hasn't passed by then. Never "soon" in a reply, and never next to a chain or a feature.
- **Numbers.** Use digits ("3 blocks", "~73%"). Real-market stats always carry "~", a time window and "on major launchpads" (or "on the biggest solana launchpad"), with STAT in the first reply. Demo-data numbers never appear as market data or results (MNC-19). A PnL appears only from a real owner trade on the live product, with RESULTS.
- **Hashtags.** None. **Emojis.** Rare: at most one, and only when it is the joke. **Cashtags.** Never: not for any coin, not for demo tickers, not for the brand (MNC-16).
- **Mentions.** Don't tag strangers, KOLs, chains or projects to get noticed.
- **Links.** None during warm-up, and never in the pinned post while the account is following people (CT_PLAYBOOK §3.4). On launch day, once real trading works, `[LINK]` goes in the first self-reply. Own domain, no shortener.
- **Punctuation.** Full stops are fine, and so is a dry "." at the end. **No exclamation marks.** If a line needs one to land, the line is wrong.
- **Replies.** Written by a person, one at a time. Never automated, scheduled in bulk or reused (X clusters duplicate replies as spam: CT_PLAYBOOK §3.4, §4.3). No "gm", "this" or "🔥" replies, and no product drop in most replies. Any "dm me for support" impersonator gets CUSTODY.

### 4.3 Words we use and words we avoid

| Use | Avoid (and why) |
|---|---|
| terminal, trade, track, scope, read the board | platform, exchange, "an app that makes you money" (MNC-03) |
| self-custody, you keep your keys (OWNER, K-1) | "secure your funds", "your funds are protected", "safe", "bank-grade" (MNC-17) |
| tags, flags, shows, defined, "by rule" | detects, predicts, accurate, catches every, AI-powered (MNC-06, MNC-07) |
| "it asks first", "lists the reasons" (the risk prompt) | blocks, protects, prevents, rug-proof (MNC-17) |
| "harder to sandwich" (anti-MEV, OWNER per chain) | MEV-proof, "no sandwiches", "can't be sandwiched", even though the in-app tooltip says "no sandwich attacks" (SC-13o) |
| "fires right after the dev sells" (dev-sell exit) | "exit before the dev", "beat the dev", "front-run the dev" (SC-41) |
| "tagged by rule", "every token gets an audit" | "every wallet gets a tag", "every number explained", "hover any tag and it tells you", "a hint on anything that isn't green" (most wallets match no rule; the tooltips don't carry the rules yet; only some audit rows carry hints) |
| near grad, near graduation, migrated | "almost bonded", "cooking", "P1/P2/P3" and other competitors' labels (MNC-11) |
| hotkeys, keyboard first, presets, S1/S2/S3 | "command palette" (not built, SC-44), "fastest", "0 ms", "sub-second" (MNC-08) |
| solana, base, bnb chain (bsc), ethereum, robinhood chain | "robinhood" alone, "binance chain", "coinbase chain", "official", "partnered with", "powered by", "backed by" (MNC-14) |
| "we're building a scope" (warm-up) | "coming soon", "next week", "robinhood chain soon", "part of what we're shipping" (MNC-13). D7-P4's single `soon.` is the only exception |
| launch day only, gated: "live", `[LINK]` in the first self-reply | before launch: "live", "trade now", "sign up", "join the beta", "24/7" (MNC-01) |
| nothing about a token | token, airdrop, points, presale, TGE, rewards, cashback, rebates, "wen token" (MNC-02) |
| "everyone in the trenches is larping" (about other people); "paper hands" in jokes about people (§5) | "larp the trenches", paper (as in paper trading, paper wallet, paper bag), paper trading, sim, simulated, fake money, faucet, respawn, "no real funds" (all retired with the simulator positioning) |

---

## 5. CT vocabulary, used correctly

Use the words the trenches use, and use them right. Where the product has a rule, the "Careful" column gives the code's rule (from ledger §2.2), which is stricter than the in-app tooltips (`components/common/WalletTags.tsx`). In copy, quote the ledger.

| Term | What it means | How we use it | Careful |
|---|---|---|---|
| **the trenches** | The launchpad memecoin market: new coins on bonding curves, fast trading, high mortality | Our home turf. "the trenches, with a scope." | — |
| **launchpad** | A site where anyone mints a coin on a bonding curve in seconds | "on the biggest solana launchpad" (stats only) | Never name a real launchpad in posts (MNC-10). Don't name demo launchpads either |
| **bonding curve / the curve** | Price rises automatically with each buy. Once the curve fills, the coin graduates | "a vending machine that raises the price every buy." (50) | Curve stats (KS-08) are AMBER: re-verify first |
| **graduated / migrated / bonded** | The curve filled and liquidity moved to an AMM pool | Our lifecycle labels: **new · near grad · migrated** | Never "almost bonded" (a competitor's label, MNC-11) |
| **CA** | Contract address. "drop the ca" | Pasting a CA or a wallet into search (`/`) is a hotkey clip (SC-30) | Never post a CA in copy: a real one reads as a shill, a demo one could collide with a real coin |
| **dev** | The wallet that created the token | "dev: the wallet that made the coin. we watch what it does next." (63) | "Dev team" wallets are sim-assigned in the code: OWNER (SC-21d) |
| **dev sold / dev dumped** | The creator sold some or all of their supply. Often the start of a rug | "13 signal types. one of them is just 'the dev is selling'." (58) | The number "13" is OWNER (SC-18). Dev status: sold part = over 10% of peak sold; sold all = under 0.1% of peak left (SC-26) |
| **rug / rugged / rug pull** | Insiders pull liquidity or dump supply, and the price goes to ~zero | "watch the bundlers leave before you do." | **Not graduating ≠ a rug.** Most non-graduates are duds that die quietly (ledger §4.3) |
| **sniper** | A wallet that bought in the first blocks after launch | "sniper: bought within 3 blocks of launch." (41) | Code: the 1st to 3rd block **after** the creation block (`SNIPER_BLOCKS = 3`). Creation-block buyers are bundlers. Don't convert blocks to seconds (block times differ by chain) |
| **bundler / bundle** | Wallets that buy in the same block the token was created, to grab supply cheaply and look like demand | "bundler: bought in the same block the coin was created. six wallets, one trench coat." (85) | Code: any non-creator wallet that buys in the creation block. On the audit, "Bundlers" is their share of the token's **volume**. Don't repeat the tooltip's "likely linked to the dev" as fact |
| **insider** | A wallet funded by or linked to the dev that bought early | "funded by the dev? insider. funded by the dev's funder? also insider." (69) | Code (`classifyInsider`): first funder is (1) the creator or a dev-team wallet, or (2) the creator's own funder (unless it's a labelled public entity such as an exchange hot wallet), or (3) one private funder of 3+ wallets that all first bought within 10 minutes of launch |
| **smart money** | Wallets with a strong record of early entries | "smart money isn't a vibe. it's a 7-day hit rate: entries that later ran 2x, tested against the chain's base rate." (113) | No accuracy numbers (MNC-06). Don't repeat the tooltip's "statistically proven… profitable" |
| **whale** | A wallet with a large balance or average buy | "the whale. moves slowly. moves everything." (42) | Code: has traded, and holds $100k+ in native coin or averages $10k+ a buy |
| **fresh wallet** | A newly funded wallet with little history. Often a burner | "a lot of fresh wallets. totally organic." (40). A percentage only from a real frame | Code: first funded under 24 h ago, positions in fewer than 15 tokens |
| **bot / MEV / sandwich** | Automated traders. A sandwich bot front-runs and back-runs your swap | "anti-mev: harder to sandwich." | Bot and MEV rules are in ledger §2.2. Never "sandwich-proof" |
| **honeypot** | A token you can buy but can't sell | "honeypot: buys work, sells don't. the audit says so, then the risk prompt asks." (79) | EVM chains only in the audit. "Unknown" means the sell path is untested |
| **rug ratio** | Trenchscope's 0–100% composite of 16 weighted risk signals | "every token gets a rug ratio and a risk level. most of them are not low." (72) | Never "predicts rugs" or an accuracy figure (SC-10) |
| **top 10** | Share of supply held by the ten largest holders | "top 10 holds most of the supply. that's not a community, that's a group chat." | Audit: green under 20%, red above 50% |
| **KOL / caller** | Key opinion leader: an influencer whose buys move price. A caller posts "calls" | Rarely, and generically | The KOL tag is OWNER (SC-19k). Never name, tag, depict or identify real ones (MNC-15) |
| **CTO** | Community takeover: the dev abandons the coin and holders take over its socials | Only if the live build has a real source | The CTO flag is sim-supplied in the code: OWNER (F-2) |
| **self-custody / keys / seed phrase** | You hold the keys to your wallet; nobody else can move your funds | "you keep your keys." (19) | OWNER (K-1, K-2). Never ask anyone for a seed phrase or private key, even as a joke. Never post a "connect wallet" link |
| **ape / aped** | Buy fast, usually without research | "scope it before you ape it." | — |
| **jeet** | Someone who sells at the first green candle | Know it, don't lead with it. Prefer "paper hands" | Some read its origin as a slur aimed at South Asian traders. Never aim it at people |
| **paper hands / diamond hands** | Sells too early / holds through anything | Fine in jokes about people | The "paper hands welcome" pun is retired (it was about paper trading) |
| **bags / bagholder** | Your position / stuck holding a coin that dumped | "everything in the trenches wants your bag." | — |
| **exit liquidity** | The late buyers that early holders sell into | "the bundlers need exit liquidity. try not to be it." (51) | Never "never be exit liquidity again" (MNC-03) |
| **larp** | Live-action role play. On CT: pretending (fake rich, fake insider) | The CT hook: "everyone in the trenches is larping. the wallets aren't." | Only about other people's posturing, never a named person, never our product |
| **pnl / roi** | Profit and loss / return | "pnl that counts your fees. painful. accurate." (45) | A PnL number only from a real owner trade on the live product, with RESULTS (MNC-05) |
| **mc / mcap, ath** | Market cap; all-time high | "limit order on market cap." | — |
| **send it / runner / moon** | A coin that keeps going up | Only in jokes about people, never about a coin | Never as a prediction (MNC-18) |
| **nfa / dyor** | Not financial advice / do your own research | Closes RISK and RISK-short | Saying "nfa" doesn't make advice okay. Still give no advice |
| **gm** | Good morning | Only if it says something else too | Bare "gm" replies are spam signals on X |

---

## 6. Taglines, ranked

The first five are POSITIONING's "Lines" and are fixed. The rest are supporting lines. Use lowercase in posts. On formal surfaces (end cards, the website) sentence case is allowed ("See who's really buying.").

| Rank | Line | Count | Job | Notes |
|---|---|---|---|---|
| 1 | **see who's really buying.** | 24 | Tagline: header, bio, pin, end card | "really" is the amber word when set in type |
| 2 | **see who's really buying, before you do.** | 39 | Long form: pin opener, launch thread, website hero | — |
| 3 | **the trenches, with a scope.** | 27 | Brand line: bio, header-main, sign-offs | — |
| 4 | **everyone in the trenches is larping. the wallets aren't.** | 56 | CT hook: warm-up hooks, trailer cold open, quote-posts | The only place "larp" appears |
| 5 | **Field Guide to the Trenches, EP.01** | 34 | Trailer series title; species cards | In posts: "field guide to the trenches, ep.01." |
| 6 | **everything in the trenches wants your bag.** | 42 | Field-guide opener (TODAY D1-P1 and the trailer) | — |
| 7 | **scope it before you ape it.** | 27 | Action line: keyboard clips, sign-offs | Not a CTA to trade before launch |
| 8 | **see the bundlers before they see you.** | 37 | Audit and risk-chip posts | — |
| 9 | **the dev wrote an exit. now so can you.** | 38 | Dev-sell exit clips | SC-41. Never "exit before the dev" |
| 10 | **you keep your keys.** | 19 | Custody line: pin, bio, launch thread | OWNER (K-1, K-2) |

**Retired (simulator-era, don't use):** "larp the trenches.", "get rugged for free.", "fake money. real-feeling trenches.", "the trenches, with a respawn button.", "paper hands welcome.", "all of the rugs. none of the rent money.", "even the fees are fake. still shown before you click.", "nfa. it's literally fake money.", "my paper bag got bundled…". **Retired earlier and still banned:** "the only place getting rugged is free" (MNC-09), "never get rugged again" (MNC-03), "risk-free trenches" (MNC-03), "trade smarter" (outcome promise), "every number explained" (overclaim), "24/7" (nothing to promise yet).

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

| File | Use |
|---|---|
| `marketing/x/profile/avatar.png` (400 × 400) | **The X avatar.** `mark-dark.svg` on a full-bleed `#0A0C10` square with a soft amber glow, built by `marketing/tools/profile.py`. Survives the circle crop (Premium) and the rounded square (Verified Organization) |
| `logo/mark-tile-dark.svg` / `png/mark-tile-dark.png` (1024) | App icon, any busy background |
| `logo/mark-tile-light.svg` | App icon on light surfaces |
| `logo/mark-dark.svg` / `mark-light.svg` | Mark without the tile, on brand dark or light backgrounds |
| `logo/mark-mono-white.svg` / `mark-mono-black.svg` / `mark-mono-amber.svg` | One-colour uses: video overlays, stamps, the reticle lock (ring and ticks only) |
| `logo/lockup-horizontal-dark.svg` / `-light.svg` | Default lockup on dark or light (transparent background) |
| `logo/lockup-horizontal-dark-bg.svg` / `-light-bg.svg` | Lockup with background and built-in clear space (padding ≈ 0.31 H). Press, website, link previews |
| `logo/lockup-stacked-dark.svg` / `-light.svg` | Square-ish placements: the trailer end card, 1:1 sign-offs |
| `logo/wordmark-dark.svg` / `-light.svg` | Wordmark only, when the mark is already on screen |
| `logo/png/icon-16/32/48/180/192/512.png` | Favicons and touch icons |

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
| AI key art or video | Place on the darkest, calmest area. Use the **tile** version or **mono white**. The local background must be dark enough that the ring keeps ≥ 3:1 contrast. Never set the logo on top of a reticle that's already in the art |
| Amber fields | Mono black (`#0A0C10`) only. Never amber on amber |
| Mid-tone, busy or photographic backgrounds without a dark area | Use the tile, or don't place the logo there |

### 7.6 Don'ts

1. Don't recolour the ring (no green, red, purple or gradient rings), and don't swap the ring and line colours.
2. Don't rotate the reticle or move the ticks off 12, 3, 6 and 9.
3. Don't put a coin, token, ticker or **chain logo or chain letter mark** inside or beside the reticle. That reads as "our token" or as a chain partnership.
4. Don't re-typeset the wordmark, change its colour split, or set it in another font.
5. Don't stretch, skew, outline, bevel, emboss or drop-shadow the logo. Glows and flares belong to the art behind the logo. The one exception is the soft amber glow built into `avatar.png`.
6. Don't redraw the chart line as a rocket, a "100x" arrow or a moonshot.
7. Don't lock the logo up with any other brand's mark (chains, launchpads, exchanges, other terminals), or imitate a competitor's colours or mascot.
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
| `faint` | #5C6372 | #8C93A1 | Table heads, tertiary labels, unknown values (`--`) |
| `accent` (flare amber) | **#FFB547** | **#D97D00** | Brand, focus, CTAs, the scope ring, the curve fill |
| `accent-fg` | #140E02 | #140E02 | Text on amber |
| tile ink (assets only) | #0D1016 | — | Logo tile in exported favicons |

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

The real chips, rendered from the app's own `WalletTagBadge` at 4×, are in `marketing/video/overlays/chips/` (`whale`, `sniper`, `bundler`, `insider`, `dev`, `kol`, `smart`, `fresh`, `bot`, `you`). Use those files rather than redrawing chips.

### 8.4 Usage ratios (per frame or post image)

| Share | Colours | Rule |
|---|---|---|
| **~70%** | `bg`, `panel`, `panel-2/3`, `line` | The canvas is night. Steps between panels do the separating, not borders |
| **~15%** | `fg`, `muted`, `faint` | Text and UI |
| **~8–10%** | Flare amber | **One amber focal point per frame**: the reticle, the CTA, the hero word. Never an amber background field above ~10% |
| **~4%** | `up` / `down` | Only where something actually went up or down |
| **~1–2%** | Wallet-tag colours | Only on chips and labels, always with a text label |

### 8.5 Colour rules

- **Green and red always mean up and down.** Never use them as decoration or as the brand colour. The brand colour is amber.
- **Amber is not a warning.** `warn` (#FFC107), `bundler` (#FACC15) and `dev` (#FB923C) sit close to amber. In marketing art, keep them inside labelled chips so they never compete with the brand flare.
- **No chain colours.** Chains are text, set in `fg`, `muted` or amber like any other text. Never mark a chain with its own or its parent company's brand colour (a Robinhood-style green, BNB yellow, Coinbase/Base blue, Ethereum's purple-grey, a Solana gradient), and never put a chain name in `up` green. **The app's chain marks are not safe as built:** `components/common/ChainIcon.tsx` fills each letter with the chain's brand colour (Solana purple, BNB yellow, Base blue, Ethereum `#627EEA`) and uses `Ξ` for eth. Before any capture, recolour them to neutral (`panel-3` fill, `fg` letter, a plain `E`) in the app or in capture mode (ledger §7.11, check F-7), or crop every chain chip out of frame and show the chain as text.
- **Never use colour alone.** Every chip has a text label (PRD §11.7). "SNIPER 12%", never just a red dot.
- **Gradients:** allowed are a vertical `bg → panel`, an amber **radial flare** (#FFB547 at ≤35% alpha fading to transparent), and a faint cyan (`whale`) depth haze at ≤15%. Banned are rainbow, purple-to-green "crypto" gradients, gold-coin gradients and neon overload.
- **Contrast (WCAG):** on `bg`, fg is 16.1:1, muted 6.4:1, amber 11.1:1, up 10.3:1 and down 6.3:1. `faint` is only 3.3:1, so use it for labels ≥ 14 px or decoration only. White on `down` is 3.1:1, so bold and large only. **Light theme:** amber #D97D00 on white is 3.05:1, so use it for graphics and text ≥ 24 px only. Text on an amber button is always `#140E02`.

---

## 9. Typography

| Family | Use | Weights | Features |
|---|---|---|---|
| **Inter** | Headlines, UI, captions, body | 400 / 500 / 600. 700 for hero headlines only | `cv11` (single-storey a), `ss01` (open digits), `tnum`, as set on `body` in `index.css` |
| **JetBrains Mono** | **All numbers that matter** (prices, %, market cap, multiples), addresses, chips, labels, pills, hotkeys, disclaimers | 500 / 600 | Tabular by default |

Both are free (SIL OFL) and on Google Fonts. The fallback stack is `ui-sans-serif, system-ui` / `ui-monospace, SFMono-Regular`.

**In-app scale (for reference).** 10 / 11 / 12 / 13 (base) / 14 px, and the PRD scale 11–32 px. Radius 6 px for controls and 10 px for cards, on a 4 px grid.

### 9.1 Social sizes

| Canvas | Headline (Inter 600–700) | Sub (Inter 500) | Hero number (Mono 600) | Chips / labels / pills (Mono 600, UPPERCASE, +4% tracking) | Disclaimers and corner labels (Mono 500, exact case) |
|---|---|---|---|---|---|
| X post 1200 × 675 (16:9) | 72–88 px, line height 1.05, tracking −2% | 32–40 px | 96–160 px | 22–26 px | 20–22 px |
| Square 1080 × 1080 | 80–96 px | 36–44 px | 120–200 px | 24–28 px | 22–24 px |
| Vertical 1080 × 1920 | 96–120 px | 44–52 px | 160–240 px | 28–32 px | 36–40 px (the phone shrinks it) |
| X header 1500 × 500 | 56–80 px | 22–32 px | — | 20–24 px | 20 px |
| Video 1920 × 1080 | Captions: Inter 600, **56–64 px**, 3–6 words a line, 2 lines max, bottom third, 8% safe margin, on a `bg` plate at 60–70% | — | — | 26–30 px | Corner label 26–28 px. End-card disclaimers ≥ 28 px |
| Video 1080 × 1920 | Captions: Inter 600, **64–76 px**, keep above the bottom 20% (platform UI) | — | — | 30–34 px | Corner label 36 px. End-card disclaimers ≥ 40 px |

**Rules.**
- Nothing under **20 px on a 1080-wide canvas** (it becomes unreadable on a phone). DEMO and AI stay legible at phone size: at least ~2% of the frame height.
- Headlines are lowercase or sentence case. UPPERCASE is for mono chips, pills and labels only (the series label, species names). **Disclaimers keep their exact case**: `UI shown with demo data`, `AI-generated`, never uppercased.
- Numbers: mono and tabular. In images, always show the sign (`+312%`, `−84%`, with a true minus U+2212; in post text use a plain hyphen, because X counts `−` as 2). Multiples use × (`3.2×`). Compact money (`$1.2M`). Tiny prices use subscript zeros (`0.0₅123`, as the app formats them). A genuinely missing value is set as `--`, the glyph the app's risk chips use for null values. It's a typesetting rule, not a promise in copy: the server still sends 0 for some no-data cases (ledger SC-52).
- One typeface pairing per asset. No display fonts, no script, no pixel fonts, no meme Impact text.

---

## 10. Graphic motifs

| Motif | What it is | How to use it | Don't |
|---|---|---|---|
| **Scope reticle** | The ring plus four ticks from the mark, at any scale | Frame the subject of a post (a wallet, a chip, a candle). Transition wipes. Huge and cropped in brand graphics (stroke ≈ 2.4/32 of the diameter) | Gun sights, bullet holes or anything aimed at a person |
| **Crosshair ticks** | The four ticks used alone as corner brackets ("target lock") | Mark the region of a screenshot that matters. Lock-on animation (§12) | Rotating them, or more than four |
| **Curve progress** | The bonding-curve bar: a `panel-3` track with an amber fill that **turns green at 100%**. On cards, a progress ring around the token avatar that turns green when full (`components/common/TokenAvatar.tsx`) | "near grad" and "migrated" moments, section dividers, a loading motif | Implying a token sale, a "presale progress" or a countdown to a date |
| **Risk chips** | Pills with 6 px radius, Mono, an optional 10 px icon, label then value. **Healthy:** `up` text on up/10%. **Risky:** `down` text on down/15%. **Unknown:** `faint` text on `panel-3` showing `--` (`components/common/indicators.tsx`). **Tags:** tag colour on tag/12% | Hero elements in posts ("TOP 10", "BUNDLERS", "DEV SOLD"). Rows of chips as texture | Chips without labels. Inventing chip types the app doesn't have. Made-up values: a chip with a number comes from a real frame |
| **Chain pill** | `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN` in Mono 600 uppercase, +10% tracking, 1.5 px outline, fully rounded (999 px) | Headers, the end card, chain-switch posts. Amber outline by default; `muted` outline when the frame's amber focal point is elsewhere | Chain logos or colours in it. Reordering it. Showing a chain that failed C-1 (re-render without it). Placing it so it reads as the app's chain switcher |
| **Field-guide card** | Letterbox bars (`bg`), the series label `FIELD GUIDE TO THE TRENCHES · EP.01` in spaced Mono uppercase top-left, the reticle locked on the subject, the real wallet-tag chip beside it, one caption in Inter 700 with one amber word, and the AI corner label (see `marketing/x/posts/d1-field-guide.png`) | Species cards: whale, sniper, bundler, insider, dev. The definition goes in the caption or the post, quoted from ledger §2.2. `d1-field-guide.png` is approved as is, but its label reads `AI-GENERATED · DRAMATIZED` in capitals; new cards set `AI-generated` in exact case | A chip the subject doesn't match. Any number in the art. A species card without the AI label |
| **Terminal grid** | A 4 px base grid, 1 px `line` hairlines, and panels separated by tone steps (bg → panel → panel-2) | Layout skeleton for every static asset. Subtle 32/64 px grid backgrounds at 4–7% | Heavy borders, skeuomorphic bezels |
| **Scanlines** | Horizontal 1–2 px lines at 3–6% opacity, with light grain and a slight vignette (war-room feel) | Key art, trailer, teaser frames, headers | Over small text, chips or disclaimers, or above 8% opacity (hurts legibility and compression) |
| **The rising line** | The mark's rise-dip-breakout polyline, used as a stroke graphic | Sign-offs, dividers, a "way out of the trench" beat | Turning it into a rocket or a parabolic "100x" curve |
| **Corner label** | DEMO (`UI shown with demo data`) or AI (`AI-generated`), Mono 500 in exact case, `#E6E9F0` at 85% on a `#0A0C10`/80% plate, 6 px radius, 0.5em × 0.9em padding. Sizes in §9.1 | **Stills:** bottom-right, inside the safe margin. **Video:** top-right, 48 px margin (160 px from the top on 9:16), clear of X's player controls. In mixed edits the label swaps on the cut: DEMO on UI shots, AI on AI shots | Hiding it, shrinking it below §9.1, uppercasing it, putting it under scanlines, or letting it cover the claim's subject |
| **Radar sweep** | A conic amber sweep over concentric rings, with blips coloured by wallet tag (KOL purple, whale cyan, insider pink) | Teasers, the trailer, "smart money" content | Blips that imply real wallets or real addresses |
| **`--` for missing values** | The unknown glyph, as the risk chips render it for a null value | Only as a visual for a value that is genuinely missing in the frame. Not a brand promise, and no "unknown shows as --, not 0%" copy until SC-52 goes GREEN (the server still sends 0 for some no-data cases) | Putting `--` over a real `0%`. Swapping in `—` on a chip (the Holders tab's empty "Funded by" cell does use `—`) |

**Retired motifs:** the `SIM · PAPER TRADING` stamp and corner bug, the `SIMULATED · PAPER TRADE` PnL watermark, the mono `SIMULATED` tag, and the faucet/respawn beat. They're replaced by the DEMO corner label and by the rule that demo PnL is never the subject of a frame (§13).

---

## 11. AI art direction (key art, teasers, trailer frames, header art)

### 11.1 The look

- **Cinematic night.** 80% of the frame in shadow: navy-black (#0A0C10 to #1F242D), with low-key lighting and volumetric haze.
- **One flare.** A single **flare-amber rim or key light** (#FFB547, like warm sodium or tungsten) carves out the subject. Horizontal anamorphic amber lens flares. A faint cool cyan fill (#38BDF8 at low intensity) for depth only.
- **Film language.** 35 mm or anamorphic look, shallow depth of field, fine grain, slow push-ins, high contrast but deep blacks without crushed highlights.
- **Metaphors.** The **scope or periscope** (seeing over the trench wall). The **field guide's species**: the whale drifting over the trench, the sniper, the bundler (six identical hooded figures, one trench coat's worth), the insider, the dev. The **candle valley** (mountains whose ridges are red and green candlesticks). The **rug** (an ornate carpet yanked from under a banquet table, as a comic beat). The **war room**, the **radar**, the **curve** (a glowing amber ramp over a chasm).
- **Tone.** A deadpan wildlife documentary shot like a war epic. Obviously dramatized, a little absurd. It is a trailer for a trading terminal. The joke is how seriously it takes itself.

### 11.2 Hard rules

1. **NO text** in generated images: no letters, numbers, UI or signage. Type is added in post with brand fonts. Zoom in to 100% and reject (or retouch) any frame with hallucinated glyphs.
2. **NO real people** and no look-alikes. Humans appear only as **anonymous silhouettes**: backlit, from behind, hooded or helmeted, faces in shadow. No celebrities, no KOL likenesses, no identifiable faces. No AI-influencer or presenter characters.
3. **NO coins or chains with real logos.** No Bitcoin, Ethereum, Solana, BNB, Base or Robinhood symbols (no feather), no meme-coin mascots (no frogs, shiba dogs or other known characters), no exchange or brand marks. If a coin is needed, it's a **blank, unbranded matte disc** or an abstract light token.
4. **NO real brands, UIs, flags, military insignia or real conflict imagery.** War-room and trench are stylized metaphors. No weapons pointed at people, no casualties, no gore, nothing that reads as footage of a real war.
5. **NO money rain, lambos, yachts, rockets-to-the-moon, piles of cash** (profit imagery breaks MNC-03).
6. **Label it.** `AI-generated` burned into the pixels while the AI shot is on screen (the corner label, §10), X's "Made with AI" label turned on, and alt text that starts with "AI-generated" (ledger §6, AI).
7. **The product has no AI.** AI art never implies an "AI-powered" product (MNC-07).
8. **AI never makes the product.** Never generate UI, chips, numbers or PnL with AI, and never composite real UI into an AI shot so it passes as real footage (MNC-23). Real chips come from `video/overlays/chips/`; real UI comes from capture mode.

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
`text, letters, words, numbers, typography, watermark, signature, logo, brand, UI, screen text, real person, celebrity, recognizable face, face in focus, crypto logo, bitcoin symbol, ethereum symbol, solana symbol, bnb symbol, robinhood feather, coin with emblem, mascot, frog, dog, flag, military insignia, weapon pointed at people, gore, blood, money, cash, lamborghini, rocket, cartoon, low quality, oversaturated, neon rainbow`

### 11.4 Key-art and field-guide shot list

**Approved and still valid** (5 s clips in `marketing/video/clips/`, stills in `marketing/video/keyframes/`):

| # | Name | What's in it | Files | Use |
|---|---|---|---|---|
| F1 | **The Whale** | A whale drifting over a misty trench at dusk | `c01.mp4`, `s01.jpg`; still post `x/posts/d1-field-guide.png` | Trailer cold open, D1-P3, the whale species card |
| K1 | **The Periscope** | A brass trench periscope rising over the parapet, lens full of flare reflections | `c02.mp4`, `s02.jpg` | "so we built a scope." beat |
| F2 | **The Sniper** | The sniper species shot | `c04.mp4`, `s04.jpg` | Sniper card. Quote "bought within 3 blocks of launch." |
| F3 | **The Bundler** | Six identical hooded figures | `c05.mp4`, `s05.jpg` | "six wallets, one trench coat." |
| F4 | **The Insider** | The insider species shot | `c06.mp4`, `s06.jpg` | Insider card with the funder rule |
| F5 | **The Dev** | The dev species shot | `c07.mp4`, `s07.jpg` | Dev card, dev-sell exit beat |
| K6 | **The Rug** | A banquet table of blank discs as the ornate carpet is yanked away | `c11.mp4`, `s11.jpg` | The rug beat, "reply with your worst rug" posts |
| K7 | **The Empty Desk** | An empty desk under one amber lamp, a periscope hanging above | `c13.mp4`, `s13.jpg` | The quiet beat after the rug. Its old "respawn / faucet" meaning is retired: never caption it "respawn" or "try again" |
| K9 | **The Candle Valley** | An amber reticle hanging over a valley whose mountains are red and green candlesticks | `x/profile/art/header-art-candle-valley.jpg` (3168 × 1344) | `header-main` (§14.4). Retouch the glyph string first (§14.4) |

**Not approved:** `x/profile/art/header-art-trench-sniper.jpg` (a hooded figure aiming a rifle over the parapet) isn't in the approved kit. A rifle reads as real-conflict imagery under rule 4, so don't use it without the owner's sign-off.

**Not generated** (concepts only; each is an **optional, owner-approved** item, see §11.6): K2 The War Room (an underground bunker around a glowing amber radar table), K3 The Trench (walls of layered candlesticks, a silhouette under an amber flare), K4 The Sweep (a giant radar dish, coloured blips scattering), K5 The Curve (an amber ramp-bridge over a chasm), K8 The Lock (macro of an etched reticle with an amber flare, for an end-card backdrop).

### 11.5 Composition and post-production

- **Safe zones.** X header 1500 × 500: all type inside the centre 1100 × 360, and the bottom-left ~400 × 200 kept dark (the avatar overlaps it). 9:16 frames: subject in the centre third. Frame 0 of every video is designed as its thumbnail.
- **Leave negative space** (dark, calm) where the logo, captions or labels will sit.
- **Grade to the palette:** blacks to #0A0C10, highlights warm toward amber, greens and reds only where they carry meaning (candles).
- **Add in post, never generate:** logo, type, chips, scanlines, corner labels, disclaimers.
- **Reject or retouch** for any hallucinated glyph, a recognizable face, a real logo, a malformed hand in the foreground, or anything that looks like real combat footage.
- **Consistency.** Lock a seed or reference image per scene and animate approved stills with image-to-video. Don't generate trailer shots from scratch, or they won't match.

### 11.6 Generation budget

- Higgsfield: about **28 credits** left, of which about **3 are pre-approved**. The pre-approved spend is **one new VO take for the trailer (~1.6 credits)**, planned in `video/SCRIPT.md`.
- **The brand kit needs no new generation.** `header-main` is a crop and grade of the existing candle-valley art (0 credits). Species cards use the existing keyframes.
- Anything else is **optional and owner-approved**, with the quote checked in Higgsfield before running. Estimates here are unconfirmed: about 1–3 credits per still (for example a native 3:1 outpaint of K9, or a K8 end-card backdrop); clips cost much more, so don't plan new ones for brand assets.
- **Every optional item across the kit is totalled in one table: `video/SCRIPT.md` §19.1.** Approve against that running total, not item by item (about 26 credits remain after the pre-approved VO take).

---

## 12. Motion principles

1. **Motion means market.** Green flash = up, red flash = down, amber = focus or brand. Nothing moves just to look busy.
2. **Fast in, calm out.** UI-style motion uses the app's timings (`tailwind.config.js`): fade 140 ms, pop-in 140 ms (scale 0.97 → 1), slide-in 240 ms (8 px), drawers 200–220 ms on `cubic-bezier(0.2, 0.8, 0.2, 1)`, value flash 900 ms ease-out, curve fill 500 ms. Social transitions run 300–600 ms. Cut on the beat.
3. **Signature moves.**
   - **The lock.** Four ticks slide in from outside and the ring settles from 108% to 100% (200 ms ease-out), then one amber pulse. Use it to point at a chip, wallet or candle.
   - **The sweep.** A radar sweep reveals the next element (600–900 ms, linear).
   - **The climb.** A curve bar fills amber, then flashes green at 100%. Use it for "migrated" moments.
   - **The flash.** Numbers tick in mono with up or down background flashes, like the board.
   - **The label.** The corner label (DEMO or AI) pops in (140 ms) on the first frame of a shot, stays for the whole shot, and swaps on the cut between UI and AI shots. It is never animated away mid-shot.
   - **Logo reveal (~1.2 s).** The ring draws on (400 ms), the ticks slide in with a 40 ms stagger (200 ms), the chart line draws left to right (300 ms), and an amber glint crosses the ring (300 ms). It always ends on the intact mark.
4. **Trailer grammar.** Hard cuts. Slow 2–4% push-ins over 3 s. Anamorphic flares. Bass-hit cuts. A hook in the first second. Burned-in captions (autoplay is muted). The end card holds at least **3 s** so the disclaimers can be read.
5. **Product footage.** Captured in **marketing capture mode** (`marketing/tools/capture-mode.js`, loaded with `page.addInitScript({ path })` before navigating): the real UI on demo data with the sim-only wording hidden. 1080p capture, no cursor jitter, a keyboard overlay for hotkey clips, **DEMO on screen the whole time the UI is**. Genuine demo fills at real speed, never sped-up or edited pumps. Then:
   - **Frame check before export** (ledger §7): scan every frame for `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`, `ms` (the simulated latency in trade-panel fill toasts and the inline result line, and the status bar's ping), and the demo venue names `TrenchSwap`, `Moonpit`, `Bonkfire`, `Rayforge`, `FourPad`, `BNB Rocket`, `ClawLab`, `BaseDrop`, `EtherForge`. Any hit is a re-take, a crop or a blur. Capture mode misses some strings (the guest sign-in modal, the phone drawer's sim notice, "Paper account", "paper balance", the copy-trade/sniper/Rewards footers, the "Faucet failed" toast), so keep those screens out of frame.
   - **No "Live" badge in pre-launch footage** (status bar, board, Activity tab): crop or blur it until launch (MNC-01).
   - **Four chains in UI only**: SOL, BSC, Base, ETH. Never mock up a Robinhood Chain entry.
   - **Keep out of close-ups:** the "Safe" / "Safe contract" presets, the anti-MEV tooltip's "no sandwich attacks", the Signals "Hit 2x+" tile, Rewards rebates/cashback, and the trade-panel footer fee.
   - **Blur** demo tickers, demo KOL `@handles` and token socials in close-ups, the `· NNNms` segment of any fill toast, and on the quote the **Fees** value (it's priced from the 0.8% placeholder) and the **Route** venue name. No demo PnL, balance or equity curve as the subject of a shot.
   - **Chain chips** only once they're recoloured to neutral (§8.5, check F-7); otherwise crop them out and show the chain as text.
   - Labels in frame must read "Near graduation" and S1/S2/S3 (`components/discovery/TrenchesColumn.tsx:21`, `hooks/useSettings.ts:22`).
   - After launch, re-record on live data and swap the assets in. Live footage drops DEMO but still blurs real tickers (MNC-16) and still passes the frame check.
6. **Safety.** **No more than 3 flashes per second** (WCAG 2.3.1) and no full-screen red strobes. Provide a calm cut. In-app motion respects `prefers-reduced-motion`.
7. **Don't.** Spinning 3D coins, money rain, rocket trails, fake parabolic pumps, glitch effects over disclaimers, shaky-cam on UI.

---

## 13. Disclaimers

The exact texts live in **POSITIONING "Disclaimers"** and **ledger §6**. They're repeated here for convenience; if they ever differ, the ledger wins. Don't reword them, change their case or shorten them, except where a short form is listed. This section covers **where they go and how they look**.

| ID | Exact text | Count |
|---|---|---|
| **RISK** | `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` | 92 |
| RISK-short | `high risk · nfa` | 15 |
| **DEMO** | `UI shown with demo data` | 23 |
| **AI** | `AI-generated` | 12 |
| **CUSTODY** | `we will never DM you first, ask for your seed phrase, or ask you to send funds.` | 79 |
| **CHAINS** | `not affiliated with any chain, launchpad or exchange named.` | 59 |
| RESULTS | `your results will differ.` | 25 |
| STAT | `source: launchpad lifecycle data (secondary). approximate, and it moves month to month.` (adjust the source after S-1, no dates) | 87 |

**Where each one goes**

| Asset | Required | Placement and style |
|---|---|---|
| Any product screenshot or recording | **DEMO** | Burned into the pixels as the corner label (§10), every frame the UI is on screen, legible at phone size. Also in the alt text. A caption alone isn't enough |
| Any AI still or clip (trailer, teasers, species cards, header-main) | **AI** | Burned in as the corner label while the AI shot is on screen. **Also** X's "Made with AI" label on the post, and alt text that starts with "AI-generated" |
| Mixed edits (trailer, teasers) | DEMO + AI | DEMO on UI shots, AI on AI shots, swapping on the cut |
| Image cards (feature cards, stat cards) | **RISK-short** | Burned in at the bottom edge, Mono 500, muted. It doesn't replace RISK in a launch-day post |
| Launch-day posts about trading | **RISK** | **In the post itself**, as its last line (copy before it ≤ 186). Gated: post only once real trading works |
| Any post with a real-market stat (KS-xx) | "~" + time window in the post, **STAT** in the first reply | One stat per post. Source in the reply, never the launchpad's name in the main post |
| Any real PnL (an owner trade on the live product) | **RESULTS** | Next to the number, in the pixels and in the post. Demo PnL is never shown as a result |
| Pinned post | **CUSTODY** | The pinned self-reply (`x/TODAY.md` PIN-r1 uses it, adding "anywhere. if someone does, it isn't us.") |
| Launch thread | RISK + **CUSTODY** | RISK on the trading posts; CUSTODY as one post in the thread |
| Impersonators, "dm me for support" | **CUSTODY** | Reply with it; hide, report and block the impersonator. Never reply with a link |
| Trailer end card | **AI + RISK + CHAINS** | Under the stacked lockup and the tagline: AI, then RISK, then CHAINS. Inter 500, `muted`, ≥ 28 px on 1080p (≥ 40 px on 9:16, above the bottom 20%), held ≥ 3 s, no motion or glitch over them |
| Website | **RISK** + **CHAINS** | RISK near any trading call to action; CHAINS in every page footer |
| X bio | none required | Use the bio from `x/TODAY.md`. `high risk · nfa` may close a post-launch bio (BIO-3, §14.2) |

**Old IDs.** DIS-01 to DIS-12 are retired. Ledger §6 maps each to its replacement (for example DIS-05 SIM bug → DEMO, DIS-06 end card → AI + RISK + CHAINS, DIS-09 anti-phishing → CUSTODY).

**Design rules.** Disclaimers are part of the brand, not an apology. Mono 500, `muted` (`#8C94A3`) on dark, or the corner-label plate for DEMO and AI. Never below the §9.1 sizes, never under scanlines or glitch effects, never animated away, never cropped by X's image preview (check the crop on a phone).

---

## 14. X account kit

### 14.1 Handle options

The owner checks availability and **picks once**: X publicly counts username changes. X handles are ≤ 15 characters (letters, digits, underscore). `x/TODAY.md` sets the order: `@trenchscope`, then `@trenchscope_`, `@usetrenchscope`, `@trenchscopehq`. `x/PROFILE.md` §3 owns the full ranked list and the Phase A walk order; this table matches it.

| # | Handle | Length | Rationale |
|---|---|---|---|
| 1 | `@trenchscope` | 11 | The exact brand name. First choice |
| 2 | `@trenchscope_` | 12 | Closest fallback. Looks the same in conversation |
| 3 | `@usetrenchscope` | 14 | Standard product-account pattern. Reads as a tool |
| 4 | `@trenchscopehq` | 13 | Signals "official account": useful against impersonators, which self-custody brands attract |
| 5 | `@trenchscopexyz` | 14 | Crypto-native suffix. Pairs with a possible .xyz domain |
| 6 | `@trenchscopeapp` | 14 | Clear and neutral. Reads as a tool, not a coin |
| 7 | `@thetrenchscope` | 14 | Brand name with an article. Clean fallback |
| 8 | `@scopethetrench` | 14 | Verb-first, on-voice. Echoes "scope it before you ape it" |

Retired: `@trenchscope_sim` and `@larpthetrench` (simulator positioning).

**Display name:** `Trenchscope`. **Location:** `the trenches`. **Website:** blank until real trading works, then the owner's own domain (no shortener). **Professional category:** Software / technology (avoid finance categories until the owner has checked what X requires of financial-service accounts).

### 14.2 Bio options (all ≤ 160, counted)

| # | Bio | Count | When |
|---|---|---|---|
| BIO-1 | `one memecoin terminal for sol, base, bsc, eth and robinhood chain. see who's really buying (snipers, bundlers, insiders, the dev) before you do. self-custody.` | 158 | **Recommended** (approved in `x/TODAY.md`) |
| BIO-2b | `the trenches, with a scope. trade and track memecoins on sol, base, bsc, eth and robinhood chain. snipers, bundlers, insiders: tagged. you keep your keys. nfa.` | 159 | **The fallback.** Replaces BIO-2, which is retired: its "every wallet tagged" overstates SC-19 (most wallets match no rule). Same text in `x/PROFILE.md` §5 |
| BIO-3 | `see who's really buying. snipers, bundlers, insiders and the dev, tagged by rule. sol · base · bsc · eth · robinhood chain. you keep your keys. high risk · nfa` | 159 | Post-launch option: carries RISK-short |

Every bio names Robinhood Chain and self-custody: both are OWNER (SC-45, SC-46), so they need C-0 before Day 1. If a chain won't make the launch build (C-0) or fails C-1 on launch day, edit it out of the bio and the header the same day. No link in the bio until real trading works, and never a shortener.

### 14.3 Recurring content series

Schedules are relative: warm-up is Day 1 to Day 7, then Launch day, L+1, L+2. Space originals at least 2–3 h apart. Posts are link-free in warm-up. No series is ever "engage to win", and no follow-for-follow, pods, giveaways or bought engagement (MNC-22, CT_PLAYBOOK §3.9, §4).

| Series | Concept | Example line (count) | Cadence |
|---|---|---|---|
| **field guide** | One species per card: an approved AI shot (§11.4) with the field-guide card motif, the real wallet-tag chip, and the ledger's definition. AI corner label, X's "Made with AI" label, alt text starting "AI-generated" | "field guide to the trenches. the sniper: bought within 3 blocks of launch. natural predator of anyone who reads the chart first." (128) | Days 1–5 and 7 in the warm-up (`x/WARMUP_WEEK.md` §0; D1-P3 is the first), then weekly |
| **spot the rug** | Two or three demo-data token cards with the chips blurred: which one got bundled? Reveal the chips in a hand-written self-reply 2–4 h later, with the mechanism. Tickers blurred, never cashtagged. DEMO in the pixels | "one of these got bundled at launch. which one are you aping?" (60) / reveal: "[n] wallets bought in the block it was created. that's the bundle." (66, with the real count from the frame) | 2× a week from Day 2, then weekly |
| **rug autopsy** | A 15–25 s capture-mode replay of a launch dying: bundlers in the creation block, snipers right behind, the dev sell, the candles collapsing. The caption names the tells in order. DEMO on screen. **Demo data only, until the owner and legal approve real-chain autopsies (L-1):** a real coin's rug in our feed is a verdict on a real dev (MNC-18) and a real ticker (MNC-16). `x/REPLY_BANK.md` §5 and `x/WARMUP_WEEK.md` §9.3 follow this rule | "watch the bundlers leave before you do." (39) | From L+1 (`x/LAUNCH_DAY.md` L1-A is #1), then 1–2× a week |
| **trench dictionary** | One term per card (bundler, insider, fresh wallet, honeypot, rug ratio, migration) with the plain meaning and the code's rule (§5). A 4–6 post micro-thread once a week | "trench dictionary: insider. its first funder is the dev, the dev's funder, or one wallet that funded 3+ buyers in the first 10 minutes. not a believer. payroll." (160). Not "early, always": the dev-funded rules have no time limit | 2–3 cards a week in the warm-up (folded into the field-guide teasers and the D5-P3, D6-P2, D7-P3 cards). The warm-up's micro-thread is the lifecycle thread (D3-P2); a dictionary thread runs weekly from L+3 |
| **receipts** | A 10–15 s capture-mode clip of one feature doing its job: the risk prompt, the dev-sell exit armed, holders by tag, the quote preview (Fees value and Route venue blurred). DEMO on screen | "buy a high-risk coin from the trade panel and it lists the reasons, then makes you tick a box before you can buy anyway. you will tick the box." (143) | Daily product peeks in the warm-up from Day 2 (`x/WARMUP_WEEK.md` pillar c), then 1–2× a week |
| **shipped:** | Build-in-public changelog: a change that is **in the live build this week**. Template: "shipped: [the change]. [why, in one line]." Never present an existing feature as new, never post a roadmap item, never name competitors | "shipped: [the change]. [why, in one line]." (42 before filling) | From L+1, 1–2× a week |

**Retired series:** "guess the fate" (on live data it's a call on a real coin, MNC-18) and "paper bag diaries" (demo PnL is never a result, MNC-19). **Owner-approved exception only:** one "guess the fate" on **demo data**, recorded through its outcome before posting, never a live coin (`x/LAUNCH_DAY.md` L1-B). Without that approval, L1-B's slot takes a POV meme.

### 14.4 Profile art

**`avatar`: 400 × 400 (built, still valid).** `marketing/x/profile/avatar.png`: `mark-dark.svg` on a full-bleed `#0A0C10` square with a soft amber glow, built by `marketing/tools/profile.py`. No text. Never add a coin, ticker or chain mark inside the reticle.

**`header-alt`: 1500 × 500 (built; re-render before it goes up on Day 1).** `marketing/x/profile/header-alt.png`, a non-AI brand graphic built by `marketing/tools/profile.py`:
- `#0A0C10` with a 64 px terminal grid at ~7%. A huge cropped reticle bleeds off the **left** edge at ~11% opacity behind the avatar zone. An amber radial flare behind the headline. Scanlines at 3%.
- **Chain pill** (top-right of the type block): `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN`, Mono 600, amber outline.
- **Headline:** `see who's really buying.` Inter 600, 70 px, "really" in amber.
- **Subline as built:** `every wallet tagged before you buy · self-custody` (Mono 600, 19 px, `muted`). That repeats the SC-19 overclaim (most wallets match no rule), so this file must not go up as built.
- **Chip row:** SMART MONEY, KOL, DEV, SNIPER, INSIDER, BUNDLER, WHALE, FRESH, BOT in their tag colours, labels only, no numbers.
- **Re-render with `profile.py` before Day 1** (0 credits, no AI; header swaps don't affect verification):
  1. Subline → `snipers, bundlers, insiders, the dev: tagged · self-custody` (59 characters, fits the column at 22 px). The same wording is in `x/PROFILE.md` §7.
  2. Sizes up for phones: pill and chips 20–22 px, subline 22 px (at ~390 px wide on a phone, 15 px type shrinks to ~4 px).
  3. Drop the KOL chip if the live build has no real KOL source (F-2), and drop any chain from the pill that won't be in the launch build (C-0) or fails C-1.

**`header-main`: 1500 × 500 (to build; no generation needed).** From the approved candle-valley art, `marketing/x/profile/art/header-art-candle-valley.jpg` (3168 × 1344, AI-generated).
- **Retouch first.** The art has a hallucinated glyph string in the sky at about x 1520–1610, y 370–385 (source pixels), just left of the right-hand candles. Paint it out with the surrounding sky, then check the whole frame at 100% for any other glyphs (§11.2, rule 1).
- **Crop:** full width, the band y 40–1096 (3168 × 1056, exactly 3:1), scaled to 1500 × 500. That puts the reticle's centre at about (476, 212) with its ticks spanning about y 83–341, inside the phone-safe band, and leaves the dark field at x ≈ 1000–1500 for type.
- **Grade:** blacks to `#0A0C10`, scanlines 3%, light grain. Darken the **bottom-left 400 × 200** with a `bg` gradient (to about 70% at the corner): the left mountain's red candles sit there and the avatar overlaps it.
- **Type (in post, centre-right, right-aligned at x ≈ 1300, inside the centre 1100 × 360):**
  - Chain pill: `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN`, Mono 600, 20–22 px, **`muted` outline** (the art's reticle is already the amber focal point).
  - Headline on two lines: `see who's` / `really buying.`, Inter 600, 56–64 px, `#E6E9F0`, "really" in amber. Put a soft `bg` radial plate (~60%) behind it where the right candle ridge reaches the type.
  - Brand line: `the trenches, with a scope.`, Mono 600, 22 px, `muted`.
  - **AI corner label:** `AI-generated`, Mono 500, 20 px, bottom-right inside the safe zone (≈ x 1300, y 420).
- **No logo** on it (the avatar carries the mark, and the art already has a reticle), no URL, no date, no chips.
- **Build:** add a `header-main` job to `marketing/tools/profile.py` that composes the retouched crop with the type layer, so it can be re-rendered when a chain drops out.
- **QA:** a phone check at ~390 px wide (the pill and brand line will be small; the headline must read), no amber-on-amber, the avatar zone calm, the reticle not cropped.

**Swap plan.** `header-alt` (re-rendered as above) is up from Day 1 (`x/TODAY.md`). Switch to `header-main` once it passes QA, any time in the warm-up. Keep `header-alt` for the post-launch refresh. Either header names five chains: re-render without any chain that won't be in the launch build (C-0) or fails C-1 before launch day.

**Pinned post.** Use **PIN-v2** (276, `x/TODAY.md` and `x/PROFILE.md` §9.2) and **PIN-r1** (118) from `x/TODAY.md`: text only, link-free, and never edited later to add a link. PIN-r1 is CUSTODY plus "anywhere. if someone does, it isn't us." PIN-v2 fixes the three ledger flags in the original PIN ("every wallet gets a tag", "risky buys ask first", "kol"); the original PIN is retired. PIN-v2 says "you keep your keys." and names five chains, so it needs C-0. Don't re-post its lines as an original later (duplicate text).

---

## 15. Pre-flight checklist (every asset)

**Claims and copy**
- [ ] The voice passes the four pillars: straight about risk, specific, funny without punching down, explains without advising.
- [ ] Every product claim maps to a ledger SC row that is GREEN, or OWNER with its owner check ticked (C-1 per chain, K-1/K-2 custody, F-1 to F-6 features).
- [ ] Every number is a KS stat (hedged with "~" and a time window, STAT reply ready, re-verified the day before: S-1) or a real owner trade with RESULTS. No demo-data number is presented as real.
- [ ] Nothing from ledger §5 (MNC-01 to MNC-23) appears, in the copy, the image, the alt text or the voice-over: no profit talk, fake results, token, accuracy, "AI-powered", superlatives, "first/only", competitors, chain endorsement, real people, real tickers.
- [ ] **No dates** anywhere: copy, image, video, alt text.
- [ ] **"Live", "trade now" and `[LINK]` only in a gated launch-day post**, posted once real trading works on every chain it names.
- [ ] Chains named as supported chains only: Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain (or sol, base, bsc, eth, robinhood chain). Never "robinhood" alone. No chain logos or brand colours. Any chain that failed C-1 is out of the copy and the header.
- [ ] No simulator wording: paper (paper trading, paper wallet, paper bag), sim, simulated, fake money, faucet, respawn, "no real funds", "larp the trenches". "paper hands" in a joke about people is fine (§5).

**Visuals**
- [ ] Colours: one amber focal point. Green and red only for up and down. No chain colours. Every chip carries a label.
- [ ] Type: Inter + JetBrains Mono, numbers in mono, nothing under 20 px on a 1080 canvas, disclaimers in exact case.
- [ ] Logo: correct version for the background, clear space respected, unaltered, never locked up with another brand.
- [ ] AI art: no text or glyphs (checked at 100%), no real people, no coin or chain logos, no brands or insignia, no weapons aimed at people, no profit imagery. No AI-made UI, chips or numbers.

**Disclaimers and labels**
- [ ] DEMO burned into every product frame and in the alt text. AI burned into every AI frame, X's "Made with AI" label on, alt text starts "AI-generated". Mixed edits swap the label on the cut.
- [ ] RISK as the last line of every launch-day trading post. RISK-short on image cards. CUSTODY in the pinned self-reply and the launch thread. AI + RISK + CHAINS on the trailer end card, held ≥ 3 s. RISK + CHAINS on the website.

**Product footage**
- [ ] Captured in marketing capture mode on demo data.
- [ ] Frame check done for `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`, `ms`, and the demo venue names (`TrenchSwap` and the demo launchpads, §12.5). Fees value and Route venue blurred on any quote. Capture-mode gaps kept out of frame.
- [ ] Chain chips recoloured to neutral (F-7) or out of frame.
- [ ] No "Live" badge in pre-launch footage. Four chains only in the UI, no Robinhood Chain mock-up.
- [ ] Out of close-ups: "Safe" presets, the "no sandwich attacks" tooltip, the "Hit 2x+" tile, Rewards rebates, the footer fee. Demo tickers, handles and socials blurred. No demo PnL as the subject.

**X hygiene and format**
- [ ] No hashtags, no exclamation marks, no link before launch (never in the pinned post while following), no mass tags, no duplicate text, no cashtags.
- [ ] Length: ≤ 280 measured with `xlen.py` (the count includes RISK), bios ≤ 160. Count written next to the draft.
- [ ] Images: alt text written. Headers checked at ~390 px wide with the avatar zone calm. Video: frame 0 works as the thumbnail, captions burned in, ≤ 3 flashes per second.
- [ ] Organic only: no follow-for-follow, pods, follow/RT giveaways, bought engagement, automated or templated replies (MNC-22).
