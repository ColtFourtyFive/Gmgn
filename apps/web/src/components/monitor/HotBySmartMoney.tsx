// "Hot by smart money": tokens bought by at least two distinct smart wallets
// within the last 30 minutes, aggregated client-side from the smart feed.

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

function WalletStack({ wallets }: { wallets: string[] }) {
  const shown = wallets.slice(0, 4);
  return (
    <Tooltip content={wallets.map((w) => shortAddress(w)).join(', ')}>
      <span className="flex items-center -space-x-1.5" tabIndex={0} aria-label={`${wallets.length} smart wallets`}>
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
  const feed = useLiveFeed({ chain, kind: 'smart', limit: 200 });
  const now = useNow();
  const bucket = Math.floor(now / 10_000);
  const hot = useMemo(
    () => aggregateHot(feed.items, feed.tokens, bucket * 10_000 + 10_000),
    // Re-aggregate on new trades and every 10s as buys age out.
    [feed.items, feed.tokens, bucket],
  );

  return (
    <Panel
      title="Hot by smart money"
      subtitle="2+ smart wallets · 30m"
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
        <EmptyState compact icon={<Flame size={16} />} title="Nothing hot yet" description="No token was bought by two or more smart wallets in the last 30 minutes." />
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
