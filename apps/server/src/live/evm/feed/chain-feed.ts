// One chain's live feed: follows the head with the log poller, runs every
// window through the venues (fetch -> decode in chain order -> follow-up fetch
// for things first seen in the window -> batched lookups -> apply in chain
// order) and writes launches, trades, curve completions and migrations into
// the World. It owns the tracked-token set (capped, least recently active out,
// pins kept), the shared pool book, block clock, tx senders and metadata, and
// keeps the ledger's per-chain token count bounded.

import type { Socials } from '@trenchscope/shared';
import { getDex } from '@trenchscope/shared';
import type { PublicClient } from 'viem';
import type { ExternalTrade, TokenState, World } from '../../../sim/world';
import { EIP1967_BEACON_SLOT, EVM_CHAINS, ROBINHOOD_STOCK_TOKEN_BEACON, type EvmChainId, type EvmChainInfo } from '../chains';
import { ZERO_ADDRESS } from './abi';
import { BlockClock } from './clock';
import { LruMap } from './lru';
import { toUnits } from './math';
import { cleanText, METADATA_LIMITS, TokenMetadata, type Erc20Info } from './metadata';
import { classifyNarrative } from './narrative';
import { LogPoller, type LogInterest, type PollWindow } from './poller';
import { PoolBook, worldReserves, type AmmPool } from './pools';
import { errorText, type EvmRpc, type RawLog, type RequestBudget } from './rpc';
import { HolderBook } from './holders';
import { TxSenders } from './senders';
import { TrackedTokens } from './tracked';
import { TransfersVenue } from './venues/transfers';
import type { FeedContext, FeedEvent, LaunchInput, PoolProbe, Venue } from './venues/types';

export interface ChainFeedOptions {
  chain: EvmChainId;
  world: World;
  rpc: EvmRpc;
  venues: Venue[];
  /** Request budget behind `rpc` (for the requests/sec readout). */
  budget?: RequestBudget;
  maxTrackedTokens: number;
  pollMs: number;
  confirmations: number;
  rescan: number;
  backfill: number;
  /** Emitters per eth_getLogs the endpoint accepts (default 500; learned lower from refusals). */
  logMaxAddresses?: number;
  /** Block span of an emitter-less eth_getLogs (default the chain's log range). */
  emitterlessRange?: number | null;
  ipfsGateways: string[];
  pruneWorld: boolean;
  /** Ledger tokens kept for this chain (default: max(500, 2 x maxTrackedTokens)). */
  worldTokenCap?: number;
  /** Subscription client: new heads wake the poller (null = interval polling). */
  ws?: PublicClient | null;
  /** Wall clock (ms); defaults to the World clock. */
  now?: () => number;
  /** Fetch an off-chain metadata document (tests replace it). */
  fetchJson?: (url: string) => Promise<unknown | null>;
  /** Wallets that must survive ledger pruning (followed by accounts, automation leaders). */
  keepWallet?: (address: string) => boolean;
}

export interface VenueCounters {
  launches: number;
  trades: number;
  migrations: number;
  skipped: number;
}

export interface FeedError {
  at: number;
  venue: string;
  message: string;
}

export interface EvmChainFeedStatus {
  chain: EvmChainId;
  running: boolean;
  /** Head polled recently without repeated failures. */
  connected: boolean;
  headBlock: number | null;
  processedBlock: number | null;
  lagBlocks: number;
  lastEventAt: number | null;
  lastPollAt: number | null;
  trackedTokens: number;
  worldTokens: number;
  pools: number;
  requestsPerSec: number;
  /** Blocks skipped to catch up with the head (and when it last happened). */
  skippedBlocks: number;
  lastSkipAt: number | null;
  windows: number;
  rangeSplits: number;
  evictions: number;
  metadataPending: number;
  /** Tokens whose holder balances are followed from Transfer logs. */
  holderTokens: number;
  /** Emitters per eth_getLogs in use, and whether AMM pools are fetched emitter-less (over that limit). */
  logMaxAddresses: number;
  widePoolQueries: boolean;
  venues: Record<string, VenueCounters>;
  recentErrors: FeedError[];
}

/** Windows processed per poll before yielding (keeps catch-up from starving the event loop). */
const MAX_WINDOWS_PER_TICK = 8;
const HOUSEKEEPING_MS = 30_000;
const MAX_ERRORS = 20;
/** Ledger tokens kept per chain = this many x the tracked cap. */
const WORLD_TOKENS_FACTOR = 2;
/** External wallets idle this long with nothing live are dropped from the ledger. */
const WALLET_IDLE_MS = 6 * 3600_000;
/** Tokens whose holders are followed from Transfer logs (unrestricted endpoints). */
const HOLDER_TOKENS_MAX = 3_000;

export class ChainFeed implements FeedContext {
  readonly chain: EvmChainId;
  readonly info: EvmChainInfo;
  readonly world: World;
  readonly rpc: EvmRpc;
  readonly pools = new PoolBook();
  readonly meta: TokenMetadata;
  readonly tracked: TrackedTokens;
  readonly poller: LogPoller;
  readonly clock: BlockClock;
  readonly senders: TxSenders;
  /** Exact balances of tokens followed since launch (Transfer logs). */
  readonly holders = new HolderBook();
  windowTo = 0n;
  private readonly venues: Venue[];
  private readonly counters = new Map<string, VenueCounters>();
  private readonly errors: FeedError[] = [];
  private readonly excluded = new LruMap<string, boolean>(10_000);
  /** Per token: the trade being merged (same transaction and wallet), booked when the next one differs. */
  private readonly openTrades = new Map<string, { t: TokenState; trade: ExternalTrade }>();
  private running = false;
  private loopDone: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private unwatch: (() => void) | null = null;
  private lastEventAt: number | null = null;
  /** Latest head from the WebSocket subscription. */
  private wsHead: { block: bigint; at: number } | null = null;
  private lastPollAt: number | null = null;
  private failures = 0;
  private lastHousekeeping = 0;
  private readonly wrappedNative: string;
  private readonly clockNow: () => number;

  constructor(readonly opts: ChainFeedOptions) {
    this.chain = opts.chain;
    this.info = EVM_CHAINS[opts.chain];
    this.world = opts.world;
    this.rpc = opts.rpc;
    // Transfers come last: they never take another venue's logs.
    this.venues = [...opts.venues, new TransfersVenue(this.holders, () => opts.venues)];
    this.wrappedNative = this.info.wrappedNative.toLowerCase();
    this.clockNow = opts.now ?? (() => this.world.now);
    this.meta = new TokenMetadata(opts.rpc, opts.ipfsGateways, opts.fetchJson);
    this.tracked = new TrackedTokens(opts.maxTrackedTokens, () => this.world.pinnedTokens());
    this.clock = new BlockClock(opts.rpc, this.info.blockTimeMs);
    this.senders = new TxSenders(opts.rpc);
    this.poller = new LogPoller(opts.rpc, {
      maxRange: this.info.maxLogBlockRange,
      confirmations: opts.confirmations,
      rescan: opts.rescan,
      // Catch-up worth ~3 minutes of chain time (at least 20 windows), then skip ahead.
      maxLagBlocks: Math.max(this.info.maxLogBlockRange * 20, Math.round(180_000 / this.info.blockTimeMs)),
      // Block-by-block pool queries (address-limited endpoint): ~1 minute, then skip ahead.
      maxLagBlocksNarrow: Math.max(20, Math.round(60_000 / this.info.blockTimeMs)),
      backfill: opts.backfill,
      dedupeCap: 50_000,
      maxAddresses: opts.logMaxAddresses ?? 500,
      maxTopicValues: 500,
      ...(opts.emitterlessRange ? { emitterlessRange: opts.emitterlessRange } : {}),
    });
    this.holders.capacity = this.holderCapacity();
    for (const v of opts.venues) this.counters.set(v.id, { launches: 0, trades: 0, migrations: 0, skipped: 0 });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.opts.ws) {
      try {
        this.unwatch = this.opts.ws.watchBlockNumber({
          onBlockNumber: (n) => {
            // The subscription's head saves the poll's eth_blockNumber; it also wakes the loop early.
            this.wsHead = { block: n, at: Date.now() };
            this.wake?.();
          },
          onError: (err) => this.error('ws', err),
          emitOnBegin: false,
        });
      } catch (err) {
        this.error('ws', err);
      }
    }
    this.loopDone = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.unwatch?.();
    this.unwatch = null;
    this.wake?.();
    await this.loopDone;
    this.loopDone = null;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const started = Date.now();
      try {
        await this.pollOnce();
        this.failures = 0;
      } catch (err) {
        this.failures++;
        this.error('poller', err);
      }
      if (this.clockNow() - this.lastHousekeeping >= HOUSEKEEPING_MS) await this.housekeeping().catch((err) => this.error('housekeeping', err));
      if (!this.running) break;
      // Back off on repeated failures (rate limits, outages).
      const wait = this.failures > 0 ? Math.min(30_000, this.opts.pollMs * 2 ** Math.min(this.failures, 5)) : this.opts.pollMs;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = null;
      // New-head wake-ups poll at most twice per poll interval (fast chains would burn the budget).
      const minGap = this.failures > 0 ? 0 : this.opts.pollMs / 2 - (Date.now() - started);
      if (minGap > 0 && this.running) await new Promise((r) => setTimeout(r, minGap));
    }
  }

  /** Poll the head (or take the subscription's) and process up to MAX_WINDOWS_PER_TICK windows. */
  async pollOnce(): Promise<number> {
    const ws = this.wsHead;
    let w: PollWindow | null;
    if (ws && Date.now() - ws.at < 3000 && (this.poller.head === null || ws.block > this.poller.head)) {
      this.poller.head = ws.block;
      w = this.poller.nextWindow();
    } else w = await this.poller.plan();
    this.lastPollAt = this.clockNow();
    let n = 0;
    while (w && n < MAX_WINDOWS_PER_TICK) {
      await this.processWindow(w);
      n++;
      if (!this.running && this.loopDone) break;
      w = this.poller.nextWindow();
    }
    return n;
  }

  // ---------------------------------------------------------------------------
  // The window pipeline
  // ---------------------------------------------------------------------------

  async processWindow(w: PollWindow): Promise<void> {
    this.windowTo = w.to;
    this.holders.capacity = this.holderCapacity();
    this.holders.trim();
    const interests: LogInterest[] = [];
    for (const v of this.venues) interests.push(...v.interests(this));
    const logs = await this.poller.fetch(interests, w.from, w.to);
    const events = this.decodeAll(logs);

    const extra: LogInterest[] = [];
    for (const v of this.venues) extra.push(...(v.followUp?.(this) ?? []));
    let all = logs;
    if (extra.length) {
      const seen = new Set(logs.map((l) => `${l.transactionHash}:${l.logIndex}`));
      const more = (await this.poller.fetch(extra, w.from, w.to)).filter((l) => !seen.has(`${l.transactionHash}:${l.logIndex}`));
      if (more.length) {
        all = this.poller.fresh([...logs, ...more]);
        events.push(...this.decodeAll(more));
        events.sort((a, b) => (a.log.blockNumber !== b.log.blockNumber ? (a.log.blockNumber < b.log.blockNumber ? -1 : 1) : a.log.logIndex - b.log.logIndex));
      }
    }

    for (const v of this.venues) {
      if (!v.prepare) continue;
      const mine = events.filter((e) => e.venue === v);
      if (mine.length) await v.prepare(mine, this);
    }
    await this.clock.prepare(events.map((e) => e.log));
    await this.senders.prepare(events.filter((e) => e.trade).map((e) => e.log.transactionHash));

    for (const e of events) {
      try {
        e.venue.apply(e, this);
      } catch (err) {
        this.error(e.venue.id, err);
      }
    }
    this.flushTrades();
    for (const v of this.venues) v.endWindow?.(this);
    this.poller.markDelivered(all);
    this.poller.commit(w);
  }

  /**
   * Tokens whose Transfer logs are followed: their emitter list cannot go out
   * emitter-less, so an address-limited endpoint (publicnode: 10 per query)
   * follows only the most active couple of chunks' worth.
   */
  private holderCapacity(): number {
    const per = this.poller.opts.maxAddresses;
    return per >= 100 ? HOLDER_TOKENS_MAX : per * 2;
  }

  private decodeAll(logs: RawLog[]): FeedEvent[] {
    const out: FeedEvent[] = [];
    for (const l of logs) {
      for (const v of this.venues) {
        let e: FeedEvent | null = null;
        try {
          e = v.decode(l, this);
        } catch (err) {
          this.error(v.id, err);
        }
        if (e) {
          out.push(e);
          break;
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // FeedContext
  // ---------------------------------------------------------------------------

  now(): number {
    return this.clockNow();
  }

  get appliedThrough(): bigint {
    return this.poller.cursor ?? 0n;
  }

  isNative(address: string): boolean {
    const a = address.toLowerCase();
    return a === this.wrappedNative || a === ZERO_ADDRESS;
  }

  timeOf(log: RawLog): number {
    if (log.blockTimestamp) return log.blockTimestamp * 1000;
    return this.clock.timeOf(log.blockNumber) ?? this.clockNow();
  }

  traderOf(log: RawLog, reported?: string, receives?: string): string | null {
    const sender = this.senders.traderOf(log.transactionHash, log.logIndex, reported);
    // A buy for another wallet (bundled launch buys, "buy for" routers): the recipient that ends
    // the transaction holding the token is the trader. Known for tokens followed since launch.
    if (receives && reported && sender && reported !== sender && reported !== ZERO_ADDRESS) {
      const b = this.holders.balanceAfter(log.transactionHash, receives.toLowerCase(), reported);
      if (b !== undefined && b > 0n) return reported;
    }
    return sender;
  }

  token(address: string): TokenState | undefined {
    const t = this.world.tokens.get(address.toLowerCase());
    return t && t.chain === this.chain ? t : undefined;
  }

  isExcluded(token: string): boolean {
    return this.excluded.peek(token.toLowerCase()) === true;
  }

  /** Robinhood Chain stock tokens are excluded by name suffix or by their beacon. */
  async screen(tokens: string[], erc20: Map<string, Erc20Info>): Promise<void> {
    const todo = [...new Set(tokens.map((t) => t.toLowerCase()))].filter((t) => !this.excluded.has(t));
    if (this.chain !== 'robinhood') {
      for (const t of todo) this.excluded.set(t, false);
      return;
    }
    for (const t of todo) {
      if (/robinhood token$/i.test(erc20.get(t)?.name ?? '')) {
        this.excluded.set(t, true);
        continue;
      }
      const slot = await this.rpc.storageAt(t, EIP1967_BEACON_SLOT).catch(() => null);
      const beacon = slot ? `0x${slot.slice(-40)}`.toLowerCase() : '';
      this.excluded.set(t, beacon === ROBINHOOD_STOCK_TOKEN_BEACON);
    }
  }

  launch(input: LaunchInput): TokenState | null {
    const address = input.token.toLowerCase();
    const known = this.token(address);
    if (known) {
      this.follow(known, input.venue, input.createdAt);
      return known;
    }
    if (this.world.tokens.has(address)) return null; // same address on another chain
    const { erc20 } = input;
    const supply = toUnits(erc20.totalSupply, erc20.decimals);
    if (!(supply > 0) || !Number.isFinite(supply)) return null;
    const description = cleanText(input.description ?? '', METADATA_LIMITS.MAX_DESCRIPTION);
    const { narrative, glyph } = classifyNarrative(erc20.name, erc20.symbol, description);
    const pool = input.pool ? worldReserves(input.pool) : null;
    if (input.status === 'migrated' && (!input.pool || !pool)) return null;
    const t = this.world.addExternalToken({
      chain: this.chain,
      address,
      launchpad: input.launchpad,
      symbol: erc20.symbol || '???',
      name: erc20.name || erc20.symbol || 'Unknown',
      description,
      imageUrl: input.imageUrl ?? null,
      metadataUri: input.metadataUri ?? null,
      creator: input.creator.toLowerCase(),
      createdAt: input.createdAt,
      decimals: erc20.decimals,
      totalSupply: supply,
      status: input.status,
      curve: input.curve ?? null,
      pool:
        input.pool && pool
          ? { address: input.pool.id, dex: getDex(input.pool.dex)?.name ?? input.pool.dex, feeRate: input.pool.feeRate, native: pool.native, tokens: pool.tokens, lpBurnedRate: input.pool.lpBurnedRate }
          : null,
      socials: input.socials ?? {},
      narrative,
      logoGlyph: glyph,
    });
    this.placeByAge(t);
    if (input.buyTax) t.buyTax = input.buyTax;
    if (input.sellTax) t.sellTax = input.sellTax;
    if (input.pool) this.pools.add(input.pool);
    this.follow(t, input.venue, input.createdAt);
    this.count(input.launchpad, 'launches');
    this.lastEventAt = this.clockNow();
    if (input.offchain) {
      const { parse } = input.offchain;
      this.meta.fetchLater(input.offchain.uri, (doc) => this.applyOffchain(address, parse(doc)));
    }
    return t;
  }

  /**
   * Keep the chain's token list in creation order. The ledger's newest-first
   * scans (Trenches' New column, narratives) stop at the first token older than
   * a day, so a token first seen trading long after its launch must not sit at
   * the end of the list.
   */
  private placeByAge(t: TokenState): void {
    const list = this.world.tokensByChain[this.chain];
    const n = list.length;
    const age = (a: string) => this.world.tokens.get(a)?.createdAt ?? 0;
    if (n < 2 || list[n - 1] !== t.address || age(list[n - 2]) <= t.createdAt) return;
    // first position whose token is younger than t
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (age(list[mid]) <= t.createdAt) lo = mid + 1;
      else hi = mid;
    }
    list.pop();
    list.splice(lo, 0, t.address);
  }

  private applyOffchain(address: string, m: { description?: string; imageUrl?: string | null; socials?: Socials }): void {
    const t = this.token(address);
    if (!t) return;
    if (m.description && !t.description) t.description = cleanText(m.description, METADATA_LIMITS.MAX_DESCRIPTION);
    if (m.imageUrl && !t.imageUrl) t.imageUrl = m.imageUrl;
    if (m.socials && Object.keys(m.socials).length > 0) t.socials = { ...m.socials, ...t.socials };
    if (t.narrative === classifyNarrative('', '', '').narrative && t.description) {
      const n = classifyNarrative(t.name, t.symbol, t.description);
      t.narrative = n.narrative;
    }
    t.version++;
  }

  /** Start (or refresh) following a token; evicted tokens stop being followed and go dormant. */
  private follow(t: TokenState, venue: string, at: number): void {
    if (t.dormant) {
      t.dormant = false;
      t.version++;
    }
    for (const gone of this.tracked.add(t.address, venue, Math.max(at, t.lastTradeAt))) this.evict(gone);
  }

  private evict(address: string): void {
    for (const v of this.venues) v.untrack?.(address);
    this.pools.removeToken(address);
    const t = this.token(address);
    if (t && !t.dormant) {
      t.dormant = true;
      t.version++;
    }
  }

  /**
   * The ledger books one trade per transaction, wallet and token: swaps of the
   * same transaction by the same wallet (multi-hop routes, bundles) are merged
   * into one before booking, keeping the last swap's post-trade state.
   */
  trade(t: TokenState, trade: ExternalTrade): void {
    const open = this.openTrades.get(t.address);
    if (open && open.t === t && open.trade.txHash === trade.txHash && open.trade.wallet === trade.wallet) {
      open.trade = mergeTrades(open.trade, trade);
      return;
    }
    if (open) this.flushTrade(t.address);
    this.openTrades.set(t.address, { t, trade });
  }

  private flushTrade(token: string): void {
    const open = this.openTrades.get(token);
    if (!open) return;
    this.openTrades.delete(token);
    this.bookTrade(open.t, open.trade);
  }

  private flushTrades(): void {
    for (const token of [...this.openTrades.keys()]) this.flushTrade(token);
  }

  private bookTrade(t: TokenState, trade: ExternalTrade): void {
    if (this.world.tokens.get(t.address) !== t) return;
    if (!(trade.tokenAmount > 0)) {
      // Swaps that netted out: no trade, but the venue state moved.
      setTradeState(t, trade);
      return;
    }
    if (t.dormant) this.follow(t, this.tracked.get(t.address)?.venue ?? t.launchpad, trade.at);
    if (trade.walletTokenBalance === undefined) {
      // The trader's balance once the transaction is done, from its transfers (tokens followed since launch).
      const b = this.holders.balanceAfter(trade.txHash, t.address, trade.wallet);
      if (b !== undefined && b >= 0n) trade = { ...trade, walletTokenBalance: toUnits(b, t.decimals) };
    }
    const booked = this.world.recordExternalTrade(t, trade);
    this.tracked.touch(t.address, trade.at);
    if (booked) {
      this.count(this.tracked.get(t.address)?.venue ?? t.launchpad, 'trades');
      this.lastEventAt = this.clockNow();
    }
  }

  complete(t: TokenState, at: number): void {
    this.flushTrade(t.address);
    this.world.completeCurve(t, at);
    this.lastEventAt = this.clockNow();
  }

  migrate(t: TokenState, pool: AmmPool, at: number): void {
    this.flushTrade(t.address);
    const r = worldReserves(pool);
    if (!r) return;
    this.pools.add(pool);
    this.world.migrateExternal(
      t,
      { address: pool.id, dex: getDex(pool.dex)?.name ?? pool.dex, feeRate: pool.feeRate, native: r.native, tokens: r.tokens, lpBurnedRate: pool.lpBurnedRate },
      at,
    );
    this.follow(t, pool.dex, at);
    this.count(pool.dex, 'migrations');
    this.lastEventAt = this.clockNow();
  }

  syncPool(t: TokenState, pool: AmmPool): void {
    this.flushTrade(t.address);
    const r = worldReserves(pool);
    if (!r || !t.pool) return;
    t.pool.native = r.native;
    t.pool.tokens = r.tokens;
    t.version++;
  }

  count(venue: string, what: keyof VenueCounters): void {
    let c = this.counters.get(venue);
    if (!c) this.counters.set(venue, (c = { launches: 0, trades: 0, migrations: 0, skipped: 0 }));
    c[what]++;
  }

  error(venue: string, err: unknown): void {
    const message = (errorText(err) || String(err)).split('\n')[0].slice(0, 300);
    this.errors.push({ at: this.clockNow(), venue, message });
    if (this.errors.length > MAX_ERRORS) this.errors.splice(0, this.errors.length - MAX_ERRORS);
  }

  venue<T extends Venue>(id: string): T | undefined {
    return this.venues.find((v) => v.id === id) as T | undefined;
  }

  // ---------------------------------------------------------------------------
  // On-demand loading, housekeeping, status
  // ---------------------------------------------------------------------------

  /** Load a token the feed has not seen (a pasted contract address): detect its venue on-chain and follow it. */
  async ensureToken(address: string): Promise<TokenState | null> {
    const a = address.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
    const known = this.token(a);
    if (known) {
      if (!this.tracked.has(a)) this.follow(known, known.launchpad, this.clockNow());
      return known;
    }
    // A launchpad that knows the token (its curve, or the pool it graduated into).
    for (const v of this.venues) {
      if (!v.detect) continue;
      try {
        if (await v.detect(a, this)) return this.token(a) ?? null;
      } catch (err) {
        this.error(v.id, err);
      }
    }
    // Otherwise its deepest native pool on the chain's DEXes.
    const erc20 = (await this.meta.erc20([a])).get(a);
    if (!erc20) return null;
    await this.screen([a], new Map([[a, erc20]]));
    if (this.isExcluded(a)) return null;
    let best: PoolProbe | null = null;
    for (const v of this.venues) {
      if (!v.probe) continue;
      try {
        const p = await v.probe(a, this);
        if (p && (!best || p.depth > best.depth)) best = p;
      } catch (err) {
        this.error(v.id, err);
      }
    }
    if (!best) return null;
    best.pool.tokenDecimals = erc20.decimals;
    return this.launch({ token: a, launchpad: best.launchpad, venue: best.venue, creator: a, createdAt: this.clockNow(), erc20, status: 'migrated', pool: best.pool });
  }

  async housekeeping(): Promise<void> {
    this.lastHousekeeping = this.clockNow();
    for (const v of this.venues) {
      try {
        await v.housekeeping?.(this);
      } catch (err) {
        this.error(v.id, err);
      }
    }
    // Pins taken after a token was evicted bring it back.
    const pins = this.world.pinnedTokens();
    for (const addr of pins) {
      const t = this.token(addr);
      if (t && !this.tracked.has(addr)) this.follow(t, t.launchpad, this.clockNow());
    }
    if (this.opts.pruneWorld) this.pruneWorld(pins);
  }

  /**
   * Bound the ledger: beyond WORLD_TOKENS_FACTOR x the tracked cap, delete the
   * oldest untracked tokens no account wallet touched and nothing pins (their
   * wallets' positions fold into all-time totals), then drop external wallets
   * left with nothing live after a long idle.
   */
  pruneWorld(pins: Set<string> = this.world.pinnedTokens()): number {
    const { world } = this;
    const addrs = world.tokensByChain[this.chain];
    const cap = this.opts.worldTokenCap ?? Math.max(this.tracked.cap * WORLD_TOKENS_FACTOR, 500);
    if (addrs.length <= cap) return 0;
    let excess = addrs.length - Math.floor(cap * 0.95);
    const deleted: TokenState[] = [];
    let write = 0;
    for (const addr of addrs) {
      const t = world.tokens.get(addr);
      if (!t) continue;
      if (excess > 0 && !this.tracked.has(addr) && !pins.has(addr) && !this.touchedByAccount(t)) {
        world.tokens.delete(addr);
        deleted.push(t);
        excess--;
        continue;
      }
      addrs[write++] = addr;
    }
    addrs.length = write;
    for (const t of deleted) this.pools.removeToken(t.address);
    world.dropPositions(deleted);
    this.pruneWallets();
    return deleted.length;
  }

  private touchedByAccount(t: TokenState): boolean {
    for (const addr of t.traders) if (this.world.wallets.get(addr)?.archetype === 'user') return true;
    return false;
  }

  private pruneWallets(): void {
    const { world } = this;
    const now = this.clockNow();
    const dead = new Set<string>();
    for (const addr of world.walletsOf(this.chain, 'external')) {
      const w = world.wallets.get(addr);
      if (!w || w.accountId || now - w.lastActiveAt < WALLET_IDLE_MS) continue;
      if (this.opts.keepWallet?.(addr)) continue;
      let alive = w.createdTokens.some((a) => world.tokens.has(a));
      if (!alive) for (const token of w.positions.keys()) if (world.tokens.has(token)) alive = true;
      if (!alive) dead.add(addr);
    }
    if (dead.size) world.removeWallets(dead);
  }

  status(): EvmChainFeedStatus {
    const p = this.poller.status();
    const connected = this.running && this.failures < 3 && this.lastPollAt !== null && this.clockNow() - this.lastPollAt < this.opts.pollMs * 4 + 15_000;
    return {
      chain: this.chain,
      running: this.running,
      connected,
      headBlock: p.head === null ? null : Number(p.head),
      processedBlock: p.cursor === null ? null : Number(p.cursor),
      lagBlocks: p.lagBlocks,
      lastEventAt: this.lastEventAt,
      lastPollAt: this.lastPollAt,
      trackedTokens: this.tracked.size,
      worldTokens: this.world.tokensByChain[this.chain].length,
      pools: this.pools.size,
      requestsPerSec: this.opts.budget?.rate() ?? 0,
      skippedBlocks: p.skippedBlocks,
      lastSkipAt: p.lastSkipAt,
      windows: p.windows,
      rangeSplits: p.splits,
      evictions: this.tracked.evictions,
      metadataPending: this.meta.pending,
      holderTokens: this.holders.size,
      logMaxAddresses: p.maxAddresses,
      widePoolQueries: p.wideActive,
      venues: Object.fromEntries(this.counters),
      recentErrors: [...this.errors],
    };
  }
}

/** Two swaps of one wallet in one transaction as one trade (net of buys and sells; last state wins). */
export function mergeTrades(a: ExternalTrade, b: ExternalTrade): ExternalTrade {
  const sign = (x: ExternalTrade) => (x.side === 'buy' ? 1 : -1);
  const tokens = sign(a) * a.tokenAmount + sign(b) * b.tokenAmount;
  // Native spent (buys) minus native received (sells).
  const spent = sign(a) * a.nativeAmount + sign(b) * b.nativeAmount;
  const side = tokens >= 0 ? 'buy' : 'sell';
  const fees = a.fees || b.fees ? { platform: (a.fees?.platform ?? 0) + (b.fees?.platform ?? 0), network: (a.fees?.network ?? 0) + (b.fees?.network ?? 0) } : undefined;
  return {
    ...b,
    side,
    tokenAmount: Math.abs(tokens),
    nativeAmount: Math.max(0, side === 'buy' ? spent : -spent),
    at: a.at,
    ...(fees ? { fees } : {}),
  };
}

/** A trade's post-trade venue state, without booking it (World.recordExternalTrade's state update). */
function setTradeState(t: TokenState, e: ExternalTrade): void {
  if (e.curve && t.curve) {
    t.curve.virtualNative = e.curve.virtualNative;
    t.curve.virtualTokens = e.curve.virtualTokens;
    if (e.curve.realNative !== undefined) t.curve.realNative = e.curve.realNative;
    if (e.curve.realTokens !== undefined) t.curve.realTokens = e.curve.realTokens;
  }
  if (t.pool && e.pool) {
    t.pool.native = e.pool.native;
    t.pool.tokens = e.pool.tokens;
  } else if (t.pool && e.priceNative && e.priceNative > 0) t.pool.tokens = t.pool.native / e.priceNative;
  t.version++;
}
