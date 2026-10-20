# PumpPortal fixtures

Captured from the live service (`wss://pumpportal.fun/api/data`, no API key) and from Solana mainnet
on 2026-10-20 (slots ~459.35M). Trimmed to the frames the tests use; pretty-printed, otherwise as
received.

| File | Content | Provenance |
|---|---|---|
| `lifecycle.json` | ack, launch of `7JFy6…pump` (dev buy 92.9M tokens), ten buys that complete its curve in the launch slot (two five-wallet bundles, so frames share signatures), its migration | ack, `create` and `migrate`: **captured frames**. The ten `buy` frames: **reconstructed from the on-chain pump `TradeEvent`s** of those transactions |
| `curve-trades.json` | launch of `DLdY…` and every later trade on its curve: buys, round trips, full exits, back to the starting reserves | `create`: **captured**. Trades: **reconstructed from on-chain `TradeEvent`s** |
| `misc.json` | a launch without a dev buy; a mayhem-mode launch whose `bondingCurveKey` is wrong (it names the mayhem agent's wallet); a launch quoted in the PUMP token (its SOL fields are the program's shadow values); an instant graduation (the dev buys the whole curve) and its migration; a `bonk` launch; every ack, refusal and error wording seen | **captured frames**, except `malformed` (hand-written invalid frames) |
| `curves.json` | bonding-curve accounts (base64, as `getMultipleAccounts` returned them) of a SOL curve, curves quoted in PUMP and CARDS, a mayhem curve and a migrated (zeroed) curve | **mainnet account data** |
| `amm-trade.synthesized.json` | one PumpSwap (`pool: 'pump-amm'`) trade after the lifecycle's migration | **synthesized**: shape from PumpPortal's documentation, numbers made up |

Why trades are reconstructed: PumpPortal answers every `subscribeTokenTrade` / `subscribeAccountTrade`
without a key funded with at least 0.02 SOL with the refusal in `misc.json`
(`tradeStreamsRefused`), and no funds were used here. A reconstructed frame takes the transaction's
real signature, trader, amounts and post-trade reserves from the pump program's `TradeEvent`, in the
units and key order of the captured `create` frames, whose numbers match the same event for the
creator's buy exactly (`solAmount` = SOL into the curve before fees, `vSol/vTokensInBondingCurve` =
post-trade virtual reserves, `marketCapSol` = vSol / vTokens x 1e9). `newTokenBalance` is the
trader's post-transaction token balance from the transaction's token balances. Whether PumpPortal's
trade frames carry exactly these keys, and what `solAmount` means for PumpSwap trades, remains
unverified until a funded key is available.

Facts the captures and the chain showed (see `src/live/feed/messages.ts` and `ingest.ts`):

- A quarter to nearly half of pump.fun launches (24-46% over the day's captures) are quoted in
  another mint (PUMP, CARDS, other coins); the frame does not say so. Their curve account does
  (`quoteMint`).
- Mayhem-mode mints (`is_mayhem_mode: true`) have a 2B supply; the mayhem agent
  `BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s` trades them without fees, and the curve moves its
  virtual SOL off the constant product (the 279.9M virtual token offset still holds).
- Buyers pay `solAmount` plus 0.95% protocol and 0.30% creator fees; sellers receive `solAmount`
  less them.
- `MigrateV2` puts the completed curve's real SOL less 0.015 SOL (85.005 -> 84.990, 17.58 of it as
  the pool's virtual quote reserve) and 206.9M tokens into the canonical PumpSwap pool.
