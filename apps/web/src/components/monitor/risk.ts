// Rug risk of a feed token, read from its TokenRef: riskLevel comes from the
// token's latest security read (at most ~30s old) and already rates honeypots high.

import type { TokenRef } from '@trenchscope/shared';

/** 'unknown': the ref carries no security read (refs built client-side). */
export type RiskVerdict = 'risky' | 'ok' | 'unknown';

/** High composite rug risk (server riskLevel, honeypots included). */
export function tokenRisk(ref: Pick<TokenRef, 'riskLevel'>): RiskVerdict {
  if (!ref.riskLevel) return 'unknown';
  return ref.riskLevel === 'high' ? 'risky' : 'ok';
}
