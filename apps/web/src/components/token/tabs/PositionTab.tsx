// The viewer's position in this token: live PnL card, quick sells, a PnL
// share card and the account's fills on this token.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, type FeedItem, type TokenDetail, type TokenPositionRow } from '@trenchscope/shared';
import { LogIn, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Age, Compact, Native, Pct, Price, StatTile, Usd } from '@/components/common';
import { SharePnlButton, shareDataFromPosition } from '@/components/share';
import { Button, DataTable, EmptyState, ErrorState, Skeleton, type Column } from '@/components/ui';
import { serverNow } from '@/hooks/useNow';
import { useTradeSettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { api } from '@/lib/api';
import { requireAuth, useSession } from '@/store/session';
import { tokenKeys } from '../queries';
import { useTokenUi } from '../store';

function useTokenFills(token: TokenDetail) {
  const signedIn = useSession((s) => !!s.token);
  return useQuery({
    queryKey: tokenKeys.fills(token.chain, token.address),
    queryFn: async () => (await api.portfolioActivity({ chain: token.chain, limit: 200 })).filter((f) => f.trade.token === token.address),
    enabled: signedIn,
    staleTime: 5_000,
    retry: 1,
  });
}

export function PositionTab({ token, position, loading, error, onRetry, maxHeight }: { token: TokenDetail; position: TokenPositionRow | null; loading: boolean; error: unknown; onRetry: () => void; maxHeight: number | string }) {
  const signedIn = useSession((s) => !!s.token);
  const fills = useTokenFills(token);
  const trade = useTradeSettings(token.chain);
  const { swap, pending } = useSwap();

  const columns = useMemo<Column<FeedItem>[]>(
    () => [
      { key: 'age', header: 'Age', width: 70, render: (f) => <Age ts={f.trade.timestamp} suffix=" ago" className="text-muted" /> },
      {
        key: 'type',
        header: 'Type',
        render: (f) => (
          <span className={clsx('text-xs font-semibold', f.trade.side === 'buy' ? 'text-up' : 'text-down')}>
            {f.trade.side === 'buy' ? (f.isFirstBuy ? 'First buy' : 'Buy') : f.isClose ? 'Sell all' : 'Sell'}
          </span>
        ),
      },
      { key: 'native', header: 'Native', align: 'right', render: (f) => <Native value={f.trade.nativeAmount} chain={token.chain} /> },
      { key: 'usd', header: 'USD', align: 'right', render: (f) => <Usd value={f.trade.usdAmount} /> },
      { key: 'amount', header: 'Amount', align: 'right', render: (f) => <Compact value={f.trade.tokenAmount} /> },
      { key: 'price', header: 'Price', align: 'right', render: (f) => <Price value={f.trade.priceUsd} /> },
      { key: 'mc', header: 'MC', align: 'right', hideBelow: 'md', render: (f) => <Usd value={f.trade.marketCapUsd} className="text-muted" /> },
      {
        key: 'pnl',
        header: 'Realized',
        align: 'right',
        render: (f) => (f.trade.realizedPnlUsd !== null ? <Usd value={f.trade.realizedPnlUsd} colored signed /> : <span className="text-faint">—</span>),
      },
    ],
    [token.chain],
  );

  if (!signedIn) {
    return (
      <EmptyState
        icon={<Wallet size={18} />}
        title="Track your position here"
        description={`Paper trade ${token.symbol} to see your balance, average entry and live PnL.`}
        action={
          <span className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="sm" onClick={() => useSession.getState().promptAuth(true, 'quick')}>
              Start paper trading
            </Button>
            <Button variant="outline" size="sm" icon={<LogIn size={13} />} onClick={() => useSession.getState().promptAuth(true, 'login')}>
              Log in
            </Button>
          </span>
        }
      />
    );
  }

  if (error && !position) return <ErrorState compact error={error} onRetry={onRetry} />;

  const p = position;
  const held = p?.balance ?? 0;
  const value = held * token.priceUsd;
  const unrealized = held > 0 && p ? value - p.costBasisUsd : 0;
  const total = (p?.realizedPnlUsd ?? 0) + unrealized;
  const totalRate = p && p.boughtUsd > 0 ? total / p.boughtUsd : null;

  const sell = (pct: number) =>
    requireAuth(() => {
      void swap({ chain: token.chain, token: token.address, side: 'sell', amount: pct, amountKind: 'percent', presetId: trade.activeSellPreset }, { symbol: token.symbol });
    });

  return (
    <div className="flex min-w-0 flex-col gap-3 p-2.5">
      {loading && !p ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : !p ? (
        <EmptyState
          compact
          icon={<Wallet size={16} />}
          title={`No ${token.symbol} position`}
          description="Buy from the trade panel — your entry, PnL and fills show up here."
          action={
            <Button size="sm" variant="buy" onClick={() => useTokenUi.getState().openTrade('buy')}>
              Buy {token.symbol}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Balance" value={<Compact value={held} suffix={` ${token.symbol}`} />} sub={<Usd value={value} />} />
            <StatTile label="Avg buy" value={p.avgBuyPriceUsd > 0 ? <Price value={p.avgBuyPriceUsd} /> : '—'} sub={<>Cost <Usd value={held > 0 ? p.costBasisUsd : 0} /></>} />
            <StatTile label="Unrealized" value={<Usd value={unrealized} colored signed />} sub={p.costBasisUsd > 0 && held > 0 ? <Pct value={unrealized / p.costBasisUsd} /> : '—'} />
            <StatTile label="Realized" value={<Usd value={p.realizedPnlUsd} colored signed />} sub={<>Sold <Usd value={p.soldUsd} /></>} />
            <StatTile label="Total PnL" value={<Usd value={total} colored signed />} sub={totalRate !== null ? <Pct value={totalRate} /> : '—'} />
            <StatTile label="Trades" value={`${p.buys} B / ${p.sells} S`} sub={p.firstBuyAt ? <>Held {formatDuration(p.holdSeconds)}</> : '—'} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {held > 0 && (
              <>
                <span className="text-xs text-muted">Quick sell</span>
                {trade.quickSellPercents.map((pct) => (
                  <Button key={pct} size="xs" variant="sell" disabled={pending} onClick={() => sell(pct)}>
                    {pct}%
                  </Button>
                ))}
              </>
            )}
            <SharePnlButton variant="button" getData={() => shareDataFromPosition(p, token, null, serverNow())} className="ml-auto" />
          </div>
        </>
      )}
      <div className="min-w-0 overflow-hidden rounded border border-line">
        <h4 className="table-head border-b border-line px-3 py-1.5">Your fills</h4>
        {fills.isError ? (
          <ErrorState compact error={fills.error} onRetry={() => void fills.refetch()} />
        ) : (
          <DataTable
            aria-label="Your fills"
            columns={columns}
            rows={fills.data ?? []}
            rowKey={(f) => f.trade.id}
            loading={fills.isPending}
            skeletonRows={3}
            compact
            maxHeight={maxHeight}
            minWidth={640}
            empty={<EmptyState compact title="No fills yet" description={`Your ${token.symbol} trades appear here.`} />}
          />
        )}
      </div>
    </div>
  );
}
