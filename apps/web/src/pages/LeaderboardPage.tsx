// Leaderboard (/:chain/leaderboard): top wallets by tag (smart money, KOLs,
// snipers, whales) over 1D/7D/30D. PnL, ROI, win rate, token and volume sorts
// run on the server in either direction (ascending asks for the bottom of the
// ranking); the other columns re-sort the loaded top 100.

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHAINS, formatDuration, formatInt, type ChainId, type LeaderboardRow, type WalletTag } from '@trenchscope/shared';
import { Brain, Copy, Crosshair, Megaphone, Search, Trophy, Users, Waves } from 'lucide-react';
import clsx from 'clsx';
import { Age, Pct, Usd } from '@/components/common';
import { useViewerTags } from '@/components/discovery/useViewerTags';
import { Page, PageHeader } from '@/components/layout';
import { Button, DataTable, EmptyState, ErrorState, Input, Panel, SegmentedControl, Tabs, Toggle, Tooltip, type Column, type SortState } from '@/components/ui';
import {
  CopyScoreMeter,
  distributionTotal,
  FollowButton,
  mergeTags,
  PNL_BUCKETS,
  StyleTitle,
  useLeaderboard,
  WalletCell,
  type LeaderboardPeriod,
  type LeaderboardSort,
  type LeaderboardTag,
} from '@/components/wallet';
import { useDebounce, useIsMobile, useLocalStorage } from '@/hooks';
import { routes, useChain } from '@/lib/chain';

const TAG_TABS: { value: LeaderboardTag; label: string; icon: ReactNode; hint: string }[] = [
  { value: 'smart', label: 'Smart Money', icon: <Brain size={14} />, hint: 'Wallets with a proven record of early, profitable entries' },
  { value: 'kol', label: 'KOL', icon: <Megaphone size={14} />, hint: 'Publicly known influencer wallets' },
  { value: 'sniper', label: 'Snipers', icon: <Crosshair size={14} />, hint: 'Wallets that buy in the first blocks after launch' },
  { value: 'whale', label: 'Whales', icon: <Waves size={14} />, hint: 'Large balances or large average buys' },
  { value: 'all', label: 'All', icon: <Users size={14} />, hint: 'Every tracked active wallet' },
];

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
];

/** Column → server sort key (other columns sort the loaded rows client-side). */
const SERVER_SORT: Record<string, LeaderboardSort> = { pnl: 'pnl', roi: 'pnlRate', winRate: 'winRate', tokens: 'tokens', volume: 'volume' };
const DEFAULT_SORT: SortState = { key: 'pnl', dir: 'desc' };

function validSort(s: unknown): SortState {
  const v = s as Partial<SortState> | null;
  return v && typeof v.key === 'string' && (v.dir === 'asc' || v.dir === 'desc') ? { key: v.key, dir: v.dir } : DEFAULT_SORT;
}

const MEDAL = ['text-accent', 'text-muted', 'text-dev'];

/** Tiny stacked bar of the five PnL buckets. */
function DistBar({ row }: { row: LeaderboardRow }) {
  const d = row.stats.distribution;
  const total = distributionTotal(d);
  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          {PNL_BUCKETS.map((b) => (
            <span key={b.key} className="flex justify-between gap-4">
              <span className={b.tone === 'up' ? 'text-up' : 'text-down'}>{b.label}</span>
              <span className="num">{d[b.key]}</span>
            </span>
          ))}
        </span>
      }
    >
      <span className="flex h-2 w-[88px] overflow-hidden rounded-full bg-panel-3" tabIndex={0} aria-label="PnL distribution">
        {total > 0 &&
          PNL_BUCKETS.map((b) =>
            d[b.key] > 0 ? <span key={b.key} style={{ width: `${(d[b.key] / total) * 100}%`, backgroundColor: `rgb(var(--${b.tone}) / ${0.3 + 0.7 * b.strength})` }} /> : null,
          )}
      </span>
    </Tooltip>
  );
}

interface ColumnDeps {
  chain: ChainId;
  viewerTags: (address: string) => WalletTag[];
  onCopy: (address: string) => void;
}

function leaderboardColumns({ chain, viewerTags, onCopy }: ColumnDeps): Column<LeaderboardRow>[] {
  return [
    {
      key: 'wallet',
      header: 'Wallet',
      sticky: true,
      width: 220,
      render: (r, i) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex w-5 shrink-0 justify-center">
            {i < 3 ? <Trophy size={14} className={MEDAL[i]} aria-label={`Rank ${i + 1}`} /> : <span className="num text-xs text-faint">{i + 1}</span>}
          </span>
          <WalletCell chain={chain} address={r.address} label={r.label} tags={mergeTags(r.tags, viewerTags(r.address))} />
        </span>
      ),
    },
    {
      key: 'pnl',
      header: 'Realized PnL',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stats.realizedPnlUsd,
      render: (r) => (
        <span className="flex flex-col items-end leading-tight">
          <Usd value={r.stats.realizedPnlUsd} colored signed className="font-semibold" />
          <span className="whitespace-nowrap text-2xs text-muted">
            Total <Usd value={r.stats.totalPnlUsd} colored signed />
          </span>
        </span>
      ),
    },
    {
      key: 'roi',
      header: 'ROI',
      title: 'Realized PnL / total cost',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stats.pnlRate,
      render: (r) => <Pct value={r.stats.totalCostUsd > 0 ? r.stats.pnlRate : null} className="font-medium" />,
    },
    {
      key: 'winRate',
      header: 'Win rate',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stats.winRate,
      render: (r) => (
        <span className="flex flex-col items-end leading-tight">
          <Pct value={r.stats.winRate} sign={false} colored={false} className="font-medium" />
          <span className="num text-2xs">
            <span className="text-up">{r.stats.wins}W</span> <span className="text-down">{r.stats.losses}L</span>
          </span>
        </span>
      ),
    },
    {
      key: 'tokens',
      header: 'Tokens',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stats.tokensTraded,
      render: (r) => (
        <span className="flex flex-col items-end leading-tight">
          <span className="num font-medium">{formatInt(r.stats.tokensTraded)}</span>
          <span className="num whitespace-nowrap text-2xs text-muted">
            <span className="text-up">{formatInt(r.stats.buys)}</span>/<span className="text-down">{formatInt(r.stats.sells)}</span> txs
          </span>
        </span>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stats.buyVolumeUsd + r.stats.sellVolumeUsd,
      render: (r) => (
        <span className="flex flex-col items-end leading-tight">
          <Usd value={r.stats.buyVolumeUsd + r.stats.sellVolumeUsd} />
          <span className="whitespace-nowrap text-2xs text-muted">
            avg buy <Usd value={r.stats.buys > 0 ? r.stats.avgBuyUsd : null} />
          </span>
        </span>
      ),
    },
    {
      key: 'hold',
      header: 'Avg hold',
      align: 'right',
      sortable: true,
      sortValue: (r) => (r.stats.tokensTraded > 0 ? r.stats.avgHoldSeconds : null),
      render: (r) => <span className="num text-muted">{r.stats.tokensTraded > 0 ? formatDuration(r.stats.avgHoldSeconds) : '--'}</span>,
    },
    { key: 'dist', header: 'Distribution', hideBelow: 'xl', render: (r) => <DistBar row={r} /> },
    { key: 'style', header: 'Style', render: (r) => <StyleTitle style={r.style} compact stacked /> },
    {
      key: 'copyScore',
      header: 'Copy score',
      title: 'Copy-trade suitability 0–100',
      sortable: true,
      sortValue: (r) => r.style.copyScore,
      width: 110,
      render: (r) => <CopyScoreMeter score={r.style.copyScore} label={false} />,
    },
    { key: 'last', header: 'Last active', align: 'right', sortable: true, sortValue: (r) => r.lastActiveAt, render: (r) => <Age ts={r.lastActiveAt} className="text-muted" /> },
    {
      key: 'followers',
      header: 'Followers',
      title: 'Trenchscope users following this wallet',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.followerCount,
      render: (r) => <span className="num text-muted">{formatInt(r.followerCount)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 96,
      render: (r) => (
        <span className="flex items-center justify-end gap-1">
          <FollowButton chain={chain} address={r.address} name={r.label} isFollowed={r.isFollowed} variant="icon" size="sm" />
          <Button size="xs" variant="soft" icon={<Copy size={12} />} onClick={() => onCopy(r.address)} aria-label={`Copy trade ${r.label ?? r.address}`}>
            Copy
          </Button>
        </span>
      ),
    },
  ];
}

export default function LeaderboardPage() {
  const chain = useChain();
  return <Leaderboard key={chain} chain={chain} />;
}

function Leaderboard({ chain }: { chain: ChainId }) {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [tag, setTag] = useLocalStorage<LeaderboardTag>('ts.leaderboard.tag', 'smart');
  const [period, setPeriod] = useLocalStorage<LeaderboardPeriod>('ts.leaderboard.period', '7d');
  const [storedSort, setSort] = useLocalStorage<SortState>('ts.leaderboard.sort', DEFAULT_SORT);
  const [hideThin, setHideThin] = useLocalStorage('ts.leaderboard.hideThin', false);
  const [search, setSearch] = useState('');
  const query = useDebounce(search.trim().toLowerCase(), 150);
  const sort = validSort(storedSort);
  const validTag = TAG_TABS.some((t) => t.value === tag) ? tag : 'smart';
  const validPeriod = PERIODS.some((p) => p.value === period) ? period : '7d';

  const serverSort = SERVER_SORT[sort.key];
  const q = useLeaderboard(chain, validTag, validPeriod, serverSort ?? 'pnl', serverSort ? sort.dir : 'desc');
  const viewerTags = useViewerTags(chain);
  const columns = useMemo(
    () => leaderboardColumns({ chain, viewerTags, onCopy: (address) => navigate(`${routes.copytrade(chain)}?target=${encodeURIComponent(address)}`) }),
    [chain, viewerTags, navigate],
  );

  const rows = useMemo(() => {
    let list = q.data ?? [];
    if (hideThin) list = list.filter((r) => r.stats.tokensTraded >= 3);
    if (query) list = list.filter((r) => r.address.toLowerCase().includes(query) || (r.label ?? '').toLowerCase().includes(query));
    return list;
  }, [q.data, hideThin, query]);

  const tab = TAG_TABS.find((t) => t.value === validTag)!;

  return (
    <Page className="flex max-w-[1800px] flex-col">
      <PageHeader
        title="Leaderboard"
        icon={<Trophy size={16} />}
        subtitle={`Top ${CHAINS[chain].name} wallets — ${tab.hint.toLowerCase()}`}
        actions={
          <>
            <SegmentedControl aria-label="Period" value={validPeriod} onChange={setPeriod} items={PERIODS} />
            {q.dataUpdatedAt > 0 && (
              <span className="hidden text-xs text-muted sm:inline" title="Rankings refresh about every 30 seconds">
                Updated <Age ts={q.dataUpdatedAt} suffix=" ago" />
              </span>
            )}
          </>
        }
      />
      <Panel padded={false} className="min-h-0">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line px-2 pt-1">
          <Tabs
            aria-label="Wallet category"
            value={validTag}
            onChange={setTag}
            className="min-w-0 flex-1 border-b-0"
            items={TAG_TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon, title: t.hint }))}
          />
          <div className="flex w-full items-center gap-3 pb-2 sm:w-auto">
            <Toggle size="sm" checked={hideThin} onChange={setHideThin} label="Hide < 3 tokens" />
            <Input
              size="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter wallets"
              aria-label="Filter wallets by name or address"
              prefix={<Search size={12} />}
              wrapperClassName="min-w-0 flex-1 sm:w-48 sm:flex-none"
            />
          </div>
        </div>
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : (
          <DataTable
            aria-label={`${tab.label} leaderboard`}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.address}
            sort={sort}
            onSortChange={setSort}
            loading={q.isLoading}
            skeletonRows={14}
            minWidth={1120}
            maxHeight={mobile ? undefined : 'calc(100dvh - 200px)'}
            className={clsx('transition-opacity', q.isPlaceholderData && 'opacity-60')}
            onRowClick={(r) => navigate(routes.wallet(chain, r.address))}
            empty={
              <EmptyState
                compact
                icon={<Trophy size={16} />}
                title={query ? 'No matching wallets' : 'No ranked wallets yet'}
                description={query ? 'Try another name or address.' : `No ${tab.label.toLowerCase()} wallets traded in this period yet. Try a longer period or another category.`}
              />
            }
          />
        )}
      </Panel>
    </Page>
  );
}
