// Uniswap v4 pools traded directly through the Universal Router with Permit2
// (Clanker v4 and Zora coins on Base, graduated Pons launches and Pools.trade
// on Robinhood Chain, any hooked or hookless pool given as a hint).
//
// Pool discovery for a token, cheapest first:
//   1. the caller's pool hint (from the market feed);
//   2. Pons graduates: (ETH, token, fee 0, tickSpacing 200, Pons meme hook);
//   3. Clanker v4: the factory's tokenDeploymentInfo(token).hook with the
//      paired WETH, dynamic fee, tickSpacing 200/60/10;
//   4. coins exposing getPoolKey() (Zora): the coin's pool, then recursively
//      the paired coin's pool until ETH/WETH (a content coin -> creator coin ->
//      ZORA -> ETH path is 3 hops);
//   5. hookless pools against ETH and WETH on the standard fee tiers
//      (Pools.trade launches are hookless ETH pools at 0.25% / tickSpacing 25).
// Candidates must exist (initialized in StateView); every candidate path is
// quoted through the V4Quoter (which runs the hooks, so dynamic fees and hook
// taxes are priced in) and the best output wins.
//
// The platform fee rides in the same transaction: buys TRANSFER it from the
// router's ETH before the swap; sells take the output to the router, unwrap
// if needed, PAY_PORTION the fee bps of it and SWEEP the rest (>= minOut) to
// the wallet.

import { encodeFunctionData, isAddressEqual, zeroAddress, type Address, type PublicClient } from 'viem';
import { clankerFactoryAbi, permit2Abi, ponsFactoryAbi, ponsCurveAbi, v4CoinAbi, v4QuoterAbi, v4StateViewAbi } from '../abis';
import type { UniswapDeployment } from '../contracts';
import { EvmExecError } from '../errors';
import { feeOnInput, grossForNet, priceImpactBps } from '../math';
import { encodeApprove, nativeInto, simulateCalls, staticCall, type SimCall } from '../rpc';
import { ADDRESS_THIS, MSG_SENDER, NATIVE, OPEN_DELTA, RouterPlan, V4ActionPlan, poolIdOf, poolKeyFor } from '../ur';
import type { EvmPlanStep, V4Hop, V4PoolKey } from '../types';
import { feeActive, orderSteps, referenceAmount, sellFee, swapStep } from './common';
import { permit2Steps } from './permit2';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

const DYNAMIC_FEE = 0x800000;
/** Hookless tiers probed against ETH and WETH: (fee pips, tickSpacing). */
const HOOKLESS_TIERS: [number, number][] = [
  [3000, 60],
  [10000, 200],
  [2500, 25],
  [500, 10],
  [100, 1],
];
const MAX_PATH_HOPS = 3;
/** Universal Router overhead on top of the quoter's swap gas (commands, transfers, settlement). */
const UR_OVERHEAD_GAS = 90_000n;

/** A path from native ETH (or WETH) to the token, as hops in buy direction. */
export interface V4Path {
  hops: V4Hop[];
  source: string;
}

function isNativeOrWeth(env: VenueEnv, c: Address): boolean {
  return isAddressEqual(c, zeroAddress) || isAddressEqual(c, env.info.wrappedNative);
}

function hopFor(key: V4PoolKey, currencyIn: Address): V4Hop {
  const currencyOut = isAddressEqual(key.currency0, currencyIn) ? key.currency1 : key.currency0;
  return { key, currencyIn, currencyOut };
}

/**
 * Whether a pool exists (initialized price). Active liquidity may be 0 for a
 * live pool: single-sided launch liquidity (Pools.trade) starts just past the
 * current tick, so the quoter, not the liquidity, decides.
 */
async function poolExists(client: PublicClient, uni: UniswapDeployment, key: V4PoolKey): Promise<boolean> {
  if (!uni.v4StateView) return false;
  try {
    const slot0 = await client.readContract({ address: uni.v4StateView, abi: v4StateViewAbi, functionName: 'getSlot0', args: [poolIdOf(key)] });
    return slot0[0] !== 0n;
  } catch {
    return false;
  }
}

/** Reverse a buy-direction path into the sell direction. */
export function reversePath(hops: V4Hop[]): V4Hop[] {
  return [...hops].reverse().map((h) => ({ key: h.key, currencyIn: h.currencyOut, currencyOut: h.currencyIn }));
}

export class UniswapV4Venue implements Venue {
  readonly id = 'uniswap-v4' as const;

  private deployment(env: VenueEnv): UniswapDeployment | null {
    const uni = env.contracts.uniswap;
    return uni && uni.v4Quoter && uni.v4StateView && env.info.uniswapV4PoolManager ? uni : null;
  }

  /** Candidate single-hop keys pairing `token` with ETH/WETH or another currency. */
  private async candidateKeys(env: VenueEnv, uni: UniswapDeployment, token: Address, hint?: V4PoolKey): Promise<{ key: V4PoolKey; source: string }[]> {
    const out: { key: V4PoolKey; source: string }[] = [];
    if (hint && (isAddressEqual(hint.currency0, token) || isAddressEqual(hint.currency1, token))) out.push({ key: hint, source: 'hint' });
    const pons = env.contracts.pons;
    if (pons) {
      try {
        const rec = await env.client.readContract({ address: pons.factory, abi: ponsFactoryAbi, functionName: 'getLaunchedToken', args: [token] });
        if (isAddressEqual(rec[0], token) && !isAddressEqual(rec[1], zeroAddress)) {
          const graduated = await env.client.readContract({ address: rec[1], abi: ponsCurveAbi, functionName: 'graduated' });
          if (graduated) out.push({ key: poolKeyFor(rec[4], token, 0, 200, pons.memeHook), source: 'pons graduate' });
        }
      } catch {
        // not a pons token
      }
    }
    if (env.contracts.clankerFactory) {
      try {
        const info = await env.client.readContract({ address: env.contracts.clankerFactory, abi: clankerFactoryAbi, functionName: 'tokenDeploymentInfo', args: [token] });
        if (!isAddressEqual(info.hook, zeroAddress)) {
          for (const ts of [200, 60, 10]) out.push({ key: poolKeyFor(env.info.wrappedNative, token, DYNAMIC_FEE, ts, info.hook), source: 'clanker' });
        }
      } catch {
        // not a clanker token
      }
    }
    try {
      const k = await env.client.readContract({ address: token, abi: v4CoinAbi, functionName: 'getPoolKey' });
      if (isAddressEqual(k.currency0, token) || isAddressEqual(k.currency1, token)) out.push({ key: { currency0: k.currency0, currency1: k.currency1, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks }, source: 'coin pool' });
    } catch {
      // no getPoolKey()
    }
    for (const quote of [zeroAddress, env.info.wrappedNative] as Address[]) {
      for (const [fee, ts] of HOOKLESS_TIERS) out.push({ key: poolKeyFor(quote, token, fee, ts, zeroAddress), source: 'hookless' });
    }
    return out;
  }

  /** Paths from ETH/WETH to `token` (buy direction) through initialized pools. */
  async discoverPaths(env: VenueEnv, token: Address, hint?: V4PoolKey, depth = 1): Promise<V4Path[]> {
    const uni = this.deployment(env);
    if (!uni) return [];
    const candidates = await this.candidateKeys(env, uni, token, hint);
    const exists = await Promise.all(candidates.map((c) => poolExists(env.client, uni, c.key)));
    const paths: V4Path[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < candidates.length; i++) {
      if (!exists[i]) continue;
      const { key, source } = candidates[i];
      const id = poolIdOf(key);
      if (seen.has(id)) continue;
      seen.add(id);
      const other = isAddressEqual(key.currency0, token) ? key.currency1 : key.currency0;
      if (isNativeOrWeth(env, other)) {
        paths.push({ hops: [hopFor(key, other)], source });
      } else if (depth < MAX_PATH_HOPS) {
        // a coin paired with another coin: find that coin's way to ETH and extend it
        for (const sub of await this.discoverPaths(env, other, undefined, depth + 1)) {
          paths.push({ hops: [...sub.hops, hopFor(key, other)], source: `${source} via ${sub.source}` });
        }
      }
    }
    return paths;
  }

  async detect(env: VenueEnv, token: Address, hint?: V4PoolKey): Promise<Detection | null> {
    const paths = await this.discoverPaths(env, token, hint);
    return paths.length > 0 ? { status: 'pool', data: paths } : null;
  }

  private async quotePath(env: VenueEnv, uni: UniswapDeployment, hops: V4Hop[], amount: bigint): Promise<{ out: bigint; gas: bigint } | null> {
    try {
      if (hops.length === 1) {
        const h = hops[0];
        const r = await staticCall(env.client, uni.v4Quoter!, v4QuoterAbi, 'quoteExactInputSingle', [
          { poolKey: h.key, zeroForOne: isAddressEqual(h.currencyIn, h.key.currency0), exactAmount: amount, hookData: '0x' },
        ]);
        return { out: r[0], gas: r[1] };
      }
      const path = hops.map((h) => ({ intermediateCurrency: h.currencyOut, fee: h.key.fee, tickSpacing: h.key.tickSpacing, hooks: h.key.hooks, hookData: '0x' as const }));
      const r = await staticCall(env.client, uni.v4Quoter!, v4QuoterAbi, 'quoteExactInput', [{ exactCurrency: hops[0].currencyIn, path, exactAmount: amount }]);
      return { out: r[0], gas: r[1] };
    } catch {
      return null;
    }
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const uni = this.deployment(env);
    if (!uni) throw new EvmExecError('no_route', 'no Uniswap v4 deployment on this chain');
    const paths = detection.data as V4Path[];
    const buy = input.side === 'buy';
    const fee = buy && feeActive(env) ? feeOnInput(input.amountIn, env.feeBps) : 0n;
    const venueIn = buy ? input.amountIn - fee : input.amountIn;
    const directed = paths.map((p) => ({ ...p, hops: buy ? p.hops : reversePath(p.hops) }));
    const quotes = await Promise.all(directed.map((p) => this.quotePath(env, uni, p.hops, venueIn)));
    let best = -1;
    for (let i = 0; i < quotes.length; i++) if (quotes[i] && (best < 0 || quotes[i]!.out > quotes[best]!.out)) best = i;
    if (best < 0 && !buy && input.walletIsReal) {
      // the quoter cannot run this path's hooks on a sell: simulate the router call itself
      for (let i = 0; i < Math.min(directed.length, 3) && best < 0; i++) {
        const sim = await this.simulateSell(env, uni, input, directed[i].hops);
        if (sim) {
          quotes[i] = sim;
          best = i;
        }
      }
    }
    if (best < 0 || quotes[best]!.out <= 0n) throw new EvmExecError('quote_failed', 'no v4 pool quotes this trade');
    const path = directed[best];
    const q = quotes[best]!;
    const ref = await this.quotePath(env, uni, path.hops, referenceAmount(venueIn));
    const impact = ref ? priceImpactBps(venueIn, q.out, referenceAmount(venueIn), ref.out) : 0;
    const lpFeeBps = path.hops.reduce((s, h) => s + (h.key.fee & DYNAMIC_FEE ? 0 : h.key.fee / 100), 0);
    const label = `uniswap v4 (${path.source}, ${path.hops.length} hop${path.hops.length > 1 ? 's' : ''})`;
    if (buy) {
      return {
        venue: this.id,
        route: 'pool',
        routeLabel: label,
        venueAmountIn: venueIn,
        grossOut: q.out,
        expectedOut: q.out,
        nativeLeg: venueIn,
        platformFee: fee,
        feeMode: fee > 0n ? 'atomic' : 'none',
        venueFeeBps: Math.round(lpFeeBps),
        tokenTaxBps: 0,
        swapGas: q.gas + UR_OVERHEAD_GAS,
        priceImpactBps: impact,
        venueData: { venue: 'uniswap-v4', hops: path.hops },
      };
    }
    const sFee = sellFee(env, q.out);
    if (q.out <= sFee) throw new EvmExecError('proceeds_below_fees', 'sell proceeds do not cover the platform fee');
    return {
      venue: this.id,
      route: 'pool',
      routeLabel: label,
      venueAmountIn: venueIn,
      grossOut: q.out,
      expectedOut: q.out - sFee,
      nativeLeg: q.out,
      platformFee: sFee,
      feeMode: sFee > 0n ? 'atomic' : 'none',
      venueFeeBps: Math.round(lpFeeBps),
      tokenTaxBps: 0,
      swapGas: q.gas + UR_OVERHEAD_GAS,
      priceImpactBps: impact,
      venueData: { venue: 'uniswap-v4', hops: path.hops },
    };
  }

  /** Universal Router calldata for a buy: fee TRANSFER, optional WRAP, v4 swap, refund SWEEP. */
  buyCalldata(env: VenueEnv, uni: UniswapDeployment, hops: V4Hop[], venueIn: bigint, minOut: bigint, fee: bigint, deadline: bigint) {
    const plan = new RouterPlan(uni.universalRouterVersion);
    const actions = new V4ActionPlan(uni.universalRouterVersion);
    const first = hops[0].currencyIn;
    const last = hops[hops.length - 1].currencyOut;
    if (fee > 0n && env.feeWallet) plan.transfer(NATIVE, env.feeWallet, fee);
    if (!isAddressEqual(first, zeroAddress)) plan.wrapEth(ADDRESS_THIS, venueIn);
    actions.swapExactIn(hops, venueIn, minOut).settle(first, OPEN_DELTA, false).takeAll(last, minOut);
    plan.v4Swap(actions).sweep(NATIVE, MSG_SENDER, 0n);
    return plan.encodeExecute(deadline);
  }

  /** Universal Router calldata for a sell: v4 swap to the router, optional UNWRAP, fee PAY_PORTION, SWEEP >= minNet. */
  sellCalldata(env: VenueEnv, uni: UniswapDeployment, hops: V4Hop[], amountIn: bigint, minGross: bigint, minNet: bigint, chargeFee: boolean, deadline: bigint) {
    const plan = new RouterPlan(uni.universalRouterVersion);
    const actions = new V4ActionPlan(uni.universalRouterVersion);
    const first = hops[0].currencyIn;
    const last = hops[hops.length - 1].currencyOut;
    actions.swapExactIn(hops, amountIn, minGross).settleAll(first, amountIn).take(last, ADDRESS_THIS, OPEN_DELTA);
    plan.v4Swap(actions);
    if (!isAddressEqual(last, zeroAddress)) plan.unwrapWeth(ADDRESS_THIS, 0n);
    if (chargeFee && env.feeWallet) plan.payPortion(NATIVE, env.feeWallet, BigInt(env.feeBps));
    plan.sweep(NATIVE, MSG_SENDER, minNet);
    return plan.encodeExecute(deadline);
  }

  /**
   * Quote a sell by simulating the real router call from the wallet (Permit2
   * approvals included): some hooks (Zora coins) revert inside the V4Quoter on
   * sells but swap fine. Returns gross output and gas, or null.
   */
  private async simulateSell(env: VenueEnv, uni: UniswapDeployment, input: QuoteInput, hops: V4Hop[]): Promise<{ out: bigint; gas: bigint } | null> {
    const deadline = BigInt(Math.floor(env.nowMs() / 1000) + 600);
    const token = input.token.address;
    const calls: SimCall[] = [
      { from: input.wallet, to: token, data: encodeApprove(env.info.permit2, input.amountIn) },
      { from: input.wallet, to: env.info.permit2, data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, uni.universalRouter, input.amountIn, Number(deadline)] }) },
      { from: input.wallet, to: uni.universalRouter, data: this.sellCalldata(env, uni, hops, input.amountIn, 0n, 0n, feeActive(env), deadline) },
    ];
    const sim = await simulateCalls(env.client, calls).catch(() => null);
    const swap = sim?.[2];
    if (!swap?.ok) return null;
    const received = nativeInto(swap.logs, input.wallet);
    const fee = env.feeWallet && feeActive(env) ? nativeInto(swap.logs, env.feeWallet) : 0n;
    return received > 0n ? { out: received + fee, gas: swap.gasUsed } : null;
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const uni = this.deployment(env);
    const q = b.quote;
    if (!uni || q.venueData.venue !== 'uniswap-v4') throw new EvmExecError('invalid_intent', 'not a v4 quote');
    const hops = q.venueData.hops;
    const steps: EvmPlanStep[] = [];
    const deadline = BigInt(b.deadline);
    if (q.side === 'buy') {
      steps.push(swapStep(uni.universalRouter, this.buyCalldata(env, uni, hops, q.venueAmountIn, q.minOut, q.fees.platformFee, deadline), q.amountIn, `uniswap v4 buy with ${q.venueAmountIn} wei`));
    } else {
      const atomic = q.fees.platformFeeMode === 'atomic';
      const minGross = atomic ? grossForNet(q.minOut, env.feeBps) : q.minOut;
      steps.push(...(await permit2Steps(env, q.token, b.wallet, uni.universalRouter, q.amountIn)));
      steps.push(swapStep(uni.universalRouter, this.sellCalldata(env, uni, hops, q.amountIn, minGross, q.minOut, atomic, deadline), 0n, `uniswap v4 sell of ${q.amountIn} tokens`));
    }
    return { steps: orderSteps(steps), verifiedTargets: [] };
  }
}
