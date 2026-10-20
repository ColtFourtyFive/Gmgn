// Live ingestion units: PumpPortal message validation, the feed -> World
// normalizer (launch, curve trades, completion, migration, PumpSwap trades,
// dedupe), the tracked-token set (LRU cap, idle sweep, protected tokens),
// narratives and KOL lists. Fixtures in fixtures/pumpportal follow the message
// shapes PumpPortal documents; their numbers are synthesized along pump.fun's
// constant-product curve (they are not captures of the live feed).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyNarrative } from '../src/live/enrich/narratives';
import { parseKolList } from '../src/live/enrich/kol';
import { FeedIngestor, PUMP_POOL_TOKENS, pumpCurveFromVirtual } from '../src/live/feed/ingest';
import { isRefusalNotice, parseFeedMessage, type FeedEvent, type TradeEvent } from '../src/live/feed/messages';
import { TrackedTokens } from '../src/live/feed/tracker';
import { World } from '../src/sim/world';

const FIX = join(__dirname, 'fixtures', 'pumpportal');
const lifecycle = JSON.parse(readFileSync(join(FIX, 'lifecycle.json'), 'utf8')) as Record<string, unknown>[];
const misc = JSON.parse(readFileSync(join(FIX, 'misc.json'), 'utf8')) as {
  createCat: Record<string, unknown>;
  createBonk: Record<string, unknown>;
  subscribedKeys: Record<string, unknown>;
  errorKeys: Record<string, unknown>;
  malformed: string[];
  wallets: { DEV: string; A: string; B: string; MINT: string; MINT2: string };
};
const { DEV, A, B, MINT } = misc.wallets;

const events = (frames: Record<string, unknown>[]): FeedEvent[] =>
  frames.map((f) => parseFeedMessage(JSON.stringify(f))).filter((m): m is FeedEvent => m.kind === 'create' || m.kind === 'trade' || m.kind === 'migrate');

function setup(start = 1_800_000_000_000) {
  const world = new World('live-test', start);
  world.setNativeUsd('sol', 200);
  const ingest = new FeedIngestor(world, { now: () => world.now, pumpPoolAddress: (m) => `pool-of-${m.slice(0, 6)}` });
  return { world, ingest };
}

describe('PumpPortal messages', () => {
  it('parses create, trade and migrate frames into typed events (UI units as sent)', () => {
    const [ack, create, buy, sell, , migrate, amm] = lifecycle.map((f) => parseFeedMessage(JSON.stringify(f)));
    expect(ack).toEqual({ kind: 'notice', message: 'Successfully subscribed to token creation events.' });
    expect(create).toMatchObject({ kind: 'create', mint: MINT, trader: DEV, initialBuy: 34612903.225806, solAmount: 1, name: 'Ribbit Frog', symbol: 'RIBBIT', pool: 'pump', vSolInBondingCurve: 31 });
    expect(buy).toMatchObject({ kind: 'trade', side: 'buy', trader: A, solAmount: 0.5, newTokenBalance: 16482334.869432, pool: 'pump' });
    expect(sell).toMatchObject({ kind: 'trade', side: 'sell', trader: DEV, tokenAmount: 10_000_000 });
    expect(migrate).toMatchObject({ kind: 'migrate', mint: MINT, pool: 'pump-amm' });
    expect(amm).toMatchObject({ kind: 'trade', pool: 'pump-amm', solAmount: 1, tokenAmount: 2_400_000 });
    expect((amm as TradeEvent).vSolInBondingCurve).toBeUndefined();
  });

  it('reports malformed frames instead of throwing, and tells notices from server errors', () => {
    for (const raw of misc.malformed) expect(parseFeedMessage(raw).kind).toBe('malformed');
    expect(parseFeedMessage('x'.repeat(70_000)).kind).toBe('malformed');
    expect(parseFeedMessage(JSON.stringify(misc.subscribedKeys))).toEqual({ kind: 'notice', message: 'Successfully subscribed to keys.' });
    expect(parseFeedMessage(JSON.stringify(misc.errorKeys)).kind).toBe('error');
    expect(isRefusalNotice('Successfully subscribed to keys.')).toBe(false);
    expect(isRefusalNotice('Token trade subscriptions require an API key funded with 0.02 SOL')).toBe(true);
  });

  it('strips control and bidi characters from names and caps their length', () => {
    const rlo = String.fromCodePoint(0x202e);
    const zw = String.fromCodePoint(0x200b);
    const m = parseFeedMessage(JSON.stringify({ ...misc.createCat, name: `Sir${zw} Meow${rlo}ington\n${'x'.repeat(200)}`, symbol: `ME${zw}OW` }));
    expect(m.kind).toBe('create');
    if (m.kind !== 'create') return;
    expect(m.symbol).toBe('MEOW');
    expect(m.name.startsWith('Sir Meowington x')).toBe(true);
    expect([...m.name].length).toBeLessThanOrEqual(64);
  });

  it('accepts null optional fields (metadata not resolved yet)', () => {
    const m = parseFeedMessage(JSON.stringify({ ...misc.createCat, name: null, symbol: null, uri: null }));
    expect(m).toMatchObject({ kind: 'create', name: '', symbol: '', uri: '' });
  });
});

describe('feed -> World', () => {
  it('registers a launch at its pre-buy curve and books the creator initial buy as the first trade', () => {
    const { world, ingest } = setup();
    const [create] = events(lifecycle);
    const r = ingest.apply(create);
    expect(r.status).toBe('ok');
    const t = world.tokens.get(MINT)!;
    expect(t).toMatchObject({ launchpad: 'pump', creator: DEV, symbol: 'RIBBIT', status: 'curve', decimals: 6, totalSupply: 1e9, createdAt: world.now, narrative: 'Frogs', logoGlyph: '🐸' });
    expect(t.metadataUri).toContain('ipfs.io/ipfs/');
    // after the dev buy the curve holds the reported reserves
    expect(t.curve!.virtualNative).toBeCloseTo(31, 9);
    expect(t.curve!.virtualTokens).toBeCloseTo(1038387096.774194, 3);
    expect(t.curve!.realNative).toBeCloseTo(1, 9);
    expect(t.curve!.realTokens).toBeCloseTo(793_100_000 - 34612903.225806, 3);
    expect(t.trades).toHaveLength(1);
    expect(t.trades[0]).toMatchObject({ wallet: DEV, side: 'buy', nativeAmount: 1, isDev: true });
    expect(world.wallets.get(DEV)!.positions.get(MINT)!.balance).toBeCloseTo(34612903.225806, 5);
    expect(world.wallets.get(DEV)!.archetype).toBe('external');
    // the launch counts for the 1h counter; initial liquidity is the launch curve's
    expect(world.chains.sol.launches).toEqual([world.now]);
    expect(t.initialLiquidityUsd).toBeCloseTo(30 * 200, 6);
    expect(t.candles['1m']).toHaveLength(1);
  });

  it('follows the curve through trades to completion, migration and PumpSwap trades', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    const completed = vi.fn();
    const migrated = vi.fn();
    world.on('curveCompleted', completed);
    world.on('tokenMigrated', migrated);
    for (const e of evs.slice(0, 3)) expect(ingest.apply(e).status).toBe('ok');
    const t = world.tokens.get(MINT)!;
    expect(t.holders.has(A)).toBe(true);
    expect(world.wallets.get(DEV)!.positions.get(MINT)!.balance).toBeCloseTo(24612903.225806, 5);
    // the completing buy empties the curve: the World stops trading it until the migration lands
    expect(ingest.apply(evs[3]).status).toBe('ok');
    expect(t.status).toBe('migrating');
    expect(t.curve!.realTokens).toBe(0);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(world.progress(t)).toBe(1);
    const curveEndPrice = world.priceNative(t);
    expect(curveEndPrice).toBeCloseTo((30 * 1.073e9) / 279.9e6 / 279.9e6, 12);
    // migration: the curve's real SOL against the tokens it never sold, LP burned
    expect(ingest.apply(evs[4]).status).toBe('ok');
    expect(t.status).toBe('migrated');
    expect(migrated).toHaveBeenCalledTimes(1);
    expect(world.chains.sol.migrations).toHaveLength(1);
    expect(t.pool).toMatchObject({ dex: 'PumpSwap', lpBurnedRate: 1, address: `pool-of-${MINT.slice(0, 6)}` });
    expect(t.pool!.tokens).toBeCloseTo(PUMP_POOL_TOKENS, 0);
    expect(t.pool!.native).toBeCloseTo(t.curve!.realNative, 9);
    expect(world.priceNative(t) / curveEndPrice).toBeCloseTo(1, 1);
    // PumpSwap trade without reserves: priced at the trade, pool SOL moves by the flow
    const nativeBefore = t.pool!.native;
    expect(ingest.apply(evs[5]).status).toBe('ok');
    expect(world.priceNative(t)).toBeCloseTo(1 / 2_400_000, 12);
    expect(t.pool!.native).toBeCloseTo(nativeBefore + 1, 9);
    expect(world.wallets.get(A)!.positions.get(MINT)!.balance).toBeCloseTo(16482334.869432 + 2_400_000, 5);
    expect(t.trades.map((x) => x.side)).toEqual(['buy', 'buy', 'sell', 'buy', 'buy']);
  });

  it('dedupes by signature: a replayed frame books nothing twice', () => {
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
    const [, buy] = events(lifecycle);
    expect(ingest.apply(buy)).toEqual({ status: 'unknown_token', mint: MINT });
    const bonk = events([misc.createBonk])[0];
    expect(ingest.apply(bonk).status).toBe('ignored');
    // an unknown-token trade is not marked seen: it applies once the token exists
    const [create] = events(lifecycle);
    ingest.apply(create);
    expect(ingest.apply(buy).status).toBe('ok');
  });

  it('migrates a token whose migration event was missed when its first PumpSwap trade arrives', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    for (const e of evs.slice(0, 4)) ingest.apply(e);
    ingest.apply(evs[5]); // skip the migrate event
    const t = world.tokens.get(MINT)!;
    expect(t.status).toBe('migrated');
    expect(t.pool?.dex).toBe('PumpSwap');
    expect(world.priceNative(t)).toBeCloseTo(1 / 2_400_000, 12);
  });

  it('books the reported post-trade balance even for a seller whose buys we never saw', () => {
    const { world, ingest } = setup();
    const evs = events(lifecycle);
    ingest.apply(evs[0]);
    const stranger = { ...(evs[2] as TradeEvent), trader: B, signature: `${(evs[2] as TradeEvent).signature.slice(0, -4)}AAAA`, newTokenBalance: 5_000_000 };
    expect(ingest.apply(stranger).status).toBe('ok');
    const pos = world.wallets.get(B)!.positions.get(MINT)!;
    expect(pos.balance).toBe(5_000_000);
    expect(world.tokens.get(MINT)!.holders.has(B)).toBe(true);
  });

  it('derives real reserves from virtual ones with the pump.fun offsets', () => {
    expect(pumpCurveFromVirtual(30, 1.073e9)).toEqual({ virtualNative: 30, virtualTokens: 1.073e9, realNative: 0, realTokens: 793_100_000 });
    expect(pumpCurveFromVirtual(115.005, 279_900_000.4).realTokens).toBe(0);
  });

  it('files a token created long ago at its place in creation order and leaves the 1h launch counter alone', () => {
    const { world, ingest } = setup();
    ingest.apply(events(lifecycle)[0]);
    const old = world.addExternalToken({
      chain: 'sol',
      address: misc.wallets.MINT2,
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
