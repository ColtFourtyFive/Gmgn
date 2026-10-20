# X account setup kit: Trenchscope

| | |
|---|---|
| **For** | The owner, setting up the brand account **today (Day 1 of the warm-up)**. The warm-up runs Day 1 to Day 7. Launch day is the first morning after the launch gate passes: after Day 7 at the latest, and earlier if real trading works sooner (`WARMUP_WEEK.md` §11.1; owner confirms the plan before Day 1). Its posts go up only once real trading works |
| **What we're marketing** | A memecoin trading terminal that trades and tracks across **Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain**, with **self-custody** (`research/POSITIONING.md`). The warm-up teases it. Only the gated launch-day posts say it's live |
| **Placeholders** | `@trenchscope` (handle not yet confirmed) and `[LINK]` (no live URL exists) |
| **Rules come from** | `marketing/research/POSITIONING.md` (the binding brief), `marketing/research/CLAIMS_LEDGER.md` (what we may say: claim IDs, never-say list, disclaimers, owner checks), `marketing/research/CT_PLAYBOOK.md` (ranking, warm-up, spam triggers), `marketing/brand/BRAND_GUIDE.md` (voice, visuals, disclaimer placement) |
| **Folds in** | The approved Day-1 decisions from `marketing/x/TODAY.md`: display name, BIO-1/BIO-2b, location, header, the pinned post (PIN-v2) and its CUSTODY self-reply (PIN-r1). TODAY.md's Day-1 posts (D1-P1 to D1-P3) now live in `WARMUP_WEEK.md` Day 1 |
| **Art lives in** | `marketing/x/profile/`: `avatar.png` and `header-alt.png` are **built** (by `marketing/tools/profile.py`); `header-alt.png` needs a re-render before Day 1 (§7). `profile/art/header-art-candle-valley.jpg` is approved AI key art for an optional `header-main` (§7) |
| **Scheduler** | Metricool. A brand exists (blogId `7078702`). Re-checked today through the Metricool connector: **no social network is connected yet** (§11) |

Character counts are **X-weighted**, measured with `xlen.py` (`·` and `—` count as 1, emoji as 2). Every post is ≤ 280, so it shows in full without "Show more". Bios are ≤ 160. Display name and location are plain character counts.

**Three rules that override everything below:**
1. **Nothing says "live", "trade now" or carries a link** until real trading works on every chain the copy names (CLAIMS_LEDGER MNC-01). That includes the website field (§6.2).
2. **No dates** in any post, image or video (MNC-21). This doc uses Day 1 … Day 7, Launch day, L+1, L+2.
3. **No token talk.** No token, airdrop, points or "wen" replies unless the owner confirms a plan (MNC-02, check T-1).

---

## 0. Today's decisions at a glance

| Field | Use | Fallbacks | Section |
|---|---|---|---|
| Handle | `@trenchscope` (verify first) | `@trenchscope_`, `@usetrenchscope`, `@trenchscopehq` | §3 |
| Display name | `Trenchscope` (approved) | none | §4 |
| Bio | **BIO-1** (158, approved) | **BIO-2b** (159). BIO-2 is retired (§5) | §5 |
| Location | `the trenches` (approved) | blank | §6 |
| Website | **Blank until real trading works** | `[LINK]` after the launch gate passes (own domain, no shortener) | §6.2 |
| Avatar | `avatar.png` (scope mark, 400 × 400, **built**) | none | §7 |
| Header | `header-alt.png` (approved, **built**: "see who's really buying." + `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN` + wallet-tag chips). **Re-render before Day 1** with the new subline (§7, 0 credits) | `header-main` from the candle-valley key art (optional, not built; spec in BRAND_GUIDE §14.4) | §7 |
| Pinned post | **PIN-v2** (276, text only; the Day-1 pin in `TODAY.md`) + **PIN-r1** (118, CUSTODY, `TODAY.md`) + FAQ-2 (what it is) as a reply to PIN-r1. The original PIN (268) is retired | FAQ-1 (258) only as an owner-approved alternative to PIN-r1, never both | §9 |
| Professional category | Business account, a **software / technology** category | category hidden | §8.2 |
| Premium | Yes, **Premium** (not Basic), bought **after** the profile is complete | Verified Organization is an optional owner decision | §2 phase E |
| Paid promotion | **None.** No ads, no "Promote" button, no paid creators | none | §8.3 |
| Scheduling | Metricool, original posts only, never replies | none | §11 |

**Owner confirms before the profile and the PIN go up: check C-0** (ledger §8; the warm-up gate. It covers teasers only, never "live", which waits for C-1 and K-1 on launch day):
- [ ] **Self-custody is in the launch build**, and the K-2 answer (how automated orders sign without the team holding keys) is on its way. BIO-1, BIO-2b, the header, PIN-v2 and FAQ-2 say it (ledger SC-46).
- [ ] **Each named chain is in the launch build** (one tick each): Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain. Any chain that won't make it comes out of the bio, header and pin now. Four-chain versions are ready in §5, §7 and §9 (SC-43, SC-45).
- [ ] **Wallet tags and the token audit are in the launch build**, on real chain data (F-1).
- [ ] **The launch-day plan:** launch day is the first morning after the gate passes, or the owner has said launch posts wait until after Day 7 (`WARMUP_WEEK.md` §11.1, POSITIONING "Schedule").

---

## 1. Have these ready before you start

- [ ] **A dedicated email inbox** for the brand (e.g. `x@[yourdomain]` once the domain exists, or a fresh mailbox the owner controls long-term). Not a personal inbox. Turn on 2FA for the mailbox itself, because whoever owns the email owns the X account.
- [ ] **The owner's real mobile number** (not a VoIP or virtual number; X often rejects those).
- [ ] **A password manager entry** with a unique 20+ character password.
- [ ] **An authenticator app** (for 2FA) on the owner's phone. A hardware security key is worth adding: a self-custody brand account is a phishing target from day one.
- [ ] **The owner's normal device and network.** No VPN, no hopping between locations. "About this account" shows country, VPN warnings, username-change count and how the app was installed.
- [ ] **The art files**: `marketing/x/profile/avatar.png` and `marketing/x/profile/header-alt.png` (§7).
- [ ] **The chosen handle, display name, bio and pinned-post text** (§3–§5, §9), copied somewhere you can paste from.
- [ ] **The C-0 checks in §0** ticked, or the four-chain versions picked.
- [ ] **`header-alt.png` re-rendered** with the new subline (§7).

No image is needed for the pinned post: it's text only. The old pinned image (`marketing/x/posts/screen-trenches.png`) carries sim wording and is retired; `peek-board` replaces it (`WARMUP_WEEK.md` §9.3).

---

## 2. Day-1 checklist (step by step)

Work top to bottom. Allow about 90 minutes plus the follow sessions spread through the day. Menu names on X drift, so if a path below doesn't match, type the setting name into the **search box at the top of Settings**.

### Phase A: Check the handle (10 min)

- [ ] In a **logged-out** browser window, open `x.com/trenchscope`. "This account doesn't exist" means it *might* be free. A deactivated account holds its name for about 30 days, and a suspended one shows "Account suspended", so this check alone isn't proof.
- [ ] The definitive check is live: the username step during sign-up (or later, **Settings → Your account → Account information → Username**) says whether the name is available.
- [ ] Search X for `trenchscope` and see whether anyone already uses the name. If a live project does, tell the owner before going further. That's a naming problem, not just a handle problem.
- [ ] Check the same name on the domain you plan to use for `[LINK]` (e.g. `.com`, `.xyz`, `.app`) so the bio link matches the handle later.
- [ ] **Don't buy a handle** from a squatter (selling usernames breaks X's rules), and **don't register backup accounts** to hold fallback names (duplicate accounts are a platform-manipulation risk).
- [ ] Walk the ranked list in §3 until one is free. **Pick once.** X publicly counts username changes, and changing it after verification can remove the checkmark while X re-reviews.

### Phase B: Create and secure the account (20 min)

- [ ] Sign up at `x.com/i/flow/signup` on the owner's normal browser.
- [ ] **Name**: `Trenchscope` (§4).
- [ ] **Email**: the dedicated brand inbox. Confirm the code.
- [ ] **Date of birth**: the **owner's real date of birth** (the account operator), then set its visibility to "Only you". **Never enter the brand's founding date** (this year). X reads that as an under-13 user and locks the account.
- [ ] **Password**: from the password manager.
- [ ] **Interests step** (if shown): pick crypto/cryptocurrency, technology and memes. These shape the account's own home feed, which is where reply targets come from.
- [ ] **Suggested follows step**: skip it. The first follows are hand-picked (§10).
- [ ] **Username step**: enter the chosen handle. If X skips this step and assigns a random name, change it **once**, right away, in Settings → Your account → Account information → Username, **before the first post**.
- [ ] Add and confirm the **phone number** (Settings → Your account → Account information → Phone).
- [ ] **2FA**: Settings → Security and account access → Security → Two-factor authentication → **Authentication app**. Save the backup codes offline. A security key or passkey is a good extra. Don't rely on SMS (SIM-swap risk).
- [ ] **Password reset protect**: same Security page → **On** (a reset then needs the email or phone).
- [ ] Install the **official X app** on the owner's phone and log in there too, so reply notifications reach you within the first hour of each post.

### Phase C: Fill in the profile before any post (15 min)

Do this before buying Premium. Changing the photo, display name or username after the checkmark appears can remove it while X reviews again.

- [ ] **Profile photo**: upload `avatar.png` (§7).
- [ ] **Header**: upload `header-alt.png` (§7).
- [ ] **Name**: `Trenchscope` (§4). **Bio**: BIO-1 (§5). **Location**: `the trenches` (§6). **Website**: leave **blank** (§6.2).
- [ ] **Professional account** (Edit profile → Switch to Professional, if offered): account type **Business**, a **software / technology** category. Read §8.2 first: it explains why, and what X's crypto rules mean for us.
- [ ] Don't turn on Tips, Subscriptions or creator-monetization features. A trading account that charges followers reads as a paid signals group, and paid signals are financial advice in all but name (MNC-18).

### Phase D: Settings (15 min)

Use the full table in §8.1. The essentials:

- [ ] **Photo tagging: Off.** Scammers mass-tag brand accounts in fake-airdrop images.
- [ ] **DMs**: message requests from **verified users** only, **filter low-quality messages: On**, read receipts **Off**.
- [ ] **Notifications**: quality filter **On**. Mute notifications from new accounts, default-photo accounts and accounts without a confirmed email or phone. **Don't** mute "people you don't follow", because strangers' replies are the growth channel.
- [ ] **Discoverability by email/phone: Off.** **Location in posts: Off.** **Protect your posts: Off.**
- [ ] **Image description (alt text) reminder: On.**

### Phase E: Premium (10 min)

- [ ] Subscribe to **Premium** (not Basic) from the web (Settings → Premium). It's usually cheaper on the web than through an app store, but check current pricing.
- [ ] Why: in X's open-source ranker, Premium/verified accounts seed the credibility PageRank. Buffer's study of 18.8M posts found a median of ~600 impressions per post for Premium vs under 100 for free accounts (correlational: paying accounts differ). Unverified accounts also get lower daily caps (CT_PLAYBOOK §3.7).
- [ ] The checkmark appears **after a review** that can take days. Older help pages also listed eligibility rules such as a minimum account age and a confirmed phone. Check X's current verification page, and **plan for the checkmark possibly not showing by launch day**: nothing in the launch plan depends on it. Don't change the photo, name or handle while the review is pending.
- [ ] **Verified Organization** (gold check, square avatar) is optional and the owner's call. It makes impersonators easier to spot, which matters more for a self-custody brand. The avatar works as a circle and as a square.

### Phase F: Pinned post and FAQ (10 min, inside a posting window)

- [ ] The C-0 checks in §0 are ticked (or the four-chain versions are picked).
- [ ] Post **PIN-v2** (§9.2), text only. Aim for **window B, 12:00–3:00 p.m. ET**, or **window C, 8:00–10:30 p.m. ET** if setup runs late. It can be the account's first original, or go up at least 3 hours from any other original. `WARMUP_WEEK.md` Day 1 sets the slot against D1-P1 to D1-P3.
- [ ] Post **PIN-r1** (`TODAY.md`, 118) as a reply to the pin, right away, then **FAQ-2** (what it is) as a reply to PIN-r1 (§9.4). FAQ-1 replaces PIN-r1 only if the owner approves it. Never post both.
- [ ] Pin it: **••• → Pin to your profile**.
- [ ] Stay in the replies for **60 minutes**. Answer every real reply, in fresh words each time. Hide and report scam replies (§8.1, reply moderation).
- [ ] The next original goes out **at least 2–3 hours later**.

### Phase G: Connect Metricool (10 min)

- [ ] Follow §11.

### Phase H: First follows (spread through the day)

- [ ] **Day 1: about 20 follows** in 3 sessions of 6–7, at least an hour apart. Use the categories and vetting rules in §10.
- [ ] **Day 1: 10–15 replies**, hand-written and specific, under posts from accounts with roughly 5k–200k followers, posted in the first 30–60 minutes after theirs. No product plug in most of them.

### Phase I: End-of-day check (5 min)

- [ ] Open **Under the Hood** (`x.com/i/jf/under_the_hood`) and check for visibility labels on the account or posts. Bookmark it. Check it daily until launch.
- [ ] Open the post analytics on the pin. Note the views and like-per-view in the first 2 hours. That is the cold-start audition (CT_PLAYBOOK §3.3).
- [ ] Settings → Security and account access → **Apps and sessions**: the only connected app should be Metricool, and the only sessions the owner's own devices.
- [ ] Search X for `trenchscope` once more. Note any look-alike accounts for the impersonation watch (§8.1).

### Not today (or ever)

No links anywhere before the launch gate passes (§6.2), no hashtags, no follow-for-follow, no bulk following or unfollowing, no follow/unfollow tracker apps, no second account, no tagging KOLs, projects or chains, no giveaways, no auto-replies or auto-likes, no handle changes, no VPN, no ads or "Promote" button (§8.3).

---

## 3. Handle shortlist (ranked)

X handles are at most 15 characters (letters, digits, underscore). **The owner must verify availability (Phase A) before committing.** None of these has been checked.

| Rank | Handle | Length | Why | Watch out for |
|---|---|---|---|---|
| 1 | `@trenchscope` | 11 | The exact brand name. Easiest to say, search and remember | Most likely to be taken |
| 2 | `@trenchscope_` | 12 | Closest fallback. Looks the same in conversation and search | A trailing underscore is easy to forget and easy to impersonate. For a self-custody brand, that's a real cost: prefer 3 or 4 if 1 is gone |
| 3 | `@usetrenchscope` | 14 | Standard product-account pattern. Reads as a tool, not a coin | — |
| 4 | `@trenchscopehq` | 13 | Signals "official account", which helps against impersonators | — |
| 5 | `@trenchscopexyz` | 14 | Crypto-native suffix. Pairs with a `.xyz` domain for `[LINK]` | Only if the domain really is `.xyz` |
| 6 | `@trenchscopeapp` | 14 | Clear and neutral | "app" can suggest a mobile app install. Don't claim one (MNC-12) |
| 7 | `@thetrenchscope` | 14 | Brand name with an article. Clean if 1–4 are taken | — |
| 8 | `@scopethetrench` | 14 | Verb-first, on-voice | Weaker brand recall |

Avoid: anything containing "papertrench" (a third-party project with that name appears in our research sources), "larp" (the old campaign line is retired), "sim" or "paper" (wrong product now), any `$` or ticker, any chain name (`sol`, `base`, `bnb`, `eth`, `robinhood`: it reads as single-chain or as affiliated, MNC-14), and any other company's name.

---

## 4. Display name

Display names can be up to 50 characters. Pick one **before** Premium and keep it. Changing it after verification triggers a re-review.

| # | Display name | Chars | Notes |
|---|---|---|---|
| **DN-1 (approved)** | `Trenchscope` | 11 | Clean, and it matches the handle. The bio carries the pitch |

The simulator-era options (`Trenchscope · sim`, `Trenchscope (paper trading)`, `Trenchscope · larp the trenches`) are retired.

Formal spelling is **Trenchscope**: one word, capital T. Never "TrenchScope", "Trench Scope" or "TS". No emoji, no `$`, no "official", no chain names, no "live" (MNC-01).

---

## 5. Bio (≤ 160 characters)

**No link in the bio** until the launch gate passes (§6.2). Both bios name the chains as supported chains only, with no logos or partnership wording (MNC-14).

**BIO-1 (approved, recommended)**: the long-form tagline, with the cast in brackets. **158 / 160**

```text
one memecoin terminal for sol, base, bsc, eth and robinhood chain. see who's really buying (snipers, bundlers, insiders, the dev) before you do. self-custody.
```

- **Claims:** the chains (SC-43, SC-45: OWNER, one check per chain; C-0 before Day 1), snipers, bundlers, insiders and the dev (SC-21, SC-21d: GREEN; rules in `apps/server/src/analytics/tokens/track.ts:8-13,99-101`), self-custody (SC-46: OWNER; C-0 before Day 1, K-1/K-2 for "live"). Line from POSITIONING "Lines" (long form).

**BIO-2b (the fallback)**: the brand line. **159 / 160**. The same text is in BRAND_GUIDE §14.2.

```text
the trenches, with a scope. trade and track memecoins on sol, base, bsc, eth and robinhood chain. snipers, bundlers, insiders: tagged. you keep your keys. nfa.
```

- It replaces **BIO-2** ("…every wallet tagged…", 143), which is retired: "every wallet tagged" overstates SC-19, because most wallets match no rule and get no tag. Four chains: **142 / 160** (`…memecoins on sol, base, bsc and eth. snipers…`).

**If a chain drops out (C-1 fails).** Change the bio the same hour. Four-chain BIO-1, without Robinhood Chain (**141 / 160**):

```text
one memecoin terminal for sol, base, bsc and eth. see who's really buying (snipers, bundlers, insiders, the dev) before you do. self-custody.
```

For any other chain, delete it from the list the same way and re-measure. Never write "robinhood chain soon" or "coming soon" (MNC-13).

**BIO-3 (post-launch option, owner's call)**: **159 / 160**. It closes with RISK-short, so it suits a live product. Same text as BRAND_GUIDE §14.2.

```text
see who's really buying. snipers, bundlers, insiders and the dev, tagged by rule. sol · base · bsc · eth · robinhood chain. you keep your keys. high risk · nfa
```

On launch day the profile changes only in the website field (§6.2) and, optionally, the bio switches to BIO-3 (`LAUNCH_DAY.md` §4, 9:40). Bio edits don't trigger a verification re-review.

---

## 6. Location, website and the link rule

### 6.1 Location

Free text, up to 30 characters. It's a joke field. X's "About this account" country comes from X's own signals, not from this field.

| Option | Chars | Notes |
|---|---|---|
| **`the trenches`** (approved) | 12 | On-brand |
| *(blank)* | 0 | Fine too |

### 6.2 Website: the link goes in only when it's live

**Rule: the website field stays blank, and no link appears anywhere (bio, posts, replies, DMs), until real trading works.** "Works" means every check below is ticked on the live build, not on a staging build:

- [ ] Real trades execute on **every chain the bio, header and pin name** (C-1). A chain that fails comes out of the bio (§5), the header (§7) and the copy **before** the link goes in.
- [ ] Self-custody is true, including for automated orders (K-1, K-2).
- [ ] The features the profile names are in the live build on real chain data: wallet tags, the audit, the risk prompt (F-1, F-3).
- [ ] The landing page loads over `https`, has a proper link preview, shows **RISK** (`memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.`) and the **CHAINS** footer (`not affiliated with any chain, launchpad or exchange named.`), lists the same chains as the bio, and has no "paper", "simulated" or "faucet" wording.
- [ ] The legal check (L-1) is done for the markets you're promoting to (§8.3).

Then, on launch day, add `[LINK]`: the owner's own domain, linked directly. No shortener, no redirect chain, no link-in-bio aggregator. UTM parameters on the direct URL are fine. `LAUNCH_DAY.md` sets the minute.

**If the gate isn't passed on launch day, the field stays blank.** Nothing on the profile changes, the pre-launch pin stays up, and launch-day posts wait.

**Never put a link inside the pinned post** while the account is following people. A low-quality or unknown URL in the pinned post combined with follow activity earns a one-week `SPAM_HIGH_RECALL` label (CT_PLAYBOOK §3.4). On launch day the link goes in the bio and in a self-reply, never in a caption (`LAUNCH_DAY.md`).

---

## 7. Profile art

Finished files live in `marketing/x/profile/`. Run every file through the brand guide's pre-flight checklist (BRAND_GUIDE §15): one amber focal point, no AI glyphs, no real people, no coin logos. And from POSITIONING: no chain logos or brand colours (no Robinhood green or feather, Binance yellow or Coinbase blue mark), no dates, no "live".

| Ref | Size | File | Format / limit | Status |
|---|---|---|---|---|
| `avatar` | 400 × 400 | `marketing/x/profile/avatar.png` | PNG, sRGB, under ~2 MB | **Built** (66 KB). Still valid |
| `header-alt` | 1500 × 500 | `marketing/x/profile/header-alt.png` | PNG, under ~5 MB | **Built and approved** (259 KB). No AI. **Re-render before Day 1** for the subline fix (below) |
| `header-main` | 1500 × 500 | `marketing/x/profile/header-main.png` | PNG or JPG, under ~5 MB | **Optional, not built.** Candle-valley AI art plus type added in post. No new generation needed. Spec: BRAND_GUIDE §14.4 |

### `avatar`: 400 × 400 (built)

- **Source:** `marketing/brand/logo/mark-dark.svg`, rendered by `marketing/tools/profile.py`.
- **What it is:** the scope mark. An amber `#FFB547` ring with four crosshair ticks at 12, 3, 6 and 9 o'clock, around a light `#E6E9F0` rising chart line, with a soft amber glow.
- **As built:** a **full-bleed `#0A0C10` square** (no transparent corners, no rounded tile), so it looks right as a circle (Premium) and as a rounded square (a Verified Organization). The whole mark survives X's circle crop.
- **Text:** none. Never add a coin, ticker or chain logo inside the reticle.

### `header-alt`: 1500 × 500 (built, approved, the Day-1 header once re-rendered)

- **Concept: "the cast."** No AI. Built in HTML from brand parts by `marketing/tools/profile.py`.
- **Background:** `#0A0C10` with a 64 px terminal grid of faint 1 px lines. A huge, cropped **scope reticle** bleeds off the **left** edge at about 11% opacity, behind the avatar zone. An amber radial flare sits behind the headline. Scanlines at 3%.
- **Chain pill** (JetBrains Mono 600, 15 px, amber outline pill, top-right): `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN`. Brand amber only; no chain colours.
- **Headline** (Inter SemiBold 600, 70 px, `#E6E9F0`, "really" in amber): `see who's really buying.`
- **Subtext as built** (JetBrains Mono 600, 19 px, `#8C94A3`): `every wallet tagged before you buy · self-custody`. Checked in the built file. It repeats the SC-19 overclaim, so the file doesn't go up until it's re-rendered (below)
- **Chip row** (JetBrains Mono 600, 15 px, uppercase, 6 px radius, tag colour on that colour at 12%). **Labels only, no numbers**: `SMART MONEY` `#4ADE80` · `KOL` `#C084FC` · `DEV` `#FB923C` · `SNIPER` `#F87171` · `INSIDER` `#F472B6` · `BUNDLER` `#FACC15` · `WHALE` `#38BDF8` · `FRESH` `#2DD4BF` · `BOT` `#94A3B8`. These are the product's tag names (`packages/shared/src/types.ts:45-58`, tooltips in `apps/web/src/components/common/WalletTags.tsx`) and colours (`apps/web/src/index.css`).
- **Layout:** type stacked centre-right inside the **centre 1100 × 360** safe zone (phones crop the top and bottom). Bottom-left 400 × 200 stays dark (the avatar overlaps it).

**Re-render before Day 1** (`profile.py`, no AI, no credits; owner decision §13 item 4):
1. **Subtext wording.** "every wallet tagged" overstates SC-19 (the same problem as the old PIN, §9.2). Replace it with `snipers, bundlers, insiders, the dev: tagged · self-custody` (59 characters, fits the column at 22 px). BRAND_GUIDE §14.4 uses the same line.
2. **Phone legibility.** On a phone the header renders ~390 px wide, so the 15 px pill and chips and the 19 px subtext shrink to about 4–5 px. Take the pill and chips to 20–22 px and the subtext to 22 px.
3. **Chain pill follows C-0, then C-1.** If a chain won't be in the launch build, re-render without it the same day the bio changes. A four-chain pill reads `SOL · BASE · BSC · ETH`.
4. **KOL chip follows F-2.** If the live build has no real KOL source, drop the chip (SC-19k).

### `header-main`: 1500 × 500 (optional upgrade, not built)

- **Spec, retouch and QA: BRAND_GUIDE §14.4** (the single spec: the glyph retouch at about x 1520–1610, y 370–385, the y 40–1096 crop, the type layer with the `AI-generated` corner label at 20 px, and the phone check). Art: `marketing/x/profile/art/header-art-candle-valley.jpg` (3168 × 1344, AI-generated, approved). No new Higgsfield generation is needed.
- **Status:** not built. The chain pill follows C-0, then C-1.
- **Don't use** `profile/art/header-art-trench-sniper.jpg`. It isn't on the approved list, and a hooded figure aiming a rifle conflicts with the brand guide's AI-art rules (no weapons).

**Swap plan:** `header-alt` today. Switch to `header-main` only if it's built and passes QA. Header swaps don't affect verification; avatar, display-name and handle changes do. The simulator-era K1 periscope header (with "larp the trenches." and the SIM subtext) is retired.

---

## 8. Settings, professional category and X's crypto rules

### 8.1 Settings reference

Paths are best-known, not checked live today, and X renames menus often. If a name differs, search for it in Settings.

| Area | Path (Settings and privacy → …) | Set to | Why |
|---|---|---|---|
| **Photo / media tagging** | Privacy and safety → Audience, media and tagging → Photo tagging | **Off** | Stops scammers tagging the brand in fake-airdrop images |
| Protect your posts | Privacy and safety → Audience, media and tagging | **Off** | The account has to be public to grow |
| Sensitive media | Privacy and safety → Your posts → Mark media you post as sensitive | **Off** | Sensitive-flagged media gets interstitials |
| Location in posts | Privacy and safety → Your posts → Add location information | **Off** | Not needed. Keeps location signals consistent |
| Discoverability | Privacy and safety → Discoverability and contacts → Let others find you by email / phone | **Both off** | Keeps the brand inbox and owner's phone private |
| **DM requests** | Privacy and safety → Direct messages → Allow message requests from | **Verified users** | Cuts most scam DMs. Our own rule is that we never DM first (CUSTODY), so this costs nothing. Revisit after launch only if real users can't reach support another way |
| DM filter | Privacy and safety → Direct messages → Filter low-quality messages | **On** | Spam control |
| DM read receipts | Privacy and safety → Direct messages → Show read receipts | **Off** | No pressure to reply instantly to strangers |
| Encrypted chat (if prompted) | Direct messages / Chat setup | Save the passcode in the password manager | Losing it can lock you out of message history |
| **Notifications: quality filter** | Notifications → Filters → Quality filter | **On** | Filters bot replies |
| **Notifications: muted** | Notifications → Filters → Muted notifications | Mute: **new accounts**, **default profile photo**, **unconfirmed email**, **unconfirmed phone**. Leave **"you don't follow"** and **"don't follow you"** unmuted | You need to see real strangers' replies within the first hour of each post |
| Push notifications (owner's phone) | Notifications → Preferences → Push | **On**: replies, mentions, quote posts, new followers. **Off**: likes, reposts, recommendations | Replies within the hour are what matter. Likes are noise |
| Email notifications | Notifications → Preferences → Email | **Off**, except security and account emails | Keeps the brand inbox clean so security mail stands out |
| Image description reminder | Accessibility, display and languages → Accessibility | **On** | Alt text can't be added after posting |
| **2FA** | Security and account access → Security → Two-factor authentication | **Authentication app** plus offline backup codes. A security key or passkey is a strong extra | Account takeover is the biggest real-world risk for a crypto brand. A hijacked self-custody brand posting a "migrate your wallet" link is the nightmare case |
| Password reset protect | Security and account access → Security | **On** | Resets need the email or phone |
| Connected apps | Security and account access → Apps and sessions → Connected apps | **Metricool only** | No follow/unfollow trackers, giveaway tools or "growth" apps |
| Sessions | Security and account access → Apps and sessions → Sessions | Only the owner's devices | Spot unknown logins early |
| Ads personalization / data sharing | Privacy and safety → Ads preferences, Data sharing, Grok | Owner's choice | No effect on reach |

**Reply moderation.** Under the pinned post and every product post, **hide** scam replies ("claim the airdrop", "connect wallet", "migrate your tokens", "DM support", fake giveaways), **report** them, and **block** impersonators. Never reply to them with a link. If a real user looks at risk, reply in fresh words and point them to the pinned safety reply. You may quote the CUSTODY line, but wrap it in new words each time: the same reply pasted twice gets clustered as `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4).

**Impersonation watch.** Self-custody brands get cloned within days. Each morning, search `trenchscope` and the handle's look-alikes (`trenchscope_`, `trenchscopes`, `trench_scope`, `trenchsc0pe`). Report impersonators through X's impersonation report flow (as the brand). Keep a short list with links to the reported accounts.

### 8.2 Professional account and category

- **Account type: Business. Category: the closest software or technology option** (X's list changes; something like a software or technology company). Trenchscope is software: a terminal people trade and track with. That's accurate, and it's what the account is.
- **Why not a finance category.** A trading terminal may be treated as a financial product, by regulators and by X's ad rules (§8.3). The category doesn't change that: picking "software" doesn't exempt our posts from financial-promotion rules, and the ledger's never-say list is written as if they apply. What a finance category ("financial service", "investing", "cryptocurrency exchange" or similar) would add is a public label that says we are a financial service. That's a legal statement, not a style choice. Pick one only if the owner's legal check (L-1) concludes it's accurate and wanted.
- **Display category on profile:** owner's choice. Off is fine.
- **Don't** use the professional tools to sell anything (Shops, Subscriptions, Tips). See Phase C.

### 8.3 X's rules for crypto and financial-services accounts, and ads

Sources: X's Help Center and Business Center pages (CT_PLAYBOOK §3.9 and its source list), plus today's search results. X's own pages couldn't be fetched from this environment today, so **re-read X's current "Financial products and services" ads policy and Paid Partnerships policy before any paid activity.**

| Activity | X's position (best available) | What we do |
|---|---|---|
| **Organic posting** (posts, replies, threads, video from our own account) | **Fine.** Crypto accounts post freely under the general X Rules. The rules that bite: financial scams (no "get rich quick", unrealistic results or cash-gift offers), platform manipulation and spam, synthetic and manipulated media (label AI), impersonation | **Organic only.** The ledger's never-say list (section 5) covers these. AI shots carry `AI-generated` plus X's "Made with AI" label |
| **Ads, Promote button, boosted posts** | Crypto ads are allowed only with **X's prior certification**, per product category and per targeted country. Some countries also need local authorisation. ICO/IEO-type token-sale ads are prohibited (reported by a secondary source). Regulators enforce this: Spain's securities regulator fined X about €5M over crypto ads from an unauthorised firm (reported Nov 2025) | **No paid promotion at all**, including the "Promote" button on a post, until X certification and the legal check (L-1) are both done. Then it's a separate owner decision |
| **Paid partnerships** (paying creators or KOLs to post) | Financial products have been ineligible. A Mar 2026 policy update was reported to reopen labelled crypto promotions outside the UK, EU and Australia; X's head of product then called part of the change an error. Reports conflict | **Not used.** No paid KOL posts (MNC-22, CT_PLAYBOOK §1.1). If ever considered: legal check first, and X's Paid Partnership label |
| **Giveaways, contests, referral rewards** | Allowed under X's contest rules, but they attract bot followers. Referral rebates or cashback can count as incentives under crypto-promotion law (the UK restricts them) | **None** in the warm-up or on launch day (MNC-02, MNC-22) |
| **Country law** | X allowing a post doesn't make it lawful everywhere. Some countries treat an organic post by a crypto firm as a financial promotion. The UK, for example, has a specific regime for crypto promotions (prescribed risk warnings, approval by an authorised firm) | **L-1** (ledger section 8): check before launch-day posts. Add geo-blocking on the product or the required warnings where needed. Launch-day trading posts carry RISK in the post itself |

Sources to re-read (search snippets today, not full pages; confidence medium): X Business "Financial products and services" ads policy (`business.x.com/en/help/ads-policies/ads-content-policies/financial-services`); X Paid Partnerships policy (`help.x.com/en/rules-and-policies/paid-partnerships-policy`); X Financial scam policy (`help.x.com/en/rules-and-policies/financial-scam`); Cointelegraph, "X lifts crypto promo ban for paid partnerships" (`cointelegraph.com/news/x-lifts-crypto-promo-ban-for-paid-partnerships`); Free Malaysia Today, "X fined €5mil in Spain over cryptocurrency ads" (`freemalaysiatoday.com/category/business/2025/11/13/x-fined-e5mil-in-spain-over-cryptocurrency-ads`).

---

## 9. Pinned post plan and the Day-1 pinned post

### 9.1 Pin schedule

| From → to | Pinned | Notes |
|---|---|---|
| **Day 1 → Launch day** (until the launch post goes up) | **PIN-v2** with PIN-r1 and FAQ-2 as self-replies | Link-free, text only. **Never** add a link to it, including by editing it |
| **Launch day → about L+14** | **The launch post** (the trailer), once the launch gate passes (§6.2) | Per `LAUNCH_DAY.md`. The pinned post stays link-free: `[LINK]` goes in its self-reply thread, never in the caption. The caption carries the AI label and X's "Made with AI" label; trading posts in the thread carry RISK; one thread post carries CUSTODY. Add a fresh safety reply to that thread (SAFE-L1), worded differently from PIN-r1 |
| **If the gate isn't passed on launch day** | Keep the Day-1 pin | Nothing on the profile changes. Launch-day posts wait |
| After about L+14 | Re-evaluate | Keep the launch post, or re-pin the best evergreen explainer from analytics |

Optional (Premium): add the pin and the best warm-up posts to the profile **Highlights** tab.

### 9.2 The pinned post

**PIN (originally approved in TODAY.md; retired)**. **268 / 280**. Kept here for reference only.

```text
trenchscope: see who's really buying, before you do.

one memecoin terminal for solana, base, bsc, ethereum and robinhood chain. every wallet gets a tag (sniper, bundler, insider, dev, kol, smart money), every token an audit, risky buys ask first.

you keep your keys.
```

**Why PIN is retired** (`CLAIMS_LEDGER.md`): two of its statements are false against the code today, in the post that stays up all week.
- "every wallet gets a tag" overstates SC-19. Most wallets match no rule.
- "risky buys ask first" is SC-08c (OWNER). The risk prompt fires only on trade-panel buys (Market or Auto tab). One-click quick buy on board cards skips it: `riskReasons` gates `useTradeExecutor` (`apps/web/src/components/token/model.ts:119-129`, `apps/web/src/components/token/trade/useTradeExecutor.tsx:55`), while `QuickBuyButton.tsx` calls `swap` directly. The line becomes true when the live build routes quick buy through the prompt (F-3).
- "kol" depends on F-2. The code has no rule that finds KOL wallets; it's a simulator-supplied label (SC-19k).

**PIN-v2 (the Day-1 pin, as in TODAY.md)**. **276 / 280**, text only. Same structure and voice, with the three flags fixed.

```text
trenchscope: see who's really buying, before you do.

one memecoin terminal for solana, base, bsc, ethereum and robinhood chain. snipers, bundlers, insiders, the dev, smart money: tagged. every token gets an audit. risky buys on the trade panel ask first.

you keep your keys.
```

- **Claims check:** tagline (POSITIONING "Lines"); chains (SC-43, SC-45: OWNER, C-0 before Day 1); sniper, bundler, insider, dev, smart money tags (SC-21, SC-21d, SC-20: GREEN, `apps/server/src/analytics/tokens/track.ts`, `apps/server/src/analytics/wallets/index.ts:62-107`); audit (SC-09: GREEN, `apps/server/src/analytics/tokens/security.ts:470-597`, `apps/web/src/components/token/SecurityPanel.tsx`); risk prompt on the trade panel (SC-08: GREEN); "you keep your keys" (SC-46: OWNER, C-0 before Day 1). No "live", no link, no date, no cashtag, no token.
- **If PIN is already up:** replace it. Edit it to PIN-v2 inside X's edit window if Premium is active; otherwise post PIN-v2 in the next posting window, pin it, and delete PIN. Leaving PIN up keeps two false statements pinned all week. Don't keep both pinned-style posts up.

**Four-chain versions** (if Robinhood Chain won't be ready; re-measure for any other chain):
- PIN-v2, four chains, **259 / 280**: replace the chain line with `one memecoin terminal for solana, base, bsc and ethereum.`

**Alt text:** none needed (text only).

### 9.3 Retired

PIN-A ("we built a fake memecoin market…"), PIN-B ("paper trading is just larping with extra steps…") and their image `screen-trenches.png` (SIM stamp) are retired. So are the old FAQ-1 ("there is no trenchscope token") and FAQ-2 ("fictional sim entities"): no token talk at all (MNC-02), and DEMO now goes on images, not in a pinned reply.

### 9.4 FAQ self-replies (post right after the pin, as a thread)

**PIN-r1 · safety (CUSTODY), the default.** Reply to the pin, posted right after it, because impersonators reply fast. Text in `TODAY.md` (118): `we will never DM you first, ask for your seed phrase, or ask you to send funds anywhere. if someone does, it isn't us.`

**FAQ-1 · safety, optional alternative to PIN-r1 (owner must approve).** **258 / 280**. It adds the "support DMs are scams" line and "there isn't one yet" about links.

```text
the trenches have enough predators, so:

we will never DM you first, ask for your seed phrase, or ask you to send funds. if someone does, it isn't us.

"support" sliding into your DMs is a scammer. real links only come from this profile. there isn't one yet.
```

- Carries **CUSTODY** verbatim (79). "real links only come from this profile" covers both launch-day link spots (the bio and this account's own self-reply), so a link anywhere else reads as a scam.
- **Never post both** PIN-r1 and FAQ-1: the same CUSTODY line twice in one thread reads as a template. With the default, FAQ-2 goes up as a reply to PIN-r1.

**FAQ-2 · what it is.** Reply to PIN-r1 (or to FAQ-1 if the owner chose it). **243 / 280**

```text
what is this:

a memecoin trading terminal for solana, base, bnb chain (bsc), ethereum and robinhood chain. self-custody: you keep your keys.

on every coin it tags the snipers, bundlers, insiders and the dev, by rule. the dev hates that part.
```

- **Claims check:** chains, with BNB Chain named in full once (SC-43, SC-45: OWNER, C-0); self-custody (SC-46: OWNER, C-0); per-coin sniper, bundler, insider and dev tags, by rule (SC-21, SC-21d: GREEN, `apps/server/src/analytics/tokens/track.ts`). The earlier "hover a tag for what it means" is gone: the in-app tooltips don't carry the rules and the insider one is wrong (`apps/web/src/components/common/WalletTags.tsx:16-28`, ledger SC-19t). No "live", no link, no token.
- **Four chains, 226 / 280:** `a memecoin trading terminal for solana, base, bnb chain (bsc) and ethereum.`

**Answering questions later.** Point people to the pinned thread and **write each reply fresh**. Pasting the same reply twice gets clustered as `COPYPASTA_SPAM` (CT_PLAYBOOK §3.4).
- **"where's the link" / "is it live":** not yet; links only ever come from this profile. Fresh words each time, no date, no "soon".
- **"wen token" / "airdrop?":** **don't answer** until the owner decides what we say (§13, item 8). POSITIONING says we don't mention a token at all, so the old "there is no token" reply is retired. Don't hide these replies either: they aren't scams.
- **"is this [other terminal]?" / "better than X?":** no competitor names in our replies (MNC-10). Talk about what the scope does.

---

## 10. The first 50 follows, by category

**Goal:** 50 hand-picked follows over Days 1–3 that (a) teach X's recommender that this is a crypto, memes and trading-tools account, (b) fill the home feed with posts worth replying to, and (c) start real two-way relationships. In X's open-source ranker a reply between mutuals is weighted 20 instead of 5 (a +15 boost, CT_PLAYBOOK §3.2), so real mutuals matter. Stay under about 200 following by launch.

### 10.1 The mix

The product is multi-chain, so the follow list is too: across categories 1, 2 and 4, aim for people active on each of Solana, Base, BSC and Ethereum, not only one chain.

| # | Category | Count | What they look like | Audience it reaches | Find them with (X search) |
|---|---|---|---|---|---|
| 1 | **On-chain analysts and wallet sleuths** | 8 | Post "dev funded 14 wallets" threads, holder-map screenshots, cluster breakdowns. Explain *how* they know | A3 thread sleuths, A2 wallet watchers | `"funded by" wallets min_faves:50 -filter:replies lang:en` · `bundled min_replies:15 filter:media` |
| 2 | **Mid-size trench traders who post process** | 8 | 5k–200k followers. Share entries, exits, mistakes and losses, not just green PnL. Reply to their followers. Spread across chains | A1 trench rats | `"bonding curve" min_faves:25 lang:en` · `"got rugged" min_faves:100` · `base memecoin min_faves:50` · `bsc memecoin min_faves:50` |
| 3 | **Memecoin meme and culture accounts** | 8 | Original trench humour: POV memes, "trenches be like", loss porn. Mostly original, not reposts | A7 spectators, A1 | `trenches pov min_faves:200 filter:media` · `"exit liquidity" min_faves:150` |
| 4 | **Launchpad and new-pair watchers** | 6 | People (not platforms) who track launch stats, graduation rates and migration flows, often with dashboards, on any of the chains | A3, A1. Also future sources for hedged stats (ledger section 4) | `graduation rate memecoin min_faves:20` · `"migrated" launchpad stats filter:media` |
| 5 | **Security and scam-awareness researchers** | 6 | Drainer and phishing alerts, wallet-security advice, rug post-mortems | A5 tourists, A3. Also anti-phishing allies, which a self-custody brand needs | `drainer phishing crypto min_faves:50` · `"seed phrase" scam min_faves:50` · `"rug pull" thread min_replies:10` |
| 6 | **Trading-tool builders and build-in-public devs** | 6 | Indie devs shipping crypto tools, data APIs or bots who post changelogs and screenshots. People, not brand accounts | A6 builders | `shipped memecoin min_faves:20` · `"building in public" crypto trading` |
| 7 | **Newcomer-friendly crypto educators** | 5 | Plain-language explainers (curves, slippage, MEV, self-custody basics), patient with beginners | A5 trench tourists | `"bonding curve" explained` · `"what is slippage" crypto` · `self-custody explained` |
| 8 | **MEV and market-structure researchers** | 3 | Sandwich bots, priority fees, private routing, execution quality, with data | A3, A1 (context for anti-MEV posts, which must never promise "no sandwiches", MNC-17) | `sandwich bot MEV min_faves:30` |
| | **Total** | **50** | | | Add `since:` with the date 7 days ago to any query to keep results to recently active accounts |

**Category, not celebrity.** The first 50 are **people**, not institutions. Leave out official chain, launchpad, exchange and competitor brand accounts, including Robinhood's, Base's, BNB Chain's and Ethereum's official accounts. Following them builds no relationship and can look like affiliation-seeking (MNC-14). Watch them through a **private list** instead (§10.4).

### 10.2 Vet every account in about 60 seconds

Follow only if **all** of these hold:

- [ ] **Posted in the last 7 days**, and mostly original posts (not just reposts or "ca:" drops).
- [ ] **Real conversations in their replies**: they answer people, and the replies aren't bot walls.
- [ ] **You'd actually read them daily.** The test is "would I bookmark this", not "will they follow back".
- [ ] **About this account looks normal**: no long trail of username changes, no country or VPN mismatch with what they claim.
- [ ] **No red flags**: presale or airdrop shilling, "send X get 2X", constant paid promos ("DM for promo"), signal groups that charge, follow-for-follow or giveaway bios, hateful content, impersonation of other people, or anything using our name.

### 10.3 Pace

| Day | Follows | How | Lean toward |
|---|---|---|---|
| **Day 1** | about 20 | 3 sessions of 6–7, at least 1 h apart | Categories 1, 5, 7 first. They anchor the account as crypto and educational |
| Day 2 | about 20 | 3 sessions | Categories 2, 3, 4 |
| Day 3 | about 10 | 2 sessions | Categories 6, 8, plus gaps (check the chain spread) |
| Days 4–7 | 20–30/day, at most 20 on weekend days | Same rules | Accounts you met in replies. Real mutuals beat cold follows |

### 10.4 Rules that keep the account clean

- **Private lists to monitor more without following:** create private lists such as "reply targets", "data and stats" and "watch only" (competitors, chains, launchpads and other official accounts). Members aren't notified, and it keeps the following count low.
- **Follow back** only people who pass §10.2. Never auto-follow-back.
- **Never unfollow in bulk.** If you must prune, at most 5 a day, and not before week 2. Follow churn is a spam signal.
- **Don't reply-spam people right after following them.** Reply only when you have a fact, a mechanism, a product clip labelled `UI shown with demo data`, or a real joke.
- **Never tag** KOLs, projects or chains to get noticed. Never paste the same reply twice.
- **If reach drops:** check Under the Hood, pause follows for 48 hours and keep posting good originals. Don't create a new account.

---

## 11. Connect the account to Metricool (scheduling)

**Status (re-checked today via the Metricool connector):** the Metricool brand (blogId `7078702`) has **no social network connected**.

### 11.1 Connect

1. Log in to the X brand account in the same browser first, so X's authorization page shows the right account.
2. Open Metricool's connections page for the brand: `https://app.metricool.com/brands/connections?blogId=7078702` (or Metricool → brand settings → Connections).
3. Choose **X / Twitter → Connect**. On X's authorization screen, check the account name shown, then **Authorize app**.
4. If Metricool asks for a plan upgrade to connect X, that's a billing decision for the owner.
5. In Metricool's brand settings, set the **timezone to `America/New_York`** so the ET posting windows map directly. EU clocks go back on the Sunday of warm-up week (Day 6) and US clocks the Sunday after launch, so in launch week London is 4 h and Berlin 5 h ahead of ET.
6. Back on X, open Settings → Security and account access → Apps and sessions → **Connected apps** and confirm Metricool is the **only** third-party app.
7. Tell Claude once it's connected. Posts can then be drafted into Metricool **for review**, so the owner approves each one before it's scheduled.

### 11.2 What to schedule (and what not to)

| Use Metricool for | Don't use Metricool for |
|---|---|
| **Original posts** (text, images, short clips), one per window (A 8:30–11:00 a.m., B 12:00–3:00 p.m., C 8:00–10:30 p.m. ET), **at least 2–3 h apart** | **Replies of any kind.** Replies are hand-written, live and never templated |
| Queuing the week's warm-up originals for owner review | **Launch-day posts.** They're gated on real trading working, so a person posts them natively in X's composer, at the moment the gate passes, with native upload quality, X's "Made with AI" label and full control of the self-reply thread |
| Analytics after week 1 (best times from your own data) | **Any evergreen-recycling, auto-list or RSS auto-posting feature.** Repeated text gets flagged as a duplicate |
| | **Any auto-reply, auto-DM, auto-like or auto-follow feature** (banned by X's automation rules) |
| | **Anything with a link** before the launch gate passes (§6.2) |

- **Only schedule into windows when the operator will be online.** The first 60 minutes of replies decide the cold-start audition. Scheduling is for timing, not for being away.
- **Alt text and the AI label:** if Metricool's X composer has no alt-text field for an image post, or no way to set X's "Made with AI" label on an AI still or clip, post that one natively. Neither can be added after posting.
- **Spot-the-rug reveals** (the self-reply 2–4 h later) are easiest posted by hand from the thread.
- **Pre-launch queue check:** before approving a queued post, search it for "live", "now", "trade now", a URL and any date. A scheduled post can't know whether the gate has passed.

---

## 12. Daily routine during warm-up (Day 1 to Day 7)

1. **Morning:** check Under the Hood and yesterday's analytics. Hide or report scam replies under the pinned post. Run the impersonation search (§8.1).
2. **Each window:** one original (scheduled or manual). Stay 60 minutes to answer replies.
3. **Between windows:** hand-written value replies under 5k–200k-follower CT posts within 30–60 minutes of their posting. 10–15 on Day 1, rising to 25–40 by Day 7.
4. **Follows:** per §10.3, in small sessions.
5. **Never:** links, hashtags, the same text twice, three originals inside an hour, deleting and reposting a flop (re-cut the idea 48 h or more later instead), "live" or a date in any post.

---

## 13. Open items for the owner

1. **Confirm the handle** (Phase A). Every other doc uses the `@trenchscope` placeholder until then.
2. **Tick the §0 owner checks before the profile goes up:** self-custody (K-1, plus K-2 for automated orders: the custody line must describe how limit orders, auto exits, copy trades and sniper tasks sign), each named chain (C-1), and tags plus audit on real data (F-1). If any chain won't be ready, use the four-chain bio, pin, FAQ and header.
3. **Pick the pin:** PIN (approved) or PIN-v2 (fixes three ledger flags: "every wallet gets a tag", "risky buys ask first", "kol"). Or, to keep PIN as is, route quick buy through the risk prompt in the live build (F-3) and confirm a real KOL source (F-2).
4. **Header fixes** at the next `profile.py` re-render: the subtext "every wallet tagged" (§7), the phone-size type, and the chain pill and KOL chip if C-1 or F-2 change anything. Decide whether to build the optional candle-valley `header-main` (no AI credits needed).
5. **BIO-2:** if it's ever used, use BIO-2b ("every wallet tagged" fix).
6. **In-app strings** before launch-day footage and before the live build ships (also CLAIMS_LEDGER section 7): the "Live" badges in the status bar, board and activity tab (crop them out of pre-launch footage); the "Safe" and "Safe contract" filter presets; the anti-MEV tooltip's "no sandwich attacks"; the remaining sim strings that `marketing/tools/capture-mode.js` misses (guest sign-in modal, the phone-menu sim notice, "Paper account", "paper balance", the copy-trade, sniper and Rewards footers, the "Faucet failed" toast).
7. **Approve Premium** on Day 1. Decide on a Verified Organization (optional; it helps against impersonators).
8. **"Wen token" replies:** decide what we say, if anything (T-1). Until then the account doesn't answer token questions (§9.4).
9. **Paid promotion:** none is planned. Any ad, "Promote" button or paid creator post needs X certification and the legal check (L-1) first (§8.3).
10. **Legal check (L-1)** for the markets you're promoting to, before launch-day posts.
11. **Connect X in Metricool** (§11.1). Decide whether a Metricool plan upgrade is needed.
12. **Confirm who operates the account daily** from Day 1 through launch day. Replies must be written by a human.
13. **Pick the domain** for `[LINK]` so the bio link and handle match, and have the landing page ready with RISK and CHAINS (§6.2).
