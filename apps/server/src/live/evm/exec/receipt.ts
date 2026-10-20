// Decoding a confirmed swap into an EvmFill.
//
//  - token amount: the token's Transfer logs to / from the wallet (exact; a
//    fee-on-transfer token reports what actually arrived or left).
//  - native leg: native moves through internal transfers that receipts do not
//    log, so the primary source is the wallet's balance delta across the block
//    (balance(B) - balance(B-1), corrected for the value and gas of every
//    transaction the wallet sent in that block). Recent state is enough: track()
//    runs right after confirmation. When historical state is pruned, venue
//    events give the native leg (Pons CurveBuy/CurveSell, Flap
//    TokenBought/TokenSold, four.meme TokenPurchase/TokenSale, KyberSwap
//    Swapped), then calldata (exact-input swaps), then the quote.
//  - gas: gasUsed x effectiveGasPrice, plus the OP Stack L1 data fee on Base.
//  - platform fee: what the plan charged (fixed amounts are exact; a fee in bps
//    of the output is recomputed from the actual output).

import { decodeEventLog, isAddressEqual, type Address, type Hex, type Log, type PublicClient, type TransactionReceipt } from 'viem';
import type { Side } from '@trenchscope/shared';
import type { EvmChainId } from '../chains';
import { flapPortalAbi, fourTokenManager2Abi, kyberRouterAbi, ponsCurveAbi } from './abis';
import { feeOnOutput, grossForNet } from './math';
import { TRANSFER_TOPIC } from './rpc';
import type { EvmFill, EvmQuote, EvmVenueId } from './types';

export interface EvmTrackContext {
  token: Address;
  side: Side;
  /** The quote the swap came from (venue, fee mode, expected amounts). */
  quote?: EvmQuote;
  /** Hashes of every transaction of the plan (to correct the balance delta for same-block steps). */
  planTxHashes?: Hex[];
  /** Platform fee paid by a separate transfer of the plan (wei), when the fee is not atomic. */
  separateFeePaid?: bigint;
}

const lowerTopicAddr = (t: Hex | undefined) => (t ? `0x${t.slice(26)}`.toLowerCase() : '');

/** Net token flow into `wallet` from the receipt's Transfer logs (negative = sent). */
export function tokenFlow(logs: readonly Pick<Log, 'address' | 'topics' | 'data'>[], token: Address, wallet: Address): bigint {
  const me = wallet.toLowerCase();
  let net = 0n;
  for (const l of logs) {
    if (!isAddressEqual(l.address, token) || l.topics[0] !== TRANSFER_TOPIC || l.topics.length < 3) continue;
    const v = BigInt(l.data);
    if (lowerTopicAddr(l.topics[2] as Hex) === me) net += v;
    if (lowerTopicAddr(l.topics[1] as Hex) === me) net -= v;
  }
  return net;
}

export function gasPaidOf(receipt: TransactionReceipt): bigint {
  const l1 = (receipt as TransactionReceipt & { l1Fee?: bigint | null }).l1Fee ?? 0n;
  return receipt.gasUsed * receipt.effectiveGasPrice + (l1 ?? 0n);
}

/** Native leg from a venue's own event in the receipt (wei), or null. */
export function nativeFromEvents(logs: readonly Pick<Log, 'address' | 'topics' | 'data'>[], side: Side, wallet: Address): { amount: bigint; venue: EvmVenueId } | null {
  for (const l of logs) {
    const topics = l.topics as [Hex, ...Hex[]];
    try {
      const ev = decodeEventLog({ abi: ponsCurveAbi, data: l.data, topics });
      if (ev.eventName === 'CurveBuy' && side === 'buy' && isAddressEqual(ev.args.recipient, wallet)) return { amount: ev.args.quoteIn, venue: 'pons' };
      if (ev.eventName === 'CurveSell' && side === 'sell' && isAddressEqual(ev.args.recipient, wallet)) return { amount: ev.args.quoteOut, venue: 'pons' };
    } catch {
      // not a pons event
    }
    try {
      const ev = decodeEventLog({ abi: flapPortalAbi, data: l.data, topics });
      if (ev.eventName === 'TokenBought' && side === 'buy' && isAddressEqual(ev.args.buyer, wallet)) return { amount: ev.args.eth, venue: 'flap' };
      if (ev.eventName === 'TokenSold' && side === 'sell' && isAddressEqual(ev.args.seller, wallet)) return { amount: ev.args.eth, venue: 'flap' };
    } catch {
      // not a flap event
    }
    try {
      const ev = decodeEventLog({ abi: fourTokenManager2Abi, data: l.data, topics });
      // TokenPurchase.cost excludes the trading fee: add it back for the native that went in
      if (ev.eventName === 'TokenPurchase' && side === 'buy' && isAddressEqual(ev.args.account, wallet)) return { amount: ev.args.cost + ev.args.fee, venue: 'fourmeme' };
      if (ev.eventName === 'TokenSale' && side === 'sell' && isAddressEqual(ev.args.account, wallet)) return { amount: ev.args.cost - ev.args.fee, venue: 'fourmeme' };
    } catch {
      // not a four.meme event
    }
    try {
      const ev = decodeEventLog({ abi: kyberRouterAbi, data: l.data, topics });
      if (ev.eventName === 'Swapped' && isAddressEqual(ev.args.dstReceiver, wallet)) return { amount: side === 'buy' ? ev.args.spentAmount : ev.args.returnAmount, venue: 'kyberswap' };
    } catch {
      // not a kyber event
    }
  }
  return null;
}

export interface DecodeFillInput {
  chain: EvmChainId;
  receipt: TransactionReceipt;
  /** The swap transaction's value (wei) and sender. */
  txValue: bigint;
  wallet: Address;
  blockTimestampMs: number;
  ctx: EvmTrackContext;
  /** Native the wallet received in the block from others (balance-delta method), or null when unavailable. */
  internalIn: bigint | null;
}

/** Pure decoding of a swap receipt (all chain reads done by the caller). */
export function decodeFill(input: DecodeFillInput): EvmFill {
  const { receipt, ctx, wallet } = input;
  const q = ctx.quote;
  const side = ctx.side;
  const success = receipt.status === 'success';
  const flow = tokenFlow(receipt.logs, ctx.token, wallet);
  const tokenAmount = success ? (side === 'buy' ? (flow > 0n ? flow : 0n) : flow < 0n ? -flow : 0n) : 0n;
  const gasPaid = gasPaidOf(receipt);
  const feeMode = q?.fees.platformFeeMode ?? 'none';
  const feeBps = q?.fees.platformFeeBps ?? 0;
  const venue = q?.venue ?? null;

  let walletNativeDelta = 0n;
  let nativeAmount = 0n;
  let platformFee = 0n;
  let nativeSource: EvmFill['nativeSource'] = 'estimate';

  if (success) {
    const event = nativeFromEvents(receipt.logs, side, wallet);
    if (side === 'buy') {
      const atomicFee = feeMode === 'atomic' ? (q?.fees.platformFee ?? 0n) : 0n;
      if (input.internalIn !== null) {
        walletNativeDelta = input.txValue - input.internalIn;
        nativeSource = 'balance';
      } else {
        walletNativeDelta = input.txValue;
        nativeSource = event ? 'event' : 'calldata';
      }
      nativeAmount = walletNativeDelta - atomicFee;
      if (input.internalIn === null && event && venue !== 'kyberswap') nativeAmount = event.amount;
      platformFee = feeMode === 'atomic' ? atomicFee : (ctx.separateFeePaid ?? 0n);
    } else {
      let received: bigint | null = input.internalIn;
      if (received !== null) nativeSource = 'balance';
      else if (event) {
        received = event.amount;
        nativeSource = 'event';
      } else {
        received = q?.expectedOut ?? 0n;
        nativeSource = 'estimate';
      }
      walletNativeDelta = received;
      if (feeMode === 'atomic') {
        if (venue === 'fourmeme' && q?.venueData.venue === 'fourmeme') {
          // four.meme pays feeRate bps of the sale's gross funds (TokenSale.cost)
          const sale = receipt.logs.map((l) => { try { return decodeEventLog({ abi: fourTokenManager2Abi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); } catch { return null; } }).find((e) => e?.eventName === 'TokenSale');
          platformFee = sale && sale.eventName === 'TokenSale' ? (sale.args.cost * BigInt(feeBps)) / 10_000n : (q.fees.platformFee ?? 0n);
        } else {
          // bps of the gross output (Universal Router PAY_PORTION, KyberSwap currency_out)
          const gross = grossForNet(received, feeBps);
          platformFee = feeOnOutput(gross, feeBps);
        }
        nativeAmount = received + platformFee;
      } else {
        platformFee = ctx.separateFeePaid ?? 0n;
        nativeAmount = received;
      }
    }
  }

  return {
    chain: input.chain,
    hash: receipt.transactionHash,
    status: success ? 'success' : 'reverted',
    wallet,
    token: ctx.token,
    side,
    venue,
    route: q?.routeLabel ?? 'unknown',
    blockNumber: receipt.blockNumber,
    timestamp: input.blockTimestampMs,
    tokenAmount,
    nativeAmount,
    walletNativeDelta,
    platformFee,
    gasPaid,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    nativeSource,
  };
}

/**
 * Native the wallet received from others during block B: balance(B) -
 * balance(B-1) + value and gas of every transaction it sent in B. Null when the
 * node no longer serves state at B-1.
 */
export async function internalInflow(client: PublicClient, wallet: Address, receipt: TransactionReceipt, sameBlockTxs: { value: bigint; receipt: TransactionReceipt }[]): Promise<bigint | null> {
  const b = receipt.blockNumber;
  try {
    const [after, before] = await Promise.all([client.getBalance({ address: wallet, blockNumber: b }), client.getBalance({ address: wallet, blockNumber: b - 1n })]);
    let spent = 0n;
    for (const t of sameBlockTxs) spent += t.value + gasPaidOf(t.receipt);
    const inflow = after - before + spent;
    return inflow >= 0n ? inflow : null;
  } catch {
    return null;
  }
}
