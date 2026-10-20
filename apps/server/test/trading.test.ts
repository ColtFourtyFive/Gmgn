import { deserialize, serialize } from 'node:v8';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAINS,
  CHAIN_IDS,
  PLATFORM_FEE_RATE,
  type AlertRule,
  type AuthResponse,
  type ChainId,
  type CopyTradeTask,
  type FeedItem,
  type Order,
  type PortfolioSummary,
  type Quote,
  type SellInitialsQuote,
  type SniperTask,
  type SwapReceipt,
  type SwapRequest,
  type TokenPositionRow,
  type TokenRef,
} from '@trenchscope/shared';
import { Accounts } from '../src/accounts';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { AnalyticsApi } from '../src/context';
import type { PositionState, TokenState, WalletState } from '../src/sim/world';
import { Trading } from '../src/trading';
import { SNIPE_DELAY_MS } from '../src/trading/sniper';

let built: BuiltApp;

beforeEach(async () => {
  vi.stubEnv('TRADE_LATENCY_MS', '0');
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
});

afterEach(async () => {
  await built.close();
  vi.unstubAllEnvs();
});

const world = () => built.ctx.world;
const trading = () => built.ctx.trading as Trading;
const accounts = () => built.ctx.accounts as Accounts;

/** Rebuild the app with a fixed confirmation latency, for races between in-flight swaps. */
async function withLatency(ms: number): Promise<void> {
  await built.close();
  vi.stubEnv('TRADE_LATENCY_MS', String(ms));
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function call<T = unknown>(method: Method, url: string, opts: { auth?: string; body?: unknown } = {}) {
  const res = await built.app.inject({
    method,
    url,
    headers: opts.auth ? { authorization: `Bearer ${opts.auth}` } : {},
    payload: opts.body as Record<string, unknown> | undefined,
  });
  return { status: res.statusCode, body: res.json() as T };
}

interface User {
  auth: string;
  id: string;
  wallet: (chain?: ChainId) => WalletState;
}

async function signIn(): Promise<User> {
  const res = await call<AuthResponse>('POST', '/api/auth/guest', { body: {} });
  expect(res.status).toBe(200);
  const id = res.body.account.id;
  return { auth: res.body.token, id, wallet: (chain = 'sol') => accounts().walletFor(id, chain) };
}

let launches = 0;

function launch(opts: { symbol?: string; name?: string; devBuy?: number } = {}): { token: TokenState; dev: WalletState } {
  const dev = world().createWallet('sol', 'dev', { native: 1000 });
  const symbol = opts.symbol ?? `TST${++launches}`;
  const token = world().createToken({
    chain: 'sol',
    launchpad: 'moonpit',
    creator: dev,
    symbol,
    name: opts.name ?? `${symbol} Coin`,
    description: '',
    logoSeed: symbol,
    logoGlyph: '🐸',
    narrative: 'Frogs',
    socials: {},
    xFollowers: null,
    fate: 'runner',
    hype: 1,
  });
  if (opts.devBuy) expect(world().executeSwap(dev, token, 'buy', opts.devBuy).ok).toBe(true);
  return { token, dev };
}

const whale = (native = 10_000) => world().createWallet('sol', 'whale', { native });
const balance = (wallet: WalletState, token: TokenState) => wallet.positions.get(token.address)?.balance ?? 0;
const price = (token: TokenState) => world().priceUsd(token);

/** Buy in small steps until the price reaches `target`. */
function pumpTo(token: TokenState, buyer: WalletState, target: number): void {
  for (let i = 0; price(token) < target; i++) {
    if (i > 2000) throw new Error('pumpTo: target unreachable');
    expect(world().executeSwap(buyer, token, 'buy', 0.25).ok).toBe(true);
  }
}

/** Sell 1% chunks of each seller's bag (in order) until the price drops to `target`. */
function dumpTo(token: TokenState, sellers: WalletState[], target: number): void {
  for (const seller of sellers) {
    const chunk = balance(seller, token) / 100;
    while (price(token) > target && balance(seller, token) > 0) world().executeSwap(seller, token, 'sell', chunk);
  }
  expect(price(token)).toBeLessThanOrEqual(target);
}

async function swap(user: User, token: TokenState, body: Partial<SwapRequest>): Promise<SwapReceipt> {
  const res = await call<SwapReceipt>('POST', '/api/trade/swap', {
    auth: user.auth,
    body: { chain: token.chain, token: token.address, side: 'buy', amountKind: 'native', ...body },
  });
  expect(res.status).toBe(200);
  return res.body;
}

async function orders(user: User, query = ''): Promise<Order[]> {
  const res = await call<Order[]>('GET', `/api/orders${query}`, { auth: user.auth });
  expect(res.status).toBe(200);
  return res.body;
}

const orderById = async (user: User, id: string) => (await orders(user)).find((o) => o.id === id)!;

/** Evaluate price triggers once and wait for the triggered swaps to settle. */
async function evaluateOrders(): Promise<void> {
  trading().orders.evaluate();
  await trading().idle();
}

const notifications = (user: User) => accounts().listNotifications(user.id, 200);

// ---------------------------------------------------------------------------
// Quotes & swaps
// ---------------------------------------------------------------------------

describe('quotes', () => {
  it('prices fees, preset slippage and the venue like the ledger does', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 2 });
    const res = await call<Quote>('POST', '/api/trade/quote', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, side: 'buy', amount: 1, amountKind: 'native', presetId: 'P2' },
    });
    expect(res.status).toBe(200);
    const q = res.body;
    const p2 = accounts().getSettings(user.id).trade.sol.buyPresets.P2;
    expect(q.amountIn).toBe(1);
    expect(q.platformFeeNative).toBeCloseTo(PLATFORM_FEE_RATE, 12);
    expect(q.networkFeeNative).toBeCloseTo(CHAINS.sol.baseNetworkFee + p2.priorityFee + p2.tip, 12);
    expect(q.slippage).toBe(p2.slippage);
    expect(q.expectedOut).toBeCloseTo(world().quote(token, 'buy', 1)!.amountOut, 3);
    expect(q.minOut).toBeCloseTo(q.expectedOut * (1 - p2.slippage), 3);
    expect(q).toMatchObject({ route: 'curve', venue: 'Moonpit', balanceBefore: CHAINS.sol.starterBalance });
    expect(q.executionPriceUsd).toBeGreaterThan(price(token) * 0.9);
  });

  it('sizes auto slippage from impact, momentum and token age within 1%..50%', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 2 });
    const quote = async (amount: number) =>
      (await call<Quote>('POST', '/api/trade/quote', { auth: user.auth, body: { chain: 'sol', token: token.address, side: 'buy', amount, amountKind: 'native', presetId: 'P1' } })).body;

    const momentum = Math.abs(world().windowStats(token, '5m').priceChange);
    const young = await quote(0.5);
    expect(young.slippage).toBeCloseTo(0.02 + young.priceImpact * 1.5 + momentum * 0.5 + 0.03, 9);

    token.createdAt = world().now - 2 * 3_600_000;
    const old = await quote(0.5);
    expect(old.slippage).toBeCloseTo(young.slippage - 0.03, 9);

    expect((await quote(500)).slippage).toBe(0.5);
  });

  it('rejects percent buys, sells without a position and unknown tokens', async () => {
    const user = await signIn();
    const { token } = launch();
    const quote = (body: Record<string, unknown>) => call('POST', '/api/trade/quote', { auth: user.auth, body: { chain: 'sol', token: token.address, ...body } });

    expect((await quote({ side: 'buy', amount: 50, amountKind: 'percent' })).status).toBe(400);
    expect((await quote({ side: 'sell', amount: 1, amountKind: 'native' })).status).toBe(400);
    expect((await quote({ side: 'sell', amount: 50, amountKind: 'percent' })).body).toMatchObject({ error: 'no token balance' });
    expect((await quote({ side: 'buy', amount: 1, amountKind: 'native', token: 'nope' })).status).toBe(404);
    expect((await quote({ chain: 'bsc', side: 'buy', amount: 1, amountKind: 'native' })).status).toBe(404);
  });
});

describe('swaps', () => {
  it('round-trips with a loss when flat and a profit after a pump, fanning out every fill', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const publish = vi.spyOn(built.ctx.hub, 'publishUser');
    const volume = vi.spyOn(built.ctx.accounts, 'recordTradeVolume');
    const pushBalance = vi.spyOn(built.ctx.accounts, 'pushBalance');

    const buy = await swap(user, token, { amount: 1 });
    expect(buy).toMatchObject({ ok: true, nativeAmount: 1, latencyMs: 0, orders: [] });
    expect(buy.platformFeeNative).toBeCloseTo(PLATFORM_FEE_RATE, 12);
    expect(buy.trade?.wallet).toBe(user.wallet().address);
    expect(typeof buy.txHash).toBe('string');
    expect(publish).toHaveBeenCalledWith(user.id, 'fill', expect.objectContaining({ ok: true, txHash: buy.txHash }));
    expect(pushBalance).toHaveBeenCalledWith(user.id, 'sol');
    expect(volume).toHaveBeenCalledWith(user.id, buy.usdAmount, buy.platformFeeNative * world().nativeUsd('sol'));

    const flat = await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' });
    expect(flat.ok).toBe(true);
    const position = user.wallet().positions.get(token.address)!;
    expect(position.balance).toBe(0);
    expect(position.realizedPnlUsd).toBeLessThan(0);
    expect(user.wallet().native).toBeLessThan(CHAINS.sol.starterBalance);

    const realizedBefore = position.realizedPnlUsd;
    await swap(user, token, { amount: 1 });
    pumpTo(token, whale(), price(token) * 1.5);
    expect((await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' })).ok).toBe(true);
    expect(position.realizedPnlUsd - realizedBefore).toBeGreaterThan(0);
  });

  it('fails with slippage exceeded when the price runs away during the latency', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const pending = trading().executor.swap(user.id, { chain: 'sol', token: token.address, side: 'buy', amount: 1, amountKind: 'native', slippage: 0.01 });
    // Front-run between submission and confirmation.
    expect(world().executeSwap(whale(), token, 'buy', 10).ok).toBe(true);
    const receipt = await pending;
    expect(receipt).toMatchObject({ ok: false, error: 'slippage exceeded', txHash: null });
    expect(user.wallet().native).toBe(CHAINS.sol.starterBalance);
  });

  it('fails cleanly on insufficient balance and while the token migrates', async () => {
    const user = await signIn();
    const { token } = launch();
    const broke = await swap(user, token, { amount: 1000 });
    expect(broke.ok).toBe(false);
    expect(broke.error).toMatch(/insufficient SOL balance/);

    token.status = 'migrating';
    expect(await swap(user, token, { amount: 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/migrating/) });
  });

  it('quotes, checks and charges a curve-completing buy only for what the curve absorbs', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const wh = whale();
    const room = () => world().quote(token, 'buy', 1e9)!.amountIn; // native the curve can still take
    while (room() > 30) expect(world().executeSwap(wh, token, 'buy', 5).ok).toBe(true);
    const cap = room();
    const before = user.wallet().native;
    expect(before).toBeLessThan(60);

    const q = (await call<Quote>('POST', '/api/trade/quote', { auth: user.auth, body: { chain: 'sol', token: token.address, side: 'buy', amount: 60, amountKind: 'native' } })).body;
    expect(q.amountIn).toBeCloseTo(cap, 9);
    expect(q.platformFeeNative).toBeCloseTo(q.amountIn * PLATFORM_FEE_RATE, 12);

    // more than the balance requested, but the capped fill fits it
    const receipt = await swap(user, token, { amount: 60 });
    expect(receipt.ok, receipt.error).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(cap, 9);
    expect(before - user.wallet().native).toBeCloseTo(cap * (1 + PLATFORM_FEE_RATE) + receipt.networkFeeNative, 9);
    expect(token.status).toBe('migrating');
  });

  it('lets a honeypot be bought but blocks the sell', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    token.isHoneypot = true;
    expect((await swap(user, token, { amount: 0.5 })).ok).toBe(true);
    const held = balance(user.wallet(), token);
    expect(await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' })).toMatchObject({ ok: false, error: 'transfer blocked by token contract' });
    expect(balance(user.wallet(), token)).toBe(held);
  });

  it('sells a percent of the holding or an exact token amount', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    await swap(user, token, { amount: 2 });
    const bought = balance(user.wallet(), token);

    expect((await swap(user, token, { side: 'sell', amount: 25, amountKind: 'percent' })).ok).toBe(true);
    expect(balance(user.wallet(), token) / bought).toBeCloseTo(0.75, 9);

    const exact = await swap(user, token, { side: 'sell', amount: bought / 4, amountKind: 'tokens' });
    expect(exact.tokenAmount).toBeCloseTo(bought / 4, 3);
    expect(balance(user.wallet(), token) / bought).toBeCloseTo(0.5, 9);

    expect((await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' })).ok).toBe(true);
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('exposes public-mempool pool trades to sandwiches, never anti-MEV ones', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    world().executeSwap(whale(), token, 'buy', 200);
    world().migrate(token);
    const roundTrip = async (antiMev: boolean) => {
      world().now += 1000; // stay under the swap rate limit
      const buy = await swap(user, token, { amount: 3, antiMev, slippage: 0.5 });
      expect(buy.ok).toBe(true);
      expect(buy.priceImpact).toBeGreaterThan(0.01);
      await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent', antiMev: true });
      return buy;
    };

    for (let i = 0; i < 10; i++) expect((await roundTrip(true)).mevLossNative).toBe(0);
    let sandwiched: SwapReceipt | undefined;
    // Each exposed buy is attacked with probability min(0.6, impact x 10) (~35% here).
    for (let i = 0; i < 30 && !sandwiched; i++) {
      const buy = await roundTrip(false);
      if (buy.mevLossNative > 0) sandwiched = buy;
    }
    expect(sandwiched).toBeDefined();
    expect(sandwiched!.mevLossNative).toBeLessThanOrEqual(3 * sandwiched!.priceImpact * 0.8);
  });

  it('replays the first receipt for a repeated clientId and rate limits bursts', async () => {
    const user = await signIn();
    const { token } = launch();
    const first = await swap(user, token, { amount: 0.1, clientId: 'abc' });
    const replay = await swap(user, token, { amount: 0.1, clientId: 'abc' });
    expect(replay.txHash).toBe(first.txHash);
    expect(user.wallet().positions.get(token.address)!.buys).toBe(1);

    for (let i = 1; i < 10; i++) expect((await swap(user, token, { amount: 0.01 })).ok).toBe(true);
    world().now += 400; // the oldest swap in the window ages out 600ms from now
    const limited = await built.app.inject({
      method: 'POST',
      url: '/api/trade/swap',
      headers: { authorization: `Bearer ${user.auth}` },
      payload: { chain: 'sol', token: token.address, side: 'buy', amount: 0.01, amountKind: 'native' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'rate_limited' });
    expect(limited.headers['retry-after']).toBe('1');
    world().now += 600;
    expect((await swap(user, token, { amount: 0.01 })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

describe('sell initials', () => {
  const initials = (user: User, token: TokenState) =>
    call<SellInitialsQuote>('POST', '/api/trade/initials', { auth: user.auth, body: { chain: token.chain, token: token.address } });

  it('sells exactly what takes out the native the bag cost, fees included, and keeps the rest', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const start = user.wallet().native;
    await swap(user, token, { amount: 1 });
    const spent = start - user.wallet().native;
    pumpTo(token, whale(), price(token) * 2);

    const q = (await initials(user, token)).body;
    expect(q.status).toBe('ok');
    expect(q.targetNative).toBeCloseTo(spent, 9);
    expect(q.costBasisUsd).toBeCloseTo(user.wallet().positions.get(token.address)!.costBasisUsd, 9);
    expect(q.sellRate).toBeGreaterThan(0.4);
    expect(q.sellRate).toBeLessThan(0.65);
    expect(q.expectedOutNative).toBeGreaterThanOrEqual(q.targetNative);
    expect(q.exitValueNative).toBeGreaterThan(q.expectedOutNative);

    const before = user.wallet().native;
    const r = await swap(user, token, { side: 'sell', amount: q.tokens!, amountKind: 'tokens' });
    expect(r.ok).toBe(true);
    // the initial investment is back in the wallet, the rest of the bag is a free ride
    expect(user.wallet().native - before).toBeCloseTo(spent, 6);
    expect(user.wallet().native).toBeCloseTo(start, 6);
    expect(balance(user.wallet(), token)).toBeCloseTo(q.balance - q.tokens!, 3);
  });

  it('recovers only what earlier sells left of the cost basis', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const start = user.wallet().native;
    await swap(user, token, { amount: 1 });
    const spent = start - user.wallet().native;
    pumpTo(token, whale(), price(token) * 3);
    await swap(user, token, { side: 'sell', amount: 50, amountKind: 'percent' });

    const q = (await initials(user, token)).body;
    expect(q.status).toBe('ok');
    // average cost: half the bag sold takes half the cost basis with it
    expect(q.targetNative).toBeCloseTo(spent / 2, 6);
    const before = user.wallet().native;
    await swap(user, token, { side: 'sell', amount: q.tokens!, amountKind: 'tokens' });
    expect(user.wallet().native - before).toBeCloseTo(spent / 2, 6);
  });

  it('refuses an under-water bag and explains with the exit value; nothing held or unknown tokens', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const bag = whale();
    world().executeSwap(bag, token, 'buy', 20);
    await swap(user, token, { amount: 1 });
    dumpTo(token, [bag], price(token) * 0.7);
    const q = (await initials(user, token)).body;
    expect(q).toMatchObject({ status: 'under_water', tokens: null, sellRate: null });
    expect(q.exitValueNative).toBeGreaterThan(0);
    expect(q.exitValueNative).toBeLessThan(q.targetNative);

    const other = launch({ devBuy: 1 }).token;
    expect((await initials(user, other)).body).toMatchObject({ status: 'no_position', balance: 0, tokens: null });
    expect((await call('POST', '/api/trade/initials', { auth: user.auth, body: { chain: 'sol', token: 'missing' } })).status).toBe(404);
    expect((await call('POST', '/api/trade/initials', { auth: user.auth, body: { chain: 'sol' } })).status).toBe(400);
  });
});

describe('orders', () => {
  it('fills a dip limit buy and a market-cap breakout limit sell', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const bag = whale();
    world().executeSwap(bag, token, 'buy', 20);
    const start = price(token);

    const dip = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'limit_buy', triggerType: 'price', triggerValue: start * 0.7, amount: 0.5, amountKind: 'native' },
    });
    expect(dip.status).toBe(200);
    expect(dip.body).toMatchObject({ direction: 'below', side: 'buy', status: 'open', source: 'manual', presetId: 'P2' });
    await evaluateOrders();
    expect((await orderById(user, dip.body.id)).status).toBe('open');

    dumpTo(token, [bag], start * 0.7);
    await evaluateOrders();
    const filled = await orderById(user, dip.body.id);
    expect(filled).toMatchObject({ status: 'filled', receipt: { ok: true } });
    expect(balance(user.wallet(), token)).toBeGreaterThan(0);
    expect(notifications(user)[0]).toMatchObject({ kind: 'order_filled', token: token.address, level: 'success' });

    const held = balance(user.wallet(), token);
    const mcap = world().marketCapUsd(token);
    const breakout = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'limit_sell', triggerType: 'mcap', triggerValue: mcap * 1.3, amount: 50, amountKind: 'percent' },
    });
    expect(breakout.body.direction).toBe('above');
    await evaluateOrders();
    expect((await orderById(user, breakout.body.id)).status).toBe('open');

    pumpTo(token, bag, (mcap * 1.3) / token.totalSupply);
    await evaluateOrders();
    expect((await orderById(user, breakout.body.id)).status).toBe('filled');
    expect(balance(user.wallet(), token) / held).toBeCloseTo(0.5, 9);
    expect((await orders(user, '?status=history')).map((o) => o.id)).toEqual([breakout.body.id, dip.body.id]);
  });

  it('runs a take-profit then a stop-loss from a buy strategy', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const bag = whale();
    world().executeSwap(bag, token, 'buy', 15);
    const buy = await swap(user, token, {
      amount: 1,
      strategy: { takeProfits: [{ changePct: 50, sellPercent: 50 }], stopLosses: [{ lossPct: 30, sellPercent: 100 }], trailing: null, devSellPercent: 0, migrationSellPercent: 0 },
    });
    expect(buy.ok).toBe(true);
    const [tp, sl] = buy.orders;
    expect(buy.orders).toHaveLength(2);
    expect(tp).toMatchObject({ kind: 'take_profit', triggerValue: 50, amount: 50, amountKind: 'percent', source: 'strategy' });
    expect(sl).toMatchObject({ kind: 'stop_loss', triggerValue: 30, amount: 100, groupId: tp.groupId });
    expect(tp.groupId).not.toBeNull();
    // TE-52: the take-profit measures from the fee-inclusive cost (never below the post-fill spot),
    // the stop-loss from the fee-exclusive average fill (never above it).
    const cost = ((buy.nativeAmount + buy.platformFeeNative + buy.networkFeeNative) * world().nativeUsd('sol')) / buy.tokenAmount;
    expect(tp.refPriceUsd).toBeCloseTo(Math.max(cost, price(token)), 15);
    expect(tp.refPriceUsd!).toBeGreaterThan(buy.priceUsd);
    expect(sl.refPriceUsd!).toBeLessThan(buy.priceUsd);
    expect(sl.refPriceUsd!).toBeLessThanOrEqual(price(token));
    const bought = balance(user.wallet(), token);

    const pump = whale();
    pumpTo(token, pump, tp.refPriceUsd! * 1.4);
    await evaluateOrders();
    expect((await orderById(user, tp.id)).status).toBe('open');
    pumpTo(token, pump, tp.refPriceUsd! * 1.55);
    await evaluateOrders();
    expect((await orderById(user, tp.id)).status).toBe('filled');
    expect(balance(user.wallet(), token) / bought).toBeCloseTo(0.5, 9);
    expect((await orderById(user, sl.id)).status).toBe('open');

    dumpTo(token, [pump, bag], sl.refPriceUsd! * 0.72);
    await evaluateOrders();
    expect((await orderById(user, sl.id)).status).toBe('open');
    dumpTo(token, [pump, bag], sl.refPriceUsd! * 0.69);
    await evaluateOrders();
    expect((await orderById(user, sl.id)).status).toBe('filled');
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('arms a trailing take-profit at its activation gain and sells on the drawdown from the peak', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const buy = await swap(user, token, {
      amount: 1,
      strategy: { takeProfits: [], stopLosses: [], trailing: { drawdownPct: 20, sellPercent: 100, activateAtChangePct: 50 }, devSellPercent: 0, migrationSellPercent: 0 },
    });
    const trail = buy.orders[0];
    expect(trail).toMatchObject({ kind: 'trailing_stop', triggerValue: 20, activateAtChangePct: 50, armed: false, peakPriceUsd: null });
    const entry = trail.refPriceUsd!;
    expect(entry).toBeGreaterThanOrEqual(price(token)); // activation measures from the take-profit reference

    const pump = whale();
    pumpTo(token, pump, entry * 1.3);
    await evaluateOrders();
    expect((await orderById(user, trail.id)).armed).toBe(false);

    pumpTo(token, pump, entry * 1.6);
    await evaluateOrders();
    expect(await orderById(user, trail.id)).toMatchObject({ armed: true, status: 'open' });

    pumpTo(token, pump, entry * 2);
    await evaluateOrders();
    const peak = (await orderById(user, trail.id)).peakPriceUsd!;
    expect(peak).toBeCloseTo(price(token), 12);

    dumpTo(token, [pump], peak * 0.85);
    await evaluateOrders();
    expect((await orderById(user, trail.id)).status).toBe('open');
    dumpTo(token, [pump], peak * 0.79);
    await evaluateOrders();
    expect((await orderById(user, trail.id)).status).toBe('filled');
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('arms a manual trailing stop-loss at once and ratchets it from the creation price', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    await swap(user, token, { amount: 1 });
    const res = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'trailing_stop', triggerType: 'change', triggerValue: 25, amount: 100, amountKind: 'percent' },
    });
    expect(res.body).toMatchObject({ armed: true, activateAtChangePct: null, refPriceUsd: price(token), peakPriceUsd: price(token) });

    const pump = whale();
    pumpTo(token, pump, price(token) * 1.5);
    await evaluateOrders();
    const peak = (await orderById(user, res.body.id)).peakPriceUsd!;
    expect(peak).toBeCloseTo(price(token), 12);

    dumpTo(token, [pump], peak * 0.8);
    await evaluateOrders();
    expect((await orderById(user, res.body.id)).status).toBe('open');
    dumpTo(token, [pump], peak * 0.74);
    await evaluateOrders();
    expect((await orderById(user, res.body.id)).status).toBe('filled');
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('cancels the remaining sell orders when the position is closed by hand', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const buy = await swap(user, token, {
      amount: 1,
      strategy: { takeProfits: [{ changePct: 100, sellPercent: 100 }], stopLosses: [{ lossPct: 50, sellPercent: 100 }], trailing: null, devSellPercent: 100, migrationSellPercent: 100 },
    });
    expect(buy.orders.map((o) => o.kind)).toEqual(['take_profit', 'stop_loss', 'dev_sell', 'migration_sell']);
    const dip = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'limit_buy', triggerType: 'price', triggerValue: price(token) / 2, amount: 0.1, amountKind: 'native' },
    });

    await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' });
    const history = await orders(user, '?status=history');
    expect(history).toHaveLength(4);
    for (const o of history) expect(o).toMatchObject({ status: 'cancelled', failReason: 'position closed' });
    expect((await orders(user, '?status=open')).map((o) => o.id)).toEqual([dip.body.id]);
  });

  it('exits when the dev sells at least the threshold share in one trade', async () => {
    const user = await signIn();
    const { token, dev } = launch({ devBuy: 5 });
    const buy = await swap(user, token, {
      amount: 1,
      strategy: { takeProfits: [], stopLosses: [], trailing: null, devSellPercent: 100, migrationSellPercent: 0 },
    });
    const devSell = buy.orders[0];
    expect(devSell).toMatchObject({ kind: 'dev_sell', triggerType: 'event', devSellThreshold: 0.2 });
    const strict = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'dev_sell', triggerType: 'event', triggerValue: 0, amount: 50, amountKind: 'percent', devSellThreshold: 0.9 },
    });
    expect(strict.status).toBe(200);

    world().executeSwap(dev, token, 'sell', balance(dev, token) * 0.1);
    await trading().idle();
    expect((await orderById(user, devSell.id)).status).toBe('open');

    world().executeSwap(dev, token, 'sell', balance(dev, token) * 0.5);
    await trading().idle();
    expect((await orderById(user, devSell.id)).status).toBe('filled');
    expect(balance(user.wallet(), token)).toBe(0);
    // The 90% order never tripped; it was voided when the position closed.
    expect(await orderById(user, strict.body.id)).toMatchObject({ status: 'cancelled', failReason: 'position closed' });
  });

  it('sells and snipes on migration to the AMM pool', async () => {
    const holder = await signIn();
    const sniper = await signIn();
    const { token } = launch({ devBuy: 1 });
    const buy = await swap(holder, token, {
      amount: 1,
      strategy: { takeProfits: [], stopLosses: [], trailing: null, devSellPercent: 0, migrationSellPercent: 100 },
    });
    const exit = buy.orders[0];
    expect(exit.kind).toBe('migration_sell');
    const snipe = await call<Order>('POST', '/api/orders', {
      auth: sniper.auth,
      body: { chain: 'sol', token: token.address, kind: 'migration_buy', triggerType: 'event', triggerValue: 0, amount: 0.5, amountKind: 'native' },
    });
    expect(snipe.body).toMatchObject({ side: 'buy', status: 'open' });

    world().executeSwap(whale(), token, 'buy', 200);
    expect(token.status).toBe('migrating');
    await evaluateOrders();
    expect((await orderById(holder, exit.id)).status).toBe('open');

    world().migrate(token);
    await trading().idle();
    expect(await orderById(holder, exit.id)).toMatchObject({ status: 'filled', receipt: { ok: true } });
    expect(balance(holder.wallet(), token)).toBe(0);
    expect((await orderById(sniper, snipe.body.id)).status).toBe('filled');
    expect(balance(sniper.wallet(), token)).toBeGreaterThan(0);

    const late = await call('POST', '/api/orders', {
      auth: sniper.auth,
      body: { chain: 'sol', token: token.address, kind: 'migration_sell', triggerType: 'event', triggerValue: 0, amount: 100, amountKind: 'percent' },
    });
    expect(late.status).toBe(400);
  });

  it('expires orders and lets the owner cancel them', async () => {
    const user = await signIn();
    const other = await signIn();
    const { token } = launch();
    const create = (expiresInHours?: number) =>
      call<Order>('POST', '/api/orders', {
        auth: user.auth,
        body: { chain: 'sol', token: token.address, kind: 'limit_buy', triggerType: 'price', triggerValue: price(token) / 10, amount: 0.1, amountKind: 'native', expiresInHours },
      });
    const shortLived = (await create(1)).body;
    const gtc = (await create()).body;
    expect(shortLived.expiresAt).toBe(world().now + 3_600_000);

    world().now += 3_600_000;
    await evaluateOrders();
    expect((await orderById(user, shortLived.id)).status).toBe('expired');

    expect((await call('DELETE', `/api/orders/${gtc.id}`, { auth: other.auth })).status).toBe(404);
    expect((await call<Order>('DELETE', `/api/orders/${gtc.id}`, { auth: user.auth })).body.status).toBe('cancelled');
    expect((await call('DELETE', '/api/orders/ord_nope', { auth: user.auth })).status).toBe(404);
  });

  it('validates order input', async () => {
    const user = await signIn();
    const { token } = launch();
    const create = (body: Record<string, unknown>) =>
      call('POST', '/api/orders', { auth: user.auth, body: { chain: 'sol', token: token.address, amount: 1, amountKind: 'native', ...body } });

    expect((await create({ kind: 'limit_buy', triggerType: 'change', triggerValue: 10 })).status).toBe(400);
    expect((await create({ kind: 'stop_loss', triggerType: 'change', triggerValue: 120, amountKind: 'percent' })).status).toBe(400);
    expect((await create({ kind: 'limit_buy', triggerType: 'price', triggerValue: 1, amountKind: 'percent' })).status).toBe(400);
    expect((await create({ kind: 'take_profit', triggerType: 'change', triggerValue: 50, amount: 100, amountKind: 'percent' })).body).toMatchObject({ code: 'no_position' });
    expect((await create({ kind: 'limit_buy', triggerType: 'price', triggerValue: 1, token: 'missing' })).status).toBe(404);
  });
});

describe('latency races', () => {
  it('aborts an in-flight order its owner cancels', async () => {
    await withLatency(200);
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    // A "below" trigger above the current price fires on the first evaluation.
    const order = await call<Order>('POST', '/api/orders', {
      auth: user.auth,
      body: { chain: 'sol', token: token.address, kind: 'limit_buy', triggerType: 'price', triggerValue: price(token) * 2, direction: 'below', amount: 0.5, amountKind: 'native' },
    });
    trading().orders.evaluate();
    expect((await call<Order>('DELETE', `/api/orders/${order.body.id}`, { auth: user.auth })).body.status).toBe('cancelled');
    await trading().idle();
    expect(await orderById(user, order.body.id)).toMatchObject({ status: 'cancelled', receipt: null });
    expect(balance(user.wallet(), token)).toBe(0);
    expect(notifications(user)).toHaveLength(0);
  });

  it('voids an in-flight exit order when a manual sell closes the position first', async () => {
    await withLatency(50);
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const buy = await swap(user, token, {
      amount: 1,
      strategy: { takeProfits: [{ changePct: 20, sellPercent: 50 }], stopLosses: [], trailing: null, devSellPercent: 0, migrationSellPercent: 0 },
    });
    const [tp] = buy.orders;
    pumpTo(token, whale(), buy.priceUsd * 1.3);

    const exit = trading().executor.swap(user.id, { chain: 'sol', token: token.address, side: 'sell', amount: 100, amountKind: 'percent' });
    trading().orders.evaluate(); // the take-profit triggers and confirms behind the manual exit
    expect((await exit).ok).toBe(true);
    await trading().idle();
    expect(await orderById(user, tp.id)).toMatchObject({ status: 'cancelled', failReason: 'position closed', receipt: null });
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('answers a clientId resent while the first swap is in flight with the same receipt', async () => {
    await withLatency(50);
    const user = await signIn();
    const { token } = launch();
    const [first, again] = await Promise.all([swap(user, token, { amount: 0.1, clientId: 'dup' }), swap(user, token, { amount: 0.1, clientId: 'dup' })]);
    expect(first.ok).toBe(true);
    expect(again.txHash).toBe(first.txHash);
    expect(user.wallet().positions.get(token.address)!.buys).toBe(1);
  });
});

describe('exit legs', () => {
  const noExits = { takeProfits: [], stopLosses: [], trailing: null, devSellPercent: 0, migrationSellPercent: 0 };

  it("never fires a take-profit on the buyer's own price impact", async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const buy = await swap(user, token, {
      amount: 5,
      strategy: { ...noExits, takeProfits: [{ changePct: 10, sellPercent: 100 }], stopLosses: [{ lossPct: 40, sellPercent: 100 }], trailing: { drawdownPct: 10, sellPercent: 100, activateAtChangePct: 0 } },
    });
    expect(buy.ok).toBe(true);
    // A 5 SOL buy into a fresh curve lifts the spot more than 10% over its own average fill.
    expect(price(token) / buy.priceUsd).toBeGreaterThan(1.1);
    const [tp, sl, trail] = buy.orders;
    expect(tp.refPriceUsd).toBeCloseTo(price(token), 15);
    expect(sl.refPriceUsd!).toBeLessThan(buy.priceUsd);
    expect(trail).toMatchObject({ armed: true, peakPriceUsd: price(token) });
    await evaluateOrders();
    expect((await orders(user, '?status=open')).map((o) => o.id).sort()).toEqual([tp.id, sl.id, trail.id].sort());
    expect(balance(user.wallet(), token)).toBe(buy.tokenAmount);

    // A real 10% move above the post-fill price does take profit.
    pumpTo(token, whale(), tp.refPriceUsd! * 1.11);
    await evaluateOrders();
    expect((await orderById(user, tp.id)).status).toBe('filled');
  });

  it('never fires a stop-loss on the buy tax of a taxed token', async () => {
    const user = await signIn();
    const dev = world().createWallet('bsc', 'dev', { native: 1000 });
    const token = world().createToken({
      chain: 'bsc',
      launchpad: 'fourpad',
      creator: dev,
      symbol: 'TAXD',
      name: 'Taxed',
      description: '',
      logoSeed: 'TAXD',
      logoGlyph: '🐸',
      narrative: 'Frogs',
      socials: {},
      xFollowers: null,
      fate: 'runner',
      hype: 1,
      security: { buyTax: 0.05, sellTax: 0.05 },
    });
    expect(world().executeSwap(dev, token, 'buy', 1).ok).toBe(true);
    const buy = await swap(user, token, { amount: 0.05, strategy: { ...noExits, stopLosses: [{ lossPct: 5, sellPercent: 100 }] } });
    expect(buy.ok).toBe(true);
    // Measured from the tax-inclusive average fill the spot already sits more than 5% lower.
    expect(price(token) / buy.priceUsd).toBeLessThan(0.95);
    const [sl] = buy.orders;
    expect(sl.refPriceUsd!).toBeLessThanOrEqual(price(token));
    await evaluateOrders();
    expect((await orderById(user, sl.id)).status).toBe('open');
    expect(balance(user.wallet('bsc'), token)).toBe(buy.tokenAmount);
  });

  it('sizes legs that trigger together from what earlier ones leave (no 2 x 50% = 100%)', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const strategy = { ...noExits, takeProfits: [{ changePct: 50, sellPercent: 50 }] };
    const first = await swap(user, token, { amount: 0.2, strategy });
    const second = await swap(user, token, { amount: 0.2, strategy });
    expect(first.orders[0].groupId).not.toBe(second.orders[0].groupId);
    const held = balance(user.wallet(), token);

    pumpTo(token, whale(), Math.max(first.orders[0].refPriceUsd!, second.orders[0].refPriceUsd!) * 1.8);
    await evaluateOrders(); // both take-profits trigger in the same pass
    expect((await orderById(user, first.orders[0].id)).status).toBe('filled');
    expect((await orderById(user, second.orders[0].id)).status).toBe('filled');
    // sequential "50% of the holding at trigger time": half, then half of the rest
    expect(balance(user.wallet(), token) / held).toBeCloseTo(0.25, 9);
  });

  it('still lets a later leg size from the whole bag when in-flight sells already cover it', async () => {
    await withLatency(50);
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    await swap(user, token, { amount: 0.5 });
    const sell = (amount: number) => trading().executor.swap(user.id, { chain: 'sol', token: token.address, side: 'sell', amount, amountKind: 'percent' });
    const held = balance(user.wallet(), token);
    const half = sell(50);
    const rest = sell(50); // half of what the first one leaves
    const [a, b] = await Promise.all([half, rest]);
    expect(a.tokenAmount / held).toBeCloseTo(0.5, 9);
    expect(b.tokenAmount / held).toBeCloseTo(0.25, 9);
    const all = sell(100);
    const again = sell(100); // nothing free: sized from the whole bag, the ledger decides
    expect((await all).ok).toBe(true);
    expect((await again).ok).toBe(false);
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('sells what is left when a smaller sell of the bag lands first, still failing on a real price move', async () => {
    await withLatency(50);
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const wh = whale();
    expect(world().executeSwap(wh, token, 'buy', 5).ok).toBe(true);
    const sellAll = () => trading().executor.swap(user.id, { chain: 'sol', token: token.address, side: 'sell', amount: 100, amountKind: 'percent', slippage: 0.05 });

    await swap(user, token, { amount: 1 });
    let held = balance(user.wallet(), token);
    let exit = sellAll(); // quoted and min-out priced for the whole bag
    // another sell of the same bag (a trailing leg, a manual "sell 25%") lands first
    expect(world().executeSwap(user.wallet(), token, 'sell', held / 4).ok).toBe(true);
    const rest = await exit;
    expect(rest.ok, rest.error).toBe(true);
    expect(rest.tokenAmount / held).toBeCloseTo(0.75, 9);
    expect(balance(user.wallet(), token)).toBe(0);

    await swap(user, token, { amount: 1 });
    held = balance(user.wallet(), token);
    exit = sellAll();
    expect(world().executeSwap(user.wallet(), token, 'sell', held / 4).ok).toBe(true);
    dumpTo(token, [wh], price(token) * 0.8); // the market really moves meanwhile
    expect(await exit).toMatchObject({ ok: false, error: 'slippage exceeded' });
    expect(balance(user.wallet(), token) / held).toBeCloseTo(0.75, 9);
  });
});

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

describe('copy trade', () => {
  it('copies buys within the per-token cap and mirrors sells proportionally', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500, tags: ['smart'], label: 'Alpha' });
    const created = await call<CopyTradeTask>('POST', '/api/copytrade', {
      auth: user.auth,
      body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 0.5, maxPerToken: 1.2 },
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ enabled: true, sellMode: 'mirror', presetId: 'P2', stats: { buys: 0, sells: 0 } });
    const { token } = launch({ devBuy: 1 });

    const targetBuy = async () => {
      world().executeSwap(target, token, 'buy', 3);
      await trading().idle();
    };
    await targetBuy();
    expect(balance(user.wallet(), token)).toBeGreaterThan(0);
    expect(notifications(user)[0]).toMatchObject({ kind: 'copytrade', title: "Copied Alpha's buy · $" + token.symbol, level: 'success' });
    await targetBuy();
    await targetBuy(); // only 0.2 of budget left
    await targetBuy(); // budget exhausted
    const task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task.stats.buys).toBe(3);
    expect(user.wallet().positions.get(token.address)!.boughtNative).toBeCloseTo(1.2 * (1 + PLATFORM_FEE_RATE) + 3 * networkFee(user), 9);

    const held = balance(user.wallet(), token);
    world().executeSwap(target, token, 'sell', balance(target, token) / 4);
    await trading().idle();
    expect(balance(user.wallet(), token) / held).toBeCloseTo(0.75, 6);

    world().executeSwap(target, token, 'sell', balance(target, token));
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(0);
    const after = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(after.stats).toMatchObject({ buys: 3, sells: 2 });
    expect(after.stats.receivedNative).toBeGreaterThan(0);
  });

  it('pauses a task after 3 failed copies in a row (a success resets the streak) and re-arms it on re-enable', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500, label: 'Alpha' });
    const task = (
      await call<CopyTradeTask>('POST', '/api/copytrade', {
        auth: user.auth,
        body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 0.5, maxPerToken: 100 },
      })
    ).body;
    expect(task.consecutiveFailures).toBe(0);
    const { token } = launch({ devBuy: 1 });
    const current = async () => (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    const targetBuys = async (n: number) => {
      for (let i = 0; i < n; i++) {
        world().executeSwap(target, token, 'buy', 0.2);
        await trading().idle();
      }
    };
    const copyNotices = () => notifications(user).filter((n) => n.kind === 'copytrade');

    user.wallet().native = 0.1; // too little for a 0.5 SOL copy
    await targetBuys(2);
    expect(await current()).toMatchObject({ enabled: true, consecutiveFailures: 2 });
    expect(copyNotices()[0]).toMatchObject({ title: `Copy buy failed · $${token.symbol}`, level: 'error' });

    user.wallet().native = 50;
    await targetBuys(1);
    expect(await current()).toMatchObject({ enabled: true, consecutiveFailures: 0, stats: { buys: 1 } });

    user.wallet().native = 0.1;
    await targetBuys(3);
    const paused = await current();
    expect(paused).toMatchObject({ enabled: false, consecutiveFailures: 3 });
    expect(copyNotices()[0]).toMatchObject({ title: 'Copy trading paused · Alpha', level: 'error', wallet: target.address });
    expect(copyNotices()[0].body).toMatch(/^3 copies failed in a row \(last: insufficient SOL balance/);
    const count = copyNotices().length;
    await targetBuys(1);
    expect(copyNotices()).toHaveLength(count); // paused: nothing is copied

    const resumed = await call<CopyTradeTask>('PATCH', `/api/copytrade/${task.id}`, { auth: user.auth, body: { enabled: true } });
    expect(resumed.body).toMatchObject({ enabled: true, consecutiveFailures: 0 });
  });

  it('filters (without counting a failure) mirror sells too small to cover the fees, and keeps that share for the exit', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500, label: 'Scaler' });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'ratio', buyRatio: 0.01, maxPerToken: 10 } });
    const { token } = launch({ devBuy: 1 });
    world().executeSwap(target, token, 'buy', 2);
    await trading().idle();
    const copied = balance(user.wallet(), token);
    expect(copied).toBeGreaterThan(0);

    // 5% of a 0.02 SOL bag is worth far less than the ~0.0028 SOL network fee.
    for (let i = 0; i < 3; i++) {
      world().executeSwap(target, token, 'sell', balance(target, token) * 0.05);
      await trading().idle();
    }
    const copyNotices = () => notifications(user).filter((n) => n.kind === 'copytrade');
    expect(copyNotices().filter((n) => n.level === 'error')).toHaveLength(0);
    let task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task).toMatchObject({ enabled: true, consecutiveFailures: 0, stats: { buys: 1, sells: 0 } });
    expect(balance(user.wallet(), token)).toBe(copied);

    // The target's exit takes the whole copied bag, dust included, and buys keep being copied.
    world().executeSwap(target, token, 'sell', balance(target, token));
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(0);
    const { token: next } = launch({ devBuy: 1 });
    world().executeSwap(target, next, 'buy', 2);
    await trading().idle();
    expect(balance(user.wallet(), next)).toBeGreaterThan(0);
    task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task).toMatchObject({ enabled: true, consecutiveFailures: 0, stats: { buys: 2, sells: 1 } });
  });

  it('mirrors a target exit that lands while the copy buy is still confirming', async () => {
    await withLatency(50);
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500, label: 'Flipper' });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 1, maxPerToken: 10 } });
    const { token } = launch({ devBuy: 1 });

    world().executeSwap(target, token, 'buy', 2);
    world().executeSwap(target, token, 'sell', balance(target, token)); // out before the copy lands
    await trading().idle();
    expect(balance(target, token)).toBe(0);
    expect(balance(user.wallet(), token)).toBe(0);
    const task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task.stats).toMatchObject({ buys: 1, sells: 1 });

    // A partial exit while in flight sells the same share of the copy once it lands.
    const pos = user.wallet().positions.get(token.address)!;
    const [bought0, sold0] = [pos.boughtTokens, pos.soldTokens];
    world().executeSwap(target, token, 'buy', 2);
    world().executeSwap(target, token, 'sell', balance(target, token) / 4);
    await trading().idle();
    const copied = pos.boughtTokens - bought0;
    expect(copied).toBeGreaterThan(0);
    expect((pos.soldTokens - sold0) / copied).toBeCloseTo(0.25, 9);
    expect(balance(user.wallet(), token) / copied).toBeCloseTo(0.75, 9);
  });

  it('never mirrors a target sell onto tokens the user bought by hand', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500, label: 'Alpha' });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 1, maxPerToken: 10 } });
    const { token } = launch({ devBuy: 1 });
    world().executeSwap(target, token, 'buy', 3);
    await trading().idle();
    expect(balance(user.wallet(), token)).toBeGreaterThan(0);

    // The user closes the copied bag by hand, then buys a fresh bag of their own.
    expect((await swap(user, token, { side: 'sell', amount: 100, amountKind: 'percent' })).ok).toBe(true);
    const own = await swap(user, token, { amount: 2 });
    expect(own.ok).toBe(true);
    world().executeSwap(target, token, 'sell', balance(target, token));
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(own.tokenAmount);
    const task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task.stats.sells).toBe(0);

    // A partial manual sell caps what the task can still sell at what is left of its bag.
    world().executeSwap(target, token, 'buy', 3);
    await trading().idle();
    const withCopy = balance(user.wallet(), token);
    const copiedBag = withCopy - own.tokenAmount;
    expect((await swap(user, token, { side: 'sell', amount: withCopy - copiedBag / 2, amountKind: 'tokens' })).ok).toBe(true);
    world().executeSwap(target, token, 'sell', balance(target, token));
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(0);
  });

  it('skips (without counting a failure) a buy that completed the curve', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'whale', { native: 5_000, label: 'Whale' });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 0.1, maxPerToken: 10 } });
    const seen: string[] = [];
    world().on('trade', (_trade, t) => seen.push(t.status));
    for (let i = 0; i < 3; i++) {
      const { token } = launch({ devBuy: 1 });
      expect(world().executeSwap(target, token, 'buy', 200).ok).toBe(true);
      expect(token.status).toBe('migrating');
      await trading().idle();
    }
    // trade listeners already see the curve closed
    expect(seen.slice(-1)).toEqual(['migrating']);
    const task = (await call<CopyTradeTask[]>('GET', '/api/copytrade', { auth: user.auth })).body[0];
    expect(task).toMatchObject({ enabled: true, consecutiveFailures: 0, stats: { buys: 0 } });
    expect(notifications(user).filter((n) => n.kind === 'copytrade')).toHaveLength(0);
  });

  it('honours the blacklist and edits, and refuses own or unknown targets', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500 });
    const { token } = launch();
    const task = (
      await call<CopyTradeTask>('POST', '/api/copytrade', {
        auth: user.auth,
        body: { chain: 'sol', target: target.address, buyMode: 'ratio', buyRatio: 0.1, maxPerToken: 1, blacklist: [token.address] },
      })
    ).body;
    world().executeSwap(target, token, 'buy', 2);
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(0);

    const patched = await call<CopyTradeTask>('PATCH', `/api/copytrade/${task.id}`, { auth: user.auth, body: { ...task, blacklist: [], label: 'Ratio' } });
    expect(patched.body).toMatchObject({ id: task.id, label: 'Ratio', blacklist: [], createdAt: task.createdAt });
    world().executeSwap(target, token, 'buy', 2);
    await trading().idle();
    expect(user.wallet().positions.get(token.address)!.boughtNative).toBeCloseTo(0.2 * (1 + PLATFORM_FEE_RATE) + networkFee(user), 9);

    const own = await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: user.wallet().address, buyMode: 'fixed', buyAmount: 1, maxPerToken: 1 } });
    expect(own.status).toBe(400);
    const unknown = await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: 'ghost', buyMode: 'fixed', buyAmount: 1, maxPerToken: 1 } });
    expect(unknown.status).toBe(404);
    expect((await call('PATCH', `/api/copytrade/${task.id}`, { auth: user.auth, body: { buyMode: 'fixed', buyAmount: 0 } })).status).toBe(400);
    expect((await call('DELETE', `/api/copytrade/${task.id}`, { auth: user.auth })).body).toEqual({ ok: true });
    expect((await call('DELETE', `/api/copytrade/${task.id}`, { auth: user.auth })).status).toBe(404);
  });
});

/** Network fee of the account's active SOL buy preset (P2: anti-MEV on, so the tip is included). */
function networkFee(user: User): number {
  const p = accounts().getSettings(user.id).trade.sol.buyPresets.P2;
  return CHAINS.sol.baseNetworkFee + p.priorityFee + p.tip;
}

describe('sniper', () => {
  it('buys keyword matches a tick after launch and stops at maxBuys', async () => {
    const user = await signIn();
    const res = await call<SniperTask>('POST', '/api/sniper', {
      auth: user.auth,
      body: { chain: 'sol', kind: 'new_token', label: 'Frogs', keywords: ['frog'], buyAmount: 0.2, maxBuys: 2 },
    });
    expect(res.status).toBe(200);
    const froggy = launch({ symbol: 'FROGGY' }).token;
    const doge = launch({ symbol: 'DOGE', name: 'Doge' }).token;
    const king = launch({ symbol: 'KING', name: 'Frog King' }).token;
    const third = launch({ symbol: 'FROG3' }).token;

    trading().sniper.flush();
    await trading().idle();
    expect(balance(user.wallet(), froggy)).toBe(0);

    world().now += SNIPE_DELAY_MS;
    trading().sniper.flush();
    await trading().idle();
    expect(balance(user.wallet(), froggy)).toBeGreaterThan(0);
    expect(balance(user.wallet(), king)).toBeGreaterThan(0);
    expect(balance(user.wallet(), doge)).toBe(0);
    expect(balance(user.wallet(), third)).toBe(0);
    const task = (await call<SniperTask[]>('GET', '/api/sniper', { auth: user.auth })).body[0];
    expect(task).toMatchObject({ buysDone: 2, enabled: false, lastTriggeredAt: world().now });
    expect(notifications(user).filter((n) => n.kind === 'sniper')).toHaveLength(2);
    expect(notifications(user).filter((n) => n.kind === 'sniper').every((n) => n.level === 'success')).toBe(true);
  });

  it('validates dev launches and launchpads', async () => {
    const user = await signIn();
    const create = (body: Record<string, unknown>) => call('POST', '/api/sniper', { auth: user.auth, body: { chain: 'sol', buyAmount: 0.1, ...body } });
    expect((await create({ kind: 'dev_launch' })).status).toBe(400);
    expect((await create({ kind: 'new_token', launchpads: ['fourpad'] })).status).toBe(400);
    expect((await create({ kind: 'migration', launchpads: ['moonpit'] })).status).toBe(200);
  });
});

describe('alerts', () => {
  it('fires a one-shot price crossing once, and repeating rules after the cooldown', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    const w = whale();
    const start = price(token);
    const rule = await call<AlertRule>('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'price', token: token.address, value: start * 1.2, note: 'breakout' } });
    expect(rule.body).toMatchObject({ direction: 'above', enabled: true, repeat: false });
    const alertCount = () => notifications(user).filter((n) => n.kind === 'alert').length;

    trading().alerts.evaluate();
    expect(alertCount()).toBe(0);
    pumpTo(token, w, start * 1.25);
    trading().alerts.evaluate();
    expect(alertCount()).toBe(1);
    expect(notifications(user)[0].body).toMatch(/breakout$/);
    const fired = (await call<AlertRule[]>('GET', '/api/alerts', { auth: user.auth })).body[0];
    expect(fired).toMatchObject({ enabled: false, lastTriggeredAt: world().now });

    dumpTo(token, [w], start * 1.1);
    trading().alerts.evaluate();
    pumpTo(token, w, start * 1.3);
    trading().alerts.evaluate();
    expect(alertCount()).toBe(1);

    await call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'wallet_trade', wallet: w.address, repeat: true } });
    world().executeSwap(w, token, 'buy', 0.1);
    world().executeSwap(w, token, 'buy', 0.1);
    expect(alertCount()).toBe(2);
    world().now += 60_000;
    world().executeSwap(w, token, 'buy', 0.1);
    expect(alertCount()).toBe(3);
  });

  it('counts smart-money buys and 5m moves', async () => {
    const user = await signIn();
    const { token } = launch({ devBuy: 1 });
    await call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'smart_buys', token: token.address, value: 2 } });
    await call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'change', token: token.address, value: 20 } });
    const smart = () => world().createWallet('sol', 'smart', { native: 100, tags: ['smart'] });

    world().executeSwap(smart(), token, 'buy', 0.5);
    trading().alerts.evaluate();
    expect(notifications(user)).toHaveLength(0);
    world().executeSwap(smart(), token, 'buy', 0.5);
    trading().alerts.evaluate();
    expect(notifications(user).map((n) => n.title)).toEqual([`$${token.symbol}: 2 smart-money buys in 5m`]);

    pumpTo(token, whale(), price(token) * 1.3);
    trading().alerts.evaluate();
    expect(notifications(user)[0].title).toMatch(new RegExp(`^\\$${token.symbol} \\+\\d+(\\.\\d+)?% in 5m$`));
  });

  it('validates alert references', async () => {
    const user = await signIn();
    const create = (body: Record<string, unknown>) => call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', ...body } });
    expect((await create({ kind: 'price', value: 1 })).status).toBe(400);
    expect((await create({ kind: 'price', token: 'missing', value: 1 })).status).toBe(404);
    expect((await create({ kind: 'wallet_trade', wallet: 'missing' })).status).toBe(404);
    const rule = (await create({ kind: 'new_token', keyword: 'cat' })).body as AlertRule;
    expect((await call<AlertRule>('PATCH', `/api/alerts/${rule.id}`, { auth: user.auth, body: { keyword: 'dog' } })).body.keyword).toBe('dog');
    launch({ symbol: 'DOGGO' });
    expect(notifications(user)[0].title).toBe('New token $DOGGO');
  });
});

describe('warmup', () => {
  it('skips copy trades, snipes, event orders and alerts while history fast-forwards', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 500 });
    const { token, dev } = launch({ devBuy: 5 });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 0.5, maxPerToken: 5 } });
    await call('POST', '/api/sniper', { auth: user.auth, body: { chain: 'sol', kind: 'new_token', buyAmount: 0.1 } });
    await call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'wallet_trade', wallet: dev.address } });
    const buy = await swap(user, token, { amount: 1, strategy: { takeProfits: [], stopLosses: [], trailing: null, devSellPercent: 100, migrationSellPercent: 0 } });
    const held = balance(user.wallet(), token);

    built.ctx.engine.warming = true;
    world().executeSwap(target, token, 'buy', 2);
    world().executeSwap(dev, token, 'sell', balance(dev, token) * 0.6);
    const fresh = launch().token;
    world().now += SNIPE_DELAY_MS;
    trading().sniper.flush();
    await trading().idle();
    expect(balance(user.wallet(), token)).toBe(held);
    expect(balance(user.wallet(), fresh)).toBe(0);
    expect((await orderById(user, buy.orders[0].id)).status).toBe('open');
    expect(notifications(user)).toHaveLength(0);

    built.ctx.engine.warming = false;
    world().executeSwap(dev, token, 'sell', balance(dev, token) * 0.6);
    await trading().idle();
    expect((await orderById(user, buy.orders[0].id)).status).toBe('filled');
  });
});

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

function tokenRef(t: TokenState): TokenRef {
  const p = world().priceUsd(t);
  return {
    chain: t.chain,
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    logoSeed: t.logoSeed,
    logoGlyph: t.logoGlyph,
    priceUsd: p,
    marketCapUsd: p * t.totalSupply,
    liquidityUsd: world().liquidityUsd(t),
    status: t.status,
    launchpad: t.launchpad,
    createdAt: t.createdAt,
    priceChange24h: 0,
  };
}

function positionRow(w: WalletState, p: PositionState): TokenPositionRow {
  const t = world().getToken(p.token)!;
  const valueUsd = p.balance * world().priceUsd(t);
  const unrealizedPnlUsd = p.balance > 0 ? valueUsd - p.costBasisUsd : 0;
  return {
    chain: w.chain,
    token: t.address,
    wallet: w.address,
    addrType: 'wallet',
    walletTags: [],
    walletLabel: null,
    balance: p.balance,
    holdRate: p.balance / t.totalSupply,
    valueUsd,
    costBasisUsd: p.costBasisUsd,
    avgBuyPriceUsd: p.boughtTokens > 0 ? p.boughtUsd / p.boughtTokens : 0,
    avgSellPriceUsd: p.soldTokens > 0 ? p.soldUsd / p.soldTokens : 0,
    boughtUsd: p.boughtUsd,
    soldUsd: p.soldUsd,
    boughtTokens: p.boughtTokens,
    soldTokens: p.soldTokens,
    realizedPnlUsd: p.realizedPnlUsd,
    unrealizedPnlUsd,
    totalPnlUsd: p.realizedPnlUsd + unrealizedPnlUsd,
    pnlRate: 0,
    buys: p.buys,
    sells: p.sells,
    firstBuyAt: p.firstBuyAt,
    lastActiveAt: p.lastActiveAt,
    holdSeconds: 0,
    nativeBalance: w.native,
    fundedBy: null,
    tokenInfo: tokenRef(t),
  };
}

/** Rows per wallet the analytics holdings endpoint returns by default. */
const HOLDINGS_ROW_CAP = 200;

/** Minimal analytics: holdings rows (capped like the real module) and activity straight from the ledger. */
function useFakeAnalytics(): void {
  const fake: Pick<AnalyticsApi, 'walletHoldings' | 'walletActivity'> = {
    walletHoldings: (w, opts) =>
      [...w.positions.values()]
        .filter((p) => opts.includeClosed || p.balance > 0)
        .slice(0, HOLDINGS_ROW_CAP)
        .map((p) => positionRow(w, p)),
    walletActivity: (w) =>
      [...w.positions.keys()].flatMap((address) => {
        const t = world().getToken(address)!;
        return t.trades.filter((trade) => trade.wallet === w.address).map((trade): FeedItem => ({ trade, token: tokenRef(t), isFirstBuy: false, isClose: false }));
      }),
  };
  built.ctx.analytics = fake as AnalyticsApi;
}

describe('portfolio', () => {
  it('summarizes positions, PnL, win rate, equity and activity', async () => {
    useFakeAnalytics();
    const user = await signIn();
    const winner = launch({ devBuy: 1 }).token;
    const loser = launch({ devBuy: 1 }).token;
    await swap(user, winner, { amount: 1 });
    world().now += 10_000;
    await swap(user, loser, { amount: 1 });
    world().now += 10_000;
    await swap(user, loser, { side: 'sell', amount: 100, amountKind: 'percent' });
    pumpTo(winner, whale(), price(winner) * 2);

    const res = await call<PortfolioSummary>('GET', '/api/portfolio?chain=sol', { auth: user.auth });
    expect(res.status).toBe(200);
    const sol = res.body;
    expect(sol.positions.map((p) => p.token)).toEqual([winner.address]);
    expect(sol.nativeBalanceUsd).toBeCloseTo(user.wallet().native * world().nativeUsd('sol'), 6);
    expect(sol.holdingsValueUsd).toBeCloseTo(balance(user.wallet(), winner) * price(winner), 6);
    expect(sol.totalValueUsd).toBeCloseTo(sol.nativeBalanceUsd + sol.holdingsValueUsd, 6);
    expect(sol.realizedPnlUsd).toBeLessThan(0);
    expect(sol.unrealizedPnlUsd).toBeGreaterThan(0);
    expect(sol.totalPnlUsd).toBeCloseTo(sol.realizedPnlUsd + sol.unrealizedPnlUsd, 9);
    expect(sol.winRate).toBe(0.5);
    // One sample per fill (10s apart) plus the live point.
    expect(sol.equity).toHaveLength(4);
    expect(sol.equity[3]).toEqual({ t: world().now, valueUsd: sol.totalValueUsd });

    const all = (await call<PortfolioSummary>('GET', '/api/portfolio', { auth: user.auth })).body;
    const otherChains = CHAIN_IDS.filter((c) => c !== 'sol').reduce((sum, c) => sum + CHAINS[c].starterBalance * world().nativeUsd(c), 0);
    expect(all.chain).toBe('all');
    expect(all.totalValueUsd).toBeCloseTo(sol.totalValueUsd + otherChains, 6);
    expect(all.equity[0].valueUsd).toBeGreaterThan(sol.equity[0].valueUsd);

    const activity = await call<FeedItem[]>('GET', '/api/portfolio/activity?limit=2', { auth: user.auth });
    expect(activity.body.map((i) => [i.trade.token, i.trade.side])).toEqual([
      [loser.address, 'sell'],
      [loser.address, 'buy'],
    ]);
    expect((await call('GET', '/api/portfolio?chain=doge', { auth: user.auth })).status).toBe(400);
  });

  it('counts every position toward PnL and win rate, beyond the holdings row cap', async () => {
    useFakeAnalytics();
    const user = await signIn();
    const wallet = user.wallet();
    const roundTrips = HOLDINGS_ROW_CAP + 5;
    for (let i = 0; i < roundTrips; i++) {
      const { token } = launch({ devBuy: 1 });
      expect(world().executeSwap(wallet, token, 'buy', 0.01).ok).toBe(true);
      if (i === 0) pumpTo(token, whale(), price(token) * 2);
      expect(world().executeSwap(wallet, token, 'sell', balance(wallet, token)).ok).toBe(true);
    }
    const realized = [...wallet.positions.values()].reduce((sum, p) => sum + p.realizedPnlUsd, 0);

    const summary = (await call<PortfolioSummary>('GET', '/api/portfolio?chain=sol', { auth: user.auth })).body;
    expect(summary.positions).toEqual([]);
    expect(summary.realizedPnlUsd).toBeCloseTo(realized, 6);
    expect(summary.unrealizedPnlUsd).toBe(0);
    expect(summary.winRate).toBeCloseTo(1 / roundTrips, 12);
  });
});

// ---------------------------------------------------------------------------
// Auth, persistence
// ---------------------------------------------------------------------------

describe('access', () => {
  it('requires a session on every trading route', async () => {
    const routes: [Method, string][] = [
      ['POST', '/api/trade/quote'],
      ['POST', '/api/trade/swap'],
      ['POST', '/api/trade/initials'],
      ['GET', '/api/orders'],
      ['POST', '/api/orders'],
      ['DELETE', '/api/orders/x'],
      ['GET', '/api/portfolio'],
      ['GET', '/api/portfolio/activity'],
      ['GET', '/api/copytrade'],
      ['POST', '/api/copytrade'],
      ['PATCH', '/api/copytrade/x'],
      ['DELETE', '/api/copytrade/x'],
      ['GET', '/api/sniper'],
      ['POST', '/api/sniper'],
      ['PATCH', '/api/sniper/x'],
      ['DELETE', '/api/sniper/x'],
      ['GET', '/api/alerts'],
      ['POST', '/api/alerts'],
      ['PATCH', '/api/alerts/x'],
      ['DELETE', '/api/alerts/x'],
    ];
    for (const [method, url] of routes) {
      const res = await call(method, url, { body: method === 'POST' || method === 'PATCH' ? {} : undefined });
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });
});

describe('persistence', () => {
  it('restores orders, tasks, alerts and equity from a v8 snapshot', async () => {
    const user = await signIn();
    const target = world().createWallet('sol', 'smart', { native: 100 });
    const { token } = launch({ devBuy: 1 });
    const bag = whale();
    world().executeSwap(bag, token, 'buy', 10);
    await swap(user, token, { amount: 1, strategy: { takeProfits: [], stopLosses: [{ lossPct: 30, sellPercent: 100 }], trailing: null, devSellPercent: 0, migrationSellPercent: 0 } });
    await call('POST', '/api/copytrade', { auth: user.auth, body: { chain: 'sol', target: target.address, buyMode: 'fixed', buyAmount: 0.5, maxPerToken: 2 } });
    await call('POST', '/api/sniper', { auth: user.auth, body: { chain: 'sol', kind: 'migration', buyAmount: 0.1 } });
    await call('POST', '/api/alerts', { auth: user.auth, body: { chain: 'sol', kind: 'mcap', token: token.address, value: 1e9 } });

    const restored = new Trading(built.ctx);
    restored.restore(deserialize(serialize(trading().serialize())));
    expect(restored.orders.list(user.id)).toEqual(trading().orders.list(user.id));
    expect(restored.copyTrade.list(user.id)).toEqual(trading().copyTrade.list(user.id));
    expect(restored.sniper.list(user.id)).toEqual(trading().sniper.list(user.id));
    expect(restored.alerts.list(user.id)).toEqual(trading().alerts.list(user.id));
    expect(restored.serialize()).toEqual(trading().serialize());

    // The restored book is live: its stop-loss still triggers.
    const [stop] = restored.orders.list(user.id);
    dumpTo(token, [bag], stop.refPriceUsd! * 0.69);
    restored.orders.evaluate();
    await restored.idle();
    expect(restored.orders.list(user.id, { status: 'history' })[0]).toMatchObject({ id: stop.id, status: 'filled' });
  });
});
