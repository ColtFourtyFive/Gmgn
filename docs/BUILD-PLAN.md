# Build plan

> Produced by a verified gap audit (2026-10-20): seven auditors compared docs/PRD.md and docs/research/gmgn-research.md
> with the code, a skeptic per area tried to refute each gap, and a planner grouped the 181 verified gaps
> (125 P0, 79 critical for a real-money launch) into waves. "In-flight A" = the Solana live stack (now merged);
> "B" = EVM live modules (Base, Robinhood Chain, BNB Chain, Ethereum); "C" = EVM wiring, real-service
> verification and paper trading on live markets.


**Scope.** This plan assigns all 180 verified gaps. Each gap goes to exactly one workstream, unless the gap is split across workstreams, in which case its title is followed by `→` and the part each workstream takes. The plan has seven waves:

| Wave | Contents |
|---|---|
| W0 | Seams |
| W1 | Real-money safety floor (go-live gate) |
| W2 | Live data truth on 5 chains |
| W3 | Trading parity on 5 chains |
| W4 | Analytics and UI parity (remaining P0) |
| W5 | P1 depth |
| W6 | P2 |

**Real-funds rule.** No real-funds sign-ups until W1 exits. EVM chains stay behind a per-chain real-funds flag (from W1.11) until W3.1 also exits.

---

## 1. Deduplication

The table merges the overlapping gaps into one item each.

| Merged item | Verified gaps folded in | Home |
|---|---|---|
| Resolve any address and pin tokens | "Live: no on-demand lookup…"; "Open any token address on demand…"; "Trade any token by address…"; "Search and on-demand resolution of any contract or wallet address…"; "Live: wallet page, follow, import… 404…" (server part); "Live: watchlist, alerts and follows need entities…"; "Live: watchlisted tokens are dropped by LRU…" | W2.1 |
| Token history backfill | "Load past candles and stats for live tokens…"; "Price/candle/stats backfill for tokens discovered mid-life" | W2.2 |
| Transfers and cost basis | "Ingest token transfers and burns…"; "Live: token transfers are not ingested, so cost basis…"; "PnL and holder conformance vectors…" | W2.3 |
| Wallet identity | "Look up each wallet's funding source, true age…"; "Live: wallet identity enrichment…" | W2.5 |
| Creator history | "Load each creator's past launches…"; "Creator/dev history backfill for sniper dev filters…" | W2.5 |
| Wallet-centric ingestion | "Copy trade in live: per-wallet activity stream…"; "Live: wallet-centric trade ingestion for followed…" | W2.6 |
| Venue and universe coverage | "Live Solana discovery only covers pump.fun and PumpSwap"; "Trending/discovery of established (non-launchpad) tokens…" | W3.6 |
| Server gates and guardrails | "Server-side hard/soft safety gates…"; "Real-money guardrail settings… enforced on the server"; "Confirmation policy and trading-safety settings…"; "One-click buys on lists…" (server cap); "Session and API hardening…" (slippage, priority-fee and tip caps) | W1.1 (+ web in W1.14) |
| Security tri-state | "Show unknown audit fields as unknown…"; "Unchecked security fields on live tokens default to 'safe'…"; "Sanitise untrusted metadata…" (server part) | W1.2 |
| Automation consent | "Automation consent records…" (trading); "Automation consent records (TE-65)…" (account); "Automation consent with daily spend caps…" (live-platform) | W1.4 |
| Rewards honesty and payouts | "Live rewards: real fee rebates…"; "Referral rebate and cashback payouts…" | W1.15 (hide), W5.7 (pay) |
| Identity and recovery | "Account recovery: verified email…"; "Email verification, account recovery…"; "Session management…"; "Money and security notification kinds…"; "Harden sessions against account takeover…"; "Session and API hardening…" (session part) | W1.8 + W1.9 |
| Legal and compliance | "Legal consent records, Terms/Privacy/Risk pages…"; "Legal pages, versioned ToS/privacy acceptance and 18+…"; "Geo-blocking…"; "Compliance and abuse guardrails…"; "Regulatory posture…" | W1.10 |
| Rate limits | "Rate limits on quote, order, automation, search…"; "Rate limits per account and per IP on every endpoint" | W1.9 |
| Money-path observability | "Monitoring, alerting and paging for the money path…"; "Trading and money-flow observability" | W1.12 |
| Paper-on-live | "Paper mode on live data: ledger isolation…"; "Paper-on-live segregation across account features…" | W1.15 (C's acceptance criteria) |
| Mode-aware copy | "Replace simulator and paper wording on the token page…"; "Live copy and onboarding pass…"; "Mode-aware copy and string externalisation…" (live part); "Command palette…" (copy) | W1.14 |
| Portfolio | "Live portfolio valuation and durable PnL history"; "Cross-chain USD portfolio over real on-chain holdings" | W3.4 |
| Multi-wallet | "Multi-wallet trading and wallet manager…"; "Wallet manager: multiple wallets per chain…" | W5.6 |
| Copy assessment | "Copy guardrails and copy assessment…"; "Copy assessment card (WP-4)…" | W5.3 |
| Keyboard | "Most of the global keyboard map is unimplemented"; "Keyboard map (§11.6) incomplete" | W4.3 (rebinding in W5.10) |
| Convergence | "Convergence panel (MN-3)…"; "Missing realtime channels…" (convergence) | W4.7 |
| Inflow | "Inflow board (MN-2)"; "Missing realtime channels…" (inflow) | W5.4 |
| PWA and push | "PWA service worker, offline shell and Web Push"; "Responsive and PWA…" | W1.14 (stale-data guard), W5.9 |
| Retention and deletion | "Delete account and personal-data export…"; "Data retention schedule, account closure…" | W1.10 (schedule), W5.8 |
| Quote and cost | "Real-money safety gate and full cost breakdown…"; "Quote and receipt contract for real execution…" | W1.14 + W3.1 |
| Exit plans | "Exit-plan (bracket) model…"; "Limit orders by '% from now'; attach TP/SL…" | W1.3 (server), W3.2 (UI) |
| Sniper | "Launch-sniper rule completeness…"; "Creator/dev history backfill for sniper…" | W1.4, W2.5, W3.3 |
| Thresholds | "Appendix B thresholds: one shared table…" | W1.1 (table and server), W4.5 (chips) |

---

## 2. What in-flight A, B and C leave uncovered (merge checklist; W0.1 turns each into a test)

### A (Solana live)

- **LRU vs pins.** Confirm that `LiveMarket` LRU eviction consults `world.pinnedTokens()`, and that `protectedTokens()` includes watchlist, paper positions and watched-wallet holdings → W2.1.
- **Server acceptance.** `LiveTradeAck` lives only in localStorage; there is no server acceptance record → W1.10.
- **Chain-specific copy.** The live copy hard-codes "Solana mainnet" in 13 files → W1.14.
- **Solana-only fill records.** `LiveFillRecord` is Solana-shaped (route enum `jupiter|pump|pump-amm`, SOL floats) → W1.6.
- **Turnkey policies.** Policies exist as docs only, there are no sub-orgs, and one org-wide API user signs everything → W1.7.
- **Admin features.** There is no admin 2FA recovery and no admin endpoint → W1.11.
- **Audit retention.** The audit table has no retention policy → W1.10, W5.8.
- **Quote throttling.** `LiveVenue.quote()` is unthrottled (Jupiter on every call) → W1.9.
- **World snapshot.** The snapshot has no fsync and silently boots fresh → W2.8.
- **Positions after restart.** Positions are not rebuilt from durable fills after a restart → W2.8 and W3.4.

### B (EVM)

- **Dead alert rules.** `alerts.yml` rules reference metrics that nothing emits (`tx_failed_total`, `rpc_errors_total`) → W1.12.
- **New Pairs index.** `addExternalToken(status:'migrated')` never reaches the New Pairs index → W2.1.
- **Metadata fetches.** EVM tokenURI fetches must go through the SSRF guard and the sanitiser → W1.2.
- **Unknown security results.** GoPlus, honeypot.is and bytecode results must write nullable fields → W1.2.
- **Robinhood native price.** `robinhood.usd: null` → W3.4.
- **EVM fee ledger.** The EVM fee wallet has no ledger hook → W1.6.
- **Base pools.** Aerodrome (the largest Base DEX) is not in the venue list → W2.1 pool discovery and W3.6.

### C (EVM wiring, verification, paper-on-live)

- **No EVM real funds yet.** EVM real funds must stay off until W1.1, W1.2, W1.7 (EVM allow-lists) and W3.1 land.
- **Paper isolation.** Paper-on-live must meet the W1.15 criteria before merge.
- **Real-service verification.** C's one-off verification should become W1.13's nightly regression suite.

---

## 3. Shared-file protocol

- **Shared types.** `packages/shared/src/types.ts` is split in W0 into `types/{common,tokens,wallets,trading,account,live,ws}.ts`, re-exported by `index.ts`. Each wave opens with a 3-day additive contract PR run by a contract steward. Changes are additive only; a rename needs a deprecation alias.
- **`apps/server/src/app.ts`.** It becomes a list of Fastify plugins in W0. W1.9 owns the hooks, CORS and CSP; everyone else adds a plugin file.
- **`apps/server/src/context.ts`.** Interfaces only, and they change only through the contract PR.
- **Routes and Settings tabs.** `apps/web/src/App.tsx` moves to `apps/web/src/routes.tsx`, a table that grows by appending routes. `SettingsPage.tsx` gets a section registry; each tab is its own file.
- **Server module splits in W0:**
  - `sim/world.ts` → `world/{ledger,candles,tokens}.ts`
  - `trading/schemas.ts` → `schemas/{swap,orders,copy,sniper,alerts}.ts`
  - `analytics/tokens/index.ts` → `{search,lists,detail,trades}.ts`
- **`trading/execution.ts`.** W1.1 owns it in W1 and W3.1 owns it in W3. Other workstreams act only through the preflight hooks and submit options added in W0.
- **Migrations and API docs.** `store/sqlite.ts` MIGRATIONS is append-only, with migration-number ranges reserved per workstream at wave start. In `docs/API.md` each workstream appends its own section, and the doc/contract test from W4.9 enforces it.

### Real-service verification set

Confirm each address on an explorer before pinning it in fixtures.

| Chain | Tokens |
|---|---|
| sol | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; BONK `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`; WIF `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm`; PYUSD (Token-2022 with extensions) `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`; plus the latest pump.fun graduate and a LetsBonk token |
| base | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; BRETT `0x532f27101965dd16442E59d40670FaF5eBB142E4`; DEGEN `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed`; plus the latest Clanker and Zora tokens |
| bsc | USDT `0x55d398326f99059fF775485246999027B3197955`; CAKE `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82`; plus the latest four.meme and Flap tokens |
| eth | USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7` (blacklist function); USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (proxy, pausable); PEPE `0x6982508145454Ce325dDbE47a25d4ec3d2311933` |
| robinhood | Wrapped native, plus tokens taken from B's feed fixtures |

Real-funds checks use an ops-funded wallet capped at about $20 per chain.

---

## Wave 0 — Seams (1–2 engineers, about 1 week)

### W0.1 Contract and module seams (M)

- **Covers:** prerequisites for every wave; the section 2 checklist as tests.
- **Owns:** `packages/shared/src/types/*`, `apps/server/src/{app.ts,context.ts}`, `trading/{preflight.ts,triggers.ts,schemas/*}`, `sim/world/*`, `analytics/tokens/*` (the split), `store/` migration registry, `apps/web/src/{routes.tsx,copy/}`, Settings section registry.
- **Accept:**
  - The `MarketSource` additions exist, with sim no-ops: `ensureToken(chain|null, addr)`, `ensureWallet`, `priceOf(token) → {usd, at, source}`, `addPinSource`.
  - The Executor preflight chain `registerCheck(name, fn)` exists, and `submit(intent, {idempotencyKey, source, consentId, scope, attempt})` takes those options.
  - The trigger evaluation in `orders.ts` has been moved into `triggers.ts`.
  - There is zero behaviour change: all server, web and e2e suites pass, a pre-refactor snapshot still loads, and the bundle changes by no more than ±1%.
  - The section 2 checks run as tests: LRU vs pins, and migrated-at-import reaching the New Pairs index.

---

## Wave 1 — Real-money safety floor (go-live gate)

**Exit gate (all must hold):**
- Every W1 acceptance item passes.
- Canaries stay green for 7 days.
- Legal and counsel decisions are recorded in `COMPLIANCE.md`.
- The Turnkey policy review is done.
- An external pen-test of auth, custody and trade paths has been run (recommended).

**Sub-milestones:**
- 1a, trading safety: W1.1–1.6, 1.14, 1.15
- 1b, custody and identity: W1.7–1.9
- 1c, platform: W1.10–1.13

**Ordering inside the wave:**
- W1.2's tri-state contract lands before W1.1 finalises the gates.
- W1.6's ledger tables land before W1.3 and W1.4 write records.
- W1.12's per-chain `LiveStatus` lands before W1.14 builds its banners.

### W1.1 Server trade-safety gates and guardrails (M)

- **Covers:**
  - "Server-side hard/soft safety gates for manual trades and all automation"
  - "Real-money guardrail settings: per-chain confirm-above threshold and safety-gate minimum, enforced on the server"
  - "Confirmation policy and trading-safety settings…" (server part)
  - "One-click buys on lists have no confirm-above threshold or amount cap…" (server per-order cap)
  - "Native balance reservation and gas reserve for concurrent automated buys"
  - "Session and API hardening against account takeover…" → slippage, priority-fee and tip caps
  - "Live fee oracle and fee-tier model…" → auto-slippage clamp to 15% only
  - "Appendix B thresholds…" → shared table and server use
- **Owns:** `apps/server/src/trading/{gates.ts,preflight.ts,execution.ts,schemas/swap.ts}`, `packages/shared/src/thresholds.ts`, `apps/server/src/accounts/settings.ts` (trade-safety section).
- **Accept:**
  - **Hard gates.** These cases return `400 hard_gate` with reasons on `/api/trade/swap`: honeypot, buy+sell tax above 25%, a creator on the account blacklist, a rugged token (LP pull, or liquidity below $100), price impact above 15%, or safety below the user minimum. A manual trade passes only with `ack:{symbol, quoteId}`.
  - **Automation refusals.** Automation never passes a hard gate. This covers limit, migration, strategy, copy and sniper orders. Each refusal writes a filtered automation event and an inbox notification.
  - **Unknown security.** A token whose security is unknown (null) is a soft gate for manual trades, which need a typed confirmation. Automation refuses it unless the task opts in, and the opt-in defaults to off.
  - **Per-chain settings:**
    - `confirmAboveNative`: default is twice the quick amount.
    - `safetyGateMin`: default 40.
    - `maxOrderNative`.
    - `autoBuyOnPaste`: default off.
  - **Live caps.** Manual slippage is capped at 50% and auto slippage at 15%. Priority fee and tip have per-chain caps, and the schema rejects values above them.
  - **Native reservation.** With 3 concurrent 0.4 SOL buys against a 1.0 SOL wallet that has a gas reserve, exactly 2 fill. The third fails with `insufficient_balance`, which names the reserve.
  - **Thresholds.** A test asserts every Appendix B row.
- **Verify (real):**
  - On a Surfpool mainnet fork, a buy of a Token-2022 mint with a transfer fee above 25% is refused.
  - On a Base fork, a buy of a token that honeypot.is flags is refused, and a limit order on the same token is refused with a notification.

### W1.2 Token security truthfulness (M)

- **Covers:**
  - "Show unknown audit fields as unknown, and add the missing Solana and EVM checks"
  - "Unchecked security fields on live tokens default to 'safe' instead of unknown"
  - "Sanitise untrusted metadata for chain-ingested tokens" (server part)
  - "Full holder list and holder count…" → completeness flag and coverage rules only
- **Owns:** `analytics/tokens/security.ts`, `sim/world/tokens.ts` (`addExternalToken` defaults), `live/enrich/security.ts`, the EVM security module from B (fields only), `packages/shared/src/sanitize.ts` (moved from `live/enrich/sanitize.ts`), `web components/token/SecurityPanel.tsx`, `components/common/SecurityChecksList.tsx`.
- **Accept:**
  - **Tri-state fields.** `TokenSecurity` fields are tri-state (null means unknown), including taxes and wash. `addExternalToken` seeds null on every chain.
  - **Unknown never shows as safe.** The band reads `unknown` until the checks complete. A check that times out never yields `safe` (test).
  - **Completeness rules.** The holder checks count as known only when `holderDataComplete` is set.
  - **New check rows:**
    - EVM: blacklist function (−20), proxy/upgradeable, pausable, LP locked vs burned (with locker).
    - Solana: metadata mutable, plus the Token-2022 extensions transfer fee, transfer hook, permanent delegate, non-transferable and default-frozen.
  - **Sanitiser.** The sanitiser (plus NFKC) runs inside `addExternalToken` for every chain.
  - **Lookalikes and injected text.** Confusable and reserved-ticker names (USDC, SOL, ETH and WETH lookalikes) raise a safety reason. Instruction-like text is replaced with `[filtered]`.
- **Verify (real):**
  - PYUSD shows its Token-2022 extension rows.
  - ETH USDT shows the blacklist function.
  - Base USDC shows proxy and pausable.
  - A BSC honeypot from B's feed is flagged.
  - Blocking the GoPlus host makes the fields read unknown, not pass.

### W1.3 Order-engine durability and exit-plan semantics (M)

- **Covers:**
  - "Crash-safe, durable automation state with atomic order claim and per-order idempotency" (orders)
  - "Retry and outage policy for automated orders…" (orders)
  - "Exit-plan (bracket) model…" (server semantics)
- **Owns:** `trading/{orders.ts,service.ts,schemas/orders.ts}`, `store/orders.ts` (plus migrations).
- **Accept:**
  - **Durable state machine.** Orders move through `open→claimed→submitted(sig)→filled|failed|retrying`. Each transition is written to SQLite before the submit.
  - **Crash recovery.** A kill -9 between submit and confirm leads, on restart, to reconciliation by signature or transaction hash, never to a re-fire (fake-chain test).
  - **Idempotency.** The idempotency key `orderId:attempt` reaches the venue.
  - **Retry and failure classes.** A slippage or expiry failure gets one retry. Platform failures (`trading_unavailable`, rpc, signer, kill switch) keep the order armed. Errors use a code enum.
  - **Exit-plan legs.** The basis is `ofBuy` (default) or `ofHolding`. ΣTP and ΣSL are each validated at ≤100%. Up to 10 legs can mix tp, sl, trailing_tp and trailing_sl. Legs are scoped to the buy's filled quantity, never to tokens bought by hand.
  - **Exit plans on more orders.** `CreateOrderRequest` accepts a `strategy` for `limit_buy` and `migration_buy` orders.
  - **Notify on cancel.** Closing a position cancels its legs and sends a notification.
- **Verify (real):**
  - On mainnet with a tiny SOL amount, place a TP on a pump.fun token and kill the container during the sell. After restart there is exactly one sell signature on Solscan.
  - Run the same case on an anvil fork of Base.

### W1.4 Automation authority: consent, spend caps, copy/sniper durability (M)

- **Covers:**
  - the three "Automation consent…" gaps
  - "Copy-trade task model…" → daily spend cap and max concurrent positions
  - "Launch-sniper rule completeness…" → maxBuysPerDay, dailyBudget, cooldownSec and minSafety
  - "Copy execution records…" → the durable execution log
  - "Retry and outage policy…" → copy auto-pause classification
- **Owns:** `trading/{copytrade.ts,sniper.ts,consents.ts,schemas/{copy,sniper}.ts}`, `store/{consents,copy_executions}.ts`, `web components/account/{copytrade,sniper}/`, `components/account/settings/ConsentSection.tsx`, `pages/{CopyTradePage,SniperPage}.tsx`.
- **Shared:** the SettingsPage registry.
- **Accept:**
  - **Consent required.** Every automation needs a consent `{scope, executionMode real|paper, dailyCapNative, expiresAt ≤30d}`. Without one the call returns `403 automation_consent_required`.
  - **Daily cap.** Every automated fill decrements the cap atomically. Going over refuses the fill, pauses the task and notifies the user.
  - **Revoke and expiry.** Revoking a consent disarms its tasks within one tick. Expiry pauses the task and prompts the user to consent again.
  - **Traceability.** `consentId` appears on orders, receipts, fills and the audit log.
  - **Paper isolation.** A paper consent can never reach LiveVenue (test).
  - **Restart safety.** Copy inflight state and sniper pending state persist. The idempotency keys `copyTaskId:targetTx` and `sniperId:token` prevent double buys after a restart.
  - **Failure classes.** Platform failures do not count toward the copy auto-pause.
  - **Execution log.** `copy_execution` rows record success, failed (code) and filtered (rule hit).
- **Verify (real):**
  - Copy an active mainnet pump.fun wallet with a 0.01 SOL/day cap and confirm the cap stops further buys.
  - Run a Base-fork sniper with a dailyBudget.

### W1.5 Trigger integrity and price freshness (M)

- **Covers:** "Live price monitoring for tokens with open orders/positions…"
- **Owns:** `trading/triggers.ts`, `apps/server/src/live/prices/`. Price sources:
  - Solana: Jupiter Price (already in A).
  - EVM: KyberSwap quotes, falling back to Uniswap QuoterV2, PancakeSwap or Aerodrome pool reads.
- **Accept:**
  - **Polling.** Every token with an open order, position or alert has a price `{usd, at, source}`, polled at least every 5 s on all 5 chains.
  - **Crossing rule.** A trigger fires only on a crossing (`prev < trigger ≤ curr`) with a fresh price, confirmed by the pool mid within 2%.
  - **Wick guard.** A single outlier trade does not fire an SL (test).
  - **Staleness.** A stale price puts the order in the `price_stale` state and sends an alert.
- **Verify (real):**
  - Place an SL on DEGEN on Base, which is outside B's feed, and on a Raydium-only Solana token.
  - Check the update cadence and values against the pool state.

### W1.6 Chain-agnostic durable ledger (M)

- **Covers:**
  - "Fee ledger aggregation, fee-wallet reconciliation…" → ledger table
  - "REST conventions…" → cursor paging for fills and transfers
  - "Landing telemetry status panel…" → capture tier, latency and attempts, including failures
  - "Live portfolio valuation and durable PnL history" → durable equity and daily-PnL rows
- **Owns:** `store/ledger.ts`, the DurableStore interface (in the contract PR), `live/execution/fills.ts`, and the EVM fill writer hook in B's venue.
- **Accept:**
  - **Fills table.** Fills carry `{chain, venue, route, base units, fee lines (platform/network/priority/tip/gas/approval), attempts, latencyMs, tier, failureCode, consentId, scope, slot|block}`, for SOL and EVM alike. Failed transactions are recorded too.
  - **Fee rows.** Fee ledger rows carry `{fillId, chain, feeWallet, amount, usdAtFill, txHash, referralSplit}`.
  - **Paging.** `fillsFor` and `transfersFor` take a cursor.
  - **Equity rows.** Daily equity rows persist.

### W1.7 Custody, withdrawals and Turnkey policy (M)

- **Covers:**
  - "Turnkey policy-engine configuration (least-privilege signing)"
  - "Withdrawal limits, velocity checks and security-change holds"
  - "Private-key export policy…" → an explicit deny-export policy
  - "Formatter conformance…" → EIP-55 validation and exact, non-compact amounts in fund dialogs
- **Owns:** `apps/server/src/live/{signer/,wallets/withdrawals.ts}`, `deploy/turnkey/` (policy JSON), `apps/server/scripts/turnkey-provision.ts`, `docs/LIVE.md` §3, `apps/web/src/components/funds/`.
- **Accept:**
  - **Policies and scoping.** The policy set is checked in, with an idempotent provisioning script. Scoping is per user (sub-org, or a wallet tag).
  - **Trading API user.** Solana transactions may use only allow-listed programs: System, ComputeBudget, Token, Token-2022, ATA, pump, PumpSwap, Jupiter and Jito tip accounts. EVM transactions may only go `to` allow-listed routers, Permit2 and launchpads, or `approve` an allow-listed spender. Native transfers may go only to the fee wallet.
  - **Withdrawal API user.** It may send only to that user's whitelisted addresses.
  - **Deny export; root quorum.** Export is explicitly denied for all API users, and root actions need a 2-of-n quorum.
  - **Policy tests.** Tests run against Turnkey's evaluator.
  - **Withdrawal limits:**
    - a 24h USD cap per account and chain, tiered by account age, plus a per-transaction maximum;
    - a 24h hold after a password, 2FA or email change, or after a recovery code is used;
    - a delay on the first withdrawal, and review when a deposit is withdrawn without trading;
    - a platform hourly outflow breaker per chain that pauses withdrawals and pages ops;
    - a review queue.
  - **Visibility.** `SecurityStatus` shows the limits, the remaining allowance and `resetAt`. Over-limit requests fail with error `withdrawal_limit`.
  - **EVM input checks.** EVM addresses are validated by EIP-55 checksum, and amounts are shown exactly.
- **Verify (real), in a Turnkey sandbox org:**
  - A Jupiter swap signs.
  - A transfer to a random address is denied.
  - An EVM `approve` to a random spender is denied.
  - The breaker trips with tiny amounts on Base Sepolia.

### W1.8 Identity, recovery and security notifications (L)

- **Covers:**
  - "Account recovery: verified email, password reset and post-reset withdrawal lock"
  - "Email verification, account recovery, credential management and out-of-band security notifications"
  - "Session management…" (records, list, revoke, password)
  - "Money and security notification kinds, delivered out of band"
  - "Harden sessions against account takeover…" (step-up, new device, notional caps)
  - "Session and API hardening…" (step-up, new device, anomaly rules)
- **Owns:** `apps/server/src/accounts/{credentials.ts,security.ts,sessions.ts}`, `apps/server/src/notify/{email.ts,templates/}`, `web components/layout/AuthModal.tsx`, `components/account/settings/{AccountSection,SecuritySection}.tsx`.
- **Shared:** `accounts/service.ts`.
- **Accept:**
  - **Email.** Live sign-ups require a verified email, using a single-use, hashed, 24h link and a filter against disposable domains.
  - **Password reset.** `forgot` and `reset` use a 30-minute single-use token, require TOTP or a recovery code when 2FA is on, revoke all sessions and start a 24h withdrawal hold.
  - **Sessions:**
    - Records hold `{id, createdAt, lastSeenAt, ip, ua}`.
    - Endpoints: `GET/DELETE /api/sessions`, plus revoke-all, which also drops sockets.
  - **Step-up TOTP** is required for:
    - trades above the user's notional threshold;
    - a first buy where liquidity is below $X;
    - creating or editing an automation.
  - **New device.** A login from a new device sends an email and starts a 24h withdrawal hold.
  - **Anomaly rules.** Two patterns pause trading and notify the user:
    - putting X% or more of the balance into a token with fewer than N holders;
    - repeated max-slippage buys.
  - **Unmutable notifications.** The new `security` and `wallet_transfer` kinds are delivered in-app and by email, and cannot be muted: login, password, 2FA, email, whitelist, withdrawal requested/sent/failed, and large deposits.
- **Verify (real):**
  - Send through the real provider (Postmark or SES) and confirm SPF, DKIM and DMARC pass at mail-tester.
  - Run the reset flow end to end on staging.

### W1.9 Edge hardening and rate limits (M)

- **Covers:**
  - "Rate limits on quote, order, automation, search and read endpoints…"
  - "Rate limits per account and per IP on every endpoint"
  - "CSP, third-party requests and CORS hardening for live"
  - the cookie, CORS and WS Origin parts of "Session management…" and both session-hardening gaps
- **Owns:** `apps/server/src/app.ts` (hooks), `apps/server/src/ops/ratelimit.ts`, `apps/server/src/live/imageProxy.ts`, `apps/web/{index.html,public/fonts}`, `apps/web/src/lib/{api.ts,ws.ts}`, `store/session.ts`, and the `ws/hub.ts` Origin check.
- **Accept:**
  - **Rate limits.** A weighted token bucket per account and per IP covers every route class. Reads: 50/s per account, 100/s per IP. Orders: 5/s. Trades: 10/s. Plus quote, search and resolve.
  - **Quotes.** Quotes are cached for about 1.5 s per amount bucket, with a per-upstream quota guard (Jupiter, Kyber).
  - **Over-limit behaviour.** Over-limit requests get `429` with a retry-after header and increment `trenchscope_rate_limited_total`. WS subscribe churn is limited too.
  - **CORS and sessions.** CORS uses an allowlist from config. Live sessions use an httpOnly, Secure, SameSite=Strict cookie with CSRF protection. The WS checks Origin.
  - **CSP.** `img-src 'self' data: blob:` is served through `/api/img`, which applies the SSRF guard, a 2 MB cap and re-encoding. Fonts are self-hosted, `connect-src` is explicit, and violations go to a `report-to` endpoint.
  - **Header tests** pass in both modes.
- **Verify (real):**
  - Load-test the quote endpoint against real Jupiter; no upstream 429 reaches users.
  - Fetch real pump.fun IPFS images through the proxy.
  - Confirm `169.254.169.254` is blocked.

### W1.10 Compliance and legal (M)

- **Covers:**
  - "Regulatory posture and live-mode requirements missing from PRD/docs"
  - "Legal pages, versioned ToS/privacy acceptance and 18+ age gate for live accounts"
  - "Legal consent records, Terms/Privacy/Risk pages and the Settings About section"
  - "Geo-blocking of restricted jurisdictions and sanctions screening of addresses"
  - "Compliance and abuse guardrails for real money"
  - "Platform-wide restricted-asset list…" (promoted from P1, because of Robinhood Chain tokenized equities)
  - "Data retention schedule…" → the documented schedule
  - "Private-key export policy…" → disclosure
- **Owns:** `docs/COMPLIANCE.md` (new), `docs/PRD.md` (§2.2, §11.8, a new LV-xx section, Appendix F/G), `apps/server/src/compliance/{geo,sanctions,acceptances,denylist}.ts`, `apps/web/src/pages/legal/`, the Settings About section.
- **Shared:** `routes.tsx`, the register route.
- **Accept:**
  - **Recorded decisions.** `COMPLIANCE.md` records a decision and an owner for each of:
    - custody classification
    - KYC tiers
    - Travel Rule
    - sanctions
    - restricted jurisdictions
    - key export (none at launch)
    - retention
    - incident notification
  - **Acceptance records.** `Account.acceptances[{doc, version, acceptedAt, ip}]` plus an 18+ affirmation are stored and audited. A version bump makes trades and withdrawals return `403 tos_update_required`.
  - **Geo.** The country comes from `CF-IPCountry` (behind TRUST_PROXY) or GeoLite2. Restricted countries get `451 region_restricted` on register, login, quote, swap, order, automation, deposit reveal and withdraw. A withdraw-only exception is configurable. The country is recorded on audit rows.
  - **Sanctions screening.** Whitelist adds, withdrawal destinations and deposit senders are checked against the OFAC SDN digital-currency addresses (refreshed daily), and also against the Chainalysis oracle on EVM. A hit blocks the action, freezes the account and pages ops.
  - **Restricted-asset denylist.** Entries are `(chain, address|creator)`, with a reason and a scope. It is enforced in quote, swap, orders, copy, sniper and resolve, which return `403 asset_restricted`. Existing holders keep a sell-only path. Robinhood tokenized equities are denied by default.
  - **Legal pages.** `/legal/{terms,privacy,risk}` exist, along with the footer links and an About section.
- **Verify (real):**
  - Parse the live treasury.gov SDN file and confirm it yields addresses for several assets.
  - `eth_call` the Chainalysis oracle on ETH or Base for a listed address and get `true`.
  - Spoof the geo header through Caddy and confirm the block.

### W1.11 Ops console and kill switches (L)

- **Covers:**
  - "Admin/ops console with RBAC, kill switches and health views"
  - "Customer-support tooling…" → minimal 2FA reset (identity proof plus 48h hold), freeze, force-logout
- **Owns:** `apps/server/src/admin/`, `apps/web/src/pages/admin/` (separate entry and bundle), `store/staff.ts`.
- **Accept:**
  - **Staff identities.** Staff accounts are separate from users, with roles viewer, support, ops and admin, and mandatory TOTP or WebAuthn plus an IP allowlist.
  - **Kill switches.** Switches cover trading (global, per chain, per venue), withdrawals per chain, automations, read-only mode and per-chain real-funds flags. They persist, are published in `LiveStatus` within 2 s, and are enforced as a preflight check.
  - **Tools:**
    - user lookup by username, wallet or tx
    - audit viewer
    - hot-wallet balances
    - feed, RPC and signer health
    - withdrawal review queue
    - append-only staff audit trail
- **Verify (real):**
  - Pause Base while a limit order is armed on a Base fork. The order is held, with the platform failure class, and fires after unpause.

### W1.12 Money-path observability and CI security (M)

- **Covers:**
  - "Monitoring, alerting and paging for the money path (beyond /metrics)"
  - "Trading and money-flow observability"
  - "Supply-chain and secret scanning in CI" (promoted from P1)
  - "Performance budget verification and live latency SLOs" → live SLO histograms
  - per-chain `LiveStatus` (for W1.14)
- **Owns:** `apps/server/src/ops/`, `deploy/{prometheus,alertmanager}/`, `.github/workflows/security.yml`, `renovate.json`, `apps/web/src/lib/telemetry.ts`, `apps/server/scripts/canary.ts`.
- **Accept:**
  - **Metrics:**
    - tx sent, landed and failed, by chain, venue and reason
    - rpc errors
    - quote latency per aggregator
    - signer latency
    - histograms for order trigger→fire, feed→client and submit→landed
    - deposit-scanner lag
    - withdrawal queue age
    - ledger-vs-chain drift
    - hot-wallet and gas balances
  - **No dead alerts.** A test asserts that every `alerts.yml` metric name is registered. Alertmanager routes to a pager.
  - **Logging and client telemetry.** A no-console lint rule applies on the server and all logging goes through the redacting logger. A first-party `/api/telemetry` endpoint takes client errors and web vitals.
  - **Canary.** A canary does a tiny buy and sell per chain every 30 minutes.
  - **CI security.** The pipeline runs osv-scanner, CodeQL or semgrep, gitleaks, a syft SBOM and trivy. Renovate uses `minimumReleaseAge` and exact pins for chain SDKs. Any high-severity finding blocks the build.
- **Verify (real):**
  - Run the $1 canary on each mainnet.
  - Break the RPC URL and confirm the alert reaches the pager within 5 minutes.

### W1.13 Live verification harness (L)

- **Covers:** "Live-mode test harness: chain forks, recorded feeds, live E2E"
- **Owns:** `apps/server/test/{live/,fixtures/evm/}`, `apps/web/e2e/live/`, `apps/web/playwright.config.ts` (live project), `.github/workflows/nightly.yml`.
- **Accept:**
  - **Solana fork.** Surfpool or LiteSVM, with the pump, PumpSwap and Jupiter programs cloned.
  - **EVM forks.** Anvil forks of Base, BSC, ETH and Robinhood, pinned to fixed blocks. They cover four.meme, Flap, Clanker, Zora, Uniswap v2, v3 and v4 and KyberSwap, plus approvals and nonce replacement.
  - **Recorded logs.** EVM logs are replayed into `LiveMarket`.
  - **Live Playwright flow:** register → verify email → 2FA → deposit (fork) → buy → TP fires → sell → withdraw after the whitelist delay.
  - **Nightly** runs the whole suite.

### W1.14 Trade-UI safety, live copy and brand (web) (M)

- **Covers:**
  - "One-click buys on lists have no confirm-above threshold or amount cap…" (web)
  - "Confirmation policy…" (typed confirmations, settings UI)
  - "Real-money safety gate and full cost breakdown…" → always-visible safety line and typed hard gate
  - "Replace simulator and paper wording on the token page…"
  - "Live copy and onboarding pass for account surfaces"
  - "Mode-aware copy and string externalisation…" → live/demo/chain catalogue and key-flow test
  - "Command palette: actions missing and copy is demo-only" (copy)
  - "Brand rule: style-title grid and badge labels use GMGN's English names…"
  - "Live: the web ignores meta.enabledChains, and discovery pages do not show upstream feed health" (promoted)
  - "Responsive and PWA…" → stale-data trading lock
  - "Sanitise untrusted metadata…" (web: interstitial, nofollow, bidi)
  - "Live: wallet page… 404…" (copy only)
- **Owns:** `apps/web/src/components/{trade/,token/trade/,common/links.tsx,share/render.ts}`, `components/layout/{CommandPalette,tour.ts,StatusBar,ChainSwitcher}`, `apps/web/src/copy/`, `public/manifest.webmanifest`, `components/account/settings/TradingSettings.tsx`, `components/wallet/StyleBits.tsx`, `apps/server/src/analytics/wallets/metrics.ts` (names only).
- **Accept:**
  - **Quick-buy limits.** QuickBuyAmount has a per-chain max. Confirmation is required when the amount exceeds confirm-above, safety is below the gate, or the safety state is unknown. The Trenches `B` hotkey obeys the same rules.
  - **Typed confirmations.** A hard gate requires typing the SYMBOL, and the ack is sent to the server. A price impact above 15% also needs a typed confirmation.
  - **Safety line.** The panel always shows the safety score and its top 3 reasons.
  - **Copy test.** A test renders the key flows in live mode for each of the 5 chains. It asserts:
    - no `/paper|simulat|faucet/i`;
    - no other chain's name;
    - "Deposit", not "Top up".
  - **Brand names.** `STYLE_GRID` uses the PRD §8.4.3 names, plus "Flash" and "Low sample". A grep test blocks GMGN's titles from user strings.
  - **Chain gating.** `enabledChains` gates the switcher, ChainGuard, the palette and search scope. Each chain shows a feed-health banner with the last event's age.
  - **Stale-data lock.** Trade buttons are disabled, with a reason, when the WS has been closed for more than 5 s or the token price is stale.
  - **External links.** They go through an interstitial with `rel="noopener noreferrer nofollow"`, and names are wrapped in `<bdi>`.
  - **Live onboarding checklist.** It runs email → 2FA → deposit → risk ack → first trade. The tour includes Robinhood Chain.
- **Verify (real):**
  - On live staging, block the PumpPortal host. The banner and the trade lock appear within 10 s.

### W1.15 Paper-on-live isolation and rewards honesty (C's acceptance) (M)

- **Covers:**
  - "Paper mode on live data: ledger isolation requirements not covered by the plan"
  - "Paper-on-live segregation across account features…"
  - "Live rewards: real fee rebates…" → hide money figures in live
  - "Referral rebate and cashback payouts…" → stop showing unpaid liabilities
- **Owns:** `apps/server/src/trading/paper/` (PaperVenue and ledger), `accounts/rewards.ts`, live gating in `pages/RewardsPage.tsx`, paper badges in `components/account/portfolio/`.
- **Accept:**
  - **No World mutation.** A paper fill is quote-only against live reserves. After 100 paper fills the World event, candle and holder counts are unchanged (test).
  - **Paper accounts.** Paper balances are separate per chain, with their own faucet and reset.
  - **Exclusions.** Paper activity never reaches analytics, feeds, leaderboards, copy targets or rewards.
  - **Scope field.** `scope: real|paper` appears on receipts, orders, notifications and share snapshots, shown with PAPER badges. The portfolio has a Real | Paper toggle.
  - **Pinning.** Paper positions are pinned against eviction.
  - **Rewards in live.** The page shows points only, and only real-fee trades earn them.

---

## Wave 2 — Live data truth on all five chains

**Exit gate:** on the verification set, the figures fall within the tolerances below compared with explorers and GeckoTerminal, and a 24h mainnet soak stays inside the memory budget.

### W2.1 Universal resolver and pinning (L)

- **Covers:**
  - "Live: no on-demand lookup for tokens the server is not already tracking…"
  - "Open any token address on demand (all 5 chains)…"
  - "Trade any token by address in live mode…"
  - "Search and on-demand resolution of any contract or wallet address on any chain"
  - "Live: wallet page, follow, import and wallet channel 404…" (server)
  - "Live: watchlist, alerts and follows need entities already in the World…"
  - "Live: watchlisted tokens are dropped by LRU eviction…" (server)
  - "New Pairs has no recency window…" → migrated-at-import index
  - "Support several pools, non-native quote tokens and CLMM pools…" → `PoolInfo[]` contract and pool discovery
  - "Follows…" → bulk import endpoint
- **Owns:** `apps/server/src/live/resolve/`, `live/market.ts` (ensure and pins), `analytics/tokens/{routes.ts,search.ts}`, `analytics/wallets/routes.ts`, `trading/alerts.ts` (ensure only), `web components/layout/Omnibox.tsx` (`resolveAddress`), `components/token/PageStates.tsx`.
- **Shared:** `accounts/service.ts` (watchlist, follow).
- **Accept:**
  - **Resolve endpoint.** `GET /api/resolve/:address` returns `{kind, hits[]}`:
    - base58 addresses are classified as mint (SPL or Token-2022) vs wallet;
    - `0x` addresses get parallel `eth_getCode` and ERC-20 metadata calls on base, robinhood, bsc and eth, preferring the active chain;
    - p95 ≤1.5 s, cached and rate-limited.
  - **Import.** A resolved token gets sanitised metadata, decimals, supply, its curve or main pool by depth, a security check and a trade stream, and triggers a W2.2 backfill.
  - **`PoolInfo[]` contract.** `PoolInfo[]` carries `{quote, kind, depth}` and covers Uniswap v2, v3 and v4, Aerodrome, PancakeSwap, PumpSwap and Raydium.
  - **Ensure before 404.** These all call ensure before returning 404: `tokenOf`, quote, swap, orders, watchlist, alerts, follow and copy target.
  - **Pin sources.** Positions, orders, alerts, watchlist and paper positions are pin sources. With an LRU cap of 10, a pinned token is never evicted (test).
  - **Watchlist placeholders.** `watchlistView` returns placeholder rows marked `resyncing` or `not_found`.
  - **New Pairs.** A token imported as already migrated is indexed into New Pairs immediately.
  - **Bulk follow.** A bulk follow endpoint takes 2,000 rows of any chain-valid address.
  - **No chain guessing.** The Omnibox no longer guesses `bsc`; an ambiguous `0x` address shows a chain picker.
- **Verify (real):** resolve every address in the verification set, plus a random EOA and the Uniswap router (a contract that is not ERC-20). Each gets the correct kind and chain.

### W2.2 Token history backfill and durable candles (L)

- **Covers:**
  - "Load past candles and stats for live tokens, page the chart backwards, fill empty buckets"
  - "Price/candle/stats backfill for tokens discovered mid-life"
  - "Durable, fail-closed persistence for live state" → restart backfill window
- **Owns:** `apps/server/src/live/history/`, `sim/world/candles.ts`, `analytics/tokens/stats.ts`, the candles route, `store/candles.ts`, `web components/token/PriceChart.tsx` (left paging only), `lib/api.ts candles(before)`.
- **Accept:**
  - **Backfill on first view.** On first track or page view, the backfill loads at least 24h of 1m candles and 30d of 1h and 1d candles. Sources:
    - primary: own on-chain logs (`eth_getLogs`, and Solana signatures plus parsing);
    - fallback: a licensed OHLC provider.
  - **Stats.** Window stats are flagged `partial` or `n/a` when a window started before tracking did.
  - **Paging and gaps.** The candles route takes `before`, and the chart pages left. Empty buckets carry the previous close forward.
  - **Durability.** Candles are durable in SQLite. After a restart, the backfill covers the downtime for tracked tokens and positions.
  - **Provenance.** The chart shows a provenance badge.
- **Verify (real), for BONK, WIF, BRETT, DEGEN, PEPE and CAKE, against GeckoTerminal:**
  - 24h volume within ±10%.
  - 24h change within ±2pp.
  - The last 48 1h OHLC bars within 1%.
  - ATH matches.

### W2.3 Transfers, burns and cost basis (L)

- **Covers:**
  - "Ingest token transfers and burns; compute real circulating supply"
  - "Live: token transfers are not ingested, so cost basis…"
  - "PnL and holder conformance vectors (Appendix C TV1-TV10, Appendix D TV-H1)"
  - "Cross-chain USD portfolio…" → AN-62/63 basis rules and the spam/airdrop flag
- **Owns:** `apps/server/src/live/transfers/`, `sim/world/ledger.ts`, `analytics/wallets/tracker.ts` (transfer rows), `apps/server/test/{pnl-vectors,holders-tvh1}.test.ts`.
- **Accept:**
  - **Ingestion.** SPL, Token-2022 and ERC-20 Transfer and Burn events are ingested for tracked tokens and watched or user wallets. They are excluded from volume.
  - **Contract additions:**
    - `Trade.kind` transfer/burn
    - EarlyBuyerStatus `transferred`
    - `basisIncomplete`, `nonTradePosition`, `realizedNative`, `capitalRoi`
    - `addrType` values burn, contract, locker and cex
  - **Basis rules.** A transfer-in is booked at FMV, or flagged `received`. Received sells are excluded from win rate and smart scoring.
  - **Supply.** `circulatingSupply` = total − burn, dead and locked balances. MC and MCap candles use it.
  - **Vectors.** All Appendix C and D vectors pass in CI.
- **Verify (real):**
  - Take a pump.fun token whose dev split the bag across wallets (checked on Solscan); the holders reflect the transfers.
  - A Base token with dead-address burns matches `totalSupply − balanceOf(0x…dEaD)`.

### W2.4 Holders and liquidity truth (L)

- **Covers:**
  - "Full holder list and holder count for live tokens (EVM included)…" (data)
  - "Ingest liquidity add/remove, detect rugs, show Dead/Rugged banners…" (events, status, banners)
- **Owns:** `apps/server/src/live/{holders/,liquidity/}`. Holder sources:
  - Solana: `getTokenLargestAccounts`, plus Helius DAS or an indexer for counts.
  - EVM: Transfer-log replay or an indexer.

  Liquidity events cover v2 Mint/Burn, v3 Mint/Burn, v4 ModifyLiquidity and PumpSwap/Raydium add/remove. Also owns `TokenStatus 'rugged'` and the banners in `web pages/TokenPage.tsx`.
- **Accept:**
  - **Accuracy.** holderCount within ±1%, and top10 and top100 within ±0.5pp, of the explorer. `holderDataComplete` is set.
  - **Rug detection.** An LP pull above 90% sets `rugged`, stores the evidence tx and sets rugRisk to 1, which W1.1 turns into a hard gate.
  - **Dead banner** rule is implemented.
- **Verify (real):**
  - Compare holder counts for BONK, a fresh pump.fun token and BRETT with Solscan and Basescan.
  - Replay a historical v2 `removeLiquidity` rug on a fork at that block; the token becomes `rugged`.

### W2.5 Wallet identity and creator history (M)

- **Covers:**
  - "Look up each wallet's funding source, true age and smart-money labels in live mode" (funding and age)
  - "Live: wallet identity enrichment (age, first funder, fund amount, native balance)…"
  - "Load each creator's past launches so the dev record and rug history are not falsely clean"
  - "Creator/dev history backfill for sniper dev filters in live mode"
- **Owns:** `apps/server/src/live/{enrich/wallets.ts,creators/}`, `analytics/tokens/track.ts` (dev history), and `fundedBy {address, at}` in the contract.
- **Accept:**
  - **Funding and age.** First funder and wallet age are looked up for any wallet that hits the leaderboard, a feed, the holders list or a page view. Lookups are cached and rate-limited.
  - **Unknown values.** Missing data renders as "Unknown", never epoch 0. The fresh tag works.
  - **Native balance** refreshes periodically.
  - **Creator backfill.** Past launches are backfilled from pump.fun creates by creator, and from four.meme, Flap, Clanker and Zora factory events by deployer. Each comes with status and peak MC.
  - **Partial flag.** History shows a `partial` flag until the backfill finishes, and the sniper uses this history.
- **Verify (real):**
  - Take a pump.fun deployer with more than 20 creates: the created count matches the explorer.
  - Take a wallet first active in 2021: its age matches its first tx.

### W2.6 Wallet-centric swap ingestion (L)

- **Covers:**
  - "Copy trade in live: per-wallet activity stream across all venues and chains; copy any real wallet"
  - "Live: wallet-centric trade ingestion for followed, copy-target and tagged wallets across all venues"
- **Owns:** `apps/server/src/live/watch/` (Solana: account subscriptions via Helius/Yellowstone with generic decoding of token-balance deltas; EVM: `tx.from` attribution, including aggregator routers). Also the `copySell` share in `trading/copytrade.ts`, sequenced after W1.4.
- **Accept:**
  - **Coverage and latency.** Every swap by a watched wallet (copy targets, follows, smart and KOL tags) on any venue is booked: within 2 s on Solana, within 1 block on EVM. Venues include Jupiter, Raydium, Meteora, Orca, Kyber, 1inch, 0x and the Universal Router.
  - **Sell share.** The copy sell share uses the target's on-chain pre-balance.
  - **Pinning.** Watched holdings are pinned.
- **Verify (real):**
  - Over 1 hour, a Jupiter-heavy Solana wallet and a KyberSwap user on Base show recall of at least 98% against the explorer, with zero false trades.

### W2.7 Wallet intelligence: backfill, labels, classification, live signal sources (L)

- **Covers:**
  - "Live: wallet history backfill and smart-money discovery pipeline"
  - "Wallet classification rules are simulator-calibrated…"
  - "Live: KOL and entity labels for all five chains…"
  - "Global wallet tags missing…" (the P0 tags bundler, insider and dev)
  - "Live: several signal kinds have no live source…"
  - "Ground-truth validation job (AN-80)…" → live outcome tracker and calibration
- **Owns:** `apps/server/src/live/{history/wallets.ts,labels/}`, `data/labels/<chain>.json`, `analytics/wallets/{index.ts,metrics.ts}` (classification), `signals.ts` (cohort source only), `apps/server/scripts/calibrate.ts`.
- **Accept:**
  - **PRD rules.** The §8.4.1 rules run as per-chain config, with `tagRank` on rows and profiles, a daily 00:05 recompute and 2-day hysteresis.
  - **P0 tags.** bundler, insider and dev are computed as global tags.
  - **Entity labels.** Labels cover KOL, CEX, bridge, router, MEV and launchpad, with an admin endpoint. `isPublicEntity` uses them, so CEX funding is not treated as an insider link.
  - **Signal sources.** Signals use analytics cohorts. Kinds without a live source (`kol_call`, `cto`, `boost`, `live`) are hidden in live mode.
  - **Discovery job.** It backfills at least 30d for seeded candidates. The leaderboard is non-empty within 24h of a fresh deploy.
  - **Outcome tracking and calibration.** An outcome tracker records rug, LP pull or a 90% drop within 24h, and a calibration report is produced.
- **Verify (real):**
  - After 24h, the sol and base leaderboards have at least 100 rows.
  - The 30d PnL of 10 smart wallets is within ±10% of a manual reconstruction.
  - Wallets funded from known Binance and Coinbase hot wallets are not insider-linked.

### W2.8 Live state scale, durability and user-channel reliability (M)

- **Covers:**
  - "Live: wallet analytics memory, eviction and persistence at real-chain volumes" (promoted)
  - "Durable, fail-closed persistence for live state" (fsync, fail-closed, kill test)
  - "User-channel delivery guarantees and resync after reconnect"
  - "Per-browser socket sharing…" → a per-account socket cap and a per-IP connect-rate limit
- **Owns:** `apps/server/src/persistence.ts`, `analytics/wallets/trackstore.ts` (hot/cold behind an interface; `index.ts` is shared with W2.7), `ws/hub.ts`, `web lib/ws.ts`, `hooks/useUserChannel.ts`.
- **Accept:**
  - **Memory soak.** Replaying 10× recorded traffic (pump.fun plus 4 EVM chains) for 24h stays under budget (for example 2.5 GB), with per-chain memory metrics.
  - **Snapshot durability.** The World snapshot fsyncs the file and its directory. Live mode refuses to boot on an incompatible snapshot, and a kill -9 test covers it.
  - **User-channel delivery.** Events carry a per-account seq. A 60 s ring buffer is replayed on `sub{sinceSeq}`, or the client gets a forced resync.
  - **Reconnect.** On every reconnect epoch the client invalidates orders, portfolio, positions and notifications. Pong returns `{t, serverT}`.
  - **Socket limits.** Sockets are capped per account, and new connections are limited by a per-IP connect rate instead of 20 sockets per IP.
- **Verify (real):**
  - Drop the network for 30 s during a mainnet TP fill. The fill and its notification appear right after reconnect.

---

## Wave 3 — Trade like GMGN on all five chains

**Exit gate:**
- Per chain, 10 tiny round-trips per route, each with total cost within ±25% of the preview and minOut respected.
- 24h copy and sniper runs on mainnet under caps.
- Robinhood funded through the product flow.

### W3.1 Execution contract, fee oracle and EVM trade UX (L)

- **Covers:**
  - "Quote and receipt contract for real execution…"
  - "Live fee oracle and fee-tier model for presets…"
  - "EVM settings and approval step in the token trade panel…"
  - "Real-money safety gate and full cost breakdown…" (cost lines, insufficient-balance CTA, position mini on both sides)
  - "Landing telemetry status panel…" → ETA per tier from the W1.6 data
- **Owns:** `trading/execution.ts` (quote and receipt), `apps/server/src/live/fees/` (FeeOracle), preset tiers in `accounts/settings.ts`, `web components/token/trade/{PresetBar,QuotePreview,MarketForm,AmountFields}`.
- **Accept:**
  - **Quote fields.** A quote carries `{quoteId, expiresAt (5 s or a 0.5% move), etaMs p50/p90, priority/tip/gas/approval lines, totalCostPct (red above 5%), safety}`.
  - **Expiry.** A stale `quoteId` returns `409 quote_expired`.
  - **Receipts** carry slot or block, attempts, fee lines and a TE-84 error code.
  - **Fee tiers.** Tiers are eco, std, turbo, auto and custom, resolved at submit time from:
    - Solana prioritization fees plus the Jito tip floor;
    - EVM `eth_feeHistory`, plus the L1 data fee on Base and Robinhood.
  - **Preset behaviour.** The TE-23 warnings appear, slots can be renamed, and default sells are 25/50/75/100.
  - **EVM presets and approvals.** EVM presets are in gwei. Anti-MEV means private RPC with no tip. The approval step shows its own cost and a pending state, and the panel shows nonce replaced/dropped status.
- **Verify (real):**
  - 10 tiny swaps per chain: realised fees within ±25% of the preview total.
  - The ETA p50 matches measured landing.

### W3.2 Orders lifecycle, exit-plan UI and paste-CA Quick Trade (M)

- **Covers:**
  - "Order book contract and lifecycle details (upsert, limits, % triggers, timeline, notifications, bulk cancel)"
  - "Limit orders by '% from now'; attach TP/SL to Market and Limit buys"
  - "Pasting a CA does not open a Quick Trade card (it only navigates)"
- **Owns:** lifecycle extras and the bulk-cancel route in `trading/orders.ts`, `web components/token/trade/{LimitForm,MarketForm}`, `components/trade/{StrategyEditor,QuickTradeCard}.tsx`, `components/token/tabs/OrdersTab.tsx`, `components/account/portfolio/OrdersTable.tsx`.
- **Shared:** the paste hook in `Omnibox.tsx`, which W4.3 builds on later.
- **Accept:**
  - **Upsert.** Re-submitting an identical `(token, kind, dir, trigger)` returns `isUpdate:true`.
  - **Order limits.** The 51st open order on a chain returns 409.
  - **% trigger and TTL.** A '% from now' trigger snapshots its base price. The TTL defaults to 7 days.
  - **Timeline.** `Order.events` records the timeline.
  - **Notifications** go out on expiry and on auto-cancel.
  - **One per token.** At most one dev-sell and one migration task per token.
  - **Bulk cancel.** `DELETE /api/orders?chain&token`.
  - **Orders tab.** It groups legs by `groupId` and shows the distance to trigger.
  - **Paste-CA.** Pasting any CA on any chain opens a QuickTradeCard with a header, presets and a full-page link. A wallet address goes to the wallet page.
- **Verify (real):** pasting USDC, BONK, BRETT, CAKE, PEPE and a Robinhood token opens the card in under 1.5 s.

### W3.3 Copy-trade and sniper parity (M)

- **Covers:**
  - "Copy-trade task model…" (modes, filters, exit plan on average cost, task limit)
  - "Copy execution records, task detail drawer and per-task PnL" (UI and rollups)
  - "Launch-sniper rule completeness…" (dev filters, skip rules, slot- or block-based evaluation)
- **Owns:** `trading/{copytrade.ts,sniper.ts,schemas/{copy,sniper}.ts}`, `web components/account/{copytrade,sniper}/`.
- **Accept:**
  - **Copy modes and filters.** Max-capped mode. Filters: age, launchpad, min safety, re-buy count, target size in USD, dev-is-target and burnt-LP %.
  - **Exit plan on average cost.** Turning it on disables mirroring.
  - **Task drawer.** Tabs Positions, Copied, Failed, Skipped and Settings, with realised and unrealised PnL per task, drift, and a paused banner with the reason.
  - **Sniper rules.** maxDevBuyPct, devGraduationRate, maxDevLaunches and a dev blacklist that includes the account blacklist. It skips when the dev sold 20% or more within 60 s, or the curve filled in under 60 s. Evaluation happens at creation plus N slots or blocks.
- **Verify (real):**
  - 24h $1-cap copy of a mainnet wallet: the Skipped rule hits match its trades.
  - A Solana sniper run with 0.005 SOL buys.

### W3.4 Portfolio across five chains and funding (L)

- **Covers:**
  - "Cross-chain USD portfolio over real on-chain holdings"
  - "Live portfolio valuation and durable PnL history"
  - "Funding UX: card on-ramp links, cross-chain bridging and Robinhood Chain funding" (promoted: Robinhood is a must-have chain)
  - "Missing realtime channels…" → `tickers:<chain>`
- **Owns:** `trading/{portfolio.ts,tickers.ts}`, `apps/server/src/live/funding/` (bridge aggregator), `web pages/PortfolioPage.tsx`, `components/account/portfolio/`, `components/funds/` (network picker).
- **Accept:**
  - **Valuation.** Holdings come from on-chain balances on all 5 chains, priced by World, then a quote, then the pool. Anything still unpriced shows `unpriced`, never $0.
  - **Robinhood native USD** comes from an ETH/USD pool or oracle.
  - **Portfolio features.** A spam/airdrop hide toggle, durable equity rows from W1.6, and an "All chains" total in USD.
  - **Tickers channel.** `tickers:<chain>` pushes at most once per second, for up to 200 addresses. It replaces the 5–15 s polls in portfolio, dock, instant trade and watchlist.
  - **On-ramp.** Third-party on-ramp deep links, gated by geo.
  - **Bridge.** Bridging uses Relay or LI.FI, whichever supports Robinhood Chain; if neither does, the canonical-bridge deep link. Transactions are signed by the embedded wallet under the updated signer allow-list.
  - **EVM network UX.** A wrong-network warning, plus WSOL and WETH unwrap.
- **Verify (real):**
  - Deposit USDC on Base.
  - Bridge $5 of ETH from Base to Robinhood; it is valued correctly.
  - Reconcile 3 accounts against explorers.

### W3.5 Notifications, alerts and delivery pipeline (L)

- **Covers:**
  - "Notification preference matrix, quiet hours and a Settings → Notifications section"
  - "Notification centre model and delivery pipeline (§9.5)…"
  - "Alert rule engine vs §9.4…"
- **Owns:** `apps/server/src/notify/dispatcher.ts` (built on W1.8), `trading/alerts.ts`, `web components/account/alerts/`, `components/layout/{NotificationsBell,notifications.ts}`, `pages/AlertsPage.tsx`, the Settings Notifications section.
- **Shared:** `notify()` in `accounts/service.ts`.
- **Accept:**
  - **Notification model.** `AppNotification` carries `{category, severity, source, groupKey, dedupKey, payload, archivedAt, scope}`.
  - **Durable inbox.** Kept 30 days, fills 90 days. It supports archive, chain and token filters, and ×N grouping within 5 minutes.
  - **Rate limits and digest.** Per-channel rate limits, with overflow folded into a 5-minute digest. A rule is auto-paused above 200 hits per hour.
  - **Delivery preferences.** A category × channel matrix, quiet hours and `mutedUntil`. Security and money notifications are forced on.
  - **Alert rules.** Each rule has:
    - channels, cooldownSec, expiresAt, triggerCount and 24h hits;
    - pct up/down against a stored base value;
    - 0.5% hysteresis;
    - a confirm prompt when the condition is already true at creation;
    - a cap of 100 per user and 20 per token.
  - **Wallet alerts** filter by event, min/max USD and MC, and coalesce within 30 s.
- **Verify (real):** a 24h price alert on BONK fires exactly once per crossing of the hysteresis band, compared with the candles.

### W3.6 Venue and market-universe coverage (promoted P1) (L)

- **Covers:**
  - "Live Solana discovery only covers pump.fun and PumpSwap"
  - "Trending/discovery of established (non-launchpad) tokens on each chain"
- **Owns:** `apps/server/src/live/feed/solana/` (LetsBonk/LaunchLab, Meteora DBC, Raydium AMM/CPMM/CLMM, Meteora DAMM/DLMM, Orca), `apps/server/src/live/universe/`, `LIVE_LAUNCHPADS` and `LIVE_DEXES` in `packages/shared/src/chains.ts`.
- **Accept:**
  - **Launchpads.** The launchpad filter includes bonk, meteora-dbc (Bags, Believe, Jup Studio) and launchlab.
  - **New Pairs.** Migrations and pool opens feed New Pairs.
  - **Seed universe.** A per-chain seed universe, refreshed at least every 5 minutes, covers EVM Aerodrome and PancakeSwap pools, and each token added is backfilled through W2.2.
  - **Trending overlap.** Trending top-50 by 24h volume overlaps GeckoTerminal's top-50 by at least 80%, excluding stables.
- **Verify (real):**
  - 1h of LetsBonk launches matches the program-log count.
  - Trending compared with GeckoTerminal for each chain.

---

## Wave 4 — Analytics and UI parity (remaining P0)

**Exit gate:**
- Every PRD §13.1 P0 item is green and Appendix F is updated.
- axe reports 0 critical issues on every route.
- E2E blocks merges.

**Accessibility within the wave:**
- Each W4 workstream carries its own a11y criteria: row roles, glyphs and text alternatives.
- W4.9 owns the axe gate.

### W4.1 Trenches (L)

- **Covers:**
  - "Trenches hotkeys: Mode A/B row buys, number watermarks, P pause-all and X/V previews are missing"
  - "Trenches header: no per-column quick-buy amount or preset…"
  - "Trenches card: fees, dev record, copycat count and Rug chip are missing…"
  - "Trenches columns: column threshold differs from spec…"
  - "Filter drawer: missing contract fields, saved presets, import/export…"
  - "Watchlist star is missing…" (cards)
  - "Discovery view state…" (Trenches)
- **Owns:** `web pages/TrenchesPage.tsx`, `components/discovery/{TrenchesColumn,TokenCard,TokenBadges,FilterPanel,filters.ts,QuickBuyAmount,HotkeysHint}`, `analytics/filters.ts`, `analytics/tokens/{lists.ts,channels.ts}`.
- **Accept:**
  - **Columns.** New → Near graduation at 0.60, back only below 0.50 (oscillation test). Sorting is server-side over the full set. Default 60 rows, max 100.
  - **Per-column quick buy.** Amount and preset per column per chain, stored on the account. Defaults: sol 0.5, bsc 0.1, and 0.02 for EVM chains.
  - **Header controls:**
    - Safe / Smart / Strict chips
    - display menu
    - Thresholds button
    - Pause all and `P`
    - clickable "N new" flush
  - **Card fields:**
    - fees (unknown shows as "—")
    - D grad/created chip with a last-5 tooltip
    - ⧉ copycat count
    - Rug chip
    - Dev+ badge
    - a configurable stats window
  - **Editable thresholds.** Fresh and Rug can be edited.
  - **Filters.** The new filters are in place, with up to 5 keywords and a window select. Audit has separate toggles. Presets are named, account-synced (up to 10 per chain) and support JSON export/import.
  - **Hotkey modes.** Mode A and Mode B with watermarks, opt-in and obeying confirm-above. X and V previews come from stored metadata only, with no server fetch.
  - **URL state.** `?preset=&density=&tab=`.
- **Verify (real):** over 1h of live staging, column changes per token never exceed the number of hysteresis-band crossings.

### W4.2 Trending, New Pairs, heat and URL state (M)

- **Covers:**
  - "Trending tabs are missing… no visit or search telemetry exists"
  - "Trending table: missing columns, column chooser and live-row behaviours"
  - "Heat score is a log-blend hot level (0–5), not the §8.10 0–100 percentile heat"
  - "New Pairs has no recency window…" (UI and query)
  - "Discovery view state is kept in localStorage, not the URL"
  - "Watchlist star…" (rows)
- **Owns:** `web pages/{TrendingPage,NewPairsPage,NarrativesPage}.tsx` (URL only for Narratives), `components/ui/DataTable.tsx` (chooser, FLIP, virtualisation, aria-rowcount), `analytics/tokens/{scores.ts,visits.ts}`.
- **Accept:**
  - **Heat score.** Percentile heat 0–100 per chain and window, shown on TokenSummary and sortable.
  - **Visit telemetry.** Debounced per viewer and decayed, with a hot-searches endpoint and channel.
  - **Tabs.** Trending, Hot searches, Surging and New, selected by `?tab=`.
  - **Columns:**
    - Age, Net buy, ATH MC and Heat
    - full audit chips and icons
    - a chooser, and safety as a sort key
  - **Live-row behaviours:**
    - ▲▼ rank-movement arrows for 5 s
    - 200 ms FLIP reorder
    - sparkline on hover
    - `n/a` for windows older than the token
    - star on each row
  - **New Pairs.** The pool-age window includes no-curve pools.
  - **Shareable state.** Every discovery view's state is in the query string, and an E2E test checks shared links.

### W4.3 Search, watchlist and global keymap (M)

- **Covers:**
  - "Search overlay: no empty state, no chain scope, thin result rows, partial ranking"
  - "Watchlist page: no interval selector, search or swaps column…" (P0)
  - "Most of the global keyboard map is unimplemented"
  - "Keyboard map (§11.6) incomplete"
  - "Command palette…" (actions)
  - "Watchlist star…" (search results)
  - the watchlist placeholder-row UI
- **Owns:** `web components/layout/{Omnibox,CommandPalette,AppShell}.tsx`, `hooks/useHotkeys.ts` (sequence and hold support), `pages/WatchlistPage.tsx`, `components/account/watchlist/`, `analytics/tokens/search.ts`.
- **Accept:**
  - **Search ranking and overlay:**
    - NFKC and punctuation-stripped tiers
    - the largest-MC exact match always shown
    - Recent (10) and Hot now
    - a scope toggle
    - rich rows
    - Tab switches sections
    - wallet search covers labels, ENS and X handles from the label file
  - **Global keys.** G-sequences, `?`, `Alt+1..5`, global `P`, `S`, `C` and `M` (15-minute mute).
  - **Token-page keys.** `1–4`, `Shift+1–4`, `Shift+I`, `Alt+Q/W/E` and `T`, with trading keys gated by confirm-above (test).
  - **Watchlist:**
    - interval selector, search, Swaps column
    - "Added" as the default sort
    - top-5 recommendations
    - ticks via `tickers` at 1 s or faster
- **Verify (real):**
  - Searching "PEPE" returns ETH PEPE first, with copycats flagged.
  - "vitalik.eth" resolves through mainnet ENS.

### W4.4 Token page: header, stats, chart, pools, layout (L)

- **Covers:**
  - "Header actions, stats strip and document title"
  - "Bonding block: native left to graduate…"
  - "Chart toolbar: log scale, indicators…"
  - "Chart lines and trade markers incomplete"
  - "Desktop left rail and the specified phone tab set"
  - "Support several pools… finish the Pool card" (UI)
  - "Holder-structure card: stacked supply bar and supply/float toggle"
- **Owns:** `web components/token/{TokenHeader,StatsStrip,PriceChart,chartUtils,useMarkerTrades,model.ts (markers),TokenInfoPanel,HolderStrip,store.ts}`, `pages/TokenPage.tsx`.
- **Accept:**
  - **Header:**
    - D chip
    - ⚡ quick-buy with the active slot's 4 presets (gated)
    - alert bell
    - share card
    - explorer link per chain
    - copycat banner with "Original"
  - **Stats strip.** Top10, Supply (circulating vs total), buys/sells and net buy. Windows older than the token read `n/a`. The document title is `SYMBOL $MC ▲/▼`.
  - **Bonding block:**
    - ≈ native left to graduate
    - progressQuote
    - Graduating chip
    - "Graduated in …" with a pool link
    - rules per launchpad
  - **Chart toolbar:**
    - log scale, MA/EMA and fullscreen
    - right-click menu: hide markers, h-line, alert at price, limit at price
    - empty state "Waiting for trades…"
  - **Chart lines and markers:**
    - lines: average sell, alerts, migration MC and ATH
    - marker classes Fresh, Bundler and Top traders
    - MCap bars on circulating supply at the time of the bucket
    - a candle data table and a text summary
  - **Pool card:**
    - pair label and per-side USD
    - all pools listed
    - CLMM shows "N/A" for LP burn; lock vs burn
    - lower-bound liquidity hint
  - **Holder-structure card.** The stacked bar sums to 100%, and the float toggle is disabled below 2% float.
  - **Layout:**
    - 280 px left rail
    - phone tabs Chart, Trade, Audit, Activity, Holders and More
    - `?tab=` for deep links
- **Verify (real):** BRETT shows its v2 and v3 WETH pools with the lower-bound flag, and the explorer links resolve.

### W4.5 Token audit, tabs and dev (M)

- **Covers:**
  - "Activity tab: event types, fees, paging, oldest-first, wallet mini card"
  - "Holders and Top traders tabs: address types, summaries, preset filters"
  - "Dev card and Dev tokens tab…" (P0)
  - "Safety score: missing deductions, price section and 4-band scale"
  - "Appendix B thresholds…" (tri-tier chips and glyphs)
- **Owns:** `web components/token/{tabs/,DevPanel,EarlyBuyers,SecurityPanel}`, `components/common/indicators.tsx`, `components/wallet/WalletMiniCard.tsx`, `analytics/tokens/{security.ts (score),trades.ts}`.
- **Accept:**
  - **Activity tab:**
    - Add, Remove, Transfer, Burn and Claim rows
    - fees column, TOP3 badge
    - max-USD and side filters, Top holders chip
    - Oldest-first mode
    - cursor paging past 200 in a virtualised table
    - USD/native toggle
    - wallet mini card, reused in Holders and Early buyers
  - **Holders tab:**
    - burn, contract, locker and CEX rows
    - received badge, Remaining %
    - funded-at time
    - Top20 and contract self-held figures
    - follow star
  - **Top traders.** All 5 preset chips.
  - **Dev card:**
    - funding time, team %, best token
    - last 5 launches
    - Follow dev
  - **Dev tokens tab.** Summary and columns as specified, plus a graduated filter.
  - **Safety score.** All §8.6.1 deductions plus the price section, a 4-band scale and Explain rows. Unknown is never a pass.
  - **Risk chips.** Tri-tier with ✓/!/? glyphs and aria text, from the shared thresholds table.
- **Verify (real):** ETH USDT shows the −20 blacklist deduction.

### W4.6 Wallet page, leaderboard and monitor feed (L)

- **Covers:**
  - "Wallet page cards: missing P0 metrics…"
  - "Wallet page header and tabs…"
  - "Leaderboard: filter drawer, tag rank, balance column…" (P0)
  - "Monitor feed filters and noise control (MN-1)"
- **Owns:** `web pages/{WalletPage,LeaderboardPage,MonitorPage}.tsx`, `components/{wallet,monitor}/` (excluding convergence), `analytics/wallets/{routes.ts,tracker.ts (metrics)}`.
- **Accept:**
  - **Card 1.** Fees paid. Calendar in the viewer's timezone, with P95 sqrt scaling and a richer tooltip.
  - **Card 2.** Median copy window, median entry MC, trades/day, fee drag and posture. Average hold excludes open positions.
  - **Card 3.** An Unsold bucket and entry-MC quantiles.
  - **Header and states:**
    - Alert action, USD/native toggle
    - a token address redirects to the token page
    - "Not enough history" state
  - **Holdings:**
    - airdrops hidden by default; closed and abnormal toggles
    - server sorts
    - honeypot, rugged and stale-price badges
  - **Activity:**
    - transfer and liquidity rows
    - token filter, fees column, realised % on sells
    - paging from durable history
  - **Leaderboard.** Server-side filter drawer, tagRank and native balance.
  - **Monitor feed:**
    - max-USD, MC, age, first-buy, wallet and stable filters
    - ×N collapse within 20 s
    - starred rows, mute
    - pause on hover
- **Verify (real):** the 7D PnL and fees of 3 real wallets are within ±5% of an explorer reconstruction.

### W4.7 Signals, calls and convergence (L)

- **Covers:**
  - "Signal trigger rules do not match the PRD §8.9.1 definitions"
  - "Signal record contract, severity and quality pre-filter…"
  - "KOL calls (§9.6 P0): thesis, 'Sold after calling' warning…"
  - "Convergence panel (MN-3)…"
  - "Missing realtime channels…" (convergence)
- **Owns:** `analytics/wallets/{signals.ts,convergence.ts}`, `web pages/{SignalsPage,CalloutsPage}.tsx`, `components/{signals,callouts}/`, `components/monitor/HotBySmartMoney.tsx` (replaced).
- **Accept:**
  - **Trigger rules.** Each of the 13 P0 kinds follows its §8.9.1 rule, with a dedupe key and a fixture test per rule.
  - **Signal contract:**
    - fields firstTriggerMc, timesFired, cur snapshot, payload, severity and peakMultiple
    - `GET /signals?before=&groups=`
    - quality filter on by default
    - range filters and grouped chips
  - **KOL calls:**
    - thesis and price at call
    - hit = 2× within 7 days
    - "Sold after calling" warning
    - best multiple per caller, computed on the server
  - **Convergence:**
    - server clusters with strength labels and red flags
    - `GET /api/:chain/convergence` and the `convergence:<chain>` channel
    - phone carousel
- **Verify (real):** replay 24h of live data. smart_buy stays under the spam ceiling per chain-hour, and its forward 1h return is at or above the base rate.

### W4.8 Settings, display and formatters (M)

- **Covers:**
  - "Settings sections and display fields, plus cross-device settings sync"
  - "Formatter conformance to §11.4 and Appendix A" (rest)
- **Owns:** `web pages/SettingsPage.tsx` (registry), `components/account/settings/{DisplaySettingsForm,PrivacySection,HotkeysSection}`, `accounts/settings.ts` (display section), `packages/shared/src/format.ts`, `components/common/numbers.tsx`, `hooks/useTheme.ts`, `store/ui.ts`.
- **Accept:**
  - **Display fields:**
    - System theme, density
    - compact and subscript toggles
    - timezone, 24h clock, reduced motion
    - chip set, avatar shape, ring and chain colours
  - **New sections.** Privacy, and Hotkeys (view and enable).
  - **Sync.** A `settings` user-channel event updates other devices within 2 s, with a localStorage mirror for boot.
  - **Formatters.** Table-driven Appendix A tests pass, `formatMultiple` and `formatPnl` exist, and the shared tests run in CI.

### W4.9 Quality gates (M)

- **Covers:**
  - "E2E flows, contract tests and browser coverage"
  - "Determinism CI check over a hashed event log"
  - "Ground-truth validation job (AN-80)…" (nightly sim job)
  - "Performance budget verification…" (rest)
  - "Accessibility gaps against §11.7" (infrastructure, gate, toasts, zoom)
  - "REST conventions: cursor pagination on all lists, and freshness headers" (helper plus the accounts and trading routes; W4.6 and W4.7 apply it to the wallet routes)
- **Owns:** `apps/web/e2e/`, `playwright.config.ts`, `.github/workflows/{ci,nightly}.yml`, `apps/server/test/contract.test.ts`, `packages/shared/src/schemas.ts`, `apps/server/scripts/{determinism,validate,ws-soak}.ts`, `components/ui/Toaster.tsx`, `store/toasts.ts`, `server common/paging.ts`.
- **Accept:**
  - **E2E.** Flows 2, 3, 4, 5 and 7 are added, with WebKit and Firefox projects. E2E blocks merges.
  - **Contract tests.** zod validates every REST response and WS frame.
  - **Determinism.** The event-log hash is checked over two 10-minute runs plus a golden hash.
  - **Validation.** The AN-80 nightly job fails on a regression above 5 points.
  - **Performance:**
    - Trenches p95 frame ≤16 ms
    - WS soak: 2,000 sockets at 200 trades/s within 1.5 GB
    - initial JS ≤250 KB gz
    - FCP measured
  - **Accessibility:**
    - axe wcag22aa on every route in both modes, blocking
    - toast throttle
    - checks at 320 px and 200% zoom
  - **REST conventions.** `Paged<T>` with cursors, and cache-control per resource class.

---

## Wave 5 — P1 depth

- **W5.1 Discovery depth (M).**
  - Covers: "Multi-chain 'All' mode does not exist"; "Narratives: cards do not open a filtered Trending view…"; "Lifecycle stage and quality flag…"; "Watchlist page…" (P1: alias, drag reorder, dock panel, ticker strip).
  - Owns: `packages/shared/src/chains.ts` ('all' handling), `ChainSwitcher`, `analytics/tokens/{channels,lists}.ts` (cross-chain merge), `NarrativesPage`, `store/dock.ts`.
  - Accept:
    - `/all/trending` merges the chains with USD ranking and per-chain percentile heat.
    - Mixed lists show a chain stripe and badge.
    - `?narrative=` filters Trending.
    - The Pass/Watch/Skip dot is computed per §8.11.
- **W5.2 Token depth (M).**
  - Covers: "Holder history series endpoint and chart overlays"; "Events and Comments tabs" → Events only, over B's token signals endpoint; "Ingest liquidity add/remove…" → Liquidity tab; "Dev card…" → dev score; "Real data sources for copycat, CTO, boost…" → own copycat detector; "Social pulse card…" → social-link safety warning and pump.fun fee-sharing panel from on-chain data; P1 lines (KOL pins, draggable order lines, top-10 average cost) and the cluster summary.
  - Accept:
    - `/series` samples every 60 s and persists in live mode.
    - The chart has an overlay picker.
    - Copycat detection uses normalised name and symbol plus an image hash across chains; the earliest token is "Original".
- **W5.3 Wallet intelligence depth (L).**
  - Covers: "Copy guardrails and copy assessment: gates G1–G4…"; "Copy assessment card (WP-4)…"; "Portrait strip (WP-5)…"; "Global wallet tags…" (P1: launchpad_smart, top_followed via platform followers, wash_trader); "Leaderboard…" (P1 tabs).
  - Accept:
    - Gates are computed from the real-wallet ledger.
    - G3 uses the measured landing latency from W1.6.
    - The backtest reproduces the PRD worked example.
- **W5.4 Monitor and social depth (M).**
  - Covers: "Inflow board (MN-2)"; "Missing realtime channels…" (inflow); "Follows: emoji, colour, starred…"; "P1 signal kinds missing…" (excluding `live`); "User call-outs composer and caller pages" (promoted from P2: the only first-party call source in live, which re-enables `kol_call` there).
  - Accept:
    - A call can be posted only while holding the token.
    - Calls are rate-limited and sanitised.
    - Caller 7d and 30d stats are computed.
- **W5.5 Automation depth (M).**
  - Covers: "smart_entry (dip entry + bracket)…" → smart_entry; "Unified automations page…"; "Explain-PnL replay…"; "Landing telemetry status panel…" → `/status` and `GET /api/status/landing`; "Exit-plan model…" → TE-55 suggested pairs; "Confirmation policy…" → default exit-plan template.
  - Accept:
    - The Explain replay is built from durable fills and transfers.
    - The status panel shows p50/p95 per chain and tier over 1h and 24h.
- **W5.6 Multi-wallet and wallet manager (L).**
  - Covers: "Multi-wallet trading and wallet manager (1–5 wallets per chain)"; "Wallet manager: multiple wallets per chain, rename, primary, archive…" (export stays denied).
  - Owns: `accounts/` (wallet list), `AccountsApi.walletFor(…, walletId)`, `trading/` binding, `live/signer/` (create per wallet), the panel selector.
  - Accept:
    - Multi-swap runs concurrently with per-wallet receipts.
    - Archiving a wallet closes its orders and tasks.
    - Internal transfers carry cost basis.
- **W5.7 Revenue and rewards (M).**
  - Covers: "Referral rebate and cashback payouts…" and "Live rewards…" (payout path); "Rewards §6.18 parity…"; "Anti-fraud for rewards and referrals…"; "Fee ledger aggregation, fee-wallet reconciliation…" (reconciliation and reports).
  - Accept:
    - The invitee's discounted fee bps are applied in the on-chain fee transfer.
    - Rebates accrue in native units from collected fees, with a holding period and a minimum claim.
    - Points have a daily cap.
    - Self-referral is detected through shared funding, IP or device.
    - A daily fee-wallet reconciliation alerts on drift.
- **W5.8 Account lifecycle and support (L).**
  - Covers: "Delete account and personal-data export…"; "Data retention schedule, account closure…" (jobs); "Customer-support tooling…" (rest, including the help entry point); "Passkeys (WebAuthn)…"; "Portfolio: reset paper account, CSV export, Fees tab…"; "Verified share cards…".
  - Accept:
    - Closure requires a zero balance or a sweep to the whitelist.
    - Export produces JSON and CSV.
    - The real-fill CSV includes the tx signature and all fee legs.
    - `/share/:id` verifies against the durable ledger.
- **W5.9 Realtime and PWA (L).**
  - Covers: "PWA service worker, offline shell and Web Push channel"; "Responsive and PWA…" (SW, push, phone swipe); "WS list deltas, per-subscription seq and clock-offset…"; "Per-browser socket sharing…" (SharedWorker, background unsubscribe, cross-tab logout).
- **W5.10 Personalisation and i18n (M).**
  - Covers: "Hotkey rebinding and a Hotkeys settings section"; "Colour-blind palette"; "Sounds: per-category and per-wallet sounds, master mute…"; "Internationalisation: externalised strings (ICU) and zh-CN"; "Mode-aware copy and string externalisation…" (lint rule).

## Wave 6 — P2

- **W6.1** "Curated cross-chain hot list (Heat Rank)": gates and composite score per §8.10, near-misses, and a diff against the last run.
- **W6.2** "Multichart workspace": at most 8 charts and a cap on WS channels per socket.
- **W6.3** "smart_entry (dip entry + bracket) and DCA order kinds" → DCA, under consent and caps.
- **W6.4** "Email digest channel" and "Signed outbound webhooks…": HMAC, retries, delivery log, and an egress guard (https only, private ranges blocked, no redirects).
- **W6.5** "Public API keys and webhooks for builders": read-only scope first, with signed requests and weights. The trade scope waits until consent, server gates, the IP allowlist and per-key caps have run in production; withdraw is never offered.

---

## 4. Recommended NOT to build, and what to do instead

| Do not build | Why | Instead |
|---|---|---|
| DEX Screener boosts, CTO flags, profiles or trending as a data source ("Real data sources for copycat, CTO, boost…" → CTO/boost) | DEX Screener's ToS bans competing products | Hide the `boosted` and `cto` badges and signal kinds in live mode (W2.7). Show CTO only where it can be proved on-chain, such as a metadata update-authority or creator-fee recipient change. Later, add first-party, clearly labelled "Promoted" listings. |
| Paid X API reads for follower counts, rename history and the posts feed ("Social pulse card…" → posts and rename; xFollowers; KOL verification by bulk lookup) | Cost (a small Basic quota; Pro is thousands per month) and redistribution terms | Curated per-chain label files plus an admin endpoint (W2.7). An optional "Sign in with X" lets a user prove their own handle. Hide xFollowers in live; social links go through the safety interstitial. |
| Social sniper (TE-64) | Depends on the X stream; high scam and spoof risk with real funds | `autoBuyOnPaste` behind the safety gate (W1.1). A later sniper on first-party user call-outs (W5.4). |
| Comments tab (P2) | Moderation load and legal exposure (coordinated pumps, scam links) on a real-money product | User call-outs that require holding the token, with rate limits and sanitisation (W5.4). |
| `live` signal kind (pump.fun livestreams) | No official API; scraping the frontend API breaks its terms | Hide the kind in live mode. |
| Free-tier GeckoTerminal or CoinGecko as the production data backbone | Free-tier rate limits, attribution and non-commercial terms | Own on-chain log backfill as the primary source, with a licensed provider (Codex, Birdeye or paid CoinGecko) as fallback behind a MarketDataProvider with provenance (W2.2, W3.6). |
| Private-key export at launch | DEXX lost $21–30M through plaintext key export; GMGN's own policy is contradictory | An explicit deny-export Turnkey policy (W1.7), ToS disclosure, and withdraw-all as the exit path. Revisit only with Turnkey's encrypted export iframe, a 24–48h cooldown and an email confirmation, as specced in `COMPLIANCE.md`. |
| Our own fiat on-ramp or KYC | It turns us into a regulated payments business | Third-party on-ramp deep links that prefill address and network, gated by geo (W3.4). |
| Routing to Robinhood Chain tokenized equities | Securities exposure (US persons and other jurisdictions) | Deny by default in the restricted-asset list (W1.10) until counsel signs off on a per-jurisdiction policy. |
| Telegram-channel scraping for calls or CAs | ToS and spam | First-party user call-outs (W5.4). |
| Full `getProgramAccounts` holder scans for large tokens | Too heavy for RPC providers, which often block it | Top-N holders from RPC plus counts from an indexer (Helius DAS), with the completeness flag shown as partial (W2.4). |
| VPN/Tor heuristics at launch | High false-positive rate; low value next to sanctions screening | Geo header or GeoLite2 plus address sanctions screening (W1.10); revisit if counsel requires it. |
| Trade or withdraw scope in the public API (now) | It bypasses the UI's step-up and confirmation flows | Read-only keys first (W6.5); trade scope later behind consent, server gates and an IP allowlist; never withdraw. |