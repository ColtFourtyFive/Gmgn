// EVM live feed end to end: recorded mainnet RPC traffic (Robinhood Chain,
// BNB Chain, Base) replayed through the real pipeline (poller -> venues ->
// World) into a live-mode app, then read back through analytics: Trenches,
// New pairs, token summaries. Offline and deterministic (FixtureRpc answers
// from the recording). Fixtures: `npx tsx scripts/evm-feed-smoke.ts record`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import type { EvmChainId } from '../src/live/evm/chains';
import { ENTRY_POINTS, TOPIC } from '../src/live/evm/feed/abi';
import { ChainFeed } from '../src/live/evm/feed/chain-feed';
import { loadEvmFeedSettings } from '../src/live/evm/feed/config';
import { FixtureRpc, type RpcFixture } from '../src/live/evm/feed/fixture-rpc';
import { toUnits } from '../src/live/evm/feed/math';
import { parseRawLog } from '../src/live/evm/feed/rpc';
import { FLAP_TOPIC } from '../src/live/evm/feed/venues/flap';
import { PONS_TOPIC } from '../src/live/evm/feed/venues/pons';
import { buildVenues } from '../src/live/evm/feed/venues/registry';
import { NativePriceFeed } from '../src/live/evm/price';
import type { TokenState } from '../src/sim/world';

const FIXTURES = join(__dirname, 'fixtures/evm/feed');
const load = (name: string): RpcFixture => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as RpcFixture;

interface Replay {
  built: BuiltApp;
  feed: ChainFeed;
  rpc: FixtureRpc;
  fixture: RpcFixture;
  chain: EvmChainId;
}

const opened: BuiltApp[] = [];
afterEach(async () => {
  while (opened.length) await opened.pop()!.close();
});

/** Replay a recorded block range into a fresh live-mode app. */
async function replay(name: string, opts: { cap?: number; worldTokenCap?: number; pins?: string[] } = {}): Promise<Replay> {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const fixture = load(name);
  const chain = fixture.chain as EvmChainId;
  const built = await buildApp(defaultConfig({ mode: 'live', live: null, warmupMinutes: 0, snapshotEveryMs: 0 }), { start: false, persist: false });
  opened.push(built);
  const { world } = built.ctx;
  // The clock sits a minute after the recording's last block.
  const times = [...Object.values(fixture.blocks), ...fixture.logs.map((l) => parseRawLog(l).blockTimestamp ?? 0)];
  world.now = Math.max(...times) * 1000 + 60_000;
  if (opts.pins) world.addPinSource(() => opts.pins!);
  const rpc = new FixtureRpc(fixture);
  await new NativePriceFeed(world, { [chain]: rpc }).refresh();
  const settings = loadEvmFeedSettings({ [chain]: { chain, rpcUrls: [], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } }, {} as NodeJS.ProcessEnv);
  const feed = new ChainFeed({
    chain,
    world,
    rpc,
    venues: buildVenues(chain, { newPairs: true, newPairMinSwaps: settings.newPairMinSwaps, newPairMinVolume: settings.chains[chain]!.newPairMinVolume }),
    maxTrackedTokens: opts.cap ?? 1500,
    pollMs: 1000,
    confirmations: 0,
    rescan: 0,
    backfill: fixture.to - fixture.from + 1,
    ipfsGateways: ['https://ipfs.filebase.io/ipfs/'],
    pruneWorld: false,
    worldTokenCap: opts.worldTokenCap,
    fetchJson: async () => null,
    now: () => world.now,
  });
  while ((feed.poller.cursor ?? -1n) < BigInt(fixture.to)) await feed.pollOnce();
  return { built, feed, rpc, fixture, chain };
}

/** Traders holding tokens followed since launch: positions equal their Transfer-derived balances. */
function expectExactHolders(r: Replay): number {
  const { world } = r.built.ctx;
  let checked = 0;
  for (const token of r.feed.holders.tokens()) {
    const t = world.tokens.get(token);
    if (!t) continue;
    for (const addr of t.traders) {
      const b = r.feed.holders.balanceOf(token, addr);
      const pos = world.wallets.get(addr)?.positions.get(token);
      // Signers credited for tokens delivered elsewhere (bot contracts) hold nothing themselves: skip them.
      if (b === undefined || b === 0n || !pos) continue;
      expect(pos.balance).toBeCloseTo(toUnits(b, t.decimals), 6);
      expect(t.holders.has(addr)).toBe(pos.balance > t.totalSupply * 1e-7);
      checked++;
    }
  }
  return checked;
}

const tokensOf = (r: Replay) => r.built.ctx.world.tokensByChain[r.chain].map((a) => r.built.ctx.world.tokens.get(a)!);
/** The expected trader: tx.from, or (ERC-4337 bundles) not the bundler but a user operation's sender. */
function expectTrader(r: Replay, wallet: string, hash: string): void {
  const tx = r.fixture.txs[hash];
  if (tx.to && ENTRY_POINTS.has(tx.to)) {
    expect(wallet).not.toBe(tx.from);
    const senders = (r.fixture.receipts?.[hash] ?? []).map(parseRawLog).filter((l) => l.topics[0] === TOPIC.userOperation).map((l) => `0x${l.topics[2].slice(26)}`);
    expect(senders).toContain(wallet);
  } else expect(wallet).toBe(tx.from);
}

describe('Robinhood Chain replay (Pons, Flap, Uniswap V4)', () => {
  it('registers Pons launches with exact curve state, metadata and the creator buy', async () => {
    const r = await replay('robinhood-window.json');
    const { world, analytics } = r.built.ctx;
    expect(r.rpc.missingCalls).toBe(0);
    expect(world.nativeUsd('robinhood')).toBeGreaterThan(1000);

    const launchLog = r.fixture.logs.map(parseRawLog).find((l) => l.topics[0] === PONS_TOPIC.tokenLaunched)!;
    const token = world.tokens.get(`0x${launchLog.topics[1].slice(26)}`)!;
    expect(token).toBeDefined();
    expect(token.launchpad).toBe('pons');
    expect(token.creator).toBe(`0x${launchLog.topics[3].slice(26)}`);
    expect(token.createdAt).toBeGreaterThan(1.7e12);
    expect(token.totalSupply).toBe(1e9);
    expect(token.curve!.initialRealTokens).toBeCloseTo(714_285_714.2857, 3);
    // constant product of the Pons curve: 1.68 ETH x 1B
    expect(token.curve!.virtualNative * token.curve!.virtualTokens).toBeCloseTo(1.68e9, -1);
    expect(token.imageUrl === null || token.imageUrl!.startsWith('https://')).toBe(true);

    const pons = tokensOf(r).filter((t) => t.launchpad === 'pons');
    expect(pons.length).toBeGreaterThan(3);
    for (const t of pons) {
      if (t.status !== 'curve') continue;
      expect(t.curve!.realTokens).toBeLessThanOrEqual(t.curve!.initialRealTokens + 1e-6);
      expect(t.curve!.realNative).toBeGreaterThanOrEqual(0);
      for (const tr of t.trades) {
        // the trader is the transaction sender, the slot the block, amounts positive
        expectTrader(r, tr.wallet, tr.txHash);
        expect(tr.nativeAmount).toBeGreaterThan(0);
        expect(tr.tokenAmount).toBeGreaterThan(0);
        expect(tr.block).toBeGreaterThanOrEqual(r.fixture.from);
      }
    }

    // Trenches: curve tokens in New / Near graduation; summaries priced in USD.
    const trenches = analytics.trenches({ chain: 'robinhood' });
    expect(trenches.new.length + trenches.almost.length).toBeGreaterThan(0);
    const s = analytics.tokenSummary(token);
    expect(s.launchpad).toBe('pons');
    expect(s.marketCapUsd).toBeGreaterThan(0);
    expect(s.priceNative * world.nativeUsd('robinhood')).toBeCloseTo(s.priceUsd, 9);

    // tokens launched in the window are followed from their mint: exact holder balances
    expect(r.feed.holders.size).toBeGreaterThan(0);
    expect(expectExactHolders(r)).toBeGreaterThan(0);
  });

  it('loads pasted addresses: a curve token, a graduated Pons token, a Pools.trade token; refuses a stock token', async () => {
    const r = await replay('robinhood-window.json');
    const { world, analytics } = r.built.ctx;
    const curve = (await r.feed.ensureToken('0xB7506BEB4A14A5D03294728522319D97A1C412FD'))!;
    expect(curve.launchpad).toBe('pons');
    const graduated = (await r.feed.ensureToken('0x2eb2849cde7957b86d0dfd4b59e450a9f9d15559'))!;
    expect(graduated).toMatchObject({ launchpad: 'pons', status: 'migrated' });
    expect(graduated.pool!.dex).toBe('Uniswap V4');
    expect(graduated.pool!.lpBurnedRate).toBe(1);
    const gcat = (await r.feed.ensureToken('0xc718b23680e83fbe55fd28ef5387860eb9b9e1b2'))!;
    expect(gcat).toMatchObject({ symbol: 'GCAT', status: 'migrated' });
    expect(world.priceNative(gcat)).toBeGreaterThan(0);
    // a Robinhood stock token (BeaconProxy of the stock beacon) is not a memecoin
    expect(await r.feed.ensureToken('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea')).toBeNull();
    expect(await r.feed.ensureToken('not-an-address')).toBeNull();
    // DEX-listed tokens show up as new pairs / in the Migrated column
    expect(analytics.newPairs('robinhood', undefined, 50).map((s) => s.address)).toEqual(expect.arrayContaining([gcat.address, graduated.address]));
    expect(r.rpc.missingCalls).toBe(0);
  });

  it('is deterministic and never books a log twice', async () => {
    const a = await replay('robinhood-window.json');
    const b = await replay('robinhood-window.json');
    const sig = (r: Replay) =>
      tokensOf(r)
        .map((t) => `${t.address}:${t.tradeCount}:${r.built.ctx.world.priceNative(t).toPrecision(12)}`)
        .sort();
    expect(sig(a)).toEqual(sig(b));
    // re-processing the same window: everything is deduped
    const before = a.built.ctx.world.tradeTotal;
    a.feed.poller.cursor = BigInt(a.fixture.from - 1);
    while ((a.feed.poller.cursor ?? -1n) < BigInt(a.fixture.to)) await a.feed.pollOnce();
    expect(a.built.ctx.world.tradeTotal).toBe(before);
  });
});

describe('BNB Chain replay (four.meme, Flap, PancakeSwap)', () => {
  it('books Flap curve trades with taxes and four.meme launches, lists new PancakeSwap pairs', async () => {
    const r = await replay('bsc-window.json');
    const { world, analytics } = r.built.ctx;
    expect(r.rpc.missingCalls).toBe(0);
    expect(world.nativeUsd('bsc')).toBeGreaterThan(100);
    const all = tokensOf(r);
    const flap = all.filter((t) => t.launchpad === 'flap-bsc');
    const four = all.filter((t) => t.launchpad === 'fourmeme');
    const pairs = all.filter((t) => t.launchpad === 'pancake-bsc');
    expect(flap.length).toBeGreaterThan(5);
    expect(four.length).toBeGreaterThan(0);

    // Flap launches of the window: created by TokenCreated's creator, curve from (r, h, k, threshold)
    const created = r.fixture.logs.map(parseRawLog).filter((l) => l.topics[0] === FLAP_TOPIC.tokenCreated);
    expect(created.length).toBeGreaterThan(0);
    const launched = flap.filter((t) => t.creator !== t.address);
    expect(launched.length).toBeGreaterThan(0);
    for (const t of flap) {
      expect(t.curve!.initialRealTokens).toBe(800_000_000);
      expect(t.curve!.realTokens).toBeGreaterThanOrEqual(0);
      for (const tr of t.trades) expectTrader(r, tr.wallet, tr.txHash);
    }
    expect(flap.some((t) => t.buyTax > 0)).toBe(true);

    for (const t of four) expect(t.curve!.initialRealTokens).toBe(800_000_000);

    // new pairs are DEX-native tokens with a live pool, listed in New pairs
    for (const t of pairs) {
      expect(t.status).toBe('migrated');
      expect(t.pool!.dex).toMatch(/PancakeSwap/);
    }
    if (pairs.length) expect(analytics.newPairs('bsc', undefined, 50).map((s) => s.address)).toEqual(expect.arrayContaining(pairs.map((t) => t.address)));

    const trenches = analytics.trenches({ chain: 'bsc' });
    expect(trenches.new.length + trenches.almost.length).toBeGreaterThan(0);
    expect(expectExactHolders(r)).toBeGreaterThan(0);
    for (const s of [...trenches.new, ...trenches.almost]) expect(['flap-bsc', 'fourmeme']).toContain(s.launchpad);
  });

  it('caps the tracked set: least recently active out (dormant), pinned tokens kept', async () => {
    const full = await replay('bsc-window.json');
    // pin the first token launched in the window (the oldest activity: first out without the pin)
    const pinned = tokensOf(full).find((t) => t.launchpad === 'flap-bsc')!.address;
    const r = await replay('bsc-window.json', { cap: 3, pins: [pinned] });
    const st = r.feed.status();
    expect(st.trackedTokens).toBeLessThanOrEqual(3);
    expect(st.evictions).toBeGreaterThan(0);
    expect(r.feed.tracked.has(pinned)).toBe(true);
    // every token no longer followed is dormant (out of Trenches / Trending), the pinned one is not
    const all = tokensOf(r);
    for (const t of all) expect(t.dormant).toBe(!r.feed.tracked.has(t.address));
    expect(r.built.ctx.world.tokens.get(pinned)!.dormant).toBe(false);
  });

  it('bounds the ledger: oldest untracked, unpinned tokens are deleted with their positions', async () => {
    const r = await replay('bsc-window.json', { cap: 3, worldTokenCap: 10 });
    const { world } = r.built.ctx;
    const before = world.tokensByChain.bsc.length;
    expect(before).toBeGreaterThan(10);
    const removed = r.feed.pruneWorld(new Set());
    expect(removed).toBeGreaterThan(0);
    expect(world.tokensByChain.bsc.length).toBeLessThanOrEqual(10);
    // followed tokens are never pruned; no wallet keeps a position in a deleted token
    for (const t of r.feed.tracked.tokens()) expect(world.tokens.has(t)).toBe(true);
    for (const w of world.wallets.values()) for (const token of w.positions.keys()) expect(world.tokens.has(token)).toBe(true);
  });
});

describe('Base replay (Clanker v4)', () => {
  it('lists a Clanker launch on its V4 pool with metadata, attributing the dev buy to the token admin', async () => {
    const r = await replay('base-clanker.json');
    const { world, analytics } = r.built.ctx;
    expect(r.rpc.missingCalls).toBe(0);
    const t: TokenState = tokensOf(r).find((x) => x.launchpad === 'clanker')!;
    expect(t).toBeDefined();
    expect(t).toMatchObject({ status: 'migrated', totalSupply: 1e11, creator: '0x308112d06027cd838627b94ddfc16ea6b4d90004' });
    expect(t.pool!.dex).toBe('Uniswap V4');
    expect(t.pool!.lpBurnedRate).toBe(1);
    expect(t.description).toMatch(/^Adage is an experiment/);
    expect(t.socials.website).toBe('https://adage.sh/');
    expect(t.imageUrl).toMatch(/^https:\/\/.+\/ipfs\/Qm/);
    // the dev buy (run by Clanker's deployer in the deploy tx) is the admin's
    expect(t.trades).toHaveLength(1);
    expect(t.trades[0]).toMatchObject({ side: 'buy', wallet: t.creator, isDev: true });
    // 0.00012 ETH paid; the V4 Swap event shows what reached the pool (the hook kept 1/51 outside it)
    expect(t.trades[0].nativeAmount).toBeCloseTo(0.00012 / 1.02, 12);
    expect(world.marketCapUsd(t)).toBeGreaterThan(0);
    expect(analytics.newPairs('base', undefined, 20).map((s) => s.address)).toContain(t.address);
  });
});
