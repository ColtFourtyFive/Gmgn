import type { ReactNode } from 'react';
import type { DisplaySettings } from '@trenchscope/shared';
import { Monitor, ShieldAlert } from 'lucide-react';
import { RiskChip } from '@/components/common';
import { NumberInput, Panel, SegmentedControl, Toggle } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { path, type SettingsErrors } from './model';

type Thresholds = DisplaySettings['riskThresholds'];

const RISK_ROWS: { key: keyof Thresholds; label: string; chip: string; description: string }[] = [
  { key: 'top10', label: 'Top 10 holders', chip: 'Top10', description: 'Share of supply held by the 10 largest holders.' },
  { key: 'dev', label: 'Dev holding', chip: 'Dev', description: 'Share of supply the creator still holds.' },
  { key: 'insiders', label: 'Insiders', chip: 'Insiders', description: 'Share held by wallets linked to the dev.' },
  { key: 'bundlers', label: 'Bundlers', chip: 'Bundlers', description: 'Share of volume from same-block bundle buys.' },
  { key: 'snipers', label: 'Snipers', chip: 'Snipers', description: 'Share held by wallets that bought in the first blocks.' },
];

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export interface DisplaySettingsFormProps {
  value: DisplaySettings;
  onChange: (next: DisplaySettings) => void;
  errors: SettingsErrors;
}

/** Units, theme, live-update behaviour, trade confirmations and risk-chip thresholds. */
export function DisplaySettingsForm({ value, onChange, errors }: DisplaySettingsFormProps) {
  const { theme, setTheme } = useTheme();
  const set = <K extends keyof DisplaySettings>(key: K, v: DisplaySettings[K]) => onChange({ ...value, [key]: v });
  const setRisk = (key: keyof Thresholds, v: number) => set('riskThresholds', { ...value.riskThresholds, [key]: v });

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Display" icon={<Monitor size={14} />}>
        <div className="flex flex-col divide-y divide-line">
          <Row label="Theme" description="Applied right away on this device and saved to your account.">
            <SegmentedControl
              value={theme}
              onChange={setTheme}
              aria-label="Theme"
              items={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </Row>
          <Row label="Values in" description="Show amounts in USD or in the chain’s native token.">
            <SegmentedControl
              value={value.currency}
              onChange={(v) => set('currency', v)}
              aria-label="Currency"
              items={[
                { value: 'usd', label: 'USD' },
                { value: 'native', label: 'Native' },
              ]}
            />
          </Row>
          <Row label="Chart unit" description="Plot token charts by price or by market cap.">
            <SegmentedControl
              value={value.chartUnit}
              onChange={(v) => set('chartUnit', v)}
              aria-label="Chart unit"
              items={[
                { value: 'mcap', label: 'Market cap' },
                { value: 'price', label: 'Price' },
              ]}
            />
          </Row>
          <div className="flex flex-col gap-3 py-3">
            <Toggle checked={value.flashUpdates} onChange={(v) => set('flashUpdates', v)} label="Flash live updates" description="Briefly highlight numbers green or red when they change." />
            <Toggle checked={value.compactRows} onChange={(v) => set('compactRows', v)} label="Compact rows" description="Denser tables to fit more tokens on screen." />
            <Toggle checked={value.confirmTrades} onChange={(v) => set('confirmTrades', v)} label="Confirm trades" description="Ask before submitting buys and sells." />
            <Toggle checked={value.sounds} onChange={(v) => set('sounds', v)} label="Sounds" description="Play a sound on fills and alerts." />
            <Toggle checked={value.hotkeys} onChange={(v) => set('hotkeys', v)} label="Keyboard shortcuts" description="Trading hotkeys on token pages (B/S, number keys…)." />
          </div>
        </div>
      </Panel>

      <Panel title="Risk thresholds" icon={<ShieldAlert size={14} />} subtitle="Risk chips on token cards turn red above these levels">
        <div className="flex flex-col divide-y divide-line">
          {RISK_ROWS.map((r) => {
            const v = value.riskThresholds[r.key];
            const pct = Number.isFinite(v) ? Number((v * 100).toPrecision(10)) : null;
            const err = errors[path.risk(r.key)];
            return (
              <div key={r.key} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{r.label}</p>
                    <p className="text-xs text-muted">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5" aria-hidden>
                    <RiskChip label={r.chip} value={Number.isFinite(v) ? Math.max(0, v - 0.05) : null} threshold={v} />
                    <RiskChip label={r.chip} value={Number.isFinite(v) ? Math.min(1, v + 0.05) : null} threshold={v} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct ?? 0}
                    onChange={(e) => setRisk(r.key, Number(e.target.value) / 100)}
                    aria-label={`${r.label} threshold`}
                    className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent"
                  />
                  <NumberInput
                    value={pct}
                    onChange={(n) => setRisk(r.key, n === null ? NaN : n / 100)}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    size="sm"
                    aria-label={`${r.label} threshold percent`}
                    invalid={!!err}
                    wrapperClassName="!w-[84px]"
                  />
                </div>
                {err && <p className="text-xs text-down">{err}</p>}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
