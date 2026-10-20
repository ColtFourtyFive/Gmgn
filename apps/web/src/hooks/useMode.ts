// Mode hooks (see lib/mode.ts): demo vs live, the chains this deployment
// serves and the live stack's health. useModeSync is mounted once by the shell.

import { useEffect } from 'react';
import type { AppMode, ChainId, LiveStatus } from '@trenchscope/shared';
import { applyMeta, useModeStore } from '@/lib/mode';
import { useMeta } from './useMeta';

/** 'demo' (simulator, paper balances) or 'live' (real Solana trading). */
export function useMode(): AppMode {
  return useModeStore((s) => s.mode);
}

export function useIsLive(): boolean {
  return useModeStore((s) => s.mode === 'live');
}

/** Chains this deployment serves (live: Solana), in display order. */
export function useEnabledChains(): ChainId[] {
  return useModeStore((s) => s.enabledChains);
}

/** Live stack health from the last meta answer (null in demo or before it). */
export function useLiveStatus(): LiveStatus | null {
  return useModeStore((s) => s.live);
}

/** The demo site's URL (live mode), when configured. */
export function useDemoUrl(): string | null {
  return useModeStore((s) => (s.mode === 'live' ? s.demoUrl : null));
}

/** index.html's description names the simulator; the live deployment describes itself instead. */
const LIVE_DESCRIPTION = 'Trenchscope — real-time Solana memecoin trading terminal: trenches, trending, smart money, copy trading and sniping.';

/** Copy the meta query's mode, chains and live status into the mode store (mount once, in the shell). */
export function useModeSync(): void {
  const meta = useMeta().data;
  const live = meta?.mode === 'live';
  useEffect(() => {
    if (meta) applyMeta(meta);
  }, [meta]);
  useEffect(() => {
    if (live) document.querySelector('meta[name="description"]')?.setAttribute('content', LIVE_DESCRIPTION);
  }, [live]);
}
