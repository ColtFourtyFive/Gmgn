// Helpers shared across the trading module: input parsing, address
// normalization, amount rules, fill descriptions for notifications and a
// tracker for fire-and-forget executions.

import type { z } from 'zod';
import { CHAINS, formatCompact, formatNative, formatUsd, type AmountKind, type ChainId, type Side, type SwapReceipt } from '@trenchscope/shared';
import { HttpError } from '../context';
import type { TokenState, WalletState } from '../sim/world';

export const HOUR_MS = 3_600_000;

/** Validate input; failures become 400s naming the offending field. */
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.join('.');
  throw new HttpError(400, path ? `${path}: ${issue.message}` : issue.message, 'invalid_input');
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');
export const badRequest = (message: string, code = 'invalid_input') => new HttpError(400, message, code);

/** Simulated EVM addresses are lowercase (base58 never contains "0x"), so checksummed input still matches. */
export function normalizeAddress(address: string): string {
  return /^0x/i.test(address) ? address.toLowerCase() : address;
}

/**
 * Buys spend an absolute native amount (a percentage of the native balance is
 * refused, like GMGN does); sells take a percent of the position or a token amount.
 */
export function assertAmount(side: Side, amount: number, kind: AmountKind): void {
  if (side === 'buy' && kind !== 'native') throw badRequest('amountKind: buys take a native amount, not a percentage of the balance');
  if (side === 'sell' && kind === 'native') throw badRequest('amountKind: sells take a percent of the position or a token amount');
  if (!(amount > 0) || !Number.isFinite(amount)) throw badRequest('amount: must be positive');
  if (kind === 'percent' && amount > 100) throw badRequest('amount: percent must be in (0, 100]');
}

export function balanceOf(wallet: WalletState, token: TokenState): number {
  return wallet.positions.get(token.address)?.balance ?? 0;
}

export function includesIgnoreCase(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

/** "Bought 1.2M $PEPE for 0.5 SOL at $45.2K MC" */
export function describeFill(chain: ChainId, symbol: string, r: SwapReceipt): string {
  const tokens = `${formatCompact(r.tokenAmount)} $${symbol}`;
  const native = formatNative(r.nativeAmount, CHAINS[chain].nativeSymbol);
  const what = r.trade?.side === 'sell' ? `Sold ${tokens} for ${native}` : `Bought ${tokens} for ${native}`;
  return r.trade ? `${what} at ${formatUsd(r.trade.marketCapUsd)} MC` : what;
}

/** Tracks background executions so tests and shutdown can wait for them to settle. */
export class Jobs {
  private readonly pending = new Set<Promise<void>>();

  spawn(label: string, job: Promise<unknown>): void {
    const tracked = job.then(
      () => undefined,
      (err: unknown) => console.error(`[trading] ${label} failed`, err),
    );
    this.pending.add(tracked);
    void tracked.then(() => this.pending.delete(tracked));
  }

  /** Resolves once no job is pending, including jobs spawned while waiting. */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
}
