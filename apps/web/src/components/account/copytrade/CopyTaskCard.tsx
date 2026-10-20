import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatUsd, shortAddress, type CopyTradeTask, PRESET_LABELS } from '@trenchscope/shared';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { describeStrategy } from '@/components/trade/StrategyEditor';
import { AddressLink, Age, Native, Pct, Usd, WalletAvatar, WalletTags } from '@/components/common';
import { Badge, Button, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { DetailRow } from '../FormBits';
import { accountKeys, useWalletProfile } from '../queries';

/** Optimistically flip `enabled` on a task in the ['copytrade'] cache, then PATCH. */
export function useToggleCopyTask() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const toggle = async (task: CopyTradeTask, enabled: boolean) => {
    setPending(task.id);
    const patchList = (on: boolean) =>
      qc.setQueryData<CopyTradeTask[]>(accountKeys.copyTasks, (list) => list?.map((t) => (t.id === task.id ? { ...t, enabled: on } : t)));
    patchList(enabled);
    try {
      const saved = await api.updateCopyTask(task.id, { enabled });
      qc.setQueryData<CopyTradeTask[]>(accountKeys.copyTasks, (list) => list?.map((t) => (t.id === saved.id ? saved : t)));
      toast.info(enabled ? 'Copy task resumed' : 'Copy task paused', task.label || shortAddress(task.target));
    } catch (err) {
      patchList(!enabled);
      toast.error('Could not update task', errorMessage(err));
    } finally {
      setPending(null);
    }
  };
  return { toggle, pending };
}

function filtersSummary(t: CopyTradeTask): string {
  const parts: string[] = [];
  if (t.minMarketCapUsd !== null || t.maxMarketCapUsd !== null) {
    const lo = t.minMarketCapUsd !== null ? formatUsd(t.minMarketCapUsd) : '0';
    const hi = t.maxMarketCapUsd !== null ? formatUsd(t.maxMarketCapUsd) : '∞';
    parts.push(`MC ${lo}–${hi}`);
  }
  if (t.minLiquidityUsd !== null) parts.push(`Liq ≥ ${formatUsd(t.minLiquidityUsd)}`);
  if (t.firstBuyOnly) parts.push('First buy only');
  if (t.blacklist.length) parts.push(`${t.blacklist.length} blacklisted`);
  return parts.join(' · ') || 'None — copies every buy';
}

export interface CopyTaskCardProps {
  task: CopyTradeTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}

/** One copy-trade task: target, rules, stats and controls. */
export function CopyTaskCard({ task, onEdit, onDelete, onToggle, toggling }: CopyTaskCardProps) {
  const profile = useWalletProfile(task.chain, task.target).data;
  // Identity, like the wallet page: the trading style is a shared archetype ("Money Printer"), shown as a badge.
  const name = task.label || profile?.remark || profile?.label || shortAddress(task.target);
  const style = profile?.style.title;
  const s = task.stats;
  const net = s.receivedNative - s.spentNative;
  return (
    <article className={clsx('panel flex min-w-0 flex-col', !task.enabled && 'opacity-80')} aria-label={`Copy task ${name}`}>
      <header className="flex items-start gap-2.5 border-b border-line px-3 py-2.5">
        <WalletAvatar seed={profile?.avatarSeed ?? task.target} size={32} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{name}</span>
            {style && (
              <Badge title="Trading style" className="shrink-0">
                {style}
              </Badge>
            )}
            {profile && <WalletTags tags={profile.tags} max={3} />}
          </p>
          <AddressLink chain={task.chain} address={task.target} className="text-xs text-muted" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Toggle checked={task.enabled} onChange={onToggle} disabled={toggling} aria-label={task.enabled ? 'Pause copy task' : 'Resume copy task'} />
          <Badge tone={task.enabled ? 'up' : 'neutral'}>{task.enabled ? 'Active' : 'Paused'}</Badge>
        </div>
      </header>

      <dl className="flex flex-col gap-1.5 px-3 py-2.5">
        <DetailRow label="Buy">
          {task.buyMode === 'fixed' ? (
            <>
              <Native value={task.buyAmount} chain={task.chain} /> <span className="text-muted">per buy</span>
            </>
          ) : (
            <>
              <Pct value={task.buyRatio} sign={false} colored={false} digits={0} /> <span className="text-muted">of target size</span>
            </>
          )}
        </DetailRow>
        <DetailRow label="Max per token">
          <Native value={task.maxPerToken} chain={task.chain} />
        </DetailRow>
        <DetailRow label="Filters">
          <span title={filtersSummary(task)}>{filtersSummary(task)}</span>
        </DetailRow>
        <DetailRow label="Sells">{task.sellMode === 'mirror' ? 'Mirror target sells' : 'Not mirrored'}</DetailRow>
        <DetailRow label="Exit strategy">
          <span title={describeStrategy(task.strategy)}>{describeStrategy(task.strategy)}</span>
        </DetailRow>
        <DetailRow label="Preset">{PRESET_LABELS[task.presetId]}</DetailRow>
      </dl>

      <div className="grid grid-cols-4 gap-px border-y border-line bg-line text-center sm:grid-cols-5">
        <Stat label="Buys" value={<span className="text-up">{s.buys}</span>} />
        <Stat label="Sells" value={<span className="text-down">{s.sells}</span>} />
        <Stat label="Spent" value={<Native value={s.spentNative} chain={task.chain} digits={2} />} />
        <Stat label="Received" value={<Native value={s.receivedNative} chain={task.chain} digits={2} />} className="hidden sm:flex" />
        <Stat
          label="PnL"
          hint="Received − spent. Copied positions still open are not counted."
          value={s.spentNative > 0 ? <Native value={net} chain={task.chain} digits={2} colored signed /> : <span className="text-faint">—</span>}
        />
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-1.5 px-3 py-2">
        <span className="basis-full text-xs text-muted sm:mr-auto sm:basis-auto">
          {s.lastCopiedAt ? (
            <>
              Last copy <Age ts={s.lastCopiedAt} suffix=" ago" />
            </>
          ) : (
            <>
              Created <Age ts={task.createdAt} suffix=" ago" /> · no copies yet
            </>
          )}
          {profile && (
            <span className="hidden md:inline">
              {' '}
              · 30d PnL <Usd value={profile.stats['30d'].totalPnlUsd} colored signed />
            </span>
          )}
        </span>
        <Link to={routes.wallet(task.chain, task.target)} className="btn-ghost btn-xs ml-auto sm:ml-0" title="Open the target's wallet page">
          <ExternalLink size={12} /> Wallet
        </Link>
        <Button size="xs" variant="outline" icon={<Pencil size={12} />} onClick={onEdit}>
          Edit
        </Button>
        <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={onDelete} className="hover:!text-down" aria-label={`Delete copy task ${name}`}>
          Delete
        </Button>
      </footer>
    </article>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center gap-0.5 bg-panel px-1 py-1.5', className)} title={hint}>
      <span className="text-2xs uppercase tracking-wide text-faint">{label}</span>
      <span className="num text-sm font-medium text-fg">{value}</span>
    </div>
  );
}
