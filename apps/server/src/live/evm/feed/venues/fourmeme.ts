// four.meme (BNB Chain), TokenManager2. TokenCreate announces a launch;
// TokenPurchase / TokenSale carry each trade with the curve's state after it
// (`offers`: tokens left for sale, `funds`: quote raised). The curve is
// constant product on virtual reserves (funds + a) x (offers + b) with
// a = maxFunds x 25/73 and b = maxOffers x 25/73 (fitted exactly over hundreds
// of mainnet trades; maxFunds / maxOffers come from TokenManagerHelper3's
// getTokenInfo). `cost` moves the raised funds (net of the fee on buys, gross
// on sells). LiquidityAdded marks graduation into PancakeSwap.

import { decodeAbiParameters, parseAbi, toEventSelector } from 'viem';
import { decodeCall, encodeCall, ZERO_ADDRESS } from '../abi';
import { LruMap } from '../lru';
import { toUnits } from '../math';
import { cleanText, type Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import type { AmmPool } from '../pools';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, Venue } from './types';
import type { UniswapV2Venue } from './uniswap-v2';

export const FOUR_MEME = {
  tokenManager: '0x5c952063c7fc8610ffdb798152d69f0b9550762b',
  helper: '0xf251f83e40a78868fcfa3fa4599dad6494e46034',
} as const;

export const FOUR_TOPIC = {
  tokenCreate: toEventSelector('TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)'),
  purchase: toEventSelector('TokenPurchase(address,address,uint256,uint256,uint256,uint256,uint256,uint256)'),
  sale: toEventSelector('TokenSale(address,address,uint256,uint256,uint256,uint256,uint256,uint256)'),
  liquidityAdded: toEventSelector('LiquidityAdded(address,uint256,address,uint256)'),
} as const;

const helperAbi = parseAbi([
  'function getTokenInfo(address token) view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)',
  'function getPancakePair(address token) view returns (address)',
]);

/** Virtual reserve offsets are 25/73 of the curve's max funds / max offers. */
const VIRTUAL_NUM = 25n;
const VIRTUAL_DEN = 73n;

export interface FourCurve {
  token: string;
  maxOffers: bigint;
  maxFunds: bigint;
  feeRate: number;
}

export function fourCurveState(c: FourCurve, offers: bigint, funds: bigint, tokenDecimals = 18) {
  const a = (c.maxFunds * VIRTUAL_NUM) / VIRTUAL_DEN;
  const b = (c.maxOffers * VIRTUAL_NUM) / VIRTUAL_DEN;
  return {
    virtualNative: toUnits(funds + a, 18),
    virtualTokens: toUnits(offers + b, tokenDecimals),
    realNative: toUnits(funds, 18),
    realTokens: toUnits(offers, tokenDecimals),
    initialRealTokens: toUnits(c.maxOffers, tokenDecimals),
    feeRate: c.feeRate,
  };
}

interface Info {
  manager: string;
  quote: string;
  feeRate: number;
  launchTime: number;
  offers: bigint;
  maxOffers: bigint;
  funds: bigint;
  maxFunds: bigint;
  liquidityAdded: boolean;
}

interface CreateEvent extends FeedEvent {
  kind: 'create';
  token: string;
  creator: string;
  name: string;
  symbol: string;
  ready?: { curve: FourCurve; erc20: Erc20Info };
}
interface TradeEvent extends FeedEvent {
  kind: 'trade';
  token: string;
  side: 'buy' | 'sell';
  account: string;
  amount: bigint;
  cost: bigint;
  fee: bigint;
  offers: bigint;
  funds: bigint;
}
interface GraduateEvent extends FeedEvent {
  kind: 'graduate';
  token: string;
  pool?: AmmPool | null;
}
type FourEvent = CreateEvent | TradeEvent | GraduateEvent;

export class FourMemeVenue implements Venue {
  readonly id = 'fourmeme';
  private readonly curves = new Map<string, FourCurve>();
  private readonly ignored = new LruMap<string, true>(20_000);
  private readonly creates = new Map<string, CreateEvent>();
  private readonly adopted = new Map<string, { curve: FourCurve; erc20: Erc20Info; launchTime: number } | null>();

  constructor(private readonly v2: UniswapV2Venue | undefined) {
    v2?.addClaim((token) => this.curves.has(token) || this.creates.has(token));
  }

  get followed(): number {
    return this.curves.size;
  }

  interests(): LogInterest[] {
    return [{ address: [FOUR_MEME.tokenManager], topics: [[FOUR_TOPIC.tokenCreate, FOUR_TOPIC.purchase, FOUR_TOPIC.sale, FOUR_TOPIC.liquidityAdded]] }];
  }

  decode(log: RawLog): FourEvent | null {
    if (log.address !== FOUR_MEME.tokenManager || log.topics.length !== 1) return null;
    const t0 = log.topics[0];
    if (t0 === FOUR_TOPIC.tokenCreate) {
      const [creator, token, , name, symbol] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'string' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
        log.data,
      );
      const e: CreateEvent = { venue: this, log, kind: 'create', token: token.toLowerCase(), creator: creator.toLowerCase(), name, symbol };
      this.creates.set(e.token, e);
      return e;
    }
    if (t0 === FOUR_TOPIC.purchase || t0 === FOUR_TOPIC.sale) {
      const [token, account, , amount, cost, fee, offers, funds] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
        log.data,
      );
      const tk = token.toLowerCase();
      if (this.ignored.has(tk)) return null;
      if (!this.curves.has(tk) && !this.creates.has(tk) && !this.adopted.has(tk)) this.adopted.set(tk, null);
      return { venue: this, log, kind: 'trade', token: tk, side: t0 === FOUR_TOPIC.purchase ? 'buy' : 'sell', account: account.toLowerCase(), amount, cost, fee, offers, funds, trade: true };
    }
    if (t0 === FOUR_TOPIC.liquidityAdded) {
      const [base] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }], log.data);
      return { venue: this, log, kind: 'graduate', token: base.toLowerCase() };
    }
    return null;
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    const evs = events as FourEvent[];
    const creates = evs.filter((e): e is CreateEvent => e.kind === 'create');
    const adopt = [...this.adopted.keys()].filter((t) => this.adopted.get(t) === null);
    const tokens = [...creates.map((c) => c.token), ...adopt];
    if (tokens.length) {
      const [infos, erc20] = await Promise.all([this.readInfo(tokens, ctx), ctx.meta.erc20(tokens)]);
      for (const c of creates) {
        const info = infos.get(c.token);
        const e20 = erc20.get(c.token);
        if (info && e20 && info.quote === ZERO_ADDRESS && info.manager === FOUR_MEME.tokenManager) c.ready = { curve: curveOf(c.token, info), erc20: e20 };
      }
      for (const t of adopt) {
        const info = infos.get(t);
        const e20 = erc20.get(t);
        if (info && e20 && info.quote === ZERO_ADDRESS && info.manager === FOUR_MEME.tokenManager && !info.liquidityAdded) this.adopted.set(t, { curve: curveOf(t, info), erc20: e20, launchTime: info.launchTime });
        else {
          this.adopted.delete(t);
          this.ignored.set(t, true);
        }
      }
    }
    // Graduations: the PancakeSwap pair and its reserves.
    for (const e of evs) {
      if (e.kind !== 'graduate' || !this.v2) continue;
      const [raw] = await ctx.rpc.call([{ target: FOUR_MEME.helper, data: encodeCall(helperAbi, 'getPancakePair', [e.token]) }]);
      const pair = decodeCall<string>(helperAbi, 'getPancakePair', raw)?.toLowerCase();
      if (!pair || /^0x0+$/.test(pair)) continue;
      e.pool = await this.v2.loadPair(pair, e.token, ctx.token(e.token)?.decimals ?? 18, ctx.timeOf(e.log), ctx);
    }
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as FourEvent;
    if (e.kind === 'create') {
      if (!e.ready) {
        this.ignored.set(e.token, true);
        return;
      }
      const { curve, erc20 } = e.ready;
      const t = ctx.launch({
        token: e.token,
        launchpad: 'fourmeme',
        venue: this.id,
        creator: e.creator,
        createdAt: ctx.timeOf(e.log),
        erc20: { ...erc20, name: erc20.name || cleanText(e.name, 64), symbol: erc20.symbol || cleanText(e.symbol, 24) },
        status: 'curve',
        curve: fourCurveState(curve, curve.maxOffers, 0n, erc20.decimals),
      });
      if (t) this.curves.set(e.token, curve);
      return;
    }
    if (e.kind === 'trade') {
      let c = this.curves.get(e.token);
      if (!c) {
        const a = this.adopted.get(e.token);
        if (!a) return;
        this.adopted.delete(e.token);
        const t = ctx.launch({
          token: e.token,
          launchpad: 'fourmeme',
          venue: this.id,
          creator: e.token,
          createdAt: a.launchTime || ctx.timeOf(e.log),
          erc20: a.erc20,
          status: 'curve',
          curve: fourCurveState(a.curve, e.offers, e.funds, a.erc20.decimals),
        });
        if (!t) return;
        c = a.curve;
        this.curves.set(e.token, c);
      }
      const t = ctx.token(e.token);
      if (!t || t.status !== 'curve') return;
      const wallet = ctx.traderOf(e.log, e.account);
      if (!wallet) return;
      const s = fourCurveState(c, e.offers, e.funds, t.decimals);
      // Buyers pay cost + fee; sellers receive cost - fee.
      const native = e.side === 'buy' ? e.cost + e.fee : e.cost > e.fee ? e.cost - e.fee : 0n;
      ctx.trade(t, {
        wallet,
        side: e.side,
        nativeAmount: toUnits(native, 18),
        tokenAmount: toUnits(e.amount, t.decimals),
        at: ctx.timeOf(e.log),
        txHash: e.log.transactionHash,
        slot: Number(e.log.blockNumber),
        curve: { virtualNative: s.virtualNative, virtualTokens: s.virtualTokens, realNative: s.realNative, realTokens: s.realTokens },
      });
      return;
    }
    const t = ctx.token(e.token);
    if (!t) return;
    const at = ctx.timeOf(e.log);
    if (t.status === 'curve') ctx.complete(t, at);
    this.curves.delete(e.token);
    if (e.pool) {
      e.pool.lpBurnedRate = 1;
      ctx.migrate(t, e.pool, at);
    }
  }

  endWindow(): void {
    this.creates.clear();
    this.adopted.clear();
  }

  untrack(token: string): void {
    this.curves.delete(token);
  }

  private async readInfo(tokens: string[], ctx: FeedContext): Promise<Map<string, Info>> {
    const res = await ctx.rpc.call(
      tokens.map((t) => ({ target: FOUR_MEME.helper, data: encodeCall(helperAbi, 'getTokenInfo', [t]) })),
      ctx.windowTo,
    );
    const out = new Map<string, Info>();
    tokens.forEach((t, i) => {
      const r = decodeCall<readonly [bigint, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean]>(helperAbi, 'getTokenInfo', res[i]);
      if (!r || r[8] === 0n) return;
      out.set(t, {
        manager: r[1].toLowerCase(),
        quote: r[2].toLowerCase(),
        feeRate: Number(r[4]) / 10_000,
        launchTime: Number(r[6]) * 1000,
        offers: r[7],
        maxOffers: r[8],
        funds: r[9],
        maxFunds: r[10],
        liquidityAdded: r[11],
      });
    });
    return out;
  }

  /** ensureToken: a four.meme token on its curve, or on PancakeSwap after graduation. */
  async detect(token: string, ctx: FeedContext): Promise<boolean> {
    const info = (await this.readInfo([token], ctx)).get(token);
    if (!info || info.quote !== ZERO_ADDRESS || info.manager !== FOUR_MEME.tokenManager) return false;
    const erc20 = (await ctx.meta.erc20([token])).get(token);
    if (!erc20) return false;
    const at = info.launchTime || ctx.now();
    if (!info.liquidityAdded) {
      const curve = curveOf(token, info);
      const t = ctx.launch({ token, launchpad: 'fourmeme', venue: this.id, creator: token, createdAt: at, erc20, status: 'curve', curve: fourCurveState(curve, info.offers, info.funds, erc20.decimals) });
      if (t) this.curves.set(token, curve);
      return !!t;
    }
    if (!this.v2) return false;
    const [raw] = await ctx.rpc.call([{ target: FOUR_MEME.helper, data: encodeCall(helperAbi, 'getPancakePair', [token]) }]);
    const pair = decodeCall<string>(helperAbi, 'getPancakePair', raw)?.toLowerCase();
    if (!pair || /^0x0+$/.test(pair)) return false;
    return this.v2.detectPool(token, pair, 'fourmeme', erc20, at, ctx);
  }
}

function curveOf(token: string, info: Info): FourCurve {
  return { token, maxOffers: info.maxOffers, maxFunds: info.maxFunds, feeRate: info.feeRate || 0.01 };
}
