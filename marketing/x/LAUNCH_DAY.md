# Launch day kit: Tue 2026-10-27

| | |
|---|---|
| **For** | The owner/operator of the brand account on launch day (Tue Oct 27), plus the two follow-up days (Wed Oct 28, Thu Oct 29) |
| **What goes out** | The AI "larp" trailer (native video, link-free caption), a 10-post self-reply thread with `[LINK]`, two FAQ replies, 3 quote posts later that day, a "reply with your worst rug" prompt, and day +1 / day +2 posts |
| **Placeholders** | `@trenchscope` (handle not yet confirmed) and `[LINK]` (no live URL yet). Replace `[LINK]` with the real `https` URL of the owner's own domain. No shortener, no redirect chain |
| **Rules come from** | `marketing/research/CLAIMS_LEDGER.md` (wins any conflict), `marketing/research/CT_PLAYBOOK.md` (ranking, cadence, spam triggers), `marketing/research/AI_VIDEO_NOTES.md` (trailer), `marketing/brand/BRAND_GUIDE.md` (voice, disclaimers), `marketing/x/PROFILE.md` (pin plan, settings) |
| **Assets** | Refs `launch-1` … `launch-17`, specified in §10. Screens come from `marketing/screens/` and new captures, framed with `marketing/tools/screens.py` (SIM corner bug + callouts). Cards come from `marketing/tools/cards.py` |

**Character counts** are X-weighted (twitter-text v3): `·`, `—` and straight quotes count 1; `→` and `↓` count 2; **every URL counts 23**, so `[LINK]` is counted as 23. Every post is at most 280, so none needs "Show more". Bracketed fields like `[N]` or `[tell]` must be filled with real values before posting, and their final length re-checked.

**Time zones on Oct 27.** The US is still on summer time (EDT, UTC−4) until Nov 1. The EU went to winter time on Oct 25. So **ET + 4 h = UTC = London**, **ET + 5 h = Berlin**, **ET + 12 h = Singapore**.

---

## 0. The day at a glance

| ET | UTC / London | Berlin | SGT | Post | Type | Asset |
|---|---|---|---|---|---|---|
| **10:00 a.m.** | 14:00 | 15:00 | 22:00 | **Trailer** + thread T1–T10 + FAQ-L1/L2. Pin the trailer | Original + self-replies | `launch-1`, `launch-3` … `launch-9` |
| 10:00–11:30 | | | | Reply to every reply. No other originals, no quoting yourself | Replies | — |
| **1:30 p.m.** | 17:30 | 18:30 | 01:30 (Wed) | **QT-1**: "the trailer is fake. this part isn't." Real-UI clip | Quote of the trailer | `launch-10` |
| **4:00 p.m.** | 20:00 | 21:00 | 04:00 (Wed) | **COMM-1**: "reply with your worst rug" + safety self-reply | Original | none (optional `launch-12`) |
| **6:15 p.m.** | 22:15 | 23:15 | 06:15 (Wed) | **QT-2**: making-of (flex slot, see the hold rule in §5) | Quote of the trailer | `launch-11` |
| **8:30 p.m.** | 00:30 (Wed) | 01:30 (Wed) | 08:30 (Wed) | **QT-3**: Asia re-push with the vertical cut | Quote of the trailer | `launch-2` |

Five originals, each at least 2 h 15 min apart, so no two land in the same 2-hour block (CT_PLAYBOOK §3.3, §5.3). 4:00 p.m. ET (20:00 UTC) sits on the peak of daily launch activity, when the trench crowd is online (CT_PLAYBOOK §5.1).

**Post everything on launch day natively in X's composer, not through Metricool.** Native posting gives full upload quality, the AI-label option, alt text and control of the reply chain (PROFILE §11.2). Metricool can queue day +1 / day +2 originals for owner review.

---

## 1. Before you post

### 1.1 Launch blockers (Mon Oct 26 evening). Don't launch until each one is checked

- [ ] **`[LINK]` resolves.** It's the owner's own domain, served over `https` with no shortener or redirect hop. Open it logged out on a phone and on a desktop. It loads, and "simulated market · paper trading" is visible **above the fold**.
- [ ] **The link card is honest.** Paste the URL into an X draft (don't post it) and check the preview. The title, description and image must not say "trade on solana", "live now", "deposit" or "connect wallet". A safe description: `a memecoin trading terminal on a simulated market. paper trading only. no wallet, no token.`
- [ ] **Guest sign-ups won't be throttled for everyone at once.** The server caps new accounts at 30 per IP per 10 minutes (`apps/server/src/app.ts:38`, `ACCOUNT_CREATIONS_PER_IP`). **Behind a proxy or CDN, set `TRUST_PROXY=1`** (`app.ts:37`). Without it, every visitor shares the proxy's IP, and after 30 quick starts everyone gets "too many new accounts from this address".
- [ ] **The server can take a spike.** Run the soak script recently (`README.md:80`: `scripts/soak.ts`), and keep a way to restart quickly. The sim fast-forwards about 90 minutes of history on boot, so a restart still shows full boards (SC-05).
- [ ] **End-to-end smoke test in a fresh private window:** Sign in → Quick start → 4 paper balances → buy → fill toast → faucet top-up toast.
- [ ] **In-app strings** (PROFILE §9.2, §13.6). Rename these before launch-day captures, or blur them in every image and clip:
  - the Trenches sub-header "Live launchpad tokens on Solana", e.g. to "Simulated launches · Solana (sim)"
  - the "+ Deposit" pill, which is the faucet. "Deposit" is on the never-say list (MNC-01)
  - the "Money Printer" wallet style title (`components/wallet/StyleBits.tsx:30`). Crop it out of any wallet image, because "print" is profit talk (MNC-03)

  The old "Almost bonded" and "P1/P2/P3" labels are already gone from the UI (commit `e33b3cf`: the column reads "Near graduation", the presets read S1/S2/S3). Still, check every frame.
- [ ] **Assets exported and QA'd** against BRAND_GUIDE §15, including `launch-1`, `launch-2`, `launch-3` … `launch-9`, `launch-10` and `launch-11`. In detail:
  - the trailer's frame 0 is the title card
  - the DIS-06 end card holds for at least 3 s
  - the `SIM · PAPER TRADING` bug is on every app insert
  - there are no AI glyphs or faces
  - the music is licensed or generated
- [ ] **Trailer file:** MP4, H.264, AAC-LC, 1920×1080, 30 fps, 8–12 Mbps, 30–45 s, ≤ 512 MB, so it posts even without Premium. Keep a 1280×720, 6 Mbps fallback export in the same folder.
- [ ] **Warm-up queue paused** in Metricool for Oct 27, so nothing auto-posts into the launch windows.
- [ ] **Claims pass:** every post below maps to a ledger ID (§12). Stats and in-sim numbers are labelled. No cashtags, hashtags or @-mentions anywhere.
- [ ] **People:** one operator owns the account from 9:00 a.m. to 12:00 p.m. ET and is back at 1:30, 4:00, 6:15 and 8:30. A second person can watch the server, but **posts only from their own account**.

### 1.2 Team accounts and friends

Team members may share the trailer **once, from their own personal accounts, in their own words, whenever they like**. Don't coordinate the timing. Don't ask friends or group chats to like, reply or repost. Don't use alt accounts, pods or "raid" calls. Coordinated engagement is platform manipulation, and the code ignores group-chat-driven visits anyway (CT_PLAYBOOK §3.9, §4.3).

---

## 2. The trailer post (10:00 a.m. ET)

**Video:** `launch-1` (16:9 master). **The caption is link-free.** `[LINK]` goes only in the first self-reply (T1). Pin this post. It replaces PIN-A.

### TR-A (recommended): the self-aware hook · `266/280`

```text
we made a war movie trailer for a paper-trading app.

we are not ok.

trenchscope: the memecoin trenches, simulated. snipers, bundlers, insiders, the dev. fake money, real-feeling rugs.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

### TR-B: the trailer voice · `195/280`

```text
in a world where the dev always sells, one terminal lets you get rugged for free.

trenchscope. larp the trenches.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

### TR-C: the deadpan list · `236/280`

```text
the trenches finally got a trailer.

it's for a trading terminal. the money is fake. the snipers are fake. the rugs are fake. the trauma is extremely real.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

**Why TR-A:** the first line works without sound and without the video. The contradiction ("war movie trailer" + "paper-trading app") opens a curiosity gap. "we are not ok" is the self-deprecating beat that earns quotes. DIS-07 is verbatim on the last line. Don't use TR-B if the trailer's frame-0 card already reads "IN A WORLD WHERE THE DEV ALWAYS SELLS", or the caption just repeats the video.

**Composer settings**

- Turn on X's **AI-generated / altered-media label** if the composer offers one (DIS-07, BRAND_GUIDE §11.2).
- No content warning, no location, no hashtags, no @-mentions, no cashtags.
- If the composer offers a **video description** (alt text) field, paste this (547 chars):

```text
AI-generated parody movie trailer for Trenchscope, a paper-trading app on a simulated memecoin market. Night-time trench and war-room scenes with anonymous helmeted and hooded silhouettes, amber signal flares and a radar sweep, intercut with title cards and brief screen recordings of the real app, each labelled SIM · PAPER TRADING. A carpet is yanked from under a table of blank discs. End card: AI-generated dramatization, fictional people, tokens and events; simulated market, paper trading only, no real funds, no token, not financial advice.
```

---

## 3. The launch thread (self-replies under the trailer)

Build it in the composer as one thread: post 1 is the trailer and posts 2–11 are T1–T10. Publish it all at once at 10:00. Each image carries the `SIM · PAPER TRADING` bug, and every alt text says the data is simulated. `[LINK]` appears three times: in T1 (the first reply, so the trailer caption stays link-free), T9 (how to try it) and T10 (DIS-12 footer, verbatim). There are no other links and no @-mentions anywhere in the thread.

### T1 · what it is + the link · `276/280` · image: none (the link card shows)

```text
what it actually is:

a memecoin trading terminal on a simulated market. launches, bonding curves, migrations and rugs across 4 sim chains, streaming live. paper trading only.

no wallet. no token. nothing to connect.

[LINK]

sim market · paper trading · nfa
```

Ledger: SC-01, SC-04, SC-06, SC-37, DIS-02.

### T2 · the larp angle · `266/280` · image: none

```text
on ct, "larping" means pretending.

every paper-trading tool is a larp. we just say it out loud.

so we built the larp properly: a whole fake trench running 24/7. snipers, bundlers, insiders, slow rugs, sandwich bots. tuned to real launchpad base rates, so it hurts.
```

Ledger: SC-04, SC-05, SIM-03 (say "tuned to", never "matches"). It doesn't repeat the pinned "larping with extra steps" line (PROFILE §5).

### T3 · feature: the board · `266/280` · image: `launch-3`

```text
the board.

new → near grad → migrated. every launch on one screen, streaming in.

curve-progress ring and risk chips on every card. hover a column and it pauses, so the coin you wanted doesn't scroll away.

j/k to move. b to quick-buy. with fake money, obviously.
```

Ledger: SC-07, SC-30, FB-02/03/04. Alt text (395 chars):

```text
Trenchscope's Trenches board on a simulated market: three columns of fictional memecoin launches labelled New, Near graduation and Migrated. Each card has a curve-progress ring around the token icon, market cap, volume and a row of colour-coded risk chips. Amber callouts mark the three columns and one chip row. A SIM · PAPER TRADING stamp sits top-right. All tokens are fictional sim entities.
```

### T4 · feature: the audit · `274/280` · image: `launch-4`

```text
the audit.

every token gets a checklist: top 10, dev holding, insiders, snipers, bundlers, fresh wallets, bots, wash trading, lp burned, smart money. plus a rug ratio.

every row has a threshold and a plain-english hint.

this sim launch: 7 flags, high risk. we're shocked.
```

Ledger: SC-09, SC-10 (never "predicts rugs"). **Make sure "7 flags, high risk" matches the frame you post.** If you capture a different token, change the line. Alt text (367 chars; update the numbers to match the final capture):

```text
Audit panel for a fictional sim token, marked 7 flags and High risk. Red rows: rug ratio 82%, dev holding 17%, insiders 30%, bundlers 49%, fresh wallets 71%. Amber rows: top 10 holders 49%, smart money 0. Beside it, the holders table shows each wallet's share of supply and which wallet funded it. SIM · PAPER TRADING stamp top-right. Simulated audit, reference only.
```

### T5 · feature: the risk gate · `220/280` · image: `launch-5`

```text
the "you sure?" box.

try to buy a high-risk token and it stops you: "why this is risky", every reason listed, and a box to tick before "buy anyway" even lights up.

you will tick it. we all do. here it costs fake money.
```

Ledger: SC-08. The checkbox is in code: "I understand the risks and want to buy" has to be ticked before "Buy anyway" enables (`components/token/trade/useTradeExecutor.tsx:71-109`). Alt text (414 chars):

```text
A dialog titled "High-risk token" over Trenchscope's trade panel on a simulated market. A red box headed "Why this is risky" lists the reasons, such as the rug ratio and red audit rows for bundlers and insiders. Below it is an unticked checkbox, "I understand the risks and want to buy", and two buttons: Cancel and a disabled "Buy anyway". SIM · PAPER TRADING stamp top-right. The token is a fictional sim entity.
```

### T6 · feature: see who's really buying · `269/280` · image: `launch-6`

```text
see who's really buying.

every wallet gets a label: smart money, kol, sniper, bundler, insider, dev, whale, fresh, bot.

in the sim: bought in the creation block? bundler. funded by the dev? insider. smart money earns the tag with a hit rate.

monitor shows them live.
```

Ledger: SC-19, SC-20 (no accuracy numbers), SC-21 (describe how **the sim** tags wallets), SC-24. In code, a bundler is a buy in the creation block, and an insider is funded by the dev's wallets or the dev's funder (`apps/server/src/analytics/tokens/track.ts:207-255`). Alt text (386 chars):

```text
Trenchscope's Monitor page on a simulated market: a live table of trades by labelled wallets, each with a small coloured tag icon, side, size in SOL and the token's market cap. On the right, a panel called "Hot by smart money" ranks fictional tokens that two or more smart wallets bought in the last 30 minutes. SIM · PAPER TRADING stamp top-right. All wallets and tokens are fictional.
```

### T7 · feature: exits and automation · `269/280` · image: `launch-7`

```text
exits that don't need you awake.

attach take-profit, stop-loss or a trailing stop to the buy. add a dev-sell exit: dev sells, you sell.

or automate it: snipe migrations, copy a wallet, get pinged when a wallet apes.

all paper. whether it fires in time is the lesson.
```

Ledger: SC-14, SC-15 (never imply copy-trading profits), SC-16, SC-17, SC-13 (latency is simulated, so exits can be late). Alt text (369 chars):

```text
Trenchscope's trade panel, Auto tab, on a simulated market. A buy is set up with an exit plan: a take-profit, a stop-loss, a trailing stop and a dev-sell exit that sells when the dev sells a set share of their bag. The Orders tab below lists the attached exit orders as open. SIM · PAPER TRADING stamp top-right. Paper trading only; the token is a fictional sim entity.
```

### T8 · the honesty / fees angle · `265/280` · image: `launch-8`

```text
the honest part.

full cost before you click: min received, price impact (warns past 3%, screams past 10%), fees, route. the 0.8% platform fee is simulated and shown up front.

pnl counts your fees. n/a shows as --, not a fake 0%.

anti-mev off? enjoy the sandwich.
```

Ledger: SC-11, SC-12 ("simulated", never compared to anyone), SC-32, SC-13. The "n/a shows as --" line refers to LP burn on a curve token and the honeypot mark on non-EVM chains (`components/discovery/TokenCell.tsx:99-107`). Alt text (441 chars):

```text
Two panels from Trenchscope on a simulated market. Left: the buy quote shown before clicking, with you receive, minimum received at 25% slippage, price impact 1.9%, execution price, fees of 0.0068 SOL and the route via a fictional launchpad's bonding curve, above the line "Paper trading on simulated markets · 0.8% platform fee". Right: a fill toast for a large paper buy with anti-MEV off, ending in an MEV loss. SIM · PAPER TRADING stamp.
```

### T9 · how to try it · `270/280` · image: `launch-9`

```text
how to try it:

1. open [LINK]
2. sign in → quick start
3. you're holding 50 sol, 15 bnb, and 3 eth each on base and ethereum. all paper.

lose it all? hit the faucet (once a minute per chain) and go again. no wallet, no extension, no keys. just a tab.
```

Ledger: SC-02, SC-03, SC-37. If the "+ Deposit" pill hasn't been renamed by launch, change "hit the faucet" to "hit the + next to your balance" (recount it). Alt text (375 chars):

```text
Trenchscope's sign-in window on the Quick start tab. A notice says the market is simulated and trading is paper only. A grid lists the paper starter balances: Solana 50 SOL, BNB Chain 15 BNB, Base 3 ETH, Ethereum 3 ETH. Below it is a "Start paper trading" button and a note that guest accounts live in this browser. SIM · PAPER TRADING stamp top-right. No wallet is involved.
```

### T10 · CTA + DIS-12 footer · `275/280` · image: none (the link card shows)

```text
trailer made you laugh? it did its job. audit made you go "wait, that's how bundles work?" the app did.

go get rugged for free. tell us what broke.

trenchscope is a simulated market. paper trading only, no real funds, no token, not financial advice. [LINK]
```

Ledger: DIS-12 verbatim. "tell us what broke" asks for bug reports, not engagement for rewards.

### FAQ-L1 and FAQ-L2 (10:03 a.m., replies to the trailer post, not to T10)

They sit as their own branch under the trailer, so the "wen token" answer is one tap away. The wording deliberately differs from PIN-A's FAQ-1 and FAQ-2, so it isn't duplicate text.

**FAQ-L1** · reply to the trailer · DIS-08 + DIS-09 meaning · `248/280`

```text
before anyone asks:

no token. no airdrop, no presale, and points don't turn into anything. anyone selling you a trenchscope token is scamming you.

we never dm first. there's nothing to connect, so anyone asking for your keys or a wallet isn't us.
```

**FAQ-L2** · reply to FAQ-L1 · DIS-11 + DIS-10 · `203/280`

```text
and for the record:

every coin, wallet and kol you see in the app is a fictional sim entity. any resemblance to your bags is a coincidence.

not affiliated with any chain, launchpad or trading platform.
```

---

## 4. Launch hour, minute by minute (Tue Oct 27, ET)

| Time (ET) | Do this | Done |
|---|---|---|
| **9:00** | Open `[LINK]` logged out on phone and desktop. Do one quick start in a private window. Open the server logs or dashboard | [ ] |
| 9:05 | **Under the Hood** (`x.com/i/jf/under_the_hood`): no labels on the account. Note the follower count and the PIN-A stats as a baseline | [ ] |
| 9:10 | Open the X composer on desktop. Post 1: upload `launch-1`, paste TR-A, add the video description, turn on the AI label if offered. Let the video finish processing | [ ] |
| 9:20 | Add posts 2–11 (T1–T10) with images `launch-3` … `launch-9` and their alt texts. **Don't publish** | [ ] |
| 9:35 | Proofread: `[LINK]` replaced with the real URL in T1, T9 and T10 (and nowhere else). No @-mentions, cashtags, hashtags or emoji. Every bracket filled | [ ] |
| 9:40 | Profile → Edit → **Website: `[LINK]`**. The bio stays as is (BIO-1). Only photo, display-name and handle changes trigger a verification re-review (PROFILE §2, phase C) | [ ] |
| 9:45 | Metricool queue paused for today. Notifications on the phone. Calendar clear until 11:30 | [ ] |
| 9:55 | Check that the video thumbnail (frame 0, the title card) shows in the composer. If processing has stalled for 5+ minutes, swap in the 720p fallback export | [ ] |
| **10:00:00** | **Publish the thread** | [ ] |
| 10:01 | Trailer post → ••• → **Pin to your profile** (PIN-A unpins automatically and stays on the timeline). Optional: add it to Highlights | [ ] |
| 10:02 | Private window, logged out: the trailer autoplays muted, the caption is complete, "Show replies" opens T1–T10, and the T1 link card renders | [ ] |
| 10:03 | Reply to the **trailer** with FAQ-L1, then reply to FAQ-L1 with FAQ-L2 | [ ] |
| 10:05 | On the phone, tap the link in T1 and do a quick start. Watch the server for 429s or errors | [ ] |
| 10:05–10:30 | **Answer every reply within about 5 minutes**, in fresh words each time (§9.1). Hide, report and block scam replies (fake airdrop, "support", fund recovery) without engaging | [ ] |
| 10:15 | Watch the trailer once in the X phone app: captions readable, end-card disclaimer readable, the SIM bug visible on app inserts | [ ] |
| **10:30** | T+30 snapshot in §11. **Don't edit or delete** anything, and don't quote yourself | [ ] |
| 10:30–11:00 | Keep replying. Between replies, 3–5 value replies on fresh mid-size CT posts: no link, no plug unless someone asks | [ ] |
| **11:00** | T+60 snapshot. Server health check. Quick Under the Hood check | [ ] |
| 11:00–11:30 | Keep replying. Follow back only people who pass PROFILE §10.2 (at most about 10 this hour, at most 30 today) | [ ] |
| **11:30** | T+90 snapshot. Confirm QT-1 for 1:30 p.m. | [ ] |
| 12:00 | T+2 h snapshot: the cold-start audition is over (about 2 h or 200 views). Write down the like-per-view rate | [ ] |

**If something breaks during the hour:** see the incident table in §9.2. Never delete the trailer or the thread. Fix forward with a reply.

---

## 5. Later that day: three quote posts

All three quote the **trailer post**, so every new audience lands on the pinned post with the link thread under it. None carries a link. That keeps them clean for the cold-start audition, and the link is one tap away in the quoted post.

**Hold rule for QT-2 (the flex slot).** At 6:00 p.m., look at the trailer's and COMM-1's view curves. If either is still clearly climbing, **don't post QT-2 as a quote**. Post its text as a self-reply under the trailer instead (the "making-of" self-reply pattern in AI_VIDEO_NOTES §1.3), so it doesn't compete with them in followers' feeds (author-diversity decay, CT_PLAYBOOK §3.3).

### QT-1 · 1:30 p.m. ET · "this part isn't fake" · `229/280` · video: `launch-10`

```text
the trailer is fake. this part isn't.

screen recording of the actual app, no ai: a sim launch getting rugged in real time. bundler sell. dev sell. floor.

the audit was red before the chart was.

sim market · paper trading · nfa
```

Ledger: SC-04, SC-09, SC-18, SC-25, FB-13, DIS-02. **Only post the last line if the clip shows it**: the audit panel already red before the candles drop. Otherwise cut that line. Video description (306 chars):

```text
Screen recording of Trenchscope on a simulated market, not AI. A fictional token's chart runs on 1-second candles while the audit panel shows red rows. Bundler sell and Dev sell signals appear, then the candles collapse to the floor. Captions are burned in, and a SIM · PAPER TRADING stamp stays top-right.
```

### QT-2 · 6:15 p.m. ET · the making-of · `269/280` · image: `launch-11`

```text
how a paper-trading app ended up with a war movie trailer:

[N] stills. [N] video generations. [N] kept. no real people, coins or money.

every ui shot is a screen recording of the actual app. every trench, flare and yanked carpet is ai. the app itself has no ai in it.
```

Ledger: MNC-07 (the product has no AI), MNC-23, DIS-07 meaning. **Fill each `[N]` from the real generation logs**, or delete the line. Never estimate. Alt text (325 chars):

```text
A three-panel making-of card for Trenchscope's AI-generated trailer. Left: an AI-generated still of a trench at night under amber flares, labelled ai-generated. Middle: the same shot animated. Right: the final graded frame with a title card. A row underneath gives the real counts of stills, video generations and clips kept.
```

### QT-3 · 8:30 p.m. ET · Asia re-push · `271/280` · video: `launch-2` (9:16 cut)

```text
gm asia. here's the vertical cut.

the trenches never close and neither does the sim: launches, migrations and rugs on 4 simulated chains, around the clock. bring nothing, lose nothing real.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

Ledger: SC-04, SC-06, DIS-07. It's a re-framed cut with new words, not a bare repost (CT_PLAYBOOK §5.3). Turn the AI label on again. Paste the trailer's video description (§2) if the field is offered.

---

## 6. Community prompt: "reply with your worst rug" (4:00 p.m. ET)

A standalone original. **No prizes, no "best reply wins", no follow or RT asks.** Incentivised posting is banned (CT_PLAYBOOK §3.9) and off-brand.

### COMM-1 · `219/280` · image: none (optional `launch-12`)

```text
reply with your worst rug.

no tickers, no cas, no names. just what happened: when you bought, what the chart did, what you missed.

we'll answer as many as we can with the tell, and what it looks like on our sim board.
```

### COMM-1r · self-reply, posted 1 minute later · `158/280`

```text
psa for this thread: nobody can recover rugged funds. anyone in these replies offering to is the next rug.

we never dm first, and nobody dms "on our behalf".
```

Rug stories attract "fund recovery" scammers within minutes. Hide, report and block them all. If `launch-12` is used, its alt text (234 chars):

```text
AI-generated still: in a dark hall lit by one amber spotlight, an ornate carpet is yanked from under a long table and blank, unbranded metal discs fly into the air. Text overlay: "reply with your worst rug." Credit line: ai-generated.
```

### 6.1 How to answer the replies

- **Write every answer fresh.** The table below lists the angles, not the text. Duplicate replies get labelled `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4).
- **Talk mechanisms, never people.** Don't call a real token, dev or KOL a scammer. Don't confirm guesses about who did it. If someone names a real project, answer in general terms.
- **No advice and no hindsight shaming.** Never "you should have". The tone: "the tell here is usually X".
- **No link in any of these replies.** Each reply @-mentions a stranger, and links in posts that mention non-followers trip a low-quality-URL rule (CT_PLAYBOOK §3.4). If someone asks for the app, point them to the pinned post.
- **Show, sometimes.** For about 1 in 5 answers, attach a fresh sim screenshot of the matching chip or signal, with the SIM bug on it and a new crop each time.
- Answer as many as you honestly can, then stop. "As many as we can" is the promise. Don't fake coverage.

| What they describe | The usual tell | Where it shows in the sim (ledger) |
|---|---|---|
| Vertical candle, then −90% in a minute | Bundled launch; supply grabbed in the creation block | Bundlers row + Bundler sell signal (SC-09, SC-18, SC-21) |
| "Dev sold everything" | Dev dump | Dev status chip (sold part / sold all), Dev sell signal, dev-sell exit (SC-26, SC-18, SC-14) |
| "Couldn't sell" | Honeypot or high sell tax (EVM-style chains) | Honeypot and tax rows on the EVM sim chains, plus the risk gate (SC-09, SC-08) |
| Bled out over hours or days | Slow rug: dev or insiders trickling out | Dev holding over time, insiders row, top-10 share (SC-09, SC-26) |
| Graduated, then dumped | Post-migration dump. Use KS-02 only if hedged ("~73%", "within 20 min", "in one dataset") | Migrated column, migration-sell exit (SC-07, SC-14) |
| "A caller posted it, then it dumped" | Caller exit. Mechanism only, never the person | KOL tags in Activity and Monitor. There is **no KOL-sell signal** in the app, so don't claim one (SC-19, SC-24) |
| "My fill was way worse than the quote" | Sandwich bot or price impact | Anti-MEV toggle, MEV loss in the fill toast, price-impact warning (SC-13, SC-11) |
| "The volume was fake" | Wash trading | Wash-trading row, "hide wash trading" filter (SC-28, SC-29) |
| "40 holders, all brand-new wallets" | Fresh-wallet cluster | Fresh wallets row (SC-09) |
| "I bought the wrong one" | Copycat | Copycat badge and "hide copycats" filter. Say "flags", never "detects" (SC-27) |

---

## 7. Day +1: Wed Oct 28

| ET | Post | Asset |
|---|---|---|
| 10:00 a.m. | **D1-A** rug autopsy | `launch-13` |
| 1:30 p.m. | **D1-B** guess the fate | `launch-14` |
| 7:30 p.m. | **D1-Br** reveal (self-reply to D1-B) | `launch-15` |
| 8:30 p.m. | **D1-C** worst-rug recap | none |

Replies: 30–60, hand-written. Keep the trailer pinned.

### D1-A · rug autopsy · `274/280` · video: `launch-13`

```text
rug autopsy: one sim launch, mint to floor, in [22] seconds.

[0:03] bundled in the creation block
[0:08] snipers right behind
[0:15] bundler sell
[0:19] dev sell
[0:22] floor

the audit and signals saw it first. the chart was last to know.

sim market · paper trading · nfa
```

Ledger: SC-09, SC-18, SC-21, SC-25, FB-13. **Fill in the timestamps from the actual clip.** If the order of events differs, rewrite the lines to match. Never stage it. If the clip is shown faster than real time, label the speed on screen and in the post. Video description (235 chars):

```text
Screen recording of one fictional token on Trenchscope's simulated market, from launch to collapse. Captions mark each moment: bundled in the creation block, snipers, bundler sell, dev sell, floor. SIM · PAPER TRADING stamp throughout.
```

### D1-B · guess the fate · `227/280` · image: `launch-14`

```text
guess the fate.

a launch from our sim, captured at 2 minutes old. we already know how it ends.

graduates, rugs, or dies quietly? reply with your call and your reason. reveal + replay tonight.

sim market · paper trading · nfa
```

Record the launch first and post it afterwards. That's why the copy says "captured" and "we already know". Blur the ticker and name in the image (sim tickers can collide with real coins, CLAIMS_LEDGER §7.6). Alt text (299 chars):

```text
Token page from Trenchscope's simulated market for a fictional launch at 2 minutes old, with its name and ticker blurred. The bonding-curve progress bar, the first candles and the audit panel with its risk rows are visible. SIM · PAPER TRADING stamp top-right. The fate of this sim launch is hidden.
```

### D1-Br · the reveal (7:30 p.m., self-reply to D1-B) · `259/280` · video: `launch-15`

```text
the reveal: [graduated / rugged / died quietly].

the tell: [one line, e.g. bundlers held 49% from the creation block and the dev sold at minute 6].

in the sim, every launch's fate is scripted at mint. that's why we can play this game honestly. replay below.
```

Ledger: SIM-01 context (fates are scripted in `apps/server/src/sim/behaviors/fate.ts`), SC-04. Before posting, reply to the best guesses in fresh words. Never shame the wrong ones.

### D1-C · worst-rug recap · `250/280` · image: none

```text
yesterday we asked for your worst rugs. sorted by tell:

most common: [tell]
runner-up: [tell]
the one that hurt to read: [paraphrase, no names]

every one of these has a chip, row or signal in the sim. practice spotting them where the money is fake.
```

**Rules:**
- Fill it from the actual replies.
- Paraphrase only, with no handles, quotes or project names unless the person agrees.
- **No reply counts**: no traction numbers, even real ones (MNC-05).
- Only keep "every one of these has a chip, row or signal" if each tell you list appears in the §6.1 table. Otherwise write "most of these".
- **If COMM-1 drew too few replies**, skip D1-C and post a POV meme instead (format 1 in CT_PLAYBOOK §1.3).

---

## 8. Day +2: Thu Oct 29

| ET | Post | Asset |
|---|---|---|
| 10:00 a.m. | **D2-A** micro-thread: the life of a launch (5 posts + a source reply) | `launch-16` on post 1 |
| 1:30 p.m. | **D2-B** poll: where your worst rug happened | none |
| 8:30 p.m. | **D2-C** POV meme (or **D2-Calt** "shipped:" if a real change shipped) | `launch-17` |

### D2-A · trench dictionary micro-thread (real-market stats: re-verify each one before posting)

**Every real-market number here is AMBER** (CLAIMS_LEDGER §4.2). The owner re-checks each against a public dashboard or primary post the day before, keeps the "~", the time window and "one launchpad / major launchpads", and fills in `[month]` in the source reply. If one can't be verified, cut that sentence. **One stat per post.**

**D2-A1** · `220/280` · image: `launch-16` · KS-04

```text
the life of a memecoin launch, in 5 stages. most never see stage 3.

1. mint. anyone can launch a coin on a bonding curve in seconds. on one launchpad this year, that's been somewhere between 27k and 50k new coins a day.
```

**D2-A2** · `225/280` · KS-01 (never "rugs" or "scams")

```text
2. the curve. a vending machine that raises the price every time someone buys. when it fills, the coin "graduates".

lately, ~97 of every 100 launches on major launchpads never get there. most aren't rugs. they just go quiet.
```

**D2-A3** · `167/280` · KS-06 (the 2025 sample is labelled as 2025)

```text
3. migration. the curve fills and liquidity moves to a real pool.

when it happens, it's usually fast: in one 2025 sample, the median graduate got there in ~5 minutes.
```

**D2-A4** · `156/280` · KS-02

```text
4. the first 20 minutes. in one dataset, ~73% of graduates were down 60%+ within 20 minutes of migrating.

surviving the curve is not the same as surviving.
```

**D2-A5** · `210/280` · SC-04, SC-07, DIS-02

```text
5. where we come in. trenchscope runs this whole lifecycle as a sim: new → near grad → migrated, rugs, snipers and bundlers included. watch it play out with fake money first.

sim market · paper trading · nfa
```

**D2-A6** · source reply · DIS-03 · `146/280`

```text
source for the real-market numbers: launchpad lifecycle data, [month] 2026 (secondary). approximate. the stage-3 median is from a sep 2025 sample.
```

`launch-16` alt text (387 chars):

```text
Diagram card titled "the life of a launch": five stages left to right, mint, bonding curve, migration, first 20 minutes, and after. The curve stage notes that about 97 of 100 launches on major launchpads lately never graduate; the first-20-minutes stage notes about 73% of graduates down 60% or more in one dataset. Footer: real-market figures from secondary lifecycle data, approximate.
```

### D2-B · poll · `41/280` · 24 hours

```text
where did your worst rug actually happen?
```

Options (each ≤ 25 characters): `on the bonding curve` (20) · `right after migration` (21) · `slow bleed, days later` (22) · `couldn't sell (honeypot)` (24).

It follows on from COMM-1. Only post it if no poll went out on Oct 26 or later (cadence: at most one poll every 2–3 days).

### D2-C · POV meme · `76/280` · image: `launch-17`

```text
pov: you turned anti-mev off to save 150ms

sim market · paper trading · nfa
```

Ledger: SC-13 (anti-MEV adds +150 ms of simulated latency, and public-mempool trades can be sandwiched). Alt text (321 chars):

```text
Trenchscope trade panel on a simulated market with the preset showing anti-MEV off, and a fill toast for a large paper buy on a migrated pool that reads Bought, then the amount, price and latency in ms, ending with an MEV loss in SOL. SIM · PAPER TRADING stamp top-right. Paper trade; the token is a fictional sim entity.
```

### D2-Calt · "shipped:" (only if this change really shipped) · `214/280` · image: before/after crop of the Trenches header

```text
shipped: the trenches header used to say "live launchpad tokens on solana". it's a sim, so now it says so.

small thing. but if a label can't be checked, it shouldn't be on screen.

sim market · paper trading · nfa
```

Post this only if the rename from §1.1 shipped. Change the quoted strings to match the real before and after. Never post a "shipped:" for something that isn't live (MNC-12, MNC-13).

---

## 9. Answer kit and incident playbook

### 9.1 Answer kit: points to make, never paste text

| They ask | Make these points (in new words every time) | Never say |
|---|---|---|
| "is this real money?" / "which chain is it on?" | No. It's a simulated market: 4 sim chains (Solana, BNB Chain, Base, Ethereum), fictional launchpads, paper balances. Nothing to connect | "trade on solana", "deposit", "mainnet" (MNC-01) |
| "wen token / airdrop / points?" | Never. No token, no airdrop, no presale, and points stay in the app. Point to FAQ-L1 | "soon", "stay tuned", "early users rewarded" (MNC-02) |
| "will you add real trading?" | v1 is a sim, and we're not promising anything beyond it | "coming soon", "mainnet soon" (MNC-13) |
| "is it ai?" / "ai slop" | The trailer is AI-generated and labelled. The app has no AI. QT-1 is a plain screen recording | "AI-powered", "AI signals" (MNC-07) |
| "how accurate is the smart money tag?" | It's earned from behaviour in the sim (entries that later 2x'd, tested against a base rate, plus a profitable book). No accuracy numbers | Any percentage, "detects", "predicts" (MNC-06) |
| "can I copy wallets / snipe?" | Yes, on paper: copy tasks with your own size and exits, snipers for new launches, a dev's next launch, or migrations | "copy smart money and win" (MNC-04) |
| "phone app?" | Web only. It has a phone layout in the browser, with no app or extension to install | "download the app" (MNC-12, MNC-21) |
| "first / only paper-trading terminal?" | Don't claim it. Talk about what it does | "first", "only" (MNC-09) |
| "better than [other terminal]?" | Don't compare. Describe our feature | Any competitor name or fee comparison (MNC-10) |
| "is [real token CA] a rug?" | No verdicts on real tokens. Explain which tells to look at, in general terms | "that's a rug", "buy", "sell" (financial advice) |
| "it's just a larp" | Yes. That's the product. Agree, and enjoy it | Getting defensive |
| "who built this? / pricing?" | Owner to decide. Don't invent team, pricing or backers | "backed by", "team from X" (MNC-05) |

### 9.2 Incident playbook

| Situation | Do | Don't |
|---|---|---|
| Site slow or down | Reply to T1 with a fresh, plain status note ("getting hugged, back shortly. it's paper either way"). Fix and restart, since the sim refills the boards on boot. Reply again when it's back | Delete the thread or repost the trailer |
| Visitors get "too many new accounts from this address" | `TRUST_PROXY` isn't set behind the proxy (§1.1). Fix it now | Raise the cap without fixing the proxy |
| A "trenchscope" token appears on a real launchpad | Post a fresh standalone warning: there is no trenchscope token, anything using the name is a scam. Reply under the trailer too. Report the promoting accounts | Post or quote the scam's CA or posts (it amplifies them) |
| An impersonator account or scam DMs | Report and block. Post a fresh DIS-09 reminder. Keep the pinned FAQ visible | Engage, or DM people first |
| Scam replies (airdrop, "support", fund recovery) | Hide, report and block. Do it in batches every 10–15 minutes | Reply to them with a link |
| The trailer gets an AI or altered-media label | Good. That's the disclosure working. Leave it | Argue with it or re-upload without it |
| Under the Hood shows a label | Stop following for 48 h and keep posting normal originals. Check every link is direct `https` on the owner's own domain | Create a new account, or delete posts in bulk |
| The trailer underperforms (under about 200 views at 2 h) | Keep the schedule. QT-1 and COMM-1 carry the day. Re-cut the idea with new words 48 h or more later | Delete and repost (duplicate filter, 48 h cutoff) |
| Wrong `[LINK]` in T1, T9 or T10 | If X's edit window is still open (Premium), edit the link. Otherwise reply to that post with the correct link | Delete the thread |
| A big account quotes or dunks on the trailer | One fresh, good-humoured reply that agrees it's a larp. Then let it run | Reply-war, tag people, ask for reposts |

---

## 10. Assets needed

All screenshot assets: build with `marketing/tools/screens.py` from the 4K sources in `marketing/screens/` or from new captures. Every image gets the permanent `SIM · PAPER TRADING` corner bug, the Trenchscope lockup bottom-right and **at most two** amber callouts. Blur or rename "+ Deposit", "Live launchpad tokens on Solana" and "Money Printer" (§1.1). Blur KOL @handles and sim social links in close-ups. **Use new crops and new callouts**, not the warm-up images in `marketing/x/posts/`, so launch posts don't repeat the pinned or warm-up visuals. Any PnL or balance that's visible as a hero number gets `SIMULATED · PAPER TRADE` burned in (DIS-04).

| Ref | Used in | Size / format | Source | Concept | Headline (burned in) | Subtext |
|---|---|---|---|---|---|---|
| `launch-1` | Trailer post | 1920×1080 MP4, H.264, 30 fps, 8–12 Mbps, AAC, 30–45 s | Video plan (AI keyframes + Kling I2V + real-UI inserts) | War-epic trailer parody for a paper-trading terminal. Beats per AI_VIDEO_NOTES §3.2: cold open, world, real-UI reveal, archetype roll-call, rug, title, button | Frame 0: `IN A WORLD WHERE THE DEV ALWAYS SELLS` | End card (DIS-06): `AI-generated dramatization. Fictional people, tokens and events.` / `Trenchscope is a simulated market with paper trading only. No real funds. No token. Not financial advice.` + `AI-generated · dramatized · paper trading only · @trenchscope` |
| `launch-2` | QT-3 | 1080×1920 MP4, 20–30 s | Re-framed or re-generated from the master, not letterboxed | Vertical cut. Opens on the real Trenches board (SIM bug), then hard-cuts to the war epic | `THIS IS A TRADING APP.` | Same end card as `launch-1`. Cards clear of the bottom 20% and the right action column |
| `launch-3` | T3 | 1600×900 PNG | `screens/screen-trenches.png` (new crop: Near graduation + Migrated columns) | The board: lifecycle columns with curve rings and risk chips | `new → near grad → migrated` | `curve ring + risk chips on every card` |
| `launch-4` | T4 | 1080×1350 PNG (4:5) | `screens/screen-token-holders.png` (audit panel + holders table with "Funded by") | The audit row by row, plus who funded whom (callouts on the bundlers row and the "Funded by" column) | `the audit, row by row` | `simulated audit — reference only` |
| `launch-5` | T5 | 1200×1200 PNG | **New capture**: try to buy a high-risk sim token so the dialog opens, checkbox unticked | The risk gate: reasons listed, tick-to-enable "Buy anyway" | `it asks first` | `tick the box before "buy anyway" lights up` |
| `launch-6` | T6 | 1600×900 PNG | `screens/screen-monitor.png` (new callouts: the wallet-tag column and the Hot by smart money panel) | Every wallet labelled; smart money moving live | `every wallet labelled` | `smart money · kol · sniper · bundler · insider · dev · whale · fresh · bot` |
| `launch-7` | T7 | 1200×1200 PNG | **New capture**: trade panel Auto tab with TP, SL, trailing and a dev-sell exit set, plus the Orders tab | Exits on autopilot | `dev sells, you sell` | `tp · sl · trailing · dev-sell exit · paper` |
| `launch-8` | T8 | 1600×900 PNG, two panels | Left: quote preview from `screens/screen-token-holders.png`. Right: **new capture** of a fill toast with `MEV −…` (anti-MEV off, large buy on a migrated pool) | The full cost, before and after | `full cost, before and after` | `simulated 0.8% platform fee · fees in your pnl` |
| `launch-9` | T9 | 1200×1200 PNG | **New capture**: Sign in → Quick start tab (SIM banner, 4-chain balance grid, Start paper trading) | One click, four paper wallets | `one click. 4 paper wallets.` | `50 SOL · 15 BNB · 3 ETH (Base) · 3 ETH — all paper` |
| `launch-10` | QT-1 | 1920×1080 MP4, 18–25 s, burned-in captions | **New screen recording** (or a cut of `video/app-footage/app-token-chart.mp4` + `app-signals.mp4` if they show a rug): a sim launch with the audit red, Bundler sell + Dev sell signals, candles to the floor. Footer in frame | Real UI, no AI: a rug in real time | `SCREEN RECORDING. NO AI.` | `a sim launch, rugged in real time · SIM · PAPER TRADING` |
| `launch-11` | QT-2 | 1600×900 PNG | `tools/cards.py` from 3 real frames of the trailer pipeline | Making-of: AI still → animated shot → final frame with card | `how the larp got made` | `[N] stills · [N] video generations · [N] kept` (real counts only) · `ai-generated frames, real app inserts` |
| `launch-12` | COMM-1 (optional) | 1600×900 PNG | Trailer keyframe K6 "The Rug" (AI) + type in post | Carpet yanked from under a table of blank discs | `reply with your worst rug.` | `ai-generated` |
| `launch-13` | D1-A | 1080×1350 MP4 (4:5), 15–25 s | **New screen recording**: chart + audit crop of one sim launch from mint to floor | Rug autopsy with timestamped captions | `RUG AUTOPSY` | `one sim launch, mint to floor · SIM · PAPER TRADING` |
| `launch-14` | D1-B | 1600×900 PNG | **New capture** of a sim launch at about 2 min old, ticker and name blurred | Guess the fate (recorded first, posted after) | `GUESS THE FATE` | `graduates, rugs, or dies quietly?` |
| `launch-15` | D1-Br | 1080×1350 MP4, 15–25 s | Recording of the same launch through its outcome; speed labelled if accelerated | The reveal and replay | `THE REVEAL` | `replay · [N]× speed · SIM · PAPER TRADING` |
| `launch-16` | D2-A1 | 1600×900 PNG | `tools/cards.py` (stat template), no AI | Five-stage launch lifecycle with hedged real-market stats | `the life of a launch` | `real-market figures: secondary lifecycle data, approximate` |
| `launch-17` | D2-C | 1200×1200 PNG | **New capture**: preset showing anti-MEV off + fill toast with `MEV −…` (a different crop from `launch-8`) | The sandwich, on paper | `anti-mev: off` | `fill toast shows the sandwich · SIM · PAPER TRADING` |

---

## 11. Metrics to log (internal only, never posted)

Log in a private sheet. **None of these numbers is ever posted or used as traction** (MNC-05).

| When | Trailer views | Likes ÷ views | Replies | Quotes | Bookmarks | Profile visits | New follows | Link clicks (T1/T9/T10) | Video: avg watch / completion | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| T+30 min | | | | | | | | | | |
| T+60 min | | | | | | | | | | |
| T+2 h (audition closes) | | | | | | | | | | |
| 6:00 p.m. (QT-2 hold check) | | | | | | | | | | |
| T+24 h | | | | | | | | | | |
| T+48 h | | | | | | | | | | |

Also log per post: QT-1, COMM-1, QT-2, QT-3 views and likes ÷ views at 2 h, plus server-side quick-start count and error or 429 count per hour. Compare likes ÷ views against the cold-start prior of about 1.5% (CT_PLAYBOOK §3.3). Use your own data, not blog rules of thumb, to set next week's windows.

---

## 12. Claims map and final check

| Post | Claims it relies on | Disclaimer carried |
|---|---|---|
| TR-A/B/C | SC-01, SC-04, MNC-23 | DIS-07 (+ X AI label) |
| T1 | SC-01, SC-04, SC-06, SC-37 | DIS-02 |
| T2 | SC-04, SC-05, SIM-03 ("tuned to") | (thread: DIS-02 in T1) |
| T3 | SC-07, SC-30 | DIS-11 via FAQ-L2; SIM bug on image |
| T4 | SC-09, SC-10 | SIM bug; "simulated audit — reference only" in frame |
| T5 | SC-08 (+ checkbox, `useTradeExecutor.tsx:71-109`) | SIM bug |
| T6 | SC-19, SC-20, SC-21, SC-24 | "in the sim" in copy; SIM bug |
| T7 | SC-14, SC-15, SC-16, SC-17, SC-13 | "all paper" in copy |
| T8 | SC-11, SC-12, SC-13, SC-32 | "simulated" fee; SIM bug |
| T9 | SC-02, SC-03, SC-37 | "all paper" |
| T10 | — | DIS-12 |
| FAQ-L1 / L2 | SC-35 | DIS-08, DIS-09, DIS-10, DIS-11 |
| QT-1 | SC-04, SC-09, SC-18, SC-25 | DIS-02, DIS-05 in clip |
| QT-2 | MNC-07 (no AI in product) | AI disclosure in copy and card |
| QT-3 | SC-04, SC-06 | DIS-07 |
| COMM-1 / r | — | DIS-09 meaning |
| D1-A, D1-B, D1-Br | SC-09, SC-18, SC-21, SC-25, SIM-01 | DIS-02, DIS-05 |
| D1-C | §6.1 mapping | — |
| D2-A1…A6 | KS-04, KS-01, KS-06, KS-02, SC-07 | DIS-03 (source reply), DIS-02 |
| D2-B | — | — |
| D2-C / D2-Calt | SC-13 / a real shipped change | DIS-02 |

**Before each post, the 10-second check:**
- No link outside T1, T9 and T10.
- No hashtag, cashtag or @-mention.
- No token talk, profit talk, competitor or real person.
- Every number is either from the app (and labelled sim) or a hedged KS-xx with its source in a reply.
- Every image carries the SIM bug, and every AI asset is labelled.
- The text is new: not pasted from another post or reply.
