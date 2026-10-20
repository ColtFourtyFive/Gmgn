# Today: account setup + Day-1 posts (live-terminal positioning)

Trenchscope is now marketed as a **real memecoin trading terminal that trades and tracks across Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain, with self-custody**. The warm-up teases it, and launch-day posts say it's live. **No dates go in any post copy.**

`PROFILE.md` and `WARMUP_WEEK.md` Day 1 now carry this kit; this page stays the approved source for its copy. The account steps in `PROFILE.md` §1–§3 (checklist, security, handle check) and §10 (who to follow) apply as written.

**Gate before anything here goes up (ledger §8, C-0):** the owner confirms that each named chain (Solana, Base, BNB Chain (BSC), Ethereum, Robinhood Chain) and self-custody are **in the launch build**. The bio, header, pin and D1-P3 name them. A chain that won't make the launch build comes out of all four now (four-chain versions: `PROFILE.md` §5, §7, §9.2; `WARMUP_WEEK.md` §10). C-0 covers teasers only; "live" waits for the checks at the bottom of this page.

Counts are X-weighted (`—` and `·` count as 1). Everything is ≤ 280.

---

## Profile

| Field | Use |
|---|---|
| Handle | `@trenchscope` → fallbacks `@trenchscope_`, `@usetrenchscope`, `@trenchscopehq` (check per `PROFILE.md` §2 Phase A) |
| Display name | `Trenchscope` |
| Bio | **BIO-1** (158): `one memecoin terminal for sol, base, bsc, eth and robinhood chain. see who's really buying (snipers, bundlers, insiders, the dev) before you do. self-custody.` |
| Bio fallback | **BIO-2b** (159): `the trenches, with a scope. trade and track memecoins on sol, base, bsc, eth and robinhood chain. snipers, bundlers, insiders: tagged. you keep your keys. nfa.` BIO-2 ("every wallet tagged") is retired: most wallets match no rule (ledger SC-19) |
| Location | `the trenches` |
| Website | Leave blank until real trading works (`LAUNCH_DAY.md` §1.1), then add the real URL (own domain, no shortener) |
| Avatar | `marketing/x/profile/avatar.png` |
| Header | `marketing/x/profile/header-alt.png` ("see who's really buying." + `SOL · BASE · BSC · ETH · ROBINHOOD CHAIN` + the wallet-tag chips). **READY**: already re-rendered with `marketing/tools/profile.py` with the subline `snipers, bundlers, insiders, the dev: tagged · self-custody` (the old "every wallet tagged" overclaim is gone). Alternative: `header-main.png` (the AI header art with the lockup) |
| Professional category | Software / technology. Avoid finance categories until you've checked what X requires of financial-service accounts. |
| Chain names | Name the chains as supported chains only. No Robinhood, Coinbase, Binance or Ethereum Foundation logos, colours or wording that implies a partnership. |

---

## Pinned post (post first, then pin)

**PIN-v2** (276), text only. This is the Day-1 pin:

```
trenchscope: see who's really buying, before you do.

one memecoin terminal for solana, base, bsc, ethereum and robinhood chain. snipers, bundlers, insiders, the dev, smart money: tagged. every token gets an audit. risky buys on the trade panel ask first.

you keep your keys.
```

PIN-v2 is the ledger-clean version of the originally approved **PIN** (268), which said "every wallet gets a tag (sniper, bundler, insider, dev, kol, smart money), every token an audit, risky buys ask first." Two of those statements are false against the code: most wallets match no tag rule (ledger SC-19), and one-click quick buy skips the risk prompt (`QuickBuyButton.tsx` calls the swap directly; ledger SC-08c). "kol" also has no real source yet (F-2). PIN stays retired unless quick buy goes through the prompt (F-3), a real KOL source exists (F-2) and its first claim is reworded. Four-chain PIN-v2 (259) and the "PIN is already up" steps: `PROFILE.md` §9.2.

**PIN-r1** (self-reply, posted right after): the scam shield. Self-custody brands get impersonated within days.

```
we will never DM you first, ask for your seed phrase, or ask you to send funds anywhere. if someone does, it isn't us.
```

---

## Day 1

Space the posts at least 3 hours apart. Spend the time between them replying to bigger accounts per `REPLY_BANK.md`.

**D1-P1**, morning (234), text only:

```
everything in the trenches wants your bag.

the sniper was in before you blinked.
the bundler is six wallets in a trench coat.
the insider was early. suspiciously early.
the dev wrote the exit before the coin.

we're building a scope.
```

**D1-P2**, afternoon (49): a poll, 24 h.

```
before you ape, what do you actually check first?
```

Poll options (each ≤ 25 characters):
1. `the dev wallet`
2. `top 10 holders`
3. `bundles at launch`
4. `the chart (be honest)`

**D1-P3**, evening (157), image `marketing/x/posts/d1-field-guide.png` (a frame from the AI trailer). Turn on X's "Made with AI" label. Gate: C-0 for each chain named.

```
field guide to the trenches, ep.01.

every coin has a cast. we're building the scope that names them, across solana, base, bsc, ethereum and robinhood chain.
```

Alt text:

```
AI-generated still: a whale drifts over a misty trench at dusk while an amber targeting reticle locks onto its eye and a small chip beside it reads "Whale". Caption: everything out here wants your bag. Letterbox bars, label: field guide to the trenches, ep.01.
```

**Optional owner swap for D1-P3** (145, no chain gate). The image is the whale, but the approved copy never mentions it and ends on the chain list; D4-P4 names all five chains anyway:

```
field guide to the trenches, ep.01.

the whale. moves slowly. moves everything.

every coin has a cast. we're building the scope that names them.
```

The image's corner label reads `AI-GENERATED · DRAMATIZED` in faint capitals with no plate. It's approved as is; optionally re-render it with the exact `AI-generated` label on the corner-label plate (`BRAND_GUIDE.md` §10, 0 credits) before D1-P3.

---

## Before anything says "live"

Each of these must be true of the live product before any post claims it. The full gate is ledger §8 and `LAUNCH_DAY.md` §1.1; these are the ones this kit's copy leans on:

- [ ] **C-1:** real trades execute on each chain named: Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain. If one isn't ready, drop it from the copy, the bio and the header.
- [ ] **K-1:** users keep their own keys.
- [ ] **K-2:** limit orders, auto exits (TP/SL/trailing/dev-sell), copy trades and sniper tasks run server-side in the code (the Auto tab says so on screen: "Exit orders are created from your fill price and run server-side", `AutoForm.tsx:112`). How they sign without the team holding keys is written down, and the custody line matches it.
- [ ] **F-1:** the features named in the posts are in the live build on real chain data: wallet tags, audit, risk prompt and auto exits.
- [ ] **F-3:** quick buy goes through the risk prompt, or copy keeps saying "on the trade panel" (as PIN-v2 does).
- [ ] **L-1:** the legal check for promoting a crypto trading product is done for the markets we reach.
