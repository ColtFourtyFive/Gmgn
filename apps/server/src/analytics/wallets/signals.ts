// Signal engine: turns trades and world events into a per-chain stream of
// token signals (smart/KOL buys, clusters, large buys, spikes, ATHs, market
// cap levels, dev/bundler sells, migrations, CTO/boost flags, KOL calls).
// Signals are generated during warmup too (so the page is populated) but are
// only pushed to WebSocket subscribers once the engine is live.

import {
  CHAIN_IDS,
  formatPercent,
  formatUsd,
  getLaunchpad,
  shortAddress,
  type ChainId,
  type Signal,
  type SignalKind,
  type Trade,
} from '@trenchscope/shared';
import type { AppContext } from '../../context';
import type { PositionState, TokenState, WalletState } from '../../sim/world';
import { DAY_MS, HOUR_MS, MIN_MS, SEC } from './metrics';
import { Ring } from './ring';

export const SIGNAL_KINDS: SignalKind[] = [
  'price_spike',
  'ath',
  'mcap_level',
  'smart_buy',
  'kol_buy',
  'large_buy',
  'multi_buy',
  'bundler_sell',
  'dev_sell',
  'migration',
  'cto',
  'boost',
  'kol_call',
];

/** Market cap levels that fire `mcap_level` once each per token. */
export const MCAP_LEVELS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000];
/** Large buy: USD size per chain (with >= 2% of supply). */
export const LARGE_BUY_USD: Record<ChainId, number> = { sol: 5_000, base: 3_000, robinhood: 3_000, bsc: 4_000, eth: 8_000 };
export const LARGE_BUY_SUPPLY = 0.02;
/** ATH signals need >= 2x from launch and at least this market cap. */
export const ATH_MIN_MCAP = 25_000;
export const DEV_SELL_SHARE = 0.2;
export const MULTI_BUY_WINDOW_MS = 30 * MIN_MS;
export const MULTI_BUY_MIN_WALLETS = 3;
export const SPIKE_MIN_CHANGE = 0.5;
export const SPIKE_MIN_SWAPS = 20;
/** Price spikes are ignored while the 5m window still contains the launch. */
export const SPIKE_MIN_AGE_MS = 10 * MIN_MS;

const ALL_RING = 500;
const KIND_RING = 150;
/** kol_call signals kept per chain (the call-out feed). */
export const CALL_RING = 1000;
/** Calls kept per caller for its call stats (hit rates over 7d / 30d). */
const CALLS_PER_CALLER = 200;
export const CALL_STATS_MS = 30 * DAY_MS;
/** A call "hits" once the token reaches this multiple of its market cap at the call. */
export const CALL_HIT_MULTIPLE = 2;

export interface StoredSignal {
  id: string;
  chain: ChainId;
  kind: SignalKind;
  token: string;
  title: string;
  detail: string;
  marketCapAtTrigger: number;
  /** Highest traded market cap seen since the trigger. */
  peak: number;
  wallets: string[];
  createdAt: number;
}

/** Per-token signal state (throttles, levels, recent smart buys). 0 = never. */
interface TokSig {
  lvl: number;
  athMcap: number;
  athAt: number;
  spikeAt: number;
  multiAt: number;
  devAt: number;
  bundlerAt: number;
  largeAt: number;
  smart: { w: string; t: number }[];
}

/** Highest market cap since the trigger as a multiple of the market cap at the trigger (>= 1). */
export function maxMultipleOf(s: StoredSignal): number {
  return s.marketCapAtTrigger > 0 ? Math.max(1, s.peak / s.marketCapAtTrigger) : 1;
}

export interface SignalEngineData {
  seq: number;
  signals: StoredSignal[];
  tok: [string, TokSig][];
}

export class SignalEngine {
  private all = {} as Record<ChainId, Ring<StoredSignal>>;
  private byKind = {} as Record<ChainId, Map<SignalKind, Ring<StoredSignal>>>;
  private byToken = new Map<string, StoredSignal[]>();
  /** Caller wallet -> its kol_call signals (outlives the per-chain rings). */
  private calls = new Map<string, Ring<StoredSignal>>();
  private tok = new Map<string, TokSig>();
  private spikeDirty = new Set<string>();
  private listeners = new Set<(s: Signal) => void>();
  private seq = 0;
  /** Count of signals created (diagnostics). */
  created = 0;

  constructor(
    private ctx: AppContext,
    private toDto: (s: StoredSignal) => Signal | null,
  ) {
    this.reset();
  }

  private reset(): void {
    for (const c of CHAIN_IDS) {
      this.all[c] = new Ring(ALL_RING);
      this.byKind[c] = new Map();
    }
    this.byToken.clear();
    this.calls.clear();
    this.tok.clear();
  }

  /** Store a signal in its chain's rings (and its caller's calls). */
  private file(s: StoredSignal): void {
    this.all[s.chain].push(s);
    let kr = this.byKind[s.chain].get(s.kind);
    if (!kr) {
      kr = new Ring(s.kind === 'kol_call' ? CALL_RING : KIND_RING);
      this.byKind[s.chain].set(s.kind, kr);
    }
    kr.push(s);
    if (s.kind !== 'kol_call') return;
    let calls = this.calls.get(s.wallets[0]);
    if (!calls) this.calls.set(s.wallets[0], (calls = new Ring(CALLS_PER_CALLER)));
    calls.push(s);
  }

  private state(token: string): TokSig {
    let s = this.tok.get(token);
    if (!s) {
      s = { lvl: 0, athMcap: 0, athAt: 0, spikeAt: 0, multiAt: 0, devAt: 0, bundlerAt: 0, largeAt: 0, smart: [] };
      this.tok.set(token, s);
    }
    return s;
  }

  private walletName(w: WalletState): string {
    return w.label ?? shortAddress(w.address);
  }

  emit(t: TokenState, kind: SignalKind, title: string, detail: string, wallets: string[]): StoredSignal {
    const mcap = this.ctx.world.marketCapUsd(t);
    this.seq++;
    const s: StoredSignal = {
      id: `sig_${t.chain}_${this.seq.toString(36)}`,
      chain: t.chain,
      kind,
      token: t.address,
      title,
      detail,
      marketCapAtTrigger: mcap,
      peak: mcap,
      wallets,
      createdAt: this.ctx.world.now,
    };
    this.created++;
    this.file(s);
    const list = this.byToken.get(t.address);
    if (list) list.push(s);
    else this.byToken.set(t.address, [s]);
    if (!this.ctx.engine.warming) {
      // The chain feed, the token page's chart markers and in-app subscriptions share one DTO.
      const ch = `signals:${t.chain}`;
      const tch = `token:${t.chain}:${t.address}`;
      const { hub } = this.ctx;
      const chain = hub.hasSubscribers(ch);
      const token = hub.hasSubscribers(tch);
      const dto = chain || token || this.listeners.size > 0 ? this.toDto(s) : null;
      if (dto) {
        if (chain) hub.publish(ch, 'signals', [dto]);
        if (token) hub.publish(tch, 'signals', [dto]);
        for (const l of this.listeners) l(dto);
      }
    }
    return s;
  }

  /** Called with every signal fired once the engine is live (never during warmup); returns an unsubscribe. */
  onSignal(listener: (s: Signal) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A token's stored signals, newest first. */
  forToken(token: string, limit: number): StoredSignal[] {
    const list = this.byToken.get(token);
    if (!list) return [];
    return list
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  onTrade(trade: Trade, t: TokenState, w: WalletState, pos: PositionState): void {
    const now = trade.timestamp;
    const mcap = trade.marketCapUsd;
    const list = this.byToken.get(t.address);
    if (list) for (const s of list) if (mcap > s.peak) s.peak = mcap;
    this.spikeDirty.add(t.address);
    const sym = t.symbol;

    if (trade.side === 'buy') {
      const first = pos.buys === 1;
      const isKol = w.tags.has('kol');
      const isSmart = w.tags.has('smart');
      if (first && isKol)
        this.emit(t, 'kol_buy', 'KOL buy', `${this.walletName(w)} bought ${formatUsd(trade.usdAmount)} of $${sym} at ${formatUsd(mcap)} MC`, [w.address]);
      if (first && isSmart)
        this.emit(t, 'smart_buy', 'Smart money buy', `${this.walletName(w)} bought ${formatUsd(trade.usdAmount)} of $${sym} at ${formatUsd(mcap)} MC`, [w.address]);
      if (isSmart) {
        const ts = this.state(t.address);
        ts.smart.push({ w: w.address, t: now });
        while (ts.smart.length && ts.smart[0].t < now - MULTI_BUY_WINDOW_MS) ts.smart.shift();
        if (ts.smart.length > 64) ts.smart.splice(0, ts.smart.length - 64);
        const distinct = [...new Set(ts.smart.map((x) => x.w))];
        if (distinct.length >= MULTI_BUY_MIN_WALLETS && (ts.multiAt === 0 || now - ts.multiAt >= HOUR_MS)) {
          ts.multiAt = now;
          this.emit(t, 'multi_buy', 'Smart money cluster', `${distinct.length} smart wallets bought $${sym} in the last 30m (now ${formatUsd(mcap)} MC)`, distinct);
        }
      }
      if (trade.usdAmount >= LARGE_BUY_USD[t.chain] && t.totalSupply > 0 && trade.tokenAmount / t.totalSupply >= LARGE_BUY_SUPPLY) {
        const ts = this.state(t.address);
        if (ts.largeAt === 0 || now - ts.largeAt >= MIN_MS) {
          ts.largeAt = now;
          this.emit(
            t,
            'large_buy',
            'Large buy',
            `${this.walletName(w)} bought ${formatUsd(trade.usdAmount)} (${formatPercent(trade.tokenAmount / t.totalSupply, { sign: false })} of supply) of $${sym}`,
            [w.address],
          );
        }
      }
      if (mcap >= ATH_MIN_MCAP && this.ctx.world.priceUsd(t) >= t.athPriceUsd) {
        const launch = launchMarketCap(this.ctx, t);
        if (launch > 0 && mcap >= 2 * launch) {
          const ts = this.state(t.address);
          if (ts.athAt === 0 || (mcap >= ts.athMcap * 1.25 && now - ts.athAt >= 5 * MIN_MS)) {
            ts.athAt = now;
            ts.athMcap = mcap;
            this.emit(t, 'ath', 'New ATH', `$${sym} hit a new high at ${formatUsd(mcap)} MC (${(mcap / launch).toFixed(1)}x from launch)`, []);
          }
        }
      }
      if (mcap >= MCAP_LEVELS[0]) {
        const ts = this.state(t.address);
        let k = ts.lvl;
        while (k < MCAP_LEVELS.length && mcap >= MCAP_LEVELS[k]) k++;
        if (k > ts.lvl) {
          ts.lvl = k;
          const level = MCAP_LEVELS[k - 1];
          this.emit(t, 'mcap_level', `Market cap ${formatUsd(level, 0)}`, `$${sym} crossed ${formatUsd(level, 0)} market cap`, []);
        }
      }
    } else {
      if (w.address === t.creator || t.devTeam.has(w.address)) {
        const before = pos.balance + trade.tokenAmount;
        const frac = before > 0 ? trade.tokenAmount / before : 0;
        if (frac >= DEV_SELL_SHARE) {
          const ts = this.state(t.address);
          if (ts.devAt === 0 || now - ts.devAt >= 30 * SEC) {
            ts.devAt = now;
            const who = w.address === t.creator ? 'Dev' : 'Dev team';
            this.emit(
              t,
              'dev_sell',
              frac >= 0.999 ? `${who} sold all` : `${who} sold ${formatPercent(frac, { sign: false, digits: 0 })}`,
              `${who} sold ${formatPercent(frac, { sign: false, digits: 0 })} of their $${sym} (${formatUsd(trade.usdAmount)}) at ${formatUsd(mcap)} MC`,
              [w.address],
            );
          }
        }
      }
      if (t.bundlers.has(w.address)) {
        const ts = this.state(t.address);
        if (ts.bundlerAt === 0 || now - ts.bundlerAt >= 3 * MIN_MS) {
          ts.bundlerAt = now;
          this.emit(t, 'bundler_sell', 'Bundler sell', `Bundler wallet ${shortAddress(w.address)} sold ${formatUsd(trade.usdAmount)} of $${sym} at ${formatUsd(mcap)} MC`, [w.address]);
        }
      }
    }
  }

  onMigrated(t: TokenState): void {
    const secs = t.completedAt !== null ? Math.max(0, (t.completedAt - t.createdAt) / 1000) : null;
    const dex = t.pool?.dex ?? 'the AMM';
    this.emit(
      t,
      'migration',
      'Migrated',
      `$${t.symbol} graduated to ${dex}${secs !== null ? ` ${formatAgeShort(secs)} after launch` : ''} at ${formatUsd(this.ctx.world.marketCapUsd(t))} MC`,
      [],
    );
  }

  onFlag(t: TokenState, flag: 'cto' | 'boost' | 'socials'): void {
    if (flag === 'cto') this.emit(t, 'cto', 'Community takeover', `$${t.symbol} community took over at ${formatUsd(this.ctx.world.marketCapUsd(t))} MC`, []);
    else if (flag === 'boost') this.emit(t, 'boost', 'Boost paid', `$${t.symbol} paid for a screener boost at ${formatUsd(this.ctx.world.marketCapUsd(t))} MC`, []);
  }

  onKolCall(t: TokenState, w: WalletState): void {
    this.emit(t, 'kol_call', 'KOL call', `${this.walletName(w)} called $${t.symbol} at ${formatUsd(this.ctx.world.marketCapUsd(t))} MC`, [w.address]);
  }

  /** 5m price change >= +50% with >= 20 swaps (once per token per 30 min). Runs on a 5s ticker. */
  checkSpikes(): void {
    const world = this.ctx.world;
    const now = world.now;
    for (const addr of this.spikeDirty) {
      const t = world.tokens.get(addr);
      if (!t || now - t.createdAt < SPIKE_MIN_AGE_MS) continue;
      const since = now - 5 * MIN_MS;
      let swaps = 0;
      let open = 0;
      const bs = t.buckets;
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i];
        if (b.t + MIN_MS <= since) {
          open = b.close;
          break;
        }
        swaps += b.buys + b.sells;
        open = b.open;
      }
      if (swaps < SPIKE_MIN_SWAPS || !(open > 0)) continue;
      const change = world.priceUsd(t) / open - 1;
      if (change < SPIKE_MIN_CHANGE) continue;
      const ts = this.state(addr);
      if (ts.spikeAt !== 0 && now - ts.spikeAt < 30 * MIN_MS) continue;
      ts.spikeAt = now;
      this.emit(t, 'price_spike', 'Price spike', `$${t.symbol} ${formatPercent(change, { digits: 0 })} in 5m on ${swaps} swaps (${formatUsd(world.marketCapUsd(t))} MC)`, []);
    }
    this.spikeDirty.clear();
  }

  // -------------------------------------------------------------------------
  // Reads & maintenance
  // -------------------------------------------------------------------------

  /** Stored signals newest first. */
  list(chain: ChainId, kind: SignalKind | undefined, limit: number): StoredSignal[] {
    const ring = kind ? this.byKind[chain].get(kind) : this.all[chain];
    if (!ring) return [];
    const out: StoredSignal[] = [];
    for (let i = 0; i < ring.size && out.length < limit; i++) out.push(ring.at(i)!);
    return out;
  }

  /** A caller's kol_call signals, newest first (the last CALLS_PER_CALLER). */
  callsBy(wallet: string): StoredSignal[] {
    return this.calls.get(wallet)?.toArray().reverse() ?? [];
  }

  /** Every stored signal once: chain rings, then calls kept only by their caller. */
  private stored(): Set<StoredSignal> {
    const seen = new Set<StoredSignal>();
    for (const c of CHAIN_IDS) for (const r of [this.all[c], ...this.byKind[c].values()]) for (const s of r.toArray()) seen.add(s);
    for (const r of this.calls.values()) for (const s of r.toArray()) seen.add(s);
    return seen;
  }

  /** Drop stale callers, rebuild the per-token index and drop state of deleted tokens. */
  prune(): void {
    const { world } = this.ctx;
    for (const [wallet, r] of this.calls) {
      if (!world.wallets.has(wallet) || world.now - r.newest()!.createdAt > CALL_STATS_MS) this.calls.delete(wallet);
    }
    this.byToken.clear();
    for (const s of this.stored()) {
      const l = this.byToken.get(s.token);
      if (l) l.push(s);
      else this.byToken.set(s.token, [s]);
    }
    for (const addr of this.tok.keys()) if (!world.tokens.has(addr)) this.tok.delete(addr);
  }

  dump(): SignalEngineData {
    const all = [...this.stored()];
    all.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return { seq: this.seq, signals: all, tok: [...this.tok.entries()] };
  }

  load(d: SignalEngineData | undefined): void {
    this.reset();
    if (!d) return;
    this.seq = d.seq ?? 0;
    for (const s of d.signals ?? []) if (CHAIN_IDS.includes(s.chain)) this.file(s);
    for (const [k, v] of d.tok ?? []) this.tok.set(k, v);
    this.prune();
  }
}

/** Market cap at launch (initial curve price x supply) at the current native price. */
export function launchMarketCap(ctx: AppContext, t: TokenState): number {
  const lp = getLaunchpad(t.launchpad);
  if (!lp || lp.virtualTokens <= 0) return 0;
  return (lp.virtualNative / lp.virtualTokens) * t.totalSupply * ctx.world.nativeUsd(t.chain);
}

function formatAgeShort(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)}h`;
  return `${(secs / 86400).toFixed(1)}d`;
}
