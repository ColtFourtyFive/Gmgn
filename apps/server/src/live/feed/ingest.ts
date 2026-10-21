// Feed events -> World. Turns create / trade / migrate events, from PumpPortal's
// frames or from the programs' logs (feed/solana/map.ts makes the same events,
// with what the logs add: exact wallet amounts, real reserves, block time, slot,
// the migration's pool), into the ledger's external-ingest calls:
//   create   addExternalToken (launchpad 'pump', dev = creator, created at receipt)
//            registered at its launch curve (initial liquidity, launch market cap),
//            then the creator's initial buy is booked as the token's first trade
//   trade    recordExternalTrade with the post-trade virtual reserves while on the
//            curve (World completes the curve when its real tokens run out), or the
//            pool's reserves / execution price on PumpSwap afterwards
//   migrate  completeCurve + migrateExternal into the token's canonical PumpSwap pool
// The trader's newTokenBalance is passed as the authoritative post-trade balance.
// Events are deduplicated by signature (a bounded window), and the World again by
// (signature, wallet, token), since our own fills arrive from a second source and
// both feeds can deliver the same transaction. An event's block time is kept within
// [the token's last trade, now]; a trade from an older slot than the token's state
// (a gap's catch-up) is booked without its reserves.
//
// Units, as checked against mainnet transactions (the pump program's TradeEvent):
//   - the feed's solAmount for a curve trade is the SOL into / out of the curve. Buyers pay the
//     curve's fees on top (protocol 0.95% + creator 0.30%), sellers receive it less those fees.
//     The World books what the wallet paid / received (as for simulated and our own trades), so
//     curve amounts are converted here; pump.fun's mayhem agent trades fee-free.
//   - real reserves follow from the virtual ones with fixed offsets (30 SOL, 279.9M tokens) on a
//     normal curve. A mayhem-mode curve keeps the token offset, but the program moves its virtual
//     SOL on its own: its real SOL is tracked from the trades' flows instead. A mayhem launch mints
//     a second billion straight to the mayhem agent, registered as its holding at the launch.
//   - MigrateV2 moves the completed curve's real SOL less 0.015 SOL, and its 206.9M remaining
//     tokens, into the canonical PumpSwap pool (part of that SOL as the pool's virtual quote reserve).

import { LIVE_DEXES, LIVE_LAUNCHPADS, type LaunchpadConfig } from '@trenchscope/shared';
import type { PoolRuntime, TokenState, World } from '../../sim/world';
import { classifyNarrative } from '../enrich/narratives';
import type { CreateEvent, FeedEvent, MigrateEvent, ReportedReserves, TradeEvent } from './messages';

export const PUMP: LaunchpadConfig = LIVE_LAUNCHPADS.find((l) => l.id === 'pump')!;
const PUMPSWAP = LIVE_DEXES.find((d) => d.id === 'pumpswap')!;
/** pump.fun mints: 6 decimals, fixed supply. */
export const PUMP_DECIMALS = 6;
/** Virtual tokens a pump.fun curve holds beyond its real (sellable) tokens. */
export const PUMP_VIRTUAL_TOKEN_OFFSET = PUMP.virtualTokens - PUMP.curveTokens;
/** Tokens a completed curve leaves for the pool (supply minus what the curve sold). */
export const PUMP_POOL_TOKENS = PUMP.totalSupply - PUMP.curveTokens;
/** Mayhem-mode mints are created with twice the supply (the extra billion goes to the mayhem agent). */
export const PUMP_MAYHEM_SUPPLY = 2 * PUMP.totalSupply;
/** pump.fun's mayhem-mode agent: it trades mayhem coins without fees (observed on mainnet). */
export const PUMP_MAYHEM_AGENT = 'BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s';
/** SOL a migration keeps: the pool gets the completed curve's real SOL less this (MigrateV2 on mainnet). */
export const PUMP_MIGRATION_FEE_SOL = 0.015;
/** Below this many real tokens a curve is complete (float noise of the feed's UI amounts). */
const CURVE_DUST_TOKENS = 1;
/** Signatures remembered for dedupe. */
const DEDUPE_WINDOW = 50_000;
/** Mints whose events are ignored (launches quoted in another mint), remembered at most. */
const IGNORED_WINDOW = 20_000;

/**
 * What the wallet paid (buy) or received (sell) for a curve trade that moved `curveSol` through
 * the curve, at the curve's fee rate (charged on the curve amount, on top for buys).
 */
export function walletSol(side: 'buy' | 'sell', curveSol: number, feeRate: number): number {
  return side === 'buy' ? curveSol * (1 + feeRate) : curveSol * (1 - feeRate);
}

/** A mayhem-mode coin: its mint holds more than a normal pump.fun supply. */
export function isMayhemToken(t: Pick<TokenState, 'launchpad' | 'totalSupply'>): boolean {
  return t.launchpad === PUMP.id && t.totalSupply > PUMP.totalSupply;
}

/** Real reserves of a pump.fun curve from its virtual reserves (the virtual offsets are fixed per curve). */
export function pumpCurveFromVirtual(vSol: number, vTokens: number): { virtualNative: number; virtualTokens: number; realNative: number; realTokens: number } {
  let realTokens = vTokens - PUMP_VIRTUAL_TOKEN_OFFSET;
  if (realTokens < CURVE_DUST_TOKENS) realTokens = 0;
  return { virtualNative: vSol, virtualTokens: vTokens, realNative: Math.max(0, vSol - PUMP.virtualNative), realTokens };
}

export type IngestResult =
  | { status: 'ok'; token: TokenState }
  | { status: 'duplicate' }
  /** A trade / migration of a token the World does not have (load it, then replay). */
  | { status: 'unknown_token'; mint: string }
  | { status: 'ignored'; reason: string };

export interface IngestStats {
  creates: number;
  trades: number;
  migrations: number;
  duplicates: number;
  unknownToken: number;
  ignored: number;
}

export interface IngestOptions {
  /** Time stamp for events (the feed carries none): the sim clock, which follows wall time live. */
  now: () => number;
  /** Address of a mint's canonical PumpSwap pool (pump SDK), '' when unavailable. */
  pumpPoolAddress?: (mint: string) => string;
}

export class FeedIngestor {
  readonly stats: IngestStats = { creates: 0, trades: 0, migrations: 0, duplicates: 0, unknownToken: 0, ignored: 0 };
  /** Recent event keys (insertion order = age), for dedupe. */
  private readonly seen = new Set<string>();
  /** Mints whose feed events must not reach the World (a launch quoted in another mint). */
  private readonly ignoredMints = new Set<string>();
  /**
   * Highest slot applied per mint (program-log events carry one; insertion order = age). A trade from
   * an older slot (a gap's catch-up, replayed after newer trades) is booked without its reserves: the
   * curve / pool already holds a later state.
   */
  private readonly slots = new Map<string, number>();
  /** Trades booked without their (older) reserves. */
  staleReserves = 0;

  constructor(
    private readonly world: World,
    private readonly opts: IngestOptions,
  ) {}

  /** Ignore every later event of `mint` (its frames do not carry SOL amounts). */
  ignoreMint(mint: string): void {
    this.ignoredMints.delete(mint);
    this.ignoredMints.add(mint);
    if (this.ignoredMints.size > IGNORED_WINDOW) {
      const oldest = this.ignoredMints.values().next().value;
      if (oldest !== undefined) this.ignoredMints.delete(oldest);
    }
  }

  isIgnored(mint: string): boolean {
    return this.ignoredMints.has(mint);
  }

  apply(e: FeedEvent): IngestResult {
    if (this.ignoredMints.has(e.mint)) {
      this.stats.ignored++;
      return { status: 'ignored', reason: 'not quoted in SOL' };
    }
    switch (e.kind) {
      case 'create':
        return this.create(e);
      case 'trade':
        return this.trade(e);
      case 'migrate':
        return this.migrate(e);
    }
  }

  /** Forget an event so it can be applied again (a trade parked until its token loaded). */
  forget(e: FeedEvent): void {
    this.seen.delete(keyOf(e));
  }

  private firstSight(e: FeedEvent): boolean {
    const key = keyOf(e);
    if (this.seen.has(key)) {
      this.stats.duplicates++;
      return false;
    }
    this.seen.add(key);
    if (this.seen.size > DEDUPE_WINDOW) {
      let excess = this.seen.size - DEDUPE_WINDOW;
      for (const k of this.seen) {
        if (excess-- <= 0) break;
        this.seen.delete(k);
      }
    }
    return true;
  }

  private create(e: CreateEvent): IngestResult {
    if (e.pool && e.pool !== 'pump') {
      this.stats.ignored++;
      return { status: 'ignored', reason: `launchpad ${e.pool} is not supported` };
    }
    if (!this.firstSight(e)) return { status: 'duplicate' };
    const known = this.world.tokens.get(e.mint);
    if (known) return { status: 'ok', token: known };
    // The block time when the source has it (never in the future of the World's clock), else receipt.
    const now = this.opts.now();
    const at = e.at !== undefined && e.at > 0 ? Math.min(e.at, now) : now;
    // Register at the launch state of the curve: the reported (post-buy) reserves less the creator's
    // initial buy, along the constant product (pump.fun fees are charged on top of the curve).
    let pre = { virtualNative: PUMP.virtualNative, virtualTokens: PUMP.virtualTokens };
    const post = reportedCurve(e);
    if (post) {
      const vTokens = post.virtualTokens + e.initialBuy;
      pre = { virtualTokens: vTokens, virtualNative: (post.virtualNative * post.virtualTokens) / vTokens };
    }
    const start = pumpCurveFromVirtual(pre.virtualNative, pre.virtualTokens);
    // Real reserves reported with the launch (program logs) are exact, mayhem curves included.
    if (post && e.realSolInBondingCurve !== undefined) start.realNative = Math.max(0, post.realNative - e.solAmount);
    if (post && e.realTokensInBondingCurve !== undefined) start.realTokens = post.realTokens + e.initialBuy;
    const symbol = e.symbol || e.mint.slice(0, 4).toUpperCase();
    const name = e.name || symbol;
    const { narrative, glyph } = classifyNarrative(name, symbol);
    const feeRate = e.curveFeeRate ?? PUMP.feeRate;
    const token = this.world.addExternalToken({
      chain: 'sol',
      address: e.mint,
      launchpad: PUMP.id,
      symbol,
      name,
      description: '',
      imageUrl: null,
      metadataUri: e.uri || null,
      creator: e.creator ?? e.trader,
      createdAt: at,
      decimals: PUMP_DECIMALS,
      totalSupply: e.mayhem ? PUMP_MAYHEM_SUPPLY : PUMP.totalSupply,
      status: 'curve',
      curve: { ...start, initialRealTokens: PUMP.curveTokens, feeRate },
      pool: null,
      socials: {},
      narrative,
      logoGlyph: glyph,
    });
    this.stats.creates++;
    if (e.slot !== undefined) this.noteSlot(e.mint, e.slot);
    // A mayhem launch (CreateV2) mints the extra billion straight to the mayhem agent: a holder from the start.
    if (e.mayhem) this.world.syncHolderBalance(token, PUMP_MAYHEM_AGENT, PUMP_MAYHEM_SUPPLY - PUMP.totalSupply);
    if (e.initialBuy > 0) {
      this.world.recordExternalTrade(token, {
        wallet: e.trader,
        side: 'buy',
        nativeAmount: e.walletSol ?? walletSol('buy', e.solAmount, e.trader === PUMP_MAYHEM_AGENT ? 0 : feeRate),
        tokenAmount: e.initialBuy,
        at,
        txHash: e.signature,
        ...(e.slot !== undefined ? { slot: e.slot } : {}),
        ...(post ? { curve: post } : {}),
        walletTokenBalance: e.newTokenBalance ?? e.initialBuy,
      });
    }
    return { status: 'ok', token };
  }

  private trade(e: TradeEvent): IngestResult {
    if (!(e.tokenAmount > 0)) {
      this.stats.ignored++;
      return { status: 'ignored', reason: 'empty trade' };
    }
    const t = this.world.tokens.get(e.mint);
    if (!t || t.chain !== 'sol') {
      this.stats.unknownToken++;
      return { status: 'unknown_token', mint: e.mint };
    }
    const onCurve = !e.pool || e.pool === 'pump';
    // A curve trade's amounts are SOL only on a SOL-quoted pump.fun curve: a token registered any
    // other way (another venue, a curve quoted in another mint, loaded on demand) does not take them.
    if (onCurve && t.launchpad !== PUMP.id) {
      this.stats.ignored++;
      return { status: 'ignored', reason: 'not a SOL-quoted pump.fun curve' };
    }
    if (!this.firstSight(e)) return { status: 'duplicate' };
    // The block time when the source has it, kept within [the token's last trade, now] so candles and
    // minute buckets stay in order whichever source delivered the earlier trades.
    const now = this.opts.now();
    const at = e.at !== undefined && e.at > 0 ? Math.min(now, Math.max(e.at, t.lastTradeAt)) : now;
    // A PumpSwap trade of a token we still have on its curve: the migration event was missed.
    if (!onCurve && !t.pool && t.launchpad === PUMP.id) this.migrateToPool(t, at);
    if (t.dormant) t.dormant = false;
    const stale = e.slot !== undefined && (this.slots.get(e.mint) ?? -1) > e.slot;
    if (stale) this.staleReserves++;
    else if (e.slot !== undefined) this.noteSlot(e.mint, e.slot);
    const reserves = stale ? {} : this.reservesAfter(t, e, onCurve);
    const curveTrade = onCurve && !!t.curve && t.status !== 'migrated';
    const trade = this.world.recordExternalTrade(t, {
      wallet: e.trader,
      side: e.side,
      // Exact when the source reports it (program logs). Otherwise PumpSwap amounts are taken as sent:
      // no PumpPortal pump-amm trade could be captured to check their fee basis.
      nativeAmount: e.walletSol ?? (curveTrade ? walletSol(e.side, e.solAmount, this.feeRateFor(t, e.trader)) : e.solAmount),
      tokenAmount: e.tokenAmount,
      at,
      txHash: e.signature,
      ...(e.slot !== undefined ? { slot: e.slot } : {}),
      ...reserves,
      ...(e.newTokenBalance !== undefined ? { walletTokenBalance: e.newTokenBalance } : {}),
    });
    if (!trade) {
      this.stats.duplicates++;
      return { status: 'duplicate' };
    }
    this.stats.trades++;
    return { status: 'ok', token: t };
  }

  private noteSlot(mint: string, slot: number): void {
    this.slots.delete(mint);
    this.slots.set(mint, slot);
    if (this.slots.size > DEDUPE_WINDOW) {
      const oldest = this.slots.keys().next().value;
      if (oldest !== undefined) this.slots.delete(oldest);
    }
  }

  /** The curve's fee rate for a trader (the mayhem agent trades fee-free). */
  private feeRateFor(t: TokenState, trader: string): number {
    return trader === PUMP_MAYHEM_AGENT ? 0 : (t.curve?.feeRate ?? PUMP.feeRate);
  }

  /** The reserves a trade reports, in the World's terms. */
  private reservesAfter(t: TokenState, e: TradeEvent, onCurve: boolean): { curve?: ReturnType<typeof pumpCurveFromVirtual>; pool?: { native: number; tokens: number }; priceNative?: number } {
    const curve = onCurve && t.curve && t.status !== 'migrated' ? reportedCurve(e) : null;
    if (curve && t.curve) {
      // Mayhem curves move their virtual SOL off the constant product: their real SOL is the one the
      // source reports, else the flows'.
      if (isMayhemToken(t) && e.realSolInBondingCurve === undefined) curve.realNative = Math.max(0, t.curve.realNative + (e.side === 'buy' ? e.solAmount : -e.solAmount));
      return { curve };
    }
    if (!t.pool) return {};
    if (e.solInPool && e.tokensInPool) return { pool: { native: e.solInPool, tokens: e.tokensInPool } };
    if (!(e.solAmount > 0)) return {};
    // Only the trade itself is known: move the pool's SOL side by the flow and price it at the trade.
    const price = e.solAmount / e.tokenAmount;
    const native = Math.max(t.pool.native * 0.01, t.pool.native + (e.side === 'buy' ? e.solAmount : -e.solAmount));
    return { pool: { native, tokens: native / price } };
  }

  private migrate(e: MigrateEvent): IngestResult {
    const t = this.world.tokens.get(e.mint);
    if (!t || t.chain !== 'sol') {
      this.stats.unknownToken++;
      return { status: 'unknown_token', mint: e.mint };
    }
    if (!this.firstSight(e)) return { status: 'duplicate' };
    if (t.status === 'migrated') return { status: 'duplicate' };
    const now = this.opts.now();
    const at = e.at !== undefined && e.at > 0 ? Math.min(now, Math.max(e.at, t.lastTradeAt)) : now;
    const reported = e.poolNative !== undefined && e.poolTokens !== undefined && e.poolNative > 0 && e.poolTokens > 0 ? { native: e.poolNative, tokens: e.poolTokens, address: e.poolAddress } : undefined;
    this.migrateToPool(t, at, reported);
    if (e.slot !== undefined) this.noteSlot(e.mint, e.slot);
    this.stats.migrations++;
    return { status: 'ok', token: t };
  }

  /**
   * The completed curve's liquidity moves into its PumpSwap pool: the curve's real SOL at completion
   * less the migration fee, against the 206.9M tokens the curve never sold, LP burned. A normal
   * curve's completion state follows from its constant product whatever trades were missed (real
   * SOL 85.005, so 84.990 SOL in the pool on mainnet); a mayhem curve's from its tracked real SOL.
   * A migration event that reports the pool (program logs) is taken as is.
   */
  private migrateToPool(t: TokenState, at: number, reported?: { native: number; tokens: number; address?: string }): void {
    if (t.status === 'curve') this.world.completeCurve(t, at);
    const pool: Omit<PoolRuntime, 'createdAt' | 'initialLiquidityUsd'> = {
      address: reported?.address || (this.opts.pumpPoolAddress?.(t.address) ?? ''),
      dex: PUMPSWAP.name,
      feeRate: PUMPSWAP.feeRate,
      native: reported?.native ?? Math.max(completedCurveSol(t) - Math.max(PUMP.migrationFeeNative, PUMP_MIGRATION_FEE_SOL), 1e-6),
      tokens: reported?.tokens ?? PUMP_POOL_TOKENS,
      lpBurnedRate: 1,
    };
    this.world.migrateExternal(t, pool, at);
  }
}

/**
 * A pump.fun curve's post-trade state as an event reports it: real reserves from the virtual ones
 * (fixed offsets), or as reported when the source has them (program logs; exact for mayhem curves).
 */
function reportedCurve(e: ReportedReserves): ReturnType<typeof pumpCurveFromVirtual> | null {
  if (!e.vSolInBondingCurve || !e.vTokensInBondingCurve) return null;
  const c = pumpCurveFromVirtual(e.vSolInBondingCurve, e.vTokensInBondingCurve);
  if (e.realSolInBondingCurve !== undefined && e.realSolInBondingCurve >= 0) c.realNative = e.realSolInBondingCurve;
  if (e.realTokensInBondingCurve !== undefined && e.realTokensInBondingCurve >= 0) c.realTokens = e.realTokensInBondingCurve < CURVE_DUST_TOKENS ? 0 : e.realTokensInBondingCurve;
  return c;
}

/**
 * Real SOL a pump.fun curve holds once complete (all of its real tokens sold). A normal curve is a
 * constant product that completes with exactly the virtual token offset left, so this holds from
 * any earlier state of the curve (trades missed, or the completion already marked by the World,
 * which zeroes realTokens only). A mayhem curve's is its tracked real SOL.
 */
export function completedCurveSol(t: Pick<TokenState, 'curve' | 'launchpad' | 'totalSupply'>): number {
  const c = t.curve;
  if (!c) return 0;
  if (isMayhemToken(t) || !(c.virtualNative > 0 && c.virtualTokens > 0)) return Math.max(0, c.realNative);
  const virtualSolOffset = c.virtualNative - c.realNative;
  return Math.max(0, c.realNative, (c.virtualNative * c.virtualTokens) / PUMP_VIRTUAL_TOKEN_OFFSET - virtualSolOffset);
}

function keyOf(e: FeedEvent): string {
  return e.kind === 'trade' ? `t|${e.signature}|${e.mint}|${e.trader}|${e.side}` : `${e.kind[0]}|${e.signature}|${e.mint}`;
}
