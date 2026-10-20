// The venues followed on each chain, with their on-chain addresses (each
// checked for code and its events / reads on mainnet; see the venue modules).

import { EVM_CHAINS, type EvmChainId } from '../../chains';
import type { CandidateRules } from './candidates';
import { ClankerVenue } from './clanker';
import { FlapVenue } from './flap';
import { FourMemeVenue } from './fourmeme';
import { PonsVenue } from './pons';
import { PoolsTradeVenue } from './pools-trade';
import type { Venue } from './types';
import { UniswapV2Venue } from './uniswap-v2';
import { UniswapV3Venue } from './uniswap-v3';
import { UniswapV4Venue } from './uniswap-v4';

export interface VenueSettings {
  /** List tokens launched straight into a DEX pool. */
  newPairs: boolean;
  newPairMinSwaps: number;
  /** Native (whole units) a new pool must trade before it is listed. */
  newPairMinVolume: number;
}

/** DEX factories per chain (beyond the shared registry in live/evm/chains.ts). */
export const DEX_FACTORIES = {
  /** Uniswap V3 on Robinhood Chain (getPool(WETH, USDG, 100) -> the WETH/USDG pool). */
  robinhoodV3: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
  /** Pancake-V2-style factory Flap graduates into on Robinhood Chain (pairs named "Pancake LPs"). */
  robinhoodPancakeV2: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
} as const;

const UNISWAP_V3_TIERS = [100, 500, 3000, 10_000];
const PANCAKE_V3_TIERS = [100, 500, 2500, 10_000];

export function buildVenues(chain: EvmChainId, s: VenueSettings): Venue[] {
  const info = EVM_CHAINS[chain];
  const rules = (launchpad: string | null): CandidateRules & { launchpad: string | null } => ({
    launchpad: s.newPairs ? launchpad : null,
    minVolume: BigInt(Math.round(s.newPairMinVolume * 1e6)) * 10n ** 12n,
    minSwaps: s.newPairMinSwaps,
    ttlMs: 2 * 3600_000,
    cap: 2000,
  });
  const v4 = (launchpad: string, unfiltered: boolean) => {
    const r = rules(launchpad);
    return new UniswapV4Venue({
      poolManager: info.uniswapV4PoolManager!,
      dexId: `uniswap-v4-${chain}`,
      newPairLaunchpad: r.launchpad,
      unfiltered,
      candidates: r,
    });
  };
  const v3 = (factory: string, dexId: string, pancake: boolean, launchpad: string | null) => {
    const r = rules(launchpad);
    return new UniswapV3Venue({ factory, dexId, pancake, feeTiers: pancake ? PANCAKE_V3_TIERS : UNISWAP_V3_TIERS, newPairLaunchpad: r.launchpad, candidates: r });
  };
  const v2 = (factory: string, dexId: string, feeRate: number, launchpad: string | null) => {
    const r = rules(launchpad);
    return new UniswapV2Venue({ factory, dexId, feeRate, newPairLaunchpad: r.launchpad, candidates: r });
  };

  switch (chain) {
    case 'robinhood': {
      // The PoolManager is quiet enough here to read whole (graduation pools keep their full history).
      const uni4 = v4('uniswap-robinhood', true);
      const uni3 = v3(DEX_FACTORIES.robinhoodV3, 'uniswap-v3-robinhood', false, 'uniswap-robinhood');
      const pcs2 = v2(DEX_FACTORIES.robinhoodPancakeV2, 'pancake-v2-robinhood', 0.0025, null);
      return [uni4, uni3, pcs2, new PonsVenue(uni4), new FlapVenue('robinhood', 'flap-robinhood', { v2: pcs2, v3: uni3 }), new PoolsTradeVenue(uni4)];
    }
    case 'base': {
      const uni4 = v4('uniswap-base', false);
      const uni3 = v3(info.v3Factory!, 'uniswap-v3-base', false, 'uniswap-base');
      const uni2 = v2(info.v2Factory!, 'uniswap-v2-base', 0.003, 'uniswap-base');
      return [uni4, uni3, uni2, new ClankerVenue(uni4)];
    }
    case 'bsc': {
      const pcs2 = v2(info.v2Factory!, 'pancake-v2-bsc', 0.0025, 'pancake-bsc');
      const pcs3 = v3(info.v3Factory!, 'pancake-v3-bsc', true, 'pancake-bsc');
      return [pcs2, pcs3, new FourMemeVenue(pcs2), new FlapVenue('bsc', 'flap-bsc', { v2: pcs2, v3: pcs3 })];
    }
    case 'eth': {
      const uni4 = v4('uniswap-eth', false);
      const uni3 = v3(info.v3Factory!, 'uniswap-v3-eth', false, 'uniswap-eth');
      const uni2 = v2(info.v2Factory!, 'uniswap-v2-eth', 0.003, 'uniswap-eth');
      return [uni4, uni3, uni2];
    }
  }
}
