// Read-only verification of the Solana live execution stack against mainnet.
// Nothing is ever signed or sent: every swap is built exactly as LiveVenue
// builds it (plan + buildTransaction: compute budget, platform fee, route,
// Jito tip) for a real funded wallet, then run through simulateTransaction
// (sigVerify false, replaceRecentBlockhash true) and checked against the plan
// with the accounts' simulated post-state. It covers:
//
//   constants  pump.fun Global / FeeConfig / BondingCurve decoded with the SDK vs docs/LIVE.md
//   rent       rent-exempt minimums vs the venue's rent schedule
//   jito       getTipAccounts (JSON-RPC) vs JITO_TIP_ACCOUNTS, tip accounts on chain, landed-tip floor
//   pump       curve buy (first buy of a fresh wallet: token account + volume accumulator) and sell
//              (a launch's dev wallet), slippage refusals (6002 / 6003)
//   pumpswap   direct pool buy and sell of a migrated pump token, slippage refusal (6004), fallback
//   jupiter    Swap API v1 quote + swap-instructions (migrated token, USDC), lookup tables, error bodies,
//              slippage (simulationError and on-chain 6001)
//   fills      the fill parser on real confirmed transactions (legacy and v0 with lookup tables,
//              SPL and Token-2022), cross-checked against the programs' trade events
//
// Usage: npx tsx scripts/sol-exec-verify.ts [--rpc URL] [--indexed-rpc URL] [--jupiter URL]
//          [--jito URL] [--pumpportal URL] [--payer ADDRESS] [--fee-wallet ADDRESS]
//          [--only constants,rent,jito,pump,pumpswap,jupiter,fills] [--record]
// --rpc defaults to https://solana-rpc.publicnode.com; --indexed-rpc (token accounts by owner,
// signatures, transactions) to https://api.mainnet-beta.solana.com. --record rewrites the captured
// fixtures under test/fixtures/{jupiter,rpc} (user-specific addresses replaced by <PLACEHOLDERS>).

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as PumpSdk from '@pump-fun/pump-sdk';
import type * as PumpSwapSdk from '@pump-fun/pump-swap-sdk';
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  type AccountInfo,
  type Commitment,
  type GetMultipleAccountsConfig,
  type TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import WebSocket from 'ws';
import type { TradePreset } from '@trenchscope/shared';
import { HttpError, type AppContext, type LiveServices } from '../src/context';
import { defaultConfig } from '../src/app';
import type { LiveConfig } from '../src/live/config';
import { RENT_EXEMPT_MIN_LAMPORTS, TOKEN_ACCOUNT_RENT_LAMPORTS } from '../src/live/execution/amounts';
import { describeTxError, walletDelta, type TxLike } from '../src/live/execution/fills';
import { JITO_MIN_TIP_LAMPORTS, JITO_TIP_ACCOUNTS } from '../src/live/execution/jito';
import { JupiterClient, JupiterRouteError, swapInstructionsSchema, jupiterQuoteSchema, toInstruction, type JupiterQuote } from '../src/live/execution/jupiter';
import { OnlinePumpLoader, PUMP_BUY_COMPUTE_UNITS, PUMP_SELL_COMPUTE_UNITS, curveBuyInstructions } from '../src/live/execution/pump';
import { PUMPSWAP_BUY_COMPUTE_UNITS, PUMPSWAP_SELL_COMPUTE_UNITS, canonicalPoolOf } from '../src/live/execution/pumpswap';
import { ACCOUNT_SIZE, LEGACY_LAMPORTS_PER_BYTE, RentSchedule, rentExemptMinimum } from '../src/live/execution/rent';
import { EXTRA_COMPUTE_UNITS, compileV0, computeUnitPrice, swapInstructions } from '../src/live/execution/tx';
import { LiveVenue, PlanError, fillLegs, type BuiltSwap, type SwapPlan } from '../src/live/execution/venue';
import { World, type TokenState, type WalletState } from '../src/sim/world';
import type { Ticket, VenueHost } from '../src/trading/execution';

const requireCjs = createRequire(import.meta.url);
const pumpSdk = requireCjs('@pump-fun/pump-sdk') as typeof PumpSdk;
const swapSdk = requireCjs('@pump-fun/pump-swap-sdk') as typeof PumpSwapSdk;

// ---------------------------------------------------------------------------
// Arguments, connections
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const flag = (name: string) => argv.includes(`--${name}`);
const RPC_URL = arg('rpc') ?? 'https://solana-rpc.publicnode.com';
const INDEXED_URL = arg('indexed-rpc') ?? 'https://api.mainnet-beta.solana.com';
const JUPITER_URL = arg('jupiter') ?? 'https://lite-api.jup.ag';
const JITO_URL = arg('jito') ?? 'https://mainnet.block-engine.jito.wtf';
const PUMPPORTAL_URL = arg('pumpportal') ?? 'wss://pumpportal.fun/api/data';
const ONLY = new Set((arg('only') ?? 'constants,rent,jito,pump,pumpswap,jupiter,fills').split(','));
const RECORD = flag('record');
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL = NATIVE_MINT.toBase58();
/** A pump.fun token that migrated to Raydium before PumpSwap existed: no canonical pool (Fartcoin). */
const PRE_PUMPSWAP_MIGRATED = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch for lite-api.jup.ag: spaced out, retrying 429s with backoff. */
const politeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  let res = await fetch(input, init);
  for (let attempt = 1; res.status === 429 && attempt < 6; attempt++) {
    await sleep(2500 * attempt);
    res = await fetch(input, init);
  }
  await sleep(1100);
  return res;
}) as typeof fetch;

/**
 * The venue's connection: account reads, blockhash and simulation on --rpc; token-account-by-owner
 * reads on --indexed-rpc (public endpoints refuse them on the other). Remembers every account it
 * returned, so --record can store exactly what the venue saw.
 */
class VerifyConnection extends Connection {
  readonly seen = new Map<string, AccountInfo<Buffer> | null>();
  constructor(
    endpoint: string,
    readonly indexed: Connection,
  ) {
    super(endpoint, 'confirmed');
  }
  override async getMultipleAccountsInfo(keys: PublicKey[], config?: GetMultipleAccountsConfig | Commitment) {
    // Public endpoints cap getMultipleAccounts at 10 keys.
    const res: (AccountInfo<Buffer> | null)[] = [];
    for (let i = 0; i < keys.length; i += 10) res.push(...(await super.getMultipleAccountsInfo(keys.slice(i, i + 10), config)));
    keys.forEach((k, i) => this.seen.set(k.toBase58(), res[i]));
    return res;
  }
  override async getAccountInfo(key: PublicKey, config?: Parameters<Connection['getAccountInfo']>[1]) {
    const res = await super.getAccountInfo(key, config);
    this.seen.set(key.toBase58(), res);
    return res;
  }
  override getParsedTokenAccountsByOwner(...args: Parameters<Connection['getParsedTokenAccountsByOwner']>) {
    return this.indexed.getParsedTokenAccountsByOwner(...args);
  }
}

const indexed = new Connection(INDEXED_URL, 'confirmed');
const rpc = new VerifyConnection(RPC_URL, indexed);

/** Raw JSON-RPC (getTransaction fixtures must keep the wire format), retrying rate limits. */
async function rawRpc<T>(url: string, method: string, params: unknown[]): Promise<{ result?: T; error?: { code: number; message: string } }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    return (await res.json()) as { result?: T; error?: { code: number; message: string } };
  }
  return { error: { code: 429, message: 'rate limited' } };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Row {
  area: string;
  check: string;
  result: 'ok' | 'FAIL' | 'info' | 'skip';
  detail: string;
}
const rows: Row[] = [];
function report(area: string, check: string, ok: boolean | null, detail: string): void {
  const result = ok === null ? 'info' : ok ? 'ok' : 'FAIL';
  rows.push({ area, check, result, detail });
  console.log(`  [${result.padEnd(4)}] ${area.padEnd(9)} ${check}: ${detail}`);
}
const skip = (area: string, check: string, why: string) => {
  rows.push({ area, check, result: 'skip', detail: why });
  console.log(`  [skip] ${area.padEnd(9)} ${check}: ${why}`);
};
const sol = (lamports: bigint | number) => `${(Number(lamports) / 1e9).toFixed(9)} SOL`;
const errText = (err: unknown) => (err instanceof Error ? err.message.split('\n')[0] : String(err)).slice(0, 200);

// ---------------------------------------------------------------------------
// The venue, outside the app: a World holding the token and the wallet, live config with a fee wallet
// ---------------------------------------------------------------------------

const PLATFORM_FEE_BPS = 80;
const PRESET: TradePreset = { id: 'P2', slippage: 0.1, autoSlippage: false, priorityFee: 0.0001, tip: 0.0001, antiMev: true };

function venueFor(feeWallet: string) {
  const world = new World('sol-exec-verify', Date.now());
  world.setNativeUsd('sol', 100);
  const config: LiveConfig = {
    chain: 'sol',
    rpcUrl: RPC_URL,
    wsUrl: null,
    feed: { pumpPortalUrl: PUMPPORTAL_URL, maxTrackedTokens: 100 },
    jupiter: { baseUrl: JUPITER_URL, apiKey: null },
    jitoUrl: JITO_URL,
    signer: { provider: null, turnkey: null, localKeystoreKey: null },
    fees: { platformFeeBps: PLATFORM_FEE_BPS, feeWallet },
    ipfsGateways: [],
  };
  const live: LiveServices = { config, connection: rpc, signer: null };
  const ctx = {
    config: defaultConfig({ mode: 'live', live: config, liveProblems: [], warmupMinutes: 0, snapshotEveryMs: 0 }),
    world,
    live,
    store: null,
    accounts: { walletRef: () => null, audit: () => undefined },
  } as unknown as AppContext;
  const host: VenueHost = { reserve: () => () => undefined, reservedTokens: () => 0, fanOut: (_t, r) => r };
  const venue = new LiveVenue(ctx, host, { random: () => 0 });
  return { world, venue };
}

function addToken(world: World, mint: string, status: 'curve' | 'migrated', decimals = 6): TokenState {
  return world.addExternalToken({
    chain: 'sol',
    address: mint,
    launchpad: 'pump',
    symbol: 'VERIFY',
    name: 'Verification token',
    description: '',
    imageUrl: null,
    metadataUri: null,
    creator: PublicKey.default.toBase58(),
    createdAt: world.now - 3_600_000,
    decimals,
    totalSupply: 1e9,
    status,
    curve: status === 'curve' ? { virtualNative: 30, virtualTokens: 1_073_000_000, realNative: 0, realTokens: 793_100_000, initialRealTokens: 793_100_000, feeRate: 0.0125 } : null,
    pool: status === 'migrated' ? { address: PublicKey.default.toBase58(), dex: 'PumpSwap', feeRate: 0.0025, native: 85, tokens: 206_900_000, lpBurnedRate: 1 } : null,
    socials: {},
    narrative: 'meme',
    logoGlyph: 'V',
  });
}

function ticketFor(world: World, token: TokenState, owner: string, side: 'buy' | 'sell', amount: number, amountKind: 'native' | 'percent'): Ticket {
  const wallet: WalletState = world.wallets.get(owner) ?? world.createWallet('sol', 'user', { address: owner, accountId: 'verify', native: 1 });
  return { accountId: 'verify', wallet, token, side, amount, amountKind, preset: PRESET, strategy: null, source: 'manual' };
}

// ---------------------------------------------------------------------------
// Simulation of a built swap, with the post-state of the accounts it touches
// ---------------------------------------------------------------------------

const SPL_ACCOUNT_LEN = 165;
const isTokenProgram = (owner: PublicKey) => owner.equals(TOKEN_PROGRAM_ID) || owner.equals(TOKEN_2022_PROGRAM_ID);
const isTokenAccount = (a: { owner: PublicKey; data: Buffer } | null) => !!a && isTokenProgram(a.owner) && (a.data.length === SPL_ACCOUNT_LEN || (a.data.length > SPL_ACCOUNT_LEN && a.data[SPL_ACCOUNT_LEN] === 2));
const tokenAmountOf = (data: Buffer) => data.readBigUInt64LE(64);
const tokenMintOf = (data: Buffer) => new PublicKey(data.subarray(0, 32)).toBase58();
const tokenOwnerOf = (data: Buffer) => new PublicKey(data.subarray(32, 64)).toBase58();

interface SimAccount {
  owner: PublicKey;
  lamports: number;
  data: Buffer;
}

interface Simulated {
  ok: boolean;
  err: unknown;
  units: number;
  logs: string[];
  slot: number;
  keys: string[];
  writable: boolean[];
  loaded: { writable: string[]; readonly: string[] };
  pre: (SimAccount | null)[];
  post: (SimAccount | null)[];
  fee: bigint;
  size: number;
}

/** The network fee of a built transaction: 5000 per signature plus limit x price. */
function networkFeeOf(built: BuiltSwap): bigint {
  let limit = 200_000;
  let price = 0n;
  for (const ix of built.instructions) {
    if (!ix.programId.equals(ComputeBudgetProgram.programId)) continue;
    const type = ComputeBudgetInstruction.decodeInstructionType(ix);
    if (type === 'SetComputeUnitLimit') limit = ComputeBudgetInstruction.decodeSetComputeUnitLimit(ix).units;
    if (type === 'SetComputeUnitPrice') price = BigInt(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ix).microLamports);
  }
  const priority = (price * BigInt(limit) + 999_999n) / 1_000_000n;
  return 5000n * BigInt(built.tx.message.header.numRequiredSignatures) + priority;
}

async function simulate(built: BuiltSwap): Promise<Simulated> {
  const msg = built.tx.message;
  const lookups = msg.getAccountKeys({ addressLookupTableAccounts: built.lookupTables });
  const keys = [...lookups.staticAccountKeys, ...(lookups.accountKeysFromLookups?.writable ?? []), ...(lookups.accountKeysFromLookups?.readonly ?? [])].map((k) => k.toBase58());
  const writable = keys.map((_, i) => msg.isAccountWritable(i));
  // Pre-state from the node that simulates, right before it does (busy accounts still move in between:
  // the checks below use quiet wallets and decode the tip transfer instead of the tip account's balance).
  const preInfos = await indexed.getMultipleAccountsInfo(keys.map((k) => new PublicKey(k)), 'confirmed');
  const watch = keys.filter((_, i) => writable[i]);
  // Every writable account's post-state (more than the 10 public endpoints allow per request on --rpc).
  const res = await indexed.simulateTransaction(built.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: watch } });
  const v = res.value;
  const postByKey = new Map<string, SimAccount | null>();
  (v.accounts ?? []).forEach((a, i) => {
    postByKey.set(watch[i], a ? { owner: new PublicKey(a.owner), lamports: a.lamports, data: Buffer.from((a.data as string[])[0], 'base64') } : null);
  });
  const pre = preInfos.map((a) => (a ? { owner: a.owner, lamports: a.lamports, data: Buffer.from(a.data) } : null));
  const post = keys.map((k, i) => (writable[i] && postByKey.has(k) ? postByKey.get(k)! : pre[i]));
  return {
    ok: !v.err,
    err: v.err,
    units: v.unitsConsumed ?? 0,
    logs: v.logs ?? [],
    slot: res.context.slot,
    keys,
    writable,
    loaded: { writable: (lookups.accountKeysFromLookups?.writable ?? []).map((k) => k.toBase58()), readonly: (lookups.accountKeysFromLookups?.readonly ?? []).map((k) => k.toBase58()) },
    pre,
    post: v.err ? pre : post,
    fee: networkFeeOf(built),
    size: built.tx.serialize().length,
  };
}

const lamportsDelta = (s: Simulated, address: string) => {
  const i = s.keys.indexOf(address);
  return i < 0 ? 0n : BigInt(s.post[i]?.lamports ?? 0) - BigInt(s.pre[i]?.lamports ?? 0);
};

/** The decimals of each mint the transaction's token accounts hold. */
async function mintDecimals(s: Simulated): Promise<Map<string, number>> {
  const mints = new Set<string>();
  for (const a of [...s.pre, ...s.post]) if (isTokenAccount(a)) mints.add(tokenMintOf(a!.data));
  const list = [...mints];
  const infos = await rpc.getMultipleAccountsInfo(list.map((m) => new PublicKey(m)), 'confirmed');
  return new Map(list.map((m, i) => [m, infos[i] ? infos[i]!.data[44] : 0]));
}

/**
 * What getTransaction would return had the simulated transaction landed (wire format, encoding json):
 * balances of every account before and after, token balances with owner and decimals, fee, logs,
 * compute units, loaded addresses.
 */
async function landingOf(built: BuiltSwap, s: Simulated, tip: { account: string; lamports: bigint } | null): Promise<Record<string, unknown>> {
  const decimals = await mintDecimals(s);
  const tokenBalances = (accounts: (SimAccount | null)[]) =>
    accounts.flatMap((a, accountIndex) => {
      if (!isTokenAccount(a)) return [];
      const mint = tokenMintOf(a!.data);
      const amount = tokenAmountOf(a!.data).toString();
      const d = decimals.get(mint) ?? 0;
      const ui = Number(amount) / 10 ** d;
      return [{ accountIndex, mint, owner: tokenOwnerOf(a!.data), programId: a!.owner.toBase58(), uiTokenAmount: { amount, decimals: d, uiAmount: ui, uiAmountString: String(ui) } }];
    });
  const msg = built.tx.message;
  const preBalances = s.pre.map((a) => a?.lamports ?? 0);
  // The tip account receives tips continuously between the pre-read and the simulation; our transaction's
  // only effect on it is the tip.
  const t = tip ? s.keys.indexOf(tip.account) : -1;
  if (t >= 0 && s.ok && s.post[t]) preBalances[t] = s.post[t]!.lamports - Number(tip!.lamports);
  // A failed transaction still pays its fee; nothing else changes.
  const postBalances = s.ok ? s.post.map((a) => a?.lamports ?? 0) : preBalances.map((l, i) => (i === 0 ? l - Number(s.fee) : l));
  return {
    slot: s.slot,
    blockTime: Math.floor(Date.now() / 1000),
    version: 0,
    meta: {
      err: s.err ?? null,
      status: s.err ? { Err: s.err } : { Ok: null },
      fee: Number(s.fee),
      preBalances,
      postBalances,
      preTokenBalances: tokenBalances(s.pre),
      postTokenBalances: tokenBalances(s.ok ? s.post : s.pre),
      innerInstructions: [],
      logMessages: s.logs,
      rewards: [],
      loadedAddresses: s.loaded,
      computeUnitsConsumed: s.units,
    },
    transaction: {
      signatures: ['<SIG>'],
      message: {
        header: msg.header,
        accountKeys: msg.staticAccountKeys.map((k) => k.toBase58()),
        recentBlockhash: '<BLOCKHASH>',
        instructions: [],
        addressTableLookups: msg.addressTableLookups.map((l) => ({ accountKey: l.accountKey.toBase58(), writableIndexes: l.writableIndexes, readonlyIndexes: l.readonlyIndexes })),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture recording
// ---------------------------------------------------------------------------

/** JSON with real addresses replaced by placeholders (keys: real address, values: placeholder name). */
function templated(value: unknown, names: Record<string, string>): unknown {
  let text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  for (const [address, name] of Object.entries(names)) text = text.split(address).join(`<${name}>`);
  return JSON.parse(text);
}

function writeFixture(path: string, value: unknown): void {
  if (!RECORD) return;
  const file = join(FIXTURES, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
  console.log(`  recorded ${path}`);
}

/** Accounts the venue read (raw), minus the user-specific ones, for an offline FakeConnection. */
function seenAccounts(exclude: string[]): Record<string, { owner: string; lamports: number; data: string; executable: boolean } | null> {
  const out: Record<string, { owner: string; lamports: number; data: string; executable: boolean } | null> = {};
  for (const [k, v] of rpc.seen) {
    if (exclude.includes(k)) continue;
    out[k] = v ? { owner: v.owner.toBase58(), lamports: v.lamports, data: Buffer.from(v.data).toString('base64'), executable: v.executable } : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wallet discovery: funded wallets without pump history (a first buy), holders of a token
// ---------------------------------------------------------------------------

interface Fresh {
  address: string;
  lamports: number;
}

/** No transaction in the last two minutes: its balance will not move while a swap is simulated. */
async function quiet(address: string): Promise<boolean> {
  const sigs = await rpc.getSignaturesForAddress(new PublicKey(address), { limit: 1 }, 'confirmed').catch(() => null);
  if (!sigs) return false;
  return !sigs[0] || (sigs[0].blockTime ?? 0) < Date.now() / 1000 - 120;
}

async function freshPayer(candidates: string[], exclude: string[] = []): Promise<Fresh | null> {
  const list = [...new Set(candidates)].filter((c) => !exclude.includes(c));
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    const keys = chunk.flatMap((c) => [new PublicKey(c), pumpSdk.userVolumeAccumulatorPda(new PublicKey(c)), swapSdk.userVolumeAccumulatorPda(new PublicKey(c))]);
    const infos = await rpc.getMultipleAccountsInfo(keys, 'confirmed');
    for (let j = 0; j < chunk.length; j++) {
      const [acc, uva, ammUva] = infos.slice(j * 3, j * 3 + 3);
      if (acc && acc.owner.equals(SystemProgram.programId) && acc.lamports >= 200_000_000 && acc.data.length === 0 && !uva && !ammUva && (await quiet(chunk[j]))) return { address: chunk[j], lamports: acc.lamports };
    }
  }
  return null;
}

async function funded(candidates: string[], exclude: string[]): Promise<string | null> {
  const list = [...new Set(candidates)].filter((c) => !exclude.includes(c));
  const infos = await rpc.getMultipleAccountsInfo(list.slice(0, 100).map((c) => new PublicKey(c)), 'confirmed');
  for (let i = 0; i < infos.length; i++) {
    const a = infos[i];
    if (a && a.owner.equals(SystemProgram.programId) && a.data.length === 0 && a.lamports >= 10_000_000 && (await quiet(list[i]))) return list[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// PumpPortal: live launches (fresh curves, and dev wallets that hold their initial buy)
// ---------------------------------------------------------------------------

interface CreateFrame {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: string;
  initialBuy: number;
  solAmount: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  pool?: string;
}

class Launches {
  readonly creates: CreateFrame[] = [];
  private readonly ws: WebSocket;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ method: 'subscribeNewToken' })));
    this.ws.on('message', (d) => {
      try {
        const j = JSON.parse(String(d)) as CreateFrame;
        if (j.txType === 'create' && (j.pool ?? 'pump') === 'pump') this.creates.push(j);
      } catch {
        // ignore
      }
    });
    this.ws.on('error', () => undefined);
  }
  async next(from: number, timeoutMs: number, pred: (c: CreateFrame) => boolean = () => true): Promise<{ frame: CreateFrame; index: number } | null> {
    const until = Date.now() + timeoutMs;
    for (let i = from; Date.now() < until; ) {
      while (i < this.creates.length) {
        if (pred(this.creates[i])) return { frame: this.creates[i], index: i };
        i++;
      }
      await sleep(200);
    }
    return null;
  }
  close(): void {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------
// Checks of one simulated swap against its plan
// ---------------------------------------------------------------------------

interface SwapResultCheck {
  sim: Simulated;
  /** Lamports the route itself took (buy) or paid (sell). */
  routeLamports: bigint;
  /** Token base units the owner received (buy) or gave (sell). */
  tokens: bigint;
  rentCreated: bigint;
  landing: Record<string, unknown>;
}

async function checkSwap(area: string, label: string, plan: SwapPlan, built: BuiltSwap, limit: number, extra: { tokenAccount: string; feeWallet: string; rentAccounts: string[] }): Promise<SwapResultCheck | null> {
  const s = await simulate(built);
  report(area, `${label}: simulation`, s.ok, s.ok ? `success at slot ${s.slot}` : `${JSON.stringify(s.err)} ${describeTxError(s.err, s.logs, built.instructions.map((ix) => ix.programId.toBase58()))}`);
  if (!s.ok) {
    console.log(s.logs.slice(-12).map((l) => `      ${l}`).join('\n'));
    return null;
  }
  report(area, `${label}: compute units`, s.units <= built.computeUnits, `${s.units} used of the ${built.computeUnits} limit (route limit ${limit})`);
  report(area, `${label}: transaction size`, s.size <= 1232, `${s.size} bytes, ${built.instructions.length} instructions, ${built.lookupTables.length} lookup tables`);
  const owner = plan.owner.toBase58();
  const ti = s.keys.indexOf(extra.tokenAccount);
  const tokenPre = ti >= 0 && isTokenAccount(s.pre[ti]) ? tokenAmountOf(s.pre[ti]!.data) : 0n;
  const tokenPost = ti >= 0 && isTokenAccount(s.post[ti]) ? tokenAmountOf(s.post[ti]!.data) : 0n;
  const tokens = plan.side === 'buy' ? tokenPost - tokenPre : tokenPre - tokenPost;
  // Lamports the transaction left in accounts it created for the owner (token accounts, volume
  // accumulator), less what accounts of the owner it closed refunded (e.g. a wrapped-SOL account the
  // route unwraps and closes): read from the accounts' own data, independently of the fill parser.
  let rentCreated = 0n;
  let rentNet = 0n;
  for (let i = 0; i < s.keys.length; i++) {
    const pre = s.pre[i];
    const post = s.post[i] && s.post[i]!.lamports > 0 ? s.post[i] : null;
    const owned = (a: SimAccount | null) => isTokenAccount(a) && tokenOwnerOf(a!.data) === plan.owner.toBase58();
    const mine = owned(pre) || owned(post) || extra.rentAccounts.includes(s.keys[i]);
    if (!mine || (pre && post)) continue;
    if (!pre && post) rentCreated += BigInt(post.lamports);
    rentNet += BigInt(post?.lamports ?? 0) - BigInt(pre?.lamports ?? 0);
  }
  const tipIx = built.instructions[built.instructions.length - 1];
  const tipAccount = plan.tipLamports > 0n ? tipIx.keys[1].pubkey.toBase58() : null;
  const ownerDelta = lamportsDelta(s, owner);
  const fees = plan.platformFee + plan.tipLamports + s.fee;
  const routeLamports = plan.side === 'buy' ? -ownerDelta - fees - rentNet : ownerDelta + fees + rentNet;
  if (plan.side === 'buy') {
    report(area, `${label}: tokens received`, plan.route === 'jupiter' ? tokens >= plan.minOutRaw : tokens === plan.outRaw, `${tokens} received; quote ${plan.outRaw}, minimum ${plan.minOutRaw}`);
    report(area, `${label}: SOL into the route`, routeLamports > 0n && routeLamports <= plan.maxInRaw, `${sol(routeLamports)} (asked ${sol(plan.inRaw)}, max ${sol(plan.maxInRaw)}); owner paid ${sol(-ownerDelta)} = route + platform fee ${plan.platformFee} + tip ${plan.tipLamports} + network fee ${s.fee} + rent ${rentCreated}${rentNet !== rentCreated ? ` - ${rentCreated - rentNet} refunded by a closed account` : ''}`);
    report(area, `${label}: rent estimate`, plan.rentLamports >= rentCreated, `plan reserved ${plan.rentLamports} lamports, the swap left ${rentCreated} in accounts it created`);
  } else {
    report(area, `${label}: tokens sold`, tokens === plan.inRaw, `${tokens} sold of ${plan.inRaw} planned (held ${plan.heldRaw})`);
    report(area, `${label}: SOL out of the route`, routeLamports >= plan.minOutRaw, `${sol(routeLamports)} (quote ${sol(plan.outRaw)}, minimum ${sol(plan.minOutRaw)}${routeLamports === plan.outRaw ? ', exactly as quoted' : ''}); owner received ${sol(ownerDelta)} after platform fee ${plan.platformFee}, tip ${plan.tipLamports}, network fee ${s.fee}${rentNet ? `, rent ${rentNet}` : ''}`);
  }
  report(area, `${label}: platform fee`, lamportsDelta(s, extra.feeWallet) === plan.platformFee, `${lamportsDelta(s, extra.feeWallet)} lamports to the fee wallet (${PLATFORM_FEE_BPS} bps of ${plan.side === 'buy' ? 'the SOL in' : 'the minimum SOL out'}: ${plan.platformFee})`);
  if (tipAccount) {
    const transfer = SystemInstruction.decodeTransfer(tipIx);
    report(area, `${label}: Jito tip`, JITO_TIP_ACCOUNTS.includes(tipAccount) && transfer.lamports === plan.tipLamports && transfer.fromPubkey.equals(plan.owner), `last instruction: System transfer of ${transfer.lamports} lamports to tip account ${tipAccount} (the account itself receives tips continuously)`);
  }
  report(area, `${label}: network fee`, s.fee <= 5000n + plan.priorityLamports + 1n, `${s.fee} lamports (5000 + priority ${plan.priorityLamports} spread over ${built.computeUnits} CU at ${computeUnitPrice(plan.priorityLamports, built.computeUnits)} micro-lamports)`);
  // The fill parser on what getTransaction would return: the same legs as above.
  const landing = await landingOf(built, s, tipAccount ? { account: tipAccount, lamports: plan.tipLamports } : null);
  const delta = walletDelta(landing as unknown as TxLike, 'sim', owner, plan.mint.toBase58(), plan.rentAccounts);
  const legs = fillLegs(plan, delta);
  report(area, `${label}: fill parser`, legs.tokenRaw === tokens && legs.nativeLamports === routeLamports && delta.rentLamports === rentNet, `tokens ${legs.tokenRaw}, SOL leg ${legs.nativeLamports}, network fee + tip ${legs.networkFee}, rent ${delta.rentLamports} (from getTransaction's shape of the simulated landing)`);
  return { sim: s, routeLamports, tokens, rentCreated, landing };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function checkRent(): Promise<void> {
  console.log('\nRent');
  const sizes = [0, ACCOUNT_SIZE.token, ACCOUNT_SIZE.token2022, ACCOUNT_SIZE.volumeAccumulator];
  const mins = await Promise.all(sizes.map((n) => rpc.getMinimumBalanceForRentExemption(n, 'confirmed')));
  const rates = await new RentSchedule().rates(rpc);
  sizes.forEach((n, i) => report('rent', `rent-exempt minimum, ${n} bytes`, rentExemptMinimum(n, rates.lamportsPerByte) === BigInt(mins[i]), `cluster ${mins[i]}, venue ${rentExemptMinimum(n, rates.lamportsPerByte)} (${rates.lamportsPerByte} lamports/byte, live ${rates.live})`));
  report('rent', 'legacy constants', null, `RENT_EXEMPT_MIN_LAMPORTS ${RENT_EXEMPT_MIN_LAMPORTS} vs ${mins[0]}, TOKEN_ACCOUNT_RENT_LAMPORTS ${TOKEN_ACCOUNT_RENT_LAMPORTS} vs ${mins[1]}: upper bounds at the pre-reduction ${LEGACY_LAMPORTS_PER_BYTE} lamports/byte`);
}

async function checkJito(): Promise<void> {
  console.log('\nJito');
  const res = await fetch(`${JITO_URL.replace(/\/+$/, '')}/api/v1/getTipAccounts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTipAccounts', params: [] }) });
  const json = (await res.json()) as { result?: string[] };
  const live = json.result ?? [];
  const same = live.length === JITO_TIP_ACCOUNTS.length && live.every((a) => JITO_TIP_ACCOUNTS.includes(a));
  report('jito', 'getTipAccounts', same, `${live.length} accounts from the block engine, ${same ? 'identical to' : 'DIFFERENT from'} JITO_TIP_ACCOUNTS`);
  const infos = await rpc.getMultipleAccountsInfo(JITO_TIP_ACCOUNTS.map((a) => new PublicKey(a)), 'confirmed');
  const owners = new Set(infos.map((a) => a?.owner.toBase58() ?? 'missing'));
  report('jito', 'tip accounts on chain', infos.every((a) => !!a), `all ${infos.length} exist; owner program(s) ${[...owners].join(', ')}; a tip is a plain System transfer to one of them`);
  const floor = await fetch('https://bundles.jito.wtf/api/v1/bundles/tip_floor')
    .then((r) => r.json() as Promise<Record<string, number>[]>)
    .catch(() => null);
  if (floor?.[0]) {
    const f = floor[0];
    const lam = (k: string) => Math.round((f[k] ?? 0) * 1e9);
    report('jito', 'landed tip floor', BigInt(lam('landed_tips_25th_percentile')) >= JITO_MIN_TIP_LAMPORTS - 100n, `p25 ${lam('landed_tips_25th_percentile')}, p50 ${lam('landed_tips_50th_percentile')}, p75 ${lam('landed_tips_75th_percentile')}, p95 ${lam('landed_tips_95th_percentile')}, p99 ${lam('landed_tips_99th_percentile')} lamports; venue minimum ${JITO_MIN_TIP_LAMPORTS}`);
  } else skip('jito', 'landed tip floor', 'bundles.jito.wtf unreachable');
}

interface PumpContext {
  launches: Launches;
  feeWallet: string;
  payer: Fresh | null;
}

async function checkPumpConstants(mint: string, user: string): Promise<void> {
  console.log('\npump.fun constants');
  const st = await new OnlinePumpLoader(rpc).load(new PublicKey(mint), new PublicKey(user));
  if (!st) return report('constants', 'decode', false, `no SOL curve for ${mint}`);
  const g = st.global;
  const eq = (a: { toString(): string }, b: bigint) => BigInt(a.toString()) === b;
  report('constants', 'initial virtual SOL reserves', eq(g.initialVirtualSolReserves, 30_000_000_000n), `${g.initialVirtualSolReserves.toString()} lamports (docs: 30 SOL)`);
  report('constants', 'initial virtual token reserves', eq(g.initialVirtualTokenReserves, 1_073_000_000_000_000n), `${g.initialVirtualTokenReserves.toString()} (docs: 1.073B x 10^6)`);
  report('constants', 'initial real token reserves', eq(g.initialRealTokenReserves, 793_100_000_000_000n), `${g.initialRealTokenReserves.toString()} (docs: 793.1M x 10^6; 206.9M left for the pool)`);
  report('constants', 'token total supply', eq(g.tokenTotalSupply, 1_000_000_000_000_000n), `${g.tokenTotalSupply.toString()} (1B x 10^6)`);
  const mintInfo = await rpc.getAccountInfo(new PublicKey(mint), 'confirmed');
  report('constants', 'mint decimals / program', mintInfo?.data[44] === 6, `${mintInfo?.data[44]} decimals, ${mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'} mint`);
  const tier = st.feeConfig?.feeTiers[0]?.fees;
  if (tier) {
    const total = Number(tier.lpFeeBps.toString()) + Number(tier.protocolFeeBps.toString()) + Number(tier.creatorFeeBps.toString());
    report('constants', 'curve fee (FeeConfig)', total === 125, `protocol ${tier.protocolFeeBps.toString()} + creator ${tier.creatorFeeBps.toString()} + lp ${tier.lpFeeBps.toString()} = ${total} bps over ${st.feeConfig!.feeTiers.length} tier(s) (docs: 1.25%); Global.feeBasisPoints ${g.feeBasisPoints.toString()}, buyback ${g.buybackBasisPoints.toString()} bps of the protocol fee`);
  } else report('constants', 'curve fee (FeeConfig)', false, 'FeeConfig account missing');
  // The SDK picks the buyback recipient at random from a hard-coded list: sample its buy instructions.
  const sdkBuyback = new Set<string>();
  for (let i = 0; i < 300 && sdkBuyback.size < g.buybackFeeRecipients.length + 2; i++) {
    const ixs = await curveBuyInstructions(st, new PublicKey(mint), new PublicKey(user), 1n, 1n);
    const buy = ixs.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM)!;
    sdkBuyback.add(buy.keys[buy.keys.length - 1].pubkey.toBase58());
  }
  const chainBuyback = g.buybackFeeRecipients.map((k) => k.toBase58());
  report('constants', 'buyback fee recipients', chainBuyback.every((k) => sdkBuyback.has(k)) && [...sdkBuyback].every((k) => chainBuyback.includes(k)), `the SDK's ${sdkBuyback.size} hard-coded recipients ${chainBuyback.every((k) => sdkBuyback.has(k)) ? 'match' : 'DIFFER from'} Global.buybackFeeRecipients (${chainBuyback.length})`);
  const c = st.bondingCurve;
  report('constants', 'bonding curve account', st.bondingCurveAccountInfo.owner.toBase58() === PUMP_PROGRAM && !c.complete, `${st.bondingCurveAccountInfo.data.length} bytes, quote mint ${c.quoteMint.toBase58()} (SOL), creator fee bucket ${c.creatorFee.toString()}, protocol fee bucket ${c.protocolFees.toString()}, mayhem ${c.isMayhemMode}, cashback ${c.isCashbackCoin}`);
}

async function pumpBuy(ctx: PumpContext, mint: string): Promise<void> {
  if (!ctx.payer) return skip('pump', 'buy', 'no funded wallet without pump history found');
  const { world, venue } = venueFor(ctx.feeWallet);
  const token = addToken(world, mint, 'curve');
  const owner = ctx.payer.address;
  rpc.seen.clear();
  const plan = await venue.plan(ticketFor(world, token, owner, 'buy', 0.01, 'native'), rpc, new PublicKey(owner));
  report('pump', 'buy: route', plan.route === 'pump', `${plan.route} (${plan.quote.venue}), ${plan.pump?.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL'} mint, first buy of ${owner}`);
  const built = await venue.buildTransaction(plan, rpc);
  const ata = getAssociatedTokenAddressSync(plan.mint, plan.owner, true, plan.pump!.tokenProgram).toBase58();
  const swapIx = built.instructions.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM)!;
  report('pump', 'buy: instruction', swapIx.keys.length === 18, `legacy buy with ${swapIx.keys.length} accounts (16 + bonding-curve v2 PDA + buyback recipient), fee recipient ${swapIx.keys[1].pubkey.toBase58()}`);
  const r = await checkSwap('pump', 'buy', plan, built, PUMP_BUY_COMPUTE_UNITS, { tokenAccount: ata, feeWallet: ctx.feeWallet, rentAccounts: plan.rentAccounts });
  if (r) {
    const uva = plan.pump!.volumeAccumulator.toBase58();
    const created = lamportsDelta(r.sim, uva);
    report('pump', 'buy: volume accumulator', !plan.pump!.volumeAccumulatorExists ? created === rentExemptMinimum(ACCOUNT_SIZE.volumeAccumulator, (await new RentSchedule().rates(rpc)).lamportsPerByte) : true, plan.pump!.volumeAccumulatorExists ? 'already existed' : `created by the buy with ${created} lamports of the user's SOL (counted as rent by the plan and the fill parser)`);
    // A launch's creator vault may be unfunded: the first buy then pays its rent-exempt minimum, outside max_sol_cost.
    const vault = pumpSdk.creatorVaultPda(plan.pump!.bondingCurve.creator).toBase58();
    const vi = r.sim.keys.indexOf(vault);
    const funded = vi >= 0 && !r.sim.pre[vi] && r.sim.post[vi];
    report('pump', 'buy: creator vault', null, funded ? `unfunded before this buy: the buyer paid ${r.sim.post[vi]!.lamports} lamports into it (its rent-exempt minimum + the creator fee), counted in the SOL leg; the plan reserves the minimum` : `already funded (${r.sim.pre[vi]?.lamports ?? 0} lamports)`);
    if (RECORD) {
      // The mint stays real: the curve and pool PDAs a test derives from it must match the recorded accounts.
      const names = { [owner]: 'OWNER', [ata]: 'OWNER_ATA', [uva]: 'UVA', [ctx.feeWallet]: 'FEE_WALLET', [built.instructions[built.instructions.length - 1].keys[1].pubkey.toBase58()]: 'TIP' };
      writeFixture('rpc/sim-pump-buy.json', templated(scenarioRecord(plan, built, r, [owner, ata, uva], 'pump.fun curve buy of 0.01 SOL by a wallet without pump history: venue-built transaction, simulated on mainnet'), names));
    }
  }
  // Slippage: a max SOL cost below what the tokens cost is refused by the program (TooMuchSolRequired).
  const tight = await venue.buildTransaction({ ...plan, maxInRaw: plan.inRaw / 2n }, rpc);
  const t = await simulate(tight);
  const reason = describeTxError(t.err, t.logs, tight.instructions.map((ix) => ix.programId.toBase58()));
  report('pump', 'buy: slippage refusal', !t.ok && JSON.stringify(t.err).includes('6002') && /slippage/.test(reason), `${JSON.stringify(t.err)} -> "${reason}"`);
}

async function pumpSell(ctx: PumpContext): Promise<void> {
  // A launch's dev wallet holds its initial buy for a few seconds at least: sell half of it.
  let from = 0;
  const deadline = Date.now() + 120_000;
  let tried = 0;
  while (Date.now() < deadline && tried < 12) {
    const next = await ctx.launches.next(from, deadline - Date.now(), (c) => c.initialBuy > 0);
    if (!next) break;
    from = next.index + 1;
    tried++;
    const { mint, traderPublicKey: dev } = next.frame;
    const { world, venue } = venueFor(ctx.feeWallet);
    const token = addToken(world, mint, 'curve');
    rpc.seen.clear();
    let plan: SwapPlan;
    try {
      plan = await venue.plan(ticketFor(world, token, dev, 'sell', 50, 'percent'), rpc, new PublicKey(dev));
    } catch (err) {
      if (err instanceof PlanError) continue; // already sold
      throw err;
    }
    const built = await venue.buildTransaction(plan, rpc);
    const ata = getAssociatedTokenAddressSync(plan.mint, plan.owner, true, plan.pump!.tokenProgram).toBase58();
    const probe = await simulate(built);
    if (!probe.ok && /6022|6023|insufficient/i.test(JSON.stringify(probe.err) + probe.logs.join(' '))) continue; // sold meanwhile
    report('pump', 'sell: route', plan.route === 'pump', `${plan.route}, dev wallet ${dev} of ${mint} (${plan.pump?.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL'})`);
    const r = await checkSwap('pump', 'sell', plan, built, PUMP_SELL_COMPUTE_UNITS, { tokenAccount: ata, feeWallet: ctx.feeWallet, rentAccounts: [] });
    if (r) {
      const vault = pumpSdk.creatorVaultPda(plan.pump!.bondingCurve.creator).toBase58();
      const vi = r.sim.keys.indexOf(vault);
      const funded = vi >= 0 && !r.sim.pre[vi] && r.sim.post[vi];
      report('pump', 'sell: creator vault', null, funded ? `unfunded before this sell: ${r.sim.post[vi]!.lamports} lamports went into it, the seller received ${plan.outRaw - r.routeLamports} less than quoted` : `already funded (${r.sim.pre[vi]?.lamports ?? 0} lamports)`);
    }
    if (r && RECORD) {
      const names = { [dev]: 'OWNER', [ata]: 'OWNER_ATA', [ctx.feeWallet]: 'FEE_WALLET', [built.instructions[built.instructions.length - 1].keys[1].pubkey.toBase58()]: 'TIP' };
      writeFixture('rpc/sim-pump-sell.json', templated(scenarioRecord(plan, built, r, [dev, ata, plan.pump!.volumeAccumulator.toBase58()], 'pump.fun curve sell of 50% of a dev wallet: venue-built transaction, simulated on mainnet'), names));
    }
    const tight = await venue.buildTransaction({ ...plan, minOutRaw: plan.outRaw * 2n }, rpc);
    const t = await simulate(tight);
    const reason = describeTxError(t.err, t.logs, tight.instructions.map((ix) => ix.programId.toBase58()));
    report('pump', 'sell: slippage refusal', !t.ok && JSON.stringify(t.err).includes('6003') && /slippage/.test(reason), `${JSON.stringify(t.err)} -> "${reason}"`);
    return;
  }
  skip('pump', 'sell', `no launch dev wallet still held its tokens (${tried} tried)`);
}

function scenarioRecord(plan: SwapPlan, built: BuiltSwap, r: SwapResultCheck, userAccounts: string[], description: string) {
  return {
    capturedAt: new Date().toISOString(),
    description,
    scenario: {
      side: plan.side,
      route: plan.route,
      mint: plan.mint.toBase58(),
      decimals: plan.decimals,
      inRaw: plan.inRaw.toString(),
      heldRaw: plan.heldRaw.toString(),
      outRaw: plan.outRaw.toString(),
      minOutRaw: plan.minOutRaw.toString(),
      maxInRaw: plan.maxInRaw.toString(),
      slippageBps: plan.slippageBps,
      platformFeeBps: PLATFORM_FEE_BPS,
      platformFee: plan.platformFee.toString(),
      priorityLamports: plan.priorityLamports.toString(),
      tipLamports: plan.tipLamports.toString(),
      rentLamports: plan.rentLamports.toString(),
      computeUnits: built.computeUnits,
      unitsConsumed: r.sim.units,
      routeLamports: r.routeLamports.toString(),
      tokens: r.tokens.toString(),
    },
    /** Accounts the venue read while planning (user-specific ones removed: a test wallet has none). */
    accounts: seenAccounts(userAccounts),
    landing: r.landing,
  };
}

// --- PumpSwap ----------------------------------------------------------------

interface Holder {
  mint: string;
  owner: string;
  amount: bigint;
  program: string;
  signature: string;
}

/** Recent signers of a program that hold a token after a successful transaction (newest first). */
async function recentHolders(program: string, limit: number, accept: (h: Holder) => boolean): Promise<Holder[]> {
  const sigs = await rpc.getSignaturesForAddress(new PublicKey(program), { limit }, 'confirmed');
  const out: Holder[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    const res = await rawRpc<RawTx>(INDEXED_URL, 'getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    await sleep(250);
    const tx = res.result;
    if (!tx) continue;
    const signer = tx.transaction.message.accountKeys[0];
    for (const b of tx.meta.postTokenBalances ?? []) {
      if (b.owner !== signer || b.mint === WSOL || b.uiTokenAmount.amount === '0') continue;
      const h = { mint: b.mint, owner: signer, amount: BigInt(b.uiTokenAmount.amount), program: b.programId ?? '', signature: s.signature };
      if (accept(h)) out.push(h);
    }
  }
  return out;
}

/** Wallets that have held `mint` for a while (largest accounts), quiet for two minutes, newest buyers last. */
async function quietHolders(mint: string, recent: Holder[]): Promise<Holder[]> {
  const out: Holder[] = [];
  let largest: Awaited<ReturnType<Connection['getTokenLargestAccounts']>> | null = null;
  for (let attempt = 0; attempt < 5 && !largest; attempt++) {
    largest = await indexed.getTokenLargestAccounts(new PublicKey(mint), 'confirmed').catch(() => null);
    if (!largest) await sleep(3000 * (attempt + 1));
  }
  if (largest) {
    const infos = await rpc.getMultipleAccountsInfo(largest.value.map((l) => l.address), 'confirmed');
    for (let i = 0; i < infos.length; i++) {
      const a = infos[i];
      if (!isTokenAccount(a ? { owner: a.owner, data: Buffer.from(a.data) } : null)) continue;
      const owner = tokenOwnerOf(Buffer.from(a!.data));
      const ownerInfo = await rpc.getAccountInfo(new PublicKey(owner), 'confirmed');
      // A wallet (system account with SOL for fees), not a pool or program vault.
      if (!ownerInfo || !ownerInfo.owner.equals(SystemProgram.programId) || ownerInfo.lamports < 10_000_000) continue;
      if (!(await quiet(owner))) continue;
      out.push({ mint, owner, amount: BigInt(largest.value[i].amount), program: a!.owner.toBase58(), signature: '' });
      if (out.length >= 3) break;
    }
  }
  return [...out, ...recent.filter((h) => h.mint === mint)];
}

async function checkPumpSwap(feeWallet: string, payer: Fresh | null): Promise<Holder[]> {
  console.log('\nPumpSwap (direct pool route)');
  const recent = await recentHolders(PUMPSWAP_PROGRAM, 40, (h) => h.mint.endsWith('pump'));
  let found: Holder | null = null;
  for (const h of recent) {
    const pool = await rpc.getAccountInfo(canonicalPoolOf(new PublicKey(h.mint)), 'confirmed');
    if (pool && pool.owner.toBase58() === PUMPSWAP_PROGRAM) {
      found = h;
      break;
    }
  }
  if (!found) {
    skip('pumpswap', 'buy/sell', 'no recent holder of a token with a canonical pool');
    return [];
  }
  const holders = await quietHolders(found.mint, recent);
  report('pumpswap', 'canonical pool', true, `${canonicalPoolOf(new PublicKey(found.mint)).toBase58()} for ${found.mint} (${found.program === TOKEN_2022_PROGRAM_ID.toBase58() ? 'Token-2022' : 'SPL'} base)`);
  if (payer) {
    const { world, venue } = venueFor(feeWallet);
    const token = addToken(world, found.mint, 'migrated');
    rpc.seen.clear();
    const plan = await venue.plan(ticketFor(world, token, payer.address, 'buy', 0.01, 'native'), rpc, new PublicKey(payer.address));
    report('pumpswap', 'buy: route', plan.route === 'pumpswap', `${plan.route} (${plan.quote.venue}), price impact ${(plan.priceImpact * 100).toFixed(3)}%`);
    if (plan.route === 'pumpswap') {
      const built = await venue.buildTransaction(plan, rpc);
      const ata = getAssociatedTokenAddressSync(plan.mint, plan.owner, true, plan.pool!.swap.baseTokenProgram).toBase58();
      const r = await checkSwap('pumpswap', 'buy', plan, built, PUMPSWAP_BUY_COMPUTE_UNITS, { tokenAccount: ata, feeWallet, rentAccounts: plan.rentAccounts });
      if (r && RECORD) {
        const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, plan.owner, true, TOKEN_PROGRAM_ID).toBase58();
        const uva = plan.pool!.volumeAccumulator.toBase58();
        const names = { [payer.address]: 'OWNER', [ata]: 'OWNER_ATA', [wsolAta]: 'WSOL_ATA', [uva]: 'UVA', [feeWallet]: 'FEE_WALLET', [built.instructions[built.instructions.length - 1].keys[1].pubkey.toBase58()]: 'TIP' };
        writeFixture('rpc/sim-pumpswap-buy.json', templated(scenarioRecord(plan, built, r, [payer.address, ata, wsolAta, uva], 'PumpSwap canonical pool buy of 0.01 SOL by a wallet without pump history: venue-built transaction, simulated on mainnet'), names));
      }
    }
  } else skip('pumpswap', 'buy', 'no funded wallet without pump history found');

  let seller: Holder | null = null;
  let plan: SwapPlan | null = null;
  let venue: LiveVenue | null = null;
  for (const h of holders) {
    const v = venueFor(feeWallet);
    const token = addToken(v.world, h.mint, 'migrated');
    rpc.seen.clear();
    try {
      plan = await v.venue.plan(ticketFor(v.world, token, h.owner, 'sell', 50, 'percent'), rpc, new PublicKey(h.owner));
      seller = h;
      venue = v.venue;
      break;
    } catch (err) {
      if (!(err instanceof PlanError)) throw err;
    }
  }
  if (!seller || !plan || !venue) skip('pumpswap', 'sell', `none of ${holders.length} holders still holds ${found.mint}`);
  else try {
    const found2 = seller;
    report('pumpswap', 'sell: route', plan.route === 'pumpswap', `${plan.route}, holder ${found2.owner}${found2.signature ? ' (recent buyer)' : ' (long-time holder, quiet)'}`);
    const built = await venue.buildTransaction(plan, rpc);
    const ata = getAssociatedTokenAddressSync(plan.mint, plan.owner, true, plan.pool!.swap.baseTokenProgram).toBase58();
    const r = await checkSwap('pumpswap', 'sell', plan, built, PUMPSWAP_SELL_COMPUTE_UNITS, { tokenAccount: ata, feeWallet, rentAccounts: [] });
    if (r && RECORD) {
      const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, plan.owner, true, TOKEN_PROGRAM_ID).toBase58();
      const names = { [found2.owner]: 'OWNER', [ata]: 'OWNER_ATA', [wsolAta]: 'WSOL_ATA', [feeWallet]: 'FEE_WALLET', [built.instructions[built.instructions.length - 1].keys[1].pubkey.toBase58()]: 'TIP' };
      writeFixture('rpc/sim-pumpswap-sell.json', templated(scenarioRecord(plan, built, r, [found2.owner, ata, wsolAta, plan.pool!.volumeAccumulator.toBase58()], 'PumpSwap canonical pool sell of 50% of a holder: venue-built transaction, simulated on mainnet'), names));
    }
    const tight = await venue.buildTransaction({ ...plan, minOutRaw: plan.outRaw * 2n }, rpc);
    const t = await simulate(tight);
    const reason = describeTxError(t.err, t.logs, tight.instructions.map((ix) => ix.programId.toBase58()));
    report('pumpswap', 'sell: slippage refusal', !t.ok && JSON.stringify(t.err).includes('6004') && /slippage/.test(reason), `${JSON.stringify(t.err)} -> "${reason}"`);
  } catch (err) {
    report('pumpswap', 'sell', false, errText(err));
  }

  // Fallback: a pump token without a canonical pool goes to Jupiter.
  const { world: w2, venue: v2 } = venueFor(feeWallet);
  const old = addToken(w2, PRE_PUMPSWAP_MIGRATED, 'migrated');
  try {
    const fallback = await v2.plan(ticketFor(w2, old, payer?.address ?? found.owner, 'buy', 0.01, 'native'), rpc, new PublicKey(payer?.address ?? found.owner));
    report('pumpswap', 'fallback without a pool', fallback.route === 'jupiter', `${PRE_PUMPSWAP_MIGRATED} (migrated before PumpSwap) routes via ${fallback.route} (${fallback.quote.venue})`);
  } catch (err) {
    report('pumpswap', 'fallback without a pool', false, errText(err));
  }
  return seller ? [seller, ...holders.filter((h) => h !== seller)] : holders;
}

// --- Jupiter -----------------------------------------------------------------

async function jupiterRaw(path: string, init?: RequestInit): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${JUPITER_URL.replace(/\/+$/, '')}/swap/v1/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    await sleep(1100); // lite-api: a handful of requests per second
    return { status: res.status, json: (await res.json()) as Record<string, unknown>, headers: res.headers };
  }
  throw new Error('Jupiter rate limited');
}

async function loadTables(addresses: string[]): Promise<AddressLookupTableAccount[]> {
  return Promise.all(
    addresses.map(async (a) => {
      const res = await rpc.getAddressLookupTable(new PublicKey(a));
      if (!res.value) throw new Error(`lookup table ${a} not found`);
      return res.value;
    }),
  );
}

async function jupiterSwap(label: string, feeWallet: string, mint: string, owner: string, side: 'buy' | 'sell', record: string | null, decimals = 6): Promise<void> {
  const { world, venue } = venueFor(feeWallet);
  const token = addToken(world, mint, 'migrated', decimals);
  token.launchpad = mint.endsWith('pump') ? 'pump' : 'other';
  rpc.seen.clear();
  const requests: { url: string; body: unknown; json: unknown }[] = [];
  venue.deps.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    // Without the client's 8 s abort: lite-api's rate limit backoff alone can take longer.
    const res = await politeFetch(input, { ...init, signal: undefined });
    const text = await res.text();
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, json: JSON.parse(text) });
    return new Response(text, { status: res.status, headers: res.headers });
  }) as typeof fetch;
  const plan = await venue.plan(ticketFor(world, token, owner, side, side === 'buy' ? 0.01 : 50, side === 'buy' ? 'native' : 'percent'), rpc, new PublicKey(owner), { directPool: false });
  const q = plan.jupiter!;
  report('jupiter', `${label}: quote`, plan.route === 'jupiter' && jupiterQuoteSchema.safeParse(q).success, `${q.inAmount} -> ${q.outAmount} (min ${q.otherAmountThreshold}, ${q.slippageBps} bps) via ${plan.quote.venue}; ${q.routePlan.length} step(s); fields ${Object.keys(q).join(',')}`);
  const built = await venue.buildTransaction(plan, rpc);
  const si = requests.find((r) => r.url.includes('swap-instructions'))!.json as Record<string, unknown>;
  report('jupiter', `${label}: swap-instructions`, swapInstructionsSchema.safeParse(si).success && !si.simulationError, `computeUnitLimit ${si.computeUnitLimit}, ${(si.setupInstructions as unknown[]).length} setup, cleanup ${si.cleanupInstruction ? 'yes' : 'no'}, ${(si.addressLookupTableAddresses as unknown[]).length} lookup table(s); fields ${Object.keys(si).join(',')}`);
  report('jupiter', `${label}: lookup tables`, built.lookupTables.length === (si.addressLookupTableAddresses as unknown[]).length, `${built.lookupTables.map((t) => `${t.key.toBase58()} (${t.state.addresses.length} addresses)`).join(', ')} resolved with getAddressLookupTable; the message uses ${built.tx.message.addressTableLookups.length}`);
  const ata = getAssociatedTokenAddressSync(plan.mint, plan.owner, true, (await rpc.getAccountInfo(plan.mint))!.owner).toBase58();
  const r = await checkSwap('jupiter', label, plan, built, Number(si.computeUnitLimit ?? 0) + EXTRA_COMPUTE_UNITS, { tokenAccount: ata, feeWallet, rentAccounts: plan.rentAccounts });
  if (r && record) {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, plan.owner, true, TOKEN_PROGRAM_ID).toBase58();
    const names = {
      [owner]: 'OWNER',
      [ata]: 'OWNER_ATA',
      [wsolAta]: 'WSOL_ATA',
      [pumpSdk.userVolumeAccumulatorPda(plan.owner).toBase58()]: 'UVA_PUMP',
      [swapSdk.userVolumeAccumulatorPda(plan.owner).toBase58()]: 'UVA_AMM',
      [feeWallet]: 'FEE_WALLET',
      [built.instructions[built.instructions.length - 1].keys[1].pubkey.toBase58()]: 'TIP',
      [mint]: 'MINT',
    };
    const quoteReq = requests.find((x) => x.url.includes('/quote'))!;
    writeFixture(`jupiter/quote-${record}.json`, templated(quoteReq.json, names));
    writeFixture(`jupiter/swap-instructions-${record}.json`, templated(si, names));
    writeFixture(`jupiter/lookup-tables-${record}.json`, Object.fromEntries(built.lookupTables.map((t) => [t.key.toBase58(), t.state.addresses.map((a) => a.toBase58())])));
    writeFixture(`rpc/tx-jupiter-${record}.json`, templated(r.landing, names));
  }
}

async function checkJupiter(feeWallet: string, payer: Fresh | null, holders: Holder[]): Promise<void> {
  console.log('\nJupiter Swap API v1');
  // Errors: a refused pair, an unroutable size, an equal pair.
  const client = new JupiterClient({ baseUrl: JUPITER_URL, apiKey: null }, politeFetch);
  const random = PublicKey.unique().toBase58();
  for (const [name, params, fixture] of [
    ['token not tradable', { inputMint: WSOL, outputMint: random, amount: 10_000_000n, slippageBps: 100 }, 'error-not-tradable'],
    ['no route', { inputMint: WSOL, outputMint: USDC, amount: 1n, slippageBps: 100 }, 'error-no-route'],
  ] as const) {
    const raw = await jupiterRaw(`quote?inputMint=${params.inputMint}&outputMint=${params.outputMint}&amount=${params.amount}&slippageBps=100`);
    const err = await client.quote(params).catch((e: unknown) => e);
    report('jupiter', `error: ${name}`, raw.status === 400 && err instanceof JupiterRouteError, `HTTP ${raw.status} ${JSON.stringify(raw.json)} -> ${err instanceof Error ? err.constructor.name : 'no error'}`);
    writeFixture(`jupiter/${fixture}.json`, templated(raw.json, { [random]: 'MINT' }));
  }
  const limits = await jupiterRaw(`quote?inputMint=${WSOL}&outputMint=${USDC}&amount=10000000&slippageBps=50`);
  report('jupiter', 'rate limit headers', null, `x-ratelimit-remaining ${limits.headers.get('x-ratelimit-remaining')}, x-ratelimit-current ${limits.headers.get('x-ratelimit-current')} (lite-api, no key)`);

  if (payer && holders.length) {
    await jupiterSwap('migrated token buy', feeWallet, holders[0].mint, payer.address, 'buy', 'buy').catch((e) => report('jupiter', 'migrated token buy', false, errText(e)));
    let sold = false;
    for (const h of holders) {
      try {
        await jupiterSwap('migrated token sell', feeWallet, h.mint, h.owner, 'sell', 'sell');
        sold = true;
        break;
      } catch (e) {
        if (!(e instanceof PlanError)) {
          report('jupiter', 'migrated token sell', false, errText(e));
          sold = true;
          break;
        }
      }
    }
    if (!sold) skip('jupiter', 'migrated token sell', 'no holder still holds the token');
  } else skip('jupiter', 'migrated token', 'no holder / payer found');
  if (payer) await jupiterSwap('USDC buy', feeWallet, USDC, payer.address, 'buy', null).catch((e) => report('jupiter', 'USDC buy', false, errText(e)));

  // Slippage: a minimum out above what the route returns.
  if (payer) {
    const quote = (await jupiterRaw(`quote?inputMint=${WSOL}&outputMint=${USDC}&amount=10000000&slippageBps=50&restrictIntermediateTokens=true&maxAccounts=54`)).json as unknown as JupiterQuote;
    // The route instruction carries quoted_out_amount and slippage_bps and checks the minimum on chain
    // (otherAmountThreshold is not sent): a quote claiming twice the real output cannot be met.
    const greedy = { ...quote, outAmount: String(BigInt(quote.outAmount) * 2n), otherAmountThreshold: String(BigInt(quote.otherAmountThreshold) * 2n) };
    const viaClient = await client.swapInstructions(greedy, payer.address).catch((e: unknown) => e);
    report('jupiter', 'slippage: swap-instructions', null, viaClient instanceof Error ? `${viaClient.constructor.name}: ${viaClient.message}` : `answered 200 without simulationError (computeUnitLimit ${(viaClient as { computeUnitLimit?: number }).computeUnitLimit}): Jupiter's own simulation does not report slippage`);
    const raw = await jupiterRaw('swap-instructions', { method: 'POST', body: JSON.stringify({ quoteResponse: greedy, userPublicKey: payer.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }) });
    const parsed = swapInstructionsSchema.parse(raw.json);
    const owner = new PublicKey(payer.address);
    const ixs: TransactionInstruction[] = swapInstructions({
      owner,
      side: 'buy',
      parts: { setup: parsed.setupInstructions.map(toInstruction), swap: [toInstruction(parsed.swapInstruction)], cleanup: parsed.cleanupInstruction ? [toInstruction(parsed.cleanupInstruction)] : [] },
      computeUnits: 400_000,
      priorityLamports: 0n,
      platformFee: null,
      tip: null,
    });
    const tables = await loadTables(parsed.addressLookupTableAddresses);
    const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash('confirmed');
    const tx = compileV0(owner, blockhash, ixs, tables);
    const s = await simulate({ tx, message: tx.message.serialize(), instructions: ixs, lookupTables: tables, computeUnits: 400_000, lastValidBlockHeight });
    const reason = describeTxError(s.err, s.logs, ixs.map((ix) => ix.programId.toBase58()));
    report('jupiter', 'slippage: on-chain error', !s.ok && JSON.stringify(s.err).includes('6001') && /slippage/.test(reason), `${JSON.stringify(s.err)} (Jupiter SlippageToleranceExceeded) -> "${reason}"`);
  }
}

// --- Fills on real transactions ----------------------------------------------

interface RawTx {
  slot: number;
  blockTime: number | null;
  version: 'legacy' | 0;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: { accountIndex: number; mint: string; owner: string; programId: string; uiTokenAmount: { amount: string; decimals: number } }[];
    postTokenBalances: { accountIndex: number; mint: string; owner: string; programId: string; uiTokenAmount: { amount: string; decimals: number } }[];
    logMessages: string[];
    loadedAddresses?: { writable: string[]; readonly: string[] };
    innerInstructions?: unknown[];
  };
  transaction: {
    signatures: string[];
    message: {
      header: { numRequiredSignatures: number; numReadonlySignedAccounts: number; numReadonlyUnsignedAccounts: number };
      accountKeys: string[];
      instructions: { programIdIndex: number; accounts: number[]; data: string }[];
      addressTableLookups?: unknown[];
    };
  };
}

/** pump TradeEvent / pump-amm Buy/SellEvent amounts from a transaction's logs. */
function tradeEvents(logs: string[]): { program: 'pump' | 'amm'; side: 'buy' | 'sell'; tokens: bigint; sol: bigint; user: string; mint?: string }[] {
  const out: ReturnType<typeof tradeEvents> = [];
  const disc = (name: string) => Buffer.from(requireCjs('node:crypto').createHash('sha256').update(`event:${name}`).digest()).subarray(0, 8);
  const tradeDisc = disc('TradeEvent');
  const buyDisc = disc('BuyEvent');
  const sellDisc = disc('SellEvent');
  for (const line of logs) {
    if (!line.startsWith('Program data: ')) continue;
    const data = Buffer.from(line.slice('Program data: '.length), 'base64');
    const head = data.subarray(0, 8);
    try {
      if (head.equals(tradeDisc)) {
        const e = pumpSdk.PUMP_SDK.decodeTradeEventBc(data.subarray(8));
        // What the user paid / received in lamports: the curve amount with the fees on top (buy) or off (sell).
        const fees = BigInt(e.fee.toString()) + BigInt(e.creatorFee.toString());
        const solAmount = BigInt(e.solAmount.toString());
        out.push({ program: 'pump', side: e.isBuy ? 'buy' : 'sell', tokens: BigInt(e.tokenAmount.toString()), sol: e.isBuy ? solAmount + fees : solAmount - fees, user: e.user.toBase58(), mint: e.mint.toBase58() });
      } else if (head.equals(buyDisc)) {
        const e = pumpSdk.PUMP_SDK.decodeBuyEventAmm(data.subarray(8));
        // `buy` (exact out, the venue's) reports the total in userQuoteAmountIn; `buy_exact_quote_in` in quoteAmountIn.
        const paid = e.ixName === 'buy_exact_quote_in' ? e.quoteAmountIn : e.userQuoteAmountIn;
        out.push({ program: 'amm', side: 'buy', tokens: BigInt(e.baseAmountOut.toString()), sol: BigInt(paid.toString()), user: e.user.toBase58() });
      } else if (head.equals(sellDisc)) {
        const e = pumpSdk.PUMP_SDK.decodeSellEventAmm(data.subarray(8));
        out.push({ program: 'amm', side: 'sell', tokens: BigInt(e.baseAmountIn.toString()), sol: BigInt(e.userQuoteAmountOut.toString()), user: e.user.toBase58() });
      }
    } catch {
      // another program's event
    }
  }
  return out;
}

/**
 * Top-level System transfers from `from` to someone else (tips, bot fees): SOL wrapped into its own
 * token accounts is not a transfer out.
 */
function systemTransfers(tx: RawTx, keys: string[], from: string): bigint {
  const own = new Set([
    getAssociatedTokenAddressSync(NATIVE_MINT, new PublicKey(from), true, TOKEN_PROGRAM_ID).toBase58(),
    ...(tx.meta.preTokenBalances ?? []).concat(tx.meta.postTokenBalances ?? []).filter((b) => b.owner === from).map((b) => keys[b.accountIndex]),
  ]);
  let total = 0n;
  for (const ix of tx.transaction.message.instructions) {
    if (keys[ix.programIdIndex] !== SystemProgram.programId.toBase58()) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (data.length === 12 && data.readUInt32LE(0) === 2 && keys[ix.accounts[0]] === from && !own.has(keys[ix.accounts[1]])) total += data.readBigUInt64LE(4);
  }
  return total;
}

/** Programs invoked at the top level (log lines "Program X invoke [1]"). */
function topLevelPrograms(logs: string[]): string[] {
  return [...new Set(logs.map((l) => /^Program (\w+) invoke \[1\]$/.exec(l)?.[1]).filter((x): x is string => !!x))];
}

/** Programs a plain swap transaction may call besides the venue's own. */
const PLAIN_PROGRAMS = new Set([
  ComputeBudgetProgram.programId.toBase58(),
  SystemProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
]);

/**
 * A plain user swap the fill parser can be checked on: signed by the trader, calling only the venue's
 * program (no bot wrapper, no other DEX, no launch paying for a new token's accounts), one trade event.
 */
function classify(tx: RawTx, program: string): string | null {
  const logs = tx.meta.logMessages ?? [];
  if (logs.some((l) => /Instruction: Create(V2)?$/.test(l))) return null;
  if (!topLevelPrograms(logs).every((p) => PLAIN_PROGRAMS.has(p) || p === program)) return null;
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
  const signer = keys[0];
  const mint = tradedMint(tx, signer);
  if (!mint || foreignTokenTransfer(tx, keys, signer)) return null;
  if (program === JUPITER_PROGRAM) return (tx.transaction.message.addressTableLookups ?? []).length ? 'jupiter' : null;
  const events = tradeEvents(logs).filter((e) => e.user === signer);
  if (events.length !== 1) return null;
  // A pool with SOL as its base (the token as quote) reports the trade the other way round: not a pump pool.
  const delta = tokenDeltaOf(tx, signer, mint);
  if ((events[0].side === 'buy') !== delta > 0n) return null;
  return `${events[0].program === 'pump' ? 'pump' : 'pumpswap'}-${events[0].side}`;
}

/** A top-level token transfer from the signer to someone else (a front-end's fee taken in wrapped SOL, ...). */
function foreignTokenTransfer(tx: RawTx, keys: string[], signer: string): boolean {
  const own = new Set((tx.meta.preTokenBalances ?? []).concat(tx.meta.postTokenBalances ?? []).filter((b) => b.owner === signer).map((b) => keys[b.accountIndex]));
  own.add(getAssociatedTokenAddressSync(NATIVE_MINT, new PublicKey(signer), true, TOKEN_PROGRAM_ID).toBase58());
  return tx.transaction.message.instructions.some((ix) => {
    const program = keys[ix.programIdIndex];
    if (program !== TOKEN_PROGRAM_ID.toBase58() && program !== TOKEN_2022_PROGRAM_ID.toBase58()) return false;
    const data = Buffer.from(bs58.decode(ix.data));
    const dest = data[0] === 3 ? keys[ix.accounts[1]] : data[0] === 12 ? keys[ix.accounts[2]] : null;
    return dest !== null && !own.has(dest);
  });
}

/** Wrapped SOL the signer received into (or spent from) a wSOL account it keeps open. */
function keptWsolDelta(tx: RawTx, signer: string): bigint {
  const pre = (tx.meta.preTokenBalances ?? []).filter((b) => b.owner === signer && b.mint === WSOL);
  const post = (tx.meta.postTokenBalances ?? []).filter((b) => b.owner === signer && b.mint === WSOL);
  let delta = 0n;
  for (const b of post) {
    const before = pre.find((x) => x.accountIndex === b.accountIndex);
    if (before) delta += BigInt(b.uiTokenAmount.amount) - BigInt(before.uiTokenAmount.amount);
  }
  return delta;
}

/** The signer's token balance change of `mint` (all its accounts). */
function tokenDeltaOf(tx: RawTx, signer: string, mint: string): bigint {
  const sum = (list: RawTx['meta']['preTokenBalances']) => (list ?? []).filter((b) => b.owner === signer && b.mint === mint).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
}

/** The non-SOL mint whose balance the signer changed (null when none or several). */
function tradedMint(tx: RawTx, signer: string): string | null {
  const mints = new Set((tx.meta.postTokenBalances ?? []).concat(tx.meta.preTokenBalances ?? []).filter((b) => b.owner === signer && b.mint !== WSOL).map((b) => b.mint));
  const moved = [...mints].filter((m) => tokenDeltaOf(tx, signer, m) !== 0n);
  return moved.length === 1 ? moved[0] : null;
}

/** A landed Jupiter swap that failed on its slippage bound: readable reason, fee still paid. */
async function checkFailedSwap(): Promise<void> {
  const sigs = await rpc.getSignaturesForAddress(new PublicKey(JUPITER_PROGRAM), { limit: 1000 }, 'confirmed');
  let fetched = 0;
  for (const s of sigs) {
    const ie = (s.err as { InstructionError?: [number, { Custom?: number }] } | null)?.InstructionError;
    if (!ie || ie[1]?.Custom !== 6001) continue;
    if (fetched++ >= 15) break;
    const res = await rawRpc<RawTx>(INDEXED_URL, 'getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    await sleep(300);
    const tx = res.result;
    if (!tx) continue;
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
    if (keys[tx.transaction.message.instructions[ie[0]]?.programIdIndex] !== JUPITER_PROGRAM) continue;
    const signer = keys[0];
    const mints = [...new Set((tx.meta.preTokenBalances ?? []).filter((b) => b.owner === signer && b.mint !== WSOL).map((b) => b.mint))];
    const mint = mints[0] ?? null;
    const d = walletDelta(tx as unknown as TxLike, s.signature, signer, mint);
    const solDelta = d.ownerPostLamports - d.ownerPreLamports;
    report('fills', 'failed swap (slippage)', !d.ok && /slippage exceeded/.test(d.error ?? '') && solDelta === -d.feeLamports - systemTransfers(tx, keys, signer), `${s.signature} (${tx.version === 0 ? 'v0' : 'legacy'}): err ${JSON.stringify(tx.meta.err)} -> "${d.error}"; the wallet paid only the fee ${d.feeLamports} (SOL ${solDelta})`);
    if (RECORD && mint) {
      // The trader becomes <OWNER> (a test wallet), the token it traded <MINT>.
      const names: Record<string, string> = { [signer]: 'OWNER', [mint]: 'MINT' };
      writeFixture('rpc/tx-jupiter-failed.json', templated({ ...tx, meta: { ...tx.meta, innerInstructions: [] }, transaction: { ...tx.transaction, signatures: ['<SIG>'] } }, names));
    }
    return;
  }
  skip('fills', 'failed swap (slippage)', 'no recent Jupiter transaction failed with 6001');
}

async function checkFills(): Promise<void> {
  console.log('\nFill parsing on real transactions');
  const picked = new Map<string, { sig: string; tx: RawTx }>();
  let v1 = 0;
  let scanned = 0;
  const wanted: Record<string, string[]> = {
    [PUMP_PROGRAM]: ['pump-buy', 'pump-sell'],
    [PUMPSWAP_PROGRAM]: ['pumpswap-buy', 'pumpswap-sell'],
    [JUPITER_PROGRAM]: ['jupiter'],
  };
  for (const program of [PUMP_PROGRAM, PUMPSWAP_PROGRAM, JUPITER_PROGRAM]) {
    const sigs = await rpc.getSignaturesForAddress(new PublicKey(program), { limit: 400 }, 'confirmed');
    let fetched = 0;
    for (const s of sigs) {
      // Enough: every kind of this program found, legacy and v0 where both exist, or 160 transactions read.
      const have = (k: string) => [...picked.keys()].filter((x) => x.startsWith(`${k}-`));
      if (fetched >= 160 || wanted[program].every((k) => have(k).length >= 2)) break;
      if (s.err) continue;
      fetched++;
      const res = await rawRpc<RawTx>(INDEXED_URL, 'getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
      await sleep(250);
      scanned++;
      if (res.error?.code === -32015) {
        v1++;
        continue;
      }
      const tx = res.result;
      if (!tx || tx.meta.err) continue;
      const kind = classify(tx, program);
      if (!kind) continue;
      const version = tx.version === 'legacy' ? 'legacy' : (tx.transaction.message.addressTableLookups ?? []).length ? 'v0-alt' : 'v0';
      const signer = tx.transaction.message.accountKeys[0];
      const spl = (tx.meta.postTokenBalances ?? []).concat(tx.meta.preTokenBalances ?? []).some((b) => b.owner === signer && b.mint !== WSOL && b.programId === TOKEN_PROGRAM_ID.toBase58());
      const key = `${kind}-${version}${spl ? '-spl' : ''}`;
      if (!picked.has(key)) picked.set(key, { sig: s.signature, tx });
    }
    await sleep(500);
  }
  report('fills', 'transaction versions', null, `${v1} of ${scanned} recent successful signatures are v1 transactions, refused under maxSupportedTransactionVersion 0 (-32015); the venue builds and reads v0 only`);
  await checkFailedSwap();
  for (const [kind, { sig, tx }] of [...picked].sort(([a], [b]) => a.localeCompare(b))) {
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
    const signer = keys[0];
    const mint = tradedMint(tx, signer);
    const uvas = [pumpSdk.userVolumeAccumulatorPda(new PublicKey(signer)).toBase58(), swapSdk.userVolumeAccumulatorPda(new PublicKey(signer)).toBase58()];
    const d = walletDelta(tx as unknown as TxLike, sig, signer, mint, uvas);
    // The same through web3.js's parsed response (PublicKey objects, Message / MessageV0).
    let parsed: Awaited<ReturnType<Connection['getTransaction']>> | null = null;
    for (let attempt = 0; attempt < 4 && !parsed; attempt++) {
      parsed = await indexed.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null);
      await sleep(1000 * (attempt + 1));
    }
    const d2 = parsed ? walletDelta(parsed as unknown as TxLike, sig, signer, mint, uvas) : null;
    const sameParsed = !d2 || (d2.tokenPostRaw === d.tokenPostRaw && d2.tokenPreRaw === d.tokenPreRaw && d2.ownerPostLamports === d.ownerPostLamports && d2.rentLamports === d.rentLamports);
    // Lookup-table ordering (static keys, then loaded writable, then loaded readonly): every token account
    // whose balance changed must sit at a writable index.
    const h = tx.transaction.message.header;
    const nStatic = tx.transaction.message.accountKeys.length;
    const writable = (i: number) =>
      i < nStatic ? i < h.numRequiredSignatures - h.numReadonlySignedAccounts || (i >= h.numRequiredSignatures && i < nStatic - h.numReadonlyUnsignedAccounts) : i < nStatic + (tx.meta.loadedAddresses?.writable.length ?? 0);
    const changed = (tx.meta.postTokenBalances ?? []).filter((b) => (tx.meta.preTokenBalances ?? []).find((x) => x.accountIndex === b.accountIndex)?.uiTokenAmount.amount !== b.uiTokenAmount.amount);
    const ataOk = changed.every((b) => writable(b.accountIndex));
    const viaTables = changed.filter((b) => b.accountIndex >= nStatic).length;
    const tokenDelta = d.tokenPostRaw - d.tokenPreRaw;
    const solDelta = d.ownerPostLamports - d.ownerPreLamports;
    const other = systemTransfers(tx, keys, signer);
    const t22 = (tx.meta.postTokenBalances ?? []).concat(tx.meta.preTokenBalances ?? []).some((b) => b.owner === signer && b.mint === mint && b.programId === TOKEN_2022_PROGRAM_ID.toBase58());
    let detail = `${sig} (${tx.version === 0 ? `v0, ${(tx.transaction.message.addressTableLookups ?? []).length} lookup table(s), ${(tx.meta.loadedAddresses?.writable.length ?? 0) + (tx.meta.loadedAddresses?.readonly.length ?? 0)} loaded addresses` : 'legacy'}, ${t22 ? 'Token-2022' : 'SPL'} ${d.decimals} decimals): token ${tokenDelta}, SOL ${solDelta}, fee ${d.feeLamports}, rent ${d.rentLamports}, other transfers ${other}`;
    let ok = sameParsed && ataOk && tokenDelta !== 0n;
    if (viaTables) detail += `; ${viaTables} changed token account(s) addressed through lookup tables, all at writable indexes`;
    // A Jupiter route may take an integrator fee inside the route: its pump events are not the user's whole leg.
    const ev = kind.startsWith('jupiter') ? null : tradeEvents(tx.meta.logMessages ?? []).find((e) => e.user === signer);
    if (ev) {
      // The trader's SOL leg as the venue computes it (fees, tips and rent out) vs the program's own event;
      // a third-party trader may keep its proceeds wrapped (the venue always unwraps).
      const kept = keptWsolDelta(tx, signer);
      const leg = ev.side === 'buy' ? -solDelta - kept - d.feeLamports - d.rentLamports - other : solDelta + kept + d.feeLamports + other + d.rentLamports;
      if (kept) detail += `, kept wSOL ${kept}`;
      const tokensMatch = (ev.side === 'buy' ? tokenDelta : -tokenDelta) === ev.tokens;
      detail += `; ${ev.program === 'pump' ? 'TradeEvent' : ev.side === 'buy' ? 'BuyEvent' : 'SellEvent'} ${ev.tokens} tokens for ${ev.sol} lamports vs parsed ${ev.side === 'buy' ? tokenDelta : -tokenDelta} tokens, SOL leg ${leg}`;
      ok = ok && tokensMatch && leg === ev.sol;
    }
    report('fills', kind, ok, `${detail}${!d2 ? ' (web3.js parse not compared: rate limited)' : sameParsed ? '; web3.js-parsed response reads the same' : ' (web3.js parse differs)'}${ataOk ? '' : ' (a changed token account at a read-only index: lookup-table order wrong)'}`);
    if (RECORD) writeFixture(`rpc/real-${kind}.json`, { ...tx, meta: { ...tx.meta, innerInstructions: [] } });
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Solana execution verification (read-only; nothing is signed or sent)\n  rpc ${RPC_URL}\n  indexed ${INDEXED_URL}\n  jupiter ${JUPITER_URL}\n  jito ${JITO_URL}\n  pumpportal ${PUMPPORTAL_URL}`);
  if (ONLY.has('rent')) await checkRent().catch((e) => report('rent', 'rent', false, errText(e)));
  if (ONLY.has('jito')) await checkJito().catch((e) => report('jito', 'jito', false, errText(e)));

  const needLaunches = ONLY.has('constants') || ONLY.has('pump');
  const launches = needLaunches ? new Launches(PUMPPORTAL_URL) : null;
  let first: CreateFrame | null = null;
  if (launches) {
    // The first launch on a SOL curve (a coin quoted in another pump coin is Jupiter's).
    for (let from = 0; !first; ) {
      const next = await launches.next(from, 60_000);
      if (!next) break;
      from = next.index + 1;
      const st = await new OnlinePumpLoader(rpc).load(new PublicKey(next.frame.mint), new PublicKey(next.frame.traderPublicKey)).catch(() => null);
      if (st) first = next.frame;
    }
    if (!first) report('pump', 'PumpPortal launches', false, 'no SOL-curve launch within 60 s');
    else report('pump', 'PumpPortal launches', true, `create frames streaming (first SOL-curve launch ${first.mint})`);
  }
  // Wallets: a fee wallet (any funded system account) and a payer without pump history.
  if (launches) await sleep(8000); // a few more launches for candidates
  const creators = launches?.creates.map((c) => c.traderPublicKey) ?? [];
  const global = first ? (await new OnlinePumpLoader(rpc).load(new PublicKey(first.mint), new PublicKey(first.traderPublicKey)))?.global : null;
  const pumpWallets = global ? [global.withdrawAuthority, global.authority, global.setCreatorAuthority, global.adminSetCreatorAuthority].map((k) => k.toBase58()) : ['39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'];
  const payerArg = arg('payer');
  const payer = await freshPayer([...(payerArg ? [payerArg] : []), ...creators, ...pumpWallets]);
  const feeWallet = arg('fee-wallet') ?? (await funded([...creators, ...pumpWallets], payer ? [payer.address] : [])) ?? pumpWallets[0];
  console.log(`\n  payer (no pump history) ${payer ? `${payer.address} (${sol(payer.lamports)})` : 'none found'}; fee wallet ${feeWallet}`);

  if (first && ONLY.has('constants')) await checkPumpConstants(first.mint, first.traderPublicKey).catch((e) => report('constants', 'decode', false, errText(e)));
  if (launches && first && ONLY.has('pump')) {
    console.log('\npump.fun curve route');
    const ctx: PumpContext = { launches, feeWallet, payer };
    await pumpBuy(ctx, first.mint).catch((e) => report('pump', 'buy', false, errText(e)));
    await pumpSell(ctx).catch((e) => report('pump', 'sell', false, errText(e)));
  }
  launches?.close();
  let holders: Holder[] = [];
  if (ONLY.has('pumpswap') || ONLY.has('jupiter')) holders = await checkPumpSwap(feeWallet, payer).catch((e) => (report('pumpswap', 'pumpswap', false, errText(e)), []));
  if (ONLY.has('jupiter')) await checkJupiter(feeWallet, payer, holders).catch((e) => report('jupiter', 'jupiter', false, errText(e)));
  if (ONLY.has('fills')) await checkFills().catch((e) => report('fills', 'fills', false, errText(e)));

  // Table
  const w = { area: 9, check: Math.max(...rows.map((r) => r.check.length), 5) };
  console.log(`\n${'area'.padEnd(w.area)}  ${'check'.padEnd(w.check)}  result  detail`);
  console.log(`${'-'.repeat(w.area)}  ${'-'.repeat(w.check)}  ------  ${'-'.repeat(40)}`);
  for (const r of rows) console.log(`${r.area.padEnd(w.area)}  ${r.check.padEnd(w.check)}  ${r.result.padEnd(6)}  ${r.detail}`);
  const failed = rows.filter((r) => r.result === 'FAIL').length;
  console.log(`\n${rows.filter((r) => r.result === 'ok').length} ok, ${failed} failed, ${rows.filter((r) => r.result === 'skip').length} skipped, ${rows.filter((r) => r.result === 'info').length} info`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof HttpError ? `${err.status} ${err.message}` : err);
  process.exit(2);
});
