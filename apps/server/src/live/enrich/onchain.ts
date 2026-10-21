// On-chain reads for live tokens over a Solana RPC: mint info (decimals,
// supply, mint / freeze authority) from jsonParsed accounts, Metaplex or
// Token-2022 metadata (name, symbol, uri), the pump.fun bonding curve and the
// PumpSwap pool through the pump SDKs, and the largest holders. Every read goes
// through the caller's RequestBudget. All on-chain integers are converted to UI
// units with their decimals (BN / bigint -> number only for display state; no
// amount here is ever sent back on-chain).

import { createRequire } from 'node:module';
import { PublicKey, type AccountInfo, type Connection, type ParsedAccountData } from '@solana/web3.js';
import type BN from 'bn.js';
import { cleanText } from './sanitize';

type PumpSdkModule = typeof import('@pump-fun/pump-sdk');
type PumpAmmModule = typeof import('@pump-fun/pump-swap-sdk');

const requireCjs = createRequire(import.meta.url);
let pumpSdk: PumpSdkModule | null | undefined;
let pumpAmm: PumpAmmModule | null | undefined;

/**
 * The pump SDKs, loaded lazily through require: their ESM builds do not load under every
 * runner (vitest, plain node), the CommonJS builds do. Null (logged once) when unavailable.
 */
export function loadPumpSdk(): PumpSdkModule | null {
  if (pumpSdk === undefined) {
    try {
      pumpSdk = requireCjs('@pump-fun/pump-sdk') as PumpSdkModule;
    } catch (err) {
      console.warn(`[live] pump SDK unavailable: ${err instanceof Error ? err.message : 'error'}`);
      pumpSdk = null;
    }
  }
  return pumpSdk;
}

export function loadPumpAmmSdk(): PumpAmmModule | null {
  if (pumpAmm === undefined) {
    try {
      pumpAmm = requireCjs('@pump-fun/pump-swap-sdk') as PumpAmmModule;
    } catch (err) {
      console.warn(`[live] PumpSwap SDK unavailable: ${err instanceof Error ? err.message : 'error'}`);
      pumpAmm = null;
    }
  }
  return pumpAmm;
}

/** Canonical PumpSwap pool of a pump.fun mint ('' when the SDK is unavailable). */
export function pumpPoolAddress(mint: string): string {
  const sdk = loadPumpSdk();
  if (!sdk) return '';
  try {
    return sdk.canonicalPumpPoolPda(new PublicKey(mint)).toBase58();
  } catch {
    return '';
  }
}

export const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()], METAPLEX_PROGRAM_ID)[0];
}

/** A 32-byte public key in base58, or null. */
export function parsePublicKey(address: string): PublicKey | null {
  try {
    const key = new PublicKey(address);
    return key.toBase58() === address ? key : null;
  } catch {
    return null;
  }
}

export interface OnchainMeta {
  name: string;
  symbol: string;
  uri: string;
  /** Who may change the metadata (the deployer, for most tokens), when known. */
  updateAuthority: string | null;
}

/**
 * Metaplex token metadata account (borsh): key u8, update authority, mint, then the name,
 * symbol and uri strings (u32 length + bytes, NUL padded). Null when it does not decode.
 */
export function decodeMetaplexMetadata(data: Buffer): OnchainMeta | null {
  try {
    let o = 1 + 32 + 32;
    const str = (max: number): string => {
      const len = data.readUInt32LE(o);
      o += 4;
      if (len > max || o + len > data.length) throw new Error('bad string');
      const s = data.subarray(o, o + len).toString('utf8').replace(/\0+$/, '');
      o += len;
      return s;
    };
    const updateAuthority = new PublicKey(data.subarray(1, 33)).toBase58();
    const name = str(200);
    const symbol = str(50);
    const uri = str(400);
    return { name: cleanText(name, 64), symbol: cleanText(symbol, 24), uri: cleanText(uri, 1024), updateAuthority };
  } catch {
    return null;
  }
}

export interface MintInfo {
  decimals: number;
  /** UI units. */
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token-2022 metadata extension, when present. */
  meta: OnchainMeta | null;
}

function isParsed(info: AccountInfo<Buffer | ParsedAccountData> | null | undefined): info is AccountInfo<ParsedAccountData> {
  return !!info && !Buffer.isBuffer(info.data) && typeof (info.data as ParsedAccountData).parsed === 'object';
}

function asRaw(info: AccountInfo<Buffer | ParsedAccountData> | null | undefined): AccountInfo<Buffer> | null {
  return info && Buffer.isBuffer(info.data) ? (info as AccountInfo<Buffer>) : null;
}

/** Mint fields of a jsonParsed SPL / Token-2022 mint account, or null when it is not a mint. */
export function parseMintAccount(info: AccountInfo<Buffer | ParsedAccountData> | null | undefined): MintInfo | null {
  if (!isParsed(info)) return null;
  const parsed = info.data.parsed as { type?: string; info?: Record<string, unknown> };
  if (parsed?.type !== 'mint' || !parsed.info) return null;
  const i = parsed.info;
  const decimals = typeof i.decimals === 'number' && Number.isInteger(i.decimals) && i.decimals >= 0 && i.decimals <= 18 ? i.decimals : null;
  if (decimals === null || typeof i.supply !== 'string' || !/^\d+$/.test(i.supply)) return null;
  let meta: OnchainMeta | null = null;
  const ext = Array.isArray(i.extensions) ? (i.extensions as { extension?: string; state?: Record<string, unknown> }[]) : [];
  const tm = ext.find((e) => e?.extension === 'tokenMetadata')?.state;
  if (tm) {
    const ua = typeof tm.updateAuthority === 'string' ? parsePublicKey(tm.updateAuthority) : null;
    meta = { name: cleanText(tm.name, 64), symbol: cleanText(tm.symbol, 24), uri: cleanText(tm.uri, 1024), updateAuthority: ua ? ua.toBase58() : null };
  }
  return {
    decimals,
    supply: Number(BigInt(i.supply)) / 10 ** decimals,
    mintAuthority: typeof i.mintAuthority === 'string' ? i.mintAuthority : null,
    freezeAuthority: typeof i.freezeAuthority === 'string' ? i.freezeAuthority : null,
    meta,
  };
}

const bnToUi = (v: BN, decimals: number): number => Number(BigInt(v.toString())) / 10 ** decimals;

export interface PumpCurveState {
  virtualNative: number;
  virtualTokens: number;
  realNative: number;
  realTokens: number;
  totalSupply: number;
  complete: boolean;
  creator: string;
}

/** A pump.fun bonding curve (SOL-quoted) from its raw account, or null. */
export function decodePumpCurve(raw: AccountInfo<Buffer> | null, tokenDecimals: number): PumpCurveState | null {
  const sdk = loadPumpSdk();
  if (!sdk || !raw || !raw.owner.equals(sdk.PUMP_PROGRAM_ID)) return null;
  try {
    const c = sdk.PUMP_SDK.decodeBondingCurveNullable(raw);
    if (!c) return null;
    if (c.quoteMint && !c.quoteMint.equals(PublicKey.default) && !sdk.isSolLikeQuoteMint(c.quoteMint)) return null;
    return {
      virtualNative: bnToUi(c.virtualQuoteReserves, 9),
      virtualTokens: bnToUi(c.virtualTokenReserves, tokenDecimals),
      realNative: bnToUi(c.realQuoteReserves, 9),
      realTokens: bnToUi(c.realTokenReserves, tokenDecimals),
      totalSupply: bnToUi(c.tokenTotalSupply, tokenDecimals),
      complete: c.complete,
      creator: c.creator.toBase58(),
    };
  } catch {
    return null;
  }
}

/** Everything one batched read knows about a mint: mint info, metadata, pump curve. */
export interface MintSnapshot {
  mint: MintInfo;
  meta: OnchainMeta | null;
  curve: PumpCurveState | null;
}

/** One getMultipleAccounts call: the mint (jsonParsed), its Metaplex metadata and its pump curve. Null when not a mint. */
export async function readMint(connection: Connection, mint: PublicKey): Promise<MintSnapshot | null> {
  const sdk = loadPumpSdk();
  const curvePda = sdk ? sdk.bondingCurvePda(mint) : null;
  const keys = [mint, metadataPda(mint), ...(curvePda ? [curvePda] : [])];
  const res = await connection.getMultipleParsedAccounts(keys, { commitment: 'confirmed' });
  const [mintAcc, metaAcc, curveAcc] = res.value;
  const info = parseMintAccount(mintAcc);
  if (!info) return null;
  const metaRaw = asRaw(metaAcc);
  const meta = (metaRaw && metaRaw.owner.equals(METAPLEX_PROGRAM_ID) ? decodeMetaplexMetadata(metaRaw.data) : null) ?? info.meta;
  return { mint: info, meta, curve: decodePumpCurve(asRaw(curveAcc), info.decimals) };
}

export interface PoolReserves {
  address: string;
  /** SOL side (vault plus virtual quote reserves), UI units. */
  native: number;
  tokens: number;
}

/** Reserves of a pump.fun mint's canonical PumpSwap pool (2 reads), or null. */
export async function readPumpPool(connection: Connection, mint: PublicKey, run: <T>(fn: () => Promise<T>) => Promise<T>): Promise<PoolReserves | null> {
  const sdk = loadPumpSdk();
  const amm = loadPumpAmmSdk();
  if (!sdk || !amm) return null;
  const poolKey = sdk.canonicalPumpPoolPda(mint);
  const acc = await run(() => connection.getAccountInfo(poolKey, 'confirmed'));
  if (!acc) return null;
  const pool = amm.PUMP_AMM_SDK.decodePoolNullable(acc);
  if (!pool || !pool.baseMint.equals(mint)) return null;
  const vaults = await run(() => connection.getMultipleParsedAccounts([pool.poolBaseTokenAccount, pool.poolQuoteTokenAccount], { commitment: 'confirmed' }));
  const amount = (info: AccountInfo<Buffer | ParsedAccountData> | null | undefined): number | null => {
    if (!isParsed(info)) return null;
    const ta = (info.data.parsed as { info?: { tokenAmount?: { amount?: string; decimals?: number } } }).info?.tokenAmount;
    if (!ta || typeof ta.amount !== 'string' || !/^\d+$/.test(ta.amount) || typeof ta.decimals !== 'number') return null;
    return Number(BigInt(ta.amount)) / 10 ** ta.decimals;
  };
  const tokens = amount(vaults.value[0]);
  const quote = amount(vaults.value[1]);
  if (tokens === null || quote === null || tokens <= 0) return null;
  const virtualQuote = pool.virtualQuoteReserves ? bnToUi(pool.virtualQuoteReserves, 9) : 0;
  return { address: poolKey.toBase58(), native: quote + virtualQuote, tokens };
}

/**
 * The mint a PumpSwap pool trades, when it is that mint's canonical pool quoted in WSOL (1-2 reads:
 * the pool, then the mint's decimals unless `decimalsOf` knows them). Null for any other pool.
 */
export async function readPoolMint(
  connection: Connection,
  pool: PublicKey,
  run: <T>(fn: () => Promise<T>) => Promise<T>,
  decimalsOf?: (mint: string) => number | undefined,
): Promise<{ mint: string; decimals: number } | null> {
  const sdk = loadPumpSdk();
  const amm = loadPumpAmmSdk();
  if (!sdk || !amm) return null;
  const acc = await run(() => connection.getAccountInfo(pool, 'confirmed'));
  if (!acc || !acc.owner.equals(amm.PUMP_AMM_PROGRAM_ID)) return null;
  const p = amm.PUMP_AMM_SDK.decodePoolNullable(acc);
  if (!p || p.quoteMint.toBase58() !== 'So11111111111111111111111111111111111111112') return null;
  if (!sdk.canonicalPumpPoolPda(p.baseMint).equals(pool)) return null;
  const mint = p.baseMint.toBase58();
  let decimals = decimalsOf?.(mint);
  if (decimals === undefined) {
    const info = await run(() => connection.getParsedAccountInfo(p.baseMint, 'confirmed'));
    decimals = parseMintAccount(info.value)?.decimals;
  }
  return decimals === undefined ? null : { mint, decimals };
}

export interface HolderBalance {
  owner: string;
  /** UI units. */
  balance: number;
}

/**
 * The largest holders by wallet (2 reads): getTokenLargestAccounts, then the owners of those
 * token accounts. Accounts owned by program addresses (the curve, AMM pools, vaults) are left
 * out: only on-curve (keypair) owners are wallets.
 */
export async function readTopHolders(connection: Connection, mint: PublicKey, run: <T>(fn: () => Promise<T>) => Promise<T>): Promise<HolderBalance[]> {
  const largest = await run(() => connection.getTokenLargestAccounts(mint, 'confirmed'));
  const accounts = largest.value.filter((a) => a.amount !== '0').slice(0, 20);
  if (accounts.length === 0) return [];
  const infos = await run(() => connection.getMultipleParsedAccounts(accounts.map((a) => a.address), { commitment: 'confirmed' }));
  const byOwner = new Map<string, number>();
  infos.value.forEach((info, i) => {
    if (!isParsed(info)) return;
    const owner = (info.data.parsed as { info?: { owner?: string } }).info?.owner;
    const key = typeof owner === 'string' ? parsePublicKey(owner) : null;
    if (!key || !PublicKey.isOnCurve(key.toBytes())) return;
    const a = accounts[i];
    const ui = Number(BigInt(a.amount)) / 10 ** a.decimals;
    byOwner.set(owner!, (byOwner.get(owner!) ?? 0) + ui);
  });
  return [...byOwner].map(([owner, balance]) => ({ owner, balance })).sort((a, b) => b.balance - a.balance);
}

/**
 * Creation time of an account, from its oldest signature among the newest `limit` (one read).
 * Exact for accounts with fewer signatures; otherwise an upper bound. Null when unknown.
 */
export async function readCreatedAt(connection: Connection, address: PublicKey, limit = 1000): Promise<number | null> {
  const sigs = await connection.getSignaturesForAddress(address, { limit }, 'confirmed');
  for (let i = sigs.length - 1; i >= 0; i--) {
    const t = sigs[i].blockTime;
    if (typeof t === 'number' && t > 0) return t * 1000;
  }
  return null;
}
