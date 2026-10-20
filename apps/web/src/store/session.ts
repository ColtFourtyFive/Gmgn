// Session store: auth token, account, settings. Persisted token in localStorage.

import { create } from 'zustand';
import type { Account, AuthResponse, ChainId, UserSettings } from '@trenchscope/shared';
import { api, ApiError, setAuthToken, setUnauthorizedHandler, type DeepPartial } from '@/lib/api';
import { realtime } from '@/lib/ws';
import { useUi, type Theme } from './ui';

const TOKEN_KEY = 'ts.token';
/** Backoff between attempts to restore a stored session while the API is unreachable. */
const RESTORE_RETRY_MS = { first: 1_000, max: 30_000 };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Point the REST client and the realtime socket at a token (or anonymous). */
function applyToken(token: string | null): void {
  writeToken(token);
  setAuthToken(token);
  realtime.setToken(token);
}

/** Ends pending waitForRetry() waits early (the user pressed Retry). */
const retryNow = new Set<() => void>();

/**
 * Resolve after `ms`, or as soon as the API looks reachable again (the
 * realtime socket reconnects or the browser comes back online), or the user
 * asks to retry now.
 */
function waitForRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      offState();
      window.removeEventListener('online', done);
      retryNow.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const offState = realtime.onState((s) => s === 'open' && done());
    window.addEventListener('online', done);
    retryNow.add(done);
  });
}

/** Account settings, seeded with `theme` when given and different (best effort: falls back to the local theme). */
async function loadSettings(theme?: Theme): Promise<UserSettings> {
  const settings = await api.settings();
  if (!theme || settings.display.theme === theme) return settings;
  try {
    return await api.updateSettings({ display: { theme } });
  } catch {
    return { ...settings, display: { ...settings.display, theme } };
  }
}

/** Tabs of the sign-in dialog. */
export type AuthTab = 'quick' | 'login' | 'register';

interface SessionState {
  token: string | null;
  account: Account | null;
  settings: UserSettings | null;
  /**
   * True once the stored token check finished. Stays false while a stored
   * session cannot be verified because the API is unreachable (it is kept
   * and retried; only a 401 signs out).
   */
  ready: boolean;
  /** Why the last attempt to restore a stored session failed (null: none failed, or it is restored). */
  restoreError: unknown;
  /** An attempt to restore the stored session is in flight. */
  restoring: boolean;
  /** Set when an action needs sign-in; the AuthModal watches it. */
  authPrompt: boolean;
  /** Tab the AuthModal opens on (null: its default for the viewer). */
  authTab: AuthTab | null;
  /** A guest asked to sign out: the SignOutDialog asks for confirmation (see requestSignOut). */
  signOutPrompt: boolean;
  init(): Promise<void>;
  /** Retry restoring the stored session now instead of after the backoff. */
  retryRestore(): void;
  applyAuth(res: AuthResponse): Promise<void>;
  /** New guest account; its theme is seeded from the one this browser shows. */
  guest(referralCode?: string): Promise<void>;
  /**
   * Signs into an existing account and adopts its saved theme. Live accounts
   * with 2FA answer 401 'totp_required' until `code` (the current TOTP code) is sent.
   */
  login(username: string, password: string, code?: string): Promise<void>;
  /** New (or upgraded guest) account; its theme is seeded from the one this browser shows. */
  register(username: string, password: string, referralCode?: string): Promise<void>;
  logout(): Promise<void>;
  refreshAccount(): Promise<void>;
  saveSettings(patch: DeepPartial<UserSettings>): Promise<void>;
  setAccountBalance(chain: ChainId, nativeBalance: number, nativeBalanceUsd: number): void;
  /** Open (optionally on a given tab) or close the sign-in dialog. */
  promptAuth(open: boolean, tab?: AuthTab): void;
  promptSignOut(open: boolean): void;
}

export const useSession = create<SessionState>((set, get) => {
  const signOutLocally = () => {
    applyToken(null);
    set({ token: null, account: null, settings: null, ready: true, restoreError: null, restoring: false, signOutPrompt: false });
  };

  const startSession = async (res: AuthResponse, seedTheme?: Theme) => {
    applyToken(res.token);
    const settings = await loadSettings(seedTheme);
    set({ token: res.token, account: res.account, settings, ready: true, restoreError: null, restoring: false, authPrompt: false, authTab: null });
  };

  /** Load the account behind a stored token, retrying with backoff until the API answers. */
  const restore = async (token: string, attempt: number): Promise<void> => {
    set({ restoring: true });
    try {
      const [account, settings] = await Promise.all([api.me(), api.settings()]);
      if (get().token === token) set({ account, settings, ready: true, restoreError: null, restoring: false });
    } catch (err) {
      if (get().token !== token) return; // signed out or into another account meanwhile
      if (err instanceof ApiError && err.status === 401) {
        signOutLocally();
        return;
      }
      // Pages show this (with Retry) instead of an endless skeleton; the backoff continues.
      set({ restoreError: err, restoring: false });
      void waitForRetry(Math.min(RESTORE_RETRY_MS.max, RESTORE_RETRY_MS.first * 2 ** attempt)).then(() => {
        if (get().token === token && !get().account) void restore(token, attempt + 1);
      });
    }
  };

  return {
    token: null,
    account: null,
    settings: null,
    ready: false,
    restoreError: null,
    restoring: false,
    authPrompt: false,
    authTab: null,
    signOutPrompt: false,

    retryRestore() {
      for (const wake of [...retryNow]) wake();
    },

    async init() {
      setUnauthorizedHandler(() => {
        if (get().token) signOutLocally();
      });
      const token = readToken();
      if (!token) {
        set({ ready: true });
        return;
      }
      if (get().token === token) return; // already restoring it (StrictMode runs the boot effect twice)
      applyToken(token);
      set({ token });
      await restore(token, 0);
    },

    applyAuth: (res) => startSession(res),

    async guest(referralCode) {
      // Saved before the settings land, so useThemeSync never flips the page to the server default.
      await startSession(await api.guest(referralCode), useUi.getState().theme);
    },

    async login(username, password, code) {
      await startSession(await (code === undefined ? api.login(username, password) : api.login(username, password, code)));
    },

    async register(username, password, referralCode) {
      // Like guest(): a new account starts with the theme on screen (an upgraded guest already has it).
      await startSession(await api.register(username, password, referralCode), useUi.getState().theme);
    },

    async logout() {
      try {
        await api.logout();
      } catch {
        /* ignore */
      }
      signOutLocally();
    },

    async refreshAccount() {
      if (!get().token) return;
      const account = await api.me();
      set({ account });
    },

    async saveSettings(patch) {
      const settings = await api.updateSettings(patch);
      set({ settings });
    },

    setAccountBalance(chain, nativeBalance, nativeBalanceUsd) {
      const account = get().account;
      if (!account) return;
      set({
        account: {
          ...account,
          wallets: { ...account.wallets, [chain]: { ...account.wallets[chain], nativeBalance, nativeBalanceUsd } },
        },
      });
    },

    promptAuth(open, tab) {
      set({ authPrompt: open, authTab: open ? (tab ?? null) : null });
    },

    promptSignOut(open) {
      set({ signOutPrompt: open });
    },
  };
});

/** Run `fn` if signed in, otherwise open the sign-in prompt. */
export function requireAuth(fn: () => void): void {
  const s = useSession.getState();
  if (s.token) fn();
  else s.promptAuth(true);
}
