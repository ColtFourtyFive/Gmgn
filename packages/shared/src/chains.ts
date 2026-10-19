// Chain + launchpad configuration for the simulated multi-chain market.
// Launchpads and DEX names are fictional stand-ins for the real venues
// (bonding-curve launchpads and constant-product AMMs).

export type ChainId = 'sol' | 'bsc' | 'base' | 'eth';

export const CHAIN_IDS: ChainId[] = ['sol', 'bsc', 'base', 'eth'];

export interface ChainConfig {
  id: ChainId;
  name: string;
  nativeSymbol: string;
  /** Starting USD price of the native asset in the simulator. */
  nativeUsdStart: number;
  /** Address style for generated addresses. */
  addressStyle: 'base58' | 'evm';
  /** Block / slot time in ms (drives "same block" bundle detection). */
  blockTimeMs: number;
  /** Native decimals shown in UI. */
  nativeDecimals: number;
  /** Default paper balance granted to new accounts (native units). */
  starterBalance: number;
  /** Default quick-buy amounts (native). */
  quickBuyAmounts: number[];
  /** Typical priority fee / gas cost in native per swap. */
  baseNetworkFee: number;
  /** Relative token-launch frequency (launches per minute) in the simulator. */
  launchesPerMinute: number;
  explorerName: string;
  /** Brand accent for chain chips. */
  color: string;
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  sol: {
    id: 'sol',
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeUsdStart: 185,
    addressStyle: 'base58',
    blockTimeMs: 400,
    nativeDecimals: 9,
    starterBalance: 50,
    quickBuyAmounts: [0.1, 0.5, 1, 2],
    baseNetworkFee: 0.000005,
    launchesPerMinute: 9,
    explorerName: 'SimScan',
    color: '#9945FF',
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Chain',
    nativeSymbol: 'BNB',
    nativeUsdStart: 610,
    addressStyle: 'evm',
    blockTimeMs: 750,
    nativeDecimals: 18,
    starterBalance: 15,
    quickBuyAmounts: [0.05, 0.1, 0.5, 1],
    baseNetworkFee: 0.00005,
    launchesPerMinute: 4,
    explorerName: 'SimScan',
    color: '#F0B90B',
  },
  base: {
    id: 'base',
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeUsdStart: 3400,
    addressStyle: 'evm',
    blockTimeMs: 2000,
    nativeDecimals: 18,
    starterBalance: 3,
    quickBuyAmounts: [0.01, 0.05, 0.1, 0.25],
    baseNetworkFee: 0.000002,
    launchesPerMinute: 3,
    explorerName: 'SimScan',
    color: '#0052FF',
  },
  eth: {
    id: 'eth',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeUsdStart: 3400,
    addressStyle: 'evm',
    blockTimeMs: 12000,
    nativeDecimals: 18,
    starterBalance: 3,
    quickBuyAmounts: [0.02, 0.05, 0.1, 0.5],
    baseNetworkFee: 0.0015,
    launchesPerMinute: 0.8,
    explorerName: 'SimScan',
    color: '#627EEA',
  },
};

export interface LaunchpadConfig {
  id: string;
  chain: ChainId;
  name: string;
  /** Total token supply minted at launch. */
  totalSupply: number;
  /** Initial virtual native reserve of the curve. */
  virtualNative: number;
  /** Initial virtual token reserve of the curve. */
  virtualTokens: number;
  /** Real tokens sellable on the curve before graduation. */
  curveTokens: number;
  /** Curve trading fee (ratio). */
  feeRate: number;
  /** Native taken as migration fee when graduating. */
  migrationFeeNative: number;
  /** Share of launches on this chain that use this launchpad (weights). */
  weight: number;
  color: string;
}

export const LAUNCHPADS: LaunchpadConfig[] = [
  // Solana: pump-style curves (~85 SOL to graduate)
  { id: 'moonpit', chain: 'sol', name: 'Moonpit', totalSupply: 1e9, virtualNative: 30, virtualTokens: 1_073_000_000, curveTokens: 793_100_000, feeRate: 0.01, migrationFeeNative: 1.5, weight: 0.62, color: '#5EE6A8' },
  { id: 'bonkfire', chain: 'sol', name: 'Bonkfire', totalSupply: 1e9, virtualNative: 30, virtualTokens: 1_073_000_000, curveTokens: 793_100_000, feeRate: 0.01, migrationFeeNative: 1.5, weight: 0.28, color: '#FF8A3D' },
  { id: 'rayforge', chain: 'sol', name: 'Rayforge', totalSupply: 1e9, virtualNative: 30, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.0125, migrationFeeNative: 1, weight: 0.10, color: '#59C3FF' },
  // BNB Chain: ~24 BNB to graduate
  { id: 'fourpad', chain: 'bsc', name: 'FourPad', totalSupply: 1e9, virtualNative: 8, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.3, weight: 0.8, color: '#F5C542' },
  { id: 'bnbrocket', chain: 'bsc', name: 'BNB Rocket', totalSupply: 1e9, virtualNative: 8, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.3, weight: 0.2, color: '#E8A33D' },
  // Base: clanker-style direct pools are modeled as short curves
  { id: 'clawlab', chain: 'base', name: 'ClawLab', totalSupply: 1e11, virtualNative: 1.6, virtualTokens: 1.073e11, curveTokens: 8e10, feeRate: 0.01, migrationFeeNative: 0.05, weight: 0.7, color: '#7AA2FF' },
  { id: 'basedrop', chain: 'base', name: 'BaseDrop', totalSupply: 1e9, virtualNative: 1.6, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.05, weight: 0.3, color: '#4F7BFF' },
  // Ethereum
  { id: 'etherforge', chain: 'eth', name: 'EtherForge', totalSupply: 1e9, virtualNative: 1.8, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.08, weight: 1, color: '#9DA8FF' },
];

export function launchpadsFor(chain: ChainId): LaunchpadConfig[] {
  return LAUNCHPADS.filter((l) => l.chain === chain);
}

export function getLaunchpad(id: string): LaunchpadConfig | undefined {
  return LAUNCHPADS.find((l) => l.id === id);
}

export interface DexConfig {
  id: string;
  chain: ChainId;
  name: string;
  feeRate: number;
}

export const DEXES: DexConfig[] = [
  { id: 'trenchswap-sol', chain: 'sol', name: 'TrenchSwap', feeRate: 0.0025 },
  { id: 'trenchswap-bsc', chain: 'bsc', name: 'TrenchSwap', feeRate: 0.0025 },
  { id: 'trenchswap-base', chain: 'base', name: 'TrenchSwap', feeRate: 0.003 },
  { id: 'trenchswap-eth', chain: 'eth', name: 'TrenchSwap', feeRate: 0.003 },
];

export function dexFor(chain: ChainId): DexConfig {
  return DEXES.find((d) => d.chain === chain)!;
}

/** Platform trading fee charged by Trenchscope on every paper trade (ratio). */
export const PLATFORM_FEE_RATE = 0.008;

export function isChainId(v: unknown): v is ChainId {
  return typeof v === 'string' && (CHAIN_IDS as string[]).includes(v);
}
