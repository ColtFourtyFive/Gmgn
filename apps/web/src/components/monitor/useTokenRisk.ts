// Rug-risk lookup for tokens in a feed. Feed items carry a TokenRef without
// security data, so the risk filter reads each token's detail once (shared
// ['token-meta', chain, address] cache, refreshed every 2 minutes).

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { ChainId, TokenDetail } from '@trenchscope/shared';
import { api } from '@/lib/api';

/** 'checking' = lookup in flight; 'unknown' = not looked up (filter off or beyond the lookup cap). */
export type RiskVerdict = 'risky' | 'ok' | 'checking' | 'unknown';

/** High composite rug risk (server riskLevel) or a honeypot. */
export function isRisky(t: TokenDetail): boolean {
  const s = t.security;
  return s.riskLevel === 'high' || s.isHoneypot === true;
}

const MAX_LOOKUPS = 60;

/**
 * Risk verdict per token address. Idle (everything 'unknown') unless
 * `enabled`. Failed lookups count as 'ok' so a missing token never hides rows.
 */
export function useTokenRisk(chain: ChainId, addresses: string[], enabled: boolean): { verdict: (address: string) => RiskVerdict; checking: number } {
  const list = useMemo(() => (enabled ? [...new Set(addresses)].slice(0, MAX_LOOKUPS) : []), [addresses, enabled]);
  return useQueries({
    queries: list.map((address) => ({
      queryKey: ['token-meta', chain, address],
      queryFn: () => api.token(chain, address),
      staleTime: 120_000,
      retry: false,
    })),
    combine: (results) => {
      const map = new Map<string, RiskVerdict>();
      let checking = 0;
      results.forEach((r, i) => {
        if (r.data) map.set(list[i], isRisky(r.data) ? 'risky' : 'ok');
        else if (r.isError) map.set(list[i], 'ok');
        else {
          map.set(list[i], 'checking');
          checking++;
        }
      });
      return { verdict: (address: string) => map.get(address) ?? 'unknown', checking };
    },
  });
}
