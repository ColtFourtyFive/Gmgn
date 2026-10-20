// P1/P2/P3 execution presets for the active side, with an inline editor
// (slippage + auto, priority fee, tip, anti-MEV) saved to account settings.

import { useEffect, useState } from 'react';
import { CHAINS, formatPercent, type ChainId, type PresetId, type TradePreset, type UserSettings } from '@trenchscope/shared';
import { Settings2, ShieldCheck, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { Native } from '@/components/common';
import { Button, Field, IconButton, NumberInput, Popover, SegmentedControl, Toggle, Tooltip } from '@/components/ui';
import type { DeepPartial } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import type { TradeSide } from '../store';

const PRESET_IDS: PresetId[] = ['P1', 'P2', 'P3'];
const PRESET_ITEMS = PRESET_IDS.map((id) => ({ value: id, label: id }));
const SLIPPAGE_PRESETS = [10, 20, 30, 50];

export function presetsKey(side: TradeSide): 'buyPresets' | 'sellPresets' {
  return side === 'buy' ? 'buyPresets' : 'sellPresets';
}

/** Save one preset of one side (deep-partial settings patch). */
export async function savePreset(chain: ChainId, side: TradeSide, id: PresetId, patch: Partial<TradePreset>): Promise<void> {
  const body = { trade: { [chain]: { [presetsKey(side)]: { [id]: patch } } } } as DeepPartial<UserSettings>;
  await useSession.getState().saveSettings(body);
}

export function slippageLabel(p: TradePreset): string {
  return p.autoSlippage ? 'Auto' : formatPercent(p.slippage, { sign: false, digits: 0 });
}

export interface PresetBarProps {
  chain: ChainId;
  side: TradeSide;
  presetId: PresetId;
  onPresetChange: (id: PresetId) => void;
  preset: TradePreset;
}

export function PresetBar({ chain, side, presetId, onPresetChange, preset }: PresetBarProps) {
  const signedIn = useSession((s) => !!s.token);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <SegmentedControl size="sm" value={presetId} onChange={onPresetChange} items={PRESET_ITEMS} aria-label={`${side === 'buy' ? 'Buy' : 'Sell'} preset`} />
      <Tooltip content={`Slippage ${slippageLabel(preset)} · priority ${preset.priorityFee} ${CHAINS[chain].nativeSymbol}${preset.antiMev ? ` · anti-MEV tip ${preset.tip}` : ' · anti-MEV off'}`}>
        <span className="num flex min-w-0 items-center gap-1 truncate text-2xs text-muted" tabIndex={0}>
          <span className="truncate">{slippageLabel(preset)}</span>
          {preset.antiMev ? <ShieldCheck size={11} className="shrink-0 text-up" aria-label="Anti-MEV on" /> : <ShieldOff size={11} className="shrink-0 text-faint" aria-label="Anti-MEV off" />}
        </span>
      </Tooltip>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next && !signedIn) {
            useSession.getState().promptAuth(true);
            return;
          }
          setOpen(next);
        }}
        placement="bottom-end"
        aria-label={`Edit ${presetId}`}
        className="w-72 p-3"
        trigger={<IconButton size="xs" label={`Edit ${side} preset ${presetId}`} icon={<Settings2 size={13} />} />}
      >
        {(close) => <PresetEditor chain={chain} side={side} id={presetId} preset={preset} onDone={close} />}
      </Popover>
    </div>
  );
}

function PresetEditor({ chain, side, id, preset, onDone }: { chain: ChainId; side: TradeSide; id: PresetId; preset: TradePreset; onDone: () => void }) {
  const symbol = CHAINS[chain].nativeSymbol;
  const [draft, setDraft] = useState<TradePreset>(preset);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(preset), [preset]);
  const set = (patch: Partial<TradePreset>) => setDraft((d) => ({ ...d, ...patch }));
  const slippagePct = Math.round(draft.slippage * 1000) / 10;
  const valid = draft.slippage > 0 && draft.slippage <= 1 && draft.priorityFee >= 0 && draft.tip >= 0;

  const save = async () => {
    setSaving(true);
    try {
      await savePreset(chain, side, id, { slippage: draft.slippage, autoSlippage: draft.autoSlippage, priorityFee: draft.priorityFee, tip: draft.tip, antiMev: draft.antiMev });
      toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} preset ${id} saved`);
      onDone();
    } catch (err) {
      toast.error('Couldn’t save preset', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-fg">
          {side === 'buy' ? 'Buy' : 'Sell'} preset {id}
        </p>
        <p className="text-xs text-muted">Applies to market, limit and auto orders on {CHAINS[chain].name}.</p>
      </div>
      <Field label="Slippage tolerance">
        <div className="flex flex-col gap-1.5">
          <Toggle size="sm" checked={draft.autoSlippage} onChange={(v) => set({ autoSlippage: v })} label="Auto slippage" description="Adapts to price impact, taxes and momentum." />
          <NumberInput
            value={slippagePct}
            onChange={(v) => set({ slippage: v === null ? 0 : v / 100 })}
            min={0.1}
            max={100}
            step={1}
            suffix="%"
            disabled={draft.autoSlippage}
            presets={SLIPPAGE_PRESETS}
            formatPreset={(v) => `${v}%`}
            aria-label="Slippage percent"
            data-autofocus
          />
        </div>
      </Field>
      <Field label="Priority fee" hint="Paid to validators; higher lands faster.">
        <NumberInput value={draft.priorityFee} onChange={(v) => set({ priorityFee: v ?? 0 })} min={0} max={1} step={0.0001} suffix={symbol} aria-label="Priority fee" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Toggle size="sm" checked={draft.antiMev} onChange={(v) => set({ antiMev: v })} label="Anti-MEV" description="Private relay: no sandwich attacks, slightly slower." />
        <Field label="Anti-MEV tip">
          <NumberInput value={draft.tip} onChange={(v) => set({ tip: v ?? 0 })} min={0} max={1} step={0.0001} suffix={symbol} disabled={!draft.antiMev} aria-label="Anti-MEV tip" />
        </Field>
      </div>
      <p className={clsx('text-2xs', valid ? 'text-faint' : 'text-down')}>
        {valid ? (
          <>
            Network cost ≈ <Native value={CHAINS[chain].baseNetworkFee + draft.priorityFee + (draft.antiMev ? draft.tip : 0)} chain={chain} /> per trade
          </>
        ) : (
          'Slippage must be between 0.1% and 100%.'
        )}
      </p>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" loading={saving} disabled={!valid} onClick={() => void save()}>
          Save {id}
        </Button>
      </div>
    </div>
  );
}
