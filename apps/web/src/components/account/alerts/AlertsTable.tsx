import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AlertRule } from '@trenchscope/shared';
import { BellPlus, Pencil, Trash2 } from 'lucide-react';
import { AddressLink, Age, ChainIcon, Pct, Price, TokenAvatar, Usd } from '@/components/common';
import { Badge, Button, DataTable, EmptyState, IconButton, Skeleton, Toggle, type Column } from '@/components/ui';
import { useIsMobile } from '@/hooks';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { ConfirmDialog } from '../ConfirmDialog';
import { accountKeys, useTokenMeta, useWalletProfile } from '../queries';
import { ALERT_KIND, holdingTriggersLabel, signalFiltersLabel, signalKindsLabel } from './meta';

function TokenCell({ rule }: { rule: AlertRule }) {
  const q = useTokenMeta(rule.chain, rule.token);
  if (!rule.token) return null;
  if (q.isLoading) return <Skeleton className="h-3 w-20" />;
  const t = q.data;
  return (
    <Link to={routes.token(rule.chain, rule.token)} className="inline-flex min-w-0 items-center gap-1.5" title={rule.token}>
      {t && <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} imageUrl={t.imageUrl} size={18} />}
      <span className="link truncate font-semibold">{t?.symbol ?? `${rule.token.slice(0, 6)}…`}</span>
    </Link>
  );
}

function WalletCell({ rule }: { rule: AlertRule }) {
  const p = useWalletProfile(rule.chain, rule.wallet).data;
  if (!rule.wallet) return null;
  return <AddressLink chain={rule.chain} address={rule.wallet} label={p?.remark ?? p?.label} tags={p?.tags} avatar copy={false} />;
}

/** "Price ≥ $0.0₅12", "MC ≤ $40K", "Dumps ≥ 20% in 5m", "≥ 3 smart buys / 5m", "Any trade". */
function Condition({ rule }: { rule: AlertRule }) {
  const cmp = rule.direction === 'below' ? '≤' : '≥';
  switch (rule.kind) {
    case 'price':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">Price {cmp} </span>
          <Price value={rule.value} />
        </span>
      );
    case 'mcap':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">MC {cmp} </span>
          <Usd value={rule.value} />
        </span>
      );
    case 'change':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">{rule.direction === 'below' ? 'Dumps' : 'Pumps'} ≥ </span>
          <Pct value={rule.direction === 'below' ? -rule.value : rule.value} ratio={false} digits={0} />
          <span className="text-muted"> in 5m</span>
        </span>
      );
    case 'smart_buys':
      return (
        <span className="whitespace-nowrap">
          <span className="num">≥ {rule.value}</span> <span className="text-muted">smart buys / 5m</span>
        </span>
      );
    case 'wallet_trade':
      return <span className="text-muted">{rule.token ? 'Trades this token' : 'Any buy or sell'}</span>;
    case 'new_token':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">Name contains </span>
          <span className="chip bg-panel-3 text-fg">{rule.keyword ?? 'anything'}</span>
        </span>
      );
    case 'holding': {
      const h = rule.holding;
      if (!h) return null;
      return (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-fg">{holdingTriggersLabel(h)}</span>
          <span className="truncate text-xs text-muted">
            Positions ≥ <Usd value={h.minPositionUsd} /> · every {h.cooldownMin}m at most
          </span>
        </span>
      );
    }
    case 'signal_subscription': {
      const groups = rule.signals?.groups ?? [];
      const filters = groups[0] ? signalFiltersLabel(groups[0]) : '';
      return (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-fg">{signalKindsLabel(groups)}</span>
          <span className="truncate text-xs text-muted">
            {[filters, groups.length > 1 ? `or ${groups.length - 1} more group${groups.length > 2 ? 's' : ''}` : '', `≤ ${rule.signals?.maxPerHour ?? 30}/h`].filter(Boolean).join(' · ')}
          </span>
        </span>
      );
    }
  }
}

function Subject({ rule }: { rule: AlertRule }) {
  const meta = ALERT_KIND[rule.kind];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-panel-3 text-muted" title={meta.label}>
        <meta.icon size={14} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-1 text-2xs uppercase tracking-wide text-faint">
          <ChainIcon chain={rule.chain} size={10} /> {meta.label}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {meta.subject === 'token' && <TokenCell rule={rule} />}
          {meta.subject === 'wallet' && <WalletCell rule={rule} />}
          {meta.subject === 'keyword' && <span className="text-fg">New launches</span>}
          {meta.subject === 'signals' && <span className="truncate text-fg">{rule.signals?.name || 'Signals'}</span>}
          {meta.subject === 'holdings' && (rule.token ? <TokenCell rule={rule} /> : <span className="text-fg">All holdings</span>)}
        </span>
      </span>
    </span>
  );
}

export interface AlertsTableProps {
  rules: AlertRule[];
  loading: boolean;
  onEdit: (rule: AlertRule) => void;
  onNew: () => void;
}

/** Alert rules with inline enable toggle, edit and delete. */
export function AlertsTable({ rules, loading, onEdit, onNew }: AlertsTableProps) {
  const qc = useQueryClient();
  const { compactRows } = useDisplaySettings();
  const mobile = useIsMobile();
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const setEnabled = useCallback(
    async (rule: AlertRule, enabled: boolean) => {
      setToggling(rule.id);
      const patch = (on: boolean) => qc.setQueryData<AlertRule[]>(accountKeys.alerts, (l) => l?.map((r) => (r.id === rule.id ? { ...r, enabled: on } : r)));
      patch(enabled);
      try {
        const saved = await api.updateAlert(rule.id, { enabled });
        qc.setQueryData<AlertRule[]>(accountKeys.alerts, (l) => l?.map((r) => (r.id === saved.id ? saved : r)));
      } catch (err) {
        patch(!enabled);
        toast.error('Could not update alert', errorMessage(err));
      } finally {
        setToggling(null);
      }
    },
    [qc],
  );

  const columns = useMemo<Column<AlertRule>[]>(() => {
    return [
      { key: 'subject', header: 'Alert', sticky: true, width: 220, render: (r) => <Subject rule={r} /> },
      { key: 'condition', header: 'Condition', render: (r) => <Condition rule={r} /> },
      {
        key: 'repeat',
        header: 'Mode',
        hideBelow: 'md',
        render: (r) => <Badge tone={r.repeat ? 'info' : 'neutral'}>{r.repeat ? 'Repeat' : 'Once'}</Badge>,
      },
      {
        key: 'note',
        header: 'Note',
        hideBelow: 'lg',
        render: (r) =>
          r.note ? (
            <span className="block max-w-[260px] truncate text-muted" title={r.note}>
              {r.note}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: 'fired',
        header: 'Last fired',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.lastTriggeredAt,
        render: (r) => (r.lastTriggeredAt ? <Age ts={r.lastTriggeredAt} suffix=" ago" className="text-muted" /> : <span className="text-faint">Never</span>),
      },
      {
        key: 'created',
        header: 'Created',
        align: 'right',
        hideBelow: 'xl',
        sortable: true,
        sortValue: (r) => r.createdAt,
        render: (r) => <Age ts={r.createdAt} suffix=" ago" className="text-muted" />,
      },
      {
        key: 'enabled',
        header: 'On',
        align: 'center',
        width: 56,
        sortable: true,
        sortValue: (r) => Number(r.enabled),
        render: (r) => (
          <Toggle size="sm" checked={r.enabled} disabled={toggling === r.id} onChange={(on) => void setEnabled(r, on)} aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${ALERT_KIND[r.kind].label} alert`} />
        ),
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        align: 'right',
        width: 72,
        render: (r) => (
          <span className="flex justify-end gap-0.5">
            <IconButton size="xs" label="Edit alert" icon={<Pencil size={13} />} onClick={() => onEdit(r)} />
            <IconButton size="xs" label="Delete alert" icon={<Trash2 size={13} />} onClick={() => setDeleting(r)} className="hover:!text-down" />
          </span>
        ),
      },
    ];
  }, [setEnabled, toggling, onEdit]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.deleteAlert(deleting.id);
      qc.setQueryData<AlertRule[]>(accountKeys.alerts, (l) => l?.filter((r) => r.id !== deleting.id));
      toast.info('Alert deleted');
      setDeleting(null);
    } catch (err) {
      toast.error('Could not delete alert', errorMessage(err));
    } finally {
      setDeletePending(false);
      void qc.invalidateQueries({ queryKey: accountKeys.alerts });
    }
  };

  const emptyState = (
    <EmptyState
      icon={<BellPlus size={18} />}
      title="No alerts yet"
      description="Get notified when a token crosses a price or market cap, pumps or dumps fast, draws smart-money buys, when a wallet trades, when a matching token launches, or when signals you subscribe to fire."
      action={
        <Button variant="primary" size="sm" icon={<BellPlus size={13} />} onClick={onNew}>
          Create your first alert
        </Button>
      }
    />
  );

  const list = mobile ? (
    loading && rules.length === 0 ? (
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    ) : rules.length === 0 ? (
      emptyState
    ) : (
      <ul className="flex flex-col divide-y divide-line" aria-label="Alert rules">
        {[...rules]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => (
            <li key={r.id} className="flex items-start gap-2 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Subject rule={r} />
                <div className="text-sm">
                  <Condition rule={r} />
                </div>
                <p className="truncate text-2xs text-faint">
                  {r.repeat ? 'Repeats' : 'Once'} · {r.lastTriggeredAt ? <Age ts={r.lastTriggeredAt} suffix=" ago" /> : 'never fired'}
                  {r.note && <> · {r.note}</>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Toggle size="sm" checked={r.enabled} disabled={toggling === r.id} onChange={(on) => void setEnabled(r, on)} aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${ALERT_KIND[r.kind].label} alert`} />
                <span className="flex gap-0.5">
                  <IconButton size="xs" label="Edit alert" icon={<Pencil size={13} />} onClick={() => onEdit(r)} />
                  <IconButton size="xs" label="Delete alert" icon={<Trash2 size={13} />} onClick={() => setDeleting(r)} className="hover:!text-down" />
                </span>
              </div>
            </li>
          ))}
      </ul>
    )
  ) : null;

  return (
    <>
      {list ?? (
        <DataTable
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
          defaultSort={{ key: 'created', dir: 'desc' }}
          loading={loading}
          skeletonRows={4}
          compact={compactRows}
          minWidth={640}
          aria-label="Alert rules"
          empty={emptyState}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={deletePending}
        danger
        title="Delete this alert?"
        description="You will stop getting notifications for it."
        confirmLabel="Delete alert"
      />
    </>
  );
}
