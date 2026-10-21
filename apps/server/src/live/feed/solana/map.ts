// Decoded program-log events of one transaction -> the feed events ingest.ts books
// (the same CreateEvent / TradeEvent / MigrateEvent PumpPortal's frames become), so
// both sources go through one mapping into the World:
//   CreateEvent (+ the creator's buy in the same transaction)  create, with the curve
//       facts the launch verifier needs (quote mint, mayhem flag, creator fee) taken from
//       the event itself instead of a curve read
//   TradeEvent                       trade on the curve: post-trade virtual and real reserves,
//       the curve amount (solAmount, PumpPortal's unit) and what the wallet really paid or
//       received (walletSol: plus / less the protocol, creator and cashback fees the event
//       reports; the mayhem agent's are 0), the user, the block time and slot
//   PostCompleteBuyEvent             the rest of a completing buy, filled after the curve
//       completed: folded into that buy
//   CompletePumpAmmMigrationEvent    migrate, with the pool's address and starting reserves
//   BuyEvent / SellEvent (PumpSwap)  trade on a pool whose mint is known (the event names the
//       pool, not the mint): post-trade reserves = the pre-trade vaults moved by the trade, plus
//       the pool's virtual quote reserve; the user's side as walletSol
//   CreatePoolEvent (WSOL quote)     teaches the pool -> mint map
// A wallet's legs on one mint within a transaction are netted into one trade (the World books one
// trade per signature, wallet and token). Curves and pools quoted in another mint are dropped (their
// amounts are not SOL). Amounts become UI units: SOL = lamports / 1e9, pump tokens / 1e6.

import type { CreateEvent, FeedEvent, MigrateEvent, TradeEvent } from '../messages';
import type { CurveFacts } from '../verify';
import { isSolQuote, WSOL_MINT, type DecodedLogEvent, type PumpCreateLog, type PumpPostCompleteBuyLog, type PumpTradeLog } from './events';

const LAMPORTS = 1e9;
/** pump.fun mints: 6 decimals. */
const PUMP_TOKEN_UNIT = 1e6;

/** A PumpSwap pool quoted in WSOL: the mint it trades and that mint's decimals. */
export interface PoolInfo {
  mint: string;
  decimals: number;
}

export interface MapContext {
  /** The pool's mint, when known (World tokens' pools, pools seen created). */
  poolInfo(pool: string): PoolInfo | null;
  /**
   * A mint's canonical PumpSwap pool (pump SDK PDA; '' when unknown). A WSOL pool created at that address
   * is the coin's migration: MigrateV2 logs past the node's 10 KB cap ("Log truncated") lose pump's own
   * migration event, never the pool's CreatePoolEvent logged before it.
   */
  canonicalPool?(mint: string): string;
}

export interface LogTransaction {
  signature: string;
  slot: number;
}

export interface MappedTransaction {
  /** Feed events in the order to apply them: launches, then trades in log order, then migrations. */
  events: FeedEvent[];
  /** A launch's curve facts, from its CreateEvent. */
  facts: Map<string, CurveFacts>;
  /** PumpSwap trades on pools whose mint is unknown (pool, trader). */
  unresolved: { pool: string; user: string }[];
  /** WSOL-quoted pools this transaction created or migrated into. */
  pools: { pool: string; info: PoolInfo }[];
  /** Events dropped because their curve / pool is quoted in another mint. */
  otherQuote: number;
  /** Same-transaction round trips (a wallet bought and sold the same amount): nothing to book. */
  roundTrips: number;
}

interface Legs {
  mint: string;
  user: string;
  venue: 'pump' | 'pump-amm';
  /** Order of the first leg in the transaction. */
  order: number;
  buyTokens: number;
  buySol: number;
  buyWallet: number;
  sellTokens: number;
  sellSol: number;
  sellWallet: number;
  /** Last leg's post-trade state. */
  last: PumpTradeLog | null;
  pool: { native: number; tokens: number } | null;
  mayhem: boolean;
  at: number;
}

export function mapTransaction(tx: LogTransaction, events: readonly DecodedLogEvent[], ctx: MapContext): MappedTransaction {
  const out: MappedTransaction = { events: [], facts: new Map(), unresolved: [], pools: [], otherQuote: 0, roundTrips: 0 };
  const localPools = new Map<string, PoolInfo>();
  for (const e of events) {
    if (e.type === 'createPool' && e.quoteMint === WSOL_MINT) {
      const info = { mint: e.baseMint, decimals: e.baseDecimals };
      localPools.set(e.pool, info);
      out.pools.push({ pool: e.pool, info });
    } else if (e.type === 'migration' && isSolQuote(e.quoteMint) && !localPools.has(e.pool)) {
      const info = { mint: e.mint, decimals: 6 };
      localPools.set(e.pool, info);
      out.pools.push({ pool: e.pool, info });
    }
  }
  const poolOf = (pool: string) => localPools.get(pool) ?? ctx.poolInfo(pool);

  const creates: PumpCreateLog[] = [];
  const legs = new Map<string, Legs>();
  const migrations = new Map<string, MigrateEvent>();
  let order = 0;
  const legsOf = (venue: Legs['venue'], mint: string, user: string, at: number): Legs => {
    const k = `${venue}|${mint}|${user}`;
    let l = legs.get(k);
    if (!l) {
      l = { mint, user, venue, order: order++, buyTokens: 0, buySol: 0, buyWallet: 0, sellTokens: 0, sellSol: 0, sellWallet: 0, last: null, pool: null, mayhem: false, at };
      legs.set(k, l);
    }
    return l;
  };

  for (const e of events) {
    switch (e.type) {
      case 'create':
        creates.push(e);
        out.facts.set(e.mint, { quoteMint: e.quoteMint, solQuoted: isSolQuote(e.quoteMint), mayhem: e.mayhem, creatorFeeBps: e.creatorFeeBps });
        break;
      case 'trade': {
        if (!isSolQuote(e.quoteMint)) {
          out.otherQuote++;
          break;
        }
        const l = legsOf('pump', e.mint, e.user, e.timestamp * 1000);
        const tokens = Number(e.tokenAmount) / PUMP_TOKEN_UNIT;
        const sol = Number(e.quoteAmount) / LAMPORTS;
        const fees = Number(e.fee + e.creatorFee + e.cashback) / LAMPORTS;
        if (e.isBuy) {
          l.buyTokens += tokens;
          l.buySol += sol;
          l.buyWallet += sol + fees;
        } else {
          l.sellTokens += tokens;
          l.sellSol += sol;
          l.sellWallet += Math.max(0, sol - fees);
        }
        l.last = e;
        l.mayhem ||= e.mayhem;
        break;
      }
      case 'postCompleteBuy':
        foldPostComplete(e, legs, out);
        break;
      case 'ammTrade': {
        const info = poolOf(e.pool);
        if (!info) {
          out.unresolved.push({ pool: e.pool, user: e.user });
          break;
        }
        const l = legsOf('pump-amm', info.mint, e.user, e.timestamp * 1000);
        const unit = 10 ** info.decimals;
        const tokens = Number(e.baseAmount) / unit;
        const poolSide = Number(e.poolQuoteDelta < 0n ? -e.poolQuoteDelta : e.poolQuoteDelta) / LAMPORTS;
        const user = Number(e.userQuote) / LAMPORTS;
        if (e.isBuy) {
          l.buyTokens += tokens;
          l.buySol += poolSide;
          l.buyWallet += user;
        } else {
          l.sellTokens += tokens;
          l.sellSol += poolSide;
          l.sellWallet += user;
        }
        // The pool prices on its vault plus its virtual quote reserve, which is signed (the SDK's effective
        // quote reserve): positive after a migration's boost, negative where the vault holds fees that are
        // not liquidity (e.g. -18 SOL on a 752 SOL vault seen on mainnet).
        const base = e.isBuy ? e.poolBaseBefore - e.baseAmount : e.poolBaseBefore + e.baseAmount;
        const quote = e.poolQuoteBefore + e.poolQuoteDelta + e.virtualQuoteReserves;
        if (base > 0n && quote > 0n) l.pool = { native: Number(quote) / LAMPORTS, tokens: Number(base) / unit };
        break;
      }
      case 'migration':
        if (!isSolQuote(e.quoteMint)) {
          out.otherQuote++;
          break;
        }
        migrations.set(e.mint, migrate(tx, e.mint, e.pool, e.quoteAmount, e.mintAmount, PUMP_TOKEN_UNIT, e.timestamp));
        break;
      case 'createPool':
        // The canonical WSOL pool of a coin is created by its migration only (its PDA is pump's to sign).
        if (e.quoteMint === WSOL_MINT && !migrations.has(e.baseMint) && ctx.canonicalPool?.(e.baseMint) === e.pool) {
          migrations.set(e.baseMint, migrate(tx, e.baseMint, e.pool, e.poolQuoteAmount, e.poolBaseAmount, 10 ** e.baseDecimals, e.timestamp));
        }
        break;
      default:
        break;
    }
  }

  // Launches first, each with its creator's buy in this transaction (PumpPortal's create frame carries it too).
  const devLegs = new Set<Legs>();
  for (const c of creates) {
    const dev = legs.get(`pump|${c.mint}|${c.user}`) ?? legs.get(`pump|${c.mint}|${c.creator}`);
    const buy = dev && dev.buyTokens > 0 && dev.sellTokens === 0 ? dev : null;
    if (buy) devLegs.add(buy);
    out.events.push(launch(tx, c, buy));
  }
  for (const l of [...legs.values()].sort((a, b) => a.order - b.order)) {
    if (devLegs.has(l)) continue;
    const t = trade(tx, l);
    if (t) out.events.push(t);
    else out.roundTrips++;
  }
  out.events.push(...migrations.values());
  return out;
}

/** MigrateV2 (or the canonical pool's creation): the pool starts with all its quote (vault plus the virtual reserve split off it) and tokens. */
function migrate(tx: LogTransaction, mint: string, pool: string, quote: bigint, tokens: bigint, unit: number, timestamp: number): MigrateEvent {
  return {
    kind: 'migrate',
    signature: tx.signature,
    mint,
    pool: 'pump-amm',
    poolAddress: pool,
    poolNative: Number(quote) / LAMPORTS,
    poolTokens: Number(tokens) / unit,
    at: timestamp * 1000,
    slot: tx.slot,
    source: 'logs',
  };
}

function launch(tx: LogTransaction, c: PumpCreateLog, buy: Legs | null): CreateEvent {
  const trader = buy?.user ?? c.user;
  const last = buy?.last ?? null;
  const e: CreateEvent = {
    kind: 'create',
    signature: tx.signature,
    mint: c.mint,
    trader,
    initialBuy: buy ? buy.buyTokens : 0,
    solAmount: buy ? buy.buySol : 0,
    name: c.name,
    symbol: c.symbol,
    uri: c.uri,
    // Post-buy reserves, as PumpPortal's create frame reports them (the launch state without a buy).
    vSolInBondingCurve: Number(last ? last.virtualQuoteReserves : c.virtualQuoteReserves) / LAMPORTS,
    vTokensInBondingCurve: Number(last ? last.virtualTokenReserves : c.virtualTokenReserves) / PUMP_TOKEN_UNIT,
    realTokensInBondingCurve: Number(last ? last.realTokenReserves : c.realTokenReserves) / PUMP_TOKEN_UNIT,
    // A fresh curve holds no real SOL until its first buy.
    realSolInBondingCurve: last ? Number(last.realQuoteReserves) / LAMPORTS : 0,
    mayhem: c.mayhem,
    pool: 'pump',
    at: c.timestamp * 1000,
    slot: tx.slot,
    source: 'logs',
  };
  if (buy) e.walletSol = buy.buyWallet;
  if (c.creator !== trader) e.creator = c.creator;
  return e;
}

/** A wallet's legs on one mint as one trade (netted when it both bought and sold); null when they cancel out. */
function trade(tx: LogTransaction, l: Legs): TradeEvent | null {
  const net = l.buyTokens - l.sellTokens;
  const mixed = l.buyTokens > 0 && l.sellTokens > 0;
  const side: 'buy' | 'sell' = net >= 0 ? 'buy' : 'sell';
  const tokenAmount = mixed ? Math.abs(net) : side === 'buy' ? l.buyTokens : l.sellTokens;
  const solAmount = mixed ? Math.abs(l.buySol - l.sellSol) : side === 'buy' ? l.buySol : l.sellSol;
  const walletSol = mixed ? (side === 'buy' ? l.buyWallet - l.sellWallet : l.sellWallet - l.buyWallet) : side === 'buy' ? l.buyWallet : l.sellWallet;
  if (!(tokenAmount > 1e-9) || (mixed && !(walletSol > 0))) return null;
  const e: TradeEvent = {
    kind: 'trade',
    side,
    signature: tx.signature,
    mint: l.mint,
    trader: l.user,
    tokenAmount,
    solAmount,
    walletSol,
    pool: l.venue,
    at: l.at,
    slot: tx.slot,
    source: 'logs',
  };
  if (l.venue === 'pump' && l.last) {
    e.vSolInBondingCurve = Number(l.last.virtualQuoteReserves) / LAMPORTS;
    e.vTokensInBondingCurve = Number(l.last.virtualTokenReserves) / PUMP_TOKEN_UNIT;
    e.realSolInBondingCurve = Number(l.last.realQuoteReserves) / LAMPORTS;
    e.realTokensInBondingCurve = Number(l.last.realTokenReserves) / PUMP_TOKEN_UNIT;
    e.mayhem = l.mayhem;
  } else if (l.pool) {
    e.solInPool = l.pool.native;
    e.tokensInPool = l.pool.tokens;
  }
  return e;
}

/** The part of a completing buy filled past the curve joins that buy (same user, same mint). */
function foldPostComplete(e: PumpPostCompleteBuyLog, legs: Map<string, Legs>, out: MappedTransaction): void {
  if (!isSolQuote(e.quoteMint)) {
    out.otherQuote++;
    return;
  }
  const l = legs.get(`pump|${e.mint}|${e.user}`);
  if (!l) return;
  const sol = Number(e.quoteIn) / LAMPORTS;
  l.buyTokens += Number(e.baseOut) / PUMP_TOKEN_UNIT;
  l.buySol += sol;
  l.buyWallet += sol + Number(e.fee + e.creatorFee) / LAMPORTS;
}
