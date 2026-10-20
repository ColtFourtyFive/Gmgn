// "Your launches": tokens the user's wallet created on the chain, with
// status, live curve progress, market cap and the hourly launch allowance.

import { memo } from 'react';
import { CHAINS, type ChainId } from '@trenchscope/shared';
import { LogIn, Rocket } from 'lucide-react';
import { Age, Compact, CurveProgress, TokenLink, Usd } from '@/components/common';
import { Badge, Button, DataTable, EmptyState, ErrorState, Panel, type Column } from '@/components/ui';
import { useOpenLink } from '@/hooks/useOpenLink';
import { routes } from '@/lib/chain';
import { useSession } from '@/store/session';
import { useLaunchesThisHour, useMyLaunches, type MyLaunch } from './queries';

const STATUS = {
  curve: { tone: 'accent', label: 'On curve' },
  migrating: { tone: 'warn', label: 'Migrating' },
  migrated: { tone: 'up', label: 'Graduated' },
} as const;

const mcapOf = (r: MyLaunch) => r.detail?.marketCapUsd ?? r.marketCapUsd;

const columns: Column<MyLaunch>[] = [
  {
    key: 'token',
    header: 'Token',
    sticky: true,
    width: 200,
    render: (r) => (
      <TokenLink
        token={{ ...r, launchpad: r.detail?.launchpad, progress: r.detail?.progress }}
        size={28}
        showName
        showLaunchpad
        showProgress={!!r.detail && r.detail.status !== 'migrated'}
      />
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (r.rugged ? <Badge tone="down">Rugged</Badge> : <Badge tone={STATUS[r.detail?.status ?? r.status].tone}>{STATUS[r.detail?.status ?? r.status].label}</Badge>),
  },
  {
    key: 'progress',
    header: 'Curve',
    width: 150,
    sortable: true,
    sortValue: (r) => r.detail?.progress ?? (r.status === 'migrated' ? 1 : null),
    render: (r) =>
      (r.detail?.status ?? r.status) === 'migrated' ? (
        <span className="text-xs text-up">Completed</span>
      ) : r.detail ? (
        <CurveProgress progress={r.detail.progress} className="w-full" />
      ) : (
        <span className="text-faint">--</span>
      ),
  },
  { key: 'mcap', header: 'Market cap', align: 'right', sortable: true, sortValue: mcapOf, render: (r) => <Usd value={mcapOf(r)} className="font-medium" /> },
  { key: 'ath', header: 'ATH MC', align: 'right', hideBelow: 'sm', sortable: true, sortValue: (r) => r.athMarketCapUsd, render: (r) => <Usd value={r.athMarketCapUsd} className="text-muted" /> },
  {
    key: 'holders',
    header: 'Holders',
    align: 'right',
    hideBelow: 'md',
    sortable: true,
    sortValue: (r) => r.detail?.holderCount ?? null,
    render: (r) => (r.detail ? <Compact value={r.detail.holderCount} /> : <span className="text-faint">--</span>),
  },
  { key: 'age', header: 'Launched', align: 'right', sortable: true, sortValue: (r) => r.createdAt, render: (r) => <Age ts={r.createdAt} suffix=" ago" className="text-muted" /> },
];

export const MyLaunches = memo(function MyLaunches({ chain, launchesPerHour, className }: { chain: ChainId; launchesPerHour: number; className?: string }) {
  const openLink = useOpenLink();
  const signedIn = useSession((s) => !!s.token);
  const { rows, query } = useMyLaunches(chain);
  const thisHour = useLaunchesThisHour(launchesPerHour);
  const left = thisHour === undefined ? null : Math.max(0, launchesPerHour - thisHour);

  return (
    <Panel
      title="Your launches"
      subtitle={signedIn && rows ? `${rows.length} on ${CHAINS[chain].name}` : undefined}
      actions={
        signedIn && left !== null ? (
          <span className="num text-xs text-muted" title="The hourly limit counts your launches on every chain">
            {left} of {launchesPerHour} <span className="hidden sm:inline">launches </span>left this hour
          </span>
        ) : undefined
      }
      icon={<Rocket size={14} />}
      padded={false}
      className={className}
    >
      {!signedIn ? (
        <EmptyState
          compact
          icon={<Rocket size={16} />}
          title="Your tokens show up here"
          description="Sign in to launch, then follow each token’s curve, market cap and graduation."
          action={
            <Button size="sm" variant="outline" icon={<LogIn size={13} />} onClick={() => useSession.getState().promptAuth(true, 'login')}>
              Log in
            </Button>
          }
        />
      ) : query.isError && !rows ? (
        <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <DataTable
          aria-label="Your launches"
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => r.address}
          loading={!rows}
          skeletonRows={3}
          defaultSort={{ key: 'age', dir: 'desc' }}
          minWidth={720}
          maxHeight={480}
          onRowClick={(r, e) => openLink(routes.token(r.chain, r.address), e)}
          empty={<EmptyState compact icon={<Rocket size={16} />} title="No launches yet" description="Tokens you launch on this chain show up here with their curve progress." />}
        />
      )}
    </Panel>
  );
});
