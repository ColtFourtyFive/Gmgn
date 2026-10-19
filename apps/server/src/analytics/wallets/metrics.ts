// Pure wallet metrics: PnL distribution buckets, the 20-cell style title
// grid (frequency x realized return), the speed subtitle, style badges and
// the copy-tradeability score. Formulas follow GMGN's published wallet-style
// and wallet-score definitions; inputs come from observable trades only.

import { formatDuration, formatPercent, formatUsd, type PnlDistribution, type WalletStyle } from '@trenchscope/shared';

export const SEC = 1000;
export const MIN_MS = 60 * SEC;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Median of a list (0 for an empty list). Does not mutate the input. */
export function median(xs: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function emptyDistribution(): PnlDistribution {
  return { gt500: 0, p200to500: 0, p0to200: 0, n0to50: 0, lt50: 0 };
}

/**
 * Bucket of a per-token PnL ratio (pnl / cost): >500%, 200-500%, 0-200%,
 * -50%..0, < -50%. A ratio of exactly 0 sits on the lower edge of 0-200%.
 */
export function pnlBucket(ratio: number): keyof PnlDistribution {
  if (ratio > 5) return 'gt500';
  if (ratio >= 2) return 'p200to500';
  if (ratio >= 0) return 'p0to200';
  if (ratio >= -0.5) return 'n0to50';
  return 'lt50';
}

// ---------------------------------------------------------------------------
// Style title: frequency level (L1..L4) x realized-return level (P1..P5)
// ---------------------------------------------------------------------------

export type FreqLevel = 1 | 2 | 3 | 4;
export type PnlLevel = 1 | 2 | 3 | 4 | 5;

/** Trades per day: L1 < 1, L2 1..<10, L3 10..50 (inclusive), L4 > 50. */
export function freqLevel(perDay: number): FreqLevel {
  if (perDay < 1) return 1;
  if (perDay < 10) return 2;
  if (perDay <= 50) return 3;
  return 4;
}

export interface PnlLevelInput {
  /** realized / cost for the period. */
  pnl: number;
  tokens: number;
  winRate: number;
  /** Share of tokens below -50%. */
  lt50Share: number;
  realized: number;
  freq: FreqLevel;
}

/** First match wins (GMGN wallet-style, incl. the review variant for L4 grinders). */
export function pnlLevel(i: PnlLevelInput): PnlLevel {
  if (i.pnl > 0.5 && i.tokens >= 5 && (i.winRate >= 0.5 || i.lt50Share < 0.15)) return 5;
  if (i.pnl > 0.1 || (i.freq === 4 && i.pnl > 0.03 && i.realized > 0)) return 4;
  if (i.lt50Share >= 0.4 && i.realized < 0) return 1;
  if (Math.abs(i.pnl) <= 0.1) return 3;
  if (i.realized < 0 || i.pnl < 0) return 2;
  return 3;
}

/** Canonical English cell names (GMGN's EN names, title-cased). */
export const STYLE_GRID: Record<FreqLevel, Record<PnlLevel, string>> = {
  4: { 5: 'Money Printer', 4: 'Full-Auto Grinder', 3: 'Worn Down', 2: 'Gas Burner', 1: 'Self-Destruct' },
  3: { 5: 'Harvester', 4: 'Active Winner', 3: 'Spinning Top', 2: 'Fee Donor', 1: 'Bleeding Out' },
  2: { 5: 'Old Hunter', 4: 'Steady Hand', 3: 'Lukewarm', 2: 'Retail Loser', 1: 'Deep Underwater' },
  1: { 5: 'One-Shot', 4: 'Zen Winner', 3: 'Bystander', 2: 'Toe in the Water', 1: 'Wiped Out' },
};

/** Emoji per cell (for clients that want the GMGN-style pill). */
export const STYLE_EMOJI: Record<string, string> = {
  'Money Printer': '🖨️',
  'Full-Auto Grinder': '⚙️',
  'Worn Down': '🪫',
  'Gas Burner': '🔥',
  'Self-Destruct': '💥',
  Harvester: '🌾',
  'Active Winner': '⚔️',
  'Spinning Top': '🌀',
  'Fee Donor': '💸',
  'Bleeding Out': '🩸',
  'Old Hunter': '🦅',
  'Steady Hand': '📈',
  Lukewarm: '☕',
  'Retail Loser': '🐑',
  'Deep Underwater': '🕳️',
  'One-Shot': '🗡️',
  'Zen Winner': '🧘',
  Bystander: '👀',
  'Toe in the Water': '💧',
  'Wiped Out': '⚰️',
};

export interface TitleInput {
  trades: number;
  tokens: number;
  perDay: number;
  pnl: number;
  winRate: number;
  lt50: number;
  realized: number;
}

/** Style title; '' when there is no read (no trades or fewer than 5 tokens). */
export function styleTitle(i: TitleInput): string {
  if (i.trades <= 0 || i.tokens < 5) return '';
  const freq = freqLevel(i.perDay);
  const lvl = pnlLevel({
    pnl: i.pnl,
    tokens: i.tokens,
    winRate: i.winRate,
    lt50Share: i.lt50 / Math.max(1, i.tokens),
    realized: i.realized,
    freq,
  });
  return STYLE_GRID[freq][lvl];
}

// ---------------------------------------------------------------------------
// Speed subtitle: median copy window (first buy -> first sell per token)
// ---------------------------------------------------------------------------

export type SpeedClass = 'Flash Flipper' | 'Intraday' | 'Swing' | 'Long Hold';

export function speedClass(medianSec: number, n: number): SpeedClass | null {
  if (n < 3 || !(medianSec > 0)) return null;
  if (medianSec < 60) return 'Flash Flipper';
  if (medianSec < 86_400) return 'Intraday';
  if (medianSec < 604_800) return 'Swing';
  return 'Long Hold';
}

export function speedSubtitle(medianSec: number, n: number): string {
  const c = speedClass(medianSec, n);
  return c ? `${c} · ${formatDuration(medianSec)} median hold` : '';
}

// ---------------------------------------------------------------------------
// Activity-sample metrics (GMGN computes these from the recent activity rows)
// ---------------------------------------------------------------------------

export interface SampleTrade {
  side: 'buy' | 'sell';
  token: string;
  usd: number;
  /** Market cap at the trade (entry market cap for buys). */
  mcap: number;
  t: number;
}

export interface SampleMetrics {
  rows: number;
  spanMs: number;
  entryN: number;
  /** Share of buy entries below $100k market cap (null when no buys). */
  entryUnder100k: number | null;
  medianEntryMcap: number | null;
  /** Buy->sell pairs (sell following a buy of the same token). */
  pairs: number;
  /** Share of pairs where the sell landed within 5s of the preceding buy (null when no pairs). */
  fastFlipRate: number | null;
  tokensWithBuys: number;
  avgBuysPerToken: number;
  tokensWithSells: number;
  avgSellsPerToken: number;
  /** Top-3 tokens' share of buy USD (null with fewer than 5 tokens). */
  top3BuyShare: number | null;
  /** Best 6-hour UTC window share of rows, and its start hour. */
  hourPeakShare: number;
  hourPeakStart: number;
}

/** Metrics over a sample of trades given oldest first. */
export function sampleMetrics(rows: readonly SampleTrade[]): SampleMetrics {
  const entries: number[] = [];
  let under = 0;
  let pairs = 0;
  let fast = 0;
  const lastBuy = new Map<string, number>();
  const buysPer = new Map<string, number>();
  const sellsPer = new Map<string, number>();
  const buyUsd = new Map<string, number>();
  const hours = new Array<number>(24).fill(0);
  for (const r of rows) {
    hours[Math.floor((r.t % DAY_MS) / HOUR_MS)]++;
    if (r.side === 'buy') {
      entries.push(r.mcap);
      if (r.mcap < 100_000) under++;
      lastBuy.set(r.token, r.t);
      buysPer.set(r.token, (buysPer.get(r.token) ?? 0) + 1);
      buyUsd.set(r.token, (buyUsd.get(r.token) ?? 0) + r.usd);
    } else {
      sellsPer.set(r.token, (sellsPer.get(r.token) ?? 0) + 1);
      const b = lastBuy.get(r.token);
      if (b !== undefined) {
        pairs++;
        if (r.t - b <= 5 * SEC) fast++;
        lastBuy.delete(r.token);
      }
    }
  }
  let top3: number | null = null;
  if (buyUsd.size >= 5) {
    const vals = [...buyUsd.values()].sort((a, b) => b - a);
    const total = vals.reduce((a, b) => a + b, 0);
    top3 = total > 0 ? (vals[0] + vals[1] + vals[2]) / total : null;
  }
  let best = 0;
  let bestStart = 0;
  for (let h = 0; h < 24; h++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += hours[(h + k) % 24];
    if (s > best) {
      best = s;
      bestStart = h;
    }
  }
  const sum = (m: Map<string, number>) => {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  };
  return {
    rows: rows.length,
    spanMs: rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0,
    entryN: entries.length,
    entryUnder100k: entries.length ? under / entries.length : null,
    medianEntryMcap: entries.length ? median(entries) : null,
    pairs,
    fastFlipRate: pairs ? fast / pairs : null,
    tokensWithBuys: buysPer.size,
    avgBuysPerToken: buysPer.size ? sum(buysPer) / buysPer.size : 0,
    tokensWithSells: sellsPer.size,
    avgSellsPerToken: sellsPer.size ? sum(sellsPer) / sellsPer.size : 0,
    top3BuyShare: top3,
    hourPeakShare: rows.length ? best / rows.length : 0,
    hourPeakStart: bestStart,
  };
}

// ---------------------------------------------------------------------------
// Badges (closed vocabulary; each carries the value that triggered it)
// ---------------------------------------------------------------------------

export interface BadgeInput {
  buys: number;
  sells: number;
  tokens: number;
  winRate: number;
  gt500: number;
  totalCostUsd: number;
  sample: SampleMetrics;
  createdTokenCount: number;
  /** Identity label (KOL handle) if any. */
  label: string | null;
  isKol: boolean;
  walletAgeMs: number;
}

export type Badge = WalletStyle['badges'][number];

/**
 * Badges in display order (warnings first). Not modelled: "front-runner"
 * (needs per-trade gas, which trades do not carry) and the wash flag (no
 * wash_trader tag in this product).
 */
export function computeBadges(i: BadgeInput): Badge[] {
  const out: Badge[] = [];
  const trades = i.buys + i.sells;
  const s = i.sample;
  if (trades < 20) out.push({ key: 'low_sample', label: 'Insufficient sample', value: `${trades} trades` });
  if (i.isKol) out.push({ key: 'official', label: 'Official tag', value: i.label ? `KOL · ${i.label}` : 'KOL' });
  if (i.tokens >= 5 && i.winRate < 0.35 && i.gt500 >= 1)
    out.push({ key: 'lottery', label: 'Lottery', value: `win ${formatPercent(i.winRate, { sign: false, digits: 0 })} · ${i.gt500} token${i.gt500 > 1 ? 's' : ''} >5x` });
  if (s.entryN >= 5 && s.medianEntryMcap !== null && s.medianEntryMcap < 100_000)
    out.push({ key: 'sniper', label: 'Sniper', value: `median entry MC ${formatUsd(s.medianEntryMcap)} < $100K` });
  if (s.tokensWithBuys >= 3 && s.avgBuysPerToken >= 3)
    out.push({ key: 'scales_in', label: 'Scales in', value: `${s.avgBuysPerToken.toFixed(1)} buys per token` });
  if (s.tokensWithSells >= 5 && s.avgSellsPerToken >= 3)
    out.push({ key: 'scales_out', label: 'Scales out', value: `${s.avgSellsPerToken.toFixed(1)} sells per token` });
  if (s.top3BuyShare !== null && s.top3BuyShare >= 0.7)
    out.push({ key: 'concentrated', label: 'Concentrated bets', value: `top 3 tokens = ${formatPercent(s.top3BuyShare, { sign: false, digits: 0 })} of buys` });
  if (i.buys > 0 && (i.sells === 0 || i.buys / i.sells >= 3))
    out.push({ key: 'hoarding', label: 'Hoarding', value: `${i.buys} buys / ${i.sells} sells` });
  else if (i.sells > 0 && (i.buys === 0 || i.sells / i.buys >= 3))
    out.push({ key: 'distributing', label: 'Distributing', value: `${i.sells} sells / ${i.buys} buys` });
  if (s.rows >= 20 && s.spanMs >= 12 * HOUR_MS && s.hourPeakShare >= 0.7) {
    const end = (s.hourPeakStart + 6) % 24;
    const hh = (h: number) => String(h).padStart(2, '0');
    out.push({ key: 'fixed_hours', label: 'Fixed hours', value: `${formatPercent(s.hourPeakShare, { sign: false, digits: 0 })} of trades ${hh(s.hourPeakStart)}:00-${hh(end)}:00 UTC` });
  }
  if (i.buys > 0 && i.totalCostUsd / i.buys >= 10_000)
    out.push({ key: 'whale', label: 'Whale', value: `avg buy ${formatUsd(i.totalCostUsd / i.buys)}` });
  if (i.createdTokenCount > 0 && i.createdTokenCount > 0.5 * Math.max(1, i.tokens))
    out.push({ key: 'launcher', label: 'Launcher', value: `${i.createdTokenCount} token${i.createdTokenCount > 1 ? 's' : ''} created` });
  if (i.walletAgeMs < 30 * DAY_MS) {
    const days = i.walletAgeMs / DAY_MS;
    out.push({ key: 'new_wallet', label: 'New wallet', value: days < 1 ? `${Math.max(0, Math.floor(i.walletAgeMs / HOUR_MS))}h old` : `${Math.floor(days)}d old` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Copy-tradeability score (GMGN "COPY" weights)
// ---------------------------------------------------------------------------

export interface CopyScoreInput {
  realized: number;
  sells: number;
  trades: number;
  /** Median copy window (s); 0 when unknown. */
  holdSec: number;
  entryUnder100k: number | null;
  fastFlipRate: number | null;
  /** Self-dealing launcher: score x0.45. */
  launcher: boolean;
}

/**
 * COPY = 100 x (0.22 entry + 0.22 profit + 0.20 hold + 0.18 feasible + 0.18 edge)
 *   entry    = clamp(0.12 + (1 - entryUnder100k))
 *   profit   = clamp((realized / sells) / 80)
 *   hold     = clamp((1 - 1.6 fastFlip) x clamp(holdSec / 172800 + 0.15))
 *   feasible = clamp(1 - trades / 2500)
 *   edge     = clamp(1 - 0.6 entryUnder100k - 0.6 fastFlip)
 */
export function copyScore(i: CopyScoreInput): number {
  if (i.trades <= 0) return 0;
  const eu = i.entryUnder100k ?? 0.5;
  const ff = i.fastFlipRate ?? 0;
  const entry = clamp01(0.12 + (1 - eu));
  const profit = clamp01(i.sells > 0 ? i.realized / i.sells / 80 : 0);
  const hold = clamp01((1 - ff * 1.6) * clamp01(i.holdSec / 172_800 + 0.15));
  const feasible = clamp01(1 - i.trades / 2500);
  const edge = clamp01(1 - 0.6 * eu - 0.6 * ff);
  let s = 100 * (0.22 * entry + 0.22 * profit + 0.2 * hold + 0.18 * feasible + 0.18 * edge);
  if (i.launcher) s *= 0.45;
  return Math.max(0, Math.min(100, Math.round(s)));
}
