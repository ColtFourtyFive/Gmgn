import type { SniperKind } from '@trenchscope/shared';
import { Code, GraduationCap, Rocket, type LucideIcon } from 'lucide-react';

export const SNIPER_KIND: Record<SniperKind, { label: string; short: string; icon: LucideIcon; description: string }> = {
  new_token: {
    label: 'New launches',
    short: 'New token',
    icon: Rocket,
    description: 'Buy fresh launches on the bonding curve the moment they match your filters.',
  },
  migration: {
    label: 'Migrations',
    short: 'Migration',
    icon: GraduationCap,
    description: 'Buy tokens the instant they complete their curve and migrate to the DEX pool.',
  },
  dev_launch: {
    label: 'Dev launches',
    short: 'Dev launch',
    icon: Code,
    description: 'Buy whenever one of the dev wallets you list launches a new token.',
  },
};

export const SNIPER_KINDS = Object.keys(SNIPER_KIND) as SniperKind[];
