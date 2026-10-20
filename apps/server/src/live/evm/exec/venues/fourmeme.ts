// four.meme bonding curve on BNB Chain (TokenManager2 + TokenManagerHelper3).
//
//  - detection: Helper3.getTokenInfo(token) -> tokenManager == TokenManager2,
//    liquidityAdded = graduated to PancakeSwap (then the pool venues trade it).
//  - BNB-quoted tokens: buyTokenAMAP(origin, token, to, funds, minAmount) and
//    sellToken(origin, token, amount, minFunds, feeRate, feeRecipient). The sell
//    variant pays feeRate bps of the sale's gross funds to feeRecipient inside
//    the transaction (verified: feeRate 80 -> 0.8% to the recipient, >=1000
//    reverts "FR"), so sells collect the platform fee atomically. minFunds is
//    checked against the gross funds (TokenSale.cost), before trading fee and
//    token tax. Buys pay the platform fee as a separate transfer (four.meme
//    rejects buys routed through a forwarding contract, and has no fee variant).
//  - ERC-20-quoted tokens (USDT, USD1, ...): Helper3.buyWithEth swaps BNB to the
//    quote and buys; Helper3.sellForEth sells and swaps back to BNB, its
//    minFunds being the BNB received (strictly greater). Its fee option pays in
//    the quote token, so the platform fee is a separate BNB transfer.
//  - quotes are simulated (eth_simulateV1) because Helper3's tryBuy/trySell
//    ignore token taxes (a 9% tax token received 9% less than tryBuy said);
//    tryBuy/trySell remain the fallback and the price-impact reference.

import { decodeEventLog, encodeFunctionData, isAddressEqual, zeroAddress, type Address } from 'viem';
import { fourHelper3Abi, fourTokenManager2Abi } from '../abis';
import { EvmExecError } from '../errors';
import { bpsOf, minOutAfterSlippage, priceImpactBps } from '../math';
import { encodeApprove, nativeInto, netTransfer, simulateCalls, type SimCall, type SimLog } from '../rpc';
import type { EvmPlanStep, VenueQuoteData } from '../types';
import { approvalStep, feeActive, feeStep, orderSteps, referenceAmount, separateFeeMode, SIM_EXTRA_BALANCE, splitBuyFee, swapStep } from './common';
import type { BuildInput, BuildOutput, Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './types';

interface FourDetection {
  tokenManager: Address;
  helper: Address;
  quoteToken: Address;
  tradingFeeBps: number;
}

/** Gas of a four.meme swap when it could not be simulated (measured: buys ~270k, sells ~250k, Helper3 ~480k). */
const FALLBACK_GAS = { bnb: 300_000n, erc20: 500_000n };

function saleCost(logs: SimLog[], tokenManager: Address): bigint | null {
  for (const l of logs) {
    if (!isAddressEqual(l.address, tokenManager)) continue;
    try {
      const ev = decodeEventLog({ abi: fourTokenManager2Abi, data: l.data, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
      if (ev.eventName === 'TokenSale') return ev.args.cost;
    } catch {
      // other events
    }
  }
  return null;
}

export class FourMemeVenue implements Venue {
  readonly id = 'fourmeme' as const;

  async detect(env: VenueEnv, token: Address): Promise<Detection | null> {
    const fm = env.contracts.fourMeme;
    if (!fm) return null;
    let info: readonly [bigint, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean];
    try {
      info = await env.client.readContract({ address: fm.helper3, abi: fourHelper3Abi, functionName: 'getTokenInfo', args: [token] });
    } catch {
      return null;
    }
    const [, tokenManager, quoteToken, , tradingFeeRate, , , , , , , liquidityAdded] = info;
    // Only TokenManager2 (version 2) tokens; v1 tokens are long graduated or dead.
    if (isAddressEqual(tokenManager, zeroAddress) || !isAddressEqual(tokenManager, fm.tokenManager2)) return null;
    const data: FourDetection = { tokenManager, helper: fm.helper3, quoteToken, tradingFeeBps: Number(tradingFeeRate) };
    return { status: liquidityAdded ? 'graduated' : 'curve', data };
  }

  async quote(env: VenueEnv, input: QuoteInput, detection: Detection): Promise<VenueQuote> {
    const d = detection.data as FourDetection;
    const bnbQuoted = isAddressEqual(d.quoteToken, zeroAddress);
    const token = input.token.address;
    return input.side === 'buy' ? this.quoteBuy(env, input, d, bnbQuoted, token) : this.quoteSell(env, input, d, bnbQuoted, token);
  }

  private async quoteBuy(env: VenueEnv, input: QuoteInput, d: FourDetection, bnbQuoted: boolean, token: Address): Promise<VenueQuote> {
    const { fee, venueIn } = splitBuyFee(env, input.amountIn);
    const feeMode = separateFeeMode(env, input, fee);
    const call: SimCall = bnbQuoted
      ? { from: input.wallet, to: d.tokenManager, value: venueIn, data: encodeFunctionData({ abi: fourTokenManager2Abi, functionName: 'buyTokenAMAP', args: [0n, token, input.wallet, venueIn, 0n] }) }
      : { from: input.wallet, to: d.helper, value: venueIn, data: encodeFunctionData({ abi: fourHelper3Abi, functionName: 'buyWithEth', args: [0n, token, input.wallet, venueIn, 0n] }) };
    const [sim, est, ref] = await Promise.all([
      simulateCalls(env.client, [call], { [input.wallet]: { balance: venueIn + SIM_EXTRA_BALANCE } }).catch(() => null),
      env.client.readContract({ address: d.helper, abi: fourHelper3Abi, functionName: 'tryBuy', args: [token, 0n, venueIn] }).catch(() => null),
      env.client.readContract({ address: d.helper, abi: fourHelper3Abi, functionName: 'tryBuy', args: [token, 0n, referenceAmount(venueIn)] }).catch(() => null),
    ]);
    if (sim && !sim[0].ok) throw new EvmExecError('quote_failed', `four.meme buy reverts: ${sim[0].error}`);
    const estOut = est ? est[2] : null;
    const out = sim ? netTransfer(sim[0].logs, token, input.wallet) : estOut;
    if (!out || out <= 0n) throw new EvmExecError('quote_failed', 'four.meme buy returns no tokens');
    const taxBps = estOut && out < estOut ? bpsOf(estOut - out, estOut) : 0;
    const impact = est && ref ? priceImpactBps(venueIn, est[2], referenceAmount(venueIn), ref[2]) : 0;
    return {
      venue: this.id,
      route: 'curve',
      routeLabel: bnbQuoted ? 'four.meme curve' : 'four.meme curve (BNB via quote token)',
      venueAmountIn: venueIn,
      grossOut: out,
      expectedOut: out,
      nativeLeg: venueIn,
      platformFee: fee,
      feeMode,
      venueFeeBps: d.tradingFeeBps,
      tokenTaxBps: taxBps,
      swapGas: sim ? sim[0].gasUsed : bnbQuoted ? FALLBACK_GAS.bnb : FALLBACK_GAS.erc20,
      priceImpactBps: impact,
      venueData: { venue: 'fourmeme', tokenManager: d.tokenManager, quoteToken: d.quoteToken, helper: d.helper, grossFunds: null },
    };
  }

  private async quoteSell(env: VenueEnv, input: QuoteInput, d: FourDetection, bnbQuoted: boolean, token: Address): Promise<VenueQuote> {
    if (!input.walletIsReal) throw new EvmExecError('invalid_intent', 'sell quotes need the wallet');
    const atomic = bnbQuoted && feeActive(env);
    const feeRate = atomic ? BigInt(env.feeBps) : 0n;
    const feeTo = atomic && env.feeWallet ? env.feeWallet : input.wallet;
    const sell: SimCall = bnbQuoted
      ? { from: input.wallet, to: d.tokenManager, data: encodeFunctionData({ abi: fourTokenManager2Abi, functionName: 'sellToken', args: [0n, token, input.amountIn, 0n, feeRate, feeTo] }) }
      : { from: input.wallet, to: d.helper, data: encodeFunctionData({ abi: fourHelper3Abi, functionName: 'sellForEth', args: [0n, token, input.amountIn, 0n, 0n, input.wallet] }) };
    const approve: SimCall = { from: input.wallet, to: token, data: encodeApprove(d.tokenManager, input.amountIn) };
    const [sim, est, ref] = await Promise.all([
      simulateCalls(env.client, [approve, sell]).catch(() => null),
      env.client.readContract({ address: d.helper, abi: fourHelper3Abi, functionName: 'trySell', args: [token, input.amountIn] }).catch(() => null),
      env.client.readContract({ address: d.helper, abi: fourHelper3Abi, functionName: 'trySell', args: [token, referenceAmount(input.amountIn)] }).catch(() => null),
    ]);
    if (sim && !sim[1].ok) throw new EvmExecError('quote_failed', `four.meme sell reverts: ${sim[1].error}`);
    let received: bigint;
    let atomicFee = 0n;
    let grossFunds: bigint | null;
    if (sim) {
      received = nativeInto(sim[1].logs, input.wallet);
      if (atomic && env.feeWallet) atomicFee = nativeInto(sim[1].logs, env.feeWallet);
      grossFunds = bnbQuoted ? saleCost(sim[1].logs, d.tokenManager) : null;
    } else if (est) {
      // trySell: funds after the trading fee, no token tax
      atomicFee = atomic ? ((est[2] + est[3]) * feeRate) / 10_000n : 0n;
      received = est[2] - atomicFee;
      grossFunds = est[2] + est[3];
    } else {
      throw new EvmExecError('quote_failed', 'four.meme sell cannot be quoted');
    }
    if (received <= 0n) throw new EvmExecError('proceeds_below_fees', 'four.meme sell returns nothing');
    // separate fee for ERC-20-quoted tokens: bps of what the sale pays out
    const separateFee = !atomic && feeActive(env) ? (received * BigInt(env.feeBps)) / 10_000n : 0n;
    const feeMode = atomic ? 'atomic' : separateFeeMode(env, input, separateFee);
    const fee = atomic ? atomicFee : separateFee;
    const grossOut = atomic ? received + atomicFee : received;
    const expectedOut = atomic ? received : received - separateFee;
    if (expectedOut <= 0n) throw new EvmExecError('proceeds_below_fees', 'four.meme sell proceeds do not cover the platform fee');
    const estGross = est ? est[2] : null;
    const taxBps = sim && estGross && grossOut < estGross ? bpsOf(estGross - grossOut - atomicFee, estGross) : 0;
    const impact = est && ref ? priceImpactBps(input.amountIn, est[2], referenceAmount(input.amountIn), ref[2]) : 0;
    const venueData: VenueQuoteData = { venue: 'fourmeme', tokenManager: d.tokenManager, quoteToken: d.quoteToken, helper: d.helper, grossFunds };
    return {
      venue: this.id,
      route: 'curve',
      routeLabel: bnbQuoted ? 'four.meme curve' : 'four.meme curve (quote token to BNB)',
      venueAmountIn: input.amountIn,
      grossOut,
      expectedOut,
      nativeLeg: grossOut,
      platformFee: fee,
      feeMode,
      venueFeeBps: d.tradingFeeBps,
      tokenTaxBps: Math.max(0, taxBps),
      swapGas: sim ? sim[1].gasUsed : bnbQuoted ? FALLBACK_GAS.bnb : FALLBACK_GAS.erc20,
      priceImpactBps: impact,
      venueData,
    };
  }

  async build(env: VenueEnv, b: BuildInput): Promise<BuildOutput> {
    const q = b.quote;
    if (q.venueData.venue !== 'fourmeme') throw new EvmExecError('invalid_intent', 'not a four.meme quote');
    const vd = q.venueData;
    const bnbQuoted = isAddressEqual(vd.quoteToken, zeroAddress);
    const steps: EvmPlanStep[] = [];
    const fee = feeStep(env, q.fees.platformFee, q.fees.platformFeeMode);
    if (q.side === 'buy') {
      const data = bnbQuoted
        ? encodeFunctionData({ abi: fourTokenManager2Abi, functionName: 'buyTokenAMAP', args: [0n, q.token, b.wallet, q.venueAmountIn, q.minOut] })
        : encodeFunctionData({ abi: fourHelper3Abi, functionName: 'buyWithEth', args: [0n, q.token, b.wallet, q.venueAmountIn, q.minOut] });
      if (fee) steps.push(fee);
      steps.push(swapStep(bnbQuoted ? vd.tokenManager : vd.helper, data, q.venueAmountIn, `four.meme buy with ${q.venueAmountIn} wei`));
      return { steps: orderSteps(steps), verifiedTargets: [] };
    }
    const approve = await approvalStep(env, q.token, b.wallet, vd.tokenManager, q.amountIn, 'four.meme TokenManager2');
    if (fee) steps.push(fee);
    if (approve) steps.push(approve);
    if (bnbQuoted) {
      // minFunds is compared with the sale's gross funds: apply the slippage to the simulated gross
      const minFunds = vd.grossFunds !== null ? minOutAfterSlippage(vd.grossFunds, q.slippageBps) : 0n;
      const atomic = q.fees.platformFeeMode === 'atomic';
      const data = encodeFunctionData({
        abi: fourTokenManager2Abi,
        functionName: 'sellToken',
        args: [0n, q.token, q.amountIn, minFunds, atomic ? BigInt(env.feeBps) : 0n, atomic && env.feeWallet ? env.feeWallet : b.wallet],
      });
      steps.push(swapStep(vd.tokenManager, data, 0n, `four.meme sell of ${q.amountIn} tokens`));
    } else {
      // sellForEth's minFunds is the BNB received (strictly greater than)
      const minNative = q.fees.platformFeeMode === 'separate-before' || q.fees.platformFeeMode === 'separate-after' ? q.minOut + q.fees.platformFee : q.minOut;
      const data = encodeFunctionData({ abi: fourHelper3Abi, functionName: 'sellForEth', args: [0n, q.token, q.amountIn, minNative > 0n ? minNative - 1n : 0n, 0n, b.wallet] });
      steps.push(swapStep(vd.helper, data, 0n, `four.meme sell of ${q.amountIn} tokens for BNB`));
    }
    return { steps: orderSteps(steps), verifiedTargets: [] };
  }
}

