// KyberSwap aggregator venue for DEX-listed tokens on Base, BNB Chain,
// Ethereum and Robinhood Chain (where it also routes through Pons v2 and Flap
// curves). The platform fee is part of the route (charged on the native side:
// currency_in for buys, currency_out for sells), so it is atomic. prepare()
// fetches a fresh route, builds it with a slippage that lands its
// minReturnAmount on the quote's minOut, and validates the build (kyber.ts).

import { isAddressEqual, type Address } from 'viem';
import { KYBER_NATIVE } from '../abis';
import { EvmExecError } from '../errors';
import { KYBER_MIN_RETURN_GRACE_BPS, kyberSlippageFor, validateKyberBuild, type KyberFeeParams, type KyberRoute } from '../kyber';
import { feeOnInput, grossForNet, mulBps, priceImpactBps } from '../math';
import type { EvmPlanStep } from '../types';
import { approvalStep, feeActive, orderSteps, referenceAmount, swapStep } from './common';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

export const KYBER_SOURCE = 'trenchscope';

function feeParams(env: VenueEnv, side: 'buy' | 'sell'): KyberFeeParams | null {
  if (!feeActive(env) || !env.feeWallet) return null;
  return { bps: env.feeBps, chargeBy: side === 'buy' ? 'currency_in' : 'currency_out', receiver: env.feeWallet };
}

export class KyberSwapVenue implements Venue {
  readonly id = 'kyberswap' as const;

  async detect(env: VenueEnv): Promise<Detection | null> {
    return env.kyber && env.contracts.kyberChainSlug && env.contracts.kyberRouter ? { status: 'pool' } : null;
  }

  private route(env: VenueEnv, side: 'buy' | 'sell', token: Address, amountIn: bigint, fee: KyberFeeParams | null, origin?: Address): Promise<KyberRoute> {
    const [tokenIn, tokenOut] = side === 'buy' ? [KYBER_NATIVE, token] : [token, KYBER_NATIVE];
    return env.kyber!.route(env.contracts.kyberChainSlug!, { tokenIn, tokenOut, amountIn, fee, origin });
  }

  async quote(env: VenueEnv, input: QuoteInput): Promise<VenueQuote> {
    const token = input.token.address;
    const fee = feeParams(env, input.side);
    const origin = input.walletIsReal ? input.wallet : undefined;
    const [main, ref] = await Promise.all([
      this.route(env, input.side, token, input.amountIn, fee, origin),
      this.route(env, input.side, token, referenceAmount(input.amountIn), null).catch(() => null),
    ]);
    if (!env.contracts.kyberRouter || !isAddressEqual(main.routerAddress, env.contracts.kyberRouter)) {
      throw new EvmExecError('invalid_build', `kyberswap quoted through router ${main.routerAddress}, which is not allow-listed`);
    }
    const label = `kyberswap: ${main.exchanges.join(' > ')}`;
    const venueData = { venue: 'kyberswap' as const, routeSummary: main.routeSummary, routerAddress: main.routerAddress, chainSlug: env.contracts.kyberChainSlug! };
    if (input.side === 'buy') {
      const platformFee = fee ? feeOnInput(input.amountIn, fee.bps) : 0n;
      const venueIn = input.amountIn - platformFee;
      return {
        venue: this.id,
        route: 'pool',
        routeLabel: label,
        venueAmountIn: venueIn,
        grossOut: main.amountOut,
        expectedOut: main.amountOut,
        nativeLeg: venueIn,
        platformFee,
        feeMode: fee ? 'atomic' : 'none',
        venueFeeBps: 0,
        tokenTaxBps: 0,
        swapGas: main.gas,
        priceImpactBps: ref ? priceImpactBps(venueIn, main.amountOut, referenceAmount(input.amountIn), ref.amountOut) : 0,
        venueData,
      };
    }
    // currency_out: the quoted amountOut is net of the fee
    const gross = fee ? grossForNet(main.amountOut, fee.bps) : main.amountOut;
    return {
      venue: this.id,
      route: 'pool',
      routeLabel: label,
      venueAmountIn: input.amountIn,
      grossOut: gross,
      expectedOut: main.amountOut,
      nativeLeg: gross,
      platformFee: gross - main.amountOut,
      feeMode: fee ? 'atomic' : 'none',
      venueFeeBps: 0,
      tokenTaxBps: 0,
      swapGas: main.gas,
      priceImpactBps: ref ? priceImpactBps(input.amountIn, gross, referenceAmount(input.amountIn), ref.amountOut) : 0,
      venueData,
    };
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const q = b.quote;
    if (q.venueData.venue !== 'kyberswap' || !env.kyber || !env.contracts.kyberRouter) throw new EvmExecError('invalid_intent', 'not a kyberswap quote');
    const fee = feeParams(env, q.side);
    const fresh = await this.route(env, q.side, q.token, q.amountIn, fee, b.wallet);
    if (fresh.amountOut < q.minOut) {
      throw new EvmExecError('slippage', `price moved: kyberswap now returns ${fresh.amountOut}, below minOut ${q.minOut}`, { amountOut: fresh.amountOut, minOut: q.minOut });
    }
    const build = await env.kyber.build(q.venueData.chainSlug, {
      routeSummary: fresh.routeSummary,
      sender: b.wallet,
      recipient: b.wallet,
      slippageBps: kyberSlippageFor(fresh.amountOut, q.minOut),
      deadline: b.deadline,
      source: KYBER_SOURCE,
    });
    const [tokenIn, tokenOut] = q.side === 'buy' ? [KYBER_NATIVE, q.token] : [q.token, KYBER_NATIVE];
    validateKyberBuild(build, {
      allowedRouters: [env.contracts.kyberRouter],
      tokenIn,
      tokenOut,
      amountIn: q.amountIn,
      wallet: b.wallet,
      minOut: q.minOut,
      minReturnFloor: q.minOut - mulBps(q.minOut, KYBER_MIN_RETURN_GRACE_BPS),
      fee,
    });
    const steps: EvmPlanStep[] = [];
    if (q.side === 'sell') {
      const approve = await approvalStep(env, q.token, b.wallet, build.routerAddress, q.amountIn, 'KyberSwap router');
      if (approve) steps.push(approve);
    }
    steps.push(swapStep(build.routerAddress, build.data, build.value, `kyberswap ${q.side} (${q.routeLabel})`));
    return { steps: orderSteps(steps), verifiedTargets: [] };
  }
}
