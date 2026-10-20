// KyberSwap aggregator client (https://aggregator-api.kyberswap.com, keyless
// with an x-client-id header): GET /{chain}/api/v1/routes then POST
// /{chain}/api/v1/route/build. The platform fee rides in the route
// (feeAmount in bps, isInBps=true, chargeFeeBy currency_in for buys and
// currency_out for sells, feeReceiver = fee wallet), so it is collected inside
// the swap transaction. Measured semantics: with currency_in the quoted
// amountIn includes the fee (the route swaps amountIn - fee); with
// currency_out the quoted amountOut is net of the fee.
//
// Every build is validated before it is used: the router must be the
// allow-listed MetaAggregationRouterV2, the calldata is decoded and its swap
// description must match the request (tokens, amount, receiver = the wallet,
// fee receiver and bps, no partial fill), minReturnAmount must not undercut our
// minOut, and the transaction value must equal the native input.

import { decodeFunctionData, isAddressEqual, type Address, type Hex } from 'viem';
import { KYBER_NATIVE, kyberRouterAbi } from './abis';
import { EvmExecError } from './errors';

export interface KyberFeeParams {
  bps: number;
  chargeBy: 'currency_in' | 'currency_out';
  receiver: Address;
}

export interface KyberRoute {
  /** The routeSummary object exactly as returned (posted back to /route/build). */
  routeSummary: Record<string, unknown>;
  routerAddress: Address;
  amountIn: bigint;
  amountOut: bigint;
  gas: bigint;
  amountInUsd: number;
  amountOutUsd: number;
  /** Exchanges along the route, e.g. "uniswap-v4-clanker" or "pons-v2". */
  exchanges: string[];
}

export interface KyberBuild {
  amountIn: bigint;
  amountOut: bigint;
  gas: bigint;
  data: Hex;
  routerAddress: Address;
  value: bigint;
}

export interface KyberClientOptions {
  baseUrl: string;
  clientId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Grace on minReturnAmount vs our minOut (the build re-quotes; a few wei lower must not fail the trade). */
export const KYBER_MIN_RETURN_GRACE_BPS = 5;

/** Slippage to request from /route/build so its minReturnAmount lands on our minOut, given the fresh route output. */
export function kyberSlippageFor(freshOut: bigint, minOut: bigint): number {
  if (freshOut <= 0n || freshOut <= minOut) return 0;
  return Number(((freshOut - minOut) * 10_000n) / freshOut);
}

/** MetaAggregationRouterV2 swap flags (bit values from the router; 0x40/0x80 observed on fee'd builds). */
export const KYBER_FLAGS = { partialFill: 0x01n, feeOnDst: 0x40n, feeInBps: 0x80n } as const;

export class KyberClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: KyberClientOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 6_000;
  }

  /** One retry on transient failures (unreachable, 5xx, upstream resets). */
  private async request(path: string, init?: { method: 'POST'; body: unknown }): Promise<Record<string, unknown>> {
    try {
      return await this.requestOnce(path, init);
    } catch (err) {
      const status = err instanceof EvmExecError ? Number(err.detail.status ?? 0) : 0;
      const transient = err instanceof EvmExecError && (err.code === 'rpc_error' || status >= 500 || /upstream|reset|timeout|temporarily/i.test(err.message));
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 300));
      return this.requestOnce(path, init);
    }
  }

  private async requestOnce(path: string, init?: { method: 'POST'; body: unknown }): Promise<Record<string, unknown>> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: init?.method ?? 'GET',
        headers: { 'x-client-id': this.opts.clientId, ...(init ? { 'content-type': 'application/json' } : {}) },
        body: init ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new EvmExecError('rpc_error', `kyberswap unreachable: ${(err as Error).message}`);
    }
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: Record<string, unknown> } | null;
    if (!json || json.code !== 0 || !json.data) {
      const msg = json?.message ?? `HTTP ${res.status}`;
      // 4008 = route not found, 4011 = token not found
      const code = json?.code === 4008 || json?.code === 4011 || /route not found|token not found/i.test(msg) ? 'no_route' : 'quote_failed';
      throw new EvmExecError(code, `kyberswap: ${msg}`, { status: res.status, kyberCode: json?.code });
    }
    return json.data;
  }

  async route(chainSlug: string, p: { tokenIn: Address; tokenOut: Address; amountIn: bigint; fee: KyberFeeParams | null; origin?: Address }): Promise<KyberRoute> {
    const q = new URLSearchParams({ tokenIn: p.tokenIn, tokenOut: p.tokenOut, amountIn: p.amountIn.toString() });
    if (p.fee && p.fee.bps > 0) {
      q.set('feeAmount', String(p.fee.bps));
      q.set('chargeFeeBy', p.fee.chargeBy);
      q.set('isInBps', 'true');
      q.set('feeReceiver', p.fee.receiver);
    }
    if (p.origin) q.set('origin', p.origin);
    const data = await this.request(`/${chainSlug}/api/v1/routes?${q.toString()}`);
    const s = data.routeSummary as Record<string, unknown> | undefined;
    if (!s) throw new EvmExecError('quote_failed', 'kyberswap returned no routeSummary');
    const route = (s.route as { exchange?: string }[][] | undefined) ?? [];
    return {
      routeSummary: s,
      routerAddress: (data.routerAddress ?? s.routerAddress) as Address,
      amountIn: BigInt(String(s.amountIn)),
      amountOut: BigInt(String(s.amountOut)),
      gas: BigInt(String(s.gas ?? '0')),
      amountInUsd: Number(s.amountInUsd ?? 0),
      amountOutUsd: Number(s.amountOutUsd ?? 0),
      exchanges: [...new Set(route.flat().map((h) => String(h.exchange ?? '?')))],
    };
  }

  async build(chainSlug: string, p: { routeSummary: Record<string, unknown>; sender: Address; recipient: Address; slippageBps: number; deadline: number; source: string }): Promise<KyberBuild> {
    const data = await this.request(`/${chainSlug}/api/v1/route/build`, {
      method: 'POST',
      body: {
        routeSummary: p.routeSummary,
        sender: p.sender,
        recipient: p.recipient,
        origin: p.sender,
        slippageTolerance: p.slippageBps,
        // the API caps slippage at 20% unless told otherwise; memecoins with taxes need more
        ...(p.slippageBps > 2000 ? { ignoreCappedSlippage: true } : {}),
        deadline: p.deadline,
        source: p.source,
        enableGasEstimation: false,
      },
    });
    return {
      amountIn: BigInt(String(data.amountIn)),
      amountOut: BigInt(String(data.amountOut)),
      gas: BigInt(String(data.gas ?? '0')),
      data: data.data as Hex,
      routerAddress: data.routerAddress as Address,
      value: BigInt(String(data.transactionValue ?? '0')),
    };
  }
}

export interface KyberBuildExpectation {
  allowedRouters: Address[];
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  wallet: Address;
  /** The quote's minimum output (net of the platform fee): the build's expected output must not fall below it. */
  minOut: bigint;
  /**
   * Lowest acceptable on-chain minReturnAmount: the quote's minOut less a small
   * grace for the build re-quoting a few wei lower (KYBER_MIN_RETURN_GRACE_BPS).
   */
  minReturnFloor: bigint;
  fee: KyberFeeParams | null;
}

export interface ValidatedKyberBuild {
  minReturnAmount: bigint;
  selector: 'swap' | 'swapSimpleMode';
}

type SwapDesc = {
  srcToken: Address;
  dstToken: Address;
  feeReceivers: readonly Address[];
  feeAmounts: readonly bigint[];
  dstReceiver: Address;
  amount: bigint;
  minReturnAmount: bigint;
  flags: bigint;
};

function invalid(message: string, detail: Record<string, unknown> = {}): never {
  throw new EvmExecError('invalid_build', `kyberswap build rejected: ${message}`, detail);
}

const sameToken = (a: Address, b: Address) => isAddressEqual(a, b);

export function validateKyberBuild(build: KyberBuild, e: KyberBuildExpectation): ValidatedKyberBuild {
  if (!e.allowedRouters.some((r) => isAddressEqual(r, build.routerAddress))) invalid(`router ${build.routerAddress} is not allow-listed`, { router: build.routerAddress });
  let decoded: ReturnType<typeof decodeFunctionData<typeof kyberRouterAbi>>;
  try {
    decoded = decodeFunctionData({ abi: kyberRouterAbi, data: build.data });
  } catch {
    invalid('calldata is not a MetaAggregationRouterV2 swap');
  }
  let desc: SwapDesc;
  if (decoded.functionName === 'swap') desc = decoded.args[0].desc as SwapDesc;
  else if (decoded.functionName === 'swapSimpleMode') desc = decoded.args[1] as SwapDesc;
  else invalid('unexpected router function');
  if (!sameToken(desc.srcToken, e.tokenIn)) invalid('source token mismatch', { srcToken: desc.srcToken });
  if (!sameToken(desc.dstToken, e.tokenOut)) invalid('destination token mismatch', { dstToken: desc.dstToken });
  if (!isAddressEqual(desc.dstReceiver, e.wallet)) invalid('output does not go to the wallet', { dstReceiver: desc.dstReceiver });
  if (desc.amount !== e.amountIn) invalid('input amount mismatch', { amount: desc.amount, expected: e.amountIn });
  if ((desc.flags & KYBER_FLAGS.partialFill) !== 0n) invalid('partial fills are not allowed');
  if (desc.minReturnAmount < e.minReturnFloor) invalid('minReturnAmount below our minimum', { minReturnAmount: desc.minReturnAmount, floor: e.minReturnFloor, minOut: e.minOut });
  if (build.amountOut < e.minOut) invalid('build output below our minOut', { amountOut: build.amountOut, minOut: e.minOut });
  const nativeIn = sameToken(e.tokenIn, KYBER_NATIVE);
  if (build.value !== (nativeIn ? e.amountIn : 0n)) invalid('transaction value does not match the native input', { value: build.value });
  if (e.fee && e.fee.bps > 0) {
    if (desc.feeReceivers.length !== 1 || !isAddressEqual(desc.feeReceivers[0], e.fee.receiver)) invalid('fee receiver mismatch', { feeReceivers: desc.feeReceivers });
    if (desc.feeAmounts.length !== 1 || desc.feeAmounts[0] !== BigInt(e.fee.bps)) invalid('fee amount mismatch', { feeAmounts: desc.feeAmounts });
    if ((desc.flags & KYBER_FLAGS.feeInBps) === 0n) invalid('fee is not in bps');
    const onDst = (desc.flags & KYBER_FLAGS.feeOnDst) !== 0n;
    if (onDst !== (e.fee.chargeBy === 'currency_out')) invalid('fee charged on the wrong side');
  } else if (desc.feeReceivers.length > 0) {
    invalid('unexpected fee receivers', { feeReceivers: desc.feeReceivers });
  }
  return { minReturnAmount: desc.minReturnAmount, selector: decoded.functionName };
}
