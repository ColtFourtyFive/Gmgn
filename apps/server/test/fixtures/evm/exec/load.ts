// Loads recorded verification fixtures (scripts/evm-exec-verify.ts --record):
// JSON with bigints written as "123n" strings.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, custom, type Chain, type PublicClient } from 'viem';
import type { EvmChainId } from '../../../../src/live/evm/chains';
import type { Recording, StateOverlay } from '../../../../src/live/evm/exec/recorder';
import type { EvmFill, EvmVenueId } from '../../../../src/live/evm/exec/types';

export const RECORDED_DIR = join(__dirname, 'recorded');

const reviver = (_k: string, v: unknown) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);

export interface TradeFixture {
  file: string;
  chain: EvmChainId;
  case: string;
  side: 'buy' | 'sell';
  token: `0x${string}`;
  venues?: EvmVenueId[];
  wallet: `0x${string}`;
  freshWallet: boolean;
  feeWallet: `0x${string}`;
  now: number;
  buyAmount: string;
  overlay: StateOverlay | null;
  result: { status: string; venue: string; steps: string };
  recording: Recording;
}

export interface ReceiptFixture {
  file: string;
  chain: EvmChainId;
  name: string;
  hash: `0x${string}`;
  token: `0x${string}`;
  side: 'buy' | 'sell';
  eventNative: bigint;
  eventTokens: bigint | null;
  fill: EvmFill;
  recording: Recording;
}

function load<T>(filter: (f: string) => boolean): T[] {
  if (!existsSync(RECORDED_DIR)) return [];
  return readdirSync(RECORDED_DIR)
    .filter((f) => f.endsWith('.json') && filter(f))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(RECORDED_DIR, f), 'utf8'), reviver) }) as T);
}

export const tradeFixtures = () => load<TradeFixture>((f) => !f.startsWith('receipt-'));
export const receiptFixtures = () => load<ReceiptFixture>((f) => f.startsWith('receipt-'));

/** A client that fails historical balance reads (an RPC that pruned the state) and forwards the rest. */
export function withoutHistoricalBalances(chain: Chain, base: PublicClient): PublicClient {
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        if (method === 'eth_getBalance' && (params as unknown[])[1] !== 'latest') throw new Error('missing trie node');
        return base.request({ method, params } as never);
      },
    }, { retryCount: 0 }),
  });
}
