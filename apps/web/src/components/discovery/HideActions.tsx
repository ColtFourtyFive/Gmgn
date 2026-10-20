// "Hide token" / "Hide dev" entry points (hover cards, the token page menu,
// the Trenches card context menu), backed by the viewer's blacklist.

import { useRef, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ChainId } from '@trenchscope/shared';
import { Copy, Eye, EyeOff, ExternalLink, UserX } from 'lucide-react';
import { Floating, Menu, type MenuItem } from '@/components/ui';
import { copyText } from '@/hooks/useClipboard';
import { routes } from '@/lib/chain';
import { toast } from '@/store/toasts';
import { isBlacklisted, useBlacklist, useBlacklistActions } from './blacklist';

export interface HideTarget {
  chain: ChainId;
  address: string;
  creator: string;
  symbol: string;
}

/** Menu items toggling the token and its creator on the blacklist. */
export function useHideItems(t: HideTarget): MenuItem[] {
  const b = useBlacklist().data;
  const { hide, unhide } = useBlacklistActions();
  const tokenHidden = isBlacklisted(b, 'token', t.address, t.chain);
  const devHidden = isBlacklisted(b, 'creator', t.creator, t.chain);
  return [
    {
      key: 'hide-token',
      label: tokenHidden ? 'Unhide token' : 'Hide token',
      icon: tokenHidden ? <Eye size={14} /> : <EyeOff size={14} />,
      onSelect: () => (tokenHidden ? unhide : hide)('token', t.address, t.chain, t.symbol),
    },
    {
      key: 'hide-dev',
      label: devHidden ? 'Unhide dev’s tokens' : 'Hide dev’s tokens',
      icon: devHidden ? <Eye size={14} /> : <UserX size={14} />,
      onSelect: () => (devHidden ? unhide : hide)('creator', t.creator, t.chain, `${t.symbol}’s dev`),
    },
  ];
}

/** Compact hide buttons for hover cards. */
export function HideButtons({ token }: { token: HideTarget }) {
  const items = useHideItems(token);
  return (
    <div className="flex gap-1.5">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={it.onSelect} className="btn-outline btn-xs flex-1 text-muted hover:text-fg">
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export interface ContextPoint {
  x: number;
  y: number;
}

/** Where to open a context menu: the pointer, or the element's corner for the keyboard menu key. */
export function contextPoint(e: MouseEvent<HTMLElement>): ContextPoint {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 12, y: r.top + 12 };
}

/** Right-click menu of a token card: open in a new tab, copy the address, hide the token or its dev. */
export function TokenContextMenu({ token, at, onClose }: { token: HideTarget; at: ContextPoint; onClose: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const hideItems = useHideItems(token);
  const items: MenuItem[] = [
    { key: 'open', label: 'Open in new tab', icon: <ExternalLink size={14} />, onSelect: () => window.open(routes.token(token.chain, token.address), '_blank', 'noopener') },
    {
      key: 'copy',
      label: 'Copy address',
      icon: <Copy size={14} />,
      onSelect: () => void copyText(token.address).then((ok) => (ok ? toast.success('Address copied', token.symbol) : toast.error('Couldn’t copy the address'))),
    },
    ...hideItems,
  ];
  return createPortal(
    <>
      <span ref={anchor} aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: at.x, top: at.y }} />
      <Floating open anchorRef={anchor} placement="bottom-start" offset={2} onClose={onClose} trapFocus aria-label={`${token.symbol} actions`} className="panel animate-pop-in shadow-float">
        <Menu items={items} onDone={onClose} />
      </Floating>
    </>,
    document.body,
  );
}
