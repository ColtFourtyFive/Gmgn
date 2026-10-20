// Live-mode account rules through the whole app (buildApp in live mode, a fake
// embedded-wallet signer on ctx.live, no network): no guests, wallet provisioned
// before the account exists, 2FA sign-in, session expiry and revocation, the
// withdrawal whitelist, the chain guard, write-through to the durable store and
// durability across a restart. Demo mode keeps its guests, faucet and launch.

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, type VersionedTransaction } from '@solana/web3.js';
import { CHAIN_IDS } from '@trenchscope/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  AppNotification,
  AuthResponse,
  ChainId,
  LaunchRequest,
  SecurityStatus,
  TotpEnableResponse,
  TotpSetup,
  UserSettings,
  WhitelistEntry,
} from '@trenchscope/shared';
import { Accounts } from '../src/accounts';
import { LIVE_MIN_PASSWORD_LENGTH } from '../src/accounts/service';
import { CODE_LOCK_MS } from '../src/accounts/security';
import { base32Decode, totp } from '../src/accounts/totp';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { EmbeddedWalletRef, SignerApi } from '../src/context';
import { loadLiveConfig } from '../src/live/config';
import { loadSnapshot } from '../src/persistence';
import { ACCOUNTS_FLUSH_MS, ACCOUNTS_STATE_KEY, STORE_FILE, TRADING_STATE_KEY, openStore } from '../src/store';

const KEY_HEX = '5e'.repeat(32);
const PASSWORD = 'correct horse battery';
const DAY = 86_400_000;
const IP = '198.51.100.7';

class FakeSigner implements SignerApi {
  readonly provider = 'fake';
  readonly calls: [string, ChainId][] = [];
  fail: Error | null = null;
  /** Runs inside createWallet, before it resolves. */
  during: ((accountId: string) => Promise<void> | void) | null = null;
  readonly made: EmbeddedWalletRef[] = [];

  async createWallet(accountId: string, chain: ChainId): Promise<EmbeddedWalletRef> {
    this.calls.push([accountId, chain]);
    await this.during?.(accountId);
    if (this.fail) throw this.fail;
    const ref = { chain, address: Keypair.generate().publicKey.toBase58(), provider: 'fake', providerWalletId: `wallet-${accountId}` };
    this.made.push(ref);
    return ref;
  }

  async signTransaction(_ref: EmbeddedWalletRef, _tx: VersionedTransaction): Promise<VersionedTransaction> {
    throw new Error('signing is not used by these tests');
  }
}

let built: BuiltApp;
let signer: FakeSigner;
let now: number;
let dir: string;

async function liveApp(opts: { env?: NodeJS.ProcessEnv; persist?: boolean; storePath?: string } = {}): Promise<BuiltApp> {
  const live = loadLiveConfig({ SECRETS_KEY: KEY_HEX, PUMPPORTAL_WS_URL: 'ws://127.0.0.1:9/none', JUPITER_API_URL: 'http://jupiter.test', ...opts.env });
  const app = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: live.problems, warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), {
    start: false,
    persist: opts.persist ?? false,
    storePath: opts.storePath,
  });
  app.ctx.live!.signer = signer;
  (app.ctx.accounts as Accounts).clock = () => now;
  return app;
}

beforeEach(async () => {
  vi.stubGlobal('fetch', async () => new Response('offline', { status: 503 }));
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-live-accounts-'));
  now = 1_750_000_000_000;
  signer = new FakeSigner();
  built = await liveApp();
});

afterEach(async () => {
  await built.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const accounts = () => built.ctx.accounts as Accounts;
const store = () => built.ctx.store!;

type Res<T> = { status: number; body: T & { error?: string; code?: string }; headers: Record<string, unknown> };

async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, opts: { token?: string; body?: unknown; ip?: string } = {}): Promise<Res<T>> {
  const res = await built.app.inject({
    method,
    url,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    payload: opts.body as Record<string, unknown> | undefined,
    remoteAddress: opts.ip ?? IP,
  });
  return { status: res.statusCode, body: res.json(), headers: res.headers };
}

async function register(username = 'alice', password = PASSWORD): Promise<AuthResponse> {
  const res = await call<AuthResponse>('POST', '/api/auth/register', { body: { username, password } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

async function login(body: { username?: string; password?: string; code?: string }, ip = IP) {
  return call<AuthResponse>('POST', '/api/auth/login', { body: { username: 'alice', password: PASSWORD, ...body }, ip });
}

/** Enrol 2FA; the enabling code uses the current step. */
async function enable2fa(token: string): Promise<{ key: Buffer; recovery: string[] }> {
  const setup = await call<TotpSetup>('POST', '/api/security/2fa/setup', { token });
  expect(setup.status, JSON.stringify(setup.body)).toBe(200);
  const key = base32Decode(setup.body.secret);
  const res = await call<TotpEnableResponse>('POST', '/api/security/2fa/enable', { token, body: { code: totp(key, now) } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { key, recovery: res.body.recoveryCodes };
}

/** A fresh code: the clock moves one step on, since every code is accepted once. */
function nextCode(key: Buffer): string {
  now += 30_000;
  return totp(key, now);
}

const newAddress = () => Keypair.generate().publicKey.toBase58();

describe('live registration', () => {
  it('refuses guest accounts', async () => {
    const res = await call('POST', '/api/auth/guest', { body: {} });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('guest_disabled');
    expect(() => accounts().createGuest()).toThrow(/not available/);
  });

  it(`requires a password of at least ${LIVE_MIN_PASSWORD_LENGTH} characters`, async () => {
    const res = await call('POST', '/api/auth/register', { body: { username: 'alice', password: 'short pw' } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'invalid_input', error: expect.stringMatching(/at least 10/) });
    expect(signer.calls).toEqual([]);
  });

  it('provisions the embedded wallet before the account exists, then serves a SOL-only account at that address with no balance', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let invisible = false;
    signer.during = async (id) => {
      invisible = accounts().getAccount(id) === null;
      await gate;
    };
    const pending = call<AuthResponse>('POST', '/api/auth/register', { body: { username: 'alice', password: PASSWORD } });
    while (!signer.calls.length) await new Promise((r) => setTimeout(r, 5));
    // While the wallet is being created: no account, the name is held, no sign-in.
    expect(invisible).toBe(true);
    expect((await call('POST', '/api/auth/register', { body: { username: 'ALICE', password: PASSWORD } })).body.code).toBe('username_taken');
    expect((await login({})).status).toBe(401);
    release();
    const res = await pending;
    expect(res.status).toBe(200);

    const { token, account } = res.body;
    const ref = signer.made[0];
    expect(signer.calls).toEqual([[account.id, 'sol']]);
    expect(Object.keys(account.wallets)).toEqual(['sol']);
    expect(account.wallets.sol).toEqual({ chain: 'sol', address: ref.address, nativeBalance: 0, nativeBalanceUsd: 0 });
    expect(account.twoFactorEnabled).toBe(false);
    expect(account.isGuest).toBe(false);
    expect(accounts().walletRef(account.id, 'sol')).toEqual(ref);
    expect(accounts().walletRef(account.id, 'eth')).toBeNull();
    expect(accounts().accountIdForWallet(ref.address)).toBe(account.id);

    const { world } = built.ctx;
    const wallet = world.getWallet(ref.address)!;
    expect(wallet).toMatchObject({ archetype: 'user', accountId: account.id, native: 0, chain: 'sol' });
    expect(accounts().walletFor(account.id, 'sol')).toBe(wallet);
    // Chains that are not enabled have no World wallet: a detached empty stand-in keeps walletFor() callers working.
    for (const chain of ['eth', 'bsc', 'base'] as const) {
      const placeholder = accounts().walletFor(account.id, chain);
      expect(placeholder).toMatchObject({ chain, address: '', native: 0, accountId: account.id });
      expect(world.walletsOf(chain, 'user')).toEqual([]);
    }
    expect((await call('GET', '/api/portfolio', { token })).status).toBe(200);
    expect((await call('GET', '/api/portfolio/activity', { token })).status).toBe(200);
    const me = await call<Account>('GET', '/api/me', { token });
    expect(Object.keys(me.body.wallets)).toEqual(['sol']);

    const audit = store().auditFor(account.id, 10);
    expect(audit.map((a) => a.action)).toEqual(['wallet_created', 'register']);
    expect(audit[1]).toMatchObject({ ip: IP, detail: { username: 'alice' } });
    expect(audit[0].detail).toEqual({ chain: 'sol', provider: 'fake', address: ref.address });
    // On disk before the response (funds may be sent to the address right away).
    const saved = store().getState(ACCOUNTS_STATE_KEY) as { accounts: { id: string; embedded: unknown }[] };
    expect(saved.accounts.map((a) => a.id)).toEqual([account.id]);
    expect(saved.accounts[0].embedded).toEqual({ sol: ref });
  });

  it('without a signer answers 503 wallets_unavailable and creates nothing', async () => {
    built.ctx.live!.signer = null;
    const res = await call('POST', '/api/auth/register', { body: { username: 'alice', password: PASSWORD } });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('wallets_unavailable');
    expect(accounts().serialize().accounts).toEqual([]);
    expect(built.ctx.world.walletsOf('sol', 'user')).toEqual([]);

    built.ctx.live!.signer = signer;
    await register('alice'); // the name was never taken
  });

  it('when the provider fails answers 503 wallets_unavailable and creates nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signer.fail = new Error('provider timeout');
    const res = await call('POST', '/api/auth/register', { body: { username: 'alice', password: PASSWORD } });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('wallets_unavailable');
    expect(accounts().serialize().accounts).toEqual([]);
    expect(built.ctx.world.walletsOf('sol', 'user')).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/wallet provisioning failed \(fake\): provider timeout/));
    signer.fail = null;
    await register('alice');
  });

  it('has no paper money: faucet and token launch are refused', async () => {
    const { token } = await register();
    const faucet = await call('POST', '/api/wallet/faucet', { token, body: { chain: 'sol' } });
    expect(faucet.status).toBe(403);
    expect(faucet.body.code).toBe('not_available_in_live');
    const launch = await call('POST', '/api/launch', {
      token,
      body: { chain: 'sol', launchpad: 'pump', name: 'Croak Capital', symbol: 'CRK', description: '', socials: {}, logoGlyph: '🐸', devBuyNative: 1 } satisfies Partial<LaunchRequest>,
    });
    expect(launch.status).toBe(403);
    expect(launch.body.code).toBe('not_available_in_live');
    expect((await call('POST', '/api/launch', { body: {} })).status).toBe(401);
    expect(built.ctx.world.getWallet(accounts().walletFor((await call<Account>('GET', '/api/me', { token })).body.id, 'sol').address)?.native).toBe(0);
  });
});

describe('live chain guard', () => {
  it('answers 400 chain_not_enabled for any chain but Solana in params, query or body', async () => {
    const { token } = await register();
    const refused = [
      await call('GET', '/api/eth/trenches'),
      await call('GET', '/api/bsc/tokens/0xabc'),
      await call('GET', '/api/portfolio?chain=base', { token }),
      await call('GET', '/api/follows?chain=sol&chain=eth', { token }),
      await call('POST', '/api/follows', { token, body: { chain: 'eth', address: '0xabc' } }),
      await call('POST', '/api/trade/quote', { token, body: { chain: 'bsc', token: '0xabc', side: 'buy', amount: 1 } }),
      await call('POST', '/api/security/whitelist', { token, body: { chain: 'eth', address: '0xabc', label: '', code: '123456' } }),
    ];
    for (const res of refused) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('chain_not_enabled');
    }
    expect((await call('GET', '/api/sol/trenches')).status).toBe(200);
    expect((await call('GET', '/api/portfolio?chain=all', { token })).status).toBe(200);
    expect((await call('GET', '/api/portfolio?chain=sol', { token })).status).toBe(200);
  });
});

describe('live sign-in', () => {
  it('requires the second factor once enabled: TOTP codes once each, recovery codes once; audited with the client address', async () => {
    const { token, account } = await register();
    expect((await login({})).status).toBe(200);
    const { key, recovery } = await enable2fa(token);

    const missing = await login({});
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('totp_required');
    const wrong = await login({ code: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('totp_required');
    // A right code with the wrong password still says nothing about the second factor.
    expect((await login({ password: 'wrong password!!', code: totp(key, now + 30_000) })).body.code).toBe('invalid_credentials');

    const code = nextCode(key);
    const ok = await login({ code }, '203.0.113.9');
    expect(ok.status).toBe(200);
    expect(ok.body.account.twoFactorEnabled).toBe(true);
    expect((await login({ code })).body.code).toBe('totp_required'); // replay

    const viaRecovery = await login({ code: recovery[0].toUpperCase() });
    expect(viaRecovery.status).toBe(200);
    expect((await login({ code: recovery[0] })).status).toBe(401);

    const audit = store().auditFor(account.id, 50);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('2fa_enabled');
    expect(actions).toContain('recovery_code_used');
    expect(audit.find((a) => a.action === 'login' && a.ip === '203.0.113.9')?.detail).toEqual({ method: 'totp' });
    expect(audit.find((a) => a.action === 'login' && a.detail.method === 'recovery')).toBeDefined();
    expect(audit.filter((a) => a.action === 'login_failed').map((a) => a.detail.reason)).toEqual(['two_factor', 'two_factor', 'password', 'two_factor']);
    expect(audit.every((a) => !JSON.stringify(a.detail).includes(PASSWORD))).toBe(true);

    const status = await call<SecurityStatus>('GET', '/api/security', { token: ok.body.token });
    expect(status.body.recentEvents.slice(0, 3).map((e) => e.action)).toEqual(['login_failed', '2fa_failed', 'login']); // the reused recovery code, newest first
    expect(status.body.recentEvents.find((e) => e.action === 'recovery_code_used')).toMatchObject({ ip: IP, detail: 'recovery code used (9 left)' });
    expect(status.body.recentEvents.find((e) => e.action === 'login' && e.ip === '203.0.113.9')?.detail).toBe('signed in with password and 2FA code');
  });

  it('records failed sign-ins of unknown usernames without an account', async () => {
    await register();
    expect((await login({ username: 'mallory' })).status).toBe(401);
    expect((await login({ password: 'not the password' })).status).toBe(401);
    const id = (await login({})).body.account.id;
    expect(store().auditFor(id, 10).find((a) => a.action === 'login_failed')).toMatchObject({ ip: IP, detail: { reason: 'password' } });
  });

  it('locks second-factor checks for 15 minutes after 5 invalid codes', async () => {
    const { token, account } = await register();
    const { key } = await enable2fa(token);
    const address = newAddress();
    for (let i = 0; i < 5; i++) {
      const res = await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'x', code: '000000' } });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('totp_required');
    }
    const locked = await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'x', code: nextCode(key) } });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('rate_limited');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await login({ code: nextCode(key) })).status).toBe(429);
    expect(accounts().verifySecondFactor.bind(accounts(), account.id, nextCode(key))).toThrow(/too many invalid codes/);

    now += CODE_LOCK_MS;
    expect((await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'x', code: nextCode(key) } })).status).toBe(200);
    expect(store().auditFor(account.id, 50).some((a) => a.action === '2fa_locked')).toBe(true);
    const notes = await call<AppNotification[]>('GET', '/api/notifications', { token });
    expect(notes.body.some((n) => n.title === 'Two-factor codes locked')).toBe(true);
  });
});

describe('live sessions', () => {
  it('expire after LIVE_SESSION_TTL_DAYS (14) without use, sliding with each use', async () => {
    const { token } = await register();
    now += 13 * DAY;
    expect((await call('GET', '/api/me', { token })).status).toBe(200);
    now += 13 * DAY; // 26 days since sign-in, 13 since the last use
    expect((await call('GET', '/api/me', { token })).status).toBe(200);
    now += 14 * DAY + 1;
    expect((await call('GET', '/api/me', { token })).status).toBe(401);
    expect(accounts().resolveToken(token)).toBeNull();
  });

  it('honours a shorter LIVE_SESSION_TTL_DAYS and sweeps expired sessions in housekeeping', async () => {
    await built.close();
    built = await liveApp({ env: { LIVE_SESSION_TTL_DAYS: '1' } });
    const { token } = await register();
    const second = (await login({})).body.token;
    expect(accounts().serialize().sessions).toHaveLength(2);
    now += DAY / 2;
    expect(accounts().resolveToken(token)).not.toBeNull();
    now += DAY / 2 + 1;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    built.ctx.engine.step(60_000); // accounts housekeeping: the unused session goes, the other stays
    expect(accounts().serialize().sessions.map((s) => s[0])).toHaveLength(1);
    expect(accounts().resolveToken(second)).toBeNull();
    expect(accounts().resolveToken(token)).not.toBeNull();
  });

  it('a password change signs out every session and returns a new one (2FA code required when on)', async () => {
    const first = await register();
    const second = (await login({})).body.token;
    const bad = await call('POST', '/api/auth/password', { token: first.token, body: { currentPassword: 'nope nope nope', newPassword: 'a brand new password' } });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('invalid_credentials');
    const short = await call('POST', '/api/auth/password', { token: first.token, body: { currentPassword: PASSWORD, newPassword: 'short' } });
    expect(short.status).toBe(400);

    const changed = await call<AuthResponse>('POST', '/api/auth/password', { token: first.token, body: { currentPassword: PASSWORD, newPassword: 'a brand new password' } });
    expect(changed.status).toBe(200);
    expect((await call('GET', '/api/me', { token: first.token })).status).toBe(401);
    expect((await call('GET', '/api/me', { token: second })).status).toBe(401);
    expect((await call('GET', '/api/me', { token: changed.body.token })).status).toBe(200);
    expect((await login({})).status).toBe(401);
    expect((await login({ password: 'a brand new password' })).status).toBe(200);

    const { key } = await enable2fa(changed.body.token);
    const noCode = await call('POST', '/api/auth/password', { token: changed.body.token, body: { currentPassword: 'a brand new password', newPassword: 'third password here' } });
    expect(noCode.body.code).toBe('totp_required');
    const withCode = await call<AuthResponse>('POST', '/api/auth/password', {
      token: changed.body.token,
      body: { currentPassword: 'a brand new password', newPassword: 'third password here', code: nextCode(key) },
    });
    expect(withCode.status).toBe(200);
    expect(store().auditFor(first.account.id, 50).filter((a) => a.action === 'password_changed')).toHaveLength(2);
  });

  it('disabling 2FA (TOTP or recovery code) signs out every session', async () => {
    const first = await register();
    const second = (await login({})).body.token;
    const { recovery } = await enable2fa(first.token);
    const wrong = await call('POST', '/api/security/2fa/disable', { token: first.token, body: { code: '000000' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('totp_required');
    const off = await call('POST', '/api/security/2fa/disable', { token: first.token, body: { code: recovery[3] } });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ enabled: false });
    expect((await call('GET', '/api/me', { token: first.token })).status).toBe(401);
    expect((await call('GET', '/api/me', { token: second })).status).toBe(401);
    const back = await login({});
    expect(back.status).toBe(200);
    expect(back.body.account.twoFactorEnabled).toBe(false);
    expect(accounts().hasSecondFactor(first.account.id)).toBe(false);
  });
});

describe('live account security', () => {
  it('2FA setup and enable: a code from the setup secret turns it on and returns 10 recovery codes', async () => {
    const { token } = await register();
    const setup = await call<TotpSetup>('POST', '/api/security/2fa/setup', { token });
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Trenchscope:alice\?secret=[A-Z2-7]+&issuer=Trenchscope/);
    const key = base32Decode(setup.body.secret);
    expect(key).toHaveLength(20);
    const bad = await call('POST', '/api/security/2fa/enable', { token, body: { code: '123456' } });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('totp_required');
    const ok = await call<TotpEnableResponse>('POST', '/api/security/2fa/enable', { token, body: { code: totp(key, now) } });
    expect(ok.body.enabled).toBe(true);
    expect(ok.body.recoveryCodes).toHaveLength(10);
    expect((await call('POST', '/api/security/2fa/setup', { token })).status).toBe(409);
    // The secret is stored sealed (and recovery codes as digests), written at once.
    const saved = JSON.stringify(store().getState(ACCOUNTS_STATE_KEY));
    expect(saved).not.toContain(setup.body.secret);
    expect(saved).not.toContain(ok.body.recoveryCodes[0]);
    expect(saved).toContain('"totp":{"secret":"v1:');
    expect((await call<Account>('GET', '/api/me', { token })).body.twoFactorEnabled).toBe(true);
  });

  it('whitelist: 2FA required, a TOTP code per change, active after WHITELIST_DELAY_HOURS, notified and listed', async () => {
    const { token, account } = await register();
    const initial = await call<SecurityStatus>('GET', '/api/security', { token });
    expect(initial.body).toMatchObject({ twoFactorEnabled: false, whitelist: [], whitelistDelayMs: 24 * 3_600_000 });
    expect(initial.body.recentEvents.map((e) => e.action)).toEqual(['wallet_created', 'register']);

    const address = newAddress();
    const no2fa = await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'cold', code: '123456' } });
    expect(no2fa.status).toBe(403);
    expect(no2fa.body.code).toBe('two_factor_required');

    const { key } = await enable2fa(token);
    expect((await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address: 'not-an-address', label: 'cold', code: nextCode(key) } })).body.code).toBe('invalid_input');
    expect((await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'cold', code: '000000' } })).body.code).toBe('totp_required');

    const added = await call<WhitelistEntry>('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'cold', code: nextCode(key) } });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({ chain: 'sol', address, label: 'cold', addedAt: now, activeAt: now + 24 * 3_600_000 });
    expect(accounts().canWithdrawTo(account.id, 'sol', address)).toBe(false);
    now += 24 * 3_600_000 - 1;
    expect(accounts().canWithdrawTo(account.id, 'sol', address)).toBe(false);
    now += 1;
    expect(accounts().canWithdrawTo(account.id, 'sol', address)).toBe(true);
    expect(accounts().canWithdrawTo(account.id, 'sol', newAddress())).toBe(false);

    const notes = await call<AppNotification[]>('GET', '/api/notifications', { token });
    expect(notes.body.find((n) => n.title === 'Withdrawal address added')?.body).toMatch(/cold .* can receive withdrawals in 24h/);
    const status = await call<SecurityStatus>('GET', '/api/security', { token });
    expect(status.body.twoFactorEnabled).toBe(true);
    expect(status.body.whitelist).toEqual([added.body]);
    expect(status.body.recentEvents[0]).toMatchObject({ action: 'whitelist_add', ip: IP });
    expect(status.body.recentEvents.some((e) => e.action === 'swap_sent')).toBe(false);

    const removed = await call('POST', '/api/security/whitelist/remove', { token, body: { chain: 'sol', address, code: nextCode(key) } });
    expect(removed.body).toEqual({ ok: true });
    expect(accounts().canWithdrawTo(account.id, 'sol', address)).toBe(false);
    expect((await call('POST', '/api/security/whitelist/remove', { token, body: { chain: 'sol', address, code: nextCode(key) } })).status).toBe(404);
    expect(store().auditFor(account.id, 50).map((a) => a.action)).toEqual(expect.arrayContaining(['whitelist_add', 'whitelist_remove']));
  });

  it('implements the AccountsApi hooks used by withdrawals', async () => {
    const { token, account } = await register();
    const api = accounts();
    expect(api.hasSecondFactor(account.id)).toBe(false);
    expect(api.verifySecondFactor(account.id, '123456')).toBe(false);
    const { key, recovery } = await enable2fa(token);
    expect(api.hasSecondFactor(account.id)).toBe(true);
    const code = nextCode(key);
    expect(api.verifySecondFactor(account.id, code)).toBe(true);
    expect(api.verifySecondFactor(account.id, code)).toBe(false); // replay
    expect(api.verifySecondFactor(account.id, recovery[0])).toBe(false); // recovery codes never authorize withdrawals
    expect(api.verifySecondFactor('acc_nobody', code)).toBe(false);

    api.audit(account.id, 'withdrawal_requested', { ip: '192.0.2.1', id: 'wd_1', amount: 5_000_000n, to: 'x' });
    expect(store().auditFor(account.id, 1)[0]).toEqual({ at: now, accountId: account.id, action: 'withdrawal_requested', ip: '192.0.2.1', detail: { id: 'wd_1', amount: 5_000_000n, to: 'x' } });
    api.audit(null, 'system_event', { ip: null });
    expect(api.walletRef('acc_nobody', 'sol')).toBeNull();
  });

  it('drives the withdrawal authorization chain: 2FA on, a valid code, an active whitelisted destination', async () => {
    const { token } = await register();
    const to = newAddress();
    const withdraw = (code: string) => call('POST', '/api/wallet/withdraw', { token, body: { chain: 'sol', to, amount: 0.1, code } });
    expect((await withdraw('123456')).body.code).toBe('two_factor_required');
    const { key } = await enable2fa(token);
    expect((await withdraw('000000')).body.code).toBe('totp_required');
    expect((await withdraw(nextCode(key))).body.code).toBe('address_not_whitelisted');
    await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address: to, label: 'cold', code: nextCode(key) } });
    expect((await withdraw(nextCode(key))).body.code).toBe('address_not_whitelisted'); // still in its activation delay
    now += 24 * 3_600_000;
    // Past every account check: what remains is the chain (no RPC in this test).
    expect((await withdraw(nextCode(key))).body.code).not.toMatch(/two_factor_required|totp_required|address_not_whitelisted/);
  });

  it('without SECRETS_KEY 2FA cannot be enabled (503) and the problem is reported', async () => {
    await built.close();
    built = await liveApp({ env: { SECRETS_KEY: '' } });
    expect(built.ctx.config.liveProblems.some((p) => p.startsWith('SECRETS_KEY is not set'))).toBe(true);
    const { token } = await register();
    const res = await call('POST', '/api/security/2fa/setup', { token });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('two_factor_unavailable');
    expect((await call<SecurityStatus>('GET', '/api/security', { token })).body.twoFactorEnabled).toBe(false);
  });
});

describe('live durability', () => {
  it('writes through: urgent changes at once, the rest within ACCOUNTS_FLUSH_MS', async () => {
    const { token } = await register();
    const theme = () => (store().getState(ACCOUNTS_STATE_KEY) as { accounts: { settings: UserSettings }[] }).accounts[0].settings.display.theme;
    const before = theme();
    expect((await call('PUT', '/api/settings', { token, body: { display: { theme: before === 'light' ? 'dark' : 'light' } } })).status).toBe(200);
    expect(theme()).toBe(before);
    await new Promise((r) => setTimeout(r, ACCOUNTS_FLUSH_MS + 150));
    expect(theme()).not.toBe(before);
  });

  it('keeps accounts, sessions, 2FA (with replay state), whitelist and audit across a restart; recreates the World wallet', async () => {
    const { token, account } = await register();
    const { key } = await enable2fa(token);
    const address = newAddress();
    await call('POST', '/api/security/whitelist', { token, body: { chain: 'sol', address, label: 'cold', code: nextCode(key) } });
    const lastCode = nextCode(key);
    expect((await login({ code: lastCode })).status).toBe(200);
    await call('PUT', '/api/settings', { token, body: { display: { theme: 'light' } } }); // debounced: flushed on close
    const ref = accounts().walletRef(account.id, 'sol')!;
    await built.close();
    expect(statSync(join(dir, STORE_FILE)).mode & 0o777).toBe(0o600);

    built = await liveApp(); // no snapshot: a fresh World
    const me = await call<Account>('GET', '/api/me', { token });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: account.id, twoFactorEnabled: true, wallets: { sol: { address: ref.address, nativeBalance: 0 } } });
    expect(accounts().walletRef(account.id, 'sol')).toEqual(ref);
    expect(built.ctx.world.getWallet(ref.address)).toMatchObject({ archetype: 'user', accountId: account.id });
    expect(accounts().accountIdForWallet(ref.address)).toBe(account.id);
    expect((await call<UserSettings>('GET', '/api/settings', { token })).body.display.theme).toBe('light');
    expect((await login({ code: lastCode })).status).toBe(401); // the replay guard survived
    expect((await login({ code: nextCode(key) })).status).toBe(200);
    const status = await call<SecurityStatus>('GET', '/api/security', { token });
    expect(status.body.whitelist.map((w) => w.address)).toEqual([address]);
    expect(status.body.recentEvents.map((e) => e.action)).toEqual(expect.arrayContaining(['register', '2fa_enabled', 'whitelist_add', 'login']));
  });

  it('with snapshots on, keeps accounts and trading out of the snapshot (the store has them)', async () => {
    await built.close();
    built = await liveApp({ persist: true });
    const { token, account } = await register();
    built.save();
    const snap = loadSnapshot(dir)!;
    expect(snap.mode).toBe('live');
    expect(snap.accounts).toBeNull();
    expect(snap.trading).toBeNull();
    await built.close();
    const raw = openStore(join(dir, STORE_FILE));
    expect(raw.getState(TRADING_STATE_KEY)).toMatchObject({ version: 1 });
    raw.close();

    built = await liveApp({ persist: true }); // World from the snapshot, accounts from the store
    expect((await call<Account>('GET', '/api/me', { token })).body.id).toBe(account.id);
    expect(accounts().walletFor(account.id, 'sol').address).toBe(account.wallets.sol.address);
  });

  it('an in-memory store works for tests', async () => {
    await built.close();
    built = await liveApp({ storePath: ':memory:' });
    await register();
    expect(store().getState(ACCOUNTS_STATE_KEY)).not.toBeNull();
  });
});

describe('demo mode is unchanged', () => {
  it('keeps guests, faucet and launch; no store, no live security endpoints, every chain', async () => {
    const demo = await buildApp(defaultConfig({ mode: 'demo', warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
    try {
      const inject = async <T>(method: 'GET' | 'POST', url: string, token?: string, body?: unknown) => {
        const res = await demo.app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as Record<string, unknown> });
        return { status: res.statusCode, body: res.json() as T & { code?: string } };
      };
      expect(demo.ctx.store).toBeNull();
      const guest = await inject<AuthResponse>('POST', '/api/auth/guest', undefined, {});
      expect(guest.status).toBe(200);
      expect(Object.keys(guest.body.account.wallets).sort()).toEqual([...CHAIN_IDS].sort());
      expect('twoFactorEnabled' in guest.body.account).toBe(false);
      expect((await inject('POST', '/api/wallet/faucet', guest.body.token, { chain: 'sol' })).status).toBe(200);
      const launch = await inject('POST', '/api/launch', guest.body.token, {
        chain: 'sol',
        launchpad: 'moonpit',
        name: 'Croak Capital',
        symbol: 'CRKD',
        description: 'A very serious frog.',
        socials: {},
        logoGlyph: '🐸',
        devBuyNative: 1,
      });
      expect(launch.status).toBe(200);
      expect((await inject('GET', '/api/eth/trenches')).status).toBe(200);
      const security = await inject('GET', '/api/security', guest.body.token);
      expect(security.status).toBe(403);
      expect(security.body.code).toBe('not_available_in_demo');
      expect((await inject('POST', '/api/auth/register', undefined, { username: 'bob', password: 'hunter22' })).status).toBe(200);
    } finally {
      await demo.close();
    }
  });
});
