// Chain + launchpad configuration for the simulated multi-chain market.
// Launchpads and DEX names are fictional stand-ins for the real venues
// (bonding-curve launchpads and constant-product AMMs).

export type ChainId = 'sol' | 'base' | 'robinhood' | 'bsc' | 'eth';

/** Display order: the core chains (Solana, Base, Robinhood Chain) first. */
export const CHAIN_IDS: ChainId[] = ['sol', 'base', 'robinhood', 'bsc', 'eth'];

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
  robinhood: {
    id: 'robinhood',
    name: 'Robinhood Chain',
    nativeSymbol: 'ETH',
    nativeUsdStart: 3400,
    addressStyle: 'evm',
    // Arbitrum Orbit rollup: ~105 ms blocks, gas at a few hundredths of a gwei.
    blockTimeMs: 105,
    nativeDecimals: 18,
    starterBalance: 3,
    quickBuyAmounts: [0.01, 0.05, 0.1, 0.25],
    baseNetworkFee: 0.000006,
    launchesPerMinute: 2,
    explorerName: 'SimScan',
    color: '#C3F53C',
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
  // Robinhood Chain: pons-style curves (~4.2 ETH to graduate) into v4 pools
  { id: 'sherwood', chain: 'robinhood', name: 'Sherwood', totalSupply: 1e9, virtualNative: 1.68, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.05, weight: 0.65, color: '#C3F53C' },
  { id: 'quiver', chain: 'robinhood', name: 'Quiver', totalSupply: 1e9, virtualNative: 1.6, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.05, weight: 0.35, color: '#8FD14F' },
  // Ethereum
  { id: 'etherforge', chain: 'eth', name: 'EtherForge', totalSupply: 1e9, virtualNative: 1.8, virtualTokens: 1_073_000_000, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0.08, weight: 1, color: '#9DA8FF' },
];

/**
 * Real launchpads indexed in live mode. Curve parameters are the venue's
 * public launch constants, used for progress and graduation previews only:
 * live quotes and fills always come from the chain / router.
 */
export const LIVE_LAUNCHPADS: LaunchpadConfig[] = [
  { id: 'pump', chain: 'sol', name: 'pump.fun', totalSupply: 1e9, virtualNative: 30, virtualTokens: 1_073_000_000, curveTokens: 793_100_000, feeRate: 0.0125, migrationFeeNative: 0, weight: 1, color: '#54D38A' },
  // Robinhood Chain. Pons V2 (launch config 0): 1.68 ETH phantom quote on the full 1B supply, 5/7 sold on the
  // curve, graduates at 4.2 ETH into a Uniswap V4 pool (PonsV2MemeHook) with a locked full-range position.
  { id: 'pons', chain: 'robinhood', name: 'Pons', totalSupply: 1e9, virtualNative: 1.68, virtualTokens: 1e9, curveTokens: 714_285_714.2857143, feeRate: 0.01, migrationFeeNative: 0, weight: 1, color: '#C3F53C' },
  // Flap (CDPV2 curve, ETH quote): (R + r)(1e9 + h - S) = k with r = 1.9189797 ETH, h = 107,036,752; 800M sold,
  // graduates at 5 ETH into a Pancake-V2-style pair with burned LP.
  { id: 'flap-robinhood', chain: 'robinhood', name: 'Flap', totalSupply: 1e9, virtualNative: 1.9189797, virtualTokens: 1_107_036_752, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0, weight: 1, color: '#FF6FB5' },
  // Pools.trade (Uniswap Labs): 1B supply launched straight into a Uniswap V4 pool (0.25% LP fee, locked liquidity).
  { id: 'pools-trade', chain: 'robinhood', name: 'Pools.trade', totalSupply: 1e9, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0.0025, migrationFeeNative: 0, weight: 1, color: '#FF37C7' },
  { id: 'uniswap-robinhood', chain: 'robinhood', name: 'Uniswap', totalSupply: 0, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0, migrationFeeNative: 0, weight: 1, color: '#FC72FF' },
  // Base. Clanker v4: tokens launch straight into a Uniswap V4 pool (Clanker hook).
  { id: 'clanker', chain: 'base', name: 'Clanker', totalSupply: 1e11, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0.01, migrationFeeNative: 0, weight: 1, color: '#8A63D2' },
  { id: 'uniswap-base', chain: 'base', name: 'Uniswap', totalSupply: 0, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0, migrationFeeNative: 0, weight: 1, color: '#FC72FF' },
  // BNB Chain. four.meme (BNB quote): constant product on virtual reserves of 25/73 x (max funds, 800M), graduates
  // at the token's max funds (13.6-13.8 BNB at launch) into PancakeSwap.
  { id: 'fourmeme', chain: 'bsc', name: 'four.meme', totalSupply: 1e9, virtualNative: 4.6917808, virtualTokens: 1_073_972_602.74, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0, weight: 1, color: '#3CE07A' },
  // Flap (CDPV2 curve, BNB quote): r = 6.14 BNB, h = 107,036,752; 800M sold, graduates at 16 BNB into PancakeSwap.
  { id: 'flap-bsc', chain: 'bsc', name: 'Flap', totalSupply: 1e9, virtualNative: 6.14, virtualTokens: 1_107_036_752, curveTokens: 800_000_000, feeRate: 0.01, migrationFeeNative: 0, weight: 1, color: '#FF6FB5' },
  { id: 'pancake-bsc', chain: 'bsc', name: 'PancakeSwap', totalSupply: 0, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0, migrationFeeNative: 0, weight: 1, color: '#1FC7D4' },
  // Ethereum: tokens launched straight into a Uniswap pool.
  { id: 'uniswap-eth', chain: 'eth', name: 'Uniswap', totalSupply: 0, virtualNative: 0, virtualTokens: 0, curveTokens: 0, feeRate: 0, migrationFeeNative: 0, weight: 1, color: '#FC72FF' },
];

/** Simulator launchpads of a chain (demo mode). */
export function launchpadsFor(chain: ChainId): LaunchpadConfig[] {
  return LAUNCHPADS.filter((l) => l.chain === chain);
}

/** Real launchpads of a chain (live mode). */
export function liveLaunchpadsFor(chain: ChainId): LaunchpadConfig[] {
  return LIVE_LAUNCHPADS.filter((l) => l.chain === chain);
}

export function getLaunchpad(id: string): LaunchpadConfig | undefined {
  return LAUNCHPADS.find((l) => l.id === id) ?? LIVE_LAUNCHPADS.find((l) => l.id === id);
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
  { id: 'trenchswap-robinhood', chain: 'robinhood', name: 'TrenchSwap', feeRate: 0.003 },
  { id: 'trenchswap-eth', chain: 'eth', name: 'TrenchSwap', feeRate: 0.003 },
];

/** Real AMMs a live token can trade on after leaving its launchpad. */
export const LIVE_DEXES: DexConfig[] = [
  { id: 'pumpswap', chain: 'sol', name: 'PumpSwap', feeRate: 0.0025 },
  { id: 'raydium', chain: 'sol', name: 'Raydium', feeRate: 0.0025 },
  { id: 'meteora', chain: 'sol', name: 'Meteora', feeRate: 0.0025 },
  // EVM: concentrated-liquidity pools set their own fee (a pool's live fee is on its PoolRuntime).
  { id: 'uniswap-v4-robinhood', chain: 'robinhood', name: 'Uniswap V4', feeRate: 0.003 },
  { id: 'uniswap-v3-robinhood', chain: 'robinhood', name: 'Uniswap V3', feeRate: 0.003 },
  // Pancake-V2-style AMM Flap graduates into on Robinhood Chain (0.25%, measured from swaps).
  { id: 'pancake-v2-robinhood', chain: 'robinhood', name: 'Pancake V2', feeRate: 0.0025 },
  { id: 'uniswap-v4-base', chain: 'base', name: 'Uniswap V4', feeRate: 0.003 },
  { id: 'uniswap-v3-base', chain: 'base', name: 'Uniswap V3', feeRate: 0.003 },
  { id: 'uniswap-v2-base', chain: 'base', name: 'Uniswap V2', feeRate: 0.003 },
  { id: 'pancake-v2-bsc', chain: 'bsc', name: 'PancakeSwap V2', feeRate: 0.0025 },
  { id: 'pancake-v3-bsc', chain: 'bsc', name: 'PancakeSwap V3', feeRate: 0.0025 },
  { id: 'uniswap-v4-eth', chain: 'eth', name: 'Uniswap V4', feeRate: 0.003 },
  { id: 'uniswap-v3-eth', chain: 'eth', name: 'Uniswap V3', feeRate: 0.003 },
  { id: 'uniswap-v2-eth', chain: 'eth', name: 'Uniswap V2', feeRate: 0.003 },
];

/** The simulator's AMM for a chain (demo mode). */
export function dexFor(chain: ChainId): DexConfig {
  return DEXES.find((d) => d.chain === chain)!;
}

export function getDex(id: string): DexConfig | undefined {
  return DEXES.find((d) => d.id === id) ?? LIVE_DEXES.find((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// Solana constants & explorer links (live mode)
// ---------------------------------------------------------------------------

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Wrapped SOL mint: the native side of every SOL swap route. */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** Block explorer link for a transaction (live mode only; demo hashes are not on-chain). */
export function explorerTxUrl(chain: ChainId, signature: string): string {
  return chain === 'sol' ? `https://solscan.io/tx/${signature}` : `${EVM_EXPLORERS[chain]}/tx/${signature}`;
}

/** Block explorer link for a wallet address (live mode only). */
export function explorerAddressUrl(chain: ChainId, address: string): string {
  return chain === 'sol' ? `https://solscan.io/account/${address}` : `${EVM_EXPLORERS[chain]}/address/${address}`;
}

/** Block explorer link for a token mint / contract (live mode only). */
export function explorerTokenUrl(chain: ChainId, address: string): string {
  return chain === 'sol' ? `https://solscan.io/token/${address}` : `${EVM_EXPLORERS[chain]}/token/${address}`;
}

const EVM_EXPLORERS: Record<Exclude<ChainId, 'sol'>, string> = {
  bsc: 'https://bscscan.com',
  base: 'https://basescan.org',
  robinhood: 'https://robinhoodchain.blockscout.com',
  eth: 'https://etherscan.io',
};

/**
 * Default platform trading fee (ratio). Demo mode always charges this; live
 * mode charges the server's configured fee (MetaResponse.platformFeeRate).
 */
export const PLATFORM_FEE_RATE = 0.008;

export function isChainId(v: unknown): v is ChainId {
  return typeof v === 'string' && (CHAIN_IDS as string[]).includes(v);
}
