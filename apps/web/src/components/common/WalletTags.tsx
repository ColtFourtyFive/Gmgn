import { memo } from 'react';
import type { WalletTag } from '@trenchscope/shared';
import { Boxes, Bot, Brain, Code, Crosshair, Crown, Megaphone, Sandwich, Sprout, Star, User, VenetianMask, Waves, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Tooltip } from '@/components/ui/Tooltip';

export interface WalletTagMeta {
  label: string;
  icon: LucideIcon;
  /** CSS color token name (index.css), e.g. "smart". */
  token: string;
  description: string;
}

/** Display metadata + plain-language definitions for every WalletTag. */
export const WALLET_TAG_META: Record<WalletTag, WalletTagMeta> = {
  smart: { label: 'Smart', icon: Brain, token: 'smart', description: 'Smart money — a wallet with a statistically proven record of profitable trades.' },
  kol: { label: 'KOL', icon: Megaphone, token: 'kol', description: 'Key opinion leader — a publicly known influencer wallet.' },
  sniper: { label: 'Sniper', icon: Crosshair, token: 'sniper', description: 'Bought within the first blocks after launch.' },
  bundler: { label: 'Bundler', icon: Boxes, token: 'bundler', description: 'Bought in the same block as the token creation; likely linked to the dev.' },
  insider: { label: 'Insider', icon: VenetianMask, token: 'insider', description: 'Funded by or linked to the dev and accumulated early.' },
  dev: { label: 'Dev', icon: Code, token: 'dev', description: 'The token creator (or the dev team’s wallet).' },
  whale: { label: 'Whale', icon: Waves, token: 'whale', description: 'Holds a large native balance or position.' },
  fresh: { label: 'Fresh', icon: Sprout, token: 'fresh', description: 'Newly created wallet with little history.' },
  bot: { label: 'Bot', icon: Bot, token: 'bot', description: 'High-frequency trading bot.' },
  sandwich: { label: 'MEV', icon: Sandwich, token: 'down', description: 'MEV sandwich bot — front-runs and back-runs other traders’ swaps.' },
  top_holder: { label: 'Top 10', icon: Crown, token: 'warn', description: 'One of the token’s top 10 holders.' },
  following: { label: 'Following', icon: Star, token: 'info', description: 'A wallet you follow.' },
  you: { label: 'You', icon: User, token: 'accent', description: 'Your own paper wallet.' },
};

export interface WalletTagBadgeProps {
  tag: WalletTag;
  /** Show the text label next to the icon (default: icon only). */
  showLabel?: boolean;
  className?: string;
}

/** Colored icon chip for one wallet tag, with its definition as tooltip. */
export const WalletTagBadge = memo(function WalletTagBadge({ tag, showLabel, className }: WalletTagBadgeProps) {
  const meta = WALLET_TAG_META[tag];
  const Icon = meta.icon;
  return (
    <Tooltip
      content={
        <>
          <span className="font-semibold">{meta.label}</span> — {meta.description}
        </>
      }
    >
      <span
        role={showLabel ? undefined : 'img'}
        aria-label={showLabel ? undefined : meta.label}
        className={clsx('chip !px-1 !py-0', showLabel && '!px-1.5', className)}
        style={{ color: `rgb(var(--${meta.token}))`, backgroundColor: `rgb(var(--${meta.token}) / 0.14)` }}
      >
        <Icon size={11} strokeWidth={2.25} aria-hidden />
        {showLabel && meta.label}
      </span>
    </Tooltip>
  );
});

export interface WalletTagsProps {
  tags: WalletTag[];
  /** Show at most this many; the rest collapse into "+N" with a tooltip. */
  max?: number;
  showLabel?: boolean;
  className?: string;
}

/** Row of wallet tag chips. */
export function WalletTags({ tags, max = 4, showLabel, className }: WalletTagsProps) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.slice(max);
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-0.5', className)}>
      {shown.map((t) => (
        <WalletTagBadge key={t} tag={t} showLabel={showLabel} />
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((t) => WALLET_TAG_META[t].label).join(', ')}>
          <span className="chip bg-panel-3 !px-1 !py-0 text-muted" tabIndex={0}>
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
