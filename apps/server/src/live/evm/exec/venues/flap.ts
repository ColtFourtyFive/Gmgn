// Flap bonding curves through the Flap portal (BNB Chain 0xe2cE6ab8...,
// Robinhood Chain 0x26605f32...; same implementation on both).
//
//  - detection: getTokenV7(token).status: 1 = tradable on the curve, 4 = on a
//    DEX (graduated; the pool venues trade it), anything else = not tradable.
//  - trades: swapExactInput({inputToken, outputToken, inputAmount,
//    minOutputAmount, permitData}) with 0x0 as native in either direction,
//    returning the output amount. (buy()/previewBuy() revert FeatureDisabled on
//    the current portals; tokens quoted in an ERC-20 swap native<->quote inside
//    the portal.) Output goes to msg.sender, so the platform fee is a separate
//    native transfer.
//  - Flap tokens are often tax tokens (taxRate in bps, e.g. 900 = 9%, paid to
//    the token's tax processor on every curve trade) on top of the portal's 1%
//    fee (getFeeRate). quoteExactInput includes both and matched simulated
//    buys exactly; sells are simulated from the wallet (approve + swap).

import { encodeFunctionData, zeroAddress, type Address } from 'viem';
import { FLAP_STATUS, flapPortalAbi } from '../abis';
import { EvmExecError } from '../errors';
import { priceImpactBps } from '../math';
import { encodeApprove, nativeInto, netTransfer, simulateCalls, staticCall, type SimCall } from '../rpc';
import type { EvmPlanStep } from '../types';
import { approvalStep, feeStep, orderSteps, referenceAmount, sellFee, separateFeeMode, SIM_EXTRA_BALANCE, splitBuyFee, swapStep } from './common';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

interface FlapDetection {
  portal: Address;
  taxBps: number;
  quoteToken: Address;
}

const FALLBACK_GAS = 450_000n;

export class FlapVenue implements Venue {
  readonly id = 'flap' as const;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const portal = env.contracts.flapPortal;
    if (!portal) return null;
    let state: { status: number; taxRate: bigint; quoteTokenAddress: Address };
    try {
      state = await env.client.readContract({ address: portal, abi: flapPortalAbi, functionName: 'getTokenV7', args: [token] });
    } catch {
      return null;
    }
    const data: FlapDetection = { portal, taxBps: Number(state.taxRate), quoteToken: state.quoteTokenAddress };
    if (state.status === FLAP_STATUS.tradable) return { status: 'curve', data };
    if (state.status === FLAP_STATUS.dex) return { status: 'graduated', data };
    return null;
  }

  private quoteCall(env: VenueEnv, portal: Address, inputToken: Address, outputToken: Address, inputAmount: bigint): Promise<bigint | null> {
    return staticCall(env.client, portal, flapPortalAbi, 'quoteExactInput', [{ inputToken, outputToken, inputAmount }]).catch(() => null);
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const d = detection.data as FlapDetection;
    const token = input.token.address;
    const feeRates = await env.client.readContract({ address: d.portal, abi: flapPortalAbi, functionName: 'getFeeRate' }).catch(() => [100n, 100n] as const);
    if (input.side === 'buy') {
      const { fee, venueIn } = splitBuyFee(env, input.amountIn);
      const swap: SimCall = { from: input.wallet, to: d.portal, value: venueIn, data: encodeFunctionData({ abi: flapPortalAbi, functionName: 'swapExactInput', args: [{ inputToken: zeroAddress, outputToken: token, inputAmount: venueIn, minOutputAmount: 0n, permitData: '0x' }] }) };
      const [sim, est, ref] = await Promise.all([
        simulateCalls(env.client, [swap], { [input.wallet]: { balance: venueIn + SIM_EXTRA_BALANCE } }).catch(() => null),
        this.quoteCall(env, d.portal, zeroAddress, token, venueIn),
        this.quoteCall(env, d.portal, zeroAddress, token, referenceAmount(venueIn)),
      ]);
      if (sim && !sim[0].ok) throw new EvmExecError('quote_failed', `flap buy reverts: ${sim[0].error}`);
      const out = sim ? netTransfer(sim[0].logs, token, input.wallet) : est;
      if (!out || out <= 0n) throw new EvmExecError('quote_failed', 'flap buy returns no tokens');
      return {
        venue: this.id,
        route: 'curve',
        routeLabel: 'flap curve',
        venueAmountIn: venueIn,
        grossOut: out,
        expectedOut: out,
        nativeLeg: venueIn,
        platformFee: fee,
        feeMode: separateFeeMode(env, input, fee),
        venueFeeBps: Number(feeRates[0]),
        tokenTaxBps: d.taxBps,
        swapGas: sim ? sim[0].gasUsed : FALLBACK_GAS,
        priceImpactBps: est && ref ? priceImpactBps(venueIn, est, referenceAmount(venueIn), ref) : 0,
        venueData: { venue: 'flap', portal: d.portal },
      };
    }
    if (!input.walletIsReal) throw new EvmExecError('invalid_intent', 'sell quotes need the wallet');
    const approve: SimCall = { from: input.wallet, to: token, data: encodeApprove(d.portal, input.amountIn) };
    const swap: SimCall = { from: input.wallet, to: d.portal, data: encodeFunctionData({ abi: flapPortalAbi, functionName: 'swapExactInput', args: [{ inputToken: token, outputToken: zeroAddress, inputAmount: input.amountIn, minOutputAmount: 0n, permitData: '0x' }] }) };
    const [sim, est, ref] = await Promise.all([
      simulateCalls(env.client, [approve, swap]).catch(() => null),
      this.quoteCall(env, d.portal, token, zeroAddress, input.amountIn),
      this.quoteCall(env, d.portal, token, zeroAddress, referenceAmount(input.amountIn)),
    ]);
    if (sim && !sim[1].ok) throw new EvmExecError('quote_failed', `flap sell reverts: ${sim[1].error}`);
    const gross = sim ? nativeInto(sim[1].logs, input.wallet) : est;
    if (!gross || gross <= 0n) throw new EvmExecError('quote_failed', 'flap sell returns nothing');
    const fee = sellFee(env, gross);
    if (gross <= fee) throw new EvmExecError('proceeds_below_fees', 'flap sell proceeds do not cover the platform fee');
    return {
      venue: this.id,
      route: 'curve',
      routeLabel: 'flap curve',
      venueAmountIn: input.amountIn,
      grossOut: gross,
      expectedOut: gross - fee,
      nativeLeg: gross,
      platformFee: fee,
      feeMode: separateFeeMode(env, input, fee),
      venueFeeBps: Number(feeRates[1]),
      tokenTaxBps: d.taxBps,
      swapGas: sim ? sim[1].gasUsed : FALLBACK_GAS,
      priceImpactBps: est && ref ? priceImpactBps(input.amountIn, est, referenceAmount(input.amountIn), ref) : 0,
      venueData: { venue: 'flap', portal: d.portal },
    };
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const q = b.quote;
    if (q.venueData.venue !== 'flap') throw new EvmExecError('invalid_intent', 'not a flap quote');
    const portal = q.venueData.portal;
    const steps: EvmPlanStep[] = [];
    const fee = feeStep(env, q.fees.platformFee, q.fees.platformFeeMode);
    if (fee) steps.push(fee);
    if (q.side === 'buy') {
      const data = encodeFunctionData({ abi: flapPortalAbi, functionName: 'swapExactInput', args: [{ inputToken: zeroAddress, outputToken: q.token, inputAmount: q.venueAmountIn, minOutputAmount: q.minOut, permitData: '0x' }] });
      steps.push(swapStep(portal, data, q.venueAmountIn, `flap buy with ${q.venueAmountIn} wei`));
    } else {
      const approve = await approvalStep(env, q.token, b.wallet, portal, q.amountIn, 'Flap portal');
      if (approve) steps.push(approve);
      // the fee is paid separately, so the swap itself must return minOut + fee
      const minGross = q.minOut + (q.fees.platformFeeMode === 'none' ? 0n : q.fees.platformFee);
      const data = encodeFunctionData({ abi: flapPortalAbi, functionName: 'swapExactInput', args: [{ inputToken: q.token, outputToken: zeroAddress, inputAmount: q.amountIn, minOutputAmount: minGross, permitData: '0x' }] });
      steps.push(swapStep(portal, data, 0n, `flap sell of ${q.amountIn} tokens`));
    }
    return { steps: orderSteps(steps), verifiedTargets: [] };
  }
}
