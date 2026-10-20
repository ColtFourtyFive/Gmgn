import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAIN_IDS, CHAINS, type SniperKind, type SniperTask } from '@trenchscope/shared';
import { Crosshair, Flame, Plus } from 'lucide-react';
import { AccountGate, ConfirmDialog, Note, accountKeys, isAddressFor, useSignedIn } from '@/components/account';
import { SNIPER_KIND, SNIPER_KINDS } from '@/components/account/sniper/meta';
import { SniperTaskCard, useToggleSniperTask } from '@/components/account/sniper/SniperTaskCard';
import { SniperTaskForm } from '@/components/account/sniper/SniperTaskForm';
import { Age, ChainIcon, Native, StatTile } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { Button, EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';

type DrawerState = { task: SniperTask | null; initial?: { kind?: SniperKind; dev?: string } } | null;

export default function SniperPage() {
  const chain = useChain();
  const signedIn = useSignedIn();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const tasks = useQuery({ queryKey: accountKeys.sniperTasks, queryFn: api.sniperTasks, enabled: signedIn, refetchInterval: 10_000 });

  // ?dev=<address> (from a dev / wallet page) opens a prefilled "dev launch" sniper.
  const dev = params.get('dev');
  useEffect(() => {
    if (!dev || !signedIn) return;
    setDrawer({ task: null, initial: isAddressFor(chain, dev) ? { kind: 'dev_launch', dev } : undefined });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('dev');
        return next;
      },
      { replace: true },
    );
  }, [dev, signedIn, chain, setParams]);

  const openNew = (kind?: SniperKind) => requireAuth(() => setDrawer({ task: null, initial: kind ? { kind } : undefined }));

  return (
    <Page className="max-w-[1680px]">
      <PageHeader
        title="Sniper"
        subtitle={`Auto-buy launches and migrations on ${CHAINS[chain].name}`}
        icon={<Crosshair size={16} />}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openNew()}>
            New sniper
          </Button>
        }
      />
      <AccountGate
        icon={<Crosshair size={22} />}
        title="Be first into the next runner"
        description="Snipers watch every launch and migration in the simulated market and buy instantly when a token matches your rules."
        features={['New launches, curve migrations or specific dev wallets', 'Keyword, launchpad, socials and dev-holding filters', 'Automatic take-profit / stop-loss on every snipe']}
      >
        <SniperBody
          chain={chain}
          data={tasks.data}
          loading={tasks.isLoading}
          error={tasks.isError ? tasks.error : null}
          refetch={() => void tasks.refetch()}
          retrying={tasks.isFetching}
          onNew={openNew}
          onEdit={(task) => setDrawer({ task })}
        />
      </AccountGate>
      <SniperTaskForm open={drawer !== null} onClose={() => setDrawer(null)} chain={chain} task={drawer?.task ?? null} initial={drawer?.initial} />
    </Page>
  );
}

function SniperBody({
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
  data: SniperTask[] | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  retrying: boolean;
  onNew: (kind?: SniperKind) => void;
  onEdit: (task: SniperTask) => void;
}) {
  const qc = useQueryClient();
  const { toggle, pending } = useToggleSniperTask();
  const [deleting, setDeleting] = useState<SniperTask | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const list = useMemo(() => (data ?? []).filter((t) => t.chain === chain).sort((a, b) => b.createdAt - a.createdAt), [data, chain]);
  const elsewhere = useMemo(() => CHAIN_IDS.filter((c) => c !== chain).map((c) => ({ chain: c, count: (data ?? []).filter((t) => t.chain === c).length })).filter((x) => x.count > 0), [data, chain]);
  const totals = useMemo(() => {
    let armed = 0;
    let buys = 0;
    let committed = 0;
    let last: number | null = null;
    for (const t of list) {
      if (t.enabled) armed++;
      buys += t.buysDone;
      if (t.enabled) committed += t.buyAmount * Math.max(0, t.maxBuys - t.buysDone);
      if (t.lastTriggeredAt && (!last || t.lastTriggeredAt > last)) last = t.lastTriggeredAt;
    }
    return { armed, buys, committed, last };
  }, [list]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.deleteSniperTask(deleting.id);
      qc.setQueryData<SniperTask[]>(accountKeys.sniperTasks, (l) => l?.filter((t) => t.id !== deleting.id));
      toast.info('Sniper deleted', deleting.label || SNIPER_KIND[deleting.kind].label);
      setDeleting(null);
    } catch (err) {
      toast.error('Could not delete sniper', errorMessage(err));
    } finally {
      setDeletePending(false);
      void qc.invalidateQueries({ queryKey: accountKeys.sniperTasks });
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
            icon={<Crosshair size={18} />}
            title={`No snipers on ${CHAINS[chain].name} yet`}
            description="Pick what to snipe — every match is bought instantly with your preset, and exit orders are attached automatically."
          />
          <div className="mx-auto mb-4 grid max-w-3xl gap-2 px-1 sm:grid-cols-3">
            {SNIPER_KINDS.map((k) => {
              const M = SNIPER_KIND[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNew(k)}
                  className="flex flex-col items-start gap-1 rounded border border-line bg-panel-2 p-3 text-left transition-colors hover:border-accent/60 hover:bg-panel-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                    <M.icon size={14} className="text-accent" /> {M.label}
                  </span>
                  <span className="text-xs text-muted">{M.description}</span>
                </button>
              );
            })}
          </div>
          <p className="mb-4 text-center text-xs text-muted">
            Want to see what launches look like first?{' '}
            <Link to={routes.trenches(chain)} className="inline-flex items-center gap-1 text-accent hover:underline">
              <Flame size={12} /> Open the Trenches
            </Link>
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile label="Armed" value={`${totals.armed} / ${list.length}`} />
            <StatTile label="Snipes filled" value={totals.buys} />
            <StatTile label="Budget left" hint="Buy amount × remaining buys of armed snipers" value={<Native value={totals.committed} chain={chain} />} />
            <StatTile label="Last fired" value={totals.last ? <Age ts={totals.last} suffix=" ago" /> : <span className="text-faint">Never</span>} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((task) => (
              <SniperTaskCard
                key={task.id}
                task={task}
                toggling={pending === task.id}
                onToggle={(on) => void toggle(task, on)}
                onEdit={() => onEdit(task)}
                onDelete={() => setDeleting(task)}
              />
            ))}
          </div>
          <Note tone="warn" title="Sniping is high risk">
            Most new launches fail, and devs or bundlers often sell into the first buyers. Keep sizes small and always attach exits. Paper trading only.
          </Note>
        </>
      )}

      {elsewhere.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Also running:
          {elsewhere.map((e) => (
            <Link key={e.chain} to={routes.sniper(e.chain)} className="chip bg-panel-3 text-fg hover:text-accent">
              <ChainIcon chain={e.chain} size={12} /> {e.count} on {CHAINS[e.chain].name}
            </Link>
          ))}
        </p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={deletePending}
        danger
        title="Delete this sniper?"
        description="It stops watching immediately. Tokens it already bought stay in your portfolio."
        confirmLabel="Delete sniper"
      />
    </div>
  );
}
