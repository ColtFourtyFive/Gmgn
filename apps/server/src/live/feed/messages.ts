// PumpPortal data-feed messages (wss://pumpportal.fun/api/data), validated
// with zod. The feed has no versioned schema, so parsing is defensive: a frame
// that is not one of the shapes below is reported as malformed (and counted),
// never thrown. Amounts are UI units as the feed sends them: SOL (not lamports)
// and whole tokens (pump.fun mints have 6 decimals).
//
// Shapes captured from the live service (2026-10-20; real frames in
// test/fixtures/pumpportal, see its README):
//   create   { signature, mint, traderPublicKey, txType: 'create', initialBuy, solAmount,
//              bondingCurveKey, vTokensInBondingCurve, vSolInBondingCurve, marketCapSol,
//              name, symbol, uri, is_mayhem_mode, pool: 'pump' }
//   migrate  { signature, mint, txType: 'migrate', pool: 'pump-amm' }   (the MigrateV2 transaction)
//   ack      { message: 'Successfully subscribed to token creation events.' }
//            { message: "Subscribed to 'migration' events." }   { message: 'Unsubscribed.' }
//   refusal  { message: "'subscribeTokenTrade' and 'subscribeAccountTrade' methods are only available
//              when connecting with an API key funded with at least 0.02 SOL." }
//   error    { errors: "Invalid message. 'method' must be ..." } / { errors: 'Invalid message. Failed to subscribe.' }
// A create's numbers are those of the pump program's TradeEvent for the creator's buy (checked
// against the transactions on-chain): solAmount is the SOL that went into the curve, NOT what the
// wallet paid (protocol 0.95% + creator 0.30% fees come on top for buys and off the top for sells);
// vSol / vTokensInBondingCurve are the post-trade virtual reserves; marketCapSol = vSol / vTokens x 1e9.
// Trades (buy / sell, pool 'pump' or 'pump-amm') could not be captured: PumpPortal streams them only
// with a funded API key. Their shape (tokenAmount, solAmount, newTokenBalance and the curve fields
// above) is taken from PumpPortal's documentation and assumed to follow the same TradeEvent units.
// Caveats the live feed showed:
//   - bondingCurveKey is wrong for some mayhem-mode launches (it names the mayhem agent's wallet):
//     derive the curve from the mint instead (bondingCurvePda), never trust this field.
//   - pump.fun curves may be quoted in another mint (the PUMP token, CARDS, ...: about a quarter of
//     launches). The frame does not say so and its SOL fields then hold the program's legacy shadow
//     values (30 SOL virtual), not real SOL: the quote mint has to be read from the curve account.
//   - mayhem-mode mints (is_mayhem_mode) have a 2B supply; marketCapSol still assumes 1B.
// Other launchpads (pool 'bonk') send solInPool / tokensInPool and no name / symbol / uri; those
// frames are accepted and carried through (ingest ignores launchpads other than pump.fun).

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
  is_mayhem_mode: z.boolean().nullish(),
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
  /** As sent; unreliable (wrong for some mayhem-mode launches): derive the curve from the mint. */
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
  /** A pump.fun mayhem-mode coin (2B supply, an agent trading it fee-free). */
  mayhem?: boolean;
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
  /** SOL that buy put into the curve (the creator paid the curve's fees on top). */
  solAmount: number;
  name: string;
  symbol: string;
  uri: string;
  /**
   * Set once the launch's curve account was read on-chain (feed/verify.ts): its fee rate
   * (protocol + creator). Absent for launches that could not be checked.
   */
  curveFeeRate?: number;
}

export interface TradeEvent extends ReportedReserves {
  kind: 'trade';
  side: 'buy' | 'sell';
  signature: string;
  mint: string;
  trader: string;
  tokenAmount: number;
  /** SOL into (buy) / out of (sell) the curve or pool, before the venue's fees. */
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
  if (typeof m.is_mayhem_mode === 'boolean') r.mayhem = m.is_mayhem_mode;
  if (m.pool) r.pool = m.pool;
  return r;
}

/** A frame's text, however the socket delivered it. */
export function frameText(raw: string | Buffer | ArrayBuffer | Buffer[]): string {
  return Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw instanceof ArrayBuffer ? Buffer.from(raw).toString('utf8') : String(raw);
}

/** Parse one feed frame. Never throws. */
export function parseFeedMessage(raw: string | Buffer | ArrayBuffer | Buffer[]): FeedMessage {
  const text = frameText(raw);
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

/**
 * Whether a notice refuses the token / account trade streams as a whole: PumpPortal answers every
 * subscribeTokenTrade / subscribeAccountTrade on a connection without a funded API key with
 * "'subscribeTokenTrade' and 'subscribeAccountTrade' methods are only available when connecting
 * with an API key funded with at least 0.02 SOL."
 */
export function isTradeStreamRefusal(message: string): boolean {
  return isRefusalNotice(message) && /(subscribe(Token|Account)Trade|api.?key|fund)/i.test(message);
}
