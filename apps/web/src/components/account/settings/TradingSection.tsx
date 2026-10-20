// Settings → Trading: the selected chain's presets and quick buttons, edited in the draft.

import type { SettingsSectionProps } from './registry';
import { TradingSettings } from './TradingSettings';

export function TradingSection({ chain, onChain, draft, setDraft, errors, changedChains }: SettingsSectionProps) {
  return (
    <TradingSettings
      chain={chain}
      onChain={onChain}
      value={draft.trade[chain]}
      onChange={(next) => setDraft((d) => ({ ...d, trade: { ...d.trade, [chain]: next } }))}
      errors={errors}
      dirty={changedChains}
    />
  );
}
