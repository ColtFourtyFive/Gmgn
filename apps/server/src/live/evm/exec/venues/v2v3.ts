// Direct v3 / v2 pool fallbacks when the aggregator has no route:
//  - Uniswap v3 and v2 through the Universal Router (Base, Ethereum, Robinhood
//    Chain): WETH pools found through the factories, v3 quoted with QuoterV2,
//    v2 with the pair reserves; platform fee inside the transaction (TRANSFER
//    on buys, PAY_PORTION + SWEEP on sells), Permit2 for sells.
//  - PancakeSwap v2 on BNB Chain through its Router02 with the
//    fee-on-transfer variants (four.meme / Flap graduates are often tax
//    tokens); quoted by simulation (exact with taxes), reserves as fallback;
//    platform fee as a separate transfer.

import { encodeFunctionData, isAddressEqual, zeroAddress, type Address } from 'viem';
import { pancakeV2RouterAbi, quoterV2Abi, v2FactoryAbi, v2PairAbi, v3FactoryAbi, v3PoolAbi } from '../abis';
import type { UniswapDeployment } from '../contracts';
import { EvmExecError } from '../errors';
import { feeOnInput, grossForNet, priceImpactBps } from '../math';
import { encodeApprove, nativeInto, netTransfer, simulateCalls, staticCall, type SimCall } from '../rpc';
import { ADDRESS_THIS, MSG_SENDER, NATIVE, RouterPlan, v3Path } from '../ur';
import type { EvmPlanStep } from '../types';
import { approvalStep, feeActive, feeStep, orderSteps, referenceAmount, sellFee, separateFeeMode, SIM_EXTRA_BALANCE, splitBuyFee, swapStep } from './common';
import { permit2Steps } from './permit2';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

const V3_FEES = [3000, 10000, 500, 100];
const GAS = { v3: 180_000n, v2: 150_000n, pancake: 200_000n };

/** Constant-product output with an LP fee in bps. */
export function v2AmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inWithFee = amountIn * BigInt(10_000 - feeBps);
  return (inWithFee * reserveOut) / (reserveIn * 10_000n + inWithFee);
}

function uniswap(env: VenueEnv): UniswapDeployment | null {
  return env.contracts.uniswap;
}

/** Atomic UR fee handling shared by the v3 and v2 venues. */
function urQuote(env: VenueEnv, input: QuoteInput, venueIn: bigint, out: bigint, ref: bigint | null, label: string, venue: 'uniswap-v3' | 'uniswap-v2', lpFeeBps: number, gas: bigint, venueData: VenueQuote['venueData']): VenueQuote {
  const impact = ref ? priceImpactBps(venueIn, out, referenceAmount(venueIn), ref) : 0;
  if (input.side === 'buy') {
    const fee = input.amountIn - venueIn;
    return { venue, route: 'pool', routeLabel: label, venueAmountIn: venueIn, grossOut: out, expectedOut: out, nativeLeg: venueIn, platformFee: fee, feeMode: fee > 0n ? 'atomic' : 'none', venueFeeBps: lpFeeBps, tokenTaxBps: 0, swapGas: gas, priceImpactBps: impact, venueData };
  }
  const fee = sellFee(env, out);
  if (out <= fee) throw new EvmExecError('proceeds_below_fees', 'sell proceeds do not cover the platform fee');
  return { venue, route: 'pool', routeLabel: label, venueAmountIn: venueIn, grossOut: out, expectedOut: out - fee, nativeLeg: out, platformFee: fee, feeMode: fee > 0n ? 'atomic' : 'none', venueFeeBps: lpFeeBps, tokenTaxBps: 0, swapGas: gas, priceImpactBps: impact, venueData };
}

/** UR program for a WETH-paired v2/v3 swap with the platform fee inside. */
async function urBuild(env: VenueEnv, b: BuildInput, uni: UniswapDeployment, swap: (plan: RouterPlan, buy: boolean, amountIn: bigint, minOut: bigint) => void): Promise<BuildOutput> {
  const q = b.quote;
  const plan = new RouterPlan(uni.universalRouterVersion);
  const steps: EvmPlanStep[] = [];
  if (q.side === 'buy') {
    if (q.fees.platformFee > 0n && env.feeWallet) plan.transfer(NATIVE, env.feeWallet, q.fees.platformFee);
    plan.wrapEth(ADDRESS_THIS, q.venueAmountIn);
    swap(plan, true, q.venueAmountIn, q.minOut);
    steps.push(swapStep(uni.universalRouter, plan.encodeExecute(BigInt(b.deadline)), q.amountIn, `${q.venue} buy with ${q.venueAmountIn} wei`));
  } else {
    const minGross = q.fees.platformFeeMode === 'atomic' ? grossForNet(q.minOut, env.feeBps) : q.minOut;
    swap(plan, false, q.amountIn, minGross);
    plan.unwrapWeth(ADDRESS_THIS, minGross);
    if (q.fees.platformFeeMode === 'atomic' && env.feeWallet) plan.payPortion(NATIVE, env.feeWallet, BigInt(env.feeBps));
    plan.sweep(NATIVE, MSG_SENDER, q.minOut);
    steps.push(...(await permit2Steps(env, q.token, b.wallet, uni.universalRouter, q.amountIn)));
    steps.push(swapStep(uni.universalRouter, plan.encodeExecute(BigInt(b.deadline)), 0n, `${q.venue} sell of ${q.amountIn} tokens`));
  }
  return { steps: orderSteps(steps), verifiedTargets: [] };
}

export class UniswapV3Venue implements Venue {
  readonly id = 'uniswap-v3' as const;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const uni = uniswap(env);
    if (!uni?.v3Factory || !uni.v3QuoterV2) return null;
    const weth = env.info.wrappedNative;
    const pools = await Promise.all(
      V3_FEES.map(async (fee) => {
        const pool = await env.client.readContract({ address: uni.v3Factory!, abi: v3FactoryAbi, functionName: 'getPool', args: [token, weth, fee] }).catch(() => zeroAddress);
        if (isAddressEqual(pool, zeroAddress)) return null;
        const liq = await env.client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'liquidity' }).catch(() => 0n);
        return liq > 0n ? { fee, pool } : null;
      }),
    );
    const found = pools.filter((p): p is { fee: number; pool: Address } => p !== null);
    return found.length > 0 ? { status: 'pool', data: found } : null;
  }

  private async quoteOne(env: VenueEnv, uni: UniswapDeployment, tokenIn: Address, tokenOut: Address, fee: number, amountIn: bigint): Promise<{ out: bigint; gas: bigint } | null> {
    try {
      const r = await staticCall(env.client, uni.v3QuoterV2!, quoterV2Abi, 'quoteExactInputSingle', [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }]);
      return { out: r[0], gas: r[3] };
    } catch {
      return null;
    }
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const uni = uniswap(env);
    if (!uni) throw new EvmExecError('no_route', 'no Uniswap deployment');
    const pools = detection.data as { fee: number; pool: Address }[];
    const weth = env.info.wrappedNative;
    const token = input.token.address;
    const buy = input.side === 'buy';
    const venueIn = buy && feeActive(env) ? input.amountIn - feeOnInput(input.amountIn, env.feeBps) : input.amountIn;
    const [tIn, tOut] = buy ? [weth, token] : [token, weth];
    const quotes = await Promise.all(pools.map((p) => this.quoteOne(env, uni, tIn, tOut, p.fee, venueIn)));
    let best = -1;
    for (let i = 0; i < quotes.length; i++) if (quotes[i] && (best < 0 || quotes[i]!.out > quotes[best]!.out)) best = i;
    if (best < 0) throw new EvmExecError('quote_failed', 'no v3 pool quotes this trade');
    const { fee, pool } = pools[best];
    const ref = await this.quoteOne(env, uni, tIn, tOut, fee, referenceAmount(venueIn));
    return urQuote(env, input, venueIn, quotes[best]!.out, ref?.out ?? null, `uniswap v3 ${fee / 10_000}%`, 'uniswap-v3', fee / 100, quotes[best]!.gas + 90_000n, { venue: 'uniswap-v3', fee, pool });
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const uni = uniswap(env);
    const vd = b.quote.venueData;
    if (!uni || vd.venue !== 'uniswap-v3') throw new EvmExecError('invalid_intent', 'not a v3 quote');
    const weth = env.info.wrappedNative;
    return urBuild(env, b, uni, (plan, buy, amountIn, minOut) => {
      if (buy) plan.v3SwapExactIn(MSG_SENDER, amountIn, minOut, v3Path(weth, vd.fee, b.quote.token), false);
      else plan.v3SwapExactIn(ADDRESS_THIS, amountIn, minOut, v3Path(b.quote.token, vd.fee, weth), true);
    });
  }
}

interface PairInfo {
  pair: Address;
  reserveToken: bigint;
  reserveWeth: bigint;
}

async function findPair(env: VenueEnv, factory: Address, token: Address): Promise<PairInfo | null> {
  const weth = env.info.wrappedNative;
  const pair = await env.client.readContract({ address: factory, abi: v2FactoryAbi, functionName: 'getPair', args: [token, weth] }).catch(() => zeroAddress);
  if (isAddressEqual(pair, zeroAddress)) return null;
  const [reserves, token0] = await Promise.all([
    env.client.readContract({ address: pair, abi: v2PairAbi, functionName: 'getReserves' }),
    env.client.readContract({ address: pair, abi: v2PairAbi, functionName: 'token0' }),
  ]);
  const tokenIs0 = isAddressEqual(token0, token);
  const info = { pair, reserveToken: tokenIs0 ? reserves[0] : reserves[1], reserveWeth: tokenIs0 ? reserves[1] : reserves[0] };
  return info.reserveToken > 0n && info.reserveWeth > 0n ? info : null;
}

export class UniswapV2Venue implements Venue {
  readonly id = 'uniswap-v2' as const;
  /** Uniswap v2's LP fee. */
  static readonly LP_FEE_BPS = 30;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const uni = uniswap(env);
    if (!uni?.v2Factory) return null;
    const pair = await findPair(env, uni.v2Factory, token).catch(() => null);
    return pair ? { status: 'pool', data: pair } : null;
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const p = detection.data as PairInfo;
    const buy = input.side === 'buy';
    const venueIn = buy && feeActive(env) ? input.amountIn - feeOnInput(input.amountIn, env.feeBps) : input.amountIn;
    const [rIn, rOut] = buy ? [p.reserveWeth, p.reserveToken] : [p.reserveToken, p.reserveWeth];
    const out = v2AmountOut(venueIn, rIn, rOut, UniswapV2Venue.LP_FEE_BPS);
    if (out <= 0n) throw new EvmExecError('quote_failed', 'v2 pair returns nothing');
    const ref = v2AmountOut(referenceAmount(venueIn), rIn, rOut, UniswapV2Venue.LP_FEE_BPS);
    return urQuote(env, input, venueIn, out, ref, 'uniswap v2', 'uniswap-v2', UniswapV2Venue.LP_FEE_BPS, GAS.v2, { venue: 'uniswap-v2', pair: p.pair });
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const uni = uniswap(env);
    if (!uni || b.quote.venueData.venue !== 'uniswap-v2') throw new EvmExecError('invalid_intent', 'not a v2 quote');
    const weth = env.info.wrappedNative;
    return urBuild(env, b, uni, (plan, buy, amountIn, minOut) => {
      if (buy) plan.v2SwapExactIn(MSG_SENDER, amountIn, minOut, [weth, b.quote.token], false);
      else plan.v2SwapExactIn(ADDRESS_THIS, amountIn, minOut, [b.quote.token, weth], true);
    });
  }
}

export class PancakeV2Venue implements Venue {
  readonly id = 'pancake-v2' as const;
  /** PancakeSwap v2's LP fee. */
  static readonly LP_FEE_BPS = 25;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const pcs = env.contracts.pancakeV2;
    if (!pcs) return null;
    const pair = await findPair(env, pcs.factory, token).catch(() => null);
    return pair ? { status: 'pool', data: pair } : null;
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const pcs = env.contracts.pancakeV2!;
    const p = detection.data as PairInfo;
    const token = input.token.address;
    const weth = env.info.wrappedNative;
    const deadline = BigInt(Math.floor(env.nowMs() / 1000) + 600);
    const buy = input.side === 'buy';
    if (!buy && !input.walletIsReal) throw new EvmExecError('invalid_intent', 'sell quotes need the wallet');
    const { fee: buyFee, venueIn } = buy ? splitBuyFee(env, input.amountIn) : { fee: 0n, venueIn: input.amountIn };
    const [rIn, rOut] = buy ? [p.reserveWeth, p.reserveToken] : [p.reserveToken, p.reserveWeth];
    const formula = v2AmountOut(venueIn, rIn, rOut, PancakeV2Venue.LP_FEE_BPS);
    const calls: SimCall[] = buy
      ? [{ from: input.wallet, to: pcs.router, value: venueIn, data: encodeFunctionData({ abi: pancakeV2RouterAbi, functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens', args: [0n, [weth, token], input.wallet, deadline] }) }]
      : [
          { from: input.wallet, to: token, data: encodeApprove(pcs.router, venueIn) },
          { from: input.wallet, to: pcs.router, data: encodeFunctionData({ abi: pancakeV2RouterAbi, functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens', args: [venueIn, 0n, [token, weth], input.wallet, deadline] }) },
        ];
    const sim = await simulateCalls(env.client, calls, buy ? { [input.wallet]: { balance: venueIn + SIM_EXTRA_BALANCE } } : {}).catch(() => null);
    const last = sim?.[sim.length - 1];
    if (last && !last.ok) throw new EvmExecError('quote_failed', `pancake v2 swap reverts: ${last.error}`);
    const out = last ? (buy ? netTransfer(last.logs, token, input.wallet) : nativeInto(last.logs, input.wallet)) : formula;
    if (out <= 0n) throw new EvmExecError('quote_failed', 'pancake v2 pair returns nothing');
    const taxBps = last && formula > out ? Number(((formula - out) * 10_000n) / formula) : 0;
    const impact = priceImpactBps(venueIn, formula, referenceAmount(venueIn), v2AmountOut(referenceAmount(venueIn), rIn, rOut, PancakeV2Venue.LP_FEE_BPS));
    const fee = buy ? buyFee : sellFee(env, out);
    if (!buy && out <= fee) throw new EvmExecError('proceeds_below_fees', 'sell proceeds do not cover the platform fee');
    return {
      venue: this.id,
      route: 'pool',
      routeLabel: 'pancakeswap v2',
      venueAmountIn: venueIn,
      grossOut: out,
      expectedOut: buy ? out : out - fee,
      nativeLeg: buy ? venueIn : out,
      platformFee: fee,
      feeMode: separateFeeMode(env, input, fee),
      venueFeeBps: PancakeV2Venue.LP_FEE_BPS,
      tokenTaxBps: taxBps,
      swapGas: last ? last.gasUsed : GAS.pancake,
      priceImpactBps: impact,
      venueData: { venue: 'pancake-v2', pair: p.pair },
    };
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const pcs = env.contracts.pancakeV2;
    const q = b.quote;
    if (!pcs || q.venueData.venue !== 'pancake-v2') throw new EvmExecError('invalid_intent', 'not a pancake v2 quote');
    const weth = env.info.wrappedNative;
    const steps: EvmPlanStep[] = [];
    const fee = feeStep(env, q.fees.platformFee, q.fees.platformFeeMode);
    if (fee) steps.push(fee);
    const deadline = BigInt(b.deadline);
    if (q.side === 'buy') {
      const data = encodeFunctionData({ abi: pancakeV2RouterAbi, functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens', args: [q.minOut, [weth, q.token], b.wallet, deadline] });
      steps.push(swapStep(pcs.router, data, q.venueAmountIn, `pancakeswap v2 buy with ${q.venueAmountIn} wei`));
    } else {
      const approve = await approvalStep(env, q.token, b.wallet, pcs.router, q.amountIn, 'PancakeSwap v2 router');
      if (approve) steps.push(approve);
      const minGross = q.minOut + (q.fees.platformFeeMode === 'none' ? 0n : q.fees.platformFee);
      const data = encodeFunctionData({ abi: pancakeV2RouterAbi, functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens', args: [q.amountIn, minGross, [q.token, weth], b.wallet, deadline] });
      steps.push(swapStep(pcs.router, data, 0n, `pancakeswap v2 sell of ${q.amountIn} tokens`));
    }
    return { steps: orderSteps(steps), verifiedTargets: [] };
  }
}
