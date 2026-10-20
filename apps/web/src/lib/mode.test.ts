import { afterEach, describe, expect, it } from 'vitest';
import { CHAIN_IDS } from '@trenchscope/shared';
import { enterLive, leaveLive, LIVE_STATUS } from '@/testing/live';
import { ApiError, isSessionExpiry } from './api';
import { errorMessage } from './format';
import { liveErrorText } from './liveErrors';
import { applyMeta, defaultChain, enabledChains, FEED_DELAYED_MS, getMode, isChainEnabled, liveHealth, resetModeStore, safeHttpUrl, useModeStore } from './mode';

afterEach(leaveLive);

describe('mode store', () => {
  it('boots in demo with every chain until meta says otherwise', () => {
    expect(getMode()).toBe('demo');
    expect(enabledChains()).toEqual(CHAIN_IDS);
    expect(useModeStore.getState().known).toBe(false);
  });

  it('adopts live meta: Solana only, live status, demo link', () => {
    enterLive();
    const s = useModeStore.getState();
    expect(s.mode).toBe('live');
    expect(s.known).toBe(true);
    expect(s.enabledChains).toEqual(['sol']);
    expect(s.live?.tradingEnabled).toBe(true);
    expect(s.demoUrl).toBe('https://demo.trenchscope.test');
    expect(isChainEnabled('bsc')).toBe(false);
  });

  it('remembers the mode for the next boot (no demo flash on a live site)', () => {
    enterLive();
    resetModeStore();
    expect(getMode()).toBe('live');
    expect(enabledChains()).toEqual(['sol']);
  });

  it('keeps the chains in display order, ignores unknown ids and never renders a javascript: demo link', () => {
    applyMeta({ mode: 'demo', enabledChains: ['eth', 'sol', 'nope' as never], live: undefined, demoUrl: 'javascript:alert(1)', platformFeeRate: 0.008 });
    expect(enabledChains()).toEqual(['sol', 'eth']);
    expect(useModeStore.getState().demoUrl).toBeNull();
    expect(safeHttpUrl('https://x.test/demo')).toBe('https://x.test/demo');
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
  });

  it('opens the last used chain only when this deployment serves it', () => {
    localStorage.setItem('ts.chain', 'bsc');
    expect(defaultChain()).toBe('bsc');
    enterLive();
    expect(defaultChain()).toBe('sol');
  });
});

describe('liveHealth', () => {
  const now = 1_000_000;
  it('reads connected, delayed (quiet, disconnected, RPC down) and trading unavailable', () => {
    expect(liveHealth(null, now)).toBe('unknown');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: now - 5_000 }, now)).toBe('connected');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: now - FEED_DELAYED_MS - 1 }, now)).toBe('delayed');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: null }, now)).toBe('delayed');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: now, feedConnected: false }, now)).toBe('delayed');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: now, rpcHealthy: false }, now)).toBe('delayed');
    expect(liveHealth({ ...LIVE_STATUS, lastEventAt: now, tradingEnabled: false }, now)).toBe('trading_unavailable');
  });
});

describe('live error codes', () => {
  it('map to clear messages, also for 502 / 503 answers that are not an unreachable server', () => {
    enterLive();
    expect(errorMessage(new ApiError(503, 'trading is unavailable: no router', 'trading_unavailable'))).toMatch(/Trading is temporarily unavailable/);
    expect(errorMessage(new ApiError(503, 'wallets are unavailable right now', 'wallets_unavailable'))).toMatch(/Wallets are temporarily unavailable/);
    expect(errorMessage(new ApiError(502, 'slippage tolerance exceeded', 'tx_failed'))).toBe('The transaction failed on Solana. Slippage tolerance exceeded.');
    expect(errorMessage(new ApiError(403, 'no guests', 'guest_disabled'))).toMatch(/Guest accounts aren’t available/);
    expect(errorMessage(new ApiError(403, 'x', 'two_factor_required'))).toMatch(/Turn on two-factor/);
    expect(errorMessage(new ApiError(403, 'x', 'address_not_whitelisted'))).toMatch(/whitelisted/);
    expect(errorMessage(new ApiError(400, 'insufficient balance: 2 SOL', 'insufficient_balance'))).toMatch(/Deposit SOL/);
    expect(errorMessage(new ApiError(401, 'invalid two-factor code', 'totp_required'))).toMatch(/didn’t work/);
    expect(errorMessage(new ApiError(403, 'x', 'not_available_in_live'))).toMatch(/isn’t available on the live platform/);
    expect(errorMessage(new ApiError(400, 'chain bsc is not available on this server', 'chain_not_enabled'))).toMatch(/Solana only/);
    expect(errorMessage(new ApiError(503, 'not configured', 'two_factor_unavailable'))).toMatch(/temporarily unavailable/);
    expect(errorMessage(new ApiError(409, 'already on', 'two_factor_enabled'))).toBe('Two-factor authentication is already on.');
    // Not a live-only code: the server's own wording (with its retry time) stays.
    expect(errorMessage(new ApiError(429, 'too many withdrawals; try again in 30s', 'rate_limited'))).toBe('too many withdrawals; try again in 30s');
  });

  it('leave demo wording alone (demo launches also answer insufficient_balance)', () => {
    expect(liveErrorText('insufficient_balance', 'insufficient SOL balance: 3 SOL needed')).toBeNull();
    expect(errorMessage(new ApiError(400, 'insufficient SOL balance: 3 SOL needed', 'insufficient_balance'))).toBe('insufficient SOL balance: 3 SOL needed');
    expect(errorMessage(new ApiError(503, 'Service Unavailable'))).toBe('Server unreachable — is the API running?');
  });

  it('a wrong 2FA code never signs the user out', () => {
    expect(isSessionExpiry(401, '/wallet/withdraw', 'a', 'a', 'totp_required')).toBe(false);
    expect(isSessionExpiry(401, '/security/2fa/disable', 'a', 'a', 'totp_required')).toBe(false);
    expect(isSessionExpiry(401, '/wallet/withdraw', 'a', 'a', 'unauthorized')).toBe(true);
  });
});
