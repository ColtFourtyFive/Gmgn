// EVM feed engine: the log poller (window planning, confirmations, range
// splitting, re-scan dedupe, skip-ahead, query merging), the request budget,
// the tracked-token cap, block clock, ERC-4337 trader attribution, RPC error
// classification, feed settings and the SSRF guard of the metadata fetcher.

import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { addressTopic, ENTRY_POINTS, TOPIC } from '../src/live/evm/feed/abi';
import { mergeTrades } from '../src/live/evm/feed/chain-feed';
import { BlockClock } from '../src/live/evm/feed/clock';
import { endpointLogLimits, loadEvmFeedSettings } from '../src/live/evm/feed/config';
import { BoundedSet, LruMap } from '../src/live/evm/feed/lru';
import { HolderBook } from '../src/live/evm/feed/holders';
import { LogPoller, type PollerOptions } from '../src/live/evm/feed/poller';
import { errorText, isRangeError, isRateLimit, parseRawLog, queryShapeLimit, RequestBudget, type EvmRpc, type LogQuery, type RawLog, type TxInfo } from '../src/live/evm/feed/rpc';
import { isAllowedUrl, isPublicAddress, safeFetchText } from '../src/live/evm/feed/safe-fetch';
import { TxSenders } from '../src/live/evm/feed/senders';
import { TrackedTokens } from '../src/live/evm/feed/tracked';

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;

function log(block: number, index: number, address = '0xaaaa000000000000000000000000000000000001', topic0: Hex = TOPIC.v2Sync): RawLog {
  return {
    address,
    topics: [topic0],
    data: '0x',
    blockNumber: BigInt(block),
    blockHash: hash(block),
    transactionHash: hash(block * 1000 + index),
    transactionIndex: 0,
    logIndex: index,
    removed: false,
  };
}

/** A node with a block-span cap (beyond it: "query returned more than 10000 results"). */
class FakeRpc implements EvmRpc {
  head = 1000n;
  maxSpan = Infinity;
  rateLimited = false;
  /** publicnode-like filter limits: emitters per query, and the span of an emitter-less query. */
  addressLimit = Infinity;
  emitterlessSpan = Infinity;
  readonly queries: LogQuery[] = [];
  blockCalls: bigint[][] = [];
  txs = new Map<string, TxInfo>();
  receipts = new Map<string, RawLog[]>();

  constructor(public logs: RawLog[] = []) {}

  async blockNumber(): Promise<bigint> {
    return this.head;
  }

  async getLogs(q: LogQuery): Promise<RawLog[]> {
    this.queries.push(q);
    if (this.rateLimited) throw Object.assign(new Error('rpc'), { shortMessage: 'RPC Request failed.', details: 'method eth_getLogs in batch triggered rate limit', code: -32005 });
    if (Number.isFinite(this.maxSpan) && q.toBlock - q.fromBlock + 1n > BigInt(this.maxSpan)) throw new Error('query returned more than 10000 results');
    // Messages and codes as publicnode returns them (behind viem's RpcRequestError).
    if (q.address && q.address.length > this.addressLimit)
      throw Object.assign(new Error('rpc'), { shortMessage: 'Invalid parameters were provided to the RPC method.', details: `A maximum of ${this.addressLimit} addresses is allowed. No limit on a dedicated node: https://www.allnodes.com/publicnode`, code: -32602 });
    if (!q.address && q.toBlock - q.fromBlock + 1n > BigInt(Number.isFinite(this.emitterlessSpan) ? this.emitterlessSpan : 1e9))
      throw Object.assign(new Error('rpc'), { shortMessage: 'RPC Request failed.', details: 'Please specify an address in your request or, to remove restrictions, order a dedicated full node here: https://www.allnodes.com/bnb/host', code: -32701 });
    const t0 = q.topics?.[0];
    return this.logs.filter(
      (l) =>
        l.blockNumber >= q.fromBlock &&
        l.blockNumber <= q.toBlock &&
        (!q.address || q.address.includes(l.address)) &&
        (!t0 || (Array.isArray(t0) ? t0.includes(l.topics[0]) : t0 === l.topics[0])),
    );
  }

  async blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
    this.blockCalls.push(blocks);
    return new Map(blocks.map((b) => [b, 1_700_000_000 + Number(b) * 2]));
  }

  async transactions(hashes: Hex[]): Promise<Map<string, TxInfo>> {
    return new Map(hashes.filter((h) => this.txs.has(h)).map((h) => [h, this.txs.get(h)!]));
  }

  async receiptLogs(hashes: Hex[]): Promise<Map<string, RawLog[]>> {
    return new Map(hashes.filter((h) => this.receipts.has(h)).map((h) => [h, this.receipts.get(h)!]));
  }

  async call(): Promise<(Hex | null)[]> {
    return [];
  }

  async storageAt(): Promise<Hex> {
    return '0x';
  }
}

const OPTS: PollerOptions = { maxRange: 200, confirmations: 0, rescan: 0, maxLagBlocks: 5000, backfill: 0, dedupeCap: 1000, maxAddresses: 500, maxTopicValues: 500 };

describe('log poller', () => {
  it('plans windows up to the head minus the confirmation depth, in maxRange steps', async () => {
    const rpc = new FakeRpc();
    const p = new LogPoller(rpc, { ...OPTS, confirmations: 2, backfill: 450 });
    const w1 = (await p.plan())!;
    // first window starts `backfill` before the safe head (998)
    expect(w1.from).toBe(998n - 450n + 1n);
    expect(w1.to - w1.from + 1n).toBe(200n);
    p.commit(w1);
    const w2 = p.nextWindow()!;
    expect(w2.from).toBe(w1.to + 1n);
    p.commit(w2);
    const w3 = p.nextWindow()!;
    expect(w3.to).toBe(998n);
    p.commit(w3);
    expect(p.nextWindow()).toBeNull();
    expect(p.status()).toMatchObject({ head: 1000n, cursor: 998n, lagBlocks: 0, windows: 3 });
  });

  it('halves a window the node refuses as too large, until each span fits', async () => {
    const logs = Array.from({ length: 50 }, (_, i) => log(804 + i * 4, i));
    const rpc = new FakeRpc(logs);
    rpc.maxSpan = 30;
    const p = new LogPoller(rpc, OPTS);
    const got = await p.fetch([{ address: ['0xaaaa000000000000000000000000000000000001'] }], 801n, 1000n);
    expect(got).toHaveLength(50);
    expect(p.status().splits).toBeGreaterThan(0);
    // every successful query fit the node's cap
    const ok = rpc.queries.filter((q) => q.toBlock - q.fromBlock + 1n <= 30n);
    expect(ok.length).toBeGreaterThan(0);
  });

  it('does not split on rate limits: they surface (the feed backs off)', async () => {
    const rpc = new FakeRpc([log(900, 0)]);
    rpc.rateLimited = true;
    const p = new LogPoller(rpc, OPTS);
    await expect(p.fetch([{}], 801n, 1000n)).rejects.toThrow();
    expect(rpc.queries).toHaveLength(1);
  });

  it('re-scans overlap blocks but delivers each log once (txHash + logIndex)', async () => {
    const rpc = new FakeRpc([log(950, 1), log(950, 2), log(960, 0)]);
    const p = new LogPoller(rpc, { ...OPTS, rescan: 20 });
    const a = await p.fetch([{}], 941n, 955n);
    expect(a.map((l) => l.logIndex)).toEqual([1, 2]);
    p.markDelivered(a);
    // the next window re-reads 941..955 and the new block
    const b = await p.fetch([{}], 956n, 965n);
    expect(b.map((l) => Number(l.blockNumber))).toEqual([960]);
    // duplicates within one fetch (overlapping interests) collapse too
    const c = p.fresh([log(970, 3), log(970, 3), log(969, 9)]);
    expect(c.map((l) => Number(l.blockNumber))).toEqual([969, 970]);
    // removed logs (reorged out) are dropped
    expect(p.fresh([{ ...log(971, 0), removed: true }])).toEqual([]);
  });

  it('skips ahead (and says so) when too far behind the head', async () => {
    const rpc = new FakeRpc();
    const p = new LogPoller(rpc, { ...OPTS, maxLagBlocks: 1000 });
    await p.plan();
    p.commit({ from: 1n, to: 10n, head: 1000n });
    rpc.head = 50_000n;
    const w = (await p.plan())!;
    const st = p.status();
    expect(st.skippedBlocks).toBeGreaterThan(40_000);
    expect(st.lastSkipAt).not.toBeNull();
    expect(50_000n - w.from).toBeLessThan(1000n);
  });

  it('merges interests: emitters with a topic0 list share one query; others group by filter; long lists chunk', () => {
    const p = new LogPoller(new FakeRpc(), { ...OPTS, maxTopicValues: 2, maxAddresses: 2 });
    const q = p.mergeInterests([
      { address: ['0xA'], topics: [TOPIC.v2PairCreated] },
      { address: ['0xb'], topics: [[TOPIC.v3PoolCreated, TOPIC.v2Sync]] },
      { address: ['0xc'] },
      { topics: [[TOPIC.v4Swap]] },
      { address: ['0xd'], topics: [[TOPIC.v4Swap], [hash(1), hash(2), hash(3)]] },
      { address: [] },
    ]);
    const simple = q.filter((x) => x.topics?.length === 1 && x.address);
    expect(simple).toHaveLength(1); // 0xa and 0xb merged (maxAddresses 2)
    expect(simple[0].address).toEqual(['0xa', '0xb']);
    expect(simple[0].topics![0]).toHaveLength(3);
    expect(q.some((x) => x.address?.[0] === '0xc' && !x.topics)).toBe(true);
    expect(q.some((x) => !x.address && x.topics?.[0]?.[0] === TOPIC.v4Swap)).toBe(true);
    // pool ids chunked by maxTopicValues
    expect(q.filter((x) => x.address?.[0] === '0xd')).toHaveLength(2);
  });

  const pool = (i: number) => `0xbbbb${i.toString(16).padStart(36, '0')}`;

  it('sends AMM pools emitter-less once they outgrow the address limit, keeping only their logs', async () => {
    const pools = Array.from({ length: 25 }, (_, i) => pool(i));
    const stranger = '0xcccc000000000000000000000000000000000001';
    const logs = [log(901, 0, pools[3]), log(902, 1, stranger), log(903, 2, pools[24], TOPIC.v2Swap), log(903, 3, pools[5], TOPIC.transfer)];
    const rpc = new FakeRpc(logs);
    rpc.addressLimit = 10;
    rpc.emitterlessSpan = 1;
    const p = new LogPoller(rpc, { ...OPTS, maxAddresses: 10, emitterlessRange: 1 });
    const interests = [
      { address: ['0xfac0000000000000000000000000000000000001'], topics: [TOPIC.v2PairCreated] },
      { address: pools, topics: [[TOPIC.v2Sync, TOPIC.v2Swap]], wide: true },
    ];
    const q = p.mergeInterests(interests);
    expect(q.filter((x) => x.address)).toHaveLength(1); // the factory alone
    expect(q.filter((x) => !x.address)).toEqual([{ topics: [[TOPIC.v2Sync, TOPIC.v2Swap].sort()], keep: new Set(pools) }]);
    const got = await p.fetch(interests, 901n, 905n);
    expect(got.map((l) => l.address)).toEqual([pools[3], pools[24]]); // the stranger's Sync and a Transfer are not ours
    // one block per emitter-less query; no refusals
    expect(rpc.queries.filter((x) => !x.address).every((x) => x.fromBlock === x.toBlock)).toBe(true);
    expect(rpc.queries.filter((x) => !x.address)).toHaveLength(5);
    expect(p.status()).toMatchObject({ wideActive: true, maxAddresses: 10, emitterlessRange: 1 });
    // a few pools still go as one address-filtered query
    const few = p.mergeInterests([{ address: pools.slice(0, 4), topics: [TOPIC.v2Sync], wide: true }]);
    expect(few).toEqual([{ address: pools.slice(0, 4).sort(), topics: [[TOPIC.v2Sync]] }]);
  });

  it("learns the node's filter limits from its refusals instead of splitting block ranges", async () => {
    const pools = Array.from({ length: 30 }, (_, i) => pool(i));
    const rpc = new FakeRpc([log(950, 0, pools[29]), log(951, 1, pools[0])]);
    rpc.addressLimit = 10;
    rpc.emitterlessSpan = 1;
    const p = new LogPoller(rpc, { ...OPTS }); // assumes 500 / unrestricted
    const got = await p.fetch([{ address: pools, topics: [TOPIC.v2Sync], wide: true }], 901n, 960n);
    expect(got).toHaveLength(2);
    expect(p.status()).toMatchObject({ maxAddresses: 10, emitterlessRange: 1, wideActive: true, splits: 0 });
    // Transfer-style interests (never emitter-less) chunk to the learned limit
    const t = p.mergeInterests([{ address: pools, topics: [TOPIC.transfer] }]);
    expect(t.map((x) => x.address!.length)).toEqual([10, 10, 10]);
  });

  it('skips ahead sooner while pools are fetched block by block', async () => {
    const rpc = new FakeRpc();
    rpc.head = 5000n;
    const p = new LogPoller(rpc, { ...OPTS, maxAddresses: 2, emitterlessRange: 1, maxLagBlocksNarrow: 100 });
    p.cursor = 4000n;
    p.mergeInterests([{ address: [pool(1), pool(2), pool(3), pool(4), pool(5)], topics: [TOPIC.v2Sync], wide: true }]);
    p.head = 5000n;
    const w = p.nextWindow()!;
    expect(p.status().skippedBlocks).toBeGreaterThan(0);
    expect(5000n - w.from).toBeLessThanOrEqual(100n);
  });
});

describe('request budget', () => {
  it('lets a burst through, then paces to the rate, and reports requests/sec', async () => {
    let now = 0;
    const slept: number[] = [];
    const b = new RequestBudget(
      5,
      () => now,
      async (ms) => {
        slept.push(ms);
        now += ms;
      },
    );
    for (let i = 0; i < 10; i++) await b.take();
    expect(slept).toHaveLength(0); // burst of 2 s worth
    await b.take();
    expect(slept.length).toBeGreaterThan(0);
    expect(now).toBeGreaterThanOrEqual(190);
    expect(b.rate()).toBeCloseTo(1.1, 5); // 11 requests in the last 10 s
  });
});

describe('tracked tokens', () => {
  it('evicts the least recently active beyond the cap, never pinned ones', () => {
    const pins = new Set<string>(['a']);
    const t = new TrackedTokens(3, () => pins);
    expect(t.add('a', 'v', 1)).toEqual([]);
    t.add('b', 'v', 2);
    t.add('c', 'v', 3);
    t.touch('b', 4);
    // d pushes out the least recently active unpinned token: c
    expect(t.add('d', 'v', 5)).toEqual(['c']);
    expect([...t.tokens()]).toEqual(['a', 'b', 'd']);
    pins.add('b');
    expect(t.add('e', 'v', 6)).toEqual(['d']);
    expect(t.evictions).toBe(2);
    // all pinned: the cap bends rather than dropping a pin
    pins.add('e');
    expect(t.add('f', 'v', 7)).toEqual([]);
    expect(t.size).toBe(4);
  });
});

describe('bounded caches', () => {
  it('LruMap evicts least recently used; BoundedSet drops oldest', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1).set('b', 2);
    m.get('a');
    m.set('c', 3);
    expect([...m.keys()]).toEqual(['a', 'c']);
    const s = new BoundedSet<number>(2);
    expect(s.add(1)).toBe(true);
    expect(s.add(1)).toBe(false);
    s.add(2);
    s.add(3);
    expect(s.has(1)).toBe(false);
  });
});

describe('block clock', () => {
  it('uses node timestamps when logs carry them, else fetches edges and interpolates', async () => {
    const rpc = new FakeRpc();
    const clock = new BlockClock(rpc, 2000);
    await clock.prepare([{ ...log(100, 0), blockTimestamp: 1_700_000_200 }]);
    expect(rpc.blockCalls).toHaveLength(0);
    expect(clock.timeOf(100n)).toBe(1_700_000_200_000);
    // many missing blocks: only the first and last are fetched
    await clock.prepare([log(110, 0), log(115, 0), log(120, 0), log(125, 0), log(130, 0)]);
    expect(rpc.blockCalls.at(-1)).toEqual([110n, 130n]);
    // halfway between blocks 110 (t + 220 s) and 130 (t + 260 s)
    expect(clock.timeOf(120n)).toBe((1_700_000_000 + 240) * 1000);
    // beyond the anchors: the chain's block time
    expect(clock.timeOf(131n)).toBe((1_700_000_000 + 260) * 1000 + 2000);
  });
});

describe('trader attribution', () => {
  it('uses tx.from, or the user operation that contains the swap in an ERC-4337 bundle', async () => {
    const rpc = new FakeRpc();
    const entryPoint = [...ENTRY_POINTS][1];
    const plain = hash(1);
    const bundle = hash(2);
    rpc.txs.set(plain, { from: '0xeoa', to: '0xrouter' });
    rpc.txs.set(bundle, { from: '0xbundler', to: entryPoint });
    const op = (index: number, sender: string): RawLog => ({
      ...log(5, index, entryPoint, TOPIC.userOperation),
      transactionHash: bundle,
      topics: [TOPIC.userOperation, hash(9), addressTopic(sender), addressTopic('0x0000000000000000000000000000000000000000')],
    });
    rpc.receipts.set(bundle, [op(10, '0x1111111111111111111111111111111111111111'), op(20, '0x2222222222222222222222222222222222222222')]);
    const s = new TxSenders(rpc);
    await s.prepare([plain, bundle]);
    expect(s.traderOf(plain, 3, '0xreported')).toBe('0xeoa');
    expect(s.traderOf(bundle, 4)).toBe('0x1111111111111111111111111111111111111111');
    expect(s.traderOf(bundle, 15)).toBe('0x2222222222222222222222222222222222222222');
    expect(s.traderOf(hash(3), 0, '0xAbC')).toBe('0xabc');
    expect(s.traderOf(hash(3), 0)).toBeNull();
  });
});

describe('holder book', () => {
  it("gives a wallet its balance after the whole transaction (a trade's own transfer may come after its event)", () => {
    const z = '0x0000000000000000000000000000000000000000';
    const b = new HolderBook();
    b.begin('0xt');
    const moves = [
      { token: '0xt', from: z, to: '0xcurve', value: 1000n, txHash: '0x1' }, // mint
      { token: '0xt', from: '0xcurve', to: '0xa', value: 100n, txHash: '0x2' }, // buy
      { token: '0xt', from: '0xa', to: '0xb', value: 40n, txHash: '0x3' }, // transfer out...
      { token: '0xt', from: '0xcurve', to: '0xa', value: 10n, txHash: '0x3' }, // ...and a buy in the same tx
      { token: '0xother', from: z, to: '0xa', value: 5n, txHash: '0x3' }, // not followed
    ];
    b.plan(moves);
    expect(b.balanceAfter('0x2', '0xt', '0xa')).toBe(100n);
    expect(b.balanceAfter('0x3', '0xt', '0xa')).toBe(70n);
    expect(b.balanceAfter('0x3', '0xt', '0xb')).toBe(40n);
    expect(b.balanceAfter('0x3', '0xother', '0xa')).toBeUndefined();
    for (const m of moves) b.apply(m);
    expect(b.balanceOf('0xt', '0xa')).toBe(70n);
    expect(b.balanceOf('0xt', '0xcurve')).toBe(890n);
    expect(b.balanceOf('0xt', '0xnobody')).toBe(0n);
    expect(b.balanceOf('0xother', '0xa')).toBeUndefined();
    b.drop('0xt');
    expect(b.has('0xt')).toBe(false);
  });

  it('past its capacity, the token whose transfers went quiet longest makes room', () => {
    const z = '0x0000000000000000000000000000000000000000';
    const b = new HolderBook();
    b.capacity = 2;
    b.begin('0xt1');
    b.begin('0xt2');
    b.apply({ token: '0xt1', from: z, to: '0xa', value: 1n, txHash: '0x1' }); // t1 active again
    b.begin('0xt3');
    expect([...b.tokens()].sort()).toEqual(['0xt1', '0xt3']);
    b.capacity = 1;
    b.trim();
    expect([...b.tokens()]).toEqual(['0xt3']);
    expect(b.dropped).toBe(2);
  });
});

describe('one ledger trade per transaction and wallet', () => {
  const base = { wallet: '0xw', at: 1000, txHash: '0x1', slot: 7 };
  it('sums same-side swaps and keeps the last post-trade state', () => {
    const m = mergeTrades(
      { ...base, side: 'buy', nativeAmount: 1, tokenAmount: 100, curve: { virtualNative: 2, virtualTokens: 900 } },
      { ...base, side: 'buy', nativeAmount: 2, tokenAmount: 150, at: 1001, curve: { virtualNative: 4, virtualTokens: 750 } },
    );
    expect(m).toMatchObject({ side: 'buy', nativeAmount: 3, tokenAmount: 250, at: 1000, curve: { virtualNative: 4, virtualTokens: 750 } });
  });

  it('nets a buy and a sell (round trips that net to nothing book nothing)', () => {
    const buy = { ...base, side: 'buy' as const, nativeAmount: 1, tokenAmount: 100 };
    expect(mergeTrades(buy, { ...base, side: 'sell', nativeAmount: 0.4, tokenAmount: 40 })).toMatchObject({ side: 'buy', tokenAmount: 60, nativeAmount: 0.6 });
    expect(mergeTrades(buy, { ...base, side: 'sell', nativeAmount: 1.5, tokenAmount: 150 })).toMatchObject({ side: 'sell', tokenAmount: 50, nativeAmount: 0.5 });
    expect(mergeTrades(buy, { ...base, side: 'sell', nativeAmount: 1.1, tokenAmount: 100 }).tokenAmount).toBe(0);
  });
});

describe('rpc errors and logs', () => {
  it('classifies range vs rate-limit errors from short messages, never the hex request body', () => {
    const viemLike = (details: string, code: number) =>
      Object.assign(new Error(`RPC Request failed.\n\nRequest body: {"params":[{"data":"0x0429deadbeef429"}]}`), { shortMessage: 'RPC Request failed.', details, code });
    expect(isRateLimit(viemLike('missing trie node', -32000))).toBe(false);
    expect(isRangeError(viemLike('missing trie node', -32000))).toBe(false);
    expect(isRateLimit(viemLike('method eth_getLogs in batch triggered rate limit', -32005))).toBe(true);
    expect(isRangeError(viemLike('method eth_getLogs in batch triggered rate limit', -32005))).toBe(false);
    expect(isRangeError(new Error('query returned more than 10000 results'))).toBe(true);
    expect(isRangeError(viemLike('exceed maximum block range: 50', -32000))).toBe(true);
    expect(isRateLimit({ status: 429 })).toBe(true);
    expect(errorText(viemLike('x', 1))).not.toContain('Request body');
    // filter-shape refusals (publicnode) are neither: splitting the range never helps
    const tooMany = viemLike('A maximum of 10 addresses is allowed. No limit on a dedicated node: https://www.allnodes.com/publicnode', -32602);
    expect(queryShapeLimit(tooMany)).toEqual({ kind: 'addresses', max: 10 });
    expect(isRangeError(tooMany)).toBe(false);
    const noEmitter = viemLike('Please specify an address in your request or, to remove restrictions, order a dedicated full node here: https://www.allnodes.com/bnb/host', -32701);
    expect(queryShapeLimit(noEmitter)).toEqual({ kind: 'emitterless' });
    expect(isRangeError(noEmitter)).toBe(false);
    expect(queryShapeLimit(viemLike('exceed maximum block range: 50', -32000))).toBeNull();
  });

  it('parses JSON-RPC logs (lowercase, bigint blocks, zero timestamps dropped)', () => {
    const l = parseRawLog({
      address: '0xABC',
      topics: ['0xDD'],
      data: '0x01',
      blockNumber: '0x10',
      blockHash: '0xbb',
      transactionHash: '0xAA',
      transactionIndex: '0x2',
      logIndex: '0x3',
      removed: false,
      blockTimestamp: '0x0',
    });
    expect(l).toEqual({ address: '0xabc', topics: ['0xdd'], data: '0x01', blockNumber: 16n, blockHash: '0xbb', transactionHash: '0xaa', transactionIndex: 2, logIndex: 3, removed: false });
  });
});

describe('feed settings', () => {
  it('reads caps, budgets, confirmations and gateways from the environment', () => {
    const chains = {
      robinhood: { chain: 'robinhood' as const, rpcUrls: ['https://x'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true },
      bsc: { chain: 'bsc' as const, rpcUrls: ['https://y'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: false },
    };
    const s = loadEvmFeedSettings(chains, { EVM_MAX_TRACKED_TOKENS: '800', BSC_CONFIRMATIONS: '3', ROBINHOOD_RPC_RPS: '2', EVM_IPFS_GATEWAYS: 'https://gw.example/ipfs,http://bad' } as NodeJS.ProcessEnv);
    expect(s.maxTrackedTokens).toBe(800);
    expect(s.chains.robinhood).toMatchObject({ rps: 2, confirmations: 0 });
    expect(s.chains.bsc).toMatchObject({ rps: 25, confirmations: 3 });
    expect(s.ipfsGateways).toEqual(['https://gw.example/ipfs/']);
    expect(loadEvmFeedSettings(chains, {} as NodeJS.ProcessEnv)).toMatchObject({ maxTrackedTokens: 1500, newPairs: true, pruneWorld: true });
  });

  it('knows the filter limits of publicnode endpoints (overridable)', () => {
    expect(endpointLogLimits(['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'])).toEqual({ maxAddresses: 10, emitterlessRange: 1 });
    expect(endpointLogLimits(['https://rpc.mainnet.chain.robinhood.com'])).toEqual({ maxAddresses: 500, emitterlessRange: null });
    const chains = { base: { chain: 'base' as const, rpcUrls: ['https://base-rpc.publicnode.com'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } };
    expect(loadEvmFeedSettings(chains, {} as NodeJS.ProcessEnv).chains.base).toMatchObject({ logMaxAddresses: 10, emitterlessRange: 1 });
    expect(loadEvmFeedSettings(chains, { BASE_LOG_MAX_ADDRESSES: '5' } as NodeJS.ProcessEnv).chains.base).toMatchObject({ logMaxAddresses: 5 });
  });
});

describe('SSRF guard', () => {
  it('only public addresses', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) {
      expect(isPublicAddress(a)).toBe(false);
    }
    for (const a of ['209.94.90.1', '1.1.1.1', '172.66.148.41', '2606:4700:4700::1111']) expect(isPublicAddress(a)).toBe(true);
  });

  it('only https URLs to named hosts or public literals', () => {
    expect(isAllowedUrl('https://ipfs.filebase.io/ipfs/bafy')).not.toBeNull();
    for (const u of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/', 'https://user:pw@example.com', 'https://example.com:8080/', 'file:///etc/passwd', 'https://intranet/x', 'https://db.internal/x']) {
      expect(isAllowedUrl(u)).toBeNull();
    }
  });

  it('refuses a host that resolves to a private address before connecting', async () => {
    const resolved: string[] = [];
    const body = await safeFetchText('https://metadata.example.com/doc.json', {
      timeoutMs: 2000,
      resolve: async (host) => {
        resolved.push(host);
        return [{ address: '10.0.0.7', family: 4 }];
      },
    });
    expect(body).toBeNull();
    expect(resolved).toEqual(['metadata.example.com']);
    // DNS rebinding: one public and one private answer is refused too
    expect(await safeFetchText('https://x.example.com/', { timeoutMs: 2000, resolve: async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }] })).toBeNull();
  });
});
