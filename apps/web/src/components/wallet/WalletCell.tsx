import { memo } from 'react';
import { Link } from 'react-router-dom';
import { shortAddress, type ChainId, type WalletTag } from '@trenchscope/shared';
import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { Native, Pct, Usd, WalletAvatar, WalletTags } from '@/components/common';
import { CopyButton, HoverCard, Skeleton } from '@/components/ui';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { useWalletProfileQuery } from './queries';
import { CopyScoreMeter, StyleTitle } from './StyleBits';

/** Lazy wallet preview (7D stats + style) shown in hover cards. */
export function WalletPreview({ chain, address }: { chain: ChainId; address: string }) {
  const q = useWalletProfileQuery(chain, address, { refetchMs: false });
  const p = q.data;
  return (
    <div className="flex w-[260px] flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <WalletAvatar seed={p?.avatarSeed ?? address} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{p?.remark || p?.label || shortAddress(address)}</div>
          <div className="num truncate font-mono text-xs text-faint">{shortAddress(address, 6, 6)}</div>
        </div>
      </div>
      {q.isError ? (
        <p className="text-xs text-down">{errorMessage(q.error)}</p>
      ) : !p ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : (
        <>
          {p.tags.length > 0 && <WalletTags tags={p.tags} max={6} showLabel />}
          <StyleTitle style={p.style} compact />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">7D realized</dt>
            <dd className="text-right">
              <Usd value={p.stats['7d'].realizedPnlUsd} colored signed />
            </dd>
            <dt className="text-muted">7D ROI</dt>
            <dd className="text-right">
              <Pct value={p.stats['7d'].pnlRate} />
            </dd>
            <dt className="text-muted">Win rate</dt>
            <dd className="text-right">
              <Pct value={p.stats['7d'].winRate} sign={false} colored={false} />
            </dd>
            <dt className="text-muted">Tokens 7D</dt>
            <dd className="num text-right">{p.stats['7d'].tokensTraded}</dd>
            <dt className="text-muted">Balance</dt>
            <dd className="text-right">
              <Native value={p.nativeBalance} chain={chain} />
            </dd>
          </dl>
          <CopyScoreMeter score={p.style.copyScore} />
        </>
      )}
      <Link to={routes.wallet(chain, address)} className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline">
        Open wallet <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}

export interface WalletCellProps {
  chain: ChainId;
  address: string;
  /** KOL handle or the viewer's remark. */
  label?: string | null;
  /** Server tags merged with viewer tags (see mergeTags). */
  tags?: WalletTag[];
  /** One line (feeds) instead of name + tags/address lines (tables). */
  dense?: boolean;
  /** Hover the avatar for a stats preview (default true). */
  preview?: boolean;
  maxTags?: number;
  copy?: boolean;
  className?: string;
}

/** Wallet identity for tables and feeds: identicon (hover preview), name → wallet page, tags, copy. */
export const WalletCell = memo(function WalletCell({ chain, address, label, tags = [], dense, preview = true, maxTags = 3, copy = true, className }: WalletCellProps) {
  const avatar = <WalletAvatar seed={address} size={dense ? 18 : 28} />;
  const avatarEl = preview ? (
    <HoverCard
      placement="right-start"
      aria-label="Wallet preview"
      trigger={
        <Link to={routes.wallet(chain, address)} tabIndex={-1} aria-hidden className="flex shrink-0 rounded">
          {avatar}
        </Link>
      }
    >
      <WalletPreview chain={chain} address={address} />
    </HoverCard>
  ) : (
    avatar
  );
  const name = (
    <Link to={routes.wallet(chain, address)} title={address} className={clsx('link truncate', label ? 'font-medium' : 'num font-mono text-xs')}>
      {label || shortAddress(address)}
    </Link>
  );
  if (dense)
    return (
      <span className={clsx('flex min-w-0 items-center gap-1.5', className)}>
        {avatarEl}
        {name}
        {tags.length > 0 && <WalletTags tags={tags} max={maxTags} className="shrink-0 flex-nowrap" />}
      </span>
    );
  return (
    <span className={clsx('flex min-w-0 items-center gap-2', className)}>
      {avatarEl}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          {name}
          {copy && <CopyButton text={address} label="Copy address" size={11} />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1">
          {tags.length > 0 && <WalletTags tags={tags} max={maxTags} className="shrink-0 flex-nowrap" />}
          {label && <span className="num truncate font-mono text-2xs text-faint">{shortAddress(address)}</span>}
        </span>
      </span>
    </span>
  );
});
