# Trenchscope: AI Video Research Notes (the "larp" trailer)

Research date: Tue 2026-10-20. Use: the cinematic AI "larp" trailer and launch thread for Tue 2026-10-27, plus short teaser cutdowns for the warm-up week. Read with `CT_PLAYBOOK.md` (X ranking, specs, avoid list) and `CLAIMS_LEDGER.md` (what we may claim).

**Confidence legend** (same as the playbook):
- **[H] High.** Primary or official source (vendor docs, the company's own statement, first-person account from the maker).
- **[M] Medium.** Credible secondary reporting (NPR, Business Insider, trade press, research firms' summaries).
- **[L] Low.** Vendor blogs, tool-seller tutorials, single-source stats, practitioner folklore.

**Method note.** The research used web search. Direct page fetches were blocked by this environment's egress proxy, so most claims rest on search-engine summaries of the pages listed under Sources and are tagged one level more cautiously than the page itself might deserve. Model features (Kling 3.0, Nano Banana Pro) change fast; check the live Higgsfield UI before generating.

---

## 0. TL;DR: 12 rules for the trailer

1. **The joke must be legible on frame 0, with sound off.** X autoplays muted [M]. Open on a trailer title card or an impossible image, never a logo or a fade from black.
2. **Genre transposition is the engine.** "Blockbuster war-film trailer for a paper-trading terminal" is the same move as the Wes Anderson / fake-trailer genre: a familiar template plus one absurd swap [M].
3. **Self-aware beats realistic.** Viewers punish lazy AI and AI-as-the-headline (McDonald's NL, Svedka at Super Bowl LX) [M]. They share AI that is clearly in on the joke [L]. Our premise ("larping") makes the fakeness the point.
4. **Never fake reality.** The viral fake-trailer channels grew by fooling people and were then demonetised or banned [M]. Ours is captioned "AI-generated · dramatized · paper trading only" and contains no real people, brands, news logos or real numbers.
5. **AI for drama, real UI for proof.** Cut 2–4 short inserts of the real app (SIM badge visible) between AI shots. Never let a model "draw" the product UI.
6. **30–45s master, hard ceiling 60s.** That clears X's 10s video-quality-view gate [H code, see playbook §3.6], fits the 140s non-Premium limit [H] and stays shorter than the 45–60s spots that drew backlash.
7. **Cut on the beat, accelerate.** Use a cold open, setup, escalation, title card, then a funny "button" after the title [M].
8. **Two caption layers.** Trailer title cards (all-caps, centered) carry the story. Small lower-third subtitles carry any VO. Both are burned in.
9. **One style bible, pasted verbatim into all 8 keyframe prompts.** Generate the hero frame first and feed it back as a reference to the others [M].
10. **No readable text and no faces in generated shots.** Add text, logo and UI in the edit. Show people as silhouettes, helmets, hoods, hands or backs of heads. That also removes any real-person likeness risk.
11. **Kling: one subject action plus one slow camera move per 5s shot.** Animate *motion only* (the image already describes the scene). Use negative prompts in I2V [H Kling blog] and trim each clip to its best 1.5–3s.
12. **Budget retries.** The Kalshi ad took 300–400 generations for 15 usable clips [H maker]. Image-to-video with simple motion is far cheaper, but plan 3–4 tries per shot and 2 keyframe variants per shot.

---

## 1. What spread in 2025–2026, and why

### 1.1 Format scan

| Format | Example and evidence | Why it spread | Use for Trenchscope |
|---|---|---|---|
| **AI fake movie trailers** | Screen Culture (~1.4B views) and KH Studios mixed real footage with AI shots for unreleased films. Some ranked above the real trailers. One fake Superman trailer fooled French national TV. YouTube later demonetised or banned the main channels, and studios had been claiming ad revenue on them [M]. | Hype for a known release, plus "is this real?" confusion, plus volume. | **Steal the grammar** (title cards, "in a world…" escalation, the button). **Never** steal the deception. Ours is a trailer for something that obviously isn't a movie. |
| **Genre/style transposition** | Curious Refuge's "Wes Anderson directs Star Wars / Avatar / LOTR" trailers (2023) went viral and split audiences. Their hallmarks were symmetry, pastel palette, deadpan stares and Anderson-style title typography added *in editing* [M]. | Instant recognition of two worlds colliding. Shareable as "you have to see this." | War-epic / heist-film trailer language applied to memecoin trench warfare: rugs, snipers, bundlers, insiders. Use an original look, no imitation of a real director. |
| **AI commercial built on absurd characters** | Kalshi's NBA Finals spot (aired Jun 11, 2025). PJ Accetturo made it in Veo 3 in 2–3 days for ~$2k, with 300–400 generations for 15 usable clips. His thesis: "crazy people doing crazy things while showcasing your brand" [H maker / M press]. | Rapid-fire unhinged vignettes. Each 1–2s clip is a standalone joke, and the brand is the connective tissue. | A rapid "trench montage" of archetypes (the sniper, the bundler, the insider, the dev) as cinematic silhouettes, each with a one-line title card. |
| **Fake street interviews / mockumentary** | Veo 3 street interviews (May 2025). One "we're doomed" clip passed 14M views on an X repost before it was revealed as AI [M/L]. Funny AI videos that work are "shot and paced like real footage" with a straight-faced narrator [L]. | Realism plus a mundane setting plus a deadpan voice. | **Only as an obviously staged parody**, e.g. a nature-doc narrator voice ("here we observe the degen in its natural habitat…") over clearly cinematic, non-realistic shots. No fake news branding, no fake vox-pops of "users". |
| **Repeatable absurd template** | Italian brainrot (early 2025): an absurd AI creature plus TTS narration plus a rhyming name. Chimpanzini Bananini drew 29M+ views in two weeks, and Tralalero Tralala reportedly has billions of cumulative views [M/L]. | A template anyone can remix, with nonsense as the hook. | Make the trailer **remixable**: a fixed title-card format ("THE RUG", "THE SNIPER", "THE INSIDER") that the account can extend into a weekly series after launch. |
| **AI parody trailer series native to X** | Charles Curran (Menace Studio) posts adult-leaning AI slasher-parody trailers with dripping-blood title cards and over-the-top narration. They drew millions of X views and were boosted by large accounts. Seedance 2.0 is reportedly the main generator [M]. | Exaggerated genre clichés, loud title cards, a serialised format. | Confirms that parody *trailers* travel natively on X. Keep ours PG and brand-safe. |

### 1.2 What the backlash cases teach

- **McDonald's Netherlands (Dec 2025):** a 45s AI Christmas ad was posted Dec 6 and pulled Dec 9. Viewers objected to the AI look *and* the cynical tone [M].
- **Coca-Cola holiday ads (2024, 2025):** criticised as soulless remakes of a beloved tradition [M]. But Kantar found the 2025 version (AI animals) outscored the 2024 one (AI people) on most metrics [M]. **AI humans are the weak point.**
- **Super Bowl LX (Feb 2026):** about half of social conversation about AI ads was negative (Meltwater). Svedka's "primarily AI-made" spot ranked No. 53 on Ad Meter with 7% brand match. Critics said the AI became the headline and the message felt hollow [M].
- **Kantar (356 ads):** no link between AI use and effectiveness. Non-obvious AI use did better than obvious use. Creative principles are unchanged [M].
- **Takeaway:** "made with AI" is not the idea. The idea is "larp the trenches", and AI is just how a two-person team gets a war-film look. Lead with the joke and the product. Mention AI only as the honest disclosure.

### 1.3 The spread mechanics we can use

1. **Recognisable template plus one twist.** Movie-trailer grammar plus "it's a paper-trading terminal."
2. **In-group specificity.** CT nouns (rug, dev dumped, bundled, sniped, migrated, top-10 holders) make it quotable and DM-shareable. DM shares and copy-link shares are heavily weighted (playbook §0).
3. **A button line people repeat.** After the title card, one last deadpan line, e.g. *"fake money. real trauma."*
4. **Self-awareness as the disclosure.** "This trailer is a larp. So is the money." Being honest is the joke.
5. **Remixability.** The title-card format becomes a recurring series after launch.
6. **Curiosity about the making-of.** A self-reply breakdown ("8 keyframes, 2 tools, 0 real money") is a second post that drives replies. Keep it factual.

---

## 2. Hook patterns for the first 1–2 seconds (muted autoplay)

**Evidence.** X/Twitter video autoplays **muted** by default, and clicking unmutes [M, TechCrunch/VentureBeat 2015, still the documented behaviour]. Vendor data says most mobile viewers watch sound-off (one claims up to 85%), that keep-or-skip decisions happen in ~1.7–2.5s, and that 50–70% of leavers go in the first 1–2s [L]. Treat these as directional. The shared conclusion is robust: **the hook must be visual and textual, not audio.**

**Kill list (first 2s):** a logo sting, a slow fade from black, a "presenting…" card, "hey guys", a question with no visual payoff, dialogue-dependent openings.

| # | Hook pattern | How it reads muted | Trenchscope version |
|---|---|---|---|
| 1 | **Trailer title card over a strong image** | Text plus image in frame 0 | Frame 0: aerial night shot of a trench network lit by amber flares. Card: **"IN A WORLD WHERE THE DEV ALWAYS SELLS"** |
| 2 | **Impossible-scale visual metaphor** | Pure image | Trenches dug in the shape of a candlestick chart, seen from a drone, with a single red candle collapsing into a crater |
| 3 | **Mid-action cold open** | Motion from frame 0 | A silhouetted trader slams a key and the monitor glow flips from green to red on the face-less figure. No numbers in the AI shot. |
| 4 | **Contradiction caption** | Text creates a curiosity gap | **"this is a trailer for a trading app. we are not ok."** |
| 5 | **Self-aware disclosure as the hook** | Text | **"fake money. real-feeling rugs."** (the rugs are simulated, so never say "real rugs") |
| 6 | **Archetype roll-call** (Kalshi-style) | Fast cards | **THE SNIPER. / THE BUNDLER. / THE INSIDER. / THE DEV.** About 0.7s per card over a matching silhouette shot |
| 7 | **Real-UI-first pattern interrupt** | Recognisable product | Frame 0 is the real Trenches board with a token sliding into "Migrated", then a hard cut to the war epic. Best for the 9:16 cut. |
| 8 | **Frame 0 = thumbnail** | Static frame works as the poster | Design the first frame as a movie poster: title card, hero silhouette, amber flare, letterbox bars |

**Rules:** text on screen by frame 0 or within 0.3s. Something must move within the first 0.5s (ash, flare drift, push-in). The first 2s must state the premise (trailer + trenches), not just set a mood.

---

## 3. Pacing and length for X

### 3.1 Length

- **Master: 30–45s, 16:9, 1920×1080.** Must be over 10s for the video-quality-view gate [H code]. Must stay at or under 2:20 for non-Premium [H]. Vendor guidance says trailers land at 30–60s [L]. The 45s spot that drew backlash (McDonald's) failed on tone, not length, but shorter is safer.
- **9:16 cut, 1080×1920, 20–30s**, re-framed rather than letterboxed. For TikTok/Reels/Shorts and the Asia re-push.
- **Warm-up teasers (Oct 22–26), 6–12s each**, posted natively without a link: a single title-card plus one shot ("THE SNIPER. coming tuesday."). Each must be a standalone joke, not "coming soon" filler. Post each teaser once and never re-post the same clip (duplicate filter; playbook §0).

### 3.2 Trailer beat sheet (based on Derek Lieu's cold open / three acts / button structure [M])

| Time (40s master) | Beat | Shot length | Content |
|---|---|---|---|
| 0.0–3.0s | **Cold open** | 1 shot, ~3s | Hook pattern 1 or 2. Title card on screen from frame 0. Low drone or silence. |
| 3–10s | **Act 1: the world** | 2–3 shots, 2–3s each | Wide establishing shots of the trenches, the bunker and the war room. Card: "EVERY LAUNCH IS A BATTLEFIELD" |
| 10–14s | **Product reveal #1 (real UI)** | 1 insert, ~3–4s | Real screen recording of the Trenches board with the SIM badge visible, ideally match-cut from a glowing monitor in the AI shot |
| 14–26s | **Act 2: escalation / roll-call** | 6–8 cuts, 0.7–1.5s each, accelerating on the beat | THE SNIPER / THE BUNDLER / THE INSIDER / THE DEV, each card over a silhouette shot, intercut with 1s real-UI flashes (audit chips, wallet labels, Monitor feed) |
| 26–32s | **Act 3: climax** | 2–3 shots, then a beat of black | The rug: the ground gives way. Hard cut to silence. Card: "TRAIN WITH FAKE MONEY." then "BEFORE THE TRENCHES TRAIN YOU." |
| 32–36s | **Title card** | ~3s | Logo mark (real SVG, composited) plus wordmark. "TRENCHSCOPE". Hit on the final downbeat. |
| 36–40s | **Button** | 1 shot, ~2–4s | Deadpan payoff, e.g. a helmeted silhouette in the bunker sighs as the screen reads (in post) "SIMULATED -100%". Card: "fake money. real trauma." End card: "AI-generated · dramatized · paper trading only · @trenchscope" |

**Pacing rules:**
- **Pick the music first** and cut every transition on a beat [L]. Use licensed or generated trailer music (risers, hits, a "braam"). Never use a recognisable film score.
- **Accelerate** through Act 2, then **hold** before the climax. Cutting too soon to the reveal flattens the payoff [L].
- **Generate 5s, use 1.5–3s.** Kling clips start and end on their weakest frames. Trim to the cleanest middle.
- A **beat of black or silence** before the title card makes the logo land. On muted autoplay the black frame still reads as a "trailer" beat.

---

## 4. Caption and subtitle styles

Two layers, both **burned in** (X's own captions are unreliable; playbook §6).

**A. Trailer title cards (the story layer).**
- All-caps, centered, wide letter-spacing, on black or over a darkened shot. The brand fonts work: Inter Bold/Black for cards, JetBrains Mono for numbers and "SIMULATED" labels.
- Colour: fg #E6E9F0 on #0A0C10, with **flare amber #FFB547** for one emphasis word per card. Use alarm red #FF5468 only for the rug beat.
- 3–6 words per card. Hold for at least ~0.7s per 3 words. A card is the hook, so give it room.
- Subtle motion (a 3–5% slow scale or a flicker-in) makes it feel like a trailer card. Keep it clean: no glitch-text cliché overload.
- In 16:9, keep cards inside the central 80% (title-safe). In 9:16, keep them in the upper-middle band, clear of the bottom ~20% and the right-edge action column [L].

**B. Lower-third subtitles (only if there's VO).**
- Mostly lowercase CT voice (*"here we observe the degen in its natural habitat"*), 3–5 words per segment, white on a 70–80% black box [L].
- Size: about 60–75px at 1080×1920 and about 44–56px at 1920×1080. Anything under ~48px on 9:16 is hard to read muted [L].
- Word-by-word "karaoke" captions dominate talking-head shorts (one vendor claims 86.6% of high performers use them [L]), but they look cheap on a cinematic trailer. **Use them only on the making-of or explainer cutdowns, not the master.**

**C. Mandatory labels.**
- Any PnL, balance or "%" shown: a visible **SIMULATED** label in JetBrains Mono. The app's own share cards already carry the watermark.
- End card plus post caption: **"AI-generated · dramatized · paper trading only."** This matches X's synthetic/manipulated media policy (satire allowed if it doesn't cause "significant confusion about authenticity") [M] and TikTok's AI-content label requirement if cross-posted [M].

---

## 5. Mixing AI shots with real product UI

**Pattern seen across 2025–2026 hybrid ads:** AI handles B-roll, mood and scale, while **real product footage is the proof**. Founders increasingly skip generating product demos entirely because "showing the actual product beats synthesizing it" [L]. AI video models also garble on-screen text and UI [M/L], so a generated "terminal" would be both fake and illegible.

**Ratio.** About 60–70% AI drama and 30–40% real UI by screen time in the master. The 9:16 cut can flip toward more UI.

**Techniques (from strongest to weakest):**
1. **Match cut through a screen.** The AI shot ends on a push-in to a glowing, *blank* monitor (or a monitor showing only an abstract amber-green glow). Cut on the push to the real screen recording at matching brightness and colour. This is the signature transition.
2. **Screen replacement / corner-pin.** Generate a bunker or war-room keyframe with a monitor that has a clean, flat, evenly lit face. In the edit, corner-pin the real app recording onto it, add a soft glow, scanlines at 5–10% and a slight defocus. The model never draws the UI.
3. **Punch-in "evidence" inserts.** 1s real-UI flashes in Act 2: top-10 holders chip, a "bundler" wallet label, a Monitor-feed alert, a token sliding into the Migrated column. Each punch-in pairs with an archetype card (THE BUNDLER, then the real bundler-detection chip). That proves the feature exists.
4. **Grade the UI into the film,** lightly. Add a slight vignette and film grain over the screen recording so the cuts don't jar. **Never alter numbers, never remove the SIM badge**, and keep UI text sharp enough to read on a paused frame.
5. **Keyboard overlay.** A minimal keycap overlay (e.g. `B` buy, `S` sell) on UI inserts sells "keyboard-first" in one second.

**Available real footage:** `/home/user/Gmgn/marketing/video/app-footage/` (`app-trenches-live.mp4`, `app-token-chart.mp4`, `app-token-audit.mp4`, `app-wallet.mp4`, `app-signals.mp4`, `app-monitor-feed.mp4`, `app-leaderboard.mp4`) and stills in `/home/user/Gmgn/marketing/screens/`.

**Honesty guardrails for inserts:** label the UI as the real product (the persistent SIM badge does this). Never present simulator data as real-market data. Never show competitor UIs. Never fake an X post, a news chyron or a KOL reaction inside the video.

---

## 6. Prompting: Google Nano Banana Pro (keyframes)

**Facts.** Nano Banana Pro is Gemini 3 Pro Image (`gemini-3-pro-image-preview` in the Gemini API) [H]. It "thinks" (reasons about the prompt) and is positioned for high-fidelity text and professional assets [H]. It accepts up to **14 reference images** and reportedly preserves up to ~5 subjects (sources conflict on whether that figure is Pro or Nano Banana 2) [M]. It outputs up to 4K and supports roughly 1:1 to 21:9 aspect ratios [L]. Google's "7 tips" post (Nov 20, 2025) stresses a clear visual vision (story, protagonist, style), multi-reference consistency and brand identity [M via secondary].

### 6.1 Prompt structure

- **Write a creative brief in sentences, not tag soup.** Google's guidance is to "stop using tag-style prompts" [M].
- Cover, in order: **subject → action → setting → composition/framing → camera/lens → lighting → colour/grade → texture → exclusions** [L, Artlist/fal.ai pattern].
- **Use camera data, not adjectives.** "35mm anamorphic, f/2, low angle, 2.39:1 framing" beats "cinematic" because the model uses lens data to set depth of field and perspective [L, Chase Jarvis].
- **Fix by editing, not re-rolling.** If a frame is 90% right, ask for a targeted change ("keep everything, remove the second figure, darken the sky") [L].

### 6.2 Style consistency across 8 shots

1. **Style bible paragraph, pasted verbatim** at the top of every one of the 8 prompts (template below). Only the shot paragraph changes.
2. **Hero frame first.** Lock the single best frame (usually the cold open), then attach it as a **style reference** to every other prompt with an explicit role: *"Image 1 is the style reference: match its colour grade, lighting, film grain and atmosphere. Do not copy its composition."* Higgsfield and other guides say to state each reference's role [M].
3. **Role-assigned references.** Use up to ~4–8 refs: hero frame (grade), helmet/hood silhouette (character), bunker interior (set). Don't stack all 14; consistency degrades with many refs and big pose changes [L].
4. **Optional contact-sheet trick.** Ask for a **3×3 "cinematic contact sheet"** of nine shots of the same world in one generation (row 1 wide, row 2 medium, row 3 close). Crop the best panels and re-generate each at full resolution using the panel as a reference. Panels share lighting and grade by construction [L].
5. **Same aspect ratio for every keyframe** (16:9; compose with letterbox-safe headroom so a 2.39:1 crop works). For the 9:16 cut, re-generate key shots natively in 9:16 rather than cropping, using the 16:9 frame as the reference.
6. **Recurring motifs** stitch shots together: amber flare light, drifting ash, the scope-reticle shape (circles with four ticks), a lone helmeted silhouette.
7. **Unify in the grade.** Apply one LUT and one grain pass to all AI shots in the edit. The grade does more for consistency than any prompt.

### 6.3 Avoiding garbled text

- **Default: no text in keyframes at all.** End every prompt with: *"No readable text, letters, numbers, logos, signage, UI or watermarks anywhere in the frame."* Add all words, numbers and the logo in the edit, and composite the real SVG logo from `/home/user/Gmgn/marketing/brand/logo/`.
- If a frame *needs* in-world text (e.g. a stencilled crate), put the exact string in quotes, specify the font style, case, weight and placement, keep it to 1–3 words, and render at **2K/4K**. One test found 1K caused the illegible text and 2K/4K fixed it [M, GDELT]. Fix single letters by conversational edit.
- Never ask it to render the Trenchscope logo, a ticker or an exchange name. Hallucinated logos are an off-brand and impersonation risk.

### 6.4 Cinematic lighting vocabulary that works

- **Motivated practicals:** "the only light is the warm amber glow of trading monitors and distant flares". This sells the brand colour and reads as night war-film.
- **Low-key, high contrast,** deep blue-black shadows, **rim/back light** separating a silhouette from haze, **volumetric haze / god rays** through bunker slats, **sodium-vapour amber vs cold moonlight** split.
- Named setups the model knows: **Rembrandt lighting (key at 45°)**, **high-key commercial softbox** (for clean product-style frames), **golden hour**, **blue hour** [L, Atlabs].
- Texture: **"fine 35mm film grain, subtle halation on highlights, anamorphic horizontal lens flare, shallow depth of field"**.
- If shadows look physically wrong, ask it to "work out the light direction and shadow paths before rendering" [L, Chase Jarvis].
- Describe colours in words ("warm amber", "deep blue-black", "signal green"). Exact brand hexes go in the edit grade. Hex codes in prompts are hit-and-miss [L].

### 6.5 Template (style bible plus one shot)

```
STYLE BIBLE — A single frame from the trailer of a big-budget 2026 war epic, shot on large-format digital cinema camera with anamorphic lenses, composed for 16:9 with letterbox-safe headroom. Night. Low-key, high-contrast lighting: the only light sources are a warm amber glow from screens and distant flares, against deep blue-black shadows; faint cold moonlight as rim light. Volumetric haze, drifting ash, fine 35mm film grain, subtle halation, anamorphic horizontal flare. Desaturated palette except amber, with tiny accents of signal green and alarm red. Figures are anonymous: silhouettes, backlit, helmeted or hooded, or seen from behind — no visible faces. No readable text, letters, numbers, logos, signage, UI or watermarks anywhere. Image 1 is the style reference: match its grade, lighting, grain and atmosphere, not its composition.

SHOT 2 — Inside a cramped wooden-beamed bunker, a lone helmeted figure seen from behind sits hunched before three glowing monitors whose screens show only soft abstract amber-green light. Medium-wide shot from behind at seated eye level, 35mm, f/2, the figure slightly left of centre, monitors filling the right two-thirds. Dust hangs in the screen light.
```

---

## 7. Prompting: Kling 3.0 image-to-video

**Facts.** Kling 3.0 was announced Feb 4, 2026 (variants: Video 3.0, Video 3.0 Omni, Image 3.0 Omni) [M]. Clips run **3–15s** [M] (Higgsfield claims stable generation to 30s [L]). Features include multi-shot (up to ~6 shots per generation), native audio with lip-sync in 5 languages, start/end-frame control, and Elements/character binding on Omni [M]. **Negative prompts are now supported in image-to-video and weighted more strongly in 3.0** [H, Kling blog]. Kling's own I2V guide uses a **Subject + Movement** formula [H]. On Higgsfield, Kling Start/End frames work only with the General preset [M].

### 7.1 Prompt structure for I2V

- **Don't re-describe the image.** The keyframe is the visual anchor. The prompt drives **motion only**: *subject movement + camera move + ambient motion + what stays fixed* [M/L, fal.ai, Atlas Cloud].
- **Write the motion as continuing,** not as a starting state ("the figure slowly lowers its head as ash drifts past", not "a figure in a bunker") [L].
- Keep it to **1–3 short sentences**. Focused prompts beat long ones [L].
- **Iterate one variable at a time.** Change only the broken element and re-run [L].

### 7.2 Camera-move vocabulary (one per shot)

| Move | Prompt wording | Best for | Risk |
|---|---|---|---|
| Static / locked-off | "locked-off static camera, no camera movement" | Archetype cards, the button, any shot with a figure | Lowest. Kling handles static best [L]. |
| Slow push-in (dolly in) | "slow dolly in toward the monitors, no zoom" | Tension, match-cut into a screen | Low. Add "no zoom" to avoid zoom/dolly confusion [L]. |
| Slow pull-back (dolly out) | "slow dolly out revealing the full trench network" | Reveals, scale | Low–medium |
| Crane / pedestal | "slow crane down from above the trenches" | Cold open aerials | Medium |
| Pan / tilt | "slow pan right across the war-room table" | Surveying a set | Low–medium |
| Truck / tracking | "camera tracks behind the figure as it walks toward the flare" | Hero walk | Medium (legs and gait can warp) |
| Orbit / arc | "slow 30-degree orbit around the holographic map" | Hero object | Medium–high. Keep the arc small. |
| Handheld | "subtle handheld sway" | Chaos beats | Medium. Can read as jitter. |
| Start/end frame | Keyframe A to keyframe B | Precise moves, reveals, loops (same image for both = loop) [M] | Needs two consistent keyframes |

- **One move per shot.** Two simultaneous moves are risky. Three or more tend to fail [L].
- **Slow is cinematic and stable.** Whip pans and fast moves carry high artifact risk [L].
- Higgsfield camera presets (e.g. Static, Super Dolly In, Through Object) are a reliable alternative to typing the move [L].

### 7.3 Keeping 5-second shots simple

- **One subject action, one camera move, plus ambient motion.** Ambient motion is cheap and convincing: ash, haze, flare flicker, screen glow pulsing, rain, a flag stirring.
- **Prefer actions that hide anatomy:** a head lowering, shoulders slumping, a silhouette standing up, a helmet turning away. Avoid typing hands, walking toward the camera, eating, handling small props, or crowds interacting [L].
- Generate at **5s** and plan to use the best **1.5–3s**. Use 10s only for the cold-open aerial if needed.
- **Turn native audio off, or ignore it.** Music, VO and SFX are built in the edit. Generated audio and random subtitles are a known nuisance (Accetturo couldn't suppress random subtitles in Veo) [H maker].
- **Multi-shot mode off** for these clips. We control cuts in the edit.

### 7.4 Avoiding morphing and faces

- **No faces is the cheapest fix.** Use silhouettes, helmets with dark visors, hoods, backlit figures, or backs of heads. This also removes real-person likeness and impersonation risk, and AI people are where viewers object most (Kantar's Coca-Cola finding) [M].
- If a face must appear: use **even lighting** on the face in the keyframe (hard shadows get read as features), a **direct or three-quarter view**, minimal head turn, and simple clothing textures [L, Atlas Cloud].
- **Negative prompt (paste on every shot, then add shot-specific terms):**
  `morphing, warping, melting, face distortion, deformed face, extra fingers, extra limbs, distorted hands, flicker, jitter, sudden camera cut, scene change, duplicate subjects, extra people, text, letters, numbers, subtitles, watermark, logo, blurry, low quality`
  Add per shot: "bending walls, floating objects" (interiors), "multiple people" (solo figure), "zoom" (dolly shots). Name **specific visible defects**, not vague ones ("looks bad") [L].
- Negatives are a guardrail, not a cure. Structural fixes work better: a cleaner keyframe, shorter clip, smaller motion, start/end frames [L].
- **Review at 0.25× speed** for hands, edges, prop/body merges, shadows and flicker before accepting a clip [L].

### 7.5 Example I2V prompts

```
SHOT 1 (cold-open aerial) — Slow crane down over the trench network; amber flares drift slowly and flicker, ash falls through the light. Static subjects, no people moving. No zoom.

SHOT 2 (bunker) — Locked-off static camera. The helmeted figure slowly lowers its head; monitor glow pulses softly; dust drifts in the light beams. Nothing else moves.

SHOT 8 (match-cut out) — Slow dolly in toward the central monitor until its glowing blank screen fills the frame. No zoom, no text on screen.
```

---

## 8. Common pitfalls (and the fix)

| Pitfall | Why it hurts | Fix |
|---|---|---|
| Deceptive realism (fake news clip, fake interview, fake KOL reaction) | Violates X synthetic-media rules and the honesty rules. Fake-trailer channels got banned. It kills trust on CT, where "larp" is an insult. | Obvious stylised fiction plus "AI-generated · dramatized" on the end card and in the caption |
| Real people, KOLs, celebrities, director pastiche, competitor UI or logos | Impersonation and brand risk | Anonymous silhouettes, an original look, only our own UI |
| AI-generated numbers or PnL | Fabricated metrics. Simulated data could pass as real. | Numbers only from the real sim UI, always labelled SIMULATED |
| Token, airdrop, ticker or "100x" lines in VO or cards | PRD non-goal, X financial-scam rules | "train with fake money", "larp the trenches", "paper trading only" |
| "Made with AI" as the selling point | The Super Bowl LX / Svedka lesson: AI becomes the headline and the message feels hollow | Lead with the joke and the product. Mention AI only as disclosure and in a making-of reply. |
| Logo or slow intro, audio-dependent hook | Muted autoplay plus a ~2s decision window | Title card plus image on frame 0 |
| Too long | Retention bleed | 30–45s master, 6–12s teasers |
| Garbled text or UI in generated shots | Instantly reads as "AI slop" | No text in AI shots. Add cards in the edit, composite real UI. |
| Style drift between shots | Looks like a stock montage | Style bible, hero reference, one LUT and grain pass |
| Morphing faces and hands | Uncanny, mocked in replies | No faces, simple actions, negatives, trim to the clean middle |
| Complex or fast camera moves | Warping and artifacts | One slow move per shot, static when in doubt |
| 16:9 letterboxed inside 9:16 | Tiny on phones | Re-frame or re-generate key shots natively in 9:16 |
| Copyrighted music or recognisable score | Takedowns, muted audio | Licensed or generated trailer music |
| Spending all credits on one shot | Budget blowout (Kalshi ratio was ~20–27 generations per kept clip in T2V with dialogue) | Cap 3–4 I2V tries per shot. Swap the keyframe instead of re-rolling forever. |
| Cross-posting without labels | TikTok requires AI labels for realistic AI content | Toggle the platform AI label on TikTok/Reels/Shorts |
| Same clip posted twice on X | Duplicate filter, spam label | Each teaser is a unique cut, posted once |

**Optional QA:** the Higgsfield MCP exposes a `virality_predictor` (hook strength, retention risk) that can compare 2–3 cold-open variants before launch. Treat its output as a heuristic, not evidence.

---

## 9. How this maps to the 8 AI shots (illustrative skeleton)

These are examples to show the rules in action. The final shot list belongs to the video plan.

| # | AI keyframe (no text, no faces) | Kling motion | Card / insert in edit |
|---|---|---|---|
| 1 | Aerial night trench network shaped like a candlestick chart, amber flares | Slow crane down | "IN A WORLD WHERE THE DEV ALWAYS SELLS" |
| 2 | Bunker, helmeted figure from behind, blank glowing monitors | Static, head lowers | Match-cut into real Trenches board |
| 3 | War-room table with an abstract glowing map of four lit nodes (four chains, no logos) | Slow push-in | "FOUR CHAINS. ONE TRENCH." (v1 chains are simulated markets; check wording against `CLAIMS_LEDGER.md`) |
| 4 | Rooftop silhouette with a long scope at blue hour | Static, wind and haze | "THE SNIPER." then real sniper-wallet label insert |
| 5 | Rows of identical crates stamped with nothing, lit by one amber bulb | Slow dolly out | "THE BUNDLER." then real bundler chip insert |
| 6 | A cloaked figure handing a sealed envelope in a dark corridor (hands only) | Static, minimal motion | "THE INSIDER." then real insider-wallet tag insert |
| 7 | A rug on the trench floor sagging into a sinkhole, dust rising | Static, ground collapses slowly | Black. "TRAIN WITH FAKE MONEY." |
| 8 | Scope reticle (ring with four ticks) over a horizon with a rising green light | Slow push-in | Match-cut to the real logo mark, then the title card, then the button and the disclosure end card |

---

## Sources

Fake trailers and formats
- [PetaPixel: YouTube takes action against fake AI-generated movie trailers (May 2025)](https://petapixel.com/2025/05/13/youtube-takes-action-against-fake-ai-generated-movie-trailers)
- [PetaPixel: How movie studios cash in on fake AI movie trailers (Apr 2025)](https://petapixel.com/2025/04/02/how-movie-studios-cash-in-on-fake-ai-movie-trailers-on-youtube)
- [Soap Central: How AI-made fake movie trailers went viral](https://bravo-www.soapcentral.com/entertainment/how-ai-made-fake-movie-trailers-went-viral-youtube-finally-stepped)
- [No Film School: Why do AI-created fake film trailers scare us so much?](https://nofilmschool.com/ai-fan-made-trailers)
- [Euronews: AI-generated Wes Anderson Star Wars trailer goes viral and divides fans (2023)](https://www.euronews.com/2023/05/01/ai-generated-wes-anderson-star-wars-trailer-goes-viral-and-divides-fans)
- [Space.com: Wes Anderson-inspired Avatar AI trailer](https://www.space.com/wes-anderson-inspired-avatar-ai-tribute-trailer)
- [Moss & Fog: If Wes Anderson directed Lord of the Rings](https://mossandfog.beehiiv.com/p/if-wes-anderson-directed-lord-of-the-rings-a-strange-and-quirky-ai-journey)
- [Mugglehead: Charles Curran AI parody trailers pull millions of views on X](https://mugglehead.com/latest-ai-movie-trailers-for-titty-killer-saga-pull-millions-of-views-on-x/)
- [Pirate Wires: The AI filmmaker outrunning Hollywood](https://www.piratewires.com/p/the-ai-filmmaker-outrunning-hollywood)
- [Jason Deegan: viral AI street interview ("we're doomed")](https://jasondeegan.com/two-women-terrify-the-internet-in-a-street-interview-viewers-shocked-by-the-chilling-reason/)
- [Anijam: Funny AI video ideas 2026](https://www.anijam.ai/blog/funny-ai-videos/)
- [Marketing Oops: Italian brainrot](https://www.marketingoops.com/news/viral-update/italian-brainrot/)
- [Fox 10: What is "brain rot"?](https://www.fox10phoenix.com/news/what-is-brain-rot-ai-kids)
- [Opus: 17 viral AI video styles of 2026](https://www.opus.pro/blog/viral-ai-video-styles-2026)
- [Know Your Meme: LARP / larping](https://knowyourmeme.com/memes/larp-larping) · [Gate: What does LARP mean (crypto)](https://www.gate.com/learn/glossary/what-does-larp-mean)

Kalshi / AI commercials
- [NPR (via MPR News): An AI video ad is making a splash (Jun 2025)](https://www.mprnews.org/story/2025/06/23/npr-ai-video-ad-kalshi-advertising-nba-finals)
- [Business Insider NL: The chaotic Kalshi ad was made with AI for $2,000](https://www.businessinsider.nl/the-chaotic-kalshi-ad-during-the-nba-finals-was-made-with-ai-for-2000-the-guy-behind-the-clip-shared-how-he-made-it/)
- [PJ Accetturo newsletter: "I can't believe Disney allowed us to run this AI ad"](https://pjace.beehiiv.com/p/i-can-t-believe-disney-allowed-us-to-run-this-ai-ad-during-the-nba-finals-f77e73388ab4ca62)
- [PJ Accetturo newsletter: Don't miss the Veo 3 gold rush](https://pjace.beehiiv.com/p/don-t-miss-the-veo-3-gold-rush)
- [SAYS: AI filmmaker makes bizarre ad in 3 days](https://says.com/my/tech/tech-news/kalshi-ai-ad-2025)

Backlash and effectiveness
- [Storyboard18: McDonald's pulls AI-generated Christmas ad in the Netherlands](https://www.storyboard18.com/brand-marketing/mcdonalds-pulls-ai-generated-christmas-ad-in-the-netherlands-after-online-backlash-85723.htm)
- [DesignRush: McDonald's AI holiday ad backlash](https://news.designrush.com/mcdonalds-holiday-ad-backlash-consumer-ai-fatigue)
- [Meltwater: AI ads face skepticism (Super Bowl LX)](https://www.meltwater.com/en/news/ai-ads-face-skepticism)
- [Warrant: Super Bowl 2026 AI ads backlash](https://www.hellowarrant.com/blog/super-bowl-2026-ai-ads-backlash)
- [The Deep View: AI Super Bowl ads missed the mark](https://www.thedeepview.com/articles/ai-super-bowl-ads-missed-the-mark)
- [McGraw Hill: "AI slop" backfires in ads (May 2026)](https://www.mheducation.com/highered/blog/2026/05/ai-slop-backfires-in-ads)
- [Kantar: Rethinking AI-generated advertising](https://www.kantar.com/Inspiration/Advertising-Media/Rethinking-AI-generated-advertising)
- [Research Live: Effective creative principles remain the same whether or not ads use AI (Kantar)](https://www.research-live.com/article/news/effective-creative-principles-remain-the-same-whether-or-not-ads-use-ai-finds-kantar/id/5145503)
- [MHI Media: How to make AI slop ads that actually convert (agency view)](https://mhimedia.beehiiv.com/p/how-to-make-ai-slop-ads-that-actually-convert)

Hooks, pacing, captions, X
- [TechCrunch: Twitter now autoplays video and GIFs, muted (2015)](https://techcrunch.com/2015/06/16/twitter-now-autoplays-video-and-gifs)
- [VentureBeat: Twitter starts autoplaying videos by default](https://venturebeat.com/marketing/twitter-starts-autoplaying-videos-gifs-and-vines-by-default)
- [ByteCap: The science of silent viewing](https://www.bytecap.io/blog/science-of-silent-viewing-short-form-video-retention)
- [ClipSpeed: The first second of your video](https://www.clipspeed.ai/blog/hook-first-second-video-retention.html)
- [CapCut: Short-form video hook formulas](https://www.capcut.com/create/short-form-video-hooks)
- [CapCut: Montage rhythm and cut speed](https://www.capcut.com/create/music-video-pacing-emotional-montage-rhythm)
- [Jonny Elwyn: How to edit a movie trailer (Derek Lieu structure)](https://jonnyelwyn.co.uk/film-and-video-editing/how-to-edit-a-movie-trailer/)
- [Wireflow: How to create a movie trailer with AI](https://www.wireflow.ai/blog/how-to-create-a-movie-trailer-with-ai)
- [Morphic: AI trailer videos](https://morphic.com/resources/videos/trailer-videos)
- [ClipSpeed: Instagram Reels captions, sizes and safe zones](https://www.clipspeed.ai/blog/instagram-reels-captions.html)
- [Quso: How to burn captions into video](https://quso.ai/blog/burn-captions-into-video)
- [BlitzCut: Best caption style for YouTube Shorts 2026](https://blitzcutai.com/blog/best-caption-style-youtube-shorts-2026)
- [Captions.ai: X video length limit](https://www.captions.ai/blog-post/twitter-video-length-limit)
- [NemoVideo: How to make a viral video for X in 2026](https://www.nemovideo.com/blog/how-to-make-viral-twitter-video-2026)
- [Decrypt: X to suspend creator payouts for undisclosed AI war videos](https://decrypt.co/359880/x-suspend-creator-payouts-undisclosed-ai-war-videos)
- [NBC: TikTok to start labeling AI-generated content](https://www.nbcnewyork.com/news/national-international/tiktok-to-start-labeling-ai-generated-content-as-technology-becomes-more-universal/5399109)

Hybrid AI + product footage
- [Echai Ventures: How founders make product demos, ads and social video with AI](https://echai.ventures/how-founders-use-ai/video-image-audio/how-are-founders-making-product-demos-ads-and-social-video-with-ai-veo-sora-runway-heygen-elevenlabs)
- [VideoBGRemover: Turn app screen recordings into AI UGC ads](https://videobgremover.com/n8n/ugc-ad-generator)
- [Oakgen: AI video e-commerce guide (text overlays in post)](https://oakgen.ai/blog/ai-video-ecommerce-guide)
- [Decrypt: Kling 2.1 vs Veo 3 (text rendering test)](https://decrypt.co/323056/best-short-form-ai-video-generator-kling-google-veo?amp=1)

Nano Banana Pro
- [Google Gemini API docs: Nano Banana image generation](https://ai.google.dev/gemini-api/docs/nanobanana)
- [Google blog: 7 tips to get the most out of Nano Banana Pro (Nov 2025)](https://blog.google/products/gemini/prompting-tips-nano-banana-pro/) · [Blog du Modérateur summary](https://www.blogdumoderateur.com/nano-banana-pro-7-conseils-google-prompts-efficaces/) · [TechRadar summary](https://www.techradar.com/ai-platforms-assistants/gemini/3-advanced-strategies-for-making-the-most-of-nano-banana-pro)
- [Artlist: Prompting Nano Banana Pro for video creators](https://artlist.io/blog/nano-banana-prompts/)
- [Atlabs: Ultimate Nano Banana Pro prompting guide](https://www.atlabs.ai/blog/the-ultimate-nano-banana-pro-prompting-guide-mastering-gemini-3-pro-image)
- [Chase Jarvis: Nano Banana Pro tips](https://chasejarvis.com/?p=38175)
- [fal.ai: Nano Banana Pro prompting guide](https://fal.ai/learn/tools/nano-banana-pro-prompting-guide)
- [YouCam: Nano Banana Pro prompting guide](https://www.perfectcorp.com/consumer/blog/photo-editing/nano-banana-pro-prompting-guide)
- [GDELT: Fixing Nano Banana Pro text rendering by changing resolution](https://blog.gdeltproject.org/addressing-the-text-rendering-translation-issues-of-our-nano-banana-pro-experiments-by-changing-the-resolution-prompt/)
- [Higgsfield help: How to use Nano Banana](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-nano-banana)
- [Flick: Keeping a character consistent in Nano Banana](https://flick.art/blog/img2img-consistent-character/nano-banana)
- [Atlas Cloud: Nano Banana 14 reference images and consistency](https://www.atlascloud.ai/blog/guides/nanobanana-14-reference-images-consistency)
- [vc.ru: Storyboards in Nano Banana (3×3 contact sheet)](https://vc.ru/id132674/2625881-kak-sozdat-raskadrovki-v-nano-banana)
- [YouMind: 3×3 cinematic storyboard contact sheet prompt](https://youmind.com/de-DE/prompts/33-cinematic-storyboard-contact-sheet-from-one-input-image-724)

Kling 3.0 and camera language
- [Kling: Image-to-video guide](https://kling.ai/quickstart/image-to-video-guide)
- [Kling blog: Negative prompts to fix video distortion](https://kling.ai/blog/kling-ai-negative-prompts-fix-video-distortion)
- [fal.ai: How to use Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Magic Hour: Kling 3.0 reference guide](https://magichour.ai/blog/kling-30-reference-guide)
- [Gaga: Kling 3.0 release feature guide](https://gaga.art/blog/kling-3-0/)
- [Cinevva: Kling 3 global launch](https://app.cinevva.com/news/2026-03-25-kling-3-global-launch)
- [ComfyUI docs: Kling 3.0](https://docs.comfy.org/tutorials/partner-nodes/kling/kling-3-0)
- [RunDiffusion: Kling 3.0 Pro (start/end frames, durations)](https://www.rundiffusion.com/kling-3-0-pro-ai-tool)
- [Higgsfield blog: Kling start/end frames](https://higgsfield.ai/blog/Kling-Start-End-Frames)
- [Higgsfield: How to use Kling 3.0 cinematic shots](https://geo.higgsfield.ai/blog/how-to-use-kling-3-0-cinematic-shots-motion-control)
- [Atlas Cloud: Solving character inconsistency in Kling 3.0 I2V](https://www.atlascloud.ai/blog/guides/solving-character-inconsistency-a-guide-to-kling-3.0-image-to-video-mode)
- [Atlas Cloud: Kling AI video prompt guide](https://www.test.atlascloud.ai/blog/tips/kling-ai-video-prompt-guide)
- [Cliprise: Kling 3.0 tutorial 2026](https://www.cliprise.app/learn/guides/model-guides/kling-3-0-tutorial-2026)
- [Imagine.art: Kling 3.0 prompt guide](https://www.imagine.art/blogs/kling-3-0-prompt-guide)
- [Hooked: Higgsfield prompt pack (camera presets)](https://www.hooked.so/prompts/higgsfield)
- [invideo: What to put in a negative prompt for AI video](https://invideo.io/faq/what-should-you-put-in-a-negative-prompt-for-ai-video/)
- [VideoAI.me: Kling troubleshooting](https://videoai.me/blog/kling-ai-troubleshooting)
- [HackerNoon: Negative prompts don't fix AI video glitches: the checklist that does](https://hackernoon.com/negative-prompts-dont-fix-ai-video-glitches-heres-the-checklist-that-does)
- [ai-creator-toolkit: Camera movements reference](https://cdn.jsdelivr.net/npm/ai-creator-toolkit@1.4.0/skills/director/knowledge/camera-movements.md)
- [Kapwing: The complete AI camera prompt guide](https://www.kapwing.com/resources/the-complete-ai-camera-prompt-guide-77-shots-and-movements/)
- [Luma: AI camera movement prompts](https://lumalabs.ai/news/ai-camera-movement-prompts)
- [Magic Hour: Spotting AI-generated videos (artifact checklist)](https://magichour.ai/blog/spot-ai-generated-videos)
- [Morphic glossary: Visual artifacts](https://morphic.com/ai-glossary/artifacts-visual)
