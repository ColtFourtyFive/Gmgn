// Account security building blocks: RFC 4648 base32, RFC 4226 HOTP and RFC 6238
// TOTP (published test vectors), replay protection, AES-256-GCM sealing,
// recovery codes, failed-code throttling, the whitelist delay and the env config.

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/context';
import {
  CODE_FAILURE_WINDOW_MS,
  CODE_LOCK_MS,
  MAX_CODE_FAILURES,
  MAX_WHITELIST_ENTRIES,
  RECOVERY_CODE_COUNT,
  SecondFactor,
  SecretBox,
  TOTP_SETUP_TTL_MS,
  describeSecurityEvent,
  emptySecurity,
  hashRecoveryCode,
  newRecoveryCodes,
  normalizeRecoveryCode,
  parseSecretsKey,
  type SecurityState,
} from '../src/accounts/security';
import { base32Decode, base32Encode, hotp, normalizeTotpCode, otpauthUrl, totp, totpStep, verifyTotp } from '../src/accounts/totp';
import { DEFAULT_SESSION_TTL_DAYS, DEFAULT_WHITELIST_DELAY_HOURS, loadLiveConfig, loadSecurityConfig } from '../src/live/config';

const KEY_HEX = 'a1'.repeat(32);
const ascii = (s: string) => Buffer.from(s, 'ascii');

describe('base32 (RFC 4648 §10)', () => {
  it('encodes and decodes the published vectors without padding', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(base32Encode(ascii(plain))).toBe(encoded);
      expect(base32Decode(encoded).toString('ascii')).toBe(plain);
    }
  });

  it('round-trips random secrets and tolerates case, spaces and padding', () => {
    for (let i = 0; i < 50; i++) {
      const buf = randomBytes(1 + (i % 40));
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
    expect(() => base32Decode('MZXW1')).toThrow(/invalid base32/);
  });
});

describe('HOTP (RFC 4226 appendix D)', () => {
  it('matches the published values for counters 0-9', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    const key = ascii('12345678901234567890');
    expected.forEach((code, counter) => expect(hotp(key, counter)).toBe(code));
  });
});

describe('TOTP (RFC 6238 appendix B)', () => {
  const keys = {
    sha1: ascii('12345678901234567890'),
    sha256: ascii('12345678901234567890123456789012'),
    sha512: ascii('1234567890123456789012345678901234567890123456789012345678901234'),
  };
  const vectors: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];

  it('matches every published 8-digit value for SHA-1, SHA-256 and SHA-512', () => {
    for (const [seconds, sha1, sha256, sha512] of vectors) {
      const at = seconds * 1000;
      expect(totp(keys.sha1, at, { digits: 8 })).toBe(sha1);
      expect(totp(keys.sha256, at, { digits: 8, algorithm: 'sha256' })).toBe(sha256);
      expect(totp(keys.sha512, at, { digits: 8, algorithm: 'sha512' })).toBe(sha512);
    }
  });

  it('uses 30-second steps and 6 digits by default (the low 6 digits of the 8-digit value)', () => {
    expect(totpStep(59_000)).toBe(1);
    expect(totpStep(60_000)).toBe(2);
    expect(totp(keys.sha1, 59_000)).toBe('287082');
    expect(totp(keys.sha1, 1111111109_000)).toBe('081804');
  });

  it('accepts a code one step either side of now, not two', () => {
    const key = keys.sha1;
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(key, totp(key, now), now, null)).toBe(step);
    expect(verifyTotp(key, totp(key, now - 30_000), now, null)).toBe(step - 1);
    expect(verifyTotp(key, totp(key, now + 30_000), now, null)).toBe(step + 1);
    expect(verifyTotp(key, totp(key, now - 60_000), now, null)).toBeNull();
    expect(verifyTotp(key, totp(key, now + 60_000), now, null)).toBeNull();
  });

  it('refuses a code at or before the last accepted step (replay)', () => {
    const key = keys.sha1;
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totp(key, now);
    expect(verifyTotp(key, code, now, step)).toBeNull(); // the same code again
    expect(verifyTotp(key, totp(key, now - 30_000), now, step)).toBeNull(); // an older one still in the window
    expect(verifyTotp(key, totp(key, now + 30_000), now, step)).toBe(step + 1);
  });

  it('only takes well-formed codes', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('12345a')).toBeNull();
    expect(verifyTotp(keys.sha1, 'abcdef', 59_000, null)).toBeNull();
  });

  it('builds an otpauth:// key URI for authenticator apps', () => {
    const raw = otpauthUrl({ issuer: 'Trenchscope', account: 'alice', secret: 'JBSWY3DPEHPK3PXP' });
    expect(raw.startsWith('otpauth://totp/Trenchscope:alice?')).toBe(true);
    const url = new URL(raw);
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Trenchscope:alice');
    expect(Object.fromEntries(url.searchParams)).toEqual({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Trenchscope', algorithm: 'SHA1', digits: '6', period: '30' });
  });
});

describe('SecretBox (AES-256-GCM)', () => {
  const box = new SecretBox(parseSecretsKey(KEY_HEX)!);

  it('round-trips, with a fresh IV every time', () => {
    const secret = randomBytes(20);
    const a = box.seal(secret, 'acc_1');
    const b = box.seal(secret, 'acc_1');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(a).not.toContain(secret.toString('base64'));
    expect(box.open(a, 'acc_1').equals(secret)).toBe(true);
    expect(box.open(b, 'acc_1').equals(secret)).toBe(true);
  });

  it('refuses tampered values, another account and another key', () => {
    const sealed = box.seal(Buffer.from('totp-secret'), 'acc_1');
    const [v, iv, tag, body] = sealed.split(':');
    const flipped = Buffer.from(body, 'base64');
    flipped[0] ^= 1;
    expect(() => box.open([v, iv, tag, flipped.toString('base64')].join(':'), 'acc_1')).toThrow();
    expect(() => box.open(sealed, 'acc_2')).toThrow();
    expect(() => new SecretBox(parseSecretsKey('b2'.repeat(32))!).open(sealed, 'acc_1')).toThrow();
    expect(() => box.open('garbage', 'acc_1')).toThrow(/unrecognized/);
  });

  it('takes a 32-byte hex SECRETS_KEY only', () => {
    expect(parseSecretsKey(KEY_HEX)?.length).toBe(32);
    expect(parseSecretsKey(` ${KEY_HEX} `)?.length).toBe(32);
    expect(parseSecretsKey('abcd')).toBeNull();
    expect(parseSecretsKey('zz'.repeat(32))).toBeNull();
    expect(parseSecretsKey(null)).toBeNull();
    expect(() => new SecretBox(Buffer.alloc(16))).toThrow();
  });
});

describe('recovery codes', () => {
  it('makes 10 distinct grouped codes, hashed per account', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const c = codes[0];
    expect(normalizeRecoveryCode(c.toUpperCase().replace(/-/g, ' '))).toBe(c.replace(/-/g, ''));
    expect(normalizeRecoveryCode('123456')).toBeNull();
    expect(hashRecoveryCode('acc_1', c)).toBe(hashRecoveryCode('acc_1', c.toUpperCase()));
    expect(hashRecoveryCode('acc_1', c)).not.toBe(hashRecoveryCode('acc_2', c));
    expect(hashRecoveryCode('acc_1', c)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('SecondFactor', () => {
  function rig(start = 1_700_000_000_000) {
    let now = start;
    const factor = new SecondFactor(new SecretBox(parseSecretsKey(KEY_HEX)!), () => now);
    const state: SecurityState = emptySecurity();
    const setup = factor.beginSetup(state, 'acc_1', 'alice');
    const key = base32Decode(setup.secret);
    return {
      factor,
      state,
      setup,
      code: (offsetMs = 0) => totp(key, now + offsetMs),
      advance: (ms: number) => (now += ms),
      now: () => now,
    };
  }

  it('enrols: the setup secret stays sealed and pending until a valid code confirms it', () => {
    const r = rig();
    expect(r.setup.otpauthUrl).toContain(`secret=${r.setup.secret}`);
    expect(r.state.totp).toBeNull();
    expect(r.state.pendingTotp?.secret).not.toContain(r.setup.secret);
    expect(r.factor.enable(r.state, 'acc_1', '000000')).toEqual({ ok: false, locked: false });
    const enabled = r.factor.enable(r.state, 'acc_1', r.code());
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) return;
    expect(enabled.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(r.state.totp).not.toBeNull();
    expect(r.state.pendingTotp).toBeNull();
    expect(r.state.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(r.state.recoveryCodes).not.toContain(enabled.recoveryCodes[0]);
    // The enabling code was used: it cannot be replayed.
    expect(r.factor.check(r.state, 'acc_1', r.code())).toEqual({ ok: false, locked: false });
    expect(() => r.factor.beginSetup(r.state, 'acc_1', 'alice')).toThrow(HttpError);
  });

  it('expires an unconfirmed setup', () => {
    const r = rig();
    r.advance(TOTP_SETUP_TTL_MS + 1);
    expect(() => r.factor.enable(r.state, 'acc_1', r.code())).toThrow(/start two-factor setup/);
  });

  it('accepts each code once, the next step afterwards', () => {
    const r = rig();
    r.factor.enable(r.state, 'acc_1', r.code());
    r.advance(30_000);
    const code = r.code();
    expect(r.factor.check(r.state, 'acc_1', code)).toEqual({ ok: true, kind: 'totp' });
    expect(r.factor.check(r.state, 'acc_1', code)).toEqual({ ok: false, locked: false });
    r.advance(30_000);
    expect(r.factor.check(r.state, 'acc_1', r.code())).toEqual({ ok: true, kind: 'totp' });
  });

  it('takes a recovery code once, and only where allowed', () => {
    const r = rig();
    const enabled = r.factor.enable(r.state, 'acc_1', r.code());
    if (!enabled.ok) throw new Error('not enabled');
    const [first] = enabled.recoveryCodes;
    expect(r.factor.check(r.state, 'acc_1', first)).toEqual({ ok: false, locked: false }); // TOTP-only check
    expect(r.factor.check(r.state, 'acc_1', first.toUpperCase(), { allowRecovery: true })).toEqual({ ok: true, kind: 'recovery' });
    expect(r.state.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT - 1);
    expect(r.factor.check(r.state, 'acc_1', first, { allowRecovery: true })).toEqual({ ok: false, locked: false });
  });

  it('locks after 5 failures within 10 minutes, for 15 minutes; older failures age out', () => {
    const r = rig();
    r.factor.enable(r.state, 'acc_1', r.code());
    for (let i = 0; i < MAX_CODE_FAILURES - 1; i++) expect(r.factor.check(r.state, 'acc_1', '000000')).toEqual({ ok: false, locked: false });
    // Spread out: the first four age out of the window, so a fifth does not lock.
    r.advance(CODE_FAILURE_WINDOW_MS);
    expect(r.factor.check(r.state, 'acc_1', '000000')).toEqual({ ok: false, locked: false });
    for (let i = 0; i < MAX_CODE_FAILURES - 2; i++) r.factor.check(r.state, 'acc_1', '000000');
    expect(r.factor.check(r.state, 'acc_1', '000000')).toEqual({ ok: false, locked: true });
    // Locked: even the right code is refused with 429 (and is not burned).
    const err = (() => {
      try {
        r.factor.check(r.state, 'acc_1', r.code());
      } catch (e) {
        return e;
      }
    })() as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(Number(err.headers?.['retry-after'])).toBe(CODE_LOCK_MS / 1000);
    r.advance(CODE_LOCK_MS - 1000);
    expect(() => r.factor.check(r.state, 'acc_1', r.code())).toThrow(/too many invalid codes/);
    r.advance(1000);
    expect(r.factor.check(r.state, 'acc_1', r.code())).toEqual({ ok: true, kind: 'totp' });
    expect(r.state.codeFailures).toEqual([]);
  });

  it('a success resets the failure count', () => {
    const r = rig();
    r.factor.enable(r.state, 'acc_1', r.code());
    for (let i = 0; i < MAX_CODE_FAILURES - 1; i++) r.factor.check(r.state, 'acc_1', '000000');
    r.advance(30_000);
    expect(r.factor.check(r.state, 'acc_1', r.code()).ok).toBe(true);
    for (let i = 0; i < MAX_CODE_FAILURES - 1; i++) expect(r.factor.check(r.state, 'acc_1', '000000')).toEqual({ ok: false, locked: false });
  });

  it('without SECRETS_KEY there is no enrolment; an unreadable secret never counts as "no 2FA"', () => {
    const r = rig();
    r.factor.enable(r.state, 'acc_1', r.code());
    const keyless = new SecondFactor(null, () => r.now());
    expect(keyless.available).toBe(false);
    expect(() => keyless.beginSetup(emptySecurity(), 'acc_2', 'bob')).toThrow(/not configured/);
    expect(() => keyless.check(r.state, 'acc_1', r.code(30_000))).toThrow(HttpError);
    const otherKey = new SecondFactor(new SecretBox(parseSecretsKey('c3'.repeat(32))!), () => r.now());
    const err = (() => {
      try {
        otherKey.check(r.state, 'acc_1', r.code(30_000));
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(err?.status).toBe(503);
    expect(err?.code).toBe('two_factor_unavailable');
  });

  it('whitelists an address only after the delay; relabelling keeps the original activation', () => {
    const r = rig();
    const delay = DEFAULT_WHITELIST_DELAY_HOURS * 3_600_000;
    const { entry, added } = r.factor.addWhitelist(r.state, { chain: 'sol', address: 'Dest1', label: 'cold' }, delay);
    expect(added).toBe(true);
    expect(entry.activeAt - entry.addedAt).toBe(delay);
    expect(r.factor.canWithdrawTo(r.state, 'sol', 'Dest1')).toBe(false);
    r.advance(delay - 1);
    expect(r.factor.canWithdrawTo(r.state, 'sol', 'Dest1')).toBe(false);
    const relabel = r.factor.addWhitelist(r.state, { chain: 'sol', address: 'Dest1', label: 'vault' }, delay);
    expect(relabel).toEqual({ entry: { ...entry, label: 'vault' }, added: false });
    r.advance(1);
    expect(r.factor.canWithdrawTo(r.state, 'sol', 'Dest1')).toBe(true);
    expect(r.factor.canWithdrawTo(r.state, 'eth', 'Dest1')).toBe(false);
    expect(r.factor.canWithdrawTo(r.state, 'sol', 'Other')).toBe(false);
    expect(r.factor.canWithdrawTo(undefined, 'sol', 'Dest1')).toBe(false);
    expect(r.factor.removeWhitelist(r.state, 'sol', 'Dest1')?.label).toBe('vault');
    expect(r.factor.canWithdrawTo(r.state, 'sol', 'Dest1')).toBe(false);
    expect(r.factor.removeWhitelist(r.state, 'sol', 'Dest1')).toBeNull();
    for (let i = 0; i < MAX_WHITELIST_ENTRIES; i++) r.factor.addWhitelist(r.state, { chain: 'sol', address: `D${i}`, label: '' }, delay);
    expect(() => r.factor.addWhitelist(r.state, { chain: 'sol', address: 'Dx', label: '' }, delay)).toThrow(/at most/);
  });
});

describe('security events', () => {
  it('describes audit records in one line', () => {
    const rec = (action: string, detail: Record<string, unknown> = {}) => ({ at: 1, accountId: 'a', action, ip: null, detail });
    expect(describeSecurityEvent(rec('login', { method: 'totp' }))).toBe('signed in with password and 2FA code');
    expect(describeSecurityEvent(rec('login_failed', { reason: 'password' }))).toBe('sign-in failed: wrong password');
    expect(describeSecurityEvent(rec('whitelist_add', { address: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', label: 'cold' }))).toBe('withdrawal address 7EcD...FLtV (cold) added');
    expect(describeSecurityEvent(rec('withdrawal_requested', { id: 'wd_1', amount: '1000', to: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' }))).toBe(
      'id: wd_1, amount: 1000, to: 7EcD...FLtV',
    );
  });
});

describe('security config', () => {
  it('reads SECRETS_KEY, WHITELIST_DELAY_HOURS and LIVE_SESSION_TTL_DAYS with defaults and problems', () => {
    const problems: string[] = [];
    expect(loadSecurityConfig({}, problems)).toEqual({
      secretsKey: null,
      whitelistDelayMs: DEFAULT_WHITELIST_DELAY_HOURS * 3_600_000,
      sessionTtlMs: DEFAULT_SESSION_TTL_DAYS * 86_400_000,
    });
    expect(problems).toEqual([expect.stringMatching(/^SECRETS_KEY is not set/)]);

    const bad: string[] = [];
    expect(loadSecurityConfig({ SECRETS_KEY: 'short', WHITELIST_DELAY_HOURS: '-3', LIVE_SESSION_TTL_DAYS: 'x' }, bad)).toMatchObject({
      secretsKey: null,
      whitelistDelayMs: DEFAULT_WHITELIST_DELAY_HOURS * 3_600_000,
      sessionTtlMs: DEFAULT_SESSION_TTL_DAYS * 86_400_000,
    });
    expect(bad).toEqual([expect.stringMatching(/SECRETS_KEY must be 32 bytes/)]);

    const ok: string[] = [];
    expect(loadSecurityConfig({ SECRETS_KEY: KEY_HEX, WHITELIST_DELAY_HOURS: '0', LIVE_SESSION_TTL_DAYS: '7' }, ok)).toEqual({ secretsKey: KEY_HEX, whitelistDelayMs: 0, sessionTtlMs: 7 * 86_400_000 });
    expect(ok).toEqual([]);

    const live = loadLiveConfig({ SECRETS_KEY: KEY_HEX });
    expect(live.config.security?.secretsKey).toBe(KEY_HEX);
    expect(live.problems.some((p) => p.includes('SECRETS_KEY'))).toBe(false);
    expect(loadLiveConfig({}).problems.some((p) => p.startsWith('SECRETS_KEY is not set'))).toBe(true);
  });
});
