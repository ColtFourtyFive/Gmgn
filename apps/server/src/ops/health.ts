// Readiness: is this process able to serve the market right now? The sim
// clock / engine must be running (it drives every list, channel and order
// trigger); in live mode the configured core pieces of the live stack (the
// market feed, the Solana RPC when one is configured) must be up. Per-chain
// live status is reported when the live market exposes it; a chain that is
// down degrades readiness but does not fail it. Only booleans, counts and
// timestamps are returned: never URLs, keys or error messages.

import type { AppMode, LiveStatus } from '@trenchscope/shared';
import type { AppContext } from '../context';

export type CheckState = 'ok' | 'down' | 'not_configured';

export interface ChainLiveStatus {
  chain: string;
  feedConnected?: boolean;
  rpcHealthy?: boolean;
  tradingEnabled?: boolean;
  trackedTokens?: number;
  lastEventAt?: number | null;
}

export interface Readiness {
  status: 'ready' | 'not_ready';
  mode: AppMode;
  /** Core checks: any 'down' makes the server not ready (503). */
  checks: Record<string, CheckState>;
  /** Non-core parts that are down (e.g. one live chain's feed). */
  degraded: string[];
  live?: {
    signer: string;
    tradingEnabled: boolean;
    trackedTokens: number;
    lastEventAt: number | null;
    /** Configuration problems reported at boot (count only; the messages are in the server log). */
    problems: number;
    chains: ChainLiveStatus[];
  };
}

/** The live market's status, or null in demo mode or when it fails (the failure is not exposed). */
export function safeLiveStatus(ctx: AppContext): LiveStatus | null {
  if (ctx.config.mode !== 'live') return null;
  try {
    return ctx.market.liveStatus();
  } catch (err) {
    console.error('[ops] liveStatus failed', err);
    return null;
  }
}

/**
 * Per-chain live status: `status.chains` when the live market reports one (an array of
 * { chain, ... } or a record keyed by chain), otherwise the top-level status as the primary chain.
 * Only known boolean / number fields are kept.
 */
function hasChainReport(status: LiveStatus): boolean {
  const raw = (status as unknown as { chains?: unknown }).chains;
  return Boolean(raw && typeof raw === 'object' && Object.keys(raw).length > 0);
}

export function liveChains(ctx: AppContext, status: LiveStatus): ChainLiveStatus[] {
  const raw = (status as unknown as { chains?: unknown }).chains;
  const entries: [string, unknown][] = [];
  if (Array.isArray(raw)) {
    for (const c of raw) if (c && typeof c === 'object' && typeof (c as { chain?: unknown }).chain === 'string') entries.push([(c as { chain: string }).chain, c]);
  } else if (raw && typeof raw === 'object') {
    for (const [chain, c] of Object.entries(raw)) if (c && typeof c === 'object') entries.push([chain, c]);
  }
  if (entries.length === 0) entries.push([ctx.config.live?.chain ?? 'sol', status]);
  return entries.map(([chain, c]) => pickChain(chain, c as Record<string, unknown>));
}

function pickChain(chain: string, c: Record<string, unknown>): ChainLiveStatus {
  const out: ChainLiveStatus = { chain: chain.slice(0, 32) };
  for (const k of ['feedConnected', 'rpcHealthy', 'tradingEnabled'] as const) if (typeof c[k] === 'boolean') out[k] = c[k] as boolean;
  if (typeof c.trackedTokens === 'number') out.trackedTokens = c.trackedTokens;
  if (typeof c.lastEventAt === 'number' || c.lastEventAt === null) out.lastEventAt = c.lastEventAt as number | null;
  return out;
}

export function readiness(ctx: AppContext): Readiness {
  const checks: Record<string, CheckState> = { engine: ctx.engine.running ? 'ok' : 'down' };
  const degraded: string[] = [];
  let live: Readiness['live'];

  if (ctx.config.mode === 'live') {
    const status = safeLiveStatus(ctx);
    if (!status) {
      checks.feed = 'down';
    } else {
      checks.feed = status.feedConnected ? 'ok' : 'down';
      checks.rpc = ctx.config.live?.rpcUrl ? (status.rpcHealthy ? 'ok' : 'down') : 'not_configured';
      const chains = liveChains(ctx, status);
      // Only a per-chain report degrades: without one the single entry is the top-level status checked above.
      if (hasChainReport(status)) for (const c of chains) if (c.feedConnected === false || c.rpcHealthy === false) degraded.push(`chain:${c.chain}`);
      live = {
        signer: /^[a-z][a-z0-9-]{0,31}$/.test(status.signer) ? status.signer : 'other',
        tradingEnabled: status.tradingEnabled,
        trackedTokens: status.trackedTokens,
        lastEventAt: status.lastEventAt,
        problems: ctx.config.liveProblems.length,
        chains,
      };
    }
    // The durable store (accounts, fills, transfers) once live mode wires one in.
    if (ctx.store === null) degraded.push('store:not_configured');
  }

  const ready = Object.values(checks).every((s) => s !== 'down');
  return { status: ready ? 'ready' : 'not_ready', mode: ctx.config.mode, checks, degraded, ...(live ? { live } : {}) };
}
