// Settings → Display: units, theme, confirmations and risk thresholds, edited in the draft.

import { DisplaySettingsForm } from './DisplaySettingsForm';
import type { SettingsSectionProps } from './registry';

export function DisplaySection({ draft, setDraft, errors }: SettingsSectionProps) {
  return <DisplaySettingsForm value={draft.display} onChange={(display) => setDraft((d) => ({ ...d, display }))} errors={errors} />;
}
