> **Being rewritten.** The positioning changed: Trenchscope is now marketed as a real multi-chain memecoin trading terminal (Solana, Base, BSC, Ethereum, Robinhood Chain) with self-custody, not a simulator. Every "sim", "paper trading" and "no real funds" line below is out of date. Don't post from this file until it is rewritten. For today, use `marketing/x/TODAY.md`.

# Trailer script: Field Guide to the Trenches, EP.01 (final)

| | |
|---|---|
| **What** | The launch trailer for Tue Oct 27, 10:00 a.m. ET (`launch-1` in `marketing/x/LAUNCH_DAY.md`) |
| **Runtime** | **36.6 s** master, 16:9, 1920×1080, 30 fps. A 9:16 cut of about 30 s is in §12 |
| **Mix** | **8 AI shots** (16.8 s), **4 real screen recordings** (13.2 s), **3 typographic cards** (6.6 s) |
| **Muted** | The story works muted. Every joke and every VO line is also burned in on screen |
| **Built from** | The top-scoring concept "Field Guide to the Trenches: EP.01" (114), with grafts from "BUY ANYWAY" and "3AM IN THE TRENCHES" and fixes for every judge note (§2) |
| **Rules** | `marketing/research/CLAIMS_LEDGER.md` wins any conflict. Then `brand/BRAND_GUIDE.md` §11–13, `research/AI_VIDEO_NOTES.md` and `research/CT_PLAYBOOK.md` |
| **Placeholders** | `@trenchscope` (handle not confirmed) and `[LINK]` (no live URL). Neither appears in the video except the handle on the end card |

---

## 1. Logline

A deadpan wildlife documentary, shot like a war epic, about the most dangerous habitat on the internet: the memecoin trenches. Trenchscope is the scope. Each species (the Sniper, the Bundler, the Insider, the Dev) gets a field-guide card with its **real in-app wallet tag**, and the real audit panel shows the receipts. Then the most endangered species of all, *homo fomo*, reads the real "High-risk token" warning and clicks **Buy anyway**. The carpet gets yanked and the sim chart prints an unstaged **dev sell** (a simulated one, like everything in the app). Relax, it's paper: fake money, respawn. **Larp the trenches.**

---

## 2. What changed, and why

### 2.1 Fixes for every weakness the judges flagged in the winning concept

| Judge note on "Field Guide" | Fix in this cut |
|---|---|
| The comedy relied on a narrator, but autoplay is muted | Every line is on screen. The VO only repeats on-screen text, so it is optional |
| Frame 0 stacked four elements | Frame 0 has the image, the reticle and **one** caption. The Whale chip pops at 0.7 s and the EP.01 label arrives at 0.8 s |
| Species cards carried 4 text layers in 2 s | Each card has the name with the real chip on one line and one subtitle of 5 words or fewer. The Bundler line has 6 words and gets 2.4 s. The Latin is a 26 px mono freeze-frame easter egg. Cards run 1.8–2.4 s |
| "Every species here wants your bag" is wrong for a whale | Changed to **"everything out here wants your bag."** It makes no claim about the whale as a species |
| The KOL peacock picks a fight with the accounts that drive CT reach | KOL species dropped. The sim token has no KOL rows anyway |
| Drifts from the war/trench larp world and the §11 key-art system | Every species is a hooded trench archetype inside the K-shot world: K1 Periscope, K2 War Room, K6 Rug, K7 Respawn. All 8 shots share one style bible. The whale is restaged as an airship crossing a battlefield |
| "Larp" only landed at 30.5 s | The SIM bug is up at 4.2 s and **"filmed on location. the location is a simulator."** lands at 5.4 s. Then "rug: real-feeling. money: fake." at the climax, and "relax. it's paper." / "respawn." |
| The rug came before Buy anyway, which killed cause and effect | New order: warning → **Buy anyway** → carpet yank → real dev sell → respawn |
| No respawn payoff | K7: a lamp clicks on over an empty chair under the periscope eyepiece, with "respawn." and the faucet line |
| Murmuration, peacock feathers and spider legs are morph magnets | No animals except the whale. Every species shot is locked-off with a near-static subject |
| The tag-filter shot needed all six rows on one token, and COMBO has 0 Whale, Sniper and KOL rows | Dropped. The proof uses the audit rows and the Holders chip strip already in `app-token-audit.mp4` |
| Corner-pinning real UI onto a dollying AI monitor needs a planar tracker | Replaced with a **vector reticle iris-wipe** out of the periscope lens: a circle mask, no tracking |
| Speed-ramped UI clicks retime real footage | No speed ramps anywhere. Only jump cuts between real-time moments |
| Documentary-narrator soundalike risk | The VO is a dry American park-ranger voice: not British, not an older male, not hushed, no cloning, no "in the style of". It is optional (§10.1) |
| "No animals… were harmed" riffs on a certification mark | Changed to **"no real bags were harmed in the making of this film."** (no "animals"). Get a quick legal look anyway |
| The sky whale is a worn AI-art trope and splits the tone | Restaged as a war-epic airship over the trenches, lit by the same flares and grade as every other shot. It is the only surreal beat, used once as the poster |
| Real UI arrived at 6.5 s | Real UI now arrives at **4.2 s** |
| Replica chips, or soft 5× upscaled crops | **Real `WalletTagBadge` chips rendered from the running app** by Playwright at 4× device scale (§5.3) |
| The real-rug climax had no fallback | The AI rug (shot 11) carries the gag on its own. The real rug has a capture plan and a labelled fallback (shot 12) |

### 2.2 Grafted from the other two concepts

- **From BUY ANYWAY:**
  - the reticle that locks on every species, then on *homo fomo*'s cursor, and finally draws on as the real logo
  - real chips
  - "50 paper sol. full port. no plan."
  - a checkbox tick and then a sub-boom click
  - the modal's own line "Paper trades only — but trade it like it's real."
  - the non-affiliation line on the end card
  - quote preview before the gate, as in 3AM
- **From 3AM:**
  - "so naturally, you…" in dead silence
  - the Bundler, Insider and Dev lines
  - "rug: real-feeling. money: fake."
  - the empty-chair respawn
  - the silent last 0.5 s so the video loops
  - the one-word question in the caption (it asks for an opinion, never a like, follow or repost)
  - hooded figures instead of helmets
  - the Insider already seated at the radar table
  - a rim light in each archetype's tag colour

**Deliberately not grafted:**
- "trenchscope lights them up" and any line that implies the app catches every bad actor (MNC-06)
- the ~97% stat on frame 0. KS-01 is AMBER, so this film carries **no external stat at all**
- documentary-narrator VO
- helmets and field jackets, which read as real-army imagery

---

## 3. Non-negotiables for this edit

1. **AI never renders text, numbers, UI, chips or the logo.** All type, chips, the reticle, the SIM bug and the logo are added in post from real files.
2. **Real UI is real.** Real speed, numbers untouched, no speed ramps, no staged rows. Jump cuts between moments are fine. Crop out the top bar ("+ Faucet" pill, paper balance, guest name) and the "Live launchpad tokens on Solana" sub-header (LAUNCH_DAY §1.1). In the footer, keep "Simulated market · paper trading" (bottom-right) but blur the bottom-left strip of sim SOL/BNB/ETH prices and trades/s: they won't match real prices and can read as real activity (ledger §7.7, MNC-05).
3. **`SIM · PAPER TRADING` corner bug on every frame of app footage** (DIS-05).
4. **No sim ticker legible in a punch-in.** Sim tickers can collide with real ones (MNC-16; "COMBO" is also a real ticker, and the captured takes show "GOLDE" and "GACT"). Blur the ticker in the modal title, the quote preview ("You receive ≈ … SYM") and the fill toast, and keep token headers out of frame.
5. **Letterbox grammar:** AI shots get painted 2.39:1 bars (the dramatized film). App shots are full-frame (the real product). Text always sits inside the picture area, in the 80% title-safe.
6. **≤3 flashes per second**, and no full-screen red strobe (BRAND_GUIDE §12.6).
7. **No faces, no hands in close-up, no weapons, no insignia, no coin emblems.**

---

## 4. Beat sheet (16:9 master, 100 BPM grid: 1 beat = 0.6 s)

| n | Time | s | Kind | Visual | On-screen text | VO | Sound |
|---|---|---|---|---|---|---|---|
| 1 | 0.0–2.4 | 2.4 | ai | **THE WHALE (frame 0 = thumbnail).** From a trench floor, a colossal whale glides low through flare smoke over the trench network like an airship over a battlefield. Two hooded silhouettes look up. Vector reticle on the whale's eye from frame 0. It locks at 0.6 s and the real Whale chip pops at 0.7 s | Frame 0: **everything out here wants your bag.** ("your bag" amber). 0.8 s, top-left mono: `FIELD GUIDE TO THE TRENCHES · EP.01` | VO1 0.3–2.3: "everything out here wants your bag." | Sub thump on frame 0, low synth drone, wind and field-recorder hiss, a whale-like low synth moan. Reticle thunk 0.6, chip blip 0.7 |
| 2 | 2.4–4.2 | 1.8 | ai | **THE PERISCOPE (K1).** A brass periscope rises above the parapet, its lens full of flare reflections. Slow crane up. At 3.9–4.2 the amber reticle centres on the lens and expands into an **iris-wipe** that reveals shot 3 | **so we built a scope.** ("scope" amber) | VO2 2.5–4.0: "so we built a scope." | Synth brass-servo whir, a short riser, a whoosh on the iris |
| 3 | 4.2–7.2 | 3.0 | app | **THE HABITAT.** The real Trenches board: new cards drop into New, a ring fills in Near graduation, a card lands in Migrated. Slow 3% push. Light grain | SIM bug. Lower third: 4.4 **filmed on location.** / 5.4 **the location is a simulator.** ("simulator" amber) | VO3 4.5–7.0: "filmed on location. the location… is a simulator." | The 100 BPM 16th-note synth pulse kicks in. A soft UI tick when each card lands |
| 4 | 7.2–9.0 | 1.8 | ai | **SPECIES 1: THE SNIPER.** A hooded figure lies prone on the parapet at a brass spotting telescope (not a rifle). Glint on the lens, coral-red rim. Reticle locks on the lens glint | **THE SNIPER** + real [Sniper] chip. Mono italic: `emptor primus`. Subtitle: **in before you blinked.** | — | Hit on the cut, reticle lock click, glassy lens "ting" |
| 5 | 9.0–11.4 | 2.4 | ai | **SPECIES 2: THE BUNDLER.** Six identical hooded figures in a perfect row on the parapet, backs to camera, yellow rims, cloaks moving in unison. Reticle locks on the centre of the row | **THE BUNDLER** + real [Bundler] chip. Mono italic: `fasciculus unanimus`. Subtitle: **one guy. six wallets. same block.** | — | Six identical hits flammed into one "same block" hit. The lock click is a half-step higher |
| 6 | 11.4–13.2 | 1.8 | ai | **SPECIES 3: THE INSIDER (K2 War Room).** POV through a half-open steel door: a hooded figure is already seated at the glowing amber radar table, relaxed, with a pink rim. Slow dolly in | **THE INSIDER** + real [Insider] chip. Mono italic: `amicus devi`. Subtitle: **already inside. "just a believer."** | — | Steel-door creak, the lock click a half-step higher again, dripping water |
| 7 | 13.2–15.6 | 2.4 | ai | **SPECIES 4: THE DEV (K6 set).** A long banquet table of blank discs stands on an ornate carpet. At the far end, a hooded figure with an orange rim crouches, gripping the carpet, and it starts to go taut | **THE DEV** + real [Dev] chip. Mono italic: `creator fugiens`. Subtitle: **holding the rug.** | — | The music drops to one sustained high note and a sub heartbeat. Cloth creak. Lock click |
| 8 | 15.6–18.6 | 3.0 | app | **RECEIPTS.** The real Audit card (High risk, rug-ratio bar, red Bundlers / Insiders / Dev holding rows). The reticle locks on each row in turn, then a cut to the Holders chip strip (Dev · Insiders · Snipers · Bundlers) | SIM bug. Lower third: **receipts. on every token.** The panel's own "Simulated audit — reference only." stays in frame | — | The pulse returns. Three lock clicks synced to the rows. A riser builds |
| 9 | 18.6–19.8 | 1.2 | card | Flat #0A0C10, dead still | **so naturally, you…** | — | The riser is yanked to **digital silence** for the whole card |
| 10 | 19.8–24.0 | 4.2 | app | **THE MOST ENDANGERED SPECIES.** The real quote preview (0.5 s), then the real "High-risk token" dialog with its reasons and the line "Paper trades only — but trade it like it's real." Then the checkbox tick, the cursor on **Buy anyway**, the click and the paper fill toast. The reticle locks onto the cursor at the click | SIM bug. Top-left: **THE MOST ENDANGERED SPECIES** + real [You] chip. Mono italic: `homo fomo`. Subtitle: **50 paper sol. full port. no plan.** (take A) or **reads the warning. buys anyway.** (take B). Mono `SIMULATED` tag next to any amount | VO4 20.0–21.8: "the most endangered species of all." | Room tone only. Tiny checkbox tick. The click is a **huge sub-boom** (comedic overkill). Fill-toast blip 0.15 s later |
| 11 | 24.0–25.8 | 1.8 | ai | **THE RUG (K6).** The carpet whips out from under the banquet table and a few dozen large blank discs burst into the air in slow motion under one amber spotlight. No people | Lower third: **nature is not kind to late buyers.** | VO5 24.3–25.7: "nature is not kind to late buyers." | A reverse-cymbal suck into a massive sub drop on the yank, a slow-mo whoosh, a glassy shimmer, discs clattering |
| 12 | 25.8–28.8 | 3.0 | app | **THE RUG, IN THE SIM.** A real token page on 1 s candles: Dev and Bundler sell rows land in Activity and the candles collapse. The reticle sits on the falling candle | SIM bug. On the collapse frame (~26.3): **DEV SELL.** (red #FF5468). 27.1: **rug: real-feeling. money: fake.** ("fake" amber). Mono `SIMULATED` next to the price/MC readout | — | A distorted bass pitch-dive synced to the collapse, an impact on DEV SELL, muffled clicks on the sell rows, then a tape-stop into silence at 28.7 |
| 13 | 28.8–31.2 | 2.4 | ai | **THE RESPAWN (K7).** A dark dugout under the same periscope's eyepiece: a lamp flickers on over an **empty chair** facing a dark monitor. Very slow dolly in | 28.9: **relax. it's paper.** ("paper" amber). 30.0: **respawn.** (amber) + mono `paper faucet · one top-up a minute, per chain` | — | Silence, then a lamp click and hum. A soft two-note chime on "respawn." The drone returns, warmer |
| 14 | 31.2–33.0 | 1.8 | card | **THE LOCK.** The reticle flies to centre and resolves into the **real mark**: ring draw, ticks, chart line, glint. The stacked lockup, the tagline and the honest-tag pill come in. DIS-06 is on screen from 31.2 | Lockup **Trenchscope**. **larp the trenches.** (amber). Pill `PAPER TRADING · SIMULATED MARKET · NO TOKEN · NFA`. DIS-06 (2 lines, bottom) | VO6 32.0–33.4: "trenchscope. larp the trenches." | A short riser into the **final downbeat BRAAM at 31.8**, as the ticks land, then an amber glint shimmer and a long ring-out |
| 15 | 33.0–36.6 | 3.6 | card | **END CARD.** Everything from shot 14 holds, static (no glitch over the disclaimers). The credits-parody line and the handle fade in. The last 0.5 s is silent so the loop back to the whale is clean | Holds: lockup, tagline, pill, DIS-06. Adds **no real bags were harmed in the making of this film.**, `@trenchscope` (only once the owner confirms it) and the two smallest lines, DIS-11: *all tokens, wallets and kols shown are fictional sim entities.* and DIS-10: *not affiliated with any chain, launchpad or trading platform.* | — | Ring-out tail, wind and field hiss bookend the doc texture, one faint synth note at 35.6, **silence from 36.1** |

**DIS-06 is on screen for 5.4 s** (31.2–36.6), above the ≥3 s minimum. **DIS-11 is on screen for 3.6 s** (33.0–36.6): the film shows sim tokens and sim wallets, so the ledger requires it in the video itself, not only in FAQ-L2.

---

## 5. Overlay system (post only)

### 5.1 The species card (shots 4–7 and shot 10)

| Layer | Spec | In at (from the cut) |
|---|---|---|
| Reticle lock | Vector built from the mark (`brand/logo/mark-mono-amber.svg`, **ring and four ticks only, no chart line**), ~220 px, #FFB547 at 80%. Ticks slide in, ring settles 108% → 100% (200 ms ease-out), one amber pulse (BRAND_GUIDE §12.3) | +0.15 s |
| Species name | Inter Black 900, caps, 96 px, #E6E9F0, top-left inside the title-safe (x ≈ 200, y ≈ 150) | +0.15 s |
| Real chip | Real render (§5.3), 60 px tall, on a rounded #11141A plate, baseline-aligned 24 px right of the name. Pop-in 140 ms | +0.25 s |
| Latin name | JetBrains Mono italic 500, 26 px, #8C94A3, 12 px above the name. A freeze-frame easter egg | +0.15 s |
| Subtitle | Inter Bold 700, 52 px, lowercase, #E6E9F0 on a #0A0C10 box at 75%, centred lower third | +0.4 s |

All layers clear 0.1 s before the cut. Species shots are locked-off with near-static subjects, so the reticle needs no tracking. On the dolly shots (2, 6) use 2–3 manual position/scale keyframes.

### 5.2 Other layers

- **SIM bug (DIS-05):** `SIM · PAPER TRADING`, JetBrains Mono 600 uppercase 26 px, amber 1.5 px outline pill on a #0A0C10/80% plate, top-right, 48 px margin. Pops in (140 ms) on the first app frame and stays for the whole app shot.
- **Title cards and big captions:** Inter Black, lowercase (CT voice) except the species names and DEV SELL. #E6E9F0 with **one** amber #FFB547 word. Red #FF5468 is used **only** for DEV SELL.
- **Mono `SIMULATED` tag:** JetBrains Mono 600, 22 px, amber outline, beside any price, MC, % or amount that a punch-in, reticle or caption points at in app shots. On the full-board shot (3) the SIM bug and the footer notice carry it.
- **Scanlines** at 3% and shared grain on AI shots. Grain at about 50% strength on app shots, never over the disclaimers.

### 5.3 Real chips (never AI, never redrawn)

**Status (Oct 20): rendered.** `marketing/tools/capture-chips.mjs` produced `whale`, `sniper`, `bundler`, `insider`, `dev` and `you.png` (plus smart, kol, fresh, bot) in `video/overlays/chips/`: the app's own `WalletTagBadge` markup from `/_ui` at 4×, with the label appended exactly as `showLabel` does (same class, icon, colour and 14% fill), on a rounded #11141A plate, 112 px tall. Re-render with the steps below only if the chip design changes.

Render the app's own `WalletTagBadge` with labels. `WalletHeader` renders `WalletTags … showLabel`, so a wallet page header shows the labelled chips.

1. Run the app (dark theme). Use Playwright with `deviceScaleFactor: 4`, viewport 1920×1080.
2. Find a wallet carrying each tag:
   - **Whale** and **Sniper**: Leaderboard → Whales / Snipers tab → open a wallet
   - **Bundler**, **Insider** and **Dev**: the risky token's Holders tab → click a holder with that tag
   - **You**: your own wallet page
3. Take an element screenshot of each `span.chip`. Save the PNGs to `marketing/video/overlays/chips/`.
4. Labels and colours must come out exactly as in `WalletTags.tsx` and `index.css`:

   | Chip | Icon | Colour |
   |---|---|---|
   | Whale | Waves | #38BDF8 |
   | Sniper | Crosshair | #F87171 |
   | Bundler | Boxes | #FACC15 |
   | Insider | VenetianMask | #F472B6 |
   | Dev | Code | #FB923C |
   | You | User | accent #FFB547 |

   Each chip has a 14% tint fill.
5. **Fallback (only if a tag can't be found live):** rebuild it as a vector from `WALLET_TAG_META` (same lucide icon, label, token and 14% fill), and note "rebuild" in the edit log.

---

## 6. Style bible (append verbatim to every keyframe prompt)

```text
STYLE BIBLE (same for all 8 stills): one frame from a self-aware, big-budget wildlife-documentary trailer shot like a war epic, at night, in an endless network of earthen trenches; obviously dramatized fiction played completely straight. Composed for 16:9 with letterbox-safe headroom so it survives a 2.39:1 crop, with clean dark negative space where the shot asks for it. Low-key, high-contrast light: about 80% of the frame sits in deep navy-black shadow (near #0A0C10, lifting to #1F242D in the mids); the key or rim light is a single warm flare-amber glow (#FFB547, like sodium signal flares or tungsten) carving the subject's edge; a faint cool cyan moonlight fill (#38BDF8, very low) for depth only; any other accent colour appears only where the shot names it, as a thin rim light. Volumetric haze, drifting ash, horizontal anamorphic amber lens flare. Shot on 35mm anamorphic lenses, shallow depth of field, fine 35mm film grain, subtle halation, deep blacks without crushed highlights, desaturated except amber. Mood: patient, ominous, deadpan, epic in scale. People appear only as anonymous hooded silhouettes, backlit or seen from behind, faces always lost in shadow, no hands in close-up, plain hooded cloaks with no uniforms, helmets or insignia. No readable text, letters, numbers, logos, symbols, signage, flags, UI or watermarks anywhere; every screen is blank. No weapons or guns, no gore, no real-world conflict imagery, no money or cash, no coins with emblems (any disc is a blank matte metal disc), no mascots or famous meme animals, no real people, celebrities or brands, no cartoon or 3D-render look.
```

**Consistency recipe:**
- Generate shot 1 first and lock it as **Image 1** (the style reference) for every other keyframe.
- Shot 11 also gets the shot-7 frame as **Image 2** (set). Shot 13 gets the shot-2 frame as **Image 2** (prop).
- Make 2 variants per keyframe at 2K. Zoom to 200% and reject any glyph, face, emblem or malformed hand.
- Grade everything with one LUT: blacks to #0A0C10, highlights warm toward amber.

---

## 7. AI shots: full prompts

**Every motion prompt runs as:** Kling 3.0 Turbo · image-to-video · 5 s · 16:9 · native audio OFF · multi-shot OFF.
- **Budget per shot:** 2 keyframes and at most 3–4 I2V tries. If a shot still fails, swap the keyframe; don't re-roll.
- **Review** every clip at 0.25× and keep the cleanest window listed.

### Shot 1 · THE WHALE (hero frame; generate and lock first; the "whale the size of an airship" promised in D4-P3)

Keyframe:
```text
SHOT 1 · THE WHALE. From the floor of a deep earthen trench at night, looking up past rough sandbagged walls into a sky thick with flare smoke, a colossal whale glides low overhead like an airship crossing a battlefield. It fills the upper two-thirds of the frame and dwarfs the endless trench network below. Its pale underside is lit warm amber by signal flares burning far below, a thin cool moonlight edge traces its back, and mist streams off its fins. Its eye sits slightly left of frame centre. In the lower foreground, two small hooded figures stand in the trench with their backs to the camera, looking up, fully backlit so they read as pure silhouettes. Keep the lower-middle band dark and uncluttered for a caption, and the top-left corner dark for a small label. 24mm wide-angle lens, extreme low angle. Exactly one whale with plain natural anatomy: no harness, markings or scars.
```
Motion:
```text
Locked-off static camera, no camera movement. The whale glides very slowly from right to left overhead and its tail rises and falls once; flare smoke swirls and parts in its wake; ash drifts down. The two silhouettes stay completely still. Negative: morphing, warping, melting, flicker, jitter, sudden camera cut, scene change, duplicate subjects, two whales, extra fins, whale bending, extra people, figures moving, figures turning around, faces, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, zoom.
```
- **Keep:** the 2.4 s where the eye drifts less than ~10% of the frame width (the reticle follows it with 2–3 keyframes). **Frame 0 must already be mid-glide.**
- **Fallback:** a near-static take (only smoke moving).

### Shot 2 · THE PERISCOPE (K1; promised in D4-P3; the same clip family feeds teaser `d7-a`)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 2 · THE PERISCOPE. A weathered brass-and-glass trench periscope rising above an earthen parapet of wet sandbags at night, seen from no-man's-land at parapet height. Its square upper lens faces the camera near the centre of the frame and reflects a field of distant amber signal flares. The parapet and the trench line recede into haze behind it, with one flare hanging high. No person is visible; whoever looks through it is hidden below the parapet. Dark, empty sky on the right third for a title. 50mm, f/2.8, eye level with the lens. Plain brass with no engravings or markings.
```
Motion:
```text
The periscope rises slowly a little higher above the sandbags while the camera cranes up with it, no zoom. Flare reflections shimmer across the lens; haze drifts; the parapet stays fixed. Negative: morphing, warping, melting, bending metal, periscope bending, extra periscopes, people, hands, faces, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, zoom.
```
- **Keep:** the 1.8 s with the lens closest to the centre (the iris starts there).
- **Fallback:** "locked-off static camera; only the flare reflections shimmer."

### Shot 4 · THE SNIPER

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 4 · THE SNIPER. On the muddy lip of a trench parapet at night, a lone figure in a heavy hooded cloak lies prone, seen from behind and slightly to the side, eye to a long brass surveyor's spotting telescope on a low tripod. It is a telescope, not a rifle. A sharp amber glint flares on the front lens. The amber flare light stays the key; a thin soft coral-red rim light outlines the hood and shoulders. Haze crosses the parapet and distant flares hang over no-man's-land. Low angle from inside the trench, 40mm anamorphic, figure and telescope in the lower-right third, the upper-left of the frame dark and empty for a title. No visible face, no hands in close-up.
```
Motion:
```text
Locked-off static camera, no camera movement. Wind slowly ripples the hooded cloak; haze drifts across the parapet; the glint on the telescope lens flares once and fades. The figure and the telescope stay still. Negative: morphing, warping, melting, face, face distortion, distorted hands, extra limbs, extra people, multiple people, rifle, gun, weapon, figure standing up, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement.
```
- **Keep:** the 1.8 s around the glint.

### Shot 5 · THE BUNDLER (the "six identical hooded guys" promised in D4-P3; also the source of teaser `d6-c`)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 5 · THE BUNDLER. Six identical hooded figures stand shoulder to shoulder in a perfectly straight row along the top of a trench parapet at night, seen from the trench floor with their backs to the camera, looking out over no-man's-land. They are identical in every detail, same height, same plain cloak, same posture, same spacing, like one person copied six times. A single amber flare beyond them backlights the row, and a thin pale-yellow rim light traces each hood. Haze and ash drift between them. Symmetrical composition, low angle, 35mm, the row across the lower-middle of the frame, the upper-left dark and empty for a title. Exactly six figures, no faces, no hands visible.
```
Motion:
```text
Locked-off static camera, no camera movement. All six cloaks ripple in the wind in perfect unison; the flare beyond them flickers; haze drifts across. The six figures stay in place. Negative: morphing, warping, melting, figures merging, figures multiplying, a seventh figure, figures turning around, faces, extra limbs, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement, zoom.
```
- **Keep:** the 2.4 s where the count is still exactly six. Count them on every frame at 0.25×.
- **Fallback:** a static take with only haze moving.

### Shot 6 · THE INSIDER (K2 War Room)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 6 · THE INSIDER. Point of view from just outside a heavy half-open steel bunker door, looking into an underground concrete war room. At its centre a large circular radar table glows warm amber from within; its surface is abstract light only, soft concentric rings with no markings. One hooded figure already sits at the table with its back to the camera, leaning back, relaxed, completely at home, outlined by a thin magenta-pink rim light from a hidden lamp. Curved dark monitors line the walls, every screen blank and unlit. Rainwater drips from the ceiling; haze hangs in the amber glow. Wide, 28mm, the dark edge of the steel door framing the left side, deep one-point perspective, the upper-left dark for a title. Exactly one person, face never visible, no hands in close-up.
```
Motion:
```text
Slow dolly in through the doorway toward the radar table, no zoom. The table's amber glow pulses slowly; rain drips; haze drifts. The seated figure stays still. Negative: morphing, warping, melting, bending walls, floating objects, zoom, figure turning, head turning, face, extra people, distorted hands, markings on the radar, text on screens, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```
- **Keep:** the first 1.8 s of the push.

### Shot 7 · THE DEV (K6 set; lock this set for shot 11)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. SHOT 7 · THE DEV. A long, dark underground banquet hall with rough timber beams. A long wooden banquet table runs from the foreground toward the far end, set with neat stacks of large, blank, unbranded matte metal discs, and the whole table stands on a long ornate carpet runner, deep red with a faded abstract gold pattern, that extends past the table's far end. At the far end, under a single amber spotlight, a hooded figure crouches and grips the end of the carpet with both hands, ready to pull; a thin orange rim light traces its outline. Symmetrical one-point perspective down the length of the table, 35mm anamorphic, camera low near table height, the nearest disc stacks soft in the foreground, dark negative space in the upper-left for a title. The figure is small in frame with no visible face. The discs and the carpet carry no symbols, letters or emblems.
```
Motion:
```text
Locked-off static camera, no camera movement. At the far end the hooded figure slowly leans back and the carpet begins to go taut; haze drifts through the spotlight. The table and the disc stacks stay perfectly still. Negative: morphing, warping, melting, face, distorted hands, extra limbs, extra people, multiple people, figure walking toward camera, discs moving, symbols on discs, flicker, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality, camera movement.
```
- **Keep:** the 2.4 s as the carpet tightens.
- **Fallback:** the figure static, only haze moving.

### Shot 11 · THE RUG (K6; this keyframe is also the `d5-c` still)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. Image 2 is the set reference: the same banquet hall, the same long table, the same red-and-gold carpet and the same blank discs. SHOT 11 · THE RUG. The same hall seen from a low side angle at the instant the carpet is yanked away: the ornate runner whips toward the far end in a rippling wave, the long table lurches, and a few dozen large, blank matte metal discs burst into the air in a wide arc, spinning and catching amber light against the deep black, frozen in slow motion. Dust explodes off the carpet. One amber spotlight from above. No people in frame. Operatic and absurd, played completely straight. Low-angle medium-wide, 35mm anamorphic, crisp detail, the airborne discs filling the upper two-thirds of the frame. Every disc is blank: no symbols, engravings, emblems or logos.
```
Motion:
```text
Extreme slow motion, locked-off static camera. The discs keep tumbling up and outward through the amber light, then begin to fall; the carpet ripples away out of frame; dust billows. Negative: morphing, warping, melting, discs merging, discs dissolving into mush, symbols on discs, coin emblems, people, hands, flicker, jitter, sudden camera cut, scene change, camera movement, speed ramp, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```
- **Keep:** the 1.8 s at peak lift.
- **Fallback:** hold the keyframe still with a 3% push in post and animated dust only.

### Shot 13 · THE RESPAWN (K7)

Keyframe:
```text
Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition. Image 2 is the prop reference: the same weathered brass periscope. SHOT 13 · THE RESPAWN. A small, dark dugout below the parapet. The lower brass eyepiece of the same periscope hangs down from the timber ceiling above a single empty, worn wooden chair that faces a plain desk with a dark, switched-off monitor. A small amber lamp clipped to a beam has just come on, throwing a tight warm pool of light over the empty chair; dust motes float in the beam. Everything else falls off into navy-black, with a thin slit of cool moonlight through the ceiling planks. Quiet, deadpan, slightly hopeful. Eye level from behind the chair, 50mm, symmetrical, chair centred, generous dark space above for a caption. No people and no hands; the chair is empty; the monitor is dark and blank.
```
Motion:
```text
The lamp flickers twice and then holds steady; dust motes drift slowly through the beam; the camera makes a very slow dolly in toward the chair, no zoom. The chair, desk and monitor stay still. Negative: morphing, warping, melting, bending walls, floating objects, person appearing, figure in chair, hands, monitor turning on, text on screen, zoom, flicker beyond the lamp, jitter, sudden camera cut, scene change, text, letters, numbers, subtitles, watermark, logo, blurry, low quality.
```
- **Keep:** the 2.4 s from the first flicker.

---

## 8. App shots: capture specs

**Capture settings for every new take:**
- `marketing/tools/capture-extra.mjs` (CDP screencast)
- dark theme, CSS viewport 1920×1080, **`deviceScaleFactor: 2`**
- encode at 3840×2160: drop the `scale=1920:1080` step for these takes, so 1.3–2× punch-ins stay sharp
- signed in as a **fresh guest** (Sign in → Quick start, 50 paper SOL)
- cursor driven by Playwright on smooth paths, no jitter

**Existing 1080p clips** in `video/app-footage/` are fallbacks. Keep their punch-ins at ≤1.4×.

| Shot | Screen and interaction | Edit |
|---|---|---|
| **3 · Habitat** (3.0 s) | **Captured Oct 20: `trailer-habitat.mp4`** (14 s, 3840×2160 at 2× DSF, Near graduation holds 16 cards). Use it; the spec below is for a re-take.<br>**`/sol/trenches`**, hands-off, cursor parked outside the board (hovering pauses a column). **New take preferred:** start when **Near graduation** holds 2+ cards. The existing `app-trenches-live.mp4` has an empty Near graduation column. Record 2–3 min and keep the busiest 3.0 s: cards dropping into New, a ring filling, ideally a card landing in Migrated | 112% anchored bottom, so the top bar and the "Live launchpad tokens on Solana" sub-header are out (or rename that sub-header before capture, LAUNCH_DAY §1.1). Keep the footer "Simulated market · paper trading". 3% push. Never punch in on one ticker. **Fallback:** `app-trenches-live.mp4` framed on New + Migrated |
| **8 · Receipts** (3.0 s) | **`/sol/token/<riskyToken in screens/picks.json>`**, right column. **Reuse `app-token-audit.mp4`.** Audit "7 flags · High risk", red rows Dev holding 15% / Insiders 40% / Bundlers 44% / Fresh wallets 83% / Rug ratio 81%, and the Holders chip strip. A re-take only needs any sim token whose **Bundlers, Insiders and Dev holding** rows are all red | 0.0–2.2 s: punch in on the Audit card with the "High risk" badge and the footer "Simulated audit — reference only." in frame. Reticle locks Bundlers → Insiders → Dev holding (0.6 s each; static rows). 2.2–3.0 s: **cut** (not ramp) to the Holders chip strip. Token header out of frame. If T4's image is from a different token, keep T4's numbers matched to its own frame |
| **10 · Homo fomo** (4.2 s) | **Take A captured Oct 20: `trailer-gate.mp4`** (9 s, 4K; beats in `screens/trailer/meta.json`: max 0.50, buy 1.57, dialog 3.63, tick 4.67, click 5.97, toast 6.45). MAX spent 49.499 of the 50 paper SOL (0.399 fees, 0.102 left), price impact 83%. Its token (GOLDE) is not the audit clip's token, which is fine because no line ties them; blur GOLDE everywhere.<br>**Risk gate on the same high-risk token.** **Take A (preferred):**<br>1. Buy → Market → **MAX** (full port, 50 paper SOL). The quote preview shows the price-impact warning.<br>2. Click Buy. The real dialog "High-risk token: \<SYM\>" opens with "Why this is risky" and "Our simulated audit flagged this token. Paper trades only — but trade it like it's real."<br>3. Hover 0.4 s, tick "I understand the risks and want to buy", glide to **Buy anyway**, hold 0.3 s, click.<br>4. Keep 0.6 s of the paper fill toast.<br>Whatever really happens (fill, slippage fail, MEV loss in the toast) is what we show.<br>**Take B (fallback):** reuse `app-risk-gate.mp4` (7.5 s, 0.5 SOL: preview → dialog → tick → Buy anyway → toast) with the take-B subtitle | Cuts at real speed: 0.5 s quote preview (You receive / Min received / Price impact / Fees / Route + "Paper trading on simulated markets · 0.8% platform fee"), dialog held ~1.2 s with the "trade it like it's real" line legible, tick, click, toast. About 2× punch-in centred on the dialog. **Blur the ticker** in the dialog title and the toast. Mono `SIMULATED` next to the spend and toast amounts. If any balance stays legible, burn `SIMULATED · PAPER TRADE` over it (DIS-04) |
| **12 · The rug, in the sim** (3.0 s) | **Not captured yet.** `node marketing/tools/capture-trailer.mjs <tmp> rug` waits for a fresh ≥50% Dev sell and writes `trailer-rug.mp4`.<br>**A live sim rug on `/sol/token/<address>`:** 1 s candles, MCap, Markers on, Activity tab (All) visible.<br>**To find one:** run the server on a fixed seed, watch **`/sol/signals`** with the Dev sell / Bundler sell chips on, and note which token dumps and at what sim time. The sim is deterministic: reboot on the same seed and start recording that token's page **before** the dump.<br>Keep the 3.0 s where Dev- and Bundler-tagged SELL rows land and the candles collapse. **Use a different token** from the one in QT-1 (`launch-10`) and from warm-up `d4-a`, so no footage is reused | 1.3× on the chart and the top Activity rows. **DEV SELL.** goes in only if the **Dev** really sold on this token (a Dev sell marker or row is in frame). Header and ticker out of frame. **Fallback (label it):** `d4-a-autopsy.mp4` (PDAO: "Dev sold" badge, Dev sell marker, collapsed 1m chart). It reuses warm-up `d4-a` footage, so use it only if no new rug is captured by Thu Oct 22. Reveal the **unaltered** candles with a left-to-right wipe, and add a mono `SIM REPLAY` tag next to the SIM bug. `app-rug.mp4` shows no collapse, so don't use it |

---

## 9. Cards

| Shot | Spec |
|---|---|
| **9 · "so naturally, you…"** | Flat #0A0C10, 3% grain, no motion. Inter Black 110 px, #E6E9F0, centred. The silence is the joke |
| **14 · The lock** | Starts on #0A0C10.<br>**Logo:** the reticle (last locked on the collapsing candle in shot 12) flies to centre and becomes the **real** mark (`brand/logo/mark-dark.svg`) with the §12 reveal: ring draws (400 ms) → ticks slide in, 40 ms stagger (200 ms) → chart line draws left to right (300 ms) → amber glint crosses the ring (300 ms). Then the wordmark fades in (140 ms) to complete `lockup-stacked-dark.svg`.<br>**Under the lockup:** the tagline **larp the trenches.** (Inter 600, 56 px, #FFB547). Then the 1.5 px amber-outline pill `PAPER TRADING · SIMULATED MARKET · NO TOKEN · NFA` (JetBrains Mono 600, 26 px, #E6E9F0).<br>**Bottom (DIS-06, from 31.2 s):** "AI-generated dramatization. Fictional people, tokens and events." / "Trenchscope is a simulated market with paper trading only. No real funds. No token. Not financial advice." Inter 500, 30 px, #8C94A3 |
| **15 · End card** | Static hold of shot 14, with no glitch or motion over the disclaimers. It adds:<br>- **no real bags were harmed in the making of this film.** (Inter 500, 34 px, #E6E9F0)<br>- `@trenchscope` (JetBrains Mono 500, 30 px, amber). It's a placeholder: burn in only the handle the owner has confirmed and actually holds. If it isn't confirmed by picture lock, leave the handle off (a burned-in handle can point viewers at someone else's account)<br>- the two smallest lines, DIS-11: "all tokens, wallets and kols shown are fictional sim entities." and DIS-10: "not affiliated with any chain, launchpad or trading platform." (Inter 500, 24 px, #8C94A3; ≥36 px in the 9:16 cut)<br>No URL on the card. `[LINK]` lives in the first self-reply. The last 0.5 s is silent |

---

## 10. Sound and VO

### 10.1 VO (optional, 6 lines)

**The voice:** an original stock TTS voice, with **no cloning and no "in the style of" prompt**.
- An adult American voice with a dry, flat, slightly bored delivery: a park ranger reading the trailhead safety notice.
- **Not** British, **not** an older male, **not** a hushed reverent whisper. Don't name a real narrator anywhere in the tool.
- Close-mic'd, little reverb, music ducked −8 dB under it.
- If two people independently say it sounds like a specific real presenter, change the voice or drop the VO. Every line is already on screen.

| # | In | Line |
|---|---|---|
| VO1 | 0.3 | "everything out here wants your bag." |
| VO2 | 2.5 | "so we built a scope." |
| VO3 | 4.5 | "filmed on location. the location… is a simulator." |
| VO4 | 20.0 | "the most endangered species of all." |
| VO5 | 24.3 | "nature is not kind to late buyers." |
| VO6 | 32.0 | "trenchscope. larp the trenches." |

### 10.2 Music (we generate it)

**The bed:** a synthesized dark-synth bed at **100 BPM** (1 beat = 0.6 s, 1 bar = 2.4 s), built from:
- a sub drone
- a 16th-note pulse
- tom-like synth hits
- brass-like braams
- risers and reverse cymbals
- a doc-texture layer of wind and field-recorder hiss

**Cuts:** every cut in §4 sits on the grid. Generate the music first and snap cuts to it. If the bed drifts, move cuts by at most ±2 frames.

| Time | Cue |
|---|---|
| 0.0 | Sub thump on frame 0, the drone starts. 0.6 reticle thunk |
| 2.4–4.2 | Servo whir and a short riser, whoosh on the iris |
| 4.2 | The pulse kicks in |
| 7.2 / 9.0 / 11.4 | Roll-call hits with lock clicks rising a half-step each time |
| 13.2 | Music drops to one high note and a heartbeat sub |
| 15.6 | The pulse returns, three lock clicks, a riser |
| 18.6 | **Digital silence** |
| 19.8 | Room tone. 23.2: the **sub-boom click** |
| 24.0 | Reverse cymbal into the sub drop on the yank |
| 25.8 | Bass pitch-dive. 26.3: impact on DEV SELL. 28.7: tape-stop |
| 28.8 | Silence, lamp click, a two-note chime on "respawn." |
| 31.2 | Riser. **31.8: final BRAAM** as the ticks land |
| 33.0 | Ring-out, wind returns. 35.6: faint synth note. **36.1–36.6: silence** |

**Master:** −14 LUFS integrated, −1 dBTP, AAC-LC 48 kHz.

---

## 11. Captions (SRT)

These are the burned-in caption lines with their timings. Use the SRT on platforms that take one. On X, the captions are burned in because autoplay is muted. If shot 10 uses take B, replace cue 12 with "reads the warning. buys anyway."

```srt
1
00:00:00,000 --> 00:00:02,300
everything out here wants your bag.

2
00:00:02,500 --> 00:00:04,000
so we built a scope.

3
00:00:04,400 --> 00:00:05,400
filmed on location.

4
00:00:05,400 --> 00:00:07,100
filmed on location.
the location is a simulator.

5
00:00:07,500 --> 00:00:08,900
THE SNIPER
in before you blinked.

6
00:00:09,300 --> 00:00:11,300
THE BUNDLER
one guy. six wallets. same block.

7
00:00:11,700 --> 00:00:13,100
THE INSIDER
already inside. "just a believer."

8
00:00:13,500 --> 00:00:15,500
THE DEV
holding the rug.

9
00:00:15,800 --> 00:00:18,500
receipts. on every token.

10
00:00:18,600 --> 00:00:19,800
so naturally, you…

11
00:00:20,200 --> 00:00:21,400
THE MOST ENDANGERED SPECIES
homo fomo

12
00:00:21,400 --> 00:00:23,900
50 paper sol. full port. no plan.

13
00:00:24,300 --> 00:00:25,700
nature is not kind to late buyers.

14
00:00:26,300 --> 00:00:27,100
DEV SELL.

15
00:00:27,100 --> 00:00:28,700
rug: real-feeling. money: fake.

16
00:00:28,900 --> 00:00:30,000
relax. it's paper.

17
00:00:30,000 --> 00:00:31,100
respawn.

18
00:00:32,000 --> 00:00:33,400
trenchscope. larp the trenches.

19
00:00:33,400 --> 00:00:36,100
no real bags were harmed in the making of this film.
```

---

## 12. 16:9 → 9:16 adaptation (QT-3, 8:30 p.m. ET; `launch-2`)

**Format:** 1080×1920, H.264, 30 fps, **30.0 s**. It is a re-framed, re-timed new cut, not a letterbox and not a bare repost.

| Element | 9:16 treatment |
|---|---|
| **AI shots** | **Re-generate natively at 9:16.** Use Nano Banana Pro with the approved 16:9 frame as Image 1 (style) and Image 2 (composition/set), then re-run Kling at 9:16 with the same motion prompts.<br>**Minimum set if credits are tight:** shot 1 (whale overhead, silhouettes at the bottom: a natural poster), shot 5 (the six figures as **one single-file column receding in depth**, perfectly aligned, which reads even more as "one guy"), shot 11 and shot 13 (K7 is native 9:16 in BRAND_GUIDE §11.4).<br>Centre-crop shots 2, 4, 6 and 7 only if the crop passes a phone check at 100% |
| **App shots** | Re-capture in the app's **real phone layout** (viewport 390×844, `deviceScaleFactor` ≈ 2.77) instead of cropping desktop. Board: one column. Token page: chart + Activity. Audit: the right-column cards stack naturally. Risk gate: centred dialog. The phone layout hides the footer sim notice, so the SIM bug is mandatory |
| **SIM bug** | Top-right, 160 px from the top and 48 px from the right, below X's player chrome |
| **Text** | Species names move from top-left to top-centre. Title captions 72–96 px, subtitles 60–75 px. Everything in the centre 80% width, **above the bottom 20%** and clear of the right ~140 px action column |
| **End card** | Stacked lockup in the upper-middle. DIS-06 lines at ≥40 px, above the bottom 20%, held ≥3 s |

**9:16 timing:**

| Shot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s | 1.8 | 1.2 | 2.4 | 1.2 | 2.4 | 1.8 | 1.8 | 2.4 | 1.2 | 3.6 | 1.8 | 2.4 | 1.8 | 1.2 | 3.0 |

Total 30.0 s (50 beats). Every duration is a whole number of 0.6 s beats, so every cut lands on the 100 BPM grid (the earlier 2.0/1.4/1.6/1.0 s values did not). The Bundler keeps 2.4 s for its 6-word line; the Sniper's "in before you blinked." gets 1.2 s, which suits the joke. DIS-06 is on screen 4.2 s (shots 14 + 15) and DIS-11 3.0 s. Same captions, re-timed. Same music, re-cut on the grid. (`LAUNCH_DAY` §10 still lists `launch-2` as "about 30.4 s"; its owner should change that to 30.0 s.)

---

## 13. Warm-up continuity (already planned posts that depend on this film)

| Warm-up post | What it promises | This script |
|---|---|---|
| **D4-P3** (Fri Oct 23, seed text) | "a nature doc shot like a war film. a whale the size of an airship. a periscope. six identical hooded guys who are definitely not the same guy." and "zero real numbers in it." | Shots **1** (whale), **2** (periscope), **5** (six hooded bundlers). Keep all three in the final cut, or change D4-P3 before Friday. "zero real numbers" holds only while the film carries no real-market stat (§2.2, §17): every number on screen is a sim number under a SIM bug |
| **d5-c** (Sat Oct 24, "a frame from the trailer we're making") | K6 still: banquet hall, carpet yanked from under a long table, blank discs, one amber spotlight | **Shot 11's keyframe, same seed.** It must be approved by **Sat noon ET**, and the final cut must use it |
| **d6-c** (Sun Oct 25, teaser "THE BUNDLER") | WARMUP_WEEK §9 now specs it from **shot 5** (six identical hooded figures), with cards "ONE GUY. SIX WALLETS." / "SAME BLOCK." | Matches the trailer and the app's bundler definition ("bought in the same block as the token creation; likely linked to the dev"). Use a different Kling take or framing from shot 5 so the teaser is a unique cut |
| **d7-a** (Mon Oct 26, "tomorrow") | K1 periscope, slow crane up | **Shot 2's clip family.** Use a second Kling take for the 11 s teaser so it is a unique cut |
| **LAUNCH_DAY §2** | TR-A/B/C captions and the video description, rewritten for this cut | **§15 now mirrors them verbatim** (TR-A = §15.1, TR-B/TR-C = §15.2, same video description). LAUNCH_DAY §2 is the copy you paste; if the two ever differ, fix this file to match. QT-2 already reads "the whale, trenches, flares and yanked carpet: ai." |

---

## 14. Production schedule and QA

| Day (ET) | Work |
|---|---|
| **Tue Oct 20** | Lock this script. Shot 1 keyframe (2 variants) → lock the hero frame |
| **Wed Oct 21** | Keyframes 2, 4, 5, 6, 7, 11 and 13 with Image 1 attached. Approve them. (The real chips are already rendered, §5.3) |
| **Thu Oct 22** | Kling runs (≤3–4 per shot). The board and MAX risk-gate takes are already captured (§8); still to capture at 2× DSF: the seeded rug (dry run → note the token and sim time → same-seed re-run) |
| **Fri Oct 23** | Rough cut on the 100 BPM grid with a temp bed. D4-P3 posts: its three promised shots (whale, periscope, six bundlers) exist by now |
| **Sat Oct 24** | Final music, VO, overlays. **d5-c still out at 8:30 p.m.** |
| **Sun Oct 25** | Fine cut, grade, 9:16 re-generations. **d6-c teaser at 2:00 p.m.** |
| **Mon Oct 26** | **Picture lock by 6:00 p.m. ET** (D7-P4 truth check). Exports and QA. **d7-a at 8:30 p.m.** |

**Exports:**
- **16:9 master:** MP4, H.264, AAC-LC, 1920×1080, 30 fps, 8–12 Mbps, 36.6 s (well under the 140 s non-Premium cap, above the 10 s video-quality gate)
- **Fallback:** 1280×720 at 6 Mbps
- **9:16 cut:** 1080×1920
- **Thumbnail check:** frame 0 is the whale, the reticle and the caption

**QA (all must pass):**
- [ ] 8 AI shots exactly. Zoom to 200%: no glyphs, faces, emblems, weapons, insignia or close-up hands. Review at 0.25×: no morphing, and still six bundlers.
- [ ] The SIM bug is on every frame of shots 3, 8, 10 and 12. The top bar is cropped, and the footer's sim price / trades-per-second strip is blurred. No ticker is legible in any punch-in (GOLDE, GACT, COMBO or any other).
- [ ] No app footage is speed-ramped. DEV SELL appears only over a token where the dev really sold. Any rug-wipe fallback carries `SIM REPLAY`.
- [ ] The subtitle on shot 10 matches the take (A: full port, B: reads the warning).
- [ ] DIS-06 is on screen ≥3 s (5.4 s planned) and nothing moves over it. DIS-11 and DIS-10 are on the end card.
- [ ] The end-card handle is the confirmed, owned handle, or it's left off. No URL anywhere in the video.
- [ ] ≤3 flashes per second, no full-screen red. Captions are readable on a phone at 100%.
- [ ] Music is generated (no licensed or recognisable score). The VO voice has passed the soundalike check, or the VO is dropped.
- [ ] Generation log kept: stills made, Kling runs, clips kept. QT-2 fills its `[N]` from this log only.

---

## 15. The X post

These are **verbatim copies of LAUNCH_DAY §2** (TR-A/B/C), so the runbook and the script can't drift apart. Paste from LAUNCH_DAY.

### 15.1 Main caption · TR-A (recommended) · 264/280

```text
we made a nature documentary about the memecoin trenches. for a paper-trading app.

we are not ok.

which species gets you every time: the sniper, the bundler, the insider or the dev?

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

Why it beats the earlier draft ("…about the trenches for a paper-trading terminal." / "who gets you every time"): the full stop before "for a paper-trading app." turns the contradiction into a beat, so it reads as the joke instead of a description. "which species" ties the question to the film's roll call, so a one-word reply ("dev") is the obvious move. It asks for an opinion, not a like, follow or repost.

### 15.2 Alternates

**TR-B · the species hook · 232/280**
```text
field guide to the trenches, ep.01.

the sniper. the bundler. the insider. the dev. and the most endangered species of all: you, clicking "buy anyway".

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

**TR-C · deadpan · 214/280** (weakest: it repeats the film's shot-11 line)
```text
nature is not kind to late buyers.

so we made a field guide to the trenches, and a terminal where getting rugged costs nothing real.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

**SPARE · the larp confession · 276/280** (not for launch day; only for a *new* cut 48 h+ later)
```text
we tried to film the trenches on location.

the location is a simulator. fake coins, fake money, rugs that only feel real.

so we shot a nature doc like a war movie. for a paper-trading terminal.

ai-generated trailer. obviously a larp. the product is a paper-trading sim. nfa
```

**Counts and rules for all four:**
- Counts are X-weighted and were re-checked. Every caption carries DIS-07 verbatim.
- No link, no hashtag, no @-mention, no cashtag, no emoji, no exclamation mark.
- Pick one for the trailer. Don't repost the trailer with another. An unused caption can go on a *new* cut 48 h+ later, in fresh words.

### 15.3 Video description (paste into X's video description / alt text field) · 895 chars · identical to LAUNCH_DAY §2

```text
AI-generated parody trailer for Trenchscope, a paper-trading app on a simulated memecoin market, made as a wildlife documentary shot like a war epic. A giant whale glides over night-time trenches lit by amber flares. Anonymous hooded silhouettes are introduced as species: a sniper at a brass telescope, six identical bundlers in a row, an insider already seated in a war room, a dev gripping the end of a carpet. Short screen recordings of the real app, each labelled SIM · PAPER TRADING, show the launch board, an audit panel, a high-risk warning where the buyer clicks Buy anyway, and a simulated chart collapsing after a dev sell. A carpet is yanked from under a banquet table of blank discs. A lamp lights an empty chair: respawn. End card: AI-generated dramatization, fictional people, tokens and events; simulated market, paper trading only, no real funds, no token, not financial advice.
```

### 15.4 Self-replies

Use the launch thread **T1–T10** and **FAQ-L1/L2** exactly as written in `x/LAUNCH_DAY.md` §3:
- T1 carries `[LINK]` and DIS-02
- T10 carries DIS-12
- FAQ-L1/L2 carry DIS-08 to DIS-11

Nothing in this script changes them.

---

## 16. Posting plan · Tue Oct 27 (ET; UTC = ET + 4, Berlin + 5, SGT + 12)

| ET | Do | Notes |
|---|---|---|
| Mon 26, ≤6:00 p.m. | Master locked and QA'd (§14) | Otherwise D7-P4 uses its text-only fallback |
| 9:00 | Launch-hour checks from LAUNCH_DAY §4 (link, quick start, Under the Hood baseline) | — |
| 9:10 | X composer on desktop, **native upload** of the 16:9 master. Paste **TR-A** from LAUNCH_DAY §2 (= §15.1) and the **§15.3 video description**. **Turn on the AI-generated / altered-media label** if offered | Thumbnail = frame 0 (whale + caption). If processing stalls for 5+ minutes, use the 720p fallback |
| 9:20 | Add T1–T10 as the thread, but **don't publish** | `[LINK]` only in T1, T9 and T10 |
| **10:00:00** | **Publish** | — |
| 10:01 | Pin the trailer (it replaces PIN-A) | — |
| 10:03 | FAQ-L1 → FAQ-L2 under the trailer | — |
| 10:05–11:30 | Answer **every** reply within about 5 minutes, in fresh words each time. Answer "which one gets you" with a one-line mechanism for that archetype (in the sim: block timing, funding links). Hide, report and block scam replies | No other originals, and no quoting yourself |
| 10:15 | Watch it once in the phone app: captions, SIM bugs and the end card are readable | — |
| 10:30 / 11:00 / 11:30 / 12:00 | T+30 / 60 / 90 / 120 snapshots (LAUNCH_DAY §11). The cold-start audition ends around 2 h or 200 views (CT_PLAYBOOK §3.3, read from the open-sourced ranking code; it's experiment-gated, so treat it as a heuristic) | Never edit or delete the trailer |
| **1:30 p.m.** | **QT-1** "the trailer is ai. this isn't." with `launch-10` | A different token and cut from trailer shot 12. Not "the trailer is fake. this part isn't.": the rug in that clip is simulated too, so "isn't fake" overclaims |
| **4:00 p.m.** | **COMM-1** "reply with your worst rug" + its self-reply | — |
| **6:15 p.m.** | **QT-2** making-of. Fill `[N]` only from the §14 generation log. Apply the hold rule: if the trailer or COMM-1 is still climbing, post it as a self-reply instead | AI is the disclosure, never the headline |
| **8:30 p.m.** | **QT-3** Asia re-push with the **9:16 cut** (§12). AI label on again, video description pasted | A new cut with new words, not a bare repost |

---

## 17. Claims map (every on-screen line)

| Line | Basis |
|---|---|
| "everything out here wants your bag." · "nature is not kind to late buyers." · "holding the rug." · "in before you blinked." | Jokes, no factual claim |
| "so we built a scope." | SC-09 (audit checklist) and SC-19 (wallet labels): the "scope" is what the film then shows. No claim that it catches everything (MNC-06) |
| "filmed on location. the location is a simulator." | SC-04 (built-in market simulator) |
| Real chips and Latin names | SC-19 (wallet labels incl. "you"). The chips are the app's own render |
| "one guy. six wallets. same block." · 'already inside. "just a believer."' | SC-21 (bundler = creation-block buy; insider = dev-funded), as jokes, with no accuracy claim (MNC-06) |
| "receipts. on every token." | SC-09 (every token has the audit checklist). Not "catches every" |
| Risk-gate dialog, checkbox, Buy anyway, quote preview, "0.8% platform fee" | SC-08, SC-11, SC-12 (the app's own simulated-fee footer, no comparison) |
| "50 paper sol. full port. no plan." | SC-02 (guest starts with 50 paper SOL). Take A only. In `trailer-gate.mp4`, MAX spends 49.499 SOL and fees take 0.399, leaving 0.102: that is a full port |
| "DEV SELL." | SC-18 (dev sell signal), only over a token where the dev sold |
| "rug: real-feeling. money: fake." · "relax. it's paper." | SC-01 (no real funds; "real-feeling", never "real rugs") |
| "respawn." · "paper faucet · one top-up a minute, per chain" | SC-03 (`FAUCET_COOLDOWN_MS = 60_000`, per chain). The faucet is a button with a cooldown, not an automatic refill, so the line says "top-up", not "refills" |
| Pill `PAPER TRADING · SIMULATED MARKET · NO TOKEN · NFA` · DIS-06 · DIS-10 · DIS-11 | SC-01, SC-35 (no token), disclaimers DIS-06, DIS-10 and DIS-11 (the film shows sim tokens and wallets) |
| "no real bags were harmed in the making of this film." | A parody line. Only the word "real" carries meaning (nothing real at stake) |

**Not in the film:**
- no external statistics (so no DIS-03 is needed, and D4-P3's "zero real numbers in it" stays true)
- no PnL figures
- no real people, brands, chains or launchpads
- no AI claims about the product (MNC-07)
- no speed claims
- no roadmap
- no token
