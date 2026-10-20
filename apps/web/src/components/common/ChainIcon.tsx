import { CHAINS, getLaunchpad, type ChainId } from '@trenchscope/shared';
import clsx from 'clsx';
import { contrastText, tint } from './color';

/** Letter marks for chains (original, not the chains' logos). */
const CHAIN_MARK: Record<ChainId, string> = { sol: 'S', base: 'b', robinhood: 'R', bsc: 'B', eth: 'Ξ' };

/** Short unambiguous chain labels (Base, Robinhood Chain and Ethereum share the ETH symbol). */
export const CHAIN_SHORT: Record<ChainId, string> = { sol: 'SOL', base: 'Base', robinhood: 'Robinhood', bsc: 'BSC', eth: 'ETH' };

export interface ChainIconProps {
  chain: ChainId;
  size?: number;
  className?: string;
}

/** Round chain mark in the chain's brand color. */
export function ChainIcon({ chain, size = 16, className }: ChainIconProps) {
  const c = CHAINS[chain];
  return (
    <span
      role="img"
      aria-label={c.name}
      title={c.name}
      className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold leading-none', className)}
      style={{ width: size, height: size, background: c.color, color: contrastText(c.color), fontSize: Math.round(size * 0.6) }}
    >
      {CHAIN_MARK[chain]}
    </span>
  );
}

export interface ChainBadgeProps {
  chain: ChainId;
  /** Text after the icon: chain name (default), short label (SOL/BSC/Base/ETH), or none. */
  show?: 'name' | 'short' | 'none';
  className?: string;
}

/** Chain icon + name chip. */
export function ChainBadge({ chain, show = 'name', className }: ChainBadgeProps) {
  const c = CHAINS[chain];
  return (
    <span className={clsx('chip bg-panel-3 text-fg', className)}>
      <ChainIcon chain={chain} size={12} />
      {show === 'name' ? c.name : show === 'short' ? CHAIN_SHORT[chain] : null}
    </span>
  );
}

export interface LaunchpadBadgeProps {
  /** Launchpad id (TokenSummary.launchpad). Unknown ids render as-is. */
  launchpad: string;
  className?: string;
}

/** Launchpad name chip tinted with the launchpad's color. */
export function LaunchpadBadge({ launchpad, className }: LaunchpadBadgeProps) {
  const lp = getLaunchpad(launchpad);
  const color = lp?.color ?? 'rgb(var(--muted))';
  return (
    <span className={clsx('chip', className)} style={tint(color)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {lp?.name ?? launchpad}
    </span>
  );
}
