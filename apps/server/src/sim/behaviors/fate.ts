// Hidden token fates and the fair-value paths that drive them.
//
// Every simulated token follows a "fair value" path: waypoints of
// (time, ln market cap USD, activity) plus mean-reverting noise. Order flow
// leans toward buys while the price trades below the path and toward sells
// above it, and trade arrival is proportional to activity, so the fate shapes
// the chart while individual trades stay organic. Scripted events (rugs,
// coordinated dumps, dev sells) and informed exits hang off the same plan.

import type { TokenFate } from '../world';
import type { Rng } from '../rng';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export type FateEvent =
  | 'none'
  | 'rug' //      dev + bundlers + insiders dump everything once inflow arrives
  | 'dump' //     coordinated insider dump after a pump
  | 'devSell' //  slow rug: dev sells a chunk, repeats
  | 'devExit' //  dud: dev gives up and sells all
  | 'devTrim'; // runner: dev takes some profit

/** Phase after the curve: fizzle = ordinary graduation, run = $1M-$10M runner, moon = multi-hour waves. */
export type Outcome = 'curve' | 'fizzle' | 'run' | 'moon';

/** Per-token scratch state (token.sim) owned by the market simulator. */
export interface TokenSim {
  /** Flattened waypoints [time, ln mcap USD, activity (trades/s), ...]. */
  path: number[];
  /** ln-mcap drift per minute after the last waypoint. */
  drift: number;
  /** Activity half-life (ms) after the last waypoint. */
  fadeMs: number;
  /** Mean-reverting fair-value noise (ln units) and its volatility (per sqrt second). */
  noise: number;
  vol: number;
  /** Transient extra activity in trades/s (calls, boosts, migration) that decays. */
  bump: number;
  /** Recent informed selling (USD, decaying) and when it was last updated. */
  exitFlow: number;
  exitFlowAt: number;
  /** Fast / slow EMAs of ln market cap (momentum). */
  emaFast: number;
  emaSlow: number;
  /** Last simulated step; cold tokens are stepped again only at `next`. */
  last: number;
  next: number;
  /** Indexed copy of token.holders for O(1) random sampling. */
  holderList: string[];
  holderIdx: Map<string, number>;
  /** Next scripted fate event. */
  eventKind: FateEvent;
  eventAt: number;
  /** Rug: fire by this time even without the target inflow. Slow rug: dump the rest by then. */
  deadline: number;
  /** Rug: fire early once ln mcap reaches this. */
  triggerLn: number;
  /** Informed holders (smart money, insiders' friends) start exiting from here. */
  dangerAt: number;
  launchLn: number;
  /** The curve-phase plan aims to complete the curve. */
  completes: boolean;
  outcome: Outcome;
  /** Activity scale at launch (chain activity x narrative heat). */
  act: number;
  ruggedAt: number;
  dumpedAt: number;
  boostUntil: number;
  /** KOLs that already called the token. */
  callers: string[];
}

export function simOf(t: { sim: Record<string, unknown> }): TokenSim {
  return t.sim as unknown as TokenSim;
}

// ---------------------------------------------------------------------------
// Fate selection
// ---------------------------------------------------------------------------

const FATES: TokenFate[] = ['dud', 'rug', 'slow_rug', 'pump_dump', 'runner', 'moon'];
const BASE_WEIGHTS = [60, 12, 8, 11, 7, 2];
/**
 * Mean dev reputation per launch: serial ruggers launch most often and sock-puppet
 * devs inherit a rugger's reputation (see Roster), so the average launch comes from rep ~0.32.
 */
const MEAN_LAUNCH_REP = 0.32;

/**
 * Ruggers skew bad, builders skew good; the adjustment is centred on the average
 * launch so the overall mix stays at the base distribution. A scenario
 * (sim/scenarios.ts) scales individual fates on top.
 */
export function pickFate(rng: Rng, rep: number, mult: Partial<Record<TokenFate, number>> = {}): TokenFate {
  const bad = (0.2 + 2 * (1 - rep)) / (0.2 + 2 * (1 - MEAN_LAUNCH_REP));
  const good = (0.2 + 2 * rep) / (0.2 + 2 * MEAN_LAUNCH_REP);
  const w = BASE_WEIGHTS.map((b, i) => (i >= 1 && i <= 3 ? b * bad : i >= 4 ? b * good : b) * (mult[FATES[i]] ?? 1));
  return rng.weighted(FATES, w);
}

/** What traders can see of a launch made outside the simulator (a user's launch). */
export interface LaunchQuality {
  /** Social links present (0..3). */
  socials: number;
  descriptionLength: number;
  /** Creator's creation-block share of supply. */
  devShare: number;
  /** Bundle wallets' creation-block share of supply. */
  bundleShare: number;
}

/**
 * Fates of adopted launches. The launcher is a human who controls every
 * dev-side wallet, so dev rugs (rug, slow_rug) are never drawn and the dev-side
 * sells other scripts include are skipped for them (MarketSim.sellAs).
 */
export const ADOPTED_FATES: TokenFate[] = ['dud', 'pump_dump', 'runner', 'moon'];

/** Creator buy that reads as conviction: none is a weak signal, 1-6% ideal, a 20%+ bag scares buyers off. */
function devBuyScore(share: number): number {
  if (share <= 0) return 0.2;
  if (share < 0.01) return 0.2 + 80 * share;
  if (share <= 0.06) return 1;
  return Math.max(0, 1 - (share - 0.06) / 0.14);
}

/**
 * Adopted-fate weights (ADOPTED_FATES order). Polish (socials, a real
 * description, a sensible dev buy) moves weight from duds to runners and moons;
 * bundles bring snipers and flippers: more pump-and-dumps, fewer real runs.
 */
export function adoptedFateWeights(q: LaunchQuality): number[] {
  const polish = 0.4 * Math.min(1, q.socials / 3) + 0.3 * Math.min(1, q.descriptionLength / 140) + 0.3 * devBuyScore(q.devShare);
  const bundled = Math.min(1, q.bundleShare / 0.15);
  return [
    64 * (1.5 - 0.8 * polish),
    12 * (0.6 + 0.8 * polish) * (1 + 2 * bundled),
    10 * (0.2 + 1.8 * polish) * (1 - 0.5 * bundled),
    3 * (0.1 + 1.9 * polish * polish) * (1 - 0.6 * bundled),
  ];
}

export function pickAdoptedFate(rng: Rng, q: LaunchQuality): TokenFate {
  return rng.weighted(ADOPTED_FATES, adoptedFateWeights(q));
}

export function isBadFate(f: TokenFate): boolean {
  return f === 'rug' || f === 'slow_rug' || f === 'pump_dump';
}

export function isGoodFate(f: TokenFate): boolean {
  return f === 'runner' || f === 'moon';
}

/**
 * What informed money knows: the token still has real upside ahead (a good-fate
 * curve that will graduate, or a post-migration run / moon before its top).
 */
export function hasUpside(fate: TokenFate, s: TokenSim, now: number): boolean {
  if (!isGoodFate(fate) || now >= s.dangerAt) return false;
  return s.outcome === 'curve' ? s.completes : s.outcome !== 'fizzle';
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const point = { ln: 0, act: 0 };

/** Fair value + activity at `now`. Returns a shared scratch object (copy the fields). */
export function evalPath(s: TokenSim, now: number): { ln: number; act: number } {
  const p = s.path;
  const n = p.length;
  const tEnd = p[n - 3];
  if (now >= tEnd) {
    point.ln = p[n - 2] + (s.drift * (now - tEnd)) / MIN;
    point.act = p[n - 1] * Math.pow(0.5, (now - tEnd) / s.fadeMs);
    return point;
  }
  if (now <= p[0]) {
    point.ln = p[1];
    point.act = p[2];
    return point;
  }
  // now < tEnd, so a later waypoint exists
  let i = 3;
  while (now >= p[i]) i += 3;
  const f = (now - p[i - 3]) / (p[i] - p[i - 3]);
  point.ln = p[i - 2] + (p[i + 1] - p[i - 2]) * f;
  point.act = p[i - 1] + (p[i + 2] - p[i - 1]) * f;
  return point;
}

class PathBuilder {
  readonly pts: number[];
  private t: number;

  constructor(t0: number, ln0: number, act0: number) {
    this.pts = [t0, ln0, act0];
    this.t = t0;
  }

  to(durMs: number, ln: number, act: number): this {
    this.t += Math.max(SEC, durMs);
    this.pts.push(this.t, ln, act);
    return this;
  }

  /**
   * Climb to `toLn` over ~durMs in `count` legs, each followed by a pullback.
   * Legs get longer as the run matures (the first pump is the fastest).
   */
  waves(rng: Rng, fromLn: number, toLn: number, durMs: number, count: number, act: number, pullback: [number, number]): this {
    const step = (toLn - fromLn) / count;
    const unit = durMs / ((count * (count + 1)) / 2);
    for (let i = 1; i <= count; i++) {
      const leg = unit * i;
      const top = fromLn + step * i;
      this.to(leg * rng.float(0.45, 0.7), top + (i < count ? rng.float(0, step * 0.3) : 0), act * rng.float(1, 1.4));
      if (i < count) this.to(leg * rng.float(0.3, 0.55), top - rng.float(pullback[0], pullback[1]), act * 0.6);
    }
    return this;
  }

  get end(): number {
    return this.t;
  }
}

export interface LaunchContext {
  now: number;
  /** ln market cap at launch / at curve completion (USD). */
  launchLn: number;
  gradLn: number;
  /** ln market cap at a given curve progress. */
  lnAtProgress: (progress: number) => number;
  /** Activity scale (trades/s at unit activity): chain activity x narrative heat. */
  act: number;
}

/** Initial scratch state + curve-phase plan for a fresh launch. */
export function planLaunch(rng: Rng, fate: TokenFate, c: LaunchContext): TokenSim {
  const { now, launchLn: l0, gradLn: g } = c;
  const s: TokenSim = {
    path: [],
    drift: 0,
    fadeMs: 5 * MIN,
    noise: 0,
    vol: 0.02,
    bump: 0,
    exitFlow: 0,
    exitFlowAt: now,
    emaFast: l0,
    emaSlow: l0,
    last: now,
    next: 0,
    holderList: [],
    holderIdx: new Map(),
    eventKind: 'none',
    eventAt: Infinity,
    deadline: Infinity,
    triggerLn: Infinity,
    dangerAt: Infinity,
    launchLn: l0,
    completes: false,
    outcome: 'curve',
    act: c.act,
    ruggedAt: 0,
    dumpedAt: 0,
    boostUntil: 0,
    callers: [],
  };
  switch (fate) {
    case 'dud': {
      const a = c.act * rng.lognormal(0.03, 0.6);
      const tPeak = rng.float(15, 150) * SEC;
      const peak = Math.min(l0 + Math.log(1 + rng.lognormal(0.4, 0.8)), g - 0.4);
      const b = new PathBuilder(now, l0, a).to(tPeak, peak, a * 1.3).to(rng.float(2, 10) * MIN, l0 + 0.05, a * 0.15);
      setTail(s, b, -0.01, 4 * MIN);
      s.dangerAt = now + tPeak;
      if (rng.chance(0.55)) setEvent(s, 'devExit', now + rng.float(1, 12) * MIN);
      break;
    }
    case 'rug': {
      // manufactured hype: short, loud run-ups
      const a = c.act * rng.lognormal(0.14, 0.4);
      const by = rng.float(1, 6) * MIN;
      const mult = Math.min(Math.max(rng.lognormal(7, 0.3), 4), 13);
      s.triggerLn = Math.min(l0 + Math.log(mult), g - 0.15);
      const b = new PathBuilder(now, l0, a).to(by * 0.55, l0 + Math.log(mult * 0.7), a).to(by * 0.45, s.triggerLn + 0.2, a * 1.3);
      setTail(s, b, 0, 5 * MIN);
      setEvent(s, 'rug', now + Math.max(30 * SEC, by * 0.3));
      s.deadline = now + by * 1.5;
      s.dangerAt = s.eventAt - 20 * SEC;
      break;
    }
    case 'slow_rug': {
      const a = c.act * rng.lognormal(0.045, 0.4);
      const tPeak = rng.float(1, 6) * MIN;
      const peak = Math.min(l0 + Math.log(Math.min(Math.max(rng.lognormal(2.2, 0.4), 1.4), 6)), g - 0.3);
      const b = new PathBuilder(now, l0, a).to(tPeak, peak, a * 1.2).to(rng.float(12, 30) * MIN, l0 + Math.log(1.2), a * 0.2);
      setTail(s, b, -0.005, 8 * MIN);
      setEvent(s, 'devSell', now + tPeak * 0.6);
      s.deadline = now + tPeak + rng.float(8, 25) * MIN;
      s.dangerAt = s.eventAt;
      break;
    }
    case 'pump_dump': {
      const a = c.act * rng.lognormal(0.14, 0.35);
      const tPump = rng.float(1.5, 7) * MIN;
      s.completes = rng.chance(0.1);
      const top = s.completes ? g + 0.3 : Math.min(l0 + Math.log(Math.min(Math.max(rng.lognormal(6, 0.35), 3), 12)), g - 0.12);
      const b = new PathBuilder(now, l0, a * 0.8).to(tPump * 0.5, (l0 + top) / 2, a * 1.3).to(tPump * 0.5, top, a * 1.6);
      setTail(s, b, 0, 6 * MIN);
      if (!s.completes) {
        setEvent(s, 'dump', now + tPump + rng.float(0, 60) * SEC);
        s.dangerAt = s.eventAt - rng.float(20, 90) * SEC;
      }
      break;
    }
    case 'runner':
    case 'moon': {
      const moon = fate === 'moon';
      const a = c.act * (moon ? rng.lognormal(0.2, 0.3) : rng.lognormal(0.12, 0.35));
      s.completes = rng.chance(moon ? 0.85 : 0.5);
      if (s.completes) {
        const dur = (moon ? rng.float(3, 12) : rng.float(3, 18)) * MIN;
        const b = new PathBuilder(now, l0, a).waves(rng, l0, g + (moon ? 0.35 : 0.3), dur, rng.int(2, 3), a, [0.15, 0.35]);
        setTail(s, b, 0, 10 * MIN);
      } else {
        // potential never realized: stalls on the curve, then fades
        const peak = c.lnAtProgress(rng.float(0.4, 0.9));
        const b = new PathBuilder(now, l0, a).waves(rng, l0, peak, rng.float(3, 15) * MIN, 2, a, [0.15, 0.3]);
        s.dangerAt = b.end;
        b.to(rng.float(5, 12) * MIN, l0 + Math.log(1.5), a * 0.15);
        setTail(s, b, -0.01, 6 * MIN);
      }
      break;
    }
  }
  return s;
}

/** Activity grows with market cap (bigger tokens attract more traders). */
function mcapActivity(ln: number): number {
  return Math.min(5, Math.max(0.6, Math.exp(0.4 * (ln - Math.log(1e5)))));
}

/**
 * Post-migration outcome by fate (most graduations fizzle; potential is not destiny).
 * [fizzle, run, moon] weights.
 */
const OUTCOME_WEIGHTS: Partial<Record<TokenFate, number[]>> = { runner: [90, 10, 0], moon: [63, 25, 12] };
const OUTCOMES: Outcome[] = ['fizzle', 'run', 'moon'];

/** Re-plan after migration: ordinary graduation, runner or moon. */
export function planMigrated(s: TokenSim, rng: Rng, fate: TokenFate, now: number, lnNow: number): void {
  const weights = OUTCOME_WEIGHTS[fate];
  s.outcome = weights ? rng.weighted(OUTCOMES, weights) : 'fizzle';
  s.vol = 0.016;
  s.noise *= 0.5;
  if (s.outcome === 'fizzle') {
    const a = s.act * 0.03 * mcapActivity(lnNow);
    const tPeak = rng.float(2, 20) * MIN;
    const peak = lnNow + Math.log(Math.min(Math.max(rng.lognormal(1.9, 0.55), 1.15), 7));
    const b = new PathBuilder(now, lnNow, a).to(tPeak, peak, a * 1.4).to(rng.float(30, 120) * MIN, lnNow + Math.log(rng.float(0.25, 0.6)), a * 0.2);
    setTail(s, b, -0.004, 25 * MIN);
    s.dangerAt = now + tPeak;
    if (fate === 'pump_dump') {
      setEvent(s, 'dump', now + rng.float(1, 6) * MIN);
      s.dangerAt = s.eventAt - rng.float(20, 90) * SEC;
    }
    return;
  }
  const moon = s.outcome === 'moon';
  const peak = Math.log(moon ? Math.min(Math.max(rng.lognormal(1.5e7, 0.8), 4e6), 4e8) : Math.min(Math.max(rng.lognormal(2.2e6, 0.6), 7e5), 1.5e7));
  const a = s.act * 0.07 * mcapActivity(peak);
  const b = new PathBuilder(now, lnNow, a).waves(
    rng,
    lnNow,
    peak,
    moon ? rng.float(1, 4) * HOUR : rng.float(25, 100) * MIN,
    moon ? rng.int(5, 8) : rng.int(3, 5),
    a,
    [0.2, 0.45],
  );
  s.dangerAt = b.end - rng.float(0, moon ? 15 : 8) * MIN;
  b.to(moon ? rng.float(6, 12) * HOUR : rng.float(2, 5) * HOUR, peak + Math.log(moon ? rng.float(0.15, 0.4) : rng.float(0.25, 0.5)), a * 0.3);
  setTail(s, b, -0.003, (moon ? 120 : 60) * MIN);
  if (rng.chance(0.3)) setEvent(s, 'devTrim', now + rng.float(20, 120) * MIN);
}

/** After a rug or dump: panic selling, then the token bleeds out toward the curve floor. */
export function planCrash(s: TokenSim, rng: Rng, now: number, lnNow: number): void {
  const a = s.act;
  const ln1 = lnNow - rng.float(0.2, 0.6);
  const b = new PathBuilder(now, lnNow, a * 0.4).to(90 * SEC, ln1, a * 0.12).to(rng.float(5, 15) * MIN, Math.max(s.launchLn, ln1 - rng.float(1, 2)), a * 0.005);
  setTail(s, b, -0.01, 3 * MIN);
  s.dangerAt = now;
  s.eventKind = 'none';
  s.eventAt = Infinity;
}

/** A dead token wakes up (community takeover, random rediscovery). */
export function planRevival(s: TokenSim, rng: Rng, now: number, lnNow: number): void {
  const a = s.act * rng.lognormal(0.06, 0.4) * mcapActivity(lnNow);
  const tPeak = rng.float(5, 30) * MIN;
  const b = new PathBuilder(now, lnNow, a).to(tPeak, lnNow + Math.log(rng.float(1.5, 4)), a * 1.3).to(rng.float(20, 60) * MIN, lnNow, a * 0.2);
  setTail(s, b, -0.005, 10 * MIN);
  s.dangerAt = now + tPeak;
}

/**
 * Extra attention of about `x` trades/s (scaled by the chain's activity), with
 * diminishing returns while the token is already buzzing.
 */
export function addBump(s: TokenSim, x: number): void {
  s.bump += (x * s.act) / (1 + s.bump / s.act);
}

/**
 * Re-anchor a fresh plan to the market cap left by the launch-block allocations:
 * the run-up never sits below it (the fade may) and a rug waits for real inflow on top.
 */
export function anchorLaunch(s: TokenSim, rng: Rng, lnAfterLaunch: number, gradLn: number): void {
  let peak = 1;
  for (let i = 1; i < s.path.length; i += 3) if (s.path[i] > s.path[peak]) peak = i;
  for (let i = 1; i <= peak; i += 3) s.path[i] = Math.max(s.path[i], lnAfterLaunch);
  if (s.eventKind === 'rug') s.triggerLn = Math.min(Math.max(s.triggerLn, lnAfterLaunch + Math.log(rng.float(1.3, 2.2))), gradLn - 0.1);
  s.emaFast = s.emaSlow = lnAfterLaunch;
}

function setTail(s: TokenSim, b: PathBuilder, drift: number, fadeMs: number): void {
  s.path = b.pts;
  s.drift = drift;
  s.fadeMs = fadeMs;
}

function setEvent(s: TokenSim, kind: FateEvent, at: number): void {
  s.eventKind = kind;
  s.eventAt = at;
}
