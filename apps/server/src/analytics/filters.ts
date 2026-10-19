// Shared TokenFilters matcher + zod schemas. Used by Trenches, Trending and
// New Pairs (and by any other module that needs to evaluate the same filter
// objects the web sends). Semantics:
//   - every field is optional; an undefined field never filters
//   - ranges are inclusive; an undefined (or null) bound is open
//   - volumeUsd / swaps / priceChange are evaluated on the list's window
//     (Trenches + New Pairs use 24h, Trending uses the requested window)
//   - all *Rate fields are 0..1 fractions, priceChange is a ratio (0.25 = +25%)

import { z } from 'zod';
import type { ChainId, Range, StatWindow, TokenFilters, TokenSummary, TrenchesColumn } from '@trenchscope/shared';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const bound = z
  .number()
  .finite()
  .nullable()
  .optional()
  .transform((v) => (v === null ? undefined : v));

export const rangeSchema = z.object({ min: bound, max: bound }).strict();

const shortString = z.string().max(100);

/** Strict schema: unknown keys are rejected (silently ignoring a misspelt filter is worse than a 400). */
export const tokenFiltersSchema = z
  .object({
    launchpads: z.array(z.string().max(40)).max(50).optional(),
    keyword: shortString.optional(),
    excludeKeywords: z.array(shortString).max(50).optional(),
    ageMinutes: rangeSchema.optional(),
    marketCapUsd: rangeSchema.optional(),
    liquidityUsd: rangeSchema.optional(),
    volumeUsd: rangeSchema.optional(),
    holderCount: rangeSchema.optional(),
    swaps: rangeSchema.optional(),
    progress: rangeSchema.optional(),
    top10HolderRate: rangeSchema.optional(),
    devHoldRate: rangeSchema.optional(),
    insiderHoldRate: rangeSchema.optional(),
    sniperHoldRate: rangeSchema.optional(),
    bundlerRate: rangeSchema.optional(),
    rugRatio: rangeSchema.optional(),
    freshWalletRate: rangeSchema.optional(),
    smartDegenCount: rangeSchema.optional(),
    kolCount: rangeSchema.optional(),
    devCreatedCount: rangeSchema.optional(),
    devMigratedCount: rangeSchema.optional(),
    priceChange: rangeSchema.optional(),
    requireSocials: z.boolean().optional(),
    requireTwitter: z.boolean().optional(),
    requireTelegram: z.boolean().optional(),
    requireWebsite: z.boolean().optional(),
    hideDevSold: z.boolean().optional(),
    onlyDevSold: z.boolean().optional(),
    hideCopycats: z.boolean().optional(),
    hideWashTrading: z.boolean().optional(),
    safeOnly: z.boolean().optional(),
    lpBurned: z.boolean().optional(),
    boostedOnly: z.boolean().optional(),
  })
  .strict();

export const trenchesFiltersSchema = z
  .object({
    new: tokenFiltersSchema.optional(),
    almost: tokenFiltersSchema.optional(),
    migrated: tokenFiltersSchema.optional(),
  })
  .strict();

export type ParsedTokenFilters = z.infer<typeof tokenFiltersSchema>;
export type ParsedTrenchesFilters = z.infer<typeof trenchesFiltersSchema>;

/** Error thrown for malformed filter input; routes map it to 400. */
export class FilterParseError extends Error {}

function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'invalid filters';
  const path = issue.path.length ? issue.path.join('.') : 'filters';
  return `invalid filters: ${path}: ${issue.message}`;
}

/** Validate an already-decoded filters object (WS params). Returns undefined for null/undefined. */
export function validateTokenFilters(value: unknown): TokenFilters | undefined {
  if (value === undefined || value === null) return undefined;
  const r = tokenFiltersSchema.safeParse(value);
  if (!r.success) throw new FilterParseError(zodMessage(r.error));
  return r.data as TokenFilters;
}

export function validateTrenchesFilters(value: unknown): Partial<Record<TrenchesColumn, TokenFilters>> | undefined {
  if (value === undefined || value === null) return undefined;
  const r = trenchesFiltersSchema.safeParse(value);
  if (!r.success) throw new FilterParseError(zodMessage(r.error));
  return r.data as Partial<Record<TrenchesColumn, TokenFilters>>;
}

function decodeJson(raw: string | undefined): unknown {
  if (raw === undefined || raw === '') return undefined;
  if (raw.length > 8192) throw new FilterParseError('filters too long');
  try {
    return JSON.parse(raw);
  } catch {
    throw new FilterParseError('filters must be JSON');
  }
}

/** Parse a JSON-encoded `filters` query param (TokenFilters). */
export function parseTokenFiltersParam(raw: string | undefined): TokenFilters | undefined {
  return validateTokenFilters(decodeJson(raw));
}

/** Parse a JSON-encoded trenches `filters` query param (per-column TokenFilters). */
export function parseTrenchesFiltersParam(raw: string | undefined): Partial<Record<TrenchesColumn, TokenFilters>> | undefined {
  return validateTrenchesFilters(decodeJson(raw));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Inclusive range check; undefined range or bounds are open. NaN values never match a bounded range. */
export function inRange(value: number, r: Range | undefined): boolean {
  if (!r) return true;
  const { min, max } = r;
  if (min !== undefined && min !== null && !(value >= min)) return false;
  if (max !== undefined && max !== null && !(value <= max)) return false;
  return true;
}

/** True when a range actually constrains something. */
export function hasBounds(r: Range | undefined): boolean {
  return !!r && ((r.min !== undefined && r.min !== null) || (r.max !== undefined && r.max !== null));
}

export function isEvmChain(chain: ChainId): boolean {
  return chain !== 'sol';
}

/** Case-insensitive name/symbol containment. `needle` must already be lower-cased. */
function textHas(s: { symbol: string; name: string }, needle: string): boolean {
  if (!needle) return false;
  return s.symbol.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle);
}

function normKeyword(k: string): string {
  return k.trim().replace(/^\$/, '').toLowerCase();
}

/**
 * Filters that only need identity / market fields (no stats, no security).
 * Cheap enough to run on raw token state before building a summary; the full
 * matcher re-checks them so it stays self-contained.
 */
export interface IdentitySubject {
  chain: ChainId;
  symbol: string;
  name: string;
  launchpad: string;
  createdAt: number;
  marketCapUsd: number;
  liquidityUsd: number;
  holderCount: number;
  progress: number;
  socials: { twitter?: string; telegram?: string; website?: string };
  boosted: boolean;
  isCopycat: boolean;
}

export function matchIdentityFilters(s: IdentitySubject, f: TokenFilters | undefined, now: number): boolean {
  if (!f) return true;
  if (f.launchpads && f.launchpads.length > 0 && !f.launchpads.includes(s.launchpad)) return false;
  if (f.keyword !== undefined) {
    const k = normKeyword(f.keyword);
    if (k && !textHas(s, k)) return false;
  }
  if (f.excludeKeywords && f.excludeKeywords.length > 0) {
    for (const raw of f.excludeKeywords) {
      const k = normKeyword(raw);
      if (k && textHas(s, k)) return false;
    }
  }
  if (f.ageMinutes && !inRange((now - s.createdAt) / 60000, f.ageMinutes)) return false;
  if (!inRange(s.marketCapUsd, f.marketCapUsd)) return false;
  if (!inRange(s.liquidityUsd, f.liquidityUsd)) return false;
  if (!inRange(s.holderCount, f.holderCount)) return false;
  if (!inRange(s.progress, f.progress)) return false;
  const so = s.socials;
  if (f.requireSocials && !(so.twitter || so.telegram || so.website)) return false;
  if (f.requireTwitter && !so.twitter) return false;
  if (f.requireTelegram && !so.telegram) return false;
  if (f.requireWebsite && !so.website) return false;
  if (f.boostedOnly && !s.boosted) return false;
  if (f.hideCopycats && s.isCopycat) return false;
  return true;
}

/**
 * Chain-aware "safe" predicate (GMGN default safety tags):
 *   SOL: mint + freeze authority renounced
 *   EVM: not a honeypot + verified source + ownership renounced (unknown = not safe)
 */
export function isSafeToken(s: TokenSummary): boolean {
  const sec = s.security;
  if (!isEvmChain(s.chain)) return sec.renouncedMint === true && sec.renouncedFreeze === true;
  return sec.isHoneypot === false && sec.isOpenSource === true && sec.isRenounced === true;
}

/** LP counts as burned at >= 99% (curve tokens have no LP yet and never match). */
export function isLpBurned(s: TokenSummary): boolean {
  return s.security.lpBurnedRate !== null && s.security.lpBurnedRate >= 0.99;
}

/** Full matcher over a TokenSummary, evaluating window-scoped fields on `window`. */
export function matchTokenFilters(s: TokenSummary, f: TokenFilters | undefined, window: StatWindow, now: number): boolean {
  if (!f) return true;
  if (!matchIdentityFilters(s, f, now)) return false;
  const w = s.stats[window];
  if (!inRange(w.volumeUsd, f.volumeUsd)) return false;
  if (!inRange(w.swaps, f.swaps)) return false;
  if (!inRange(w.priceChange, f.priceChange)) return false;
  const sec = s.security;
  if (!inRange(sec.top10HolderRate, f.top10HolderRate)) return false;
  if (!inRange(sec.devHoldRate, f.devHoldRate)) return false;
  if (!inRange(sec.insiderHoldRate, f.insiderHoldRate)) return false;
  if (!inRange(sec.sniperHoldRate, f.sniperHoldRate)) return false;
  if (!inRange(sec.bundlerRate, f.bundlerRate)) return false;
  if (!inRange(sec.rugRatio, f.rugRatio)) return false;
  if (!inRange(sec.freshWalletRate, f.freshWalletRate)) return false;
  if (!inRange(s.smartDegenCount, f.smartDegenCount)) return false;
  if (!inRange(s.kolCount, f.kolCount)) return false;
  if (!inRange(s.devCreatedCount, f.devCreatedCount)) return false;
  if (!inRange(s.devMigratedCount, f.devMigratedCount)) return false;
  if (f.hideDevSold && sec.devStatus === 'sold_all') return false;
  if (f.onlyDevSold && sec.devStatus !== 'sold_all') return false;
  if (f.hideWashTrading && sec.isWashTrading) return false;
  if (f.safeOnly && !isSafeToken(s)) return false;
  if (f.lpBurned && !isLpBurned(s)) return false;
  return true;
}

/** True when the filters reference anything beyond identity/market fields (needs a full summary). */
export function needsSummary(f: TokenFilters | undefined): boolean {
  if (!f) return false;
  return (
    hasBounds(f.volumeUsd) ||
    hasBounds(f.swaps) ||
    hasBounds(f.priceChange) ||
    hasBounds(f.top10HolderRate) ||
    hasBounds(f.devHoldRate) ||
    hasBounds(f.insiderHoldRate) ||
    hasBounds(f.sniperHoldRate) ||
    hasBounds(f.bundlerRate) ||
    hasBounds(f.rugRatio) ||
    hasBounds(f.freshWalletRate) ||
    hasBounds(f.smartDegenCount) ||
    hasBounds(f.kolCount) ||
    hasBounds(f.devCreatedCount) ||
    hasBounds(f.devMigratedCount) ||
    !!f.hideDevSold ||
    !!f.onlyDevSold ||
    !!f.hideWashTrading ||
    !!f.safeOnly ||
    !!f.lpBurned
  );
}
