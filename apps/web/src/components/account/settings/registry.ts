// Settings page sections, in tab order. Add a section as its own component
// file plus one row here: SettingsPage shows the rows visible for the mode and
// account as tabs (?section=<id>) and renders the selected one. The first row
// is the default (routes.settings() links to it without ?section=).

import type { ComponentType, Dispatch, SetStateAction } from 'react';
import type { Account, AppMode, ChainId, UserSettings } from '@trenchscope/shared';
import { EyeOff, Monitor, ShieldCheck, SlidersHorizontal, UserRound, type LucideIcon } from 'lucide-react';
import { AccountSection } from './AccountSection';
import { BlacklistSection } from './BlacklistSection';
import { DisplaySection } from './DisplaySection';
import { displayDirty, type SettingsErrors } from './model';
import { SecuritySection } from './SecuritySection';
import { TradingSection } from './TradingSection';

/** The settings draft and editing state every section receives (sections with their own API ignore it). */
export interface SettingsSectionProps {
  /** Unsaved edits (saved with the page's Save). */
  draft: UserSettings;
  saved: UserSettings;
  setDraft: Dispatch<SetStateAction<UserSettings>>;
  /** Validation problems in the draft, keyed by field path. */
  errors: SettingsErrors;
  /** Chains whose trade settings have unsaved edits. */
  changedChains: Set<ChainId>;
  /** The chain the trading presets are shown for (?chain=). */
  chain: ChainId;
  onChain: (chain: ChainId) => void;
}

export interface SettingsSection {
  /** The ?section= value. */
  id: string;
  /** Tab label. */
  title: string;
  icon: LucideIcon;
  component: ComponentType<SettingsSectionProps>;
  /** Whether the tab exists for this deployment mode and account. */
  visible: (mode: AppMode, account: Account | null) => boolean;
  /** Unsaved edits in this section (a dot on the tab). */
  dirty?: (props: SettingsSectionProps) => boolean;
}

const always = () => true;

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'trading', title: 'Trading', icon: SlidersHorizontal, component: TradingSection, visible: always, dirty: (p) => p.changedChains.size > 0 },
  { id: 'display', title: 'Display', icon: Monitor, component: DisplaySection, visible: always, dirty: (p) => displayDirty(p.draft, p.saved) },
  { id: 'blacklist', title: 'Blacklist', icon: EyeOff, component: BlacklistSection, visible: always },
  { id: 'account', title: 'Account', icon: UserRound, component: AccountSection, visible: always },
  // Live adds account security (2FA, withdrawal whitelist).
  { id: 'security', title: 'Security', icon: ShieldCheck, component: SecuritySection, visible: (mode) => mode === 'live' },
];

/** The sections shown for this mode and account, in tab order. */
export function visibleSettingsSections(mode: AppMode, account: Account | null): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => s.visible(mode, account));
}
