// Uniswap-V3-style pools (Uniswap V3, PancakeSwap V3). Swap carries the pool's
// balance deltas and the post-swap sqrtPrice / liquidity / tick (PancakeSwap's
// variant adds the protocol fees). A pool's token balances are read when it is
// adopted and on housekeeping, and moved by swap deltas in between, so the
// World sees its real value; between reads, mints and burns only show up at
// the next resync.

import type { TokenState } from '../../../../sim/world';
import { decodeAbiParameters, parseAbi } from 'viem';
import { decodeCall, encodeCall, erc20Abi, topicAddress, TOPIC, v3PoolAbi } from '../abi';
import { LruMap } from '../lru';
import { absBig, toUnits } from '../math';
import type { Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import { applyV3Swap, newPool, worldReserves, type AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import { PairCandidates, preparePromotions, type CandidateRules } from './candidates';
import type { FeedContext, FeedEvent, PoolProbe, Venue } from './types';

const slot0Abi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick)']);
/** Pools whose balances are re-read per housekeeping pass. */
const RESYNC_BATCH = 100;

interface CreatedEvent extends FeedEvent {
  kind: 'created';
  pool: AmmPool;
}
interface SwapEvent extends FeedEvent {
  kind: 'swap';
  address: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
}
type V3Event = CreatedEvent | SwapEvent;

export interface UniswapV3Options {
  factory: string;
  dexId: string;
  /** PancakeSwap V3 emits a longer Swap (with protocol fees). */
  pancake: boolean;
  /** Fee tiers probed by ensureToken (hundredths of a bip). */
  feeTiers: number[];
  newPairLaunchpad: string | null;
  candidates: CandidateRules;
}

export class UniswapV3Venue implements Venue {
  readonly id: string;
  private readonly factory: string;
  private readonly swapTopic: string;
  private readonly candidates: PairCandidates;
  private readonly claims: ((token: string) => boolean)[] = [];
  private readonly recent = new LruMap<string, AmmPool>(4000);
  private readonly promotions = new Map<string, Erc20Info>();
  private windowNew: string[] = [];
  private fetched = new Set<string>();
  private resyncCursor = 0;

  constructor(readonly opts: UniswapV3Options) {
    this.id = opts.dexId;
    this.factory = opts.factory.toLowerCase();
    this.swapTopic = opts.pancake ? TOPIC.pancakeV3Swap : TOPIC.v3Swap;
    this.candidates = new PairCandidates(opts.candidates);
  }

  addClaim(claim: (token: string) => boolean): void {
    this.claims.push(claim);
  }

  get candidateCount(): number {
    return this.candidates.size;
  }

  private followedPools(ctx: FeedContext): AmmPool[] {
    const out: AmmPool[] = [];
    for (const p of ctx.pools.values()) if (p.kind === 'v3' && p.dex === this.id) out.push(p);
    return out;
  }

  interests(ctx: FeedContext): LogInterest[] {
    const pools = new Set([...this.followedPools(ctx).map((p) => p.id), ...this.candidates.ids()]);
    this.fetched = pools;
    const out: LogInterest[] = [{ address: [this.factory], topics: [TOPIC.v3PoolCreated] }];
    if (pools.size) out.push({ address: [...pools], topics: [this.swapTopic as `0x${string}`], wide: true });
    return out;
  }

  followUp(): LogInterest[] {
    const fresh = this.windowNew.filter((p) => !this.fetched.has(p));
    return fresh.length ? [{ address: fresh, topics: [this.swapTopic as `0x${string}`], wide: true }] : [];
  }

  decode(log: RawLog, ctx: FeedContext): V3Event | null {
    const t0 = log.topics[0];
    if (log.address === this.factory) {
      if (t0 !== TOPIC.v3PoolCreated || log.topics.length !== 4) return null;
      const token0 = topicAddress(log.topics[1]);
      const token1 = topicAddress(log.topics[2]);
      const native0 = ctx.isNative(token0);
      if (native0 === ctx.isNative(token1)) return null;
      const fee = Number(BigInt(log.topics[3]));
      const [, address] = decodeAbiParameters([{ type: 'int24' }, { type: 'address' }], log.data);
      const token = native0 ? token1 : token0;
      const pool = this.newV3(address.toLowerCase(), token, !native0, native0 ? token0 : token1, fee, 0);
      this.recent.set(pool.id, pool);
      this.windowNew.push(pool.id);
      return { venue: this, log, kind: 'created', pool, trade: !ctx.token(token) };
    }
    if (t0 !== this.swapTopic) return null;
    const followed = ctx.pools.get(log.address);
    if (!(followed?.kind === 'v3' && followed.dex === this.id) && !this.candidates.has(log.address) && !this.recent.has(log.address)) return null;
    const [amount0, amount1, sqrtPriceX96, liquidity, tick] = decodeAbiParameters(
      [{ type: 'int256' }, { type: 'int256' }, { type: 'uint160' }, { type: 'uint128' }, { type: 'int24' }],
      log.data,
    );
    return { venue: this, log, kind: 'swap', address: log.address, amount0, amount1, sqrtPriceX96, liquidity, tick: Number(tick), trade: !!followed };
  }

  private newV3(id: string, token: string, tokenIsCurrency0: boolean, quote: string, fee: number, at: number): AmmPool {
    return newPool({ kind: 'v3', id, dex: this.id, token, quote, tokenIsCurrency0, tokenDecimals: 18, feeRate: fee / 1_000_000, hooks: null, createdAt: at });
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    if (!this.opts.newPairLaunchpad) return;
    const groups = new Map<string, { token: string; volume: bigint; swaps: number; window: { volume: bigint; event: { trade?: boolean } }[] }>();
    for (const e of events as V3Event[]) {
      if (e.kind === 'created' && !ctx.token(e.pool.token)) groups.set(e.pool.id, { token: e.pool.token, volume: 0n, swaps: 0, window: [] });
      if (e.kind !== 'swap' || ctx.pools.get(e.address)) continue;
      const cand = this.candidates.get(e.address);
      const pool = cand?.pool ?? this.recent.peek(e.address);
      if (!pool) continue;
      let g = groups.get(e.address);
      if (!g) groups.set(e.address, (g = { token: pool.token, volume: cand?.volume ?? 0n, swaps: cand?.swaps ?? 0, window: [] }));
      g.window.push({ volume: absBig(pool.tokenIsCurrency0 ? e.amount1 : e.amount0), event: e });
    }
    const promoted = await preparePromotions(groups, this.candidates.rules, ctx);
    if (promoted.size === 0) return;
    // Balances of the pools listed this window, read at the window's end and walked back over its swaps
    // (apply moves them forward again, swap by swap).
    for (const [id, info] of promoted) this.promotions.set(id, info);
    const pools = [...promoted.keys()].map((id) => this.candidates.get(id)?.pool ?? this.recent.peek(id)).filter((p): p is AmmPool => !!p);
    await this.readBalances(pools, ctx, ctx.windowTo);
    for (const p of pools) {
      if (!p.balancesKnown) continue;
      for (const e of events as V3Event[]) {
        if (e.kind !== 'swap' || e.address !== p.id) continue;
        p.reserveToken -= p.tokenIsCurrency0 ? e.amount0 : e.amount1;
        p.reserveNative -= p.tokenIsCurrency0 ? e.amount1 : e.amount0;
      }
    }
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as V3Event;
    if (e.kind === 'created') {
      e.pool.createdAt = e.pool.lastSwapAt = ctx.timeOf(e.log);
      if (!this.opts.newPairLaunchpad || ctx.token(e.pool.token) || this.claims.some((c) => c(e.pool.token))) return;
      this.candidates.add({ pool: e.pool, creator: ctx.traderOf(e.log), volume: 0n, swaps: 0 });
      return;
    }
    const followed = ctx.pools.get(e.address);
    const pool = (followed?.kind === 'v3' ? followed : undefined) ?? this.candidates.get(e.address)?.pool ?? this.recent.peek(e.address);
    if (!pool) return;
    applyV3Swap(pool, e.amount0, e.amount1, e.sqrtPriceX96, e.liquidity, e.tick);
    if (followed === pool) {
      const t = ctx.token(pool.token);
      if (t) this.bookTrade(t, pool, e, ctx);
      return;
    }
    const cand = this.candidates.get(e.address);
    if (!cand) return;
    cand.swaps++;
    cand.volume += absBig(pool.tokenIsCurrency0 ? e.amount1 : e.amount0);
    const info = this.promotions.get(e.address);
    if (!info || !e.trade) return;
    this.promotions.delete(e.address);
    this.candidates.delete(e.address);
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
    // Pool balance deltas: the pool paid out tokens on a buy.
    const dToken = pool.tokenIsCurrency0 ? e.amount0 : e.amount1;
    const dNative = pool.tokenIsCurrency0 ? e.amount1 : e.amount0;
    if (dToken === 0n || dNative === 0n || dToken > 0n === dNative > 0n) return;
    // Swap's recipient receives the bought tokens.
    const wallet = ctx.traderOf(e.log, topicAddress(e.log.topics[2]), dToken < 0n ? t.address : undefined);
    const r = worldReserves(pool);
    if (!wallet || !r) return;
    ctx.trade(t, {
      wallet,
      side: dToken < 0n ? 'buy' : 'sell',
      nativeAmount: toUnits(absBig(dNative), 18),
      tokenAmount: toUnits(absBig(dToken), pool.tokenDecimals),
      at,
      txHash: e.log.transactionHash,
      slot: Number(e.log.blockNumber),
      pool: { native: r.native, tokens: r.tokens },
      priceNative: r.priceNative,
    });
  }

  /** Read a pool's tokens, fee, price, liquidity and balances. */
  async loadPool(address: string, token: string, tokenDecimals: number, at: number, ctx: FeedContext): Promise<AmmPool | null> {
    const id = address.toLowerCase();
    const [t0, fee, s0, liq] = await ctx.rpc.call([
      { target: id, data: encodeCall(v3PoolAbi, 'token0') },
      { target: id, data: encodeCall(v3PoolAbi, 'fee') },
      { target: id, data: encodeCall(slot0Abi, 'slot0') },
      { target: id, data: encodeCall(v3PoolAbi, 'liquidity') },
    ]);
    const token0 = decodeCall<string>(v3PoolAbi, 'token0', t0)?.toLowerCase();
    const slot0 = s0 ? (decodeAbiParameters([{ type: 'uint160' }, { type: 'int24' }], s0) as readonly [bigint, number]) : null;
    if (!token0 || !slot0) return null;
    const native = ctx.info.wrappedNative.toLowerCase();
    const pool = this.newV3(id, token, token0 === token, native, Number(decodeCall<number>(v3PoolAbi, 'fee', fee) ?? 0), at);
    pool.tokenDecimals = tokenDecimals;
    pool.sqrtPriceX96 = slot0[0];
    pool.tick = Number(slot0[1]);
    pool.liquidity = decodeCall<bigint>(v3PoolAbi, 'liquidity', liq) ?? 0n;
    await this.readBalances([pool], ctx);
    return pool;
  }

  /** Balances of the pools' two tokens (sets balancesKnown). */
  private async readBalances(pools: AmmPool[], ctx: FeedContext, block?: bigint): Promise<void> {
    if (pools.length === 0) return;
    const res = await ctx.rpc.call(
      pools.flatMap((p) => [
        { target: p.token, data: encodeCall(erc20Abi, 'balanceOf', [p.id]) },
        { target: p.quote, data: encodeCall(erc20Abi, 'balanceOf', [p.id]) },
      ]),
      block,
    );
    pools.forEach((p, i) => {
      const tb = decodeCall<bigint>(erc20Abi, 'balanceOf', res[i * 2]);
      const nb = decodeCall<bigint>(erc20Abi, 'balanceOf', res[i * 2 + 1]);
      if (tb === null || nb === null) return;
      p.reserveToken = tb;
      p.reserveNative = nb;
      p.balancesKnown = true;
    });
  }

  async detectPool(token: string, address: string, launchpad: string, erc20: Erc20Info, at: number, ctx: FeedContext): Promise<boolean> {
    const pool = await this.loadPool(address, token, erc20.decimals, at, ctx);
    if (!pool) return false;
    pool.lpBurnedRate = 1;
    return !!ctx.launch({ token, launchpad, venue: this.id, creator: token, createdAt: at, erc20, status: 'migrated', pool });
  }

  async probe(token: string, ctx: FeedContext): Promise<PoolProbe | null> {
    const native = ctx.info.wrappedNative.toLowerCase();
    const res = await ctx.rpc.call(this.opts.feeTiers.map((fee) => ({ target: this.factory, data: encodeCall(v3PoolAbi, 'getPool', [token, native, fee]) })));
    let best: PoolProbe | null = null;
    for (const raw of res) {
      const address = decodeCall<string>(v3PoolAbi, 'getPool', raw)?.toLowerCase();
      if (!address || /^0x0+$/.test(address)) continue;
      const pool = await this.loadPool(address, token, 18, ctx.now(), ctx);
      if (!pool) continue;
      const depth = toUnits(pool.reserveNative, 18);
      if (!best || depth > best.depth) best = { depth, pool, launchpad: this.opts.newPairLaunchpad ?? this.id, venue: this.id };
    }
    return best;
  }

  endWindow(): void {
    this.windowNew = [];
  }

  /** Expire candidates; re-read balances of followed pools a batch at a time (mints / burns / donations). */
  async housekeeping(ctx: FeedContext): Promise<void> {
    this.candidates.expire(ctx.now());
    const pools = this.followedPools(ctx);
    if (pools.length === 0) return;
    if (this.resyncCursor >= pools.length) this.resyncCursor = 0;
    const batch = pools.slice(this.resyncCursor, this.resyncCursor + RESYNC_BATCH);
    this.resyncCursor += batch.length;
    await this.readBalances(batch, ctx);
  }
}
