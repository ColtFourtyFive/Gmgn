// Deployment mode (MetaResponse.mode): 'demo' runs the market simulator with
// paper balances, 'live' trades real Solana tokens from embedded wallets. The
// shell copies /api/meta into this store (useModeSync); components read it
// with the hooks in hooks/useMode.ts, plain code with getMode() and friends.
//
// Until the first meta answer arrives the store holds the mode this browser
// saw last on this origin (each deployment has its own origin), else demo.

import { create } from 'zustand';
import { CHAIN_IDS, isChainId, type AppMode, type ChainId, type LiveStatus, type MetaResponse } from '@trenchscope/shared';
import { lastChain } from './chain';

const MODE_KEY = 'ts.mode';

/** A live feed event older than this marks the feed as delayed. */
export const FEED_DELAYED_MS = 60_000;

interface ModeState {
  mode: AppMode;
  /** True once /api/meta answered (the mode is confirmed, not a cached guess). */
  known: boolean;
  /** Chains this deployment serves, in display order. */
  enabledChains: ChainId[];
  /** Live stack health (live mode, refreshed with meta). */
  live: LiveStatus | null;
  /** Where the demo runs (live mode), when configured. */
  demoUrl: string | null;
  /** Platform fee the server charges (meta.platformFeeRate), null before meta. */
  platformFeeRate: number | null;
  /** When a trade last failed with 'trading_unavailable' (client ms, 0 = never). */
  tradingDownAt: number;
  /** When the live status was last read from meta (client ms, 0 = never). */
  liveAt: number;
}

function readCachedMode(): AppMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'demo';
  } catch {
    return 'demo';
  }
}

function writeCachedMode(mode: AppMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

/** Live serves Solana only until meta says otherwise; demo serves every chain. */
function defaultChains(mode: AppMode): ChainId[] {
  return mode === 'live' ? ['sol'] : [...CHAIN_IDS];
}

function initialState(): ModeState {
  const mode = readCachedMode();
  return { mode, known: false, enabledChains: defaultChains(mode), live: null, demoUrl: null, platformFeeRate: null, tradingDownAt: 0, liveAt: 0 };
}

export const useModeStore = create<ModeState>(() => initialState());

/** Adopt a meta answer (mode, enabled chains, live status, demo link). */
export function applyMeta(meta: Pick<MetaResponse, 'mode' | 'enabledChains' | 'live' | 'demoUrl' | 'platformFeeRate'>): void {
  const mode: AppMode = meta.mode === 'live' ? 'live' : 'demo';
  const chains = (meta.enabledChains ?? []).filter(isChainId);
  const prev = useModeStore.getState();
  const enabledChains = chains.length > 0 ? CHAIN_IDS.filter((c) => chains.includes(c)) : defaultChains(mode);
  if (prev.mode !== mode || !prev.known) writeCachedMode(mode);
  useModeStore.setState({
    mode,
    known: true,
    // Keep the array identity when nothing changed so subscribers do not re-render every refetch.
    enabledChains: sameList(prev.enabledChains, enabledChains) ? prev.enabledChains : enabledChains,
    live: mode === 'live' ? (meta.live ?? null) : null,
    liveAt: Date.now(),
    demoUrl: safeHttpUrl(meta.demoUrl),
    platformFeeRate: typeof meta.platformFeeRate === 'number' ? meta.platformFeeRate : null,
  });
}

function sameList(a: readonly ChainId[], b: readonly ChainId[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/** `raw` when it is an absolute http(s) URL; null otherwise (never render javascript: links). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

export function getMode(): AppMode {
  return useModeStore.getState().mode;
}

export function isLiveMode(): boolean {
  return useModeStore.getState().mode === 'live';
}

export function enabledChains(): ChainId[] {
  return useModeStore.getState().enabledChains;
}

export function isChainEnabled(chain: ChainId): boolean {
  return useModeStore.getState().enabledChains.includes(chain);
}

/** The chain to open by default: the last used one when this deployment serves it, else the first it serves. */
export function defaultChain(): ChainId {
  const last = lastChain();
  const chains = enabledChains();
  return chains.includes(last) ? last : (chains[0] ?? 'sol');
}

/** A trade just failed with 'trading_unavailable': show the banner until a newer live status says trading is back. */
export function flagTradingUnavailable(at = Date.now()): void {
  useModeStore.setState({ tradingDownAt: at });
}

/** Test helper: back to the boot state (reads the cached mode again). */
export function resetModeStore(): void {
  useModeStore.setState(initialState(), true);
}

export type LiveHealth = 'connected' | 'delayed' | 'trading_unavailable' | 'unknown';

/**
 * One word for the live stack: trading unavailable wins (orders cannot be
 * placed), then a disconnected or quiet feed (data may be stale), else
 * connected. `now` is server time (serverNow()).
 */
export function liveHealth(live: LiveStatus | null, now: number, delayedMs = FEED_DELAYED_MS): LiveHealth {
  if (!live) return 'unknown';
  if (!live.tradingEnabled) return 'trading_unavailable';
  if (!live.feedConnected || !live.rpcHealthy) return 'delayed';
  if (live.lastEventAt === null || now - live.lastEventAt > delayedMs) return 'delayed';
  return 'connected';
}
