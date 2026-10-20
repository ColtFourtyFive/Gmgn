// Bulk follows: import dialog (pick a JSON / CSV file → preview with counts
// → follow the new wallets one by one with progress) and the export download.

import { useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatInt, shortAddress, type ChainId, type FollowedWallet } from '@trenchscope/shared';
import { FileUp, Upload } from 'lucide-react';
import clsx from 'clsx';
import { Note } from '@/components/account/FormBits';
import { ChainIcon, StatTile } from '@/components/common';
import { FOLLOWS_QUERY_KEY } from '@/components/discovery/useViewerTags';
import { Button, Modal } from '@/components/ui';
import { sameWallet } from '@/components/wallet';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { followsToCsv, followsToJson, IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, MAX_FOLLOWS, planImport, type FollowRow, type ImportPlan } from './followsIO';

/** Save the follows as a file (all chains). */
export function downloadFollows(list: FollowedWallet[], format: 'json' | 'csv', at: number): void {
  const body = format === 'json' ? followsToJson(list, at) : followsToCsv(list);
  const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trenchscope-follows-${new Date(at).toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Phase = { step: 'pick'; error: string | null } | { step: 'preview'; file: string; plan: ImportPlan } | { step: 'apply'; plan: ImportPlan; done: number; failed: { row: FollowRow; reason: string }[]; finished: boolean };

const PREVIEW_ROWS = 6;

export interface FollowsImportProps {
  open: boolean;
  onClose: () => void;
  /** Chain for rows that name none. */
  chain: ChainId;
  /** Everything the viewer follows (all chains). */
  existing: FollowedWallet[];
}

export function FollowsImportDialog(props: FollowsImportProps) {
  return props.open ? <ImportDialog {...props} /> : null;
}

function ImportDialog({ onClose, chain, existing }: FollowsImportProps) {
  const ids = useId();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ step: 'pick', error: null });
  const [dragging, setDragging] = useState(false);
  const stop = useRef(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    // Refuse oversized files before reading them into memory (planImport checks the text too).
    if (file.size > IMPORT_MAX_BYTES) {
      setPhase({ step: 'pick', error: IMPORT_TOO_LARGE });
      return;
    }
    try {
      const plan = planImport(await file.text(), { defaultChain: chain, existing });
      setPhase({ step: 'preview', file: file.name, plan });
    } catch (err) {
      setPhase({ step: 'pick', error: errorMessage(err) });
    }
  };

  const apply = async (plan: ImportPlan) => {
    stop.current = false;
    const failed: { row: FollowRow; reason: string }[] = [];
    let done = 0;
    setPhase({ step: 'apply', plan, done, failed, finished: false });
    for (const row of plan.rows) {
      if (stop.current) break;
      try {
        const f = await api.follow({ chain: row.chain, address: row.address, group: row.group, notify: row.notify, ...(row.remark ? { remark: row.remark } : {}) });
        qc.setQueryData<FollowedWallet[]>(FOLLOWS_QUERY_KEY, (prev) => [...(prev ?? []).filter((x) => !(x.chain === f.chain && sameWallet(f.chain, x.address, f.address))), f]);
      } catch (err) {
        failed.push({ row, reason: err instanceof ApiError && err.status === 404 ? 'Wallet not found on Trenchscope' : errorMessage(err) });
        // The account is full: the remaining rows would fail the same way.
        if (err instanceof ApiError && err.code === 'limit_reached') stop.current = true;
      }
      done++;
      setPhase({ step: 'apply', plan, done, failed: [...failed], finished: false });
    }
    setPhase({ step: 'apply', plan, done, failed, finished: true });
    void qc.invalidateQueries({ queryKey: FOLLOWS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
    const ok = done - failed.length;
    if (ok > 0) toast.success(`Following ${formatInt(ok)} more wallet${ok === 1 ? '' : 's'}`, failed.length ? `${failed.length} couldn’t be followed.` : undefined);
    else if (failed.length) toast.error('No wallets followed', failed[0].reason);
  };

  const close = () => {
    stop.current = true;
    onClose();
  };

  const applying = phase.step === 'apply' && !phase.finished;
  let footer: ReactNode = null;
  if (phase.step === 'preview') {
    const n = phase.plan.rows.length;
    footer = (
      <>
        <Button variant="ghost" onClick={() => setPhase({ step: 'pick', error: null })} className="mr-auto">
          Choose another file
        </Button>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={n === 0} onClick={() => void apply(phase.plan)} data-autofocus>
          Follow {formatInt(n)} wallet{n === 1 ? '' : 's'}
        </Button>
      </>
    );
  } else if (phase.step === 'apply') {
    footer = applying ? (
      <Button variant="outline" onClick={() => (stop.current = true)}>
        Stop
      </Button>
    ) : (
      <Button variant="primary" onClick={close} data-autofocus>
        Done
      </Button>
    );
  }

  return (
    <Modal open onClose={close} title="Import followed wallets" description="From a Trenchscope export (JSON or CSV) or a list of addresses, one per line." footer={footer} closeOnOverlay={!applying}>
      {phase.step === 'pick' && (
        <div className="flex flex-col gap-3">
          <label
            htmlFor={`${ids}-file`}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              void read(e.dataTransfer.files[0]);
            }}
            className={clsx(
              'flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-accent bg-accent/5' : 'border-line-strong hover:border-accent/60 hover:bg-panel-2',
            )}
          >
            <Upload size={20} className="text-accent" aria-hidden />
            <span className="text-sm font-medium text-fg">Drop a .json or .csv file, or click to choose</span>
            <span className="text-xs text-muted">Rows without a chain are followed on {CHAINS[chain].name}. Up to 1,000 wallets per file.</span>
          </label>
          <input
            id={`${ids}-file`}
            type="file"
            accept=".json,.csv,.txt,application/json,text/csv,text/plain"
            className="sr-only"
            data-autofocus
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {phase.error && <Note tone="error">{phase.error}</Note>}
        </div>
      )}
      {phase.step === 'preview' && <Preview file={phase.file} plan={phase.plan} existingCount={existing.length} />}
      {phase.step === 'apply' && <Progress phase={phase} />}
    </Modal>
  );
}

function Preview({ file, plan, existingCount }: { file: string; plan: ImportPlan; existingCount: number }) {
  const room = Math.max(0, MAX_FOLLOWS - existingCount);
  const chains = Object.entries(plan.byChain) as [ChainId, number][];
  return (
    <div className="flex flex-col gap-3">
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
        <FileUp size={14} className="shrink-0" aria-hidden />
        <span className="truncate text-fg">{file}</span>
        <span className="shrink-0">
          · {plan.format.toUpperCase()} · {formatInt(plan.total)} row{plan.total === 1 ? '' : 's'}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="To follow" value={<span className="text-accent">{formatInt(plan.rows.length)}</span>} />
        <StatTile label="Already followed" value={formatInt(plan.existing)} />
        <StatTile label="Duplicates" value={formatInt(plan.duplicates)} />
        <StatTile label="Invalid" value={<span className={plan.invalid.length ? 'text-down' : undefined}>{formatInt(plan.invalid.length)}</span>} />
      </div>
      {chains.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="New follows by chain">
          {chains.map(([c, n]) => (
            <span key={c} className="chip border border-line text-xs text-fg">
              <ChainIcon chain={c} size={12} />
              {CHAINS[c].name} <span className="num text-muted">{n}</span>
            </span>
          ))}
        </div>
      )}
      {plan.rows.length > room && (
        <Note tone="warn">
          You can follow {formatInt(room)} more wallet{room === 1 ? '' : 's'} ({MAX_FOLLOWS} max); the import stops once the list is full.
        </Note>
      )}
      {plan.rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded border border-line text-sm" aria-label="First wallets to follow">
          {plan.rows.slice(0, PREVIEW_ROWS).map((r) => (
            <li key={`${r.chain}:${r.address}`} className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
              <ChainIcon chain={r.chain} size={12} />
              <span className="num shrink-0 font-mono text-xs text-fg">{shortAddress(r.address, 6, 6)}</span>
              {r.remark && <span className="truncate text-muted">{r.remark}</span>}
              <span className="ml-auto shrink-0 text-xs text-faint">{r.group}</span>
            </li>
          ))}
          {plan.rows.length > PREVIEW_ROWS && <li className="px-2.5 py-1.5 text-xs text-muted">+{formatInt(plan.rows.length - PREVIEW_ROWS)} more</li>}
        </ul>
      )}
      {plan.invalid.length > 0 && (
        <Note tone="error" title={`${formatInt(plan.invalid.length)} row${plan.invalid.length === 1 ? '' : 's'} skipped`}>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {plan.invalid.slice(0, PREVIEW_ROWS).map((i) => (
              <li key={i.row}>
                Row {i.row}: {i.reason}
              </li>
            ))}
            {plan.invalid.length > PREVIEW_ROWS && <li>+{formatInt(plan.invalid.length - PREVIEW_ROWS)} more</li>}
          </ul>
        </Note>
      )}
    </div>
  );
}

function Progress({ phase }: { phase: Extract<Phase, { step: 'apply' }> }) {
  const total = phase.plan.rows.length;
  const ok = phase.done - phase.failed.length;
  const pct = total > 0 ? phase.done / total : 1;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="text-sm text-fg">
        {phase.finished
          ? `Followed ${formatInt(ok)} of ${formatInt(total)} wallet${total === 1 ? '' : 's'}${phase.failed.length ? ` · ${formatInt(phase.failed.length)} failed` : ''}.`
          : `Following ${formatInt(phase.done)} of ${formatInt(total)}…`}
      </p>
      <span role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={phase.done} aria-label="Import progress" className="relative h-1.5 overflow-hidden rounded-full bg-panel-3">
        <span className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width]', phase.finished && phase.failed.length === 0 ? 'bg-up' : 'bg-accent')} style={{ width: `${pct * 100}%` }} />
      </span>
      {phase.failed.length > 0 && (
        <Note tone="error" title="Not followed">
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {phase.failed.slice(0, PREVIEW_ROWS).map((f) => (
              <li key={`${f.row.chain}:${f.row.address}`}>
                <span className="num font-mono">{shortAddress(f.row.address)}</span>: {f.reason}
              </li>
            ))}
            {phase.failed.length > PREVIEW_ROWS && <li>+{formatInt(phase.failed.length - PREVIEW_ROWS)} more</li>}
          </ul>
        </Note>
      )}
    </div>
  );
}
