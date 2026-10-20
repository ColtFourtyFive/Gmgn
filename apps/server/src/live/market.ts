// Live market source: real Solana launches and trades written into the shared
// World ledger, so analytics, trading and the WebSocket channels work the same
// way they do over the simulator.
//
//   feed        PumpPortal (one socket): launches, migrations, the tracked tokens'
//               trades and the watched wallets' trades (those two need a funded
//               PUMPPORTAL_API_KEY). Launches are first checked against their
//               curve account (feed/verify.ts: ones quoted in another mint are
//               dropped); events are queued and applied on engine ticks (never
//               while a snapshot holds the engine), through FeedIngestor into the
//               World. A migration's pool is then read back from the chain.
//   tracking    new launches and opened tokens are streamed; capped with LRU
//               eviction, idle ones dropped (and put to sleep), protected ones
//               (held, watchlisted, ordered / alerted, open in a client) kept.
//   lookup      unknown mints load on demand (token page, search, a watched
//               wallet's trade): pump curve / PumpSwap pool, or a Jupiter price.
//   enrichment  metadata JSON (image, description, socials), SOL/USD and other
//               prices (Jupiter), authorities and top holders (RPC, budgeted),
//               narratives by keyword, KOL labels from LIVE_KOL_FILE.
//   upkeep      1h launch / migration counters, dormancy, a token cap for the
//               World and a sweep of observed wallets nothing references.

import type { ChainId, LiveStatus } from '@trenchscope/shared';
import { PublicKey, type Connection } from '@solana/web3.js';
import type { AppContext, MarketSource } from '../context';
import type { TokenState, WalletState, World } from '../sim/world';
import { RequestBudget } from './enrich/budget';
import type { FetchFn, HostLookup } from './enrich/http';
import { loadKolFile, type KolEntry } from './enrich/kol';
import { TokenLookup } from './enrich/lookup';
import { MetadataQueue, type TokenMetadata } from './enrich/metadata';
import { classifyNarrative } from './enrich/narratives';
import { parsePublicKey, pumpPoolAddress, readPumpPool } from './enrich/onchain';
import { PriceTicker, type JupiterPrice } from './enrich/prices';
import { OnchainSecurity } from './enrich/security';
import { BASE58_ADDRESS } from './enrich/sanitize';
import { FeedIngestor, PUMP } from './feed/ingest';
import type { FeedEvent } from './feed/messages';
import { loadIngestEnv, type IngestEnv } from './feed/options';
import { PumpPortalClient, type PumpPortalOptions } from './feed/pumpportal';
import { TrackedTokens } from './feed/tracker';
import { LaunchVerifier, rpcCurveReader, type CurveReader, type LaunchVerifierOptions } from './feed/verify';

const SEC = 1000;
const MIN = 60 * SEC;

/** Feed events applied per engine tick (the rest wait for the next one). */
const DRAIN_PER_TICK = 5000;
/** Events waiting beyond this are dropped (counted): the World is falling behind the feed. */
const MAX_QUEUE = 100_000;
/** Trades parked while their token loads, per mint and in total, and for how long. */
const MAX_PARKED_PER_MINT = 50;
const MAX_PARKED = 5000;
const PARKED_TTL_MS = MIN;
/** Account-trade streams (followed / copied / alerted / KOL wallets). */
const MAX_ACCOUNT_STREAMS = 2000;
/** Observed wallets nothing references are dropped after this long without a trade. */
const WALLET_IDLE_MS = 60 * MIN;
/** Wallets registered on demand (page views, follows) between two sweeps: a crawler cannot fill the World. */
const MAX_ON_DEMAND_WALLETS = 2000;
/** A failed metadata fetch of a token someone looks at is retried after this long. */
const METADATA_RETRY_MS = 5 * MIN;
const DORMANT_TRADES_KEPT = 200;
const RPC_PROBE_TIMEOUT_MS = 5000;
/** A migrated token's pool is read from the chain this long after the migration (then once more if absent). */
const POOL_READ_DELAYS_MS = [5 * SEC, 20 * SEC];

interface LiveMarketSnapshot {
  version: 1;
  /** Streamed mints with their last activity. */
  tracked: [string, number][];
  /** Whether SOL/USD has come from a real price yet (the World starts from a placeholder). */
  nativeSeeded: boolean;
}

/** Injection points for tests (production uses the defaults). */
export interface LiveMarketDeps {
  fetch?: FetchFn;
  lookup?: HostLookup;
  env?: NodeJS.ProcessEnv;
  log?: Pick<Console, 'warn' | 'info'>;
  feed?: Partial<Pick<PumpPortalOptions, 'batchMs' | 'backoffBaseMs' | 'backoffMaxMs' | 'pingEveryMs' | 'staleMs' | 'random' | 'tradeRetryMs'>>;
  /** Launch verification timing (tests). */
  verify?: Partial<Pick<LaunchVerifierOptions, 'batchMs' | 'retryMs' | 'maxAttempts'>>;
  /** Delays of the post-migration pool reads (tests). */
  poolReadDelaysMs?: number[];
  priceEveryMs?: number;
  rpcProbeEveryMs?: number;
}

export interface LiveDiagnostics {
  queue: number;
  queueDropped: number;
  applyErrors: number;
  parked: number;
  tracked: number;
  trackedAccounts: number;
  feed: PumpPortalClient['diag'] | null;
  /** Launch checks against the curve account; `pending` launches wait for their read. */
  verify: LaunchVerifier['stats'] & { pending: number };
  /** Post-migration pool reads that corrected / could not find the pool. */
  poolReads: { applied: number; missing: number };
  ingest: FeedIngestor['stats'];
  lookup: TokenLookup['stats'];
  metadata: MetadataQueue['stats'];
  security: OnchainSecurity['stats'];
  rpc: { started: number; refused: number; queued: number };
  pruned: { tokens: number; wallets: number };
}

export class LiveMarket implements MarketSource {
  readonly mode = 'live' as const;
  private readonly world: World;
  private readonly env: IngestEnv;
  private readonly log: Pick<Console, 'warn' | 'info'>;
  private readonly ingest: FeedIngestor;
  private readonly feed: PumpPortalClient;
  private readonly verifier: LaunchVerifier;
  private curveReader: { connection: Connection; read: CurveReader } | null = null;
  private readonly poolReads = { applied: 0, missing: 0 };
  private readonly poolTimers = new Set<NodeJS.Timeout>();
  /** Receives every raw feed frame (capture tools, scripts/pumpportal-check.ts). */
  private frameTap: ((text: string) => void) | null = null;
  private readonly tracker: TrackedTokens;
  private readonly budget: RequestBudget;
  private readonly lookup: TokenLookup;
  private readonly security: OnchainSecurity;
  private readonly metadata: MetadataQueue;
  private readonly prices: PriceTicker;
  private readonly kols = new Map<string, KolEntry>();
  /** Feed events waiting for the next engine tick. */
  private queue: FeedEvent[] = [];
  private queueDropped = 0;
  /** Trades / migrations of tokens being loaded, replayed once they are. */
  private parked = new Map<string, { events: FeedEvent[]; at: number }>();
  private parkedCount = 0;
  /** Tokens that must stay streamed and in the World (refreshed every 10s). */
  private protectedSet = new Set<string>();
  /** Protected tokens no feed streams: priced from Jupiter instead. */
  private unstreamed: string[] = [];
  private metadataTried = new Map<string, number>();
  private rpcHealthy = false;
  private probeTimer: NodeJS.Timeout | null = null;
  private started = false;
  /** Stopped for good: no more chain reads are scheduled. */
  private closed = false;
  private nativeSeeded = false;
  private readonly maxWorldTokens: number;
  private prunedTokens = 0;
  private prunedWallets = 0;
  private onDemandWallets = 0;
  private applyErrors = 0;

  constructor(
    private readonly ctx: AppContext,
    private readonly deps: LiveMarketDeps = {},
  ) {
    this.world = ctx.world;
    this.env = loadIngestEnv(deps.env ?? process.env);
    this.log = deps.log ?? console;
    const live = ctx.config.live;
    const feedCfg = live?.feed ?? { pumpPortalUrl: 'wss://pumpportal.fun/api/data', maxTrackedTokens: 3000 };
    this.maxWorldTokens = Math.max(1000, feedCfg.maxTrackedTokens * 2);
    this.ingest = new FeedIngestor(this.world, { now: () => this.world.now, pumpPoolAddress });
    this.verifier = new LaunchVerifier({
      reader: () => this.readCurves(),
      emit: (e) => this.enqueue(e),
      reject: (mint) => this.ingest.ignoreMint(mint),
      log: this.log,
      ...deps.verify,
    });
    this.feed = new PumpPortalClient({
      url: feedCfg.pumpPortalUrl,
      apiKey: this.env.pumpPortalApiKey,
      onEvent: (e) => this.verifier.push(e),
      onFrame: (text) => this.frameTap?.(text),
      log: this.log,
      ...deps.feed,
    });
    this.tracker = new TrackedTokens({
      max: feedCfg.maxTrackedTokens,
      idleMs: this.env.idleMs,
      stream: this.feed,
      isProtected: (mint) => ctx.hub.hasSubscribers(`token:sol:${mint}`),
    });
    this.budget = new RequestBudget({ rps: this.env.rpcRps, maxConcurrent: 8 });
    const jupiter = { baseUrl: live?.jupiter.baseUrl ?? 'https://lite-api.jup.ag', apiKey: live?.jupiter.apiKey ?? null, fetch: deps.fetch };
    const connection = () => ctx.live?.connection ?? null;
    this.lookup = new TokenLookup({ world: this.world, connection, budget: this.budget, jupiter, log: this.log });
    this.security = new OnchainSecurity({
      world: this.world,
      connection,
      budget: this.budget,
      now: () => this.world.now,
      isAccountWallet: (a) => !!this.world.wallets.get(a)?.accountId,
      log: this.log,
    });
    this.metadata = new MetadataQueue({
      gateways: live?.ipfsGateways ?? [],
      fetch: deps.fetch,
      lookup: deps.lookup,
      apply: (mint, meta) => this.applyMetadata(mint, meta),
    });
    this.prices = new PriceTicker({
      ...jupiter,
      everyMs: deps.priceEveryMs ?? 30 * SEC,
      extraIds: () => this.unstreamed.slice(0, 199),
      onNativeUsd: (usd) => this.setSolUsd(usd),
      onPrices: (prices) => this.applyPrices(prices),
      log: this.log,
    });
    for (const k of loadKolFile(this.env.kolFile, this.log)) this.kols.set(k.address, k);
  }

  // ---------------------------------------------------------------------------
  // MarketSource
  // ---------------------------------------------------------------------------

  install(): void {
    const { world, engine } = this.ctx;
    // Before analytics' own listener: a KOL wallet is labelled by the time it is indexed.
    world.on('walletCreated', (w) => this.labelKol(w));
    engine.addTicker('live-feed', () => this.drain(), { everyMs: 0 });
    engine.addTicker('live-protect', () => this.protect(), { everyMs: 10 * SEC });
    engine.addTicker('live-accounts', () => this.refreshAccounts(), { everyMs: 30 * SEC });
    engine.addTicker('live-housekeeping', () => this.housekeeping(), { everyMs: 30 * SEC });
  }

  /** Nothing to seed: the ledger fills from the feed (KOL wallets are registered up front). */
  bootstrap(): void {
    this.syncKols();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!this.env.pumpPortalApiKey) {
      this.log.warn(
        '[live] PUMPPORTAL_API_KEY is not set: PumpPortal streams token and account trades only to an API key funded with at least 0.02 SOL. Launches and migrations still arrive, but prices, holders and trades of streamed tokens will not move.',
      );
    }
    this.feed.start();
    this.prices.start();
    const probe = () => void this.probeRpc();
    probe();
    this.probeTimer = setInterval(probe, this.deps.rpcProbeEveryMs ?? 30 * SEC);
    this.probeTimer.unref?.();
    this.refreshAccounts();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.closed = true;
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = null;
    this.verifier.close();
    for (const t of this.poolTimers) clearTimeout(t);
    this.poolTimers.clear();
    this.prices.stop();
    this.metadata.close();
    this.budget.close();
    await this.feed.stop();
  }

  /** User launches are a demo-mode feature; live tokens come from the chain. */
  adopt(_t: TokenState): void {}

  liveStatus(): LiveStatus {
    const live = this.ctx.live;
    return {
      feedConnected: this.feed.connected,
      lastEventAt: this.feed.lastEventAt,
      rpcHealthy: this.rpcHealthy,
      signer: live?.signer?.provider ?? 'none',
      tradingEnabled: !!(live?.connection && live?.signer),
      trackedTokens: this.tracker.size,
    };
  }

  diagnostics(): LiveDiagnostics {
    return {
      queue: this.queue.length,
      queueDropped: this.queueDropped,
      applyErrors: this.applyErrors,
      parked: this.parkedCount,
      tracked: this.tracker.size,
      trackedAccounts: this.feed.trackedAccounts,
      feed: this.feed.diag,
      verify: { ...this.verifier.stats, pending: this.verifier.size },
      poolReads: { ...this.poolReads },
      ingest: this.ingest.stats,
      lookup: this.lookup.stats,
      metadata: this.metadata.stats,
      security: this.security.stats,
      rpc: { started: this.budget.started, refused: this.budget.refused, queued: this.budget.queued },
      pruned: { tokens: this.prunedTokens, wallets: this.prunedWallets },
    };
  }

  /** Hand every raw feed frame to `fn` as received (null stops): for capture tools. */
  tapFeed(fn: ((text: string) => void) | null): void {
    this.frameTap = fn;
  }

  serialize(): LiveMarketSnapshot {
    return { version: 1, tracked: this.tracker.entries(), nativeSeeded: this.nativeSeeded };
  }

  restore(data: unknown): void {
    const snap = data as Partial<LiveMarketSnapshot> | null;
    if (snap?.version === 1) {
      this.nativeSeeded = snap.nativeSeeded === true;
      if (Array.isArray(snap.tracked)) this.tracker.restore(snap.tracked.filter((e) => Array.isArray(e) && this.world.tokens.has(e[0])));
    }
    this.syncKols();
  }

  /** The token at `address`, loading an unknown mint from the chain (and streaming it). */
  async ensureToken(chain: ChainId, address: string): Promise<TokenState | null> {
    if (chain !== 'sol') return null;
    const known = this.world.tokens.get(address);
    const t = known ?? (await this.lookup.ensure(address));
    if (!t || t.chain !== 'sol') return null;
    if (!known) {
      this.security.noteAuthorities(t.address);
      this.metadata.push(t.address, t.metadataUri, true);
    }
    this.track(t);
    return t;
  }

  /** The wallet at `address`; a valid Solana address the World has not seen becomes an observed wallet. */
  ensureWallet(chain: ChainId, address: string): WalletState | null {
    const w = this.world.wallets.get(address);
    if (w) return w.chain === chain ? w : null;
    if (chain !== 'sol' || !BASE58_ADDRESS.test(address) || !parsePublicKey(address) || this.world.tokens.has(address)) return null;
    if (this.onDemandWallets >= MAX_ON_DEMAND_WALLETS) return null;
    this.onDemandWallets++;
    return this.world.ensureWallet('sol', address);
  }

  // ---------------------------------------------------------------------------
  // Feed events
  // ---------------------------------------------------------------------------

  private enqueue(e: FeedEvent): void {
    if (this.queue.length >= MAX_QUEUE) {
      this.queueDropped++;
      return;
    }
    this.queue.push(e);
  }

  /** Apply queued feed events (engine tick). */
  private drain(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.length > DRAIN_PER_TICK ? this.queue.splice(0, DRAIN_PER_TICK) : this.queue;
    if (batch === this.queue) this.queue = [];
    for (const e of batch) this.applyEvent(e);
  }

  private applyEvent(e: FeedEvent): void {
    let r: ReturnType<FeedIngestor['apply']>;
    try {
      r = this.ingest.apply(e);
    } catch (err) {
      // A failing listener (analytics, orders, copy trades react to every trade) must not stop the feed.
      if (this.applyErrors++ % 100 === 0) this.log.warn(`[live] applying a feed event failed: ${err instanceof Error ? err.stack ?? err.message : 'error'}`);
      return;
    }
    if (r.status === 'unknown_token') {
      this.park(r.mint, e);
      return;
    }
    if (r.status !== 'ok') return;
    const t = r.token;
    if (e.kind === 'create') {
      this.tracker.touch(t.address, this.world.now);
      if (!t.imageUrl) this.metadata.push(t.address, t.metadataUri);
    } else if (this.tracker.has(t.address)) {
      this.tracker.touch(t.address, this.world.now);
    }
    if (e.kind === 'migrate') this.schedulePoolRead(t.address, 0);
  }

  /** The launch verifier's curve reader over the current RPC connection (null without one). */
  private readCurves(): CurveReader | null {
    const connection = this.ctx.live?.connection ?? null;
    if (!connection) return null;
    if (this.curveReader?.connection !== connection) {
      this.curveReader = { connection, read: rpcCurveReader(connection, (fn) => this.budget.run(fn, 'high')) };
    }
    return this.curveReader.read;
  }

  /**
   * Read a just-migrated token's PumpSwap pool from the chain and take its reserves (the vaults plus
   * the pool's virtual quote reserve): the migration model only estimates them, and the trades that
   * would move them stream only with a funded API key.
   */
  private schedulePoolRead(mint: string, attempt: number): void {
    const delays = this.deps.poolReadDelaysMs ?? POOL_READ_DELAYS_MS;
    if (!this.ctx.live?.connection || attempt >= delays.length || this.closed) return;
    const timer = setTimeout(() => {
      this.poolTimers.delete(timer);
      void this.readPool(mint, attempt);
    }, delays[attempt]);
    timer.unref?.();
    this.poolTimers.add(timer);
  }

  private async readPool(mint: string, attempt: number): Promise<void> {
    const connection = this.ctx.live?.connection;
    const key = parsePublicKey(mint);
    if (!connection || !key || this.closed) return;
    let pool: Awaited<ReturnType<typeof readPumpPool>> = null;
    try {
      pool = await readPumpPool(connection, key, (fn) => this.budget.run(fn, 'low'));
    } catch {
      pool = null;
    }
    const t = this.world.tokens.get(mint);
    if (!t?.pool || t.status !== 'migrated') return;
    if (!pool) {
      this.poolReads.missing++;
      this.schedulePoolRead(mint, attempt + 1);
      return;
    }
    t.pool.native = pool.native;
    t.pool.tokens = pool.tokens;
    if (!t.pool.address) t.pool.address = pool.address;
    t.version++;
    this.poolReads.applied++;
  }

  /** Hold a token's events while it loads; replay them in order once it has. */
  private park(mint: string, e: FeedEvent): void {
    let entry = this.parked.get(mint);
    if (!entry) {
      if (this.parkedCount >= MAX_PARKED || !this.ctx.live?.connection) return;
      entry = { events: [], at: Date.now() };
      this.parked.set(mint, entry);
      void this.lookup.ensure(mint, 'low').then((t) => {
        const held = this.parked.get(mint);
        this.parked.delete(mint);
        if (!held) return;
        this.parkedCount -= held.events.length;
        if (!t) return;
        this.security.noteAuthorities(t.address);
        this.metadata.push(t.address, t.metadataUri);
        for (const ev of held.events) this.enqueue(ev);
      });
    }
    if (entry.events.length >= MAX_PARKED_PER_MINT) return;
    entry.events.push(e);
    this.parkedCount++;
  }

  // ---------------------------------------------------------------------------
  // Tracking & protection
  // ---------------------------------------------------------------------------

  /** Stream a token's trades when the feed carries its venue (pump.fun curve and PumpSwap). */
  private track(t: TokenState): void {
    if (t.launchpad === PUMP.id) this.tracker.touch(t.address, this.world.now);
  }

  /** Tokens nothing may drop: held by an account wallet, watchlisted, pinned (orders / alerts), open in a client. */
  protectedTokens(): Set<string> {
    const { world, hub } = this.ctx;
    const out = new Set<string>();
    for (const mint of world.pinnedTokens()) out.add(mint);
    for (const addr of world.walletsOf('sol', 'user')) {
      const w = world.wallets.get(addr);
      if (!w) continue;
      for (const [mint, pos] of w.positions) if (pos.balance > 0) out.add(mint);
      if (w.accountId) for (const item of this.ctx.accounts?.watchlist(w.accountId) ?? []) if (item.chain === 'sol') out.add(item.address);
    }
    for (const ch of hub.activeChannels('token')) {
      const [, chain, mint] = ch.split(':');
      if (chain === 'sol' && mint) out.add(mint);
    }
    return out;
  }

  private protect(): void {
    const set = this.protectedTokens();
    this.protectedSet = set;
    this.tracker.setProtected(set);
    const now = this.world.now;
    const unstreamed: string[] = [];
    const present: string[] = [];
    for (const mint of set) {
      const t = this.world.tokens.get(mint);
      if (!t || t.chain !== 'sol') continue;
      present.push(mint);
      if (t.launchpad === PUMP.id) {
        if (!this.tracker.has(mint)) this.tracker.touch(mint, now);
      } else {
        unstreamed.push(mint);
      }
      if (t.metadataUri && !t.imageUrl && now - (this.metadataTried.get(mint) ?? -Infinity) >= METADATA_RETRY_MS) {
        this.metadataTried.set(mint, now);
        this.metadata.push(mint, t.metadataUri, true);
      }
      if (t.dormant) this.wake(t);
    }
    this.unstreamed = unstreamed;
    this.security.refresh(present);
  }

  /** Account-trade streams: followed, copied and alerted wallets, plus labelled KOLs (every 30s; at start). */
  refreshAccounts(): void {
    const keys = new Set<string>();
    const add = (addr: string) => {
      if (keys.size < MAX_ACCOUNT_STREAMS && BASE58_ADDRESS.test(addr)) keys.add(addr);
    };
    for (const a of this.ctx.accounts?.watchedWallets('sol') ?? []) add(a);
    for (const a of this.ctx.trading?.watchedWallets('sol') ?? []) add(a);
    for (const a of this.kols.keys()) add(a);
    this.feed.setAccounts(keys);
  }

  // ---------------------------------------------------------------------------
  // Enrichment results
  // ---------------------------------------------------------------------------

  private applyMetadata(mint: string, meta: TokenMetadata): void {
    const t = this.world.tokens.get(mint);
    if (!t) return;
    let changed = false;
    if (meta.imageUrl && t.imageUrl !== meta.imageUrl) {
      t.imageUrl = meta.imageUrl;
      changed = true;
    }
    if (meta.description && !t.description) {
      t.description = meta.description;
      changed = true;
    }
    let socialsChanged = false;
    for (const k of ['twitter', 'telegram', 'website'] as const) {
      if (meta.socials[k] && !t.socials[k]) {
        t.socials = { ...t.socials, [k]: meta.socials[k] };
        socialsChanged = true;
      }
    }
    if (!t.narrative && t.description) {
      const n = classifyNarrative(t.name, t.symbol, t.description);
      if (n.narrative) {
        t.narrative = n.narrative;
        t.logoGlyph = n.glyph;
        changed = true;
      }
    }
    if (!changed && !socialsChanged) return;
    t.version++;
    if (socialsChanged) this.world.emit('tokenFlag', t, 'socials');
  }

  private setSolUsd(usd: number): void {
    const c = this.world.chains.sol;
    if (!this.nativeSeeded) {
      // The World starts from the simulator's placeholder price: the first real one restarts the 24h history.
      c.nativeHistory = [{ t: this.world.now, usd }];
      c.nativeUsdOpen24h = usd;
      this.nativeSeeded = true;
    }
    this.world.setNativeUsd('sol', usd);
  }

  /** Jupiter prices of protected tokens no feed streams: reprice their (synthetic) pools. */
  private applyPrices(prices: Map<string, JupiterPrice>): void {
    const solUsd = this.world.nativeUsd('sol');
    if (!(solUsd > 0)) return;
    for (const [mint, p] of prices) {
      const t = this.world.tokens.get(mint);
      if (!t?.pool || t.launchpad === PUMP.id) continue;
      if (p.liquidity !== null && p.liquidity > 0) t.pool.native = p.liquidity / 2 / solUsd;
      t.pool.tokens = t.pool.native / (p.usdPrice / solUsd);
      t.version++;
    }
  }

  private async probeRpc(): Promise<void> {
    const connection = this.ctx.live?.connection;
    if (!connection) {
      this.rpcHealthy = false;
      return;
    }
    try {
      await this.budget.run(
        () =>
          Promise.race([
            connection.getSlot('confirmed'),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rpc probe timed out')), RPC_PROBE_TIMEOUT_MS).unref?.()),
          ]),
        'high',
      );
      if (!this.rpcHealthy) this.log.info('[live] RPC healthy');
      this.rpcHealthy = true;
    } catch (err) {
      if (this.rpcHealthy) this.log.warn(`[live] RPC probe failed: ${err instanceof Error ? err.message : 'error'}`);
      this.rpcHealthy = false;
    }
  }

  // ---------------------------------------------------------------------------
  // KOL labels
  // ---------------------------------------------------------------------------

  private labelKol(w: WalletState): void {
    const k = w.chain === 'sol' ? this.kols.get(w.address) : undefined;
    if (!k) return;
    w.label = k.name;
    w.tags.add('kol');
  }

  /** Register / label every KOL wallet; wallets labelled from an older list lose the label. */
  private syncKols(): void {
    for (const addr of this.world.walletsOf('sol', 'external')) {
      const w = this.world.wallets.get(addr);
      if (w && w.tags.has('kol') && !this.kols.has(addr)) {
        w.tags.delete('kol');
        w.label = null;
      }
    }
    for (const k of this.kols.values()) {
      const w = this.world.wallets.get(k.address);
      if (w) {
        if (w.chain === 'sol' && !w.accountId) this.labelKol(w);
      } else if (!this.world.tokens.has(k.address)) {
        this.world.ensureWallet('sol', k.address);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Housekeeping (every 30s)
  // ---------------------------------------------------------------------------

  private housekeeping(): void {
    const { world } = this;
    const now = world.now;
    world.pruneCounters();
    for (const mint of this.tracker.sweep(now)) {
      const t = world.tokens.get(mint);
      if (t && !this.protectedSet.has(mint)) this.sleep(t);
    }
    // Tokens nobody streams that went quiet (loaded on demand, evicted, never traded) sleep too.
    for (const addr of world.tokensByChain.sol) {
      const t = world.tokens.get(addr);
      if (!t || t.dormant || this.tracker.has(addr) || this.protectedSet.has(addr)) continue;
      if (now - t.lastTradeAt > this.env.idleMs && t.status !== 'migrating') this.sleep(t);
    }
    for (const [mint, entry] of this.parked) {
      if (Date.now() - entry.at <= PARKED_TTL_MS) continue;
      this.parked.delete(mint);
      this.parkedCount -= entry.events.length;
    }
    for (const [mint, at] of this.metadataTried) if (now - at > METADATA_RETRY_MS) this.metadataTried.delete(mint);
    this.pruneTokens();
    this.sweepWallets();
  }

  /** Stop treating a quiet token as active and drop its heavy history (as the simulator does). */
  private sleep(t: TokenState): void {
    t.dormant = true;
    t.watchers = 0;
    if (t.trades.length > DORMANT_TRADES_KEPT) t.trades = t.trades.slice(-DORMANT_TRADES_KEPT);
    t.candles['1s'] = [];
    t.candles['15s'] = [];
    t.version++;
  }

  private wake(t: TokenState): void {
    t.dormant = false;
    t.version++;
  }

  /** Keep the World's token count bounded: delete the oldest dormant tokens nobody references. */
  private pruneTokens(): void {
    const { world } = this;
    const addrs = world.tokensByChain.sol;
    if (addrs.length <= this.maxWorldTokens) return;
    let excess = addrs.length - Math.floor(this.maxWorldTokens * 0.95);
    const deleted: TokenState[] = [];
    let write = 0;
    for (const addr of addrs) {
      const t = world.tokens.get(addr);
      if (!t) continue;
      if (excess > 0 && t.dormant && !this.protectedSet.has(addr) && !this.tracker.has(addr) && !this.touchedByAccount(t)) {
        world.tokens.delete(addr);
        deleted.push(t);
        excess--;
        continue;
      }
      addrs[write++] = addr;
    }
    addrs.length = write;
    if (deleted.length === 0) return;
    world.dropPositions(deleted);
    this.prunedTokens += deleted.length;
  }

  private touchedByAccount(t: TokenState): boolean {
    for (const addr of t.traders) if (this.world.wallets.get(addr)?.accountId) return true;
    return !!this.world.wallets.get(t.creator)?.accountId;
  }

  /** Drop observed wallets nothing references: no live position or token, unlabelled, unwatched, idle. */
  private sweepWallets(): void {
    const { world } = this;
    const now = world.now;
    this.onDemandWallets = 0;
    const watched = new Set<string>([...(this.ctx.accounts?.watchedWallets('sol') ?? []), ...(this.ctx.trading?.watchedWallets('sol') ?? [])]);
    const dead = new Set<string>();
    for (const addr of world.walletsOf('sol', 'external')) {
      const w = world.wallets.get(addr);
      if (!w || w.accountId || w.label || this.kols.has(addr) || watched.has(addr)) continue;
      if (now - w.lastActiveAt < WALLET_IDLE_MS) continue;
      if (w.createdTokens.some((a) => world.tokens.has(a))) continue;
      let alive = false;
      for (const token of w.positions.keys()) {
        if (world.tokens.has(token)) {
          alive = true;
          break;
        }
      }
      if (!alive) dead.add(addr);
    }
    if (dead.size === 0) return;
    world.removeWallets(dead);
    this.prunedWallets += dead.size;
  }
}
