// Live ingestion units: PumpPortal message validation, the feed -> World
// normalizer (launch, curve trades, completion, migration, PumpSwap trades,
// dedupe), the tracked-token set (LRU cap, idle sweep, protected tokens),
// narratives and KOL lists. Fixtures in fixtures/pumpportal are frames captured
// from the live feed and trade frames rebuilt from the same transactions'
// on-chain events (see its README); the PumpSwap trade is synthesized.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyNarrative } from '../src/live/enrich/narratives';
import { parseKolList } from '../src/live/enrich/kol';
import {
  completedCurveSol,
  FeedIngestor,
  isMayhemToken,
  PUMP_MAYHEM_AGENT,
  PUMP_MAYHEM_SUPPLY,
  PUMP_POOL_TOKENS,
  pumpCurveFromVirtual,
  walletSol,
} from '../src/live/feed/ingest';
import { isRefusalNotice, isTradeStreamRefusal, parseFeedMessage, type CreateEvent, type FeedEvent, type TradeEvent } from '../src/live/feed/messages';
import { TrackedTokens } from '../src/live/feed/tracker';
import { World } from '../src/sim/world';

type Frame = Record<string, unknown>;
const FIX = join(__dirname, 'fixtures', 'pumpportal');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(FIX, name), 'utf8')) as T;
/** ack, create, ten buys completing the curve (two bundles), migrate. */
const lifecycle = load<Frame[]>('lifecycle.json');
/** create, then buys / round trips / exits back to the starting reserves. */
const curveTrades = load<Frame[]>('curve-trades.json');
const amm = load<Frame[]>('amm-trade.synthesized.json');
const misc = load<Record<string, Frame> & { malformed: string[] }>('misc.json');

const MINT = lifecycle[1].mint as string;
const DEV = lifecycle[1].traderPublicKey as string;
const A = lifecycle[2].traderPublicKey as string;
const B = curveTrades[1].traderPublicKey as string;
const CT_MINT = curveTrades[0].mint as string;
const FEE = 0.0125;

const events = (frames: Frame[]): FeedEvent[] =>
  frames.map((f) => parseFeedMessage(JSON.stringify(f))).filter((m): m is FeedEvent => m.kind === 'create' || m.kind === 'trade' || m.kind === 'migrate');

function setup(start = 1_800_000_000_000) {
  const world = new World('live-test', start);
  world.setNativeUsd('sol', 200);
  const ingest = new FeedIngestor(world, { now: () => world.now, pumpPoolAddress: (m) => `pool-of-${m.slice(0, 6)}` });
  return { world, ingest };
}

describe('PumpPortal messages', () => {
  it('parses captured create, migrate and notice frames into typed events (UI units as sent)', () => {
    const [ack, create, buy] = lifecycle.map((f) => parseFeedMessage(JSON.stringify(f)));
    const migrate = parseFeedMessage(JSON.stringify(lifecycle[12]));
    expect(ack).toEqual({ kind: 'notice', message: 'Successfully subscribed to token creation events.' });
    expect(create).toMatchObject({
      kind: 'create',
      mint: MINT,
      trader: DEV,
      initialBuy: 92925575.058386,
      solAmount: 2.844444443,
      name: 'Dogettecoin',
      symbol: 'DOGETTE',
      pool: 'pump',
      mayhem: false,
      vSolInBondingCurve: 32.844444442999986,
      vTokensInBondingCurve: 980074424.941614,
    });
    expect(buy).toMatchObject({ kind: 'trade', side: 'buy', trader: A, solAmount: 3.737201041, newTokenBalance: 100124942.76665, pool: 'pump' });
    expect(migrate).toEqual({ kind: 'migrate', signature: lifecycle[12].signature, mint: MINT, pool: 'pump-amm' });
    const sell = parseFeedMessage(JSON.stringify(curveTrades[3]));
    expect(sell).toMatchObject({ kind: 'trade', side: 'sell', tokenAmount: 52592363.143495, solAmount: 1.580246912, newTokenBalance: 0 });
    const ammTrade = parseFeedMessage(JSON.stringify(amm[0]));
    expect(ammTrade).toMatchObject({ kind: 'trade', pool: 'pump-amm', solAmount: 1, tokenAmount: 2_400_000 });
    expect((ammTrade as TradeEvent).vSolInBondingCurve).toBeUndefined();
  });

  it('reads is_mayhem_mode, and a bonk launch without name / symbol / uri', () => {
    expect(parseFeedMessage(JSON.stringify(misc.createMayhemWrongCurveKey))).toMatchObject({ kind: 'create', mayhem: true });
    expect(parseFeedMessage(JSON.stringify(misc.createBonk))).toMatchObject({ kind: 'create', pool: 'bonk', name: '', symbol: '', uri: '', solInPool: 0.873734233 });
  });

  it('reports malformed frames instead of throwing, and tells notices, refusals and server errors apart', () => {
    for (const raw of misc.malformed) expect(parseFeedMessage(raw).kind).toBe('malformed');
    expect(parseFeedMessage('x'.repeat(70_000)).kind).toBe('malformed');
    for (const key of ['subscribedNewToken', 'subscribedMigration', 'unsubscribed']) {
      const m = parseFeedMessage(JSON.stringify(misc[key]));
      expect(m.kind).toBe('notice');
      if (m.kind === 'notice') expect(isRefusalNotice(m.message)).toBe(false);
    }
    const refusal = parseFeedMessage(JSON.stringify(misc.tradeStreamsRefused));
    expect(refusal.kind).toBe('notice');
    if (refusal.kind === 'notice') {
      expect(isRefusalNotice(refusal.message)).toBe(true);
      expect(isTradeStreamRefusal(refusal.message)).toBe(true);
    }
    expect(isTradeStreamRefusal('Rate limit exceeded')).toBe(false);
    expect(parseFeedMessage(JSON.stringify(misc.errorInvalidMethod)).kind).toBe('error');
    expect(parseFeedMessage(JSON.stringify(misc.errorFailedToSubscribe))).toEqual({ kind: 'error', message: 'Invalid message. Failed to subscribe.' });
  });

  it('strips control and bidi characters from names and caps their length', () => {
    const rlo = String.fromCodePoint(0x202e);
    const zw = String.fromCodePoint(0x200b);
    const m = parseFeedMessage(JSON.stringify({ ...misc.createNoBuy, name: `Sir${zw} Meow${rlo}ington\n${'x'.repeat(200)}`, symbol: `ME${zw}OW` }));
    expect(m.kind).toBe('create');
    if (m.kind !== 'create') return;
    expect(m.symbol).toBe('MEOW');
    expect(m.name.startsWith('Sir Meowington x')).toBe(true);
    expect([...m.name].length).toBeLessThanOrEqual(64);
  });

  it('accepts null optional fields (metadata not resolved yet)', () => {
    const m = parseFeedMessage(JSON.stringify({ ...misc.createNoBuy, name: null, symbol: null, uri: null, is_mayhem_mode: null }));
    expect(m).toMatchObject({ kind: 'create', name: '', symbol: '', uri: '' });
    expect((m as CreateEvent).mayhem).toBeUndefined();
  });
});

describe('feed -> World', () => {
  it('registers a launch at its pre-buy curve and books the creator initial buy, fees included, as the first trade', () => {
    const { world, ingest } = setup();
    const [create] = events(lifecycle);
    const r = ingest.apply(create);
    expect(r.status).toBe('ok');
    const t = world.tokens.get(MINT)!;
    expect(t).toMatchObject({ launchpad: 'pump', creator: DEV, symbol: 'DOGETTE', name: 'Dogettecoin', status: 'curve', decimals: 6, totalSupply: 1e9, createdAt: world.now });
    expect(t.metadataUri).toContain('ipfs.io/ipfs/');
    // after the dev buy the curve holds the reported reserves: the same as the chain's (TradeEvent)
    expect(t.curve!.virtualNative).toBeCloseTo(32.844444443, 9);
    expect(t.curve!.virtualTokens).toBeCloseTo(980074424.941614, 3);
    expect(t.curve!.realNative).toBeCloseTo(2.844444443, 9);
    expect(t.curve!.realTokens).toBeCloseTo(700174424.941614, 3);
    expect(t.curve!.feeRate).toBe(FEE);
    expect(t.trades).toHaveLength(1);
    // the wallet paid the curve amount plus 1.25% fees (on-chain: 2.889 SOL incl. rent and tx fee)
    expect(t.trades[0]).toMatchObject({ wallet: DEV, side: 'buy', isDev: true });
    expect(t.trades[0].nativeAmount).toBeCloseTo(2.844444443 * (1 + FEE), 9);
    const pos = world.wallets.get(DEV)!.positions.get(MINT)!;
    expect(pos.balance).toBeCloseTo(92925575.058386, 5);
    expect(pos.costBasisUsd).toBeCloseTo(2.844444443 * (1 + FEE) * 200, 6);
    expect(world.wallets.get(DEV)!.archetype).toBe('external');
    // the launch counts for the 1h counter; initial liquidity is the launch curve's
    expect(world.chains.sol.launches).toEqual([world.now]);
    expect(t.initialLiquidityUsd).toBeCloseTo(30 * 200, 6);
    expect(t.candles['1m']).toHaveLength(1);
  });

  it('follows the curve through two bundles of buys to completion, migration and a PumpSwap trade', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    const completed = vi.fn();
    const migrated = vi.fn();
    world.on('curveCompleted', completed);
    world.on('tokenMigrated', migrated);
    for (const e of evs.slice(0, 10)) expect(ingest.apply(e).status).toBe('ok');
    const t = world.tokens.get(MINT)!;
    expect(t.status).toBe('curve');
    // five wallets bought in one transaction: one signature, five trades
    const bundle = evs.slice(1, 6) as TradeEvent[];
    expect(new Set(bundle.map((e) => e.signature)).size).toBe(1);
    expect(t.trades.filter((x) => x.txHash === bundle[0].signature)).toHaveLength(5);
    for (const e of bundle) {
      const pos = world.wallets.get(e.trader)!.positions.get(MINT)!;
      expect(pos.balance).toBeCloseTo(e.newTokenBalance!, 5);
      expect(pos.costBasisUsd).toBeCloseTo(e.solAmount * (1 + FEE) * 200, 6);
    }
    // the completing buy empties the curve: the World stops trading it until the migration lands
    expect(ingest.apply(evs[10]).status).toBe('ok');
    expect(t.status).toBe('migrating');
    expect(t.curve!.realTokens).toBe(0);
    expect(t.curve!.realNative).toBeCloseTo(85.005359065, 6);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(world.progress(t)).toBe(1);
    expect(t.holders.size).toBe(11);
    const curveEndPrice = world.priceNative(t);
    expect(curveEndPrice).toBeCloseTo(115.005359065 / 279.9e6, 15);
    // migration (MigrateV2 on mainnet): 84.990 SOL (17.58 of it virtual) and 206.9M tokens in the pool
    expect(ingest.apply(evs[11]).status).toBe('ok');
    expect(t.status).toBe('migrated');
    expect(migrated).toHaveBeenCalledTimes(1);
    expect(world.chains.sol.migrations).toHaveLength(1);
    expect(t.pool).toMatchObject({ dex: 'PumpSwap', lpBurnedRate: 1, address: `pool-of-${MINT.slice(0, 6)}`, tokens: PUMP_POOL_TOKENS });
    expect(t.pool!.native).toBeCloseTo(67.405853774 + 17.584505288, 4);
    expect(world.priceNative(t) / curveEndPrice).toBeCloseTo(1, 3);
    // PumpSwap trade without reserves: priced at the trade, pool SOL moves by the flow, taken as sent
    const nativeBefore = t.pool!.native;
    const [ammBuy] = events(amm);
    expect(ingest.apply(ammBuy).status).toBe('ok');
    expect(world.priceNative(t)).toBeCloseTo(1 / 2_400_000, 12);
    expect(t.pool!.native).toBeCloseTo(nativeBefore + 1, 9);
    expect(t.trades.at(-1)!.nativeAmount).toBe(1);
    expect(world.wallets.get(A)!.positions.get(MINT)!.balance).toBeCloseTo(102524942.76665, 5);
    expect(t.trades).toHaveLength(12);
  });

  it('books what wallets paid and received on a curve: buys plus fees, sells less fees, round trips lose both', () => {
    const { world, ingest } = setup();
    const evs = events(curveTrades);
    for (const e of evs) expect(ingest.apply(e).status).toBe('ok');
    const t = world.tokens.get(CT_MINT)!;
    // every trader exited: the curve is back at its starting reserves and nobody holds the token
    expect(t.curve!.virtualTokens).toBeCloseTo(1.073e9, 3);
    expect(t.curve!.realTokens).toBeCloseTo(793.1e6, 3);
    expect(t.curve!.realNative).toBeCloseTo(0, 6);
    expect(t.holders.size).toBe(0);
    const [buy, sell] = [evs[2], evs[3]] as TradeEvent[];
    expect(buy.trader).toBe(sell.trader);
    const byTx = (sig: string) => t.trades.find((x) => x.txHash === sig)!;
    expect(byTx(buy.signature).nativeAmount).toBeCloseTo(walletSol('buy', buy.solAmount, FEE), 9);
    expect(byTx(sell.signature).nativeAmount).toBeCloseTo(sell.solAmount * (1 - FEE), 9);
    // the same SOL in and out of the curve is a ~2.5% loss to fees, not a flat trade
    const pos = world.wallets.get(sell.trader)!.positions.get(CT_MINT)!;
    expect(pos.balance).toBe(0);
    expect(pos.realizedPnlUsd).toBeCloseTo((sell.solAmount * (1 - FEE) - buy.solAmount * (1 + FEE)) * 200, 6);
    expect(pos.realizedPnlUsd / (buy.solAmount * 200)).toBeCloseTo(-0.025, 3);
  });

  it('charges the curve fees on a curve trade that reports no reserves too', () => {
    const { world, ingest } = setup();
    const [create, buy] = events(curveTrades) as [CreateEvent, TradeEvent];
    ingest.apply(create);
    const bare: TradeEvent = { ...buy, vSolInBondingCurve: undefined, vTokensInBondingCurve: undefined, marketCapSol: undefined };
    expect(ingest.apply(bare).status).toBe('ok');
    const t = world.tokens.get(CT_MINT)!;
    expect(t.trades.at(-1)!.nativeAmount).toBeCloseTo(buy.solAmount * (1 + FEE), 12);
    // the curve stays where the last reported reserves left it
    expect(t.curve!.virtualNative).toBeCloseTo(create.vSolInBondingCurve!, 9);
  });

  it('dedupes by signature, trader and side: a replayed frame books nothing twice', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    for (const e of evs) ingest.apply(e);
    const before = world.tokens.get(MINT)!.tradeCount;
    for (const e of evs) expect(['duplicate']).toContain(ingest.apply(e).status);
    expect(world.tokens.get(MINT)!.tradeCount).toBe(before);
    expect(ingest.stats.duplicates).toBeGreaterThanOrEqual(evs.length);
  });

  it('reports trades of unknown tokens (to be loaded and replayed) and ignores other launchpads', () => {
    const { ingest } = setup();
    const [create, buy] = events(lifecycle);
    expect(ingest.apply(buy)).toEqual({ status: 'unknown_token', mint: MINT });
    const bonk = events([misc.createBonk])[0];
    expect(ingest.apply(bonk).status).toBe('ignored');
    // an unknown-token trade is not marked seen: it applies once the token exists
    ingest.apply(create);
    expect(ingest.apply(buy).status).toBe('ok');
  });

  it('ignores every event of a mint quoted in another currency, and curve trades of tokens not on a SOL pump curve', () => {
    const { world, ingest } = setup();
    const quoted = events([misc.createQuotedInPump])[0];
    ingest.ignoreMint(quoted.mint);
    expect(ingest.apply(quoted)).toEqual({ status: 'ignored', reason: 'not quoted in SOL' });
    expect(world.tokens.has(quoted.mint)).toBe(false);
    // a token known some other way (loaded on demand, priced by Jupiter) takes no curve trade
    const [, buy] = events(lifecycle);
    world.addExternalToken({
      chain: 'sol',
      address: MINT,
      launchpad: '',
      symbol: 'X',
      name: 'X',
      description: '',
      imageUrl: null,
      metadataUri: null,
      creator: DEV,
      createdAt: world.now,
      decimals: 6,
      totalSupply: 1e9,
      status: 'migrated',
      curve: null,
      pool: { address: '', dex: 'DEX', feeRate: 0.0025, native: 100, tokens: 1e8, lpBurnedRate: 0 },
      socials: {},
      narrative: '',
      logoGlyph: '🚀',
    });
    expect(ingest.apply(buy)).toEqual({ status: 'ignored', reason: 'not a SOL-quoted pump.fun curve' });
    expect(world.tokens.get(MINT)!.trades).toHaveLength(0);
  });

  it('gives a mayhem-mode coin its 2B supply, books the agent fee-free and tracks its real SOL by flows', () => {
    const { world, ingest } = setup();
    const create = events([misc.createMayhemWrongCurveKey])[0] as CreateEvent;
    expect(ingest.apply(create).status).toBe('ok');
    const t = world.tokens.get(create.mint)!;
    expect(t.totalSupply).toBe(PUMP_MAYHEM_SUPPLY);
    expect(isMayhemToken(t)).toBe(true);
    expect(world.marketCapUsd(t)).toBeCloseTo((30 / 1.073e9) * 2e9 * 200, 6);
    const trade = (over: Partial<TradeEvent>): TradeEvent => ({
      kind: 'trade',
      side: 'buy',
      signature: '4p5w1BiXtL9pff3DpMcj2kvsPvXos2rn8LyXAmDgwoY4oBUM8ixCzPzz9qvMcMR6ygKGuDrwuRuggMv6FGQMKrJS',
      mint: create.mint,
      trader: PUMP_MAYHEM_AGENT,
      tokenAmount: 2_995_008.318185,
      solAmount: 0.010938039,
      pool: 'pump',
      ...over,
    });
    // the program re-set the virtual SOL (2.81 SOL against 1.07B tokens): real SOL is what flowed in
    expect(ingest.apply(trade({ vSolInBondingCurve: 2.814158731, vTokensInBondingCurve: 1_070_004_991.681815, newTokenBalance: 1_002_995_008.318185 })).status).toBe('ok');
    expect(t.curve!.realNative).toBeCloseTo(0.010938039, 9);
    expect(t.curve!.realTokens).toBeCloseTo(1_070_004_991.681815 - 279.9e6, 3);
    expect(t.trades.at(-1)!.nativeAmount).toBeCloseTo(0.010938039, 12);
    // a regular wallet pays the curve fees
    const user = 'AfU4MyZgZHV8vKdf52CnzCpyD3C1ZKGTQRd9y1FB12MS';
    const sig = '4BGbopANtvMJxmYXMetXQR3yrTcjMx7VWq6jRm4zHmZQgVrbmW25rzPUEEsxEs2NefUvEb3QbiDaDPEkMAeDGpqE';
    expect(ingest.apply(trade({ signature: sig, trader: user, solAmount: 0.005, tokenAmount: 1_000_000, vSolInBondingCurve: 2.819, vTokensInBondingCurve: 1_069_004_991.681815, newTokenBalance: 1_000_000 })).status).toBe('ok');
    expect(t.trades.at(-1)!.nativeAmount).toBeCloseTo(0.005 * (1 + FEE), 12);
    expect(t.curve!.realNative).toBeCloseTo(0.015938039, 9);
    // on completion a mayhem curve migrates its tracked real SOL, not the normal curve's 85 SOL
    expect(completedCurveSol(t)).toBeCloseTo(0.015938039, 9);
  });

  it('migrates a normal curve with its completion SOL even when trades were missed', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    ingest.apply(evs[0]); // the launch only: the ten buys never arrived
    const t = world.tokens.get(MINT)!;
    expect(completedCurveSol(t)).toBeCloseTo(85.005359, 5);
    expect(ingest.apply(evs[11]).status).toBe('ok');
    expect(t.status).toBe('migrated');
    expect(t.pool!.native).toBeCloseTo(84.990359, 5);
    expect(t.pool!.tokens).toBe(206_900_000);
  });

  it('takes an instant graduation (the dev buys the whole curve at launch) to its pool', () => {
    const { world, ingest } = setup();
    const [create, migrate] = events([misc.createInstantGraduation, misc.migrateInstantGraduation]);
    expect(ingest.apply(create).status).toBe('ok');
    const t = world.tokens.get(create.mint)!;
    expect(t.status).toBe('migrating');
    expect(world.wallets.get((create as CreateEvent).trader)!.positions.get(t.address)!.balance).toBeCloseTo(793_100_000, 3);
    expect(ingest.apply(migrate).status).toBe('ok');
    expect(t.status).toBe('migrated');
    expect(t.pool!.native).toBeCloseTo(84.990359, 5);
  });

  it('migrates a token whose migration event was missed when its first PumpSwap trade arrives', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    for (const e of evs.slice(0, 11)) ingest.apply(e);
    ingest.apply(events(amm)[0]); // the migrate event never came
    const t = world.tokens.get(MINT)!;
    expect(t.status).toBe('migrated');
    expect(t.pool?.dex).toBe('PumpSwap');
    expect(world.priceNative(t)).toBeCloseTo(1 / 2_400_000, 12);
  });

  it('books the reported post-trade balance even for a seller whose buys we never saw', () => {
    const { world, ingest } = setup();
    const evs = events(curveTrades);
    ingest.apply(evs[0]);
    const sell = evs[3] as TradeEvent;
    const stranger = { ...sell, trader: B, signature: `${sell.signature.slice(0, -4)}AAAA`, newTokenBalance: 5_000_000 };
    expect(ingest.apply(stranger).status).toBe('ok');
    const pos = world.wallets.get(B)!.positions.get(CT_MINT)!;
    expect(pos.balance).toBe(5_000_000);
    expect(world.tokens.get(CT_MINT)!.holders.has(B)).toBe(true);
  });

  it('derives real reserves from virtual ones with the pump.fun offsets', () => {
    expect(pumpCurveFromVirtual(30, 1.073e9)).toEqual({ virtualNative: 30, virtualTokens: 1.073e9, realNative: 0, realTokens: 793_100_000 });
    expect(pumpCurveFromVirtual(115.005, 279_900_000.4).realTokens).toBe(0);
    expect(walletSol('buy', 1, FEE)).toBeCloseTo(1.0125, 12);
    expect(walletSol('sell', 1, FEE)).toBeCloseTo(0.9875, 12);
  });

  it('files a token created long ago at its place in creation order and leaves the 1h launch counter alone', () => {
    const { world, ingest } = setup();
    ingest.apply(events(lifecycle)[0]);
    const old = world.addExternalToken({
      chain: 'sol',
      address: CT_MINT,
      launchpad: '',
      symbol: 'OLD',
      name: 'Old',
      description: '',
      imageUrl: null,
      metadataUri: null,
      creator: B,
      createdAt: world.now - 30 * 86_400_000,
      decimals: 9,
      totalSupply: 1e9,
      status: 'curve',
      curve: { virtualNative: 30, virtualTokens: 1.073e9, realNative: 0, realTokens: 793.1e6, initialRealTokens: 793.1e6, feeRate: 0.0125 },
      pool: null,
      socials: {},
      narrative: '',
      logoGlyph: '🚀',
    });
    expect(world.tokensByChain.sol).toEqual([old.address, MINT]);
    expect(world.chains.sol.launches).toHaveLength(1);
  });
});

describe('tracked tokens', () => {
  const stream = () => {
    const subs: string[] = [];
    const unsubs: string[] = [];
    return { subs, unsubs, stream: { subscribeTokenTrades: (m: Iterable<string>) => subs.push(...m), unsubscribeTokenTrades: (m: Iterable<string>) => unsubs.push(...m) } };
  };

  it('streams new mints, evicts the least recently active beyond the cap and never a protected one', () => {
    const s = stream();
    const open = new Set<string>();
    const tracker = new TrackedTokens({ max: 4, idleMs: 30 * 60_000, stream: s.stream, isProtected: (m) => open.has(m) });
    tracker.setProtected(new Set(['held']));
    tracker.touch('held', 1);
    tracker.touch('a', 2);
    tracker.touch('b', 3);
    tracker.touch('a', 4); // a is now more recent than b
    open.add('c');
    tracker.touch('c', 5);
    tracker.touch('d', 6); // over the cap: b goes (held is protected, a was touched later)
    expect(s.subs).toEqual(['held', 'a', 'b', 'c', 'd']);
    expect(s.unsubs).toEqual(['b']);
    tracker.touch('e', 7); // a goes; c is open in a client
    expect(s.unsubs).toEqual(['b', 'a']);
    expect(tracker.has('held') && tracker.has('c') && tracker.has('d') && tracker.has('e')).toBe(true);
    expect(tracker.evicted).toBe(2);
  });

  it('drops idle tokens on sweep but keeps protected ones, and restores a saved set', () => {
    const s = stream();
    const tracker = new TrackedTokens({ max: 10, idleMs: 1000, stream: s.stream });
    tracker.setProtected(new Set(['watched']));
    tracker.touch('watched', 0);
    tracker.touch('quiet', 0);
    tracker.touch('busy', 5000);
    expect(tracker.sweep(5500)).toEqual(['quiet']);
    expect(tracker.has('watched')).toBe(true);
    expect(s.unsubs).toEqual(['quiet']);
    const s2 = stream();
    const restored = new TrackedTokens({ max: 10, idleMs: 1000, stream: s2.stream });
    restored.restore(tracker.entries());
    expect(s2.subs.sort()).toEqual(['busy', 'watched']);
  });
});

describe('narratives and KOL labels', () => {
  it('classifies by keyword into the platform narratives, or none', () => {
    expect(classifyNarrative('Ribbit Frog', 'RIBBIT').narrative).toBe('Frogs');
    expect(classifyNarrative('Sir Meowington', 'MEOW').narrative).toBe('Cats');
    expect(classifyNarrative('Autonomous Agent', 'AGENT')).toEqual({ narrative: 'AI Agents', glyph: '🤖' });
    expect(classifyNarrative('Moon Rocket', 'MOON').narrative).toBe('Space');
    expect(classifyNarrative('Zxqv', 'ZXQV')).toEqual({ narrative: '', glyph: '🚀' });
    expect(classifyNarrative('Zxqv', 'ZXQV', 'the first otter to run a validator').narrative).toBe('Animals');
  });

  it('parses a KOL list, skipping invalid and duplicate entries', () => {
    const { entries, skipped } = parseKolList([
      { address: A, name: 'Alpha Caller', twitter: '@alpha_calls' },
      { address: A, name: 'Dup' },
      { address: 'not-an-address', name: 'x' },
      { address: B, name: `  Beta${String.fromCodePoint(0x202e)} ` },
      { address: DEV, name: 'Gamma', twitter: 'https://x.com/gamma' },
    ]);
    expect(entries).toEqual([
      { address: A, name: 'Alpha Caller', twitter: 'https://x.com/alpha_calls' },
      { address: B, name: 'Beta', twitter: null },
      { address: DEV, name: 'Gamma', twitter: 'https://x.com/gamma' },
    ]);
    expect(skipped).toBe(2);
    expect(parseKolList({ not: 'a list' }).entries).toEqual([]);
  });
});
