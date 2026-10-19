// Session store: auth token, account, settings. Persisted token in localStorage.

import { create } from 'zustand';
import type { Account, AuthResponse, ChainId, UserSettings } from '@trenchscope/shared';
import { api, setAuthToken, setUnauthorizedHandler, type DeepPartial } from '@/lib/api';
import { realtime } from '@/lib/ws';

const TOKEN_KEY = 'ts.token';

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

interface SessionState {
  token: string | null;
  account: Account | null;
  settings: UserSettings | null;
  /** True once the initial token check finished. */
  ready: boolean;
  /** Set when an action needs sign-in; the AuthModal watches it. */
  authPrompt: boolean;
  init(): Promise<void>;
  applyAuth(res: AuthResponse): Promise<void>;
  guest(referralCode?: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  register(username: string, password: string, referralCode?: string): Promise<void>;
  logout(): Promise<void>;
  refreshAccount(): Promise<void>;
  saveSettings(patch: DeepPartial<UserSettings>): Promise<void>;
  setAccountBalance(chain: ChainId, nativeBalance: number, nativeBalanceUsd: number): void;
  promptAuth(open: boolean): void;
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  account: null,
  settings: null,
  ready: false,
  authPrompt: false,

  async init() {
    const token = readToken();
    setUnauthorizedHandler(() => {
      if (get().token) {
        writeToken(null);
        setAuthToken(null);
        realtime.setToken(null);
        set({ token: null, account: null, settings: null });
      }
    });
    if (!token) {
      set({ ready: true });
      return;
    }
    setAuthToken(token);
    realtime.setToken(token);
    try {
      const [account, settings] = await Promise.all([api.me(), api.settings()]);
      set({ token, account, settings, ready: true });
    } catch {
      writeToken(null);
      setAuthToken(null);
      realtime.setToken(null);
      set({ token: null, account: null, settings: null, ready: true });
    }
  },

  async applyAuth(res) {
    writeToken(res.token);
    setAuthToken(res.token);
    realtime.setToken(res.token);
    const settings = await api.settings();
    set({ token: res.token, account: res.account, settings, authPrompt: false });
  },

  async guest(referralCode) {
    await get().applyAuth(await api.guest(referralCode));
  },

  async login(username, password) {
    await get().applyAuth(await api.login(username, password));
  },

  async register(username, password, referralCode) {
    await get().applyAuth(await api.register(username, password, referralCode));
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    writeToken(null);
    setAuthToken(null);
    realtime.setToken(null);
    set({ token: null, account: null, settings: null });
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

  promptAuth(open) {
    set({ authPrompt: open });
  },
}));

/** Run `fn` if signed in, otherwise open the sign-in prompt. */
export function requireAuth(fn: () => void): void {
  const s = useSession.getState();
  if (s.token) fn();
  else s.promptAuth(true);
}
