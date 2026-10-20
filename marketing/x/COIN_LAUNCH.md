# Coin launch (CA day) · prepared, gated

> **Status: PREPARED, NOT CLEARED.** Nothing in this file posts until §1 is fully ticked. Until then MNC-02 stays in force everywhere else in the kit: no token, ticker, airdrop, presale, points or "wen" talk, from us or in replies (`research/CLAIMS_LEDGER.md` MNC-02, check T-1).
>
> The owner has said a coin will launch "eventually". This file gets that day ready without saying a word about it early. It covers the CA posts, the safety posts, the replies, the cards (`tools/coin-kit/ca_card.py`) and what to do when something goes wrong.

---

## 1. The gate (all ticked, or nothing posts)

- [ ] **T-1 sheet filled (§8)** and signed by the owner: name, ticker, chain, how it launches, supply split, team and treasury wallets, locks or vesting, and what the coin does, if anything.
- [ ] **Legal sign-off (L-1)** on the plan and on every post in §4, for every country you market to. Crypto-promotion and securities rules differ by country and change often. Counsel decides what can be said and to whom. Typical questions for counsel: whether the coin or its marketing falls under securities or financial-promotion rules (for example the UK cryptoasset promotions regime, MiCA marketing rules in the EU, US securities law), whether any feature ties the coin to platform revenue or fees, and whether the jurisdictions you serve need restrictions or disclaimers. **This file is not legal advice.**
- [ ] **Our coin passes our own audit.** No bundle at launch, no snipers or insiders we control, and every team or treasury wallet labelled publicly. We sell a tool that tags exactly these things, so CT will run the coin through it in the first minute. If the plan can't pass this, change the plan.
- [ ] **CLAIMS_LEDGER updated:** MNC-02 replaced by the approved coin claims (the T-1 answers, worded by counsel). REPLY_BANK §R53 and PROFILE's "wen token" note are updated to match.
- [ ] **Account security:** hardware-key 2FA on the X account and the domain registrar, two admins, session list cleared. A hijacked account posting a fake CA is the most likely disaster of the day.
- [ ] **The CA is copied from the deploy transaction**, not typed, and checked character by character by two people against the chain explorer. Same check before every post that carries it.

## 2. Rules for every coin post

1. **One source of truth.** The CA lives in exactly two places: the pinned post on this account and the official website. Every coin post points there. We never post a CA in a reply.
2. **No price, returns or predictions.** Never "moon", "100x", "early", "don't miss", "send it", "pump", "floor", "undervalued", "next [coin]", charts with targets, or market-cap goals. No "utility" that implies profit: revenue share, buybacks, "holders earn", staking yield. Only if counsel approves one in writing.
3. **No incentives tied to buying or holding.** No giveaways, raffles, whitelist spots, "holders get access", or airdrops, unless counsel signs that exact mechanic.
4. **Disclose, every time.** Team and treasury allocation and wallets, locks and vesting, as T-1 says. Paid promotion carries the platform's paid-partnership label plus `#ad` from the promoter, every time. Unpaid friends don't post "CA:" for us.
5. **RISK on every coin post** (POSITIONING RISK, verbatim): `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.`
6. **CUSTODY on every coin post with a CA:** `we will never DM you first, ask for your seed phrase, or ask you to send funds.`
7. **The product and the coin stay separate.** Product claims still need the ledger. The coin never makes the product sound safer, and the product never makes the coin sound like a sure thing.
8. **No dates in advance**, as with launch day. "Soon" teasers for the coin need counsel's sign-off like any other coin post.

## 3. The day (times relative to the CA post, T-0)

| When | What | Asset |
|---|---|---|
| T-60 min | §1 re-checked. CA copied from the deploy tx, verified by two people. Website banner staged, not live | — |
| T-10 min | Our own token page opened in Trenchscope: audit, holders and dev panel checked against the plan. If anything reads red, stop | — |
| **T-0** | **CA-1** posted, then pinned within 60 seconds (replaces the trailer pin; the trailer moves into the CA-1 thread). Website banner live | `ca-card-16x9.png` |
| T+2 min | **CA-2** (self-reply): how to verify | none |
| T+5 min | **CA-3** (self-reply): the scam warning | `ca-scam-warning.png` |
| T+15 min | **CA-4** (self-reply): our coin in our own terminal, real data, real ticker (it's ours) | new capture (§5) |
| T+0 to T+3 h | Replies from §6 only. Impersonation search every 15 min | — |
| T+24 h | **CA-5**: allocation and wallets recap, if T-1 includes it | none or a T-1 card |

Bio: add `official CA: pinned post only` in place of a CA (a CA in the bio gets screenshotted out of date). The name and handle don't change.

## 4. Post templates

Fill the brackets from the T-1 sheet, drop the brackets and re-measure (X counts any URL as 23 characters). Counsel signs each one.

### CA-1 · the CA (pinned)

```text
[name] ([ticker]) is live on [chain].

official CA:
[CA]

this post and [website] are the only places it lives. check the first 4 and last 4 characters.

we will never DM you first, ask for your seed phrase, or ask you to send funds.

memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Image: `ca-card-16x9.png` rendered from the real `coin.json` (§5). Alt text: `Card titled official contract address: [name], [ticker], chain [chain], with the contract address [CA] in full, its first and last four characters in amber. Below: check the first 4 and last 4 characters; this account and this pinned post are the only places it lives; we will never DM you first, ask for your seed phrase, or ask you to send funds.`

### CA-2 · how to verify (self-reply)

```text
how to check you've got the real one:
1. copy the CA from the pinned post, not from a reply.
2. the first 4 and last 4 characters match.
3. open it in trenchscope or any explorer: the deployer is [deployer short form].
anything else with our name on it isn't ours.
```

### CA-3 · scam warning (self-reply)

```text
scammers love a launch.
no presale. no whitelist. no "early access" in your DMs. support never messages you first. a CA in someone's reply is not ours.
we will never DM you first, ask for your seed phrase, or ask you to send funds.
```

Image: `ca-scam-warning.png`.

### CA-4 · our coin, our audit (self-reply)

```text
we ran our own coin through our own terminal. bundlers, snipers, insiders, the dev wallet: here's what the audit shows, live.
[one factual line from the capture, e.g. "dev wallet: [x]% · labelled team wallets: [n]"]
memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.
```

Only post it if the capture shows what the line says. Real data, so no DEMO label, and the ticker isn't blurred: it's ours. Every other coin in frame is still blurred.

### CA-5 · allocation recap (T+24 h, only if T-1 includes allocations)

```text
where the supply sits, as promised:
team: [x]% · [wallet short form] · [lock / vesting]
treasury: [x]% · [wallet short form]
[liquidity / curve line from T-1]
all of it is tagged in the terminal. check it yourself.
```

## 5. Assets

| Ref | Size | Source | Status |
|---|---|---|---|
| `x/coin/ca-card-16x9.png` | 1600 × 900 | `python3 tools/coin-kit/ca_card.py <scratch> coin.json` | **GATED**: renders only from a `coin.json` with name, ticker, chain, CA and both sign-offs; the CA format is checked per chain (Solana base58, EVM `0x` + 40 hex) |
| `x/coin/ca-card-4x5.png` | 1080 × 1350 | same | **GATED** (for the website and other channels) |
| `x/coin/ca-card-16x9-TEMPLATE.png`, `ca-card-4x5-TEMPLATE.png` | as above | the same script with no config | **READY** for layout review only; stamped "TEMPLATE · NOT FOR POSTING" |
| `x/coin/ca-scam-warning.png` | 1080 × 1350 | the same script | **READY**, posts only on CA day (CA-3) |
| `x/coin/coin-one-ca.png` | 1600 × 900 | the same script | **HOLD**: "one CA. posted here. pinned here. nowhere else." For the day the owner first says a coin is coming, if counsel approves that announcement. No name, ticker or date on it |
| CA-4 capture | 1600 × 900 | Capture the token page on live data with `tools/blur-tickers.js` adjusted to skip our own ticker; frame with `tools/launch/frame_launch.py`'s layout | **NEW** on CA day |

`coin.json` lives outside the repo until CA day (it holds the sign-off names). Never commit a real CA before it's posted.

## 6. Replies on CA day

| They say | We say (or do) | Never |
|---|---|---|
| "is this the CA? [CA]" | `only the pinned post. check the first 4 and last 4.` (never repeat their CA, even when it's right) | "yes", "that's it", repeating any CA |
| "price prediction?" / "wen moon?" / "how high?" | Silence, or `no price talk from us. ever.` | anything about price |
| "airdrop?" / "presale?" / "whitelist?" | `none. anyone offering one in our name is a scam.` (only if T-1 confirms none) | "soon", "maybe", "stay tuned" |
| "team tokens?" | Point to CA-5 or the labelled wallets | numbers that aren't in T-1 |
| "is it safe?" | `nothing in the trenches is safe. the audit is on the token page. memecoins are extremely risky.` | "safe", "audited", "rug-proof" |
| "listing on [exchange]?" | Silence unless counsel approves a statement | any listing hint |
| A scam account using our name | WARN-S from `x/LAUNCH_DAY.md` §9.2: don't engage it, report it, warn the person | quoting it, posting its CA or link |

## 7. If something goes wrong

- **Wrong CA posted.** Delete the post at once. Post the correction from the same account, pin it, and say plainly what happened: `the CA in our earlier post was wrong and is deleted. the correct one is pinned. if you bought from the wrong one, it isn't ours.` Then update the website. Don't argue in replies.
- **Account compromised.** Use the pre-agreed backup channel (website banner) to say the account is compromised and to ignore any CA it posts. Recover through X support with the hardware key.
- **Copycat coin with our name or ticker.** WARN-T from `x/LAUNCH_DAY.md`, wording updated for the coin by counsel. Never post the copycat's CA.
- **Our coin shows red in our own audit after launch** (for example a team wallet sells). Say what happened, factually, before CT does. Hiding it would contradict everything the product stands for.

## 8. T-1 sheet (owner fills, counsel reviews)

| Field | Answer |
|---|---|
| Coin name | |
| Ticker (no "$" in copy) | |
| Chain (one of: Solana, Base, BNB Chain, Ethereum, Robinhood Chain) | |
| Launch method (launchpad curve, direct pool, other) and venue | |
| Deployer wallet | |
| Total supply | |
| Team allocation, wallets, lock or vesting | |
| Treasury or marketing allocation, wallets | |
| Liquidity plan | |
| What the coin does (or "nothing: a community coin") | |
| Any link to platform fees, revenue or features (counsel decides if allowed) | |
| Jurisdictions to restrict or exclude | |
| Paid promoters (each needs `#ad`) | |
| Website URL and banner owner | |
| Owner sign-off (name, date) | |
| Legal sign-off (name, date) | |
