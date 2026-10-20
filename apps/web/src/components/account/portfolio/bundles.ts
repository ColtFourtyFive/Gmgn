// Portfolio positions of launches with bundle wallets (TokenPositionRow
// .walletRole): the bundles' bags merge into their token's row so one row
// shows the whole exposure, with the per-wallet rows kept for the breakdown.
// Selling from that row moves the bundles too: they follow the launcher out
// (docs/API.md "Token launch").

import type { TokenPositionRow } from '@trenchscope/shared';

export interface PortfolioRow extends TokenPositionRow {
  /** Bundle-wallet rows merged into this one (empty for ordinary positions). */
  bundles: TokenPositionRow[];
}

const SUMMED = [
  'balance',
  'holdRate',
  'valueUsd',
  'costBasisUsd',
  'boughtUsd',
  'soldUsd',
  'boughtTokens',
  'soldTokens',
  'realizedPnlUsd',
  'unrealizedPnlUsd',
  'totalPnlUsd',
  'buys',
  'sells',
] as const;

const tokenKey = (r: TokenPositionRow) => `${r.chain}:${r.token}`;

/** Weighted mean of `value` by `weight` (0 without weight). */
function weighted(rows: TokenPositionRow[], value: (r: TokenPositionRow) => number, weight: (r: TokenPositionRow) => number): number {
  const w = rows.reduce((s, r) => s + weight(r), 0);
  return w > 0 ? rows.reduce((s, r) => s + value(r) * weight(r), 0) / w : 0;
}

/** One row of several wallets' positions in a token; the first row lends its identity (wallet, role, token info). */
function combine(rows: TokenPositionRow[], bundles: TokenPositionRow[]): PortfolioRow {
  const out: PortfolioRow = { ...rows[0], bundles };
  for (const k of SUMMED) out[k] = rows.reduce((s, r) => s + r[k], 0);
  out.avgBuyPriceUsd = weighted(rows, (r) => r.avgBuyPriceUsd, (r) => r.boughtTokens);
  out.avgSellPriceUsd = weighted(rows, (r) => r.avgSellPriceUsd, (r) => r.soldTokens);
  out.pnlRate = out.boughtUsd > 0 ? out.totalPnlUsd / out.boughtUsd : 0;
  const firstBuys = rows.map((r) => r.firstBuyAt).filter((t): t is number => t !== null);
  out.firstBuyAt = firstBuys.length ? Math.min(...firstBuys) : null;
  out.lastActiveAt = Math.max(...rows.map((r) => r.lastActiveAt));
  out.holdSeconds = Math.max(...rows.map((r) => r.holdSeconds));
  return out;
}

/**
 * One row per token: the main wallet's position with its bundles merged in.
 * Bundles whose launcher no longer holds keep a row of their own (walletRole 'bundle', not sellable from here).
 */
export function mergeBundleRows(rows: TokenPositionRow[]): PortfolioRow[] {
  const groups = new Map<string, { main: TokenPositionRow | null; bundles: TokenPositionRow[] }>();
  for (const r of rows) {
    const g = groups.get(tokenKey(r)) ?? { main: null, bundles: [] };
    if (r.walletRole === 'bundle') g.bundles.push(r);
    else g.main = r;
    groups.set(tokenKey(r), g);
  }
  return [...groups.values()].map(({ main, bundles }) =>
    bundles.length === 0 && main ? { ...main, bundles } : combine(main ? [main, ...bundles] : bundles, bundles),
  );
}
