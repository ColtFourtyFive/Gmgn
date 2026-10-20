import { memo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { shortAddress, WALLET_PERIODS, type ChainId, type WalletPeriod, type WalletProfile, type WalletTag } from '@trenchscope/shared';
import { Clock, Copy, Hourglass, Landmark, PieChart, Share2, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink, Age, ChainBadge, Compact, ExplorerLink, FlashValue, Native, Usd, WalletAvatar, WalletTags } from '@/components/common';
import { Button, CopyButton, SegmentedControl, Tooltip } from '@/components/ui';
import { copyText, useIsLive, useNow } from '@/hooks';
import { routes } from '@/lib/chain';
import { toast } from '@/store/toasts';
import { FollowButton } from './FollowButton';
import { followersLabel, useFollowRecord } from './follows';
import { PERIOD_LABEL } from './WalletCards';

/** X (formerly Twitter) mark; lucide has no current X logo. */
export function XMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43z" />
    </svg>
  );
}

function Meta({ icon, label, children, title }: { icon: ReactNode; label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm" title={title}>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-fg">{children}</span>
    </div>
  );
}

const IDLE_WARN_MS = 48 * 3600_000;

function LastActive({ ts }: { ts: number }) {
  const now = useNow();
  const idle = now - ts > IDLE_WARN_MS;
  return (
    <span className={clsx('flex items-center gap-1', idle && 'text-warn')} title={idle ? 'No trades in the last 48 hours' : undefined}>
      <Age ts={ts} suffix=" ago" />
    </span>
  );
}

async function share(url: string, title: string) {
  try {
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ url, title });
      return;
    }
  } catch {
    /* cancelled or unsupported: fall back to copying */
  }
  if (await copyText(url)) toast.success('Link copied', 'Share it anywhere — the page is public.');
  else toast.error('Couldn’t copy link', url);
}

export interface WalletHeaderProps {
  chain: ChainId;
  profile: WalletProfile;
  /** Server tags merged with viewer tags. */
  tags: WalletTag[];
  isOwn: boolean;
  period: WalletPeriod;
  onPeriodChange: (p: WalletPeriod) => void;
}

/** Wallet identity, key facts and actions (follow, copy trade, share, period). */
export const WalletHeader = memo(function WalletHeader({ chain, profile: p, tags, isOwn, period, onPeriodChange }: WalletHeaderProps) {
  const navigate = useNavigate();
  const record = useFollowRecord(chain, p.address);
  const remark = (record ? record.remark : p.remark) || null;
  const name = remark || p.label || shortAddress(p.address, 6, 6);
  const displayName = p.label || remark;
  const live = useIsLive();

  return (
    <section className="panel flex flex-col gap-3 p-3 md:p-4" aria-label="Wallet overview">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <WalletAvatar seed={p.avatarSeed} size={52} className="mt-0.5 hidden sm:inline-flex" />
          <WalletAvatar seed={p.avatarSeed} size={40} className="mt-0.5 sm:hidden" />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-lg font-semibold leading-tight text-fg" title={p.address}>
                {name}
              </h1>
              {remark && p.label && <span className="truncate text-sm text-muted">{p.label}</span>}
              <ChainBadge chain={chain} show="short" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num truncate font-mono text-xs text-muted" title={p.address}>
                <span className="hidden sm:inline">{p.address}</span>
                <span className="sm:hidden">{shortAddress(p.address, 6, 6)}</span>
              </span>
              <CopyButton text={p.address} label="Copy address" />
              <ExplorerLink chain={chain} kind="address" value={p.address} size={12} />
              {tags.length > 0 && <WalletTags tags={tags} max={8} showLabel />}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <SegmentedControl
            aria-label="Stats period"
            value={period}
            onChange={onPeriodChange}
            items={WALLET_PERIODS.map((v) => ({ value: v, label: PERIOD_LABEL[v] }))}
          />
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {isOwn ? (
              <Button size="sm" variant="primary" icon={<PieChart size={14} />} onClick={() => navigate(routes.portfolio())}>
                Portfolio
              </Button>
            ) : (
              <>
                <FollowButton chain={chain} address={p.address} name={displayName} isFollowed={p.isFollowed} editAfterFollow />
                <Button size="sm" variant="primary" icon={<Copy size={14} />} onClick={() => navigate(`${routes.copytrade(chain)}?target=${encodeURIComponent(p.address)}`)}>
                  Copy trade
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" icon={<Share2 size={14} />} onClick={() => void share(window.location.href, `${name} on Trenchscope`)} aria-label="Share wallet">
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3">
        <Meta icon={<Wallet size={12} />} label="Balance">
          <FlashValue value={p.nativeBalance}>
            <Native value={p.nativeBalance} chain={chain} className="font-semibold" />
          </FlashValue>
          <Usd value={p.nativeBalanceUsd} className="text-xs text-muted" />
        </Meta>
        <Meta icon={<Clock size={12} />} label="Last active">
          <LastActive ts={p.lastActiveAt} />
        </Meta>
        {/* createdAt 0: the first funding is not known (live wallets seen only through recent trades). */}
        <Meta icon={<Hourglass size={12} />} label="Wallet age" title={p.createdAt > 0 ? `First funded ${new Date(p.createdAt).toLocaleString()}` : 'First funding not indexed'}>
          {p.createdAt > 0 ? <Age ts={p.createdAt} /> : <span className="text-muted">unknown</span>}
        </Meta>
        {p.fundedBy && (
          <Meta icon={<Landmark size={12} />} label="Funded by">
            <AddressLink chain={chain} address={p.fundedBy} avatar copy={false} />
            {p.fundAmountNative !== null && <Native value={p.fundAmountNative} chain={chain} className="text-xs text-muted" />}
          </Meta>
        )}
        {p.xFollowers !== null && (
          <Meta icon={<XMark size={11} />} label="Followers">
            <Tooltip content={`${p.label ?? 'This wallet'} has ${followersLabel(p.xFollowers)} on X${live ? '' : ' (simulated)'}`}>
              <span tabIndex={0}>
                <Compact value={p.xFollowers} className="font-semibold" />
              </span>
            </Tooltip>
          </Meta>
        )}
        <Meta icon={<Users size={12} />} label="Tracked by" title="Trenchscope users following this wallet">
          <Compact value={p.followerCount} className="font-semibold" />
          <span className="text-xs text-muted">{p.followerCount === 1 ? 'user' : 'users'}</span>
        </Meta>
      </div>
      {isOwn && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm" role="note">
          <Wallet size={14} className="shrink-0 text-accent" />
          <span className="font-medium text-fg">This is your wallet.</span>
          <span className="text-muted">Positions, orders and PnL of your {live ? '' : 'paper '}trading live in Portfolio.</span>
          <Link to={routes.portfolio()} className="ml-auto text-xs font-medium text-accent hover:underline">
            Open portfolio →
          </Link>
        </div>
      )}
    </section>
  );
});
