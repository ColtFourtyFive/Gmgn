import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, isSessionExpiry, setAuthToken, setUnauthorizedHandler } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

function answer(status: number, body: object) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe('401 handling', () => {
  it('a wrong password on the Log in tab does not sign the guest out', async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    setAuthToken('guest-token');
    answer(401, { error: 'invalid username or password', code: 'invalid_credentials' });
    await expect(api.login('alice', 'wrong')).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' });
    expect(expired).not.toHaveBeenCalled();
  });

  it('a revoked session on a 🔒 endpoint still signs out', async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    setAuthToken('old-token');
    answer(401, { error: 'sign in required', code: 'unauthorized' });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('only the session that was sent and is still current can expire', () => {
    expect(isSessionExpiry(401, '/me', 'a', 'a', 'unauthorized')).toBe(true);
    expect(isSessionExpiry(401, '/me', null, null, 'unauthorized')).toBe(false); // signed out: nothing to expire
    expect(isSessionExpiry(401, '/me', 'a', 'b', 'unauthorized')).toBe(false); // answer to a replaced token
    expect(isSessionExpiry(401, '/auth/login', 'a', 'a', 'invalid_credentials')).toBe(false);
    expect(isSessionExpiry(403, '/me', 'a', 'a')).toBe(false);
  });
});
