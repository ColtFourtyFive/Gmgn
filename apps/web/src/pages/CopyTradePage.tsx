import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAIN_IDS, CHAINS, shortAddress, type CopyTradeTask } from '@trenchscope/shared';
import { Plus, Repeat2, Trophy } from 'lucide-react';
import { AccountGate, ConfirmDialog, Note, accountKeys, isAddressFor, sameAddress, useSignedIn } from '@/components/account';
import { CopyTaskCard, useToggleCopyTask } from '@/components/account/copytrade/CopyTaskCard';
import { CopyTaskForm } from '@/components/account/copytrade/CopyTaskForm';
import { ChainIcon, Native, StatTile } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { Button, EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui';
import { useIsLive } from '@/hooks/useMode';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';

type DrawerState = { task: CopyTradeTask | null; target: string } | null;

export default function CopyTradePage() {
  const chain = useChain();
  const signedIn = useSignedIn();
  const live = useIsLive();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const tasks = useQuery({ queryKey: accountKeys.copyTasks, queryFn: api.copyTasks, enabled: signedIn, refetchInterval: 10_000 });

  // ?target=<address> (from wallet pages / leaderboard) opens the form prefilled, or the existing task for that wallet.
  const target = params.get('target');
  useEffect(() => {
    if (!target || !signedIn || !tasks.data) return;
    const existing = tasks.data.find((t) => t.chain === chain && sameAddress(chain, t.target, target));
    setDrawer({ task: existing ?? null, target: isAddressFor(chain, target) ? target : '' });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('target');
        return next;
      },
      { replace: true },
    );
  }, [target, signedIn, tasks.data, chain, setParams]);

  const openNew = () => requireAuth(() => setDrawer({ task: null, target: '' }));

  return (
    <Page className="max-w-[1680px]">
      <PageHeader
        title="Copy Trade"
        subtitle={`Mirror wallets automatically on ${CHAINS[chain].name}`}
        icon={<Repeat2 size={16} />}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            New copy task
          </Button>
        }
      />
      <AccountGate
        icon={<Repeat2 size={22} />}
        title="Copy the best traders"
        description={`Follow a wallet and every buy it makes is copied into your ${live ? '' : 'paper '}wallet with your own size, filters and exit rules.`}
        features={['Fixed size or a % of the target’s buy', 'Market-cap, liquidity and first-buy filters', 'Mirror sells or attach take-profit / stop-loss']}
      >
        <CopyTradeBody
          chain={chain}
          data={tasks.data}
          loading={tasks.isLoading}
          error={tasks.isError ? tasks.error : null}
          refetch={() => void tasks.refetch()}
          retrying={tasks.isFetching}
          onNew={openNew}
          onEdit={(task) => setDrawer({ task, target: task.target })}
        />
      </AccountGate>
      <CopyTaskForm open={drawer !== null} onClose={() => setDrawer(null)} chain={chain} task={drawer?.task ?? null} initialTarget={drawer?.target} />
    </Page>
  );
}

function CopyTradeBody({
  chain,
  data,
  loading,
  error,
  refetch,
  retrying,
  onNew,
  onEdit,
}: {
  chain: ReturnType<typeof useChain>;
  data: CopyTradeTask[] | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  retrying: boolean;
  onNew: () => void;
  onEdit: (task: CopyTradeTask) => void;
}) {
  const qc = useQueryClient();
  const { toggle, pending } = useToggleCopyTask();
  const [deleting, setDeleting] = useState<CopyTradeTask | null>(null);
  const live = useIsLive();
  const [deletePending, setDeletePending] = useState(false);

  const list = useMemo(() => (data ?? []).filter((t) => t.chain === chain).sort((a, b) => b.createdAt - a.createdAt), [data, chain]);
  const elsewhere = useMemo(() => CHAIN_IDS.filter((c) => c !== chain).map((c) => ({ chain: c, count: (data ?? []).filter((t) => t.chain === c).length })).filter((x) => x.count > 0), [data, chain]);

  const totals = useMemo(() => {
    const t = { active: 0, buys: 0, sells: 0, spent: 0, received: 0 };
    for (const task of list) {
      if (task.enabled) t.active++;
      t.buys += task.stats.buys;
      t.sells += task.stats.sells;
      t.spent += task.stats.spentNative;
      t.received += task.stats.receivedNative;
    }
    return t;
  }, [list]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.deleteCopyTask(deleting.id);
      qc.setQueryData<CopyTradeTask[]>(accountKeys.copyTasks, (l) => l?.filter((t) => t.id !== deleting.id));
      toast.info('Copy task deleted', deleting.label || shortAddress(deleting.target));
      setDeleting(null);
    } catch (err) {
      toast.error('Could not delete task', errorMessage(err));
    } finally {
      setDeletePending(false);
      void qc.invalidateQueries({ queryKey: accountKeys.copyTasks });
    }
  };

  if (error && !data) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={refetch} retrying={retrying} />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Repeat2 size={18} />}
            title={`No copy-trade tasks on ${CHAINS[chain].name} yet`}
            description="Find a consistently profitable wallet on the Leaderboard or Monitor, then mirror its buys with your own size, filters and exits."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={onNew}>
                  New copy task
                </Button>
                <Link to={routes.leaderboard(chain)} className="btn-outline btn-sm">
                  <Trophy size={13} /> Find wallets
                </Link>
              </div>
            }
          />
          <HowItWorks />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Active tasks" value={`${totals.active} / ${list.length}`} />
            <StatTile label="Copied buys / sells" value={<><span className="text-up">{totals.buys}</span> <span className="text-faint">/</span> <span className="text-down">{totals.sells}</span></>} />
            <StatTile label="Spent" value={<Native value={totals.spent} chain={chain} />} />
            <StatTile label="Received" value={<Native value={totals.received} chain={chain} />} />
            <StatTile
              label="PnL (realized)"
              hint="Received − spent across tasks. Open copied positions are not included."
              value={totals.spent > 0 ? <Native value={totals.received - totals.spent} chain={chain} colored signed /> : <span className="text-faint">—</span>}
              className="col-span-2 sm:col-span-1"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((task) => (
              <CopyTaskCard
                key={task.id}
                task={task}
                toggling={pending === task.id}
                onToggle={(on) => void toggle(task, on)}
                onEdit={() => onEdit(task)}
                onDelete={() => setDeleting(task)}
              />
            ))}
          </div>
        </>
      )}

      {elsewhere.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Also running:
          {elsewhere.map((e) => (
            <Link key={e.chain} to={routes.copytrade(e.chain)} className="chip bg-panel-3 text-fg hover:text-accent">
              <ChainIcon chain={e.chain} size={12} /> {e.count} on {CHAINS[e.chain].name}
            </Link>
          ))}
        </p>
      )}

      {list.length > 0 && (
        <Note tone="warn" title="Know the risks">
          Copied buys land after the target’s, usually at a worse price, and some wallets dump on their followers. Use per-token caps, market-cap filters and exit rules.
          {live ? 'Copied trades execute on Solana mainnet with real funds.' : 'All trades are paper trades on a simulated market.'}
        </Note>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={deletePending}
        danger
        title="Delete this copy task?"
        description="Copying stops immediately. Positions it already bought stay in your portfolio."
        confirmLabel="Delete task"
      />
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Pick a wallet', body: 'Paste an address or start from a wallet page. Smart-money and KOL tags help you choose.' },
    { title: 'Set your size and filters', body: 'Copy a fixed amount or a share of the target’s buy, cap spend per token, skip tokens outside your market-cap range.' },
    { title: 'Decide how to exit', body: 'Mirror the target’s sells, or attach take-profit / stop-loss rules to every copied buy.' },
  ];
  return (
    <ol className="mx-auto mb-4 grid max-w-3xl gap-2 px-1 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded border border-line bg-panel-2 p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-fg">
            <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-xs text-accent">{i + 1}</span>
            {s.title}
          </p>
          <p className="text-xs text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
