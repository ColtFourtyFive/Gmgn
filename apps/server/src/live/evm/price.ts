// Native USD prices for the live EVM chains, read from each chain's deepest
// wrapped-native / stablecoin Uniswap-V3-style pool (slot0) and pushed into the
// World the way the simulator moves its native prices (World.setNativeUsd), so
// every USD figure (market caps, volumes, PnL) follows the real asset. The
// ETH chains back each other up: a chain whose pool cannot be read or strays
// from the others takes their median.

import type { World } from '../../sim/world';
import type { EvmChainId } from './chains';
import { decodeCall, encodeCall, slot0Abi } from './feed/abi';
import { priceFromSqrtX96 } from './feed/math';
import type { EvmRpc } from './feed/rpc';

export interface UsdReferencePool {
  /** Uniswap-V3-style pool of the wrapped native against a dollar stablecoin. */
  pool: string;
  nativeIsToken0: boolean;
  stableDecimals: number;
  label: string;
}

/** Checked on mainnet: factory getPool(wrapped native, stable, fee) and slot0. */
export const USD_REFERENCE_POOLS: Record<EvmChainId, UsdReferencePool> = {
  base: { pool: '0xd0b53d9277642d899df5c87a3966a349a798f224', nativeIsToken0: true, stableDecimals: 6, label: 'Uniswap V3 WETH/USDC 0.05%' },
  eth: { pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', nativeIsToken0: false, stableDecimals: 6, label: 'Uniswap V3 USDC/WETH 0.05%' },
  bsc: { pool: '0x172fcd41e0913e95784454622d1c3724f546f849', nativeIsToken0: false, stableDecimals: 18, label: 'PancakeSwap V3 USDT/WBNB 0.01%' },
  robinhood: { pool: '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca', nativeIsToken0: true, stableDecimals: 6, label: 'Uniswap V3 WETH/USDG 0.01%' },
};

/** Chains whose native asset is ETH (they can stand in for each other). */
const ETH_NATIVE: EvmChainId[] = ['base', 'eth', 'robinhood'];
/** A chain more than this far from the other ETH chains' median uses the median. */
const MAX_DEVIATION = 0.05;
const SANE = { min: 1, max: 1_000_000 };

export interface NativePriceStatus {
  usd: number | null;
  source: 'pool' | 'cross-chain' | null;
  updatedAt: number | null;
  error: string | null;
}

/** USD per native from a pool's sqrtPriceX96. */
export function nativeUsdFromSqrtPrice(sqrtPriceX96: bigint, ref: Pick<UsdReferencePool, 'nativeIsToken0' | 'stableDecimals'>): number {
  // priceFromSqrtX96 prices "token" in "native" units: here the token is the wrapped native and the unit the stable.
  return priceFromSqrtX96(sqrtPriceX96, ref.nativeIsToken0, 18, ref.stableDecimals);
}

export class NativePriceFeed {
  private readonly state = new Map<EvmChainId, NativePriceStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly world: World,
    private readonly rpcs: Partial<Record<EvmChainId, EvmRpc>>,
    readonly intervalMs = 15_000,
    private readonly now: () => number = () => world.now,
  ) {
    for (const c of Object.keys(rpcs) as EvmChainId[]) this.state.set(c, { usd: null, source: null, updatedAt: null, error: null });
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Read every chain's pool, reconcile the ETH chains, push into the World. */
  async refresh(): Promise<Partial<Record<EvmChainId, number>>> {
    const read = new Map<EvmChainId, number>();
    await Promise.all(
      (Object.entries(this.rpcs) as [EvmChainId, EvmRpc][]).map(async ([chain, rpc]) => {
        const st = this.state.get(chain)!;
        try {
          const ref = USD_REFERENCE_POOLS[chain];
          const [raw] = await rpc.call([{ target: ref.pool, data: encodeCall(slot0Abi, 'slot0') }]);
          const slot0 = decodeCall<readonly [bigint, number]>(slot0Abi, 'slot0', raw);
          if (!slot0) throw new Error(`slot0 of ${ref.label} unreadable`);
          const usd = nativeUsdFromSqrtPrice(slot0[0], ref);
          if (!(usd > SANE.min && usd < SANE.max)) throw new Error(`implausible price ${usd}`);
          read.set(chain, usd);
          st.error = null;
        } catch (err) {
          st.error = (err as Error).message?.split('\n')[0] ?? String(err);
        }
      }),
    );
    const out: Partial<Record<EvmChainId, number>> = {};
    for (const chain of Object.keys(this.rpcs) as EvmChainId[]) {
      const own = read.get(chain);
      let usd = own ?? null;
      let source: NativePriceStatus['source'] = own !== undefined ? 'pool' : null;
      if (ETH_NATIVE.includes(chain)) {
        const others = ETH_NATIVE.filter((c) => c !== chain && read.has(c)).map((c) => read.get(c)!);
        const ref = median(others);
        if (ref !== null && (usd === null || Math.abs(usd / ref - 1) > MAX_DEVIATION)) {
          usd = ref;
          source = 'cross-chain';
        }
      }
      if (usd === null) continue;
      const st = this.state.get(chain)!;
      st.usd = usd;
      st.source = source;
      st.updatedAt = this.now();
      this.world.setNativeUsd(chain, usd);
      out[chain] = usd;
    }
    return out;
  }

  status(chain: EvmChainId): NativePriceStatus | null {
    return this.state.get(chain) ?? null;
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
