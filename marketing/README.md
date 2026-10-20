# Trenchscope marketing kit

Everything for the X account: the brand, the warm-up week, launch day, the trailer, the replies, and a gated plan for the coin's CA day. Trenchscope is marketed as a real memecoin trading terminal that trades and tracks across Solana, Base, BNB Chain, Ethereum and Robinhood Chain, with self-custody. The warm-up teases it; launch-day posts say it's live. No dates in any copy.

**Start here:** [`x/TODAY.md`](x/TODAY.md) (account setup and Day 1), then [`x/WARMUP_WEEK.md`](x/WARMUP_WEEK.md) day by day, then [`x/LAUNCH_DAY.md`](x/LAUNCH_DAY.md).

## The rules every asset follows

- **Demo data, labelled.** Product footage is the real app on demo data in marketing capture mode, with `UI shown with demo data` burned in. Demo tickers, names and @handles are blurred: they can collide with real coins and people.
- **AI, labelled.** Every AI frame (the species, the trench) carries `AI-generated`. The product has no AI, and AI is never shown as product footage.
- **RISK and CUSTODY.** `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` on product posts; `we will never DM you first, ask for your seed phrase, or ask you to send funds.` wherever keys or funds come up.
- **Claims come from the ledger.** [`research/CLAIMS_LEDGER.md`](research/CLAIMS_LEDGER.md) says what may be said and cites the code for each claim. No competitor names, no chain logos, no partnership hints, no speed, safety or profit claims.
- **No token talk** until the coin gate in [`x/COIN_LAUNCH.md`](x/COIN_LAUNCH.md) §1 passes (MNC-02).
- **"Live" waits** for the launch gate in `x/LAUNCH_DAY.md` §1.1.

## Docs

| File | What |
|---|---|
| [`research/POSITIONING.md`](research/POSITIONING.md) | The brief: who it's for, the lines, the disclaimers (binding) |
| [`research/CLAIMS_LEDGER.md`](research/CLAIMS_LEDGER.md) | Every claim with its code citation and status; the never-say list (MNC) |
| [`research/CT_PLAYBOOK.md`](research/CT_PLAYBOOK.md), [`research/VIRAL_FORMATS.md`](research/VIRAL_FORMATS.md), [`research/AI_VIDEO_NOTES.md`](research/AI_VIDEO_NOTES.md) | How crypto Twitter works, what formats travel, the AI-video notes |
| [`brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md) | Voice, colours, type, labels, layouts |
| [`x/PROFILE.md`](x/PROFILE.md), [`x/TODAY.md`](x/TODAY.md) | Account setup, bio, header, pinned post, Day 1 |
| [`x/WARMUP_WEEK.md`](x/WARMUP_WEEK.md) | Seven days of posts, with the asset list in §9.2 (statuses current) |
| [`x/LAUNCH_DAY.md`](x/LAUNCH_DAY.md) | The launch gate, the trailer post, the thread, quote posts, L+1 and L+2, with the asset list in §10 |
| [`x/REPLY_BANK.md`](x/REPLY_BANK.md) | Replies by situation, plus the meme set (§5) |
| [`x/COIN_LAUNCH.md`](x/COIN_LAUNCH.md) | CA day: gate, rules, timeline, templates, replies, incidents. **Gated** |
| [`video/SCRIPT.md`](video/SCRIPT.md) | The trailer: beat sheet, overlays, VO, captions, posts; §20 is the as-built record |

## Assets

| Where | What |
|---|---|
| `x/profile/` | `avatar.png`, `header-alt.png` (chains + chips), `header-main.png` (AI art + lockup), raw art in `art/` |
| `x/posts/` | Warm-up posts: field-guide teasers `fg-*`, product peeks `peek-*`, spot-the-rug `sr1-*`, cards (`stat-97`, `thread-lifecycle`, `dict-*`, `og`), memes `meme-*`, POV loops `pov-*`, `species-montage`, `teaser-soon`, the trailer end cards. Alt texts in `x/posts/alt/` |
| `x/posts/launch/` | Launch thread and L+1/L+2 images and clips (`launch-3` … `launch-17`). Alt texts in `x/posts/launch/alt/` |
| `video/trenchscope-trailer-16x9.mp4`, `-9x16.mp4` | The trailer (`launch-1`, `launch-2`), with SRT and poster frames |
| `x/coin/` | CA-day cards: templates and safety cards only. Real CA cards render on CA day from `tools/coin-kit/ca_card.py` |
| `brand/logo/` | Mark, wordmark and lockups (SVG; PNGs in `png/`) |
| `video/clips/`, `video/keyframes/` | The approved AI clips and stills (Higgsfield) |
| `video/app-footage/`, `screens/live/` | Capture-mode recordings and stills, with beat and box metadata (`*.json`) |
| `x/posts/screen-*`, `d2-a*`, `d3-c`, `d4-a`, `screens/*.png` | **Retired** simulator-era assets: never post them |

## Tools (all under `tools/`)

| Tool | What |
|---|---|
| `capture-mode.js` | Loaded into every capture: hides simulator wording, renames demo venues, greys chain marks |
| `blur-tickers.js` | Blurs every demo ticker, name and @handle on the page (CSS Custom Highlight API, no DOM changes) |
| `trailer/` | Trailer v4: `capture_v4.mjs` (desktop), `capture_v4m.mjs` (phone layout), `ovl_v4.py`, `edit_v4.py`, `edit_v4v.py`, `mix_v4.py` |
| `stills/` | Warm-up captures and framing: `capture_live.mjs`, `capture_videos.mjs`, `capture_peeks2.mjs`, `frame_posts.py`, `frame_posts2.py`, `peek_videos.py` |
| `launch/` | Launch captures and framing: `capture_launch2.mjs`, `capture_watch.mjs` (waits for real dev dumps), `frame_launch.py`, `cards_launch.py`, `video_launch.py` |
| `cards2/`, `memes/`, `teasers/`, `d1/`, `profile.py` | Cards, memes (`memes/capture_facts.mjs` and `memes/capture_rug.mjs` feed the data-backed ones), teasers, the Day-1 image, the profile header |
| `coin-kit/ca_card.py` | CA-day cards; refuses to render a postable card without a valid CA and both sign-offs |
| `vedit.py`, `render.mjs`, `chips.py` | The cut-list video editor (crops, blurs, zooms, windows, timed overlays), HTML → PNG, the real tag chips |

Captures need the app running locally on `http://localhost:8787` (demo market). Renders use the pre-installed Chromium.

## What the owner still decides

These block specific posts, not the whole kit. Each is written up where it applies.

1. **Real trading per chain (C-0, C-1)** and **self-custody (K-1)**: every chain and the custody line in the bio, header and pin depend on them.
2. **K-2:** exits, copy-trade and sniper tasks run server-side in the code. With "you keep your keys" on the profile, decide the answer to "how?" before `peek-exits`, T5 and T8 post.
3. **Exit slippage:** at the default 25% sell slippage a dev-sell exit failed ("slippage exceeded") in the dump while capturing the trailer; at 80% it filled. Consider a wider default for event exits, or say so in the docs.
4. **F-3:** quick buy skips the High-risk prompt (T4 copy depends on it). **F-2:** the KOL data source (`dict-kol`, KOL rows). **F-7:** neutral chain marks (capture mode handles it for now).
5. **Fees (SC-12):** no fee number anywhere until confirmed; the demo fee is blurred in `launch-7`.
6. **Legal (L-1)** on trading promotion, and separately on the coin (`x/COIN_LAUNCH.md` §1).
7. **The handle** (`@trenchscope` is unconfirmed), the **website URL**, and the **coin's T-1 sheet** when the time comes.
8. **Scheduling:** connect the X account in Metricool if you want the week scheduled (`x/WARMUP_WEEK.md` §1.2).
