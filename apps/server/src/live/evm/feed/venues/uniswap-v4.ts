// Uniswap V4: every pool lives in the chain's PoolManager. The venue follows
// the pools of tracked tokens (Swap: price, tick, in-range liquidity and the
// trade; ModifyLiquidity: positions, hence the pool's principal), keeps
// recently initialized native-paired pools from their first block so a
// launchpad can adopt its launch / graduation pool with its full history, and
// lists unclaimed ones as new pairs once they trade. On quiet chains it reads
// the PoolManager's whole log stream; on busy ones Swap / ModifyLiquidity are
// filtered to the pools it follows (plus a same-window follow-up for pools
// created in the window).

import { getDex } from '@trenchscope/shared';
import { decodeAbiParameters, encodeFunctionData, type Hex } from 'viem';
import type { TokenState } from '../../../../sim/world';
import { TOPIC, v4PoolId, v4PoolManagerAbi, v4StateSlots, ZERO_ADDRESS, type PoolKey } from '../abi';
import { LruMap } from '../lru';
import { absBig, toUnits } from '../math';
import type { Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import { applyV4Modify, applyV4Swap, newPool, worldReserves, type AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import { PairCandidates, qualifiesAt, type CandidateRules } from './candidates';
import type { FeedContext, FeedEvent, PoolProbe, Venue } from './types';

export const DYNAMIC_FEE_FLAG = 0x800000;
/** Absurd static fees mark honeypot / spam pools: never listed as new pairs. */
const MAX_LISTED_FEE = 100_000;
/** Hookless (fee, tick spacing) pairs probed by ensureToken. */
const PROBE_TIERS: [number, number][] = [
  [500, 10],
  [3000, 60],
  [10_000, 200],
  [2500, 25],
];

/** A native-paired pool initialized recently: its key and live state since its first block. */
export interface V4Init {
  id: string;
  key: PoolKey;
  block: bigint;
  txHash: Hex;
  /** Pool state from Initialize on (token decimals fixed when adopted). */
  pool: AmmPool;
}

interface InitEvent extends FeedEvent {
  kind: 'init';
  init: V4Init;
  sqrtPriceX96: bigint;
  tick: number;
}
interface SwapEvent extends FeedEvent {
  kind: 'swap';
  id: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  fee: number;
}
interface ModifyEvent extends FeedEvent {
  kind: 'modify';
  id: string;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
}
type V4Event = InitEvent | SwapEvent | ModifyEvent;

export interface UniswapV4Options {
  poolManager: string;
  dexId: string;
  /** Launchpad id for tokens first listed through a new pool (LIVE_LAUNCHPADS); null = do not list new pairs. */
  newPairLaunchpad: string | null;
  /** Read the PoolManager's whole log stream (quiet chains) instead of filtering by pool. */
  unfiltered: boolean;
  candidates: CandidateRules;
}

/**
 * A launchpad's interest in freshly initialized pools: `expects` claims the
 * pool (never a generic new pair); `onSwap` may list the token at the pool's
 * first swap (launches whose own event comes before the pool is funded or
 * after its first buy), returning true when it did.
 */
export interface PoolClaimant {
  expects(init: V4Init): boolean;
  onSwap?(init: V4Init, ctx: FeedContext): boolean;
  /** Who made a swap on the pool when not the tx sender (e.g. a dev buy run by the launchpad's deployer). */
  traderOf?(init: V4Init, log: RawLog): string | null;
}

export class UniswapV4Venue implements Venue {
  readonly id: string;
  private readonly pm: string;
  private readonly recent = new LruMap<string, V4Init>(4000);
  private readonly recentByToken = new LruMap<string, string>(4000);
  private readonly candidates: PairCandidates;
  private readonly claimants: PoolClaimant[] = [];
  private readonly promotions = new Map<string, Erc20Info>();
  /** Recent pools claimed by a launchpad and not followed yet. */
  private readonly claimed = new Set<string>();
  /** Pools first seen this window (their Swap / ModifyLiquidity may need a follow-up fetch). */
  private windowInits: string[] = [];
  private filteredIds = new Set<string>();

  constructor(readonly opts: UniswapV4Options) {
    this.id = opts.dexId;
    this.pm = opts.poolManager.toLowerCase();
    this.candidates = new PairCandidates(opts.candidates);
  }

  get dexName(): string {
    return getDex(this.opts.dexId)?.name ?? 'Uniswap V4';
  }

  get candidateCount(): number {
    return this.candidates.size;
  }

  /** Launchpads register so their pools are not listed as generic new pairs. */
  addClaimant(c: PoolClaimant): void {
    this.claimants.push(c);
  }

  recentInit(id: string): V4Init | undefined {
    return this.recent.peek(id.toLowerCase());
  }

  /** The most recent native-paired pool initialized for a token. */
  recentInitForToken(token: string): V4Init | undefined {
    const id = this.recentByToken.peek(token.toLowerCase());
    return id ? this.recent.peek(id) : undefined;
  }

  interests(ctx: FeedContext): LogInterest[] {
    if (this.opts.unfiltered) return [{ address: [this.pm] }];
    const ids = new Set<string>(ctx.pools.ids('v4'));
    for (const id of this.candidates.ids()) ids.add(id);
    // Pools a launchpad claimed whose token is not listed yet (e.g. a crowd launch's pool before its first swap).
    for (const id of this.claimed) {
      if (ctx.pools.get(id) || !this.recent.has(id)) this.claimed.delete(id);
      else ids.add(id);
    }
    this.filteredIds = ids;
    const out: LogInterest[] = [{ address: [this.pm], topics: [TOPIC.v4Initialize] }];
    if (ids.size) out.push({ address: [this.pm], topics: [[TOPIC.v4Swap, TOPIC.v4ModifyLiquidity], [...ids] as Hex[]] });
    return out;
  }

  followUp(): LogInterest[] {
    if (this.opts.unfiltered) return [];
    const ids = this.windowInits.filter((id) => !this.filteredIds.has(id));
    return ids.length ? [{ address: [this.pm], topics: [[TOPIC.v4Swap, TOPIC.v4ModifyLiquidity], ids as Hex[]] }] : [];
  }

  decode(log: RawLog, ctx: FeedContext): V4Event | null {
    if (log.address !== this.pm) return null;
    const t0 = log.topics[0];
    if (t0 === TOPIC.v4Initialize && log.topics.length === 4) {
      const [fee, tickSpacing, hooks, sqrtPriceX96, tick] = decodeAbiParameters(
        [{ type: 'uint24' }, { type: 'int24' }, { type: 'address' }, { type: 'uint160' }, { type: 'int24' }],
        log.data,
      );
      const c0 = `0x${log.topics[2].slice(26)}`;
      const c1 = `0x${log.topics[3].slice(26)}`;
      const native0 = ctx.isNative(c0);
      if (native0 === ctx.isNative(c1)) return null;
      const id = log.topics[1];
      const key: PoolKey = { currency0: c0, currency1: c1, fee: Number(fee), tickSpacing: Number(tickSpacing), hooks: (hooks as string).toLowerCase() };
      const token = native0 ? c1 : c0;
      const pool = newPool({
        kind: 'v4',
        id,
        dex: this.opts.dexId,
        token,
        quote: native0 ? c0 : c1,
        tokenIsCurrency0: !native0,
        tokenDecimals: 18,
        feeRate: key.fee === DYNAMIC_FEE_FLAG ? 0 : key.fee / 1_000_000,
        hooks: key.hooks === ZERO_ADDRESS ? null : key.hooks,
        createdAt: 0,
      });
      pool.positions = new Map();
      const init: V4Init = { id, key, block: log.blockNumber, txHash: log.transactionHash, pool };
      this.recent.set(id, init);
      this.recentByToken.set(token, id);
      this.windowInits.push(id);
      // The creation tx's sender is the deployer of a would-be new pair.
      return { venue: this, log, kind: 'init', init, sqrtPriceX96: sqrtPriceX96 as bigint, tick: Number(tick), trade: !ctx.token(token) };
    }
    if ((t0 === TOPIC.v4Swap || t0 === TOPIC.v4ModifyLiquidity) && log.topics.length >= 2) {
      const id = log.topics[1];
      if (!ctx.pools.get(id) && !this.recent.has(id) && !this.candidates.has(id)) return null;
      if (t0 === TOPIC.v4Swap) {
        const [amount0, amount1, sqrtPriceX96, liquidity, tick, fee] = decodeAbiParameters(
          [{ type: 'int128' }, { type: 'int128' }, { type: 'uint160' }, { type: 'uint128' }, { type: 'int24' }, { type: 'uint24' }],
          log.data,
        );
        // Followed pools' swaps are trades; so are a launchpad's pool's before its token is listed (it may list at this swap).
        const init = ctx.pools.get(id) ? undefined : this.recent.peek(id);
        const trade = !!ctx.pools.get(id) || (!!init && this.claimants.some((c) => c.expects(init)));
        return { venue: this, log, kind: 'swap', id, amount0, amount1, sqrtPriceX96, liquidity, tick: Number(tick), fee: Number(fee), trade };
      }
      const [tickLower, tickUpper, liquidityDelta] = decodeAbiParameters([{ type: 'int24' }, { type: 'int24' }, { type: 'int256' }, { type: 'bytes32' }], log.data);
      return { venue: this, log, kind: 'modify', id, tickLower: Number(tickLower), tickUpper: Number(tickUpper), liquidityDelta };
    }
    return null;
  }

  /** New-pair candidates whose swaps this window qualify them: metadata now, booked from the qualifying swap on. */
  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    if (!this.opts.newPairLaunchpad) return;
    const swapsOf = new Map<string, SwapEvent[]>();
    for (const e of events as V4Event[]) {
      if (e.venue !== this) continue;
      if (e.kind === 'init' && !ctx.token(e.init.pool.token) && this.listable(e.init)) swapsOf.set(e.init.id, []);
      if (e.kind === 'swap' && !ctx.pools.get(e.id) && (this.candidates.has(e.id) || swapsOf.has(e.id))) {
        const list = swapsOf.get(e.id);
        if (list) list.push(e);
        else swapsOf.set(e.id, [e]);
      }
    }
    const promote: { id: string; token: string; from: number; swaps: SwapEvent[] }[] = [];
    for (const [id, swaps] of swapsOf) {
      if (swaps.length === 0) continue;
      const known = this.candidates.get(id);
      const pool = known?.pool ?? this.recent.peek(id)?.pool;
      if (!pool) continue;
      const volumes = swaps.map((s) => absBig(pool.tokenIsCurrency0 ? s.amount1 : s.amount0));
      const at = qualifiesAt(this.candidates.rules, known?.volume ?? 0n, known?.swaps ?? 0, volumes);
      if (at >= 0) promote.push({ id, token: pool.token, from: at, swaps });
    }
    if (promote.length === 0) return;
    const erc20 = await ctx.meta.erc20(promote.map((p) => p.token));
    await ctx.screen(
      promote.map((p) => p.token),
      erc20,
    );
    for (const p of promote) {
      const info = erc20.get(p.token);
      if (!info || ctx.isExcluded(p.token)) continue;
      this.promotions.set(p.id, info);
      for (let i = p.from; i < p.swaps.length; i++) p.swaps[i].trade = true;
    }
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as V4Event;
    if (e.kind === 'init') return this.applyInit(e, ctx);
    const pool = ctx.pools.get(e.id) ?? this.candidates.get(e.id)?.pool ?? this.recent.peek(e.id)?.pool;
    if (!pool) return;
    if (e.kind === 'modify') {
      applyV4Modify(pool, e.tickLower, e.tickUpper, e.liquidityDelta);
      return;
    }
    applyV4Swap(pool, e.sqrtPriceX96, e.liquidity, e.tick, e.fee);
    if (ctx.pools.get(e.id) === pool) {
      const t = ctx.token(pool.token);
      if (t) this.bookTrade(t, pool, e, ctx);
      return;
    }
    const cand = this.candidates.get(e.id);
    if (!cand) {
      // A launchpad's pool before its token is listed: the launchpad may list it now (this swap is its first trade).
      const init = this.recent.peek(e.id);
      if (!init) return;
      for (const c of this.claimants) {
        if (!c.expects(init) || !c.onSwap?.(init, ctx)) continue;
        const t = ctx.token(pool.token);
        if (t && ctx.pools.get(e.id) === pool) this.bookTrade(t, pool, e, ctx, c.traderOf?.(init, e.log) ?? undefined);
        return;
      }
      return;
    }
    cand.swaps++;
    cand.volume += absBig(pool.tokenIsCurrency0 ? e.amount1 : e.amount0);
    const info = this.promotions.get(e.id);
    if (!info || !e.trade) return;
    this.promotions.delete(e.id);
    this.candidates.delete(e.id);
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

  private applyInit(e: InitEvent, ctx: FeedContext): void {
    const { init } = e;
    init.pool.sqrtPriceX96 = e.sqrtPriceX96;
    init.pool.tick = e.tick;
    init.pool.createdAt = init.pool.lastSwapAt = ctx.timeOf(e.log);
    if (this.claimants.some((c) => c.expects(init))) {
      this.claimed.add(init.id);
      return;
    }
    if (!this.opts.newPairLaunchpad || ctx.token(init.pool.token) || !this.listable(init)) return;
    this.candidates.add({ pool: init.pool, creator: ctx.traderOf(e.log), volume: 0n, swaps: 0 });
  }

  private listable(init: V4Init): boolean {
    return init.key.fee === DYNAMIC_FEE_FLAG || init.key.fee <= MAX_LISTED_FEE;
  }

  /**
   * A launch / graduation pool by key: its Initialize record when seen (full
   * position history), else its state read from the PoolManager (in-range
   * liquidity only). The pool is not followed until the caller adopts it.
   */
  async loadPool(key: PoolKey, id: string, token: string, tokenDecimals: number, at: number, ctx: FeedContext): Promise<AmmPool | null> {
    const init = this.recent.peek(id.toLowerCase());
    if (init) {
      init.pool.tokenDecimals = tokenDecimals;
      return init.pool;
    }
    const slots = v4StateSlots(id as Hex);
    const [s0, liq] = await ctx.rpc.call([
      { target: this.pm, data: encodeFunctionData({ abi: v4PoolManagerAbi, functionName: 'extsload', args: [slots.slot0] }) },
      { target: this.pm, data: encodeFunctionData({ abi: v4PoolManagerAbi, functionName: 'extsload', args: [slots.liquidity] }) },
    ]);
    if (!s0) return null;
    const word = BigInt(s0);
    const sqrtPriceX96 = word & ((1n << 160n) - 1n);
    if (sqrtPriceX96 === 0n) return null;
    let tick = Number((word >> 160n) & 0xffffffn);
    if (tick >= 0x800000) tick -= 0x1000000;
    const native0 = ctx.isNative(key.currency0);
    const pool = newPool({
      kind: 'v4',
      id: id.toLowerCase(),
      dex: this.opts.dexId,
      token,
      quote: native0 ? key.currency0 : key.currency1,
      tokenIsCurrency0: !native0,
      tokenDecimals,
      feeRate: key.fee === DYNAMIC_FEE_FLAG ? 0 : key.fee / 1_000_000,
      hooks: key.hooks.toLowerCase() === ZERO_ADDRESS ? null : key.hooks.toLowerCase(),
      createdAt: at,
    });
    pool.sqrtPriceX96 = sqrtPriceX96;
    pool.tick = tick;
    pool.liquidity = liq ? BigInt(liq) & ((1n << 128n) - 1n) : 0n;
    return pool;
  }

  private bookTrade(t: TokenState, pool: AmmPool, e: SwapEvent, ctx: FeedContext, trader?: string): void {
    const at = ctx.timeOf(e.log);
    pool.lastSwapAt = at;
    // Amounts are the swapper's balance deltas: positive = received.
    const dToken = pool.tokenIsCurrency0 ? e.amount0 : e.amount1;
    const dNative = pool.tokenIsCurrency0 ? e.amount1 : e.amount0;
    if (dToken === 0n || dNative === 0n || dToken > 0n === dNative > 0n) {
      ctx.syncPool(t, pool);
      return;
    }
    const wallet = trader ?? ctx.traderOf(e.log);
    const r = worldReserves(pool);
    if (!wallet || !r) return;
    ctx.trade(t, {
      wallet,
      side: dToken > 0n ? 'buy' : 'sell',
      nativeAmount: toUnits(absBig(dNative), 18),
      tokenAmount: toUnits(absBig(dToken), pool.tokenDecimals),
      at,
      txHash: e.log.transactionHash,
      slot: Number(e.log.blockNumber),
      pool: { native: r.native, tokens: r.tokens },
      priceNative: r.priceNative,
    });
  }

  /**
   * ensureToken fallback: the token's deepest hookless pool against native ETH
   * or the wrapped native among the common fee tiers (Pools.trade's 0.25% / 25
   * included), read from the PoolManager.
   */
  async probe(token: string, ctx: FeedContext): Promise<PoolProbe | null> {
    const natives = [ZERO_ADDRESS, ctx.info.wrappedNative.toLowerCase()];
    const keys: PoolKey[] = [];
    for (const n of natives) {
      for (const [fee, tickSpacing] of PROBE_TIERS) {
        const [c0, c1] = token < n ? [token, n] : [n, token];
        keys.push({ currency0: c0, currency1: c1, fee, tickSpacing, hooks: ZERO_ADDRESS });
      }
    }
    let best: PoolProbe | null = null;
    for (const key of keys) {
      const pool = await this.loadPool(key, v4PoolId(key), token, 18, ctx.now(), ctx);
      const r = pool && worldReserves(pool);
      if (pool && r && (!best || r.native > best.depth)) best = { depth: r.native, pool, launchpad: this.opts.newPairLaunchpad ?? this.id, venue: this.id };
    }
    return best;
  }

  endWindow(): void {
    this.windowInits = [];
  }

  untrack(token: string): void {
    this.recentByToken.delete(token);
  }

  async housekeeping(ctx: FeedContext): Promise<void> {
    this.candidates.expire(ctx.now());
  }
}
