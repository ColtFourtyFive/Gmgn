// AMM venues the round-trip simulator discovers pools on, per chain. Every
// factory below was verified on-chain (code present, getPair / getPool for the
// wrapped-native / stablecoin pair returns a pool whose factory() points back).
// Robinhood Chain's Uniswap / PancakeSwap factories are not in chains.ts yet
// (v2Factory / v3Factory are null there), so this module keeps its own table.

import { getAddress, type Address } from 'viem';
import type { EvmChainId } from '../chains';

export interface V2Venue {
  kind: 'v2';
  id: string;
  factory: Address;
  /** Swap fee in basis points (Uniswap 30, PancakeSwap 25). */
  feeBps: number;
}

export interface V3Venue {
  kind: 'v3';
  id: string;
  factory: Address;
  /** Fee tiers in hundredths of a bip. */
  fees: number[];
}

export type Venue = V2Venue | V3Venue;

const PANCAKE_V3: Address = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const UNI_V3_TIERS = [100, 500, 3000, 10000];
const PANCAKE_V3_TIERS = [100, 500, 2500, 10000];

export const VENUES: Record<EvmChainId, Venue[]> = {
  base: [
    { kind: 'v2', id: 'uniswap-v2', factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', feeBps: 30 },
    { kind: 'v2', id: 'pancake-v2', factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E', feeBps: 25 },
    { kind: 'v3', id: 'uniswap-v3', factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', fees: UNI_V3_TIERS },
    { kind: 'v3', id: 'pancake-v3', factory: PANCAKE_V3, fees: PANCAKE_V3_TIERS },
  ],
  robinhood: [
    { kind: 'v2', id: 'uniswap-v2', factory: '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f', feeBps: 30 },
    { kind: 'v2', id: 'pancake-v2', factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E', feeBps: 25 },
    { kind: 'v3', id: 'uniswap-v3', factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA', fees: UNI_V3_TIERS },
    { kind: 'v3', id: 'pancake-v3', factory: PANCAKE_V3, fees: PANCAKE_V3_TIERS },
  ],
  bsc: [
    { kind: 'v2', id: 'pancake-v2', factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', feeBps: 25 },
    { kind: 'v2', id: 'uniswap-v2', factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', feeBps: 30 },
    { kind: 'v3', id: 'pancake-v3', factory: PANCAKE_V3, fees: PANCAKE_V3_TIERS },
    { kind: 'v3', id: 'uniswap-v3', factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7', fees: UNI_V3_TIERS },
  ],
  eth: [
    { kind: 'v2', id: 'uniswap-v2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', feeBps: 30 },
    { kind: 'v2', id: 'sushiswap-v2', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', feeBps: 30 },
    { kind: 'v2', id: 'pancake-v2', factory: '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362', feeBps: 25 },
    { kind: 'v3', id: 'uniswap-v3', factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fees: UNI_V3_TIERS },
    { kind: 'v3', id: 'pancake-v3', factory: PANCAKE_V3, fees: PANCAKE_V3_TIERS },
  ],
};

/**
 * Quote tokens searched besides wrapped native and chains.ts's `usd` (which is
 * null on Robinhood Chain): USDG, the stablecoin paired with WETH on Robinhood
 * Chain's Uniswap V2 / V3 and PancakeSwap pools.
 */
export const EXTRA_QUOTES: Partial<Record<EvmChainId, Address[]>> = {
  robinhood: ['0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'],
};

/** V2 fee assumed for a pair whose factory is not in the table: high enough for any common fork. */
export const UNKNOWN_V2_FEE_BPS = 100;

export function venueByFactory(chain: EvmChainId, factory: Address): Venue | null {
  const f = factory.toLowerCase();
  return VENUES[chain].find((v) => v.factory.toLowerCase() === f) ?? null;
}

/** Addresses that hold burned tokens / LP. */
export const BURN_ADDRESSES: Address[] = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dEaD',
  '0xdEAD000000000000000042069420694206942069',
];

const BURN_SET = new Set(BURN_ADDRESSES.map((a) => a.toLowerCase()));
export const isBurnAddress = (a: string | null | undefined): boolean => !!a && BURN_SET.has(a.toLowerCase());

export const checksum = (a: string): Address => getAddress(a);
