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
import { Rng, base58Address, evmAddress, txHash } from './rng';

// ---------------------------------------------------------------------------
// Internal state types
// ---------------------------------------------------------------------------

/** Behavioural archetype of a simulated wallet. 'user' = human paper-trading account wallet. */
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
  | 'user';

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
  /** Token address -> position (includes closed positions). */
  positions: Map<string, PositionState>;
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
}

export interface SwapOptions {
  /** Platform fee ratio (0 for simulated agents). */
  platformFeeRate?: number;
  /** Network/priority fee in native. */
  networkFee?: number;
  /** Minimum acceptable output; fails if not met. */
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
      this.chains[id] = { id, nativeUsd: usd, nativeUsdOpen24h: usd, nativeHistory: [{ t: now, usd }], launches: [], migrations: [] };
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
      platformFee = amountIn * platformFeeRate;
      const totalCost = amountIn + platformFee + networkFee;
      if (wallet.native + 1e-12 < totalCost) return fail('insufficient native balance');
      const taxed = amountIn * (1 - t.buyTax);
      const q = this.quote(t, 'buy', taxed);
      if (!q || q.amountOut <= 0) return fail('no liquidity');
      result = q;
      let out = q.amountOut;
      if (mevLossRate > 0) {
        mevLoss = amountIn * mevLossRate;
        out *= 1 - mevLossRate;
      }
      if (opts.minOut !== undefined && out < opts.minOut) return fail('slippage exceeded');
      // When the curve caps the fill only the native actually used is charged.
      const used = q.amountIn / (1 - t.buyTax);
      platformFee = used * platformFeeRate;
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
      if (opts.minOut !== undefined && net < opts.minOut) return fail('slippage exceeded');
      if (net <= 0) return fail('proceeds do not cover fees');
      nativeDelta = net;
      tokenDelta = -sellAmount;
      nativeForTrade = out;
      this.applyReserves(t, 'sell', q, sellAmount);
    }

    // ---- wallet + position bookkeeping ----
    wallet.native += nativeDelta;
    if (wallet.native < 0) wallet.native = 0;
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
    const usdAmount = nativeForTrade * nativeUsd;
    let realized: number | null = null;
    if (side === 'buy') {
      const costUsd = (nativeForTrade + platformFee + networkFee) * nativeUsd;
      pos.balance += tokenDelta;
      pos.costBasisUsd += costUsd;
      pos.boughtUsd += costUsd;
      pos.boughtTokens += tokenDelta;
      pos.boughtNative += -nativeDelta;
      pos.buys += 1;
      if (pos.firstBuyAt === null) pos.firstBuyAt = at;
      pos.closedAt = null;
    } else {
      const sold = -tokenDelta;
      const avgCost = pos.balance > 0 ? pos.costBasisUsd / pos.balance : 0;
      const costOut = avgCost * sold;
      const proceedsUsd = nativeDelta * nativeUsd;
      realized = proceedsUsd - costOut;
      pos.realizedPnlUsd += realized;
      pos.costBasisUsd = Math.max(0, pos.costBasisUsd - costOut);
      pos.balance -= sold;
      pos.soldUsd += proceedsUsd;
      pos.soldTokens += sold;
      pos.soldNative += nativeDelta;
      pos.sells += 1;
      if (pos.balance <= t.totalSupply * DUST_RATE) {
        pos.balance = 0;
        pos.costBasisUsd = 0;
        pos.closedAt = at;
      }
    }
    pos.lastActiveAt = at;
    wallet.lastActiveAt = at;

    // ---- token indexes ----
    t.traders.add(wallet.address);
    if (pos.balance > t.totalSupply * DUST_RATE) t.holders.add(wallet.address);
    else t.holders.delete(wallet.address);

    const priceNative = this.priceNative(t);
    const priceUsd = priceNative * nativeUsd;
    const mcap = priceUsd * t.totalSupply;
    const tradeTokenAmount = Math.abs(tokenDelta);
    const execPriceUsd = tradeTokenAmount > 0 ? usdAmount / tradeTokenAmount : priceUsd;

    const trade: Trade = {
      id: this.nextId('tx'),
      chain: t.chain,
      token: t.address,
      tokenSymbol: t.symbol,
      wallet: wallet.address,
      walletTags: this.tradeTags(t, wallet),
      walletLabel: wallet.label,
      side,
      nativeAmount: nativeForTrade,
      tokenAmount: tradeTokenAmount,
      usdAmount,
      priceUsd: execPriceUsd,
      priceNative: tradeTokenAmount > 0 ? nativeForTrade / tradeTokenAmount : priceNative,
      marketCapUsd: mcap,
      timestamp: at,
      txHash: this.newTxHash(t.chain),
      block: this.blockAt(t.chain, at),
      isDev: wallet.address === t.creator || t.devTeam.has(wallet.address),
      makerHoldRate: t.totalSupply > 0 ? pos.balance / t.totalSupply : 0,
      realizedPnlUsd: realized,
    };

    t.trades.push(trade);
    if (t.trades.length > TRADE_RING) t.trades.splice(0, t.trades.length - TRADE_RING);
    t.tradeCount += 1;
    t.lastTradeAt = at;
    t.totalFeesUsd += result.venueFee * nativeUsd;
    if (priceUsd > t.athPriceUsd) {
      t.athPriceUsd = priceUsd;
      t.athMarketCapUsd = mcap;
    }
    this.recordCandle(t, at, priceUsd, usdAmount);
    this.recordBucket(t, at, priceUsd, usdAmount, side, wallet.address);
    t.version++;
    this.tradeTotal++;

    this.emit('trade', trade, t, wallet);

    if (result.completesCurve && t.status === 'curve') {
      t.status = 'migrating';
      t.completedAt = at;
      t.version++;
      this.emit('curveCompleted', t);
    }

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
    const cutoff = this.now - 3600 * 1000;
    for (const id of CHAIN_IDS) {
      const c = this.chains[id];
      while (c.launches.length && c.launches[0] < cutoff) c.launches.shift();
      while (c.migrations.length && c.migrations[0] < cutoff) c.migrations.shift();
    }
  }
}
