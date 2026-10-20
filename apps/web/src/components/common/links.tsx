import { memo, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getLaunchpad, shortAddress, type ChainId, type Socials, type TokenRef, type WalletTag } from '@trenchscope/shared';
import { Globe, Send } from 'lucide-react';
import clsx from 'clsx';
import { CopyButton } from '@/components/ui/CopyButton';
import { routes } from '@/lib/chain';
import { TokenAvatar } from './TokenAvatar';
import { WalletAvatar } from './WalletAvatar';
import { WalletTags } from './WalletTags';

// Links live inside clickable rows/cards: never let the click reach them.
const stop = (e: MouseEvent) => e.stopPropagation();

export interface AddressLinkProps {
  chain: ChainId;
  address: string;
  /** KOL handle / remark shown instead of the short address. */
  label?: string | null;
  /** Leading identicon. */
  avatar?: boolean;
  /** Tags rendered after the name. */
  tags?: WalletTag[];
  /** Copy button (default true). */
  copy?: boolean;
  head?: number;
  tail?: number;
  className?: string;
}

/** Wallet link (→ /:chain/address/:addr) with optional identicon, tags and copy. */
export const AddressLink = memo(function AddressLink({ chain, address, label, avatar, tags, copy = true, head = 4, tail = 4, className }: AddressLinkProps) {
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1', className)}>
      {avatar && <WalletAvatar seed={address} size={16} />}
      <Link to={routes.wallet(chain, address)} onClick={stop} title={address} className={clsx('link truncate', label ? 'font-medium' : 'num font-mono text-xs')}>
        {label || shortAddress(address, head, tail)}
      </Link>
      {tags && tags.length > 0 && <WalletTags tags={tags} max={3} />}
      {copy && <CopyButton text={address} label="Copy address" />}
    </span>
  );
});

/** Fields TokenLink needs; TokenSummary, TokenRef and DevToken all satisfy it. */
export type TokenLinkData = Pick<TokenRef, 'chain' | 'address' | 'symbol' | 'logoSeed' | 'logoGlyph'> & {
  name?: string;
  launchpad?: string;
  progress?: number;
};

export interface TokenLinkProps {
  token: TokenLinkData;
  /** Avatar diameter (px). */
  size?: number;
  /** Show the full name under the symbol. */
  showName?: boolean;
  /** Draw the curve-progress ring (uses token.progress). */
  showProgress?: boolean;
  /** Launchpad dot on the avatar (uses token.launchpad). */
  showLaunchpad?: boolean;
  /** Extra content after the symbol (badges). */
  extra?: ReactNode;
  className?: string;
}

/** Token avatar + symbol (+ name) linking to /:chain/token/:addr. */
export const TokenLink = memo(function TokenLink({ token, size = 24, showName, showProgress, showLaunchpad, extra, className }: TokenLinkProps) {
  const lpColor = showLaunchpad && token.launchpad ? getLaunchpad(token.launchpad)?.color : undefined;
  return (
    <Link to={routes.token(token.chain, token.address)} onClick={stop} className={clsx('group/token inline-flex min-w-0 items-center gap-2', className)}>
      <TokenAvatar seed={token.logoSeed} glyph={token.logoGlyph} size={size} progress={showProgress ? token.progress : undefined} launchpadColor={lpColor} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-semibold text-fg transition-colors group-hover/token:text-accent">{token.symbol}</span>
          {extra}
        </span>
        {showName && token.name && <span className="truncate text-xs text-muted">{token.name}</span>}
      </span>
    </Link>
  );
});

/** X (formerly Twitter) mark drawn inline; lucide has no current X logo. */
function XMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43z" />
    </svg>
  );
}

export interface SocialLinksProps {
  socials: Socials;
  /** Icon size in px. */
  size?: number;
  className?: string;
}

/** `raw` when it is an absolute http(s) URL; null for anything else (javascript:, data:, relative...). */
function externalHref(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * X / Telegram / website icon links (new tab, noopener). Socials can be
 * user-supplied (launches), so only http(s) URLs become links. Renders
 * nothing when empty.
 */
export function SocialLinks({ socials, size = 13, className }: SocialLinksProps) {
  const items = [
    { href: externalHref(socials.twitter), label: 'X (Twitter)', icon: <XMark size={size - 1} /> },
    { href: externalHref(socials.telegram), label: 'Telegram', icon: <Send size={size} /> },
    { href: externalHref(socials.website), label: 'Website', icon: <Globe size={size} /> },
  ].filter((it): it is typeof it & { href: string } => it.href !== null);
  if (items.length === 0) return null;
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)}>
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={it.label}
          title={it.label}
          onClick={stop}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-panel-3 hover:text-fg"
        >
          {it.icon}
        </a>
      ))}
    </span>
  );
}
