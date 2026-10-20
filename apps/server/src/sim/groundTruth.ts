// Ground-truth export (PRD SIM-28, AN-80): the simulator's hidden truth for a
// run (wallet archetypes and roles, token fates and outcomes, true launch
// cohorts) next to what analytics derived from observable data, plus a
// precision / recall report of the labels, the rug-risk AUC, the safety-score
// separation and smart-buy signal precision against the base rate.
//
// Test and tooling only: scripts/ground-truth.ts and the tests import this;
// nothing in the HTTP app does, so hidden state never reaches clients.

import { CHAIN_IDS, RESOLUTION_SECONDS, type ChainId, type WalletTag } from '@trenchscope/shared';
import type { Analytics } from '../analytics';
import type { AppContext } from '../context';
import { isBadFate, simOf } from './behaviors/fate';
import { memOf } from './behaviors/roster';
import type { MarketSim } from './market';
import { SCENARIOS, type ScenarioId } from './scenarios';
import type { Archetype, TokenFate, TokenState } from './world';

export interface LabelScore {
  tp: number;
  fp: number;
  fn: number;
  /** tp / (tp + fp); null without any prediction. */
  precision: number | null;
  /** tp / (tp + fn); null without any positive. */
  recall: number | null;
}

export interface GroundTruthWallet {
  chain: ChainId;
  address: string;
  archetype: Archetype;
  /** Market-sim role (funder, serialDev, crew, phisher, ...), null for account wallets. */
  role: string | null;
  label: string | null;
  /** Platform tags analytics assigned (observable classification). */
  tags: WalletTag[];
  fundedBy: string | null;
  traded: boolean;
}

export interface GroundTruthToken {
  chain: ChainId;
  address: string;
  symbol: string;
  launchpad: string;
  createdAt: number;
  status: TokenState['status'];
  fate: TokenFate;
  /** Post-curve plan: curve (never graduated), fizzle, run, moon. */
  outcome: string;
  rugged: boolean;
  dumped: boolean;
  cto: boolean;
  honeypot: boolean;
  tradeCount: number;
  marketCapUsd: number;
  athMarketCapUsd: number;
  /** Analytics' read: rug ratio and safety score. */
  rugRatio: number | null;
  safetyScore: number | null;
  /** True launch cohorts (set by the simulator). */
  truth: { devTeam: string[]; bundlers: string[]; insiders: string[]; snipers: string[] };
  /** Cohorts analytics derived from trades, blocks and funding links. */
  detected: { bundlers: string[]; insiders: string[]; snipers: string[] };
}

export interface GroundTruthReport {
  /** Platform tags vs archetype, over wallets that traded, per chain and 'all'. */
  walletTags: Record<string, Record<ChainId | 'all', LabelScore>>;
  /** Token-relative cohorts (token, wallet pairs): detected vs true, per chain and 'all'. */
  tokenCohorts: Record<'bundler' | 'insider' | 'sniper', Record<ChainId | 'all', LabelScore>>;
  /** dev_team is read from the ledger's dev-team set, not derived: no score. */
  devTeam: 'not derived';
  /** Rug ratio AUC: bad fates (rug, slow rug, pump & dump) vs the rest, tokens with >= 10 trades. */
  rugRiskAuc: Record<ChainId | 'all', number | null>;
  /** Median safety score of rugs (rug / slow rug) vs runners and moons, and the gap. */
  safety: { rugMedian: number | null; organicMedian: number | null; separation: number | null };
  /** smart_buy signals followed by +50% market cap within 1h, vs the base rate of token-minutes. */
  smartBuy: { signals: number; hits: number; precision: number | null; baseRate: number | null; lift: number | null; horizonMin: number };
  /** Launch fates per chain. */
  fates: Record<ChainId, Partial<Record<TokenFate, number>>>;
  /** Market counters per chain (launches, migrations, rugs, CTOs, ...). */
  market: MarketSim['stats'];
}

export interface GroundTruthExport {
  meta: { seed: string; scenario: ScenarioId; minutes: number; worldNow: number; tokens: number; wallets: number; trades: number };
  scenario: (typeof SCENARIOS)[ScenarioId];
  wallets: GroundTruthWallet[];
  tokens: GroundTruthToken[];
  report: GroundTruthReport;
}

/** Wallet tag -> the archetype that is its ground truth. */
export const TAG_TRUTH: Partial<Record<WalletTag, Archetype>> = { smart: 'smart', sniper: 'sniper', bot: 'bot', sandwich: 'sandwich', whale: 'whale', fresh: 'fresh' };

const HIT_MULTIPLE = 1.5;
const HORIZON_MS = 60 * 60_000;
/** Base-rate sample: every Nth 1m candle of each token. */
const BASE_STRIDE = 5;

function score(c: { tp: number; fp: number; fn: number }): LabelScore {
  const r = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);
  return { tp: c.tp, fp: c.fp, fn: c.fn, precision: r(c.tp, c.tp + c.fp), recall: r(c.tp, c.tp + c.fn) };
}

function counters(): Record<ChainId | 'all', { tp: number; fp: number; fn: number }> {
  const out = { all: { tp: 0, fp: 0, fn: 0 } } as Record<ChainId | 'all', { tp: number; fp: number; fn: number }>;
  for (const c of CHAIN_IDS) out[c] = { tp: 0, fp: 0, fn: 0 };
  return out;
}

function count(c: Record<ChainId | 'all', { tp: number; fp: number; fn: number }>, chain: ChainId, predicted: boolean, actual: boolean): void {
  for (const k of [chain, 'all'] as const) {
    if (predicted && actual) c[k].tp++;
    else if (predicted) c[k].fp++;
    else if (actual) c[k].fn++;
  }
}

function scores(c: Record<ChainId | 'all', { tp: number; fp: number; fn: number }>): Record<ChainId | 'all', LabelScore> {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, score(v)])) as Record<ChainId | 'all', LabelScore>;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Probability that a random positive scores above a random negative (ties count half); null without both. */
export function auc(pos: number[], neg: number[]): number | null {
  if (pos.length === 0 || neg.length === 0) return null;
  const all = [...pos.map((v) => ({ v, p: 1 })), ...neg.map((v) => ({ v, p: 0 }))].sort((a, b) => a.v - b.v);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].v === all[i].v) j++;
    const rank = (i + j + 1) / 2; // average 1-based rank of the tie block
    for (let k = i; k < j; k++) if (all[k].p) rankSum += rank;
    i = j;
  }
  return Math.round(((rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length)) * 1000) / 1000;
}

/** Highest 1m candle high (USD price) in [from, to). */
function highBetween(t: TokenState, from: number, to: number): number {
  let hi = 0;
  const res = RESOLUTION_SECONDS['1m'] * 1000;
  for (const c of t.candles['1m']) {
    const at = c.time * 1000;
    if (at + res <= from || at >= to) continue;
    if (c.high > hi) hi = c.high;
  }
  return hi;
}

export function exportGroundTruth(ctx: AppContext, market: MarketSim, opts: { seed: string; minutes: number }): GroundTruthExport {
  const { world } = ctx;
  const analytics = ctx.analytics as Analytics;
  const now = world.now;

  const wallets: GroundTruthWallet[] = [];
  const tagCounts: Record<string, ReturnType<typeof counters>> = {};
  for (const tag of Object.keys(TAG_TRUTH)) tagCounts[tag] = counters();
  for (const w of world.wallets.values()) {
    const traded = w.positions.size + (w.pruned?.tokens ?? 0) > 0;
    const role = (memOf(w).role as string | undefined) ?? null;
    wallets.push({ chain: w.chain, address: w.address, archetype: w.archetype, role, label: w.label, tags: analytics.walletTags(w), fundedBy: w.fundedBy, traded });
    if (!traded || role === 'funder') continue;
    for (const [tag, arch] of Object.entries(TAG_TRUTH)) count(tagCounts[tag], w.chain, w.tags.has(tag as WalletTag), w.archetype === arch);
  }

  const tokens: GroundTruthToken[] = [];
  const cohort = { bundler: counters(), insider: counters(), sniper: counters() };
  const rugScores = {} as Record<ChainId | 'all', { pos: number[]; neg: number[] }>;
  for (const c of ['all', ...CHAIN_IDS] as const) rugScores[c] = { pos: [], neg: [] };
  const rugSafety: number[] = [];
  const organicSafety: number[] = [];
  const fates = {} as GroundTruthReport['fates'];
  for (const c of CHAIN_IDS) fates[c] = {};
  let baseHits = 0;
  let baseN = 0;

  for (const t of world.tokens.values()) {
    const s = simOf(t);
    const track = analytics.tokens.trackOf(t);
    let rugRatio: number | null = null;
    let safetyScore: number | null = null;
    if (t.tradeCount > 0) {
      const sec = analytics.tokenSummary(t).security;
      rugRatio = sec.rugRatio;
      safetyScore = sec.safety?.score ?? null;
    }
    const truth = { devTeam: [...t.devTeam], bundlers: [...t.bundlers], insiders: [...t.insiders], snipers: [...t.snipers] };
    const detected = { bundlers: [...track.bundlers], insiders: [...track.insiders], snipers: [...track.snipers] };
    tokens.push({
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      launchpad: t.launchpad,
      createdAt: t.createdAt,
      status: t.status,
      fate: t.fate,
      outcome: s?.outcome ?? 'curve',
      rugged: (s?.ruggedAt ?? 0) > 0,
      dumped: (s?.dumpedAt ?? 0) > 0,
      cto: t.cto,
      honeypot: t.isHoneypot === true,
      tradeCount: t.tradeCount,
      marketCapUsd: world.marketCapUsd(t),
      athMarketCapUsd: t.athMarketCapUsd,
      rugRatio,
      safetyScore,
      truth,
      detected,
    });
    fates[t.chain][t.fate] = (fates[t.chain][t.fate] ?? 0) + 1;

    // cohorts: (token, wallet) pairs over every trader of the token
    const pairs: [keyof typeof cohort, Set<string>, Set<string>][] = [
      ['bundler', t.bundlers, track.bundlers],
      ['insider', t.insiders, track.insiders],
      ['sniper', t.snipers, track.snipers],
    ];
    for (const [name, real, found] of pairs) for (const w of new Set([...real, ...found])) count(cohort[name], t.chain, found.has(w), real.has(w));

    if (rugRatio !== null && t.tradeCount >= 10) {
      const bucket = isBadFate(t.fate) ? 'pos' : 'neg';
      rugScores[t.chain][bucket].push(rugRatio);
      rugScores.all[bucket].push(rugRatio);
    }
    if (safetyScore !== null && t.tradeCount >= 10) {
      if (t.fate === 'rug' || t.fate === 'slow_rug') rugSafety.push(safetyScore);
      else if (t.fate === 'runner' || t.fate === 'moon') organicSafety.push(safetyScore);
    }

    // base rate: token-minutes followed by +50% within the hour (only minutes with a full hour after them)
    const candles = t.candles['1m'];
    for (let i = 0; i < candles.length; i += BASE_STRIDE) {
      const at = candles[i].time * 1000;
      if (at + HORIZON_MS > now || !(candles[i].close > 0)) continue;
      baseN++;
      if (highBetween(t, at + 60_000, at + HORIZON_MS) >= candles[i].close * HIT_MULTIPLE) baseHits++;
    }
  }

  // smart_buy signals with a full hour after them
  let signals = 0;
  let hits = 0;
  for (const c of CHAIN_IDS) {
    for (const sig of analytics.signals(c, { kind: 'smart_buy', limit: 500 })) {
      if (sig.createdAt + HORIZON_MS > now) continue;
      const t = world.tokens.get(sig.token.address);
      if (!t || !(sig.marketCapAtTrigger > 0)) continue;
      signals++;
      if (highBetween(t, sig.createdAt, sig.createdAt + HORIZON_MS) * t.totalSupply >= sig.marketCapAtTrigger * HIT_MULTIPLE) hits++;
    }
  }

  const rugMedian = median(rugSafety);
  const organicMedian = median(organicSafety);
  const precision = signals > 0 ? Math.round((hits / signals) * 1000) / 1000 : null;
  const baseRate = baseN > 0 ? Math.round((baseHits / baseN) * 1000) / 1000 : null;
  const scenario = market.scenario;
  return {
    meta: { seed: opts.seed, scenario: scenario.id, minutes: opts.minutes, worldNow: now, tokens: world.tokens.size, wallets: world.wallets.size, trades: world.tradeTotal },
    scenario,
    wallets,
    tokens,
    report: {
      walletTags: Object.fromEntries(Object.entries(tagCounts).map(([tag, c]) => [tag, scores(c)])),
      tokenCohorts: { bundler: scores(cohort.bundler), insider: scores(cohort.insider), sniper: scores(cohort.sniper) },
      devTeam: 'not derived',
      rugRiskAuc: Object.fromEntries(Object.entries(rugScores).map(([k, v]) => [k, auc(v.pos, v.neg)])) as Record<ChainId | 'all', number | null>,
      safety: { rugMedian, organicMedian, separation: rugMedian !== null && organicMedian !== null ? organicMedian - rugMedian : null },
      smartBuy: {
        signals,
        hits,
        precision,
        baseRate,
        lift: precision !== null && baseRate ? Math.round((precision / baseRate) * 100) / 100 : null,
        horizonMin: HORIZON_MS / 60_000,
      },
      fates,
      market: market.stats,
    },
  };
}
