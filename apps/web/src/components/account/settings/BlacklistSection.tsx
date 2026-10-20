// Settings → Blacklist: hidden tokens, hidden devs and name keywords. Changes
// apply at once (their own API, outside the settings draft) and every
// discovery list drops matches on the viewer's devices.

import { useState, type ReactNode } from 'react';
import { BLACKLIST_LIMITS, shortAddress, type BlacklistEntry } from '@trenchscope/shared';
import { EyeOff, Type, UserX, X } from 'lucide-react';
import { AddressLink, Age, ChainIcon, TokenLink } from '@/components/common';
import { normBlacklistKeyword, useBlacklist, useBlacklistActions } from '@/components/discovery';
import { Button, EmptyState, ErrorState, IconButton, Panel, Skeleton } from '@/components/ui';
import { useTokenMeta } from '../queries';
import { TagInput } from '../TagInput';

/** Rows shown per "Show more" (hidden tokens resolve their symbol one request per row). */
const PAGE = 20;

function TokenName({ entry }: { entry: BlacklistEntry }) {
  const meta = useTokenMeta(entry.chain, entry.address).data;
  if (meta) return <TokenLink token={meta} size={20} />;
  return <span className="num truncate font-mono text-xs text-muted" title={entry.address}>{shortAddress(entry.address, 6, 4)}</span>;
}

function EntryList({ entries, kind, empty }: { entries: BlacklistEntry[]; kind: 'token' | 'creator'; empty: ReactNode }) {
  const { unhide } = useBlacklistActions();
  const [limit, setLimit] = useState(PAGE);
  if (entries.length === 0) return <>{empty}</>;
  const shown = entries.slice(0, limit);
  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((e) => (
          <li key={`${e.chain}:${e.address}`} className="flex min-w-0 items-center gap-2 py-1.5">
            <ChainIcon chain={e.chain} size={14} />
            <span className="flex min-w-0 flex-1">
              {kind === 'token' ? <TokenName entry={e} /> : <AddressLink chain={e.chain} address={e.address} avatar head={6} />}
            </span>
            <Age ts={e.addedAt} suffix=" ago" className="hidden shrink-0 text-xs text-faint sm:inline" />
            <IconButton
              size="xs"
              label={`Unhide ${shortAddress(e.address)}`}
              icon={<X size={13} />}
              onClick={() => unhide(kind, e.address, e.chain, kind === 'token' ? 'Token' : 'Dev')}
            />
          </li>
        ))}
      </ul>
      {entries.length > PAGE && (
        <Button size="xs" variant="ghost" className="mt-1" onClick={() => setLimit((n) => (n >= entries.length ? PAGE : n + PAGE))}>
          {limit >= entries.length ? 'Show fewer' : `Show more · ${entries.length - limit} left`}
        </Button>
      )}
    </>
  );
}

export function BlacklistSection() {
  const q = useBlacklist();
  const { hide, unhide } = useBlacklistActions();
  const b = q.data;

  if (q.isError && !b) {
    return (
      <Panel>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Panel>
    );
  }
  if (!b) return <Skeleton className="h-64" />;

  const setKeywords = (next: string[]) => {
    for (const k of next) if (!b.keywords.includes(k)) hide('keyword', k, undefined, `“${k}”`);
    for (const k of b.keywords) if (!next.includes(k)) unhide('keyword', k, undefined, `“${k}”`);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Hidden tokens, tokens by hidden devs and tokens whose name or symbol contains a keyword never show on Trenches, Trending or New Pairs — on every
        device you sign in on. Hide them from a token’s hover card, its page menu or a Trenches card’s right-click menu.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Hidden tokens" icon={<EyeOff size={14} />} subtitle={`${b.tokens.length} / ${BLACKLIST_LIMITS.tokens}`}>
          <EntryList entries={b.tokens} kind="token" empty={<EmptyState compact title="No hidden tokens" description="Use “Hide token” on any token to keep it out of your lists." />} />
        </Panel>
        <Panel title="Hidden devs" icon={<UserX size={14} />} subtitle={`${b.creators.length} / ${BLACKLIST_LIMITS.creators}`}>
          <EntryList
            entries={b.creators}
            kind="creator"
            empty={<EmptyState compact title="No hidden devs" description="Use “Hide dev’s tokens” to hide every launch of a creator wallet." />}
          />
        </Panel>
      </div>
      <Panel title="Keywords" icon={<Type size={14} />} subtitle={`${b.keywords.length} / ${BLACKLIST_LIMITS.keywords}`}>
        <div className="flex flex-col gap-1.5">
          <TagInput
            value={b.keywords}
            onChange={setKeywords}
            normalize={normBlacklistKeyword}
            validate={(k) => (k.length > BLACKLIST_LIMITS.keywordMaxLength ? `At most ${BLACKLIST_LIMITS.keywordMaxLength} characters` : null)}
            max={BLACKLIST_LIMITS.keywords}
            maxLength={BLACKLIST_LIMITS.keywordMaxLength}
            placeholder="Add a keyword, e.g. elon, $inu — Enter to add"
            aria-label="Blacklisted keywords"
          />
          <p className="text-xs text-faint">Matched case-insensitively anywhere in the name or symbol; a leading $ is ignored.</p>
        </div>
      </Panel>
    </div>
  );
}
