// Read-only verification of the live Solana wallets and enrichment stack against mainnet: signature
// paging and the deposit scanner (SOL, SPL and Token-2022, legacy / v0 with lookup tables / v1),
// balance reads, withdrawal transactions (SOL, SPL and Token-2022 with the recipient's account
// created) simulated from real funded owners, mint / metadata / holder / pool reads, the on-demand
// lookup, IPFS metadata through the SSRF-guarded fetcher and the configured gateways, token images
// under the live CSP, and Jupiter Price v3. Prints a table; exits 1 when a check fails.
//
// Nothing is signed or sent: transactions are checked with simulateTransaction (sigVerify off,
// recent blockhash replaced). No keys are used. Requests are paced for public endpoints.
//
// Usage: npx tsx scripts/sol-wallets-verify.ts
//   SOLANA_RPC_URL        default https://api.mainnet-beta.solana.com
//   VERIFY_INDEX_RPC_URL  getTokenLargestAccounts (public mainnet-beta and publicnode refuse it),
//                         default https://public.rpc.solanavibestation.com
//   JUPITER_API_URL       default https://lite-api.jup.ag
//   IPFS_GATEWAYS         default the server's DEFAULT_IPFS_GATEWAYS
//   VERIFY_PUMP_MINT      a pump.fun mint to use instead of waiting for a launch on PumpPortal

import { createRequire } from 'node:module';
import { Connection, Keypair, PublicKey, SystemProgram, type VersionedTransactionResponse } from '@solana/web3.js';
import { WSOL_MINT, type WalletTransfer } from '@trenchscope/shared';
import WebSocket from 'ws';
import { securityHeaders } from '../src/app';
import type { AppContext } from '../src/context';
import { DEFAULT_IPFS_GATEWAYS } from '../src/live/config';
import { RequestBudget } from '../src/live/enrich/budget';
import { fetchPublicJson } from '../src/live/enrich/http';
import { TokenLookup } from '../src/live/enrich/lookup';
import { fetchTokenMetadata, metadataUrls } from '../src/live/enrich/metadata';
import { parseMintAccount, readMint, readPumpPool, readTopHolders } from '../src/live/enrich/onchain';
import { PRICE_IDS_PER_REQUEST, fetchJupiterPrices } from '../src/live/enrich/prices';
import { safeImageUrl } from '../src/live/enrich/sanitize';
import { accountKeysOf, type TxLike } from '../src/live/execution/fills';
import { compileV0, computeBudgetInstructions } from '../src/live/execution/tx';
import { readChainBalances } from '../src/live/wallets/balances';
import { MAX_TX_VERSION, parseDeposits, readTransaction } from '../src/live/wallets/deposits';
import { rentExemptLamports } from '../src/live/wallets/rent';
import { LiveWallets } from '../src/live/wallets/service';
import { WithdrawalRefused, planWithdrawal, type WithdrawalPlan } from '../src/live/wallets/withdrawals';
import { World } from '../src/sim/world';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const INDEX_RPC_URL = process.env.VERIFY_INDEX_RPC_URL ?? 'https://public.rpc.solanavibestation.com';
const JUPITER_URL = process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag';
const GATEWAYS = (process.env.IPFS_GATEWAYS ?? DEFAULT_IPFS_GATEWAYS).split(',').map((g) => g.trim()).filter(Boolean);

/** Busy, funded addresses used read-only: an exchange hot wallet (SOL, USDC, USDT) and pump.fun's fee recipient. */
const HOT_WALLET = new PublicKey('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9');
const PUMP_FEE_RECIPIENT = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const BONK = new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
/** A pump.fun token whose curve completed before PumpSwap existed (it trades on Raydium). */
const FARTCOIN = new PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');
/** A pump.fun Token-2022 launch of October 2026 with holders (the test fixtures' mint). */
const KNOWN_PUMP_T22 = new PublicKey('HLoBR4vGmDBforxxTGn6SaBe5BD82cXJmg9FCShYpump');
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const requireCjs = createRequire(import.meta.url);
const pumpSdk = requireCjs('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a minimum gap between requests (public RPCs rate-limit per method). */
function pacedFetch(gapMs: number): typeof fetch {
  let next = 0;
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gapMs;
    if (at > now) await sleep(at - now);
    return fetch(input, init);
  }) as typeof fetch;
}

const connection = new Connection(RPC_URL, { commitment: 'confirmed', fetch: pacedFetch(300) });
const indexConnection = new Connection(INDEX_RPC_URL, { commitment: 'confirmed', fetch: pacedFetch(1500) });

// ---------------------------------------------------------------------------
// results table
// ---------------------------------------------------------------------------

type Result = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
const rows: { area: string; check: string; result: Result; evidence: string }[] = [];

function record(area: string, check: string, result: Result, evidence: string): void {
  rows.push({ area, check, result, evidence });
  console.log(`[${result}] ${area}: ${check} -- ${evidence}`);
}

async function check(area: string, name: string, fn: () => Promise<{ result: Result; evidence: string }>): Promise<void> {
  try {
    const { result, evidence } = await fn();
    record(area, name, result, evidence);
  } catch (err) {
    record(area, name, 'FAIL', `threw: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
  }
}

function printTable(): void {
  const width = { area: 11, check: 62 };
  const line = `${'-'.repeat(4)}+${'-'.repeat(width.area + 2)}+${'-'.repeat(width.check + 2)}+${'-'.repeat(8)}+${'-'.repeat(60)}`;
  console.log(`\n${line}`);
  console.log(`  # | ${'area'.padEnd(width.area)} | ${'check'.padEnd(width.check)} | result | evidence`);
  console.log(line);
  rows.forEach((r, i) => {
    const check = r.check.length > width.check ? `${r.check.slice(0, width.check - 1)}…` : r.check;
    console.log(`${String(i + 1).padStart(3)} | ${r.area.padEnd(width.area)} | ${check.padEnd(width.check)} | ${r.result.padEnd(6)} | ${r.evidence}`);
  });
  console.log(line);
  const count = (x: Result) => rows.filter((r) => r.result === x).length;
  console.log(`${count('PASS')} pass, ${count('WARN')} warn, ${count('SKIP')} skip, ${count('FAIL')} fail`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const lamports = (n: bigint | number) => `${n.toString()} lamports`;
const fmtSig = (s: string) => `${s.slice(0, 8)}…`;

async function rawTransaction(signature: string): Promise<(TxLike & { version: unknown }) | null> {
  const res = await pacedRaw('getTransaction', [signature, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed', encoding: 'json' }]);
  return res as (TxLike & { version: unknown }) | null;
}

const rawFetch = pacedFetch(300);
async function pacedRaw(method: string, params: unknown[], url = RPC_URL): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await rawFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const body = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }
  throw new Error(`${method}: rate limited`);
}

/** A pump.fun launch from PumpPortal: its mint, creator and metadata uri. */
async function freshPumpLaunch(timeoutMs = 45_000): Promise<{ mint: string; creator: string; uri: string } | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    const done = (v: { mint: string; creator: string; uri: string } | null) => {
      clearTimeout(timer);
      ws.removeAllListeners();
      ws.on('error', () => {});
      ws.close();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    ws.on('open', () => ws.send(JSON.stringify({ method: 'subscribeNewToken' })));
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as { txType?: string; mint?: string; traderPublicKey?: string; uri?: string; pool?: string };
      if (m.txType === 'create' && m.pool === 'pump' && m.mint && m.traderPublicKey && m.uri?.includes('/ipfs/')) done({ mint: m.mint, creator: m.traderPublicKey, uri: m.uri });
    });
    ws.on('error', () => done(null));
  });
}

/** readTransaction, patient with public rate limits (getTransaction is limited per method). */
async function readTx(signature: string): ReturnType<typeof readTransaction> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readTransaction(connection, signature);
    } catch (err) {
      if (attempt >= 4 || !/429|Too many/i.test(String(err))) throw err;
      await sleep(4000 * (attempt + 1));
    }
  }
}

/** Runs an RPC read, waiting out rate limits (the public indexed-method endpoint allows very few calls). */
async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 5 || !/429|Too many/i.test(String(err))) throw err;
      await sleep(5000 * (attempt + 1));
    }
  }
}

/** Simulate a planned withdrawal from `owner` (never sent), watching `watch` accounts. */
async function simulate(owner: PublicKey, plan: Pick<WithdrawalPlan, 'instructions'>, watch: PublicKey[] = []) {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = compileV0(owner, blockhash, plan.instructions);
  const res = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: 'confirmed',
    accounts: watch.length ? { encoding: 'base64', addresses: watch.map((w) => w.toBase58()) } : undefined,
  });
  const accounts = (res.value.accounts ?? []).map((a) => (a ? { lamports: a.lamports, bytes: Buffer.from(a.data[0], 'base64').length, owner: a.owner } : null));
  return { err: res.value.err, units: res.value.unitsConsumed ?? 0, accounts, logs: res.value.logs ?? [] };
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`RPC ${RPC_URL} · index RPC ${INDEX_RPC_URL} · Jupiter ${JUPITER_URL} · gateways ${GATEWAYS.join(', ')}\n`);

  // -- rent --------------------------------------------------------------------
  await check('rent', 'rent-exempt minimums as the cluster states them (rent.ts)', async () => {
    const [r0, r165, r170] = await Promise.all([0, 165, 170].map((n) => rentExemptLamports(connection, n)));
    const sysvar = (await connection.getParsedAccountInfo(new PublicKey('SysvarRent111111111111111111111111111111111'))).value?.data as { parsed?: { info?: Record<string, unknown> } };
    const ok = r0 === 650_240n && r165 === 1_488_440n && r170 === 1_513_840n;
    return { result: ok ? 'PASS' : 'WARN', evidence: `0 B ${r0}, 165 B ${r165}, 170 B ${r170} (sysvar ${JSON.stringify(sysvar?.parsed?.info)}; pre-2026 constants 890880 / 2039280)` };
  });

  // -- signatures --------------------------------------------------------------
  await check('signatures', 'getSignaturesForAddress paging: newest first, before/until exclusive', async () => {
    const p1 = await connection.getSignaturesForAddress(HOT_WALLET, { limit: 5 }, 'confirmed');
    const p2 = await connection.getSignaturesForAddress(HOT_WALLET, { limit: 5, before: p1[4].signature }, 'confirmed');
    const window = await connection.getSignaturesForAddress(HOT_WALLET, { limit: 100, until: p2[4].signature, before: p1[2].signature }, 'confirmed');
    const until = await connection.getSignaturesForAddress(HOT_WALLET, { limit: 1000, until: p2[2].signature }, 'confirmed');
    const all = [...p1, ...p2];
    const ordered = all.every((s, i) => i === 0 || all[i - 1].slot >= s.slot);
    const disjoint = !p2.some((s) => p1.some((x) => x.signature === s.signature));
    const expectWindow = [p1[3], p1[4], p2[0], p2[1], p2[2], p2[3]].map((s) => s.signature);
    const windowOk = JSON.stringify(window.map((s) => s.signature)) === JSON.stringify(expectWindow);
    const untilOk = !until.some((s) => s.signature === p2[2].signature) && until[until.length - 1].signature === p2[1].signature;
    const keys = Object.keys(p1[0]).sort().join(',');
    return { result: ordered && disjoint && windowOk && untilOk ? 'PASS' : 'FAIL', evidence: `ordered ${ordered}, before exclusive ${disjoint}, until+before window ${windowOk}, until exclusive ${untilOk}; entry {${keys}}` };
  });

  // -- transaction versions ---------------------------------------------------
  const curveOf = (mint: PublicKey) => pumpSdk.bondingCurvePda(mint);
  const launch = process.env.VERIFY_PUMP_MINT ? { mint: process.env.VERIFY_PUMP_MINT, creator: '', uri: '' } : await freshPumpLaunch();
  if (!launch) record('setup', 'a fresh pump.fun launch from PumpPortal', 'WARN', 'none within 45 s; pump checks use Fartcoin / skip');
  else record('setup', 'a fresh pump.fun launch from PumpPortal', 'PASS', `${launch.mint} by ${launch.creator || '(given)'}`);

  let altTx: { sig: string; tx: TxLike } | null = null;
  let altTxLoaded = false;
  await check('deposits', 'transaction versions in the wild: v0 reads refuse v1, readTransaction reads all', async () => {
    const sigs = (await connection.getSignaturesForAddress(PUMP_FEE_RECIPIENT, { limit: 40 }, 'confirmed')).filter((s) => !s.err).slice(0, 24);
    const mix: Record<string, number> = {};
    let refusedAtV0 = 0;
    let unreadable = 0;
    let read = 0;
    for (const s of sigs) {
      // A dozen is enough once a v1 transaction was among them.
      if (read >= 12 && mix['1']) break;
      read++;
      const res = await readTx(s.signature);
      if (res.status !== 'ok') {
        unreadable++;
        continue;
      }
      const version = String((res.tx as unknown as VersionedTransactionResponse).version);
      mix[version] = (mix[version] ?? 0) + 1;
      if (version === '1' && refusedAtV0 === 0) {
        // What the scanner asked for before: maxSupportedTransactionVersion 0.
        for (let attempt = 0; attempt < 4; attempt++) {
          const old = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).then(() => 'read', (e: Error) => e.message);
          if (/429|Too many/i.test(old)) {
            await sleep(4000 * (attempt + 1));
            continue;
          }
          if (/version \(1\) is not supported/.test(old)) refusedAtV0++;
          break;
        }
      }
      // Prefer a v0 transaction that loads the fee recipient through a lookup table.
      const message = res.tx.transaction.message as { addressTableLookups?: unknown[]; staticAccountKeys?: unknown[] };
      const loaded = accountKeysOf(res.tx).indexOf(PUMP_FEE_RECIPIENT.toBase58()) >= (message.staticAccountKeys?.length ?? Infinity);
      if (version === '0' && message.addressTableLookups?.length && (!altTx || (loaded && !altTxLoaded))) {
        altTx = { sig: s.signature, tx: res.tx };
        altTxLoaded = loaded;
      }
    }
    const hasV1 = (mix['1'] ?? 0) > 0;
    return {
      result: unreadable === 0 ? (hasV1 && refusedAtV0 === 0 ? 'WARN' : 'PASS') : 'FAIL',
      evidence: `${JSON.stringify(mix)} over ${read} pump.fee-recipient txs; maxSupportedTransactionVersion 0 refused v1: ${hasV1 ? refusedAtV0 > 0 : 'n/a (no v1 seen)'}; unreadable with v${MAX_TX_VERSION}: ${unreadable}`,
    };
  });

  await check('deposits', 'lookup-table key order: accountKeysOf(web3) = static + loaded writable + readonly (RPC json)', async () => {
    if (!altTx) return { result: 'SKIP', evidence: 'no v0 transaction with lookup tables seen' };
    const { sig, tx } = altTx;
    const raw = await rawTransaction(sig);
    const meta = raw!.meta!;
    const rawKeys = [...((raw!.transaction.message as { accountKeys: string[] }).accountKeys), ...(meta.loadedAddresses?.writable ?? []), ...(meta.loadedAddresses?.readonly ?? [])].map(String);
    const same = JSON.stringify(accountKeysOf(tx)) === JSON.stringify(rawKeys);
    const loaded = rawKeys.length - (raw!.transaction.message as { accountKeys: string[] }).accountKeys.length;
    const feeIdx = rawKeys.indexOf(PUMP_FEE_RECIPIENT.toBase58());
    const dep = parseDeposits(tx, PUMP_FEE_RECIPIENT.toBase58());
    const delta = feeIdx >= 0 ? BigInt(meta.postBalances[feeIdx]) - BigInt(meta.preBalances[feeIdx]) : 0n;
    const depOk = delta > 0n ? dep.length === 1 && dep[0].raw === delta : dep.length === 0;
    return { result: same && depOk ? 'PASS' : 'FAIL', evidence: `${fmtSig(sig)}: ${rawKeys.length} keys (${loaded} loaded), identical ${same}; fee recipient at #${feeIdx} gained ${lamports(delta)}, parseDeposits ${dep.map((d) => d.raw).join(',') || 'none'}` };
  });

  // Exchange withdrawals: a SOL transfer and SPL transfers into existing token accounts.
  const splExamples: { sig: string; slot: number; owner: string; account: string; mint: string; raw: bigint }[] = [];
  await check('deposits', 'exchange withdrawals parse as deposits (SOL; SPL into an existing account)', async () => {
    const sigs = (await connection.getSignaturesForAddress(HOT_WALLET, { limit: 40 }, 'confirmed')).filter((s) => !s.err);
    let sol: string | null = null;
    for (const s of sigs) {
      if (sol && splExamples.length >= 4) break;
      const res = await readTx(s.signature);
      if (res.status !== 'ok') continue;
      const tx = res.tx;
      const keys = accountKeysOf(tx);
      const meta = tx.meta!;
      if (!sol && !(meta.postTokenBalances ?? []).length) {
        const i = keys.findIndex((_k, idx) => idx > 0 && meta.postBalances[idx] > meta.preBalances[idx]);
        if (i > 0) {
          const d = parseDeposits(tx, keys[i]);
          const delta = BigInt(meta.postBalances[i] - meta.preBalances[i]);
          if (d.length === 1 && d[0].mint === null && d[0].raw === delta && d[0].from === HOT_WALLET.toBase58()) sol = `${fmtSig(s.signature)} ${lamports(delta)} to ${keys[i].slice(0, 6)}…`;
        }
      }
      for (const b of meta.postTokenBalances ?? []) {
        const before = (meta.preTokenBalances ?? []).find((p) => p.accountIndex === b.accountIndex);
        if (!before || !b.owner || b.owner === HOT_WALLET.toBase58() || keys.includes(b.owner)) continue;
        const gained = BigInt(b.uiTokenAmount.amount) - BigInt(before.uiTokenAmount.amount);
        if (gained <= 0n) continue;
        const d = parseDeposits(tx, b.owner);
        if (d.length === 1 && d[0].mint === b.mint && d[0].raw === gained) splExamples.push({ sig: s.signature, slot: s.slot, owner: b.owner, account: keys[b.accountIndex], mint: b.mint, raw: gained });
      }
    }
    const spl = splExamples[0];
    return {
      result: sol && spl ? 'PASS' : 'WARN',
      evidence: `SOL ${sol ?? 'none seen'}; SPL ${spl ? `${fmtSig(spl.sig)} ${spl.raw} of ${spl.mint.slice(0, 6)}… to ${spl.owner.slice(0, 6)}… (wallet not among the keys; ${splExamples.length} such)` : 'none seen'}`,
    };
  });

  await check('deposits', 'an SPL deposit into an existing account is listed for the token account, not the wallet', async () => {
    const ex = splExamples[0];
    if (!ex) return { result: 'SKIP', evidence: 'no example found' };
    const owner = await connection.getSignaturesForAddress(new PublicKey(ex.owner), { limit: 1000 }, 'confirmed');
    const account = await connection.getSignaturesForAddress(new PublicKey(ex.account), { limit: 1000 }, 'confirmed');
    const inOwner = owner.some((s) => s.signature === ex.sig);
    const inAccount = account.some((s) => s.signature === ex.sig);
    // Conclusive when the wallet's list reaches back past the transaction.
    const conclusive = owner.length < 1000 || owner[owner.length - 1].slot < ex.slot;
    return { result: !inAccount || inOwner ? 'FAIL' : conclusive ? 'PASS' : 'WARN', evidence: `wallet list (${owner.length}) has it: ${inOwner}; token account list (${account.length}) has it: ${inAccount}` };
  });

  await check('deposits', 'LiveWallets scan end to end on such a wallet (real RPC): the deposit is recorded', async () => {
    for (const ex of splExamples) {
      const programs = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TOKEN_2022].map((p) => new PublicKey(p));
      let count = 0;
      for (const programId of programs) count += (await connection.getParsedTokenAccountsByOwner(new PublicKey(ex.owner), { programId }, 'confirmed')).value.length;
      const ownerSigs = await connection.getSignaturesForAddress(new PublicKey(ex.owner), { limit: 30 }, 'confirmed');
      // First scans read up to 20 transactions per address: keep it to a small wallet on a public RPC.
      if (count > 3 || ownerSigs.length > 20) continue;
      const { wallets, store } = scanHarness(ex.owner);
      await wallets.pass();
      const found = store.transfers.find((t) => t.signature === ex.sig && t.mint === ex.mint);
      const cursors = Object.keys((store.state.get('live-wallets') as { cursors: Record<string, string> } | undefined)?.cursors ?? {});
      return {
        result: found ? 'PASS' : 'FAIL',
        evidence: `${ex.owner.slice(0, 6)}… (${count} token accounts): ${store.transfers.length} deposit(s) recorded, cursors on ${cursors.length} addresses; ${found ? `${found.amount} ${found.mint?.slice(0, 6)}… from ${found.counterparty?.slice(0, 6)}…, read through its token account` : 'the example is missing'}`,
      };
    }
    return { result: 'SKIP', evidence: `none of ${splExamples.length} recipients is small enough for first scans on a public RPC` };
  });

  // -- balances ----------------------------------------------------------------
  await check('balances', 'getParsedTokenAccountsByOwner (both programs) -> readChainBalances', async () => {
    const owner = launch?.creator ? new PublicKey(launch.creator) : PUMP_FEE_RECIPIENT;
    const b = await readChainBalances(connection, owner);
    const parts = [...b.tokens.values()].flatMap((t) => t.parts);
    const t22 = [...b.tokens.values()].filter((t) => t.program === TOKEN_2022).length;
    return { result: b.complete ? 'PASS' : 'FAIL', evidence: `${owner.toBase58().slice(0, 6)}…: ${b.lamports} lamports, ${b.tokens.size} mints (${t22} Token-2022) in ${parts.length} accounts, ${parts.filter((p) => p.frozen).length} frozen, complete ${b.complete}` };
  });

  // -- pump.fun tokens with holders: a migrated one (PumpSwap) and a known Token-2022 one --------------------
  let migratedMint: PublicKey | null = null;
  await check('enrich', 'PumpSwap pool of a migrated pump.fun token', async () => {
    const sigs = await connection.getSignaturesForAddress(new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'), { limit: 20 }, 'confirmed');
    for (const s of sigs.filter((x) => !x.err).slice(0, 8)) {
      const res = await readTx(s.signature);
      if (res.status !== 'ok') continue;
      const mint = (res.tx.meta?.postTokenBalances ?? []).map((b) => b.mint).find((m) => m.endsWith('pump'));
      if (!mint) continue;
      const pool = await readPumpPool(connection, new PublicKey(mint), (fn) => fn());
      if (!pool) continue;
      migratedMint = new PublicKey(mint);
      return { result: pool.native > 0 && pool.tokens > 0 ? 'PASS' : 'FAIL', evidence: `${mint.slice(0, 6)}…: pool ${pool.address.slice(0, 6)}… ${pool.native.toFixed(3)} SOL / ${pool.tokens.toFixed(0)} tokens` };
    }
    return { result: 'SKIP', evidence: 'no pump.fun token in recent PumpSwap transactions' };
  });

  const holderMints = [migratedMint as PublicKey | null, KNOWN_PUMP_T22, launch ? new PublicKey(launch.mint) : null].filter((m): m is PublicKey => !!m);
  const holdersOf = new Map<string, { owner: string; balance: number }[]>();
  await check('enrich', 'top holders: getTokenLargestAccounts + owners, program-owned accounts left out', async () => {
    const parts: string[] = [];
    let ok = true;
    for (const mint of holderMints.slice(0, 2)) {
      let holders: Awaited<ReturnType<typeof readTopHolders>>;
      try {
        holders = await readTopHolders(indexConnection, mint, patiently);
      } catch (err) {
        // The free indexed-method endpoint has a small quota: out of it is not a finding about our code.
        if (/429|Too many/i.test(String(err))) return { result: 'WARN', evidence: `${new URL(INDEX_RPC_URL).host} rate-limited this client (429); set VERIFY_INDEX_RPC_URL to an RPC that indexes both token programs` };
        throw err;
      }
      holdersOf.set(mint.toBase58(), holders);
      const excluded = [curveOf(mint).toBase58(), pumpSdk.canonicalPumpPoolPda(mint).toBase58()];
      ok &&= holders.length > 0 && !holders.some((h) => excluded.includes(h.owner)) && holders.every((h) => PublicKey.isOnCurve(new PublicKey(h.owner).toBytes()));
      parts.push(`${mint.toBase58().slice(0, 6)}… ${holders.length} wallets, top ${holders[0]?.balance.toFixed(0)}`);
    }
    return { result: ok ? 'PASS' : 'FAIL', evidence: `${parts.join('; ')} (curve / pool / PDAs excluded) via ${new URL(INDEX_RPC_URL).host}` };
  });

  await check('enrich', 'top holders on the public mainnet endpoint (needs an indexed-method RPC)', async () => {
    const res = await connection.getTokenLargestAccounts(USDC, 'confirmed').then(() => 'served', (e: Error) => e.message.slice(0, 90));
    return { result: res === 'served' ? 'PASS' : 'WARN', evidence: `${new URL(RPC_URL).host}: ${res}` };
  });

  // -- withdrawals (simulated) ---------------------------------------------------
  await check('withdrawals', 'SOL to a funded address: planned, simulated from a funded owner', async () => {
    const plan = await planWithdrawal(connection, { owner: HOT_WALLET, to: PUMP_FEE_RECIPIENT, mint: null, amount: 0.01, committed: 0n });
    const sim = await simulate(HOT_WALLET, plan);
    return { result: !sim.err && sim.units <= 1000 ? 'PASS' : 'FAIL', evidence: `err ${JSON.stringify(sim.err)}, ${sim.units} CU of 1000, fee ${plan.networkFeeLamports}` };
  });

  await check('withdrawals', 'SOL to an empty address: below rent refused (and fails on chain), at rent lands', async () => {
    const fresh = Keypair.generate().publicKey;
    const min = await rentExemptLamports(connection, 0);
    const below = Number(min - 1n) / 1e9;
    const refused = await planWithdrawal(connection, { owner: HOT_WALLET, to: fresh, mint: null, amount: below, committed: 0n }).then(() => null, (e: unknown) => e);
    const raw = await simulate(HOT_WALLET, { instructions: [...computeBudgetInstructions(1000, 10_000n), SystemProgram.transfer({ fromPubkey: HOT_WALLET, toPubkey: fresh, lamports: min - 1n })] });
    const plan = await planWithdrawal(connection, { owner: HOT_WALLET, to: fresh, mint: null, amount: Number(min) / 1e9, committed: 0n });
    const ok = await simulate(HOT_WALLET, plan, [fresh]);
    const pass = refused instanceof WithdrawalRefused && /InsufficientFundsForRent/.test(JSON.stringify(raw.err)) && !ok.err && ok.accounts[0]?.lamports === Number(min);
    return { result: pass ? 'PASS' : 'FAIL', evidence: `min ${lamports(min)}; planner: ${refused instanceof Error ? refused.message : 'accepted'}; chain at min-1: ${JSON.stringify(raw.err)}; at min: err ${JSON.stringify(ok.err)}, account ${ok.accounts[0]?.lamports}` };
  });

  await check('withdrawals', 'USDC (SPL Token) to a fresh wallet: ATA created idempotently + transferChecked', async () => {
    const fresh = Keypair.generate().publicKey;
    const plan = await planWithdrawal(connection, { owner: HOT_WALLET, to: fresh, mint: USDC, amount: 1.5, committed: 0n, symbol: 'USDC' });
    const sim = await simulate(HOT_WALLET, plan, [plan.token!.destination]);
    const created = sim.accounts[0];
    const pass = !sim.err && created?.bytes === plan.token!.destinationBytes && BigInt(created.lamports) === plan.rentLamports && sim.units <= 60_000;
    return { result: pass ? 'PASS' : 'FAIL', evidence: `err ${JSON.stringify(sim.err)}, ${sim.units} CU of 60000; new account ${created?.bytes} B / ${created?.lamports} lamports vs planned ${plan.token!.destinationBytes} B / ${plan.rentLamports}` };
  });

  await check('withdrawals', 'pump.fun Token-2022 token to a fresh wallet: 170-byte ATA, transferChecked', async () => {
    const candidates: { owner: PublicKey; mint: PublicKey }[] = [];
    if (launch?.creator) candidates.push({ owner: new PublicKey(launch.creator), mint: new PublicKey(launch.mint) });
    for (const mint of holderMints) for (const h of (holdersOf.get(mint.toBase58()) ?? []).slice(0, 6)) candidates.push({ owner: new PublicKey(h.owner), mint });
    for (const c of candidates) {
      if ((await connection.getAccountInfo(c.mint, 'confirmed'))?.owner.toBase58() !== TOKEN_2022) continue;
      if ((await connection.getBalance(c.owner, 'confirmed')) < 10_000_000) continue;
      const held = await connection.getParsedTokenAccountsByOwner(c.owner, { mint: c.mint }, 'confirmed');
      const raw = held.value.reduce((s, a) => s + BigInt((a.account.data.parsed as { info: { tokenAmount: { amount: string } } }).info.tokenAmount.amount), 0n);
      if (raw < 1_000_000n) continue;
      const fresh = Keypair.generate().publicKey;
      const plan = await planWithdrawal(connection, { owner: c.owner, to: fresh, mint: c.mint, amount: 1, committed: 0n });
      const sim = await simulate(c.owner, plan, [plan.token!.destination]);
      const created = sim.accounts[0];
      const pass = !sim.err && plan.token!.program.toBase58() === TOKEN_2022 && created?.bytes === 170 && created.bytes === plan.token!.destinationBytes && BigInt(created.lamports) === plan.rentLamports && sim.units <= 60_000;
      return {
        result: pass ? 'PASS' : 'FAIL',
        evidence: `${c.mint.toBase58().slice(0, 6)}… from holder ${c.owner.toBase58().slice(0, 6)}…: err ${JSON.stringify(sim.err)}, ${sim.units} CU of 60000; new account ${created?.bytes} B / ${created?.lamports} lamports vs planned ${plan.token!.destinationBytes} B / ${plan.rentLamports}`,
      };
    }
    return { result: 'SKIP', evidence: `no funded holder among ${candidates.length} candidates` };
  });

  // -- enrichment ----------------------------------------------------------------
  await check('enrich', 'readMint: pump.fun Token-2022 metadata extension + curve; BONK Metaplex', async () => {
    const pump = launch ? await readMint(connection, new PublicKey(launch.mint)) : null;
    const bonk = await readMint(connection, BONK);
    const pumpOk = !launch || (!!pump?.meta?.name && pump.mint.decimals === 6 && pump.mint.mintAuthority === null && pump.mint.freezeAuthority === null && !!pump.curve && !pump.curve.complete);
    const bonkOk = bonk?.meta?.symbol === 'Bonk' && bonk.mint.decimals === 5 && /^https:\/\//.test(bonk.meta.uri);
    return {
      result: pumpOk && bonkOk ? 'PASS' : 'FAIL',
      evidence: `${pump ? `${pump.meta?.symbol} (${pump.meta?.uri.slice(0, 40)}…), curve ${pump.curve?.virtualNative.toFixed(2)} SOL virtual, creator ${pump.curve?.creator.slice(0, 6)}…` : 'no launch'}; BONK ${bonk?.meta?.name} / ${bonk?.meta?.symbol} decimals ${bonk?.mint.decimals}`,
    };
  });

  await check('enrich', 'mint / freeze authorities (jsonParsed mint)', async () => {
    const usdc = parseMintAccount((await connection.getParsedAccountInfo(USDC, 'confirmed')).value);
    const bonk = parseMintAccount((await connection.getParsedAccountInfo(BONK, 'confirmed')).value);
    const ok = !!usdc?.mintAuthority && !!usdc.freezeAuthority && bonk?.mintAuthority === null && bonk.freezeAuthority === null;
    return { result: ok ? 'PASS' : 'FAIL', evidence: `USDC mint ${usdc?.mintAuthority?.slice(0, 6)}… freeze ${usdc?.freezeAuthority?.slice(0, 6)}…; BONK renounced ${bonk?.mintAuthority === null && bonk?.freezeAuthority === null}` };
  });

  await check('enrich', 'lookup: a pump.fun token that predates PumpSwap is Jupiter-priced, not stuck migrating', async () => {
    const world = new World('verify', Date.now());
    const sol = (await fetchJupiterPrices([WSOL_MINT], { baseUrl: JUPITER_URL })).get(WSOL_MINT)?.usdPrice ?? 0;
    world.setNativeUsd('sol', sol);
    const lookup = new TokenLookup({ world, connection: () => connection, budget: new RequestBudget({ rps: 3 }), jupiter: { baseUrl: JUPITER_URL } });
    const t = await lookup.ensure(FARTCOIN.toBase58());
    const ok = t?.status === 'migrated' && t.launchpad === 'pump' && t.creator !== '11111111111111111111111111111111';
    return { result: ok ? 'PASS' : 'FAIL', evidence: `${t?.symbol}: status ${t?.status}, launchpad ${t?.launchpad}, creator ${t?.creator.slice(0, 6)}…, $${t ? world.priceUsd(t).toPrecision(4) : '?'}` };
  });

  // -- IPFS metadata and images -------------------------------------------------------
  const uri = launch?.uri || 'https://ipfs.io/ipfs/bafkreie5477ranpbfnvbyml4rzws6b2n5oj7jlrw43trh534k2cedmzmby';
  let imageUrl: string | null = null;
  let rawImage: string | null = null;
  await check('ipfs', 'each gateway on a real pump.fun metadata URI (SSRF-guarded fetcher, pinned transport)', async () => {
    const parts: string[] = [];
    let served = 0;
    for (const url of metadataUrls(uri, GATEWAYS)) {
      const t0 = Date.now();
      const r = await fetchPublicJson(url, { timeoutMs: 8000 }).then((j) => {
        rawImage ??= typeof (j as { image?: unknown }).image === 'string' ? ((j as { image: string }).image) : null;
        return 'ok';
      }, (e: Error) => e.message.slice(0, 40));
      if (r === 'ok') served++;
      parts.push(`${new URL(url).host} ${r} ${Date.now() - t0}ms`);
    }
    return { result: served > 0 ? 'PASS' : 'FAIL', evidence: parts.join('; ') };
  });

  await check('ipfs', 'fetchTokenMetadata through the configured gateways (production path)', async () => {
    const t0 = Date.now();
    const meta = await fetchTokenMetadata(uri, { gateways: GATEWAYS });
    imageUrl = meta.imageUrl;
    return { result: meta.imageUrl ? 'PASS' : 'WARN', evidence: `${Date.now() - t0}ms; image ${rawImage ?? '?'} -> ${meta.imageUrl}` };
  });

  await check('ipfs', 'retired defaults: ipfs.io / dweb.link / cloudflare-ipfs.com / cf-ipfs.com', async () => {
    const cid = uri.split('/ipfs/')[1];
    const parts: string[] = [];
    for (const host of ['ipfs.io', 'dweb.link', 'cloudflare-ipfs.com', 'cf-ipfs.com']) {
      const r = await fetch(`https://${host}/ipfs/${cid}`, { signal: AbortSignal.timeout(8000), redirect: 'manual' }).then(
        async (res) => {
          await res.body?.cancel();
          return String(res.status);
        },
        (e: Error & { cause?: { code?: string } }) => e.cause?.code ?? e.message.slice(0, 30),
      );
      parts.push(`${host} ${r}`);
    }
    const serving = parts.filter((p) => / 200$/.test(p));
    return { result: serving.length === 0 ? 'PASS' : 'WARN', evidence: `${parts.join('; ')}${serving.length ? ' (some still serve)' : ' (none serves: not defaults)'}` };
  });

  await check('ipfs', 'token image loads cross-origin in a browser under the live CSP', async () => {
    const csp = securityHeaders(null, 'live')['content-security-policy'];
    const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const browser = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', accept: 'image/avif,image/webp,image/*,*/*;q=0.8', 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site' };
    const probe = async (url: string) => {
      const res = await fetch(url, { headers: browser, signal: AbortSignal.timeout(15_000) });
      const type = res.headers.get('content-type') ?? '';
      const corp = res.headers.get('cross-origin-resource-policy');
      await res.body?.cancel();
      return { ok: res.status === 200 && type.startsWith('image/') && corp !== 'same-origin' && corp !== 'same-site', text: `${new URL(url).host} ${res.status} ${type || '-'}${corp ? ` CORP ${corp}` : ''}` };
    };
    const shown = imageUrl ?? safeImageUrl(rawImage, GATEWAYS);
    if (!shown) return { result: 'SKIP', evidence: 'no image in the metadata' };
    const ours = await probe(shown);
    const original = rawImage && rawImage !== shown ? await probe(rawImage).catch((e: Error) => ({ ok: false, text: e.message })) : null;
    const cspOk = /(^|\s)https:(\s|$)/.test(imgSrc);
    return { result: ours.ok && cspOk ? 'PASS' : 'FAIL', evidence: `img-src "${imgSrc}"; served ${ours.text}${original ? `; as written in metadata ${original.text}` : ''}` };
  });

  // -- prices ----------------------------------------------------------------------------
  await check('prices', 'Jupiter Price v3: shape and SOL/USD', async () => {
    const ids = [WSOL_MINT, USDC.toBase58(), ...(launch ? [launch.mint] : [])];
    const prices = await fetchJupiterPrices(ids, { baseUrl: JUPITER_URL });
    const sol = prices.get(WSOL_MINT);
    const ok = !!sol && sol.usdPrice > 1 && sol.usdPrice < 100_000 && sol.decimals === 9 && Math.abs((prices.get(USDC.toBase58())?.usdPrice ?? 0) - 1) < 0.05;
    return { result: ok ? 'PASS' : 'FAIL', evidence: `SOL $${sol?.usdPrice.toFixed(2)} (liquidity ${sol?.liquidity?.toExponential(2)}), USDC $${prices.get(USDC.toBase58())?.usdPrice.toFixed(4)}${launch ? `, launch ${prices.has(launch.mint) ? `$${prices.get(launch.mint)!.usdPrice.toPrecision(3)}` : 'unpriced'}` : ''}` };
  });

  await check('prices', `Jupiter Price v3: ids past the ${PRICE_IDS_PER_REQUEST}th are dropped without an error`, async () => {
    const filler = Array.from({ length: PRICE_IDS_PER_REQUEST - 1 }, () => Keypair.generate().publicKey.toBase58());
    const ids = [...filler, WSOL_MINT, USDC.toBase58()];
    await sleep(2000);
    const res = await fetch(`${JUPITER_URL.replace(/\/+$/, '')}/price/v3?ids=${ids.join(',')}`);
    const body = (await res.json()) as Record<string, unknown>;
    const ok = res.status === 200 && WSOL_MINT in body && !(USDC.toBase58() in body);
    return { result: ok ? 'PASS' : 'WARN', evidence: `HTTP ${res.status}; id #${PRICE_IDS_PER_REQUEST} (SOL) ${WSOL_MINT in body ? 'priced' : 'missing'}, id #${PRICE_IDS_PER_REQUEST + 1} (USDC) ${USDC.toBase58() in body ? 'priced' : 'dropped'}` };
  });
}

// ---------------------------------------------------------------------------
// a LiveWallets instance over the real RPC for one address (read-only: scans and balance reads)
// ---------------------------------------------------------------------------

function scanHarness(address: string) {
  const world = new World('verify', Date.now());
  const wallet = world.createWallet('sol', 'user', { address, accountId: 'verify', native: 0 });
  const store = {
    state: new Map<string, unknown>(),
    transfers: [] as WalletTransfer[],
    getState: (k: string) => store.state.get(k) ?? null,
    putState: (k: string, v: unknown) => void store.state.set(k, structuredClone(v)),
    transfersFor: () => [...store.transfers],
    upsertTransfer: (_a: string, t: WalletTransfer) => {
      store.transfers = [...store.transfers.filter((x) => x.id !== t.id), { ...t }];
    },
    openTransfers: () => [],
    transferByClientId: () => null,
  };
  const ctx = {
    config: { mode: 'live' },
    world,
    live: { config: {}, connection, signer: null },
    store,
    market: { ensureToken: async () => null },
    accounts: {
      walletRef: () => ({ chain: 'sol', address, provider: 'verify', providerWalletId: 'verify' }),
      walletFor: () => wallet,
      pushBalance: () => {},
      notify: (_id: string, n: object) => n,
      audit: () => {},
    },
  } as unknown as AppContext;
  const wallets = new LiveWallets(ctx);
  wallets.touch('verify');
  return { wallets, store };
}

main()
  .catch((err) => record('script', 'run', 'FAIL', err instanceof Error ? err.message : String(err)))
  .finally(() => {
    printTable();
    process.exit(rows.some((r) => r.result === 'FAIL') ? 1 : 0);
  });
