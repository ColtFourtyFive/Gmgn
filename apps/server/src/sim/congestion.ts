// Network congestion per chain (PRD SIM-02): a 0..1 load level from trade
// throughput against the chain's own recent baseline, plus occasional "launch
// rush" spikes (which also speed up launches, see MarketSim.tick). The market
// module advances it every ambient tick with world.rng and publishes the level
// on world.chains[chain].congestion; /api/meta turns it into a label and
// priority-fee suggestions, and the trading engine into landing latency and
// expiry failures.
//
//   fast, slow = trades/s EMAs (time constants 60s / 30min), both starting at
//                the first rate seen; during the warm-up fast-forward (which
//                grows the market from nothing for about an hour) slow follows
//                fast, so that ramp never reads as a surge
//   surge      = clamp((fast / slow - 1) / 2, 0, 0.5)      a 2x burst adds 0.5
//   rush       = decays e^(-t / 4min); a new rush (on average every 30 min per
//                chain) jumps to max(rush, U(0.5, 0.9))
//   level      = clamp01(0.15 + surge + rush)
//   label      = normal < 0.4 <= busy < 0.7 <= congested
//   fees       = base tier x (1 + 3 * max(0, level - 0.2))   ~3x when congested

import type { ChainCongestion, ChainId, CongestionLabel } from '@trenchscope/shared';
import type { Rng } from './rng';

export const CONGESTION_BASE = 0.15;
export const BUSY_LEVEL = 0.4;
export const CONGESTED_LEVEL = 0.7;
const FAST_TAU_S = 60;
const SLOW_TAU_S = 30 * 60;
const RUSH_DECAY_S = 4 * 60;
const RUSH_MEAN_GAP_S = 30 * 60;

/**
 * Suggested medium priority fee (native) at calm; low = 0.5x, high = 3x. Every chain's default
 * Standard preset (accounts/settings.ts) stays above the 'low' tier at full congestion.
 */
const BASE_PRIORITY_FEE: Record<ChainId, number> = { sol: 0.0001, bsc: 0.0001, base: 0.00001, eth: 0.0008 };

/** Model state per chain (persisted by the market module). */
export interface CongestionModel {
  fast: number;
  slow: number;
  rush: number;
  /** Chain trade counter at the last update. */
  trades: number;
}

export function newCongestionModel(trades: number): CongestionModel {
  return { fast: 0, slow: 0, rush: 0, trades };
}

/**
 * Advance by `dtS` seconds given the chain's running trade counter; returns the new level.
 * `settling` (the warm-up fast-forward) pins the baseline to the fast average.
 */
export function stepCongestion(m: CongestionModel, rng: Rng, dtS: number, trades: number, settling = false): number {
  if (dtS <= 0) return levelOf(m);
  const rate = Math.max(0, trades - m.trades) / dtS;
  m.trades = trades;
  if (m.slow <= 0) m.fast = m.slow = rate;
  m.fast += (rate - m.fast) * (1 - Math.exp(-dtS / FAST_TAU_S));
  m.slow = settling ? m.fast : m.slow + (rate - m.slow) * (1 - Math.exp(-dtS / SLOW_TAU_S));
  m.rush *= Math.exp(-dtS / RUSH_DECAY_S);
  if (rng.chance(dtS / RUSH_MEAN_GAP_S)) m.rush = Math.max(m.rush, rng.float(0.5, 0.9));
  return levelOf(m);
}

function levelOf(m: CongestionModel): number {
  const surge = m.slow > 0 ? Math.min(0.5, Math.max(0, (m.fast / m.slow - 1) / 2)) : 0;
  return Math.min(1, CONGESTION_BASE + surge + m.rush);
}

export function congestionLabel(level: number): CongestionLabel {
  return level >= CONGESTED_LEVEL ? 'congested' : level >= BUSY_LEVEL ? 'busy' : 'normal';
}

export function congestionOf(level: number): ChainCongestion {
  return { level: Math.round(level * 1000) / 1000, label: congestionLabel(level) };
}

/** Priority-fee suggestions (native) for the chain at a congestion level. */
export function priorityFeeTiers(chain: ChainId, level: number): { low: number; medium: number; high: number } {
  const fee = BASE_PRIORITY_FEE[chain] * (1 + 3 * Math.max(0, level - 0.2));
  return { low: fee * 0.5, medium: fee, high: fee * 3 };
}
