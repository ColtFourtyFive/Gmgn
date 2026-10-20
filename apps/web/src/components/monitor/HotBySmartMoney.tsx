// "Hot by smart money": tokens bought by at least two distinct smart wallets
// within the last 30 minutes, aggregated client-side from the smart feed.
// The feed's REST snapshot only reaches back a few minutes on a busy chain
// (its newest 200 smart trades); live pushes extend it while the page stays
// open, so the panel names the window it actually covers (hotWindowMs).

import { memo, useMemo } from 'react';
import { shortAddress, type ChainId, type FeedItem, type TokenRef } from '@trenchscope/shared';
import { Flame } from 'lucide-react';
import { Age, TokenLink, Usd, WalletAvatar } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { EmptyState, ErrorState, Panel, Skeleton, Tooltip } from '@/components/ui';
import { useNow } from '@/hooks';
import { useLiveFeed } from './useLiveFeed';

export const HOT_WINDOW_MS = 30 * 60_000;
export const HOT_MIN_WALLETS = 2;
const HOT_MAX = 6;
/** REST snapshot size of the smart feed (the API's maximum). */
const HOT_FEED_LIMIT = 200;
/** Smart trades kept so live pushes can fill the 30-minute window (a busy chain makes ~45 a minute). */
const HOT_FEED_CAP = 2000;

export interface HotToken {
  token: TokenRef;
  wallets: string[];
  buyUsd: number;
  buys: number;
  lastAt: number;
}

/** Group smart buys of the last 30 minutes by token; keep tokens with >= 2 distinct wallets. */
export function aggregateHot(items: FeedItem[], refs: Map<string, TokenRef>, now: number): HotToken[] {
  const since = now - HOT_WINDOW_MS;
  const map = new Map<string, HotToken>();
  for (const it of items) {
    const t = it.trade;
    if (t.side !== 'buy' || t.timestamp < since || !t.walletTags.includes('smart')) continue;
    let h = map.get(t.token);
    if (!h) {
      h = { token: refs.get(t.token) ?? it.token, wallets: [], buyUsd: 0, buys: 0, lastAt: 0 };
      map.set(t.token, h);
    }
    if (!h.wallets.includes(t.wallet)) h.wallets.push(t.wallet);
    h.buyUsd += t.usdAmount;
    h.buys += 1;
    h.lastAt = Math.max(h.lastAt, t.timestamp);
  }
  return [...map.values()]
    .filter((h) => h.wallets.length >= HOT_MIN_WALLETS)
    .sort((a, b) => b.wallets.length - a.wallets.length || b.buyUsd - a.buyUsd)
    .slice(0, HOT_MAX);
}

/**
 * How far back `items` (newest first) is complete, capped at HOT_WINDOW_MS.
 * Fewer items than the REST snapshot size means the server sent every smart
 * trade it holds (the whole window); otherwise the oldest item bounds it.
 */
export function hotWindowMs(items: FeedItem[], snapshotSize: number, now: number): number {
  if (items.length < snapshotSize) return HOT_WINDOW_MS;
  return Math.max(0, Math.min(HOT_WINDOW_MS, now - items[items.length - 1].trade.timestamp));
}

/** Window label: "30m", or the shorter span the feed covers ("last 4m"). */
export function hotWindowLabel(ms: number): { short: string; long: string } {
  if (ms >= HOT_WINDOW_MS - 30_000) return { short: '30m', long: 'the last 30 minutes' };
  const m = Math.max(1, Math.floor(ms / 60_000));
  return { short: `last ${m}m`, long: `the last ${m} minute${m === 1 ? '' : 's'}` };
}

/** Avatars of the smart wallets that bought (an image whose name lists them). */
export function WalletStack({ wallets }: { wallets: string[] }) {
  const shown = wallets.slice(0, 4);
  const list = wallets.map((w) => shortAddress(w)).join(', ');
  return (
    <Tooltip content={list}>
      <span className="flex items-center -space-x-1.5" tabIndex={0} role="img" aria-label={`${wallets.length} smart wallets: ${list}`}>
        {shown.map((w) => (
          <WalletAvatar key={w} seed={w} size={16} className="ring-2 ring-panel" />
        ))}
      </span>
    </Tooltip>
  );
}

export interface HotBySmartMoneyProps {
  chain: ChainId;
  buyAmount: number;
  className?: string;
}

export const HotBySmartMoney = memo(function HotBySmartMoney({ chain, buyAmount, className }: HotBySmartMoneyProps) {
  const feed = useLiveFeed({ chain, kind: 'smart', limit: HOT_FEED_LIMIT, cap: HOT_FEED_CAP });
  const now = useNow();
  const bucket = Math.floor(now / 10_000);
  const hot = useMemo(
    () => aggregateHot(feed.items, feed.tokens, bucket * 10_000 + 10_000),
    // Re-aggregate on new trades and every 10s as buys age out.
    [feed.items, feed.tokens, bucket],
  );
  const span = hotWindowLabel(hotWindowMs(feed.items, HOT_FEED_LIMIT, bucket * 10_000 + 10_000));

  return (
    <Panel
      title="Hot by smart money"
      subtitle={`2+ smart wallets · ${span.short}`}
      icon={<Flame size={14} className="text-dev" />}
      padded={false}
      className={className}
    >
      {feed.error ? (
        <ErrorState compact error={feed.error} onRetry={feed.retry} retrying={feed.retrying} />
      ) : feed.loading ? (
        <ul className="flex flex-col gap-3 p-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-2">
              <Skeleton circle width={24} height={24} />
              <Skeleton className="h-3 flex-1" />
            </li>
          ))}
        </ul>
      ) : hot.length === 0 ? (
        <EmptyState compact icon={<Flame size={16} />} title="Nothing hot yet" description={`No token was bought by two or more smart wallets in ${span.long}.`} />
      ) : (
        <ol className="flex flex-col">
          {hot.map((h, i) => (
            <li key={h.token.address} className="flex flex-col gap-1 border-b border-line/60 px-3 py-2 last:border-b-0 hover:bg-panel-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="num w-3 shrink-0 text-xs text-faint">{i + 1}</span>
                <TokenLink token={h.token} size={24} className="min-w-0 flex-1" />
                <span className="flex flex-col items-end leading-tight">
                  <span className="text-2xs text-muted">MC</span>
                  <Usd value={h.token.marketCapUsd} className="text-xs font-medium" />
                </span>
                <QuickBuyButton chain={chain} token={h.token.address} symbol={h.token.symbol} amount={buyAmount} />
              </span>
              <span className="flex min-w-0 items-center gap-2 pl-5 text-xs text-muted">
                <WalletStack wallets={h.wallets} />
                <span className="font-medium text-smart">{h.wallets.length} smart</span>
                <span className="text-faint">·</span>
                <Usd value={h.buyUsd} className="text-fg" />
                <span>bought</span>
                <Age ts={h.lastAt} suffix=" ago" className="ml-auto text-faint" />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
});
