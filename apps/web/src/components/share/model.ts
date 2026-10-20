// PnL share card data (pure): what a card shows for one position, built from
// a Position and the token's current price, plus the text formatting the
// canvas renderer uses.

import { formatDuration, formatUsd, RESOLUTION_SECONDS, type ChainId, type Position, type Resolution } from '@trenchscope/shared';

export interface ShareToken {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  logoSeed: string;
  logoGlyph: string;
  priceUsd: number;
  marketCapUsd: number;
}

export interface PnlShareData {
  chain: ChainId;
  token: Omit<ShareToken, 'priceUsd' | 'marketCapUsd' | 'chain'>;
  /** Realized + unrealized at the current price. */
  pnlUsd: number;
  /** PnL / total bought (null when nothing was bought). */
  pnlRate: number | null;
  boughtUsd: number;
  /** open: still holding (current MC); closed: sold out (average exit MC). */
  status: 'open' | 'closed';
  entryMcapUsd: number | null;
  exitMcapUsd: number | null;
  entryPriceUsd: number | null;
  holdSeconds: number;
  /** Whose trade it is (label or short address); null for the viewer's own. */
  trader: string | null;
  /** When the card was made (ms). */
  at: number;
}

/** Share card numbers for a position, re-priced at the token's current price. */
export function shareDataFromPosition(p: Position, token: ShareToken, trader: string | null, at: number): PnlShareData {
  const supply = token.priceUsd > 0 ? token.marketCapUsd / token.priceUsd : 0;
  const open = p.balance > 0;
  const unrealized = open ? p.balance * token.priceUsd - p.costBasisUsd : 0;
  const pnlUsd = p.realizedPnlUsd + unrealized;
  const mcap = (price: number) => (price > 0 && supply > 0 ? price * supply : null);
  return {
    chain: token.chain,
    token: { address: token.address, symbol: token.symbol, name: token.name, logoSeed: token.logoSeed, logoGlyph: token.logoGlyph },
    pnlUsd,
    pnlRate: p.boughtUsd > 0 ? pnlUsd / p.boughtUsd : null,
    boughtUsd: p.boughtUsd,
    status: open ? 'open' : 'closed',
    entryMcapUsd: mcap(p.avgBuyPriceUsd),
    exitMcapUsd: open ? token.marketCapUsd : mcap(p.avgSellPriceUsd),
    entryPriceUsd: p.avgBuyPriceUsd > 0 ? p.avgBuyPriceUsd : null,
    holdSeconds: p.holdSeconds,
    trader,
    at,
  };
}

/** "+$1,234.56" below $100K, compact above ("+$1.25M"); minus sign for losses. */
export function signedUsd(value: number): string {
  const abs = Math.abs(value);
  const body = abs < 100_000 ? `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatUsd(abs);
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${body}`;
}

/** The four stat cells under the PnL. */
export function shareStats(d: PnlShareData): { label: string; value: string }[] {
  return [
    { label: 'Entry MC', value: d.entryMcapUsd !== null ? formatUsd(d.entryMcapUsd) : '--' },
    { label: d.status === 'open' ? 'Current MC' : 'Exit MC', value: d.exitMcapUsd !== null ? formatUsd(d.exitMcapUsd) : '--' },
    { label: d.status === 'open' ? 'Holding for' : 'Held', value: formatDuration(d.holdSeconds) },
    { label: 'Invested', value: formatUsd(d.boughtUsd) },
  ];
}

export const SPARKLINE_POINTS = 120;
const SPARKLINE_RESOLUTIONS: Resolution[] = ['1s', '15s', '1m', '5m', '15m'];

/** The finest candle resolution whose SPARKLINE_POINTS candles cover the hold (1h candles past ~30 hours). */
export function sparklineResolution(holdSeconds: number): Resolution {
  return SPARKLINE_RESOLUTIONS.find((r) => RESOLUTION_SECONDS[r] * SPARKLINE_POINTS >= holdSeconds) ?? '1h';
}
