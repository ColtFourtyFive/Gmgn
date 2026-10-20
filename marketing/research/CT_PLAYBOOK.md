# Trenchscope: Crypto-Twitter Growth Playbook

Research date: Tue 2026-10-20. Scope: a brand-new X account (placeholder handle @trenchscope, to be confirmed by the owner) that warms up organically Oct 20–26 and drops a cinematic AI "larp" trailer and launch thread on Tue Oct 27, 2026.

**Confidence legend** used throughout:
- **[H] High.** Primary source: X Help Center text, or the open-sourced ranking code (`xai-org/x-algorithm`, snapshot commit `862a123`, 2026-10-17).
- **[M] Medium.** Credible secondary reporting (TechCrunch, Social Media Today, Decrypt, The Block, Buffer data), or repository defaults that may differ from production.
- **[L] Low.** Vendor blogs, single-source claims, practitioner folklore.

All times are **ET** unless marked otherwise. US clocks stay on EDT (UTC−4) until Sun Nov 1, 2026. **EU clocks fall back on Sun Oct 25, 2026**, so for launch week the US–EU gap is one hour shorter than usual (see §5).

---

## 0. TL;DR: the 12 rules

1. **Every original post gets a ~2-hour, ~200-view audition.** The ranking code gives a cold-start lift to fresh original posts from small accounts. Its rule is: original post (not a reply or repost), author has ≤50k followers, post is ≤2h old, fewer than 200 home views. A Thompson-sampling bandit picks the winners by early **like-per-view rate** [H code / M prod]. So post when the audience is awake, make the first line a hook, and stay in the replies for the first hour.
2. **The model rewards replies, quotes, DM shares and copy-link shares. It barely rewards likes.** Repo weights: reply 5, quote 5, share-via-DM 5, copy-link 20, follow-author 4, repost 1, like ~0.5–0.66 [H code]. Write posts people argue with, quote, and send to the friend who just got rugged.
3. **Negative feedback is the biggest lever, and it pushes down.** Mute −58.8, not-interested ~−50, block −31.2, report −234 [H code]. A single annoying behaviour costs more than ten good posts earn.
4. **Bursts cannibalise each other.** The author-diversity multiplier is 1.0 for the first post, 0.625× for the second, 0.44× for the third and a 0.25× floor after that, applied within one viewer's feed [H code]. Space original posts **≥2–3h apart**.
5. **For You ignores posts older than 48h** (`AgeFilter`) [H code]. Evergreen ideas get re-cut with a fresh angle, never reposted verbatim. Duplicate text gets labelled spam.
6. **Your replies are read by an LLM.** Replies to other people's posts go through Grok/Gemma spam classifiers. In threads whose author has >250k followers, an LLM also scores **reply quality** for ranking. Only high-credibility accounts (cred ≥66) are exempt from the spam label [H code]. A brand-new account is not exempt. Be specific or be silent.
7. **Duplicate replies get labelled `COPYPASTA_SPAM`** [H code]. Never paste the same reply twice.
8. **Week 1 has no links**, and the pinned post never carries a link while you are following people. A link to a low-reputation URL in a pinned post, combined with follow events, earns a 1-week `SPAM_HIGH_RECALL` user label and restricted notifications [H code]. New domains have unknown reputation.
9. **Buy Premium on day 0.** Credibility (user-cred-v2) is PageRank over the follow and engagement graph, **seeded by Premium/verified accounts** [H code]. Buffer's 18.8M-post study found median reach of ~600 for Premium vs <100 for free accounts (correlational) [M]. Unverified accounts also face lower posting caps.
10. **Organic only, manual only.** No follow-for-follow, follow churn, pods, bought engagement, keyword auto-replies, auto-likes, mass mentions or multiple accounts [H policy]. X purged 1.7M reply bots in Oct 2025, about 208 per minute in Apr 2026, and 42k chatbot-reply accounts in Jul 2026 [M].
11. **Never "post-to-earn."** X banned InfoFi apps that reward users for posting (Jan 15, 2026) [M]. No points-for-posts, raffles for retweets, or "engage to qualify." It is also off-brand: Trenchscope points are in-app only, with no token.
12. **Use the larp honestly.** Paper trading *is* larping. Every PnL visual says SIMULATED, every claim is checkable, and the trailer is obviously dramatized fiction. On CT the self-aware joke is the moat.

---

## 1. How trading terminals and bots grew on X (2024–2026)

These are generic patterns, described without copying any competitor's branding. Most evidence here is practitioner observation, affiliate reviews and vendor marketing [L–M]. No source publishes cohort data on what actually drove adoption.

### 1.1 The growth loops that mattered

| Loop | How it worked | Evidence | Trenchscope version |
|---|---|---|---|
| **Referral codes plus fee discounts** | Every user is a distributor. Codes go in bios, replies and PnL cards. Referrers earn a share of fees (reported ~10–30% for some bots). Referees get a discount (~10% reported for one terminal). | [M] reviews and docs; figures are self-reported | v1 has no real fees. Referral is about **access**, not money: "bring a friend into the sim." Do not promise fee rebates on a product that is not live. |
| **PnL / share cards ("flex culture")** | A big green ROI%, an entry→exit market-cap screenshot, and the brand mark on every card. Users post wins, and losers post "this is fine." Each share is a free ad. | [M] PnL cards are a standard terminal feature; bot ads show "before/after PnL" creatives | The PRD §6.21 card ships with an **unremovable SIMULATED watermark** and a verify URL. Lean into **loss porn and rug autopsies** as much as wins. "my paper bag got bundled" is funnier and honest. |
| **Invite codes / waitlists / private beta** | Scarcity plus status. "Who has a code?" replies flood launch posts. Several 2025–26 memecoin terminals ran batch-invite betas, some explicitly on simulated money. | [L–M] waitlist pages, affiliate code sites | Optional. If used, codes must give real access, never be sold, and never be tied to engagement (see InfoFi ban, §3.9). |
| **Speed / UI demos** | Short screen recordings: paste a contract address, buy in one click, a migration snipe, the keyboard flow. Traders buy tools they can *see* are fast. | [M] bot ad creatives are dominated by UI walkthroughs | 12–30s clips of Trenches columns moving, risk chips lighting up, a one-key exit. Clips run >10s so they count as video quality views (§3.6). |
| **"Alpha utility" posts** | Data posts that make the account worth following without the product: labelled-wallet behaviour, launchpad stats, "how to spot a bundle." | [L] practitioner playbooks | Teach the mechanics, using sourced real-world stats with hedges plus sim replays. "3 tells a launch is bundled" thread. |
| **KOL deals / paid shills** | Common, but expensive, opaque and trust-eroding. | [M] | **Not used.** X's Paid Partnerships policy lists crypto and financial products as **ineligible** for paid-partnership promotion [H policy]. That is a second reason to stay KOL-free. |
| **Points programs / airdrop farming** | Points-for-volume led to "wen token" engagement. | [M] | **Forbidden by the PRD.** Never imply a token, airdrop or presale. In-app points are cosmetic and in-app only, and must never be marketed as convertible. |

### 1.2 What changed in 2025–2026 (and why the old playbook is riskier now)

- **InfoFi ban (Jan 15, 2026).** X revoked API access for apps that pay or reward users for posting, citing "AI slop and reply spam." Kaito shut its Yaps leaderboards, and Cookie DAO and others sunset similar products [M: Decrypt, The Block, Unchained]. Incentivised-posting campaigns are out.
- **Bot purges.** About 1.7M reply-spam bots removed (Oct 2025). About 208 bots per minute suspended in an Apr 2026 crypto-spam push. 42k chatbot-reply accounts removed (Jul 2026) [M]. Enforcement runs in automated waves and can catch legitimate new accounts that *look* automated.
- **"CT is killing its own reach."** In Jan 2026, X's then-head of product argued that falling crypto reach came from repetitive low-effort replies (e.g. "gm" spam), not the algorithm. The backlash led Musk to promise open-sourcing the algorithm [M]. He later stepped back to an advisory role (Aug 2026) [M].
- **Transparency.** "About this account" (Nov 21, 2025) shows a profile's country or region, join date, **username-change count** and how the app was installed. It warns when a VPN is detected [M: TechCrunch]. A new brand account should pick its handle once and post from a consistent location.
- **Mutuals boost (Jul 13, 2026).** Ranking surfaces more posts and replies from mutual follows [M]. The code shows a `bidirectional_follow_reply_weight_boost = 15` [H code]. Real two-way relationships with peers now pay off measurably.

### 1.3 Formats that work on CT, mapped to the algorithm

"Algo hook" names the signal the format tends to trigger (§3.2). Fit is for Trenchscope specifically.

| # | Format | Pattern | Algo hook | Fit |
|---|---|---|---|---|
| 1 | **POV / "the trenches be like"** | `pov: you aped the dev's 3rd wallet` plus a UI screenshot or meme image | replies ("me fr"), quotes, DM shares | High |
| 2 | **Spot-the-rug screenshot puzzle** | A sim token page with risk chips cropped out: "one of these is bundled. which?" Answer in a reply 2–4h later. | replies (predictions), dwell, a second post later | High |
| 3 | **Self-deprecating larp confession** | `paper trading is just larping with extra steps. we built the extra steps.` | quotes, follows | High (brand voice) |
| 4 | **Rug autopsy (sim replay)** | A 15–25s clip of a sim launch dying: snipers in block 0, dev sells, chart nukes. Caption: "watch the bundlers leave before you do." | video dwell, DM / copy-link shares | High |
| 5 | **Glossary / explainer micro-thread** | "bundler, sniper, insider, fresh wallet: what they actually mean (and how we label them)." 4–6 posts, standalone first post. | dwell, follows, bookmarks | High |
| 6 | **Polls** | `what kills you more: snipers / bundlers / your own fomo / slippage` | cheap replies; the poll is a low-friction entry for new followers | Medium: max one every 2–3 days |
| 7 | **Build-in-public changelog** | A screenshot of a new chip or shortcut: "shipped: unknown now shows `—` instead of `0%`. your old terminal lied to you." | follows, quotes | High. Avoid naming competitors. |
| 8 | **Keyboard flex clip** | 10–15s, no mouse: search → buy → set TP/SL → exit | video quality view, copy-link | High (differentiator) |
| 9 | **Value reply (reply-guy)** | Specific, additive replies under relevant mid-size CT posts. A one-line insight or a sim-replay GIF that answers the thread. | profile visits, follows. LLM-screened (§3.4). | High if done well; dangerous if lazy |
| 10 | **Quote-tweet with a take** | Quote a market moment ("another 0→rug in 9 minutes") and add a mechanism explanation, never a dunk on a person | quote weight 5, OON reach | Medium–High |
| 11 | **Sim PnL card** | A share card with a visible **SIMULATED** watermark, often a funny loss | DM shares, replies | Medium: always watermarked, never "look how much you can make" |
| 12 | **"Guess the fate" challenge** | "this sim launch: graduates or rugs in 1h? reply your call." Reveal later with a replay. Uses the simulator's hidden truth honestly. | replies plus a follow-up post | High (unique to a sim) |
| 13 | **Cinematic trailer (launch only)** | Over-the-top movie-trailer parody for a trading terminal: "in a world where 97% of launches never graduate…" | video watch time, quotes ("this is unhinged"), follows | High on launch day |

**Real-world stats you may cite (hedged, sourced in the repo's research doc §13.4):** on major launchpads only ~1–3% of launches graduate in most 2025–26 samples. After graduation, ~73% fall below 40% of migration price within 20 minutes in one sample. Always write "~" and "on major launchpads." Never present sim numbers as real-market data.

---

## 2. Positioning notes for the account

- **Voice:** a sharp trader with jokes. Lowercase, short, specific, self-deprecating. Almost never hashtags (Musk: "the system doesn't need them anymore and they look ugly" [M]). Emojis rare.
- **Honest edge:** "the only place where getting rugged is free." Every simulated surface says SIM. No volumes, users or PnL claims until they are real and measured.
- **Never:** competitor names, logos, colours or labels. Real KOLs, faces or brands in visuals. "100x," "guaranteed," "free money," "alpha that prints." Token, airdrop, presale or "wen" bait.
- **Placeholders:** `@trenchscope` (unconfirmed) and `[LINK]` (no live URL yet).

---

## 3. X ranking in 2025–2026: what is publicly known

### 3.1 Architecture [H]

X open-sourced its For You stack as `xai-org/x-algorithm`. It was first published Jan 20, 2026, with major updates May 15 and Aug 13–14, 2026, plus a Sep 18 transparency update [H repo README; M dates from coverage].
- **Candidate sources:** *Thunder* holds recent in-network posts from accounts you follow. *Phoenix retrieval* is a two-tower embedding model. *SimClusters* supplies out-of-network candidates from engagement communities. A popular-posts source adds the rest.
- **Ranking:** *Phoenix* is a transformer derived from Grok-1. It predicts the probability of ~20 actions per post for a given viewer. The README says hand-engineered features and most heuristics were removed.
- **Score:** `Final = Σ weight_i × P(action_i)`, then post-fusion multipliers (author diversity, out-of-network discount, cold-start lift), then a diversity re-ranker (DPP over embeddings).
- **Filters:** duplicates, posts **older than 48h** (`AgeFilter`), already-seen posts, muted keywords and authors, and visibility-filtering labels (ALLOW / NOTICE / INTERSTITIAL / DROP).
- **Topic routing:** Grok classifies posts into topics, and the code has explicit `Cryptocurrency` and `Memes` topic IDs and a popular-by-topic source [H code, M on how heavily it is used]. Being unambiguously "crypto + memes" helps routing.
- **Following tab:** ranked by Grok since ~Nov 27, 2025, with chronological still available [M].
- **Grok "reads every post and watches every video":** a stated aim (Musk, Oct 2025) [M]. Claims that Grok down-ranks "negative tone" are unverified [L].

### 3.2 Action weights (repo defaults, commit `862a123`)

These are `home-mixer/params/param.rs`, with `vm-ranker/params.rs` where it differs [H code]. The README warns the weights multiply *predicted probabilities*, not raw counts. Rare actions get bigger weights partly because they are rare. "1 report ≠ 468 likes" is X's own example of the misreading.

| Action | Weight | Notes |
|---|---|---|
| Share via copy link | **20.0** | Strongest positive. "Send this to your friend who…" content |
| Reply | **5.0** | **20.0 (5 + 15 additive boost)** when author and viewer follow each other (`reply_weight_for`) |
| Quote | **5.0** | |
| Share via DM | **5.0** | |
| Follow author | **4.0** | Posts that convert to follows are prized |
| Share (generic) | 2.0 | |
| Repost | 1.0 | |
| Favorite (like) | 0.66 (0.5 in vm-ranker) | Likes matter mostly through the cold-start bandit (§3.3) |
| Click (post) | 0.3 | |
| Open link | 0.2 | Positive, not a penalty in the ranker |
| Dwell (binary) / continuous dwell | 0.05 / ~0.004–0.006 per unit | Click-dwell 0.4 |
| Photo expand | 0.05 | |
| Video open | 0.02 | Video-quality-view weight 0.0 at default; VQV only eligible for videos **>10s** |
| Profile click | 0.0 | |
| Not dwelled | −0.02 | Scroll-past |
| Block author | **−31.2** | |
| Not interested | **−47.5 to −52.3** | |
| Mute author | **−58.8** | |
| Report | **−234.0** | |

**For comparison, the 2023 open-source table** [M] had like 0.5, reply 13.5, "reply engaged by author" 75, and report −369. It is often quoted in 2025–26 blogs as if it were current, but it is **superseded**. The 2026 code has no "author replies back = 75×" weight. Replying to your repliers still helps, because it produces more replies and mutual relationships.

### 3.3 Post-scoring adjustments that shape strategy [H code; M on production values]

- **Author diversity:** `(1 − 0.25) × 0.5^k + 0.25`, where k is the number of higher-ranked posts from the same author in the same feed request. That gives 1.0 → 0.625 → 0.44 → 0.34 → floor 0.25. **Implication:** three posts in one hour compete for the same viewers. Space them out.
- **Out-of-network discount:** 0.75× for posts from accounts the viewer doesn't follow (0.5× topic variant). For brand-new *viewers* it is effectively 0, so new users mostly see who they follow. Followers matter, and early quality followers matter most.
- **Cold-start lift ("new-author boost")**, in `home-mixer/scorers/author_cold_start.rs`. Eligibility: an **original post** (not a reply or repost), from an author with **≤50,000 followers**, **≤7,200s (2h) old**, with **<200 home views**, already within the top 97% of scored candidates. In each feed request, one such post is chosen by **Thompson sampling** on likes/views. The prior is Beta(0.75, 49.25), about a 1.5% like rate. The top 2 sampled posts are tie-broken by model score, and the winner is lifted to a random rank **15–16**. It is experiment-arm gated, so not every viewer gets it. **Implication:** a new account's originals get an exploration audition, and the **early like-per-view rate** decides whether the audition keeps going. The first ~200 views are the whole game for a 0-follower account.
- **48h cutoff:** For You will not serve your post after 48h. Re-cut, don't repost.

### 3.4 Spam and visibility systems in the repo (new in the Aug 13, 2026 release) [H code; M production]

| System | What it does | Implication |
|---|---|---|
| `BBQDuplicateTextReplies` (botmaker rule) | Clusters replies with duplicate text (unigram or character level) and labels them `COPYPASTA_SPAM` (downranked). Exempts high-PageRank and government accounts. | Never reuse a reply, template or emoji string. |
| LQ-URL rules | Posts whose URL redirect chain hits a `LOW_QUALITY` verdict (and doesn't end GOOD/WHITELIST) get `SPAM_HIGH_RECALL`. A variant targets LQ URLs **@-mentioning non-followers**. | No shorteners or redirect chains. Never @-mention strangers with links. |
| `FollowFromActorWithPinnedLowQualityOrBadUrl` | If you follow people while your **pinned post has a BAD/LOW_QUALITY URL**, your account gets `SPAM_HIGH_RECALL` for **one week** and notifications are restricted. | Pin a link-free post during warm-up. |
| Grok/Gemma reply-spam flows (`grox/flows/reply_spam`) | LLM classifiers for reply spam, multi-step reply spam and **coordinated spam**. For threads whose replied-to or root author has **>250k followers**, an LLM scores reply quality for **reply ranking**. Repliers with user-cred **≥66** are exempt from the spam label. | Big-account threads are where low-effort replies get judged hardest. A new account has zero exemption. |
| `user-cred-v2` | PageRank-style credibility over the follow and engagement graphs. The teleport (seed) mass comes from **Premium/verified, non-dormant accounts**. Score = clamp(165.2 + 7.07·ln(mass), 0, 100). Phoenix also receives a `user_credibility` feature. | Premium seeds you. Follows and engagement from credible accounts raise you. Bot followers add ~nothing. |
| `abuse-enforcement-service` | Some automated enforcement is **skipped for high-cred accounts** (cred ≥50 or a high-PageRank flag). | New accounts have no shield, so week 1 must be squeaky clean. |
| **Under the Hood** tool (`x.com/i/jf/under_the_hood`, pilot) | Shows aggregate visibility-limiting labels on your account and posts, including legal-compliance withholding (Sep 18, 2026). | **Check it daily during warm-up.** It is the only first-party "am I shadow-limited?" signal. |

### 3.5 Links

- **History.** In 2023, X delayed links to rivals and news (Washington Post) [M]. In Nov 2024, Musk advised "write a description in the main post and put the link in the reply," which was read as admitting link deprioritisation [M]. On Oct 19, 2025, the head of product said link posts are **not** deboosted and shipped an in-app browser that keeps the post visible so X can measure engagement [M]. On Jul 29, 2026, Musk said, "We haven't [throttled links] for over a year" [M, single source].
- **Code.** The ranker gives `open_link` a small **positive** weight (0.2) and has no explicit link penalty [H code]. But a link post that sends people away earns less dwell, fewer replies and fewer likes. URL reputation rules exist (§3.4).
- **Practice.** Keep the warm-up link-free (project rule). On launch day, put the hero video **natively** in the main post with a standalone caption, and put `[LINK]` in the first self-reply (and/or the bio). Test a link-in-main-post variant later, measuring with your own analytics.

### 3.6 Video

- In the repo, video signals include `video_open` (0.02), video quality view (weight 0 at default, eligible only for videos **>10s**), video continuation seconds, and an immersive video carousel (off by default) [H code]. Production weights for video watch time are not published. Blogs claiming "video gets N× reach" are [L].
- **Practice:** native upload, never a YouTube link. Clips run 12–45s so they clear the 10s gate without bleeding retention. Hook in the first second. Burned-in captions, because autoplay is muted (§6).

### 3.7 Premium / verification

- **Reach:** Buffer's analysis (18.8M posts, 71k accounts, Aug 2024–Aug 2025) found median impressions per post of <100 for regular, ~600 for Premium and >1,550 for Premium+. Basic showed only a small lift. Median engagement rate was ~0.4–0.55% for paid tiers, vs ~0% for regular accounts by 2025 [M; correlational, since paying accounts differ].
- **Mechanism (code):** Premium/verified accounts seed credibility PageRank (§3.4) [H]. Premium also gets reply prioritisation and, since Mar 2026, reply downvotes [M].
- **Limits:** X's limits page lists **50 original posts and 200 replies per day for unverified accounts** (reported since ~May 2026). The 2,400 posts/day figure covers all updates, in semi-hourly buckets [H page / M date].
- **Recommendation:** buy **Premium (not Basic) on day 0** for the brand account. Verified Organizations (gold check; Basic tier was $200/mo at its Jan 2024 launch [M], current price unverified) is optional and an owner decision.

### 3.8 Other notable 2025–2026 changes

- Grok-ranked Following feed (Nov 2025) [M]. Promptable Grok feeds announced Jan 2026 and still in development mid-2026 [M].
- Reply thumbs-down for Premium (Mar 2026) feeds reply ranking [M].
- Mutuals boost (Jul 13, 2026) [M], matching the +15 mutual reply boost in code [H].
- X tests a "Made with AI" self-disclosure label [L]. X demonetises *unlabelled AI armed-conflict* videos [M]. Its synthetic and manipulated media policy targets deceptive media [H policy]. **The trailer should be self-evidently fictional and say "AI-generated, dramatized" in the caption or end card.**

### 3.9 Policy rules that directly constrain this campaign [H unless noted]

- **Platform manipulation and spam / Authenticity:** prohibits inauthentic engagement, **follow churn**, coordinated activity across accounts, buying or selling engagement, engagement swapping (pods, F4F), and mass-registering accounts. Up to 10 accounts are allowed only for non-duplicative purposes.
- **Automation rules:** no automated replies or mentions to users who haven't opted in. **Keyword-triggered auto-replies are explicitly banned.** Spammy or duplicative mentions can get posts removed from Search or the account suspended. Automated likes and bulk or aggressive following are likewise disallowed. Scheduling original posts through a legitimate tool is fine.
- **Follow limits:** 400 follows/day is a *technical* cap. Separate rules prohibit "aggressive following." Past 5,000 following, ratio limits apply.
- **Developer policy (Jan 2026):** no apps that reward posting (InfoFi) [M].
- **Financial scams / ads:** no "get rich quick," unrealistic result claims or cash-gift offers. Crypto is ineligible for paid partnerships. Promoted crypto ads have extra restrictions, so **stay organic** for launch.
- **Promotions / contests:** follow X's contest guidelines (no multiple-account entries, no duplicate-post entry mechanics). Recommendation: **no giveaways in week 1**, since follow+RT giveaways attract bot followers that dilute credibility.

---

## 4. New-account warm-up (Oct 20–26) and what triggers restrictions

### 4.1 Day-0 setup checklist (today, Oct 20)

- [ ] Create the account with a **real email and phone**, and enable **2FA**. Create it from the owner's normal device and network (no VPN hopping; "About this account" shows country and VPN warnings).
- [ ] **Pick the handle once.** Username changes are publicly counted.
- [ ] Buy **Premium** (the checkmark appears after review; expect a delay).
- [ ] Complete the profile before the first post: logo avatar (amber scope mark), banner, bio, and the "SIM / paper trading" disclosure in the bio. **No link in the bio yet**, or the owner's own clean domain if it exists. Never a shortener.
- [ ] **Pinned post: link-free.** A one-line "what this is" plus a UI screenshot.
- [ ] Turn on the professional/business account category if offered. Fill in the location consistently.
- [ ] Bookmark the **Under the Hood** page and X analytics.

### 4.2 Warm-up ramp (all manual, no automation)

Numbers are self-imposed ceilings, far below platform caps. The goal is to look and *be* a human operator.

| Day (ET) | Original posts | Replies (value-only) | Follows | Content focus |
|---|---|---|---|---|
| **Tue Oct 20** (day 1) | 2–3, ≥3h apart | 10–15 | 15–25 hand-picked (CT educators, on-chain analysts, dev/builder accounts, mid-size traders) | Intro post, a larp-joke post, one UI screenshot |
| Wed Oct 21 | 3 | 15–25 | 20–30 | POV meme, spot-the-rug puzzle (answer later) |
| Thu Oct 22 | 3–4 | 20–30 | 20–30 | Glossary micro-thread, keyboard flex clip (12–20s) |
| Fri Oct 23 | 3–4 | 20–30 | 20–30 | Rug-autopsy sim clip, poll |
| Sat Oct 24 | 2–3 | 15–25 | ≤20 | Lighter memes. CT trades weekends, but generic engagement is lower. |
| Sun Oct 25 (EU DST ends) | 2–3 | 15–25 | ≤20 | Teaser 1: cryptic trailer frame, no date |
| Mon Oct 26 | 3–4 | 25–40 | ≤30 | Teaser 2: "tomorrow." Build-in-public post. Reply to every reply. |
| **Tue Oct 27** (launch) | 3–4 (trailer, follow-up clip, Asia re-push) plus thread replies | 40–60 (answer everyone) | ≤30 | §5.3 |

Rules for the ramp:
- **Follow because you'd read them**, not to get a follow back. Never unfollow in bulk (follow churn). The total should stay under ~200 following by launch.
- **Replies:** target posts from roughly 5k–200k-follower accounts in the first 30–60 minutes after they post. Add a fact, a mechanism, a sim GIF or a good joke. No "this", "gm", "🔥" or "huge" replies. No product mention in most replies. **Never paste the same reply twice.**
- **No @-mention blasts and no tagging KOLs** to get noticed.
- **Space originals ≥2–3h apart** (author diversity) and post them in the windows in §5.
- **Engage your own replies within the first hour** (cold-start audition, mutual relationships).
- **Don't delete-and-repost** underperformers. Let them die, and re-cut the idea 48h+ later with new words.

### 4.3 What triggers spam labels or restrictions

| Trigger | Source / confidence |
|---|---|
| Aggressive or bulk following, follow churn | X follow limits and Authenticity policy [H] |
| Duplicate or near-duplicate replies or posts | `COPYPASTA_SPAM` rule [H code], automation rules [H] |
| Keyword-triggered or automated replies, mass unsolicited mentions | Automation rules [H] |
| Links on low-quality or unknown domains, shorteners, redirect chains | LQ-URL botmaker rules [H code] |
| Pinned post with a BAD/LQ URL while following people | 1-week `SPAM_HIGH_RECALL` user label [H code] |
| Low-effort replies in big threads | Grok/Gemma reply-spam and reply-ranking flows [H code] |
| Coordinated activity (multiple accounts boosting each other, pods, group-chat raids) | Platform manipulation policy [H]. Code comments say group-chat-driven direct visits have **no** ranking impact anyway [H]. |
| Buying followers or engagement, InfoFi-style reward campaigns | Policy [H], developer policy [M] |
| VPN / location inconsistency, sudden device or app changes | "About this account" signals [M]; enforcement link [L] |
| Posting at bot-like frequency (dozens of originals per day) | Unverified caps of 50 originals / 200 replies [H page]; folklore on velocity [L] |

**If reach collapses:** check Under the Hood first. Then search your handle and a post's exact text logged out. Pause follows for 48h. Keep posting good originals at a normal cadence. Do not create a second account (ban evasion / duplicative accounts).

---

## 5. Posting windows and cadence

### 5.1 Evidence

- **Generic X data [M]:** Buffer (8.7M posts, 2026) found Tue 9 a.m. best, then Wed 10 a.m. and Wed 9 a.m., *in the poster's local time*. It found evenings (6–11 p.m.) and Fri/Sat weakest. Sprout Social found Tue–Thu, 12–6 p.m. Hootsuite found 9–11 a.m., Wed–Fri.
- **Crypto-specific [L]:** one vendor reports a peak of ~14:00–16:00 UTC (US market hours) and a secondary Asian peak of ~00:00–04:00 UTC.
- **Trench activity [L–M]:** a Bitquery snapshot (Apr 2026) found pump.fun launches cluster ~**15:00–22:00 UTC (11 a.m.–6 p.m. EDT)**, peaking around 20:00 UTC. That is when degens are on terminals and on CT.
- **Bottom line:** CT is global and trades 24/7, so the generic "evenings are dead" finding is weaker for this audience. Use three windows and let your own analytics overrule them after week 1.

### 5.2 Windows (ET) with conversions

| Window (ET) | Why | Oct 20–24 (EU summer time) | Oct 25 onward (EU winter time) |
|---|---|---|---|
| **A. 8:30–11:00 a.m.** (primary) | US open plus EU afternoon. Buffer and Hootsuite peaks. | 12:30–15:00 UTC · London 13:30–16:00 · Berlin 14:30–17:00 · SGT 20:30–23:00 | 12:30–15:00 UTC · London 12:30–15:00 · Berlin 13:30–16:00 · SGT 20:30–23:00 |
| **B. 12:00–3:00 p.m.** (secondary) | US lunch plus EU evening. Overlaps peak launch hours, so trenches are busy. | 16:00–19:00 UTC · London 17:00–20:00 · Berlin 18:00–21:00 | 16:00–19:00 UTC · London 16:00–19:00 · Berlin 17:00–20:00 |
| **C. 8:00–10:30 p.m.** (Asia) | Asia morning (SGT 08:00–10:30, Seoul/Tokyo 09:00–11:30) plus US night degens | 00:00–02:30 UTC (+1 day) | same |
| Dead zone | ~2:00–6:00 a.m. ET | | |

### 5.3 Cadence

- **Warm-up:** 2–4 originals/day, one per window, ≥2–3h apart. 10–40 value replies/day. Video 2–3× per week. One micro-thread per week. A poll at most every 2–3 days.
- **Steady state after launch:** 3–5 originals/day, 30–60 replies/day, a daily clip or screenshot, and 1–2 threads per week. Never more than one original in any 2h block.
- **Launch day, Tue Oct 27 (suggested):**
  - **10:00 a.m. ET** (14:00 UTC · London 14:00 · Berlin 15:00 · SGT 22:00): trailer, native video, standalone caption, with `[LINK]` and the thread in self-replies. Pin it.
  - 10:00–11:30: reply to everything. No quote-tweeting yourself in the first hour.
  - **1:30 p.m. ET:** follow-up 15–25s product clip (real UI, SIM badge visible). It is a different asset, not a repost.
  - **8:30 p.m. ET:** Asia re-push. A new angle (vertical 9:16 cut or behind-the-scenes "how we made a larp trailer with AI"). Quote the trailer *with new commentary*, not a bare repost.
  - Wed Oct 28 onward: a "rug autopsy" thread and "guess the fate" challenges to convert trailer viewers into followers.

---

## 6. X video specs

| Spec | Value | Confidence |
|---|---|---|
| Max length, non-Premium | **140s (2:20)** | [H] help.x.com |
| Max file size, non-Premium | **512 MB** | [H] |
| Max length/size, Premium (web and iOS) | **Up to 4h / 16 GB** at 1080p. Videos >2h must be 720p. Older help pages still say ~3h / 8 GB. | [H, conflicting pages] |
| Premium on Android | **10 min** | [H] |
| Containers / codecs | **MP4 or MOV, H.264 video, AAC-LC audio** (HEVC unreliable) | [H/M] |
| Recommended resolution | 1280×720 (landscape), 720×1280 (portrait), 720×720 (square). 1920×1080 accepted. | [H] Media Studio / developer docs |
| Frame rate / bitrate | ≤60 fps (one help page says 40), **~5–8 Mbps** target, ≤25 Mbps | [H, conflicting] |
| Aspect ratio range | **1:2.39 to 2.39:1** (some API docs say 1:3 to 3:1) | [M] |
| Ranking gate | VQV-eligible only if **>10s** | [H code] |
| Autoplay | Timeline video autoplays **muted** by default (user and data-saver settings vary) | [M] |
| Captions | **Burn captions into the video** (open captions). Separate SRT upload support varies by surface and is not reliable. Captioned video is reported to hold attention longer [L]. | [M] |

**Trailer recommendations:**
- **Master 16:9, 1920×1080, H.264, 30 fps, 8–12 Mbps, 30–60s.** Keep it ≤2:20 so it works even without Premium.
- **9:16 cut, 1080×1920**, for the Asia re-push and other platforms.
- Hook in the first 1s. Design **frame 0 as the thumbnail**. Captions burned in and large enough to read on a phone (3–6 words per line). End card: logo, "AI-generated · dramatized · paper trading only," @trenchscope.
- Product clips: 12–30s, 1080p screen capture, SIM badge visible, no cursor jitter, keyboard overlay.

---

## 7. Avoid list

- Follow-for-follow, follow churn, engagement pods, group-chat raids, bought followers or engagement, multiple brand or alt accounts, auto-replies, auto-likes, auto-follows, mass-tagging.
- Identical or templated replies. "gm", "this", 🔥 replies. Dropping the product in every reply.
- Links during warm-up. Shorteners. A link in the pinned post while following people.
- Hashtag stacks, emoji walls, "RT to win", giveaways, "engage to earn", points-for-posts.
- Token, airdrop, presale, "wen" teasing. "100x", "guaranteed", "free money", any profit promise or financial advice.
- Fabricated metrics, users, volume, testimonials, partnerships or endorsements. PnL images without a SIMULATED watermark. Sim data presented as real-market data.
- Competitor names, logos, colours or copy. Dunking on named people. Depicting real people, KOLs or brands in AI video.
- Deleting and reposting, or reposting the same text (duplicate filter, 48h cutoff).
- Posting three originals inside an hour (author-diversity decay).

---

## 8. Open items for the owner

1. Confirm the handle (@trenchscope is a placeholder) and the domain for `[LINK]`.
2. Approve the Premium purchase on day 0. Decide on Verified Organizations (optional).
3. Confirm who operates the account daily during Oct 20–27 (replies must be human-written).
4. Re-check the live help.x.com video and limits pages before launch. Some pages conflict (§6).

---

## Sources

**Primary: X open-source ranking code (snapshot `862a123`, 2026-10-17)**
- https://github.com/xai-org/x-algorithm (README: architecture, notable updates, Under the Hood)
- https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs (action weights, cold-start params)
- https://github.com/xai-org/x-algorithm/blob/main/vm-ranker/params.rs (author diversity 0.5/0.25, OON 0.75)
- https://github.com/xai-org/x-algorithm/blob/main/xai-value-model/scoring.rs (diversity multiplier, OON application)
- https://github.com/xai-org/x-algorithm/blob/main/home-mixer/scorers/author_cold_start.rs (cold-start eligibility and Thompson sampling)
- https://github.com/xai-org/x-algorithm/tree/main/botmaker-rules/scarecrow/bot (BBQDuplicateTextRepliesProd, LQ-URL, FollowFromActorWithPinnedLowQualityOrBadUrl)
- https://github.com/xai-org/x-algorithm/tree/main/grox/flows/reply_spam (Grok/Gemma reply spam, reply ranking, coordinated spam)
- https://github.com/xai-org/x-algorithm/tree/main/user-cred-v2 (credibility PageRank)
- https://github.com/xai-org/x-algorithm/tree/main/abuse-enforcement-service (high-cred enforcement skip)
- https://x.com/i/jf/under_the_hood (label transparency tool)

**Primary: X Help Center / policy**
- https://help.x.com/en/rules-and-policies/platform-manipulation
- https://help.x.com/en/rules-and-policies/authenticity
- https://help.x.com/en/rules-and-policies/x-automation
- https://help.x.com/en/rules-and-policies/x-limits
- https://help.x.com/it/using-x/x-follow-limit
- https://help.x.com/en/using-x/x-videos
- https://help.x.com/en/using-x/premium-longer-videos
- https://help.x.com/en/using-x/x-premium
- https://help.x.com/en/using-x/media-studio-faqs
- https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices
- https://help.x.com/en/business-and-advertising/creative-ad-specifications
- https://help.x.com/en/rules-and-policies/paid-partnerships-policy
- https://help.x.com/en/business-and-advertising/deceptive-and-fraudulent-content
- https://help.x.com/en/rules-and-policies/x-contest-rules
- https://help.x.com/en/rules-and-policies/manipulated-media
- https://help.x.com/en/rules-and-policies/financial-scam

**Secondary reporting and data**
- https://buffer.com/resources/x-premium-review/ (18.8M posts, Premium reach)
- https://www.socialmediatoday.com/news/report-shows-paying-for-x-twitter-premkum-has-significant-reach-benefits/801881/
- https://buffer.com/resources/best-time-to-post-on-twitter/ (8.7M posts, 2026 timing)
- https://www.businesstoday.in/technology/news/story/decoding-xs-algorithm-heres-how-grok-open-sources-and-curates-the-for-you-feed-511751-2026-01-20
- https://decrypt.co/355108/elon-musks-x-open-sources-grok-powered-algorithm-driving-for-you-feed
- https://pasqualepillitteri.it/en/news/2594/x-algorithm-open-source-may-2026
- https://wallaroomedia.com/x-algorithm-explained/
- https://csmapnyu.org/impact/news/what-can-we-learn-from-twitters-open-source-algorithm (2023 weights)
- https://thezvi.substack.com/p/more-on-twitter-and-algorithms (2023 weights)
- https://decrypt.co/354736/elon-musks-x-bans-access-infofi-crypto-projects-ai-slop-backlash
- https://www.theblock.co/post/385847/
- https://unchainedcrypto.com/x-bans-incentivized-posting-apps-prompting-shakeup-in-crypto-engagement-platforms/
- https://www.storyboard18.com/digital/elon-musks-x-cracks-down-on-1-7-million-spam-bots-82422.htm
- https://u.today/208-bots-per-minute-banned-will-crypto-x-be-purged
- https://letsdatascience.com/news/x-says-it-removed-42000-chatbot-reply-accounts-0e994445
- https://protos.com/crypto-twitter-is-back/
- https://learn.backpack.exchange/zh-tw/articles/nikita-bier-crypto-twitter
- https://www.odaily.news/ko/post/5212351 (Aug 2026 role change)
- https://techcrunch.com/2025/11/21/x-begins-rolling-out-the-about-this-account-feature-to-users-profiles/
- https://innovation-village.com/elon-musk-unleashes-grok-ai-to-rank-xs-following-feed-ending-chronological-era/
- https://letsdatascience.com/news/x-integrates-grok-to-enable-promptable-feeds-6bb81a05
- https://www.socialmediatoday.com/news/x-formerly-twitter-testing-links-in-app-link-post-penalties/803176/
- https://roboin.io/article/en/2025/10/20/x-begins-testing-persistent-post-view-while-opening-links-on-ios/
- https://www.mediaite.com/news/elon-musk-admits-x-is-throttling-links-effectively-limiting-people-from-reading-news
- https://ppc.land/x-drops-year-old-link-penalty-musk-tells-zuckerberg-on-platform/
- https://www.fox5dc.com/news/hashtags-x-elon-musk-says-please-stop-using-them
- https://socialpilot.co/blog/twitter-algorithm (mutuals Jul 2026, reply downvotes Mar 2026)
- https://www.techradar.com/pro/x-slashes-prices-for-verified-organization-memberships-as-it-targets-smbs
- https://routenote.com/blog/x-increases-video-length/
- https://www.technerdiness.com/twitter/how-to-upload-long-videos-on-x/

**CT / terminal growth context (practitioner and vendor sources, low confidence)**
- https://madeonsol.com/blog/how-to-use-axiom-solana-trading
- https://madeonsol.com/blog/bonkbot-vs-trojan
- https://telegramads.it/blog/trojan-telegram-ads-profile-2026
- https://sacra.com/c/axiom
- https://web3growthchronicles.substack.com/p/personal-twitter-playbook
- https://onchainfreedom.beehiiv.com/p/reply-guy-strategy
- https://bitmedia.io/blog/crypto-twitter-marketing
- https://emaillove.com/inspiration/pre-launch
- https://opentweet.io/best-time-to-post/industry/crypto
- https://docs.bitquery.io/docs/mcp/trading/examples/pumpfun-launch-pulse/
- https://cointelegraph.com/news/how-pump-fun-captured-80-of-solana-memecoins-and-can-it-last
- https://extscope.org/extension/aonkekiojcdccnmabdlejgncojaibgjn (memecoin paper-trading tools exist; the niche is not empty)
- Repo: /home/user/Gmgn/docs/research/gmgn-research.md §13.4 (launchpad lifecycle stats) and §17 (competitors); /home/user/Gmgn/docs/PRD.md §1, §6.21
