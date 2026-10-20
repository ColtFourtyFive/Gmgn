# Warm-up week: X calendar, Day 1 → Day 7

| | |
|---|---|
| **For** | The person running the brand account. Up to seven days that tease the real terminal. Launch day is the first morning after the launch gate passes: if that's before Day 7 (the expected path, since real trading goes live this week), the warm-up compresses per §11.1; otherwise launch day follows Day 7. Launch posts go up only once real trading works (`x/LAUNCH_DAY.md`) |
| **What we're teasing** | A memecoin trading terminal that trades and tracks across **Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain**, with **self-custody** (`research/POSITIONING.md`). Nothing this week says it's live |
| **Placeholders** | `@trenchscope` (handle not confirmed). No `[LINK]` anywhere this week |
| **Rules come from** | `research/POSITIONING.md` (the binding brief), then `research/CLAIMS_LEDGER.md` (claim IDs, the never-say list MNC-xx, disclaimers, owner checks; it wins over this file), `x/TODAY.md` (the approved Day-1 kit), `x/PROFILE.md` (setup, pin, follows, Metricool), `research/CT_PLAYBOOK.md` (ranking, cadence, spam) and `research/AI_VIDEO_NOTES.md` (AI clips), `brand/BRAND_GUIDE.md` (voice, visuals, disclaimer placement) |
| **Claims checked** | Every feature line maps to a ledger ID and was re-checked in the code for this rewrite. Files are cited in each post's notes (`web/` = `apps/web/src/`, `server/` = `apps/server/src/`) |
| **Times** | ET (US Eastern; UTC = ET + 4 all week). Times of day only. No post, image, video or alt text carries a date |
| **Windows** | **A** 8:30–11:00 a.m. · **B** 12:00–3:00 p.m. · **C** 8:00–10:30 p.m. (Asia morning). Originals at least 2.5–3 h apart |
| **Counts** | X-weighted, measured with `xlen.py` (`·`, `—` and `–` count 1; emoji 2). Each post shows **n / 280**. Every post fits, so none needs "Show more". Poll options are ≤ 25 characters |

---

## 0. The week at a glance

| Day | Theme | Originals (ET) | Value replies | Follows (running total) | One KPI |
|---|---|---|---|---|---|
| **Day 1** | show up | 9:30 opener · 12:30 pinned post · 3:30 poll · 8:30 field guide ep.01 | 10–15 | 20 (20) | D1-P1's like-per-view in its first 2 h |
| **Day 2** | meet the cast | 9:30 field guide: sniper · 12:30 spot the rug #1 (reveal ~3:30) · 8:30 the board | 15–20 | 20 (40) | A/B guesses before the reveal |
| **Day 3** | the trench in numbers | 9:00 ~97% stat · 12:15 lifecycle thread · 3:00 field guide: bundler · 8:30 keyboard clip | 20–25 | 10 (50) | New follows from the thread |
| **Day 4** | follow the money | 9:30 field guide: insider · 12:15 funding links · 3:00 poll · 8:30 five chains | 20–30 | 20 (70) | Replies and quotes on "five chains" |
| **Day 5** | the dev | 10:30 field guide: dev · 2:00 auto exits · 8:30 smart money | 15–20 | 15 (85) | 50% playback on the dev clip |
| **Day 6** | fake volume | 9:30 spot the rug #2 (reveal 12:30) · 2:00 fresh & bot · 8:30 the audit | 15–25 | 15 (100) | Shares (DM + copy link) on the audit |
| **Day 7** | soon | 9:00 risk prompt · 12:00 ~73% stat · 3:00 kol · 8:30 "soon" teaser (only if the launch gate hasn't passed) | 25–40 | 20 (120) | Under the Hood clean: the go / no-go for launch |

**25 originals** over 7 days (4 on Day 1, 3–4 a day after), plus self-replies: the CUSTODY reply under the pin, two spot-the-rug reveals, two stat sources and a 6-post thread. Following stays far under the ~200 ceiling, and the Day 1–3 follows match the "first 50" plan in `PROFILE.md` §10.3. Days 5 and 6 fall on the weekend this week, so they're lighter. **If the launch gate passes before Day 7, §11.1 takes over**: launch day is the next morning, and the unposted peeks move after it.

**Pillars, and where each one runs:**

| Pillar | Posts |
|---|---|
| (a) Trench dictionary, one wallet tag per post | sniper D2-P1 · bundler D3-P3 · insider D4-P1 · dev D5-P1 · smart money D5-P3 · fresh & bot D6-P2 · kol D7-P3 (whale, R5, if F-2 isn't confirmed) |
| (b) Field-guide AI teasers from the existing clips | whale D1-P3 (still) · sniper D2-P1 · bundler D3-P3 · insider D4-P1 · dev → rug D5-P1 · periscope → empty desk D7-P4. Sniper, bundler, insider and dev carry their dictionary definition on a closing card, so each is one post for both pillars |
| (c) Product peeks: real UI on demo data | holder chips D2-P2 · the board D2-P3 · keyboard flow D3-P4 · funding links and holders by tag D4-P2 · chain switcher D4-P4 · auto exits with the dev-sell exit D5-P2 · the audit D6-P3 · the risk prompt D7-P1 |
| (d) Real-market stats (AMBER, sourced) | KS-01 D3-P1 · KS-02 D7-P2 (KS-07 in reserve R7) |
| (e) Polls, memes, community | poll D1-P2 · spot the rug #1 D2-P2 · lifecycle thread D3-P2 · poll D4-P3 · spot the rug #2 D6-P1 (memes R1, R2 in reserve) |
| (f) Building in public | "five chains, one terminal" D4-P4 (plus the thread's last post, D3-P2 6/) |
| "soon" | D7-P4 only: one product-level `soon.`, no chain list, skipped if the launch gate has passed (ledger MNC-01's one exception) |

---

## 1. Rules for every post this week

1. **Nothing says "live".** No "live", "trade now", "sign up", "try it" or "launching", no link and nothing that looks like a URL: not in posts, replies, alt text, images or video (MNC-01). Avoid near-misses like "alive" too, so the queue check stays clean. "soon" appears once, in D7-P4, with no chain list next to it, and only if the launch gate hasn't passed by then. In replies, "is it live?" gets "not yet", never "soon" (`PROFILE.md` §9.4).
2. **No dates.** No calendar date, month, year or weekday-plus-date anywhere (MNC-21). Use relative words: "lately", "a day later", "within 20 minutes".
3. **No hashtags, no cashtags, no real tickers.** No emoji planned. Demo tickers never go in post copy, and they're blurred in close-ups (MNC-16).
4. **Originals at least 2.5–3 h apart**, inside or next to the windows (a late-B slot at 3:00 p.m. sits in the day's peak launch hours, CT_PLAYBOOK §5.1). Never three originals inside an hour: the author-diversity multiplier drops each extra post in a viewer's feed to 0.625× and then 0.44× (CT_PLAYBOOK §3.3).
5. **Stay 60 minutes after every original** and answer every real reply in fresh words. The first ~200 views or 2 hours are the cold-start audition, judged on like-per-view (CT_PLAYBOOK §3.3).
6. **Labels** (ledger §6):
   - **DEMO** `UI shown with demo data` is burned into every product frame (a corner, at least ~2% of the frame height, high contrast) and goes in the alt text. A caption alone isn't enough.
   - **AI** `AI-generated` is burned into every AI frame, X's "Made with AI" label is switched on, and the alt text starts with "AI-generated".
   - **RISK-short** `high risk · nfa` sits on the bottom edge of every card (dictionary and stat cards).
   - **STAT** goes in the first self-reply of every stat post.
   - **CUSTODY** is in the pinned self-reply (PIN-r1).
   - Full **RISK** is for launch-day trading posts. Warm-up posts don't carry it unless the legal check (L-1) says otherwise (§11).
7. **Owner gates.** A post that makes a gated claim waits for its check (ledger §8). Until a check is ticked, post the fallback.

   | Check | What it covers | Posts in this file | If it fails |
   |---|---|---|---|
   | **C-0** (per chain, plus custody; ledger §8) | The warm-up gate: each chain named and self-custody are **in the launch build**. Teasers only, never "live" | PIN-v2, D1-P3, D3-P2 6/, D4-P4 (and the bio and header, `PROFILE.md` §0) | Four-chain versions in §10, or drop the failing chain and re-measure |
   | **K-2** | How server-side exits, limits, copy trades and sniper tasks sign under self-custody | D5-P2 and its replies; the custody answers in §1.1 | D5-P2 → R6 |
   | **F-1** | Each feature named runs in the live build on real chain data | Every product post | Drop the post |
   | **F-2** | A real KOL source plus a labelling policy | D7-P3 | D7-P3 → R5 (whale) |
   | **F-3** | Quick buy goes through the risk prompt | Nothing this week: PIN-v2 and D7-P1 both say "on the trade panel" | — |
   | **F-7** | The UI's chain marks are recoloured to neutral (they use the chains' brand colours as built) | Any capture with a chain chip: D4-P4 most of all | Crop the chips; show the chain name as text (D4-P4 notes) |
   | **S-1** | The stat is re-verified the day before | D3-P1, D7-P2, R7 | D3-P1 → R3, D7-P2 → R4 |

   **C-1** (real execution per chain) and **K-1** (self-custody is true) are launch-day gates for "live" copy (`LAUNCH_DAY.md` §1.1). Nothing this week needs them, because nothing this week says "live".

8. **Truth checks.** Puzzle and peek images come with rules in each post's notes. If a capture doesn't meet its rule, the copy isn't true: re-capture, or swap in a reserve.
9. **Words the copy never uses:** "safe", "audited", "protects", "detects", "predicts", "profit", "earn", "returns", "fastest", "AI-powered", "first" or "only" about us ("the first multi-chain terminal"), and any competitor, launchpad or chain-brand name (MNC-03, 06, 07, 08, 09, 10, 14, 17). "take-profit" is the name of an order, and "first funder" or "first 10 minutes" describe a rule, so those are fine.
10. **No token talk.** No token, airdrop, points or rewards in any post or reply (MNC-02, check T-1).
11. **Don't delete flops.** Let them age out of For You (48 h), then re-cut the idea in new words.

**Every morning (5 minutes):** open Under the Hood (`x.com/i/jf/under_the_hood`), check yesterday's analytics, run the impersonation search, and hide or report scam replies under the pinned post. Full routine: `PROFILE.md` §12.

### 1.1 Replies

**Value replies** (the growth engine this week):
- Under posts from **5k–200k-follower accounts, within 30–60 minutes** of their posting. Add a mechanism or a tell (which wallet, which block, which funder), a hedged number, or a real joke. No "this", "gm" or "huge".
- **Never paste the same reply twice.** Duplicate text gets clustered as `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4). Rewrite every skeleton from `REPLY_BANK.md` in fresh words.
- **Product mentions:** at most about 1 in 5 replies, and only when the thread asks a question the product answers. Day caps are in each day's notes. Never re-upload one of our clips as a reply (duplicate media). Describe it, and say it's on the profile.
- **Big threads** (author over 250k followers) have their replies scored by an LLM. Be specific or stay out.
- **Mutuals:** a reply between mutuals weighs 20 instead of 5 (CT_PLAYBOOK §3.2), so keep replying to the people who reply to you.
- **Never** tag KOLs, projects or chains to get noticed. Never drop "soon" or the launch under other people's posts.

**Standard answers.** Same meaning, fresh words every time:

| They ask | Answer with | Rule |
|---|---|---|
| "is it live?" / "where's the link?" | Not yet. Links only ever come from this profile | No date, no "soon" (PROFILE §9.4) |
| "is this real money?" / "is that real data?" | Nothing trades yet. The clips are the real UI running on demo data, and every frame says so in the corner | MNC-19 |
| "wen token?" / "airdrop?" / "points?" | **Don't answer** until the owner decides what we say. Don't hide these either: they aren't scams | MNC-02, T-1 |
| "is this AI?" | The field-guide clips are AI-generated. The terminal has no AI in it | MNC-07, MNC-23 |
| "where's robinhood chain in the switcher?" (D4-P4) | That clip is the demo build, which has four. Robinhood chain is in the bio because it's in the launch build | Only while C-0 for Robinhood Chain holds. No "soon", no date, no "shipping" (MNC-13). REPLY_BANK R47 |
| "if I keep my keys, how do exits / limits fire?" | Until the owner answers K-2: `fair question. we'll spell out exactly how orders sign before trading opens.` (76), reworded each time | Never improvise a custody mechanism |
| "will the dev-sell exit save me?" | It reacts after the dev's sell, so it can't beat them. It gets you out right after, instead of whenever you notice | SC-41, MNC-17 |
| "is it safe?" / "can it spot rugs?" | The audit is a reference, not a guarantee. It shows you what's there; it doesn't promise anything | MNC-06, MNC-17 |
| "is this [other terminal]?" / "better than X?" | No names. Talk about what the scope shows | MNC-10 |
| "what does it say about [real coin]?" | We don't run calls on real coins in public | MNC-16, MNC-18 |
| "this is just a larp" | Agree with the hook: everyone's larping, the wallets aren't | The old "it's literally a larp, that's the product" line is retired |
| Scam replies: "claim", "connect wallet", fake support | Hide, report, block. Then post CUSTODY in fresh words under the pin. Never answer with a link | CUSTODY |

### 1.2 Posting tools (Metricool vs native)

- **Status:** the Metricool brand (blogId `7078702`) has no X account connected yet. Connect it per `PROFILE.md` §11.1, with the brand timezone set to `America/New_York` so these ET times map directly.
- **Schedule in Metricool, for owner review:** plain-text and single-image originals: D3-P1, D4-P2, D5-P3, D6-P2, D6-P3, D7-P1, D7-P2, D7-P3. Once X is connected, Claude can draft them into Metricool as posts for review.
- **Post natively in X:** D1-P1 (the account's first post, by hand), D5-P2 (its K-2 gate is decided on the day), the pinned post and its reply, polls (D1-P2, D4-P3), the thread (D3-P2), every video and every AI post (D1-P3, D2-P1, D2-P3, D3-P3, D3-P4, D4-P1, D4-P4, D5-P1, D7-P4), the puzzles and their reveals (D2-P2, D6-P1), stat sources, and any image post if Metricool's X composer has no alt-text field. Native gives you the poll UI, thread control, full upload quality, alt text and X's "Made with AI" label, none of which can be added after posting.
- **Only schedule into windows when someone will be online** for the first 60 minutes.
- **Queue check before approving anything:** search the post for "live", "now", "launch", a URL, any date, and "soon" (only D7-P4 may have it).
- **Never** use Metricool's evergreen recycling, RSS, auto-reply, auto-DM, auto-like or auto-follow (X automation rules, CT_PLAYBOOK §3.9).

---

## Day 1 · "show up"

**Theme.** Arrive like a person, not a launch: a native opener, then the pinned "what is this", then a poll and the first field-guide frame. The profile (handle, name, bio, avatar, header, settings) is complete **before** the first post (`PROFILE.md` §2, phases A–E).

**All Day-1 copy is verbatim from `x/TODAY.md`** (approved; its pin is now PIN-v2). Don't edit it here. If TODAY.md or `PROFILE.md` §9 changes, they win.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D1-P1 | 9:30 a.m. · A | Text opener | none |
| PIN-v2 + PIN-r1 | 12:30 p.m. · B | Pinned post, text only, plus the CUSTODY self-reply. Pin it | none |
| D1-P2 | 3:30 p.m. | Poll, 24 h | none |
| D1-P3 | 8:30 p.m. · C | Field guide ep.01: AI still | `d1-field-guide` (READY) |

> **Order and fallbacks.** `PROFILE.md` §2 phase F lets the pin go first or at least 3 hours from another original. This plan opens with D1-P1, the most native post, and puts the pin in window B. 3:30 p.m. is just past window B but inside the day's peak launch hours (CT_PLAYBOOK §5.1).
> - **Setup runs late** (profile not done by 9:30 a.m.): post PIN-v2 + PIN-r1, D1-P1 and D1-P2 in that order as windows allow, 3 hours apart. D1-P3 then moves to Day 2 at 4:00 p.m., with the D2-P2 reveal at 3:00 p.m. instead of 3:30.
> - **Some Day-1 posts are already up:** leave them. Slot the rest at the same spacing.

### D1-P1 · 9:30 a.m. ET · opener · text only · **234 / 280**

```text
everything in the trenches wants your bag.

the sniper was in before you blinked.
the bundler is six wallets in a trench coat.
the insider was early. suspiciously early.
the dev wrote the exit before the coin.

we're building a scope.
```

- A cast list, no product claim. It sets up the week: the sniper, bundler, insider and dev each get their own field-guide entry on Days 2–5.

### PIN-v2 · 12:30 p.m. ET · pinned post · text only · **276 / 280**

```text
trenchscope: see who's really buying, before you do.

one memecoin terminal for solana, base, bsc, ethereum and robinhood chain. snipers, bundlers, insiders, the dev, smart money: tagged. every token gets an audit. risky buys on the trade panel ask first.

you keep your keys.
```

**PIN-r1** (self-reply, posted right after) · **118 / 280**

```text
we will never DM you first, ask for your seed phrase, or ask you to send funds anywhere. if someone does, it isn't us.
```

- Post PIN-v2, then PIN-r1 as a reply, then pin PIN-v2 (••• → Pin to your profile). PIN-r1 is CUSTODY plus "anywhere. if someone does, it isn't us." Self-custody brands get impersonated within days.
- **Gate:** C-0 (each chain named and self-custody are in the launch build). `PROFILE.md` §0 has the owner's tick-boxes.
- **Why PIN-v2, not the original PIN (268):** PIN's "every wallet gets a tag" is false (most wallets match no rule, SC-19), its "risky buys ask first" is false while quick buy skips the prompt (SC-08c, F-3), and its "kol" has no real source yet (F-2). PIN-v2 fixes all three (`PROFILE.md` §9.2, which also covers "PIN is already up").
- `PROFILE.md` §9.4 adds **FAQ-2** ("what is this", 243) as a reply to PIN-r1.

### D1-P2 · 3:30 p.m. ET · poll (24 h) · question **49 / 280**

```text
before you ape, what do you actually check first?
```

| Option | Chars (max 25) |
|---|---|
| `the dev wallet` | 14 |
| `top 10 holders` | 14 |
| `bundles at launch` | 17 |
| `the chart (be honest)` | 21 |

- Reply to voters with the tell for their pick, in fresh words. Note the result: the D4-P3 poll asks the follow-up.

### D1-P3 · 8:30 p.m. ET · field guide ep.01 · image `d1-field-guide` · **157 / 280**

```text
field guide to the trenches, ep.01.

every coin has a cast. we're building the scope that names them, across solana, base, bsc, ethereum and robinhood chain.
```

> Alt: AI-generated still: a whale drifts over a misty trench at dusk while an amber targeting reticle locks onto its eye and a small chip beside it reads "Whale". Caption: everything out here wants your bag. Letterbox bars, label: field guide to the trenches, ep.01.

- Turn on X's "Made with AI" label. Post natively. The image carries the older `AI-GENERATED · DRAMATIZED` corner label; it's approved as is (optionally re-render it with the exact `AI-generated` label on the corner plate first, 0 credits: `TODAY.md`). New AI assets use `AI-generated` (§9.1). Gate: C-0 for each chain named.
- **Optional owner swap** (`TODAY.md`, 145, no chain gate): `field guide to the trenches, ep.01.` / `the whale. moves slowly. moves everything.` / `every coin has a cast. we're building the scope that names them.` It names the animal in the picture, and D4-P4 carries the chain list anyway.

### Day 1 engagement

- **Value replies: 10–15**, under **rug post-mortems, scam and drainer warnings, and newcomer explainers** (`PROFILE.md` §10.1 categories 1, 5, 7). Angle: add the mechanism. No product mention today.
- **Follows: 20** in 3 sessions of 6–7, at least 1 h apart, vetted per `PROFILE.md` §10.2.
- **KPI: D1-P1's like-per-view in its first 2 hours** (likes ÷ impressions). The ranker's prior is ~1.5%. Note it as the week's baseline.

---

## Day 2 · "meet the cast"

**Theme.** The first species, the first puzzle, and the first look at the board. Teach people to read a coin the way the scope does.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D2-P1 | 9:30 a.m. · A | Field guide #1 + dictionary: sniper (AI clip, ~11 s) | `fg-sniper` |
| D2-P2 | 12:30 p.m. · B | Spot the rug #1 (puzzle) | `sr1-a` |
| D2-P2r | ~3:30 p.m. | Reveal, as a self-reply | `sr1-b` |
| D2-P3 | 8:30 p.m. · C | Product peek: the board (clip, ~12 s) | `peek-board` |

### D2-P1 · 9:30 a.m. ET · field guide #1: the sniper · video `fg-sniper` · **255 / 280**

```text
field guide to the trenches: the sniper.

native to every launch. buys within 3 blocks of it, usually before you've finished reading the name.

the audit counts them on every coin. under 5: green. over 20: red, and the launch was a race you were never in.
```

> Alt: AI-generated clip: a hooded figure lies on a trench parapet at night, eye to a brass spotting telescope on a tripod, an amber glint on the lens. An amber reticle locks on, a species card reads THE SNIPER (emptor primus) with a "Sniper" wallet-tag chip from the Trenchscope UI, and the caption reads: in before you blinked. Then a dark card: sniper. bought within 3 blocks of launch. On a coin's audit: under 5 snipers green, 5 to 20 amber, over 20 red. Footer: high risk · nfa.

- **Claims:** SC-21, sniper rule (GREEN): bought in the 1st–3rd block after the creation block, excluding the creator, the dev team and creation-block buyers (`server/analytics/tokens/track.ts:9-10,21,210`, `SNIPER_BLOCKS = 3`). Audit thresholds under 5 / 5–20 / over 20 (`server/analytics/tokens/security.ts:470-597`).
- "within 3 blocks of it" = within 3 blocks of launch (the rule). Never convert blocks to seconds: block times differ by chain (ledger 2.2). The UI tooltip's "first blocks" is looser than the rule; the copy follows the rule.
- Native upload, "Made with AI" on. Template in §9.1.

### D2-P2 · 12:30 p.m. ET · spot the rug #1 · image `sr1-a` · **198 / 280**

```text
spot the rug #1

two coins from our demo data. one got bundled at launch. we covered the insider, sniper and bundler chips.

everything else on the card is fair game. A or B?

answer in a few hours.
```

> Alt: Two Trenchscope holder panels side by side, labelled A and B, names and tickers hidden. UI shown with demo data. Headline: spot the rug #1. Subtitle: one was bundled at launch. A or B? A has many holders, and its top 10, dev and fresh-wallet chips are green. B has a handful of holders, its top 10 and fresh-wallet chips are red, and its dev chip shows the dev still holding. On both, the insider, sniper and bundler chips are covered by amber question-mark blocks.

### D2-P2r · ~3:30 p.m. ET · reveal (self-reply to D2-P2) · image `sr1-b` · **216 / 280**

```text
it's B.

the covered chips were hiding plenty, but you didn't need them: a handful of holders, the top 10 in the red, fresh wallets everywhere, and the dev still sitting on a bag.

A was boring. boring is underrated.
```

> Alt: The same two demo-data holder panels with the covered chips revealed. UI shown with demo data. Headline: it's B. B is outlined in amber and captioned bundled at launch: its bundler and insider chips are red. A's insider, sniper and bundler chips are green. Subtitle: the chips said it first.

- **Claims:** SC-48 holders by tag, SC-07b / SC-31 chips that go red past the threshold (`web/components/token/HolderStrip.tsx:55-62`; defaults in `server/accounts/settings.ts:75`). "bundled at launch" = SC-21 bundler rule.
- **Asset rule (the copy is only true if this holds):** two demo tokens. **B:** bundler and insider chips red; top 10 and fresh chips red too; the dev chip shows the dev still holding (not "sold all"); a handful of holders. **A:** top 10, dev, fresh, insider, sniper and bundler chips green; many holders. The chips use the default thresholds (top 10 30%, dev 30%, insiders 5%, bundlers 10%, snipers 10%; fresh fixed at 30%), so capture with default settings. If the capture doesn't match, re-capture, don't edit the reveal. The copy quotes no numbers on purpose, so a re-capture doesn't break it.
- "two coins from our demo data" stays in the copy: the numbers in the image aren't market data (MNC-19).
- Reply to every guess, right or wrong, in fresh words.

### D2-P3 · 8:30 p.m. ET · product peek: the board · video `peek-board` · **226 / 280**

```text
the board.

new launches, near graduation, migrated. one screen, in real time.

every card gets a curve-progress ring and risk chips that go red past your limits. hover a column and it holds still, so you can actually read it.
```

> Alt: Screen recording of Trenchscope's board, UI shown with demo data: three columns, New, Near graduation and Migrated, with token cards sliding in. Each card's avatar has a curve-progress ring filling up and a row of risk chips, some turning red. The cursor rests on a column and it pauses, showing "Paused" with a count of new tokens waiting. Captions: new · near graduation · migrated; a curve ring and risk chips on every card; hover to pause. Token names are blurred.

- **Claims:** SC-07 (`web/pages/TrenchesPage.tsx`; pause on hover at `web/components/discovery/TrenchesColumn.tsx:251`), SC-07b (`web/components/common/TokenAvatar.tsx`, `web/components/discovery/TokenBadges.tsx`), SC-31. Say "near graduation" or "near grad", never "almost bonded" (MNC-11).
- **Crop or blur the green "Live" status pills** (board header and status bar) in every frame (ledger §7.7).

### Day 2 engagement

- **Value replies: 15–20.** Targets: **mid-size trench traders posting entries, exits and losses, and meme accounts** (categories 2, 3). Angle: gallows humour plus one specific tell (launch-block buyers, fresh-wallet share, the dev's bag). At most 1 product mention, and only if asked.
- **Follows: 20** (running total 40). Categories 2, 3, 4, spread across chains.
- **KPI: A/B guesses on spot the rug #1 before the reveal.** Target 10 or more.

---

## Day 3 · "the trench in numbers"

**Theme.** The useful day: one sourced stat, the week's micro-thread, the second species and the keyboard clip.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D3-P1 | 9:00 a.m. · A | Real-market stat (KS-01) + source reply | `stat-97` |
| D3-P2 | 12:15 p.m. · B | Micro-thread, 6 posts | `thread-lifecycle` on 1/ |
| D3-P3 | 3:00 p.m. · late B / peak launch hours (CT_PLAYBOOK §5.1) | Field guide #2 + dictionary: bundler (AI clip, ~11 s) | `fg-bundler` |
| D3-P4 | 8:30 p.m. · C | Product peek: keyboard flow (clip, ~15 s) | `peek-keys` |

### D3-P1 · 9:00 a.m. ET · stat: ~97 of 100 never leave the curve · image `stat-97` · **204 / 280**

```text
lately, ~97 out of 100 launches on the biggest solana launchpad never make it off the curve.

most of them aren't rugs. they just go quiet.

the trenches are mostly a graveyard with a very loud gift shop.
```

**Source** (self-reply, posted right after) · **175 / 280**

```text
source: launchpad lifecycle data (secondary). approximate, and it moves month to month.

the graduation rate swings a lot. and not graduating isn't the same as getting rugged.
```

> Alt: A 10 by 10 grid of dots on a dark background: 97 dim grey dots and 3 amber ones. Headline: ~97 of 100 launches never leave the curve. Subtext: lately, on the biggest solana launchpad. most just go quiet. Footer: source: launchpad lifecycle data (secondary) · approximate · high risk · nfa.

- **KS-01 (AMBER).** From the research doc's lifecycle statistics, a secondary source with no per-stat link (ledger §4.1). **S-1: the owner re-checks it the day before** against a public dashboard or primary post. **If it can't be verified by 8:30 a.m., post R3 instead** and bench `stat-97`.
- Never "97% are rugs" or "97% are scams" (MNC-20). Don't name the launchpad in the post or the replies. The source reply keeps the STAT line word for word, then adds the "not graduating isn't rugging" hedge.

### D3-P2 · 12:15 p.m. ET · micro-thread: the lifecycle

Post natively as a thread. 1/ stands on its own and carries `thread-lifecycle`.

**1/** · image `thread-lifecycle` · **98 / 280**

```text
the memecoin lifecycle in four words: launch, curve, migrate, pray.

what each one actually means:
```

> Alt: A dark card showing a coin's lifecycle as a progress bar through three stages: new, near grad, migrated. The bar fills amber and turns green at 100%. A grey branch reads "most: go quiet" and a red branch reads "some: rug". Headline: launch, curve, migrate, pray. Footer: high risk · nfa.

**2/** · **183 / 280**

```text
launch: on a launchpad, anyone can mint a coin in seconds. no pool yet, just a bonding curve.

the curve is a vending machine: every buy pushes the price up, every sell pulls it down.
```

**3/** · **150 / 280**

```text
curve: buyers fill it up. "near grad" means it's almost full.

most coins never get close. that's not a rug. they just run out of buyers and go quiet.
```

**4/** · **166 / 280**

```text
migrate: when the curve fills, the coin graduates (people also say "bonds").

its liquidity moves off the curve into a real pool on a dex. that move is the migration.
```

**5/** · **224 / 280**

```text
pray: everything after.

a rug is insiders pulling the liquidity or dumping their bags on whoever's still holding.

a slow rug is the same thing in installments. the chart looks like a "healthy dip" until it very much isn't.
```

**6/** · **205 / 280**

```text
we're building a scope for all four.

new launches, near grad and migrated on one board, with the snipers, bundlers, insiders and the dev tagged on each coin.

solana, base, bsc, ethereum, robinhood chain.
```

- Market education in 2/–5/, no stats (the morning post carries the number). Each post opens with one of the four words, so "pray" pays off in 5/.
- **Claims in 6/:** SC-07 (the board's three columns), SC-21 / SC-21d (per-coin sniper, bundler, insider and dev tags, `server/analytics/tokens/track.ts`), chains SC-43 / SC-45 (OWNER, C-0). "tagged on each coin" is accurate: every coin gets its cohorts computed. Don't upgrade it to "every wallet gets a tag".

### D3-P3 · 3:00 p.m. ET · field guide #2: the bundler · video `fg-bundler` · **227 / 280**

```text
field guide to the trenches: the bundler.

travels in packs. bought in the same block the coin was created. six wallets, one trench coat.

on the audit, bundlers show as a share of the coin's volume. past 30%, the row goes red.
```

> Alt: AI-generated clip: six identical hooded figures stand in a row at the end of a trench at night, backlit by a flare, cloaks moving in unison. An amber reticle locks on, a species card reads THE BUNDLER (fasciculus unanimus) with a "Bundler" wallet-tag chip from the Trenchscope UI, and the caption reads: six wallets, one trench coat. Then a dark card: bundler. bought in the same block the coin was created. On the audit, the share of volume from bundlers: up to 10% green, up to 30% amber, over 30% red. Footer: high risk · nfa.

- **Claims:** SC-21 bundler rule (GREEN): bought in the same block the token was created, other than the creator (`server/analytics/tokens/track.ts:8,209`). Audit row = share of traded volume, thresholds ≤ 10 / ≤ 30 / > 30% (`server/analytics/tokens/index.ts:476,496`; `server/analytics/tokens/security.ts`).
- Don't write "funded by the dev": that's the **insider** rule (D4-P1). The UI tooltip's "likely linked to the dev" is looser than the code, so it stays out of the copy (ledger 2.2).

### D3-P4 · 8:30 p.m. ET · product peek: keyboard flow · video `peek-keys` · **189 / 280**

```text
no mouse.

2 jumps to near grad. j/k picks a coin. b quick-buys. enter opens it. s flips to sell. / searches coins and wallets.

turns out your mouse hand was the slowest bot in the trench.
```

> Alt: Screen recording, UI shown with demo data: Trenchscope's board driven by the keyboard only. Key presses appear bottom-left: 2 jumps to the Near graduation column, J moves down the cards, B quick-buys and a fill toast appears, Enter opens the token page, S switches the trade panel to sell, and / opens search. No mouse cursor. Token names are blurred.

- **Claims:** SC-30 (GREEN): board hotkeys `web/pages/TrenchesPage.tsx:39-46`; B/S on the token page `web/components/token/trade/TradePanel.tsx:85-91`; `/` focuses search `web/components/layout/TopBar.tsx:26`, `web/components/layout/Omnibox.tsx:142`. Say "hotkeys". Never "command palette": it isn't built (SC-44, MNC-12).
- The joke is about the viewer's hand, not a speed claim. Never add "fastest" or a latency number (MNC-08).
- Frame-check the fill toast for sim wording (ledger §7.1). The quick-buy toast carries no latency figure; if a trade-panel toast ("· NNNms") or the status bar's ping gets in frame, blur or crop it (ledger §2.6, MNC-08). If the `/` search results show chain marks, F-7 applies.

### Day 3 engagement

- **Value replies: 20–25.** Targets: **newcomer questions (curves, graduation, slippage, MEV) and launchpad-stats posts** (categories 4, 7). Angle: plain-language definitions, and numbers only with "~" and a time window. Never advise. **At most 1 product mention, and only on a question it answers.**
- **Follows: 10** (running total 50; the first-50 plan is done). Categories 6 and 8, plus chain gaps.
- **KPI: new follows from the thread** (post 1's "New followers" and "Profile visits"). Target: more than 1 in 5 profile visits turning into a follow.

---

## Day 4 · "follow the money"

**Theme.** Funding links: the insider, who funded whom, a poll on what hurts, then the build log that names all five chains.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D4-P1 | 9:30 a.m. · A | Field guide #3 + dictionary: insider (AI clip, ~11 s) | `fg-insider` |
| D4-P2 | 12:15 p.m. · B | Product peek: funding links and holders by tag | `peek-funding` |
| D4-P3 | 3:00 p.m. · late B / peak launch hours (CT_PLAYBOOK §5.1) | Poll (24 h) | none |
| D4-P4 | 8:30 p.m. · C | Building in public: five chains, one terminal (switcher clip, ~12 s) | `peek-chains` |

### D4-P1 · 9:30 a.m. ET · field guide #3: the insider · video `fg-insider` · **250 / 280**

```text
field guide to the trenches: the insider.

was in the room before the door opened. tagged if the dev funded it, if the dev's own funder did, or if one private wallet funded 3+ wallets that all bought in the first 10 minutes.

not a believer. payroll.
```

> Alt: AI-generated clip: the camera pushes through a half-open steel bunker door into a war room, where one hooded figure sits relaxed at a glowing amber round table. An amber reticle locks on, a species card reads THE INSIDER (amicus devi) with an "Insider" wallet-tag chip from the Trenchscope UI, and the caption reads: early. suspiciously early. Then a dark card: insider. tagged if: funded by the dev; funded by the dev's own funder; or one private funder, 3+ wallets, all buying in the first 10 minutes. Footer: high risk · nfa.

- **Claims:** SC-21, `classifyInsider` (GREEN), `server/analytics/tokens/track.ts:234-256`: the wallet's **first funder** is (1) the creator or a dev-team wallet, or (2) the creator's own funder, unless that funder is a labelled public entity such as an exchange hot wallet; or (3) one private funder funded 3+ wallets whose first buys all landed within 10 minutes of launch (`EARLY_WINDOW_MS = 10 * 60_000`). "private wallet" in the copy covers the public-entity exclusion.
- It's a tagging rule, not a detector. Never "detects every insider" (MNC-06).

### D4-P2 · 12:15 p.m. ET · product peek: who funded whom · image `peek-funding` · **262 / 280**

```text
who funded whom.

every holder row shows the wallet that first sent it gas money. the dev panel shows who funded the dev.

and the holder strip splits the supply by tag: what the snipers, bundlers, insiders and the dev still hold.

follow the money one hop back.
```

> Alt: Trenchscope token page, UI shown with demo data, ticker blurred. Top: the holder strip, with chips for top 10, dev, insiders, snipers, bundlers and fresh wallets, and a list of how much of the supply each wallet tag holds, outlined in amber and captioned supply by tag. Below: the Holders tab, with a "Funded by" column showing the wallet that first funded each holder, outlined in amber and captioned who funded whom.

- **Claims:** SC-49 funding links (GREEN): "Funded by" on holder rows `web/components/token/tabs/HoldersTab.tsx:136-139`, the dev panel `web/components/token/DevPanel.tsx:51-52`. It's **one hop** (the first funder), not a funding graph, hence "one hop back". SC-48 holders by tag `web/components/token/HolderStrip.tsx`.
- "gas money" = the native coin that first funded the wallet.

### D4-P3 · 3:00 p.m. ET · poll (24 h) · question **45 / 280**

```text
what kills your trades most often? be honest.
```

| Option | Chars (max 25) |
|---|---|
| `the dev, obviously` | 18 |
| `bundled launches` | 16 |
| `slippage and fees` | 17 |
| `my own fomo` | 11 |

- Three days after the Day-1 poll, inside the one-poll-per-2–3-days rule. Reply to voters with a one-line mechanism for their pick, written fresh. The result can feed a launch-week post; it isn't a product plug.

### D4-P4 · 8:30 p.m. ET · building in public: five chains, one terminal · video `peek-chains` · **206 / 280**

```text
build log: five chains, one terminal.

solana, base, bnb chain, ethereum and robinhood chain. pick the chain up top. the board, the tags, the audit and your hotkeys come with you.

one scope. five trenches.
```

> Alt: Screen recording, UI shown with demo data: Trenchscope's board switches chain, from SOL to Base to BSC to ETH, with the chain's name changing in the top bar, and the same layout, wallet tags and audit chips load on each. Captions: pick the chain. same board. same tags. same hotkeys. This demo build's switcher has four chains.

- **Claims:** SC-42 (GREEN for the UI): one terminal, one chain at a time (`packages/shared/src/chains.ts:5-7`, `web/components/layout/ChainSwitcher.tsx`). The five chains in the copy are SC-43 / SC-45 (**OWNER, C-0 per chain**).
- **The clip shows four chains**, because the UI has four. Robinhood Chain appears in copy only: never mock up a fifth entry or put its name in a UI frame (POSITIONING "Footage"; ledger §7.6). The alt text says four, and §1.1 has the answer for "where's robinhood chain?".
- Drive the switch by route (`/sol/trenches` → `/base/trenches` → `/bsc/trenches` → `/eth/trenches`) so the open dropdown isn't the subject.
- **Chain marks (F-7): not safe as built.** The UI's round chain marks are filled with the chains' brand colours (Solana purple, BNB yellow, Base blue, Ethereum `#627EEA`) and eth's is `Ξ` (`web/components/common/ChainIcon.tsx:6,17-26`; `packages/shared/src/chains.ts:48,63,78,93`), which POSITIONING forbids. Before capture, the owner or dev recolours `ChainIcon` to neutral (`panel-3` fill, `fg` letter, a plain `E`) or capture mode overrides it (ledger §7.11). If neither lands, re-cut: crop every chain chip (top bar, status bar, search, token header) and show only the chain name as text; the alt text above already describes it that way.
- **If any chain fails C-0:** use the four-chain version (§10) or drop that chain, and re-measure.

### Day 4 engagement

- **Value replies: 20–30.** Targets: **on-chain sleuths' funding breakdowns, security and scam researchers** (categories 1, 5). Angle: the funding tell ("same funder, three wallets, first ten minutes"). At most 2 product mentions all day, each only on a question it answers.
- **Follows: 20** (running total 70). From now on, lean toward people you met in replies: real mutuals beat cold follows.
- **KPI: replies and quotes on D4-P4.** It's the first post that names all five chains. Count the questions too (they show what people expect).

---

## Day 5 · "the dev" (weekend, lighter)

**Theme.** The dev gets a full episode: the field-guide clip with the rug, then the order that reacts to it, then the one tag people want most.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D5-P1 | 10:30 a.m. · A | Field guide #4 + dictionary: dev, then the rug (AI clips, ~15 s) | `fg-dev` |
| D5-P2 | 2:00 p.m. · B | Product peek: auto exits with the dev-sell exit | `peek-exits` |
| D5-P3 | 8:30 p.m. · C | Trench dictionary: smart money (card) | `dict-smart` |

### D5-P1 · 10:30 a.m. ET · field guide #4: the dev · video `fg-dev` · **247 / 280**

```text
field guide to the trenches: the dev.

the wallet that made the coin. sets the table, invites everyone to dinner, keeps one hand on the rug.

hover the dev: coins launched, coins migrated. some devs have plenty of the first and none of the second.
```

> Alt: AI-generated clip: a long underground banquet hall, its table set with stacks of blank metal plates on a red carpet runner. At the far end a hooded figure grips the end of the carpet. A species card reads THE DEV (creator fugiens) with a "Dev" wallet-tag chip from the Trenchscope UI, and the caption reads: sets the table. Cut to the same hall as the carpet is yanked away and the plates fly into the air in slow motion. Caption: then pulls the rug. Then a dark card: dev. the wallet that made the coin. dev status: holding, sold part, sold all, bought more. hover for coins launched and coins migrated. Footer: high risk · nfa.

- **Claims:** SC-21d dev = the token's creator (`server/analytics/tokens/track.ts:99-101`; "dev team" wallets are simulator-assigned, so the copy says "the wallet that made the coin" only). SC-26 dev record on hover and dev status (`web/components/discovery/TokenHoverSummary.tsx`, `web/components/token/DevPanel.tsx`, `server/analytics/tokens/security.ts:210-227`). No invented counts.
- The rug is a cartoon of a rug pull, played straight. No coins, symbols or logos on the plates.

### D5-P2 · 2:00 p.m. ET · product peek: auto exits · image `peek-exits` · **251 / 280**

```text
the dev wrote an exit. now so can you.

attach take-profit, stop-loss, trailing and a dev-sell exit to the buy itself.

dev-sell exit: when the dev sells 20%+ of their bag in one trade, your sell fires right after. after, not before. nobody's psychic.
```

> Alt: Trenchscope's trade panel on the Auto tab, buy side, UI shown with demo data, ticker blurred. Under "Buy with exit strategy", exits are attached to the buy: take-profit levels, a stop-loss, a trailing stop, and a dev-sell exit set to sell 100% when the dev sells, outlined in amber and captioned dev-sell exit. A toast confirms the buy with [n] exit orders placed.

- **Claims:** SC-14 Auto exits (GREEN; `server/trading/orders.ts`, `web/components/token/trade/AutoForm.tsx:112`). SC-41 dev-sell exit (GREEN): on the **buy** side the StrategyEditor's "Sell when dev sells" sets the share (`web/components/trade/StrategyEditor.tsx:145`) and the threshold is fixed at the **20% default** (`createStrategy` uses `DEFAULT_DEV_SELL_THRESHOLD = 0.2`, `server/trading/orders.ts:29,183-184,270`), which is exactly the copy's "20%+ of their bag in one trade". The buy toasts "Bought … · N exit orders" (`web/components/token/trade/useTradeExecutor.tsx:39-43`). It **reacts after** the dev's sell.
- **The image shows the buy side only.** The "≥ 20% of dev bag" selector (10/20/50/80%, `AutoForm.tsx:43-48`) and the "Dev-sell exit armed" toast (`AutoForm.tsx:161`) exist only on the **Sell** side ("Sell on dev sell"), which needs a position you already hold, so they aren't in this frame and the alt text doesn't mention them. A two-panel version (buy side + sell side with its selector and toast) is fine if the alt text says so. Fill `[n]` from the real toast (take-profits + stop-loss + trailing + dev-sell), and blur the toast's `· NNNms` latency and its ticker (ledger §2.6).
- Never "exit before the dev", "beat the dev" or "front-run the dev" (MNC-17). "after, not before" is in the copy on purpose.
- **Gate K-2:** exits run server-side in the code. With "you keep your keys" on the profile, the first reply will be "how?". Have the owner's answer before this posts, or use the holding line in §1.1. If the owner prefers to wait, swap in R6.

### D5-P3 · 8:30 p.m. ET · trench dictionary: smart money · image `dict-smart` · **273 / 280**

```text
trench dictionary: smart money

not a vibe, not a list we picked. a 7-day hit rate: 3+ entries, 60%+ of them later ran 2x, tested against the chain's base rate so a couple of lucky buys don't count.

bots and snipers never qualify. neither does your friend who "called it".
```

> Alt: A dark card with a green "Smart" wallet-tag chip. Headline: smart money. Text: a 7-day hit rate. 3+ entries, 60%+ of them later ran 2x, tested against the chain's base rate, plus a 55%+ win rate and a 7-day pnl floor per chain. Bots, MEV bots and snipers never qualify. Footer: a description, not a tip · high risk · nfa.

- **Claims:** SC-20 (GREEN), `SMART_RULE` in `server/analytics/wallets/index.ts:62-107,423-441`: rolling 7 days, 3+ entries (first buys), 60%+ later ran 2x in market cap, one-sided z-score ≥ 1.5 against the chain's base hit rate, win rate 55%+, PnL floor per chain; bots, MEV bots and snipers excluded.
- No accuracy numbers (the code comments' precision and recall are simulator-only, MNC-06). Don't repeat the tooltip's "statistically proven… profitable". Never imply that following smart money makes money (MNC-04). The "a description, not a tip" hedge stays on the card footer, so the post can end on the joke.

### Day 5 engagement

- **Value replies: 15–20.** Targets: **weekend degen posts, dev-dump and rug threads, meme accounts** (categories 2, 3). Angle: jokes and solidarity. No product mention unless asked (then at most 1).
- **Follows: 15** (running total 85).
- **KPI: 50% playback on `fg-dev`** (post analytics / Media Studio). It's the baseline for the launch trailer.

---

## Day 6 · "fake volume" (weekend, lighter)

**Theme.** Fake volume, fresh wallets and bots, then the audit that calls them out. If EU clocks change this weekend (they do this year), window A is London 12:30–15:00 and Berlin 13:30–16:00 from today.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D6-P1 | 9:30 a.m. · A | Spot the rug #2: fake volume | `sr2-a` |
| D6-P1r | 12:30 p.m. | Reveal, as a self-reply | `sr2-b` |
| D6-P2 | 2:00 p.m. · B | Trench dictionary: fresh and bot (card) | `dict-fresh-bot` |
| D6-P3 | 8:30 p.m. · C | Product peek: the audit | `peek-audit` |

### D6-P1 · 9:30 a.m. ET · spot the rug #2 · image `sr2-a` · **197 / 280**

> **As built: swap this slot.** `sr2-a`/`sr2-b` are BLOCKED (§9.2): the demo market has never flagged a wash-trading token, so the puzzle can't be built truthfully. Post the rug-forecast meme instead (`x/posts/meme-10.png`, its line and alt text from `REPLY_BANK.md` §5), and drop D6-P1r. Revisit `sr2` on live data after launch, with real tickers blurred.

```text
spot the rug #2: fake volume edition

two coins from our demo data. similar age, similar volume.

one of them is mostly the same few wallets trading with each other.

A or B? answer in a few hours.
```

> Alt: Two Trenchscope token stat strips side by side, labelled A and B, names blurred. UI shown with demo data. Both show similar volume and age. A shows far fewer unique traders than B. The wash-trading row of each audit is covered by an amber question mark. Headline: spot the rug #2. Subtitle: same volume. one is mostly the same few wallets. A or B?

### D6-P1r · 12:30 p.m. ET · reveal (self-reply to D6-P1) · image `sr2-b` · **251 / 280**

```text
it's A.

about the same volume as B, a fraction of the unique traders. the tell: a few wallets flipping back and forth inside a minute, over and over, to make a dead coin look busy.

the audit flags it as wash trading, and there's a filter to hide it.
```

> Alt: The same two demo-data tokens with the audit rows revealed. UI shown with demo data. A's row reads "Wash trading: Yes — Much of the volume is fast round-trips", inside an amber scope reticle. B's row reads "Wash trading: No". Headline: it's A. Subtitle: few makers, fast round-trips. flagged.

- **Claims:** SC-28 wash trading (GREEN): a round trip is an opposite-side trade by the same wallet within 60 s, volume counts as wash from a wallet's 2nd round trip, flagged at 20+ swaps and 30%+ wash volume in the last hour (`server/analytics/tokens/track.ts:23-27,214-232`; row text `server/analytics/tokens/security.ts:575-579`). SC-29 "Hide wash trading" filter (`web/components/discovery/filters.ts:118`). Hence "inside a minute, over and over".
- **Asset rule:** A is flagged "Wash trading: Yes", B isn't; their volumes are within about ±30% of each other; A has clearly fewer makers. Otherwise the copy isn't true.
- Keep the "Safe" filter preset out of frame (ledger §7.8).

### D6-P2 · 2:00 p.m. ET · trench dictionary: fresh and bot · image `dict-fresh-bot` · **274 / 280**

```text
trench dictionary: fresh and bot

fresh: first funded under 24 hours ago, in fewer than 15 coins. born this morning, already in your chart.

bot: 200+ trades a day (or 5x the chain's typical trader, if that's higher), median hold under 2 minutes. never sleeps. never learns.
```

> Alt: A dark card with two wallet-tag chips. Teal "Fresh": first funded under 24 hours ago, in fewer than 15 coins. "Bot": 200+ trades a day, or 5 times the chain's median trader if that's higher, with a median hold under 2 minutes. Footer: high risk · nfa.

- **Claims:** SC-19 (GREEN), `server/analytics/wallets/index.ts`: **fresh** `FRESH_MAX_AGE_MS` (24 h) and `FRESH_MAX_TOKENS` (15) at lines 118-119, 421; **bot** rate above max(`BOT_MIN_TRADES_PER_DAY` 200, `BOT_RATE_MULT` 5 × the chain's median active-trader rate) and median hold under `BOT_MAX_MEDIAN_HOLD_MS` (2 min) across 5+ recent round trips, lines 121-134, 406-411. "typical trader" in the copy = that median.
- One post, two tags: the task's "fresh/bot" entry. The audit has rows for both (fresh-wallet share, bot-degen share).

### D6-P3 · 8:30 p.m. ET · product peek: the audit · image `peek-audit` · **247 / 280**

```text
every token gets an audit: top 10, dev, insiders, snipers, bundlers, fresh wallets, bots, wash trading, lp, taxes. green, amber, red.

plus a rug ratio and a risk level. most of them are not low.

it's a reference, not a guarantee. read it anyway.
```

> Alt: Trenchscope's audit panel for one token, UI shown with demo data, ticker blurred. A checklist of rows rated green, amber or red: top 10 holders, dev holding, insiders, snipers, bundlers, fresh wallets, bot degens, wash trading, LP burned and taxes. At the top, a high risk level and a rug ratio, outlined in amber and captioned reference, not a guarantee. The panel's footnote reads "Audit — reference only."

- **Claims:** SC-09 audit checklist (`server/analytics/tokens/security.ts:470-597`, `web/components/token/SecurityPanel.tsx`) and SC-10 rug ratio and risk level (`security.ts:362-447`), both GREEN. The copy is the ledger's allowed wording, plus "reference, not a guarantee".
- Never "safe", "audited" or "predicts rugs" (MNC-06, MNC-17). Capture mode rewrites the panel's "Simulated audit — reference only." to "Audit — reference only." Frame-check it.

### Day 6 engagement

- **Value replies: 15–25.** Targets: **build-in-public devs, trading-tool builders, MEV and market-structure researchers** (categories 6, 8). Angle: technical and honest ("how is wash trading flagged?" questions are welcome: answer with the rule). **At most 1 product mention, and only on a question it answers.**
- **Follows: 15** (running total 100).
- **KPI: shares on D6-P3** ("Shares": DM and copy link). Copy-link shares carry the ranker's biggest positive weight (20), so this tests whether the audit travels.

---

## Day 7 · "soon"

**Theme.** Credibility, then curiosity: the risk prompt, a sourced stat, the last tag, then one word.

| Slot | ET | Format | Asset |
|---|---|---|---|
| D7-P1 | 9:00 a.m. · A | Product peek: the risk prompt | `peek-risk` |
| D7-P2 | 12:00 p.m. · B | Real-market stat (KS-02) + source reply | none (text) |
| D7-P3 | 3:00 p.m. · late B / peak launch hours (CT_PLAYBOOK §5.1) | Trench dictionary: kol (card), gated on F-2 | `dict-kol` (or R5 `dict-whale`) |
| D7-P4 | 8:30 p.m. · C | The "soon" teaser (AI clips, ~13.5 s). Skipped if the launch gate has passed (§11.1) | `teaser-soon` |

### D7-P1 · 9:00 a.m. ET · product peek: the risk prompt · image `peek-risk` · **233 / 280**

```text
buy a high-risk coin from the trade panel and it lists the reasons, then makes you tick a box before you can buy anyway.

it literally asks "you sure?" before you ape the rug.

you'll tick it. but now you'll know exactly why it hurt.
```

> Alt: Trenchscope's "High-risk token" dialog, UI shown with demo data, ticker blurred. It reads "Our audit flagged this token. Review the reasons before you buy." A red box headed "Why this is risky" lists the reasons: the high risk level with its rug ratio, and each red audit row. Below: an unticked checkbox, "I understand the risks and want to buy", and a disabled "Buy anyway" button, outlined in amber and captioned it asks first.

- **Claims:** SC-08 (GREEN for the trade panel): a buy from the token page's trade panel (Market or Auto) on a honeypot or a high-risk token (rug ratio above 30%) lists its reasons, and "Buy anyway" stays disabled until the box is ticked (`web/components/token/model.ts:119-129`, `web/components/token/trade/useTradeExecutor.tsx:71,99,109`). The copy says "from the trade panel" because quick buy skips the prompt (SC-08c, F-3).
- It asks; it doesn't block. Never "protection" (MNC-17). It's a per-trade dialog, not an onboarding step (MNC-12).
- Capture mode rewrites the dialog's sim subtitle to "Our audit flagged this token. Review the reasons before you buy." Check the live build's wording before quoting it anywhere else.

### D7-P2 · 12:00 p.m. ET · stat: ~73% of graduates down 60%+ in 20 minutes · **230 / 280**

```text
made it off the curve? congrats.

in one dataset from a major launchpad, ~73% of graduates were down 60%+ from their migration price within 20 minutes.

graduation isn't the finish line. it's where exit liquidity gets its diploma.
```

**Source** (self-reply, posted right after) · **184 / 280**

```text
source: launchpad lifecycle data (secondary). approximate, and it moves month to month.

one launchpad, sample window not published. "down 60%+" means below 40% of the migration price.
```

- **KS-02 (AMBER):** one secondary dataset, one launchpad, unknown sample window. Keep the "~", "within 20 minutes" and "one dataset". Never "all memecoins". **S-1: if it can't be verified by 11:30 a.m., post R4 (poll) instead.** Polls stay 3 days apart, so that's within the cadence rule.

### D7-P3 · 3:00 p.m. ET · trench dictionary: kol · image `dict-kol` · **223 / 280**

```text
trench dictionary: kol

a wallet labelled as belonging to someone with a following. their buys show up in the monitor next to the smart money.

the tag tells you who bought. it doesn't tell you why they're posting about it.
```

> Alt: A dark card with a purple "KOL" wallet-tag chip. Headline: kol. Text: a wallet labelled as belonging to someone with a following. the tag says who bought. not why they're posting. Footer: high risk · nfa.

- **Gate F-2 (OWNER).** In the code, KOL is an identity label the simulator supplies; nothing computes it (SC-19k, `server/analytics/wallets/index.ts:55`). Post this only once the live build has a real KOL source and a policy for labelling real people's wallets. **Otherwise post R5 (whale)** in this slot with `dict-whale`.
- The Monitor line is SC-24 (`web/pages/MonitorPage.tsx`). Never name, show or hint at any real person's wallet (MNC-15).

### D7-P4 · 8:30 p.m. ET · the "soon" teaser · video `teaser-soon` · **63 / 280**

**Post only if the launch gate hasn't passed by Day 7.** If it has, skip D7-P4 and go to `LAUNCH_DAY.md` (§11.1).

```text
everyone in the trenches is larping. the wallets aren't.

soon.
```

> Alt: AI-generated clip: a brass trench periscope rises over wet sandbags at night, its lens reflecting distant amber flares. Caption: everyone in the trenches is larping. Cut to a small dark dugout where the periscope's eyepiece hangs over an empty chair and desk, and a small amber lamp flickers on. Caption: the wallets aren't. End card: the Trenchscope lockup, "see who's really buying.", and "soon."

- The CT hook and the tagline from POSITIONING "Lines". **Owner decision (a), the default:** this is the warm-up's one product-level `soon.` (ledger MNC-01's single exception; BRAND_GUIDE §4.2). The chain list is gone from this post on purpose: "soon." straight after a chain list reads as "robinhood chain soon" (MNC-13). D4-P4 already named the five chains. "soon" is the only time-word: no date, no weekday, no "tomorrow" (MNC-21).
- **Owner decision (b), no "soon" at all** (**93 / 280**): `everyone in the trenches is larping. the wallets aren't.` / `a scope is how you tell them apart.` The end slate then drops `soon.` and holds the tagline alone, and the asset is renamed `teaser-scope`.
- No chain is named, so no C-0 gate on this post.
- Native upload, "Made with AI" on. This is the last original of the warm-up. Stay in the replies until about 10:30 p.m., then stop posting until the launch gate passes.

### Day 7 engagement

- **Value replies: 25–40**, plus every reply on your own posts. Targets: **all categories, weighted to the people who replied to you this week** (mutual replies weigh 20). Angle: be useful in their threads. **At most 1 product mention, and only on a question it answers.** **Never** drop "soon" or the launch under other people's posts.
- **Follows: 20** (running total 120).
- **KPI: Under the Hood shows no visibility labels** on the account or this week's posts. This is the go / no-go for launch. If there's a label, read CT_PLAYBOOK §4.3, pause follows, and tell the owner.

### End-of-warm-up checklist (Day 7, before 10:30 p.m.)

- [ ] The pinned post stays up until the launch post replaces it (`PROFILE.md` §9.1). Never add a link to it.
- [ ] The website field is still blank. `[LINK]` goes in only after the launch gate passes, on the owner's own domain, with no shortener (`PROFILE.md` §6.2).
- [ ] Note the baselines: followers, the week's median like-per-view, `fg-dev`'s 50% playback, and D6-P3's shares. Launch day is judged against them.
- [ ] Pause the Metricool queue so nothing auto-posts into launch day.
- [ ] **Launch gate:** every box in `LAUNCH_DAY.md` §1.1 (C-1 per chain, K-1, K-2, F-1, F-2 where used, F-3, F-6, Fees, L-1, D-1, T-1, Under the Hood) is ticked before any launch-day post. If the gate isn't passed after Day 7, keep the warm-up cadence from the reserve bench (§8). Don't post "soon" again and never give a date.

---

## 8. Reserve bench (swap-ins)

For when an asset isn't ready, a stat can't be verified, a gate fails, or the launch gate takes longer than Day 7. Each one is posted once. Keep the 2.5–3 h spacing and one poll per 2–3 days.

**R1 · lifecycle meme** · text only · **179 / 280**

```text
lifecycle of a trench coin:

min 1: "this one's different"
min 4: "dev is based"
min 6: dev sells
min 7: "devs do something"
min 8: "it was a social experiment"
hour 9: tumbleweed
```

- A pure meme: no product, no number, no label needed. Good for window C (Asia morning, US night).

**R2 · pov meme** · text only · **130 / 280**

```text
pov: you found a coin 40 seconds after launch. so early.

you're buyer #38.

the first 30 bought in the launch block. same funder.
```

- A joke about the market, not a product claim. If it runs, don't post it on a day with a bundler or insider field guide.

**R3 · price impact, explained** (the fallback for D3-P1) · text only · **253 / 280**

```text
price impact, explained like you're about to ape:

the pool is a bucket of coins. every buy takes some out, and the fewer left, the pricier each one gets.

big buy, small pool: the price runs away from you mid-fill.

the quote shows it before you click.
```

- SC-11 (`web/components/token/trade/QuotePreview.tsx`). Text only on purpose: the quote's Fees row is priced from the placeholder platform fee, and no fee number goes out until it's final (SC-12); its Route row names a demo venue (`TrenchSwap` or a demo launchpad) that reads as a real or owned exchange.

**R4 · poll** (the fallback for D7-P2, or any slot at least 2 days after the last poll) · question **73 / 280**

```text
if you could see one thing about a coin before you buy, what would it be?
```

| Option | Chars (max 25) |
|---|---|
| `who funded the dev` | 18 |
| `bundler share` | 13 |
| `the dev's past coins` | 20 |
| `smart money in it` | 17 |

**R5 · trench dictionary: whale** (the fallback for D7-P3) · image `dict-whale` · **239 / 280**

```text
trench dictionary: whale

has traded, and holds $100k+ in the chain's native coin or averages $10k+ a buy.

when one swims through a small coin, the whole chart feels it. the chip shows up on its trades. the splash shows up on the candles.
```

> Alt: A dark card with a blue "Whale" wallet-tag chip. Headline: whale. Text: has traded, and holds $100k+ in the chain's native coin or averages $10k+ a buy. Footer: high risk · nfa.

- SC-19 (GREEN): `WHALE_MIN_BALANCE_USD`, `WHALE_MIN_AVG_BUY_USD` (`server/analytics/wallets/index.ts:116-117,415-419`). No cashtag: "$100k" isn't a ticker.

**R6 · the monitor** (the fallback for D5-P2 if K-2 isn't answered) · image `peek-monitor` · **255 / 280**

```text
watch smart money move in real time. hot = 2+ smart wallets in 30 minutes.

the monitor streams trades from smart money and wallets you follow, with a rug-risk filter and a pause button for when it gets too much.

watching isn't copying. study the habits.
```

> Alt: Trenchscope's Monitor page, UI shown with demo data, tickers blurred: a stream of trades from smart-money wallets and followed wallets, with side, size and rug-risk filters and a pause control. On the right, a "Hot by smart money" panel lists tokens bought by 2+ smart wallets in the last 30 minutes, outlined in amber and captioned hot = 2+ smart wallets in 30 minutes.

- SC-24 (GREEN; `web/pages/MonitorPage.tsx`, `web/components/monitor/HotBySmartMoney.tsx:25,80`). Leave KOL filters and KOL rows out of frame until F-2. Never imply that watching or copying smart money makes money (MNC-04).

**R7 · stat: the dev's first buy** · text only · **167 / 280**

```text
coins where the dev bought nothing at launch graduated ~0.3% of the time, in one launchpad dataset.

the dev didn't believe in it either.

correlation, not a strategy.
```

**Source** (self-reply) · **156 / 280**

```text
source: launchpad lifecycle data (secondary). approximate, and it moves month to month.

one launchpad, by the dev's first buy. a correlation, not a signal.
```

- KS-07 (AMBER, S-1). Correlation, not a strategy. Never "buy when the dev buys": that's advice, and an invitation to get bundled.

---

## 9. Assets

**Status key.** **READY:** exists and is cleared for this positioning. **NEW:** has to be made (an edit of existing footage, a demo-data capture, or a card). Exports go to `marketing/x/posts/<ref>.png` or `.mp4`.

**Production rules for every asset:**
- **Product captures:** the real app in marketing capture mode. Load `marketing/tools/capture-mode.js` with `page.addInitScript({ path })` before navigating; it hides the sim notices, Faucet, Top up and the trade-panel fee line, and rewrites sim phrasing. Data stays demo data (ledger §7.1).
- **Keep out of frame** the screens capture mode misses: the sign-in/guest modal, the phone-menu sim notice, Account settings ("Paper account"), the copy-trade and sniper form footers, the Rewards page, the signed-out "paper balance" prompts and the "Faucet failed" toast. Also: the green **"Live"** pills (status bar, board, Activity tab), the **"Safe"** and **"Safe contract"** presets, the anti-MEV tooltip ("no sandwich attacks"), the Signals "Hit 2x+" tile, and any PnL, balance or equity curve as a subject (ledger §7.4, §7.7–7.9).
- **Frame check before export:** scan every frame (OCR, or by eye at 100%) for `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`, `Live`, `ms` (the trade-panel toast's simulated latency and the status bar's ping) and the demo venue names (`TrenchSwap`, `Moonpit`, `Bonkfire`, `Rayforge`, `FourPad`, `BNB Rocket`, `ClawLab`, `BaseDrop`, `EtherForge`). Any hit is a re-take, a crop or a blur (ledger §7.1, §7.3).
- **DEMO** `UI shown with demo data` in a corner of every product frame, at least ~2% of the frame height. `marketing/tools/screens.py` still stamps the old `SIM · PAPER TRADING` bug and the `SIMULATED · PAPER TRADE` watermark: swap them for the DEMO line before rendering.
- **Blur** generated tickers, KOL `@handles` and token social links in close-ups. Demo names can collide with real coins and accounts (ledger §7.3).
- **No Robinhood Chain in any UI frame**, and no chain or competitor logos or brand colours (ledger §7.6, §7.11). The UI's own chain marks use the chains' brand colours as built: recolour them first (F-7) or keep every chain chip out of frame.
- **AI shots:** `AI-generated` (exact case) burned in on the corner-label plate while the AI shot is on screen (BRAND_GUIDE §10). Real chips are the PNGs in `marketing/video/overlays/chips/` and are never redrawn by AI. No AI-generated UI, numbers or text (ledger §7.5).
- **Brand:** bg `#0A0C10`, panel `#11141A`, fg `#E6E9F0`, amber `#FFB547` as the one accent, red `#FF5468` only for danger. Inter for words, JetBrains Mono for numbers and chips. Nothing under 20 px on a 1080-wide canvas. Mark from `marketing/brand/logo/`.
- **Video:** MP4, H.264, 30 fps, 8–12 Mbps, 1920 × 1080, silent or AAC. **Longer than 10 s** (X's video-quality gate). Frame 0 designed as the thumbnail, text on screen by 0.3 s, captions burned in (autoplay is muted). Each video is a unique cut, posted once.

### 9.1 The field-guide teaser template (`fg-*`)

Built from the existing 5-second clips. **No new AI generation.** `video/SCRIPT.md` §13.1 (`fg-bundler`) is the worked example; all four `fg-*` teasers follow it.

| Time | Picture | On screen |
|---|---|---|
| 0.0–5.0 s | The AI clip, scaled from 1284 × 716 to 1920 × 1080, letterboxed like `d1-field-guide` | Top kicker `FIELD GUIDE TO THE TRENCHES`. The amber reticle locks on the subject. The **species card** (SCRIPT §5.1): species name in caps (`THE SNIPER`, `THE BUNDLER`, `THE INSIDER`, `THE DEV`), its Latin name above it (`emptor primus`, `fasciculus unanimus`, `amicus devi`, `creator fugiens`) and the real chip PNG beside it, all on frame 0. The caption (bottom centre) by 0.3 s, without "the [species]." since the card already names it. **`AI-generated`** in exact case (Mono 500, on the corner-label plate, BRAND_GUIDE §10) **top-right** for the whole AI section (SCRIPT §5.2) |
| 5.0–11.0 s | The definition card on brand bg (`cards.py` `chip-explainer`, kicker changed to `TRENCH DICTIONARY`) | The chip, the tag name, the rule lines (per row below), `high risk · nfa` and the mark on the bottom edge. Held at least 5 s so it can be read |

The trailer keeps only 1.8–2.4 s of each clip. These teasers run the full 5 s with their own captions and cards, so they're different uploads from the trailer.

### 9.2 Asset list

| Ref | Used in | Size / length | Source | On-image text | Status |
|---|---|---|---|---|---|
| `d1-field-guide` | D1-P3 | 1920 × 1080 | Existing: keyframe `s01` (whale) + the real Whale chip | `FIELD GUIDE TO THE TRENCHES · EP.01` · `everything out here wants your bag.` · `AI-GENERATED · DRAMATIZED` (the older label: faint, no plate, approved as is; optional 0-credit re-render with `AI-generated` on the plate) | **READY** (`x/posts/d1-field-guide.png`) |
| `fg-sniper` | D2-P1 | 1920 × 1080, ~11 s | Existing clip `c04` (sniper) + `chips/sniper.png`, template §9.1 | Species card `THE SNIPER` · `emptor primus` · chip; caption `in before you blinked.` Card: `sniper` · `bought within 3 blocks of launch.` · `on the audit: under 5 green · 5–20 amber · over 20 red` | **READY** (`x/posts/fg-sniper.mp4`) |
| `sr1-a` | D2-P2 | 1600 × 900 | New capture (FB-07b): the holder strip of two demo tokens, A and B, side by side, names and avatars cropped. Insider, sniper and bundler chips masked with amber `??` blocks. Must meet the D2-P2 asset rule | `spot the rug #1` · `one was bundled at launch. A or B?` · DEMO | **READY** (`x/posts/sr1-a.png`) |
| `sr1-b` | D2-P2r | 1600 × 900 | Same captures, chips revealed. B outlined in amber with the tag `bundled at launch` | `it's B.` · `the chips said it first.` · DEMO | **READY** (`x/posts/sr1-b.png`) |
| `peek-board` | D2-P3 | 1920 × 1080, ~12 s | New capture (FB-02, FB-03) on `/sol/trenches`: cards streaming in, curve rings filling, chips going red; the cursor rests on a column for ~2 s ("Paused · N new"). Live pills cropped or blurred, tickers blurred | Beat captions: `new · near graduation · migrated` · `a curve ring and risk chips on every card` · `hover to pause` · end slate (1.5 s) `the board.` + mark · DEMO on every UI frame | **READY** (`x/posts/peek-board.mp4`) |
| `stat-97` | D3-P1 | 1200 × 1200 | Card (`cards.py` `stat`): a 10 × 10 dot grid, 97 dim (`#2A303B`), 3 amber. No UI | `~97 of 100 launches never leave the curve.` · `lately, on the biggest solana launchpad. most just go quiet.` · footer `source: launchpad lifecycle data (secondary) · approximate · high risk · nfa` | **READY** (`x/posts/stat-97.png`) |
| `thread-lifecycle` | D3-P2 1/ | 1200 × 675 | Card: a curve-progress bar through NEW → NEAR GRAD → MIGRATED, amber turning green at 100%; a grey branch and a red branch | `launch, curve, migrate, pray.` · `most: go quiet` · `some: rug` · footer `high risk · nfa` (RISK-short, §1 rule 6) | **READY** (`x/posts/thread-lifecycle.png`) |
| `fg-bundler` | D3-P3 | 1920 × 1080, ~11 s | Existing clip `c05` (six hooded figures) + `chips/bundler.png`, template §9.1. Count six figures on every frame | Species card `THE BUNDLER` · `fasciculus unanimus` · chip; caption `six wallets, one trench coat.` (SCRIPT §13.1) Card: `bundler` · `bought in the same block the coin was created.` · `on the audit, share of volume: up to 10% green · up to 30% amber · over 30% red` | **READY** (`x/posts/fg-bundler.mp4`) |
| `peek-keys` | D3-P4 | 1920 × 1080, ~15 s | New capture (FB-04), keyboard only: `/sol/trenches` → `2` → `J` `J` → `B` (quick buy, fill toast: the quick-buy toast has no latency figure) → `Enter` → `S` → `/` (search opens; its results carry chain marks, so F-7 or crop). Key overlay bottom-left in Mono. No cursor. Status bar (Live pill, ping) cropped | Caption at 0 s `no mouse.` · beats `2 · near grad` · `j/k · pick a coin` · `b · quick buy` · `enter · open it` · `s · sell` · `/ · search` · end slate `j/k through the trench. b to buy. / to search.` + mark · DEMO | **READY** (`x/posts/peek-keys.mp4`) |
| `fg-insider` | D4-P1 | 1920 × 1080, ~11 s | Existing clip `c06` (war room) + `chips/insider.png`, template §9.1 | Species card `THE INSIDER` · `amicus devi` · chip; caption `early. suspiciously early.` Card: `insider` · `funded by the dev` · `funded by the dev's own funder` · `one private funder, 3+ wallets, all in the first 10 minutes` | **READY** (`x/posts/fg-insider.mp4`) |
| `peek-funding` | D4-P2 | 1600 × 900 | New capture (FB-07b): token page, holder strip (chips + supply by tag) above the Holders tab with the "Funded by" column. Pick a token where insiders share a funder | Callouts `supply by tag` (strip) · `who funded whom` (column) · DEMO | **READY** (`x/posts/peek-funding.png`) |
| `peek-chains` | D4-P4 | 1920 × 1080, ~12 s | New capture (FB-24): the board on `/sol/trenches` → `/base/trenches` → `/bsc/trenches` → `/eth/trenches`, the top-bar chain name changing each time. Four chains only. Chain chips only after F-7 (neutral marks); otherwise crop them and keep the chain name text | Beats `pick the chain.` · `same board.` · `same tags.` · `same hotkeys.` · end slate `one scope.` + mark · DEMO | **READY** (`x/posts/peek-chains.mp4`) |
| `fg-dev` | D5-P1 | 1920 × 1080, ~15 s | Existing clips `c07` (dev at the carpet, 0–5 s) then `c11` (the rug yank, 5–10 s) + `chips/dev.png`, template §9.1 with the card at 10–15 s | Species card `THE DEV` · `creator fugiens` · chip; captions `sets the table.` (c07) · `then pulls the rug.` (c11). Card: `dev` · `the wallet that made the coin.` · `holding · sold part · sold all · bought more` · `hover: coins launched · coins migrated` | **READY** (`x/posts/fg-dev.mp4`) |
| `peek-exits` | D5-P2 | 1200 × 1200 | New capture (FB-11), **buy side**: trade panel → Auto → Buy, "Buy with exit strategy" with take-profit levels, a stop-loss, a trailing stop and "Sell when dev sells" at 100%, then the "Bought … · [n] exit orders" toast. Blur the toast's ticker and its `· NNNms` latency. (The "≥ 20% of dev bag" selector and the "Dev-sell exit armed" toast are on the Sell side only; add them as a second panel only with a held position, and say so in the alt text) | Callout `dev-sell exit` · DEMO | **READY** (`x/posts/peek-exits.png`) (gate K-2 still applies) |
| `dict-smart` | D5-P3 | 1080 × 1350 | Card (`chip-explainer`, kicker `TRENCH DICTIONARY`) + `chips/smart.png` | `smart money` · `7-day hit rate. 3+ entries. 60%+ later ran 2x. tested against the chain's base rate.` · `plus a 55%+ win rate and a 7-day pnl floor per chain.` · `bots, MEV bots and snipers never qualify.` · footer `a description, not a tip · high risk · nfa` | **READY** (`x/posts/dict-smart.png`) |
| `sr2-a` | D6-P1 | 1600 × 900 | New capture: two token stat strips (volume, age, txs, makers) side by side as A and B, names blurred, each audit's "Wash trading" row masked with `??`. Must meet the D6-P1 asset rule | `spot the rug #2` · `same volume. one is mostly the same few wallets. A or B?` · DEMO (no "fake" on the image, so the frame check stays clean) | **BLOCKED**: the demo market never flags wash trading (0 of ~680 tokens across four chains on repeated checks; the simulator generates no wash volume), so the D6-P1 asset rule can't be met truthfully. Run the swap under D6-P1 |
| `sr2-b` | D6-P1r | 1600 × 900 | Same frame, rows revealed. A's row inside an amber reticle | `it's A.` · `few makers, fast round-trips. flagged.` · DEMO | **BLOCKED**: the demo market never flags wash trading (0 of ~680 tokens across four chains on repeated checks; the simulator generates no wash volume), so the D6-P1 asset rule can't be met truthfully. Run the swap under D6-P1 |
| `dict-fresh-bot` | D6-P2 | 1080 × 1350 | Card + `chips/fresh.png` and `chips/bot.png` | `fresh` · `first funded under 24h ago · in fewer than 15 coins` · `bot` · `200+ trades a day (or 5× the chain's median trader) · median hold under 2 min` · footer `high risk · nfa` | **READY** (`x/posts/dict-fresh-bot.png`) |
| `peek-audit` | D6-P3 | 1080 × 1350 | New capture (FB-07): the audit panel of a high-risk demo token, checklist and rug ratio, with red insider, sniper and bundler rows (their hints are hover tooltips: show at most one, e.g. Bundlers, or none) | Callout `reference, not a guarantee` (on the risk level / rug ratio) · DEMO | **READY** (`x/posts/peek-audit.png`) |
| `peek-risk` | D7-P1 | 1200 × 1200 | New capture (FB-08): trade panel → Market buy on a high-risk demo token, the "High-risk token" dialog with the box unticked | Callout `it asks first` (on "Buy anyway") · DEMO | **READY** (`x/posts/peek-risk.png`) |
| `dict-kol` | D7-P3 | 1080 × 1350 | Card + `chips/kol.png`. Only if F-2 is ticked | `kol` · `a wallet labelled as belonging to someone with a following.` · `the tag says who bought. not why they're posting.` · footer `high risk · nfa` | **READY** (`x/posts/dict-kol.png`) (gated on F-2) |
| `teaser-soon` | D7-P4 | 1920 × 1080, ~13.5 s | Existing clips `c02` (periscope rising) then `c13` (empty desk, lamp on, periscope eyepiece hanging) + an end card | 0.0 s `everyone in the trenches is larping.` · 5.0 s `the wallets aren't.` · 10.0–13.5 s end slate: mark reveal → stacked lockup (`brand/logo/lockup-stacked-dark.svg`) + `see who's really buying.` + `soon.` (amber), as SCRIPT §13.2. Nothing else: no re-typeset wordmark, chain list, date, weekday or time · `AI-generated` (exact case, corner-label plate, top-right) on the AI section. Under decision (b) (D7-P4), `soon.` is dropped | **READY** (`x/posts/teaser-soon.mp4`) (skipped if the launch gate passes first) |
| `dict-whale` | R5 | 1080 × 1350 | Card + `chips/whale.png` | `whale` · `$100k+ native balance or $10k+ average buy` · footer `high risk · nfa` | **READY** (`x/posts/dict-whale.png`) |
| `peek-monitor` | R6 | 1600 × 900 | New capture (FB-15): `/sol/monitor`, smart-money and followed-wallet trades, the rug-risk filter, the "Hot by smart money" panel. KOL rows and filters out of frame | Callout `hot = 2+ smart wallets in 30 minutes` · DEMO | **READY** (`x/posts/peek-monitor.png`) |

**Production order (by the day each is needed):** `fg-sniper`, `sr1-a`, `sr1-b`, `peek-board` (Day 2) → `stat-97`, `thread-lifecycle`, `fg-bundler`, `peek-keys` (Day 3) → `fg-insider`, `peek-funding`, `peek-chains` (Day 4) → `fg-dev`, `peek-exits`, `dict-smart` (Day 5) → `sr2-a`, `sr2-b`, `dict-fresh-bot`, `peek-audit` (Day 6) → `peek-risk`, `dict-kol` or `dict-whale`, `teaser-soon` (Day 7). Reserve assets only if their slot runs. Capture all demo-data shots in one capture-mode session where possible, so the same demo run feeds the puzzles and the peeks.

### 9.3 Old assets: reuse or rebuild

| Old asset | Verdict | Why / replaced by |
|---|---|---|
| `x/posts/d1-field-guide.png` | **Reuse** | D1-P3. AI-labelled, no sim wording |
| `video/clips/c01, c02, c04, c05, c06, c07, c11, c13` | **Reuse** | Source footage for `fg-*` and `teaser-soon`. `c01` (whale) isn't needed this week; it can back R5 if a video version is wanted |
| `video/keyframes/s01 … s13` | **Reuse** | Thumbnails and stills. `s11` covers the old rug-still idea (`d5-c`) |
| `video/overlays/chips/*.png` | **Reuse** | Real UI chips for teasers and cards. Don't use `you.png` |
| `brand/logo/*`, `x/profile/avatar.png`, `x/profile/header-alt.png`, `x/profile/art/header-art-candle-valley.jpg` | **Reuse** | Profile and marks. The candle-valley art is for the optional `header-main` (`PROFILE.md` §7), not a post |
| `x/posts/screen-trenches.png` | **Rebuild** → `peek-board` | SIM bug and sim footer |
| `x/posts/screen-token-audit.png` | **Rebuild** → `peek-audit` | "Simulated audit" text, SIM bug |
| `x/posts/screen-risk-gate.png` | **Rebuild** → `peek-risk` | Sim subtitle ("Paper trades only"), SIM bug, weak ticker blur |
| `x/posts/screen-monitor.png` | **Rebuild** → `peek-monitor` | Sim footer, unblurred tickers, KOL rows |
| `x/posts/d2-a.png`, `d2-a-reveal.png` | **Rebuild** → `sr1-a`, `sr1-b` | "fictional sim tokens · simulated audit" footer, SIM bug |
| `x/posts/d3-c.mp4` | **Rebuild** → `peek-keys` | SIM bug, "quick buy (paper)" caption, sim end slate |
| `x/posts/screen-buy-preview.png` | **Retire** | Shows the placeholder "0.8% platform fee" (SC-12). R3 runs text-only |
| `x/posts/screen-dev-hover.png` | **Retire this week** | Not used. Rebuild in capture mode (FB-05) only if a dev-record peek is wanted |
| `x/posts/screen-wallet.png` | **Retire** | Demo PnL as the subject (MNC-19, ledger §7.4) and a "Money Printer" style title (MNC-03) |
| `x/posts/d4-a.mp4` (rug autopsy) | **Retire** | A replayed sim rug with a ticker that collides with a real coin. Rug autopsies stay on demo data until the owner and legal approve real-chain ones (BRAND_GUIDE §14.3); the series starts at L+1 (`LAUNCH_DAY.md` L1-A) |
| `video/app-footage/*` | **Rebuild before any reuse** | Recorded before capture mode: SIM bug or sim wording. This week needs none of them |
| `video/trenchscope-trailer-16x9.mp4` | **Rebuild** (trailer doc) | Not posted in the warm-up |
| Old plan items never built: `d2-b`, `d3-a`, `d3-b`, `d5-a`, `d6-a/b`, `d6-c`, `d7-a` | **Superseded** | → `fg-sniper`, `stat-97`, `thread-lifecycle`, `fg-insider`, `sr2-a/b`, `fg-bundler`, `teaser-soon` |
| `d5-b` (paper bag diaries) | **Retired** | Sim-only format |

### 9.4 AI credits

**As built:** the rebuild spent ~23.7 Higgsfield credits, all on the trailer and the "soon" teaser: three new keyframes (n1 five fronts, n2 the exit, n3 the larpers, ~2 each), two Kling 3.0 Turbo clips (n1, n2, ~7.5 each) and the v4 voice take (~2.7). About 4.7 are left. The music beds are vidIQ generations (two tracks, 25 vidIQ credits each). OPT-1 and OPT-2 below were not used.

**This week needs no new AI generation.** Every AI asset is an edit of the existing clips and keyframes. The ~3 pre-approved Higgsfield credits are for the trailer's one new VO take (~1.6), which is planned in the trailer doc, not here.

Optional, **only with the owner's approval** (costs are from this account's own transaction history):

| ID | What | Why | Estimate |
|---|---|---|---|
| OPT-1 | Species stills for the cards: smart money, kol (or whale) and fresh/bot, in the trailer's style (Nano Banana Pro, 16:9 or 4:5) | Lets the three static dictionary cards match the field-guide look | ~2 credits per image, so ~6 for three (plus ~2 per retry) |
| OPT-2 | A fresh Kling 3.0 Turbo take of shot 13 (the empty desk) for `teaser-soon` | Gives the "soon" teaser footage the trailer doesn't use | ~7.5 credits per 5 s take (720p) |

Both together come to about 13.5 credits of the ~28 left. Neither is needed to post this week. **Every optional item in the kit, with the running total against the ~26 credits left after the pre-approved VO take, is in `video/SCRIPT.md` §19.1.** Approve against that table.

---

## 10. Variants if a chain isn't ready (C-0)

If a chain won't be in the launch build (C-0), it comes out of every post, the header and the bio now; if it then fails C-1 on launch day, it comes out of the launch copy too (ledger §8). Robinhood Chain is the one most likely to slip, so these are ready. For any other chain, drop it the same way and re-measure.

**D1-P3, four chains** · **140 / 280**: replace the chain list with `solana, base, bsc and ethereum`.

**D3-P2 6/, four chains** · **188 / 280**: last line `solana, base, bsc, ethereum.`

**D4-P4, four chains** · **189 / 280**

```text
build log: four chains, one terminal.

solana, base, bnb chain and ethereum. pick the chain up top. the board, the tags, the audit and your hotkeys come with you.

one scope. four trenches.
```

D7-P4 no longer names chains, so it needs no variant.

PIN-v2's four-chain version (259) is in `PROFILE.md` §9.2.

---

## 11. If something goes wrong

| Situation | Do this |
|---|---|
| Reach collapses, or Under the Hood shows a label | Pause follows for 48 h. Keep posting good originals at the normal cadence. Don't delete posts or make a new account. Tell the owner |
| A post flops | Leave it up. Re-cut the idea 48 h or more later, in new words |
| A stat can't be verified (S-1) | D3-P1 → R3. D7-P2 → R4. Never post an unverified number "for now" |
| A field-guide edit isn't ready | Post the keyframe still (`s04`, `s05`, `s06`, `s07`) with the reticle, chip and caption, the same copy and the AI label. For `teaser-soon`, post D7-P4's text alone |
| A capture isn't ready, or doesn't meet its asset rule | Don't post a peek or puzzle whose image doesn't match the copy. Swap in R1 or R2 and move the peek to after launch |
| F-2 isn't confirmed | D7-P3 → R5 (whale) |
| K-2 isn't answered | D5-P2 → R6. Use the holding line in §1.1 for custody questions |
| A chain won't make the launch build (C-0) | §10 versions everywhere, plus PIN-v2, the bio and the header per `PROFILE.md` |
| L-1 says warm-up posts need RISK in the post | Most copy here has no room for the 92-character RISK line (it needs ≤ 186 characters before it). Tell Claude and the affected posts get re-cut |
| Someone asks "is it live?" | Not yet. Links only ever come from this profile. No date, no "soon" |
| Someone asks about a token, airdrop or points | Don't answer (T-1) |
| An impersonator or scam account shows up | Report, block and hide their replies. Post CUSTODY in fresh words under the pin |
| The launch gate passes before Day 7 | **The expected path** (real trading goes live this week). Follow §11.1 |
| The launch gate isn't passed after Day 7 | Keep posting from the reserve bench at warm-up cadence. Don't repeat "soon" and never give a date |

### 11.1 The compressed plan: the launch gate passes before Day 7

POSITIONING says real trading goes live this week, and Day 1 is a weekday whose Days 5–6 are the weekend, so a full seven-day warm-up puts launch day next week. Expect the gate to pass first. When it does:

1. **Launch day = the first morning after the gate passes.** The owner runs `LAUNCH_DAY.md` §1.1 at 9:00 a.m. ET and, if it passes, the run sheet goes as written (gate passes in the evening → launch the next morning; never in the evening). Check the clocks: before the EU change on Day 6, London is ET + 5 h and Berlin ET + 6 h (`LAUNCH_DAY.md` time-zone note).
2. **The evening before launch day:** pause the Metricool queue and unschedule every warm-up post not yet out. Nothing pre-launch posts on launch day.
3. **D7-P4 ("soon") is skipped.** It never posts after the gate has passed, and it's never re-cut as a "live" post.
4. **Unposted warm-up peeks move to L+1 to L+3**, at most one a day, alongside `LAUNCH_DAY.md` §7–§8, each 2.5–3 h from any other original. They stay on demo data, keep DEMO in the pixels and alt text, and get re-worded where the copy says "we're building" (it's built now); "two coins from our demo data" stays as it is. Every moved post that names the product or trading ends with **RISK** (186 characters before it): re-cut and re-measure before it goes out. Field-guide teasers and the dictionary cards can move the same way; drop the ones whose feature already got a launch-thread stop the same week (duplicate angle).
5. **Unposted stats (D3-P1, D7-P2)** move only if S-1 still holds, and never within 48 h of a launch post that uses the same stat.
6. **The trailer's picture lock moves to the evening before launch day** (`video/SCRIPT.md` §14.1). If the cut isn't locked by then, launch anyway: post **TR-B** (it opens "field guide to the trenches, ep.01.", which works over a still; TR-A's "we made a nature documentary" needs the film) over a fresh 16:9 frame of `s01.jpg` with the reticle, the Whale chip and the `AI-generated` label (0 credits; not the Day-1 `d1-field-guide.png` file itself, so it isn't a duplicate upload), and post the trailer as its own original 48 h or more later.
7. **Day caps carry over.** Launch-day follows and replies follow `LAUNCH_DAY.md`; the warm-up's daily follow counts stop on launch day.

If the owner instead wants launch posts to wait until after Day 7 even when trading works earlier, POSITIONING gets one line saying so, and this section doesn't apply.

---

## 12. Open owner decisions for this file

1. **The pin is PIN-v2** (`TODAY.md`, `PROFILE.md` §9.2). The original PIN is retired: two of its statements are false today. Decided unless the owner reverses it (and fixes F-2, F-3 and the "every wallet" wording first).
2. **C-0 per chain, plus custody,** before Day 1's PIN-v2, the bio, the header and D1-P3. Five-chain or four-chain copy (§10).
3. **K-2:** write the one-line answer to "how do exits fire if I hold my keys?" before D5-P2. (K-1, self-custody being true, is a launch-day check.)
4. **The launch schedule, before Day 1:** the compressed plan (§11.1) as the expected path, or a line in POSITIONING saying launch posts wait until after Day 7.
5. **D7-P4:** decision (a) one product-level `soon.` with no chain list (the default), or (b) no "soon" at all (`a scope is how you tell them apart.`, 93).
6. **F-7:** recolour the UI's chain marks (or override them in capture mode) before any capture; otherwise D4-P4 is re-cut with chain names only.
7. **D1-P3:** the approved copy (157, C-0) or the optional whale swap (145, no chain gate); optionally re-render `d1-field-guide.png` with the exact `AI-generated` label first.
8. **F-2:** a real KOL source and a labelling policy, or D7-P3 becomes the whale entry (R5).
9. **S-1:** re-verify KS-01 the day before Day 3 and KS-02 the day before Day 7.
10. **L-1:** whether warm-up teasers need the full RISK line in the markets you're posting to.
11. **OPT-1 / OPT-2** AI credits (§9.4). Optional.
12. **Tools before capture:** swap the SIM bug in `marketing/tools/screens.py` for the DEMO line, and close the capture-mode gaps listed in ledger §7.1 (or keep those screens out of frame). Worth adding to `capture-mode.js`: strip `· NNNms` from fill toasts and the inline result line (ledger §2.6), neutral chain marks (F-7, ledger §7.11), and a blur or rename for the quote's Fees value and Route venue (ledger §7.3).
13. **"Wen token" replies** (T-1): until decided, the account doesn't answer.
