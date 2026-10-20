// Pons v2 bonding curves on Robinhood Chain (found from on-chain activity:
// CurveBuy/CurveSell emitters, their token's launchFactory() and the factory's
// launch records).
//
//  - each token has its own curve contract; the factory
//    0x7eD598Bc...EC7e records it: getLaunchedToken(token) -> (token, curve,
//    ...). A curve is trusted only when that record names it (a token could
//    claim any curve() it likes).
//  - curve.buy(quoteIn, minTokensOut, recipient) payable, returns tokens out;
//    curve.sell(tokensIn, minQuoteOut, recipient) pulls the tokens (exact
//    approve to the curve first) and pays native. Both charge feeBps (1%) +
//    creatorTaxBps (1.5%) of the native leg (buy() output matched
//    tokenReserve * net / (quoteReserve + net) with net = in * (1 - 2.5%)
//    exactly), plus a snipe tax in the first seconds after launch.
//  - only ETH-quoted launches trade here (isNativeQuote); others (USDG, stock
//    tokens) are left to the aggregator.
//  - graduated curves move to a Uniswap v4 pool keyed (ETH, token, fee 0,
//    tickSpacing 200, hooks = factory.memeHook()), traded by the v4 venue.
//  - recipient is a parameter but tokens / proceeds go straight to the
//    wallet; the platform fee is a separate native transfer.

import { encodeFunctionData, isAddressEqual, zeroAddress, type Address } from 'viem';
import { ponsCurveAbi, ponsFactoryAbi } from '../abis';
import { EvmExecError } from '../errors';
import { bpsOf } from '../math';
import { encodeApprove, nativeInto, netTransfer, simulateCalls, type SimCall } from '../rpc';
import type { EvmPlanStep } from '../types';
import { approvalStep, feeStep, orderSteps, sellFee, separateFeeMode, SIM_EXTRA_BALANCE, splitBuyFee, swapStep } from './common';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

export interface PonsDetection {
  curve: Address;
  graduated: boolean;
  feeBps: number;
}

const FALLBACK_GAS = { buy: 160_000n, sell: 100_000n };

/** The curve the Pons factory records for a token, or null when the token is not a Pons launch. */
export async function ponsCurveOf(env: VenueEnv, token: Address): Promise<Address | null> {
  const pons = env.contracts.pons;
  if (!pons) return null;
  try {
    const rec = await env.client.readContract({ address: pons.factory, abi: ponsFactoryAbi, functionName: 'getLaunchedToken', args: [token] });
    if (!isAddressEqual(rec[0], token) || isAddressEqual(rec[1], zeroAddress)) return null;
    return rec[1];
  } catch {
    return null;
  }
}

export class PonsVenue implements Venue {
  readonly id = 'pons' as const;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const curve = await ponsCurveOf(env, token);
    if (!curve) return null;
    const read = <T>(functionName: 'graduated' | 'isNativeQuote' | 'feeBps' | 'creatorTaxBps') =>
      env.client.readContract({ address: curve, abi: ponsCurveAbi, functionName }) as Promise<T>;
    const [graduated, native, feeBps, taxBps] = await Promise.all([read<boolean>('graduated'), read<boolean>('isNativeQuote'), read<bigint>('feeBps'), read<bigint>('creatorTaxBps')]);
    if (!native) return null;
    const data: PonsDetection = { curve, graduated, feeBps: Number(feeBps + taxBps) };
    return { status: graduated ? 'graduated' : 'curve', data };
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const d = detection.data as PonsDetection;
    const token = input.token.address;
    const [quoteReserve, tokenReserve, snipeBps] = await Promise.all([
      env.client.readContract({ address: d.curve, abi: ponsCurveAbi, functionName: 'quoteReserve' }),
      env.client.readContract({ address: d.curve, abi: ponsCurveAbi, functionName: 'tokenReserve' }),
      env.client.readContract({ address: d.curve, abi: ponsCurveAbi, functionName: 'currentSnipeTaxBps', args: [input.wallet] }).catch(() => 0n),
    ]);
    const venueFeeBps = d.feeBps + Number(snipeBps);
    if (input.side === 'buy') {
      const { fee, venueIn } = splitBuyFee(env, input.amountIn);
      const call: SimCall = { from: input.wallet, to: d.curve, value: venueIn, data: encodeFunctionData({ abi: ponsCurveAbi, functionName: 'buy', args: [venueIn, 0n, input.wallet] }) };
      const sim = await simulateCalls(env.client, [call], { [input.wallet]: { balance: venueIn + SIM_EXTRA_BALANCE } }).catch(() => null);
      if (sim && !sim[0].ok) throw new EvmExecError('quote_failed', `pons buy reverts: ${sim[0].error}`);
      const net = venueIn - (venueIn * BigInt(venueFeeBps)) / 10_000n;
      const formula = (tokenReserve * net) / (quoteReserve + net);
      const out = sim ? netTransfer(sim[0].logs, token, input.wallet) : formula;
      if (out <= 0n) throw new EvmExecError('quote_failed', 'pons buy returns no tokens');
      return {
        venue: this.id,
        route: 'curve',
        routeLabel: 'pons curve',
        venueAmountIn: venueIn,
        grossOut: out,
        expectedOut: out,
        nativeLeg: venueIn,
        platformFee: fee,
        feeMode: separateFeeMode(env, input, fee),
        venueFeeBps,
        tokenTaxBps: 0,
        swapGas: sim ? sim[0].gasUsed : FALLBACK_GAS.buy,
        // constant product: impact = net / (quoteReserve + net)
        priceImpactBps: bpsOf(net, quoteReserve + net),
        venueData: { venue: 'pons', curve: d.curve },
      };
    }
    if (!input.walletIsReal) throw new EvmExecError('invalid_intent', 'sell quotes need the wallet');
    const approve: SimCall = { from: input.wallet, to: token, data: encodeApprove(d.curve, input.amountIn) };
    const sell: SimCall = { from: input.wallet, to: d.curve, data: encodeFunctionData({ abi: ponsCurveAbi, functionName: 'sell', args: [input.amountIn, 0n, input.wallet] }) };
    const sim = await simulateCalls(env.client, [approve, sell]).catch(() => null);
    if (sim && !sim[1].ok) throw new EvmExecError('quote_failed', `pons sell reverts: ${sim[1].error}`);
    const formulaGross = (quoteReserve * input.amountIn) / (tokenReserve + input.amountIn);
    const formula = formulaGross - (formulaGross * BigInt(venueFeeBps)) / 10_000n;
    const gross = sim ? nativeInto(sim[1].logs, input.wallet) : formula;
    if (gross <= 0n) throw new EvmExecError('quote_failed', 'pons sell returns nothing');
    const fee = sellFee(env, gross);
    if (gross <= fee) throw new EvmExecError('proceeds_below_fees', 'pons sell proceeds do not cover the platform fee');
    return {
      venue: this.id,
      route: 'curve',
      routeLabel: 'pons curve',
      venueAmountIn: input.amountIn,
      grossOut: gross,
      expectedOut: gross - fee,
      nativeLeg: gross,
      platformFee: fee,
      feeMode: separateFeeMode(env, input, fee),
      venueFeeBps,
      tokenTaxBps: 0,
      swapGas: sim ? sim[1].gasUsed : FALLBACK_GAS.sell,
      priceImpactBps: bpsOf(input.amountIn, tokenReserve + input.amountIn),
      venueData: { venue: 'pons', curve: d.curve },
    };
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const q = b.quote;
    if (q.venueData.venue !== 'pons') throw new EvmExecError('invalid_intent', 'not a pons quote');
    // re-verify the curve against the factory record before sending calldata or an approval to it
    const curve = await ponsCurveOf(env, q.token);
    if (!curve || !isAddressEqual(curve, q.venueData.curve)) throw new EvmExecError('not_allowlisted', 'pons curve is not the factory-recorded curve for this token');
    const steps: EvmPlanStep[] = [];
    const fee = feeStep(env, q.fees.platformFee, q.fees.platformFeeMode);
    if (fee) steps.push(fee);
    if (q.side === 'buy') {
      const data = encodeFunctionData({ abi: ponsCurveAbi, functionName: 'buy', args: [q.venueAmountIn, q.minOut, b.wallet] });
      steps.push(swapStep(curve, data, q.venueAmountIn, `pons buy with ${q.venueAmountIn} wei`));
    } else {
      const approve = await approvalStep(env, q.token, b.wallet, curve, q.amountIn, 'Pons curve');
      if (approve) steps.push(approve);
      const minGross = q.minOut + (q.fees.platformFeeMode === 'none' ? 0n : q.fees.platformFee);
      const data = encodeFunctionData({ abi: ponsCurveAbi, functionName: 'sell', args: [q.amountIn, minGross, b.wallet] });
      steps.push(swapStep(curve, data, 0n, `pons sell of ${q.amountIn} tokens`));
    }
    return { steps: orderSteps(steps), verifiedTargets: [curve] };
  }
}
