// Merges per-provider findings into one report. Each field takes the value of
// the most authoritative provider that knows it; every conflicting known value
// is recorded as a disagreement. Unknown stays null.

import type { Address } from 'viem';
import type {
  CreatorInfo,
  Disagreement,
  EvmSecurityReport,
  FactKey,
  LpInfo,
  SecurityFacts,
  SecurityProvider,
  TopHolder,
} from './types';

export interface ProviderPool {
  /** Pair address or V4 pool id. */
  id: string;
  type: string;
  name: string;
  liquidityUsd: number;
}

/** What one provider contributed. Absent fields = the provider does not know. */
export interface ProviderReport {
  provider: SecurityProvider;
  facts: SecurityFacts;
  /** undefined = not reported; null = provider says there is no owner. */
  owner?: Address | null;
  name?: string;
  symbol?: string;
  creator?: CreatorInfo;
  holders?: TopHolder[];
  holderCount?: number;
  lp?: LpInfo;
  /** Every LP holder the provider listed (share of LP supply), locked or not. */
  lpHolders?: { address: Address; share: number; locked: boolean; tag: string | null }[];
  pools?: ProviderPool[];
  launchpadName?: string;
  notes?: string[];
}

/**
 * Authority on conflict, most authoritative first. Measured behaviour
 * (simulation) beats declared template facts, which beat bytecode heuristics,
 * which beat explorers and third-party scanners.
 */
export const PROVIDER_RANK: SecurityProvider[] = ['simulation', 'launchpad', 'onchain', 'explorer', 'honeypotis', 'goplus'];

const rank = (p: SecurityProvider) => PROVIDER_RANK.indexOf(p);

export const FACT_KEYS: FactKey[] = [
  'isOpenSource',
  'isRenounced',
  'isHoneypot',
  'buyTax',
  'sellTax',
  'transferTax',
  'cannotBuy',
  'cannotSellAll',
  'mintable',
  'proxy',
  'upgradeable',
  'ownerCanChangeBalance',
  'taxModifiable',
  'personalTaxModifiable',
  'blacklist',
  'whitelist',
  'pausable',
  'antiWhale',
  'antiWhaleModifiable',
  'tradingCooldown',
  'hiddenOwner',
  'canTakeBackOwnership',
  'selfDestruct',
  'externalCall',
];

/** Taxes closer than this (absolute, 0..1) are not reported as a disagreement. */
export const TAX_TOLERANCE = 0.01;

const TAX_KEYS = new Set<FactKey>(['buyTax', 'sellTax', 'transferTax']);

export interface MergedFacts {
  values: { [K in FactKey]-?: NonNullable<SecurityFacts[K]> | null };
  disagreements: Disagreement[];
}

export function mergeFacts(reports: ProviderReport[]): MergedFacts {
  const sorted = [...reports].sort((a, b) => rank(a.provider) - rank(b.provider));
  const values = {} as MergedFacts['values'];
  const disagreements: Disagreement[] = [];
  for (const key of FACT_KEYS) {
    const known = sorted.filter((r) => r.facts[key] !== undefined).map((r) => ({ provider: r.provider, value: r.facts[key] as boolean | number }));
    // A provider may appear twice (e.g. two explorer sources): keep its first (best) value.
    const seen = new Set<SecurityProvider>();
    const uniq = known.filter((k) => (seen.has(k.provider) ? false : (seen.add(k.provider), true)));
    (values as Record<FactKey, unknown>)[key] = uniq.length > 0 ? uniq[0].value : null;
    if (uniq.length < 2) continue;
    const chosen = uniq[0];
    const differs = uniq.some((k) =>
      TAX_KEYS.has(key) ? Math.abs((k.value as number) - (chosen.value as number)) > TAX_TOLERANCE : k.value !== chosen.value,
    );
    if (differs) disagreements.push({ field: key, values: uniq.map((k) => ({ provider: k.provider, value: k.value })), chosen: chosen.provider });
  }
  return { values, disagreements };
}

/** First report (by authority) that has the field. */
export function pick<T>(reports: ProviderReport[], get: (r: ProviderReport) => T | undefined): { value: T; provider: SecurityProvider } | null {
  for (const r of [...reports].sort((a, b) => rank(a.provider) - rank(b.provider))) {
    const v = get(r);
    if (v !== undefined) return { value: v, provider: r.provider };
  }
  return null;
}

/** Fields that count towards coverage: the headline answers, the flags and the holder / LP / creator facts. */
export const COVERAGE_FIELDS = [
  'isOpenSource',
  'isRenounced',
  'isHoneypot',
  'buyTax',
  'sellTax',
  'transferTax',
  'mintable',
  'proxy',
  'ownerCanChangeBalance',
  'taxModifiable',
  'blacklist',
  'pausable',
  'antiWhale',
  'tradingCooldown',
  'hiddenOwner',
  'selfDestruct',
  'externalCall',
  'lp',
  'holders',
  'creator',
] as const;

/** Share of COVERAGE_FIELDS with a known value (2 decimals). */
export function coverageOf(r: Pick<EvmSecurityReport, 'isOpenSource' | 'isRenounced' | 'isHoneypot' | 'buyTax' | 'sellTax' | 'transferTax' | 'flags' | 'lp' | 'holders' | 'creator'>): number {
  let known = 0;
  for (const f of COVERAGE_FIELDS) {
    let v: unknown;
    if (f === 'lp') v = r.lp && (r.lp.burnedShare !== null || r.lp.lockedShare !== null) ? true : null;
    else if (f === 'holders') v = r.holders && r.holders.length > 0 ? true : null;
    else if (f === 'creator') v = r.creator.address;
    else if (f in r.flags) v = r.flags[f as keyof EvmSecurityReport['flags']];
    else v = r[f as 'isOpenSource'];
    if (v !== null && v !== undefined) known++;
  }
  return Math.round((known / COVERAGE_FIELDS.length) * 100) / 100;
}
