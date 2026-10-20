// Token launches ("Cooking"): config, validation (names, tickers, socials),
// fee accounting, creation-block bundles, rate limit, adoption by the market
// simulator (agents trade it; scripts never sell the launcher's wallets),
// bundle wallets following the launcher's exits, and the migration notice.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAINS,
  CHAIN_IDS,
  PLATFORM_FEE_RATE,
  type AppNotification,
  type AuthResponse,
  type LaunchConfig,
  type LaunchRequest,
  type LaunchResponse,
  type Order,
  type PortfolioSummary,
  type SwapReceipt,
} from '@trenchscope/shared';
import { Accounts } from '../src/accounts';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { ADOPTED_FATES, adoptedFateWeights, simOf, type LaunchQuality } from '../src/sim/behaviors/fate';
import type { TokenState, WalletState } from '../src/sim/world';
import { Trading } from '../src/trading';
import { LAUNCHES_PER_HOUR, LAUNCH_FEE_NATIVE } from '../src/trading/launch';

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
const accounts = () => built.ctx.accounts as Accounts;
const trading = () => built.ctx.trading as Trading;

async function call<T = unknown>(method: 'GET' | 'POST', url: string, opts: { auth?: string; body?: unknown } = {}) {
  const res = await built.app.inject({
    method,
    url,
    headers: opts.auth ? { authorization: `Bearer ${opts.auth}` } : {},
    payload: opts.body as Record<string, unknown> | undefined,
  });
  return { status: res.statusCode, body: res.json() as T, headers: res.headers };
}

interface User {
  auth: string;
  id: string;
  wallet: () => WalletState;
}

async function signIn(): Promise<User> {
  const res = await call<AuthResponse>('POST', '/api/auth/guest', { body: {} });
  const id = res.body.account.id;
  return { auth: res.body.token, id, wallet: () => accounts().walletFor(id, 'sol') };
}

const POLISHED: Omit<LaunchRequest, 'symbol'> = {
  chain: 'sol',
  launchpad: 'moonpit',
  name: 'Croak Capital',
  description: 'A very serious frog that only croaks on green candles. Fair launch, LP burns on graduation, community owned from block one.',
  socials: { twitter: 'https://x.com/croakcap', telegram: 'https://t.me/croakcap', website: 'https://croak.fun' },
  logoGlyph: '🐸',
  devBuyNative: 1,
};

let symbols = 0;

function launchRaw(user: User, body: Partial<LaunchRequest>) {
  return call<LaunchResponse & { error: string; code?: string }>('POST', '/api/launch', {
    auth: user.auth,
    body: { ...POLISHED, symbol: `CRK${++symbols}`, ...body },
  });
}

async function launch(user: User, body: Partial<LaunchRequest> = {}): Promise<{ res: LaunchResponse; token: TokenState }> {
  const r = await launchRaw(user, body);
  expect(r.status, r.body.error).toBe(200);
  return { res: r.body, token: world().tokens.get(r.body.token.address)! };
}

/** Network fee of the account's active SOL buy preset (P2: anti-MEV on, so the tip is included). */
function networkFee(user: User): number {
  const p = accounts().getSettings(user.id).trade.sol.buyPresets.P2;
  return CHAINS.sol.baseNetworkFee + p.priorityFee + p.tip;
}

const balanceOf = (w: WalletState, t: TokenState) => w.positions.get(t.address)?.balance ?? 0;
const bundlersOf = (t: TokenState) => [...t.bundlers].map((a) => world().wallets.get(a)!);
const notifications = (user: User): AppNotification[] => accounts().listNotifications(user.id, 200);

function runSim(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) built.ctx.engine.step(1000);
}

describe('launch config', () => {
  it('serves launchpad curves at the current native price, fees, glyphs and limits without auth', async () => {
    const res = await call<LaunchConfig>('GET', '/api/launch/config');
    expect(res.status).toBe(200);
    const cfg = res.body;
    for (const chain of CHAIN_IDS) {
      expect(cfg.launchpads[chain].length).toBeGreaterThan(0);
      expect(cfg.launchFeeNative[chain]).toBe(LAUNCH_FEE_NATIVE[chain]);
      expect(cfg.limits.maxDevBuyNative[chain]).toBeGreaterThan(0);
      // the creation block can never complete a curve
      const smallest = Math.min(...cfg.launchpads[chain].map((lp) => lp.graduationNative));
      expect(cfg.limits.maxDevBuyNative[chain] + cfg.limits.maxBundleWallets * cfg.limits.maxBundleBuyNative[chain]).toBeLessThan(smallest);
    }
    const moonpit = cfg.launchpads.sol.find((lp) => lp.id === 'moonpit')!;
    const dev = world().createWallet('sol', 'dev', { native: 10 });
    const fresh = world().createToken({ ...tokenSpec(dev), launchpad: 'moonpit' });
    expect(moonpit.graduationMarketCapUsd).toBeCloseTo(world().graduationMarketCapUsd(fresh), 6);
    expect(moonpit.launchMarketCapUsd).toBeCloseTo(world().marketCapUsd(fresh), 6);
    expect(moonpit.graduationNative).toBeGreaterThan(80);
    expect(cfg.glyphs).toContain(cfg.defaultGlyph);
    expect(cfg.glyphNarratives['🐸']).toBe('Frogs');
    expect(cfg.reservedTickers).toContain('PEPE');
    expect(cfg.limits).toMatchObject({ nameMaxLength: 32, symbolMaxLength: 10, descriptionMaxLength: 280, maxBundleWallets: 4, launchesPerHour: LAUNCHES_PER_HOUR });
  });
});

function tokenSpec(creator: WalletState) {
  return {
    chain: 'sol' as const,
    launchpad: 'moonpit',
    creator,
    symbol: 'FRESH',
    name: 'Fresh',
    description: '',
    logoSeed: 'fresh',
    logoGlyph: '🐸',
    narrative: 'Frogs',
    socials: {},
    xFollowers: null,
    fate: 'dud' as const,
    hype: 0,
  };
}

describe('launch validation', () => {
  it('requires a session', async () => {
    expect((await call('POST', '/api/launch', { body: { ...POLISHED, symbol: 'CRK' } })).status).toBe(401);
  });

  it('refuses bad names, tickers, launchpads, glyphs and amounts with the offending field', async () => {
    const user = await signIn();
    const cases: [Partial<LaunchRequest> & Record<string, unknown>, string][] = [
      [{ name: '' }, 'name'],
      [{ name: 'x'.repeat(33) }, 'name'],
      [{ name: 'Frog‮eulav' }, 'name'], // right-to-left override
      [{ name: 'Fr​og' }, 'name'], // zero-width space
      [{ name: 'Pepe' }, 'name'], // reserved ticker as the whole name
      [{ name: 'Fr\ud800og' }, 'name'], // lone surrogate
      [{ name: 'Frog\u2028Coin' }, 'name'], // line separator
      [{ name: 'Fro\u0301\u0301\u0301\u0301g' }, 'name'], // stacked combining marks
      [{ name: 'S.O.L' }, 'name'], // spacing and punctuation do not hide a reserved ticker
      [{ name: 'Ѕоl' }, 'name'], // Cyrillic S and o
      [{ name: 'Trеnch Ѕcope' }, 'name'], // the brand, with Cyrillic e and S
      [{ name: 'ᴜsᴅᴄ' }, 'name'], // small capitals
      [{ symbol: 'PEPE' }, 'symbol'],
      [{ symbol: '$wif' }, 'symbol'],
      [{ symbol: 'ЕТН' }, 'symbol'], // Cyrillic
      [{ symbol: 'ΒΝΒ' }, 'symbol'], // Greek
      [{ symbol: 'ＵＳＤＴ' }, 'symbol'], // full-width
      [{ symbol: 'wёth' }, 'symbol'], // accented Cyrillic
      [{ symbol: 'TRENCH' }, 'symbol'],
      [{ symbol: 'FR-OG' }, 'symbol'],
      [{ symbol: 'ABCDEFGHIJK' }, 'symbol'],
      [{ symbol: '' }, 'symbol'],
      [{ description: 'x'.repeat(281) }, 'description'],
      [{ description: 'gm\u0000' }, 'description'],
      [{ description: 'gm Z\u0336\u0336\u0336\u0336\u0336' }, 'description'],
      [{ launchpad: 'fourpad' }, 'launchpad'], // a BNB Chain launchpad
      [{ launchpad: 'nowhere' }, 'launchpad'],
      [{ logoGlyph: '<b>' }, 'logoGlyph'],
      [{ devBuyNative: -1 }, 'devBuyNative'],
      [{ devBuyNative: 10.5 }, 'devBuyNative'],
      [{ bundleWallets: 5, bundleBuyNative: 0.1 }, 'bundleWallets'],
      [{ bundleWallets: 2 }, 'bundleBuyNative'],
      [{ bundleWallets: 1, bundleBuyNative: 6 }, 'bundleBuyNative'],
      [{ devBuyNative: 0, bundleWallets: 1, bundleBuyNative: 0.5 }, 'bundleWallets'], // bundles exit with the dev buy
      [{ devBuyNative: 0, strategy: { takeProfits: [{ changePct: 100, sellPercent: 50 }], stopLosses: [], trailing: null, devSellPercent: 0, migrationSellPercent: 0 } }, 'strategy'],
    ];
    for (const [body, field] of cases) {
      const res = await launchRaw(user, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.startsWith(`${field}:`), `${JSON.stringify(body)} -> ${res.body.error}`).toBe(true);
    }
    // look-alikes of reserved tickers are refused as reserved, not just as non-Latin
    expect((await launchRaw(user, { symbol: 'ЅОL' })).body.error).toBe('symbol: this ticker is reserved');
    expect(world().tokensByChain.sol).toHaveLength(0);
  });

  it('reserves native, stable and brand tickers (served in the config), not names that merely contain them', async () => {
    const config = (await call<LaunchConfig>('GET', '/api/launch/config')).body;
    expect(config.reservedTickers).toEqual(expect.arrayContaining(['SOL', 'ETH', 'BNB', 'USDC', 'USDT', 'WETH', 'TRENCH', 'TRENCHSCOPE']));
    const user = await signIn();
    expect((await launch(user, { name: 'Solar Flare', symbol: 'SOLAR', devBuyNative: 0 })).res.token.symbol).toBe('SOLAR');
    expect((await launch(user, { name: 'Тrench Rats', devBuyNative: 0 })).res.token.name).toBe('Тrench Rats');
  });

  it('only accepts https social links, on x.com / t.me for twitter / telegram', async () => {
    const user = await signIn();
    const bad: [keyof NonNullable<LaunchRequest['socials']>, string][] = [
      ['website', 'javascript:alert(document.cookie)'],
      ['website', 'JaVaScRiPt:alert(1)'],
      ['website', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
      ['website', 'http://croak.fun'],
      ['website', 'https://user:pass@croak.fun'],
      ['website', 'https://localhost/admin'],
      ['website', '//croak.fun'],
      ['website', 'croak.fun'],
      ['twitter', 'https://evil.io/croakcap'],
      ['twitter', 'https://x.com.evil.io/croakcap'],
      ['telegram', 'https://x.com/croakcap'],
      ['telegram', 'tg://resolve?domain=croakcap'],
    ];
    for (const [key, url] of bad) {
      const res = await launchRaw(user, { socials: { [key]: url } });
      expect(res.status, url).toBe(400);
      expect(res.body.error.startsWith(`socials.${key}:`), res.body.error).toBe(true);
    }
    const { res, token } = await launch(user, {
      socials: { twitter: 'https://WWW.Twitter.com/croakcap', telegram: '  ', website: 'https://Croak.fun/<script>' },
    });
    expect(res.token.socials).toEqual({ twitter: 'https://www.twitter.com/croakcap', website: 'https://croak.fun/%3Cscript%3E' });
    expect(Object.keys(token.socials)).toEqual(['twitter', 'website']);
  });

  it('upper-cases tickers, drops a leading $, and defaults the glyph', async () => {
    const user = await signIn();
    const { res } = await launch(user, { symbol: '$frog9', logoGlyph: undefined, devBuyNative: 0 });
    expect(res.token).toMatchObject({ symbol: 'FROG9', logoGlyph: '🚀', narrative: 'Space', creator: user.wallet().address, status: 'curve' });
    expect(res.receipts).toEqual([]);
  });
});

describe('launch execution', () => {
  it('charges the launch fee, the dev buy and funded bundles, all in the creation block', async () => {
    const user = await signIn();
    const wallet = user.wallet();
    const before = wallet.native;
    const strategy = { takeProfits: [{ changePct: 100, sellPercent: 50 }], stopLosses: [{ lossPct: 50, sellPercent: 100 }], trailing: null, devSellPercent: 0, migrationSellPercent: 0 };
    const { res, token } = await launch(user, { devBuyNative: 1, bundleWallets: 2, bundleBuyNative: 0.5, strategy });

    const nf = networkFee(user);
    const expected = LAUNCH_FEE_NATIVE.sol + (1 * (1 + PLATFORM_FEE_RATE) + nf) + 2 * (0.5 * (1 + PLATFORM_FEE_RATE) + nf);
    expect(before - wallet.native).toBeCloseTo(expected, 9);

    expect(res.receipts).toHaveLength(3);
    const [dev, ...bundles] = res.receipts;
    expect(dev).toMatchObject({ ok: true, nativeAmount: 1, latencyMs: 0, mevLossNative: 0 });
    expect(dev.platformFeeNative).toBeCloseTo(PLATFORM_FEE_RATE, 12);
    expect(dev.networkFeeNative).toBeCloseTo(nf, 12);
    expect(dev.trade).toMatchObject({ wallet: wallet.address, isDev: true });
    expect(dev.orders.map((o: Order) => [o.kind, o.source])).toEqual([
      ['take_profit', 'strategy'],
      ['stop_loss', 'strategy'],
    ]);
    expect(bundles.every((r: SwapReceipt) => r.ok && r.nativeAmount === 0.5)).toBe(true);

    // one block: dev buy then bundles, each bundle funded by the creator with exactly its cost
    const block = world().blockAt('sol', token.createdAt);
    expect(token.trades.map((t) => t.block)).toEqual([block, block, block]);
    expect(token.creator).toBe(wallet.address);
    expect(wallet.createdTokens).toEqual([token.address]);
    expect(balanceOf(wallet, token)).toBe(dev.tokenAmount);
    for (const b of bundlersOf(token)) {
      expect(b).toMatchObject({ accountId: user.id, archetype: 'user', fundedBy: wallet.address });
      expect(b.fundAmount).toBeCloseTo(0.5 * (1 + PLATFORM_FEE_RATE) + nf, 12);
      expect(b.native).toBeCloseTo(0, 12);
      expect(balanceOf(b, token)).toBeGreaterThan(0);
    }
    expect(res.token.holderCount).toBe(3);
    expect(res.token.security.bundlerRate).toBeGreaterThan(0);
    // the dev buy carries the strategy exits; volume counts toward rewards
    const open = (await call<Order[]>('GET', '/api/orders?status=open', { auth: user.auth })).body;
    expect(open).toHaveLength(2);
    expect(accounts().rewards(user.id).ownVolumeUsd).toBeCloseTo((dev.usdAmount + bundles[0].usdAmount + bundles[1].usdAmount), 6);
  });

  it("measures the dev buy's exits from after the bundles: the launcher's own buys never take profit", async () => {
    const user = await signIn();
    const strategy = { takeProfits: [{ changePct: 100, sellPercent: 50 }, { changePct: 300, sellPercent: 100 }], stopLosses: [{ lossPct: 50, sellPercent: 100 }], trailing: null, devSellPercent: 0, migrationSellPercent: 0 };
    const { res, token } = await launch(user, { devBuyNative: 2, bundleWallets: 4, bundleBuyNative: 5, strategy });
    const [dev] = res.receipts;
    // 4 x 5 SOL of bundles behind a 2 SOL dev buy more than double the price over the dev's cost
    expect(world().priceUsd(token) / dev.priceUsd).toBeGreaterThan(2);
    const [tp1, tp2, sl] = dev.orders;
    expect(tp1).toMatchObject({ kind: 'take_profit', source: 'strategy', status: 'open' });
    expect(tp1.refPriceUsd).toBeCloseTo(world().priceUsd(token), 15);
    expect(tp2.refPriceUsd).toBe(tp1.refPriceUsd);
    expect(sl.refPriceUsd!).toBeLessThan(dev.priceUsd);
    const bags = () => [user.wallet(), ...bundlersOf(token)].map((w) => balanceOf(w, token));
    const before = bags();
    trading().orders.evaluate();
    await trading().idle();
    expect(bags()).toEqual(before);
    expect((await call<Order[]>('GET', '/api/orders?status=open', { auth: user.auth })).body).toHaveLength(3);
    expect(token.trades.every((t) => t.side === 'buy')).toBe(true);
  });

  it('validates the whole cost against the balance before deploying anything', async () => {
    const user = await signIn();
    user.wallet().native = 1;
    const res = await launchRaw(user, { devBuyNative: 0.9, bundleWallets: 1, bundleBuyNative: 0.1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('insufficient_balance');
    expect(user.wallet().native).toBe(1);
    expect(world().tokensByChain.sol).toHaveLength(0);
    // the fee alone fits
    expect((await launchRaw(user, { devBuyNative: 0 })).status).toBe(200);
    expect(user.wallet().native).toBeCloseTo(1 - LAUNCH_FEE_NATIVE.sol, 12);
  });

  it(`allows ${LAUNCHES_PER_HOUR} launches per account per hour`, async () => {
    const user = await signIn();
    const other = await signIn();
    for (let i = 0; i < LAUNCHES_PER_HOUR; i++) expect((await launchRaw(user, { devBuyNative: 0 })).status).toBe(200);
    world().now += 60_000;
    const limited = await launchRaw(user, { devBuyNative: 0 });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBe('3540');
    expect((await launchRaw(other, { devBuyNative: 0 })).status).toBe(200);
    world().now += 3_600_000;
    expect((await launchRaw(user, { devBuyNative: 0 })).status).toBe(200);
  });
});

describe('adoption by the market', () => {
  it('agents trade the launch within a few sim minutes', async () => {
    const user = await signIn();
    const { token } = await launch(user, { bundleWallets: 2, bundleBuyNative: 0.5 });
    expect(ADOPTED_FATES).toContain(token.fate);
    expect(simOf(token).path.length).toBeGreaterThan(3);
    runSim(3 * 60_000);
    const agents = token.trades.filter((t) => world().wallets.get(t.wallet)?.accountId === null);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].timestamp - token.createdAt).toBeLessThan(3 * 60_000);
    expect(token.holders.size).toBeGreaterThan(3);
  });

  it('never sells the launcher or its bundles on a script', async () => {
    const user = await signIn();
    const { token } = await launch(user, { bundleWallets: 2, bundleBuyNative: 0.5 });
    const own = [user.wallet(), ...bundlersOf(token)];
    const held = own.map((w) => balanceOf(w, token));
    const s = simOf(token);
    // force the scripts that dump the dev side: a coordinated dump, then a dev exit
    s.eventKind = 'dump';
    s.eventAt = world().now;
    runSim(6000); // cold tokens are stepped every 5s
    expect(s.dumpedAt).toBeGreaterThan(0);
    s.eventKind = 'devExit';
    s.eventAt = world().now;
    runSim(6000);
    expect(s.eventKind).toBe('none');
    runSim(5 * 60_000);
    expect(own.map((w) => balanceOf(w, token))).toEqual(held);
    expect(own.every((w) => w.positions.get(token.address)!.sells === 0)).toBe(true);
  });

  it('notifies the launcher when the token migrates', async () => {
    const user = await signIn();
    const { token } = await launch(user);
    const whale = world().createWallet('sol', 'whale', { native: 1000 });
    expect(world().executeSwap(whale, token, 'buy', 200).ok).toBe(true);
    expect(token.status).toBe('migrating');
    runSim(15_000);
    expect(token.status).toBe('migrated');
    const notice = notifications(user).find((n) => n.kind === 'system' && n.token === token.address);
    expect(notice).toMatchObject({ level: 'success', chain: 'sol', title: `Your token $${token.symbol} graduated` });
  });

  it("keeps the launcher's links through migration (no simulated dev site)", async () => {
    const user = await signIn();
    const { token } = await launch(user, { socials: { twitter: 'https://x.com/croakcap' } });
    const dev = world().createWallet('sol', 'dev', { native: 10 });
    const control = world().createToken({ ...tokenSpec(dev), socials: { twitter: 'https://x.com/fresh' } });
    const whale = world().createWallet('sol', 'whale', { native: 5000 });
    const market = built.ctx.market as unknown as { migrate(t: TokenState, now: number): void };
    // a graduation that runs, and every coin flip lands: a simulated dev ships a site
    vi.spyOn(world().rng, 'chance').mockReturnValue(true);
    vi.spyOn(world().rng, 'weighted').mockImplementation(<T,>(items: readonly T[]) => items[items.length - 1]);
    for (const t of [token, control]) {
      t.fate = 'moon';
      expect(world().executeSwap(whale, t, 'buy', 200).ok).toBe(true);
      market.migrate(t, world().now);
      expect(t.status).toBe('migrated');
    }
    vi.restoreAllMocks();
    expect(control.socials.website).toBeDefined();
    expect(token.socials).toEqual({ twitter: 'https://x.com/croakcap' });
  });

  it('accepts accents, scripts and emoji in names', async () => {
    const user = await signIn();
    const name = 'Crêpe नमस्ते 1️⃣🐸';
    expect((await launch(user, { name })).res.token.name).toBe(name);
  });

  it('weights adopted fates by observable launch quality', () => {
    const share = (q: LaunchQuality, fates: string[]) => {
      const w = adoptedFateWeights(q);
      const total = w.reduce((a, b) => a + b, 0);
      return ADOPTED_FATES.reduce((sum, f, i) => sum + (fates.includes(f) ? w[i] / total : 0), 0);
    };
    const bare: LaunchQuality = { socials: 0, descriptionLength: 0, devShare: 0, bundleShare: 0 };
    const polished: LaunchQuality = { socials: 3, descriptionLength: 200, devShare: 0.03, bundleShare: 0 };
    const greedy: LaunchQuality = { ...polished, devShare: 0.25 };
    const bundled: LaunchQuality = { ...polished, bundleShare: 0.15 };
    const good = ['runner', 'moon'];
    expect(ADOPTED_FATES).not.toContain('rug');
    expect(ADOPTED_FATES).not.toContain('slow_rug');
    expect(share(bare, ['dud'])).toBeGreaterThan(0.85);
    expect(share(polished, good)).toBeGreaterThan(0.25);
    expect(share(polished, good)).toBeGreaterThan(5 * share(bare, good));
    expect(share(greedy, good)).toBeLessThan(share(polished, good));
    expect(share(bundled, ['pump_dump'])).toBeGreaterThan(2 * share(polished, ['pump_dump']));
    expect(share(bundled, good)).toBeLessThan(share(polished, good));
  });
});

describe('bundle wallets', () => {
  it('follow the launcher out: same share sold, proceeds swept to the account wallet', async () => {
    const user = await signIn();
    const { token } = await launch(user, { bundleWallets: 2, bundleBuyNative: 0.5 });
    const wallet = user.wallet();
    const bundlers = bundlersOf(token);
    const bags = bundlers.map((b) => balanceOf(b, token));
    const before = wallet.native;

    const swap = async (percent: number) =>
      (await call<SwapReceipt>('POST', '/api/trade/swap', { auth: user.auth, body: { chain: 'sol', token: token.address, side: 'sell', amount: percent, amountKind: 'percent' } })).body;
    const pushed = vi.spyOn(built.ctx.hub, 'publishUser');
    const half = await swap(50);
    expect(half.ok).toBe(true);
    bundlers.forEach((b, i) => {
      expect(balanceOf(b, token) / bags[i]).toBeCloseTo(0.5, 9);
      expect(b.native).toBe(0);
    });
    // every swap made for the account is a fill on its user channel, the bundles' sells included
    const fills = pushed.mock.calls.filter(([id, type]) => id === user.id && type === 'fill').map(([, , r]) => r as SwapReceipt);
    expect(fills.map((r) => [r.ok, r.trade!.side, r.trade!.wallet])).toEqual(
      expect.arrayContaining([[true, 'sell', wallet.address], ...bundlers.map((b) => [true, 'sell', b.address])]),
    );
    expect(fills).toHaveLength(3);
    for (const [i, b] of bundlers.entries()) {
      const fill = fills.find((r) => r.trade!.wallet === b.address)!;
      expect(fill.tokenAmount).toBeCloseTo(bags[i] / 2, 6);
      expect(fill.txHash).toBe(fill.trade!.txHash);
    }
    pushed.mockRestore();
    const ownNet = half.nativeAmount - half.platformFeeNative - half.networkFeeNative;
    expect(wallet.native - before).toBeGreaterThan(ownNet * 1.5);

    expect((await swap(100)).ok).toBe(true);
    await trading().idle();
    for (const b of bundlers) expect(balanceOf(b, token)).toBe(0);
    expect(balanceOf(wallet, token)).toBe(0);
  });

  it("never trip the launcher's own dev-sell exit when the launcher sells", async () => {
    const user = await signIn();
    const strategy = { takeProfits: [], stopLosses: [], trailing: null, devSellPercent: 100, migrationSellPercent: 0 };
    const { res, token } = await launch(user, { devBuyNative: 2, bundleWallets: 1, bundleBuyNative: 0.5, strategy });
    const [exit] = res.receipts[0].orders;
    expect(exit).toMatchObject({ kind: 'dev_sell', amount: 100, status: 'open' });
    const wallet = user.wallet();
    const bag = balanceOf(wallet, token);

    // The launcher (and its bundle wallet, following) sells a quarter by hand: a dev sell
    // past the 20% threshold, but their own, so the exit order must not dump the rest.
    const sold = await call<SwapReceipt>('POST', '/api/trade/swap', { auth: user.auth, body: { chain: 'sol', token: token.address, side: 'sell', amount: 25, amountKind: 'percent' } });
    expect(sold.body.ok).toBe(true);
    await trading().idle();
    expect(balanceOf(wallet, token) / bag).toBeCloseTo(0.75, 9);
    const orders = (await call<Order[]>('GET', '/api/orders', { auth: user.auth })).body;
    expect(orders.find((o) => o.id === exit.id)).toMatchObject({ status: 'open' });
  });

  it("count in the launcher's portfolio: rows flagged 'bundle', totals, win rate and equity", async () => {
    const user = await signIn();
    const { token } = await launch(user, { bundleWallets: 2, bundleBuyNative: 0.5 });
    const other = await launch(user, { devBuyNative: 0.2 });
    // the launch runs up (every bag of it in profit); the other one is down its fees
    expect(world().executeSwap(world().createWallet('sol', 'whale', { native: 10_000 }), token, 'buy', 20).ok).toBe(true);
    const wallet = user.wallet();
    const bundlers = bundlersOf(token);
    const portfolio = async () => (await call<PortfolioSummary>('GET', '/api/portfolio?chain=sol', { auth: user.auth })).body;

    const p = await portfolio();
    const rows = (address: string, role: string) => p.positions.filter((r) => r.token === address && r.walletRole === role);
    expect(rows(token.address, 'main').map((r) => r.wallet)).toEqual([wallet.address]);
    expect(rows(token.address, 'bundle').map((r) => r.wallet).sort()).toEqual(bundlers.map((b) => b.address).sort());
    expect(rows(other.token.address, 'main')).toHaveLength(1);
    expect(p.positions).toHaveLength(4);
    const price = world().priceUsd(token);
    const held = [wallet, ...bundlers].reduce((sum, w) => sum + balanceOf(w, token), 0) * price + balanceOf(wallet, other.token) * world().priceUsd(other.token);
    expect(p.holdingsValueUsd).toBeCloseTo(held, 6);
    expect(p.positions.reduce((sum, r) => sum + r.valueUsd, 0)).toBeCloseTo(held, 6);
    const native = [wallet, ...bundlers].reduce((sum, w) => sum + w.native, 0) * world().nativeUsd('sol');
    expect(p.nativeBalanceUsd).toBeCloseTo(native, 6);
    expect(p.totalValueUsd).toBeCloseTo(native + held, 6);
    const unrealized = [wallet, ...bundlers].reduce((sum, w) => {
      const pos = w.positions.get(token.address)!;
      return sum + pos.balance * price - pos.costBasisUsd;
    }, 0);
    expect(p.unrealizedPnlUsd).toBeCloseTo(unrealized + (balanceOf(wallet, other.token) * world().priceUsd(other.token) - wallet.positions.get(other.token.address)!.costBasisUsd), 6);
    // a launch and its bundles are one token toward the win rate (1 of 2, not 3 of 4 bags)
    expect(p.winRate).toBe(0.5);
    expect(p.equity[p.equity.length - 1].valueUsd).toBe(p.totalValueUsd);

    // another account's portfolio never sees them
    const stranger = await signIn();
    expect((await call<PortfolioSummary>('GET', '/api/portfolio?chain=sol', { auth: stranger.auth })).body.positions).toEqual([]);
  });
});
