// Mode identity: the header's Demo / Live badge, the live stack's status
// (feed connected / delayed with the last event's age / trading unavailable)
// for the status bar and the phone menu, the "Try demo" link and the banner
// shown while live trading is unavailable.

import { formatAge } from '@trenchscope/shared';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { useDemoUrl, useIsLive, useLiveStatus } from '@/hooks/useMode';
import { useNow } from '@/hooks/useNow';
import { liveHealth, useModeStore, type LiveHealth } from '@/lib/mode';

export const DEMO_LABEL = 'Demo · simulated market, paper balances';

/** How long a trade's 'trading_unavailable' keeps the banner up without a fresher live status. */
const TRADING_DOWN_FLAG_MS = 60_000;

const HEALTH: Record<LiveHealth, { label: string; dot: string; text: string }> = {
  connected: { label: 'Feed connected', dot: 'bg-up', text: 'text-up' },
  delayed: { label: 'Feed delayed', dot: 'bg-warn animate-pulse2', text: 'text-warn' },
  trading_unavailable: { label: 'Trading unavailable', dot: 'bg-down', text: 'text-down' },
  unknown: { label: 'Connecting', dot: 'bg-faint animate-pulse2', text: 'text-muted' },
};

/** Live health plus a one-line description ("Feed delayed · last event 2m ago"). */
export function useLiveHealth(): { health: LiveHealth; label: string; detail: string } {
  const live = useLiveStatus();
  const now = useNow();
  const tradingDownAt = useModeStore((s) => s.tradingDownAt);
  const liveAt = useModeStore((s) => s.liveAt);
  let health = liveHealth(live, now);
  // A trade was just refused for this reason: trust it over an older status, for a minute at most.
  if (health !== 'trading_unavailable' && tradingDownAt > liveAt && Date.now() - tradingDownAt < TRADING_DOWN_FLAG_MS) health = 'trading_unavailable';
  const last = live?.lastEventAt ? `last event ${formatAge(live.lastEventAt, now)} ago` : 'no events yet';
  const parts: string[] = [];
  if (health === 'delayed') parts.push(live && !live.feedConnected ? 'feed disconnected' : live && !live.rpcHealthy ? 'Solana RPC not answering' : last);
  else if (health === 'connected') parts.push(last);
  else if (health === 'trading_unavailable') parts.push('market data only, orders can’t be placed');
  if (live && health !== 'unknown') parts.push(`${live.trackedTokens.toLocaleString()} tokens tracked`);
  return { health, label: HEALTH[health].label, detail: parts.join(' · ') };
}

/**
 * Header badge: "Demo" (simulated market, paper balances) or "Live" with a
 * dot coloured by the live stack's health, once the server confirmed the
 * mode. Not interactive: the status bar and the phone menu carry the details.
 */
export function ModeBadge({ className }: { className?: string }) {
  const live = useIsLive();
  // Wait for /api/meta: a first visit to the live site must not flash "Demo" (the mode is cached afterwards).
  const known = useModeStore((s) => s.known);
  if (!known) return null;
  if (!live) {
    return (
      <span className={clsx('chip shrink-0 bg-panel-3 text-muted', className)} title={DEMO_LABEL} data-mode="demo">
        Demo
        <span className="sr-only"> · simulated market, paper balances</span>
      </span>
    );
  }
  return <LiveBadge className={className} />;
}

function LiveBadge({ className }: { className?: string }) {
  const { health, label, detail } = useLiveHealth();
  return (
    <span className={clsx('chip shrink-0 gap-1 bg-up/15 font-semibold text-up', className)} title={`Live trading on Solana · ${label}${detail ? ` · ${detail}` : ''}`} data-mode="live">
      <span className={clsx('h-1.5 w-1.5 rounded-full', HEALTH[health].dot)} aria-hidden />
      Live
      <span className="sr-only">
        {' '}
        · real funds on Solana · {label}
      </span>
    </span>
  );
}

/**
 * "Feed connected · last event 3s ago" line (live); `compact` keeps the label
 * only below xl. Only the health label is a live region: the event age ticks
 * every second and must not be announced each time.
 */
export function LiveStatusIndicator({ className, compact }: { className?: string; compact?: boolean }) {
  const { health, label, detail } = useLiveHealth();
  return (
    <span className={clsx('flex min-w-0 items-center gap-1.5 text-xs', className)} data-health={health} data-testid="live-status">
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', HEALTH[health].dot)} aria-hidden />
      <span className={clsx('whitespace-nowrap font-medium', HEALTH[health].text)} role="status">
        {label}
      </span>
      {/* The leading space separates the parts for screen readers; CSS drops it at the start of the flex item. */}
      {detail && <span className={clsx('truncate text-muted', compact && 'hidden xl:inline')}>{` · ${detail}`}</span>}
    </span>
  );
}

/** Link to the demo deployment (live, when MetaResponse.demoUrl is set). */
export function TryDemoLink({ className }: { className?: string }) {
  const url = useDemoUrl();
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={clsx('inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline', className)}>
      Try demo
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}

/** App-wide notice while live trading is unavailable (RPC / router / signer down, or a trade was just refused for it). */
export function TradingUnavailableBanner() {
  const live = useIsLive();
  if (!live) return null;
  return <TradingUnavailableNotice />;
}

function TradingUnavailableNotice() {
  const { health } = useLiveHealth();
  if (health !== 'trading_unavailable') return null;
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-down/30 bg-down/10 px-3 py-1.5 text-xs text-fg" data-testid="trading-unavailable">
      <TriangleAlert size={14} className="shrink-0 text-down" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold">Trading is temporarily unavailable.</span> Market data keeps updating; new orders can’t be sent until it’s back. No funds
        are moved meanwhile.
      </p>
    </div>
  );
}
