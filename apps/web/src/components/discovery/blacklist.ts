// The viewer's blacklist (hidden tokens, devs and name keywords; docs/API.md
// "Blacklist"): the shared query, hide / unhide actions with optimistic
// updates, and the exclusions every discovery list merges into its filters.
// The server stores the lists but never applies them on its own.

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Blacklist, BlacklistKind, ChainId, TokenFilters } from '@trenchscope/shared';
import { serverNow } from '@/hooks/useNow';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { requireAuth, useSession } from '@/store/session';
import { toast } from '@/store/toasts';

export const BLACKLIST_QUERY_KEY = ['blacklist'] as const;

/** Server cap of TokenFilters.excludeKeywords. */
const MAX_FILTER_KEYWORDS = 50;

/** Stored form of an address (EVM lower-cased, as the server keeps them). */
export const normBlacklistAddress = (a: string) => (/^0x/i.test(a) ? a.toLowerCase() : a);
/** Stored form of a keyword: trimmed, lower-cased, no leading "$". */
export const normBlacklistKeyword = (k: string) => k.trim().replace(/^\$/, '').trim().toLowerCase();

export type Exclusions = Pick<TokenFilters, 'excludeAddresses' | 'excludeCreators' | 'excludeKeywords'>;

/** One chain's slice of a blacklist as TokenFilters exclusions (empty lists left out). */
export function blacklistExclusions(b: Blacklist | undefined, chain: ChainId): Exclusions {
  if (!b) return {};
  const out: Exclusions = {};
  const tokens = b.tokens.filter((e) => e.chain === chain).map((e) => e.address);
  const creators = b.creators.filter((e) => e.chain === chain).map((e) => e.address);
  if (tokens.length) out.excludeAddresses = tokens;
  if (creators.length) out.excludeCreators = creators;
  if (b.keywords.length) out.excludeKeywords = b.keywords;
  return out;
}

/**
 * List filters with the exclusions merged in (undefined when nothing filters).
 * Keywords join the list's own exclusions, de-duplicated and capped at what the server accepts.
 */
export function withExclusions(f: TokenFilters | undefined, ex: Exclusions): TokenFilters | undefined {
  if (!ex.excludeAddresses && !ex.excludeCreators && !ex.excludeKeywords) return f;
  const out: TokenFilters = { ...f, ...ex };
  if (ex.excludeKeywords && f?.excludeKeywords) {
    out.excludeKeywords = [...new Set([...ex.excludeKeywords, ...f.excludeKeywords.map(normBlacklistKeyword)])].slice(0, MAX_FILTER_KEYWORDS);
  }
  return out;
}

export interface HideSubject {
  address: string;
  creator: string;
  symbol: string;
  name: string;
}

/** Predicate matching what the server's exclusions hide, for instant feedback before the next list push. */
export function exclusionMatcher(ex: Exclusions): (t: HideSubject) => boolean {
  const tokens = new Set(ex.excludeAddresses ?? []);
  const creators = new Set(ex.excludeCreators ?? []);
  const keywords = ex.excludeKeywords ?? [];
  return (t) => {
    if (tokens.has(normBlacklistAddress(t.address)) || creators.has(normBlacklistAddress(t.creator))) return true;
    if (keywords.length === 0) return false;
    const text = `${t.symbol}\n${t.name}`.toLowerCase();
    return keywords.some((k) => text.includes(k));
  };
}

/** The signed-in viewer's blacklist (idle signed out). */
export function useBlacklist() {
  const signedIn = useSession((s) => !!s.token);
  return useQuery({ queryKey: BLACKLIST_QUERY_KEY, queryFn: api.blacklist, enabled: signedIn, staleTime: 60_000, retry: 1 });
}

const NONE: Exclusions = {};

/** Exclusions for one chain's lists plus a matching predicate; both stable while the blacklist is unchanged. */
export function useBlacklistFilter(chain: ChainId): { exclusions: Exclusions; isHidden: (t: HideSubject) => boolean } {
  const signedIn = useSession((s) => !!s.token);
  const data = useBlacklist().data;
  return useMemo(() => {
    const exclusions = signedIn && data ? blacklistExclusions(data, chain) : NONE;
    return { exclusions, isHidden: exclusionMatcher(exclusions) };
  }, [signedIn, data, chain]);
}

/** Whether an entry is on the list (addresses compared in stored form). */
export function isBlacklisted(b: Blacklist | undefined, kind: BlacklistKind, value: string, chain?: ChainId): boolean {
  if (!b) return false;
  if (kind === 'keyword') return b.keywords.includes(normBlacklistKeyword(value));
  const address = normBlacklistAddress(value);
  return (kind === 'token' ? b.tokens : b.creators).some((e) => e.address === address && (!chain || e.chain === chain));
}

function withEntry(b: Blacklist, kind: BlacklistKind, value: string, chain: ChainId | undefined, add: boolean): Blacklist {
  if (kind === 'keyword') {
    const k = normBlacklistKeyword(value);
    const rest = b.keywords.filter((x) => x !== k);
    return { ...b, keywords: add ? [k, ...rest] : rest };
  }
  const key = kind === 'token' ? 'tokens' : 'creators';
  const address = normBlacklistAddress(value);
  const rest = b[key].filter((e) => !(e.address === address && (!chain || e.chain === chain)));
  return { ...b, [key]: add && chain ? [{ chain, address, addedAt: serverNow() }, ...rest] : rest };
}

const KIND_NOUN: Record<BlacklistKind, string> = { token: 'Token', creator: 'Dev', keyword: 'Keyword' };

/** Hide / unhide with optimistic cache updates and toasts; signed-out callers get the sign-in prompt. */
export function useBlacklistActions() {
  const qc = useQueryClient();
  const change = useCallback(
    (add: boolean, kind: BlacklistKind, value: string, chain: ChainId | undefined, label: string) =>
      requireAuth(() => {
        void (async () => {
          const prev = qc.getQueryData<Blacklist>(BLACKLIST_QUERY_KEY);
          if (prev) qc.setQueryData(BLACKLIST_QUERY_KEY, withEntry(prev, kind, value, chain, add));
          try {
            const next = add ? await api.addBlacklist({ kind, chain, value }) : await api.removeBlacklist(kind, value, chain);
            qc.setQueryData(BLACKLIST_QUERY_KEY, next);
            // Keywords are only managed in Settings → Blacklist already.
            const link = kind === 'keyword' ? undefined : { to: `${routes.settings()}?section=blacklist`, label: 'Manage blacklist' };
            if (add) toast.push({ kind: 'success', title: `${label} hidden`, body: `${KIND_NOUN[kind]} hidden from Trenches, Trending and New Pairs.`, link });
            else toast.info(`${label} unhidden`);
          } catch (err) {
            if (prev) qc.setQueryData(BLACKLIST_QUERY_KEY, prev);
            toast.error(add ? 'Couldn’t hide it' : 'Couldn’t unhide it', errorMessage(err));
          }
        })();
      }),
    [qc],
  );
  return {
    hide: (kind: BlacklistKind, value: string, chain: ChainId | undefined, label: string) => change(true, kind, value, chain, label),
    unhide: (kind: BlacklistKind, value: string, chain: ChainId | undefined, label: string) => change(false, kind, value, chain, label),
  };
}
