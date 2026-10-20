// Boundary conversions: engine bigints -> the shared API DTOs (floats in
// display units). Nothing inside the engine uses these.

import { formatUnits } from 'viem';
import type { ChainId, Quote } from '@trenchscope/shared';
import type { LiveFillRecord } from '../../../context';
import type { ExternalTrade } from '../../../sim/world';
import type { EvmFill, EvmQuote } from './types';

const NATIVE_DECIMALS = 18;

export function toFloat(value: bigint, decimals: number): number {
  return Number(formatUnits(value, decimals));
}

export function nativeFloat(value: bigint): number {
  return toFloat(value, NATIVE_DECIMALS);
}

/** The engine quote as the shared Quote DTO (the shape the trade panel already renders). */
export function toQuoteDto(q: EvmQuote, nativeUsd: number): Quote {
  const buy = q.side === 'buy';
  const tokens = toFloat(buy ? q.expectedOut : q.amountIn, q.tokenDecimals);
  const native = nativeFloat(q.nativeLeg);
  return {
    chain: q.chain as ChainId,
    token: q.token,
    side: q.side,
    amountIn: buy ? nativeFloat(q.amountIn) : toFloat(q.amountIn, q.tokenDecimals),
    expectedOut: buy ? toFloat(q.expectedOut, q.tokenDecimals) : nativeFloat(q.expectedOut),
    minOut: buy ? toFloat(q.minOut, q.tokenDecimals) : nativeFloat(q.minOut),
    priceImpact: q.priceImpactBps / 10_000,
    executionPriceUsd: tokens > 0 ? (native / tokens) * nativeUsd : 0,
    platformFeeNative: nativeFloat(q.fees.platformFee),
    networkFeeNative: nativeFloat(q.fees.gasCost),
    slippage: q.slippageBps / 10_000,
    route: q.route,
    venue: q.routeLabel,
    balanceBefore: q.balanceBefore === null ? 0 : buy ? nativeFloat(q.balanceBefore) : toFloat(q.balanceBefore, q.tokenDecimals),
  };
}

/** A confirmed fill as the durable LiveFillRecord. */
export function toLiveFillRecord(fill: EvmFill, opts: { accountId: string; tokenDecimals: number; nativeUsd: number; source: string }): LiveFillRecord {
  const tokens = toFloat(fill.tokenAmount, opts.tokenDecimals);
  const native = nativeFloat(fill.nativeAmount);
  return {
    accountId: opts.accountId,
    chain: fill.chain as ChainId,
    signature: fill.hash,
    token: fill.token,
    side: fill.side,
    nativeAmount: native,
    tokenAmount: tokens,
    platformFee: nativeFloat(fill.platformFee),
    networkFee: nativeFloat(fill.gasPaid),
    priceUsd: tokens > 0 ? (native / tokens) * opts.nativeUsd : 0,
    at: fill.timestamp,
    source: opts.source,
    route: fill.venue ?? fill.route,
  };
}

/** A confirmed fill as an ExternalTrade for the World ledger (our own fill, fees attached). */
export function toExternalTrade(fill: EvmFill, opts: { tokenDecimals: number; walletTokenBalance?: bigint }): ExternalTrade {
  return {
    wallet: fill.wallet,
    side: fill.side,
    nativeAmount: nativeFloat(fill.nativeAmount),
    tokenAmount: toFloat(fill.tokenAmount, opts.tokenDecimals),
    at: fill.timestamp,
    txHash: fill.hash,
    ...(opts.walletTokenBalance !== undefined ? { walletTokenBalance: toFloat(opts.walletTokenBalance, opts.tokenDecimals) } : {}),
    fees: { platform: nativeFloat(fill.platformFee), network: nativeFloat(fill.gasPaid) },
  };
}
