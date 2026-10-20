// Command palette model: command ranking, chain mentions and recent picks.
// Pure (no React) so the palette's search behaviour is unit-testable.

import { CHAIN_IDS, CHAINS, isChainId, type ChainId, type SearchResult, type TokenRef } from '@trenchscope/shared';
import { CHAIN_SHORT, WALLET_TAG_META } from '@/components/common';
import { fuzzyRank, type Ranked } from '@/lib/fuzzy';

export interface PaletteCommand {
  /** Stable id (also the recent-item key): "page:trending:bsc", "action:theme", "chain:eth". */
  id: string;
  group: 'Pages' | 'Actions' | 'Chains';
  title: string;
  subtitle?: string;
  /** Extra search terms. */
  keywords?: string[];
  /** Chain of a chain-scoped page (shown as an icon). */
  chain?: ChainId;
  /** Page on a chain other than the active one: listed only when the query names that chain. */
  otherChain?: boolean;
  run: () => void;
}

/**
 * Fuzzy matches below this score per typed character are noise ("bo" in
 * "Leaderboard"); a word-start or contiguous match clears it easily.
 */
const MIN_SCORE_PER_CHAR = 3;

function chainTerms(chain: ChainId): string[] {
  return [chain, CHAIN_SHORT[chain].toLowerCase(), CHAINS[chain].name.toLowerCase()];
}

/** Chains a query names by prefix ("bs", "bnb", "base", "solana"); one-letter terms name none. */
export function mentionedChains(query: string): ChainId[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  return CHAIN_IDS.filter((c) => terms.some((t) => chainTerms(c).some((k) => k.startsWith(t))));
}

/**
 * Commands matching `query`, best first. Pages of other chains join only
 * when the query names their chain ("trending bsc"), so plain queries list
 * the active chain's pages once.
 */
export function rankCommands(query: string, commands: readonly PaletteCommand[]): Ranked<PaletteCommand>[] {
  const named = mentionedChains(query);
  const pool = commands.filter((c) => !c.otherChain || (c.chain && named.includes(c.chain)));
  const min = MIN_SCORE_PER_CHAR * query.replace(/\s+/g, '').length;
  return fuzzyRank(query, pool, (c) => [c.title, c.subtitle ?? '', ...(c.keywords ?? [])]).filter((r) => r.score >= min);
}

export type PaletteToken = Pick<TokenRef, 'chain' | 'address' | 'symbol' | 'name' | 'logoSeed' | 'logoGlyph'>;
export type PaletteWallet = SearchResult['wallets'][number];

/** A recently opened palette item, persisted in localStorage (tokens without prices, which go stale). */
export type RecentItem = { type: 'command'; id: string } | { type: 'token'; token: PaletteToken } | { type: 'wallet'; wallet: PaletteWallet };

export const RECENT_KEY = 'ts.palette.recent';
export const MAX_RECENT = 5;

export function recentKey(item: RecentItem): string {
  if (item.type === 'command') return item.id;
  if (item.type === 'token') return `token:${item.token.chain}:${item.token.address}`;
  return `wallet:${item.wallet.chain}:${item.wallet.address}`;
}

/** Move `item` to the front, without duplicates, capped at MAX_RECENT. */
export function addRecent(list: readonly RecentItem[], item: RecentItem): RecentItem[] {
  const key = recentKey(item);
  return [item, ...list.filter((r) => recentKey(r) !== key)].slice(0, MAX_RECENT);
}

type Unchecked<T> = { [K in keyof T]?: unknown } | null | undefined;

const isString = (v: unknown): v is string => typeof v === 'string';

/** Every field the palette renders, so a bad entry is dropped instead of crashing the shell. */
function isPaletteToken(t: Unchecked<PaletteToken>): boolean {
  return !!t && isChainId(t.chain) && [t.address, t.symbol, t.name, t.logoSeed, t.logoGlyph].every(isString);
}

function isPaletteWallet(w: Unchecked<PaletteWallet>): boolean {
  return (
    !!w &&
    isChainId(w.chain) &&
    isString(w.address) &&
    isString(w.avatarSeed) &&
    (w.label === null || isString(w.label)) &&
    Array.isArray(w.tags) &&
    w.tags.every((tag) => isString(tag) && Object.hasOwn(WALLET_TAG_META, tag))
  );
}

/** Stored recents, dropping anything malformed (old formats, hand edits). */
export function validRecents(value: unknown): RecentItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is RecentItem => {
    if (!r || typeof r !== 'object') return false;
    const item = r as { type?: unknown; id?: unknown; token?: Unchecked<PaletteToken>; wallet?: Unchecked<PaletteWallet> };
    if (item.type === 'command') return isString(item.id);
    if (item.type === 'token') return isPaletteToken(item.token);
    if (item.type === 'wallet') return isPaletteWallet(item.wallet);
    return false;
  });
}
