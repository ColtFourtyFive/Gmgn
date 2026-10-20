// Instant trade dock: the floating panel (desktop) / bottom sheet (phones)
// with the "Instant trade" and "Positions" tabs. Holds which surface is open,
// the active tab and the token it trades off token pages (the last token page
// viewed). Desktop state persists per browser; the phone sheet never reopens
// on load. Panel geometry lives in components/layout/dockLayout.ts.

import { create } from 'zustand';
import { isChainId, type ChainId } from '@trenchscope/shared';

export type DockTab = 'trade' | 'positions';

export interface DockToken {
  chain: ChainId;
  address: string;
}

const KEY = 'ts.dock';
const PHONE_QUERY = '(max-width: 767px)';

interface Persisted {
  open: boolean;
  collapsed: boolean;
  tab: DockTab;
  lastToken: DockToken | null;
}

const DEFAULTS: Persisted = { open: false, collapsed: false, tab: 'trade', lastToken: null };

function read(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Persisted> | null;
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    const t = raw.lastToken;
    return {
      open: raw.open === true,
      collapsed: raw.collapsed === true,
      tab: raw.tab === 'positions' ? 'positions' : 'trade',
      lastToken: t && isChainId(t.chain) && typeof t.address === 'string' && t.address ? { chain: t.chain, address: t.address } : null,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(s: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ open: s.open, collapsed: s.collapsed, tab: s.tab, lastToken: s.lastToken }));
  } catch {
    /* storage unavailable */
  }
}

const isPhone = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

interface DockState extends Persisted {
  /** Phone bottom sheet (not persisted). */
  sheetOpen: boolean;
  /** Desktop floating panel. */
  setOpen(open: boolean): void;
  setSheetOpen(open: boolean): void;
  /** Toggle the surface of the current viewport: the bottom sheet on phones, else the floating panel (expanding it when collapsed). */
  toggle(): void;
  setCollapsed(collapsed: boolean): void;
  setTab(tab: DockTab): void;
  /** Remember the token page being viewed (the Instant trade target elsewhere). */
  setLastToken(token: DockToken): void;
}

export const useDock = create<DockState>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch);
    write(get());
  };
  return {
    ...read(),
    sheetOpen: false,
    setOpen: (open) => update({ open }),
    setSheetOpen: (sheetOpen) => set({ sheetOpen }),
    toggle() {
      if (isPhone()) set((s) => ({ sheetOpen: !s.sheetOpen }));
      else if (get().open && get().collapsed) update({ collapsed: false });
      else update({ open: !get().open, collapsed: false });
    },
    setCollapsed: (collapsed) => update({ collapsed }),
    setTab: (tab) => update({ tab }),
    setLastToken(token) {
      const prev = get().lastToken;
      if (prev?.chain !== token.chain || prev.address !== token.address) update({ lastToken: token });
    },
  };
});

/** Open the dock on a tab (sheet on phones, panel elsewhere). */
export function openDock(tab?: DockTab): void {
  const s = useDock.getState();
  if (tab) s.setTab(tab);
  if (isPhone()) s.setSheetOpen(true);
  else {
    s.setOpen(true);
    s.setCollapsed(false);
  }
}

/** Footer toggles: close the panel when it already shows `tab`, else open it there. */
export function toggleDockTab(tab: DockTab): void {
  const s = useDock.getState();
  if (!isPhone() && s.open && !s.collapsed && s.tab === tab) s.setOpen(false);
  else openDock(tab);
}
