# Live mode runbook

Trenchscope runs in one of two modes, chosen per deployment by `MODE`:

| | `MODE=demo` (default) | `MODE=live` |
|---|---|---|
| Market | Deterministic simulator, 4 chains | Real Solana: pump.fun launches, trades and migrations from PumpPortal, on-demand mints from RPC |
| Balances | Paper wallets with a faucet | Real SOL / SPL in an embedded wallet per account (Turnkey) |
| Accounts | Guests, username/password | Registered accounts only (10+ character passwords), optional TOTP 2FA, withdrawal whitelist |
| Persistence | `snapshot.bin` (snapshots) | `trenchscope.db` (SQLite, written through) + snapshot for market state |
| Token launch | Yes | No (`403 not_available_in_live`) |

Run them as **separate deployments with separate `DATA_DIR`s**. A snapshot written in one mode is
never loaded in the other. Set `DEMO_URL` on the live site to show users a "Try demo" link.

> Nothing in this repository has been run against the real PumpPortal, Solana RPC, Jupiter, Jito or
> Turnkey services: the build sandbox blocks them. Every integration is tested against fixtures
> written from documented or third-party-observed formats. Read "Must be verified before launch"
> at the end before you enable real funds.

## 1. Architecture of the live stack

```
                PumpPortal WS (wss://pumpportal.fun/api/data)
                      │ create / buy / sell / migrate (subscribeNewToken, subscribeMigration,
                      │ subscribeTokenTrade [tracked mints], subscribeAccountTrade [followed / copied / KOL wallets])
                      ▼
 live/feed/pumpportal.ts ── zod (messages.ts) ── queue ──► applied on engine ticks (never during a snapshot hold)
                                                           │
                live/feed/ingest.ts: create → World.addExternalToken + dev buy
                                     trade  → World.recordExternalTrade (post-trade curve reserves,
                                              newTokenBalance; dedupe by signature)
                                     migrate→ World.completeCurve + migrateExternal (PumpSwap pool, LP burned)
                live/feed/tracker.ts: cap LIVE_MAX_TRACKED_TOKENS, idle drop, protected tokens pinned
                                                           ▼
                       World ledger ──► analytics (lists, security, holders, signals) ──► REST + WS hub
                          ▲    ▲
  live/enrich/*  ─────────┘    │   metadata (IPFS gateways, SSRF-guarded), Jupiter Price v3 (SOL/USD + held tokens),
                               │   RPC: mint/freeze authorities (10 min), top 20 holders (60 s), on-demand mint lookup
                               │   (pump curve / PumpSwap pool / Jupiter-priced), all under LIVE_RPC_RPS
                               │
  trading/execution.ts Executor (idempotency, rate limit) ──► live/execution/venue.ts LiveVenue
     quote: pump.fun curve (SDK math on chain reserves) while on the curve, the token's canonical PumpSwap
        pool once migrated (SDK pool math), else (and whenever the pool cannot be used) Jupiter Swap API v1
     run (per-account lane): fresh quote → SOL check net of unconfirmed sends → v0 tx
        [compute budget][platform fee → FEE_WALLET_ADDRESS (buys: before swap)][swap][unwrap]
        [platform fee (sells: on min-out, after unwrap)][Jito tip, anti-MEV only]
        → SignerApi (Turnkey; local-dev in development) → signature + message bytes checked
        → Jito block engine (anti-MEV, bundleOnly) or RPC with preflight
        → confirm by signature status until lastValidBlockHeight (rebroadcast same bytes, never re-sign)
        → getTransaction → fill parsed from balance deltas → World.recordExternalTrade + LiveFillRecord
  live/wallets/*: balance sync (20 s for active accounts, 1.5 s after fills), deposit scan
     (getSignaturesForAddress cursor), withdrawals (2FA + whitelist + rate limit, pending → sent → confirmed)
                               │
  store/ (SQLite, DATA_DIR/trenchscope.db): accounts + trading state blobs (written through),
     append-only audit, fills (unique per account+signature), transfers (idempotent by clientId)
```

Key properties:

- **One ledger.** Live data is written into the same `World` the simulator uses, so analytics,
  orders, TP/SL, copy trading, sniping, alerts, the API and the UI are shared between modes. The
  `MarketSource` seam (`context.ts`) picks `MarketSim` or `LiveMarket`; the `Venue` seam
  (`trading/execution.ts`) picks `SimVenue` or `LiveVenue`.
- **The account's World wallet is its embedded wallet.** Registration provisions the embedded wallet
  first and creates the World wallet at that address, so feed trades of the user's wallet and our
  own fills land on the same position. A fill the feed booked first gets our fees added, not a
  second booking.
- **Money math is integer.** Everything sent on-chain is lamports / token base units (`bigint`),
  rounded down from user input (`live/execution/amounts.ts`); fees are `floor(amount × bps / 10000)`.
- **No double sends.** One send lane per account (swaps and withdrawals), committed lamports held
  until confirmation or expiry, signed bytes rebroadcast but never re-signed, withdrawals idempotent
  by `clientId` in the store, swaps idempotent by `clientId` for 15 minutes (in memory).
- **Durability.** Live mode always opens the store, whatever `SNAPSHOT_EVERY_MS` says. Accounts and
  trading state are restored from the store, never from the snapshot (snapshots carry `null` for them,
  so password hashes and sealed 2FA secrets have no second copy). World / market / analytics still use
  the snapshot; without one the market starts empty and fills from the feed.

## 2. Environment variables

### Common (both modes)

| Variable | Default | Meaning |
|---|---|---|
| `MODE` | `demo` | `live` = real Solana; anything else = demo |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `.data` | Snapshot, `trenchscope.db` (live), `dev-keystore.json` (local-dev signer) |
| `SNAPSHOT_EVERY_MS` | `900000` | Snapshot cadence; `0` = no snapshot. Live: the store is written regardless |
| `WARMUP_MINUTES` | `90` | Demo only: history fast-forwarded on a fresh start |
| `SIM_SEED` | `trenchscope` | Demo only: simulator seed |
| `TRADE_LATENCY_MS` | random | Demo only: fixed simulated confirmation latency |
| `DEMO_URL` | unset | Public URL of the demo deployment (live UI links to it) |
| `WEB_DIST` | `apps/web/dist` if built | Static web build to serve |
| `TRUST_PROXY` | off | Trust `X-Forwarded-For` from `N` proxies (`1`/`true` = one) |
| `ACCOUNT_CREATIONS_PER_IP` | `30` | Guest/register calls per IP per 10 min |
| `LOGIN_ATTEMPTS_PER_IP` | `60` | Login calls per IP per 10 min |
| `WS_CONNECTIONS_PER_IP` | `20` | Concurrent sockets per IP |
| `NODE_ENV` | unset | `production` refuses the local-dev signer |

### Live: market data

| Variable | Default | Meaning |
|---|---|---|
| `PUMPPORTAL_WS_URL` | `wss://pumpportal.fun/api/data` | Data feed socket |
| `PUMPPORTAL_API_KEY` | unset | Appended as `?api-key=` (never logged). Trade streams (`subscribeTokenTrade` / `subscribeAccountTrade`) are reported to need a key funded with ~0.02 SOL; without one only launches and migrations may arrive |
| `LIVE_MAX_TRACKED_TOKENS` | `3000` (min 100) | Tokens whose trades are streamed at once (least recently active dropped) |
| `LIVE_TOKEN_IDLE_MINUTES` | `30` | Stop streaming a token after this long without a trade (protected tokens excepted) |
| `LIVE_RPC_RPS` | `5` | RPC requests/s the ingestion and enrichment may spend (page loads go first) |
| `LIVE_KOL_FILE` | unset | JSON `[{ address, name, twitter? }]` of KOL wallets (labelled and streamed) |
| `IPFS_GATEWAYS` | `https://ipfs.io/ipfs/,https://dweb.link/ipfs/` | Gateways tried in order for metadata JSON (use a dedicated one, e.g. Pinata, in production) |
| `JUPITER_API_URL` | `https://api.jup.ag` with a key, else `https://lite-api.jup.ag` | Swap API v1 and Price API v3 base |
| `JUPITER_API_KEY` | unset | Sent as `x-api-key` |

### Live: chain, execution and fees

| Variable | Default | Meaning |
|---|---|---|
| `SOLANA_RPC_URL` | unset → balances, holders, deposits and trading disabled | HTTPS JSON-RPC (Helius, Triton, QuickNode, ...) |
| `SOLANA_WS_URL` | derived from `SOLANA_RPC_URL` | WebSocket RPC (passed to web3.js) |
| `JITO_BLOCK_ENGINE_URL` | `https://mainnet.block-engine.jito.wtf` | Anti-MEV sends (`/api/v1/transactions?bundleOnly=true`) |
| `PLATFORM_FEE_BPS` | `80` (0.8%, max 300) | Platform fee on every swap |
| `FEE_WALLET_ADDRESS` | unset → fees not collected | Receives platform fees (must be a funded, rent-exempt system account) |

### Live: wallets and security

| Variable | Default | Meaning |
|---|---|---|
| `TURNKEY_ORGANIZATION_ID` | unset | Turnkey organization holding the wallets |
| `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` | unset | API key of the server's Turnkey API user (P-256, hex) |
| `TURNKEY_API_BASE_URL` | `https://api.turnkey.com` | Turnkey API |
| `LOCAL_KEYSTORE_KEY` | unset | **Development only**: 64 hex chars; enables the local-dev signer (keys AES-256-GCM encrypted in `DATA_DIR/dev-keystore.json`). Ignored with `NODE_ENV=production` |
| `SECRETS_KEY` | unset → 2FA, and so withdrawals, disabled | 64 hex chars; seals TOTP secrets (AES-256-GCM) |
| `WHITELIST_DELAY_HOURS` | `24` | Wait before a new withdrawal address can receive funds |
| `LIVE_SESSION_TTL_DAYS` | `14` | Sessions expire after this long without use (sliding) |

Generate keys with `openssl rand -hex 32`. Every missing piece is reported at boot (`[live] ...`) and
in `GET /api/meta` → `live.problems`; the server never refuses to start for a missing credential.

## 3. Turnkey setup

The server holds only a Turnkey **API key**; private keys are generated and used inside Turnkey.
Each account gets one wallet in the organization named `trenchscope:<accountId>:sol` (ED25519,
`ADDRESS_FORMAT_SOLANA`, path `m/44'/501'/0'/0'`). A retried registration finds the wallet by name.

1. Create a Turnkey organization for production (a separate one for staging). Keep the root user(s)
   human-held with passkeys; never give the server a root credential.
2. Create a non-root **API user** for the server with one API key; put its public/private key in
   `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` (a secret manager, never the repo).
3. Policies (recommended; the server needs exactly two activities):
   - allow the API user to **create wallets** (`ACTIVITY_TYPE_CREATE_WALLET`);
   - allow the API user to **sign Solana transactions** (`ACTIVITY_TYPE_SIGN_TRANSACTION_V2`)
     only when every instruction targets an allowed program;
   - nothing else: no exports, no key or user management, no policy changes, no wallet deletion.

   Programs the server's transactions use: System `11111111111111111111111111111111`, Compute Budget
   `ComputeBudget111111111111111111111111111111`, SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`,
   Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, Associated Token Account
   `ATokenGPvbdGVxr1b2hvZbsiqW5xUFvdN3SiNiDvZRd2bG1N`, Jupiter v6
   `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`, pump.fun `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`,
   PumpSwap `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` (direct pool route; both pump programs call
   pump-fees `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` themselves), plus every program a Jupiter route
   may touch (AMMs; this is why a strict allow-list can refuse some routes). Jito tips are plain System
   transfers. A sketch of the condition (Turnkey's Solana policy language; **check the
   current syntax in Turnkey's docs**, it could not be fetched from the build environment):

   ```json
   {
     "policyName": "trenchscope-server-sign",
     "effect": "EFFECT_ALLOW",
     "consensus": "approvers.any(user, user.id == '<SERVER_API_USER_ID>')",
     "condition": "activity.type == 'ACTIVITY_TYPE_SIGN_TRANSACTION_V2' && solana.tx.program_keys.all(p, p in ['11111111111111111111111111111111', 'ComputeBudget111111111111111111111111111111', '...'])"
   }
   ```
   A stricter variant also restricts System transfers out of user wallets to the fee wallet and Jito tip
   accounts; withdrawals then need their own policy (destination = the user's whitelist is enforced by
   the server, not by Turnkey).
4. **Per-wallet scoping.** Today one API user can sign for every wallet in the organization, so a
   leaked server key is bounded only by the policies above. The stronger model is one Turnkey
   **sub-organization per user** with the server as a delegated API user scoped by policy; that needs
   code changes (`createSubOrganization` instead of `createWallet`, the sub-org id as
   `providerWalletId`) and is listed under follow-ups.
5. Key rotation: create a second API key for the API user, deploy it, delete the old one. No server
   state depends on the API key.

Local development uses `LOCAL_KEYSTORE_KEY` instead (no Turnkey): keys are generated locally and
encrypted at rest. It is refused when `NODE_ENV=production`, and dev wallets must never hold real funds.

## 4. Required outbound hosts

| Host | Used for |
|---|---|
| `pumpportal.fun` (WSS) | Market data feed |
| your RPC host (`SOLANA_RPC_URL`, `SOLANA_WS_URL`) | Balances, holders, authorities, mint lookup, sending, confirmation |
| `lite-api.jup.ag` or `api.jup.ag` | Swap quotes / instructions, prices |
| `mainnet.block-engine.jito.wtf` (or your regional block engine) | Anti-MEV sends |
| `api.turnkey.com` | Wallet creation and signing |
| IPFS gateways (`ipfs.io`, `dweb.link`, or yours) and any https host a token's metadata `uri` names | Token metadata JSON (SSRF-guarded: public https only, no IP literals or private addresses, 5 s, 256 KB, JSON only) |

Token images are loaded by the browser, not the server (the live CSP allows `img-src https:`).

## 5. Fee wallet

`FEE_WALLET_ADDRESS` receives `PLATFORM_FEE_BPS` of every swap: on the SOL going in for buys (a System
transfer before the swap) and on the quote's minimum SOL out for sells (after the wSOL unwrap), so
the fee never exceeds what the user is guaranteed. Requirements:

- a plain system account you control (a cold or multisig wallet), **pre-funded above the rent-exempt
  minimum** (0.00065024 SOL on mainnet since its rent reduction; it was 0.00089088 SOL): a transfer that
  would leave a new account below it fails the whole swap;
- a malformed address is reported at boot (`live.problems`) and makes swaps answer
  `503 trading_unavailable` (fees are never silently dropped); funding is not checked at boot;
- unset (or `PLATFORM_FEE_BPS=0`): no fee instruction is added and the problem is reported.

## 6. Jito

Swaps with anti-MEV on (the trade preset's toggle) go **only** to the Jito block engine
(`sendTransaction` with `bundleOnly=true`), never to public RPC, with a tip transfer to one of the 8
mainnet tip accounts as the last instruction: the preset's tip, at least 1000 lamports. While
confirming, the same bytes are rebroadcast every 2 s. A block-engine rejection (4xx, JSON-RPC error)
fails the swap with `502 tx_failed` and nothing is spent; a network error or 5xx is treated as
possibly delivered, and the blockhash expiry settles it (a failed receipt "expired before it landed"
if it never lands). Setting `JITO_BLOCK_ENGINE_URL` to an empty value is not supported (the default
applies); to send anti-MEV swaps through public RPC instead, users turn anti-MEV off. Public
block-engine rate limits are low: for more than a handful of users request an authenticated UUID from
Jito or use a paid RPC that forwards to Jito.

## 7. Running it

```bash
# production-style (after pnpm build)
MODE=live DATA_DIR=/var/lib/trenchscope NODE_ENV=production \
SOLANA_RPC_URL=https://... PUMPPORTAL_API_KEY=... JUPITER_API_KEY=... \
TURNKEY_ORGANIZATION_ID=... TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... \
SECRETS_KEY=$(cat /run/secrets/secrets_key) FEE_WALLET_ADDRESS=... DEMO_URL=https://demo.example.com \
TRUST_PROXY=1 pnpm start
```

Local development without any external service (dev/test tool, synthetic data only):

```bash
cd apps/server
npx tsx scripts/fake-pumpportal.ts --port 8899           # fake PumpPortal: synthetic launches, trades, migrations
MODE=live DATA_DIR=.data-live LOCAL_KEYSTORE_KEY=$(openssl rand -hex 32) SECRETS_KEY=$(openssl rand -hex 32) \
PUMPPORTAL_WS_URL=ws://127.0.0.1:8899/api/data npx tsx src/index.ts
```

Keep the two keys if you want the dev accounts to survive a restart. Without `SOLANA_RPC_URL` you can
register (a dev wallet is provisioned), browse live-format tokens and trades, enable 2FA and manage the
whitelist; balances stay 0 and trading answers `503 trading_unavailable`. `scripts/fake-pumpportal.ts`
also replays recorded frames (`--replay test/fixtures/pumpportal/lifecycle.json`) and can include given
wallets among its traders (`--wallet <address>`). It is **not market data**: nothing it emits exists on-chain.

## 8. Operating checklist

**Before go-live**
- [ ] All of section "Must be verified before launch" done in staging with real services.
- [ ] `/api/meta` → `live.problems` is empty; `live.signer` is `turnkey`; `live.tradingEnabled` is `true`.
- [ ] `NODE_ENV=production`, `TRUST_PROXY` matches the proxy chain, TLS terminated in front.
- [ ] Fee wallet funded above rent-exempt; Turnkey policies in place; server API user is not root.
- [ ] Backups configured (below) and a restore rehearsed.

**Backups**
- `DATA_DIR/trenchscope.db` holds accounts (password hashes, sealed 2FA secrets, whitelist, embedded
  wallet references), trading state, the append-only audit log, fills and transfers. Back it up with
  SQLite's online backup (`sqlite3 trenchscope.db ".backup /backups/trenchscope-$(date +%F).db"`) or
  a filesystem snapshot including `-wal`/`-shm`; never by copying the bare `.db` while the server runs.
- Back up `SECRETS_KEY` **separately** from the database (a secret manager). Losing it makes every
  enabled 2FA secret unreadable: those users cannot sign in (503 `two_factor_unavailable`) until an
  admin recovery procedure exists.
- Turnkey holds the keys: a lost database does not lose funds, but the account ↔ wallet mapping
  (`trenchscope:<accountId>:sol` wallet names) must then be rebuilt from Turnkey.
- `snapshot.bin` (market state) is disposable in live mode.

**Key rotation**
- Turnkey API key: add a new key to the API user, deploy, delete the old one.
- `SECRETS_KEY`: rotation is **not implemented** (re-sealing needs a migration). Treat it as long-lived.
- `PUMPPORTAL_API_KEY`, `JUPITER_API_KEY`, RPC URL: replace and restart.
- `LOCAL_KEYSTORE_KEY`: development only; changing it orphans the dev wallets.

**Monitoring**
- Poll `GET /api/meta` → `live`: `feedConnected`, `lastEventAt` (alert if older than ~60 s),
  `rpcHealthy` (a `getSlot` probe), `tradingEnabled`, `trackedTokens`, `problems`. `GET /api/health`
  gives tokens, clients and engine trades/s.
- Logs to watch: `[pumpportal]` reconnects and refusals (a refused trade subscription usually means
  the API key is unfunded), `[live] price refresh failed`, `[wallets]` withdrawal tracking failures,
  `[store]` warnings, `[accounts] wallet provisioning failed`.
- Audit table (`audit`): `withdrawal_*`, `swap_sent`, `swap_refused`, `swap_failed`, `swap_unreadable`,
  `swap_sign_failed`, `login_failed`, `2fa_*`, `whitelist_*`. Alert on `swap_unreadable` and on any
  withdrawal left `sent` for more than 10 minutes (`SELECT * FROM transfers WHERE status IN ('pending','sent')`).

**Restarts and upgrades**
- SIGTERM/SIGINT: the server stops the feed and wallets, writes the store (and a snapshot when
  enabled) and checkpoints the WAL. Withdrawals interrupted before broadcast are failed (nothing was
  sent); ones already `sent` are confirmed by signature on boot, never re-sent.
- Swaps confirming in the background at shutdown are not resumed: their result appears through the
  balance sync. Prefer draining traffic before restarts.
- The store refuses a database written by a newer schema; migrations are append-only.

## 9. Known limits

- Solana only; pump.fun launches only (other launchpads' creates are ignored; their tokens load on
  demand when Jupiter can price them). Migrated pump.fun tokens trade on their canonical PumpSwap pool (v1
  `buy` / `sell`); a token without one (e.g. migrated to Raydium before PumpSwap existed), a pool the loader
  cannot read, or a pool swap too large for one transaction goes through Jupiter.
- A full sell leaves the emptied token account open: its rent (0.0015 SOL at today's rate) stays locked in
  it. A wallet's first pump.fun and first PumpSwap buy each also open a volume accumulator (0.0013462 SOL of
  rent, kept by the program); both are reserved by the balance check and booked as rent, not price.
- The first trade into a launch whose creator vault is still unfunded (common right after a create) pays
  the vault's rent-exempt minimum (0.00065024 SOL): a buy on top of the curve cost and outside
  `max_sol_cost`, a sell out of its proceeds; the SDK's quote includes neither. The balance check reserves
  it on every curve buy; when it is paid it shows in that fill's price.
- Mainnet carries v1 transactions (a third to a half of recent pump.fun / PumpSwap traffic in October
  2026); `getTransaction` with `maxSupportedTransactionVersion: 0` refuses them (`-32015`). The venue
  builds and reads only its own v0 swaps; anything scanning other wallets' transactions (deposits) must
  allow for them.
- `lite-api.jup.ag` without a key allows a handful of requests per window (`x-ratelimit-remaining` drops to
  0 after ~5 quick calls): a 429 is a 503 `trading_unavailable`. Use `JUPITER_API_KEY` in production.
- Swap `clientId` idempotency is in memory for 15 minutes: a client that retries the same `clientId`
  after a server restart could send again (the web client mints a new id per click and never retries).
- Position cost basis lives in the World (snapshot). After a restart without a recent snapshot,
  holdings are re-read from chain at the current price (no invented profit) and earlier PnL history
  for them is lost; `fills` in the store keep the durable record but are not replayed into positions.
- Balance sync covers accounts active in the last 15 minutes (API requests and fills), not idle
  sockets.
- Creation time of a token loaded on demand is approximate (oldest of the newest 1000 signatures).
- The feed's trade streams depend on PumpPortal's plan; holders and authorities are refreshed only
  for tokens someone has open or holds.
- Accounts state is one JSON blob rewritten on change: fine for a small user base, revisit beyond a
  few thousand accounts. The audit table only grows (no retention policy yet).
- `node:sqlite` is experimental in Node 22 (a warning is printed in live mode).
- No admin endpoint: `LiveMarket.diagnostics()` (queue, drops, feed and lookup counters, RPC budget)
  is not exposed over HTTP yet.

## 10. Must be verified before launch

The execution items marked verified below were checked read-only against mainnet (simulation, nothing
sent) with `apps/server/scripts/sol-exec-verify.ts`; re-run it after SDK or program upgrades. The rest
could not be checked from the build environment. Verify each in staging, then run a
tiny-amount mainnet smoke test (pump buy/sell, Jupiter buy/sell, Jito send, SOL and SPL withdrawal,
deposit detection, Turnkey signing) before enabling the site for users.

**PumpPortal**
- Frame shapes and units (`create` / `buy` / `sell` / `migrate` fields; SOL and whole-token units;
  `vSolInBondingCurve` / `vTokensInBondingCurve` as post-trade virtual reserves; `newTokenBalance`).
- Whether `subscribeTokenTrade` also delivers PumpSwap (`pool: 'pump-amm'`) trades after migration.
- Ack / error / refusal wording; API-key requirement and funding for trade streams; rate and key
  limits (we send ≤100 keys per message, batches every 250 ms); whether protocol pings are answered.
- Capture real frames and replace the synthesized fixtures in `apps/server/test/fixtures/pumpportal`.

**pump.fun / PumpSwap**: verified read-only on mainnet with `apps/server/scripts/sol-exec-verify.ts`
(October 2026; every swap built by the venue for a real funded wallet and run through
`simulateTransaction`, nothing sent; captured accounts and simulated landings in
`apps/server/test/fixtures/rpc/sim-*.json`):
- Curve constants decoded from Global / FeeConfig / BondingCurve with the SDK: 30 SOL / 1.073B virtual,
  793.1M curve tokens, 1B supply, 6 decimals, fee 0.95% protocol + 0.30% creator = 1.25%; the SDK's
  buyback fee recipients match `Global.buybackFeeRecipients`.
- `@pump-fun/pump-sdk` 4.2.0 legacy `buy` / `sell` (18 accounts with the bonding-curve v2 PDA and a buyback
  recipient) and `@pump-fun/pump-swap-sdk` 2.2.0 v1 pool `buy` / `sell` accepted on Token-2022 mints, normal
  and mayhem curves; a curve buy costs exactly the quoted lamports and a sell pays exactly the quote;
  slippage refusals are pump 6002 / 6003 and pump-amm 6004. Compute used: curve buy ~85-100k (with the
  token account and volume accumulator), sell ~50-70k; pool buy ~100-125k, sell ~90k: well inside the
  200k / 150k (curve) and 200k / 160k (pool) limits. A pool buy with fee and tip is ~1180 bytes.
- Not verified: the migration itself (all real SOL + 206.9M tokens into the pool, LP burned) beyond the
  constants; a pool or curve created after the SDK version (re-run the script after SDK upgrades).

**Jupiter**: verified on `lite-api.jup.ag` (served, no key) with recorded responses in
`apps/server/test/fixtures/jupiter`: quote and swap-instructions fields (`routePlan[].bps` may be null;
new `loadedAccountsDataSize`, `addressesByLookupTableAddress`, `simulationError`), lookup tables resolved
and used, refusals `400 {error, errorCode}` with `NO_ROUTES_FOUND` / `TOKEN_NOT_TRADABLE` (the code formerly
documented as `COULD_NOT_FIND_ANY_ROUTE` is still accepted), slippage error 6001 on chain. swap-instructions
answers 200 with `simulationError` and a 1,400,000 limit when its own simulation fails: the venue refuses a
`TRANSACTION_ERROR` before signing and ignores the limit otherwise. The route instruction carries
`quoted_out_amount` and `slippage_bps` (not `otherAmountThreshold`). Not verified here: `x-api-key` on
`api.jup.ag` and the Price API v3 (no key available; enrichment's area).

**Solana RPC**: `getTransaction` pre/post token balances with `owner` and lookup-table account ordering
checked on real legacy and v0 transactions (`test/fixtures/rpc/real-*.json`), web3.js's parsed response
reading the same; a sell that closes its token account refunds the rent (booked as rent, not proceeds).
Still to check: `getSignaturesForAddress` paging, `getParsedTokenAccountsByOwner` shapes (public endpoints
refuse "indexed" methods: use a provider), `SendTransactionError` on a real refusal, metadata decoding.

**Jito**: `getTipAccounts` returns exactly the 8 accounts in `JITO_TIP_ACCOUNTS`; landed tips (bundles.jito.wtf
tip floor, October 2026) run p25 ~2-6k, p50 ~4-11k, p95 ~30-150k lamports, so the 1000-lamport minimum is a
floor and the presets' 0.001-0.004 SOL tips are generous. Not verified (nothing may be sent from the
verification environment): `sendTransaction?bundleOnly=true` responses and rate limits for rebroadcasting
every 2 s.

**Turnkey** (no credentials available: request and response shapes are checked at compile time against
`@turnkey/sdk-server` 8.7.1 and `@turnkey/solana` 1.1.47, which signs the serialized v0 transaction through
`ACTIVITY_TYPE_SIGN_TRANSACTION_V2` / `TRANSACTION_TYPE_SOLANA`; everything below needs a real organization)
- `createWallet` / `getWallets` / `getWalletAccounts` behaviour, wallet-name uniqueness on retry, latency
  of `createWallet` inline in registration (no timeout of our own), `@turnkey/solana` signing of v0
  transactions, and the policy syntax in section 3.

**Product**
- Authenticator apps scanning the generated `otpauth://` URI; deposit QR codes in wallet apps; token
  images from IPFS gateways under the live CSP.
