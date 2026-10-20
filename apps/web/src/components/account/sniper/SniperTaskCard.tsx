import { PRESET_LABELS } from '@trenchscope/shared';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SniperTask } from '@trenchscope/shared';
import { Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { describeStrategy } from '@/components/trade/StrategyEditor';
import { AddressLink, Age, LaunchpadBadge, Native, Pct } from '@/components/common';
import { Badge, Button, Toggle, Tooltip } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { DetailRow } from '../FormBits';
import { accountKeys } from '../queries';
import { SNIPER_KIND } from './meta';

/** Optimistically flip `enabled` on a sniper task, then PATCH. */
export function useToggleSniperTask() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const toggle = async (task: SniperTask, enabled: boolean) => {
    setPending(task.id);
    const patchList = (on: boolean) => qc.setQueryData<SniperTask[]>(accountKeys.sniperTasks, (list) => list?.map((t) => (t.id === task.id ? { ...t, enabled: on } : t)));
    patchList(enabled);
    try {
      const saved = await api.updateSniperTask(task.id, { enabled });
      qc.setQueryData<SniperTask[]>(accountKeys.sniperTasks, (list) => list?.map((t) => (t.id === saved.id ? saved : t)));
      toast.info(enabled ? 'Sniper armed' : 'Sniper paused', task.label || SNIPER_KIND[task.kind].label);
    } catch (err) {
      patchList(!enabled);
      toast.error('Could not update sniper', errorMessage(err));
    } finally {
      setPending(null);
    }
  };
  return { toggle, pending };
}

function Chips({ items, max = 4, mono, render }: { items: string[]; max?: number; mono?: boolean; render?: (s: string) => ReactNode }) {
  if (items.length === 0) return <span className="text-faint">Any</span>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {shown.map((s) => (
        <span key={s} className={clsx('chip bg-panel-3 text-fg', mono && 'font-mono')}>
          {render ? render(s) : s}
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.join(', ')}>
          <span className="chip bg-panel-3 text-muted" tabIndex={0}>
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

export interface SniperTaskCardProps {
  task: SniperTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}

/** One sniper task: trigger kind, filters, buy size, progress and controls. */
export function SniperTaskCard({ task, onEdit, onDelete, onToggle, toggling }: SniperTaskCardProps) {
  const meta = SNIPER_KIND[task.kind];
  const done = task.buysDone >= task.maxBuys;
  const progress = Math.min(1, task.buysDone / Math.max(1, task.maxBuys));
  const name = task.label || meta.label;
  return (
    <article className={clsx('panel flex min-w-0 flex-col', !task.enabled && 'opacity-80')} aria-label={`Sniper ${name}`}>
      <header className="flex items-start gap-2.5 border-b border-line px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
          <meta.icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Badge tone="neutral">{meta.short}</Badge>
            {task.lastTriggeredAt ? (
              <span>
                fired <Age ts={task.lastTriggeredAt} suffix=" ago" />
              </span>
            ) : (
              <span>not triggered yet</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Toggle checked={task.enabled} onChange={onToggle} disabled={toggling || (done && !task.enabled)} aria-label={task.enabled ? 'Pause sniper' : 'Arm sniper'} />
          <Badge tone={done ? 'info' : task.enabled ? 'up' : 'neutral'}>{done ? 'Complete' : task.enabled ? 'Armed' : 'Paused'}</Badge>
        </div>
      </header>

      <div className="flex items-center gap-2 px-3 pt-2.5">
        <div
          className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3"
          role="progressbar"
          aria-label="Buys done"
          aria-valuemin={0}
          aria-valuemax={task.maxBuys}
          aria-valuenow={task.buysDone}
        >
          <span className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width]', done ? 'bg-up' : 'bg-accent')} style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="num shrink-0 text-xs text-muted">
          <span className="font-medium text-fg">{task.buysDone}</span> / {task.maxBuys} buys
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 px-3 py-2.5">
        <DetailRow label="Buy">
          <Native value={task.buyAmount} chain={task.chain} /> <span className="text-muted">per snipe</span>
        </DetailRow>
        {(task.kind === 'dev_launch' || task.devAddresses.length > 0) && (
          <DetailRow label="Devs">
            <span className="inline-flex flex-col items-end gap-0.5">
              {task.devAddresses.slice(0, 2).map((d) => (
                <AddressLink key={d} chain={task.chain} address={d} className="text-xs" />
              ))}
              {task.devAddresses.length > 2 && <span className="text-muted">+{task.devAddresses.length - 2} more</span>}
            </span>
          </DetailRow>
        )}
        <DetailRow label="Keywords">
          <Chips items={task.keywords} />
        </DetailRow>
        <DetailRow label="Launchpads">
          {task.launchpads.length ? (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {task.launchpads.map((lp) => (
                <LaunchpadBadge key={lp} launchpad={lp} />
              ))}
            </span>
          ) : (
            <span className="text-faint">Any</span>
          )}
        </DetailRow>
        <DetailRow label="Safety">
          {[
            task.requireSocials ? 'Socials required' : null,
            task.maxDevHoldRate !== null ? <span key="dev">Dev ≤ <Pct value={task.maxDevHoldRate} sign={false} colored={false} digits={0} /></span> : null,
            task.minDevMigrated !== null ? `Dev migrated ≥ ${task.minDevMigrated}` : null,
          ]
            .filter(Boolean)
            .map((x, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {x}
              </span>
            ))}
          {!task.requireSocials && task.maxDevHoldRate === null && task.minDevMigrated === null && <span className="text-faint">No checks</span>}
        </DetailRow>
        <DetailRow label="Exit strategy">
          <span title={describeStrategy(task.strategy)}>{describeStrategy(task.strategy)}</span>
        </DetailRow>
        <DetailRow label="Preset">{PRESET_LABELS[task.presetId]}</DetailRow>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
        <span className="mr-auto text-xs text-muted">
          Created <Age ts={task.createdAt} suffix=" ago" />
        </span>
        <Button size="xs" variant="outline" icon={<Pencil size={12} />} onClick={onEdit}>
          Edit
        </Button>
        <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={onDelete} className="hover:!text-down" aria-label={`Delete sniper ${name}`}>
          Delete
        </Button>
      </footer>
    </article>
  );
}
