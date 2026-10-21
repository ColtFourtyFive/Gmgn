// Anchor events of the pump.fun bonding-curve program and the PumpSwap AMM, read
// from a transaction's log messages. Both programs `emit!` their events, so each
// one is a "Program data: <base64>" line (8-byte discriminator + borsh body)
// logged while the emitting program is on top of the invoke stack: the lines are
// attributed by replaying "Program <id> invoke [n]" / "success" / "failed", so an
// event of a program called through a router, an aggregator or a bot counts, and
// a look-alike payload logged by another program does not.
//
// Discriminators come from the IDLs shipped with @pump-fun/pump-sdk 4.2.0 and
// @pump-fun/pump-swap-sdk 2.2.0 (sha256("event:<Name>")[0..8]); bodies are decoded
// with the SDK's own decoders, which accept every layout the programs have emitted
// (newer deployments append fields; a shorter body decodes with them at defaults).
// Checked against mainnet logs on 2026-10-20 (test/fixtures/solana-logs):
//   pump      CreateEvent (one event for create / create_v2: quote mint, mayhem flag
//             and creator fee included), TradeEvent (post-trade virtual AND real
//             reserves, fees, cashback, quote mint, user, block time; 390-439 bytes,
//             variable: ix name + shareholders), CompleteEvent, PostCompleteBuyEvent
//             (the part of a completing buy filled past the curve),
//             CompletePumpAmmMigrationEvent (MigrateV2: pool, SOL and tokens moved)
//   pump-amm  BuyEvent / SellEvent (pre-trade pool reserves, pool-side and user-side
//             amounts, fees, cashback, virtual quote reserves; pool and user but no
//             mint), CreatePoolEvent (pool, base / quote mints and decimals)
// Every other event of the two IDLs is recognised by name and counted, not decoded.
// The same events also travel as event CPIs (inner instructions, decodeInnerEvents):
// complete where a node truncated the logs at 10 KB (bundles, MigrateV2).

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type BN from 'bn.js';
import bs58 from 'bs58';
import { loadPumpAmmSdk, loadPumpSdk } from '../../enrich/onchain';
import { cleanText } from '../../enrich/sanitize';

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** The zero key: what a SOL-quoted pump curve stores as its quote mint. */
export const DEFAULT_PUBKEY = '11111111111111111111111111111111';

export type ProgramName = 'pump' | 'pump-amm';
const requireCjs = createRequire(import.meta.url);
const PROGRAM_NAMES: Record<string, ProgramName> = { [PUMP_PROGRAM_ID]: 'pump', [PUMP_AMM_PROGRAM_ID]: 'pump-amm' };

interface PubkeyLike {
  toBase58(): string;
}

export interface PumpCreateLog {
  type: 'create';
  mint: string;
  /** Signer of the create (pays, and usually makes the dev buy). */
  user: string;
  /** The coin's creator (fees go to it); usually the user. */
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  /** Block time (s). */
  timestamp: number;
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  quoteMint: string;
  mayhem: boolean;
  /** The coin's own creator fee (0 = the program's schedule). */
  creatorFeeBps: number;
}

export interface PumpTradeLog {
  type: 'trade';
  mint: string;
  user: string;
  isBuy: boolean;
  /** Quote into (buy) / out of (sell) the curve, before fees (base units of the quote mint). */
  quoteAmount: bigint;
  tokenAmount: bigint;
  /** Protocol fee, creator fee and cashback, charged on top of a buy and taken off a sell. */
  fee: bigint;
  creatorFee: bigint;
  cashback: bigint;
  timestamp: number;
  /** Post-trade reserves (quote base units / token base units). */
  virtualQuoteReserves: bigint;
  virtualTokenReserves: bigint;
  realQuoteReserves: bigint;
  realTokenReserves: bigint;
  quoteMint: string;
  mayhem: boolean;
  ixName: string;
}

export interface PumpCompleteLog {
  type: 'complete';
  mint: string;
  user: string;
  quoteMint: string;
  timestamp: number;
}

/** A completing buy's remainder, filled after the curve completed (same instruction, same user). */
export interface PumpPostCompleteBuyLog {
  type: 'postCompleteBuy';
  mint: string;
  user: string;
  quoteMint: string;
  timestamp: number;
  baseOut: bigint;
  quoteIn: bigint;
  fee: bigint;
  creatorFee: bigint;
}

/** MigrateV2: the completed curve moved into its canonical PumpSwap pool. */
export interface PumpMigrationLog {
  type: 'migration';
  mint: string;
  pool: string;
  /** Quote the pool starts with (its vault plus its virtual quote reserve). */
  quoteAmount: bigint;
  /** Tokens the pool starts with. */
  mintAmount: bigint;
  quoteMint: string;
  timestamp: number;
}

export interface AmmTradeLog {
  type: 'ammTrade';
  isBuy: boolean;
  pool: string;
  user: string;
  timestamp: number;
  /** Base tokens out (buy) / in (sell). */
  baseAmount: bigint;
  /** Pool reserves before the trade (vault balances). */
  poolBaseBefore: bigint;
  poolQuoteBefore: bigint;
  /** Signed change of the pool's quote vault: + quote in with the LP fee (buy), - quote out before it (sell). */
  poolQuoteDelta: bigint;
  /** Quote the user paid (buy: pool side + protocol, creator and cashback fees) or received (sell). */
  userQuote: bigint;
  /** The pool's virtual quote reserve, signed (i128): priced on top of the vault, negative where the vault holds fees. */
  virtualQuoteReserves: bigint;
  ixName: string;
}

export interface AmmCreatePoolLog {
  type: 'createPool';
  pool: string;
  index: number;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  poolBaseAmount: bigint;
  poolQuoteAmount: bigint;
  mayhem: boolean;
  timestamp: number;
}

export interface OtherLog {
  type: 'other';
}

export type LogEventBody = PumpCreateLog | PumpTradeLog | PumpCompleteLog | PumpPostCompleteBuyLog | PumpMigrationLog | AmmTradeLog | AmmCreatePoolLog | OtherLog;

export type DecodedLogEvent = LogEventBody & {
  program: ProgramName;
  /** IDL event name ('TradeEvent', 'BuyEvent', ...) or 'unknown'. */
  event: string;
};

export interface DecodedLogs {
  events: DecodedLogEvent[];
  /** Events of the two programs whose body did not decode (counted, the rest of the transaction still is). */
  errors: { program: ProgramName; event: string; reason: string }[];
  /** The node cut the log (its 10 KB cap): later events of the transaction are missing. */
  truncated: boolean;
}

// ---- discriminators ---------------------------------------------------------

interface IdlLike {
  events?: { name: string; discriminator: number[] }[];
}

let tables: Record<ProgramName, Map<string, string>> | null = null;

/** Discriminator (hex) -> IDL event name, per program, from the SDKs' IDLs (sha256 rule when an IDL is unavailable). */
function discriminators(): Record<ProgramName, Map<string, string>> {
  if (tables) return tables;
  const fromIdl = (idl: IdlLike | undefined, fallback: string[]): Map<string, string> => {
    const m = new Map<string, string>();
    for (const e of idl?.events ?? []) if (Array.isArray(e.discriminator) && e.discriminator.length === 8) m.set(Buffer.from(e.discriminator).toString('hex'), e.name);
    for (const name of fallback) if (![...m.values()].includes(name)) m.set(eventDiscriminator(name).toString('hex'), name);
    return m;
  };
  const pumpIdl = (loadPumpSdk() as { pumpIdl?: IdlLike } | null)?.pumpIdl;
  const ammIdl = (loadPumpAmmSdk() as { pumpAmmJson?: IdlLike } | null)?.pumpAmmJson;
  tables = {
    pump: fromIdl(pumpIdl, ['CreateEvent', 'TradeEvent', 'CompleteEvent', 'PostCompleteBuyEvent', 'CompletePumpAmmMigrationEvent']),
    'pump-amm': fromIdl(ammIdl, ['BuyEvent', 'SellEvent', 'CreatePoolEvent']),
  };
  return tables;
}

/** Anchor's event discriminator: the first 8 bytes of sha256("event:<Name>"). */
export function eventDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);
}

// ---- log walking ------------------------------------------------------------

const INVOKE = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/;
const EXIT = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) (?:success|failed)/;
const DATA = 'Program data: ';

export interface ProgramData {
  program: ProgramName;
  data: Buffer;
}

/** The "Program data:" payloads logged by pump / pump-amm frames, in order. */
export function programData(logs: readonly string[]): { items: ProgramData[]; truncated: boolean } {
  const stack: string[] = [];
  const items: ProgramData[] = [];
  for (const line of logs) {
    if (typeof line !== 'string') continue;
    if (line.startsWith(DATA)) {
      const program = PROGRAM_NAMES[stack[stack.length - 1] ?? ''];
      if (!program) continue;
      const parts = line.slice(DATA.length).trim().split(' ');
      const data = parts.length === 1 ? Buffer.from(parts[0], 'base64') : Buffer.concat(parts.map((p) => Buffer.from(p, 'base64')));
      if (data.length >= 8) items.push({ program, data });
      continue;
    }
    let m = INVOKE.exec(line);
    if (m) {
      stack.push(m[1]);
      continue;
    }
    m = EXIT.exec(line);
    if (m) {
      // Pop back to the frame that ended (a frame that never logged its exit is dropped with it).
      const at = stack.lastIndexOf(m[1]);
      if (at >= 0) stack.length = at;
      continue;
    }
    if (line === 'Log truncated') return { items, truncated: true };
  }
  return { items, truncated: false };
}

// ---- event CPIs ---------------------------------------------------------------

/**
 * Both programs also `emit_cpi!` every event: a self-invocation (signed by their event authority PDA, so
 * only the program itself can make it) whose data is Anchor's EVENT_IX_TAG (u64 0x1d9acb512ea545e4, LE),
 * the event discriminator and the body. A transaction's inner instructions keep them whole when its
 * logs are cut at the node's 10 KB cap ("Log truncated": big bundles and migrations, seen on mainnet).
 */
export const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex');

export interface InnerInstructionLike {
  programIdIndex: number;
  /** Base58, as getTransaction's json encoding returns it. */
  data: string;
}

/** The pump / pump-amm event CPIs of a transaction (inner instructions, in order), decoded like log lines. Never throws. */
export function decodeInnerEvents(inner: readonly { instructions: readonly InnerInstructionLike[] }[], programAt: (index: number) => string | undefined): DecodedLogs {
  const items: ProgramData[] = [];
  for (const group of inner) {
    for (const ix of group.instructions) {
      const program = PROGRAM_NAMES[programAt(ix.programIdIndex) ?? ''];
      if (!program) continue;
      let data: Uint8Array;
      try {
        data = bs58.decode(ix.data);
      } catch {
        continue;
      }
      if (data.length >= 16 && EVENT_IX_TAG.equals(Buffer.from(data.subarray(0, 8)))) items.push({ program, data: Buffer.from(data.subarray(8)) });
    }
  }
  return decodeItems(items, false);
}

// ---- decoding ---------------------------------------------------------------

const big = (v: BN | number | null | undefined): bigint => (v === null || v === undefined ? 0n : typeof v === 'number' ? BigInt(Math.trunc(v)) : BigInt(v.toString()));
const key = (v: PubkeyLike | null | undefined): string => (v ? v.toBase58() : DEFAULT_PUBKEY);
const secs = (v: BN | number | null | undefined): number => Number(big(v));

/** Decode every pump / pump-amm event a transaction logged. Never throws. */
export function decodeProgramLogs(logs: readonly string[]): DecodedLogs {
  const { items, truncated } = programData(logs);
  return decodeItems(items, truncated);
}

function decodeItems(items: readonly ProgramData[], truncated: boolean): DecodedLogs {
  const events: DecodedLogEvent[] = [];
  const errors: DecodedLogs['errors'] = [];
  if (items.length === 0) return { events, errors, truncated };
  const disc = discriminators();
  const sdk = loadPumpSdk();
  for (const { program, data } of items) {
    const event = disc[program].get(data.subarray(0, 8).toString('hex')) ?? 'unknown';
    try {
      const body = sdk ? decodeBody(sdk.PUMP_SDK, program, event, data.subarray(8)) : null;
      events.push({ ...(body ?? { type: 'other' }), program, event });
    } catch (err) {
      errors.push({ program, event, reason: err instanceof Error ? err.message : 'decode failed' });
    }
  }
  return { events, errors, truncated };
}

type PumpSdk = NonNullable<ReturnType<typeof loadPumpSdk>>['PUMP_SDK'];

function decodeBody(sdk: PumpSdk, program: ProgramName, name: string, body: Buffer): LogEventBody | null {
  if (program === 'pump') {
    switch (name) {
      case 'CreateEvent': {
        const e = sdk.decodeCreateEventBc(body);
        return {
          type: 'create',
          mint: key(e.mint),
          user: key(e.user),
          creator: key(e.creator),
          name: cleanText(e.name, 64),
          symbol: cleanText(e.symbol, 24),
          uri: cleanText(e.uri, 1024),
          timestamp: secs(e.timestamp),
          virtualTokenReserves: big(e.virtualTokenReserves),
          // A SOL curve carries the same value in both fields; a curve quoted in another mint only in the quote one.
          virtualQuoteReserves: big(e.virtualQuoteReserves ?? e.virtualSolReserves),
          realTokenReserves: big(e.realTokenReserves),
          tokenTotalSupply: big(e.tokenTotalSupply),
          quoteMint: key(e.quoteMint),
          mayhem: e.isMayhemMode === true,
          creatorFeeBps: Number(big(e.creatorFeeBps)),
        };
      }
      case 'TradeEvent': {
        const e = sdk.decodeTradeEventBc(body);
        return {
          type: 'trade',
          mint: key(e.mint),
          user: key(e.user),
          isBuy: e.isBuy === true,
          quoteAmount: big(e.quoteAmount ?? e.solAmount),
          tokenAmount: big(e.tokenAmount),
          fee: big(e.fee),
          creatorFee: big(e.creatorFee),
          cashback: big(e.cashback),
          timestamp: secs(e.timestamp),
          virtualQuoteReserves: big(e.virtualQuoteReserves ?? e.virtualSolReserves),
          virtualTokenReserves: big(e.virtualTokenReserves),
          realQuoteReserves: big(e.realQuoteReserves ?? e.realSolReserves),
          realTokenReserves: big(e.realTokenReserves),
          quoteMint: key(e.quoteMint),
          mayhem: e.mayhemMode === true,
          ixName: cleanText(e.ixName, 40),
        };
      }
      case 'CompleteEvent': {
        const e = sdk.decodeCompleteEventBc(body);
        return { type: 'complete', mint: key(e.mint), user: key(e.user), quoteMint: key(e.quoteMint), timestamp: secs(e.timestamp) };
      }
      case 'PostCompleteBuyEvent': {
        const e = sdk.decodePostCompleteBuyEvent(body);
        return { type: 'postCompleteBuy', mint: key(e.mint), user: key(e.user), quoteMint: key(e.quoteMint), timestamp: secs(e.timestamp), baseOut: big(e.baseOut), quoteIn: big(e.quoteIn), fee: big(e.fee), creatorFee: big(e.creatorFee) };
      }
      case 'CompletePumpAmmMigrationEvent':
        return decodeMigration(Buffer.concat([eventDiscriminator(name), body]));
      default:
        return null;
    }
  }
  switch (name) {
    case 'BuyEvent': {
      const e = sdk.decodeBuyEventAmm(body);
      const withLp = big(e.quoteAmountInWithLpFee);
      return {
        type: 'ammTrade',
        isBuy: true,
        pool: key(e.pool),
        user: key(e.user),
        timestamp: secs(e.timestamp),
        baseAmount: big(e.baseAmountOut),
        poolBaseBefore: big(e.poolBaseTokenReserves),
        poolQuoteBefore: big(e.poolQuoteTokenReserves),
        poolQuoteDelta: withLp,
        // The pool's side plus what goes to the protocol, the coin creator and the user's cashback:
        // what left the user for every buy instruction seen on mainnet (buy, buy_v2, buy_exact_quote_in[_v2],
        // multi_hop_swap; quote_amount_in / user_quote_amount_in swap meanings between them).
        userQuote: withLp + big(e.protocolFee) + big(e.coinCreatorFee) + big(e.cashback),
        virtualQuoteReserves: big(e.virtualQuoteReserves),
        ixName: cleanText(e.ixName, 40),
      };
    }
    case 'SellEvent': {
      const e = sdk.decodeSellEventAmm(body);
      return {
        type: 'ammTrade',
        isBuy: false,
        pool: key(e.pool),
        user: key(e.user),
        timestamp: secs(e.timestamp),
        baseAmount: big(e.baseAmountIn),
        poolBaseBefore: big(e.poolBaseTokenReserves),
        poolQuoteBefore: big(e.poolQuoteTokenReserves),
        poolQuoteDelta: -big(e.quoteAmountOutWithoutLpFee),
        userQuote: big(e.userQuoteAmountOut),
        virtualQuoteReserves: big(e.virtualQuoteReserves),
        ixName: 'sell',
      };
    }
    case 'CreatePoolEvent': {
      const e = sdk.decodeCreatePoolEventAmm(body);
      return {
        type: 'createPool',
        pool: key(e.pool),
        index: e.index,
        baseMint: key(e.baseMint),
        quoteMint: key(e.quoteMint),
        baseDecimals: e.baseMintDecimals,
        quoteDecimals: e.quoteMintDecimals,
        poolBaseAmount: big(e.poolBaseAmount),
        poolQuoteAmount: big(e.poolQuoteAmount),
        mayhem: e.isMayhemMode === true,
        timestamp: secs(e.timestamp),
      };
    }
    default:
      return null;
  }
}

/**
 * CompletePumpAmmMigrationEvent has no dedicated SDK decoder: Anchor's event coder over the pump IDL
 * (fields as the IDL names them: user, mint, mint_amount, sol_amount, pool_migration_fee,
 * bonding_curve, timestamp, pool, quote_mint).
 */
function decodeMigration(event: Buffer): PumpMigrationLog {
  const r = migrationCoder()?.decode(event.toString('base64'));
  if (!r || r.name !== 'CompletePumpAmmMigrationEvent') throw new Error('migration event did not decode');
  const e = r.data as { mint: PubkeyLike; pool: PubkeyLike; mint_amount: BN; sol_amount: BN; quote_mint?: PubkeyLike; timestamp: BN };
  return { type: 'migration', mint: key(e.mint), pool: key(e.pool), quoteAmount: big(e.sol_amount), mintAmount: big(e.mint_amount), quoteMint: key(e.quote_mint), timestamp: secs(e.timestamp) };
}

type AnchorModule = typeof import('@coral-xyz/anchor');
type EventCoder = { decode(log: string): { name: string; data: unknown } | null };
let eventCoder: EventCoder | null | undefined;
function migrationCoder(): EventCoder | null {
  if (eventCoder !== undefined) return eventCoder;
  try {
    // Loaded through require like the SDKs (Anchor's ESM build does not load under every runner).
    const anchor = requireCjs('@coral-xyz/anchor') as AnchorModule;
    const idl = (loadPumpSdk() as { pumpIdl?: unknown } | null)?.pumpIdl;
    eventCoder = idl ? (new anchor.BorshEventCoder(idl as ConstructorParameters<AnchorModule['BorshEventCoder']>[0]) as EventCoder) : null;
  } catch {
    eventCoder = null;
  }
  return eventCoder;
}

let solQuotes: Set<string> | null = null;
/** A quote mint pump.fun treats as SOL: the zero key SOL curves store, WSOL, the Token-2022 native mint (the SDK's list). */
export function isSolQuote(quoteMint: string): boolean {
  if (!solQuotes) {
    const sdk = loadPumpSdk() as { SOL_LIKE_QUOTE_MINTS?: readonly PubkeyLike[] } | null;
    solQuotes = new Set([DEFAULT_PUBKEY, WSOL_MINT, ...(sdk?.SOL_LIKE_QUOTE_MINTS ?? []).map((k) => k.toBase58())]);
  }
  return solQuotes.has(quoteMint);
}
