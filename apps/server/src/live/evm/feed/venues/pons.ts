// Pons V2 (Robinhood Chain). The PonsV2LaunchFactory deploys a token and its
// own bonding-curve contract (TokenLaunched); the curve is constant product on
// (phantomQuote + realQuote) x tokenReserve, starting at 1.68 ETH x 1B and
// completing when tokenReserve reaches the reserved 2/7 of supply (4.2 ETH
// raised). CurveBuy / CurveSell carry the trade (quote in gross / out net, plus
// the 1% fee and the creator tax), so the post-trade reserves follow exactly
// from the deltas. At graduation the factory sweeps the curve (LaunchSwept)
// and seeds a Uniswap V4 pool (ETH / token, fee 0, tick spacing 200,
// PonsV2MemeHook) with a locked full-range position (PoolGraduated).
// Signatures, the reserve accounting and the PoolId were checked against
// mainnet logs and eth_call reads of the curves.

import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, parseAbi, toEventSelector, type Hex } from 'viem';
import { decodeCall, encodeCall, topicAddress, v4PoolId, ZERO_ADDRESS, type PoolKey } from '../abi';
import { LruMap } from '../lru';
import { toUnits } from '../math';
import type { Erc20Info } from '../metadata';
import { cleanSocials, cleanText } from '../metadata';
import type { LogInterest } from '../poller';
import type { AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, LaunchInput, Venue } from './types';
import type { UniswapV4Venue, V4Init } from './uniswap-v4';

export const PONS = {
  factory: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
  memeHook: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
  /** Graduated pools: native ETH / token, LP fee 0 (the hook takes fees), tick spacing 200. */
  poolFee: 0,
  poolTickSpacing: 200,
} as const;

export const PONS_TOPIC = {
  tokenLaunched: toEventSelector('TokenLaunched(address,address,address,address,uint256,uint256)'),
  launchSwept: toEventSelector('LaunchSwept(address,uint256,uint256)'),
  poolGraduated: toEventSelector('PoolGraduated(address,uint256,uint256,uint256)'),
  curveBuy: toEventSelector('CurveBuy(address,address,uint256,uint256,uint256,uint256)'),
  curveSell: toEventSelector('CurveSell(address,address,uint256,uint256,uint256,uint256)'),
  curveCompleted: toEventSelector('CurveCompleted(address,uint256,uint256)'),
} as const;

const curveAbi = parseAbi([
  'function token() view returns (address)',
  'function factory() view returns (address)',
  'function pairToken() view returns (address)',
  'function phantomQuote() view returns (uint256)',
  'function launchSupply() view returns (uint256)',
  'function reservedTokens() view returns (uint256)',
  'function feeBps() view returns (uint256)',
  'function launchedAt() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
]);
const tokenAbi = parseAbi([
  'function logo() view returns (string)',
  'function description() view returns (string)',
  'function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)',
]);
const factoryAbi = parseAbi([
  'function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))',
]);

/** A curve's immutable parameters and its live reserves (raw). */
export interface PonsCurve {
  curve: string;
  token: string;
  phantomQuote: bigint;
  launchSupply: bigint;
  reserved: bigint;
  feeBps: number;
  quoteReserve: bigint;
  tokenReserve: bigint;
  graduated: boolean;
  /** Launch time (ms), 0 when unknown. */
  launchedAt: number;
}

/** The curve as World reserves: virtual = phantom + real quote x token reserve; sellable = reserve - reserved. */
export function ponsCurveState(c: PonsCurve, tokenDecimals = 18) {
  const realQuote = c.quoteReserve - c.phantomQuote;
  return {
    virtualNative: toUnits(c.quoteReserve, 18),
    virtualTokens: toUnits(c.tokenReserve, tokenDecimals),
    realNative: toUnits(realQuote > 0n ? realQuote : 0n, 18),
    realTokens: toUnits(c.tokenReserve > c.reserved ? c.tokenReserve - c.reserved : 0n, tokenDecimals),
    initialRealTokens: toUnits(c.launchSupply - c.reserved, tokenDecimals),
    feeRate: c.feeBps / 10_000,
  };
}

interface LaunchEvent extends FeedEvent {
  kind: 'launch';
  token: string;
  curve: string;
  deployer: string;
  pairToken: string;
  /** Filled by prepare. */
  ready?: { params: PonsCurve; erc20: Erc20Info; deployer: string | null; logo: string; description: string; socials: ReturnType<typeof cleanSocials> };
}
interface TradeEvent extends FeedEvent {
  kind: 'trade';
  curve: string;
  side: 'buy' | 'sell';
  /** Quote in (buy, gross) or out (sell, net); tokens out / in; venue fee; creator tax. */
  quote: bigint;
  tokens: bigint;
  fee: bigint;
  tax: bigint;
}
interface CompleteEvent extends FeedEvent {
  kind: 'complete';
  curve: string;
}
interface GraduateEvent extends FeedEvent {
  kind: 'graduate';
  token: string;
  tokenAmount: bigint;
  quoteAmount: bigint;
  pool?: AmmPool | null;
}
type PonsEvent = LaunchEvent | TradeEvent | CompleteEvent | GraduateEvent;

export class PonsVenue implements Venue {
  readonly id = 'pons';
  /** Curves followed, by curve address. */
  private readonly curves = new Map<string, PonsCurve>();
  private readonly curveOfToken = new Map<string, string>();
  /** Curves that are not native-quoted Pons curves (or failed to load). */
  private readonly ignored = new LruMap<string, true>(20_000);
  /** Curves launched or first traded this window (decoded before their state is known). */
  private readonly pending = new Map<string, LaunchEvent | null>();

  constructor(private readonly v4: UniswapV4Venue | undefined) {
    // Graduation pools are this venue's, never generic new pairs.
    v4?.addClaimant({ expects: (init: V4Init) => init.key.hooks === PONS.memeHook });
  }

  get followed(): number {
    return this.curves.size;
  }

  interests(): LogInterest[] {
    return [
      { address: [PONS.factory], topics: [[PONS_TOPIC.tokenLaunched, PONS_TOPIC.poolGraduated, PONS_TOPIC.launchSwept]] },
      // Every Pons curve is its own contract: match the curve events by topic and keep the known curves.
      { topics: [[PONS_TOPIC.curveBuy, PONS_TOPIC.curveSell, PONS_TOPIC.curveCompleted]] },
    ];
  }

  decode(log: RawLog): PonsEvent | null {
    const t0 = log.topics[0];
    if (log.address === PONS.factory) {
      if (t0 === PONS_TOPIC.tokenLaunched && log.topics.length === 4) {
        const [pairToken] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], log.data);
        const curve = topicAddress(log.topics[2]);
        const e: LaunchEvent = { venue: this, log, kind: 'launch', token: topicAddress(log.topics[1]), curve, deployer: topicAddress(log.topics[3]), pairToken: (pairToken as string).toLowerCase() };
        this.pending.set(curve, e);
        return e;
      }
      if (t0 === PONS_TOPIC.poolGraduated && log.topics.length === 2) {
        const [, tokenAmount, quoteAmount] = decodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], log.data);
        return { venue: this, log, kind: 'graduate', token: topicAddress(log.topics[1]), tokenAmount, quoteAmount };
      }
      return null;
    }
    if (this.ignored.has(log.address)) return null;
    if ((t0 === PONS_TOPIC.curveBuy || t0 === PONS_TOPIC.curveSell) && log.topics.length === 3) {
      if (!this.curves.has(log.address) && !this.pending.has(log.address)) this.pending.set(log.address, null);
      const [a, b, fee, tax] = decodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], log.data);
      const buy = t0 === PONS_TOPIC.curveBuy;
      return { venue: this, log, kind: 'trade', curve: log.address, side: buy ? 'buy' : 'sell', quote: buy ? a : b, tokens: buy ? b : a, fee, tax, trade: true };
    }
    if (t0 === PONS_TOPIC.curveCompleted && (this.curves.has(log.address) || this.pending.has(log.address))) return { venue: this, log, kind: 'complete', curve: log.address };
    return null;
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    const evs = events as PonsEvent[];
    // Curves to load: launches of this window and curves first seen trading (launched before we started).
    const launches = evs.filter((e): e is LaunchEvent => e.kind === 'launch');
    const unknown = [...this.pending.entries()].filter(([curve, l]) => l === null && !this.curves.has(curve)).map(([curve]) => curve);
    const curvesToRead = [...new Set([...launches.map((l) => l.curve), ...unknown])];
    if (curvesToRead.length) {
      const loaded = await this.readCurves(curvesToRead, ctx, ctx.windowTo);
      const launched = new Set(launches.map((l) => l.curve));
      for (const [curve, c] of loaded) {
        if (launched.has(curve)) {
          // A launch of this window starts at its phantom quote x the full supply.
          c.quoteReserve = c.phantomQuote;
          c.tokenReserve = c.launchSupply;
          c.graduated = false;
        } else {
          // Read at the window's end: walk this window's trades back to the state before them.
          for (const e of evs) if (e.kind === 'trade' && e.curve === curve) undoTrade(c, e);
        }
      }
      const tokens = [...loaded.values()].map((c) => c.token);
      const erc20 = await ctx.meta.erc20(tokens);
      const extra = await this.readTokenMeta(tokens, ctx);
      // Deployers of curves first seen trading (a launch names its deployer).
      const adoptedTokens = [...loaded.entries()].filter(([curve]) => !launched.has(curve)).map(([, c]) => c.token);
      const deployers = await this.readDeployers(adoptedTokens, ctx);
      for (const [curve, c] of loaded) {
        const info = erc20.get(c.token);
        if (!info) {
          this.ignored.set(curve, true);
          continue;
        }
        const ready = { params: c, erc20: info, deployer: deployers.get(c.token) ?? null, ...(extra.get(c.token) ?? { logo: '', description: '', socials: {} }) };
        const launch = launches.find((l) => l.curve === curve);
        if (launch) launch.ready = ready;
        else this.adopted.set(curve, ready);
      }
    }
    // Graduation pools.
    for (const e of evs) {
      if (e.kind !== 'graduate' || !this.v4) continue;
      const key = graduatedKey(e.token);
      const t = ctx.token(e.token);
      e.pool = await this.v4.loadPool(key, v4PoolId(key), e.token, t?.decimals ?? 18, ctx.timeOf(e.log), ctx);
    }
  }

  /** Curves first seen trading this window (pre-window state), registered at their first trade. */
  private readonly adopted = new Map<string, NonNullable<LaunchEvent['ready']>>();

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as PonsEvent;
    if (e.kind === 'launch') {
      if (!e.ready) {
        this.ignored.set(e.curve, true);
        return;
      }
      this.register(e.ready, e.deployer, ctx.timeOf(e.log), ctx);
      return;
    }
    if (e.kind === 'trade') {
      let c = this.curves.get(e.curve);
      if (!c) {
        const a = this.adopted.get(e.curve);
        if (!a) return;
        this.adopted.delete(e.curve);
        c = this.register(a, a.deployer, a.params.launchedAt || ctx.timeOf(e.log), ctx) ?? undefined;
        if (!c) return;
      }
      applyTrade(c, e);
      const t = ctx.token(c.token);
      if (!t) return;
      const wallet = ctx.traderOf(e.log, e.side === 'buy' ? topicAddress(e.log.topics[2]) : topicAddress(e.log.topics[1]));
      if (!wallet) return;
      const s = ponsCurveState(c, t.decimals);
      ctx.trade(t, {
        wallet,
        side: e.side,
        nativeAmount: toUnits(e.quote, 18),
        tokenAmount: toUnits(e.tokens, t.decimals),
        at: ctx.timeOf(e.log),
        txHash: e.log.transactionHash,
        slot: Number(e.log.blockNumber),
        curve: { virtualNative: s.virtualNative, virtualTokens: s.virtualTokens, realNative: s.realNative, realTokens: s.realTokens },
      });
      return;
    }
    if (e.kind === 'complete') {
      const c = this.curves.get(e.curve);
      const t = c && ctx.token(c.token);
      if (c) c.graduated = true;
      if (t) ctx.complete(t, ctx.timeOf(e.log));
      return;
    }
    // graduate
    const t = ctx.token(e.token);
    if (!t) return;
    if (t.status === 'curve') ctx.complete(t, ctx.timeOf(e.log));
    if (e.pool) {
      e.pool.lpBurnedRate = 1;
      ctx.migrate(t, e.pool, ctx.timeOf(e.log));
    }
    const curve = this.curveOfToken.get(e.token);
    if (curve) this.forgetCurve(curve);
  }

  endWindow(): void {
    this.pending.clear();
    this.adopted.clear();
  }

  untrack(token: string): void {
    const curve = this.curveOfToken.get(token);
    if (curve) this.forgetCurve(curve);
  }

  private forgetCurve(curve: string): void {
    const c = this.curves.get(curve);
    this.curves.delete(curve);
    if (c) this.curveOfToken.delete(c.token);
  }

  private register(r: NonNullable<LaunchEvent['ready']>, deployer: string | null, at: number, ctx: FeedContext): PonsCurve | null {
    const c = r.params;
    if (c.graduated) return null;
    const s = ponsCurveState(c, r.erc20.decimals);
    const input: LaunchInput = {
      token: c.token,
      launchpad: 'pons',
      venue: this.id,
      creator: deployer ?? c.token,
      createdAt: at,
      erc20: r.erc20,
      status: 'curve',
      curve: s,
      description: r.description,
      imageUrl: ctx.meta.imageUrl(r.logo),
      metadataUri: r.logo || null,
      socials: r.socials,
    };
    const t = ctx.launch(input);
    if (!t) return null;
    this.curves.set(c.curve, c);
    this.curveOfToken.set(c.token, c.curve);
    return c;
  }

  /** Immutable curve parameters + current reserves; drops non-Pons or non-ETH curves. */
  private async readCurves(curves: string[], ctx: FeedContext, block?: bigint): Promise<Map<string, PonsCurve>> {
    const fns = ['token', 'factory', 'pairToken', 'phantomQuote', 'launchSupply', 'reservedTokens', 'feeBps', 'graduated', 'getReserves', 'launchedAt'] as const;
    const res = await ctx.rpc.call(
      curves.flatMap((c) => fns.map((fn) => ({ target: c, data: encodeFunctionData({ abi: curveAbi, functionName: fn }) }))),
      block,
    );
    const out = new Map<string, PonsCurve>();
    curves.forEach((curve, i) => {
      const r = res.slice(i * fns.length, (i + 1) * fns.length);
      const dec = <T>(j: number) => decodeCall<T>(curveAbi, fns[j], r[j]);
      const factory = dec<string>(1)?.toLowerCase();
      const pair = dec<string>(2)?.toLowerCase();
      const reserves = dec<readonly [bigint, bigint]>(8);
      const token = dec<string>(0);
      const phantomQuote = dec<bigint>(3);
      const launchSupply = dec<bigint>(4);
      const reserved = dec<bigint>(5);
      const feeBps = dec<bigint>(6);
      // Only native-quoted curves of the Pons V2 factory.
      if (factory !== PONS.factory || pair !== ZERO_ADDRESS || !reserves || !token || phantomQuote === null || !launchSupply || reserved === null || feeBps === null) {
        this.ignored.set(curve, true);
        return;
      }
      out.set(curve, {
        curve,
        token: token.toLowerCase(),
        phantomQuote,
        launchSupply,
        reserved,
        feeBps: Number(feeBps),
        graduated: dec<boolean>(7) === true,
        quoteReserve: reserves[0],
        tokenReserve: reserves[1],
        launchedAt: Number(dec<bigint>(9) ?? 0n) * 1000,
      });
    });
    return out;
  }

  private async readDeployers(tokens: string[], ctx: FeedContext): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (tokens.length === 0) return out;
    const res = await ctx.rpc.call(tokens.map((t) => ({ target: PONS.factory, data: encodeCall(factoryAbi, 'getLaunchedToken', [t]) })));
    tokens.forEach((t, i) => {
      const info = decodeCall<{ deployer: string; exists: boolean }>(factoryAbi, 'getLaunchedToken', res[i]);
      if (info?.exists) out.set(t, info.deployer.toLowerCase());
    });
    return out;
  }

  private async readTokenMeta(tokens: string[], ctx: FeedContext): Promise<Map<string, { logo: string; description: string; socials: ReturnType<typeof cleanSocials> }>> {
    const fns = ['logo', 'description', 'socials'] as const;
    const res = await ctx.rpc.call(tokens.flatMap((t) => fns.map((fn) => ({ target: t, data: encodeFunctionData({ abi: tokenAbi, functionName: fn }) }))));
    const out = new Map<string, { logo: string; description: string; socials: ReturnType<typeof cleanSocials> }>();
    tokens.forEach((t, i) => {
      const [logo, description, socials] = res.slice(i * 3, i * 3 + 3);
      const s = decodeCall<readonly [string, string, string, string, string]>(tokenAbi, 'socials', socials);
      out.set(t, {
        logo: decodeCall<string>(tokenAbi, 'logo', logo) ?? '',
        description: cleanText(decodeCall<string>(tokenAbi, 'description', description) ?? '', 600),
        socials: s ? cleanSocials({ twitter: s[0], telegram: s[1], website: s[3] }) : {},
      });
    });
    return out;
  }

  /** ensureToken: a Pons V2 token still on its curve, or graduated into its V4 pool. */
  async detect(token: string, ctx: FeedContext): Promise<boolean> {
    const [raw] = await ctx.rpc.call([{ target: PONS.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: 'getLaunchedToken', args: [token as Hex] }) }]);
    if (!raw) return false;
    const info = decodeFunctionResult({ abi: factoryAbi, functionName: 'getLaunchedToken', data: raw });
    if (!info.exists || info.pairToken.toLowerCase() !== ZERO_ADDRESS) return false;
    const curves = await this.readCurves([info.curve.toLowerCase()], ctx);
    const c = curves.get(info.curve.toLowerCase());
    const erc20 = (await ctx.meta.erc20([token])).get(token);
    if (!c || !erc20) return false;
    const meta = (await this.readTokenMeta([token], ctx)).get(token) ?? { logo: '', description: '', socials: {} };
    const at = c.launchedAt || ctx.now();
    if (!c.graduated && info.sweptAt === 0n) return !!this.register({ params: c, erc20, deployer: null, ...meta }, info.deployer.toLowerCase(), at, ctx);
    if (!this.v4) return false;
    const key = graduatedKey(token);
    const pool = await this.v4.loadPool(key, v4PoolId(key), token, erc20.decimals, at, ctx);
    if (!pool) return false;
    pool.lpBurnedRate = 1;
    const t = ctx.launch({
      token,
      launchpad: 'pons',
      venue: this.v4.id,
      creator: info.deployer.toLowerCase(),
      createdAt: at,
      erc20,
      status: 'migrated',
      pool,
      description: meta.description,
      imageUrl: ctx.meta.imageUrl(meta.logo),
      metadataUri: meta.logo || null,
      socials: meta.socials,
    });
    return !!t;
  }
}

/** The V4 pool a Pons V2 token graduates into. */
export function graduatedKey(token: string): PoolKey {
  return { currency0: ZERO_ADDRESS, currency1: token.toLowerCase(), fee: PONS.poolFee, tickSpacing: PONS.poolTickSpacing, hooks: PONS.memeHook };
}

/** Reserves after a trade: buys add quote net of fee and tax, sells pay out quote plus fee and tax. */
export function applyTrade(c: PonsCurve, e: { side: 'buy' | 'sell'; quote: bigint; tokens: bigint; fee: bigint; tax: bigint }): void {
  if (e.side === 'buy') {
    c.quoteReserve += e.quote - e.fee - e.tax;
    c.tokenReserve -= e.tokens;
  } else {
    c.quoteReserve -= e.quote + e.fee + e.tax;
    c.tokenReserve += e.tokens;
  }
}

/** The reserves before a trade (inverse of applyTrade). */
export function undoTrade(c: PonsCurve, e: { side: 'buy' | 'sell'; quote: bigint; tokens: bigint; fee: bigint; tax: bigint }): void {
  if (e.side === 'buy') {
    c.quoteReserve -= e.quote - e.fee - e.tax;
    c.tokenReserve += e.tokens;
  } else {
    c.quoteReserve += e.quote + e.fee + e.tax;
    c.tokenReserve -= e.tokens;
  }
}
