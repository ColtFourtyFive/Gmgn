// The World is the simulated multi-chain ledger: chains, tokens (bonding
// curves + AMM pools), wallets and their positions, trades, candles and
// rolling window stats. Every swap -- simulated agent or human paper trade --
// goes through World.executeSwap so analytics see one consistent history.

import { EventEmitter } from 'node:events';
import {
  CHAINS,
  CHAIN_IDS,
  RESOLUTIONS,
  RESOLUTION_SECONDS,
  dexFor,
  getLaunchpad,
  quoteCurveBuy,
  quoteCurveSell,
  quotePoolBuy,
  quotePoolSell,
  curveProgress,
  type Candle,
  type ChainId,
  type CurveState,
  type PnlDistribution,
  type PoolState,
  type Resolution,
  type Side,
  type Socials,
  type StatWindow,
  type SwapResult,
  type TokenStatus,
  type Trade,
  type WalletTag,
  type WindowStats,
} from '@trenchscope/shared';
import { CONGESTION_BASE } from './congestion';
import { Rng, base58Address, evmAddress, txHash } from './rng';

// ---------------------------------------------------------------------------
// Internal state types
// ---------------------------------------------------------------------------

/**
 * Behavioural archetype of a simulated wallet. 'user' = an account's own wallet;
 * 'external' = a real on-chain wallet observed in live mode (no simulated behaviour).
 */
export type Archetype =
  | 'retail'
  | 'smart'
  | 'kol'
  | 'sniper'
  | 'bundler'
  | 'insider'
  | 'dev'
  | 'whale'
  | 'fresh'
  | 'bot'
  | 'sandwich'
  | 'user'
  | 'external';

export interface PositionState {
  token: string;
  balance: number;
  /** Cost basis (USD) of the tokens still held (average-cost method). */
  costBasisUsd: number;
  boughtUsd: number;
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  boughtNative: number;
  soldNative: number;
  buys: number;
  sells: number;
  realizedPnlUsd: number;
  firstBuyAt: number | null;
  lastActiveAt: number;
  /** When the balance last went to ~0 after having bought. */
  closedAt: number | null;
}

export interface WalletState {
  chain: ChainId;
  address: string;
  archetype: Archetype;
  /** Public label (KOL handle), null for anonymous wallets. */
  label: string | null;
  /** Platform-level tags (smart, kol, sniper, whale, fresh, bot, sandwich). */
  tags: Set<WalletTag>;
  native: number;
  createdAt: number;
  fundedBy: string | null;
  fundAmount: number | null;
  /**
   * Token address -> position (includes closed positions). A simulated wallet's positions in
   * tokens the market pruned are dropped (World.dropPositions), their totals kept in `pruned`.
   */
  positions: Map<string, PositionState>;
  /** All-time totals of the positions dropped with pruned tokens (absent until one is). */
  pruned?: PrunedPositions;
  /** Agent skill 0..1: entry timing / exit discipline. */
  skill: number;
  /** Agent risk appetite 0..1: position sizing. */
  aggression: number;
  xFollowers: number | null;
  followerCount: number;
  createdTokens: string[];
  lastActiveAt: number;
  /** Owning account id for 'user' wallets. */
  accountId: string | null;
  /** Arbitrary per-agent memory owned by the market behaviour module. */
  memory: Record<string, unknown>;
}

/** Folded lifetime totals of a wallet's positions in deleted tokens (all-time wallet stats keep counting them). */
export interface PrunedPositions {
  tokens: number;
  /** Positions with a positive realized PnL (a deleted token has no unrealized PnL). */
  wins: number;
  buys: number;
  sells: number;
  /** Fee-inclusive buy cost / net sell proceeds (PositionState.boughtUsd / soldUsd). */
  boughtUsd: number;
  soldUsd: number;
  realizedPnlUsd: number;
  /** Realized PnL / cost buckets of those positions (kept by wallet analytics on 'positionPruned'). */
  distribution?: PnlDistribution;
}

export interface CurveRuntime extends CurveState {
  initialRealTokens: number;
  feeRate: number;
}

export interface PoolRuntime extends PoolState {
  address: string;
  dex: string;
  feeRate: number;
  createdAt: number;
  lpBurnedRate: number;
  initialLiquidityUsd: number;
}

/** One-minute aggregate used for rolling window stats. */
export interface MinuteBucket {
  /** Minute start (ms). */
  t: number;
  open: number;
  close: number;
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  buys: number;
  sells: number;
  makers: Set<string>;
}

/** Hidden "fate" the market module uses to drive a token's lifecycle. */
export type TokenFate = 'dud' | 'rug' | 'slow_rug' | 'pump_dump' | 'runner' | 'moon';

export interface TokenState {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  description: string;
  logoSeed: string;
  logoGlyph: string;
  /** Real token image and metadata URI (live mode). */
  imageUrl?: string | null;
  metadataUri?: string | null;
  narrative: string;
  launchpad: string;
  status: TokenStatus;
  creator: string;
  createdAt: number;
  migratedAt: number | null;
  /** When the curve completed (status -> migrating). */
  completedAt: number | null;
  decimals: number;
  totalSupply: number;
  curve: CurveRuntime | null;
  pool: PoolRuntime | null;
  socials: Socials;
  xFollowers: number | null;
  cto: boolean;
  boosted: boolean;
  isCopycat: boolean;
  /** Static contract properties. */
  renouncedMint: boolean | null;
  renouncedFreeze: boolean | null;
  isOpenSource: boolean | null;
  isRenounced: boolean | null;
  isHoneypot: boolean | null;
  buyTax: number;
  sellTax: number;

  /** Wallets currently holding a non-dust balance. */
  holders: Set<string>;
  /** Every wallet that ever traded the token. */
  traders: Set<string>;
  /** Token-relative cohorts (set at launch by the market module, extended by analytics). */
  bundlers: Set<string>;
  insiders: Set<string>;
  snipers: Set<string>;
  /** Dev team wallets other than the creator. */
  devTeam: Set<string>;

  /** Ring of most recent trades, newest last. */
  trades: Trade[];
  candles: Record<Resolution, Candle[]>;
  buckets: MinuteBucket[];
  athPriceUsd: number;
  athMarketCapUsd: number;
  initialLiquidityUsd: number;
  totalFeesUsd: number;
  lastTradeAt: number;
  tradeCount: number;
  watchers: number;

  // ---- hidden simulation state (never sent to clients) ----
  fate: TokenFate;
  /** Latent demand driver; the market module evolves it. */
  hype: number;
  /** Market module scratch space. */
  sim: Record<string, unknown>;
  /** Analytics cache scratch space (owned by analytics module). */
  cache: Record<string, unknown>;
  /** Bumped on every state change so caches can invalidate. */
  version: number;
  /** True once the token has gone quiet and stops being simulated actively. */
  dormant: boolean;
}

export interface ChainRuntime {
  id: ChainId;
  nativeUsd: number;
  nativeUsdOpen24h: number;
  /** Native price history (minute samples) for 24h change. */
  nativeHistory: { t: number; usd: number }[];
  launches: number[];
  migrations: number[];
  /** Network load 0..1 (sim/congestion.ts), advanced by the market module. */
  congestion: number;
}

export interface SwapOptions {
  /** Platform fee ratio (0 for simulated agents). */
  platformFeeRate?: number;
  /** Network/priority fee in native. */
  networkFee?: number;
  /** Minimum acceptable output; fails if not met (scaled down for a sell clamped to a smaller balance). */
  minOut?: number;
  /** Extra adverse price movement applied (sandwich), ratio of output lost. */
  mevLossRate?: number;
  /** Override timestamp (defaults to world.now). */
  at?: number;
}

export interface SwapOutcome {
  ok: boolean;
  error?: string;
  trade?: Trade;
  result?: SwapResult;
  nativeAmount: number;
  tokenAmount: number;
  usdAmount: number;
  platformFeeNative: number;
  networkFeeNative: number;
  mevLossNative: number;
}

/** A token observed on-chain (live mode). */
export interface ExternalTokenSpec {
  chain: ChainId;
  address: string;
  launchpad: string;
  symbol: string;
  name: string;
  description: string;
  imageUrl: string | null;
  metadataUri: string | null;
  creator: string;
  createdAt: number;
  decimals: number;
  totalSupply: number;
  status: TokenStatus;
  /** Curve state at registration (tokens still on their launchpad). */
  curve: { virtualNative: number; virtualTokens: number; realNative: number; realTokens: number; initialRealTokens: number; feeRate: number } | null;
  pool: Omit<PoolRuntime, 'createdAt' | 'initialLiquidityUsd'> | null;
  socials: Socials;
  narrative: string;
  logoGlyph: string;
}

/**
 * A trade observed on-chain (live feed) or one of our own confirmed fills.
 * Amounts are what the chain reports; reserves / price are the post-trade state.
 */
export interface ExternalTrade {
  wallet: string;
  side: Side;
  /** Native leg as the venue reports it (SOL in for buys, SOL out for sells). */
  nativeAmount: number;
  tokenAmount: number;
  at: number;
  /** Transaction signature (dedupe key with wallet + token). */
  txHash: string;
  slot?: number;
  /** Post-trade curve reserves (bonding-curve trades). */
  curve?: { virtualNative: number; virtualTokens: number; realNative?: number; realTokens?: number };
  /** Post-trade price in native (pool trades without full reserves). */
  priceNative?: number;
  /** Post-trade pool reserves when known. */
  pool?: { native: number; tokens: number };
  /** The trader's token balance after the trade (authoritative; covers transfers we never saw). */
  walletTokenBalance?: number;
  /** Our own fills: platform + network fees paid on top of the native leg. */
  fees?: { platform: number; network: number };
}

export interface WorldEvents {
  trade: [trade: Trade, token: TokenState, wallet: WalletState];
  tokenCreated: [token: TokenState];
  curveCompleted: [token: TokenState];
  tokenMigrated: [token: TokenState];
  walletCreated: [wallet: WalletState];
  /** A KOL publicly "calls" (shills) a token; analytics turns these into call signals. */
  kolCall: [token: TokenState, wallet: WalletState];
  /** Off-chain flag changes: community takeover, paid boost, socials updated. */
  tokenFlag: [token: TokenState, flag: 'cto' | 'boost' | 'socials'];
  /** Inert wallets dropped by housekeeping; listeners should free per-wallet state. */
  walletsRemoved: [addresses: Set<string>];
  /** A position dropped with its pruned token (World.dropPositions), already summed into `wallet.pruned`. */
  positionPruned: [wallet: WalletState, position: PositionState];
}

export interface WorldSnapshot {
  seed: string;
  now: number;
  startedAt: number;
  seq: number;
  tradeTotal: number;
  rng: [number, number, number, number];
  chains: Record<ChainId, ChainRuntime>;
  tokens: TokenState[];
  wallets: WalletState[];
  tokensByChain: Record<ChainId, string[]>;
}

/** Insert `item` into `list` kept ascending by time (appends in the common, already-newest case). */
function insertByTime<T>(list: T[], item: T, at: number, timeOf: (x: T) => number): void {
  let i = list.length;
  while (i > 0 && timeOf(list[i - 1]) > at) i--;
  if (i === list.length) list.push(item);
  else list.splice(i, 0, item);
}

const TRADE_RING = 1500;
/** Trades per token kept in snapshots. */
const SNAPSHOT_TRADES = 100;
const BUCKET_MINUTES = 24 * 60 + 5;
const CANDLE_LIMITS: Record<Resolution, number> = {
  '1s': 1800,
  '15s': 1440,
  '1m': 1440,
  '5m': 2016,
  '15m': 1344,
  '1h': 1000,
  '4h': 600,
  '1d': 400,
};
/** Balances below this share of supply count as "not holding". */
export const DUST_RATE = 1e-7;

export class World extends EventEmitter {
  rng: Rng;
  seed: string;
  /** Simulation clock (ms). Never read Date.now() inside sim code. */
  now: number;
  startedAt: number;
  chains: Record<ChainId, ChainRuntime>;
  tokens = new Map<string, TokenState>();
  wallets = new Map<string, WalletState>();
  /** Token addresses per chain in creation order (oldest first). */
  tokensByChain: Record<ChainId, string[]>;
  /** Wallet addresses per chain grouped by archetype. */
  walletsByArchetype: Record<ChainId, Map<Archetype, string[]>>;
  private seq = 0;
  /** Total trades executed (for tps metrics). */
  tradeTotal = 0;
  /** Modules that need tokens kept alive (open orders, alerts) register sources here. */
  private pinSources: (() => Iterable<string>)[] = [];
  /** `${txHash}|${wallet}|${token}` -> when booked: external trades arrive from several sources. */
  private bookedExternal = new Map<string, number>();

  constructor(seed = 'trenchscope', now = Date.now()) {
    super();
    this.setMaxListeners(100);
    this.seed = seed;
    this.rng = new Rng(seed);
    this.now = now;
    this.startedAt = now;
    this.chains = {} as Record<ChainId, ChainRuntime>;
    this.tokensByChain = {} as Record<ChainId, string[]>;
    this.walletsByArchetype = {} as Record<ChainId, Map<Archetype, string[]>>;
    for (const id of CHAIN_IDS) {
      const usd = CHAINS[id].nativeUsdStart;
      this.chains[id] = { id, nativeUsd: usd, nativeUsdOpen24h: usd, nativeHistory: [{ t: now, usd }], launches: [], migrations: [], congestion: CONGESTION_BASE };
      this.tokensByChain[id] = [];
      this.walletsByArchetype[id] = new Map();
    }
  }

  // Typed event helpers -----------------------------------------------------
  override emit<K extends keyof WorldEvents>(event: K, ...args: WorldEvents[K]): boolean {
    return super.emit(event, ...args);
  }
  override on<K extends keyof WorldEvents>(event: K, listener: (...args: WorldEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override off<K extends keyof WorldEvents>(event: K, listener: (...args: WorldEvents[K]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  nextId(prefix = 'id'): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString(36)}`;
  }

  // ---------------------------------------------------------------------------
  // Addresses & lookups
  // ---------------------------------------------------------------------------

  newAddress(chain: ChainId, suffix = ''): string {
    const style = CHAINS[chain].addressStyle;
    for (;;) {
      const addr = style === 'evm' ? evmAddress(this.rng, suffix) : base58Address(this.rng, this.rng.int(43, 44), suffix);
      if (!this.wallets.has(addr) && !this.tokens.has(addr)) return addr;
    }
  }

  newTxHash(chain: ChainId): string {
    return txHash(this.rng, CHAINS[chain].addressStyle);
  }

  blockAt(chain: ChainId, t: number = this.now): number {
    return Math.floor(t / CHAINS[chain].blockTimeMs);
  }

  getToken(address: string): TokenState | undefined {
    return this.tokens.get(address);
  }

  getWallet(address: string): WalletState | undefined {
    return this.wallets.get(address);
  }

  nativeUsd(chain: ChainId): number {
    return this.chains[chain].nativeUsd;
  }

  // ---------------------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------------------

  priceNative(t: TokenState): number {
    if (t.pool) return t.pool.tokens > 0 ? t.pool.native / t.pool.tokens : 0;
    if (t.curve) return t.curve.virtualNative / t.curve.virtualTokens;
    return 0;
  }

  priceUsd(t: TokenState): number {
    return this.priceNative(t) * this.nativeUsd(t.chain);
  }

  marketCapUsd(t: TokenState): number {
    return this.priceUsd(t) * t.totalSupply;
  }

  /** Liquidity (USD) counting both sides of the pool / curve, like screeners do. */
  liquidityUsd(t: TokenState): number {
    const usd = this.nativeUsd(t.chain);
    if (t.pool) return 2 * t.pool.native * usd;
    if (t.curve) return 2 * t.curve.realNative * usd; // only real native counts, not the virtual reserve
    return 0;
  }

  progress(t: TokenState): number {
    if (t.status !== 'curve' || !t.curve) return 1;
    return curveProgress(t.curve, t.curve.initialRealTokens);
  }

  /** Market cap (USD) at which the curve completes, at the current native price. */
  graduationMarketCapUsd(t: TokenState): number {
    if (!t.curve) return this.marketCapUsd(t);
    const k = t.curve.virtualNative * t.curve.virtualTokens;
    const vtEnd = t.curve.virtualTokens - t.curve.realTokens;
    if (vtEnd <= 0) return this.marketCapUsd(t);
    const vnEnd = k / vtEnd;
    return (vnEnd / vtEnd) * t.totalSupply * this.nativeUsd(t.chain);
  }

  // ---------------------------------------------------------------------------
  // Wallets
  // ---------------------------------------------------------------------------

  createWallet(
    chain: ChainId,
    archetype: Archetype,
    opts: Partial<Pick<WalletState, 'label' | 'native' | 'fundedBy' | 'fundAmount' | 'skill' | 'aggression' | 'xFollowers' | 'accountId' | 'createdAt'>> & {
      address?: string;
      tags?: WalletTag[];
    } = {},
  ): WalletState {
    const address = opts.address ?? this.newAddress(chain);
    const w: WalletState = {
      chain,
      address,
      archetype,
      label: opts.label ?? null,
      tags: new Set(opts.tags ?? []),
      native: opts.native ?? 0,
      createdAt: opts.createdAt ?? this.now,
      fundedBy: opts.fundedBy ?? null,
      fundAmount: opts.fundAmount ?? null,
      positions: new Map(),
      skill: opts.skill ?? 0.5,
      aggression: opts.aggression ?? 0.5,
      xFollowers: opts.xFollowers ?? null,
      followerCount: 0,
      createdTokens: [],
      lastActiveAt: opts.createdAt ?? this.now,
      accountId: opts.accountId ?? null,
      memory: {},
    };
    this.wallets.set(address, w);
    const byArch = this.walletsByArchetype[chain];
    if (!byArch.has(archetype)) byArch.set(archetype, []);
    byArch.get(archetype)!.push(address);
    this.emit('walletCreated', w);
    return w;
  }

  walletsOf(chain: ChainId, archetype: Archetype): string[] {
    return this.walletsByArchetype[chain].get(archetype) ?? [];
  }

  /** Move native between wallets (funding links are what insider/bundler detection keys on). */
  transferNative(from: WalletState | null, to: WalletState, amount: number): boolean {
    if (amount <= 0) return false;
    if (from) {
      if (from.native < amount) return false;
      from.native -= amount;
    }
    to.native += amount;
    if (from && !to.fundedBy) {
      to.fundedBy = from.address;
      to.fundAmount = amount;
    }
    return true;
  }

  /**
   * Remove wallets nothing references any more (e.g. single-use bundlers whose
   * tokens were pruned). Callers guarantee no token holds them as a holder.
   */
  removeWallets(addresses: Set<string>): void {
    if (addresses.size === 0) return;
    const chains = new Set<ChainId>();
    for (const addr of addresses) {
      const w = this.wallets.get(addr);
      if (!w) continue;
      chains.add(w.chain);
      this.wallets.delete(addr);
    }
    for (const chain of chains) {
      for (const [arch, list] of this.walletsByArchetype[chain]) {
        const kept = list.filter((a) => !addresses.has(a));
        if (kept.length !== list.length) this.walletsByArchetype[chain].set(arch, kept);
      }
    }
    this.emit('walletsRemoved', addresses);
  }

  /**
   * Drop simulated wallets' positions in tokens just deleted from the world, so per-wallet state
   * stays bounded once the token cap is reached. Their totals are folded into `wallet.pruned`
   * ('positionPruned' fires for each). Account wallets keep every position.
   */
  dropPositions(tokens: Iterable<TokenState>): void {
    for (const t of tokens) {
      for (const addr of t.traders) this.dropPosition(this.wallets.get(addr), t.address);
    }
  }

  /** dropPositions for snapshots written before positions were dropped: every position whose token is gone. */
  dropOrphanPositions(): void {
    for (const w of this.wallets.values()) {
      if (w.accountId) continue;
      for (const token of w.positions.keys()) if (!this.tokens.has(token)) this.dropPosition(w, token);
    }
  }

  private dropPosition(w: WalletState | undefined, token: string): void {
    const pos = w?.positions.get(token);
    if (!w || !pos || w.accountId) return;
    const p = (w.pruned ??= { tokens: 0, wins: 0, buys: 0, sells: 0, boughtUsd: 0, soldUsd: 0, realizedPnlUsd: 0 });
    p.tokens++;
    if (pos.realizedPnlUsd > 0) p.wins++;
    p.buys += pos.buys;
    p.sells += pos.sells;
    p.boughtUsd += pos.boughtUsd;
    p.soldUsd += pos.soldUsd;
    p.realizedPnlUsd += pos.realizedPnlUsd;
    this.emit('positionPruned', w, pos);
    w.positions.delete(token);
  }

  /** Register a source of token addresses that must survive pruning. */
  addPinSource(source: () => Iterable<string>): void {
    this.pinSources.push(source);
  }

  /** Token addresses currently pinned by any module. */
  pinnedTokens(): Set<string> {
    const pinned = new Set<string>();
    for (const source of this.pinSources) for (const addr of source()) pinned.add(addr);
    return pinned;
  }

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------

  createToken(spec: {
    chain: ChainId;
    launchpad: string;
    creator: WalletState;
    symbol: string;
    name: string;
    description: string;
    logoSeed: string;
    logoGlyph: string;
    narrative: string;
    socials: Socials;
    xFollowers: number | null;
    fate: TokenFate;
    hype: number;
    isCopycat?: boolean;
    security?: Partial<Pick<TokenState, 'renouncedMint' | 'renouncedFreeze' | 'isOpenSource' | 'isRenounced' | 'isHoneypot' | 'buyTax' | 'sellTax'>>;
    address?: string;
  }): TokenState {
    const lp = getLaunchpad(spec.launchpad);
    if (!lp || lp.chain !== spec.chain) throw new Error(`unknown launchpad ${spec.launchpad} for ${spec.chain}`);
    const isSol = spec.chain === 'sol';
    const vanity = isSol ? (lp.id === 'bonkfire' ? 'bonk' : lp.id === 'moonpit' ? 'pit' : '') : '';
    const address = spec.address ?? this.newAddress(spec.chain, vanity);
    const candles = {} as Record<Resolution, Candle[]>;
    for (const r of RESOLUTIONS) candles[r] = [];
    const t: TokenState = {
      chain: spec.chain,
      address,
      symbol: spec.symbol,
      name: spec.name,
      description: spec.description,
      logoSeed: spec.logoSeed,
      logoGlyph: spec.logoGlyph,
      narrative: spec.narrative,
      launchpad: lp.id,
      status: 'curve',
      creator: spec.creator.address,
      createdAt: this.now,
      migratedAt: null,
      completedAt: null,
      decimals: isSol ? 6 : 18,
      totalSupply: lp.totalSupply,
      curve: {
        virtualNative: lp.virtualNative,
        virtualTokens: lp.virtualTokens,
        realNative: 0,
        realTokens: lp.curveTokens,
        initialRealTokens: lp.curveTokens,
        feeRate: lp.feeRate,
      },
      pool: null,
      socials: spec.socials,
      xFollowers: spec.xFollowers,
      cto: false,
      boosted: false,
      isCopycat: spec.isCopycat ?? false,
      renouncedMint: isSol ? true : null,
      renouncedFreeze: isSol ? true : null,
      isOpenSource: isSol ? null : true,
      isRenounced: isSol ? null : true,
      isHoneypot: isSol ? null : false,
      buyTax: 0,
      sellTax: 0,
      holders: new Set(),
      traders: new Set(),
      bundlers: new Set(),
      insiders: new Set(),
      snipers: new Set(),
      devTeam: new Set(),
      trades: [],
      candles,
      buckets: [],
      athPriceUsd: 0,
      athMarketCapUsd: 0,
      initialLiquidityUsd: 0,
      totalFeesUsd: 0,
      lastTradeAt: this.now,
      tradeCount: 0,
      watchers: 0,
      fate: spec.fate,
      hype: spec.hype,
      sim: {},
      cache: {},
      version: 0,
      dormant: false,
      ...spec.security,
    };
    const price = this.priceUsd(t);
    t.athPriceUsd = price;
    t.athMarketCapUsd = price * t.totalSupply;
    t.initialLiquidityUsd = lp.virtualNative * this.nativeUsd(t.chain);
    this.tokens.set(address, t);
    this.tokensByChain[spec.chain].push(address);
    spec.creator.createdTokens.push(address);
    this.chains[spec.chain].launches.push(this.now);
    this.emit('tokenCreated', t);
    return t;
  }

  // ---------------------------------------------------------------------------
  // Live mode: state observed on-chain
  // ---------------------------------------------------------------------------

  /**
   * The wallet at `address`, registered as an observed real wallet when new.
   * Its creation time is unknown (0) until something looks it up.
   */
  ensureWallet(chain: ChainId, address: string): WalletState {
    return this.wallets.get(address) ?? this.createWallet(chain, 'external', { address, createdAt: 0 });
  }

  /** Register a token seen on-chain; returns the known token when it is already tracked. */
  addExternalToken(spec: ExternalTokenSpec): TokenState {
    const known = this.tokens.get(spec.address);
    if (known) return known;
    const creator = this.ensureWallet(spec.chain, spec.creator);
    const candles = {} as Record<Resolution, Candle[]>;
    for (const r of RESOLUTIONS) candles[r] = [];
    const t: TokenState = {
      chain: spec.chain,
      address: spec.address,
      symbol: spec.symbol,
      name: spec.name,
      description: spec.description,
      logoSeed: spec.address.slice(0, 10),
      logoGlyph: spec.logoGlyph,
      imageUrl: spec.imageUrl,
      metadataUri: spec.metadataUri,
      narrative: spec.narrative,
      launchpad: spec.launchpad,
      status: spec.status,
      creator: creator.address,
      createdAt: spec.createdAt,
      migratedAt: spec.status === 'migrated' ? spec.createdAt : null,
      completedAt: null,
      decimals: spec.decimals,
      totalSupply: spec.totalSupply,
      curve: spec.curve ? { ...spec.curve } : null,
      pool: spec.pool ? { ...spec.pool, createdAt: spec.createdAt, initialLiquidityUsd: 2 * spec.pool.native * this.nativeUsd(spec.chain) } : null,
      socials: spec.socials,
      xFollowers: null,
      cto: false,
      boosted: false,
      isCopycat: false,
      // Launchpad mints renounce both authorities; the live security check confirms on-chain.
      renouncedMint: spec.chain === 'sol' ? true : null,
      renouncedFreeze: spec.chain === 'sol' ? true : null,
      isOpenSource: spec.chain === 'sol' ? null : true,
      isRenounced: spec.chain === 'sol' ? null : true,
      isHoneypot: spec.chain === 'sol' ? null : false,
      buyTax: 0,
      sellTax: 0,
      holders: new Set(),
      traders: new Set(),
      bundlers: new Set(),
      insiders: new Set(),
      snipers: new Set(),
      devTeam: new Set(),
      trades: [],
      candles,
      buckets: [],
      athPriceUsd: 0,
      athMarketCapUsd: 0,
      initialLiquidityUsd: 0,
      totalFeesUsd: 0,
      lastTradeAt: spec.createdAt,
      tradeCount: 0,
      watchers: 0,
      fate: 'dud',
      hype: 0,
      sim: {},
      cache: {},
      version: 0,
      dormant: false,
    };
    const price = this.priceUsd(t);
    t.athPriceUsd = price;
    t.athMarketCapUsd = price * t.totalSupply;
    t.initialLiquidityUsd = t.pool ? t.pool.initialLiquidityUsd : (t.curve?.virtualNative ?? 0) * this.nativeUsd(t.chain);
    this.tokens.set(t.address, t);
    // tokensByChain stays in creation order (lists scan it newest first and stop at the first old
    // token): a token loaded on demand, created long ago, is filed at its place, not at the end.
    insertByTime(this.tokensByChain[t.chain], t.address, t.createdAt, (a) => this.tokens.get(a)?.createdAt ?? 0);
    creator.createdTokens.push(t.address);
    // Only launches of the last hour count (the 1h counter is kept sorted for pruneCounters).
    if (spec.status === 'curve' && spec.createdAt >= this.now - 3600_000) insertByTime(this.chains[t.chain].launches, spec.createdAt, spec.createdAt, (x) => x);
    this.emit('tokenCreated', t);
    return t;
  }

  /**
   * Live mode: a holder's balance as the chain reports it (top-holder reads), without a trade.
   * A balance that fell keeps its average cost per token; tokens of unknown cost (a new holder, or
   * more than we saw bought) enter at the current price, so they show no made-up profit.
   */
  syncHolderBalance(t: TokenState, address: string, balance: number): void {
    if (!Number.isFinite(balance) || balance < 0) return;
    const wallet = this.ensureWallet(t.chain, address);
    let pos = wallet.positions.get(t.address);
    const before = pos?.balance ?? 0;
    if (Math.abs(before - balance) <= Math.max(before, balance) * 1e-9) return;
    const dust = balance <= t.totalSupply * DUST_RATE;
    if (!pos) {
      if (dust) return;
      pos = {
        token: t.address,
        balance: 0,
        costBasisUsd: 0,
        boughtUsd: 0,
        soldUsd: 0,
        boughtTokens: 0,
        soldTokens: 0,
        boughtNative: 0,
        soldNative: 0,
        buys: 0,
        sells: 0,
        realizedPnlUsd: 0,
        firstBuyAt: null,
        lastActiveAt: this.now,
        closedAt: null,
      };
      wallet.positions.set(t.address, pos);
    }
    if (balance < before) pos.costBasisUsd *= before > 0 ? balance / before : 0;
    else pos.costBasisUsd += (balance - before) * this.priceUsd(t);
    pos.balance = dust ? 0 : balance;
    if (dust) {
      pos.costBasisUsd = 0;
      pos.closedAt ??= this.now;
      t.holders.delete(address);
    } else {
      pos.closedAt = null;
      t.holders.add(address);
    }
    // A position the World holds must be reachable from the token (pruning drops it through traders).
    t.traders.add(address);
    t.version++;
  }

  /**
   * Book a trade observed on-chain. Idempotent per (signature, wallet, token): the
   * same swap can arrive from the feed and from our own fill confirmation.
   * Returns null for a duplicate or an empty trade.
   */
  recordExternalTrade(t: TokenState, e: ExternalTrade): Trade | null {
    if (!(e.tokenAmount > 0) || !(e.nativeAmount >= 0)) return null;
    const key = `${e.txHash}|${e.wallet}|${t.address}`;
    if (this.bookedExternal.has(key)) return null;
    this.bookedExternal.set(key, e.at);
    const wallet = this.ensureWallet(t.chain, e.wallet);
    if (e.curve && t.curve) {
      t.curve.virtualNative = e.curve.virtualNative;
      t.curve.virtualTokens = e.curve.virtualTokens;
      if (e.curve.realNative !== undefined) t.curve.realNative = e.curve.realNative;
      if (e.curve.realTokens !== undefined) t.curve.realTokens = e.curve.realTokens;
    }
    if (t.pool) {
      if (e.pool) {
        t.pool.native = e.pool.native;
        t.pool.tokens = e.pool.tokens;
      } else if (e.priceNative && e.priceNative > 0) {
        // Only the price is known: keep the pool's native depth and solve its token side.
        t.pool.tokens = t.pool.native / e.priceNative;
      }
    }
    const fees = e.fees ?? { platform: 0, network: 0 };
    const venueFeeRate = t.pool?.feeRate ?? t.curve?.feeRate ?? 0;
    const completes = t.status === 'curve' && !!t.curve && t.curve.realTokens <= 0;
    return this.book(wallet, t, e.side, {
      at: e.at,
      nativeForTrade: e.nativeAmount,
      tokenQty: e.tokenAmount,
      platformFee: fees.platform,
      networkFee: fees.network,
      // Native balances of real wallets come from the chain, not from our bookkeeping.
      trackNative: false,
      venueFeeNative: e.nativeAmount * venueFeeRate,
      txHash: e.txHash,
      block: e.slot ?? this.blockAt(t.chain, e.at),
      completes,
      walletTokenBalance: e.walletTokenBalance,
    });
  }

  /**
   * Live mode: a real wallet's balances as the chain reports them. `native` (null = unknown)
   * replaces the native balance. With `tokens` (mint -> amount, every token the wallet holds)
   * positions follow the chain: a balance moved by transfers we never saw keeps its average cost
   * per token, a token held but never bought here opens a position without cost basis, and a
   * held position missing from `tokens` closes. Returns the positions changed and the held mints
   * the World does not track.
   */
  syncWalletBalances(wallet: WalletState, native: number | null, tokens?: Map<string, number>): { changed: string[]; unknown: string[] } {
    if (native !== null && Number.isFinite(native) && native >= 0) wallet.native = native;
    const changed: string[] = [];
    const unknown: string[] = [];
    if (!tokens) return { changed, unknown };
    const at = this.now;
    const apply = (t: TokenState, pos: PositionState, amount: number) => {
      const dust = amount <= t.totalSupply * DUST_RATE;
      if (pos.balance > 0 && amount < pos.balance) pos.costBasisUsd *= amount / pos.balance;
      pos.balance = dust ? 0 : amount;
      if (dust) {
        pos.costBasisUsd = 0;
        pos.closedAt ??= at;
        t.holders.delete(wallet.address);
      } else {
        pos.closedAt = null;
        t.holders.add(wallet.address);
      }
      t.version++;
      changed.push(t.address);
    };
    for (const [mint, amount] of tokens) {
      if (!Number.isFinite(amount) || amount < 0) continue;
      const t = this.tokens.get(mint);
      if (!t) {
        if (amount > 0) unknown.push(mint);
        continue;
      }
      if (t.chain !== wallet.chain) continue;
      let pos = wallet.positions.get(mint);
      const before = pos?.balance ?? 0;
      if (Math.abs(before - amount) <= Math.max(before, amount) * 1e-12) continue;
      if (!pos) {
        if (amount <= t.totalSupply * DUST_RATE) continue;
        pos = {
          token: mint,
          balance: 0,
          costBasisUsd: 0,
          boughtUsd: 0,
          soldUsd: 0,
          boughtTokens: 0,
          soldTokens: 0,
          boughtNative: 0,
          soldNative: 0,
          buys: 0,
          sells: 0,
          realizedPnlUsd: 0,
          firstBuyAt: null,
          lastActiveAt: at,
          closedAt: null,
        };
        wallet.positions.set(mint, pos);
      }
      apply(t, pos, amount);
    }
    for (const [mint, pos] of wallet.positions) {
      if (pos.balance <= 0 || tokens.has(mint)) continue;
      const t = this.tokens.get(mint);
      if (t) apply(t, pos, 0);
    }
    return { changed, unknown };
  }

  /** The curve is complete on-chain (the launchpad's complete event): trading pauses until migration. */
  completeCurve(t: TokenState, at: number): void {
    if (t.status !== 'curve') return;
    t.status = 'migrating';
    t.completedAt = at;
    if (t.curve) t.curve.realTokens = 0;
    t.version++;
    this.emit('curveCompleted', t);
  }

  /** The token now trades on an AMM pool, as reported on-chain. */
  migrateExternal(t: TokenState, pool: Omit<PoolRuntime, 'createdAt' | 'initialLiquidityUsd'>, at: number): void {
    if (t.status === 'migrated' && t.pool) return;
    t.pool = { ...pool, createdAt: at, initialLiquidityUsd: 2 * pool.native * this.nativeUsd(t.chain) };
    if (t.curve) t.curve = { ...t.curve, realTokens: 0 };
    t.status = 'migrated';
    t.completedAt ??= at;
    t.migratedAt = at;
    t.version++;
    this.chains[t.chain].migrations.push(at);
    this.emit('tokenMigrated', t);
  }

  /** Move a completed curve into an AMM pool. Called by the market module after a short delay. */
  migrate(t: TokenState): void {
    if (t.status === 'migrated' || !t.curve) return;
    const lp = getLaunchpad(t.launchpad)!;
    const dex = dexFor(t.chain);
    const poolNative = Math.max(t.curve.realNative - lp.migrationFeeNative, t.curve.realNative * 0.5);
    const poolTokens = t.totalSupply - lp.curveTokens + Math.max(0, t.curve.realTokens);
    t.pool = {
      address: this.newAddress(t.chain),
      dex: dex.name,
      feeRate: dex.feeRate,
      native: poolNative,
      tokens: poolTokens,
      createdAt: this.now,
      lpBurnedRate: 1,
      initialLiquidityUsd: 2 * poolNative * this.nativeUsd(t.chain),
    };
    t.curve = { ...t.curve, realTokens: 0 };
    t.status = 'migrated';
    t.migratedAt = this.now;
    t.version++;
    this.chains[t.chain].migrations.push(this.now);
    this.emit('tokenMigrated', t);
  }

  // ---------------------------------------------------------------------------
  // Swaps
  // ---------------------------------------------------------------------------

  /** Pure quote: what would `amountIn` (native for buys, tokens for sells) return right now? */
  quote(t: TokenState, side: Side, amountIn: number): SwapResult | null {
    if (amountIn <= 0) return null;
    if (t.status === 'migrating') return null;
    if (t.pool) return side === 'buy' ? quotePoolBuy(t.pool, amountIn, t.pool.feeRate) : quotePoolSell(t.pool, amountIn, t.pool.feeRate);
    if (t.curve) return side === 'buy' ? quoteCurveBuy(t.curve, amountIn, t.curve.feeRate) : quoteCurveSell(t.curve, amountIn, t.curve.feeRate);
    return null;
  }

  /**
   * Execute a swap for `wallet` on `token`.
   * buy: `amountIn` is native to spend (platform + network fees are charged on top).
   * sell: `amountIn` is the token amount to sell (fees are deducted from proceeds).
   */
  executeSwap(wallet: WalletState, t: TokenState, side: Side, amountIn: number, opts: SwapOptions = {}): SwapOutcome {
    const fail = (error: string): SwapOutcome => ({
      ok: false,
      error,
      nativeAmount: 0,
      tokenAmount: 0,
      usdAmount: 0,
      platformFeeNative: 0,
      networkFeeNative: 0,
      mevLossNative: 0,
    });
    if (wallet.chain !== t.chain) return fail('wallet and token are on different chains');
    if (!(amountIn > 0) || !Number.isFinite(amountIn)) return fail('amount must be positive');
    if (t.status === 'migrating') return fail('token is migrating; try again in a few seconds');
    const at = opts.at ?? this.now;
    const platformFeeRate = opts.platformFeeRate ?? 0;
    const networkFee = opts.networkFee ?? 0;
    const mevLossRate = Math.max(0, opts.mevLossRate ?? 0);
    const nativeUsd = this.nativeUsd(t.chain);

    let pos = wallet.positions.get(t.address);
    let nativeDelta: number; // change to wallet native balance
    let tokenDelta: number; // change to wallet token balance
    let nativeForTrade: number; // native leg recorded on the trade (gross for buys, net for sells)
    let platformFee = 0;
    let mevLoss = 0;
    let result: SwapResult;

    if (side === 'buy') {
      // Buying a honeypot is allowed -- that is the trap; selling is what fails.
      const taxed = amountIn * (1 - t.buyTax);
      const q = this.quote(t, 'buy', taxed);
      if (!q || q.amountOut <= 0) return fail('no liquidity');
      // When the curve caps the fill only the native actually used is charged (so only it must be held).
      const used = q.amountIn / (1 - t.buyTax);
      platformFee = used * platformFeeRate;
      if (wallet.native + 1e-12 < used + platformFee + networkFee) return fail('insufficient native balance');
      result = q;
      let out = q.amountOut;
      if (mevLossRate > 0) {
        mevLoss = amountIn * mevLossRate;
        out *= 1 - mevLossRate;
      }
      if (opts.minOut !== undefined && out < opts.minOut) return fail('slippage exceeded');
      nativeDelta = -(used + platformFee + networkFee);
      tokenDelta = out;
      nativeForTrade = used;
      this.applyReserves(t, 'buy', q, out);
    } else {
      const balance = pos?.balance ?? 0;
      if (balance <= 0) return fail('no token balance');
      const sellAmount = Math.min(amountIn, balance);
      if (t.isHoneypot && wallet.address !== t.creator && !t.devTeam.has(wallet.address)) return fail('transfer blocked by token contract');
      const q = this.quote(t, 'sell', sellAmount);
      if (!q || q.amountOut <= 0) return fail('no liquidity');
      result = q;
      let out = q.amountOut * (1 - t.sellTax);
      if (mevLossRate > 0) {
        mevLoss = out * mevLossRate;
        out -= mevLoss;
      }
      platformFee = out * platformFeeRate;
      const net = out - platformFee - networkFee;
      // A sell of more than is left (another sell of the wallet landed first) sells the rest, held
      // to the same minimum per token: the minimum before the network fee scales with the share sold.
      const minOut = opts.minOut === undefined || sellAmount >= amountIn ? opts.minOut : ((opts.minOut + networkFee) * sellAmount) / amountIn - networkFee;
      if (minOut !== undefined && net < minOut) return fail('slippage exceeded');
      if (net <= 0) return fail('proceeds do not cover fees');
      nativeDelta = net;
      tokenDelta = -sellAmount;
      nativeForTrade = out;
      this.applyReserves(t, 'sell', q, sellAmount);
    }

    const trade = this.book(wallet, t, side, {
      at,
      nativeForTrade,
      tokenQty: Math.abs(tokenDelta),
      platformFee,
      networkFee,
      trackNative: true,
      nativeDelta,
      venueFeeNative: result.venueFee,
      txHash: this.newTxHash(t.chain),
      block: this.blockAt(t.chain, at),
      completes: result.completesCurve,
    });
    const usdAmount = trade.usdAmount;
    const tradeTokenAmount = trade.tokenAmount;

    return {
      ok: true,
      trade,
      result,
      nativeAmount: nativeForTrade,
      tokenAmount: tradeTokenAmount,
      usdAmount,
      platformFeeNative: platformFee,
      networkFeeNative: networkFee,
      mevLossNative: mevLoss,
    };
  }

  /**
   * Shared trade bookkeeping: position (average cost), wallet, token indexes,
   * trade ring, candles, minute buckets, ATH; then the trade event (and the curve
   * completion, which is applied first so listeners see the real state).
   */
  private book(
    wallet: WalletState,
    t: TokenState,
    side: Side,
    b: {
      at: number;
      /** Native leg on the trade (gross of platform/network fees). */
      nativeForTrade: number;
      tokenQty: number;
      platformFee: number;
      networkFee: number;
      /** Apply nativeDelta to wallet.native (simulated wallets); real wallets sync from the chain. */
      trackNative: boolean;
      /** Change to the wallet's native balance (defaults to cost / proceeds from the legs and fees). */
      nativeDelta?: number;
      venueFeeNative: number;
      txHash: string;
      block: number;
      completes: boolean;
      /** Authoritative post-trade token balance (live feed). */
      walletTokenBalance?: number;
    },
  ): Trade {
    const { at } = b;
    const nativeUsd = this.nativeUsd(t.chain);
    const costNative = b.nativeForTrade + b.platformFee + b.networkFee;
    const proceedsNative = b.nativeForTrade - b.platformFee - b.networkFee;
    const nativeDelta = b.nativeDelta ?? (side === 'buy' ? -costNative : proceedsNative);
    if (b.trackNative) {
      wallet.native += nativeDelta;
      if (wallet.native < 0) wallet.native = 0;
    }
    let pos = wallet.positions.get(t.address);
    if (!pos) {
      pos = {
        token: t.address,
        balance: 0,
        costBasisUsd: 0,
        boughtUsd: 0,
        soldUsd: 0,
        boughtTokens: 0,
        soldTokens: 0,
        boughtNative: 0,
        soldNative: 0,
        buys: 0,
        sells: 0,
        realizedPnlUsd: 0,
        firstBuyAt: null,
        lastActiveAt: at,
        closedAt: null,
      };
      wallet.positions.set(t.address, pos);
    }
    const usdAmount = b.nativeForTrade * nativeUsd;
    let realized: number | null = null;
    if (side === 'buy') {
      const costUsd = costNative * nativeUsd;
      pos.balance += b.tokenQty;
      pos.costBasisUsd += costUsd;
      pos.boughtUsd += costUsd;
      pos.boughtTokens += b.tokenQty;
      pos.boughtNative += b.trackNative ? -nativeDelta : costNative;
      pos.buys += 1;
      if (pos.firstBuyAt === null) pos.firstBuyAt = at;
      pos.closedAt = null;
    } else {
      // A real wallet can sell tokens it received by transfer: never sell below zero.
      const sold = Math.min(b.tokenQty, Math.max(pos.balance, b.trackNative ? 0 : b.tokenQty));
      const avgCost = pos.balance > 0 ? pos.costBasisUsd / pos.balance : 0;
      const costOut = avgCost * Math.min(sold, pos.balance);
      const proceeds = b.trackNative ? nativeDelta : proceedsNative;
      const proceedsUsd = proceeds * nativeUsd;
      realized = proceedsUsd - costOut;
      pos.realizedPnlUsd += realized;
      pos.costBasisUsd = Math.max(0, pos.costBasisUsd - costOut);
      pos.balance = Math.max(0, pos.balance - sold);
      pos.soldUsd += proceedsUsd;
      pos.soldTokens += sold;
      pos.soldNative += proceeds;
      pos.sells += 1;
    }
    if (b.walletTokenBalance !== undefined && Number.isFinite(b.walletTokenBalance) && b.walletTokenBalance >= 0) {
      // Transfers in/out happened that we never saw: keep the average cost per token we know.
      if (pos.balance > 0 && b.walletTokenBalance < pos.balance) pos.costBasisUsd *= b.walletTokenBalance / pos.balance;
      pos.balance = b.walletTokenBalance;
    }
    if (side === 'sell' && pos.balance <= t.totalSupply * DUST_RATE) {
      pos.balance = 0;
      pos.costBasisUsd = 0;
      pos.closedAt = at;
    }
    pos.lastActiveAt = at;
    wallet.lastActiveAt = Math.max(wallet.lastActiveAt, at);

    t.traders.add(wallet.address);
    if (pos.balance > t.totalSupply * DUST_RATE) t.holders.add(wallet.address);
    else t.holders.delete(wallet.address);

    const priceNative = this.priceNative(t);
    const priceUsd = priceNative * nativeUsd;
    const mcap = priceUsd * t.totalSupply;
    const execPriceUsd = b.tokenQty > 0 ? usdAmount / b.tokenQty : priceUsd;

    const trade: Trade = {
      id: this.nextId('tx'),
      chain: t.chain,
      token: t.address,
      tokenSymbol: t.symbol,
      wallet: wallet.address,
      walletTags: this.tradeTags(t, wallet),
      walletLabel: wallet.label,
      side,
      nativeAmount: b.nativeForTrade,
      tokenAmount: b.tokenQty,
      usdAmount,
      priceUsd: execPriceUsd,
      priceNative: b.tokenQty > 0 ? b.nativeForTrade / b.tokenQty : priceNative,
      marketCapUsd: mcap,
      timestamp: at,
      txHash: b.txHash,
      block: b.block,
      isDev: wallet.address === t.creator || t.devTeam.has(wallet.address),
      makerHoldRate: t.totalSupply > 0 ? pos.balance / t.totalSupply : 0,
      realizedPnlUsd: realized,
    };

    t.trades.push(trade);
    if (t.trades.length > TRADE_RING) t.trades.splice(0, t.trades.length - TRADE_RING);
    t.tradeCount += 1;
    t.lastTradeAt = Math.max(t.lastTradeAt, at);
    t.totalFeesUsd += b.venueFeeNative * nativeUsd;
    if (priceUsd > t.athPriceUsd) {
      t.athPriceUsd = priceUsd;
      t.athMarketCapUsd = mcap;
    }
    this.recordCandle(t, at, priceUsd, usdAmount);
    this.recordBucket(t, at, priceUsd, usdAmount, side, wallet.address);
    t.version++;
    this.tradeTotal++;

    // A buy that completes the curve stops trading before anyone hears of it, so
    // listeners reacting to the trade (copy trades, orders) see the real state.
    const completed = b.completes && t.status === 'curve';
    if (completed) {
      t.status = 'migrating';
      t.completedAt = at;
      t.version++;
    }
    this.emit('trade', trade, t, wallet);
    if (completed) this.emit('curveCompleted', t);
    return trade;
  }

  private applyReserves(t: TokenState, side: Side, q: SwapResult, tokenQty: number): void {
    if (t.pool) {
      const fee = t.pool.feeRate;
      if (side === 'buy') {
        t.pool.native += q.amountIn * (1 - fee);
        t.pool.tokens -= q.amountOut;
      } else {
        t.pool.tokens += tokenQty * (1 - fee);
        t.pool.native -= q.amountOut;
      }
      if (t.pool.tokens < 1) t.pool.tokens = 1;
      if (t.pool.native < 1e-9) t.pool.native = 1e-9;
      return;
    }
    if (t.curve) {
      if (side === 'buy') {
        const netIn = q.amountIn - q.venueFee;
        t.curve.virtualNative += netIn;
        t.curve.realNative += netIn;
        t.curve.virtualTokens -= q.amountOut;
        t.curve.realTokens = Math.max(0, t.curve.realTokens - q.amountOut);
      } else {
        const gross = q.amountOut + q.venueFee;
        t.curve.virtualNative -= gross;
        t.curve.realNative = Math.max(0, t.curve.realNative - gross);
        t.curve.virtualTokens += tokenQty;
        t.curve.realTokens += tokenQty;
      }
    }
  }

  /** Token-relative + platform tags for a trade maker (viewer-relative tags are added by the API). */
  tradeTags(t: TokenState, w: WalletState): WalletTag[] {
    const tags: WalletTag[] = [];
    if (w.address === t.creator || t.devTeam.has(w.address)) tags.push('dev');
    if (t.snipers.has(w.address)) tags.push('sniper');
    if (t.bundlers.has(w.address)) tags.push('bundler');
    if (t.insiders.has(w.address)) tags.push('insider');
    for (const tag of w.tags) if (!tags.includes(tag)) tags.push(tag);
    return tags;
  }

  // ---------------------------------------------------------------------------
  // Candles & rolling stats
  // ---------------------------------------------------------------------------

  private recordCandle(t: TokenState, at: number, price: number, volumeUsd: number): void {
    const sec = Math.floor(at / 1000);
    for (const r of RESOLUTIONS) {
      const step = RESOLUTION_SECONDS[r];
      const bucket = sec - (sec % step);
      const arr = t.candles[r];
      const last = arr[arr.length - 1];
      if (last && last.time === bucket) {
        if (price > last.high) last.high = price;
        if (price < last.low) last.low = price;
        last.close = price;
        last.volume += volumeUsd;
      } else if (!last || bucket > last.time) {
        const open = last ? last.close : price;
        arr.push({ time: bucket, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: volumeUsd });
        const limit = CANDLE_LIMITS[r];
        if (arr.length > limit) arr.splice(0, arr.length - limit);
      }
    }
  }

  private recordBucket(t: TokenState, at: number, price: number, volumeUsd: number, side: Side, maker: string): void {
    const minute = at - (at % 60000);
    let b = t.buckets[t.buckets.length - 1];
    if (!b || b.t !== minute) {
      if (b && minute < b.t) {
        // out-of-order (should not happen); fold into last bucket
      } else {
        const open = b ? b.close : price;
        b = { t: minute, open, close: price, volumeUsd: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, buys: 0, sells: 0, makers: new Set() };
        t.buckets.push(b);
        if (t.buckets.length > BUCKET_MINUTES) t.buckets.splice(0, t.buckets.length - BUCKET_MINUTES);
      }
    }
    b.close = price;
    b.volumeUsd += volumeUsd;
    if (side === 'buy') {
      b.buys++;
      b.buyVolumeUsd += volumeUsd;
    } else {
      b.sells++;
      b.sellVolumeUsd += volumeUsd;
    }
    b.makers.add(maker);
  }

  /** Rolling window stats computed from minute buckets. */
  windowStats(t: TokenState, window: StatWindow, at: number = this.now): WindowStats {
    const minutes = window === '1m' ? 1 : window === '5m' ? 5 : window === '1h' ? 60 : window === '6h' ? 360 : 1440;
    const since = at - minutes * 60000;
    const s: WindowStats = { volumeUsd: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, swaps: 0, buys: 0, sells: 0, priceChange: 0, makers: 0 };
    const makers = new Set<string>();
    let openPrice: number | null = null;
    const buckets = t.buckets;
    for (let i = buckets.length - 1; i >= 0; i--) {
      const b = buckets[i];
      if (b.t + 60000 <= since) {
        // bucket ended before the window: its close is the window's opening price
        openPrice = b.close;
        break;
      }
      s.volumeUsd += b.volumeUsd;
      s.buyVolumeUsd += b.buyVolumeUsd;
      s.sellVolumeUsd += b.sellVolumeUsd;
      s.buys += b.buys;
      s.sells += b.sells;
      if (minutes <= 60) for (const m of b.makers) makers.add(m);
      else s.makers += b.makers.size;
      openPrice = b.open;
    }
    s.swaps = s.buys + s.sells;
    if (minutes <= 60) s.makers = makers.size;
    const current = this.priceUsd(t);
    // A token younger than the window measures change from its launch price.
    if (openPrice !== null && openPrice > 0) s.priceChange = current / openPrice - 1;
    return s;
  }

  // ---------------------------------------------------------------------------
  // Native prices
  // ---------------------------------------------------------------------------

  setNativeUsd(chain: ChainId, usd: number): void {
    const c = this.chains[chain];
    c.nativeUsd = usd;
    const last = c.nativeHistory[c.nativeHistory.length - 1];
    if (!last || this.now - last.t >= 60000) {
      c.nativeHistory.push({ t: this.now, usd });
      const cutoff = this.now - 24 * 3600 * 1000;
      while (c.nativeHistory.length > 2 && c.nativeHistory[0].t < cutoff) c.nativeHistory.shift();
      c.nativeUsdOpen24h = c.nativeHistory[0].usd;
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshots (node:v8 serialize handles Map/Set; class instances are flattened here)
  // ---------------------------------------------------------------------------

  serialize(): WorldSnapshot {
    return {
      seed: this.seed,
      now: this.now,
      startedAt: this.startedAt,
      seq: this.seq,
      tradeTotal: this.tradeTotal,
      rng: this.rng.getState(),
      chains: this.chains,
      // Compact: recent trades and coarse candles are enough to resume; 1s candles rebuild in minutes.
      tokens: [...this.tokens.values()].map((t) => ({
        ...t,
        cache: {},
        trades: t.trades.length > SNAPSHOT_TRADES ? t.trades.slice(-SNAPSHOT_TRADES) : t.trades,
        candles: { ...t.candles, '1s': [] },
      })),
      wallets: [...this.wallets.values()],
      tokensByChain: this.tokensByChain,
    };
  }

  static restore(s: WorldSnapshot): World {
    const w = new World(s.seed, s.now);
    w.startedAt = s.startedAt;
    w.seq = s.seq;
    w.tradeTotal = s.tradeTotal;
    w.rng.setState(s.rng);
    w.chains = s.chains;
    // snapshots saved before the congestion model start calm
    for (const id of CHAIN_IDS) w.chains[id].congestion ??= CONGESTION_BASE;
    w.tokensByChain = s.tokensByChain;
    for (const t of s.tokens) w.tokens.set(t.address, t);
    for (const wal of s.wallets) {
      w.wallets.set(wal.address, wal);
      const byArch = w.walletsByArchetype[wal.chain];
      if (!byArch.has(wal.archetype)) byArch.set(wal.archetype, []);
      byArch.get(wal.archetype)!.push(wal.address);
    }
    return w;
  }

  /** Drop old launch/migration timestamps (kept for 1h counters). */
  pruneCounters(): void {
    const bookedCutoff = this.now - 15 * 60_000;
    for (const [key, at] of this.bookedExternal) if (at < bookedCutoff) this.bookedExternal.delete(key);
    const cutoff = this.now - 3600 * 1000;
    for (const id of CHAIN_IDS) {
      const c = this.chains[id];
      while (c.launches.length && c.launches[0] < cutoff) c.launches.shift();
      while (c.migrations.length && c.migrations[0] < cutoff) c.migrations.shift();
    }
  }
}
