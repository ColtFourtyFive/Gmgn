import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { deserialize, serialize } from 'node:v8';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  CHAINS,
  CHAIN_IDS,
  type Account,
  type AppNotification,
  type AuthResponse,
  type FollowedWallet,
  type RewardsSummary,
  type TokenSummary,
  type UserSettings,
  type UserWallet,
  type WatchlistItem,
  type WsServerMessage,
} from '@trenchscope/shared';
import { Accounts } from '../src/accounts';
import { LOGIN_ATTEMPT_WINDOW_MS, MAX_LOGIN_ATTEMPTS, MAX_SESSIONS_PER_ACCOUNT } from '../src/accounts/service';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';

let built: BuiltApp;

beforeEach(async () => {
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
});

afterEach(async () => {
  await built.close();
});

const accounts = () => built.ctx.accounts as Accounts;

async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await built.app.inject({
    method,
    url,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    payload: opts.body as Record<string, unknown> | undefined,
  });
  return { status: res.statusCode, body: res.json() as T, headers: res.headers };
}

async function guest(referralCode?: string): Promise<AuthResponse> {
  const res = await call<AuthResponse>('POST', '/api/auth/guest', { body: referralCode ? { referralCode } : {} });
  expect(res.status).toBe(200);
  return res.body;
}

async function register(username: string, password = 'hunter22', extra: { referralCode?: string; token?: string } = {}): Promise<AuthResponse> {
  const res = await call<AuthResponse>('POST', '/api/auth/register', {
    token: extra.token,
    body: { username, password, referralCode: extra.referralCode },
  });
  expect(res.status).toBe(200);
  return res.body;
}

function makeToken(symbol = 'PEPE') {
  const { world } = built.ctx;
  const dev = world.createWallet('sol', 'dev', { native: 10 });
  return world.createToken({
    chain: 'sol',
    launchpad: 'moonpit',
    creator: dev,
    symbol,
    name: `${symbol} Coin`,
    description: '',
    logoSeed: symbol,
    logoGlyph: '🐸',
    narrative: 'Frogs',
    socials: {},
    xFollowers: null,
    fate: 'runner',
    hype: 1,
  });
}

const systemNote = (title: string) => ({ kind: 'system' as const, title, body: '', chain: null, token: null, wallet: null });

describe('auth', () => {
  it('creates guest accounts with a session and a funded paper wallet per chain', async () => {
    const { token, account } = await guest();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(account.username).toMatch(/^guest_/);
    expect(account.isGuest).toBe(true);
    expect(account.referralCode).toMatch(/^[A-Z2-9]{7}$/);
    for (const chain of CHAIN_IDS) {
      const w = account.wallets[chain];
      expect(w.nativeBalance).toBe(CHAINS[chain].starterBalance);
      expect(w.nativeBalanceUsd).toBeCloseTo(CHAINS[chain].starterBalance * built.ctx.world.nativeUsd(chain));
      const state = built.ctx.world.getWallet(w.address)!;
      expect(state.archetype).toBe('user');
      expect(state.accountId).toBe(account.id);
      expect(accounts().walletFor(account.id, chain)).toBe(state);
      expect(accounts().accountIdForWallet(w.address)).toBe(account.id);
    }
    expect(accounts().resolveToken(token)).toBe(account.id);
    expect(accounts().resolveToken('f'.repeat(64))).toBeNull();
  });

  it('registers, logs in case-insensitively and logs out only the presented session', async () => {
    const reg = await register('Alice');
    expect(reg.account.username).toBe('Alice');
    expect(reg.account.isGuest).toBe(false);

    const login = await call<AuthResponse>('POST', '/api/auth/login', { body: { username: 'alice', password: 'hunter22' } });
    expect(login.status).toBe(200);
    expect(login.body.account.id).toBe(reg.account.id);
    expect(login.body.token).not.toBe(reg.token);

    expect((await call('POST', '/api/auth/logout', { token: reg.token })).body).toEqual({ ok: true });
    expect((await call('GET', '/api/me', { token: reg.token })).status).toBe(401);
    expect((await call<Account>('GET', '/api/me', { token: login.body.token })).body.id).toBe(reg.account.id);
  });

  it('rejects bad credentials, duplicate and invalid usernames', async () => {
    const g = await guest();
    await register('Alice');
    const login = (username: string, password: string) => call<{ error: string }>('POST', '/api/auth/login', { body: { username, password } });
    expect((await login('alice', 'wrong-password')).status).toBe(401);
    expect((await login('nobody', 'hunter22')).status).toBe(401);
    expect((await login(g.account.username, 'anything')).status).toBe(401);

    const reg = (body: unknown) => call<{ error: string }>('POST', '/api/auth/register', { body });
    const dup = await reg({ username: 'ALICE', password: 'hunter22' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/taken/);
    const invalid = await reg({ username: 'a!', password: 'hunter22' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/^username:/);
    expect((await reg({ username: 'bobby', password: '123' })).status).toBe(400);
    expect((await reg({ username: 'guest_abc', password: 'hunter22' })).status).toBe(400);
    expect((await reg({ username: 'bobby', password: 'hunter22', referralCode: 'NOPE123' })).status).toBe(400);
  });

  it('upgrades the signed-in guest account in place on register', async () => {
    const referrer = await register('Alice');
    const g = await guest();
    const reg = await register('Carol', 'hunter22', { token: g.token, referralCode: referrer.account.referralCode });
    expect(reg.account.id).toBe(g.account.id);
    expect(reg.account.isGuest).toBe(false);
    expect(reg.account.referredBy).toBe(referrer.account.id);
    expect(reg.account.wallets.sol.address).toBe(g.account.wallets.sol.address);
    expect(accounts().resolveToken(g.token)).toBe(g.account.id);
    const login = await call<AuthResponse>('POST', '/api/auth/login', { body: { username: 'carol', password: 'hunter22' } });
    expect(login.body.account.id).toBe(g.account.id);
    expect(accounts().rewards(referrer.account.id).invitees.map((i) => i.username)).toEqual(['Carol']);
  });

  it('keeps only the newest sessions per account', async () => {
    const first = await register('Erin');
    const tokens = [first.token];
    for (let i = 0; i < MAX_SESSIONS_PER_ACCOUNT; i++) tokens.push((await accounts().login('erin', 'hunter22')).token);
    expect(accounts().resolveToken(tokens[0])).toBeNull();
    expect(tokens.slice(1).every((t) => accounts().resolveToken(t) === first.account.id)).toBe(true);

    // Logging out frees a slot: the next login evicts nothing.
    accounts().logout(tokens[1]);
    tokens.push((await accounts().login('erin', 'hunter22')).token);
    expect(tokens.slice(2).every((t) => accounts().resolveToken(t) === first.account.id)).toBe(true);
  });

  it('throttles repeated sign-in attempts per account', async () => {
    await register('Frank');
    const login = (password: string) => call<AuthResponse & { error: string; code: string }>('POST', '/api/auth/login', { body: { username: 'frank', password } });
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) expect((await login(`guess-${i}`)).status).toBe(401);
    const locked = await login('hunter22');
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ code: 'rate_limited', error: expect.stringMatching(/600s/) });

    built.ctx.world.now += LOGIN_ATTEMPT_WINDOW_MS;
    expect((await login('hunter22')).status).toBe(200);
    // A successful sign-in clears the counter.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) await login('wrong-again');
    expect((await login('hunter22')).status).toBe(200);
  });

  it('requires a valid session on protected endpoints', async () => {
    for (const url of ['/api/me', '/api/settings', '/api/follows', '/api/watchlist', '/api/notifications', '/api/rewards']) {
      expect((await call('GET', url)).status).toBe(401);
      expect((await call('GET', url, { token: 'bogus' })).status).toBe(401);
    }
    expect((await call('POST', '/api/auth/logout')).status).toBe(401);
  });
});

describe('account balances & faucet', () => {
  it('reports live native balances on /api/me', async () => {
    const { token, account } = await guest();
    const wallet = accounts().walletFor(account.id, 'sol');
    expect(built.ctx.world.executeSwap(wallet, makeToken(), 'buy', 2).ok).toBe(true);
    const me = (await call<Account>('GET', '/api/me', { token })).body;
    expect(me.wallets.sol.nativeBalance).toBeCloseTo(wallet.native);
    expect(me.wallets.sol.nativeBalance).toBeLessThan(CHAINS.sol.starterBalance - 1.9);
    expect(me.wallets.sol.nativeBalanceUsd).toBeCloseTo(wallet.native * built.ctx.world.nativeUsd('sol'));
  });

  it('tops the wallet up to the starter balance at most once a minute per chain', async () => {
    const { token, account } = await guest();
    const { world } = built.ctx;
    const wallet = accounts().walletFor(account.id, 'sol');
    const token0 = makeToken();
    const publish = vi.spyOn(built.ctx.hub, 'publishUser');
    const faucet = (chain = 'sol') => call<UserWallet & { error?: string }>('POST', '/api/wallet/faucet', { token, body: { chain } });

    // Already full: a no-op that does not start the cooldown.
    expect((await faucet()).body.nativeBalance).toBe(CHAINS.sol.starterBalance);

    world.executeSwap(wallet, token0, 'buy', 5);
    const topped = await faucet();
    expect(topped.status).toBe(200);
    expect(topped.body.nativeBalance).toBeCloseTo(CHAINS.sol.starterBalance);
    expect(publish).toHaveBeenCalledWith(account.id, 'balance', expect.objectContaining({ chain: 'sol', address: wallet.address }));

    world.executeSwap(wallet, token0, 'buy', 5);
    const limited = await faucet();
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.body.error).toMatch(/60s/);
    expect(wallet.native).toBeLessThan(CHAINS.sol.starterBalance - 4);

    world.now += 61_000;
    expect((await faucet()).body.nativeBalance).toBeCloseTo(CHAINS.sol.starterBalance);
    expect((await faucet('doge')).status).toBe(400);
  });
});

describe('settings', () => {
  it('returns per-chain defaults', async () => {
    const { token } = await guest();
    const s = (await call<UserSettings>('GET', '/api/settings', { token })).body;
    for (const chain of CHAIN_IDS) {
      const t = s.trade[chain];
      expect(t.activeBuyPreset).toBe('P2');
      expect(t.quickBuyAmounts).toEqual(CHAINS[chain].quickBuyAmounts);
      expect(t.instantBuyAmount).toBe(CHAINS[chain].quickBuyAmounts[1]);
      expect(t.quickSellPercents).toEqual([10, 25, 50, 100]);
      expect(t.buyPresets.P1).toMatchObject({ id: 'P1', autoSlippage: true, slippage: 0.2, antiMev: true });
      expect(t.buyPresets.P1.priorityFee).toBeLessThan(t.buyPresets.P2.priorityFee);
      expect(t.buyPresets.P2.priorityFee).toBeLessThan(t.buyPresets.P3.priorityFee);
      expect(t.buyPresets.P1.tip).toBeLessThan(t.buyPresets.P3.tip);
    }
    expect(s.display).toMatchObject({ currency: 'usd', chartUnit: 'mcap', theme: 'dark', hotkeys: true, confirmTrades: false });
    expect(s.display.riskThresholds).toEqual({ top10: 0.3, dev: 0.3, insiders: 0.05, bundlers: 0.1, snipers: 0.1 });
  });

  it('deep-merges partial updates and clamps out-of-range numbers', async () => {
    const { token } = await guest();
    const before = (await call<UserSettings>('GET', '/api/settings', { token })).body;
    const res = await call<UserSettings>('PUT', '/api/settings', {
      token,
      body: {
        trade: { sol: { buyPresets: { P3: { id: 'P3', slippage: 5, priorityFee: -1 } }, activeBuyPreset: 'P3', quickSellPercents: [20, 150] } },
        display: { theme: 'light', riskThresholds: { dev: 2 } },
      },
    });
    expect(res.status).toBe(200);
    const s = res.body;
    expect(s.trade.sol.buyPresets.P3).toEqual({ ...before.trade.sol.buyPresets.P3, slippage: 1, priorityFee: 0 });
    expect(s.trade.sol.buyPresets.P1).toEqual(before.trade.sol.buyPresets.P1);
    expect(s.trade.sol.sellPresets).toEqual(before.trade.sol.sellPresets);
    expect(s.trade.sol.activeBuyPreset).toBe('P3');
    expect(s.trade.sol.quickSellPercents).toEqual([20, 100]);
    expect(s.trade.bsc).toEqual(before.trade.bsc);
    expect(s.display).toEqual({ ...before.display, theme: 'light', riskThresholds: { ...before.display.riskThresholds, dev: 1 } });
    expect((await call<UserSettings>('GET', '/api/settings', { token })).body).toEqual(s);
  });

  it('rejects invalid values with a 400 naming the field', async () => {
    const { token } = await guest();
    const put = (body: unknown) => call<{ error: string }>('PUT', '/api/settings', { token, body });
    const theme = await put({ display: { theme: 'neon' } });
    expect(theme.status).toBe(400);
    expect(theme.body.error).toMatch(/^display\.theme:/);
    expect((await put({ trade: { sol: { quickBuyAmounts: [] } } })).status).toBe(400);
    expect((await put({ trade: { sol: { buyPresets: { P1: { slippage: 'high' } } } } })).status).toBe(400);
    expect((await put({ trade: { sol: { activeSellPreset: 'P4' } } })).status).toBe(400);
  });
});

describe('follows', () => {
  it('supports create, list, update and delete', async () => {
    const { token, account } = await guest();
    const { world } = built.ctx;
    const kol = world.createWallet('sol', 'kol', { native: 100, label: 'Ansem', tags: ['kol'] });
    kol.followerCount = 7;

    const created = await call<FollowedWallet>('POST', '/api/follows', { token, body: { chain: 'sol', address: kol.address, remark: 'Big fish' } });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ chain: 'sol', address: kol.address, remark: 'Big fish', group: 'Default', notify: true, label: kol.label, tags: ['kol'] });
    expect((await call<FollowedWallet[]>('GET', '/api/follows', { token })).body).toEqual([created.body]);
    // label and tags are the wallet's current ones, read when served
    kol.tags.add('whale');
    expect((await call<FollowedWallet[]>('GET', '/api/follows', { token })).body[0].tags).toEqual(['kol', 'whale']);
    expect((await call<FollowedWallet[]>('GET', '/api/follows?chain=bsc', { token })).body).toEqual([]);
    expect(accounts().followerCount('sol', kol.address)).toBe(8);
    expect(accounts().followersOf('sol', kol.address)).toEqual([account.id]);
    expect(accounts().isFollowing(account.id, 'sol', kol.address)).toBe(true);
    expect(accounts().remarkFor(account.id, 'sol', kol.address)).toBe('Big fish');

    const patched = await call<FollowedWallet>('PATCH', `/api/follows/sol/${kol.address}`, { token, body: { group: 'KOLs', notify: false } });
    expect(patched.body).toMatchObject({ remark: 'Big fish', group: 'KOLs', notify: false });

    expect((await call('DELETE', `/api/follows/sol/${kol.address}`, { token })).body).toEqual({ ok: true });
    expect(accounts().followerCount('sol', kol.address)).toBe(7);
    expect(accounts().followersOf('sol', kol.address)).toEqual([]);
    expect((await call('DELETE', `/api/follows/sol/${kol.address}`, { token })).status).toBe(404);
    expect((await call('PATCH', `/api/follows/sol/${kol.address}`, { token, body: { remark: 'x' } })).status).toBe(404);
  });

  it('validates the target wallet and normalizes EVM addresses', async () => {
    const { token, account } = await guest();
    const evm = built.ctx.world.createWallet('bsc', 'smart', { native: 5 });
    const follow = (body: unknown) => call<FollowedWallet>('POST', '/api/follows', { token, body });
    expect((await follow({ chain: 'sol', address: 'NotARealWallet111' })).status).toBe(404);
    expect((await follow({ chain: 'sol', address: evm.address })).status).toBe(404);
    expect((await follow({ chain: 'sol', address: account.wallets.sol.address })).status).toBe(400);
    expect((await follow({ chain: 'nope', address: evm.address })).status).toBe(400);
    const res = await follow({ chain: 'bsc', address: `0x${evm.address.slice(2).toUpperCase()}` });
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(evm.address);
  });

  it('notifies followers of followed-wallet trades, throttled per wallet and token', async () => {
    const { token, account } = await guest();
    const { world, hub } = built.ctx;
    const whale = world.createWallet('sol', 'whale', { native: 500 });
    const pepe = makeToken('PEPE');
    const wif = makeToken('WIF');
    await call('POST', '/api/follows', { token, body: { chain: 'sol', address: whale.address, remark: 'Whale' } });
    const publish = vi.spyOn(hub, 'publishUser');
    const notes = async () => (await call<AppNotification[]>('GET', '/api/notifications', { token })).body;

    world.executeSwap(whale, pepe, 'buy', 1.2);
    let list = await notes();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'follow_trade', chain: 'sol', token: pepe.address, wallet: whale.address, read: false });
    expect(list[0].body).toMatch(/^Whale bought 1\.2 SOL of \$PEPE at \$[\d.]+K MC$/);
    expect(publish).toHaveBeenCalledWith(account.id, 'notification', list[0]);

    world.now += 5_000;
    world.executeSwap(whale, pepe, 'buy', 0.5); // same wallet + token inside 15s: throttled
    world.executeSwap(whale, wif, 'buy', 0.5); // different token: delivered
    list = await notes();
    expect(list.map((n) => n.token)).toEqual([wif.address, pepe.address]);

    world.now += 15_000;
    world.executeSwap(whale, pepe, 'sell', whale.positions.get(pepe.address)!.balance / 2);
    list = await notes();
    expect(list).toHaveLength(3);
    expect(list[0].body).toMatch(/^Whale sold .* SOL of \$PEPE/);

    // Nothing while the engine fast-forwards history, nor once notify is off.
    world.now += 20_000;
    built.ctx.engine.warming = true;
    world.executeSwap(whale, pepe, 'buy', 0.3);
    built.ctx.engine.warming = false;
    await call('PATCH', `/api/follows/sol/${whale.address}`, { token, body: { notify: false } });
    world.now += 20_000;
    world.executeSwap(whale, pepe, 'buy', 0.3);
    expect(await notes()).toHaveLength(3);
  });
});

describe('watchlist', () => {
  it('adds, lists and removes tokens', async () => {
    const { token } = await guest();
    const pepe = makeToken();
    const add = (body: unknown) => call<WatchlistItem>('POST', '/api/watchlist', { token, body });

    const item = await add({ chain: 'sol', address: pepe.address });
    expect(item.status).toBe(200);
    expect(item.body).toEqual({ chain: 'sol', address: pepe.address, addedAt: built.ctx.world.now });
    built.ctx.world.now += 1000;
    expect((await add({ chain: 'sol', address: pepe.address })).body).toEqual(item.body);
    expect((await add({ chain: 'sol', address: 'missing' })).status).toBe(404);
    expect((await add({ chain: 'bsc', address: pepe.address })).status).toBe(404);
    expect((await add({ chain: 'xyz', address: pepe.address })).status).toBe(400);

    const view = (await call<{ items: WatchlistItem[]; tokens: TokenSummary[] }>('GET', '/api/watchlist', { token })).body;
    expect(view.items).toEqual([item.body]);
    expect(Array.isArray(view.tokens)).toBe(true);
    expect(view.tokens.every((t) => t.address === pepe.address)).toBe(true);

    expect((await call('DELETE', `/api/watchlist/sol/${pepe.address}`, { token })).body).toEqual({ ok: true });
    expect((await call('DELETE', `/api/watchlist/sol/${pepe.address}`, { token })).status).toBe(404);
    expect((await call<{ items: WatchlistItem[] }>('GET', '/api/watchlist', { token })).body.items).toEqual([]);
  });
});

describe('notifications', () => {
  it('keeps the newest 200, lists newest first and marks read', async () => {
    const { token, account } = await guest();
    for (let i = 0; i < 205; i++) accounts().notify(account.id, systemNote(`n${i}`));

    const all = (await call<AppNotification[]>('GET', '/api/notifications?limit=500', { token })).body;
    expect(all).toHaveLength(200);
    expect(all[0].title).toBe('n204');
    expect(all[199].title).toBe('n5');
    expect((await call<AppNotification[]>('GET', '/api/notifications', { token })).body).toHaveLength(50);
    expect((await call('GET', '/api/notifications?limit=abc', { token })).status).toBe(400);

    await call('POST', '/api/notifications/read', { token, body: { ids: [all[0].id] } });
    let list = (await call<AppNotification[]>('GET', '/api/notifications?limit=2', { token })).body;
    expect(list.map((n) => n.read)).toEqual([true, false]);

    expect((await call('POST', '/api/notifications/read', { token })).body).toEqual({ ok: true });
    list = (await call<AppNotification[]>('GET', '/api/notifications?limit=200', { token })).body;
    expect(list.every((n) => n.read)).toBe(true);
  });

  it('streams balances and notifications on the user channel', async () => {
    const { token, account } = await guest();
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = built.app.server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const inbox: WsServerMessage[] = [];
    let wake: () => void = () => {};
    ws.on('message', (raw) => {
      inbox.push(JSON.parse(String(raw)) as WsServerMessage);
      wake();
    });
    const take = async (pred: (m: WsServerMessage) => boolean): Promise<WsServerMessage> => {
      for (;;) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0];
        await new Promise<void>((resolve) => (wake = resolve));
      }
    };
    await once(ws, 'open');
    try {
      ws.send(JSON.stringify({ op: 'auth', token }));
      expect(await take((m) => m.op === 'auth')).toEqual({ op: 'auth', ok: true, accountId: account.id });
      ws.send(JSON.stringify({ op: 'sub', ch: 'user' }));
      await take((m) => m.op === 'ack');
      const balances = [];
      for (let i = 0; i < CHAIN_IDS.length; i++) balances.push(await take((m) => m.op === 'data' && m.type === 'balance'));
      expect(balances.map((m) => (m.op === 'data' ? (m.data as UserWallet).chain : null))).toEqual(CHAIN_IDS);

      const sent = accounts().notify(account.id, systemNote('hello'));
      const msg = await take((m) => m.op === 'data' && m.type === 'notification');
      expect(msg).toEqual({ op: 'data', ch: 'user', type: 'notification', data: sent });
    } finally {
      ws.close();
    }
  });
});

describe('rewards & referrals', () => {
  it('accrues volume, fees, cashback, points and tiered referrer rebates', async () => {
    const alice = await register('alice');
    const bob = await register('bob', 'hunter22', { referralCode: alice.account.referralCode.toLowerCase() });
    expect(bob.account.referredBy).toBe(alice.account.id);
    expect((await guest('ZZZZZZZ')).account.referredBy).toBeNull();
    expect((await guest(alice.account.referralCode)).account.referredBy).toBe(alice.account.id);

    accounts().recordTradeVolume(bob.account.id, 100_000, 800);
    accounts().recordTradeVolume(bob.account.id, Number.NaN, 5); // ignored

    const b = (await call<RewardsSummary>('GET', '/api/rewards', { token: bob.token })).body;
    expect(b).toMatchObject({ ownVolumeUsd: 100_000, feesPaidUsd: 800, cashbackRate: 0.1, points: 10_000, tier: 'Silver', invitedCount: 0 });
    expect(b.cashbackUsd).toBeCloseTo(80);

    let a = (await call<RewardsSummary>('GET', '/api/rewards', { token: alice.token })).body;
    expect(a).toMatchObject({
      referralCode: alice.account.referralCode,
      referralLink: `/?ref=${alice.account.referralCode}`,
      invitedCount: 2,
      inviteeVolumeUsd: 100_000,
      ownVolumeUsd: 0,
      cashbackRate: 0,
      tier: 'Silver',
      rebateRate: 0.25,
      nextTier: { name: 'Gold', volumeUsd: 250_000 },
    });
    expect(a.rebatesEarnedUsd).toBeCloseTo(200);
    expect(a.invitees[0]).toMatchObject({ username: 'bob', volumeUsd: 100_000 });
    expect(a.invitees[0].rebateUsd).toBeCloseTo(200);

    accounts().recordTradeVolume(alice.account.id, 5_000_000, 40_000);
    a = (await call<RewardsSummary>('GET', '/api/rewards', { token: alice.token })).body;
    expect(a).toMatchObject({ tier: 'Diamond', rebateRate: 0.4, nextTier: null, cashbackUsd: 0, points: 500_000 });
  });
});

describe('persistence', () => {
  it('round-trips accounts, sessions, follows, watchlist, notifications and rewards', async () => {
    const { world } = built.ctx;
    const ref = await register('alice');
    const { token, account } = await register('dave', 'hunter22', { referralCode: ref.account.referralCode });
    const kol = world.createWallet('sol', 'kol', { native: 10 });
    const pepe = makeToken();
    await call('POST', '/api/follows', { token, body: { chain: 'sol', address: kol.address, remark: 'kol' } });
    await call('POST', '/api/watchlist', { token, body: { chain: 'sol', address: pepe.address } });
    await call('PUT', '/api/settings', { token, body: { display: { theme: 'light' }, trade: { eth: { quickBuyAmounts: [0.3] } } } });
    accounts().notify(account.id, systemNote('saved'));
    accounts().recordTradeVolume(account.id, 1234, 9.87);
    world.executeSwap(accounts().walletFor(account.id, 'sol'), pepe, 'buy', 1);

    const original = accounts();
    const restored = new Accounts(built.ctx);
    restored.restore(deserialize(serialize(original.serialize())));

    expect(restored.resolveToken(token)).toBe(account.id);
    expect(restored.getAccount(account.id)).toEqual(original.getAccount(account.id));
    expect(restored.getSettings(account.id)).toEqual(original.getSettings(account.id));
    expect(restored.getSettings(account.id).display.theme).toBe('light');
    expect(restored.followedWallets(account.id)).toEqual(original.followedWallets(account.id));
    expect(restored.followersOf('sol', kol.address)).toEqual([account.id]);
    expect(restored.watchlist(account.id)).toEqual(original.watchlist(account.id));
    expect(restored.listNotifications(account.id, 10)).toEqual(original.listNotifications(account.id, 10));
    expect(restored.rewards(account.id)).toEqual(original.rewards(account.id));
    expect(restored.rewards(ref.account.id)).toEqual(original.rewards(ref.account.id));
    for (const chain of CHAIN_IDS) expect(restored.accountIdForWallet(account.wallets[chain].address)).toBe(account.id);
    await expect(restored.login('DAVE', 'hunter22')).resolves.toMatchObject({ account: { id: account.id } });

    restored.restore(null); // unknown data leaves state untouched
    expect(restored.resolveToken(token)).toBe(account.id);
  });
});
