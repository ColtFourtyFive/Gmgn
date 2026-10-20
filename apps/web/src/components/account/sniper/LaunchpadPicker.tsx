import { launchpadsFor, type ChainId } from '@trenchscope/shared';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { tint } from '@/components/common';
import { useMeta } from '@/hooks';

/** Launchpads of a chain (live from /api/meta, falling back to the shared config). */
export function useChainLaunchpads(chain: ChainId): { id: string; name: string; color: string }[] {
  const meta = useMeta().data;
  const live = meta?.launchpads.filter((l) => l.chain === chain);
  return live && live.length ? live : launchpadsFor(chain).map((l) => ({ id: l.id, name: l.name, color: l.color }));
}

/** Multi-select launchpad chips; an empty selection means "any launchpad". */
export function LaunchpadPicker({ chain, value, onChange, id }: { chain: ChainId; value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const pads = useChainLaunchpads(chain);
  const toggle = (lp: string) => onChange(value.includes(lp) ? value.filter((v) => v !== lp) : [...value, lp]);
  return (
    <div id={id} role="group" aria-label="Launchpads" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={value.length === 0}
        onClick={() => onChange([])}
        className={clsx(
          'inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors',
          value.length === 0 ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
        )}
      >
        {value.length === 0 && <Check size={12} />}
        Any
      </button>
      {pads.map((lp) => {
        const on = value.includes(lp.id);
        return (
          <button
            key={lp.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(lp.id)}
            className={clsx('inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors', on ? 'border-current' : 'border-line text-muted hover:border-line-strong hover:text-fg')}
            style={on ? tint(lp.color, 14) : undefined}
          >
            {on ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: lp.color }} />}
            {lp.name}
          </button>
        );
      })}
    </div>
  );
}
