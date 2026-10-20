# Reply & shitpost bank

| | |
|---|---|
| **For** | Whoever runs the brand account, from warm-up Day 1 onward. This file holds **replies and filler originals**. The scheduled posts live in `x/TODAY.md` (Day 1), `x/WARMUP_WEEK.md` (Day 1 to Day 7) and `x/LAUNCH_DAY.md` (Launch day, L+1, L+2) |
| **What we're marketing** | A memecoin trading terminal that trades and tracks across **Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain**, with **self-custody** (`research/POSITIONING.md`). The warm-up teases it. Nothing in this bank says it's "live": only the gated launch-day posts do |
| **What's inside** | 61 reply templates in 10 situations · 30 one-liners · 12 polls · 10 meme cards with exact copy and alt text (`meme-1` … `meme-10`) |
| **Rules come from** | `research/POSITIONING.md` (the binding brief), then `research/CLAIMS_LEDGER.md` (claim IDs SC-xx, stats KS-xx, never-say MNC-xx, disclaimers, owner checks; it wins over this file), `x/TODAY.md` (the approved Day-1 kit), `research/CT_PLAYBOOK.md` (ranking, spam rules), `brand/BRAND_GUIDE.md` §4–5 (voice, vocabulary). On a given day, a stricter note in `WARMUP_WEEK.md` or `LAUNCH_DAY.md` wins |
| **Claims checked** | Every product line maps to a ledger ID and was re-checked in the code (`web/` = `apps/web/src/`, `server/` = `apps/server/src/`, `shared/` = `packages/shared/src/`). The code is still the simulator build, so real execution, self-custody, Robinhood Chain and the fee number are **OWNER** claims (ledger §1) |
| **Placeholders** | `@trenchscope` (handle not confirmed), `[LINK]` (no live URL; nothing in this bank needs one), `[SUPPORT]` (the help path the owner picks, `LAUNCH_DAY.md` §1.2), `[K-2 ANSWER]` (the owner's line on how automated orders sign) |
| **Schedule labels** | Day 1 … Day 7, Launch day, L+1, L+2, L+3 … No dates anywhere: not in replies, posts, images or alt text (MNC-21) |
| **Character counts** | X-weighted, measured with `xlen.py` (`·`, `—` and `–` count 1; `→`, `…`, `≥` and emoji count 2; a URL counts 23). Text inside `{braces}` is a **slot**: it must change every time, and the words inside are a working default. Counts are for the default with the braces removed. Every post and reply here is ≤ 280. Poll options are ≤ 25 |
| **IDs** | `R01`–`R61` are this bank's replies. `WARMUP_WEEK.md` has its own reserve bench `R1`–`R7`: a different list |

**Tags used below**

| Tag | Meaning |
|---|---|
| **[TS]** | Mentions Trenchscope under **someone else's** post. Fires only on its **Trigger**: a question in that post or thread that it answers. No question, no [TS] (§1.2) |
| **[ANS]** | An answer about us (§2.9). Under our own posts, answer freely. Under someone else's post it counts as [TS] and needs the question asked to us |
| **[SAFE]** | A scam or impersonator warning (§2.10). Never counts against the budget. Names no feature, carries no link |
| **[gate X]** | Needs the owner check X (ledger §8) ticked first: **C-0** before launch (each chain named and self-custody are in the launch build; teasers only), **C-1** per chain and **K-1** custody for anything after launch, **K-2** how automated orders sign, **F-1** feature in the live build, **T-1** token, **Fees**. Not ticked → don't post it |
| **[stat]** | Real-market number (AMBER). Keep the "~" and the time window, re-verify first (S-1), have the STAT line ready |
| **[truth]** | Only true if the asset or the moment matches. Check it first, or don't post it |
| **+RISK** | After the launch gate passes, this one ends with RISK (`memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.`, 92). Its body is ≤ 186, so it fits. Before launch it goes without RISK, as the warm-up posts do, unless the legal check (L-1) says otherwise |

**Disclaimers used here** (exact text, ledger §6): **RISK** (above) · **CUSTODY** `we will never DM you first, ask for your seed phrase, or ask you to send funds.` (79) · **DEMO** `UI shown with demo data` (23) · **AI** `AI-generated` (12) · **CHAINS** `not affiliated with any chain, launchpad or exchange named.` (59) · **RISK-short** `high risk · nfa` (15) · **STAT** `source: launchpad lifecycle data (secondary). approximate, and it moves month to month.` (87).

---

## 0. At a glance

| Section | Count | Use it for | Pace |
|---|---|---|---|
| §2 Replies | 61 in 10 situations | Value replies under other people's posts (§2.1–2.8); answers under our own posts (§2.9); scam warnings (§2.10) | 10–15 a day on Day 1, rising to 25–40 by Day 7. Launch day: every reply under our posts, plus 3–5 value replies an hour between. L+1: 30–60. Each skeleton at most once a day |
| §3 One-liners | 30 | Filler originals, swap-ins when an asset isn't ready, quote-post captions | Day 1 to L+2: only as a swap-in the day's plan allows (those days are full). From L+3: at most 1 a day, in an empty window, 2.5–3 h from any other original |
| §4 Polls | 12 | Learning what the audience fears, cheap replies | Start no earlier than **L+5**: the warm-up runs polls on Day 1 and Day 4 (R4 in reserve) and `LAUNCH_DAY.md` runs L2-B on L+2. Then 1 every 2–3 days, 24 h each |
| §5 Meme cards | 10 | Image originals, rendered from `marketing/tools/cards.py` | From L+3: 1–2 a week, never two on the same day. Before that, only a type-only card (meme-1, 2, 4, 8, 9, 10) as a swap-in |

---

## 1. Usage rules

These matter more than any single line in this file. One spam label costs more reach than a week of good replies earns, and on a self-custody brand one careless reply can look like a scam.

### 1.1 The rules

1. **Templates are skeletons, not text.** Never paste the same reply twice: not to two accounts, not on two days. X clusters near-duplicate replies and labels them `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4).
2. **Every reply picks up one specific thing from the post you're replying to**: their number, their chart shape, their minute, their exact complaint. If you can't add one specific thing, like the post and move on. (The one exception is R42, the serious-loss line: kindness, nothing clever.)
3. **Rewrite three things every time:** the opener, the slot detail, and the shape of at least one sentence. §1.5 shows a worked example.
4. **Each skeleton at most once a day and three times a week.** Keep a private log (day, account, template ID, first five words) so you don't repeat yourself.
5. **Four out of five replies never mention Trenchscope.** The job of a reply is to be the most useful reply under that post. People find the account from the profile click, not from the plug.
6. **Type every reply by hand.** No auto-replies, keyword triggers, reply bots, or any tool that posts replies for you. Metricool never posts replies (`PROFILE.md` §11.2).
7. **No links in replies before the launch gate passes.** After that, a link goes only to someone who asked for it, once per thread, on the owner's own domain, never a shortener. Even then, prefer "first reply on the pinned post": a link in a reply to a non-follower can trip X's low-quality-URL rule (`LAUNCH_DAY.md` §6.1).
8. **No tags, no cashtags, no contract addresses.** Don't `@` anyone who isn't already in the thread. Never write `$` before any ticker, real or demo. Never repeat a CA, even one the poster shared.
9. **No verdicts on real coins.** No "that's a rug", "it's fine", "buy", "sell", "hold" and no price calls. Explain the mechanism in general terms instead.
10. **No names.** Never name a real dev, KOL, launchpad, terminal or bot, even when the poster did. That includes demo-data token and launchpad names, because some echo real brands.
11. **Stats only from the ledger, always hedged** (ledger §4). Real-market numbers keep "~", a time window and "one dataset" or "major launchpads", and the source line is ready if someone asks. A number from one of our clips is demo data: say so, and never use it as a market fact (MNC-19).
12. **Never aim "larp", "jeet", "scammer" or "exit liquidity" at a person.** Self-deprecation only. "Everyone in the trenches is larping" is about the market, never about one account.
13. **No hashtags.** At most one emoji, and only when the emoji is the joke. No exclamation marks.
14. **Pace like a person:** no more than 8–10 replies an hour, spread across the posting windows. Twenty replies in ten minutes reads as a bot.
15. **On our own posts, answer every real reply within the first hour**, each one in fresh words. Mutual replies carry the most weight in ranking (CT_PLAYBOOK §3.2).
16. **Never DM anyone first, and never ask for a seed phrase, a private key, a "wallet sync" or funds**, not even as a joke. Help people in public, or point them to `[SUPPORT]`. That's the promise in CUSTODY, and the account keeps it in every reply.
17. **Nothing says "live" in this bank.** Before the launch gate passes: no "live", "trade now", "sign up", "try it", "launching", "soon" or link. (The warm-up's single `soon.` is D7-P4, a post, never a reply: ledger MNC-01.) "is it live?" gets "not yet" (R52), never "soon" (MNC-01, MNC-13). After launch, the gated launch-day posts carry the news; replies say "yes" and point to the pinned post.
18. **Chains are supported chains, never partners.** Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain; short forms sol, base, bsc, eth, robinhood chain. Never "robinhood" on its own, never "official", "partnered" or "powered by" (MNC-14). A chain that fails its check (C-1) leaves every reply.
19. **No token talk.** No token, airdrop, points, rewards, rebates or "wen" jokes, from us or about us (MNC-02). "wen token?" gets silence until the owner decides (R53, T-1).
20. **No profit, safety or speed words.** No "profit", "earn", "returns", "safe", "protects", "detects", "predicts", "fastest", "first", "only" about us (MNC-03, 06, 08, 09, 17). "take-profit" and "stop-loss" are order names, so they're fine.

### 1.2 The mention budget ([TS] replies)

| When | Max [TS] replies under other people's posts | Conditions |
|---|---|---|
| **Day 1** | **0** | No product mention at all (`WARMUP_WEEK.md` Day 1) |
| **Day 2** | **1**, only if asked | `WARMUP_WEEK.md` Day 2 note |
| **Day 3** | **1** | Only on its trigger (`WARMUP_WEEK.md` Day 3 note) |
| **Day 4** | **2** | `WARMUP_WEEK.md` Day 4 note |
| **Day 5** | **0**, or **1** if someone asks directly | `WARMUP_WEEK.md` Day 5 note |
| **Day 6, Day 7** | **1 a day** | `WARMUP_WEEK.md` Day 6 and Day 7 notes. Never drop "soon" or the launch under other people's posts (Day 7) |
| **Launch day** | Under our own posts, answer everything (§2.9 and `LAUNCH_DAY.md` §9.1). Under other people's posts, **at most 1 in 5** | A link only to someone who asked for it |
| **From L+1** | **At most 1 in 5 replies, and at most 5 a day** | Never two [TS] replies to the same account in one week |
| **Gate not passed after Day 7** | Stay at **1 a day** | Replies stay pre-launch: no "live", no date, no "soon" |

**Every [TS] reply needs a question in the post or thread that it directly answers**, at every stage, including after launch. A matching topic is not a trigger: a dev-sold post with no question gets R16–R19, not R20. An unprompted plug under someone else's post is the reply-spam pattern X's classifiers are built to catch.

- **[ANS] answers** (§2.9) don't count under our own posts. Under someone else's post they count as [TS], and only when the question is aimed at us.
- **[SAFE] warnings** (§2.10) never count. They name no feature and carry no link, so they aren't plugs.
- **After launch, a [TS] reply ends with RISK** (+RISK). RISK repeats word for word, so everything else in the reply must be new. The 1-in-5 cap keeps the repeats rare; check Under the Hood weekly for a duplicate-text label.
- **Never post a [TS] reply** under an account above ~250k followers (an LLM scores reply quality there) or under someone's real-money loss, even if they asked.

### 1.3 Targets and etiquette

**Where each situation lives** (follow categories from `PROFILE.md` §10.1, searches there):

| Situation | Reply group | Who posts it | Notes |
|---|---|---|---|
| Rug post-mortems, loss posts | §2.1 | Trench traders (cat. 2), security researchers (cat. 5) | Empathy first. No product, ever |
| Win screenshots | §2.2 | Trench traders (cat. 2) | Questions beat compliments |
| "what should i use?" | §2.3 | Newcomers and educators (cat. 7), traders (cat. 2) | The one place a plug fits, on its trigger |
| Dev dumps, bundled-launch exposés | §2.4, §2.5 | On-chain sleuths (cat. 1) | Add the mechanism, never a verdict |
| gm posts | §2.6 | Mutuals | At most 3 a day |
| Red days, green days | §2.7 | Traders and meme accounts (cat. 2, 3) | No predictions |
| New launchpad or curve meta | §2.8 | Launchpad watchers (cat. 4), builders (cat. 6) | Never name the launchpad |
| Questions about us | §2.9 | Our own replies, mostly | Answer every real one |
| Impersonators, fake support, fake links | §2.10 | Our replies, the impersonation search (`PROFILE.md` §8.1) | Warn the person, then hide, report, block |

**Big accounts: how not to reply-spam them**

- **Target the 5k–200k-follower range** within 30–60 minutes of the post. That's where a good reply gets seen and doesn't get buried.
- **One reply per account per day.** Three a week at most, unless they reply back, at which point it's a conversation and you continue it naturally.
- **One reply per thread.** Don't reply to the post and then to three replies under it.
- **Don't be their shadow.** Replying to every post from the same KOL gets you muted, and in the ranker one mute (−58.8) cancels out roughly 90 likes (0.66 each) (CT_PLAYBOOK §3.2).
- **Above ~250k followers, use only your most specific line**, never a [TS], never a gm. If you have nothing specific, skip it.
- **Never quote a big account just to get in front of its audience.** Quote only when you're adding a mechanism (CT_PLAYBOOK §1.3), and never to dunk on someone.
- **If they ignore you three times, stop replying to them.**
- **Official chain, launchpad and exchange accounts:** don't reply under them at all. It reads as affiliation-seeking (MNC-14). Watch them from a private list (`PROFILE.md` §10.4).

### 1.4 Don't reply to

- **Real-money distress.** Rent money, savings, debt: no jokes and no product. R42, or nothing at all. If a post suggests someone might hurt themselves, don't reply as the brand; report it through X's self-harm option so X can offer support resources, and tell the owner.
- **Scams and their bait:** airdrop claims, "fund recovery", fake support, "connect wallet to verify", "wallet sync", "migrate your tokens". Under our own posts, hide, report and block (§2.10). Never reply under the scammer's own post.
- **Token and airdrop farming threads** ("wen token", "drop your wallet for the airdrop", points speculation), wherever they are. Don't join them (rule 19).
- **Engagement farming:** "drop your CA", "reply gm for a follow", follow-for-follow, giveaway threads, "shill me your coin".
- **Terminal-vs-terminal threads, and competitors' own accounts.** We don't compare (MNC-10).
- **Price-call requests on real coins** ("is this going to run?"). No calls (MNC-18).
- **Politics, tragedies and news about real people.** Not our lane.
- **Accounts that look like bots** (no history, generic replies to everything).

### 1.5 How to rewrite a skeleton (worked example)

Skeleton R01 (§2.1):

```text
{rough.} cheapest tell on these is the launch block. if the first {30} buyers were all funded by the same wallet, the chart was decided before you ever saw it.
```

Under a post that says *"bought at 40k mc, dead 6 min later"*, one honest rewrite (example only, don't paste):

```text
6 minutes is brutal. on launches that die that fast it's usually the creation block: a bunch of wallets topped up by one funder, selling into the first real buyers.
```

Under a different post, *"chart looked perfect then -90% in one candle"*, a different rewrite:

```text
that one-candle drop usually means a few wallets held a lot from the very first block. if they were funded from the same place, the "perfect chart" was mostly them.
```

Same idea, different opener, different detail, different sentence shapes. That's the bar for every reply.

### 1.6 The 5-second check before you hit reply

- [ ] Does it mention something specific from their post?
- [ ] Would this be a good reply if Trenchscope didn't exist?
- [ ] Is it worded differently from every reply I've sent this week?
- [ ] No ticker, no CA, no name, no link, no tag, no verdict, no price call?
- [ ] No "live", "soon", date, token, profit, safety or speed word?
- [ ] If it names a chain: is it one that passed C-0 (before launch) or C-1 (after), named as a supported chain?
- [ ] If it has a number: is it from the ledger, hedged, and not a demo-data number dressed as market data?
- [ ] If it's a [TS] after launch: does it end with RISK?

---

## 2. Reply templates (61)

The **[TS]** ones under other people's posts are the exception, not the default, and fire only on their **Trigger**. The rugged, gm, market and launchpad groups have none. §2.9 is for questions about us; §2.10 is for scams.

### 2.1 Someone got rugged

**Read the room.** Empathy first. Never sound like "you should have checked". Never ask for the coin's name or CA. **No product in this group, ever, even if they ask** (§1.2): someone who just lost money is not a lead. If the loss sounds serious (rent, savings), use only R42. Openers to rotate: `rough.` · `brutal.` · `oof, sorry.` · `been there.` · `that one stings.` · `classic, and still awful.`

**R01 · the launch-block tell** · `155/280`

```text
{rough.} cheapest tell on these is the launch block. if the first {30} buyers were all funded by the same wallet, the chart was decided before you ever saw it.
```

Use when they post the chart or the timeline. Swap the slot for their detail (their minute, their entry). A general mechanism, no product.

**R02 · ask what they saw** · `161/280`

```text
{brutal.} what did the holders look like when you bought? top 10 share, the dev's bag and fresh wallets usually tell the story a few minutes before the chart does.
```

A question gets a reply back, and a reply back is the strongest signal there is. Answer their answer.

**R03 · how a slow rug looks** · `205/280`

```text
{if it's the slow kind:} nobody pulls the pool. someone sells small pieces every few minutes so it reads as a dip. the trade list gives it away before the chart does: same wallets, similar sizes, on a timer.
```

Only when the chart really is a slow bleed (hours, not one candle). The opener stays conditional (`if it's the slow kind:` · `if that's a slow bleed:`): describe the mechanism, never label their coin a rug (rule 9).

**R04 · gallows humour** · `160/280`

```text
{pouring one out.} every trench veteran has a coin they don't say out loud anymore. {usually the one with a five-phase roadmap and a dev who left during phase one.}
```

Only for small or joking losses, when the poster is laughing too. Never under a serious loss.

**R05 · rugged again: not a you problem** · `150/280`

```text
{again is the worst part.} the coins that get people twice are built by people who do this full-time. that's not a you problem. that's a business model.
```

For "rugged again", "third time this week", "i never learn". It takes the shame out without telling them what to do. No mechanism lecture, no product.

**R41 · rugged again: close the tabs** · `126/280`

```text
{rough run.} close the tabs for a night. the trenches will still be launching coins tomorrow, and none of them need you tonight.
```

For a losing streak posted in frustration. Kind, a little dry, no advice about sizing or strategy (MNC-18).

**R42 · the serious one** · `81/280`

```text
{really sorry. that's a heavy one.} look after yourself first. the charts can wait.
```

For rent, savings or debt. The only line in the bank with no specific detail, on purpose: say it in fresh words each time, then leave the thread alone. No joke, no mechanism, no follow-up plug, no "nfa".

### 2.2 Someone posts a huge win

**Read the room.** Celebrate. Never call it fake or a larp, never ask for the CA, never imply anyone can repeat it, and never repeat the ticker. Questions about how they did it beat compliments. **No product in this group**: a plug under a win reads as "use our tool and win" (MNC-04). Openers: `clean.` · `congrats, genuinely.` · `that's a good day.` · `respect.` · `well played.`

**R06 · the entry question** · `123/280`

```text
{clean.} the part nobody screenshots is the entry: how early, what size, what the holders looked like. what made you take it?
```

**R07 · the exit question** · `135/280`

```text
{congrats, genuinely.} the entry gets the screenshot but the exit is the hard part. did you {scale out on the way up} or take it in one go?
```

A question, not advice. Don't follow up with what they "should" have done.

**R08 · the graveyard joke** · `120/280`

```text
{well played.} one trade like this and the whole graveyard of coins that went quiet suddenly counts as research. enjoy it.
```

**R09 · the trenches aren't dead** · `145/280`

```text
{respect.} saving this for the next person who says the trenches are dead. they're not dead. they're just very picky about who leaves in one piece.
```

**R10 · keep the receipts** · `152/280`

```text
{that's a good day.} write down what you saw before you bought: the holders, the dev, the timing. future you will want the notes more than the screenshot.
```

### 2.3 Someone asks for a terminal rec

**Read the room.** Never name, rank or dunk on any terminal, bot or launchpad, including ones other repliers suggest (MNC-10). Give criteria they can apply to anything. Use **[TS]** only when the question is open ("what should i use?"), once per thread. Never call it the best, the first, the safest or the fastest.

**R11 · four things to check** · `188/280`

```text
whatever you pick, check four things: you keep your own keys, the full cost shows before you click, wallets come labelled (dev, snipers, bundlers), and it warns you before a high-risk buy.
```

Criteria, not a plug: no product named. Self-custody leads because it's the one that protects against the scams in §2.10.

**R12 · habit beats tool** · `157/280`

```text
{honestly} the tool matters less than the order: holders first, chart second, buy button last. whichever one makes that order easiest is the right one for you.
```

**R13 · the fee test** · `194/280`

```text
one test for any rec you get: ask what a {0.5 sol} trade costs all in. platform fee plus priority fee plus tip. on small trades that adds up fast, and whoever recommends it should know the number.
```

Swap the slot for the chain's native coin. Never put a fee figure for a named product in the reply (KS-11 is our own arithmetic, not a measured stat). If someone answers "and yours?", that's R49: the fee is on the quote, and no number until it's final.

**R14 · [TS] [gate K-1, F-1] the biased answer** · `151/280` · after launch `+RISK 239/280`

Before launch:

```text
biased answer, {we're building one}: trenchscope. it tags the snipers, bundlers, insiders and the dev on every coin, and you keep your keys. pinned post.
```

After launch (slot becomes `we built one`, RISK added):

```text
biased answer, we built one: trenchscope. it tags the snipers, bundlers, insiders and the dev on every coin, and you keep your keys. pinned post.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Trigger:** an open "what should i use?" question, once per thread. "pinned post" points to the pin before launch, and to the trailer (with `[LINK]` in its first reply) after. Paste `[LINK]` only if they reply asking for it. **Claims:** SC-21, SC-21d (per-coin sniper, bundler, insider and dev tags: `server/analytics/tokens/track.ts:8-13,99-101,207-212`), SC-46 "you keep your keys" (**OWNER**: C-0 before launch, K-1 after). If the check for that stage isn't ticked, cut ", and you keep your keys" (re-measure). Never "every wallet gets a tag" (ledger SC-19).

**R15 · [TS] [gate K-1 for the post, F-1] for someone brand new** · `184/280` · after launch `+RISK 272/280`

Before launch:

```text
if you're new: the chart lies more than the wallets do. {we're building} a terminal that tags the snipers, bundlers, insiders and the dev on every coin, so you see who you're up against.
```

After launch:

```text
if you're new: the chart lies more than the wallets do. we built a terminal that tags the snipers, bundlers, insiders and the dev on every coin, so you see who you're up against.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Trigger:** the poster says they're new and asks where to start or what to use. It offers a view, not an outcome: never add "so you won't get rugged" or "learn to win" (MNC-03). No sizing advice ("start small"): RISK carries the "afford to lose" line. **Claims:** SC-21, SC-21d (as R14).

### 2.4 Dev-sold drama

**Read the room.** No verdict on the real dev ("scammer", "rugger"), no names, no "that's a rug". Explain what the sell means and ask about the sizes. Openers: `oof.` · `the classic.` · `ah, the dev.` · `there it is.`

**R16 · timing and size** · `205/280`

```text
a dev selling isn't automatically a rug. what matters is when and how much: dumping into the first wave of buyers is an exit plan, a small sell weeks later might just be rent. {what did the sizes look like?}
```

**R17 · the résumé** · `195/280`

```text
worth pulling up the wallet's history: how many coins it launched before this one, how many ever left the curve. 20 launches, 0 migrations doesn't prove anything. it's just a very specific hobby.
```

General advice on what to look at. Most launches never graduate (KS-01), so a long list with nothing migrated is volume, not proof of intent: the joke says so instead of calling the dev a scammer. The numbers are a hypothetical, not a real wallet. Never post the history of a real dev wallet yourself.

**R18 · character arc** · `75/280`

```text
"dev is based" to "dev sold" is still the fastest character arc in fiction.
```

**R19 · the scarier dev** · `191/280`

```text
unpopular take: a dev who sold everything can't dump that bag twice. the scarier one is still sitting on a big chunk and stopped posting. (their friends' wallets are a separate conversation.)
```

**R20 · [TS] [gate K-2, F-1] the dev-sell exit** · `167/280` · after launch `+RISK 262/280`

Before launch:

```text
{we're building one:} a dev-sell exit you attach to the buy. the dev sells 20%+ of their bag in one trade, your sell fires right after. it reacts. it doesn't read minds.
```

After launch (slot becomes `trenchscope has one:`):

```text
trenchscope has one: a dev-sell exit you attach to the buy. the dev sells 20%+ of their bag in one trade, your sell fires right after. it reacts. it doesn't read minds.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Trigger:** someone asks "is there a way to auto-sell when the dev sells?" or "how do you get out when the dev dumps?". Tense follows R14/R15/R35/L23: "we're building" before launch, "trenchscope has one" after. **Claims:** SC-14, SC-41 (GREEN): fires when the creator sells at least X% of that wallet's holding in one trade; attached to a buy, X is the 20% default (`server/trading/orders.ts:29,183-184,270`; the 10/20/50/80% selector is on the Sell side, `web/components/token/trade/AutoForm.tsx:43-48`). It **reacts after** the dev's sell. Never "before the dev", "beat the dev", "front-run" or any speed claim (MNC-08, MNC-17). **K-2:** exits run server-side in the code; with "you keep your keys" on the profile, the next reply will be "how?". Have R45 ready, or skip R20 until K-2 is answered. Don't use it within 48 h of D5-P2 (Day 5), which makes the same point.

### 2.5 Bundler drama

**Read the room.** Someone exposed a bundled launch, or got caught in one. Add the mechanism, separate bundles from snipers, and never say a tool "detects" bundles (MNC-06). Openers: `good catch.` · `textbook.` · `yep.` · `this is the pattern.`

**R21 · how to spot it** · `207/280`

```text
how to spot it yourself: wallets that bought in the same block the coin was created, usually topped up from one source a few minutes earlier. that's supply grabbed before anyone else could even see the coin.
```

**R22 · what they still hold** · `176/280`

```text
the number that matters now isn't how much got bundled, it's how much the bundle still holds. a bundle that already sold is a scar. a bundle still sitting on {40%} is a trapdoor.
```

Swap the slot for the share the poster gave. If they didn't give one, drop the number: "a bundle still sitting on a big chunk is a trapdoor."

**R23 · the stealth launch** · `85/280`

```text
every "stealth launch" somehow has {30} wallets that heard about it in the same second.
```

**R24 · funding trail or timing?** · `161/280`

```text
{good catch.} was it the funding trail or just same-block timing? timing alone can be snipers racing each other. a shared funder is what makes it look coordinated.
```

(Not "shared funders make it a bundle": our own tag rule calls any creation-block buyer other than the dev a bundler, R25, and a shared dev funder is the insider rule. Don't define it two ways.)

**R25 · [TS] [gate F-1] how trenchscope tags it** · `180/280` · after launch `+RISK 274/280`

```text
how trenchscope does it: any wallet but the dev that buys in the creation block gets tagged bundler, and the audit shows their share of the volume. it's on the coin before you buy.
```

After launch, the same text plus a blank line and RISK.

**Trigger:** someone asks how to spot a bundled launch, or which tool shows bundles. **Claims:** SC-21 bundler rule (a non-creator buy in the creation block: `server/analytics/tokens/track.ts:8,207-209`, `a !== t.creator`), SC-09 audit row = share of traded volume (`server/analytics/tokens/index.ts:476,496`; thresholds in `server/analytics/tokens/security.ts:470-597`). Say "tags", never "detects". Don't quote the UI tooltip's "likely linked to the dev" (ledger 2.2). Worded differently from D3-P3 on purpose; don't use it the same day.

### 2.6 "gm"

**Read the room.** A bare "gm" is a spam signal. Only say gm to accounts you already talk to, or under a gm post with fewer than ~50 replies, and always add one real line. **At most 3 gm replies a day. Never under mega-account gm posts.** No [TS] in this group, ever.

**R26 · new me** · `77/280`

```text
gm. {checking holders before charts today.} new me. probably lasts until lunch.
```

**R27 · not you** · `89/280`

```text
gm to everyone except whoever keeps buying the launch block of every coin since midnight.
```

**R28 · the order of operations** · `70/280`

```text
gm. coffee first, top 10 holders second, buy button never before both.
```

**R29 · gn for the snipers** · `73/280`

```text
gm. the trenches never closed, so technically this is gn for the snipers.
```

**R30 · tab count** · `79/280`

```text
gm. {four} tabs open, {three} of them coins that already went quiet. healthy start.
```

### 2.7 Market dump / pump

**Read the room.** No predictions ("bottom's in", "send it"), no price targets, no "buy the dip", no "this is the top". Humour and mechanism only. R31, R32 and R35 are for red days. R33 and R34 are for green days.

**R31 · red day: holders vs chart** · `95/280`

```text
red days are when you find out which of your coins had holders and which ones just had a chart.
```

**R32 · red day: nobody's a genius** · `95/280`

```text
nobody's a genius on a red day, which makes it the most honest day of the week in the trenches.
```

**R33 · green day: everyone's early** · `71/280`

```text
green days are when everyone's early and nobody checks who was earlier.
```

**R34 · [stat] green day: the footnote** · `191/280`

```text
enjoy it. sobering footnote: in one major launchpad's data (secondary, approximate), ~73% of graduates were down 60%+ from their migration price within 20 minutes. the curve is the easy part.
```

KS-02 (AMBER), hedged, with the source note inline, because a second self-reply in someone else's thread breaks the one-reply-per-thread rule (§1.3). If anyone asks for more, reply in fresh words with the meaning of: `source: launchpad lifecycle data (secondary), one launchpad, sample window not published. approximate.` **Verify first** (S-1, ledger §4.1): if D7-P2 had to be swapped for its fallback because the stat couldn't be verified, R34 is off too. At most once a week, and never in the 48 h after a post that used the same stat (D7-P2 on Day 7; KS-02 answers under COMM-1, `LAUNCH_DAY.md` §6.1, on launch day). Never "all memecoins".

**R35 · [TS] [gate F-1] red day plan** · `167/280` · after launch `+RISK 256/280`

Before launch:

```text
{honestly?} alerts on a few wallets, a watchlist of coins we're not ready to ape, and the charts closed. half the reason {we're building} a terminal is to stop refreshing.
```

After launch:

```text
honestly? alerts on a few wallets, a watchlist of coins we're not ready to ape, and the charts closed. half the reason we built a terminal was to stop refreshing.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Trigger:** someone asks "what are you doing today?" or "how are you spending the dump?". **Claims:** SC-17 wallet alerts (`server/trading/alerts.ts:1-4`, `server/trading/schemas.ts:192`), SC-51 watchlist (`web/pages/WatchlistPage.tsx`). [truth] Only if that's honestly what the team is doing that day.

### 2.8 New launchpad meta

**Read the room.** A new launchpad, chain or curve mechanic is suddenly everywhere. Never name it in our reply (even if the poster did), never imply affiliation, never predict that it'll pump, and never promise we'll support it (MNC-13). Ask mechanism questions. No [TS] in this group.

**R36 · same three questions** · `184/280`

```text
new launchpad, same three questions: where does the liquidity go when a coin graduates, who can pull it, and what does a small trade cost all in. the logo changes, the questions don't.
```

**R37 · the first week** · `87/280`

```text
every new launchpad gets the same first week: the bundlers find it before the users do.
```

**R38 · curve question** · `172/280`

```text
genuine question: what fills the curve on this one, a fixed {sol} target or something new? the graduation target changes how fast a few wallets can push a coin over the line.
```

Swap `sol` for the chain's native coin.

**R39 · new mascot, same chart** · `153/280`

```text
new meta, same lifecycle: launch, snipers, bundles, the dev's first sell, and a lot of coins that just go quiet. the mascot's new. the chart shape isn't.
```

**R40 · the fair launch** · `100/280`

```text
every new launchpad promises a fair launch. the creation block has never once read the announcement.
```

If someone asks "does trenchscope cover this one?", don't guess: if it's on a chain that passed C-1 and the live build shows its coins (F-1), say so plainly; otherwise "not that we can show you yet" in fresh words. No "soon", no roadmap.

### 2.9 Questions about us [ANS]

**Read the room.** Mostly under our own posts, where every real question gets an answer within the hour, in fresh words. Under someone else's post, only when the question is aimed at us, and it counts as [TS] (§1.2). Short, plain, no pitch. If a question isn't here, answer from the ledger or say "good question, we'll check" and ask the owner. **Never improvise a custody, fee, chain or token answer.**

**R43 · "is this a scam?"** · [gate K-1] · `187/280`

```text
{fair question to ask anything in crypto.} self-custody: you keep your keys. we will never DM you first, ask for your seed phrase, or ask you to send funds. if an account does, it isn't us.
```

CUSTODY verbatim inside fresh words. Don't argue, don't get defensive, don't point at anyone else. Before launch you can add "nothing trades yet" if it fits. **Claims:** SC-46 (**OWNER**, K-1). If K-1 isn't ticked, drop the self-custody sentence and keep the CUSTODY line, which is true either way.

**R44 · "are you custodial?" / "who holds my keys?"** · [gate K-1, K-2] · `153/280`

```text
{no.} self-custody: you hold your keys, and we never touch your funds. we'll also never ask for your seed phrase. not in a dm, not in a form, not anywhere.
```

**Claims:** SC-46 (**OWNER**). The code has no keys at all today (balances are server-held, ledger §1), so this is a statement about the live build only. If K-2 shows automated orders use delegated or session keys, replace the first sentence with the owner's approved wording: `self-custody: you hold your keys. [K-2 ANSWER]` (46 + the answer) and re-measure. Never "your funds are protected", "secure", "bank-grade" (MNC-17).

**R45 · "if I keep my keys, how do exits / limits / copy trades fire?"** · [gate K-2] · `76/280` (with the add-on `130/280`)

Until the owner answers K-2:

```text
fair question. we'll spell out exactly how orders sign before trading opens.
```

Add-on, when the thread smells of scammers:

```text
fair question. we'll spell out exactly how orders sign before trading opens. until then, send nothing to anyone claiming to be us.
```

The holding line from `WARMUP_WEEK.md` §1.1, reworded each time. After K-2, use `[K-2 ANSWER]` in the owner's words, measured. Never improvise a mechanism ("session keys", "we never sign anything") (ledger K-2). Limit orders, auto exits, copy trades and sniper tasks run server-side in the code (`server/trading/orders.ts`, `copytrade.ts`, `sniper.ts`).

**R46 · "which chains?"** · [gate C-0 per chain before launch, C-1 after] · `113/280` (four chains `96/280`)

```text
{five:} solana, base, bnb chain (bsc), ethereum and robinhood chain. same terminal on each, you just switch chains.
```

If Robinhood Chain fails C-1:

```text
{four:} solana, base, bnb chain (bsc) and ethereum. same terminal on each, you just switch chains.
```

Name only chains that passed C-1; for any other combination, rewrite the list and re-measure. **Claims:** SC-42 (one terminal, one chain at a time: `shared/chains.ts:5-7`, `web/components/layout/ChainSwitcher.tsx`), SC-43, SC-45 (**OWNER**). Worded differently from D4-P4 on purpose. Never "robinhood" alone, never a chain logo or "official" (MNC-14). No "soon" for a chain that isn't ready (MNC-13).

**R47 · "where's robinhood chain in the switcher?"** · [gate C-0 Robinhood Chain before launch, C-1 after] · `108/280` (after launch `100/280`)

Before launch:

```text
that clip is the demo build, which has four. robinhood chain is in the bio because it's in the launch build.
```

After launch, while the clips are still the demo recordings:

```text
that clip was recorded on the demo build, which had four. robinhood chain is in the terminal itself.
```

From `WARMUP_WEEK.md` §1.1. The UI's switcher shows SOL, BSC, Base and ETH (`shared/chains.ts:5-7`); Robinhood Chain is in no file of the code (SC-45). Post-launch line only if the live build has it. If Robinhood Chain fails C-1, it's out of the bio, and this question gets "it isn't in the terminal" in plain words, with no promise.

**R48 · "is this a robinhood / coinbase / binance thing?"** · `134/280` (before launch `142/280`)

After launch:

```text
no. robinhood chain, base and bnb chain are chains {we support}, that's all. not affiliated with any chain, launchpad or exchange named.
```

Before launch:

```text
no. robinhood chain, base and bnb chain are chains we're building for, that's all. not affiliated with any chain, launchpad or exchange named.
```

CHAINS verbatim. Drop any chain that failed C-1 from the list; if none of the three is left, reply `no. we're not affiliated with any chain, launchpad or exchange named.` (69). Never "Coinbase" or "Binance" for the chains (MNC-14).

**R49 · "fees?"** · [gate Fees for the number] · `150/280` · after launch `+RISK 244/280`

```text
{fair.} the quote shows the full cost before you confirm: platform fee, network fee, price impact, min received. no fee number from us until it's final.
```

Once the owner confirms the real fee is shown in-app before every trade (Fees check), this shorter form is allowed too (56; `+RISK 150/280`):

```text
the fee is on the quote before you confirm. every trade.
```

**Claims:** SC-11 (GREEN: the quote's You receive, Min received, Price impact, Exec. price, Fees and Route rows, `web/components/token/trade/QuotePreview.tsx:91-119`), SC-12 (**OWNER**: the code holds a simulator placeholder; never quote 0.8% or any number until the owner confirms the final fee). No comparisons ("lower than", "cheapest"), ever (MNC-08, MNC-10).

**R50 · "is the trailer AI?"** · `157/280` (before launch, the field-guide clips: `138/280`)

After launch (the trailer):

```text
yes. the trailer is AI-generated, and labelled. the terminal isn't: every UI shot in it is a screen recording on demo data, and there's no AI in the product.
```

Before launch (the field-guide clips):

```text
yes, the field-guide clips are AI-generated, and labelled. the UI clips are screen recordings on demo data. there's no AI in the terminal.
```

The QT-1 idea ("the trailer is AI. the terminal isn't.") in reply form. **Claims:** MNC-07 (the product has no AI or ML), MNC-23, DEMO. Check the trailer's final cut against `video/SCRIPT.md` before saying "every UI shot".

**R51 · "ai slop"** · `137/280`

```text
guilty on the whale. the part that matters isn't AI: a sniper gets tagged because of the block it bought in, not because a model guessed.
```

For a heckle, not a question. Good-humoured once, then let it go. **Claims:** SC-21 sniper rule (`server/analytics/tokens/track.ts:21,210`, `SNIPER_BLOCKS = 3`).

**R52 · "is it live?" / "where's the link?"** · `90/280` · after launch `116/280`, `+RISK 210/280`

Before the launch gate passes:

```text
not yet. links only ever come from this profile, so anything else claiming to be us isn't.
```

After the launch gate passes (the word "live" stays in the launch posts, not here):

```text
yes. the link is in the first reply on the pinned post, and in the bio. if you got it anywhere else, don't click it.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

No date, no "soon", no "this week" in the pre-launch line (MNC-01, MNC-13, MNC-21). After launch it's an invitation to trade, so RISK goes with it.

**R53 · "wen token?" / "airdrop?" / "points?"** · [gate T-1] · `84/280` or `105/280`

**Default: don't answer.** POSITIONING says we don't mention a token at all unless the owner confirms a plan (MNC-02), and `PROFILE.md` §9.4, `WARMUP_WEEK.md` §1.1 and `LAUNCH_DAY.md` §9.1 all hold the same line. Don't hide these replies either: they aren't scams.

If the owner approves a deflection (T-1), it says nothing about a token, yes or no, and promises nothing. Two options for the owner to pick from:

Plain (84):

```text
news from us comes from this profile, never from a dm and never from a "claim" link.
```

(The old first sentence, "we only post about things that are built.", is untrue for this account: the warm-up names Robinhood Chain and self-custody before they're in the code.)

Dry:

```text
right now we're busy tagging everyone else's dev wallets. news from us only ever comes from this profile.
```

Both point at the one rule that beats the fake-airdrop scams these questions attract: news comes only from this profile. **Never say:** "soon", "stay tuned", "no plans", "there is no token", "not yet", "early users", "points", "👀", "nfa but", or any wink. The old "there is no token" reply is retired.

**R54 · "is that real data?" / "is this real money?"** · `127/280` · after launch `100/280`

Before launch:

```text
demo data. the UI is real, the coins and wallets in the clip aren't, and the corner says so on every frame. nothing trades yet.
```

After launch, while the demo recordings are still up:

```text
demo data, and the corner says so. we recorded it before launch so no real coin ended up in a promo.
```

**Claims:** DEMO, MNC-19 (demo data never presented as real). Re-record on live data after launch and swap the assets in (POSITIONING "Footage"); then this reply retires.

**R55 · "is it safe?" / "can it spot rugs?"** · `128/280` · after launch `+RISK 222/280`

```text
it's a scope, not a shield. the audit is a reference, the risk prompt asks and still lets you buy, and memecoins stay memecoins.
```

After launch, the same text plus a blank line and RISK. **Claims:** SC-09 (the audit calls itself reference only: `web/components/token/SecurityPanel.tsx:79`), SC-08 (the prompt lists reasons and asks for a tick, then "Buy anyway": `web/components/token/model.ts:119-129`, `web/components/token/trade/useTradeExecutor.tsx:55,89,109`). Never "safe", "protects", "rug-proof", "catches rugs" or an accuracy figure (MNC-06, MNC-17).

### 2.10 Impersonators and scams [SAFE]

**Read the room.** A self-custody brand gets cloned within days, and the clones go after the people talking to us. The job is to warn the person, not to fight the scammer. **Don't engage the scam account:** don't quote it, reply to it with a link, or repeat its handle, URL or contract address (all of it amplifies the scam, `LAUNCH_DAY.md` §9.2). Then:

1. **Under our own posts:** reply to the **person they targeted** (so the warning stays visible), then hide the scam reply, report it (scam or impersonation) and block the account.
2. **Under someone else's post:** reply once to the targeted person, then report and block. Don't reply twice.
3. **Log it** (time, handle or URL, type, where seen) and run the impersonation search (`PROFILE.md` §8.1). A convincing clone goes to the owner, and to X's impersonation report as the brand.
4. **Under fresh words every time.** CUSTODY verbatim appears in R43 and R56, the two lines where the exact promise matters most (POSITIONING puts CUSTODY in the reply bank). Use the verbatim line in at most ~3 replies a day; otherwise say its meaning in new words, as R57–R60 do.

**R56 · fake "support" replies to someone** · `160/280`

```text
{heads up:} that "support" account isn't us. we will never DM you first, ask for your seed phrase, or ask you to send funds. don't click, don't connect, block it.
```

Reply to the person who was targeted, never to the scammer. Then hide, report, block. CUSTODY verbatim.

**R57 · "is [account] you?"** · `114/280`

```text
no. this is our only account. anything else with our name or our scope on it is hoping you won't check the handle.
```

Don't repeat the look-alike handle in the reply. Report it through X's impersonation form as the brand (`LAUNCH_DAY.md` §9.2 step 3).

**R58 · "someone DMed me as trenchscope"** · `146/280`

```text
wasn't us. we never DM first. if a message asks for a seed phrase, a "wallet sync" or a deposit, it's a drainer. report it, block it, don't reply.
```

If they say they already sent something, switch to R60.

**R59 · a fake site or "claim" link** · before launch `110/280` · after launch `139/280`

Before launch:

```text
we haven't posted a link anywhere yet. anything claiming to be our site is fake. don't connect a wallet to it.
```

After launch:

```text
that link isn't ours. ours only come from this profile: the bio and the pinned post's first reply. don't connect a wallet to anything else.
```

Never paste the fake URL. Report it per `LAUNCH_DAY.md` §9.2 step 4 (Safe Browsing, the registrar, the host).

**R60 · someone got drained or scammed** · `151/280` (support add-on `82/280`)

```text
{really sorry.} one more warning, because it usually comes next: anyone offering to recover it is running the second half of the scam. we never DM first.
```

If it happened in our app (after launch), add or follow with:

```text
if it happened in our app, [SUPPORT] is the only place we help. we never DM first.
```

Kind, public, brief. Never promise recovery, never diagnose in public, never say "your funds are safe" unless the owner verified it. Flag it to the owner (`LAUNCH_DAY.md` §9.3).

**R61 · a coin trading under our name** · `136/280`

```text
not ours. whoever launched that coin borrowed the name, and the accounts shilling it aren't us either. report them. don't buy the story.
```

Says nothing about a token of ours, so it's allowed by default, like `LAUNCH_DAY.md` WARN-Tb and SAFE-L1's "coins borrowing our name" (the same rule in `LAUNCH_DAY.md` §1.1 T-1 and §12). Never name the coin or post its address. The stronger "there is no trenchscope token" line (WARN-Ta) is only for the owner to approve under T-1. If the coin is getting traction, the owner decides whether to post WARN-Tb as an original.

---

## 3. Standalone one-liners (30)

**How to use them.** Each is posted **once**, as a filler original in an empty window, a swap-in when an asset isn't ready, or a quote-post caption. From L+3, one a day at most, 2.5–3 h from any other original; before that, only when the day's plan calls for a swap-in. Don't post two from the same group back to back. Don't reuse one as a reply (that makes it a duplicate). L01–L22 and L24–L27 make no product claim and need no disclaimer. L23 and L28–L30 name the product: **+RISK** after launch.

### 3.1 Trench life (no product)

**L01** · `107/280`

```text
the trenches are the only place where "early" and "exit liquidity" are the same person, four minutes apart.
```

**L02** · `82/280`

```text
every chart is a bull flag if you zoom in far enough and lie to yourself a little.
```

**L03** · `107/280`

```text
nobody in the history of the trenches has said "i'll set a stop-loss later" and then set a stop-loss later.
```

**L04** · `106/280`

```text
a ca dropped by a stranger in your replies isn't alpha. it's an invitation to be the reason they can sell.
```

**L05** · `76/280`

```text
"dev stepping away for personal reasons" is a slow rug with a press release.
```

**L06** · `97/280`

```text
community takeover: the dev leaves, and the holders inherit the socials, the bags and the trauma.
```

**L07** · `62/280`

```text
the trenches have three seasons: snipers, bundlers and denial.
```

**L08** · `76/280`

```text
you didn't get rugged. you took part in a liquidity event. as the liquidity.
```

**L09** · `73/280`

```text
in a green week everyone's a genius. after a rug everyone's a researcher.
```

**L10** · `71/280`

```text
the most expensive sentence in the trenches: "it's just a healthy dip."
```

**L11** · `91/280`

```text
being early is a skill. being early to the same dev's fourth coin this week is a lifestyle.
```

**L12** · `56/280`

```text
the bonding curve does not accept conviction as payment.
```

**L13** · `45/280`

```text
a memecoin is a mayfly with a telegram group.
```

**L14** · `47/280`

```text
hardest trade in the trenches: closing the tab.
```

**L15** · `72/280`

```text
trench rule #1: the loudest person in the replies bought before you did.
```

**L16** · `90/280`

```text
the first block is a party you weren't invited to, and everyone there has the same funder.
```

### 3.2 Mechanics, explained in one breath (no product)

**L17** · `100/280`

```text
"lp burned" means the dev can't pull the pool. it says nothing about the bag they bundled at launch.
```

**L18** · `148/280`

```text
"organic volume" and four wallets trading with each other every three seconds look identical on a chart. they look very different in the trade list.
```

**L19** · `80/280`

```text
smart money isn't a vibe. it's a hit rate. without one, it's just a loud wallet.
```

Not within 48 h of D5-P3 (Day 5), which opens the same way.

**L20** · `162/280`

```text
a sniper buys in the first few blocks. a bundler buys in the block the coin was born. an insider got gas money from the dev.

three different villains. one chart.
```

Matches the tag rules (ledger 2.2) without converting blocks to seconds. Not on a day with a field-guide post.

**L21** · `136/280`

```text
graduation day: the curve fills, a real pool opens, and the early wallets finally have enough liquidity to leave. congrats to the class.
```

**L22** · `61/280`

```text
slippage is the price you agreed to pay for being in a hurry.
```

### 3.3 Brand, self-aware

**L23 · [gate F-1]** · `121/280` · after launch, with `we built`, `+RISK 209/280`

```text
{we're building} a terminal that tags the snipers, bundlers, insiders and the dev. we expect the dev to take it personally.
```

After launch the slot becomes `we built`. **Claims:** SC-21, SC-21d.

**L24** · `128/280`

```text
paper hands sell too early. diamond hands hold too long. take-profit and stop-loss orders were invented for people who are both.
```

"paper hands" here is about people, which BRAND_GUIDE §5 allows; the §4.3 and §15 bans cover simulator "paper" (paper trading, paper wallets), not this.

**L25** · `36/280`

```text
nfa. we can barely advise ourselves.
```

**L26** · `85/280`

```text
buying the top is a rite of passage. buying it twice on the same coin is a tradition.
```

**L27 · [truth]** · `144/280`

```text
every coin in our screen recordings is demo data. the devs are made up. they still rug at the worst possible moment. method actors, all of them.
```

Only while the posted clips are demo-data recordings (POSITIONING "Footage"). Retire it once they've been re-recorded on live data.

### 3.4 Product-light (+RISK after launch)

**L28 · [gate K-2, F-1]** · `100/280` · after launch `+RISK 194/280`

```text
the dev-sell exit fires right after the dev sells. not before. we built a scope, not a time machine.
```

**Claims:** SC-41 (reacts after the dev's sell, `server/trading/orders.ts:270`). Not within 48 h of D5-P2 or R20.

**L29 · [gate F-1]** · `121/280` · after launch `+RISK 215/280`

```text
the risk prompt doesn't stop you. it makes you read the reasons and tick a box saying you did. a scope, not a babysitter.
```

**Claims:** SC-08 (`web/components/token/trade/useTradeExecutor.tsx:89,109`: "Buy anyway" behind "I understand the risks and want to buy"). It doesn't claim every buy goes through the prompt (quick buy doesn't, SC-08c). Not within 48 h of D7-P1 or T4.

**L30 · [gate F-1]** · `121/280` · after launch `+RISK 215/280`

```text
every audit row is green, amber or red against a set threshold. we're aware this is the least degen sentence ever posted.
```

**Claims:** SC-09 (each row rated good, warn, bad or info against a fixed threshold: `server/analytics/tokens/security.ts:470-597`). The old "anything that isn't green comes with a plain-english hint" is retired: Bot degens, Smart money, amber taxes, amber dev holding and the "Unknown" contract rows carry no hint (ledger SC-09).

---

## 4. Polls (12)

**How to run them.** 24 h each, in window A or B. **At most one every 2–3 days.** The warm-up runs D1-P2 (Day 1) and D4-P3 (Day 4), with R4 in reserve, and `LAUNCH_DAY.md` runs L2-B on L+2, so this bank starts at **L+5** at the earliest. Twelve polls cover about five weeks. Every option is within X's 25-character limit.

Reply to voters with one line of mechanism for their pick, written fresh each time. When you follow up on a result, say which option won, in words. **Never post vote counts or percentages as if they were a stat about traders** (a small, self-selected poll is not data, MNC-05). A follow-up that names a feature is a product post: DEMO on any UI image, RISK as its last line. A follow-up with a real-market number keeps STAT (`~`, the window, source in the first reply).

**P01 · how many coins** · question `49/280`

```text
how many coins do you look at before you buy one?
```

| Option | Chars |
|---|---|
| `just the one` | 12 |
| `two or three` | 12 |
| `ten, then i ape the first` | 25 |
| `looking is for cowards` | 22 |

Follow-up: a one-liner in the voice of the winning option. No product.

**P02 · the dev sold** · question `39/280`

```text
the dev just sold their whole bag. you:
```

| Option | Chars |
|---|---|
| `sell instantly` | 14 |
| `hold, cto incoming` | 18 |
| `buy the dip` | 11 |
| `already out lol` | 15 |

Follow-up: the dev-status idea in new words (holding / sold part / sold all / bought more, SC-26). Don't recycle D5-P1's text.

**P03 · worst feeling** · question `30/280`

```text
worst feeling in the trenches?
```

| Option | Chars |
|---|---|
| `sold right before it ran` | 24 |
| `held right into the rug` | 23 |
| `tx failed on the entry` | 22 |
| `watched it, never bought` | 24 |

Follow-up: if "tx failed" wins, a post on slippage, priority fees and price impact (SC-11, SC-50), mechanism first. Anti-MEV only as "harder to sandwich", and only once F-4 is answered for that chain (SC-13o). Never "no failed txs".

**P04 · hold time** · question `44/280`

```text
how long do you usually hold a fresh launch?
```

| Option | Chars |
|---|---|
| `under 5 minutes` | 15 |
| `5 to 60 minutes` | 15 |
| `a few hours` | 11 |
| `until it's zero` | 15 |

**P05 · be honest** · question `61/280`

```text
be honest: how often do you buy without checking the holders?
```

| Option | Chars |
|---|---|
| `never, i'm careful` | 18 |
| `sometimes` | 9 |
| `most of the time` | 16 |
| `what are holders` | 16 |

Follow-up: if "what are holders" gets real votes, that's the cue for a newcomer explainer thread.

**P06 · trust issues** · question `38/280`

```text
which wallet label do you trust least?
```

| Option | Chars |
|---|---|
| `kol` | 3 |
| `smart money` | 11 |
| `fresh wallet` | 12 |
| `the dev` | 7 |

Follow-up: if "smart money" wins, explain how the tag is earned from behaviour over 7 days (SC-20). No accuracy numbers (MNC-06). If "kol" wins, talk about callers in general: the KOL tag is OWNER (F-2).

**P07 · after graduation** · question `58/280`

```text
a coin graduates off the curve. what usually happens next?
```

| Option | Chars |
|---|---|
| `it runs` | 7 |
| `it dumps` | 8 |
| `it chops sideways` | 17 |
| `it goes quiet` | 13 |

Follow-up: the ~73% stat (KS-02) in new words, with STAT in the first reply. Re-verify first (S-1). Wait at least 48 h after any other post that used it (D7-P2, COMM-1 answers, R34).

**P08 · which trench** · question `43/280`

```text
which trench do you spend the most time in?
```

| Option | Chars |
|---|---|
| `solana` | 6 |
| `base` | 4 |
| `bsc` | 3 |
| `somewhere else` | 14 |

Learns where the audience trades. Reply to "somewhere else" voters asking where, in fresh words. It's a question about them, not a claim about us, so it names no Trenchscope chain support and needs no C-1. Never present the result as market share.

**P09 · bundle check** · question `48/280`

```text
when do you usually check if a coin was bundled?
```

| Option | Chars |
|---|---|
| `before i buy` | 12 |
| `after i buy` | 11 |
| `after it rugs` | 13 |
| `never, i like surprises` | 23 |

**P10 · exit plan** · question `42/280`

```text
what's your real exit plan on most trades?
```

| Option | Chars |
|---|---|
| `take-profit set` | 15 |
| `stop-loss set` | 13 |
| `trailing stop` | 13 |
| `vibes` | 5 |

Follow-up: if "vibes" wins (it will), a post about attaching exits to the buy (SC-14), with DEMO on any capture and RISK as the last line. Gate K-2.

**P11 · close the tab** · question `43/280`

```text
which tell makes you close the tab fastest?
```

| Option | Chars |
|---|---|
| `dev holds a big bag` | 19 |
| `lots of fresh wallets` | 21 |
| `bundled launch block` | 20 |
| `a kol shilled it first` | 22 |

**P12 · origin story** · question `31/280`

```text
what got you into the trenches?
```

| Option | Chars |
|---|---|
| `a friend's pnl screenshot` | 25 |
| `a call in a group chat` | 22 |
| `pure boredom` | 12 |
| `i'm not in yet` | 14 |

Follow-up: if "i'm not in yet" gets votes, that's an audience worth writing newcomer explainers for. Explainers, not invitations.

---

## 5. Meme cards (10)

**How they're built.** All ten are type-only or vector cards rendered with `marketing/tools/cards.py` (HTML → PNG). **No AI generation and no stock imagery:** no real people, no real meme-template art, no real coin logos, no chain logos. Brand rules: bg `#0A0C10`, panels `#11141A`, fg `#E6E9F0`, muted `#8C94A3`, one amber `#FFB547` accent, red `#FF5468` only for loss or danger, wallet-tag colours only on wallet labels (ledger §7.12). Inter for words, JetBrains Mono for numbers and chips. Nothing under 20 px on a 1080-wide canvas. Trenchscope mark in the footer corner.

**Rules for these cards.**
- **Cards built from app numbers or app frames** (meme-3, meme-5, meme-7) use **demo data only, even after launch, until the owner and legal approve real-chain autopsies (BRAND_GUIDE §14.3, L-1)**: a real coin's rug in a meme is a verdict on a real dev (§1.1 rule 9) and a real ticker (MNC-16). Every number is read off one real capture-mode frame (`marketing/tools/capture-mode.js`, ledger §7.1), the ticker is blurred or absent, the card says "demo data" in the subtext, and the footer carries **DEMO** `UI shown with demo data` plus **RISK-short** `high risk · nfa`. Their captions end with RISK after launch.
- **Cards with wallet-tag chips** (meme-2, meme-6) carry RISK-short in the footer. Pure trench-culture cards (meme-1, 4, 8, 9, 10) need no label.
- **Frame check** on any card built from a capture: no `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%` or "Live" badge anywhere in the crop (ledger §7.1, §7.7).
- Never a real ticker, CA, project, launchpad or person, even as a joke square.
- Post each card once. A "vol. 2" is a new card with new lines.
- Alt text goes on every image, written plainly. Counts below are plain characters (X's alt-text limit is 1,000).

**Template status.** `meme` exists in `cards.py` (headline plus `label: value` rows) and covers meme-3, meme-4, meme-7 and meme-9. It only puts a label in the left column when the label is 14 characters or fewer (`cards.py:156`), so raise that limit for meme-4 and meme-7, whose labels are longer. DEMO and RISK-short go in the spec's `footer` field (`foot()`, `cards.py:103`). Five new layouts are needed: `grid` (N×N squares; meme-1, meme-2), `split` (two panels; meme-5), `poster` (meme-6), `tiles` (2×3; meme-8) and `forecast` (columns; meme-10).

### meme-1 · trench bingo · 1080 × 1350 · `grid` 5×5

**Image.** A 5×5 bingo card of dark `#11141A` squares with thin `#222731` rules. Each square holds one short line in Inter 600. The centre square is amber-outlined and reads **FREE: you aped anyway**. The other 24 squares: `dev "stepping away"` · `"it's a social experiment"` · `top 10 holds half` · `30 buyers in the launch block` · `"next leg up loading"` · `"just a shakeout"` · `one green candle, then a cliff` · `fresh wallets everywhere` · `roadmap with 5 phases` · `the group chat goes read-only` · `"cto incoming"` · `dev sold into the first pump` · `big volume, four traders` · `sell tx fails` · `"support" DMs you first` · `migrated, then straight down` · `anti-mev off` · `slippage at 50%` · `dev wallet funded 5 min ago` · `same funder, every wallet` · `the socials link to nothing` · `the caller deleted the post` · `"i'll set a stop-loss later"` · `website made in an afternoon`.

**Headline:** `trench bingo` · **Subtext:** `how many squares did your last coin hit?` · **Footer:** none (mark only)

**Caption** · `88/280`

```text
trench bingo.

how many squares did your last coin hit? blackout wins nothing, as usual.
```

**Alt** (292)

```text
A dark bingo card titled trench bingo with 25 squares of memecoin clichés, such as dev stepping away, it's a social experiment, 30 buyers in the launch block, just a shakeout, sell tx fails, support DMs you first and the socials link to nothing. The centre free square reads: you aped anyway.
```

### meme-2 · trench alignment chart · 1200 × 1200 · `grid` 3×3

**Image.** A classic 3×3 alignment grid (lawful / neutral / chaotic × good / neutral / evil) as type-only cells. Each cell has the real wallet-tag chip PNG (`video/overlays/chips/*.png`) on top and a one-line description underneath. Lawful good: **smart money** `in early, out on schedule, never posts about it`. Neutral good: **whale** `buys big and just… holds`. Chaotic good: **cto crew** `rebuilding the socials at 4am` (not a product label, so its chip is a neutral `#8C94A3` pill, never a wallet-tag colour). Lawful neutral: **sniper** `blocks 1 to 3, sells into the first wave, every time`. True neutral: **fresh wallet** `no history. no personality. no comment.` Chaotic neutral: **bot** `trading with itself every 3 seconds`. Lawful evil: **bundler** `same block as creation, never travels alone`. Neutral evil: **insider** `gas money from the dev, "just a fan"`. Chaotic evil: **dev** (no description, just the chip).

**Headline:** `trench alignment chart` · **Subtext:** `every wallet here is an archetype, not a person` · **Footer:** `high risk · nfa`

**Caption** · `88/280`

```text
trench alignment chart.

which one are you, and which one keeps buying your coins first?
```

**Alt** (376)

```text
A three-by-three alignment chart of trench wallet types, each with a coloured wallet-tag chip. Lawful good: smart money. Neutral good: whale. Chaotic good: community takeover crew. Lawful neutral: sniper. True neutral: fresh wallet. Chaotic neutral: bot. Lawful evil: bundler. Neutral evil: insider. Chaotic evil: the dev. Archetypes, not real people. Footer: high risk · nfa.
```

The cell lines follow the tag rules (ledger 2.2): snipers in blocks 1 to 3, bundlers in the creation block, insiders funded by the dev. Don't swap in "block 1" for the sniper or "funded by the dev" for the bundler.

### meme-3 · trench facts (nutrition label): one launch, demo data · 1080 × 1350 · `meme`

**Image.** A nutrition-facts label drawn in the brand palette: a `#11141A` panel with heavy `#E6E9F0` rules, the title **Trench Facts** in Inter Black, then `serving size: 1 launch · demo data` and `servings per container: [n] holders`. Rows in Mono, **every number read off one capture-mode audit frame** of a high-risk demo token (ledger FB-07) and coloured the way the app colours that row: `dev holding [n]%` · `insiders [n]%` · `bundlers [n]% of volume` · `snipers [n]` · `fresh wallets [n]%` · `top 10 holders [n]%` · `smart money [n]` · a bold rule · `rug ratio [n]%` · `audit: [n] flags · [risk level] risk`. Footer lines on the label: `ingredients: a dev, some insiders, a bundle, a lot of fresh wallets.` and `may contain traces of a community.` No ticker, name, avatar or launchpad.

**Headline:** `trench facts` · **Subtext:** `one launch · demo data · read off the audit panel` · **Footer:** `UI shown with demo data · high risk · nfa`

**Caption** · `132/280` · after launch `+RISK 226/280`

```text
nutrition facts for one launch. demo data.

ingredients: a dev, a bundle, a lot of fresh wallets. may contain traces of a community.
```

**Alt** (447 with the slots unfilled; re-count after filling)

```text
A nutrition-facts style label titled Trench Facts for one launch, made from demo data. Serving size: one launch. Servings per container: [n] holders. Dev holding [n]%, insiders [n]%, bundlers [n]% of volume, fresh wallets [n]%, top 10 holders [n]%, smart money [n], rug ratio [n]%. Audit: [n] flags, [risk level] risk. Footer: may contain traces of a community. Numbers read off Trenchscope's audit panel, UI shown with demo data. high risk · nfa.
```

**[truth]** Pick a demo token whose audit really shows insiders, a bundle and fresh wallets in amber or red, or the "ingredients" line isn't true. Use a different token from `peek-audit`, `sr1-*`, `sr2-*` and `launch-4`, so the card never ties to a puzzle. Fill every `[n]` from the same frame, and match the alt text. "bundlers" is a share of volume on the audit, so the row says so. **Claims:** SC-09, SC-10 (`server/analytics/tokens/security.ts:362-447,470-597`).

### meme-4 · trench translator · 1080 × 1350 · `meme`

**Image.** Two columns: *what they say* in fg on the left, *what it usually means* in amber Mono on the right, with a thin rule between rows. Rows: `"stealth launch"` → `the bundle knew first` · `"community takeover"` → `the dev left` · `"healthy dip"` → `slow rug, chapter 1` · `"organic volume"` → `four wallets on a loop` · `"lp is burned, we're fine"` → `the pool stays. the dev's bag doesn't.` · `"the devs are doxxed"` → `a profile picture exists` · `"the devs are building"` → `the devs are selling` · `"we're so early"` → `you're buyer #200`.

**Headline:** `trench translator` · **Subtext:** `what they say vs what it usually means. not about anyone in particular.` · **Footer:** none (mark only)

**Caption** · `100/280`

```text
trench translator, vol. 1.

what did we miss? we'll paraphrase the best ones into vol. 2 (no names).
```

**Alt** (440)

```text
A two-column card titled trench translator. Left, phrases traders hear; right, what they usually mean. Stealth launch: the bundle knew first. Community takeover: the dev left. Healthy dip: slow rug, chapter 1. Organic volume: four wallets on a loop. LP is burned, we're fine: the pool stays, the dev's bag doesn't. The devs are doxxed: a profile picture exists. The devs are building: the devs are selling. We're so early: you're buyer 200.
```

Vol. 2 uses reply ideas paraphrased, never quoted with a handle, and it's not a prize. The LP row avoids the word "safe" on purpose (rule 20).

### meme-5 · the chart in your head vs the chart · 1600 × 900 · `split`

**Image.** Left panel, labelled `the chart in your head`: a clean vector line in amber climbing smoothly up and to the right, with a small `you` pin at the bottom-left. Right panel, labelled `the chart`: a **real crop** of 1-second candles from a capture-mode recording of one demo-data launch that rugs (ledger FB-06, FB-13), with two amber pins at the real moments the Activity tab shows the **dev's sell** and the **bundler-tagged wallets selling**, and the candles falling off a cliff. Ticker blurred hard. DEMO burned into the right panel's corner. No AI, no invented chart data.

**Headline:** `the chart in your head / the chart` · **Subtext:** `right panel: a real capture, demo data. left panel: your imagination.` · **Footer:** `UI shown with demo data · high risk · nfa`

**Caption** · `68/280` · after launch `+RISK 162/280`

```text
every entry comes with two charts. only one of them has a dev in it.
```

**Alt** (344)

```text
Two panels. Left, labelled the chart in your head: a smooth amber line climbing up and to the right, with a small pin marked you. Right, labelled the chart: real one-second candles from Trenchscope, UI shown with demo data, ticker blurred, with pins on the dev's sell and on the bundler-tagged wallets selling, then a collapse. high risk · nfa.
```

**[truth]** Pin only moments you can see in the recording's Activity tab (the dev's sell row; sells by wallets with the Bundler tag). Label the second pin "bundlers selling", not "bundler sell signal": that signal reads simulator-supplied data and is OWNER (F-2). Use a different launch from `launch-10`, `launch-13` and the trailer's dev-sell shot. **Claims:** SC-25 (1s candles, trade markers), SC-21 (bundler tag), SC-18 dev-sell logic (`server/analytics/wallets/signals.ts:229-253`).

### meme-6 · wanted: the bundler (series of 4) · 1080 × 1350 · `poster`

**Image.** A wanted-poster layout in brand colours (no sepia, no Western clip-art). A thick amber frame; **WANTED** in Inter Black at the top; in the middle, a flat vector silhouette of a hooded, faceless figure inside a scope reticle (drawn as SVG, no AI, no face); **THE BUNDLER** under it, with the real bundler chip PNG. Fields in Mono: `last seen: the creation block` · `known associates: a dozen wallets, same block` · `distinguishing marks: holds a lot of a coin that's 3 seconds old` · `reward: knowing before you buy.` Footer: `a fictional archetype, not a person`.

Later posters, one a week, follow the trailer cast, each with the same reward line and its own new caption: **THE SNIPER** (`last seen: blocks 1 to 3`), **THE INSIDER** (`last seen: receiving gas money from the dev`), **THE DEV** (`last seen: "afk for a bit"`).

**Headline:** `WANTED: THE BUNDLER` · **Subtext:** `a fictional archetype, not a person · part 1 of 4` · **Footer:** `high risk · nfa`

**Caption** · `104/280`

```text
wanted: the bundler.

buys your coin before it exists on your screen. never travels alone.

part 1 of 4.
```

**Alt** (376)

```text
A wanted poster in dark navy and amber. A faceless hooded silhouette inside a scope reticle, labelled THE BUNDLER with a yellow bundler chip. Last seen: the creation block. Known associates: a dozen wallets, same block. Distinguishing marks: holds a lot of a coin that's 3 seconds old. Reward: knowing before you buy. A fictional archetype, not a real person. high risk · nfa.
```

Post after launch, once the trailer has introduced the cast. Don't reuse the field-guide lines (D2-P1, D3-P3, D4-P1, D5-P1). "same block" follows the bundler rule; don't write "one funder" (that's closer to the insider rule).

### meme-7 · rug autopsy report (toe tag) · 1080 × 1350 · `meme`

**Image.** A morgue toe tag drawn as a `#11141A` card with a punched hole and an amber string. Fields in Mono, **filled only from one capture-mode recording of a demo-data launch** (it can be meme-5's launch, told a second way): `deceased: [blurred], age [N] min` · `cause of death: dev sell, bundle sold the same minute` · `contributing factors: bundled at launch, snipers in blocks 1–3, out early` · `time of death: [N] min after launch` · `holders at time of death: [N]` · `coroner's note: audit, [N] flags · [risk level] risk · rug ratio [N]% (read after death)`.

**Headline:** `rug autopsy report` · **Subtext:** `every field from one launch · demo data` · **Footer:** `UI shown with demo data · high risk · nfa`

**Caption** · `145/280` · after launch `+RISK 239/280`

```text
coroner's report on one launch. demo data.

the snipers left {a minute} early. the dev and the bundle left together. the chart stayed behind alone.
```

**Alt** (469 with the slots unfilled; re-count after filling)

```text
A toe tag styled as a coroner's report for one launch, made from demo data. Deceased: name blurred, age [N] minutes. Cause of death: dev sell, with the bundle selling the same minute. Contributing factors: bundled at launch, snipers in blocks 1 to 3 who got out early. Time of death: [N] minutes after launch. Holders at time of death: [N]. Coroner's note: audit, [N] flags, [risk level] risk, rug ratio [N]%, read after death. UI shown with demo data. high risk · nfa.
```

**[truth]** The caption and every field must match the recording: the sniper sells land before the dev and bundler sells, which land in the same minute, all visible in the Activity tab. Fill the caption slot with the real gap. If the recording tells a different story, rewrite the fields and the caption to match it, and re-measure. The audit frame is read **after** the cliff, hence "read after death": never claim the panel was red before the dump unless a frame shows it. "Snipers in blocks 1–3" is the tag rule (`SNIPER_BLOCKS = 3`, `server/analytics/tokens/track.ts:21`). Fill every `[N]` with the real value and match the alt text. Not within a week of L1-A (the launch-day rug autopsy). **Claims:** SC-09, SC-10, SC-18, SC-21, SC-26.

### meme-8 · trench newcomer starter pack · 1200 × 1200 · `tiles` 2×3

**Image.** Six tiles, each with a simple line icon (stroke icons in fg, one amber detail) and a caption: `a ca from a stranger's reply` (speech bubble) · `seed phrase saved in the notes app` (notepad, blank lines, no words) · `anti-mev: off` (toggle switched off) · `"i'll watch it, no stop-loss"` (eye) · `slippage: 50%` (slider maxed out) · `a group chat with more bots than people` (chat bubbles with a tiny robot). No real apps' icons, no logos, and no seed words drawn anywhere.

**Headline:** `trench newcomer starter pack` · **Subtext:** `we've owned every item on this card` · **Footer:** none (mark only)

**Caption** · `98/280`

```text
trench newcomer starter pack.

we've personally owned every item on this card. some of them twice.
```

**Alt** (268)

```text
A starter-pack card titled trench newcomer starter pack, with six icon tiles: a contract address from a stranger's reply, a seed phrase saved in the notes app, anti-MEV off, i'll watch it with no stop-loss, slippage at 50%, and a group chat with more bots than people.
```

### meme-9 · famous last words, tier list · 1200 × 1200 · `meme`

**Image.** A tier list with S / A / B / C / D bands, coloured from amber (S) through muted to red (D). One quote per tier in Inter 600: S `"dev is based"` · A `"it's a cto now, it's different"` · B `"i'll sell at 2x"` · C `"i'm not selling, i'm a believer"` · D `"one more coin, then i'm done"`.

**Headline:** `famous last words` · **Subtext:** `ranked by how fast they age` · **Footer:** none (mark only)

**Caption** · `92/280`

```text
famous last words in the trenches, ranked by how fast they age.

what's missing from s tier?
```

**Alt** (232)

```text
A tier list titled famous last words, ranked by how fast they age. S tier: dev is based. A tier: it's a CTO now, it's different. B tier: i'll sell at 2x. C tier: i'm not selling, i'm a believer. D tier: one more coin, then i'm done.
```

### meme-10 · trench forecast · 1600 × 900 · `forecast` (7 columns)

**Image.** A weekly weather forecast strip with seven day columns, each with a simple vector weather icon whose details are made of tiny candles (a cloud raining red candles, a sun with green-candle rays, fog). **No percentages, numbers or dates.** Mon `scattered snipers` · Tue `heavy bundling, clearing after migration` · Wed `dev-sell advisory in effect` · Thu `dense fog of fresh wallets` · Fri `slow-rug drizzle, all day` · Sat `quiet. coins go quiet.` · Sun `community takeover front moving in`.

**Headline:** `trench forecast` · **Subtext:** `this week: same as last week` · **Footer:** none (mark only)

**Caption** · `77/280`

```text
this week's trench forecast.

bring an umbrella. it won't help, but bring it.
```

**Alt** (312)

```text
A seven-day weather forecast for the trenches with candle-shaped weather icons. Monday: scattered snipers. Tuesday: heavy bundling, clearing after migration. Wednesday: dev-sell advisory. Thursday: dense fog of fresh wallets. Friday: slow-rug drizzle. Saturday: quiet. Sunday: community takeover front moving in.
```

Best posted on a Monday morning (window A). Weekday names are fine; a date never is (MNC-21).

---

## 6. Assets needed

All status **NEW**. Build with `marketing/tools/cards.py`, export PNG to `marketing/x/posts/<ref>.png`. Brand rules in §5. **AI credits: 0.** Nothing in this bank needs a generation; the ~3 pre-approved Higgsfield credits stay with the trailer's VO take.

| Ref | Size | Template | Source data | Concept | Headline (on image) | Subtext (on image) | Footer |
|---|---|---|---|---|---|---|---|
| `meme-1` | 1080 × 1350 | `grid` 5×5 (new) | none | Trench bingo: 24 cliché squares + FREE "you aped anyway" | `trench bingo` | `how many squares did your last coin hit?` | mark only |
| `meme-2` | 1200 × 1200 | `grid` 3×3 (new) | real chip PNGs (`video/overlays/chips/`) | Alignment chart of wallet archetypes, chip per cell | `trench alignment chart` | `every wallet here is an archetype, not a person` | `high risk · nfa` |
| `meme-3` | 1080 × 1350 | `meme` | one capture-mode audit frame (FB-07) of a high-risk demo token not used elsewhere | Nutrition label, one launch, demo data | `trench facts` | `one launch · demo data · read off the audit panel` | `UI shown with demo data · high risk · nfa` |
| `meme-4` | 1080 × 1350 | `meme` (label limit raised) | none | Two-column "what they say / what it means" | `trench translator` | `what they say vs what it usually means. not about anyone in particular.` | mark only |
| `meme-5` | 1600 × 900 | `split` (new) | capture-mode 1s-candle recording of one demo rug (FB-06, FB-13) | Imagined smooth chart vs the real cliff with dev-sell and bundlers-selling pins | `the chart in your head / the chart` | `right panel: a real capture, demo data. left panel: your imagination.` | `UI shown with demo data · high risk · nfa` (+ DEMO in the right panel) |
| `meme-6` | 1080 × 1350 | `poster` (new) | vector silhouette (SVG) + real bundler chip PNG | Wanted poster, THE BUNDLER (series: sniper, insider, dev) | `WANTED: THE BUNDLER` | `a fictional archetype, not a person · part 1 of 4` | `high risk · nfa` |
| `meme-7` | 1080 × 1350 | `meme` (label limit raised) | the same capture-mode recording as meme-5, or another demo launch | Toe-tag coroner's report, every field real, audit read after death | `rug autopsy report` | `every field from one launch · demo data` | `UI shown with demo data · high risk · nfa` |
| `meme-8` | 1200 × 1200 | `tiles` 2×3 (new) | line icons | Newcomer starter pack, six habits | `trench newcomer starter pack` | `we've owned every item on this card` | mark only |
| `meme-9` | 1200 × 1200 | `meme` | none | Tier list of famous last words | `famous last words` | `ranked by how fast they age` | mark only |
| `meme-10` | 1600 × 900 | `forecast` (new) | candle-shaped weather icons | Seven-day trench weather forecast, no numbers | `trench forecast` | `this week: same as last week` | mark only |

**Captures for meme-3, meme-5, meme-7.** Load `marketing/tools/capture-mode.js` with `page.addInitScript({ path })` before navigating; the data stays demo data. Capture mode misses some sim strings, so keep the sign-in/guest modal, the phone drawer's sim notice, "Paper account", "paper balance", the copy-trade, sniper and Rewards footers and the "Faucet failed" toast out of frame, and crop or blur the green "Live" badges (ledger §7.1, §7.7). Do these in the same capture session as the launch-week captures where possible, but pick tokens that no other post uses.

**Production order.** The pure-type cards first, because they need no capture: `meme-4`, `meme-9` (existing `meme` template) → `meme-1`, `meme-2`, `meme-8`, `meme-10` (new layouts) → `meme-3` (after its FB-07 capture) → `meme-5`, `meme-7` (after the demo-rug recording) → `meme-6` (after launch).

---

## 7. Claims map and final check

| Item | Claims (ledger) | Code | Gates | Disclaimers |
|---|---|---|---|---|
| R11 | criteria only (no product named) | — | — | — |
| R14 | SC-21, SC-21d, SC-46 | `server/analytics/tokens/track.ts:8-13,99-101,207-212` | K-1, F-1 | +RISK · trigger: open "what should i use?" |
| R15 | SC-21, SC-21d | as R14 | F-1 | +RISK · trigger: a newcomer asking where to start |
| R20 | SC-14, SC-41 | `server/trading/orders.ts:29,183-184,270`; `web/components/token/trade/AutoForm.tsx:43-48` | K-2, F-1 | +RISK · trigger: "can you auto-sell when the dev sells?" |
| R25 | SC-21, SC-09 | `track.ts:8,207-209`; `server/analytics/tokens/index.ts:476,496`; `security.ts:470-597` | F-1 | +RISK · trigger: "how do you spot a bundle?" |
| R34 | KS-02 | — | S-1 | STAT meaning inline |
| R35 | SC-17, SC-51 | `server/trading/alerts.ts:1-4`; `web/pages/WatchlistPage.tsx` | F-1 | +RISK · trigger: "what are you doing today?" |
| R43, R44 | SC-46 | none (no keys in the code, ledger §1) | K-1 (R44 also K-2) | CUSTODY verbatim (R43) |
| R45 | K-2 holding line | `server/trading/orders.ts`, `copytrade.ts`, `sniper.ts` (server-side) | K-2 | — |
| R46, R47, R48 | SC-42, SC-43, SC-45 | `shared/chains.ts:5-7`; `web/components/layout/ChainSwitcher.tsx` | C-0 per chain before launch, C-1 after | CHAINS verbatim (R48) |
| R49 | SC-11, SC-12 | `web/components/token/trade/QuotePreview.tsx:91-119`; `shared/chains.ts:160` (placeholder, never quoted) | Fees for any number | +RISK |
| R50, R51 | MNC-07, MNC-23, SC-21 | `track.ts:21,210` | — | DEMO, AI meaning |
| R52 | MNC-01 | — | launch gate for the "yes" version | +RISK (after launch) |
| R53 | MNC-02 | — | T-1 (default: no answer) | — |
| R54 | MNC-19 | — | — | DEMO meaning |
| R55 | SC-08, SC-09 | `web/components/token/model.ts:119-129`; `useTradeExecutor.tsx:55,89,109`; `SecurityPanel.tsx:79` | F-1 | +RISK |
| R56–R61 | CUSTODY | — | T-1 only for a WARN-Ta-style line (not in this bank) | CUSTODY verbatim (R56) |
| L23 | SC-21, SC-21d | as R14 | F-1 | +RISK |
| L27 | POSITIONING "Footage" | — | [truth]: demo clips still posted | — |
| L28 | SC-41 | `server/trading/orders.ts:270` | K-2, F-1 | +RISK |
| L29 | SC-08 | `useTradeExecutor.tsx:89,109` | F-1 | +RISK |
| L30 | SC-09 | `security.ts:470-597` | F-1 | +RISK |
| P02, P03, P06, P07, P10 follow-ups | SC-26, SC-11/SC-50, SC-20, KS-02, SC-14 | per row | P07: S-1 · P10: K-2 | DEMO on images; RISK on product follow-ups; STAT on P07 |
| meme-2, meme-6 | SC-19 tag names (chips only) | `web/components/common/WalletTags.tsx` | — | RISK-short |
| meme-3 | SC-09, SC-10 | `security.ts:362-447,470-597` | [truth] numbers from one frame | DEMO + RISK-short; +RISK caption |
| meme-5 | SC-25, SC-21, SC-18 | `server/analytics/wallets/signals.ts:229-253` | [truth] pins from the Activity tab | DEMO + RISK-short; +RISK caption |
| meme-7 | SC-09, SC-10, SC-18, SC-21, SC-26 | `track.ts:21`; `security.ts` | [truth] fields from one recording | DEMO + RISK-short; +RISK caption |

Everything else in this bank is general trench commentary with no product claim and no sourced statistic. Numbers inside `{slots}` are examples: replace them with the poster's own numbers.

**Checked against the never-say list** (ledger §5). No item contains: "live" or "soon" (MNC-01, MNC-13; R52's "yes" version points to the pinned post instead) · a token, airdrop or points line (MNC-02; R53 is silence by default) · a profit promise, "100x", "print" or "guaranteed" (MNC-03) · a claim that our tools make money (MNC-04) · traction or user numbers (MNC-05) · "detects", "predicts", "accurate" or "AI-powered" (MNC-06, MNC-07) · a speed or "first/only" claim (MNC-08, MNC-09) · a competitor, launchpad or terminal name or label (MNC-10, MNC-11) · an unbuilt feature such as a command palette or share cards (MNC-12) · a chain partnership or "robinhood" on its own (MNC-14) · a real person or KOL (MNC-15) · a cashtag (MNC-16) · "safe", "protects", "MEV-proof" or "exits before the dev" (MNC-17) · a call or advice on a real coin (MNC-18) · demo data presented as real (MNC-19) · a date (MNC-21) · a link · a [TS] reply without a trigger question.

**Retired from the simulator-era bank** (never post): the old R05, R10, R14, R15, R20, R25, R35 and R40 ("paper money", "fake trench", "our sim", "8 made-up launchpads"), L23–L30 ("our entire market is fake", "paper trading", "nfa. it's not even money.", faucet and respawn lines), P08 ("practice with fake money"), the `SIM · PAPER TRADING` stamps and every number read off `screen-token-audit.png` or `d4-a.mp4`, the DIS-02 sign-off `sim market · paper trading · nfa`, and the old "there is no token" answer.

---

## 8. Open owner decisions for this file

1. **"wen token" (T-1):** silence (the default, matching `PROFILE.md`, `WARMUP_WEEK.md` and `LAUNCH_DAY.md`), or one of R53's two deflections.
2. **Custody (K-1, K-2):** R14, R43 and R44 depend on K-1. R44 and R45 need the K-2 answer (`[K-2 ANSWER]`), and R20 and L28 wait on it.
3. **Chains (C-1):** every chain list (R46–R48) follows the per-chain ticks. Robinhood Chain is the likeliest to drop.
4. **Fees:** R49 never carries a number until the owner confirms the final fee.
5. **Legal (L-1):** whether pre-launch [TS] replies need RISK too, and whether RISK on post-launch [TS] replies is the right warning in the markets we reach.
6. **`[SUPPORT]`:** where users get help (R60). Never our DMs.
7. **Capture-mode gaps:** meme-3, meme-5 and meme-7 depend on clean captures. Closing the gaps in `marketing/tools/capture-mode.js` (ledger §7.1) beats cropping around them.
