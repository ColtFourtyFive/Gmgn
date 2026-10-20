// On-demand token loading: a token page or search for a mint the World has not
// seen. pump.fun tokens come from their bonding curve (reserves, completion,
// creator) or, once migrated, their PumpSwap pool; anything else needs a
// Jupiter price (no price = not tradable here = not loaded). One batched read
// gets the mint (decimals, supply, authorities), its metadata and its curve;
// creation time comes from the oldest signature seen. Lookups are deduplicated
// while in flight and misses are remembered for a few minutes, so a crawler
// probing random addresses costs a bounded number of RPC reads.

import type { Connection, PublicKey } from '@solana/web3.js';
import { LIVE_DEXES } from '@trenchscope/shared';
import type { ExternalTokenSpec, TokenState, World } from '../../sim/world';
import { PUMP, PUMP_DECIMALS } from '../feed/ingest';
import { BudgetExceeded, type Priority, type RequestBudget } from './budget';
import { classifyNarrative } from './narratives';
import { parsePublicKey, readCreatedAt, readMint, readPumpPool, type MintSnapshot } from './onchain';
import { fetchJupiterPrices, type JupiterOptions } from './prices';

const PUMPSWAP = LIVE_DEXES.find((d) => d.id === 'pumpswap')!;
const MISS_TTL_MS = 5 * 60_000;
const ERROR_TTL_MS = 30_000;
/** Lookups in flight at once; beyond it unknown mints 404 until some finish (a crawler cannot queue thousands). */
const MAX_INFLIGHT = 32;
const MAX_MISSES = 20_000;

export interface LookupDeps {
  world: World;
  /** The RPC connection, read at each lookup (null = no RPC: nothing loads). */
  connection: () => Connection | null;
  budget: RequestBudget;
  jupiter: JupiterOptions;
  log?: Pick<Console, 'warn'>;
}

export interface LookupStats {
  loaded: number;
  misses: number;
  errors: number;
}

export class TokenLookup {
  private readonly inflight = new Map<string, Promise<TokenState | null>>();
  private readonly misses = new Map<string, number>();
  readonly stats: LookupStats = { loaded: 0, misses: 0, errors: 0 };

  constructor(private readonly deps: LookupDeps) {}

  /**
   * The token at `mint`, loading it from the chain when the World does not have it. Page loads are
   * high priority on the RPC budget; background loads (a watched wallet's trade) pass 'low'.
   */
  ensure(mint: string, priority: Priority = 'high'): Promise<TokenState | null> {
    const { world } = this.deps;
    const known = world.tokens.get(mint);
    if (known) return Promise.resolve(known.chain === 'sol' ? known : null);
    const key = parsePublicKey(mint);
    if (!key || !this.deps.connection() || world.wallets.has(mint)) return Promise.resolve(null);
    const retryAt = this.misses.get(mint);
    if (retryAt !== undefined && retryAt > Date.now()) return Promise.resolve(null);
    let p = this.inflight.get(mint);
    if (!p) {
      if (this.inflight.size >= MAX_INFLIGHT) return Promise.resolve(null);
      p = this.load(mint, key, priority)
        .then((t) => {
          if (t) this.misses.delete(mint);
          else {
            this.stats.misses++;
            this.remember(mint, MISS_TTL_MS);
          }
          return t;
        })
        .catch((err) => {
          // A full RPC queue is not an answer: nothing is remembered. A failing RPC is retried soon.
          if (err instanceof BudgetExceeded) return null;
          this.stats.errors++;
          this.remember(mint, ERROR_TTL_MS);
          if (this.stats.errors % 20 === 1) this.deps.log?.warn(`[live] token lookup ${mint} failed: ${err instanceof Error ? err.message : 'error'}`);
          return null;
        })
        .finally(() => this.inflight.delete(mint));
      this.inflight.set(mint, p);
    }
    return p;
  }

  private remember(mint: string, ttlMs: number): void {
    this.misses.set(mint, Date.now() + ttlMs);
    if (this.misses.size > MAX_MISSES) {
      const oldest = this.misses.keys().next().value;
      if (oldest !== undefined) this.misses.delete(oldest);
    }
  }

  private async load(mint: string, key: PublicKey, priority: Priority): Promise<TokenState | null> {
    const { world, budget } = this.deps;
    const connection = this.deps.connection();
    if (!connection) return null;
    const run = <T>(fn: () => Promise<T>) => budget.run(fn, priority);
    const snap = await run(() => readMint(connection, key));
    if (!snap) return null;
    const spec = snap.curve ? await this.pumpSpec(connection, mint, key, snap, run) : await this.dexSpec(mint, snap);
    if (!spec) return null;
    const createdAt = await run(() => readCreatedAt(connection, key)).catch(() => null);
    // The feed (or a parallel request) may have registered it meanwhile.
    const known = world.tokens.get(mint);
    if (known) return known;
    const t = world.addExternalToken({ ...spec, createdAt: createdAt ?? 0 });
    t.renouncedMint = snap.mint.mintAuthority === null;
    t.renouncedFreeze = snap.mint.freezeAuthority === null;
    this.stats.loaded++;
    return t;
  }

  private identity(mint: string, snap: MintSnapshot): Pick<ExternalTokenSpec, 'symbol' | 'name' | 'metadataUri' | 'narrative' | 'logoGlyph'> {
    const symbol = snap.meta?.symbol || mint.slice(0, 4).toUpperCase();
    const name = snap.meta?.name || symbol;
    const { narrative, glyph } = classifyNarrative(name, symbol);
    return { symbol, name, metadataUri: snap.meta?.uri || null, narrative, logoGlyph: glyph };
  }

  private async pumpSpec(
    connection: Connection,
    mint: string,
    key: PublicKey,
    snap: MintSnapshot,
    run: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<Omit<ExternalTokenSpec, 'createdAt'> | null> {
    const c = snap.curve!;
    const base = {
      chain: 'sol' as const,
      address: mint,
      launchpad: PUMP.id,
      ...this.identity(mint, snap),
      description: '',
      imageUrl: null,
      creator: c.creator,
      decimals: snap.mint.decimals || PUMP_DECIMALS,
      totalSupply: snap.mint.supply > 0 ? snap.mint.supply : c.totalSupply,
      socials: {},
    };
    const curve = { virtualNative: c.virtualNative, virtualTokens: c.virtualTokens, realNative: c.realNative, realTokens: c.complete ? 0 : c.realTokens, initialRealTokens: PUMP.curveTokens, feeRate: PUMP.feeRate };
    if (!c.complete) return { ...base, status: 'curve', curve, pool: null };
    const pool = await readPumpPool(connection, key, run).catch(() => null);
    if (!pool) return { ...base, status: 'migrating', curve, pool: null };
    return {
      ...base,
      status: 'migrated',
      curve,
      pool: { address: pool.address, dex: PUMPSWAP.name, feeRate: PUMPSWAP.feeRate, native: pool.native, tokens: pool.tokens, lpBurnedRate: 1 },
    };
  }

  /** A token from another venue: priced by Jupiter, its depth from Jupiter's liquidity figure. */
  private async dexSpec(mint: string, snap: MintSnapshot): Promise<Omit<ExternalTokenSpec, 'createdAt'> | null> {
    const prices = await fetchJupiterPrices([mint], this.deps.jupiter);
    const p = prices.get(mint);
    const solUsd = this.deps.world.nativeUsd('sol');
    if (!p || !(solUsd > 0) || !(snap.mint.supply > 0)) return null;
    const priceNative = p.usdPrice / solUsd;
    const native = Math.max(((p.liquidity ?? 0) / 2) / solUsd, 1e-6);
    return {
      chain: 'sol',
      address: mint,
      // Not a launchpad token: no launchpad.
      launchpad: '',
      ...this.identity(mint, snap),
      description: '',
      imageUrl: null,
      creator: snap.meta?.updateAuthority ?? snap.mint.mintAuthority ?? mint,
      decimals: snap.mint.decimals,
      totalSupply: snap.mint.supply,
      status: 'migrated',
      curve: null,
      // Pool address and venue are unknown (Jupiter routes across them); LP status unknown -> not burned.
      pool: { address: '', dex: 'DEX', feeRate: 0.0025, native, tokens: native / priceNative, lpBurnedRate: 0 },
      socials: {},
    };
  }
}
