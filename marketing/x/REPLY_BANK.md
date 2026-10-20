# Reply & shitpost bank

| | |
|---|---|
| **For** | Whoever runs the brand account, from day 1 of warm-up (Tue Oct 20) onward. This file is for **replies and filler originals**. The scheduled posts live in `WARMUP_WEEK.md` and `LAUNCH_DAY.md`. |
| **What's inside** | 40 reply templates in 8 situations · 30 standalone one-liners · 12 polls · 10 meme-card formats with an asset list (`meme-1` … `meme-10`) |
| **Rules come from** | `marketing/research/CLAIMS_LEDGER.md` (wins any conflict), `marketing/research/CT_PLAYBOOK.md`, `marketing/brand/BRAND_GUIDE.md` §4–5 |
| **Placeholders** | `@trenchscope` (handle not confirmed) and `[LINK]` (no live URL). Nothing in this bank needs a link. |
| **Character counts** | X-weighted (twitter-text v3: `·`, `—` and `–` count as 1, arrows and emoji as 2). Text inside `{braces}` is a **slot**: it must change every time, and the words inside are a working default. Counts are for the default with the braces removed. |

**Tags used below**

| Tag | Meaning |
|---|---|
| **[TS]** | Mentions Trenchscope or our sim. 8 of the 40 replies (1 in 5). Only use when the post asks for it (see §1.2) |
| **[stat]** | Real-market number. Keep the "~" and the time window, and have the source line ready (DIS-03) |
| **[truth]** | Describes something the operator must actually do in the app first. Do it, or don't post it |
| **DIS-02** | Ends with `sim market · paper trading · nfa`, because it names a feature or shows an app number |

---

## 0. At a glance

| Section | Count | Use it for | Pace |
|---|---|---|---|
| §2 Replies | 40 (5 per situation) | Value replies under other people's posts | 10–15 a day on day 1, rising to 25–40 by Oct 26. Each skeleton at most once a day |
| §3 One-liners | 30 | Filler originals, swap-ins when an asset isn't ready, quote-post captions | At most 1 a day, in an empty window, 2.5–3 h from any other original |
| §4 Polls | 12 | Learning what the audience fears, cheap replies | 1 every 2–3 days, 24 h each. Starts after the polls already scheduled (Oct 23, Oct 29) |
| §5 Meme cards | 10 | Image originals, rendered from `marketing/tools/cards.py` | 1–2 a week, never two on the same day |

---

## 1. Usage rules

These matter more than any single line in this file. One spam label can cost more reach than a week of good replies earns.

### 1.1 The rules

1. **Templates are skeletons, not text.** Never paste the same reply twice: not to two accounts, not on two days. X clusters near-duplicate replies and labels them `COPYPASTA_SPAM`.
2. **Every reply picks up one specific thing from the post you're replying to**: their number, their chart shape, their minute, their exact complaint. If you can't add one specific thing, like the post and move on.
3. **Rewrite three things every time:** the opener, the slot detail, and the shape of at least one sentence. §1.5 shows a worked example.
4. **Each skeleton at most once a day and three times a week.** Keep a private log (date, account, template ID, first five words) so you don't repeat yourself.
5. **Four out of five replies never mention Trenchscope.** The job of a reply is to be the most useful reply under that post. People find the account from the profile click, not from the plug.
6. **Type every reply by hand.** No auto-replies, keyword triggers, reply bots, or any tool that posts replies for you.
7. **No links in replies during warm-up.** After launch, a link goes only to someone who asked for it, and only once per thread. Never use a shortener.
8. **No tags, no cashtags, no contract addresses.** Don't `@` anyone who isn't already in the thread. Never write `$` before any ticker, real or sim. Never repeat a CA, even one the poster shared.
9. **No verdicts on real coins.** No "that's a rug", "it's safe", "buy", "sell", "hold" and no price calls. Explain the mechanism in general terms instead.
10. **No names.** Never name a real dev, KOL, launchpad, terminal or bot, even when the poster did. That includes our own sim launchpad names, because several of them echo real brands.
11. **Stats only from the ledger, always hedged.** In-sim numbers say "in the sim". Real-market numbers keep "~", a time window and "one dataset" or "major launchpads". Have the source line ready if someone asks.
12. **Never aim "larp", "jeet", "scammer" or "exit liquidity" at a person.** Self-deprecation only.
13. **No hashtags.** At most one emoji, and only when the emoji is the joke.
14. **Pace like a person:** no more than 8–10 replies an hour, spread across the posting windows. Twenty replies in ten minutes reads as a bot.
15. **On our own posts, answer every real reply within the first hour**, each one in fresh words. Mutual replies carry the most weight in ranking.

### 1.2 The mention budget ([TS] replies)

| Dates | Max [TS] replies under other people's posts | Conditions |
|---|---|---|
| **Tue Oct 20** (day 1) | **0** | Day 1 has no product mention at all (`WARMUP_WEEK.md` Day 1) |
| **Wed Oct 21 – Mon Oct 26** | **1 a day** | Only when someone asks directly ("what do you use?", "how do i practice this?"). No link: say "pinned post" |
| **Tue Oct 27** (launch) | Under our own launch posts, answer everything (use the `LAUNCH_DAY.md` §9.1 answer kit). Under other people's posts, **at most 1 in 5** | A link only to someone who asked for it |
| **From Wed Oct 28** | **At most 1 in 5 replies, and at most 5 a day** | Never two [TS] replies to the same account in one week |

Never post a [TS] reply under an account above ~250k followers (an LLM scores reply quality there), under someone's real-money loss, or under a post that isn't asking a question.

### 1.3 Big accounts: how not to reply-spam them

- **Target the 5k–200k-follower range** within 30–60 minutes of the post. That's where a good reply gets seen and doesn't get buried.
- **One reply per account per day.** Three a week at most, unless they reply back, at which point it's a conversation and you continue it naturally.
- **One reply per thread.** Don't reply to the post and then to three replies under it.
- **Don't be their shadow.** Replying to every post from the same KOL gets you muted, and in the ranker one mute (−58.8) cancels out roughly 90 likes (0.66 each).
- **Above ~250k followers, use only your most specific line**, never a [TS], never a gm. If you have nothing specific, skip it.
- **Never quote a big account just to get in front of its audience.** Quote only when you're adding a mechanism (`CT_PLAYBOOK.md` §1.3), and never to dunk on someone.
- **If they ignore you three times, stop replying to them.**

### 1.4 Don't reply to

- **Real-money distress.** Rent money, savings, debt or anything darker: no jokes and no product. A short kind line, or nothing at all.
- **Scams and their bait:** airdrop claims, "fund recovery", fake support, "connect wallet to verify". Hide, report and block under our own posts. Never reply under theirs.
- **Engagement farming:** "drop your CA", "reply gm for a follow", follow-for-follow, giveaway threads, "shill me your coin".
- **Terminal-vs-terminal threads, and competitors' own accounts.** We don't compare (MNC-10).
- **Politics, tragedies and news about real people.** Not our lane.
- **Accounts that look like bots** (no history, generic replies to everything).

### 1.5 How to rewrite a skeleton (worked example)

Skeleton R01 (§2.1):

```text
{rough.} the cheapest tell on most of these is the launch block: if the first {30} buyers all got funded by the same wallet, the chart was decided before you ever saw it.
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
- [ ] If it has a number: is it from the ledger, hedged, and labelled "in the sim" if it's ours?

---

## 2. Reply templates (40)

Five per situation. The **[TS]** one in each group is the exception, not the default. The "gm" group has none, and the terminal-rec group has two because the question invites it.

### 2.1 Someone got rugged

**Read the room.** Empathy first. Never sound like "you should have checked". Never ask for the coin's name or CA. If the loss sounds serious (rent, savings), skip R04 and R05. Openers to rotate: `rough.` · `brutal.` · `oof, sorry.` · `been there.` · `that one stings.` · `classic, and still awful.`

**R01 · the launch-block tell** · `166/280`

```text
{rough.} the cheapest tell on most of these is the launch block: if the first {30} buyers all got funded by the same wallet, the chart was decided before you ever saw it.
```

Use when they post the chart or the timeline. Swap the slot for their detail (their minute, their entry). Claims: general mechanism (SC-21 describes how our sim tags it, but this reply doesn't mention the sim).

**R02 · ask what they saw** · `161/280`

```text
{brutal.} what did the holders look like when you bought? top 10 share, the dev's bag and fresh wallets usually tell the story a few minutes before the chart does.
```

A question gets a reply back, and a reply back is the strongest signal there is. Answer their answer.

**R03 · it was a slow rug** · `212/280`

```text
{that shape is a slow rug.} nobody pulls the pool, they just sell in small pieces every few minutes so it reads as a dip. the trade list gives it away before the chart does: same wallets, similar sizes, on a timer.
```

Only when the chart really is a slow bleed (hours, not one candle).

**R04 · gallows humour** · `138/280`

```text
{pouring one out.} every trench veteran has a coin they don't say out loud anymore. {ours had a roadmap with five phases and a dev with zero.}
```

Only for small or joking losses, when the poster is laughing too. Never under a serious loss.

**R05 · [TS] reps without the bill** · `225/280`

```text
{if you want reps at spotting this without paying for them:} we run a simulated trench where every dev, bundler and rug is fake, and the wallets come labelled. paper money, no wallet, no token.

sim market · paper trading · nfa
```

Only if they (or someone in the thread) ask "how do people spot this?" Never under a raw loss post. Claims: SC-01, SC-04, SC-19. DIS-02.

### 2.2 Someone posts a huge win

**Read the room.** Celebrate. Never call it fake or a larp, never ask for the CA, never imply anyone can repeat it, and never repeat the ticker. Questions about how they did it beat compliments. Openers: `clean.` · `congrats, genuinely.` · `that's a good day.` · `respect.` · `well played.`

**R06 · the entry question** · `123/280`

```text
{clean.} the part nobody screenshots is the entry: how early, what size, what the holders looked like. what made you take it?
```

**R07 · the exit question** · `135/280`

```text
{congrats, genuinely.} the entry gets the screenshot but the exit is the hard part. did you {scale out on the way up} or take it in one go?
```

A question, not advice. Don't follow up with what they "should" have done.

**R08 · the graveyard joke** · `106/280`

```text
{well played.} this is the trade that makes everyone forget all the ones that went quiet. enjoy it properly.
```

**R09 · the trenches aren't dead** · `147/280`

```text
{respect.} saving this for the next person who says the trenches are dead. they're not dead, they're just very picky about who gets out in one piece.
```

**R10 · [TS] [truth] the self-own** · `180/280`

```text
{congrats.} our best trade this week was a paper buy that got sandwiched by our own sim's bot because we left anti-mev off. you're winning this one.

sim market · paper trading · nfa
```

Truth check: actually take a large paper buy on a migrated pool with anti-MEV off and get the MEV loss in the fill toast (FB-10) before you use it. Only under friendly, mid-size accounts. Claims: SC-13. DIS-02.

### 2.3 Someone asks for a terminal rec

**Read the room.** Never name, rank or dunk on any terminal, bot or launchpad, including ones other repliers suggest (MNC-10). Give criteria they can apply to anything. Use **[TS]** only when the question is open ("what should I use?"), once per thread, and always say it's a paper-trading sim, not a place to trade real money.

**R11 · four things to check** · `223/280`

```text
whatever you end up using, check four things first: does it show the full cost before you click, does it label wallets (dev, snipers, bundlers), does it show the dev's past launches, and does it say "unknown" instead of 0%.
```

**R12 · habit beats tool** · `184/280`

```text
{honestly} the tool matters less than the order you look at things in: holders first, chart second, buy button last. whichever terminal makes that order easiest is the right one for you.
```

**R13 · the fee test** · `194/280`

```text
one test for any rec you get: ask what a {0.5 sol} trade costs all in. platform fee plus priority fee plus tip. on small trades that adds up fast, and whoever recommends it should know the number.
```

Never put a fee figure for a named product in the reply (KS-11 is our own arithmetic, not a measured stat).

**R14 · [TS] the biased answer** · `266/280`

```text
biased answer, since we're building one: ours is a paper-trading terminal on a simulated market, with dev, sniper, bundler and insider labels and the full cost shown before you click. it's for practice, not real trades. pinned post.

sim market · paper trading · nfa
```

Before launch, "pinned post" points to the "what is this" post. After launch, the link is in the pinned post's replies. Paste `[LINK]` only if they reply asking for it. Claims: SC-01, SC-11, SC-19. DIS-02.

**R15 · [TS] for someone brand new** · `231/280`

```text
if you're brand new: most people's first lessons in the trenches cost real money. we're building the version where they cost fake money, a simulated market with paper balances. no wallet, no token.

sim market · paper trading · nfa
```

Only when the poster says they're new. It offers practice, not outcomes: never add "so you'll be ready" or "learn to win" (MNC-19). Claims: SC-01, SC-02, SC-35. DIS-02.

### 2.4 Dev-sold drama

**Read the room.** No verdict on the real dev ("scammer", "rugger"), no names, no "that's a rug". Explain what the sell means and ask about the sizes. Openers: `oof.` · `the classic.` · `ah, the dev.` · `there it is.`

**R16 · timing and size** · `205/280`

```text
a dev selling isn't automatically a rug. what matters is when and how much: dumping into the first wave of buyers is an exit plan, a small sell weeks later might just be rent. {what did the sizes look like?}
```

**R17 · the résumé** · `195/280`

```text
worth pulling up the wallet's history: how many coins it launched before this one and how many ever made it off the curve. a long list with nothing migrated isn't bad luck, it's a business model.
```

General advice on what to look at. Never post the history of a real dev wallet yourself.

**R18 · character arc** · `75/280`

```text
"dev is based" to "dev sold" is still the fastest character arc in fiction.
```

**R19 · the scarier dev** · `209/280`

```text
unpopular take: a dev who already sold everything can't dump that bag twice. the one to worry about is the dev still sitting on a big chunk who stopped posting. (the other wallets are a separate conversation.)
```

**R20 · [TS] the dev-sell exit** · `227/280`

```text
this exact moment is why our sim has a "dev sell" signal and an exit that sells when the dev does. on paper you get to find out whether it fires fast enough, which is the cheap way to find out.

sim market · paper trading · nfa
```

Never claim it gets you out in time: fills have 120–600 ms of simulated latency (SC-13). Claims: SC-14, SC-18. DIS-02.

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
{good catch.} was it the funding trail or just the same-block timing? timing alone can be snipers racing each other. shared funders are what turn it into a bundle.
```

**R25 · [TS] how the sim tags it** · `213/280`

```text
in our sim, a wallet that buys in the creation block gets a bundler tag, and the token card shows the bundler share before you click buy. fake coins, same pattern you just posted.

sim market · paper trading · nfa
```

Claims: SC-09, SC-21. Say "tags", never "detects". DIS-02.

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

**R34 · [stat] green day: the footnote** · `166/280`

```text
enjoy it. sobering footnote: in one major launchpad's data, ~73% of graduates were down 60%+ from their migration price within 20 minutes. the curve is the easy part.
```

KS-02, hedged. If anyone asks for the source, reply in fresh words with the meaning of: `source: launchpad lifecycle data (secondary), one launchpad, sample window not published. approximate.` Use it at most once a week, and never in the 48 h after a post that used the same stat (D7-P2 on Oct 26).

**R35 · [TS] red day plan** · `194/280`

```text
red day plan: get rugged on paper instead. our simulated trench keeps launching, migrating and rugging coins with fake money, whatever the real market is doing.

sim market · paper trading · nfa
```

Claims: SC-01, SC-04. DIS-02.

### 2.8 New launchpad meta

**Read the room.** A new launchpad, chain or curve mechanic is suddenly everywhere. Never name it in our reply (even if the poster did), never imply affiliation, never predict that it'll pump. Ask mechanism questions.

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

**R40 · [TS] 8 fake launchpads** · `200/280`

```text
our sim runs 8 made-up launchpads across 4 fake chains. the names are invented. we scripted bundlers into every one of them anyway, because that's the realistic part.

sim market · paper trading · nfa
```

Never name the sim launchpads. Claims: SC-04, SC-06. DIS-02.

---

## 3. Standalone one-liners (30)

**How to use them.** Each is posted **once**, as a filler original in an empty window, a swap-in when an asset isn't ready, or a quote-post caption. One a day at most, 2.5–3 h from any other original. Don't post two from the same group back to back. Don't reuse one as a reply (that makes it a duplicate). Lines L01–L27 need no disclaimer: they show no feature and no app number. L28–L30 do, so DIS-02 is included.

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

**L12** · `65/280`

```text
the curve doesn't care about your conviction. it only counts sol.
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

**L20** · `162/280`

```text
a sniper buys in the first few blocks. a bundler buys in the block the coin was born. an insider got gas money from the dev.

three different villains. one chart.
```

**L21** · `123/280`

```text
a coin graduating means the curve filled and there's a real pool now. for the early wallets, a real pool means a real exit.
```

**L22** · `61/280`

```text
slippage is the price you agreed to pay for being in a hurry.
```

### 3.3 Larp and brand (self-aware, no feature)

**L23** · `74/280`

```text
our entire market is fake and it still has more drama than most real ones.
```

**L24** · `77/280`

```text
paper hands are a personality. paper trading is a hobby. we're here for both.
```

**L25** · `25/280`

```text
nfa. it's not even money.
```

**L26** · `101/280`

```text
buying the top is a rite of passage. buying it on paper first is the same rite, minus the rent money.
```

**L27** · `134/280`

```text
the devs in our sim are fictional. the ones scripted to rug still sell at the worst possible moment. method actors, every one of them.
```

Claims: SIM-01 (fates are scripted). No number, no feature, so no disclaimer needed.

### 3.4 Product-light (DIS-02 included)

**L28 · [truth]** · `168/280`

```text
lost the whole paper bag before lunch. hit the faucet. back in a minute later.

the healthiest relationship with money we've ever had.

sim market · paper trading · nfa
```

Truth check: actually lose a paper balance and refill it. Claims: SC-03 (once a minute per chain).

**L29** · `117/280`

```text
a respawn button won't make you a better trader. it just makes the lessons cheaper.

sim market · paper trading · nfa
```

Claims: SC-03. It promises no outcome, on purpose (MNC-19).

**L30** · `172/280`

```text
every audit row in our terminal comes with a threshold and a plain-english hint. we're aware this is the least degen sentence ever posted.

sim market · paper trading · nfa
```

Claims: SC-09.

---

## 4. Polls (12)

**How to run them.** Run each poll for 24 h, in window A or B. **At most one every 2–3 days.** `WARMUP_WEEK.md` already runs one on Fri Oct 23 (R3 is in reserve) and `LAUNCH_DAY.md` runs one on Thu Oct 29, so this bank starts around **Sat Oct 31**. Twelve polls cover about five weeks. Each option is within X's 25-character limit.

Reply to voters with one line of mechanism for their pick, written fresh each time. When you follow up on a result, say which option won, in words. **Never post vote counts or percentages as if they were a stat about traders** (a small, self-selected poll is not data, MNC-05).

**P01 · first check** · question `42/280`

```text
first thing you check on a brand-new coin?
```

| Option | Chars |
|---|---|
| `holder concentration` | 20 |
| `the dev's wallet` | 16 |
| `bundle share` | 12 |
| `vibes, honestly` | 15 |

Follow-up: a "trench dictionary" card for the winning option.

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

Follow-up: the dev-status idea in new words (holding / sold part / sold all / bought more, SC-26). Don't recycle D7-P3's text.

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

Follow-up: if "tx failed" wins, a post on slippage and failed fills (SC-13, paper).

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

Follow-up: if "smart money" wins, explain how the sim earns the tag from behaviour (SC-20). No accuracy numbers.

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

Follow-up: the ~73% stat (KS-02) in new words, with the source in the first reply. Wait at least 48 h after any other post that used it.

**P08 · practice first?** · question `64/280`

```text
would you practice with fake money before aping with real money?
```

| Option | Chars |
|---|---|
| `yes, obviously` | 14 |
| `no, pain teaches` | 16 |
| `i already do` | 12 |
| `what's paper trading` | 20 |

This is the most product-adjacent poll, so keep the follow-up honest and self-aware: "the people have spoken. the pain-teaches crowd is welcome too, the faucet doesn't judge." Never cite the result as demand for the product.

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

Follow-up: if "vibes" wins (it will), a post about exit orders on paper (SC-14) with DIS-02.

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

Follow-up: if "i'm not in yet" gets votes, that's an audience worth writing newcomer explainers for.

---

## 5. Meme-card formats (10)

**How they're built.** All ten are type-only or vector cards rendered with `marketing/tools/cards.py` (HTML → PNG). There's **no AI and no stock imagery**: no real people, no real meme-template art, no real coin logos. Brand rules: bg `#0A0C10`, panels `#11141A`, fg `#E6E9F0`, muted `#8C94A3`, one amber `#FFB547` accent, red `#FF5468` only for loss or danger, wallet-tag colours only on wallet labels. Inter for words, JetBrains Mono for numbers and chips. Nothing under 20 px on a 1080-wide canvas. Trenchscope mark in the footer corner.

**Rules for these cards.**
- A card that shows sim numbers or app UI (meme-3, meme-5, meme-7) gets the `SIM · PAPER TRADING` stamp in the pixels, uses only numbers from a real capture, blurs the ticker, and ends its caption with DIS-02.
- Never a real ticker, CA, project, launchpad or person, even as a joke square.
- Post each card once. A "vol. 2" is a new card with new lines.
- Alt text goes on every image, written plainly.

**Template status.** `meme` already exists in `cards.py` (headline plus `label: value` rows) and covers meme-3, meme-4, meme-7 and meme-9. It only puts a label in the left column when the label is 14 characters or fewer, so raise that limit for meme-4 and meme-7, whose labels are longer. Five new layouts are needed: `grid` (N×N squares; meme-1, meme-2), `split` (two panels; meme-5), `poster` (meme-6), `tiles` (2×3; meme-8) and `forecast` (columns; meme-10).

### meme-1 · trench bingo · 1080 × 1350 · `grid` 5×5

**Image.** A 5×5 bingo card of dark `#11141A` squares with thin `#222731` rules. Each square holds one short line in Inter 600. The centre square is amber-outlined and reads **FREE: you aped anyway**. The other 24 squares: `dev "stepping away"` · `"it's a social experiment"` · `top 10 holds half` · `30 buyers in the launch block` · `"next leg up loading"` · `"just a shakeout"` · `one green candle, then a cliff` · `fresh wallets everywhere` · `roadmap with 5 phases` · `the group chat goes read-only` · `"cto incoming"` · `dev sold into the first pump` · `big volume, four traders` · `sell tx fails` · `"we're just getting started"` · `migrated, then straight down` · `anti-mev off` · `slippage at 50%` · `dev wallet funded 5 min ago` · `same funder, every wallet` · `the socials link to nothing` · `the caller deleted the post` · `"i'll set a stop-loss later"` · `website made in an afternoon`.

**Headline:** `trench bingo` · **Subtext:** `how many squares did your last coin hit?`

**Caption** · `111/280`

```text
trench bingo.

how many squares did your last coin hit? reply with your count. blackout wins nothing, as usual.
```

> Alt (269 chars): A dark bingo card titled trench bingo with 25 squares of memecoin clichés, such as dev stepping away, it's a social experiment, 30 buyers in the launch block, just a shakeout, sell tx fails and the socials link to nothing. The centre free square reads: you aped anyway.

### meme-2 · trench alignment chart · 1200 × 1200 · `grid` 3×3

**Image.** A classic 3×3 alignment grid (lawful / neutral / chaotic × good / neutral / evil) as type-only cells. Each cell has the wallet-tag chip in its tag colour on top and a one-line description underneath. Lawful good: **smart money** `in early, out on schedule, never posts about it`. Neutral good: **whale** `buys big and just… holds`. Chaotic good: **cto crew** `rebuilding the socials at 4am`. Lawful neutral: **sniper** `block 1, sells into the first wave, every time`. True neutral: **fresh wallet** `no history. no personality. no comment.` Chaotic neutral: **bot** `trading with itself every 3 seconds`. Lawful evil: **bundler** `same block as creation, funded by the dev`. Neutral evil: **insider** `gas money from the dev, "just a fan"`. Chaotic evil: **dev** (no description, just the chip).

**Headline:** `trench alignment chart` · **Subtext:** `every wallet here is an archetype, not a person`

**Caption** · `88/280`

```text
trench alignment chart.

which one are you, and which one keeps buying your coins first?
```

> Alt (313 chars): A three-by-three alignment chart of trench wallet types. Lawful good: smart money. Neutral good: whale. Chaotic good: community takeover crew. Lawful neutral: sniper. True neutral: fresh wallet. Chaotic neutral: bot. Lawful evil: bundler. Neutral evil: insider. Chaotic evil: the dev. Archetypes, not real people.

### meme-3 · trench facts (nutrition label) · 1080 × 1350 · `meme`

**Image.** A nutrition-facts label drawn in the brand palette: a `#11141A` panel with heavy `#E6E9F0` rules, the title **Trench Facts** in Inter Black, `serving size: 1 launch · servings per container: 7 holders`. Rows in Mono, red for the bad ones, using the real numbers from spot the rug #1's token B (`marketing/screens/screen-token-audit.png`): `dev holding 17%` · `insiders 30%` · `bundlers 49%` · `fresh wallets 71%` · `top 10 holders 49%` · `smart money 0` · `rug ratio 82%`. A bold rule, then `audit: 7 flags · high risk`. Footer lines: `ingredients: one dev, one funder, many wallets.` and `may contain traces of a community.` `SIM · PAPER TRADING` stamp top-right. Ticker and name not shown.

**Headline:** `trench facts` · **Subtext:** `token B from spot the rug #1 · a fictional sim entity`

**Caption** · `167/280`

```text
nutrition label for token B from spot the rug #1.

ingredients: one dev, one funder, many wallets. may contain traces of a community.

sim market · paper trading · nfa
```

> Alt (329 chars): A nutrition-facts style label titled Trench Facts for a fictional simulated token. Serving size one launch, 7 holders. Dev holding 17%, insiders 30%, bundlers 49%, fresh wallets 71%, top 10 holders 49%, smart money 0, rug ratio 82%. Audit: 7 flags, high risk. Footer: may contain traces of a community. SIM · PAPER TRADING stamp.

Post only after spot the rug #1 has run (Wed Oct 21). If the audit image is re-captured, update every number to match. Claims: SC-09, SC-10.

### meme-4 · trench translator · 1080 × 1350 · `meme`

**Image.** Two columns: *what they say* in fg on the left, *what it usually means* in amber Mono on the right, with a thin rule between rows. Rows: `"stealth launch"` → `the bundle knew first` · `"community takeover"` → `the dev left` · `"healthy dip"` → `slow rug, chapter 1` · `"organic volume"` → `four wallets on a loop` · `"lp is burned, it's safe"` → `the pool is safe. you aren't.` · `"the devs are doxxed"` → `a profile picture exists` · `"the devs are building"` → `the devs are selling` · `"we're so early"` → `you're buyer #200`.

**Headline:** `trench translator` · **Subtext:** `what they say vs what it usually means. not about anyone in particular.`

**Caption** · `100/280`

```text
trench translator, vol. 1.

what did we miss? we'll paraphrase the best ones into vol. 2 (no names).
```

> Alt (327 chars): A two-column card titled trench translator. Left, phrases traders hear; right, what they usually mean. Stealth launch: the bundle knew first. Community takeover: the dev left. Healthy dip: slow rug, chapter 1. Organic volume: four wallets on a loop. LP is burned: the pool is safe, you aren't. We're so early: you're buyer 200.

Vol. 2 uses reply ideas paraphrased, never quoted with a handle, and it's not a prize.

### meme-5 · the chart in your head vs the chart · 1600 × 900 · `split`

**Image.** Left panel, labelled `the chart in your head`: a clean vector line in amber climbing smoothly up and to the right, with a small `you` pin at the bottom-left. Right panel, labelled `the chart`: a **real crop** of 1-second candles from a sim token page during a rug (the same replay as the rug autopsy), with two amber pins on the real signal moments, `dev sell` and `bundler sell`, and the candles falling off a cliff. Ticker blurred. `SIM · PAPER TRADING` stamp on the right panel. No AI, no invented chart data.

**Headline:** `the chart in your head / the chart` · **Subtext:** `right panel: a real sim replay. left panel: your imagination.`

**Caption** · `102/280`

```text
every entry comes with two charts. only one of them has a dev in it.

sim market · paper trading · nfa
```

> Alt (296 chars): Two panels. Left, labelled the chart in your head: a smooth line climbing up and to the right. Right, labelled the chart: real one-second candles from a simulated token in Trenchscope, with markers for dev sell and bundler sell, then a collapse. SIM · PAPER TRADING stamp. The token is fictional.

Claims: SC-18, SC-25.

### meme-6 · wanted: the bundler (series of 4) · 1080 × 1350 · `poster`

**Image.** A wanted-poster layout in brand colours (no sepia, no Western clip-art). A thick amber frame; **WANTED** in Inter Black at the top; in the middle, a flat vector silhouette of a hooded, faceless figure inside a scope reticle (drawn as SVG, no AI, no face); **THE BUNDLER** under it, with the bundler chip in `#FACC15`. Fields in Mono: `last seen: the creation block` · `known associates: 30 wallets, one funder` · `distinguishing marks: holds a lot of a coin that's 3 seconds old` · `reward: none. it's fake money.` Footer: `a fictional archetype, not a person`.

Later posters, one a week, follow the trailer cast: **THE SNIPER** (`#F87171`: `last seen: blocks 1 to 3`), **THE INSIDER** (`#F472B6`: `last seen: receiving gas money from the dev`), **THE DEV** (`#FB923C`: `last seen: "afk for a bit"`). Each one gets its own new caption.

**Headline:** `WANTED: THE BUNDLER` · **Subtext:** `a fictional archetype, not a person · part 1 of 4`

**Caption** · `104/280`

```text
wanted: the bundler.

buys your coin before it exists on your screen. never travels alone.

part 1 of 4.
```

> Alt (287 chars): A wanted poster in dark navy and amber. A faceless hooded silhouette inside a scope reticle, labelled THE BUNDLER with a yellow bundler chip. Last seen: the creation block. Known associates: 30 wallets, one funder. Reward: none, it's fake money. A fictional archetype, not a real person.

Post after launch, when the trailer has introduced the cast. Don't reuse the D6-P2 teaser lines.

### meme-7 · rug autopsy report (toe tag) · 1080 × 1350 · `meme`

**Image.** A morgue toe tag drawn as a `#11141A` card with a punched hole and an amber string. Fields in Mono, **filled only from one real sim replay** (use the launch recorded for the rug-autopsy clip): `deceased: [blurred], age [N] min` · `cause of death: dev sell` · `contributing factors: bundled in the creation block, snipers in blocks 1–3` · `time of death: [N] min after launch` · `holders at time of death: [N]` · `witnesses: the audit panel, [N] flags`. Stamp: `SIM · PAPER TRADING`.

**Headline:** `rug autopsy report` · **Subtext:** `every field from one real sim replay · the token is fictional`

**Caption** · `128/280`

```text
coroner's report on one sim launch.

the cause of death was on the audit panel before it died.

sim market · paper trading · nfa
```

> Alt (297 chars): A toe tag styled as a coroner's report for a fictional simulated token. Cause of death: dev sell. Contributing factors: bundled in the creation block, snipers in blocks 1 to 3. Time of death and holder count are filled from a real sim replay. Witnesses: the audit panel. SIM · PAPER TRADING stamp.

**[truth]** Only use the caption's second line if the audit really showed red rows before the dev sell in that replay. Fill every `[N]` with the real value and update the alt text to match. Claims: SC-09, SC-18, SC-21.

### meme-8 · trench newcomer starter pack · 1200 × 1200 · `tiles` 2×3

**Image.** Six tiles, each with a simple line icon (stroke icons in fg, one amber detail) and a caption: `a ca from a stranger's reply` (speech bubble) · `"dev is based"` (thumbs up) · `anti-mev: off` (toggle switched off) · `"i'll watch it, no stop-loss"` (eye) · `slippage: 50%` (slider maxed out) · `a group chat with more bots than people` (chat bubbles with a tiny robot). No real apps' icons, no logos.

**Headline:** `trench newcomer starter pack` · **Subtext:** `we've owned every item on this card`

**Caption** · `98/280`

```text
trench newcomer starter pack.

we've personally owned every item on this card. some of them twice.
```

> Alt (244 chars): A starter-pack card titled trench newcomer starter pack, with six icon tiles: a contract address from a stranger's reply, dev is based, anti-MEV off, i'll watch it with no stop-loss, slippage at 50%, and a group chat with more bots than people.

### meme-9 · famous last words, tier list · 1200 × 1200 · `meme`

**Image.** A tier list with S / A / B / C / D bands, coloured from amber (S) through muted to red (D). One quote per tier in Inter 600: S `"dev is based"` · A `"it's a cto now, it's different"` · B `"i'll sell at 2x"` · C `"i'm not selling, i'm a believer"` · D `"one more coin, then i'm done"`.

**Headline:** `famous last words` · **Subtext:** `ranked by how fast they age`

**Caption** · `92/280`

```text
famous last words in the trenches, ranked by how fast they age.

what's missing from s tier?
```

> Alt (232 chars): A tier list titled famous last words, ranked by how fast they age. S tier: dev is based. A tier: it's a CTO now, it's different. B tier: i'll sell at 2x. C tier: i'm not selling, i'm a believer. D tier: one more coin, then i'm done.

### meme-10 · trench forecast · 1600 × 900 · `forecast` (7 columns)

**Image.** A weekly weather forecast strip with seven day columns, each with a simple vector weather icon whose details are made of tiny candles (a cloud raining red candles, a sun with green-candle rays, fog). **No percentages or numbers.** Mon `scattered snipers` · Tue `heavy bundling, clearing after migration` · Wed `dev-sell advisory in effect` · Thu `dense fog of fresh wallets` · Fri `slow-rug drizzle, all day` · Sat `quiet. coins go quiet.` · Sun `community takeover front moving in`.

**Headline:** `trench forecast` · **Subtext:** `this week: same as last week`

**Caption** · `77/280`

```text
this week's trench forecast.

bring an umbrella. it won't help, but bring it.
```

> Alt (312 chars): A seven-day weather forecast for the trenches with candle-shaped weather icons. Monday: scattered snipers. Tuesday: heavy bundling, clearing after migration. Wednesday: dev-sell advisory. Thursday: dense fog of fresh wallets. Friday: slow-rug drizzle. Saturday: quiet. Sunday: community takeover front moving in.

Best posted on a Monday morning (window A).

---

## 6. Assets needed

All status **NEW**. Build with `marketing/tools/cards.py`, export PNG to `marketing/x/posts/`. Brand rules in §5.

| Ref | Size | Template | Source data | Concept | Headline (on image) | Subtext (on image) | Stamp |
|---|---|---|---|---|---|---|---|
| `meme-1` | 1080 × 1350 | `grid` 5×5 (new) | none | Trench bingo: 24 cliché squares + FREE "you aped anyway" | `trench bingo` | `how many squares did your last coin hit?` | none |
| `meme-2` | 1200 × 1200 | `grid` 3×3 (new) | wallet-tag colours | Alignment chart of wallet archetypes, chip per cell | `trench alignment chart` | `every wallet here is an archetype, not a person` | none |
| `meme-3` | 1080 × 1350 | `meme` | `screens/screen-token-audit.png` (token B) | Nutrition label of real sim audit numbers | `trench facts` | `token B from spot the rug #1 · a fictional sim entity` | `SIM · PAPER TRADING` |
| `meme-4` | 1080 × 1350 | `meme` | none | Two-column "what they say / what it means" | `trench translator` | `what they say vs what it usually means. not about anyone in particular.` | none |
| `meme-5` | 1600 × 900 | `split` (new) | real 1s-candle crop of a sim rug replay | Imagined smooth chart vs the real sim cliff with dev/bundler-sell pins | `the chart in your head / the chart` | `right panel: a real sim replay. left panel: your imagination.` | `SIM · PAPER TRADING` (right panel) |
| `meme-6` | 1080 × 1350 | `poster` (new) | vector silhouette (SVG, no AI) | Wanted poster, THE BUNDLER (series: sniper, insider, dev) | `WANTED: THE BUNDLER` | `a fictional archetype, not a person · part 1 of 4` | none |
| `meme-7` | 1080 × 1350 | `meme` | one real sim rug replay (the autopsy launch) | Toe-tag coroner's report, every field real | `rug autopsy report` | `every field from one real sim replay · the token is fictional` | `SIM · PAPER TRADING` |
| `meme-8` | 1200 × 1200 | `tiles` 2×3 (new) | line icons | Newcomer starter pack, six habits | `trench newcomer starter pack` | `we've owned every item on this card` | none |
| `meme-9` | 1200 × 1200 | `meme` | none | Tier list of famous last words | `famous last words` | `ranked by how fast they age` | none |
| `meme-10` | 1600 × 900 | `forecast` (new) | candle-shaped weather icons | Seven-day trench weather forecast, no numbers | `trench forecast` | `this week: same as last week` | none |

**Production order.** The pure-type cards first, because they need no capture: `meme-4`, `meme-9`, `meme-1` → `meme-2`, `meme-8`, `meme-10` (new layouts) → `meme-3` (after Wed Oct 21) → `meme-5`, `meme-7` (from the rug-autopsy recording, `d4-a` in `WARMUP_WEEK.md` §9) → `meme-6` (after launch).

---

## 7. Claims map and final check

| Item | Claims used | Disclaimer |
|---|---|---|
| R05 | SC-01, SC-04, SC-19 | DIS-02 |
| R10 | SC-13 (truth check: FB-10) | DIS-02 |
| R14 | SC-01, SC-11, SC-19 | DIS-02 |
| R15 | SC-01, SC-02, SC-35 | DIS-02 |
| R20 | SC-14, SC-18 (latency caveat SC-13) | DIS-02 |
| R25 | SC-09, SC-21 | DIS-02 |
| R34 | KS-02 | DIS-03 (hedged in text; source reply ready) |
| R35 | SC-01, SC-04 | DIS-02 |
| R40 | SC-04, SC-06 | DIS-02 |
| L27 | SIM-01 | none needed (no feature or number) |
| L28, L29 | SC-03 | DIS-02 |
| L30 | SC-09 | DIS-02 |
| meme-3 | SC-09, SC-10 | DIS-02 + SIM stamp |
| meme-5 | SC-18, SC-25 | DIS-02 + SIM stamp |
| meme-7 | SC-09, SC-18, SC-21 | DIS-02 + SIM stamp |

Everything else in this bank is general trench commentary with no product claim and no sourced statistic. Numbers inside `{slots}` are examples: replace them with the poster's own numbers.

**Checked against the never-say list.** No item contains: a token, airdrop or points promise (MNC-02) · a profit promise, "100x", "print" or "guaranteed" (MNC-03) · traction or user numbers (MNC-05) · "detects", "predicts", "accurate" or "AI-powered" (MNC-06, MNC-07) · a speed claim (MNC-08) · a "first" or "only" claim (MNC-09) · a competitor, launchpad or terminal name or label, including "almost bonded" and "P1/P2/P3" (MNC-10, MNC-11) · an unbuilt feature such as share cards or a safety score (MNC-12) · a roadmap promise (MNC-13) · a real person or KOL (MNC-15) · a cashtag (MNC-16) · a learning-outcome promise (MNC-19) · a link.
