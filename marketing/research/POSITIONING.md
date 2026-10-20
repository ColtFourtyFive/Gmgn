# Positioning brief: Trenchscope (live terminal)

This brief is the source every marketing doc and asset follows. It replaces the simulator-era positioning ("larp the trenches", paper trading, no real funds). If it conflicts with an older doc, this brief wins until that doc is rewritten.

## What we're marketing

**Trenchscope is a memecoin trading terminal for the trenches.** You trade and track launchpad coins across **Solana, Base, BNB Chain (BSC), Ethereum and Robinhood Chain** from one screen, with **self-custody**: you keep your keys.

- **Timing:** real trading goes live this week. The warm-up teases a real terminal. Launch-day posts say it's live, and are posted only once it is.
- **No dates** appear in any post, image or video.

## Lines

| Use | Line |
|---|---|
| Tagline | **see who's really buying.** |
| Long form | see who's really buying, before you do. |
| Brand line | the trenches, with a scope. |
| Trailer series | Field Guide to the Trenches, EP.01 |
| CT hook | everyone in the trenches is larping. the wallets aren't. |

"larp the trenches." is retired, because it meant paper trading. "Larp" now appears only as the CT hook above, about *other people* larping.

## What the product does

These are the claims we can make, if the live build has them. Every one exists in the current app (`apps/web`, `apps/server`), so the owner confirms each is in the live build before a post names it.

1. **The board:** new launches → near graduation → migrated, in real time, with a curve-progress ring and risk chips on every card.
2. **Wallet tags:** smart money, KOL, sniper, bundler, insider, dev, whale, fresh wallet and bot.
   - Every tag has a published definition, shown in its tooltip.
3. **Token audit:** a flag list with a risk level and rug ratio. Holder breakdown by tag. Who funded whom (funding links).
4. **The risk prompt:** a high-risk buy lists its reasons and asks you to confirm.
5. **Orders:** market, limit and auto. Auto exits cover take-profit, stop-loss, trailing and a **dev-sell exit**.
   - Also: presets, an anti-MEV option, and all-in cost (fees, impact) before you confirm.
6. **Speed:** keyboard-first hotkeys and a command palette.
7. **Tracking:** copy trading, sniper tasks, signals, a wallet monitor, watchlist and alerts.
   - Portfolio and PnL with fees counted.
8. **Multi-chain:** the five chains above from one terminal.

## What we never do

- **Fake results.** No invented trades, PnL, win rates, volumes, user counts or testimonials. A PnL number appears only from a real trade the owner made on the live product, with "your results will differ".
- **Real tokens in mockups.** No real tickers in product shots: it reads as shilling them. No $cashtags.
- **Profit promises.** No "make money", "profit", "returns", "earn", "guaranteed", "risk-free" or "100x". It's a tool, not an opportunity.
- **Competitors.** No competitor names, logos or "better than X" claims. No "fastest" or "lowest fees" unless measured, with the measurement published.
- **Chain endorsement.** No Robinhood, Coinbase/Base, Binance/BNB or Ethereum logos, brand colours or wording that implies a partnership. Chains are named as supported chains only.
- **"Live" before it's live.** Nothing says "live", "trade now" or carries a link until real trading works on the chains we name. If a chain isn't ready at launch, drop it from the copy and the header.
- **Tokens.** We don't mention a Trenchscope token at all unless the owner confirms the plan.

## Footage

- **Product UI:** the real app UI running on **demo data**, captured in a marketing capture mode. That mode hides the simulator's SIM badge and the sim-only wording, and keeps the data fictional.
  - Every product shot or recording carries a small line: **`UI shown with demo data`**.
  - Generated tickers are blurred in close-ups.
  - Re-record on live data after launch and swap the assets in.
- **AI shots** (the trailer and teasers) carry **`AI-generated`**. Turn on X's "Made with AI" label.
- **Chains in footage:** the current UI lists four chains (SOL, BSC, Base, ETH). Robinhood Chain appears in copy, and in UI only once the live build has it.

## Disclaimers

| ID | Text | Where |
|---|---|---|
| RISK | `memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa.` | Every launch-day post about trading. The trailer end card. The website. A short form `high risk · nfa` on cards. |
| DEMO | `UI shown with demo data` | Every product screenshot or recording |
| AI | `AI-generated` | Every AI still or clip |
| CUSTODY | `we will never DM you first, ask for your seed phrase, or ask you to send funds.` | Pinned self-reply. The reply bank. The launch thread. |
| CHAINS | `not affiliated with any chain, launchpad or exchange named.` | Trailer end card and the website footer |

## Owner checks before launch

- [ ] **Chains:** real execution works on each chain the copy names.
- [ ] **Custody:** self-custody is true. Users hold their keys, and you never touch funds.
- [ ] **Features:** every feature in a post is in the live build.
- [ ] **Fees:** the real fee is shown in-app before every trade. Quote a number in marketing only once it's final.
- [ ] **Legal:** check the rules for marketing a crypto trading product where your users are, and add geo-blocking or the required risk warnings where needed. The UK, for example, has a specific regime for crypto promotions.
- [ ] **Stats:** re-verify any real-market stat the day before it posts (see the claims ledger's AMBER list).
