// Flap (flap.sh) on BNB Chain and Robinhood Chain. One portal contract emits
// everything: TokenCreated (+ the launch's curve parameters in the same
// transaction), trades (TokenBought / TokenSold, each preceded by
// FlapTokenCirculatingSupplyChanged) and LaunchedToDEX at graduation. The CDPV2
// curve is (R + r)(1e9 + h - S) = k: virtual native R + r against virtual
// tokens 1e9 + h - S, with S the circulating supply and graduation at the
// launch's DEX supply threshold, so the post-trade curve follows exactly from
// S. TokenBought.eth is what the buyer paid (fee and tax included);
// TokenSold.eth what the seller received. Checked against mainnet logs and the
// portal's getTokenV8 reads on both chains.

import { decodeAbiParameters, parseAbi, toEventSelector } from 'viem';
import type { EvmChainId } from '../../chains';
import { decodeCall, encodeCall, v2PairAbi, ZERO_ADDRESS } from '../abi';
import { LruMap } from '../lru';
import { toUnits } from '../math';
import { cleanSocials, cleanText, type Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import type { AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, Venue } from './types';
import type { UniswapV2Venue } from './uniswap-v2';
import type { UniswapV3Venue } from './uniswap-v3';

export const FLAP_PORTALS: Partial<Record<EvmChainId, string>> = {
  bsc: '0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0',
  robinhood: '0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09',
};

export const FLAP_TOPIC = {
  tokenCreated: toEventSelector('TokenCreated(uint256,address,uint256,address,string,string,string)'),
  curveSetV2: toEventSelector('TokenCurveSetV2(address,uint256,uint256,uint256)'),
  dexSupplyThresh: toEventSelector('TokenDexSupplyThreshSet(address,uint256)'),
  quoteSet: toEventSelector('TokenQuoteSet(address,address)'),
  taxSet: toEventSelector('FlapTokenTaxSet(address,uint256)'),
  asymmetricTaxSet: toEventSelector('FlapTokenAsymmetricTaxSet(address,uint256,uint256)'),
  supplyChanged: toEventSelector('FlapTokenCirculatingSupplyChanged(address,uint256)'),
  bought: toEventSelector('TokenBought(uint256,address,address,uint256,uint256,uint256,uint256)'),
  sold: toEventSelector('TokenSold(uint256,address,address,uint256,uint256,uint256,uint256)'),
  launchedToDex: toEventSelector('LaunchedToDEX(address,address,uint256,uint256)'),
} as const;

const portalAbi = parseAbi([
  'function getTokenV8(address token) view returns ((uint8 status, uint256 reserve, uint256 circulatingSupply, uint256 price, uint8 tokenVersion, uint256 r, uint256 h, uint256 k, uint256 dexSupplyThresh, address quoteTokenAddress, bool nativeToQuoteSwapEnabled, bytes32 extensionID, uint256 buyTaxRate, uint256 sellTaxRate, address pool, uint256 progress, uint8 lpFeeProfile, uint8 dexId))',
]);
const v3ProbeAbi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick)']);

const ONE_BILLION = 10n ** 27n; // 1e9 tokens at 18 decimals
const FLAP_FEE = 0.01;
/** Portal token status: tradable on the curve / migrated to a DEX. */
const STATUS_CURVE = 1;
const STATUS_DEX = 4;

/** A launch's curve constants (raw, 18-decimal fixed point as the portal stores them). */
export interface FlapCurve {
  token: string;
  r: bigint;
  h: bigint;
  k: bigint;
  thresh: bigint;
  quote: string;
  buyTaxBps: number;
  sellTaxBps: number;
}

/** World curve at circulating supply S: (R + r) x (1e9 + h - S) with R = k / (1e9 + h - S) - r. */
export function flapCurveState(c: FlapCurve, supply: bigint) {
  const vTokens = ONE_BILLION + c.h - supply;
  // k carries one 1e18 scale: virtual native (wei) = k * 1e18 / vTokens.
  const vNative = vTokens > 0n ? (c.k * 10n ** 18n) / vTokens : 0n;
  const real = vNative - c.r;
  return {
    virtualNative: toUnits(vNative, 18),
    virtualTokens: toUnits(vTokens, 18),
    realNative: toUnits(real > 0n ? real : 0n, 18),
    realTokens: toUnits(c.thresh > supply ? c.thresh - supply : 0n, 18),
    initialRealTokens: toUnits(c.thresh, 18),
    feeRate: FLAP_FEE,
  };
}

interface LaunchEvent extends FeedEvent {
  kind: 'launch';
  token: string;
  creator: string;
  name: string;
  symbol: string;
  meta: string;
  curve: Partial<FlapCurve>;
  erc20?: Erc20Info;
}
interface TradeEvent extends FeedEvent {
  kind: 'trade';
  token: string;
  side: 'buy' | 'sell';
  account: string;
  amount: bigint;
  eth: bigint;
  /** Circulating supply after the trade (from the preceding FlapTokenCirculatingSupplyChanged). */
  supply: bigint | null;
}
interface DexEvent extends FeedEvent {
  kind: 'dex';
  token: string;
  pool: string;
  amount: bigint;
  eth: bigint;
  /** Resolved by prepare. */
  poolKind?: 'v2' | 'v3' | null;
  v3Pool?: AmmPool | null;
}
type FlapEvent = LaunchEvent | TradeEvent | DexEvent;

export class FlapVenue implements Venue {
  readonly id: string;
  private readonly portal: string;
  private readonly curves = new Map<string, FlapCurve>();
  private readonly ignored = new LruMap<string, true>(20_000);
  /** Per window: launches by token, the last circulating supply seen per token. */
  private readonly launches = new Map<string, LaunchEvent>();
  private readonly lastSupply = new Map<string, bigint>();
  /** Tokens first seen trading this window, loaded by prepare. */
  private readonly adopted = new Map<string, { curve: FlapCurve; erc20: Erc20Info } | null>();

  constructor(
    private readonly chain: EvmChainId,
    readonly launchpad: string,
    private readonly dex: { v2?: UniswapV2Venue; v3?: UniswapV3Venue },
  ) {
    this.id = launchpad;
    this.portal = FLAP_PORTALS[chain]!;
    // Pairs created for a Flap token (at launch or graduation) are its graduation pool, not a new pair.
    const claim = (token: string) => this.curves.has(token) || this.launches.has(token);
    dex.v2?.addClaim(claim);
    dex.v3?.addClaim(claim);
  }

  get followed(): number {
    return this.curves.size;
  }

  interests(): LogInterest[] {
    // Everything but the progress / tax-paid / cosmetic events the venue never reads.
    return [{ address: [this.portal], topics: [Object.values(FLAP_TOPIC)] }];
  }

  decode(log: RawLog): FlapEvent | null {
    if (log.address !== this.portal || log.topics.length !== 1) return null;
    const t0 = log.topics[0];
    const word = (i: number) => BigInt(`0x${log.data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
    const addr = (i: number) => `0x${log.data.slice(2 + i * 64 + 24, 2 + (i + 1) * 64)}`.toLowerCase();
    switch (t0) {
      case FLAP_TOPIC.tokenCreated: {
        const [, creator, , token, name, symbol, meta] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'string' }],
          log.data,
        );
        const e: LaunchEvent = { venue: this, log, kind: 'launch', token: token.toLowerCase(), creator: creator.toLowerCase(), name, symbol, meta, curve: { token: token.toLowerCase(), quote: ZERO_ADDRESS, buyTaxBps: 0, sellTaxBps: 0 } };
        this.launches.set(e.token, e);
        return e;
      }
      case FLAP_TOPIC.curveSetV2: {
        const l = this.launches.get(addr(0));
        if (l) Object.assign(l.curve, { r: word(1), h: word(2), k: word(3) });
        return null;
      }
      case FLAP_TOPIC.dexSupplyThresh: {
        const l = this.launches.get(addr(0));
        if (l) l.curve.thresh = word(1);
        return null;
      }
      case FLAP_TOPIC.quoteSet: {
        const l = this.launches.get(addr(0));
        if (l) l.curve.quote = addr(1);
        return null;
      }
      case FLAP_TOPIC.taxSet: {
        const l = this.launches.get(addr(0));
        if (l) l.curve.buyTaxBps = l.curve.sellTaxBps = Number(word(1));
        return null;
      }
      case FLAP_TOPIC.asymmetricTaxSet: {
        const l = this.launches.get(addr(0));
        if (l) Object.assign(l.curve, { buyTaxBps: Number(word(1)), sellTaxBps: Number(word(2)) });
        return null;
      }
      case FLAP_TOPIC.supplyChanged:
        this.lastSupply.set(addr(0), word(1));
        return null;
      case FLAP_TOPIC.bought:
      case FLAP_TOPIC.sold: {
        const token = addr(1);
        if (this.ignored.has(token)) return null;
        const known = this.curves.has(token) || this.launches.has(token);
        if (!known && !this.adopted.has(token)) this.adopted.set(token, null);
        const supply = this.lastSupply.get(token) ?? null;
        this.lastSupply.delete(token);
        return { venue: this, log, kind: 'trade', token, side: t0 === FLAP_TOPIC.bought ? 'buy' : 'sell', account: addr(2), amount: word(3), eth: word(4), supply, trade: true };
      }
      case FLAP_TOPIC.launchedToDex:
        return { venue: this, log, kind: 'dex', token: addr(0), pool: addr(1), amount: word(2), eth: word(3) };
      default:
        return null;
    }
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    const evs = events as FlapEvent[];
    const launches = evs.filter((e): e is LaunchEvent => e.kind === 'launch');
    const adopt = [...this.adopted.keys()].filter((t) => this.adopted.get(t) === null);
    const tokens = [...launches.map((l) => l.token), ...adopt];
    const erc20 = tokens.length ? await ctx.meta.erc20(tokens) : new Map<string, Erc20Info>();
    for (const l of launches) l.erc20 = erc20.get(l.token);
    if (adopt.length) {
      const states = await this.readStates(adopt, ctx);
      for (const t of adopt) {
        const s = states.get(t);
        const info = erc20.get(t);
        if (s && info && s.status === STATUS_CURVE && s.curve.quote === ZERO_ADDRESS) this.adopted.set(t, { curve: s.curve, erc20: info });
        else {
          this.adopted.delete(t);
          this.ignored.set(t, true);
        }
      }
    }
    // Graduation pools: a V2 pair or a V3 pool (probe both).
    const dex = evs.filter((e): e is DexEvent => e.kind === 'dex');
    if (dex.length) {
      const res = await ctx.rpc.call(
        dex.flatMap((d) => [
          { target: d.pool, data: encodeCall(v2PairAbi, 'getReserves') },
          { target: d.pool, data: encodeCall(v3ProbeAbi, 'slot0') },
        ]),
      );
      dex.forEach((d, i) => {
        d.poolKind = res[i * 2] ? 'v2' : res[i * 2 + 1] ? 'v3' : null;
      });
      for (const d of dex) {
        if (d.poolKind === 'v3' && this.dex.v3) d.v3Pool = await this.dex.v3.loadPool(d.pool, d.token, ctx.token(d.token)?.decimals ?? 18, ctx.timeOf(d.log), ctx);
      }
    }
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as FlapEvent;
    if (e.kind === 'launch') return this.applyLaunch(e, ctx);
    if (e.kind === 'trade') return this.applyTrade(e, ctx);
    const t = ctx.token(e.token);
    if (!t) return;
    const at = ctx.timeOf(e.log);
    if (t.status === 'curve') ctx.complete(t, at);
    this.curves.delete(e.token);
    if (e.poolKind === 'v2' && this.dex.v2) this.dex.v2.adoptGraduated(t, e.pool, e.amount, e.eth, at, ctx);
    else if (e.v3Pool) {
      e.v3Pool.lpBurnedRate = 1;
      ctx.migrate(t, e.v3Pool, at);
    }
  }

  private applyLaunch(e: LaunchEvent, ctx: FeedContext): void {
    const c = e.curve;
    // Native-quoted CDPV2 launches only (stock- / stable-quoted vaults price in another asset).
    if (!e.erc20 || c.quote !== ZERO_ADDRESS || c.r === undefined || c.h === undefined || c.k === undefined || c.thresh === undefined) {
      this.ignored.set(e.token, true);
      return;
    }
    const curve = c as FlapCurve;
    const t = ctx.launch({
      token: e.token,
      launchpad: this.launchpad,
      venue: this.id,
      creator: e.creator,
      createdAt: ctx.timeOf(e.log),
      erc20: { ...e.erc20, name: e.erc20.name || cleanText(e.name, 64), symbol: e.erc20.symbol || cleanText(e.symbol, 24) },
      status: 'curve',
      curve: flapCurveState(curve, 0n),
      metadataUri: e.meta || null,
      offchain: e.meta ? { uri: e.meta, parse: (doc) => this.parseMeta(doc, ctx) } : undefined,
      buyTax: curve.buyTaxBps / 10_000,
      sellTax: curve.sellTaxBps / 10_000,
    });
    if (t) this.curves.set(e.token, curve);
  }

  private applyTrade(e: TradeEvent, ctx: FeedContext): void {
    let c = this.curves.get(e.token);
    if (!c) {
      const a = this.adopted.get(e.token);
      if (!a) return;
      this.adopted.delete(e.token);
      const t = ctx.launch({
        token: e.token,
        launchpad: this.launchpad,
        venue: this.id,
        creator: e.token,
        createdAt: ctx.timeOf(e.log),
        erc20: a.erc20,
        status: 'curve',
        curve: flapCurveState(a.curve, e.supply ?? 0n),
        buyTax: a.curve.buyTaxBps / 10_000,
        sellTax: a.curve.sellTaxBps / 10_000,
      });
      if (!t) return;
      c = a.curve;
      this.curves.set(e.token, c);
    }
    const t = ctx.token(e.token);
    if (!t || t.status !== 'curve') return;
    const wallet = ctx.traderOf(e.log, e.account);
    if (!wallet) return;
    const s = e.supply !== null ? flapCurveState(c, e.supply) : null;
    ctx.trade(t, {
      wallet,
      side: e.side,
      nativeAmount: toUnits(e.eth, 18),
      tokenAmount: toUnits(e.amount, t.decimals),
      at: ctx.timeOf(e.log),
      txHash: e.log.transactionHash,
      slot: Number(e.log.blockNumber),
      ...(s ? { curve: { virtualNative: s.virtualNative, virtualTokens: s.virtualTokens, realNative: s.realNative, realTokens: s.realTokens } } : {}),
    });
  }

  /** Flap's IPFS document: { description, image (CID), website, twitter, telegram }. */
  private parseMeta(doc: unknown, ctx: FeedContext) {
    const d = (doc ?? {}) as Record<string, unknown>;
    return {
      description: cleanText(d.description, 600),
      imageUrl: ctx.meta.imageUrl(d.image),
      socials: cleanSocials({ twitter: d.twitter, telegram: d.telegram, website: d.website }),
    };
  }

  endWindow(): void {
    this.launches.clear();
    this.lastSupply.clear();
    this.adopted.clear();
  }

  untrack(token: string): void {
    this.curves.delete(token);
  }

  private async readStates(tokens: string[], ctx: FeedContext): Promise<Map<string, { status: number; curve: FlapCurve; pool: string; supply: bigint }>> {
    const res = await ctx.rpc.call(
      tokens.map((t) => ({ target: this.portal, data: encodeCall(portalAbi, 'getTokenV8', [t]) })),
      ctx.windowTo,
    );
    const out = new Map<string, { status: number; curve: FlapCurve; pool: string; supply: bigint }>();
    tokens.forEach((t, i) => {
      const s = decodeCall<{
        status: number;
        circulatingSupply: bigint;
        r: bigint;
        h: bigint;
        k: bigint;
        dexSupplyThresh: bigint;
        quoteTokenAddress: string;
        buyTaxRate: bigint;
        sellTaxRate: bigint;
        pool: string;
      }>(portalAbi, 'getTokenV8', res[i]);
      if (!s || s.r === 0n) return;
      out.set(t, {
        status: Number(s.status),
        supply: s.circulatingSupply,
        pool: s.pool.toLowerCase(),
        curve: {
          token: t,
          r: s.r,
          h: s.h,
          k: s.k,
          thresh: s.dexSupplyThresh,
          quote: s.quoteTokenAddress.toLowerCase(),
          buyTaxBps: Number(s.buyTaxRate),
          sellTaxBps: Number(s.sellTaxRate),
        },
      });
    });
    return out;
  }

  /** ensureToken: a Flap token on its curve, or on the DEX pool it graduated into. */
  async detect(token: string, ctx: FeedContext): Promise<boolean> {
    const s = (await this.readStates([token], ctx)).get(token);
    if (!s || s.curve.quote !== ZERO_ADDRESS) return false;
    const erc20 = (await ctx.meta.erc20([token])).get(token);
    if (!erc20) return false;
    const at = ctx.now();
    if (s.status === STATUS_CURVE) {
      const t = ctx.launch({
        token,
        launchpad: this.launchpad,
        venue: this.id,
        creator: token,
        createdAt: at,
        erc20,
        status: 'curve',
        curve: flapCurveState(s.curve, s.supply),
        buyTax: s.curve.buyTaxBps / 10_000,
        sellTax: s.curve.sellTaxBps / 10_000,
      });
      if (t) this.curves.set(token, s.curve);
      return !!t;
    }
    if (s.status !== STATUS_DEX || s.pool === ZERO_ADDRESS) return false;
    const [v2, v3] = await ctx.rpc.call([
      { target: s.pool, data: encodeCall(v2PairAbi, 'getReserves') },
      { target: s.pool, data: encodeCall(v3ProbeAbi, 'slot0') },
    ]);
    if (v2 && this.dex.v2) return this.dex.v2.detectPool(token, s.pool, this.launchpad, erc20, at, ctx);
    if (v3 && this.dex.v3) return this.dex.v3.detectPool(token, s.pool, this.launchpad, erc20, at, ctx);
    return false;
  }

  /** Test seam: the decoded curve of a followed token. */
  curveOf(token: string): FlapCurve | undefined {
    return this.curves.get(token);
  }
}

