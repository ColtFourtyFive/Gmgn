// Wallet activity: REST history (api.walletActivity) merged with the live
// `wallet:<chain>:<address>` trade stream. Live trades show instantly and are
// replaced by the server's FeedItems (token refs, position events) on the
// refetch they trigger.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { shortAddress, type ChainId, type FeedItem, type TokenRef, type Trade } from '@trenchscope/shared';
import { Activity } from 'lucide-react';
import clsx from 'clsx';
import { Age, Compact, Native, Price, TokenLink, Usd } from '@/components/common';
import { Badge, CopyButton, DataTable, EmptyState, ErrorState, SegmentedControl, type Column } from '@/components/ui';
import { useOpenLink } from '@/hooks/useOpenLink';
import { routes } from '@/lib/chain';
import { retainKeys } from '@/lib/retain';
import { realtime, useChannel } from '@/lib/ws';
import { type ActivityType, useWalletActivity } from './queries';
import { Multiple } from './Multiple';
import { PositionEventBadge } from './PositionEvent';

const LIVE_CAP = 100;
const REFRESH_THROTTLE_MS = 2500;

/** Minimal token ref for a live trade whose token the page has not seen yet. */
function fallbackRef(t: Trade): TokenRef {
  return {
    chain: t.chain,
    address: t.token,
    symbol: t.tokenSymbol,
    name: t.tokenSymbol,
    logoSeed: t.token,
    logoGlyph: '',
    priceUsd: t.priceUsd,
    marketCapUsd: t.marketCapUsd,
    liquidityUsd: 0,
    status: 'curve',
    launchpad: '',
    createdAt: t.timestamp,
    priceChange24h: 0,
  };
}

export interface WalletLive {
  /** Trades received since mount (newest first). */
  trades: Trade[];
  /** Ids of trades that arrived live (row highlight). */
  liveIds: Set<string>;
}

/**
 * Subscribe to a wallet's live trades. New trades refresh the profile,
 * holdings and activity queries (throttled), so stats follow in near realtime.
 */
export function useWalletLive(chain: ChainId, address: string, enabled = true): WalletLive {
  const qc = useQueryClient();
  const [trades, setTrades] = useState<Trade[]>([]);
  const liveIds = useRef(new Set<string>());
  /** Connection epoch whose subscription snapshot was handled (null before the first). */
  const snapshotEpoch = useRef<number | null>(null);
  /** Trade ids in the last subscription snapshot. */
  const snapshotIds = useRef(new Set<string>());
  const lastRefresh = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const refresh = useCallback(() => {
    const run = () => {
      lastRefresh.current = Date.now();
      for (const prefix of ['wallet-profile', 'wallet-holdings', 'wallet-activity']) void qc.invalidateQueries({ queryKey: [prefix, chain, address] });
    };
    const wait = REFRESH_THROTTLE_MS - (Date.now() - lastRefresh.current);
    clearTimeout(timer.current);
    // Small delay so the server's aggregates include the batch.
    timer.current = setTimeout(run, Math.max(400, wait));
  }, [qc, chain, address]);

  useChannel(enabled ? `wallet:${chain}:${address}` : null, null, (type, data) => {
    if (type !== 'trades' || !Array.isArray(data)) return;
    let batch = data as Trade[];
    // The first message after every (re)subscription is the server's snapshot of
    // recent trades. On mount the REST history covers it; after a reconnect only
    // the trades missed while offline are new.
    if (snapshotEpoch.current !== realtime.epoch) {
      const first = snapshotEpoch.current === null;
      const known = snapshotIds.current;
      snapshotEpoch.current = realtime.epoch;
      snapshotIds.current = new Set(batch.map((t) => t.id));
      batch = first ? [] : batch.filter((t) => !known.has(t.id) && !liveIds.current.has(t.id));
    }
    if (batch.length === 0) return;
    for (const t of batch) liveIds.current.add(t.id);
    setTrades((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const fresh = batch.filter((t) => !seen.has(t.id)).reverse();
      return fresh.length ? [...fresh, ...prev].slice(0, LIVE_CAP) : prev;
    });
    refresh();
  });

  // Only ids still listed (capped at LIVE_CAP) can need the highlight.
  useEffect(() => retainKeys(liveIds.current, new Set(trades.map((t) => t.id))), [trades]);

  return { trades, liveIds: liveIds.current };
}

const SIDE_FILTER: { value: ActivityType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buys' },
  { value: 'sell', label: 'Sells' },
];

const columns: Column<FeedItem>[] = [
  { key: 'time', header: 'Time', width: 64, render: (it) => <Age ts={it.trade.timestamp} className="text-muted" /> },
  {
    key: 'type',
    header: 'Type',
    width: 120,
    render: (it) => (
      <span className="flex flex-wrap items-center gap-1">
        <Badge tone={it.trade.side === 'buy' ? 'up' : 'down'}>{it.trade.side === 'buy' ? 'Buy' : 'Sell'}</Badge>
        <PositionEventBadge item={it} />
        {it.trade.isDev && <Badge tone="neutral">Dev</Badge>}
      </span>
    ),
  },
  { key: 'token', header: 'Token', width: 170, render: (it) => <TokenLink token={it.token} size={24} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: ({ trade: t }) => (
      <span className="flex flex-col items-end leading-tight">
        <Native value={t.nativeAmount} chain={t.chain} className={clsx('font-medium', t.side === 'buy' ? 'text-up' : 'text-down')} />
        <Usd value={t.usdAmount} className="text-2xs text-muted" />
      </span>
    ),
  },
  { key: 'qty', header: 'Tokens', align: 'right', hideBelow: 'md', render: ({ trade: t }) => <Compact value={t.tokenAmount} className="text-muted" /> },
  { key: 'price', header: 'Price', align: 'right', hideBelow: 'lg', render: ({ trade: t }) => <Price value={t.priceUsd} /> },
  {
    key: 'mcap',
    header: 'MC → now',
    title: 'Market cap at the trade, current market cap and the multiple since',
    align: 'right',
    render: ({ trade: t, token }) => (
      <span className="flex flex-col items-end leading-tight">
        <Usd value={t.marketCapUsd} />
        <span className="text-2xs text-muted">
          <Usd value={token.marketCapUsd} /> · <Multiple value={t.marketCapUsd > 0 ? token.marketCapUsd / t.marketCapUsd : null} />
        </span>
      </span>
    ),
  },
  {
    key: 'pnl',
    header: 'Realized',
    align: 'right',
    render: ({ trade: t }) => (t.realizedPnlUsd !== null ? <Usd value={t.realizedPnlUsd} colored signed /> : <span className="text-faint">--</span>),
  },
  {
    key: 'tx',
    header: 'Tx',
    align: 'right',
    hideBelow: 'xl',
    render: ({ trade: t }) => (
      <span className="inline-flex items-center gap-0.5">
        <span className="num font-mono text-2xs text-faint">{shortAddress(t.txHash, 4, 4)}</span>
        <CopyButton text={t.txHash} label="Copy transaction hash" size={11} />
      </span>
    ),
  },
];

export interface ActivityTabProps {
  chain: ChainId;
  address: string;
  live: WalletLive;
}

/** Buy/sell history with a type filter; live trades prepend in realtime. */
export const ActivityTab = memo(function ActivityTab({ chain, address, live }: ActivityTabProps) {
  const openLink = useOpenLink();
  const [type, setType] = useState<ActivityType>('all');
  const q = useWalletActivity(chain, address, type);

  const rows = useMemo(() => {
    const rest = q.data ?? [];
    const refs = new Map<string, TokenRef>();
    for (const it of rest) if (!refs.has(it.token.address)) refs.set(it.token.address, it.token);
    const known = new Set(rest.map((it) => it.trade.id));
    const newest = rest[0]?.trade.timestamp ?? 0;
    const extra: FeedItem[] = [];
    for (const t of live.trades) {
      if (known.has(t.id) || t.timestamp < newest) continue;
      if (type !== 'all' && t.side !== type) continue;
      extra.push({ trade: t, token: refs.get(t.token) ?? fallbackRef(t), isFirstBuy: false, isClose: false });
    }
    return extra.length ? [...extra, ...rest] : rest;
  }, [q.data, live.trades, type]);

  const liveIds = live.liveIds;
  const rowClassName = useCallback((it: FeedItem) => (liveIds.has(it.trade.id) ? 'animate-slide-in' : undefined), [liveIds]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <SegmentedControl size="sm" aria-label="Trade type" value={type} onChange={setType} items={SIDE_FILTER} />
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-up" aria-hidden />
          Live
        </span>
      </div>
      {q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />
      ) : (
        <DataTable
          aria-label="Wallet activity"
          columns={columns}
          rows={rows}
          rowKey={(it) => it.trade.id}
          rowClassName={rowClassName}
          loading={q.isLoading}
          minWidth={760}
          maxHeight={640}
          onRowClick={(it, e) => openLink(routes.token(chain, it.trade.token), e)}
          empty={<EmptyState compact icon={<Activity size={16} />} title="No activity" description={type === 'all' ? 'No trades by this wallet yet.' : `No ${type}s in the recent history.`} />}
        />
      )}
    </div>
  );
});
