// Shell-level UI state: theme, preferred chain for global routes, unread
// notification count, mobile overlays (nav drawer, search sheet), the
// command palette and the trading-hotkeys opt-in.

import { create } from 'zustand';
import type { ChainId } from '@trenchscope/shared';
import { lastChain, rememberChain } from '@/lib/chain';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'ts.theme';
const TRADING_HOTKEYS_KEY = 'ts.tradingHotkeys';
const THEME_COLOR: Record<Theme, string> = { dark: '#0a0c10', light: '#f4f5f8' };

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage unavailable */
  }
  return 'dark';
}

/** Apply a theme to <html data-theme> and the browser chrome color. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

function readTradingHotkeys(): boolean {
  try {
    return localStorage.getItem(TRADING_HOTKEYS_KEY) === '1';
  } catch {
    return false;
  }
}

interface UiState {
  theme: Theme;
  /** Applies + persists locally. Use `useTheme()` to also sync account settings. */
  setTheme(theme: Theme): void;
  /** Chain used by global routes (/portfolio, /settings ...); chain routes override it. */
  chain: ChainId;
  setChain(chain: ChainId): void;
  unreadCount: number;
  setUnreadCount(n: number): void;
  bumpUnread(by?: number): void;
  mobileNavOpen: boolean;
  setMobileNavOpen(open: boolean): void;
  /** Full-screen search sheet (mobile). */
  searchOpen: boolean;
  setSearchOpen(open: boolean): void;
  /** Command palette (Ctrl/Cmd+K). */
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
  /**
   * Keys that place trades (B buys the selected Trenches card) are opt-in
   * (PRD §11.6): off until turned on, per device. Navigation shortcuts
   * follow settings.display.hotkeys.
   */
  tradingHotkeys: boolean;
  setTradingHotkeys(on: boolean): void;
}

export const useUi = create<UiState>((set) => ({
  theme: readTheme(),
  setTheme(theme) {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable */
    }
    set({ theme });
  },

  chain: lastChain(),
  setChain(chain) {
    rememberChain(chain);
    set({ chain });
  },

  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: Math.max(0, n) }),
  bumpUnread: (by = 1) => set((s) => ({ unreadCount: s.unreadCount + by })),

  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  tradingHotkeys: readTradingHotkeys(),
  setTradingHotkeys(on) {
    try {
      if (on) localStorage.setItem(TRADING_HOTKEYS_KEY, '1');
      else localStorage.removeItem(TRADING_HOTKEYS_KEY);
    } catch {
      /* storage unavailable */
    }
    set({ tradingHotkeys: on });
  },
}));
