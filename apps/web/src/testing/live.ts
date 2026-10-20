// Test helpers: switch the web app into live mode the way the shell does
// (a MetaResponse in the mode store) and back to the demo boot state.

import type { LiveStatus } from '@trenchscope/shared';
import { applyMeta, resetModeStore } from '@/lib/mode';

export const LIVE_STATUS: LiveStatus = {
  feedConnected: true,
  lastEventAt: Date.now(),
  rpcHealthy: true,
  signer: 'turnkey',
  tradingEnabled: true,
  trackedTokens: 1234,
};

export const DEMO_URL = 'https://demo.trenchscope.test';

/** Live mode, Solana only, healthy stack (override any status field). */
export function enterLive(status: Partial<LiveStatus> = {}, opts: { demoUrl?: string | null; platformFeeRate?: number } = {}): void {
  applyMeta({
    mode: 'live',
    enabledChains: ['sol'],
    live: { ...LIVE_STATUS, lastEventAt: Date.now(), ...status },
    demoUrl: opts.demoUrl === undefined ? DEMO_URL : opts.demoUrl,
    platformFeeRate: opts.platformFeeRate ?? 0.01,
  });
}

/** Back to the demo boot state (forgets the cached mode and any live acknowledgement). */
export function leaveLive(): void {
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  resetModeStore();
}
