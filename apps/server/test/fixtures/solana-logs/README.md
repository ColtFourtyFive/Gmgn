# Solana program-log fixtures

Recorded from Solana mainnet on 2026-10-20 (slots ~459.35M-459.41M) over
`wss://api.mainnet-beta.solana.com` with `logsSubscribe({ mentions: [program] }, { commitment: 'confirmed' })`
for the pump.fun bonding-curve program (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`) and the PumpSwap AMM
(`pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`), and with `getTransaction` (json, `maxSupportedTransactionVersion: 1`)
on the same endpoint. Nothing here is synthesized; one test concatenates two real transactions' logs and says so.

| File | Content | Provenance |
|---|---|---|
| `stream.json` | 200 consecutive `logsNotification` frames, text as received: both subscriptions, failed transactions (most of them), transactions mentioning both programs (delivered twice) | **captured frames** (`scripts/solana-logs-check.ts --capture`) |
| `events.json` | one transaction per case (`case`): pump `CreateEvent` (SOL with and without a dev buy, mayhem, quoted in PUMP / another coin), `TradeEvent` per instruction (`buy`, `buy_exact_quote_in`, `buy_exact_sol_in`, `sell`, `multi_hop_swap`), the mayhem agent's fee-free trade, a mayhem trade by another wallet, a cashback coin, a curve quoted in another mint, a completing buy with `CompleteEvent` + `PostCompleteBuyEvent`, a `MigrateV2` with `CreatePoolEvent` + `InitBoostEvent` + `CompletePumpAmmMigrationEvent`, PumpSwap `BuyEvent` (`buy`, `buy_v2`, `buy_exact_quote_in[_v2]`, `multi_hop_swap`) and `SellEvent`, truncated logs, failed transactions | **captured notifications** (`{signature, slot, err, logs}` of the frame) |
| `sequence.json` | a SOL launch (`8Bro7y…pump`) and the next 34 transactions on its curve, in order | **captured notifications** |
| `parity.json` | the transactions of `../pumpportal/*.json` (lifecycle, curve-trades, misc) with their logs, slot and block time | **`getTransaction`** |
| `transactions.json` | raw `getTransaction` results of three transactions whose logs the node truncated (two five-wallet bundles of the lifecycle, its `MigrateV2`) | **`getTransaction`** |
| `pools.json` | the mint of each PumpSwap pool the `events.json` trades name, `null` when it is not a canonical WSOL pool | **`getAccountInfo`** (`readPoolMint`) |

What the recordings showed (see `src/live/feed/solana/*.ts`):

- Both programs `emit!` every event as a `Program data:` log line **and** `emit_cpi!` it as a self-invocation
  (inner instruction: Anchor's `EVENT_IX_TAG` `e445a52e51cb9a1d`, the discriminator, the body). Discriminators
  match the IDLs of `@pump-fun/pump-sdk` 4.2.0 / `@pump-fun/pump-swap-sdk` 2.2.0 (`sha256("event:<Name>")[0..8]`);
  every body decodes with the SDK's own decoders (`decodeTradeEventBc`, `decodeBuyEventAmm`, ...).
  `TradeEvent` is 390-439 bytes (variable: instruction name, shareholders).
- One `CreateEvent` serves `create` and `create_v2`; it carries the quote mint, the mayhem flag and the coin's
  creator fee, so a launch needs no curve read to be checked. `creator` can differ from the signing `user`
  (`misc.createNoBuy`: PumpPortal reports the signer).
- `TradeEvent` carries post-trade virtual **and** real reserves (a SOL curve's sit exactly 30 SOL / 279.9M tokens
  apart; a mayhem curve's virtual SOL moves on its own, its real SOL is exact in the event), the fees, the user
  and the block time. What the wallet paid / received is the curve amount plus / less `fee + creator_fee + cashback`
  (checked against `getTransaction` balance deltas to the lamport; differences are account rent and tips).
- PumpSwap events name the pool, not the mint. Pool reserves in them are pre-trade vault balances; the pool
  prices on vault + `virtual_quote_reserves`, which is signed (-18 SOL on a 752 SOL vault in `events.json`).
  The user paid `quote_amount_in_with_lp_fee + protocol_fee + coin_creator_fee + cashback` for every buy variant
  (`quote_amount_in` / `user_quote_amount_in` swap meanings between `buy` and `buy_exact_quote_in`).
- Nodes cut a transaction's logs at 10 KB (`Log truncated`): bundles and migrations lose their last events
  (the lifecycle's bundles keep 3 of their 5 `TradeEvent`s; its `MigrateV2` loses pump's migration event but
  keeps the pool's `CreatePoolEvent`). The event CPIs in `getTransaction`'s inner instructions are complete.
- A few "confirmed" notifications were for transactions the chain does not have (6 of ~4,700 sampled, all in
  two adjacent slots: a fork): `getSignatureStatuses` with history returns null for them. `events.json`'s
  `truncated` case is one of these (its logs are real program output).
