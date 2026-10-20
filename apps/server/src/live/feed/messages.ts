// PumpPortal data-feed messages (wss://pumpportal.fun/api/data), validated
// with zod. The feed has no versioned schema, so parsing is defensive: a frame
// that is not one of the shapes below is reported as malformed (and counted),
// never thrown. Amounts are UI units as the feed sends them: SOL (not lamports)
// and whole tokens (pump.fun mints have 6 decimals and a 1e9 supply).
//
// Shapes (as documented by PumpPortal and observed by other integrators; not
// verified against the live service from this codebase):
//   create   { signature, mint, traderPublicKey, txType: 'create', initialBuy, solAmount,
//              bondingCurveKey, vTokensInBondingCurve, vSolInBondingCurve, marketCapSol,
//              name, symbol, uri, pool: 'pump' }
//   buy/sell { signature, mint, traderPublicKey, txType: 'buy' | 'sell', tokenAmount, solAmount,
//              newTokenBalance, bondingCurveKey, vTokensInBondingCurve, vSolInBondingCurve,
//              marketCapSol, pool: 'pump' | 'pump-amm' }
//   migrate  { signature, mint, txType: 'migrate', pool: 'pump-amm' }
//   ack      { message: 'Successfully subscribed to ...' }
//   error    { errors: '...' }
// Some launchpads (e.g. pool 'bonk') send solInPool / tokensInPool instead of
// the bonding-curve fields; those are accepted and carried through.

import { z } from 'zod';
import { BASE58_ADDRESS, BASE58_SIGNATURE, cleanText } from '../enrich/sanitize';

/** Frames above this size are not feed events (the largest real ones are well under 2 KB). */
export const MAX_FRAME_BYTES = 64 * 1024;

const address = z.string().regex(BASE58_ADDRESS);
const signature = z.string().regex(BASE58_SIGNATURE);
const amount = z.number().finite().nonnegative();
const optAmount = amount.nullish().transform((v) => v ?? undefined);
const optAddress = address.nullish().transform((v) => v ?? undefined);
const pool = z.string().max(32).nullish().transform((v) => (v ? cleanText(v, 32).toLowerCase() : undefined));

const curveFields = {
  bondingCurveKey: optAddress,
  vTokensInBondingCurve: optAmount,
  vSolInBondingCurve: optAmount,
  marketCapSol: optAmount,
  solInPool: optAmount,
  tokensInPool: optAmount,
  newTokenBalance: optAmount,
  pool,
};

const createSchema = z.object({
  txType: z.literal('create'),
  signature,
  mint: address,
  traderPublicKey: address,
  initialBuy: optAmount,
  solAmount: optAmount,
  name: z.string().max(2048).nullish().transform((v) => cleanText(v, 64)),
  symbol: z.string().max(2048).nullish().transform((v) => cleanText(v, 24)),
  uri: z.string().max(2048).nullish().transform((v) => cleanText(v, 1024)),
  ...curveFields,
});

const tradeSchema = z.object({
  txType: z.enum(['buy', 'sell']),
  signature,
  mint: address,
  traderPublicKey: address,
  tokenAmount: amount,
  solAmount: amount,
  ...curveFields,
});

const migrateSchema = z.object({
  txType: z.literal('migrate'),
  signature,
  mint: address,
  pool,
});

/** Post-trade curve / pool state a message reports. */
export interface ReportedReserves {
  bondingCurveKey?: string;
  /** Virtual reserves of a pump.fun bonding curve (UI units). */
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  /** Pool reserves (launchpads / AMMs that report them). */
  solInPool?: number;
  tokensInPool?: number;
  /** The trader's token balance after the transaction. */
  newTokenBalance?: number;
  /** Venue: 'pump' (bonding curve), 'pump-amm' (PumpSwap) or another launchpad. */
  pool?: string;
}

export interface CreateEvent extends ReportedReserves {
  kind: 'create';
  signature: string;
  mint: string;
  /** The creator (dev) wallet. */
  trader: string;
  /** Tokens the creator bought in the creation transaction. */
  initialBuy: number;
  /** SOL the creator spent on that buy. */
  solAmount: number;
  name: string;
  symbol: string;
  uri: string;
}

export interface TradeEvent extends ReportedReserves {
  kind: 'trade';
  side: 'buy' | 'sell';
  signature: string;
  mint: string;
  trader: string;
  tokenAmount: number;
  solAmount: number;
}

export interface MigrateEvent {
  kind: 'migrate';
  signature: string;
  mint: string;
  pool?: string;
}

export type FeedEvent = CreateEvent | TradeEvent | MigrateEvent;

export type FeedMessage =
  | FeedEvent
  /** Subscription acknowledgements and other notices ({ message }). */
  | { kind: 'notice'; message: string }
  /** The server rejected a request ({ errors }). */
  | { kind: 'error'; message: string }
  | { kind: 'malformed'; reason: string };

function reserves(m: z.infer<typeof tradeSchema> | z.infer<typeof createSchema>): ReportedReserves {
  const r: ReportedReserves = {};
  if (m.bondingCurveKey) r.bondingCurveKey = m.bondingCurveKey;
  if (m.vTokensInBondingCurve !== undefined) r.vTokensInBondingCurve = m.vTokensInBondingCurve;
  if (m.vSolInBondingCurve !== undefined) r.vSolInBondingCurve = m.vSolInBondingCurve;
  if (m.marketCapSol !== undefined) r.marketCapSol = m.marketCapSol;
  if (m.solInPool !== undefined) r.solInPool = m.solInPool;
  if (m.tokensInPool !== undefined) r.tokensInPool = m.tokensInPool;
  if (m.newTokenBalance !== undefined) r.newTokenBalance = m.newTokenBalance;
  if (m.pool) r.pool = m.pool;
  return r;
}

/** Parse one feed frame. Never throws. */
export function parseFeedMessage(raw: string | Buffer | ArrayBuffer | Buffer[]): FeedMessage {
  const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw instanceof ArrayBuffer ? Buffer.from(raw).toString('utf8') : String(raw);
  if (text.length > MAX_FRAME_BYTES) return { kind: 'malformed', reason: 'frame too large' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'malformed', reason: 'invalid json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { kind: 'malformed', reason: 'not an object' };
  const obj = data as Record<string, unknown>;
  const txType = obj.txType;
  if (txType === 'create') {
    const r = createSchema.safeParse(obj);
    if (!r.success) return { kind: 'malformed', reason: `create: ${issue(r.error)}` };
    const m = r.data;
    return {
      kind: 'create',
      signature: m.signature,
      mint: m.mint,
      trader: m.traderPublicKey,
      initialBuy: m.initialBuy ?? 0,
      solAmount: m.solAmount ?? 0,
      name: m.name,
      symbol: m.symbol,
      uri: m.uri,
      ...reserves(m),
    };
  }
  if (txType === 'buy' || txType === 'sell') {
    const r = tradeSchema.safeParse(obj);
    if (!r.success) return { kind: 'malformed', reason: `${txType}: ${issue(r.error)}` };
    const m = r.data;
    return { kind: 'trade', side: m.txType, signature: m.signature, mint: m.mint, trader: m.traderPublicKey, tokenAmount: m.tokenAmount, solAmount: m.solAmount, ...reserves(m) };
  }
  if (txType === 'migrate') {
    const r = migrateSchema.safeParse(obj);
    if (!r.success) return { kind: 'malformed', reason: `migrate: ${issue(r.error)}` };
    return { kind: 'migrate', signature: r.data.signature, mint: r.data.mint, ...(r.data.pool ? { pool: r.data.pool } : {}) };
  }
  if (txType === undefined && typeof obj.message === 'string') return { kind: 'notice', message: cleanText(obj.message, 300) };
  if (txType === undefined && obj.errors !== undefined) return { kind: 'error', message: cleanText(typeof obj.errors === 'string' ? obj.errors : JSON.stringify(obj.errors), 300) };
  return { kind: 'malformed', reason: typeof txType === 'string' ? `unknown txType ${cleanText(txType, 20)}` : 'unknown message' };
}

function issue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join('.') || 'value'} ${i.message}` : 'invalid';
}

/** Whether a notice reads like a refused subscription (e.g. trade streams that need an API key). */
export function isRefusalNotice(message: string): boolean {
  return !/success/i.test(message) && /(api.?key|fund|not allowed|unauthori[sz]ed|forbidden|denied|refus|limit|invalid)/i.test(message);
}
