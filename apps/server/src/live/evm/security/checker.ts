// EvmSecurityChecker: runs every provider for a token (GoPlus, honeypot.is,
// explorers, on-chain bytecode / ownership, launchpad templates, the simulated
// round trip), merges them (simulation and on-chain facts win conflicts) and
// caches the report. Standalone: the orchestrator passes read clients and maps
// the report with toTokenSecurityFlags.

import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, type Address } from 'viem';
import type { ChainId } from '@trenchscope/shared';
import { EVM_CHAINS, isEvmChain, type EvmChainId } from '../chains';
import { BLOCKSCOUT_HOSTS, fetchBlockscoutAddress, fetchBlockscoutHolders, fetchSourcify, type BlockscoutAddress, type RawHolder } from './explorer';
import { fetchGoPlus } from './goplus';
import { fetchHoneypotIs, HONEYPOT_IS_CHAIN_IDS } from './honeypotis';
import { ProviderError, type FetchLike } from './http';
import { recognizeLaunchpad, LAUNCHPAD_ADDRESSES, type LaunchpadResult } from './launchpads';
import { RateLimiter, Semaphore, TimeoutError, TtlCache, withTimeout, type Clock, type RateLimitOptions } from './limits';
import { coverageOf, mergeFacts, pick, type ProviderReport } from './merge';
import { deriveOnchainReport, inspectToken, ownerRoleOf, tokenAbi, units, type OnchainInspection } from './onchain';
import { codeSizeReaderAbi } from './probe/abi';
import { CODE_SIZE_READER_RUNTIME } from './probe/bytecode';
import { ethCall, multicall, type RpcClient } from './rpc';
import { HONEYPOT_SELL_TAX, PROBE_ADDRESS, rankPools, v2v3Simulator, type RoundTripSimulator, type SimulationContext } from './simulate';
import type {
  CreatorInfo,
  EvmSecurityCheckOptions,
  EvmSecurityReport,
  HolderKind,
  HolderSell,
  LaunchpadMatch,
  LpInfo,
  OwnerRole,
  PoolRef,
  RoundTripResult,
  SecurityProvider,
  SourceOutcome,
  SourceStatus,
  TopHolder,
} from './types';
import { BURN_ADDRESSES, isBurnAddress } from './venues';

export type ProviderName = 'goplus' | 'honeypotis' | 'blockscout' | 'sourcify';

export interface EvmSecurityCheckerOptions {
  /** Read clients per chain (anything with viem's `request`, e.g. createEvmPublicClient's result). */
  clients: Partial<Record<EvmChainId, RpcClient>>;
  fetch?: FetchLike;
  now?: Clock;
  /** Venue simulators, tried in order of the pools they find (default: built-in V2/V3). */
  simulators?: RoundTripSimulator[];
  /** Turn providers off (all on by default). */
  enable?: Partial<Record<ProviderName | 'simulation' | 'holderSells', boolean>>;
  /** Report cache TTL (default 10 min) and the TTL for tokens younger than youngAgeMs (default 1 min / 1 h). */
  ttlMs?: number;
  youngTtlMs?: number;
  youngAgeMs?: number;
  /** TTL when a provider was rate limited / failed, so the gap is filled soon (default 1 min). */
  degradedTtlMs?: number;
  /** Max cached reports (LRU). */
  maxEntries?: number;
  /** Checks running at once, overall and per chain. */
  concurrency?: number;
  perChainConcurrency?: number;
  /** Per-request timeout for GoPlus / honeypot.is, explorers (they can be slow), and the on-chain / simulation stages. */
  httpTimeoutMs?: number;
  explorerTimeoutMs?: number;
  rpcTimeoutMs?: number;
  rateLimits?: Partial<Record<ProviderName, RateLimitOptions>>;
}

const DEFAULT_LIMITS: Record<ProviderName, RateLimitOptions> = {
  // Keyless GoPlus answered ~10 requests in a burst, then ~14 a minute, then code 4029.
  goplus: { perWindow: 10, windowMs: 60_000, backoffMs: 30_000, maxBackoffMs: 300_000 },
  honeypotis: { perWindow: 30, windowMs: 60_000, backoffMs: 30_000, maxBackoffMs: 300_000 },
  blockscout: { perWindow: 120, windowMs: 60_000, backoffMs: 60_000, maxBackoffMs: 600_000 },
  sourcify: { perWindow: 60, windowMs: 60_000, backoffMs: 30_000, maxBackoffMs: 300_000 },
};

/** Address the CodeSizeReader is placed at for holder classification. */
const CODE_READER_ADDRESS = getAddress('0x00000000000000000000000000000000c0de5123');

/** Holder sells simulated per check (largest EOA holders). */
const HOLDER_SELLS = 2;
const TOP_HOLDERS = 20;

interface Gathered {
  statuses: SourceStatus[];
  reports: ProviderReport[];
  inspection: OnchainInspection | null;
  launchpad: LaunchpadResult | null;
  blockscout: BlockscoutAddress | null;
  blockscoutHolders: RawHolder[] | null;
  simulation: RoundTripResult | null;
  pools: PoolRef[];
}

export class EvmSecurityChecker {
  private readonly now: Clock;
  private readonly fetch: FetchLike;
  private readonly cache: TtlCache<EvmSecurityReport>;
  private readonly inflight = new Map<string, Promise<EvmSecurityReport>>();
  private readonly global: Semaphore;
  private readonly perChain = new Map<EvmChainId, Semaphore>();
  private readonly limiters = new Map<string, RateLimiter>();
  private readonly simulators: RoundTripSimulator[];

  constructor(private readonly opts: EvmSecurityCheckerOptions) {
    this.now = opts.now ?? Date.now;
    this.fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.cache = new TtlCache(opts.maxEntries ?? 5000, this.now);
    this.global = new Semaphore(opts.concurrency ?? 4);
    this.simulators = opts.simulators ?? [v2v3Simulator];
  }

  /** Adds a venue simulator (e.g. bonding curves, Uniswap V4) ahead of the built-in ones. */
  registerSimulator(sim: RoundTripSimulator): void {
    this.simulators.unshift(sim);
  }

  /** Cached report, if fresh. */
  peek(chain: EvmChainId, token: string): EvmSecurityReport | undefined {
    return this.cache.get(cacheKey(chain, token));
  }

  invalidate(chain: EvmChainId, token: string): void {
    this.cache.delete(cacheKey(chain, token));
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  async check(chain: ChainId, token: string, opts: EvmSecurityCheckOptions = {}): Promise<EvmSecurityReport> {
    if (!isEvmChain(chain)) throw new Error(`not an EVM chain: ${chain}`);
    if (!isAddress(token, { strict: false })) throw new Error(`not an address: ${token}`);
    const client = this.opts.clients[chain];
    if (!client) throw new Error(`no RPC client for ${chain}`);
    const key = cacheKey(chain, token);
    if (!opts.fresh) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.global
      .run(() => this.chainSemaphore(chain).run(() => this.run(chain, getAddress(token), client, opts)))
      .then((report) => {
        this.cache.set(key, report, this.ttlFor(report, opts));
        return report;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private chainSemaphore(chain: EvmChainId): Semaphore {
    let s = this.perChain.get(chain);
    if (!s) this.perChain.set(chain, (s = new Semaphore(this.opts.perChainConcurrency ?? 2)));
    return s;
  }

  private ttlFor(report: EvmSecurityReport, opts: EvmSecurityCheckOptions): number {
    const young = opts.createdAt !== undefined && this.now() - opts.createdAt < (this.opts.youngAgeMs ?? 3_600_000);
    let ttl = young ? (this.opts.youngTtlMs ?? 60_000) : (this.opts.ttlMs ?? 600_000);
    const degraded = report.sources.some((s) => s.outcome === 'rate_limited' || s.outcome === 'timeout' || s.outcome === 'error');
    if (degraded) ttl = Math.min(ttl, this.opts.degradedTtlMs ?? 60_000);
    return ttl;
  }

  private limiter(name: string, kind: ProviderName): RateLimiter {
    let l = this.limiters.get(name);
    if (!l) this.limiters.set(name, (l = new RateLimiter({ ...DEFAULT_LIMITS[kind], ...this.opts.rateLimits?.[kind] }, this.now)));
    return l;
  }

  private enabled(name: ProviderName | 'simulation' | 'holderSells'): boolean {
    return this.opts.enable?.[name] !== false;
  }

  /** Runs `fn` as one tracked provider call: rate limit, timeout, status record. Returns undefined on failure. */
  private async tracked<T>(
    statuses: SourceStatus[],
    provider: SecurityProvider,
    detail: string,
    fn: (signal: AbortSignal) => Promise<T>,
    opts: { limiter?: RateLimiter; timeoutMs: number; signal?: AbortSignal; empty?: (v: T) => boolean },
  ): Promise<T | undefined> {
    const started = this.now();
    const record = (outcome: SourceOutcome, error?: string) =>
      statuses.push({ provider, detail, outcome, fetchedAt: this.now(), ms: this.now() - started, ...(error ? { error } : {}) });
    if (opts.limiter && !opts.limiter.tryTake()) {
      const wait = opts.limiter.backoffRemainingMs;
      if (wait > 0) record(opts.limiter.lastPenalty, `backing off ${Math.ceil(wait / 1000)} s`);
      else record('rate_limited', 'local request budget used up');
      return undefined;
    }
    try {
      const v = await withTimeout(`${provider}:${detail}`, opts.timeoutMs, fn, opts.signal);
      opts.limiter?.succeed();
      record(opts.empty?.(v) ? 'not_found' : 'ok');
      return v;
    } catch (err) {
      if (err instanceof ProviderError) {
        if (err.outcome === 'rate_limited' || err.outcome === 'blocked') opts.limiter?.penalize(err.outcome);
        record(err.outcome, err.message);
      } else if (err instanceof TimeoutError) record('timeout', err.message);
      else record('error', (err as Error).message?.split('\n')[0] ?? String(err));
      return undefined;
    }
  }

  private async run(chain: EvmChainId, token: Address, client: RpcClient, opts: EvmSecurityCheckOptions): Promise<EvmSecurityReport> {
    const httpMs = this.opts.httpTimeoutMs ?? 8000;
    const rpcMs = this.opts.rpcTimeoutMs ?? 15_000;
    const statuses: SourceStatus[] = [];
    const g: Gathered = { statuses, reports: [], inspection: null, launchpad: null, blockscout: null, blockscoutHolders: null, simulation: null, pools: [] };
    const signal = opts.signal;

    // Third parties start at once; the on-chain work runs alongside.
    const goplus = this.enabled('goplus')
      ? this.tracked(statuses, 'goplus', 'token_security', (s) => fetchGoPlus({ fetch: this.fetch }, chain, token, s), {
          limiter: this.limiter('goplus', 'goplus'),
          timeoutMs: httpMs,
          signal,
          empty: (v) => v === null,
        })
      : skip(statuses, 'goplus', 'token_security', this.now);
    const honeypot =
      this.enabled('honeypotis') && HONEYPOT_IS_CHAIN_IDS[chain]
        ? this.tracked(statuses, 'honeypotis', 'IsHoneypot', (s) => fetchHoneypotIs({ fetch: this.fetch }, chain, token, s), {
            limiter: this.limiter('honeypotis', 'honeypotis'),
            timeoutMs: httpMs,
            signal,
            empty: (v) => v === null,
          })
        : unsupported(statuses, 'honeypotis', 'IsHoneypot', this.now, !this.enabled('honeypotis'));

    const inspected = this.tracked(statuses, 'onchain', 'bytecode', () => inspectToken(client, chain, token), { timeoutMs: rpcMs, signal }).then(
      (v) => (g.inspection = v ?? null),
    );
    const explorer = this.explorer(g, chain, token, this.opts.explorerTimeoutMs ?? 5000, inspected, goplus, signal);
    await inspected;
    if (g.inspection) {
      g.launchpad =
        (await this.tracked(statuses, 'launchpad', 'registry', () => recognizeLaunchpad(client, chain, g.inspection!), { timeoutMs: rpcMs, signal, empty: (v) => v === null })) ??
        null;
      if (this.enabled('simulation') && g.inspection.isContract) {
        g.simulation = (await this.simulate(g, { chain, client }, token, opts, rpcMs, signal)) ?? null;
      }
    }
    const [gp, hp] = await Promise.all([goplus, honeypot, explorer]);
    if (gp) g.reports.push(gp);
    if (hp) g.reports.push(hp);
    return this.assemble(chain, token, client, g, rpcMs, signal);
  }

  private async explorer(
    g: Gathered,
    chain: EvmChainId,
    token: Address,
    httpMs: number,
    inspected: Promise<unknown>,
    goplus: Promise<ProviderReport | null | undefined>,
    signal?: AbortSignal,
  ): Promise<void> {
    const host = BLOCKSCOUT_HOSTS[chain];
    const tasks: Promise<unknown>[] = [];
    if (host && this.enabled('blockscout')) {
      const lim = this.limiter(`blockscout:${host}`, 'blockscout');
      tasks.push(
        this.tracked(g.statuses, 'explorer', 'blockscout', (s) => fetchBlockscoutAddress(this.fetch, host, token, s), { limiter: lim, timeoutMs: httpMs, signal, empty: (v) => v === null }).then(
          (v) => (g.blockscout = v ?? null),
        ),
      );
      // Top holders from Blockscout only when GoPlus did not list them.
      tasks.push(
        goplus.then(async (gp) => {
          if (gp?.holders?.length) return;
          const v = await this.tracked(g.statuses, 'explorer', 'blockscout-holders', (s) => fetchBlockscoutHolders(this.fetch, host, token, s), {
            limiter: lim,
            timeoutMs: httpMs,
            signal,
            empty: (h) => h.length === 0,
          });
          g.blockscoutHolders = v ?? null;
        }),
      );
    }
    let sourcify: boolean | null | undefined;
    if (this.enabled('sourcify')) {
      tasks.push(
        this.tracked(g.statuses, 'explorer', 'sourcify', (s) => fetchSourcify(this.fetch, chain, token, s), {
          limiter: this.limiter('sourcify', 'sourcify'),
          timeoutMs: httpMs,
          signal,
          empty: (v) => v === null,
        }).then((v) => (sourcify = v)),
      );
    }
    await Promise.all(tasks);
    // A clone / proxy is open source when the code it runs is verified.
    let implVerified: boolean | null | undefined;
    const impl = g.blockscout?.implementations[0] ?? null;
    if (this.enabled('sourcify') && sourcify !== true && g.blockscout?.isVerified !== true) {
      // The implementation of a clone / proxy is known once the on-chain inspection (running in parallel) is done.
      await inspected;
      const target = impl ?? g.inspection?.proxy?.implementation ?? null;
      if (target) {
        implVerified = await this.tracked(g.statuses, 'explorer', 'sourcify-implementation', (s) => fetchSourcify(this.fetch, chain, target, s), {
          limiter: this.limiter('sourcify', 'sourcify'),
          timeoutMs: httpMs,
          signal,
          empty: (v) => v === null,
        });
      }
    }
    let isOpenSource: boolean | undefined;
    if (sourcify === true || g.blockscout?.isVerified === true || implVerified === true) isOpenSource = true;
    else if (g.blockscout?.isVerified === false && !impl && !g.inspection?.proxy) isOpenSource = false;
    const facts = isOpenSource === undefined ? {} : { isOpenSource };
    g.reports.push({
      provider: 'explorer',
      facts,
      creator: g.blockscout?.creator ? { address: g.blockscout.creator, balance: null, share: null } : undefined,
      holderCount: g.blockscout?.holderCount ?? undefined,
    });
  }

  private async simulate(g: Gathered, ctx: SimulationContext, token: Address, opts: EvmSecurityCheckOptions, rpcMs: number, signal?: AbortSignal): Promise<RoundTripResult | undefined> {
    // Candidate pools: caller hints, template pools, then every simulator's discovery.
    const hints = [...(opts.pools ?? []), ...(g.launchpad?.pools ?? [])];
    const discovered: PoolRef[] = [];
    for (const sim of this.simulators) {
      const found = await this.tracked(g.statuses, 'simulation', `${sim.id}:discover`, () => sim.discover(ctx, token), { timeoutMs: rpcMs, signal });
      if (found) discovered.push(...found);
    }
    const resolved: PoolRef[] = [];
    for (const h of hints) {
      const owner = this.simulators.find((s) => s.accepts(h));
      if (owner) resolved.push(h);
      else if (h.venue === 'unknown')
        // A bare pair / pool address (e.g. a template's main pool): let a simulator classify it.
        for (const s of this.simulators) {
          if (!s.resolve) continue;
          const r = await s.resolve(ctx, token, h).catch(() => null);
          if (r) {
            resolved.push(r);
            break;
          }
        }
    }
    const seen = new Set<string>();
    const ranked = [...resolved, ...rankPools(ctx.chain, discovered)].filter((p) => {
      const k = p.address.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return this.simulators.some((s) => s.accepts(p));
    });
    g.pools = ranked;
    if (ranked.length === 0) {
      g.statuses.push({ provider: 'simulation', detail: 'round-trip', outcome: 'not_found', fetchedAt: this.now(), ms: 0, error: 'no pool this checker can simulate' });
      return undefined;
    }
    // Main pool first; one more pool when the first is inconclusive.
    let best: RoundTripResult | undefined;
    for (const pool of ranked.slice(0, 2)) {
      const sim = this.simulators.find((s) => s.accepts(pool))!;
      const r = await this.tracked(g.statuses, 'simulation', `${pool.venue}:${pool.address.slice(0, 10)}`, () => sim.run(ctx, pool), { timeoutMs: rpcMs, signal });
      if (!r) continue;
      if (!best || (best.isHoneypot === null && r.isHoneypot !== null)) best = r;
      if (best.isHoneypot !== null) break;
    }
    return best;
  }

  private async assemble(chain: EvmChainId, token: Address, client: RpcClient, g: Gathered, rpcMs: number, signal?: AbortSignal): Promise<EvmSecurityReport> {
    const insp = g.inspection;
    const lp = g.launchpad;
    const notes: string[] = [];
    const third = g.reports;
    const gp = third.find((r) => r.provider === 'goplus');

    // Ownership: on-chain reading, refined by the template; GoPlus only when on-chain could not tell.
    let ownerRole: OwnerRole | null = lp?.ownerRole ?? (insp ? ownerRoleOf(insp) : null);
    if (ownerRole === null && gp && gp.owner !== undefined) ownerRole = gp.owner === null ? 'none' : isBurnAddress(gp.owner) ? 'renounced' : 'privileged';
    const reports: ProviderReport[] = [...third];
    if (insp) reports.push(deriveOnchainReport(insp, ownerRole));
    if (lp) reports.push(lp.report);

    // Simulation facts, with holder sells folded in.
    const sim = g.simulation;
    if (sim && this.enabled('holderSells') && sim.isHoneypot === false) {
      sim.holderSells = await this.holderSells(g, { chain, client }, sim, rpcMs, signal);
      const failed = sim.holderSells.filter((h) => !h.ok || (h.sellTax !== null && h.sellTax >= HONEYPOT_SELL_TAX));
      if (sim.holderSells.length >= HOLDER_SELLS && failed.length === sim.holderSells.length) {
        sim.isHoneypot = true;
        sim.notes.push('none of the sampled holders can sell (fresh wallets can: whitelist / time trap)');
      } else if (failed.length > 0) sim.notes.push(`${failed.length}/${sim.holderSells.length} sampled holders cannot sell or pay >= ${HONEYPOT_SELL_TAX * 100}%`);
    }
    if (sim) {
      const facts: ProviderReport['facts'] = {};
      if (sim.isHoneypot !== null) facts.isHoneypot = sim.isHoneypot;
      if (sim.buyTax !== null) facts.buyTax = sim.buyTax;
      if (sim.sellTax !== null) facts.sellTax = sim.sellTax;
      if (sim.transferTax !== null) facts.transferTax = sim.transferTax;
      if (sim.cannotBuy !== null) facts.cannotBuy = sim.cannotBuy;
      reports.push({ provider: 'simulation', facts, notes: sim.notes.map((n) => `simulation: ${n}`) });
    }

    const merged = mergeFacts(reports);
    const v = merged.values;
    for (const r of reports) for (const n of r.notes ?? []) if (!notes.includes(n)) notes.push(n);

    const decimals = insp?.decimals ?? null;
    const supply = insp?.totalSupply ?? null;
    const enrich = await this.enrich(chain, client, token, g, decimals, supply, rpcMs, signal).catch(() => null);

    const launchpad: LaunchpadMatch | null =
      lp?.match ?? (gp?.launchpadName ? { id: gp.launchpadName.toLowerCase().replace(/[^a-z0-9.]+/g, '-'), name: gp.launchpadName, template: 'unknown', evidence: 'GoPlus launchpad_token', phase: null, facts: [] } : null);

    const report: EvmSecurityReport = {
      chain,
      token,
      checkedAt: this.now(),
      name: pick(reports, (r) => r.name)?.value ?? null,
      symbol: pick(reports, (r) => r.symbol)?.value ?? null,
      decimals,
      totalSupply: supply === null ? null : units(supply, decimals),
      isOpenSource: v.isOpenSource,
      isRenounced: v.isRenounced,
      isHoneypot: v.isHoneypot,
      buyTax: v.buyTax,
      sellTax: v.sellTax,
      transferTax: v.transferTax,
      cannotBuy: v.cannotBuy,
      cannotSellAll: v.cannotSellAll,
      flags: {
        mintable: v.mintable,
        proxy: v.proxy,
        upgradeable: v.upgradeable,
        ownerCanChangeBalance: v.ownerCanChangeBalance,
        taxModifiable: v.taxModifiable,
        personalTaxModifiable: v.personalTaxModifiable,
        blacklist: v.blacklist,
        whitelist: v.whitelist,
        pausable: v.pausable,
        antiWhale: v.antiWhale,
        antiWhaleModifiable: v.antiWhaleModifiable,
        tradingCooldown: v.tradingCooldown,
        hiddenOwner: v.hiddenOwner,
        canTakeBackOwnership: v.canTakeBackOwnership,
        selfDestruct: v.selfDestruct,
        externalCall: v.externalCall,
      },
      owner: insp?.ownerFunction ? insp.owner : (insp?.owners?.[0] ?? (gp?.owner === undefined ? null : gp.owner)),
      ownerRole,
      proxy: insp?.proxy ?? null,
      privilegedFunctions: (insp?.capabilities ?? []).filter((c) => c.capability !== 'ownable').map((c) => `${c.capability}: ${c.signature}`),
      lp: withTemplateLockers(enrich?.lp ?? gp?.lp ?? null, lp, gp),
      holders: enrich?.holders ?? null,
      holderCount: pick(third, (r) => r.holderCount)?.value ?? null,
      creator: enrich?.creator ?? { address: null, balance: null, share: null },
      launchpad,
      simulation: sim,
      sources: g.statuses,
      disagreements: merged.disagreements,
      coverage: 0,
      notes,
    };
    report.coverage = coverageOf(report);
    return report;
  }

  /** Simulated sells from the largest EOA holders (their own balances and tax treatment). */
  private async holderSells(g: Gathered, ctx: SimulationContext, sim: RoundTripResult, rpcMs: number, signal?: AbortSignal): Promise<HolderSell[]> {
    const simulator = this.simulators.find((s) => s.accepts(sim.pool));
    if (!simulator?.sellAs) return [];
    const gp = g.reports.find((r) => r.provider === 'goplus');
    const pools = new Set(g.pools.map((p) => p.address.toLowerCase()));
    const candidates: { address: Address; raw: bigint | null }[] = [];
    for (const h of gp?.holders ?? []) if (h.kind === 'eoa' && !pools.has(h.address.toLowerCase())) candidates.push({ address: h.address, raw: null });
    for (const h of g.blockscoutHolders ?? []) if (h.isContract === false && !pools.has(h.address.toLowerCase()) && !isBurnAddress(h.address)) candidates.push({ address: h.address, raw: h.value });
    const seen = new Set<string>();
    const picked = candidates.filter((c) => (seen.has(c.address.toLowerCase()) ? false : (seen.add(c.address.toLowerCase()), true))).slice(0, HOLDER_SELLS);
    if (picked.length === 0) return [];
    // Sell at most 1% of the pool's token side so one large holder does not move the price by itself.
    const [poolTokens] = await multicall(ctx.client, EVM_CHAINS[ctx.chain].multicall3, [
      { target: sim.pool.token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [sim.pool.address as Address] }) },
    ]).catch(() => [null]);
    const cap = poolTokens?.success ? (decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: poolTokens.data }) as bigint) / 100n : 0n;
    const out = await Promise.all(
      picked.map((h) =>
        this.tracked(g.statuses, 'simulation', `holder-sell:${h.address.slice(0, 10)}`, () => simulator.sellAs!(ctx, sim.pool, h.address, cap), { timeoutMs: rpcMs, signal }),
      ),
    );
    return out.filter((x): x is HolderSell => !!x && !(x.reason === 'nothing to sell'));
  }

  /** Top holders (classified), creator balance and the main V2 pool's LP burn share, in two RPC round trips. */
  private async enrich(
    chain: EvmChainId,
    client: RpcClient,
    token: Address,
    g: Gathered,
    decimals: number | null,
    supply: bigint | null,
    rpcMs: number,
    signal?: AbortSignal,
  ): Promise<{ holders: TopHolder[] | null; creator: CreatorInfo; lp: LpInfo | null } | null> {
    const gp = g.reports.find((r) => r.provider === 'goplus');
    const lpad = g.launchpad;
    const mc = EVM_CHAINS[chain].multicall3;

    // Holders: GoPlus (has lock tags) else Blockscout (raw values over on-chain supply).
    let holders: TopHolder[] | null = gp?.holders?.length ? gp.holders.map((h) => ({ ...h })) : null;
    if (!holders && g.blockscoutHolders?.length && supply && supply > 0n) {
      holders = g.blockscoutHolders.slice(0, TOP_HOLDERS).map((h) => ({
        address: h.address,
        share: Number((h.value * 1_000_000n) / supply) / 1_000_000,
        balance: units(h.value, decimals),
        kind: (isBurnAddress(h.address) ? 'burn' : h.isContract === true ? 'contract' : h.isContract === false ? 'eoa' : 'unknown') as HolderKind,
        ...(h.label ? { label: h.label } : {}),
      }));
    }

    const creatorAddr = lpad?.creator ?? pick(g.reports, (r) => r.creator?.address ?? undefined)?.value ?? null;
    const mainV2 = g.simulation?.pool && (g.simulation.pool.extra as { kind?: number } | undefined)?.kind === 0 ? (g.simulation.pool.address as Address) : null;

    const unknownKind = (holders ?? []).filter((h) => h.kind === 'unknown');
    const work = await this.tracked(
      g.statuses,
      'onchain',
      'holders-lp',
      async () => {
        const items = [
          ...(creatorAddr ? [{ target: token, data: encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [creatorAddr] }) }] : []),
          ...(mainV2
            ? [
                { target: mainV2, data: encodeFunctionData({ abi: tokenAbi, functionName: 'totalSupply' }) },
                ...BURN_ADDRESSES.map((b) => ({ target: mainV2, data: encodeFunctionData({ abi: tokenAbi, functionName: 'balanceOf', args: [b] }) })),
              ]
            : []),
        ];
        const [results, sizes] = await Promise.all([
          items.length ? multicall(client, mc, items) : Promise.resolve([]),
          unknownKind.length > 0
            ? ethCall(client, {
                to: CODE_READER_ADDRESS,
                data: encodeFunctionData({ abi: codeSizeReaderAbi, functionName: 'codeSizes', args: [unknownKind.map((h) => h.address)] }),
                overrides: { [CODE_READER_ADDRESS]: { code: CODE_SIZE_READER_RUNTIME } },
              }).then((d) => decodeFunctionResult({ abi: codeSizeReaderAbi, functionName: 'codeSizes', data: d }) as readonly bigint[])
            : Promise.resolve(null),
        ]);
        return { results, sizes };
      },
      { timeoutMs: rpcMs, signal },
    );

    // Classify holders: burn, pools, launchpad / locker contracts, then code size.
    const poolSet = new Set(g.pools.map((p) => p.address.toLowerCase()));
    for (const p of gp?.pools ?? []) poolSet.add(p.id.toLowerCase());
    const v4 = EVM_CHAINS[chain].uniswapV4PoolManager;
    if (v4) poolSet.add(v4.toLowerCase());
    const launchpadSet = new Set(
      [LAUNCHPAD_ADDRESSES.fourMemeTokenManager2, LAUNCHPAD_ADDRESSES.flapPortalBsc, LAUNCHPAD_ADDRESSES.flapPortalRobinhood, ...(lpad?.pools ?? []).map((p) => p.address)].map((a) => a.toLowerCase()),
    );
    const lockerSet = new Set([LAUNCHPAD_ADDRESSES.ponsV2LaunchLocker, ...(lpad?.lp?.lockers ?? []).map((l) => l.address)].map((a) => a.toLowerCase()));
    if (holders) {
      unknownKind.forEach((h, i) => {
        const size = work?.sizes?.[i];
        if (size !== undefined) h.kind = size > 0n ? 'contract' : 'eoa';
      });
      for (const h of holders) {
        const a = h.address.toLowerCase();
        if (isBurnAddress(a)) h.kind = 'burn';
        else if (poolSet.has(a)) h.kind = 'pool';
        else if (launchpadSet.has(a)) h.kind = 'launchpad';
        else if (lockerSet.has(a)) h.kind = 'locker';
      }
    }

    let creator: CreatorInfo = { address: creatorAddr, balance: null, share: null };
    let i = 0;
    if (creatorAddr) {
      const r = work?.results[i++];
      const bal = r?.success ? (decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: r.data }) as bigint) : null;
      if (bal !== null) creator = { address: creatorAddr, balance: units(bal, decimals), share: supply && supply > 0n ? Number((bal * 1_000_000n) / supply) / 1_000_000 : null };
      else {
        const fromGp = gp?.creator && gp.creator.address?.toLowerCase() === creatorAddr.toLowerCase() ? gp.creator : null;
        if (fromGp) creator = fromGp;
      }
    }

    let lpInfo: LpInfo | null = null;
    if (mainV2) {
      const ts = work?.results[i++];
      const lpSupply = ts?.success ? (decodeFunctionResult({ abi: tokenAbi, functionName: 'totalSupply', data: ts.data }) as bigint) : null;
      let burned = 0n;
      let ok = lpSupply !== null;
      for (let b = 0; b < BURN_ADDRESSES.length; b++) {
        const r = work?.results[i++];
        if (!r?.success) ok = false;
        else burned += decodeFunctionResult({ abi: tokenAbi, functionName: 'balanceOf', data: r.data }) as bigint;
      }
      if (ok && lpSupply && lpSupply > 0n) {
        const gpLp = gp?.lp;
        lpInfo = {
          pool: mainV2,
          burnedShare: Number((burned * 1_000_000n) / lpSupply) / 1_000_000,
          lockedShare: gpLp?.lockedShare ?? null,
          lockers: gpLp?.lockers ?? [],
          provider: 'onchain',
        };
      }
    }
    return { holders: holders ? holders.slice(0, TOP_HOLDERS) : null, creator, lp: lpInfo };
  }
}

/**
 * Adds the launchpad's own lockers (e.g. the Clanker LP locker) to the LP info:
 * GoPlus lists them as plain LP holders, so their share counts as locked here.
 */
function withTemplateLockers(base: LpInfo | null, launchpad: LaunchpadResult | null, gp: ProviderReport | undefined): LpInfo | null {
  const lockers = launchpad?.lp?.lockers ?? [];
  if (lockers.length === 0) return base ?? launchpad?.lp ?? null;
  if (!base) return launchpad!.lp!;
  const out: LpInfo = { ...base, lockers: [...base.lockers] };
  for (const l of lockers) {
    if (out.lockers.some((x) => x.address.toLowerCase() === l.address.toLowerCase())) continue;
    const held = gp?.lpHolders?.find((h) => h.address.toLowerCase() === l.address.toLowerCase());
    // A share from GoPlus' aggregate list only applies when the base LP info is that same aggregate.
    const share = held && base.provider === 'goplus' ? held.share : null;
    out.lockers.push({ ...l, share });
    if (share !== null) out.lockedShare = Math.min(1, (out.lockedShare ?? 0) + share);
  }
  return out;
}

function cacheKey(chain: EvmChainId, token: string): string {
  return `${chain}:${token.toLowerCase()}`;
}

function skip(statuses: SourceStatus[], provider: SecurityProvider, detail: string, now: Clock): Promise<undefined> {
  statuses.push({ provider, detail, outcome: 'skipped', fetchedAt: now(), ms: 0 });
  return Promise.resolve(undefined);
}

function unsupported(statuses: SourceStatus[], provider: SecurityProvider, detail: string, now: Clock, disabled: boolean): Promise<undefined> {
  statuses.push({ provider, detail, outcome: disabled ? 'skipped' : 'unsupported', fetchedAt: now(), ms: 0 });
  return Promise.resolve(undefined);
}

