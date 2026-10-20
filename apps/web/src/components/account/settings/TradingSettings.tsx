import { useState, type ReactNode } from 'react';
import { CHAIN_IDS, CHAINS, type ChainId, type ChainTradeSettings, type PresetId, type TradePreset } from '@trenchscope/shared';
import { ShieldCheck, Zap } from 'lucide-react';
import clsx from 'clsx';
import { CHAIN_SHORT, ChainIcon, Native } from '@/components/common';
import { Badge, Field, NumberInput, Panel, SegmentedControl, Toggle } from '@/components/ui';
import { useMeta } from '@/hooks';
import { NumberList } from './NumberList';
import { PRESET_IDS, path, type SettingsErrors } from './model';

const PRESET_NAMES: Record<PresetId, string> = { P1: 'Preset 1', P2: 'Preset 2', P3: 'Preset 3' };

/** Label left, compact control right, error underneath. */
function InlineRow({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {children}
      </div>
      {error && <p className="text-xs text-down">{error}</p>}
    </div>
  );
}

export interface TradingSettingsProps {
  chain: ChainId;
  onChain: (c: ChainId) => void;
  value: ChainTradeSettings;
  onChange: (next: ChainTradeSettings) => void;
  errors: SettingsErrors;
  /** Chains with unsaved edits (dot on the chain tab). */
  dirty: Set<ChainId>;
}

/** Per-chain trading settings: buy/sell presets, active presets, quick buttons. */
export function TradingSettings({ chain, onChain, value, onChange, errors, dirty }: TradingSettingsProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const sym = CHAINS[chain].nativeSymbol;
  const suggested = useMeta().data?.chains.find((c) => c.chain === chain)?.priorityFee;
  const presets = side === 'buy' ? value.buyPresets : value.sellPresets;
  const active = side === 'buy' ? value.activeBuyPreset : value.activeSellPreset;

  const setPreset = (id: PresetId, patch: Partial<TradePreset>) => {
    const key = side === 'buy' ? 'buyPresets' : 'sellPresets';
    onChange({ ...value, [key]: { ...value[key], [id]: { ...value[key][id], ...patch } } });
  };
  const setActive = (id: PresetId) => onChange(side === 'buy' ? { ...value, activeBuyPreset: id } : { ...value, activeSellPreset: id });

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        value={chain}
        onChange={onChain}
        className="self-start"
        aria-label="Chain"
        items={CHAIN_IDS.map((c) => ({
          value: c,
          label: (
            <span className="inline-flex items-center gap-1">
              {CHAIN_SHORT[c]}
              {dirty.has(c) && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="unsaved changes" />}
            </span>
          ),
          icon: <ChainIcon chain={c} size={12} />,
        }))}
      />

      <Panel
        title="Trade presets"
        subtitle={CHAINS[chain].name}
        actions={
          <SegmentedControl
            size="sm"
            value={side}
            onChange={setSide}
            aria-label="Preset side"
            items={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Active {side} preset</span>
          <SegmentedControl size="sm" value={active} onChange={setActive} aria-label={`Active ${side} preset`} items={PRESET_IDS.map((id) => ({ value: id, label: id }))} />
          {suggested && (
            <span className="text-xs text-faint sm:ml-auto">
              Network priority fee now: <Native value={suggested.low} /> / <Native value={suggested.medium} /> / <Native value={suggested.high} chain={chain} />
            </span>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {PRESET_IDS.map((id) => {
            const p = presets[id];
            const err = (f: string) => errors[path.preset(chain, side, id, f)];
            return (
              <fieldset key={id} className={clsx('flex min-w-0 flex-col gap-2.5 rounded border bg-panel-2 p-3', id === active ? 'border-accent/50' : 'border-line')}>
                <legend className="sr-only">
                  {side} {PRESET_NAMES[id]}
                </legend>
                <div className="flex items-center gap-2">
                  <span className="num text-md font-semibold text-fg">{id}</span>
                  {id === active ? <Badge tone="accent">Active</Badge> : (
                    <button type="button" onClick={() => setActive(id)} className="text-xs text-muted hover:text-accent">
                      Set active
                    </button>
                  )}
                  {p.antiMev && <ShieldCheck size={13} className="ml-auto text-up" aria-label="Anti-MEV on" />}
                </div>
                <Toggle size="sm" checked={p.autoSlippage} onChange={(v) => setPreset(id, { autoSlippage: v })} label={<span className="text-xs">Auto slippage</span>} />
                <InlineRow label="Max slippage" error={err('slippage')}>
                  <NumberInput
                    value={Number.isFinite(p.slippage) ? Number((p.slippage * 100).toPrecision(10)) : null}
                    onChange={(v) => setPreset(id, { slippage: v === null ? NaN : v / 100 })}
                    min={1}
                    max={100}
                    step={1}
                    suffix="%"
                    size="sm"
                    disabled={p.autoSlippage}
                    aria-label={`${id} ${side} slippage`}
                    invalid={!!err('slippage')}
                    wrapperClassName={clsx('!w-[104px]', p.autoSlippage && 'opacity-50')}
                  />
                </InlineRow>
                <InlineRow label="Priority fee" error={err('priorityFee')}>
                  <NumberInput
                    value={Number.isFinite(p.priorityFee) ? p.priorityFee : null}
                    onChange={(v) => setPreset(id, { priorityFee: v ?? NaN })}
                    min={0}
                    step={0.0001}
                    suffix={sym}
                    size="sm"
                    aria-label={`${id} ${side} priority fee`}
                    invalid={!!err('priorityFee')}
                    wrapperClassName="!w-[124px]"
                  />
                </InlineRow>
                <Toggle
                  size="sm"
                  checked={p.antiMev}
                  onChange={(v) => setPreset(id, { antiMev: v })}
                  label={<span className="text-xs">Anti-MEV</span>}
                  description={<span className="text-2xs">Private relay: no sandwich risk, slightly slower</span>}
                />
                <InlineRow label="Relay tip" error={err('tip')}>
                  <NumberInput
                    value={Number.isFinite(p.tip) ? p.tip : null}
                    onChange={(v) => setPreset(id, { tip: v ?? NaN })}
                    min={0}
                    step={0.0001}
                    suffix={sym}
                    size="sm"
                    disabled={!p.antiMev}
                    aria-label={`${id} ${side} anti-MEV tip`}
                    invalid={!!err('tip')}
                    wrapperClassName={clsx('!w-[124px]', !p.antiMev && 'opacity-50')}
                  />
                </InlineRow>
              </fieldset>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-faint">
          Higher priority fees land earlier in the block. Anti-MEV routes through a private relay (paying the tip) so bots can’t sandwich your trade. Fees above the
          chain’s cap are clamped when saved.
        </p>
      </Panel>

      <Panel title="Quick trade buttons" icon={<Zap size={14} />} subtitle={CHAINS[chain].name}>
        <div className="flex flex-col gap-4">
          <Field label={`Quick buy amounts (${sym})`} error={errors[path.quickBuy(chain)]} hint="Buttons on the trade panel; up to 8.">
            <NumberList
              values={value.quickBuyAmounts}
              onChange={(v) => onChange({ ...value, quickBuyAmounts: v })}
              min={0}
              step={0.01}
              suffix={sym}
              label="Quick buy amount"
              invalid={!!errors[path.quickBuy(chain)]}
            />
          </Field>
          <Field label="Quick sell percents" error={errors[path.quickSell(chain)]} hint="Share of the position sold by each button; up to 8.">
            <NumberList
              values={value.quickSellPercents}
              onChange={(v) => onChange({ ...value, quickSellPercents: v })}
              min={0}
              max={100}
              step={5}
              suffix="%"
              label="Quick sell percent"
              nextValue={(vals) => Math.min(100, Math.max(0, ...vals.filter(Number.isFinite)) + 25)}
              invalid={!!errors[path.quickSell(chain)]}
            />
          </Field>
          <Field label={`Instant buy amount (${sym})`} error={errors[path.instant(chain)]} hint="Used by the ⚡ one-click buy buttons in token lists.">
            <NumberInput
              value={Number.isFinite(value.instantBuyAmount) ? value.instantBuyAmount : null}
              onChange={(v) => onChange({ ...value, instantBuyAmount: v ?? NaN })}
              min={0}
              step={0.01}
              suffix={sym}
              presets={value.quickBuyAmounts.filter(Number.isFinite).slice(0, 6)}
              aria-label="Instant buy amount"
              invalid={!!errors[path.instant(chain)]}
              wrapperClassName="max-w-sm"
            />
          </Field>
        </div>
      </Panel>
    </div>
  );
}
