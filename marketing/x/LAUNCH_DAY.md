# Launch day kit: "it's live" day, L+1 and L+2

| | |
|---|---|
| **For** | The owner/operator of the brand account on launch day (the day after warm-up Day 7) and the two days after it, L+1 and L+2 |
| **The gate** | **Everything in this file is gated: post it only once real trading works on every chain the post names** (POSITIONING "What we never do"; ledger rules 1–2, MNC-01). The owner runs the gate in §1.1 at 9:00 a.m. ET. If it fails, nothing here posts, the Day-1 pin stays up, the website field stays blank, and the whole schedule moves to the next day |
| **What goes out** | **Launch day:** the re-cut trailer (native video, link-free caption) with the thread T1–T10 as self-replies (`[LINK]` in T1 only), a safety reply (SAFE-L1), three quote posts (QT-1 "the trailer is AI. the terminal isn't.", QT-2 making-of, QT-3 Asia re-push with the 9:16 cut) and the "worst rug" prompt (COMM-1). **L+1:** rug autopsy on demo data, guess the fate (demo data) and its reveal, the worst-rug recap. **L+2:** the life of a launch (AMBER stats), a poll, a POV meme |
| **Placeholders** | `@trenchscope` (handle not confirmed) and `[LINK]` (the owner's own domain over `https`: no shortener, no redirect chain, no link-in-bio aggregator; UTM parameters on the direct URL are fine). Brackets such as `[n]`, `[0:03]` or `[tell]` are filled from the real asset or the real replies, then re-measured |
| **Rules come from** | `research/POSITIONING.md` (the binding brief), `research/CLAIMS_LEDGER.md` (claim IDs, never-say list, disclaimers, owner checks), `x/TODAY.md` (the approved Day-1 kit), `brand/BRAND_GUIDE.md` (voice, disclaimer placement, visuals), `research/CT_PLAYBOOK.md` (ranking, cadence, spam rules), `research/AI_VIDEO_NOTES.md` (trailer craft), `x/PROFILE.md` (pin plan, the website gate, settings, impersonation watch). If this file disagrees with POSITIONING or the ledger, they win and this file gets fixed |
| **Trailer** | The re-cut *Field Guide to the Trenches, EP.01* specified in `video/SCRIPT.md`: the approved AI clips, new app shots captured in marketing capture mode, and one new VO take. SCRIPT owns the cut and its on-screen lines; this file owns the posting copy |
| **Assets** | Refs `launch-1` … `launch-18`, specified in §10 |
| **Schedule** | No dates anywhere. Days are Launch day, L+1 and L+2. Times are ET |

**Disclaimers** (exact text from ledger §6; never reworded):

| ID | Text | Count | Where in this file |
|---|---|---|---|
| **RISK** | `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` | 92 | The last line of **every post that shows, names or links the product**: the trailer caption, T1–T10, QT-1, QT-3, L1-A, L1-B, L1-Br, L2-A5, L2-C, L2-Calt. That leaves **186** characters before it. Left off only the posts that say nothing about the product or trading: SAFE-L1, COMM-1, COMM-1r, QT-2 (how the video was made), L1-C, L2-A1–A4, L2-A6 (the source), the L2-B poll and the WARN posts |
| **CUSTODY** | `we will never DM you first, ask for your seed phrase, or ask you to send funds.` | 79 | Verbatim in **T9** (one thread post, ledger §6) and in WARN-1. SAFE-L1, COMM-1r and replies say it in fresh words |
| **DEMO** | `UI shown with demo data` | 23 | Burned into **every** product frame (corner label, legible on a phone) and written into the alt text |
| **AI** | `AI-generated` | 12 | Burned into every AI frame. X's **"Made with AI"** label on at posting. Alt text starts with "AI-generated" |
| **CHAINS** | `not affiliated with any chain, launchpad or exchange named.` | 59 | The trailer end card (and the website footer) |
| **STAT** | `source: launchpad lifecycle data (secondary). approximate, and it moves month to month.` | 87 | The first reply of the L+2 stats thread (L2-A6) |

**Counts** are X-weighted and measured with `xlen.py` (JSON `{name: text}`). `·`, `—` and `–` count 1; `→`, `…` and emoji count 2. **Every URL counts 23 on X, so `[LINK]` was measured as a 23-character stand-in.** Bracketed fields are measured at the fill length noted next to them. Every post is ≤ 280, so none needs "Show more".

**RISK repeats verbatim** in about a dozen posts on launch day, because the ledger forbids rewording it. Everything else in each post is unique, so X's duplicate-text rules (which compare whole posts, CT_PLAYBOOK §3.4) shouldn't cluster them. Check Under the Hood at T+60 anyway (§4).

**Time zones in launch week.** The US is on summer time and Europe on winter time, so **UTC = London = ET + 4 h**, **Berlin = ET + 5 h**, **Singapore = ET + 12 h**. If launch slips past the US clock change, add 1 h to every non-ET column.

---

## 0. The day at a glance

| ET | UTC / London | Berlin | SGT | Post | Type | Asset |
|---|---|---|---|---|---|---|
| 9:00 a.m. | 13:00 | 14:00 | 21:00 | **Launch gate** (§1.1). No go → stop here | Owner check | — |
| **10:00 a.m.** | 14:00 | 15:00 | 22:00 | **Trailer** + thread T1–T10. Pin the trailer. 10:03: SAFE-L1 | Original + self-replies | `launch-1`, `launch-3` … `launch-9` |
| 10:00–12:00 | | | | Reply to every reply. Scam sweep every 15 min. No other originals, no quoting yourself | Replies | — |
| **1:30 p.m.** | 17:30 | 18:30 | 01:30 (+1 day) | **QT-1**: "the trailer is AI. the terminal isn't." | Quote of the trailer | `launch-10` |
| **4:00 p.m.** | 20:00 | 21:00 | 04:00 (+1 day) | **COMM-1**: "reply with your worst rug" + COMM-1r | Original | none (optional `launch-12`) |
| **6:15 p.m.** | 22:15 | 23:15 | 06:15 (+1 day) | **QT-2**: making-of (flex slot, hold rule in §5) | Quote of the trailer | `launch-11` |
| **8:30 p.m.** | 00:30 (+1 day) | 01:30 (+1 day) | 08:30 (+1 day) | **QT-3**: Asia re-push, 9:16 cut | Quote of the trailer | `launch-2` |
| 10:00 p.m. | 02:00 (+1 day) | 03:00 (+1 day) | 10:00 (+1 day) | Last scam sweep, end-of-day log (§11) | — | — |

Five originals, each at least 2 h 15 min apart, so no two land in the same 2-hour block and none fights the trailer in followers' feeds (author-diversity decay, CT_PLAYBOOK §3.3, §5.3). The thread and SAFE-L1 are self-replies, not originals. 4:00 p.m. ET (20:00 UTC) sits on the daily peak of launch activity, when the trench crowd is online (CT_PLAYBOOK §5.1).

**Post everything on launch day natively in X's composer, not through Metricool** (PROFILE §11.2): launch-day posts are gated, so a person posts them at the moment the gate passes, with native upload quality, X's "Made with AI" label, alt text and control of the reply chain. L+1 and L+2 originals may be queued in Metricool for owner review once the gate has passed. Before approving each one, search it for a URL, any date and the word "live".

---

## 1. Before you post

### 1.1 The launch gate (9:00 a.m. ET, owner). All ticked, or nothing posts

From ledger §8 and PROFILE §6.2. Tick against the **live build**, not staging. The code in this repo is still the simulator build (ledger §1), so every product claim below is checked on the live product.

- [ ] **C-1 Chains, one tick per chain:** Solana [ ] · Base [ ] · BNB Chain (BSC) [ ] · Ethereum [ ] · Robinhood Chain [ ]. Real buys and sells execute on each. A chain that fails comes out of **every** post here, the bio and the header that morning (PROFILE §5, §7). Four-chain variants (no Robinhood Chain, the one chain in no file of the code) are pre-measured for TR-B, T9 and QT-3. Any other combination: rewrite the chain list and re-measure.
- [ ] **K-1 Custody:** users hold their keys and the team never touches funds. TR-A/B/C, T9, T10 and the bio depend on it.
- [ ] **K-2 Automated trades:** how limit orders, auto exits (TP/SL/trailing/dev-sell), copy trades and sniper tasks sign in the live build, given they run server-side in the code (`apps/server/src/trading/orders.ts`, `copytrade.ts`, `sniper.ts`; the Auto tab itself says "Exit orders are created from your fill price and run server-side", `apps/web/src/components/token/trade/AutoForm.tsx:112`). If they use delegated or session keys, the owner rewrites T9's "you keep your keys" and checks T5 and T8 before anything posts. No answer → T5 and T8 don't post, and T9 drops "you keep your keys. so:" and keeps the CUSTODY line on its own.
- [ ] **F-1 Features** in the live build, on real chain data, for each post that names them: the board (T1), the tags (T2), the audit and funding links (T3), the risk prompt (T4), auto exits and the dev-sell exit (T5), the quote with fees (T6), hotkeys (T7), copy trade, sniper tasks, signals, alerts and the monitor (T8). A missing feature comes out of its post (re-measure) or the post is skipped.
- [ ] **F-2 KOL source:** the KOL row on `launch-3` goes in only if the live build has a real KOL source and a labelling policy (MNC-15). No post here names KOLs.
- [ ] **F-3 Risk-prompt scope:** if quick buy now goes through the risk prompt, post **T4-F3**. If not, post **T4** ("from the trade panel").
- [ ] **F-6 Sim wording:** the live build shows no "paper", "simulated", "faucet" or guest-balance wording, and the risk prompt's subtitle is final.
- [ ] **Fees:** the real fee shows in the quote before every trade (T6). No fee number goes in any post (SC-12).
- [ ] **L-1 Legal:** the rules for promoting a crypto trading product are checked for the markets we reach, with geo-blocking or the required warnings in place. The UK, for example, has a specific regime. If counsel requires different warning wording, it replaces RISK everywhere and every count here is re-measured.
- [ ] **D-1 Domain and handle:** confirmed and owned. `[LINK]` is the owner's domain.
- [ ] **T-1 Token:** the owner has decided what we say about a token, if anything. It decides which fake-token warning is allowed (WARN-Ta or WARN-Tb, §9.2).
- [ ] **Under the Hood** (`x.com/i/jf/under_the_hood`): no labels on the account or the warm-up posts.

**If the gate passes late:** before 11:00 a.m. ET, shift the whole run sheet by the delay and keep the gaps between posts. After 11:00 a.m., launch the next morning. Don't launch in the evening to catch up: the trailer needs the 10:00 a.m.–12:00 p.m. ET reply window (the cold-start audition, CT_PLAYBOOK §3.3).

**If it fails:** nothing here posts. Replies carry on as in the warm-up: no "live", no date, no "soon" (MNC-01, MNC-13).

### 1.2 Product and site blockers (the evening before, re-checked at 9:00)

- [ ] **`[LINK]` resolves** over `https` with no shortener or redirect hop. Open it logged out on a phone and on a desktop.
- [ ] **The landing page** shows RISK near every call to action and CHAINS in the footer, names the same chains as the bio, and has no "paper", "simulated", "faucet", profit words or dates (PROFILE §6.2).
- [ ] **The link card is honest.** Paste `[LINK]` into an X draft (don't post it) and read the preview. The title and description call it a trading terminal and contain no "earn", "profit", "safe", "guaranteed", no sim wording, and no chain that failed C-1. The image has no chain logos. The domain on that card is the one people learn today, and the one impersonators will copy.
- [ ] **End-to-end on the live build**, in a fresh browser, with the owner's own small funds: onboarding and wallet setup (it decides T10's step 2) → a buy and a sell on each chain named → a trade-panel buy on a high-risk token opens the risk prompt (cancel it) → arm a dev-sell exit → the quote shows fees before you confirm. If any step looks different from what a post says, fix the post.
- [ ] **Capacity.** Load-test the live stack. In this repo, per-IP account creation is capped by `ACCOUNT_CREATIONS_PER_IP` and needs `TRUST_PROXY=1` behind a proxy or CDN (`apps/server/src/app.ts:37-38`); without it every visitor shares the proxy's IP and gets locked out after the cap. Confirm the live build's equivalent.
- [ ] **A support path that isn't our DMs.** Decide where users get help (`[SUPPORT]`: a help page on the domain, or a reply to the pinned thread). The answer kit (§9.1) points there. We never DM first.
- [ ] **Look-alike domains.** The owner checks obvious typos of the domain (and may register a few). Keep the abuse-report steps in §9.2 open in a tab.
- [ ] **In-app strings** (ledger §7, PROFILE §13 item 6): rename the "Safe" and "Safe contract" presets and the anti-MEV tooltip's "no sandwich attacks" before captures if you can; otherwise keep them out of close-ups. The "Live" badges (status bar, board, Activity tab) are fine in the live product, but **crop or blur them in every demo-data capture**: a "Live" badge over demo data reads as live market data.

### 1.3 Assets exported and QA'd

- [ ] Every asset marked NEW in §10 is built and passes BRAND_GUIDE §15.
- [ ] **Product frames:** captured in marketing capture mode on demo data. DEMO burned in on every frame and in the alt text. The frame check passes (`paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`), with capture-mode gaps kept out of frame (ledger §7.1). No "Live" badge. Four chains only in the UI, no Robinhood Chain mock-up. Tickers, KOL handles and token socials blurred in close-ups. No demo PnL, balance or equity curve as the subject. The footer's demo price strip blurred.
- [ ] **AI frames:** AI label burned in, no glyphs at 100%.
- [ ] **The trailer (`launch-1`):** frame 0 per SCRIPT (the whale, the reticle and one caption) works as the thumbnail. AI on AI shots and DEMO on UI shots, swapping on the cut. The end card holds AI + RISK + CHAINS for at least 3 s with nothing moving over them. No URL. The handle only if confirmed and owned. Captions burned in. At most 3 flashes per second. Generated music only.
- [ ] **Trailer file:** MP4, H.264, AAC-LC, 1920×1080, 30 fps, 8–12 Mbps, runtime per SCRIPT, ≤ 512 MB (posts without Premium). A 1280×720, 6 Mbps fallback in the same folder.
- [ ] **Old assets retired.** Nothing from `marketing/screens/`, `marketing/video/app-footage/`, `x/posts/screen-*`, `x/posts/d2-a*`, `d3-c`, `d4-a` or the old `trenchscope-trailer-16x9.mp4` goes out: they carry sim wording.
- [ ] Every number in an image matches its copy and alt text.

### 1.4 Copy pass

- [ ] Every post maps to §12, and every claim it rests on is GREEN, or OWNER with its check ticked in §1.1.
- [ ] RISK is the last line wherever the table at the top says. CUSTODY is verbatim in T9.
- [ ] `[LINK]` appears in **T1 only** and is replaced with the real URL. No hashtags, cashtags, @-mentions, emoji or exclamation marks. No dates.
- [ ] Every chain list matches C-1.
- [ ] Every bracket is filled and the post re-measured.
- [ ] The Metricool queue is paused for launch day, so nothing auto-posts into the windows.

### 1.5 People

One operator owns the account from 9:00 a.m. to 12:00 p.m. ET and is back at 1:30, 4:00, 6:15, 8:30 and 10:00 p.m. A second person watches the live product and runs the scam sweep, but **posts only from their own account**. The owner stays reachable all day for the incident calls in §9.3.

### 1.6 Team accounts and friends

Team members may share the trailer **once, from their own personal accounts, in their own words, whenever they like**. Don't coordinate the timing. Don't ask friends or group chats to like, reply or repost. No alt accounts, pods or "raid" calls. Coordinated engagement is platform manipulation, and X's published ranking code reportedly gives group-chat-driven visits no ranking boost anyway (CT_PLAYBOOK §3.9, §4.3).

---

## 2. The trailer post (10:00 a.m. ET)

**Video:** `launch-1` (16:9 master), native upload. **The caption is link-free:** `[LINK]` goes only in the first self-reply (T1). Pin this post: it replaces the Day-1 pin (PROFILE §9.1), which stays on the timeline.

**The cut** (`video/SCRIPT.md`): a deadpan wildlife documentary shot like a war epic. The whale over the trenches, the periscope rising (the scope), then a roll call of hooded species, each with its **real** wallet-tag chip: the sniper, the bundler, the insider, the dev. Real UI on demo data shows the board, the audit and the risk prompt, where *homo fomo* ticks the box and clicks **Buy anyway**. The carpet gets yanked, a dev sell lands in the real UI on demo data, and a lamp comes on over the empty desk. End card: the lockup, "see who's really buying.", AI + RISK + CHAINS.

### TR-A (recommended): the self-aware hook + a one-word question · `273/280`

```text
we made a nature documentary to launch a trading terminal. we are not ok.

trenchscope is live. which species gets you every time: the sniper, the bundler, the insider or the dev?

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

### TR-B: the field guide + five chains · `258/280` (four chains: `241/280`)

```text
field guide to the trenches, ep.01.

trenchscope is live: one memecoin terminal for sol, base, bsc, eth and robinhood chain. see who's really buying, before you do.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Four chains: `...one memecoin terminal for sol, base, bsc and eth. see who's...`

### TR-C: the CT hook · `264/280`

```text
everyone in the trenches is larping. the wallets aren't.

trenchscope is live. snipers, bundlers, insiders and the dev get tagged by rule, so you see who's really buying.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Why TR-A.** The first line works without sound and without the video: "nature documentary" plus "trading terminal" is the genre swap the whole film runs on (AI_VIDEO_NOTES §1.3), and "we are not ok" is the self-deprecating beat that earns quotes. "trenchscope is live" is the news, in four words. The question can be answered in one word, maps onto the film's four species, and gives the reply shift something to answer (§9.1). It asks for an opinion, not a like, follow or repost, so it isn't engagement bait. It names no chain, so it survives a chain failing C-1; T9 carries the chain list. TR-B leads with the five chains if the owner wants the multi-chain news in the caption. TR-C has the strongest single line but no question for the reply shift to answer.

**Composer settings**

- Turn on X's **"Made with AI"** label (AI disclosure; the film is mostly AI shots).
- No content warning, no location, no hashtags, no @-mentions, no cashtags.
- **Video description** (alt text), 948 characters, under X's 1,000 limit. **Check it against SCRIPT's final cut** and delete any sentence whose beat was cut:

```text
AI-generated trailer for Trenchscope, a memecoin trading terminal, made as a deadpan wildlife documentary shot like a war epic. A giant whale glides over night-time trenches while two hooded figures watch, and a brass periscope rises over the sandbags. Hooded figures are introduced as species, each with a wallet tag from the app: a sniper at a brass telescope, six identical bundlers in a row, an insider already seated at a glowing table, a dev gripping the end of a carpet. Screen recordings of the real app, each labelled UI shown with demo data, show the launch board, a token audit, a high-risk warning where the buyer ticks the box and clicks Buy anyway, and a chart collapsing after a dev sell. A carpet is yanked from under a banquet table and blank plates fly. A lamp comes on over an empty desk. End card: see who's really buying, a risk warning, and a note that Trenchscope isn't affiliated with any chain, launchpad or exchange named.
```

---

## 3. The launch thread (self-replies under the trailer)

Build it in the composer as one thread: post 1 is the trailer, posts 2–11 are T1–T10. Publish it all at once at 10:00.

- **`[LINK]` appears once, in T1**, the first self-reply, so the trailer caption stays link-free (CT_PLAYBOOK §3.5) and the link card shows the real domain right under the video. T10 points back to it. No other link anywhere today.
- **RISK** is the last line of every thread post. **CUSTODY** is verbatim in T9.
- Every image carries DEMO in the pixels and in its alt text. No @-mentions, hashtags or cashtags anywhere in the thread.
- Each post opens with "stop N", so the tour reads in order, and each still makes sense quoted on its own.
- **The warm-up already previewed most of these features** (`WARMUP_WEEK.md` Days 2–7: the board, the keyboard, funding links, five chains, exits, the audit, the risk prompt). Every line here is written fresh, never pasted from a warm-up post: near-duplicate text inside a week reads as a template to readers and to X's duplicate rules (CT_PLAYBOOK §3.4). Keep it that way if you edit.

### T1 · it's live + the link + the board · `270/280` · media: none (so the link card shows)

```text
it's live: [LINK]

stop 1, the board. new on the left, near grad in the middle, migrated on the right, in real time. red chips mean a coin crossed your limits.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-07, SC-07b, SC-31, SC-47 ("live", gated). Code: the three columns, left to right, are New, Near graduation and Migrated (`apps/web/src/components/discovery/TrenchesColumn.tsx:20-22`); the chips are `apps/web/src/components/discovery/TokenBadges.tsx` and turn red past the viewer's own thresholds (`apps/server/src/accounts/settings.ts:75`). The board itself is on screen in the trailer and in T7's clip. If the owner prefers a picture here, attach `launch-8`'s first frame: X then hides the link card and shows the URL as text.

### T2 · the tags · `255/280` · image: `launch-3`

```text
stop 2, the tags. the cheat sheet:

sniper: blocks 1–3 after launch.
bundler: the creation block itself.
insider: the dev, or the dev's funder, paid for its gas.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-19, SC-21 (the definitions, in substance). Code: a sniper buys 1–3 blocks after the creation block (`SNIPER_BLOCKS = 3`), a bundler buys in the creation block, the creator excluded (`apps/server/src/analytics/tokens/track.ts:21,207-210`); an insider's first funder (the wallet that first sent it native coin, its "gas") is the dev or the dev's own funder, unless that funder is a labelled public entity such as an exchange (`classifyInsider`, `track.ts:234-256`). The third insider rule and the other tags are on the card (ledger §2.2). Don't convert blocks to seconds. Never "every wallet gets a tag" (most wallets match no rule), and never "detects" (MNC-06). Alt text (717 characters; add a KOL line only if F-2 passes):

```text
Card titled "the tags, by rule". Real wallet-tag chips from the Trenchscope app, each with its rule. Sniper: bought within 3 blocks of launch. Bundler: bought in the block the coin was created. Insider: first funded by the dev or the dev's funder, or one of 3 or more wallets with the same funder that first bought within 10 minutes of launch. Dev: the wallet that created the coin. Smart money: a 7-day hit rate on entries that later ran 2x, tested against the chain's base rate. Whale: $100k+ in native balance or $10k+ average buys. Fresh: first funded under 24 hours ago, in fewer than 15 coins. Bot: 200+ trades a day and 5x the chain's median trader, with a median hold under 2 minutes. Footer: high risk · nfa.
```

### T3 · the audit + funding links · `263/280` · image: `launch-4`

```text
stop 3, the audit. every coin gets a checklist in green, amber and red, plus a rug ratio. a reference, not a verdict.

then the holders tab shows who paid for whose gas.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-09, SC-10, SC-49. Code: the audit rows and thresholds (`apps/server/src/analytics/tokens/security.ts:470-597`, `apps/web/src/components/token/SecurityPanel.tsx`); the "Funded by" column (`apps/web/src/components/token/tabs/HoldersTab.tsx:137`). It's one hop (the first wallet that sent it native coin, i.e. paid for its gas), not a funding graph, so the copy says "who paid for whose gas", nothing more. The audit is a reference: never "safe", "audited" or "predicts rugs" (MNC-06, MNC-17). Alt text (432):

```text
Two panels from Trenchscope, UI shown with demo data, token name and ticker blurred. Top: a token's audit card with its risk level, a rug-ratio bar and rows rated green, amber or red for top 10 holders, dev holding, insiders, snipers, bundlers and fresh wallets. The red rows are outlined in amber. Bottom: the Holders tab, where each holder row shows its wallet tags and a Funded by column with the first wallet that sent it funds.
```

### T4 · the risk prompt · `252/280` · image: `launch-5`

```text
stop 4, the "you sure?" box. buy a high-risk coin from the trade panel and it reads you the red flags first. "buy anyway" stays locked until you tick the box.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**T4-F3** (only if quick buy goes through the prompt in the live build, check F-3) · `253/280`:

```text
stop 4, the "you sure?" box. buy a high-risk coin, even with one click, and it reads you the red flags first. "buy anyway" stays locked until you tick the box.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-08 (GREEN for the trade panel), SC-08c (OWNER for every buy). Code: `riskReasons` (`apps/web/src/components/token/model.ts:119-129`), the dialog, the "I understand the risks and want to buy" box and "Buy anyway" (`apps/web/src/components/token/trade/useTradeExecutor.tsx:71-109`); quick buy skips it (`apps/web/src/components/trade/QuickBuyButton.tsx`). It asks; it doesn't block or protect (MNC-17). Alt text (443). Don't quote the dialog's subtitle in alt text until the live build's wording is final (ledger §2.4):

```text
A dialog titled High-risk token over Trenchscope's trade panel, with the token's red audit card behind it. UI shown with demo data, ticker blurred. A red box headed Why this is risky lists the reasons: the high risk level with its rug ratio, and the red audit rows for dev holding, insiders and bundlers. Below it are an unticked box, I understand the risks and want to buy, and the buttons Cancel and Buy anyway. Caption: the "you sure?" box.
```

### T5 · auto exits + the dev-sell exit · `280/280` · image: `launch-6`

```text
stop 5, exits: take-profit, stop-loss, trailing, set on the buy.

and a dev-sell exit: the dev sells 20%+ of their bag in one trade, yours fires right after. a scope, not a time machine.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-14, SC-41. Code: the order kinds (`apps/server/src/trading/orders.ts:32-41`); the dev-sell trigger fires on the dev's sell when it is at least the threshold share of that wallet's holding, default 20% (`orders.ts:29,263-271`); the Auto tab (`apps/web/src/components/token/trade/AutoForm.tsx:155-162,201-208`). It reacts **after** the dev's sell: never "before the dev", "beat the dev" or "front-run" (MNC-17). **Gated on K-2** (these orders run server-side). Alt text (308):

```text
Trenchscope's token page, UI shown with demo data, ticker blurred. The Orders tab lists a buy's open exits: take-profit, stop-loss, a trailing stop, and a dev-sell exit that sells when the dev sells a set share of their holding in one trade. Their levels are drawn on the chart above. Callout: dev-sell exit.
```

### T6 · the all-in cost before you confirm · `270/280` · image: `launch-7`

```text
stop 6, the bill before the meal: what you get, min received, price impact, fees, route.

impact goes amber past 3%, red past 10%. your pnl counts the fees. rude, but accurate.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-11, SC-32, SC-12 (no fee number, anywhere). Code: the quote rows and `impactTone` (amber above 3%, red above 10%: `apps/web/src/components/token/trade/QuotePreview.tsx:42-45,91-119`); fees in the cost basis (`apps/server/src/sim/world.ts:647-648,749`). **Gated on the Fees check.** Keep the trade-panel footer fee line out of frame (capture mode hides it). Alt text (263):

```text
Trenchscope's buy panel before confirming, UI shown with demo data, ticker blurred. Under the amount, the quote lists You receive, Min received at the set slippage, Price impact with a warning icon, Exec. price, Fees and Route. Caption: the bill, before the meal.
```

### T7 · keyboard first · `247/280` · video: `launch-8`

```text
stop 7, hands off the mouse. j/k down the board, b to buy, s to sell, / to search a name, ticker or pasted address.

your mouse hand was never the alpha.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-30. `launch-8` runs a different key sequence from the warm-up's `peek-keys` clip, so it isn't a repeat. Code: the board hotkeys (`apps/web/src/pages/TrenchesPage.tsx:39-46`), B and S on the token page (`apps/web/src/components/token/trade/TradePanel.tsx:85-91`), `/` for search (`apps/web/src/components/layout/Omnibox.tsx:142`). Say "hotkeys" or "keyboard first", never "command palette" (not built, SC-44) and no speed claims (MNC-08). Video description (318):

```text
Screen recording of Trenchscope, keyboard only, UI shown with demo data, tickers blurred. A keycap overlay shows each key: / opens search and a pasted address finds the coin, Enter opens it, B opens the buy panel and S flips it to sell. Back on the board, 3 jumps to the Migrated column and J and K move between coins.
```

### T8 · tracking: copy, sniper, signals · `270/280` · image: `launch-9`

```text
stop 8, the surveillance wing. copy a wallet at your own size, with a per-token cap. snipe a dev's next coin or the moment one migrates. signals, alerts, a smart-money monitor.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-15, SC-16, SC-17, SC-18, SC-24. Code: `apps/server/src/trading/copytrade.ts:1-13`, `sniper.ts:1-13`, `alerts.ts:1-4`; the 13 signal kinds (`packages/shared/src/types.ts:489-502`); Hot by smart money = 2+ smart wallets in 30 minutes (`apps/web/src/components/monitor/HotBySmartMoney.tsx:13-14`). No signal count (the "13" is OWNER: five kinds read simulator-supplied data). Never imply copying makes money (MNC-04). **Gated on K-2** (copy and sniper tasks run server-side). Alt text (367):

```text
Four panels from Trenchscope, UI shown with demo data, tickers and handles blurred: a copy-trade task with its buy size, per-token cap and mirror-sells setting; a sniper task set to buy when a coin migrates; the Signals feed with dev-sell and smart-buy cards; and the Monitor's Hot by smart money panel, coins bought by 2 or more smart wallets in the last 30 minutes.
```

### T9 · five chains + your keys + CUSTODY · `270/280` (four chains: `253/280`) · media: none

```text
stop 9: sol, base, bsc, eth and robinhood chain. one terminal, and your keys stay with you.

so: we will never DM you first, ask for your seed phrase, or ask you to send funds.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Four chains: `stop 9: sol, base, bsc and eth. one terminal, and your keys stay with you.`

Ledger: SC-42, SC-43, SC-45, SC-46, CUSTODY verbatim. **OWNER: C-1 per chain, K-1, K-2.** No image: the UI's chain switcher shows four chains (SOL, BSC, Base, ETH: `packages/shared/src/chains.ts:5-7`), so a picture of it under "five chains" would start the wrong conversation. Never "robinhood" on its own, never a chain logo or anything that implies a partnership (MNC-14).

### T10 · how to start · media: none

Step 2 depends on the live build's onboarding (checked in §1.2). Pick the variant that matches it exactly; if neither does, write step 2 in ≤ 70 characters and re-measure.

**T10-A** (you bring your own wallet) · `251/280`

```text
last stop, how to start:
1. the link in the first reply (or our bio). nowhere else.
2. connect the wallet you already use.
3. pick a chain, set your presets.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**T10-B** (the app makes the wallet) · `274/280`

```text
last stop, how to start:
1. the link in the first reply (or our bio). nowhere else.
2. make a wallet in the app. back up the phrase. show nobody.
3. pick a chain, set your presets.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-50 (presets: slippage, priority fee, anti-MEV; S1/S2/S3), SC-46. "nowhere else" teaches the one rule that beats launch-day phishing: the link only comes from this account. No "buy small first" or any sizing advice (MNC-18): RISK carries the "afford to lose" line.

### SAFE-L1 · 10:03 a.m., a reply to the trailer (its own branch, not to T10) · `204/280`

The thread already carries CUSTODY verbatim (T9). This is the fresh-worded safety reply PROFILE §9.1 asks for, aimed at the launch-day spike in clones (§9.2).

```text
launch days bring clones: fake support accounts, fake sites, coins borrowing our name.

our only links: the bio and the first reply up top. we never DM first. see a fake? report it, block it, don't click.
```

"coins borrowing our name" warns about fake tokens without saying anything about a token of ours (MNC-02). If the owner wants no coin-adjacent words at all, cut it to `fake support accounts and fake sites.` (re-measure). Every fake-token response beyond this goes through §9.2.

---

## 4. Launch hour, minute by minute (ET)

| Time | Do this | Done |
|---|---|---|
| **9:00** | **Launch gate** (§1.1). Open `[LINK]` logged out on phone and desktop. Open the live product's health dashboard | [ ] |
| 9:05 | Under the Hood: no labels. Note followers and the Day-1 pin's stats as a baseline. Run the impersonation search (`trenchscope`, `trenchscope_`, `trenchscopes`, `trench_scope`, `trenchsc0pe`, `trenchscopesupport`) and note what already exists | [ ] |
| 9:10 | Composer on desktop. Post 1: upload `launch-1`, paste TR-A, add the video description, turn on "Made with AI". Let the video finish processing | [ ] |
| 9:20 | Add T1–T10 with `launch-3` … `launch-9` and their alt texts. Pick T4 or T4-F3, T10-A or T10-B, and the chain versions that match C-1. **Don't publish** | [ ] |
| 9:35 | Proofread: the real URL in T1 and nowhere else. No @-mentions, cashtags, hashtags, emoji or dates. Every bracket filled | [ ] |
| 9:40 | Profile → Edit → **Website: `[LINK]`** (PROFILE §6.2). The bio stays (or switch to BIO-3, the post-launch option with `high risk · nfa`, BRAND_GUIDE §14.2). Only photo, display-name and handle changes trigger a verification re-review | [ ] |
| 9:45 | Metricool queue paused. Phone notifications on. Calendar clear until 12:00 | [ ] |
| 9:55 | The video thumbnail (frame 0) shows in the composer. If processing has stalled for 5+ minutes, swap in the 720p fallback | [ ] |
| **10:00:00** | **Publish the thread** | [ ] |
| 10:01 | Trailer → ••• → **Pin to your profile** (the Day-1 pin unpins and stays on the timeline). Optional: add it to Highlights | [ ] |
| 10:02 | Private window, logged out: the trailer autoplays muted, the caption is complete, "Show replies" opens T1–T10, the T1 link card renders with the right domain | [ ] |
| 10:03 | Reply to the **trailer** with SAFE-L1 | [ ] |
| 10:05 | On the phone, tap the link in T1 and go through onboarding to the first screen. The second person watches errors and rate limits | [ ] |
| 10:05–10:30 | **Answer every reply within about 5 minutes**, in fresh words each time (§9.1). Answers to TR-A's question get a one-line mechanism for that species, never a real name. **Scam sweep every 15 minutes** (§9.2): hide, report, block | [ ] |
| 10:15 | Watch the trailer once in the X phone app: captions, the DEMO and AI labels and the end card are readable | [ ] |
| **10:30** | T+30 snapshot (§11). **Don't edit or delete** anything, and don't quote yourself | [ ] |
| 10:30–11:00 | Keep replying. Between replies, 3–5 value replies on fresh mid-size CT posts: no link, no plug unless someone asks | [ ] |
| **11:00** | T+60 snapshot. Under the Hood on the account and the thread (§0 note on RISK repeats). Product health check. Impersonation search again | [ ] |
| 11:00–11:30 | Keep replying. Follow back only accounts that pass PROFILE §10.2 (at most about 10 this hour, 30 today) | [ ] |
| **11:30** | T+90 snapshot. Confirm `launch-10` for QT-1 | [ ] |
| 12:00 | T+2 h snapshot: the cold-start audition is over (about 2 h or 200 views). Write down the like-per-view rate | [ ] |
| Every hour to 10:00 p.m. | Impersonation search and scam sweep. Log every report (§9.2) | [ ] |

**If something breaks during the hour:** §9.3. Never delete the trailer or the thread. Fix forward with a reply.

---

## 5. Later that day: three quote posts

All three quote the **trailer post**, so every new audience lands on the pinned post with the link one tap away in its first reply. None carries a link.

**Hold rule for QT-2 (the flex slot).** At 6:00 p.m., look at the trailer's and COMM-1's view curves. If either is still clearly climbing, **don't post QT-2 as a quote**. Post its text as a self-reply under the trailer instead (the making-of self-reply pattern, AI_VIDEO_NOTES §1.3), so it doesn't compete with them in followers' feeds (CT_PLAYBOOK §3.3).

### QT-1 · 1:30 p.m. · "the trailer is AI. the terminal isn't." · `262/280` · video: `launch-10`

```text
the trailer is AI. the terminal isn't.

screen recording, demo data: bundlers in the creation block, a dev sell, then the floor. the audit was red before the chart was.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**Only post "the audit was red before the chart was." if the clip shows it**: the audit panel already red before the candles drop. Otherwise post **QT-1-b** · `242/280`:

```text
the trailer is AI. the terminal isn't.

screen recording, demo data: bundlers in the creation block, a dev sell, then the floor. no AI, no speed-up.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-09, SC-18, SC-21, SC-25, MNC-23 (AI never shown as real), MNC-19 (demo data never shown as real market data: "demo data" is in the copy and DEMO in every frame). The line describes this one launch, not a hit rate, so never generalise it (MNC-06). Real speed only; jump cuts are fine. Use a different token and cut from the trailer's dev-sell shot. Video description (291):

```text
Screen recording of Trenchscope, not AI, UI shown with demo data, ticker blurred. One token's chart on 1-second candles sits beside its audit panel with red rows. Bundler and dev sell rows land in the Activity tab, then the candles collapse to the floor. Burned-in captions name each moment.
```

### QT-2 · 6:15 p.m. · the making-of · `255/280` (filled as below: `247/280`) · image: `launch-11`

```text
how a trading terminal got a nature documentary shot like a war movie:

[N] stills. [N] clips. [N] kept. [N] voice takes.

the whale, the hooded species and the yanked carpet: AI. every UI shot: a screen recording on demo data. the terminal itself: no AI.
```

**Fill each `[N]` from the real Higgsfield generation log**, never an estimate. The log at the time of writing, trailer only (the two header-art stills don't count): **8 stills, 8 clips, 8 kept, 1 voice take**, so `8 stills. 8 clips. 8 kept. 2 voice takes.` once the re-cut's new VO take is made. Recount before posting; if the cut drops a clip, "kept" changes.

No RISK: it's about how the video was made and names no feature or trading. If the legal check (L-1) treats every brand post as a promotion, replace the last paragraph with RISK. Ledger: MNC-07 (the product has no AI), MNC-23. Alt text (334):

```text
AI-generated making-of card for the Trenchscope trailer. Left: the AI-generated keyframe of six identical hooded figures in a trench at night. Middle: a frame from the same shot animated. Right: the final frame with its title card and the real Bundler tag chip. A row underneath gives the real counts of stills, clips and voice takes.
```

### QT-3 · 8:30 p.m. · Asia re-push · `259/280` (four chains: `242/280`) · video: `launch-2` (9:16 cut)

```text
gm asia. vertical cut.

the trenches never close. trenchscope tags the snipers, bundlers, insiders and the dev on sol, base, bsc, eth and robinhood chain. it's live.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Four chains: `...and the dev on sol, base, bsc and eth. it's live.`

Ledger: SC-21, SC-21d, SC-43, SC-45, SC-47. OWNER: C-1. It's a re-framed cut with new words, not a bare repost (CT_PLAYBOOK §5.3). Turn "Made with AI" on again. Video description (559):

```text
AI-generated vertical cut of the Trenchscope trailer, a deadpan wildlife documentary shot like a war epic. A whale over the trenches, a periscope, and hooded species with their wallet tags: the sniper, six identical bundlers, the insider, the dev. Phone-layout screen recordings of the real app, labelled UI shown with demo data, show the board, the audit, the high-risk warning and a dev sell. The carpet gets yanked. End card: see who's really buying, a risk warning, and a note that Trenchscope isn't affiliated with any chain, launchpad or exchange named.
```

---

## 6. Community prompt: "reply with your worst rug" (4:00 p.m.)

A standalone original about the trenches, not the product, so it carries no RISK. **No prizes, no "best reply wins", no follow or RT asks.** Incentivised posting is banned (CT_PLAYBOOK §3.9) and off-brand.

### COMM-1 · `183/280` · image: none (optional `launch-12`)

```text
reply with your worst rug.

no tickers, no cas, no names. just the story: when you aped, what the chart did, what you didn't see coming.

we'll answer as many as we can with the tell.
```

### COMM-1r · self-reply, 1 minute later · `158/280`

```text
psa for this thread: nobody can recover rugged funds. anyone in these replies offering to is the next rug.

we never DM first, and nobody DMs "on our behalf".
```

Rug stories attract "fund recovery" scammers within minutes, and on a launch day they come in numbers. Hide, report and block them all (§9.2). If `launch-12` is used, its alt text (187):

```text
AI-generated still: in a dark hall lit by one amber spotlight, an ornate carpet is yanked from under a long table and blank metal plates fly into the air. Text: reply with your worst rug.
```

### 6.1 How to answer the replies

- **Write every answer fresh.** The table lists angles, not text. Duplicate replies get labelled `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4).
- **Talk mechanisms, never people.** Don't call a real token, dev or KOL a scammer, and don't confirm guesses about who did it. If someone names a real project, answer in general terms.
- **No advice and no hindsight shaming.** Never "you should have". The tone: "the tell here is usually X".
- **No link in any of these replies.** Each reply @-mentions a stranger, and links in posts that mention non-followers trip a low-quality-URL rule (CT_PLAYBOOK §3.4). If someone asks for the app, point them to the pinned post.
- **Show, sometimes.** For about 1 in 5 answers, attach a fresh capture-mode crop of the matching chip, row or signal, with DEMO burned in and a new crop each time. Any reply that shows the product ends with RISK if it fits; if it doesn't, don't attach the image.
- Answer as many as you honestly can, then stop. "As many as we can" is the promise. Don't fake coverage.

| What they describe | The usual tell | Where it shows in the terminal (ledger) |
|---|---|---|
| Vertical candle, then −90% in a minute | Bundled launch: supply grabbed in the creation block | Bundlers row, Bundler tag, the bundler-sell signal (SC-09, SC-21; the bundler-sell signal is OWNER, F-2) |
| "Dev sold everything" | Dev dump | Dev status (sold part / sold all), the dev-sell signal, the dev-sell exit (SC-26, SC-18, SC-41) |
| "Couldn't sell" | Honeypot or high sell tax (EVM chains) | Honeypot and tax rows, and the risk prompt on the trade panel (SC-09, SC-08) |
| Bled out over hours or days | Slow rug: dev or insiders trickling out | Dev holding, the insiders row, the top 10 share (SC-09, SC-26) |
| Graduated, then dumped | Post-migration dump. Use KS-02 only if hedged ("~73%", "within 20 minutes", "in one launchpad dataset, secondary"), with the source in the same reply | The Migrated column, the migration-sell exit (SC-07, SC-14) |
| "A caller posted it, then it dumped" | Caller exit. Mechanism only, never the person | Only if F-2 passes: KOL tags in Activity and Monitor. There is **no KOL-sell signal**, so don't claim one |
| "My fill was way worse than the quote" | Price impact or a sandwich | The price-impact warning in the quote (SC-11). Anti-MEV only in "harder to sandwich" terms, and only once F-4 is answered for that chain (SC-13o) |
| "The volume was fake" | Wash trading | The wash-trading row and the "hide wash trading" filter (SC-28, SC-29) |
| "40 holders, all brand-new wallets" | A fresh-wallet cluster | The fresh-wallets row (SC-09) |
| "I bought the wrong one" | A copycat | Only if the live build has a real source (SC-27 is OWNER): the copycat badge. Say "flags", never "detects" |

---

## 7. L+1

| ET | Post | Asset |
|---|---|---|
| 10:00 a.m. | **L1-A** rug autopsy (demo data) | `launch-13` |
| 1:30 p.m. | **L1-B** guess the fate (demo data) | `launch-14` |
| 7:30 p.m. | **L1-Br** the reveal (self-reply to L1-B) | `launch-15` |
| 8:30 p.m. | **L1-C** worst-rug recap | none |

Replies: 30–60, hand-written. Keep the trailer pinned. Impersonation search morning and evening.

### L1-A · rug autopsy · `267/280` · video: `launch-13`

```text
rug autopsy #1. demo data, mint to floor.

[0:03] bundlers: creation block
[0:08] snipers: blocks 1–3
[0:15] bundler sell
[0:19] dev sell
[0:22] floor

audit: red at [0:03].

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

- `#1`: the warm-up retired its simulator-era autopsy, so the series (BRAND_GUIDE §14.3) starts here.
- **Fill every timestamp from the actual clip** and drop the brackets (the count only goes down). If the events come in a different order, rewrite the lines to match. Never stage it. If the clip runs faster than real time, label the speed on screen and in the post.
- "audit: red at [0:03]" goes in only if the audit panel is red at that moment in the clip. It describes this one launch, not a detection rate (MNC-06).
- "blocks 1–3" is the sniper rule: the 1st to 3rd block after the creation block (`SNIPER_BLOCKS = 3`). Don't convert blocks to seconds.
- Ledger: SC-09, SC-18, SC-21, SC-25. A different token from `launch-10` and the trailer. Video description (299):

```text
Screen recording of one token from launch to collapse, UI shown with demo data, ticker blurred. Timestamped captions mark each moment: bundlers buy in the creation block, snipers follow in the next blocks, a bundler sell, a dev sell, then the floor. The audit panel stays in frame with its red rows.
```

### L1-B · guess the fate · `271/280` · image: `launch-14`

```text
guess the fate: a launch on demo data, captured at 2 minutes old. we already know how it ends.

graduates, rugs or goes quiet? reply with your call and the tell. reveal tonight.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

- **Demo data only, never a live coin.** BRAND_GUIDE §14.3 retired "guess the fate" because on live data it's a call on a real coin (MNC-18). On demo data, recorded first and posted after, nobody can trade it, so it stays a game about reading the tells. That's an exception to BRAND_GUIDE §14.3 for demo data only: the owner confirms it, or drops L1-B and L1-Br and posts a POV meme in L1-B's slot (L2-C's format, new line, DEMO and RISK).
- **Record the launch through its outcome first, then post.** That's why the copy says "captured" and "we already know".
- Blur the ticker, the name, the socials and any narrative or theme chip (demo names can collide with real coins, and a political theme reads as commentary). Alt text (263):

```text
Token page from Trenchscope for one launch at 2 minutes old, UI shown with demo data, with its name, ticker, socials and theme blurred. The bonding-curve progress bar, the first candles and the audit panel with its risk rows are visible. How it ends is not shown.
```

### L1-Br · the reveal (7:30 p.m., self-reply to L1-B) · `267/280` at the maximum fill · video: `launch-15`

```text
the reveal: [fate].

the tell: [one line from the recording].

recorded before we posted, so the answer was locked in. replay below.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

- `[fate]` is `graduated`, `rugged` or `went quiet` (measured at 10). `[one line from the recording]` is at most **66** characters, for example `bundlers held 49% from the creation block. dev sold at minute 6.` (64), filled only from what the recording shows. Drop the brackets when filling.
- Before posting, reply to the best guesses in fresh words. Never shame the wrong ones. Video description (192):

```text
Screen recording of the same launch through to its outcome, UI shown with demo data, ticker blurred, with the speed labelled on screen if it is sped up. Captions mark the tell and the outcome.
```

### L1-C · worst-rug recap · `191/280` at the maximum fill · image: none

```text
your worst rugs, sorted by tell:

most common: [tell]
runner-up: [tell]
the one that hurt to read: [paraphrase, no names]

the coins change. the tells don't.
```

- Fill it from the actual COMM-1 replies. Each `[tell]` up to 20 characters, the paraphrase up to 28.
- Paraphrase only: no handles, quotes or project names unless the person agrees.
- **No reply counts** or other traction numbers, even real ones (MNC-05).
- No product line, so no RISK. If COMM-1 drew too few replies, skip L1-C and post a POV meme instead (CT_PLAYBOOK §1.3, format 1; BRAND_GUIDE voice), with DEMO and RISK if it shows the product.

---

## 8. L+2

| ET | Post | Asset |
|---|---|---|
| 10:00 a.m. | **L2-A** micro-thread: the life of a launch, by the clock (5 posts + a source reply) | `launch-16` on post 1 |
| 1:30 p.m. | **L2-B** poll: where your worst rug happened | none |
| 8:30 p.m. | **L2-C** POV meme (or **L2-Calt** "shipped:" if a real change shipped) | `launch-17` (or `launch-18`) |

### L2-A · the life of a launch, by the clock (real-market stats: AMBER, re-verify each one)

**Every real-market number here is AMBER** (ledger §4). The owner re-checks each the day before against a public dashboard or primary post (check S-1), keeps the "~", the time window and "one launchpad" / "one older sample", and updates the source line in L2-A6 (no dates). If one can't be verified, cut that post: the clock still reads without it. If it's L2-A1's, keep its first line as the hook and drop the 0:00 sentence. **One stat per post.** Never name the launchpad (MNC-20). Not graduating is not rugging.

**Why these four stats.** The warm-up already used KS-01 (~97 of 100 never graduate, Day 3) and KS-02 (~73% of graduates down 60%+ in 20 minutes, Day 7), and its Day-3 lifecycle thread explained the curve. This thread is a different angle (a clock) with stats the account hasn't posted: KS-04, KS-06, KS-05, KS-03.

**Post order (STAT wants the source in the first reply):** L2-A1 → **L2-A6 (source) as the first reply** → L2-A2 → L2-A3 → L2-A4 → L2-A5, as one chain. The source post carries no number, so the clock still reads in order. Only L2-A5 names the product, so only L2-A5 carries RISK.

**L2-A1** · `160/280` · image: `launch-16` · KS-04

```text
the life of a launch, by the clock. most coins never reach the second stop.

0:00, mint. on one launchpad, that's somewhere between 27k and 50k new coins a day.
```

**L2-A6** · source, posted as the **first reply** to L2-A1 · STAT verbatim + the caveats · `183/280`

```text
source: launchpad lifecycle data (secondary). approximate, and it moves month to month.

the ~5-minute median comes from an older sample. the ~9 hours is an average, and a skewed one.
```

**L2-A2** · `152/280` · KS-06 (an older sample, so it says so; graduates only)

```text
~5 minutes, graduation. if a coin is going to fill its curve, it usually does it fast. in one older sample, the median graduate got there in ~5 minutes.
```

The ~5 minutes is the median for coins that did graduate, from an older sample (4.4 minutes in the research doc). Never apply it to all launches.

**L2-A3** · `125/280` · KS-05 (an average with heavy skew)

```text
~9 hours, the quiet. the average coin that doesn't graduate goes quiet in about 9 hours.

not rugged, mostly. just forgotten.
```

**L2-A4** · `131/280` · KS-03 (graduates only; "1 in 5" rounds 19.7%)

```text
24 hours, the survivors. of the coins that did graduate, ~1 in 5 still has $5k+ liquidity a day later.

a diploma is not a pension.
```

**L2-A5** · `239/280` · SC-21, SC-49, SC-18

```text
what the clock doesn't show: who bought in the creation block, who the dev funded, when the dev sells. trenchscope shows all three as it happens.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

"shows", not "catches" or "predicts" (MNC-06). It shows them as they happen; it doesn't see the future.

`launch-16` alt text (444):

```text
Timeline card titled the life of a launch, by the clock. Four marks left to right. 0:00, mint: somewhere between 27k and 50k new coins a day on one launchpad. About 5 minutes: the median time to graduate, in one older sample. About 9 hours: when the average coin that doesn't graduate goes quiet. 24 hours: about 1 in 5 graduates still has $5k+ liquidity. Footer: real-market figures from secondary lifecycle data, approximate. high risk · nfa.
```

### L2-B · poll · `41/280` · 24 hours

```text
where did your worst rug actually happen?
```

Options (each ≤ 25 characters): `on the bonding curve` (20) · `right after migration` (21) · `slow bleed, days later` (22) · `couldn't sell (honeypot)` (24).

It follows on from COMM-1. Post it only if no poll went out in the previous 2–3 days (cadence: at most one poll every 2–3 days, CT_PLAYBOOK §5.3). No product, no RISK.

### L2-C · POV meme · `141/280` · image: `launch-17`

```text
pov: you read the chart. the bundlers read you.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Ledger: SC-48, SC-07b (holders by tag, the chips). Alt text (180):

```text
Trenchscope's holder strip for one token, UI shown with demo data, ticker blurred: the Bundlers and Insiders chips are red. Caption: pov: you read the chart. the bundlers read you.
```

### L2-Calt · "shipped:" (only if a change really shipped in the live build) · `136/280` before filling · image: `launch-18`

```text
shipped: [the change]. [why, in one line].

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Post it only for a change that is **in the live build** and shipped **after** launch (BRAND_GUIDE §14.3). Never present an existing feature as new, never a roadmap item, never a competitor (MNC-12, MNC-13). Candidate if it ships after launch: quick buy going through the risk prompt (F-3). Fill, keep ≤ 280, and make `launch-18` a before/after capture of the real change.

---

## 9. Answer kit, scam shield and incident playbook

### 9.1 Answer kit: points to make, never pasted text

| They ask | Make these points (new words every time) | Never say |
|---|---|---|
| "is it live?" / "which chains?" | Yes (once the gate passed): the chains that passed C-1, named as supported chains. Link: "first reply on the pinned post, or the bio" | A chain that failed C-1, "robinhood" alone, "official", "partnered" (MNC-14) |
| "who holds my keys?" / "is it custodial?" | You do: self-custody (K-1), in the words the owner approved after K-2. We never ask for a seed phrase | "your funds are protected", "safe", "bank-grade" (MNC-17) |
| "is it safe?" | It's a tool with a scope, not a shield: the audit is a reference, the risk prompt asks and lets you buy anyway. Memecoins are risky (RISK, in your own words plus the verbatim line if it fits) | "safe", "rug-proof", "protects you" (MNC-17) |
| "fees?" | The fee is in the quote before you confirm, every trade | Any number until the owner confirms it's final (SC-12), any comparison |
| "wen token / airdrop / points?" | **Don't answer** until the owner decides what we say (T-1, PROFILE §9.4, §13 item 8). Don't hide these replies: they aren't scams | "soon", "stay tuned", "early users rewarded" (MNC-02) |
| "is it AI?" / "ai slop" | The trailer is AI-generated and labelled. The terminal has no AI. QT-1 is a plain screen recording | "AI-powered", "AI signals" (MNC-07) |
| "how accurate is the smart money tag?" | It's earned from behaviour over 7 days: entries that later ran 2x, tested against the chain's base rate, plus a win rate and a PnL floor. No accuracy numbers | Any percentage, "detects", "predicts" (MNC-06) |
| "can I copy wallets / snipe?" | Yes: copy tasks with your own size, a per-token cap and mirror sells; sniper tasks for filtered launches, a dev's next coin or a migration | "copy smart money and win" (MNC-04), "first in", "beat the bots" (MNC-08) |
| "phone app?" | It's a web terminal with a phone layout. Nothing to install | "download the app" (MNC-12) |
| "first / only / fastest?" | Don't claim it. Talk about what it does | "first", "only", "fastest" (MNC-08, MNC-09) |
| "better than [other terminal]?" | Don't compare. Describe our feature | Any competitor name or comparison (MNC-10) |
| "is [real token CA] a rug?" | No verdicts on real tokens. Name the tells to look at, in general terms | "that's a rug", "buy", "sell" (MNC-18) |
| "my trade failed / my funds are stuck" | Reply publicly, briefly: sorry, here's `[SUPPORT]`; we never DM first and never need a seed phrase. Flag it to the owner. Don't diagnose in public | "your funds are safe" (unless the owner has verified it), any DM opener |
| "the dev" / "the bundler" / "all of them" (answers to TR-A) | One line on how that species shows up: creation-block buys (bundler), dev-funded wallets (insider), blocks 1–3 (sniper), dev status and the dev-sell signal (dev). A joke is fine; the mechanism is the point | A real dev, KOL or token; "our tags catch them all" (MNC-06, MNC-15) |
| "everyone's larping" / "this is a larp" | Agree with the CT hook: everyone in the trenches is larping, the wallets aren't | "larp the trenches" (retired), getting defensive |
| "is this a robinhood / coinbase / binance thing?" | No. Robinhood Chain, Base and BNB Chain are supported chains; we're not affiliated with any chain, launchpad or exchange | Anything implying a partnership (MNC-14) |
| "who built this? / pricing?" | Owner to decide. Don't invent a team, prices or backers | "backed by", "team from X" (MNC-05) |

### 9.2 Scam shield: impersonators and fake tokens spike on launch day

A self-custody brand that just said "it's live" is the best target of the day. Expect, within hours: look-alike accounts (`trenchscope_`, `trench_scope`, `trenchsc0pe`, `trenchscopesupport`, `trenchscope_help`, a copied avatar), "support" replies and DMs, fake airdrop or "claim" sites, cloned landing pages on look-alike domains, "wallet sync" or "migration" drainer links, fund-recovery scammers under COMM-1, and coins launched with our name or a ticker that looks like it.

**The line we hold** (CUSTODY, verbatim in T9, WARN-1 and the pinned reply): `we will never DM you first, ask for your seed phrase, or ask you to send funds.` Our links come only from this account: the bio and the trailer's first reply.

**Sweep cadence:** every 15 minutes from 10:00 a.m. to 12:00 p.m., hourly to 10:00 p.m., then morning and evening on L+1 and L+2. Search the handle variants above, `trenchscope`, the domain name, and the replies under every post of ours.

**Report flow (every fake, every time):**

1. **Don't engage.** Don't quote it, reply to it with a link, or post its handle, URL or contract address: all of it amplifies the scam.
2. **Under our posts:** hide the reply, then report it (scam / fraud, or impersonation) and block the account. Batch it every sweep.
3. **Impersonating accounts:** report as the brand through X's impersonation report form (Help Center → Report a violation → Impersonation). Keep the account login handy, since X may ask the brand to verify.
4. **Fake sites:** report the URL to Google Safe Browsing (`safebrowsing.google.com/safebrowsing/report_phish/`), to the domain registrar's abuse contact (from a WHOIS lookup) and to the host. Check each form is still current when you use it.
5. **Fake tokens:** never name the coin or post its address. Report the accounts promoting it on X. Post WARN-Ta or WARN-Tb (below) once, as a standalone original, if it's getting traction.
6. **Log every report** in the private incident sheet: time, handle or URL, type, where it was seen, report reference. Tell the owner about anything convincing (a cloned site, a verified-looking account).
7. **Users who got hit:** reply publicly, kindly, in fresh words: we never DM first, never ask for a seed phrase; point to `[SUPPORT]`. Never promise recovery, and warn that "recovery" offers are the next scam.

**WARN-1 · standalone warning, only if clones are active** (it counts as an original: slot it 2 h from the nearest one, or post it as a reply under the trailer if the slots are full) · `245/280`

```text
psa: accounts and sites are copying us today.

we will never DM you first, ask for your seed phrase, or ask you to send funds. our links live in the bio and the pinned post's first reply. nowhere else.

report the fakes, block them, don't click.
```

**WARN-T · a coin is trading under our name.** Which version is allowed depends on the owner's T-1 decision (POSITIONING: no token talk unless the owner confirms the plan).

**WARN-Ta** (only if the owner has confirmed there is no token plan and approved this sentence) · `193/280`

```text
there is no trenchscope token. anything trading under our name was made by someone else, and they're the one selling.

our links live in the bio and the pinned post's first reply. nowhere else.
```

**WARN-Tb** (default: says nothing about a token of ours) · `208/280`

```text
a coin is trading under our name. it isn't connected to us, and the people pushing it aren't either.

our links live in the bio and the pinned post's first reply. nowhere else. report the accounts pushing it.
```

### 9.3 Incident playbook

| Situation | Do | Don't |
|---|---|---|
| Site slow or down | Reply to T1 with a fresh, plain status note. Say what's affected; mention funds or open orders only with what the owner has verified. Reply again when it's back | Delete the thread, repost the trailer, "funds are SAFU" |
| Trades failing on one chain | Owner call. Stop posting about that chain today (skip QT-3's chain list or use the version without it). Status reply under T1. If it won't be fixed today, the chain comes out of the bio and header (C-1) | Keep advertising a chain that isn't working |
| Automated orders not firing (exits, copy, sniper) | Status reply under T5/T8 with what's verified. Owner decides whether to pause those features | Claim exits "always fire" |
| A security incident (exploit, drained wallets, a compromised account) | **Stop all promotional posting.** Owner and legal lead. Post only what the owner approves | Speculate, blame users, or keep the schedule running |
| A clone, a fake site or a fake token | §9.2 | Post the scam's handle, URL or address |
| Scam replies (airdrop, "support", fund recovery, "wallet sync") | Hide, report and block in batches every sweep | Reply to them, especially with a link |
| The brand account is hijacked or acting oddly | Lock it: reset the password, revoke sessions and connected apps (PROFILE §8.1), then post a fresh notice once control is back | Let a "migrate your wallet" post sit for a minute longer than needed |
| The trailer gets an AI or altered-media label | Good: the disclosure is working. Leave it | Argue with it or re-upload without it |
| Under the Hood shows a label | Stop following for 48 h and keep posting normal originals. Check every link is the direct `https` domain | Make a new account or delete posts in bulk |
| The trailer underperforms (under about 200 views at 2 h) | Keep the schedule. QT-1 and COMM-1 carry the day. Re-cut the idea with new words 48 h or more later | Delete and repost (duplicate filter, 48 h cutoff) |
| Wrong `[LINK]` in T1 | If X's edit window is still open (Premium), edit it. Otherwise reply to T1 with the correct link and fix the website field | Delete the thread |
| A big account quotes or dunks on the trailer | One fresh, good-humoured reply. Then let it run | Reply-war, tag people, ask for reposts |
| Someone asks about a token | §9.1 | Improvise an answer |

---

## 10. Assets

**Status key.** **READY**: exists and is still valid. **NEW**: to be built (capture, edit or card). Nothing here needs new AI generation except the one pre-approved VO take and the optional items marked as such.

**Production notes for every asset:**
- **Product footage and screenshots:** the real app on **demo data** in **marketing capture mode**: load `marketing/tools/capture-mode.js` with `page.addInitScript({ path })` before navigating. The capture scripts in `marketing/tools/` (`capture-launch.mjs`, `capture-trailer.mjs`, `capture-extra.mjs`) don't load it yet; add it to each. Then frame with `tools/screens.py`, whose corner stamp still reads `SIM · PAPER TRADING`: **switch it to the DEMO label (`UI shown with demo data`) and drop its `SIMULATED · PAPER TRADE` watermark before any launch asset is built**. Cards come from `tools/cards.py` (drop its SIM tag too).
- **Every product frame:** DEMO burned in; the frame check and the hygiene list in §1.3; capture-mode gaps out of frame (guest sign-in modal, the phone drawer's sim notice, "Paper account", "paper balance", the copy-trade, sniper and Rewards footers, the "Faucet failed" toast); the "Live" badge cropped or blurred; demo tickers, KOL handles, token socials and the footer price strip blurred; four chains only.
- **AI frames:** only from the approved clips and keyframes (`video/clips/c01, c02, c04, c05, c06, c07, c11, c13`; `video/keyframes/s01…s13.jpg`). AI label burned in. Add all type in post; never generate text, UI, chips or numbers.
- **Brand:** bg `#0A0C10`, fg `#E6E9F0`, amber `#FFB547` as the single accent, red `#FF5468` only for loss or danger. Inter for words, JetBrains Mono for numbers and chips. Nothing under 20 px on a 1080-wide canvas. Real chips from `video/overlays/chips/*.png`, logos from `brand/logo/`.
- **Cards** (feature or stat cards, no UI) carry `high risk · nfa` (RISK-short) at the bottom edge.
- **Use new captures and new crops**, not warm-up images, so launch posts don't repeat the pinned or warm-up visuals.

| Ref | Used in | Size / length | Source | On-image text | Status |
|---|---|---|---|---|---|
| `launch-1` | Trailer post | 1920 × 1080 MP4, H.264, AAC-LC, 30 fps, 8–12 Mbps, runtime per SCRIPT; 1280 × 720 fallback | `video/SCRIPT.md`. READY inputs: AI clips `c01` whale, `c02` periscope, `c04` sniper, `c05` bundler, `c06` insider, `c07` dev, `c11` rug, `c13` empty desk; real chips; logos. NEW inputs: capture-mode app shots of the board (ledger FB-02), the audit (FB-07), the risk prompt (FB-08) and a dev sell (FB-13); **one new VO take (~1.6 credits, pre-approved)** | Frame 0 caption per SCRIPT · species names + real chips · AI corner label on AI shots, DEMO on UI shots · end card: lockup, `see who's really buying.`, AI, RISK, CHAINS (≥ 3 s) · handle only if confirmed · no URL | **NEW** (re-cut) |
| `launch-2` | QT-3 | 1080 × 1920 MP4, about 30 s | The same cut, re-timed. AI shots sit in a centred band, cropped no tighter than 4:3 (the clips are 1284 × 716, so a full 9:16 crop would be a soft 2.7× upscale), captions above, species card below. App shots **re-captured in the phone layout** (390 × 844, DSF ≈ 2.77) in capture mode, the drawer's sim notice out of frame. **Optional, owner-approved:** a native 9:16 whale hero for frame 0, 1 still + 1 clip ≈ **9.5 credits** (Nano Banana Pro 2 + Kling 3.0 Turbo 5 s 7.5, per the account's transaction log) | As `launch-1`, type ≥ 60 px, everything above the bottom 20% and clear of the right ~140 px · DEMO top-right below X's player chrome · end-card text ≥ 40 px, held ≥ 3 s | **NEW** |
| `launch-3` | T2 | 1080 × 1350 PNG | Card (`tools/cards.py`) + the real chip PNGs. Rules from ledger §2.2. A one-page summary of all the tags, so it doesn't repeat the warm-up's one-tag `dict-*` cards. KOL row only if F-2 passes | `the tags, by rule` · one row per tag: chip + rule (sniper, bundler, insider, dev, smart money, whale, fresh, bot) · `high risk · nfa` | **NEW** |
| `launch-4` | T3 | 1080 × 1350 PNG, two stacked panels | Capture mode: the audit card (FB-07) above the Holders tab with the "Funded by" column (FB-07b), for one high-risk demo token. A different token and crop from the warm-up's `peek-audit` and `peek-funding` | `stop 3: the audit` (top) · `who paid for whose gas` (callout on the Funded by column) · DEMO | **NEW** |
| `launch-5` | T4 | 1200 × 1200 PNG | Capture mode: trade panel → Market buy on a high-risk demo token, the dialog open, box unticked (FB-08). Capture mode rewrites the dialog's sim subtitle. Wider than the warm-up's `peek-risk`: the dialog **and** the red audit card behind it, a different token | `the "you sure?" box` (callout on the reasons) · DEMO | **NEW** |
| `launch-6` | T5 | 1200 × 1200 PNG | Capture mode: the token page after arming TP, SL, trailing and a dev-sell exit (FB-11): the Orders tab listing the open exits, with their lines on the chart. Not the Auto-form crop the warm-up's `peek-exits` used | `stop 5: exits` · callout `dev-sell exit` on its order row · DEMO | **NEW** |
| `launch-7` | T6 | 1200 × 1200 PNG | Capture mode: a Market buy sized so the impact row turns amber or red (FB-09). The footer fee line hidden (capture mode) or cropped | `the bill, before the meal` · DEMO | **NEW** |
| `launch-8` | T7 | 1920 × 1080 MP4, 12–15 s, silent or a light bed | Capture mode, keyboard only, a different sequence from the warm-up's `peek-keys`: `/` → paste a demo token address → `Enter` → `B` (buy panel) → `S` (sell panel) → back to the board → `3` (Migrated) → `J` `K`. Keycap overlay bottom-left, no cursor | Frame 0: `hands off the mouse.` · one caption per key · end slate `your mouse hand was never the alpha.` + mark · DEMO throughout | **NEW** |
| `launch-9` | T8 | 1600 × 900 PNG, 2 × 2 | Capture mode: a copy-trade task card (FB-18), a migration sniper task (FB-19), the Signals feed with the "Hit 2x+" tile out of frame (FB-14), Hot by smart money (FB-15). The copy-trade and sniper form footers and any KOL rows out of frame | `the surveillance wing` · `copy · snipe · signals · monitor` · DEMO | **NEW** |
| `launch-10` | QT-1 | 1920 × 1080 MP4, 18–25 s, burned-in captions | Capture mode on demo data: one token's 1 s candles + its audit panel, the bundler and dev sell rows, the collapse, at real speed (FB-13). A different token from the trailer's dev-sell shot | `SCREEN RECORDING. NOT AI.` · one caption per moment · DEMO | **NEW** |
| `launch-11` | QT-2 | 1600 × 900 PNG | Card (`tools/cards.py`) from three real frames: keyframe `s05.jpg` → a frame of `c05.mp4` → the final trailer frame with its title card | `how the trailer got made` · `[N] stills · [N] clips · [N] voice takes` (real counts only) · AI label | **NEW** |
| `launch-12` | COMM-1 (optional) | 1600 × 900 PNG | A frame grab of `c11.mp4` (0 credits) with the plates mid-air, a different moment from the warm-up's `fg-dev` | `reply with your worst rug.` · AI label | **NEW** |
| `launch-13` | L1-A | 1080 × 1350 MP4 (4:5), 15–25 s | Capture mode: chart + audit crop of one demo launch from mint to floor. A different token from `launch-10` and the trailer | `RUG AUTOPSY #1` · timestamped captions · DEMO | **NEW** |
| `launch-14` | L1-B | 1600 × 900 PNG | Capture mode: one demo launch at 2 minutes old, recorded through its outcome first. Ticker, name, socials and theme chip blurred | `GUESS THE FATE` · `graduates, rugs or goes quiet?` · DEMO | **NEW** |
| `launch-15` | L1-Br | 1080 × 1350 MP4, 15–25 s | The same launch through its outcome; speed labelled if accelerated | `THE REVEAL` · `[n]× speed` if sped up · DEMO | **NEW** |
| `launch-16` | L2-A1 | 1600 × 900 PNG | Card (`tools/cards.py`, stat template), no UI, no AI | `the life of a launch, by the clock` · four marks (0:00 · ~5 min · ~9 h · 24 h) with the hedged stats exactly as in L2-A1 to L2-A4 · `real-market figures: secondary lifecycle data, approximate` · `high risk · nfa` | **NEW** |
| `launch-17` | L2-C | 1200 × 1200 PNG | Capture mode: a demo token's holder strip with the Bundlers and Insiders chips red (FB-07b). No PnL in frame | `pov: you read the chart. the bundlers read you.` · DEMO | **NEW** |
| `launch-18` | L2-Calt (optional) | 1600 × 900 PNG | Before/after capture of the real change. After launch the "after" half can be live data: no DEMO on that half, real tickers still blurred (MNC-16) | `shipped:` + the change · DEMO on any demo-data half | **NEW** (only if a change shipped) |

**READY inputs (no rebuild):** AI clips `video/clips/c01, c02, c04, c05, c06, c07, c11, c13.mp4` (5 s each, 1284×716, 24 fps); keyframes `video/keyframes/s01…s13.jpg`; real chips `video/overlays/chips/*.png`; logos `brand/logo/`; `x/profile/avatar.png` and `header-alt.png`; the header art `x/profile/art/header-art-candle-valley.jpg`; `x/posts/d1-field-guide.png` (a Day-1 asset: not reused on launch day).

**Video specs (all clips):** MP4, H.264, AAC-LC (or silent), 30 fps, 8–12 Mbps. Longer than 10 s (X's video-quality gate), far under the 140 s non-Premium cap. Frame 0 designed as the thumbnail, text on screen by 0.3 s, captions burned in (autoplay is muted). DEMO on screen the whole time the UI is.

**Production order:** capture-mode tool fixes (`screens.py` label, capture scripts) → `launch-1` app shots and the VO take → `launch-1` cut → `launch-2` → `launch-3` … `launch-9` (thread) → `launch-10`, `launch-11` (`launch-12` optional) → L+1 captures (`launch-13` … `launch-15`: record a launch through its outcome before L+1) → `launch-16`, `launch-17`. Re-record product assets on live data after launch and swap them in (POSITIONING "Footage").

**Optional AI generation (owner-approved only, beyond the ~3 pre-approved credits):** the 9:16 whale hero for `launch-2` (≈ 9.5 credits). Check the quote in Higgsfield before running. Nothing else in this file needs a generation.

---

## 11. Metrics to log (internal only, never posted)

Log in a private sheet. **None of these numbers is ever posted or used as traction** (MNC-05).

| When | Trailer views | Likes ÷ views | Replies | Quotes | Bookmarks | Profile visits | New follows | Link clicks (T1) | Video: avg watch / completion | Scam reports filed | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T+30 min | | | | | | | | | | | |
| T+60 min | | | | | | | | | | | |
| T+2 h (audition closes) | | | | | | | | | | | |
| 6:00 p.m. (QT-2 hold check) | | | | | | | | | | | |
| T+24 h | | | | | | | | | | | |
| T+48 h | | | | | | | | | | | |

Also log per post: QT-1, COMM-1, QT-2 and QT-3 views and likes ÷ views at 2 h; the live product's sign-ups or wallet connections and error count per hour (from the product side, never posted). Compare likes ÷ views against the cold-start prior of about 1.5% (CT_PLAYBOOK §3.3). Use your own data, not blog rules of thumb, to set next week's windows.

---

## 12. Claims map and final check

| Post | Claims it relies on (ledger) | Owner checks | Disclaimers carried |
|---|---|---|---|
| TR-A / TR-B / TR-C | SC-47 (live), SC-19, SC-21 (the species are the app's tags); TR-B adds SC-43, SC-45 | C-1, K-1, F-1 | RISK; AI label in frames + X's "Made with AI"; AI + RISK + CHAINS on the end card; DEMO on UI shots |
| T1 | SC-47, SC-07, SC-07b, SC-31 | C-1, F-1 | RISK |
| T2 | SC-19, SC-21 | F-1 (F-2 for a KOL row) | RISK; `high risk · nfa` on the card |
| T3 | SC-09, SC-10, SC-49 | F-1 | RISK; DEMO |
| T4 / T4-F3 | SC-08 / SC-08c | F-1 / F-3 | RISK; DEMO |
| T5 | SC-14, SC-41 | F-1, K-2 | RISK; DEMO |
| T6 | SC-11, SC-32, SC-12 (no number) | F-1, Fees | RISK; DEMO |
| T7 | SC-30 | F-1 | RISK; DEMO |
| T8 | SC-15, SC-16, SC-17, SC-18 (no count), SC-24 | F-1, K-2 | RISK; DEMO |
| T9 | SC-42, SC-43, SC-45, SC-46 | C-1, K-1, K-2 | CUSTODY (verbatim); RISK |
| T10-A / T10-B | SC-50, SC-46 | K-1, the onboarding test (§1.2) | RISK |
| SAFE-L1 | — | T-1 for "coins borrowing our name" (or cut it) | CUSTODY meaning |
| QT-1 / QT-1-b | SC-09, SC-18, SC-21, SC-25, MNC-23 | F-1 | RISK; DEMO |
| QT-2 | MNC-07 (no AI in the product), MNC-23 | — | AI label on the card; X's "Made with AI" |
| QT-3 | SC-21, SC-21d, SC-43, SC-45, SC-47 | C-1 | RISK; AI + DEMO in the cut |
| COMM-1 / COMM-1r | — | — | CUSTODY meaning (COMM-1r) |
| L1-A, L1-B, L1-Br | SC-09, SC-18, SC-21, SC-25 | F-1 | RISK; DEMO |
| L1-C | §6.1 mapping | — | — |
| L2-A1 … L2-A6 | KS-04, KS-06, KS-05, KS-03; L2-A5: SC-21, SC-49, SC-18 | S-1 | STAT (first reply); RISK on L2-A5; `high risk · nfa` on the card |
| L2-B | — | — | — |
| L2-C / L2-Calt | SC-48, SC-07b / a real shipped change | F-1 | RISK; DEMO |
| WARN-1 / WARN-Ta / WARN-Tb | — | T-1 (WARN-Ta only) | CUSTODY (WARN-1) |

**Before each post, the 10-second check:**
- The launch gate passed, and every chain named passed C-1.
- No link outside T1. No hashtag, cashtag, @-mention, emoji or exclamation mark. No date.
- No token talk, profit talk, safety promise, speed claim, competitor or real person.
- Every number is either from a demo-data frame (and the post says demo data or the image carries DEMO) or a hedged KS stat with its source in the first reply. No fee number.
- RISK is the last line if the post shows, names or links the product.
- Every product frame carries DEMO, every AI frame carries AI, and "Made with AI" is on for AI media.
- Every number in the image matches the copy and the alt text.
- The text is new: not pasted from another post or reply.
