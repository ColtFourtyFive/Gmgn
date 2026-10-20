// The viewer's position in this token: live PnL card, quick sells, a PnL
// share card and the account's fills on this token.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, type FeedItem, type Position, type PositionEvent, type TokenDetail, type Trade } from '@trenchscope/shared';
import { LogIn, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Age, Compact, Native, Pct, Price, StatTile, Usd } from '@/components/common';
import { SharePnlButton, shareDataFromPosition } from '@/components/share';
import { SellInitialsButton } from '@/components/trade/sellInitials';
import { useQuickTrade } from '@/components/trade/useQuickTrade';
import { Button, DataTable, EmptyState, ErrorState, Heading, Skeleton, type Column } from '@/components/ui';
import { PositionEventBadge } from '@/components/wallet';
import { serverNow } from '@/hooks/useNow';
import { useTradeSettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { tokenKeys, useOwnWallet } from '../queries';
import { useTokenUi } from '../store';

/** A fill row: the trade and what it did to the position. */
export type Fill = Pick<FeedItem, 'trade' | 'positionEvent' | 'isFirstBuy' | 'isClose'>;

/** Share of supply below which a balance is dust (the server's DUST_RATE). */
const DUST_RATE = 1e-7;

/** What a trade did to the maker's position, read off the trade as the server does (makerHoldRate = share held after it). */
export function positionEventOfTrade(t: Trade, totalSupply: number): PositionEvent {
  const after = t.makerHoldRate * totalSupply;
  const dust = totalSupply * DUST_RATE;
  if (t.side === 'buy') return after - t.tokenAmount <= dust ? 'open' : 'add';
  return after <= dust ? 'close' : 'reduce';
}

/**
 * The account's fills on this token, newest first: the token's own trade
 * history filtered to the viewer's wallet on the server (not a slice of the
 * account-wide log, where a busy account's older fills fell off), plus the
 * account's latest fills (those still list a fill the token's trade ring
 * dropped on a busy token).
 */
export function mergeFills(own: Trade[], recent: FeedItem[], token: Pick<TokenDetail, 'address' | 'totalSupply'>): Fill[] {
  const byId = new Map<string, Fill>();
  for (const t of own) {
    const event = positionEventOfTrade(t, token.totalSupply);
    byId.set(t.id, { trade: t, positionEvent: event, isFirstBuy: false, isClose: event === 'close' });
  }
  // The account log's items carry the server's own event and first-buy flag.
  for (const f of recent) if (f.trade.token === token.address) byId.set(f.trade.id, f);
  return [...byId.values()].sort((a, b) => b.trade.timestamp - a.trade.timestamp);
}

function useTokenFills(token: TokenDetail) {
  const wallet = useOwnWallet(token.chain);
  return useQuery({
    queryKey: tokenKeys.fills(token.chain, token.address),
    queryFn: async () => {
      const [own, recent] = await Promise.all([
        api.trades(token.chain, token.address, { wallet: wallet as string, limit: 500 }),
        api.portfolioActivity({ chain: token.chain, limit: 200 }),
      ]);
      return mergeFills(own, recent, token);
    },
    enabled: !!wallet,
    staleTime: 5_000,
    retry: 1,
  });
}

export function PositionTab({ token, position, loading, error, onRetry, maxHeight }: { token: TokenDetail; position: Position | null; loading: boolean; error: unknown; onRetry: () => void; maxHeight: number | string }) {
  const signedIn = useSession((s) => !!s.token);
  const fills = useTokenFills(token);
  const trade = useTradeSettings(token.chain);
  // Quick sells honor "Confirm trades" like every other one-click order.
  const quick = useQuickTrade(token.chain, token.address, token.symbol);

  const columns = useMemo<Column<Fill>[]>(
    () => [
      { key: 'age', header: 'Age', width: 70, render: (f) => <Age ts={f.trade.timestamp} suffix=" ago" className="text-muted" /> },
      {
        key: 'type',
        header: 'Type',
        render: (f) => (
          <span className="flex items-center gap-1">
            <span className={clsx('text-xs font-semibold', f.trade.side === 'buy' ? 'text-up' : 'text-down')}>{f.trade.side === 'buy' ? 'Buy' : 'Sell'}</span>
            <PositionEventBadge item={f} />
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
                  <Button key={pct} size="xs" variant="sell" disabled={quick.pending} onClick={() => quick.submit({ side: 'sell', percent: pct })}>
                    {pct}%
                  </Button>
                ))}
                <SellInitialsButton chain={token.chain} token={token.address} symbol={token.symbol} underWater={unrealized <= 0} />
              </>
            )}
            <SharePnlButton variant="button" getData={() => shareDataFromPosition(p, token, null, serverNow())} className="ml-auto" />
          </div>
          {quick.dialog}
        </>
      )}
      <div className="min-w-0 overflow-hidden rounded border border-line">
        <Heading className="table-head border-b border-line px-3 py-1.5">Your fills</Heading>
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
