import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, AuthResponse, UserSettings } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api, ApiError } from '@/lib/api';
import { useSession } from './session';
import { useUi } from './ui';

const account = { id: 'a1', username: 'guest-1', isGuest: true } as Account;
const settings: UserSettings = { trade: DEFAULT_TRADE, display: DEFAULT_DISPLAY };
const unreachable = () => new ApiError(502, 'Server unreachable — retrying shortly', 'unreachable');

const initial = useSession.getState();

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useSession.setState({ ...initial, token: null, account: null, settings: null, ready: false, restoreError: null, restoring: false, authPrompt: false, authTab: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('session init', () => {
  it('is ready immediately without a stored token', async () => {
    const me = vi.spyOn(api, 'me');
    await useSession.getState().init();
    expect(useSession.getState()).toMatchObject({ ready: true, token: null });
    expect(me).not.toHaveBeenCalled();
  });

  it('restores a stored session', async () => {
    localStorage.setItem('ts.token', 'tok');
    vi.spyOn(api, 'me').mockResolvedValue(account);
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    await useSession.getState().init();
    expect(useSession.getState()).toMatchObject({ ready: true, token: 'tok', account, settings });
  });

  it('signs out only when the server rejects the token (401)', async () => {
    localStorage.setItem('ts.token', 'stale');
    vi.spyOn(api, 'me').mockRejectedValue(new ApiError(401, 'unauthorized'));
    vi.spyOn(api, 'settings').mockRejectedValue(new ApiError(401, 'unauthorized'));
    await useSession.getState().init();
    expect(useSession.getState()).toMatchObject({ ready: true, token: null, account: null });
    expect(localStorage.getItem('ts.token')).toBeNull();
  });

  it('keeps the session through network and 5xx errors and retries with backoff', async () => {
    localStorage.setItem('ts.token', 'tok');
    const me = vi
      .spyOn(api, 'me')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(unreachable())
      .mockResolvedValue(account);
    vi.spyOn(api, 'settings').mockResolvedValue(settings);

    await useSession.getState().init();
    // Still signed in (token kept, account pending) and not "ready", so no sign-in button flashes.
    expect(useSession.getState()).toMatchObject({ token: 'tok', account: null, ready: false });
    expect(localStorage.getItem('ts.token')).toBe('tok');

    await vi.advanceTimersByTimeAsync(1_000); // first retry after 1s fails again (502)
    expect(me).toHaveBeenCalledTimes(2);
    expect(useSession.getState().ready).toBe(false);

    await vi.advanceTimersByTimeAsync(1_999); // second retry waits 2s
    expect(me).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(me).toHaveBeenCalledTimes(3);
    expect(useSession.getState()).toMatchObject({ ready: true, token: 'tok', account, settings });
  });

  it('runs a single restore when init is called twice', async () => {
    localStorage.setItem('ts.token', 'tok');
    const me = vi.spyOn(api, 'me').mockRejectedValue(unreachable());
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    await Promise.all([useSession.getState().init(), useSession.getState().init()]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(me).toHaveBeenCalledTimes(2); // the first attempt and one retry, not two retry loops
    expect(useSession.getState()).toMatchObject({ ready: false, token: 'tok' });
  });

  it('stops retrying once the user signs out meanwhile', async () => {
    localStorage.setItem('ts.token', 'tok');
    const me = vi.spyOn(api, 'me').mockRejectedValue(unreachable());
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    vi.spyOn(api, 'logout').mockResolvedValue({ ok: true });
    await useSession.getState().init();
    await useSession.getState().logout();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(me).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({ token: null, ready: true });
  });

  it('exposes a failed restore and retries at once on request', async () => {
    // Its own token: retry loops left over by the tests above only go on for theirs.
    localStorage.setItem('ts.token', 'tok-503');
    const me = vi.spyOn(api, 'me').mockRejectedValueOnce(new ApiError(503, 'Service unavailable')).mockRejectedValueOnce(new ApiError(503, 'Service unavailable')).mockResolvedValue(account);
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    await useSession.getState().init();
    expect(useSession.getState()).toMatchObject({ ready: false, restoring: false });
    expect(useSession.getState().restoreError).toBeInstanceOf(ApiError);

    // Retry now instead of after the 1s backoff (still failing), then again later (succeeds).
    useSession.getState().retryRestore();
    await vi.advanceTimersByTimeAsync(0);
    expect(me).toHaveBeenCalledTimes(2);
    expect(useSession.getState().restoreError).toBeInstanceOf(ApiError);
    useSession.getState().retryRestore();
    await vi.advanceTimersByTimeAsync(0);
    expect(me).toHaveBeenCalledTimes(3);
    expect(useSession.getState()).toMatchObject({ ready: true, account, restoreError: null, restoring: false });
  });
});

describe('guest quick start', () => {
  const res: AuthResponse = { token: 'g1', account };

  it("seeds the new account's theme from the local theme", async () => {
    useUi.getState().setTheme('light');
    vi.spyOn(api, 'guest').mockResolvedValue(res);
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    const update = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({ ...settings, display: { ...settings.display, ...patch.display } }) as UserSettings);
    await useSession.getState().guest();
    expect(update).toHaveBeenCalledWith({ display: { theme: 'light' } });
    expect(useSession.getState().settings?.display.theme).toBe('light');
  });

  it('skips the save when the themes already agree', async () => {
    useUi.getState().setTheme('dark');
    vi.spyOn(api, 'guest').mockResolvedValue(res);
    vi.spyOn(api, 'settings').mockResolvedValue(settings);
    const update = vi.spyOn(api, 'updateSettings');
    await useSession.getState().guest();
    expect(update).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ token: 'g1', account, ready: true });
  });
});

describe('register and login themes', () => {
  const res: AuthResponse = { token: 'r1', account: { ...account, isGuest: false } };
  const darkSettings = (): UserSettings => ({ ...settings, display: { ...settings.display, theme: 'dark' } });

  it('a new registration keeps the theme on screen (no flip to the server default)', async () => {
    useUi.getState().setTheme('light');
    vi.spyOn(api, 'register').mockResolvedValue(res);
    vi.spyOn(api, 'settings').mockResolvedValue(darkSettings());
    const update = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({ ...settings, display: { ...settings.display, ...patch.display } }) as UserSettings);
    await useSession.getState().register('alice', 'secret1');
    expect(update).toHaveBeenCalledWith({ display: { theme: 'light' } });
    expect(useSession.getState().settings?.display.theme).toBe('light');
  });

  it('logging in adopts the account’s saved theme', async () => {
    useUi.getState().setTheme('light');
    vi.spyOn(api, 'login').mockResolvedValue(res);
    vi.spyOn(api, 'settings').mockResolvedValue(darkSettings());
    const update = vi.spyOn(api, 'updateSettings');
    await useSession.getState().login('alice', 'secret1');
    expect(update).not.toHaveBeenCalled();
    expect(useSession.getState().settings?.display.theme).toBe('dark');
  });
});

describe('promptAuth', () => {
  it('opens on a requested tab and resets it on close', () => {
    useSession.getState().promptAuth(true, 'login');
    expect(useSession.getState()).toMatchObject({ authPrompt: true, authTab: 'login' });
    useSession.getState().promptAuth(false);
    expect(useSession.getState()).toMatchObject({ authPrompt: false, authTab: null });
    useSession.getState().promptAuth(true);
    expect(useSession.getState().authTab).toBeNull();
  });
});
