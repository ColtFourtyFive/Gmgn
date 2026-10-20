// Agent order execution plus per-archetype sizing and exit rules. Every
// agent trade goes through World.executeSwap like a human paper trade does
// (agents pay the chain's network fee but no platform fee).

import { CHAINS, type ChainId } from '@trenchscope/shared';
import type { PositionState, SwapOutcome, TokenState, WalletState, World } from '../world';
import type { Rng } from '../rng';
import { memOf, type Role } from './roster';

const SEC = 1000;
const MIN = 60 * SEC;

/** Gas is expensive on Ethereum mainnet, so nobody trades dust there. */
const CHAIN_SIZE: Record<ChainId, number> = { sol: 1, bsc: 1, base: 1, eth: 2.5 };
/**
 * Agents size single swaps to at most this share of the venue's native reserve:
 * the crowd tolerates ~12% price impact, size-aware players split into smaller fills.
 */
const MAX_RESERVE_SHARE: Partial<Record<Role, number>> = { smart: 0.02, whale: 0.015, kol: 0.03 };
const DEFAULT_RESERVE_SHARE = 0.06;

export class Desk {
  constructor(private readonly world: World) {}

  /** Buy about `usd` worth, capped by the wallet's balance and the venue's depth. Null when skipped or rejected. */
  buy(w: WalletState, t: TokenState, usd: number, at?: number): SwapOutcome | null {
    const fee = CHAINS[t.chain].baseNetworkFee;
    const nu = this.world.nativeUsd(t.chain);
    const reserve = t.pool ? t.pool.native : (t.curve?.virtualNative ?? 0);
    const share = MAX_RESERVE_SHARE[memOf(w).role] ?? DEFAULT_RESERVE_SHARE;
    const native = Math.min(usd / nu, reserve * share, (w.native - fee) * 0.98);
    if (native * nu < 1) return null;
    const r = this.world.executeSwap(w, t, 'buy', native, { networkFee: fee, at });
    return r.ok ? r : null;
  }

  /** Launch-block allocation: spend exactly `nativeIn` (precomputed for a target share of supply). */
  allocate(w: WalletState, t: TokenState, nativeIn: number): SwapOutcome | null {
    if (!(nativeIn > 0) || !Number.isFinite(nativeIn)) return null;
    const r = this.world.executeSwap(w, t, 'buy', nativeIn, { networkFee: CHAINS[t.chain].baseNetworkFee });
    return r.ok ? r : null;
  }

  /**
   * Sell a fraction of the position, split like the agent's buys: one swap never
   * moves the venue more than the role tolerates (the rest goes on later checks).
   */
  sell(w: WalletState, t: TokenState, fraction: number): SwapOutcome | null {
    const share = MAX_RESERVE_SHARE[memOf(w).role] ?? DEFAULT_RESERVE_SHARE;
    const depth = t.pool ? t.pool.tokens : (t.curve?.virtualTokens ?? 0);
    return this.execSell(w, t, fraction, depth * share);
  }

  /** Scripted exits (rugs, coordinated dumps, MEV back-runs) hit the venue in one swap. */
  dump(w: WalletState, t: TokenState, fraction: number): SwapOutcome | null {
    return this.execSell(w, t, fraction, Infinity);
  }

  private execSell(w: WalletState, t: TokenState, fraction: number, maxTokens: number): SwapOutcome | null {
    const pos = w.positions.get(t.address);
    if (!pos || pos.balance <= 0) return null;
    // the remainder goes too when it would be dust
    const leftUsd = pos.balance * (1 - fraction) * this.world.priceUsd(t);
    const wanted = fraction >= 0.999 || leftUsd < 2 ? pos.balance : pos.balance * fraction;
    const r = this.world.executeSwap(w, t, 'sell', Math.min(wanted, maxTokens), { networkFee: CHAINS[t.chain].baseNetworkFee });
    return r.ok ? r : null;
  }
}

/** Typical buy size (USD) for an agent of the given role. */
export function buySizeUsd(rng: Rng, role: Role, w: WalletState, nativeUsd: number): number {
  const balanceUsd = w.native * nativeUsd;
  let usd: number;
  switch (role) {
    case 'retail':
    case 'fresh':
      usd = Math.max(5, balanceUsd * Math.min(0.7, rng.lognormal(0.18, 0.7)));
      break;
    case 'bot':
      usd = rng.lognormal(20, 0.7);
      break;
    case 'sniper':
      usd = rng.lognormal(300, 0.6);
      break;
    case 'smart':
      usd = memOf(w).bank * rng.lognormal(0.03, 0.5);
      break;
    case 'kol':
      usd = rng.lognormal(1500, 0.7);
      break;
    case 'whale':
      usd = memOf(w).bank * rng.lognormal(0.015, 0.6);
      break;
    default:
      usd = rng.lognormal(50, 0.8);
  }
  return usd * CHAIN_SIZE[w.chain];
}

/** How much of its bag a retail holder sells once it decides to sell. */
export function retailSellFraction(rng: Rng, mult: number): number {
  if (mult >= rng.float(1.6, 4)) return rng.chance(0.5) ? 1 : 0.5; // take profit
  if (mult <= 0.45) return rng.chance(0.6) ? 1 : 0.5; // capitulate
  return rng.chance(0.65) ? 1 : rng.float(0.25, 0.75);
}

/** Roles whose exits run on scheduled checks instead of the anonymous sell flow. */
export const CHECKED_ROLES: ReadonlySet<Role> = new Set<Role>(['bot', 'sniper', 'smart', 'kol', 'whale', 'crew']);

export function checkIntervalMs(rng: Rng, role: Role): number {
  switch (role) {
    case 'bot':
      return rng.float(5, 120) * SEC; // bots hold seconds to minutes, then flip
    case 'sniper':
      return rng.float(4, 12) * SEC;
    case 'smart':
      return rng.float(8, 25) * SEC;
    case 'kol':
      return rng.float(15, 40) * SEC;
    case 'whale':
      return rng.float(15, 45) * SEC;
    default:
      return rng.float(20, 60) * SEC;
  }
}

export interface ExitContext {
  now: number;
  priceUsd: number;
  /** Highest price seen by this holder's checks since entry. */
  peakUsd: number;
  /** The token's hidden plan says informed holders should be leaving. */
  danger: boolean;
  /** The hidden plan still has upside (see hasUpside): conviction holders ride pullbacks. */
  upside: boolean;
  /** Current activity (trades/s). */
  hype: number;
}

interface TranchePolicy {
  /** Take-profit multiples; each sells `frac` (the last one sells everything). */
  levels: number[];
  frac: number;
  /** Stop loss multiple. */
  stop: number;
  /** Trailing stop: exit when price falls to this share of the peak (once up 2x). */
  trail: number;
  staleMs: number;
  staleMult: number;
}

const SMART: TranchePolicy = { levels: [2, 4, 8, 16, 32], frac: 0.3, stop: 0.65, trail: 0.6, staleMs: 25 * MIN, staleMult: 1.25 };
const WHALE: TranchePolicy = { levels: [2, 3.5, 6, 10], frac: 0.3, stop: 0.55, trail: 0.6, staleMs: 90 * MIN, staleMult: 1.1 };
/** Smart money holding a token it knows has upside: only a disaster stop, no trailing, no boredom exits. */
const SMART_CONVICTION: TranchePolicy = { ...SMART, stop: 0.35, trail: 0, staleMs: Infinity };
const KOL: TranchePolicy = { levels: [2.5, 5, 10], frac: 0.4, stop: 0.5, trail: 0.55, staleMs: 40 * MIN, staleMult: 1.2 };
const CREW: TranchePolicy = { levels: [2, 4, 8], frac: 0.4, stop: 0, trail: 0.5, staleMs: 20 * MIN, staleMult: 1.5 };

/** `informed` = probability of acting on hidden information when danger is flagged. */
function trancheExit(rng: Rng, pos: PositionState, mult: number, peakMult: number, c: ExitContext, p: TranchePolicy, informed: number): number {
  if (c.danger && rng.chance(informed)) return 1;
  if (mult <= p.stop) return 1;
  if (peakMult >= 2 && mult <= peakMult * p.trail) return 1;
  const stage = pos.sells;
  if (stage < p.levels.length && mult >= p.levels[stage]) return stage === p.levels.length - 1 ? 1 : p.frac;
  if (c.now - (pos.firstBuyAt ?? c.now) > p.staleMs && mult < p.staleMult && c.hype < 0.3) return 1;
  return 0;
}

/** Fraction of the position an informed (checked) holder sells now; 0 = keep holding. */
export function informedExit(rng: Rng, role: Role, w: WalletState, pos: PositionState, c: ExitContext): number {
  const avgCost = pos.balance > 0 ? pos.costBasisUsd / pos.balance : 0;
  if (avgCost <= 0) return 1;
  const mult = c.priceUsd / avgCost;
  const peakMult = Math.max(c.peakUsd, c.priceUsd) / avgCost;
  switch (role) {
    case 'bot':
      return 1;
    case 'sniper': {
      const held = c.now - (pos.firstBuyAt ?? c.now);
      if (mult >= 2 + w.skill || mult <= 0.6) return 1;
      if (c.danger && rng.chance(0.3)) return 1;
      return held > MIN && rng.chance(held / (12 * MIN)) ? 1 : 0;
    }
    case 'smart':
      return trancheExit(rng, pos, mult, peakMult, c, c.upside ? SMART_CONVICTION : SMART, w.skill);
    case 'whale':
      return trancheExit(rng, pos, mult, peakMult, c, WHALE, w.skill * 0.6);
    case 'kol':
      return trancheExit(rng, pos, mult, peakMult, c, KOL, w.skill * 0.5);
    default:
      return trancheExit(rng, pos, mult, peakMult, c, CREW, 0.8);
  }
}
