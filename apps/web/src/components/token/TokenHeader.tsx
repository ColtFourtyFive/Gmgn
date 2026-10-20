// Token identity: avatar with curve ring, symbol/name, contract copy,
// launchpad, age, socials, narrative, flags, watchlist star, share, and the
// lifecycle line (curve progress → migrating → migrated pool).

import { memo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLaunchpad, shortAddress, type TokenDetail, type TokenSummary, type WatchlistItem } from '@trenchscope/shared';
import { Copy as CopyIcon, Eye, Flame, Link2, Loader2, Rocket, ShieldAlert, Star, Waves } from 'lucide-react';
import clsx from 'clsx';
import { Age, ChainIcon, CurveProgress, LaunchpadBadge, SocialLinks, TokenAvatar, Usd } from '@/components/common';
import { accountKeys } from '@/components/account';
import { Badge, CopyButton, IconButton, Tooltip } from '@/components/ui';
import { copyText } from '@/hooks/useClipboard';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { requireAuth, useSession } from '@/store/session';
import { toast } from '@/store/toasts';

type WatchData = { items: WatchlistItem[]; tokens: TokenSummary[] };

/** Watchlist membership + toggle (shares the Watchlist page cache). */
function useWatch(token: TokenDetail) {
  const qc = useQueryClient();
  const signedIn = useSession((s) => !!s.token);
  const q = useQuery({ queryKey: accountKeys.watchlist, queryFn: api.watchlist, enabled: signedIn, staleTime: 30_000 });
  const watched = !!q.data?.items.some((i) => i.chain === token.chain && i.address === token.address);
  const [pending, setPending] = useState(false);
  const toggle = () =>
    requireAuth(async () => {
      if (pending) return;
      setPending(true);
      const prev = qc.getQueryData<WatchData>(accountKeys.watchlist);
      const next = !watched;
      qc.setQueryData<WatchData>(accountKeys.watchlist, (d) => {
        const base = d ?? { items: [], tokens: [] };
        return next
          ? { ...base, items: [...base.items, { chain: token.chain, address: token.address, addedAt: Date.now() }] }
          : { items: base.items.filter((i) => !(i.chain === token.chain && i.address === token.address)), tokens: base.tokens.filter((t) => t.address !== token.address) };
      });
      try {
        if (next) await api.addWatch(token.chain, token.address);
        else await api.removeWatch(token.chain, token.address);
        toast.success(next ? `${token.symbol} added to watchlist` : `${token.symbol} removed from watchlist`);
      } catch (err) {
        if (prev) qc.setQueryData(accountKeys.watchlist, prev);
        toast.error('Watchlist not updated', errorMessage(err));
      } finally {
        setPending(false);
        void qc.invalidateQueries({ queryKey: accountKeys.watchlist });
      }
    });
  return { watched, toggle, pending };
}

/** Labelled lifecycle / marketing / risk flags. */
function HeaderFlags({ t }: { t: TokenDetail }) {
  const s = t.security;
  const tax = Math.max(s.buyTax, s.sellTax);
  return (
    <>
      {s.isHoneypot && (
        <Badge tone="down" icon={<ShieldAlert size={10} aria-hidden />} title="Buys work, sells are blocked by the contract">
          Honeypot
        </Badge>
      )}
      {tax > 0 && (
        <Badge tone="warn" title={`Buy tax ${Math.round(s.buyTax * 100)}% · sell tax ${Math.round(s.sellTax * 100)}%`}>
          Tax {Math.round(s.buyTax * 100)}/{Math.round(s.sellTax * 100)}
        </Badge>
      )}
      {t.cto && (
        <Badge tone="info" title="Community takeover — the community now runs the project">
          CTO
        </Badge>
      )}
      {t.boosted && (
        <Badge tone="accent" icon={<Rocket size={10} aria-hidden />} title="Paid promotion on the screener">
          Boosted
        </Badge>
      )}
      {t.isCopycat && (
        <Badge tone="warn" icon={<CopyIcon size={10} aria-hidden />} title="Reuses an earlier token’s name or image">
          Copycat
        </Badge>
      )}
      {s.devStatus === 'sold_all' && (
        <Badge tone="info" title="The dev sold their whole bag — no dev supply left to dump">
          Dev sold
        </Badge>
      )}
      {s.lpBurnedRate !== null && s.lpBurnedRate >= 0.99 && (
        <Badge tone="up" icon={<Flame size={10} aria-hidden />} title="LP tokens burned — liquidity can’t be pulled">
          LP burnt
        </Badge>
      )}
      {s.isWashTrading && (
        <Badge tone="down" icon={<Waves size={10} aria-hidden />} title="Wash trading detected — volume is inflated">
          Wash
        </Badge>
      )}
    </>
  );
}

/** Curve progress / migrating / migrated line. */
function Lifecycle({ t }: { t: TokenDetail }) {
  if (t.status === 'migrating') {
    return (
      <div className="flex items-center gap-2 rounded bg-info/10 px-2 py-1 text-xs text-info">
        <Loader2 size={12} className="animate-spin" aria-hidden />
        <span className="font-medium">Migrating…</span>
        <span className="text-muted">The curve is complete; liquidity is moving to the AMM pool. Trading resumes in seconds.</span>
      </div>
    );
  }
  if (t.status === 'curve') {
    const grad = t.curve?.graduationMarketCapUsd ?? null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted">Bonding curve</span>
        <CurveProgress progress={t.progress} size="md" className="min-w-[120px] max-w-xs flex-1" />
        {grad !== null && (
          <span className="text-muted">
            Graduates at <Usd value={grad} className="font-medium text-fg" /> MC
            {t.marketCapUsd < grad && (
              <span className="text-faint">
                {' '}
                · <Usd value={grad - t.marketCapUsd} /> to go
              </span>
            )}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
      <Badge tone="up">Migrated</Badge>
      <span className="font-medium text-fg">{t.pool?.dex ?? t.dex ?? 'AMM pool'}</span>
      {t.migratedAt && (
        <span>
          · <Age ts={t.migratedAt} suffix=" ago" />
        </span>
      )}
      {t.pool && (
        <span>
          · Pool liquidity <Usd value={t.pool.liquidityUsd} className="text-fg" />
        </span>
      )}
    </div>
  );
}

export const TokenHeader = memo(function TokenHeader({ token: t, compact, className }: { token: TokenDetail; compact?: boolean; className?: string }) {
  const { watched, toggle, pending } = useWatch(t);
  const lp = getLaunchpad(t.launchpad);
  const share = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success('Link copied', `${t.symbol} · ${t.name}`);
    else toast.error('Couldn’t copy the link');
  };
  return (
    <header className={clsx('panel flex min-w-0 flex-col gap-2 p-2.5 sm:p-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={compact ? 40 : 48} progress={t.status === 'migrated' ? undefined : t.progress} launchpadColor={lp?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="truncate text-lg font-bold leading-tight text-fg">{t.symbol}</h1>
            <span className="min-w-0 truncate text-sm text-muted">{t.name}</span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-px">
              <ChainIcon chain={t.chain} size={12} />
              <span className="num font-mono text-muted" title={t.address}>
                {shortAddress(t.address, 4, 4)}
              </span>
              <CopyButton text={t.address} label="Copy contract address" />
            </span>
            <LaunchpadBadge launchpad={t.launchpad} />
            <Tooltip content={`Created ${new Date(t.createdAt).toLocaleString()}`}>
              <span className="inline-flex items-center gap-1 text-muted" tabIndex={0}>
                <Age ts={t.createdAt} className="font-medium text-fg" />
              </span>
            </Tooltip>
            {t.narrative && <Badge tone="neutral">{t.narrative}</Badge>}
            <SocialLinks socials={t.socials} />
            {t.watchers > 0 && (
              <Tooltip content="People viewing this token right now">
                <span className="inline-flex items-center gap-0.5 text-faint" tabIndex={0}>
                  <Eye size={11} aria-hidden />
                  <span className="num">{t.watchers}</span>
                </span>
              </Tooltip>
            )}
            <HeaderFlags t={t} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            icon={<Star size={16} className={clsx(watched && 'fill-accent text-accent')} />}
            active={watched}
            disabled={pending}
            onClick={toggle}
          />
          <IconButton label="Copy link" icon={<Link2 size={16} />} onClick={() => void share()} />
        </div>
      </div>
      <Lifecycle t={t} />
    </header>
  );
});
