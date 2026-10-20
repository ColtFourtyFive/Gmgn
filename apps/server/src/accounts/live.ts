// Live-mode request rules shared by every module: which chains are served, and
// a guard refusing requests that name any other chain.

import type { FastifyInstance } from 'fastify';
import { CHAIN_IDS, type ChainId } from '@trenchscope/shared';
import { HttpError, type AppConfig } from '../context';

/** Chains this server serves: every simulated chain in demo, the live chain (Solana) in live mode. */
export function enabledChains(config: Pick<AppConfig, 'mode' | 'live'>): readonly ChainId[] {
  return config.mode === 'live' ? [config.live?.chain ?? 'sol'] : CHAIN_IDS;
}

/**
 * Live mode, WebSocket side of the chain guard: a channel scoped to a chain (`trenches:<chain>`,
 * `token:<chain>:<address>`, ...) naming a chain this server does not serve is refused on `sub`.
 */
export function channelChainGuard(chains: readonly string[]): (ch: string) => string | null {
  const enabled = new Set(chains);
  const known = new Set<string>(CHAIN_IDS);
  return (ch) => {
    const chain = ch.split(':')[1];
    return chain && known.has(chain) && !enabled.has(chain) ? `chain_not_enabled: chain ${chain} is not available on this server` : null;
  };
}

/** `chain` query values that are not a chain ("every chain"). */
const CHAIN_WILDCARDS = new Set(['all']);

/**
 * Live mode: any request whose `chain` (path params, query or JSON body) is not an enabled chain
 * is refused with 400 'chain_not_enabled' before its handler runs.
 */
export function installChainGuard(app: FastifyInstance, chains: readonly string[]): void {
  const enabled = new Set(chains);
  const refused = (v: unknown): v is string => typeof v === 'string' && !enabled.has(v) && !CHAIN_WILDCARDS.has(v);
  app.addHook('preValidation', async (req) => {
    for (const source of [req.params, req.query, req.body]) {
      if (typeof source !== 'object' || source === null || Array.isArray(source)) continue;
      const chain = (source as Record<string, unknown>).chain;
      for (const v of Array.isArray(chain) ? chain : [chain]) {
        if (refused(v)) throw new HttpError(400, `chain ${v.slice(0, 16)} is not available on this server`, 'chain_not_enabled');
      }
    }
  });
}
