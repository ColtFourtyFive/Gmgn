// Uniswap-V2-style pairs (Uniswap V2, PancakeSwap V2 and its fork Flap
// graduates into on Robinhood Chain). A pair emits Sync (reserves after every
// change, just before Swap / Mint / Burn) and Swap (amounts in / out, sender =
// router), so every trade carries its exact post-trade reserves. Followed
// pairs: launchpad graduations and native pairs created by the factory that a
// launchpad did not claim and that start trading (new pairs).

import type { TokenState } from '../../../../sim/world';
import { decodeAbiParameters } from 'viem';
import { decodeCall, encodeCall, topicAddress, TOPIC, v2PairAbi } from '../abi';
import { LruMap } from '../lru';
import { toUnits } from '../math';
import type { Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import { applyV2Sync, newPool, worldReserves, type AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import { PairCandidates, preparePromotions, type CandidateRules } from './candidates';
import type { FeedContext, FeedEvent, PoolProbe, Venue } from './types';

interface CreatedEvent extends FeedEvent {
  kind: 'created';
  pool: AmmPool;
}
interface SyncEvent extends FeedEvent {
  kind: 'sync';
  pair: string;
  reserve0: bigint;
  reserve1: bigint;
}
interface SwapEvent extends FeedEvent {
  kind: 'swap';
  pair: string;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}
type V2Event = CreatedEvent | SyncEvent | SwapEvent;

export interface UniswapV2Options {
  factory: string;
  dexId: string;
  /** LP fee (ratio). */
  feeRate: number;
  /** Launchpad id for tokens first listed through a new pair; null = do not list new pairs. */
  newPairLaunchpad: string | null;
  candidates: CandidateRules;
}

export class UniswapV2Venue implements Venue {
  readonly id: string;
  private readonly factory: string;
  private readonly candidates: PairCandidates;
  private readonly claims: ((token: string) => boolean)[] = [];
  /** Native pairs created recently (state from their first Sync). */
  private readonly recent = new LruMap<string, AmmPool>(4000);
  private readonly promotions = new Map<string, Erc20Info>();
  private windowNew: string[] = [];
  private fetched = new Set<string>();

  constructor(readonly opts: UniswapV2Options) {
    this.id = opts.dexId;
    this.factory = opts.factory.toLowerCase();
    this.candidates = new PairCandidates(opts.candidates);
  }

  addClaim(claim: (token: string) => boolean): void {
    this.claims.push(claim);
  }

  get candidateCount(): number {
    return this.candidates.size;
  }

  private followedPairs(ctx: FeedContext): string[] {
    const out: string[] = [];
    for (const p of ctx.pools.values()) if (p.kind === 'v2' && p.dex === this.id) out.push(p.id);
    return out;
  }

  interests(ctx: FeedContext): LogInterest[] {
    const pairs = new Set([...this.followedPairs(ctx), ...this.candidates.ids()]);
    this.fetched = pairs;
    const out: LogInterest[] = [{ address: [this.factory], topics: [TOPIC.v2PairCreated] }];
    if (pairs.size) out.push({ address: [...pairs], topics: [[TOPIC.v2Sync, TOPIC.v2Swap]] });
    return out;
  }

  followUp(): LogInterest[] {
    const fresh = this.windowNew.filter((p) => !this.fetched.has(p));
    return fresh.length ? [{ address: fresh, topics: [[TOPIC.v2Sync, TOPIC.v2Swap]] }] : [];
  }

  decode(log: RawLog, ctx: FeedContext): V2Event | null {
    const t0 = log.topics[0];
    if (log.address === this.factory) {
      if (t0 !== TOPIC.v2PairCreated || log.topics.length !== 3) return null;
      const token0 = topicAddress(log.topics[1]);
      const token1 = topicAddress(log.topics[2]);
      const native0 = ctx.isNative(token0);
      if (native0 === ctx.isNative(token1)) return null;
      const [pair] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], log.data);
      const token = native0 ? token1 : token0;
      const pool = this.newPair(pair.toLowerCase(), token, !native0, native0 ? token0 : token1, 0);
      this.recent.set(pool.id, pool);
      this.windowNew.push(pool.id);
      return { venue: this, log, kind: 'created', pool, trade: !ctx.token(token) };
    }
    if (t0 !== TOPIC.v2Sync && t0 !== TOPIC.v2Swap) return null;
    const followed = ctx.pools.get(log.address);
    if (!(followed?.kind === 'v2' && followed.dex === this.id) && !this.candidates.has(log.address) && !this.recent.has(log.address)) return null;
    if (t0 === TOPIC.v2Sync) {
      const [reserve0, reserve1] = decodeAbiParameters([{ type: 'uint112' }, { type: 'uint112' }], log.data);
      return { venue: this, log, kind: 'sync', pair: log.address, reserve0, reserve1 };
    }
    const [amount0In, amount1In, amount0Out, amount1Out] = decodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], log.data);
    return { venue: this, log, kind: 'swap', pair: log.address, amount0In, amount1In, amount0Out, amount1Out, trade: !!followed };
  }

  private newPair(id: string, token: string, tokenIsCurrency0: boolean, quote: string, at: number): AmmPool {
    return newPool({ kind: 'v2', id, dex: this.id, token, quote, tokenIsCurrency0, tokenDecimals: 18, feeRate: this.opts.feeRate, hooks: null, createdAt: at });
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    if (!this.opts.newPairLaunchpad) return;
    const groups = new Map<string, { token: string; volume: bigint; swaps: number; window: { volume: bigint; event: { trade?: boolean } }[] }>();
    for (const e of events as V2Event[]) {
      if (e.kind === 'created' && !ctx.token(e.pool.token)) groups.set(e.pool.id, { token: e.pool.token, volume: 0n, swaps: 0, window: [] });
      if (e.kind !== 'swap' || ctx.pools.get(e.pair)) continue;
      const cand = this.candidates.get(e.pair);
      const pool = cand?.pool ?? this.recent.peek(e.pair);
      if (!pool) continue;
      let g = groups.get(e.pair);
      if (!g) groups.set(e.pair, (g = { token: pool.token, volume: cand?.volume ?? 0n, swaps: cand?.swaps ?? 0, window: [] }));
      g.window.push({ volume: nativeVolume(pool, e), event: e });
    }
    for (const [id, info] of await preparePromotions(groups, this.candidates.rules, ctx)) this.promotions.set(id, info);
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as V2Event;
    if (e.kind === 'created') {
      e.pool.createdAt = e.pool.lastSwapAt = ctx.timeOf(e.log);
      if (!this.opts.newPairLaunchpad || ctx.token(e.pool.token) || this.claims.some((c) => c(e.pool.token))) return;
      this.candidates.add({ pool: e.pool, creator: ctx.traderOf(e.log), volume: 0n, swaps: 0 });
      return;
    }
    const followed = ctx.pools.get(e.pair);
    const pool = (followed?.kind === 'v2' ? followed : undefined) ?? this.candidates.get(e.pair)?.pool ?? this.recent.peek(e.pair);
    if (!pool) return;
    if (e.kind === 'sync') {
      applyV2Sync(pool, e.reserve0, e.reserve1);
      return;
    }
    if (followed === pool) {
      const t = ctx.token(pool.token);
      if (t) this.bookTrade(t, pool, e, ctx);
      return;
    }
    const cand = this.candidates.get(e.pair);
    if (!cand) return;
    cand.swaps++;
    cand.volume += nativeVolume(pool, e);
    const info = this.promotions.get(e.pair);
    if (!info || !e.trade) return;
    this.promotions.delete(e.pair);
    this.candidates.delete(e.pair);
    pool.tokenDecimals = info.decimals;
    const t = ctx.launch({
      token: pool.token,
      launchpad: this.opts.newPairLaunchpad!,
      venue: this.id,
      creator: cand.creator ?? pool.token,
      createdAt: pool.createdAt,
      erc20: info,
      status: 'migrated',
      pool,
    });
    if (t) this.bookTrade(t, pool, e, ctx);
  }

  private bookTrade(t: TokenState, pool: AmmPool, e: SwapEvent, ctx: FeedContext): void {
    const at = ctx.timeOf(e.log);
    pool.lastSwapAt = at;
    const tokenIn = pool.tokenIsCurrency0 ? e.amount0In : e.amount1In;
    const tokenOut = pool.tokenIsCurrency0 ? e.amount0Out : e.amount1Out;
    const nativeIn = pool.tokenIsCurrency0 ? e.amount1In : e.amount0In;
    const nativeOut = pool.tokenIsCurrency0 ? e.amount1Out : e.amount0Out;
    let side: 'buy' | 'sell';
    let tokens: bigint;
    let native: bigint;
    if (tokenOut > tokenIn && nativeIn > nativeOut) {
      side = 'buy';
      tokens = tokenOut - tokenIn;
      native = nativeIn - nativeOut;
    } else if (tokenIn > tokenOut && nativeOut > nativeIn) {
      side = 'sell';
      tokens = tokenIn - tokenOut;
      native = nativeOut - nativeIn;
    } else return;
    const wallet = ctx.traderOf(e.log, topicAddress(e.log.topics[2]));
    const r = worldReserves(pool);
    if (!wallet || !r) return;
    ctx.trade(t, {
      wallet,
      side,
      nativeAmount: toUnits(native, 18),
      tokenAmount: toUnits(tokens, pool.tokenDecimals),
      at,
      txHash: e.log.transactionHash,
      slot: Number(e.log.blockNumber),
      pool: { native: r.native, tokens: r.tokens },
      priceNative: r.priceNative,
    });
  }

  /** A launchpad's graduation pair, seeded with the amounts the launchpad reports. */
  graduationPool(t: TokenState, pair: string, tokenAmount: bigint, nativeAmount: bigint, at: number, ctx: FeedContext): AmmPool {
    const id = pair.toLowerCase();
    const known = this.recent.peek(id) ?? this.candidates.get(id)?.pool;
    const native = ctx.info.wrappedNative.toLowerCase();
    const pool = known ?? this.newPair(id, t.address, t.address < native, native, at);
    this.candidates.delete(id);
    pool.tokenDecimals = t.decimals;
    pool.createdAt = pool.createdAt || at;
    pool.lpBurnedRate = 1;
    if (pool.reserveToken === 0n || pool.reserveNative === 0n) {
      pool.reserveToken = tokenAmount;
      pool.reserveNative = nativeAmount;
    }
    return pool;
  }

  /** Graduation into a pair (Flap's LaunchedToDEX): migrate the token onto it. */
  adoptGraduated(t: TokenState, pair: string, tokenAmount: bigint, nativeAmount: bigint, at: number, ctx: FeedContext): void {
    ctx.migrate(t, this.graduationPool(t, pair, tokenAmount, nativeAmount, at, ctx), at);
  }

  /** Read a pair's tokens and reserves. */
  async loadPair(pair: string, token: string, tokenDecimals: number, at: number, ctx: FeedContext): Promise<AmmPool | null> {
    const [t0, res] = await ctx.rpc.call([
      { target: pair, data: encodeCall(v2PairAbi, 'token0') },
      { target: pair, data: encodeCall(v2PairAbi, 'getReserves') },
    ]);
    const token0 = decodeCall<string>(v2PairAbi, 'token0', t0)?.toLowerCase();
    const reserves = decodeCall<readonly [bigint, bigint, number]>(v2PairAbi, 'getReserves', res);
    if (!token0 || !reserves) return null;
    const tokenIsCurrency0 = token0 === token;
    const native = ctx.info.wrappedNative.toLowerCase();
    const pool = this.newPair(pair.toLowerCase(), token, tokenIsCurrency0, native, at);
    pool.tokenDecimals = tokenDecimals;
    applyV2Sync(pool, reserves[0], reserves[1]);
    return pool;
  }

  /** ensureToken for a launchpad that knows the pair (Flap after graduation). */
  async detectPool(token: string, pair: string, launchpad: string, erc20: Erc20Info, at: number, ctx: FeedContext): Promise<boolean> {
    const pool = await this.loadPair(pair, token, erc20.decimals, at, ctx);
    if (!pool) return false;
    pool.lpBurnedRate = 1;
    return !!ctx.launch({ token, launchpad, venue: this.id, creator: token, createdAt: at, erc20, status: 'migrated', pool });
  }

  async probe(token: string, ctx: FeedContext): Promise<PoolProbe | null> {
    const native = ctx.info.wrappedNative.toLowerCase();
    const [raw] = await ctx.rpc.call([{ target: this.factory, data: encodeCall(v2PairAbi, 'getPair', [token, native]) }]);
    const pair = decodeCall<string>(v2PairAbi, 'getPair', raw)?.toLowerCase();
    if (!pair || /^0x0+$/.test(pair)) return null;
    const pool = await this.loadPair(pair, token, 18, ctx.now(), ctx);
    if (!pool) return null;
    return { depth: toUnits(pool.reserveNative, 18), pool, launchpad: this.opts.newPairLaunchpad ?? this.id, venue: this.id };
  }

  endWindow(): void {
    this.windowNew = [];
  }

  async housekeeping(ctx: FeedContext): Promise<void> {
    this.candidates.expire(ctx.now());
  }
}

function nativeVolume(pool: AmmPool, e: SwapEvent): bigint {
  return pool.tokenIsCurrency0 ? e.amount1In + e.amount1Out : e.amount0In + e.amount0Out;
}
