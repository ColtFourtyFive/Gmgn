# Trailer script: Field Guide to the Trenches, EP.01 (v4, live terminal)

| | |
|---|---|
| **What** | The launch trailer (`launch-1`, posted at 10:00 a.m. ET on Launch day per `x/LAUNCH_DAY.md`), its 9:16 cut (`launch-2`, QT-3 at 8:30 p.m. ET), and two warm-up teasers cut from the same clips (`fg-bundler`, was `d6-c`; `teaser-soon`, was `d7-a`) |
| **Runtime** | **36.6 s** master, 16:9, 1920×1080, 30 fps. The 9:16 cut is **30.0 s** (§12). Teasers 11.0 s and 13.5 s (§13) |
| **Mix** | **8 AI shots** (16.8 s, the approved clips, unchanged), **4 app shots** (13.2 s, re-captured in marketing capture mode on demo data), **3 cards** (6.6 s) |
| **Muted** | The story works muted. Every VO line is also on screen |
| **What v4 is** | The v3 film re-cut for the live-terminal positioning. Same eight AI shots, same structure, same 100 BPM grid. Every simulator beat is replaced, the app shots are re-captured, and there is **one new VO take** (§10). The old `video/trenchscope-trailer-16x9.mp4` carries sim wording: never post it |
| **Rules** | `research/POSITIONING.md` (binding) → `research/CLAIMS_LEDGER.md` (claims, never-say list, disclaimers, owner checks) → `x/TODAY.md` (approved Day-1 kit) → `brand/BRAND_GUIDE.md` §9–§13 (type, corner labels, motion, disclaimer placement). Craft and platform notes: `research/AI_VIDEO_NOTES.md`, `research/CT_PLAYBOOK.md` |
| **Gate** | The trailer and the 9:16 cut are launch-day assets: they post **only once real trading works** on every chain the end card and captions name (ledger C-1, K-1, F-1). Nothing in the video itself says "live" |
| **Placeholders** | `@trenchscope` (handle not confirmed) and `[LINK]` (no live URL). Neither appears in the video, except the handle on the end card once the owner confirms it |
| **Code refs** | `web/` = `apps/web/src/`, `server/` = `apps/server/src/`, `shared/` = `packages/shared/src/` |

---

## 1. Logline

A deadpan wildlife documentary, shot like a war epic, about the most dangerous habitat on the internet: the memecoin trenches. Trenchscope is the scope. Each species (the Sniper, the Bundler, the Insider, the Dev) gets a field-guide card with its **real in-app wallet tag**, and the real audit shows the receipts. Then the most endangered species of all, *homo fomo*, attaches a dev-sell exit, reads the real "High-risk token" warning and clicks **Buy anyway**. The carpet gets yanked. In the real UI the dev sells, and the exit fires right after. Or: look before you ape. **See who's really buying.**

---

## 2. What changed from v3, and why

### 2.1 Beat by beat

| Beat | v3 (simulator) | v4 (live terminal) | Why |
|---|---|---|---|
| **Corner labels** | `SIM · PAPER TRADING` bug on app shots; `AI-GENERATED · DRAMATIZED` on AI shots | DEMO `UI shown with demo data` on app shots; AI `AI-generated` on AI shots. Exact case, same corner, swapping on the cut | Ledger §6; BRAND_GUIDE §10 (corner label) and §12.3 ("the label") |
| **3 · The habitat** | "filmed on location." / "the location is a simulator." | "one habitat." / "one habitat. five chains." | The real terminal, five chains, in two beats. "filmed on location. the location is five chains." (the brief's example) would say demo-data footage was shot on real chains (MNC-19). It's recorded in the same VO take as **ALT-L**, for use once the board is re-recorded on live data after launch |
| **5 · The Bundler** | "one guy. six wallets. same block." | "six wallets. one trench coat." | The ledger's allowed wording (SC-21) and the running gag from `TODAY.md` D1-P1 and `fg-bundler`. "one guy" asserts common ownership, which the creation-block rule doesn't prove |
| **10 · Homo fomo** | MAX "full port" of 50 paper SOL; "50 paper sol. full port. no plan."; mono `SIMULATED` tags | A small **Auto** buy with a **dev-sell exit** attached, the real risk prompt, tick, **Buy anyway**. Subtitle "reads the warning. buys anyway." | The paper balance is gone. The dialog's own summary row ("Exit strategy · Dev sell 100%") plants the payoff in shot 12 |
| **12 · The dev sell** | "THE RUG, IN THE SIM": "DEV SELL." then "rug: real-feeling. money: fake." | The dev's sell lands, "DEV SELL.", then the real **"Dev-sell exit filled"** toast: "your exit fired *right after.*" plus a mono note `dev-sell exit · reacts after the dev sells` | The brief's dev-sell exit beat. "right after", not "already fired": the exit reacts **after** the dev's sell and can't get ahead of it (SC-41; MNC-17 bans "exits before the dev") |
| **13 · The empty desk** | "relax. it's paper." / "respawn." + faucet note | "or." / "look before you *ape.*" | The faucet and respawn are retired (BRAND_GUIDE §10). "or. see it coming." (the brief's example) reads as "it predicts rugs" (MNC-06). "look before you ape" points at the hanging eyepiece and hands off to the tagline |
| **14 · The lock** | "larp the trenches." + pill `PAPER TRADING · SIMULATED MARKET · NO TOKEN · NFA` + DIS-06 | Lockup + **"see who's really buying."** + the chain line + AI, RISK, CHAINS | POSITIONING "Lines"; ledger §6 (end card = AI + RISK + CHAINS) |
| **15 · End card** | Adds "no real bags were harmed…", DIS-11, DIS-10 | Holds shot 14 and adds only the handle (if confirmed) | The card already carries three disclaimers and the chain line. Next to a real trading product, "no real bags were harmed" reads as "nothing is at stake" |
| **VO** | 6 lines, incl. "the location… is a simulator." and "larp the trenches." | 7 lines, one new take (§10.1) | One take, ~1.6 credits, pre-approved |
| **App footage** | Sim captures with SIM bug, sim footer, paper balance | Re-captured in **marketing capture mode** (§8), the same token for shots 8, 10 and 12 | POSITIONING "Footage" |

### 2.2 Kept from v3

- The 8 AI clips and their kept windows (§7.1), the 36.6 s timing and every cut on the 100 BPM grid (§4).
- Frame 0 as the thumbnail: the whale, the reticle and one caption.
- The species cards with the **real** chips (§5.3), the Latin easter eggs, the reticle locks.
- "so we built a scope.", "receipts. on every token.", "so naturally, you…" in dead silence, "nature is not kind to late buyers.", the sub-boom on **Buy anyway**, the 0.5 s of silence that makes the loop clean.
- The judges' fixes from v3: no animals but the whale, locked-off species shots, no speed ramps, no corner-pinned UI, the iris-wipe out of the periscope, the dry park-ranger VO.

### 2.3 Deliberately not in the film

- No external statistics (KS-xx are AMBER and need a STAT reply; a video can't carry one).
- No PnL, balance or result as the subject of a frame (MNC-05, MNC-19), and no fee number (SC-12).
- No speed claims, no "AI-powered", no token, no roadmap, no "soon" for a chain.
- No real people, real tickers, chain logos or brand colours, no other terminal's UI.
- No "live", no URL.

---

## 3. Non-negotiables for this edit

1. **AI never renders text, numbers, UI, chips or the logo.** All type, chips, the reticle, the corner labels and the logo are added in post from real files (ledger §7.5).
2. **Real UI is real.** Captured in marketing capture mode on demo data, at real speed. No speed ramps, no staged rows, no edited numbers. Jump cuts between real moments are fine.
3. **DEMO on every frame of app footage**, AI on every frame of AI footage. Both swap on the cut, top-right, never animated away mid-shot (BRAND_GUIDE §10, §12.3).
4. **No demo ticker legible anywhere.** Blur it in the risk-dialog title, both toasts and any quote line, and keep token headers out of frame. Demo tickers can collide with real coins (MNC-16).
5. **No "Live" badge in frame.** The board header, the desktop status bar and the Activity tab show a green "Live" pill (`web/components/discovery/LiveStatus.tsx:19`, `web/components/layout/StatusBar.tsx:11`, `web/components/token/tabs/ActivityTab.tsx:189`). Crop or blur every one: the footage is demo data, so "Live" would misdescribe it (ledger §7.7).
6. **Frame check before export** (ledger §7.1): every app frame is scanned for `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`. Any hit is a re-take or a crop.
7. **Letterbox grammar:** AI shots get painted 2.39:1 bars (the dramatized film). App shots are full-frame (the product). Captions sit inside the picture area, in the 80% title-safe.
8. **≤3 flashes per second**, no full-screen red, nothing moving over the disclaimers (BRAND_GUIDE §12.6–7).
9. **No faces, no hands in close-up, no weapons, no insignia, no coin emblems** in AI shots.
10. **Robinhood Chain appears in copy only** (the end-card chain line and the VO), never in a UI frame. The UI's chain switcher has SOL, BSC, Base and ETH (ledger §7.6).

---

## 4. Beat sheet (16:9 master, 100 BPM grid: 1 beat = 0.6 s)

| n | Time | s | Kind | Visual | On-screen text (§5.4 has every layer) | VO | Sound |
|---|---|---|---|---|---|---|---|
| 1 | 0.0–2.4 | 2.4 | ai | **THE WHALE (frame 0 = thumbnail).** `c01`: from a trench floor, a colossal whale glides low through flare smoke like an airship over a battlefield; two hooded silhouettes look up. Reticle on the whale's eye from frame 0, locks at 0.6 s; real Whale chip pops at 0.7 s | Frame 0: **everything out here wants your bag.** ("bag." amber). 0.8 s: `FIELD GUIDE TO THE TRENCHES · EP.01`. AI label | VO1 0.3: "everything out here wants your bag." | Sub thump on frame 0, drone, wind and field-recorder hiss. Reticle thunk 0.6 |
| 2 | 2.4–4.2 | 1.8 | ai | **THE PERISCOPE.** `c02`: a brass periscope rises above the parapet, its lens full of flare reflections. At 3.9–4.2 the reticle centres on the lens and **iris-wipes** into shot 3 | **so we built a scope.** ("scope." amber). AI label | VO2 2.5: "so we built a scope." | Servo whir, short riser, whoosh on the iris |
| 3 | 4.2–7.2 | 3.0 | app | **THE HABITAT.** The real board on `/sol/trenches`: cards drop into New, a curve ring fills in Near graduation, a card lands in Migrated. 3% push. No top bar, no status bar, no "Live" pill | 4.4 **one habitat.** → 5.4 **one habitat. five chains.** ("five chains." amber). DEMO label | VO3 4.5: "one habitat… five chains." | The 16th-note pulse kicks in. Soft UI tick as cards land |
| 4 | 7.2–9.0 | 1.8 | ai | **SPECIES 1: THE SNIPER.** `c04`: a hooded figure prone at a brass spotting telescope (not a rifle), glint on the lens, coral-red rim. Reticle locks on the glint | **THE SNIPER** + real Sniper chip, `emptor primus`. Sub: **in before you blinked.** | — | Hit on the cut, lock click, glassy lens "ting" |
| 5 | 9.0–11.4 | 2.4 | ai | **SPECIES 2: THE BUNDLER.** `c05`: six identical hooded figures in a row on the parapet, backs to camera, cloaks moving in unison. Reticle locks on the centre of the row | **THE BUNDLER** + real Bundler chip, `fasciculus unanimus`. Sub: **six wallets. one trench coat.** | — | Six identical hits flammed into one. Lock click a half-step higher |
| 6 | 11.4–13.2 | 1.8 | ai | **SPECIES 3: THE INSIDER.** `c06`: through a half-open steel door, a hooded figure already seated at the glowing radar table, pink rim. Slow dolly in | **THE INSIDER** + real Insider chip, `amicus devi`. Sub: **already inside. "just a believer."** | — | Steel-door creak, lock click a half-step higher again, dripping water |
| 7 | 13.2–15.6 | 2.4 | ai | **SPECIES 4: THE DEV.** `c07`: a banquet table of blank discs on an ornate carpet; at the far end a hooded figure with an orange rim grips the carpet and it goes taut | **THE DEV** + real Dev chip, `creator fugiens`. Sub: **holding the rug.** | — | Music drops to one high note and a sub heartbeat. Cloth creak. Lock click |
| 8 | 15.6–18.6 | 3.0 | app | **RECEIPTS.** The real **Audit** card of the token homo fomo will buy: "High risk", the rug-ratio gauge, red Bundlers / Insiders / Dev holding rows, footer "Audit — reference only." (capture mode). Reticle locks on three rows. 17.8: cut to the Holders strip (Dev · Insiders · Snipers · Bundlers chips) | **receipts. on every token.** DEMO label **top-left** (the audit sits right) | — | Pulse returns. Three lock clicks on the rows. A riser builds |
| 9 | 18.6–19.8 | 1.2 | card | Flat `#0A0C10`, dead still | **so naturally, you…** | — | The riser is yanked to **digital silence** for the whole card |
| 10 | 19.8–24.0 | 4.2 | app | **THE MOST ENDANGERED SPECIES.** Same token. 19.8–20.3: the Auto form, "Buy with exit strategy" set to **Dev sell 100%**, the Buy click. 20.3–22.6: the real "High-risk token" dialog: "Why this is risky" reasons, the summary row **"Exit strategy · Dev sell 100%"**, the tick, the cursor on **Buy anyway**, the click. 22.6–24.0: the fill toast. Reticle locks on the cursor at the click | **THE MOST ENDANGERED SPECIES** + real You chip, `homo fomo`. Sub: **reads the warning. buys anyway.** ("buys anyway." amber). DEMO label | VO4 20.0: "the most endangered species of all." | Room tone only. Tiny checkbox tick. The click is a **huge sub-boom** (comedic overkill). Fill blip 0.15 s later |
| 11 | 24.0–25.8 | 1.8 | ai | **THE RUG.** `c11`: the carpet whips out from under the banquet table and a few dozen blank discs burst into the air in slow motion under one amber spotlight. No people | **nature is not kind to late buyers.** AI label | VO5 24.05: "nature is not kind to late buyers." | Reverse cymbal into a massive sub drop on the yank, slow-mo whoosh, discs clattering |
| 12 | 25.8–28.8 | 3.0 | app | **THE DEV SELL.** Same token. 25.8–27.0: 1 s candles with Markers on and the Activity tab: the **Dev**-tagged SELL row lands, the dev marker prints, the candles collapse. 27.0–28.8: punch-in on the real toast **"Dev-sell exit filled"** (ticker blurred) | 26.2 **DEV SELL.** (red `#FF5468`). 27.1 **your exit fired right after.** ("right after." amber) + mono `dev-sell exit · reacts after the dev sells`. DEMO label | — | Distorted bass pitch-dive into an impact on DEV SELL. A clean fill blip on the toast. Tape-stop into silence at 28.7 |
| 13 | 28.8–31.2 | 2.4 | ai | **THE EMPTY DESK.** `c13`: a dark dugout, the same periscope's eyepiece hanging from the ceiling over an **empty chair** and a dark monitor, a small amber lamp glowing. Very slow dolly in. 30.6: the reticle locks on the eyepiece | 28.9 **or.** → 29.6 **look before you ape.** ("ape." amber). AI label | VO6 29.0: "or…" 29.6: "look before you ape." | Silence, a lamp click on the cut, room hum. Soft two-note chime at 30.6, after the line |
| 14 | 31.2–33.0 | 1.8 | card | **THE LOCK.** The reticle flies from the eyepiece to centre and resolves into the **real mark** (BRAND_GUIDE §12.3 logo reveal): ring 400 ms, ticks 200 ms, chart line 300 ms, glint 300 ms; the wordmark fades in to complete the stacked lockup. Disclaimers on from 31.2 | Lockup. 32.0 **see who's really buying.** (amber). 32.4 chain line `solana · base · bnb chain · ethereum · robinhood chain`. Bottom: AI, RISK, CHAINS (§9) | VO7 32.0: "trenchscope. see who's really buying." | Short riser into the **final BRAAM at 31.8** as the ticks land, glint shimmer, long ring-out |
| 15 | 33.0–36.6 | 3.6 | card | **END CARD.** Shot 14 holds, static. Nothing moves over the disclaimers. The last 0.5 s is silent so the loop back to the whale is clean | Holds everything. Adds `@trenchscope` only if the owner has confirmed and holds the handle (ledger D-1) | — | Ring-out, wind and field hiss bookend, one faint synth note at 35.6, **silence from 36.1** |

**Disclaimers on screen:** AI + RISK + CHAINS for **5.4 s** (31.2–36.6), above the 3 s minimum (ledger §6, BRAND_GUIDE §13). DEMO is on every app frame (shots 3, 8, 10, 12) and AI on every AI frame (shots 1, 2, 4–7, 11, 13).

**If a chain fails C-1 at the launch gate:** Robinhood Chain is the likeliest. Swap three things before export: the s3-b overlay to **"one habitat. four chains."**, VO3 to its ALT-4 reading (§10.1), and the end-card chain line to `solana · base · bnb chain · ethereum`. For any other failure, rebuild s3-b and the chain line with the right count and chains, and voice only "one habitat…" (cut "five chains" from VO3). Never post a chain that failed its check.

---

## 5. Overlay system (post only)

Rendered by `marketing/tools/trailer_ovl.py` as full-frame 1920×1080 PNGs and placed by `marketing/tools/trailer_edit.py` (§18 lists the changes those tools need).

### 5.1 The species card (shots 4–7 and shot 10)

| Layer | Spec | In at (from the cut) |
|---|---|---|
| Reticle lock | Vector ring and four ticks from `brand/logo/mark-mono-amber.svg` (no chart line), ~220 px, `#FFB547` at 80%. Ticks slide in, ring settles 108% → 100% (200 ms ease-out), one amber pulse (BRAND_GUIDE §12.3) | +0.15 s |
| Species name | Inter Black 900, caps, 96 px, `#E6E9F0`, top-left inside the title-safe (x ≈ 200, y ≈ 178, below the bar) | +0.15 s |
| Real chip | The real render (§5.3), 76 px tall, 24 px right of the name, pop-in 140 ms | +0.25 s |
| Latin name | JetBrains Mono italic 500, 26 px, `#8C94A3`, 12 px above the name | +0.15 s |
| Subtitle | Inter Bold 700, **56 px**, lowercase, `#E6E9F0` on a `#0A0C10` plate at 75%, centred, 40 px above the bottom bar | +0.4 s |

Shot 10 is app footage, so its card is the left-column variant: a left scrim (`#0A0C10` 90% → 0 over 820 px) behind `THE MOST / ENDANGERED / SPECIES` (78 px, three lines), `homo fomo` above, the You chip below, and the subtitle at x 150, y 560 (54 px, two lines). Frame the shot-10 punch-ins right of centre so the scrim never covers the dialog's reasons, the tick or **Buy anyway**.

All layers clear 0.1 s before the cut. Species shots are locked-off, so the reticle needs no tracking. On the dolly shots (2, 6, 13) use 2–3 manual position/scale keyframes.

### 5.2 Corner labels and other layers

- **DEMO label:** `UI shown with demo data`, exact case. JetBrains Mono 500, 26 px, `#E6E9F0` at 85% on a `#0A0C10`/80% plate, 6 px radius, 0.5em × 0.9em padding. **Top-right, 48 px margin**; **top-left** on shot 8 (the audit sits right) and wherever a toast or the subject is under the top-right corner. Pops in (140 ms) on the first app frame, stays for the whole shot (BRAND_GUIDE §10, §12.3).
- **AI label:** `AI-generated`, exact case, same style and the same top-right spot, so the label swaps in place on every AI↔app cut. On AI shots it sits on the painted bar.
- **Big captions:** Inter Black, lowercase, `#E6E9F0` with **one** amber `#FFB547` word or phrase. Red `#FF5468` is used **only** for DEV SELL.
- **Lower thirds:** Inter Bold 700, 56 px, on the 75% `#0A0C10` plate, centred, 96 px above the frame edge on app shots.
- **Mono notes** (the series label, the dev-sell note): JetBrains Mono 500–600, 24 px, `#8C94A3`.
- **Scanlines** at 3% and shared grain on AI shots. Grain at about 50% on app shots. Never over a corner label, the mono note or the end-card disclaimers.
- **Blur plates** for tickers: a frosted `#11141A` plate at 92% with a faint amber hairline, or a real Gaussian blur where the tool supports it. Never a black bar (it reads as censorship and draws the eye).

### 5.3 Real chips (never AI, never redrawn)

**Status: rendered.** `marketing/video/overlays/chips/` holds `whale`, `sniper`, `bundler`, `insider`, `dev` and `you.png` (plus smart, kol, fresh, bot): the app's own `WalletTagBadge` markup at 4× on a rounded `#11141A` plate (`marketing/tools/capture-chips.mjs`). They carry no sim wording and stay valid. Re-render only if the chip design changes: run the app dark at `deviceScaleFactor: 4`, take an element screenshot of each labelled `span.chip`, and check labels and colours against `web/components/common/WalletTags.tsx:16-30` and `web/index.css`:

| Chip | Icon | Colour |
|---|---|---|
| Whale | Waves | `#38BDF8` |
| Sniper | Crosshair | `#F87171` |
| Bundler | Boxes | `#FACC15` |
| Insider | VenetianMask | `#F472B6` |
| Dev | Code | `#FB923C` |
| You | User | accent `#FFB547` |

Each chip has a 14% tint fill. Fallback (only if a tag can't be rendered): rebuild as a vector from `WALLET_TAG_META`, and note "rebuild" in the edit log.

### 5.4 Every overlay, in order (16:9)

Times are on the output timeline. `*word*` = amber. IDs match `trailer_ovl.py`; new or renamed IDs are marked.

| ID | Text (exact) | Style / position | In → out |
|---|---|---|---|
| `letterbox` | — | 138 px `#050608` bars top and bottom | 0.0–4.2, 7.2–15.6, 24.0–25.8, 28.8–31.2 |
| `ailabel` (renamed from `aitag`) | `AI-generated` | §5.2, top-right | same spans as `letterbox` |
| `demo` (renamed from `simbug`) | `UI shown with demo data` | §5.2, top-right | 4.2–7.2, 19.8–24.0, 25.8–28.8 |
| `demo-l` (renamed from `simbug-l`) | `UI shown with demo data` | §5.2, top-left | 15.6–18.6 |
| `s1-hook` | `everything out here` / `wants your *bag.*` | Inter 900, 84 px, centred, 70 px above the bottom bar | 0.0–2.3 |
| `s1-label` | `FIELD GUIDE TO THE TRENCHES · EP.01` | Mono 500, 24 px, `#8C94A3`, +16% tracking, x 200, centred in the top bar | 0.8–2.3 |
| `s1-reticle`, `s1-chip` | Whale chip | Reticle on the eye (≈ x 885, y 262), chip beside it | 0.6–2.3, 0.7–2.3 |
| `s2-cap` | `so we built a *scope.*` | Inter 900, 88 px, centred, 70 px above the bottom bar | 2.5–4.1 |
| `s3-a` | `one habitat.` | Lower third | 4.4–5.35 |
| `s3-b` (new text) | `one habitat. *five chains.*` | Lower third | 5.4–7.1 |
| `s3-b4` (new, fallback) | `one habitat. *four chains.*` | Lower third. Only if Robinhood Chain fails C-1 | 5.4–7.1 |
| `s4-card`, `s4-sub` | `THE SNIPER` · `emptor primus` · Sniper chip / `in before you blinked.` | §5.1 | 7.35–8.9 / 7.6–8.9 |
| `s5-card`, `s5-sub` (new sub) | `THE BUNDLER` · `fasciculus unanimus` · Bundler chip / `six wallets. one trench coat.` | §5.1 | 9.15–11.3 / 9.4–11.3 |
| `s6-card`, `s6-sub` | `THE INSIDER` · `amicus devi` · Insider chip / `already inside. "just a believer."` | §5.1 | 11.55–13.1 / 11.8–13.1 |
| `s7-card`, `s7-sub` | `THE DEV` · `creator fugiens` · Dev chip / `holding the rug.` | §5.1 | 13.35–15.5 / 13.6–15.5 |
| `s8-reticle` (optional) | — | Reticle locks on Bundlers → Insiders → Dev holding rows, 0.6 s each | 15.9, 16.5, 17.1 |
| `s8-cap` | `receipts. on every token.` | Lower third | 15.8–18.5 |
| `s9-card` (opaque still) | `so naturally, you…` | Inter 900, 110 px, centred on `#0A0C10`, 3% grain | 18.6–19.8 |
| `s10-card` | `THE MOST` / `ENDANGERED` / `SPECIES` · `homo fomo` · You chip | §5.1 left-column variant | 20.0–22.55 |
| `s10-sub` | `reads the warning.` / `*buys anyway.*` | Inter 900, 54 px, x 150, y 560 | 20.3–22.55 |
| `s10-reticle` (optional) | — | Locks on the cursor at the Buy anyway click | click − 0.2 → click + 0.4 |
| `s11-cap` | `nature is not kind to late buyers.` | Inter 900, 72 px, centred, 70 px above the bottom bar | 24.2–25.7 |
| `s12-red` | `DEV SELL.` | Inter 900, 150 px, `#FF5468`, centred, top 300 px | 26.2–27.0 |
| `s12-cap` (new text) | `your exit fired *right after.*` | Lower third | 27.1–28.7 |
| `s12-note` (new) | `dev-sell exit · reacts after the dev sells` | Mono 500, 24 px, `#8C94A3`, centred, 18 px under the lower-third plate | 27.1–28.7 |
| `s13-a` (new text) | `or.` | Inter 900, 92 px, left-aligned, x 150, y 330 | 28.9–31.1 |
| `s13-b` (new text) | `look before you *ape.*` | Inter 900, 92 px, x 150, y 450 | 29.6–31.1 |
| `s13-reticle` (new) | — | Reticle locks on the hanging eyepiece, then flies to centre on the cut | 30.6–31.2 |
| ~~`s13-note`~~ | (faucet note) | **Delete** | — |
| `lock` / `end` | §9 | Opaque stills (or the animated reveal) | 31.2–33.0 / 33.0–36.6 |

---

## 6. Style bible (append verbatim to every keyframe prompt)

Only needed for an **optional** regeneration (§7.3, §12.4). The approved clips already follow it.

```text
STYLE BIBLE (same for all 8 stills): one frame from a self-aware, big-budget wildlife-documentary trailer shot like a war epic, at night, in an endless network of earthen trenches; obviously dramatized fiction played completely straight. Composed for 16:9 with letterbox-safe headroom so it survives a 2.39:1 crop, with clean dark negative space where the shot asks for it. Low-key, high-contrast light: about 80% of the frame sits in deep navy-black shadow (near #0A0C10, lifting to #1F242D in the mids); the key or rim light is a single warm flare-amber glow (#FFB547, like sodium signal flares or tungsten) carving the subject's edge; a faint cool cyan moonlight fill (#38BDF8, very low) for depth only; any other accent colour appears only where the shot names it, as a thin rim light. Volumetric haze, drifting ash, horizontal anamorphic amber lens flare. Shot on 35mm anamorphic lenses, shallow depth of field, fine 35mm film grain, subtle halation, deep blacks without crushed highlights, desaturated except amber. Mood: patient, ominous, deadpan, epic in scale. People appear only as anonymous hooded silhouettes, backlit or seen from behind, faces always lost in shadow, no hands in close-up, plain hooded cloaks with no uniforms, helmets or insignia. No readable text, letters, numbers, logos, symbols, signage, flags, UI or watermarks anywhere; every screen is blank. No weapons or guns, no gore, no real-world conflict imagery, no money or cash, no coins with emblems (any disc is a blank matte metal disc), no mascots or famous meme animals, no real people, celebrities or brands, no cartoon or 3D-render look.
```

**Consistency recipe (for any regeneration):** keyframe `s01.jpg` is **Image 1** (style reference) for every other still. Shot 11 also takes `s07.jpg` as Image 2 (set); shot 13 takes `s02.jpg` as Image 2 (prop). 2 variants per keyframe at 2K; zoom to 200% and reject any glyph, face, emblem or malformed hand. One LUT for everything: blacks to `#0A0C10`, highlights warm toward amber.

---

## 7. AI shots

### 7.1 The approved clips (reuse, no new generation)

All are Kling 3.0 Turbo image-to-video, 5 s, 1284×716, 24 fps, in `marketing/video/clips/`, with keyframes `marketing/video/keyframes/sNN.jpg` (2752×1536). The edit scales them to 1920×1080 with a 1.00 → 1.03 push. Windows are the ones in `trailer_edit.py` (start + duration inside each 5 s clip).

| Shot | Clip | Window kept | What to check at 0.25× | 4:5 window for 9:16 (x0 of a 573 × 716 crop) |
|---|---|---|---|---|
| 1 Whale | `c01` | 0.4 → 2.8 s | Frame 0 already mid-glide; the reticle follows the eye with 2–3 keyframes | x0 ≈ 230 (head, eye and both silhouettes) |
| 2 Periscope | `c02` | 0.8 → 2.6 s | Lens near centre at the end (the iris starts there) | x0 ≈ 355 (centred) |
| 4 Sniper | `c04` | 1.2 → 3.0 s | The glint | x0 ≈ 600 (lens glint and hood) |
| 5 Bundler | `c05` | 0.3 → 2.7 s | **Exactly six** figures every frame (checked: six throughout the clip) | x0 ≈ 345. The row spans about x 365–910, so the six fit with ~15 px to spare; if any frame clips the sixth hood, use a 1:1 window (716 × 716, x0 ≈ 280) for this shot |
| 6 Insider | `c06` | 0.0 → 1.8 s | No head turn | x0 ≈ 510 (table and figure); check the last frame of the push |
| 7 Dev | `c07` | 2.0 → 4.4 s | The carpet goes taut | x0 ≈ 560 (figure and carpet) |
| 11 Rug | `c11` | 0.4 → 2.2 s | Peak lift; no disc with a symbol | x0 ≈ 485 (densest arc and the carpet) |
| 13 Empty desk | `c13` | 0.5 → 2.9 s | No figure appears; monitor stays dark | x0 ≈ 355 (lamp, eyepiece, chair) |

### 7.2 What each shot carries now

| Shot | Role in v4 | Note |
|---|---|---|
| 1, 2 | The hook and "so we built a scope." | Unchanged. Frame 0 is still the `d1-field-guide.png` composition, so the Day-1 still and the trailer match |
| 4–7 | The roll call | Unchanged pictures; shot 5's subtitle changed (§2.1) |
| 11 | "nature is not kind to late buyers." | Unchanged |
| 13 | Was "respawn"; now **"or. look before you ape."** | The same picture reads differently: the periscope eyepiece hangs over an empty seat, ready. The reticle locks on the eyepiece and becomes the logo |

### 7.3 Full prompts (reference for optional regeneration only)

**Every motion prompt runs as:** Kling 3.0 Turbo · image-to-video · 5 s · 16:9 (or 9:16 for §12.4) · native audio OFF · multi-shot OFF. Budget per shot: 2 keyframes and at most 3–4 I2V tries; if a shot still fails, swap the keyframe, don't re-roll. Keep the cleanest window at 0.25×.

**Shot 1 · THE WHALE**

Keyframe:
```text
SHOT 1 · THE WHALE. From the floor of a deep earthen trench at night, looking up past rough sandbagged walls into a sky thick with flare smoke, a colossal whale glides low overhead like an airship crossing a battlefield. It fills the upper two-thirds of the frame and dwarfs the endless trench network below. Its pale underside is lit warm amber by signal flares burning far below, a thin cool moonlight edge traces its back, and mist streams off its fins. Its eye sits slightly left of frame centre. In the lower foreground, two small hooded figures stand in the trench with their backs to the camera, looking up, fully backlit so they read as pure silhouettes. Keep the lower-middle band dark and uncluttered for a caption, and the top-left corner dark for a small label. 24mm wide-angle lens, extreme low angle. Exactly one whale with plain natural anatomy: no harness, markings or scars.
```
Motion:
```text
Locked-off static camera, no camera movement. The whale glides very slowly from right to left overhead and its tail rises and falls once; flare smoke swirls and parts in its wake; ash drifts down. The two silhouettes stay completely still. Negative: morphing, warping, melting, flicker, jitter, sudden camera cut, scene change, duplicate subjects, two whales, extra fins, whale bending, extra people, figures moving, figures turning around, faces, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, zoom.
```

**Shot 2 · THE PERISCOPE**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 2 · THE PERISCOPE. A weathered brass-and-glass trench periscope rising above an earthen parapet of wet sandbags at night, seen from no-man's-land at parapet height. Its square upper lens faces the camera near the centre of the frame and reflects a field of distant amber signal flares. The parapet and the trench line recede into haze behind it, with one flare hanging high. No person is visible; whoever looks through it is hidden below the parapet. Dark, empty sky on the right third for a title. 50mm, f/2.8, eye level with the lens. Plain brass with no engravings or markings.
```
Motion:
```text
The periscope rises slowly a little higher above the sandbags while the camera cranes up with it, no zoom. Flare reflections shimmer across the lens; haze drifts; the parapet stays fixed. Negative: morphing, warping, melting, bending metal, periscope bending, extra periscopes, people, hands, faces, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, zoom.
```

**Shot 4 · THE SNIPER**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 4 · THE SNIPER. On the muddy lip of a trench parapet at night, a lone figure in a heavy hooded cloak lies prone, seen from behind and slightly to the side, eye to a long brass surveyor's spotting telescope on a low tripod. It is a telescope, not a rifle. A sharp amber glint flares on the front lens. The amber flare light stays the key; a thin soft coral-red rim light outlines the hood and shoulders. Haze crosses the parapet and distant flares hang over no-man's-land. Low angle from inside the trench, 40mm anamorphic, figure and telescope in the lower-right third, the upper-left of the frame dark and empty for a title. No visible face, no hands in close-up.
```
Motion:
```text
Locked-off static camera, no camera movement. Wind slowly ripples the hooded cloak; haze drifts across the parapet; the glint on the telescope lens flares once and fades. The figure and the telescope stay still. Negative: morphing, warping, melting, face, face distortion, distorted hands, extra limbs, extra people, multiple people, rifle, gun, weapon, figure standing up, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement.
```

**Shot 5 · THE BUNDLER**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 5 · THE BUNDLER. Six identical hooded figures stand shoulder to shoulder in a perfectly straight row along the top of a trench parapet at night, seen from the trench floor with their backs to the camera, looking out over no-man's-land. They are identical in every detail, same height, same plain cloak, same posture, same spacing, like one person copied six times. A single amber flare beyond them backlights the row, and a thin pale-yellow rim light traces each hood. Haze and ash drift between them. Symmetrical composition, low angle, 35mm, the row across the lower-middle of the frame, the upper-left dark and empty for a title. Exactly six figures, no faces, no hands visible.
```
Motion:
```text
Locked-off static camera, no camera movement. All six cloaks ripple in the wind in perfect unison; the flare beyond them flickers; haze drifts across. The six figures stay in place. Negative: morphing, warping, melting, figures merging, figures multiplying, a seventh figure, figures turning around, faces, extra limbs, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement, zoom.
```
For a native 9:16 regeneration, restage the six as **one single-file column receding in depth**, perfectly aligned (it reads even more as one guy copied six times), and count them on every frame.

**Shot 6 · THE INSIDER**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 6 · THE INSIDER. Point of view from just outside a heavy half-open steel bunker door, looking into an underground concrete war room. At its centre a large circular radar table glows warm amber from within; its surface is abstract light only, soft concentric rings with no markings. One hooded figure already sits at the table with its back to the camera, leaning back, relaxed, completely at home, outlined by a thin magenta-pink rim light from a hidden lamp. Curved dark monitors line the walls, every screen blank and unlit. Rainwater drips from the ceiling; haze hangs in the amber glow. Wide, 28mm, the dark edge of the steel door framing the left side, deep one-point perspective, the upper-left dark for a title. Exactly one person, face never visible, no hands in close-up.
```
Motion:
```text
Slow dolly in through the doorway toward the radar table, no zoom. The table's amber glow pulses slowly; rain drips; haze drifts. The seated figure stays still. Negative: morphing, warping, melting, bending walls, floating objects, zoom, figure turning, head turning, face, extra people, distorted hands, markings on the radar, text on screens, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```

**Shot 7 · THE DEV**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 7 · THE DEV. A long, dark underground banquet hall with rough timber beams. A long wooden banquet table runs from the foreground toward the far end, set with neat stacks of large, blank, unbranded matte metal discs, and the whole table stands on a long ornate carpet runner, deep red with a faded abstract gold pattern, that extends past the table's far end. At the far end, under a single amber spotlight, a hooded figure crouches and grips the end of the carpet with both hands, ready to pull; a thin orange rim light traces its outline. Symmetrical one-point perspective down the length of the table, 35mm anamorphic, camera low near table height, the nearest disc stacks soft in the foreground, dark negative space in the upper-left for a title. The figure is small in frame with no visible face. The discs and the carpet carry no symbols, letters or emblems.
```
Motion:
```text
Locked-off static camera, no camera movement. At the far end the hooded figure slowly leans back and the carpet begins to go taut; haze drifts through the spotlight. The table and the disc stacks stay perfectly still. Negative: morphing, warping, melting, face, distorted hands, extra limbs, extra people, multiple people, figure walking toward camera, discs moving, symbols on discs, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement.
```

**Shot 11 · THE RUG**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. Image 2 is the set reference: the same banquet hall, the same long table, the same red-and-gold carpet and the same blank discs. SHOT 11 · THE RUG. The same hall seen from a low side angle at the instant the carpet is yanked away: the ornate runner whips toward the far end in a rippling wave, the long table lurches, and a few dozen large, blank matte metal discs burst into the air in a wide arc, spinning and catching amber light against the deep black, frozen in slow motion. Dust explodes off the carpet. One amber spotlight from above. No people in frame. Operatic and absurd, played completely straight. Low-angle medium-wide, 35mm anamorphic, crisp detail, the airborne discs filling the upper two-thirds of the frame. Every disc is blank: no symbols, engravings, emblems or logos.
```
Motion:
```text
Extreme slow motion, locked-off static camera. The discs keep tumbling up and outward through the amber light, then begin to fall; the carpet ripples away out of frame; dust billows. Negative: morphing, warping, melting, discs merging, discs dissolving into mush, symbols on discs, coin emblems, people, hands, flicker, jitter, sudden camera cut, scene change, camera movement, speed ramp, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```

**Shot 13 · THE EMPTY DESK**

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. Image 2 is the prop reference: the same weathered brass periscope. SHOT 13 · THE EMPTY DESK. A small, dark dugout below the parapet. The lower brass eyepiece of the same periscope hangs down from the timber ceiling above a single empty, worn wooden chair that faces a plain desk with a dark, switched-off monitor. A small amber lamp clipped to a beam has just come on, throwing a tight warm pool of light over the empty chair; dust motes float in the beam. Everything else falls off into navy-black, with a thin slit of cool moonlight through the ceiling planks. Quiet, deadpan, slightly hopeful. Eye level from behind the chair, 50mm, symmetrical, chair centred, generous dark space above for a caption. No people and no hands; the chair is empty; the monitor is dark and blank.
```
Motion:
```text
The lamp flickers twice and then holds steady; dust motes drift slowly through the beam; the camera makes a very slow dolly in toward the chair, no zoom. The chair, desk and monitor stay still. Negative: morphing, warping, melting, bending walls, floating objects, person appearing, figure in chair, hands, monitor turning on, text on screen, zoom, flicker beyond the lamp, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```

---

## 8. App shots: capture specs (marketing capture mode)

Every v3 app take (`video/app-footage/*`, incl. `trailer-habitat.mp4`, `trailer-gate.mp4`, `trailer-gate-t0.3.png`, `trailer-rug.mp4`) carries sim wording. **None is used in v4.**

### 8.1 Capture settings

- `marketing/tools/capture-trailer.mjs` (CDP screencast), extended to load **`marketing/tools/capture-mode.js` with `page.addInitScript({ path })` before the first navigation** (ledger §7.1). The script doesn't load it yet.
- Dark theme, CSS viewport 1920×1080, `deviceScaleFactor: 2`, encoded at 3840×2160 so 1.3–2× punch-ins stay sharp.
- **Sign in before recording starts** (the sign-in/guest modal never appears in a take). Capture mode renames the guest to `demo`; the top bar is cropped anyway.
- Server on a fixed seed: `SIM_SEED=<seed>` (`server/app.ts:33`). The demo market is deterministic, so a dry run tells you which token dumps and when.
- Cursor driven by Playwright on smooth paths, no jitter. No hover on columns you want streaming (hover pauses a column).
- Keep out of frame (capture mode misses them, ledger §7.1): the phone drawer's sim notice, "Paper account", "paper balance", the signed-out trade-panel prompt, the copy-trade/sniper/Rewards footers, the "Faucet failed" toast. Also keep out: the "Safe"/"Safe contract" presets, the anti-MEV tooltip, the trade-panel footer fee line (hidden by capture mode; check), and the quote's **Route** venue name (a fictional launchpad name that can echo a real one; MNC-10).
- Crop or blur every **"Live"** pill (§3.5).

### 8.2 The takes

**One token for shots 8, 10 and 12.** It turns the film's middle into one real sequence: the audit was red, homo fomo bought anyway with an exit attached, the dev sold, the exit fired. No line claims the audit predicted the dump (MNC-06); it's one launch, shown as it happened.

| Take | Shot(s) | Route and action | Edit |
|---|---|---|---|
| **`v4-habitat.mp4`** (FB-02) | 3 (3.0 s) | `/sol/trenches`, hands-off, cursor parked outside the board. Start when **Near graduation** holds 2+ cards. Record 2–3 min | Keep the busiest 3.0 s: cards dropping into New, a ring filling, ideally a card landing in Migrated. Crop out the top bar, the page header (its "Live" pill and the "Launches on Solana" sub-header) and the bottom status bar ("Live", demo native prices, trades/s), keeping 16:9 at ≤ 1.15× from the 4K source. 3% push. Never punch in on one ticker |
| **Dry run** | — | Same seed. Watch `/sol/signals` with the Dev sell chip on. Pick a token that (a) shows **High risk** (rug ratio above 30%) on its audit early, with red Bundlers, Insiders and Dev holding rows, and (b) later gets a **dev sell of 20%+ of the dev's holding in one trade** (a full dump or a large trim; the slow-bleed pattern sells 8–25% chunks and may not trip the default 20% threshold). Note its address and the sim time of the dev's sell | — |
| **`v4-token.mp4`** (FB-07, FB-07b, FB-08, FB-11, FB-13) | 8, 10, 12 | Same seed, re-run. Open `/sol/token/<address>` **before** the dev's sell: 1 s candles, MCap, Markers on, Activity tab (All) visible. Start recording, then:<br>1. Hold 3 s on the right column: the **Audit** card and the Holders strip.<br>2. Trade panel → **Auto** → Buy. Clear the ladder, set **Dev sell** to **100%**, pick a small amount (a quick-amount button). Click Buy.<br>3. The real "High-risk token: …" dialog opens. Hover 0.4 s on the reasons, tick "I understand the risks and want to buy", glide to **Buy anyway**, hold 0.3 s, click. Keep 1 s of the fill toast.<br>4. Keep recording until the dev's sell lands in Activity and the **"Dev-sell exit filled · …"** toast appears, plus 2 s.<br>Your own buy moves the curve, so the dump can come earlier than in the dry run. Whatever really happens is what we show: if the exit toast says **failed**, or no dev sell trips it, the shot-12 caption can't be used; re-take on another token | See the three rows below |
| ↳ shot 8 (3.0 s) | 15.6–18.6 | From step 1 | 0.0–2.2: punch-in on the Audit card with "High risk", the rug-ratio gauge and the footer "Audit — reference only." in frame; reticle locks Bundlers → Insiders → Dev holding (static rows). 2.2–3.0: **cut** to the Holders strip. Token header out of frame. DEMO top-left |
| ↳ shot 10 (4.2 s) | 19.8–24.0 | From steps 2–3 | 0.5 s on the Auto form with "Dev sell 100%" visible and the Buy click; 2.3 s on the dialog (reasons, the **"Exit strategy · Dev sell 100%"** summary row legible, tick, click; jump cuts allowed between real moments); 1.4 s on the fill toast. ~2× punch-ins framed right of centre (§5.1). **Blur the ticker** in the dialog title and the toast. Keep the Buy button's "+ 1 exits" out of the punch-in (it's a real UI pluralisation slip; see §19) |
| ↳ shot 12 (3.0 s) | 25.8–28.8 | From step 4 | 12a, 1.2 s: 1.3× on the chart and the top Activity rows as the **Dev**-tagged SELL row lands and the candles collapse. **DEV SELL.** goes in only if the dev's sell row or marker is in frame. Blur the Activity tab's "Live" pill. 12b, 1.8 s: **jump cut** to a 2× punch-in on the toast "Dev-sell exit filled · [blur]" with its body ("Sold … for … at … MC", ticker blurred). Toast amounts are incidental demo values with DEMO on screen; never the subject (MNC-19) |

**Fallback if no clean exit is captured by Day 4:** a second token on the same seed with a full dev dump (re-run). There is no AI or mock fallback for shot 12: if the real exit can't be captured, re-cut shot 12 as 3.0 s of the dev's sell only, with "DEV SELL." and the caption **"the dev wrote an exit. now so can you."** (ledger SC-41 allowed wording), and drop the plant from shot 10's punch-in.

---

## 9. Cards

| Shot | Spec |
|---|---|
| **9 · "so naturally, you…"** | Flat `#0A0C10`, 3% grain, no motion. Inter Black 110 px, `#E6E9F0`, centred. The silence is the joke |
| **14 · The lock** | Starts on `#0A0C10`. The reticle (locked on the eyepiece in shot 13) flies to centre and becomes the **real** mark (`brand/logo/mark-dark.svg`) with the BRAND_GUIDE §12.3 reveal: ring draws (400 ms) → ticks slide in, 40 ms stagger (200 ms) → chart line draws left to right (300 ms) → amber glint crosses the ring (300 ms); the wordmark fades in (140 ms) to complete `lockup-stacked-dark.svg`, 280 px tall, top 70 px, centred. If the reveal isn't built, use the static lockup with a 140 ms fade (as v3 did).<br>**32.0:** tagline **`see who's really buying.`** Inter 600, 60 px, `#FFB547`.<br>**32.4:** chain line **`solana · base · bnb chain · ethereum · robinhood chain`**, JetBrains Mono 500, 30 px, `#E6E9F0`, +4% tracking, no outline (so it can't read as the app's chain switcher). Four-chain version: `solana · base · bnb chain · ethereum`.<br>**Bottom, from 31.2, static to 36.6** (AI, then RISK, then CHAINS; BRAND_GUIDE §13), Inter 500, `#8C94A3`, centred, no grain or scanlines over them:<br>· `AI-generated dramatization. UI shown with demo data.` (28 px)<br>· `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` (32 px, one line, ≈ 1,380 px wide)<br>· `not affiliated with any chain, launchpad or exchange named.` (28 px), 44 px from the bottom edge |
| **15 · End card** | Static hold of shot 14: no glitch or motion over anything. Adds `@trenchscope` (JetBrains Mono 500, 30 px, amber) under the chain line **only** if the owner has confirmed and holds the handle by picture lock (ledger D-1); otherwise leave it off. No URL. The last 0.5 s is silent |

---

## 10. Sound and VO

### 10.1 VO: one new take (~1.6 credits, pre-approved)

**The voice:** the same original stock TTS voice as the v3 take (`video/audio/vo-take.wav`; look it up in the Higgsfield generation history), so the soundalike check carries over. No cloning, no "in the style of", no real narrator named anywhere in the tool. An adult American voice, dry, flat, slightly bored: a park ranger reading the trailhead safety notice. Not British, not an older male, not a hushed whisper. Close-mic'd, little reverb.

**The lines and where they land:**

| # | Line | Lands at | Window | Shot |
|---|---|---|---|---|
| VO1 | "everything out here wants your bag." | 0.30 | ≤ 2.0 s | 1 Whale |
| VO2 | "so we built a scope." | 2.50 | ≤ 1.5 s | 2 Periscope |
| VO3 | "one habitat…" · "five chains." | 4.50 · 5.50 | ≤ 0.9 s · ≤ 1.0 s | 3 Habitat |
| VO4 | "the most endangered species of all." | 20.00 | ≤ 2.3 s | 10 Homo fomo |
| VO5 | "nature is not kind to late buyers." | 24.05 | ≤ 1.7 s | 11 Rug |
| VO6 | "or…" · "look before you ape." | 29.00 · 29.60 | ≤ 0.4 s · ≤ 1.2 s | 13 Empty desk |
| VO7 | "trenchscope." · "see who's really buying." | 32.00 · ~32.85 | ≤ 2.0 s total | 14 Lock |
| ALT-4 | "one habitat…" · "four chains." | as VO3 | — | Only if Robinhood Chain fails C-1 |
| ALT-L | "filmed on location. the location… is five chains." | 4.35 | ≤ 2.8 s | Only after the board is re-recorded on live data (§2.1) |

**The exact take text** (paste as one TTS generation; one blank line ≈ one second of silence, or use the tool's own pause mark between lines):

```text
everything out here wants your bag.

so we built a scope.

one habitat... five chains.

the most endangered species of all.

nature is not kind to late buyers.

or... look before you ape.

trenchscope. see who's really buying.

one habitat... four chains.

filmed on location. the location... is five chains.
```

About 17 s of speech plus pauses, close to the v3 take (20.6 s, ~1.6 credits). The two alternates ride in the same take so no second generation is needed whatever the owner decides. **One take only:** a retake costs another ~1.6 credits and goes past the ~3 pre-approved, so it needs the owner's approval. If the take is unusable, drop the VO: every line is on screen. VO1, VO2, VO4 and VO5 are word-for-word the v3 lines, so the v3 take (same voice) is a fallback for those four.

**Soundalike check:** if two people independently say it sounds like a specific real presenter, change the voice or drop the VO.

### 10.2 Music (generated, no credits)

The v3 bed, re-rendered from `marketing/tools/trailer-score.json` with `marketing/tools/synth.py`: a dark-synth bed at **100 BPM** (1 beat = 0.6 s, 1 bar = 2.4 s) with a sub drone, a 16th-note pulse, tom-like hits, brass-like braams, risers, reverse cymbals and a doc-texture layer of wind and field-recorder hiss. Every cut in §4 sits on the grid.

| Time | Cue | Change from v3 |
|---|---|---|
| 0.0 | Sub thump on frame 0, the drone starts. 0.6 reticle thunk | — |
| 2.4–4.2 | Servo whir and a short riser; whoosh on the iris (3.8) | — |
| 4.2 | The pulse and ticks kick in (9.0 s) | — |
| 7.2 / 9.0 / 11.4 | Roll-call braams, a half-step up each time | — |
| 13.2 / 14.0 / 14.8 | Music drops to one high note; heartbeat booms | — |
| 15.6 | Pulse and ticks return (3.0 s); riser from 16.6 | — |
| 18.6 | **Digital silence** (1.2 s) | — |
| 19.8 | Room tone. The **sub-boom on the Buy anyway click frame** (≈ 22.4; read it from the take), fill blip 0.15 s later. Riser 23.4 → 24.0 | Boom moves from 23.2 to the real click frame |
| 24.0 | Reverse cymbal into the sub drop and whoosh on the yank | — |
| 25.8 | Glitch on the cut. **26.2** braam (pitch 0.84) on DEV SELL | 26.3 → 26.2, on the collapse frame |
| ~27.1 | **New:** a clean fill blip (glitch, gain 0.35) on the frame the exit toast lands | New |
| 28.7 | Tape-stop into silence (0.9 s); a lamp click (glitch, gain 0.25) at 28.9; VO6 "or…" in the silence | Lamp click added |
| 30.6 | Soft two-note chime (logo_hit, gain 0.3), after "look before you ape." | Was 30.0 on "respawn." |
| 31.2 | Riser (0.6 s). **31.8: final BRAAM + logo hit** as the ticks land | — |
| 33.0 | Ring-out, wind returns. 35.6: faint synth note. **36.1–36.6: silence** | — |

**Mix** (`marketing/tools/trailer_mix.sh`): VO high-passed at 80 Hz, compressed, music side-chain ducked about −8 dB under it. **Master:** −14 LUFS integrated, −1 dBTP, AAC-LC 48 kHz. Music is generated only: no licensed or recognisable score.

---

## 11. Captions (SRT, 16:9 master)

The burned-in caption lines with their timings. Use the file on platforms that take one; on X the captions are burned in because autoplay is muted. If Robinhood Chain fails C-1, cue 4 reads "one habitat. four chains."

```srt
1
00:00:00,000 --> 00:00:02,300
everything out here wants your bag.

2
00:00:02,500 --> 00:00:04,000
so we built a scope.

3
00:00:04,400 --> 00:00:05,400
one habitat.

4
00:00:05,400 --> 00:00:07,100
one habitat. five chains.

5
00:00:07,350 --> 00:00:08,900
THE SNIPER
in before you blinked.

6
00:00:09,150 --> 00:00:11,300
THE BUNDLER
six wallets. one trench coat.

7
00:00:11,550 --> 00:00:13,100
THE INSIDER
already inside. "just a believer."

8
00:00:13,350 --> 00:00:15,500
THE DEV
holding the rug.

9
00:00:15,800 --> 00:00:18,500
receipts. on every token.

10
00:00:18,600 --> 00:00:19,800
so naturally, you…

11
00:00:20,000 --> 00:00:21,300
THE MOST ENDANGERED SPECIES
homo fomo

12
00:00:21,300 --> 00:00:22,550
reads the warning. buys anyway.

13
00:00:24,200 --> 00:00:25,700
nature is not kind to late buyers.

14
00:00:26,200 --> 00:00:27,000
DEV SELL.

15
00:00:27,100 --> 00:00:28,700
your exit fired right after.

16
00:00:28,900 --> 00:00:29,600
or.

17
00:00:29,600 --> 00:00:31,100
or.
look before you ape.

18
00:00:32,000 --> 00:00:33,800
trenchscope. see who's really buying.
```

---

## 12. The 9:16 cut (`launch-2`, QT-3)

**Format:** 1080×1920, H.264, 30 fps, **30.0 s** (50 beats). A re-framed, re-timed cut with new phone-layout captures, not a letterbox of the master and not a bare repost.

### 12.1 Treatment

| Element | 9:16 treatment |
|---|---|
| **AI shots** | **4:5 windows** from the existing clips: a 573 × 716 crop (x0 per shot in §7.1) scaled to **1080 × 1350** (lanczos, light unsharp), centred at y 285–1635, with painted `#050608` bars above and below (the letterbox grammar, vertical). That's a 1.9× upscale of 720p footage: check every AI shot on a phone at 100%. If one looks mushy, show it as a 4:3 window instead (955 × 716 → 1080 × 810), which is what `x/LAUNCH_DAY.md` §10 specifies for `launch-2`; the owner picks one rule for all eight shots |
| **App shots** | **Re-captured in the app's real phone layout**, not cropped from desktop: viewport 390 × 844, `deviceScaleFactor` ≈ 2.77 (1080 × 2338), capture mode loaded, the nav drawer closed. Board: `/sol/trenches` phone tabs (New column) streaming. Token page: the **Info** tab (Audit + Holders strip) for shot 8, the **Trade** tab (Auto → dialog) for shot 10, the **Chart** tab (1 s candles, dev marker) for shot 12a. Same seed and same actions at the same sim times as the desktop `v4-token` take, so the same token dumps. Crop each to 1080 × 1920; blur the board header's "Live" pill |
| **Toasts** | On phones toasts sit full-width at the top, under the DEMO label's spot. For shots 10c and 12b, punch in (≈1.3×) so the toast lands in the upper-middle band, below the label |
| **Corner labels** | DEMO / AI, **38 px** (≥ 2% of 1920; BRAND_GUIDE §9.1 asks ≥ 36), top-right, 160 px from the top and 48 px from the right, below X's player chrome. On AI shots the label sits inside the 4:5 window's top edge |
| **Text** | Species names move to top-centre, in the band above the AI window (y ≈ 150–285). Captions 72–96 px, subtitles 64–76 px, mono notes ≥ 36 px. Everything in the centre 80% width, **above the bottom 20%** (y < 1536) and clear of the right ~140 px action column |
| **End card** | Stacked lockup 360 px tall at y ≈ 300. Tagline 76 px. Chain line on two lines, 40 px: `solana · base · bnb chain` / `ethereum · robinhood chain`. Disclaimers between y ≈ 1050 and 1530: AI line 40 px (2 lines), RISK 44 px (3 lines), CHAINS 40 px (2 lines). Held 3.6 s (26.4–30.0), nothing moving over them |

### 12.2 Timing

| Shot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s | 2.4 | 1.8 | 3.0 | 1.2 | 1.8 | 1.8 | 1.2 | 2.4 | 1.2 | 3.6 | 1.8 | 2.4 | 1.8 | 1.2 | 2.4 |
| starts | 0.0 | 2.4 | 4.2 | 7.2 | 8.4 | 10.2 | 12.0 | 13.2 | 15.6 | 16.8 | 20.4 | 22.2 | 24.6 | 26.4 | 27.6 |

Every duration is a whole number of 0.6 s beats. Shots 1–3 keep their master length so VO1–VO3 land unchanged. The Bundler and the Insider keep 1.8 s for their 5-word subtitles; the Sniper ("in before you blinked.") and the Dev ("holding the rug.") get 1.2 s. Shot 10: 0.5 s Auto form, 2.1 s dialog, 1.0 s toast. Shot 12: 1.2 s chart, 1.2 s toast.

**VO placements (same take):** VO1 0.30 · VO2 2.50 · VO3 4.50 / 5.50 · VO4 17.00 · VO5 20.45 · VO6 24.80 / 25.30 · VO7 26.90.

**Music:** the same bed re-cut on the grid: braams at 7.2 / 8.4 / 10.2, heartbeat at 12.0 and 12.6, pulse 13.2–15.6 with a riser from 14.4, silence 15.6–16.8, sub-boom on the click frame, yank at 20.4, braam on DEV SELL, fill blip on the exit toast, silence 24.5–25.1 with the lamp click at 24.7, riser 26.4, final braam 27.0, silence from 29.5. No chime (no room for it after VO6).

### 12.3 SRT (9:16)

```srt
1
00:00:00,000 --> 00:00:02,300
everything out here wants your bag.

2
00:00:02,500 --> 00:00:04,100
so we built a scope.

3
00:00:04,400 --> 00:00:05,400
one habitat.

4
00:00:05,400 --> 00:00:07,100
one habitat. five chains.

5
00:00:07,300 --> 00:00:08,300
THE SNIPER
in before you blinked.

6
00:00:08,500 --> 00:00:10,100
THE BUNDLER
six wallets. one trench coat.

7
00:00:10,300 --> 00:00:11,900
THE INSIDER
already inside. "just a believer."

8
00:00:12,100 --> 00:00:13,100
THE DEV
holding the rug.

9
00:00:13,400 --> 00:00:15,500
receipts. on every token.

10
00:00:15,600 --> 00:00:16,800
so naturally, you…

11
00:00:17,000 --> 00:00:18,200
THE MOST ENDANGERED SPECIES
homo fomo

12
00:00:18,200 --> 00:00:19,350
reads the warning. buys anyway.

13
00:00:20,600 --> 00:00:22,100
nature is not kind to late buyers.

14
00:00:22,500 --> 00:00:23,300
DEV SELL.

15
00:00:23,450 --> 00:00:24,500
your exit fired right after.

16
00:00:24,700 --> 00:00:25,200
or.

17
00:00:25,200 --> 00:00:26,300
or.
look before you ape.

18
00:00:26,900 --> 00:00:28,900
trenchscope. see who's really buying.
```

### 12.4 Optional AI for the 9:16 cut (owner approval only)

The cut above needs **no new generation**. Two upgrades, priced from this account's own transaction history (Nano Banana Pro still ≈ 2 credits; Kling 3.0 Turbo 5 s ≈ 7.5):

| ID | What | Estimate | Note |
|---|---|---|---|
| OPT-V1 | Native 9:16 **whale hero** for frame 0: 1 still (approved `s01.jpg` as Image 1 and Image 2) + 1 clip with the shot-1 motion prompt | ≈ 9.5 credits | The same item as `x/LAUNCH_DAY.md` §10's optional whale hero. Biggest win for the thumbnail |
| OPT-V2 | Native 9:16 **minimum set**: shots 1, 5 (the single-file column, §7.3), 11 and 13 | ≈ 38 credits (4 × 9.5) | **More than the ~28 credits left**: needs a top-up, or drop one shot (≈ 28.5 for three). Includes OPT-V1 |

Check the quote in Higgsfield before running either. Count every still, clip and kept clip in the generation log, because QT-2 quotes those numbers.

---

## 13. Teasers cut from the same clips

Both are warm-up posts: **no "live", no link, no date, no weekday, no time**. Both are cut from the approved clips with **no new AI generation**, run longer than 10 s (X's video-quality gate), and are unique cuts: the trailer keeps only 1.8–2.4 s of each clip, the teasers run full 5 s takes with their own text. Post natively with X's "Made with AI" label on. The posts, alt texts and slots live in `x/WARMUP_WEEK.md`; this section is the edit.

Common spec: 1920 × 1080, 30 fps, H.264, 8–12 Mbps, AAC (or silent). Clips scaled 1284 × 716 → 1920 × 1080 with 2.39:1 bars painted. AI label `AI-generated` top-right for the whole AI section (§5.2). Frame 0 designed as the thumbnail; text on screen by 0.3 s. Last 0.3 s silent.

### 13.1 `fg-bundler` (was `d6-c`, "THE BUNDLER") · ~11.0 s · posts as D3-P3, Day 3, 3:00 p.m. ET

Built on the field-guide template (`x/WARMUP_WEEK.md` §9.1).

| Time | Picture | On screen (exact) | Sound |
|---|---|---|---|
| 0.0–5.0 | `c05`, the full 5 s (six figures on every frame: checked) | Frame 0: kicker `FIELD GUIDE TO THE TRENCHES` (Mono 500, 24 px, `#8C94A3`, top-left in the bar). Reticle locked on the centre of the row. Species name **`THE BUNDLER`** + real Bundler chip + `fasciculus unanimus` (§5.1). 0.3 s: caption **`six wallets, one trench coat.`** (Inter 700, 56 px, bottom centre, "trench coat." amber). AI label | Six identical hits flammed into one on frame 0, drone, wind |
| 5.0–11.0 | **Definition card** (end slate) on `#0A0C10`: `marketing/tools/cards.py` `chip-explainer`, kicker `TRENCH DICTIONARY` | Bundler chip · **`bundler`** · `bought in the same block the coin was created.` · `on the audit, share of volume: up to 10% green · up to 30% amber · over 30% red` · footer `high risk · nfa` and the mark on the bottom edge. Held 6 s, static | Room tone, one soft lock click on the cut |

Claims: SC-21 bundler rule (`server/analytics/tokens/track.ts:8,209`), audit thresholds (`server/analytics/tokens/security.ts:470-597`; share of volume, `server/analytics/tokens/index.ts:476,496`). Not "funded by the dev" (that's the insider rule).

**Sync note for `WARMUP_WEEK.md` §9.2:** its row lists the caption as `the bundler. six wallets, one trench coat.` with no separate title. Here the species name carries "the bundler", so the caption drops it. Either works; the alt text in D3-P3 reads correctly for both.

### 13.2 `teaser-soon` (was `d7-a`) · ~13.5 s · posts as D7-P4, Day 7, 8:30 p.m. ET

| Time | Picture | On screen (exact) | Sound |
|---|---|---|---|
| 0.0–5.0 | `c02`, the full 5 s: the periscope rising over the sandbags | 0.0–4.6: **`everyone in the trenches is larping.`** (Inter 900, 76 px, centred lower third, "larping." amber). At 4.4 the reticle centres on the lens and **iris-wipes** (4.6–5.0) into the next shot. AI label | Drone, servo whir, a whoosh on the iris |
| 5.0–10.0 | `c13`, the full 5 s: the eyepiece hanging over the empty chair, the lamp glowing | 5.3–9.8: **`the wallets aren't.`** (same style, "aren't." amber). AI label | A lamp click on the cut, then near-silence and room hum |
| 10.0–13.5 | **End slate** on `#0A0C10` | 10.0–11.2: the mark reveal (BRAND_GUIDE §12.3), then the stacked lockup. 10.6: **`see who's really buying.`** (Inter 600, 56 px, `#E6E9F0`). 11.2: **`soon.`** (Inter 900, 96 px, `#FFB547`). Nothing else: no date, weekday, time, chain list or handle | Braam on the ticks (≈ 10.6), ring-out, silence from 13.2 |

Lowercase cards, as `WARMUP_WEEK.md` §9.2 and BRAND_GUIDE §9.1 ("headlines are lowercase") require; the brief's capitalised card names were the old working titles. "soon." is the only time-word (MNC-13, MNC-21). Whether warm-up teasers need `high risk · nfa` is legal check L-1; if yes, add it at 24 px muted under "soon.".

`WARMUP_WEEK.md` §9.4 OPT-2 (a fresh Kling take of shot 13 for this teaser, ≈ 7.5 credits, owner-approved) is the only upgrade; the cut works without it.

---

## 14. Production order and QA

### 14.1 Order (relative days of the warm-up week)

| When | Work |
|---|---|
| **Day 1** | Lock this script. Owner answers §19. Extend `capture-trailer.mjs` with capture mode (§8.1). Update `trailer_ovl.py` / `trailer_edit.py` / `trailer_mix.sh` / `trailer-score.json` (§18) |
| **Day 2** | Build `fg-bundler` (posts Day 3). Desktop captures in one session: `v4-habitat`, the dry run, `v4-token`. Frame check |
| **Day 3** | Phone-layout captures (same seed, same actions). **The one VO take** (~1.6 credits). Re-render the score. Rough cut on the grid |
| **Day 4** | Overlays rebuilt; fine cut; grade. Last day for the shot-12 fallback decision (§8.2) |
| **Day 5** | 9:16 cut. Owner decides OPT-V1/V2 (§12.4); run only if approved |
| **Day 6** | QA (§14.3) on both cuts, exports. Build `teaser-soon` |
| **Day 7** | **Picture lock by 6:00 p.m. ET.** `teaser-soon` posts 8:30 p.m. ET |
| **Launch day** | 9:00 a.m. ET launch gate. If it passes, apply the chain swaps (§4) if needed, re-export, post per §16 |

### 14.2 Exports

- **16:9 master:** MP4, H.264, AAC-LC, 1920×1080, 30 fps, 8–12 Mbps, 36.6 s (well under X's 140 s non-Premium cap, above the 10 s video-quality gate). **Fallback:** 1280×720 at 6 Mbps.
- **9:16 cut:** 1080×1920, same codec, 30.0 s.
- **Four-chain versions** of both, pre-rendered, in case Robinhood Chain fails C-1 on the morning.
- **Thumbnail check:** frame 0 is the whale, the reticle, one caption and the AI label.

### 14.3 QA (all must pass)

- [ ] 8 AI shots exactly, from the approved clips. Zoom to 200%: no glyphs, faces, emblems, weapons, insignia or close-up hands. At 0.25×: no morphing; still six bundlers.
- [ ] AI label on every AI frame, DEMO on every app frame, exact case, swapping on the cut, never covering a toast or the subject.
- [ ] Frame check on every app frame: no `paper`, `simulat`, `faucet`, `top up`, `guest`, `fake`, `fictional`, `no real funds`, `0.8%`. No "Live" pill. No venue name. No ticker legible anywhere, incl. both toasts and the dialog title. No "Safe" preset, no anti-MEV tooltip.
- [ ] No Robinhood Chain in any UI frame; it appears only in the chain line and VO3.
- [ ] No app footage speed-ramped. DEV SELL appears only over the dev's real sell. "your exit fired right after." appears only over a real "Dev-sell exit **filled**" toast on the same token.
- [ ] End card: AI, RISK and CHAINS on screen ≥ 3 s (5.4 s in the master, 3.6 s in the 9:16), legible on a phone, nothing moving over them. RISK and CHAINS are the exact ledger texts.
- [ ] The chain line and s3-b match the chains that passed C-1. The handle is the confirmed, owned handle or it's absent. No URL, no date, no "live" anywhere in the video.
- [ ] ≤ 3 flashes per second, no full-screen red. Captions readable on a phone at 100%.
- [ ] Music generated only. The VO voice passed the soundalike check, or the VO is dropped.
- [ ] Generation log updated (the VO take, any optional generation). QT-2 fills its `[N]` from this log only.

---

## 15. The X posts

`x/LAUNCH_DAY.md` §2 and §5 own the posting copy. These are **verbatim copies, re-measured with `xlen.py`**, so the cut and the copy can't drift. Every trailer caption is a launch-day post about trading: **gated, and RISK as its last line**. No link, hashtag, @-mention, cashtag or emoji in any of them. Pick one per video; never repost a video with another caption.

### 15.1 16:9 master · TR-A (recommended) · 273/280

```text
we made a nature documentary to launch a trading terminal. we are not ok.

trenchscope is live. which species gets you every time: the sniper, the bundler, the insider or the dev?

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

It names no chain, so it survives any chain failing C-1. The question maps onto the film's four species and can be answered in one word; it asks for an opinion, not a like, follow or repost.

### 15.2 16:9 alternates

**TR-B · field guide + five chains · 258/280** (four chains: 241/280, `...one memecoin terminal for sol, base, bsc and eth. see who's...`)

```text
field guide to the trenches, ep.01.

trenchscope is live: one memecoin terminal for sol, base, bsc, eth and robinhood chain. see who's really buying, before you do.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

**TR-C · the CT hook · 264/280**

```text
everyone in the trenches is larping. the wallets aren't.

trenchscope is live. snipers, bundlers, insiders and the dev get tagged by rule, so you see who's really buying.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

### 15.3 9:16 cut · QT-3 (quote of the trailer, 8:30 p.m. ET) · 259/280 (four chains: 242/280)

```text
gm asia. vertical cut.

the trenches never close. trenchscope tags the snipers, bundlers, insiders and the dev on sol, base, bsc, eth and robinhood chain. it's live.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Four chains: `...and the dev on sol, base, bsc and eth. it's live.`

**SPARE · 267/280** (new in this file; not for launch day. Only for a *new* cut 48 h or more later, e.g. a re-framed 9:16 posted as an original, never the same file twice):

```text
field guide to the trenches, ep.01, the vertical edit.

the sniper. the bundler. the insider. the dev. and homo fomo, who read the warning, ticked the box and bought anyway.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

### 15.4 Video descriptions (X's description / alt-text field, ≤ 1,000 characters)

**16:9 (979 characters).** This updates `x/LAUNCH_DAY.md` §2's text for the dev-sell exit beat (that file's version ends the app sequence at "a chart collapsing after a dev sell"); paste this one:

```text
AI-generated trailer for Trenchscope, a memecoin trading terminal, made as a deadpan wildlife documentary shot like a war epic. A giant whale glides over night-time trenches while two hooded figures watch, and a brass periscope rises over the sandbags. Hooded figures are introduced as species, each with a wallet tag from the app: a sniper at a brass telescope, six identical bundlers in a row, an insider already seated at a glowing table, a dev gripping the end of a carpet. Screen recordings of the real app, each labelled UI shown with demo data, show the launch board, a token audit, a high-risk warning where the buyer ticks the box and clicks Buy anyway, then a dev sell, a collapsing chart and the buyer's dev-sell exit filling. A carpet is yanked from under a banquet table and blank plates fly. A lamp glows over an empty desk. End card: see who's really buying, a risk warning, and a note that Trenchscope isn't affiliated with any chain, launchpad or exchange named.
```

**9:16 (594 characters)**, updating QT-3's description the same way:

```text
AI-generated vertical cut of the Trenchscope trailer, a deadpan wildlife documentary shot like a war epic. A whale over the trenches, a periscope, and hooded species with their wallet tags: the sniper, six identical bundlers, the insider, the dev. Phone-layout screen recordings of the real app, labelled UI shown with demo data, show the board, the audit, the high-risk warning, a dev sell and the buyer's dev-sell exit filling. The carpet gets yanked. End card: see who's really buying, a risk warning, and a note that Trenchscope isn't affiliated with any chain, launchpad or exchange named.
```

### 15.5 Teaser posts (verbatim from `x/WARMUP_WEEK.md`)

- **D3-P3** (`fg-bundler`) · 227/280: `field guide to the trenches: the bundler.` / `travels in packs. bought in the same block the coin was created. six wallets, one trench coat.` / `on the audit, bundlers show as a share of the coin's volume. past 30%, the row goes red.`
- **D7-P4** (`teaser-soon`) · 133/280: `everyone in the trenches is larping. the wallets aren't.` / `one scope for solana, base, bnb chain, ethereum and robinhood chain.` / `soon.` (Gate C-1 per chain named; drop "robinhood chain" if it isn't ready.)

### 15.6 Self-replies

The launch thread T1–T10 and SAFE-L1 are in `x/LAUNCH_DAY.md` §3. `[LINK]` goes in T1 only; T9 carries CUSTODY verbatim. Nothing in this script changes them.

---

## 16. Posting plan · Launch day (ET)

Mirrors `x/LAUNCH_DAY.md` §0 and §4; that file wins if they differ.

| ET | Do | Notes |
|---|---|---|
| Day 7, by 6:00 p.m. | Master and 9:16 locked and QA'd (§14) | Otherwise the launch moves |
| **9:00** | **Launch gate** (LAUNCH_DAY §1.1): C-1 per chain, K-1, F-1. No go → nothing posts | If a chain fails, export the four-chain versions (§4) |
| 9:10 | Composer on desktop, **native upload** of the 16:9 master. Paste **TR-A** and the §15.4 description. **Turn on "Made with AI"** | Thumbnail = frame 0. Stalled 5+ min → the 720p fallback |
| 9:20 | Add T1–T10 as the thread, **don't publish** | `[LINK]` in T1 only |
| **10:00:00** | **Publish** | — |
| 10:01 | Pin the trailer (it replaces the Day-1 pin) | — |
| 10:03 | SAFE-L1 under the trailer | — |
| 10:05–12:00 | Answer every reply within ~5 min, in fresh words. Answers to "which species" get a one-line mechanism: blocks 1–3 after creation (sniper), the creation block (bundler), dev-funded wallets (insider), dev status and the dev-sell signal (dev). Scam sweep every 15 min | No other originals, no quoting yourself |
| 10:15 | Watch it once in the X phone app: captions, DEMO and AI labels, the end card readable | — |
| 10:30 → 12:00 | T+30 / 60 / 90 / 120 snapshots (LAUNCH_DAY §11). The cold-start audition ends around 2 h or 200 views (CT_PLAYBOOK §3.3; a heuristic) | Never edit or delete the trailer |
| **1:30 p.m.** | **QT-1** "the trailer is AI. the terminal isn't." (`launch-10`) | A different token and cut from shot 12 |
| **6:15 p.m.** | **QT-2** making-of: `8 stills. 8 clips. 8 kept. 2 voice takes.` once this VO take exists (recount from the log). Hold rule applies | AI is the disclosure, never the headline |
| **8:30 p.m.** | **QT-3** with the **9:16 cut**. "Made with AI" on again, §15.4 description | A new cut with new words, not a bare repost |

---

## 17. Claims map (every on-screen and spoken line)

| Line | Basis | Status |
|---|---|---|
| "everything out here wants your bag." · "holding the rug." · "in before you blinked." · 'already inside. "just a believer."' · "nature is not kind to late buyers." · "so naturally, you…" | Jokes, no factual claim. The species map to the app's tags (SC-19, SC-21); no accuracy claim (MNC-06) | — |
| "six wallets. one trench coat." | SC-21 allowed wording; bundler = bought in the creation block (`server/analytics/tokens/track.ts:8,209`) | GREEN |
| "so we built a scope." · "receipts. on every token." | SC-09 every token gets an audit (`server/analytics/tokens/security.ts:470-597`; `web/components/token/SecurityPanel.tsx`); SC-48 holders by tag (`web/components/token/HolderStrip.tsx`). Never "catches every" | GREEN |
| "one habitat. five chains." · chain line · VO3 | SC-42 one terminal with a chain switcher (`shared/chains.ts:5-7`; four chains in the UI); SC-43 real execution and SC-45 Robinhood Chain are not in the code | **OWNER: C-1 per chain**. The trailer posts only after the gate |
| Real chips (Whale, Sniper, Bundler, Insider, Dev, You) | SC-19, the app's own render (`web/components/common/WalletTags.tsx:16-30`) | GREEN |
| Audit card, "High risk", rug ratio, red rows, Holders strip | SC-09, SC-10 (`server/analytics/tokens/security.ts:362-447`). The footer "Audit — reference only." is capture mode's rewrite of the sim text (`web/components/token/SecurityPanel.tsx:79`) | GREEN (check the live build's footer, F-6) |
| Auto buy with a dev-sell exit; "Exit strategy · Dev sell 100%" | SC-14, SC-41: a buy carrying an exit strategy (`web/components/token/trade/AutoForm.tsx:85-98`, the summary row at `:94`; `web/components/trade/StrategyEditor.tsx:49`; `server/trading/orders.ts:183-184`) | GREEN (K-2 for how it signs on a self-custody build) |
| Risk dialog, reasons, tick, **Buy anyway** | SC-08: trade-panel buys (Market and Auto) on a honeypot or high-risk token (`web/components/token/model.ts:119-129`; `web/components/token/trade/useTradeExecutor.tsx:53-110`). The film shows the trade panel, so it doesn't need SC-08c | GREEN |
| "reads the warning. buys anyway." | Describes what the footage shows | — |
| "DEV SELL." | A Dev-tagged sell in frame (dev = creator, `server/analytics/tokens/track.ts:99-101`) | GREEN, only over a real dev sell |
| "your exit fired right after." · `dev-sell exit · reacts after the dev sells` · the "Dev-sell exit filled" toast | SC-41: a dev sell of ≥ 20% of the dev's holding in one trade fires the order (`server/trading/orders.ts:29,263-271`), which goes through the normal swap path and notifies "Dev-sell exit filled" (`server/trading/orders.ts:281-312`). It reacts after the dev's sell; never "before", "beat" or "front-run" (MNC-17) | GREEN (F-1, K-2) |
| "or. look before you ape." | An idiom, no capability claim. Chosen over "see it coming", which implies rug prediction (MNC-06) | — |
| "see who's really buying." · "trenchscope." | POSITIONING tagline (ledger LINES) | GREEN |
| AI line, RISK, CHAINS, DEMO, AI labels | Ledger §6 exact texts; BRAND_GUIDE §13 placement | Required |
| ALT-L "filmed on location. the location is five chains." | Only over live-data footage, after launch | OWNER (C-1), post-launch only |

**Not in the film:** external stats, PnL, fee numbers, speed claims, AI-product claims (MNC-07), token talk (MNC-02), roadmap (MNC-13), real people, real tickers, chain or competitor logos, "live", a URL.

---

## 18. Tool changes this cut needs (for the owners of those files)

| File | Change |
|---|---|
| `marketing/tools/trailer_ovl.py` | Rename `simbug`/`simbug-l` → `demo`/`demo-l` with the text `UI shown with demo data` and the BRAND_GUIDE §10 style (`#E6E9F0` at 85% on a `#0A0C10`/80% plate, Mono 500, exact case); `aitag` → `ailabel`, text `AI-generated`, top-right. New texts: `s3-a`, `s3-b`, `s3-b4`, `s5-sub`, `s12-cap`, `s12-note`, `s13-a`, `s13-b`. Delete `s13-note`. Rebuild `lock()` per §9: tagline `see who's really buying.`, the chain line, the AI / RISK / CHAINS block; remove the paper pill, "larp the trenches.", "no real bags…" and the DIS-06/DIS-10 lines. Subtitle size 52 → 56 px. Add a 1080×1920 variant for §12 |
| `marketing/tools/trailer_edit.py` | Sources: shot 3 → `v4-habitat.mp4`; shots 8, 10, 12 → `v4-token.mp4` (new start/end/crop per the take, shot 12 split 1.2 + 1.8 s); blur boxes re-measured on the new take. Overlay list per §5.4. `AI` windows unchanged |
| `marketing/tools/trailer_mix.sh` | New `atrim` windows from a word-timestamp pass on the new take; delays 300 / 2500 / 4500 + 5500 / 20000 / 24050 / 29000 + 29600 / 32000 (ms). Eight inputs to `amix` (VO3 and VO6 are two pieces each, VO7 one) |
| `marketing/tools/trailer-score.json` | Boom 23.2 → the click frame; braam 26.3 → 26.2; new glitch (gain 0.35) on the exit toast; glitch (gain 0.25) at 28.9; `logo_hit` 30.0 → 30.6 at gain 0.3. A second event list for the 9:16 timing (§12.2) |
| `marketing/tools/capture-trailer.mjs` | Load `capture-mode.js` via `page.addInitScript({ path })`; the `v4-token` sequence (§8.2); a phone-layout mode (390 × 844, DSF 2.77) |

---

## 19. Open owner decisions

1. **Shot 3 line:** "one habitat. five chains." (recommended, honest over demo data) or the brief's "filmed on location. the location is five chains." (recorded as ALT-L; use only once the board is re-recorded on live data).
2. **Shot 13 line:** "or. look before you ape." (recommended) or the brief's "or. see it coming." (reads as rug prediction, MNC-06).
3. **Shot 12 depends on a real capture:** the dev's sell has to trip the exit on the recorded token. If it can't be captured by Day 4, use the fallback in §8.2 ("the dev wrote an exit. now so can you.").
4. **9:16 AI framing:** 4:5 windows (this file; bigger on the phone, 1.9× upscale) or 4:3 (LAUNCH_DAY §10; sharper, smaller). Pick one for all eight shots after the phone check.
5. **Optional credits:** OPT-V1 whale hero (≈ 9.5), OPT-V2 four native 9:16 shots (≈ 38, more than the ~28 left), a VO retake (≈ 1.6, beyond the pre-approved ~3), `teaser-soon` OPT-2 (≈ 7.5, in WARMUP_WEEK).
6. **Handle on the end card:** only once confirmed and held (D-1).
7. **Small UI fix before capture (optional):** the Auto buy button reads "+ 1 exits" (`web/components/token/trade/AutoForm.tsx:126`). Fixing the plural lets shot 10 show the button; otherwise it stays out of the punch-in.
8. **K-2:** the dev-sell exit is a server-side order. How it signs on a self-custody build decides whether the custody line and this beat can sit in the same post.
9. **L-1:** whether the warm-up teasers need `high risk · nfa`.
