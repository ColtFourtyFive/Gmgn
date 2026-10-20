// EVM chains in live mode: numeric chain ids, viem chain definitions, default
// public RPCs, wrapped native and the stablecoin used for the native USD price,
// and the shared protocol contracts every EVM module relies on. Each address
// below was confirmed to hold contract code on its chain (eth_getCode); venue
// specific contracts (launchpads, routers) live with the module that uses them.

import type { ChainId } from '@trenchscope/shared';
import { defineChain, type Address, type Chain } from 'viem';
import { base, bsc, mainnet } from 'viem/chains';

export type EvmChainId = Exclude<ChainId, 'sol'>;

/** Core chains first (Base, Robinhood Chain), then BNB Chain and Ethereum. */
export const EVM_CHAIN_IDS: EvmChainId[] = ['base', 'robinhood', 'bsc', 'eth'];

export function isEvmChain(chain: ChainId): chain is EvmChainId {
  return chain !== 'sol';
}

/** Robinhood Chain mainnet (Arbitrum Orbit rollup, ETH gas). Not in viem's catalogue yet. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});

export interface UsdReference {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface EvmChainInfo {
  id: EvmChainId;
  chainId: number;
  viem: Chain;
  /** Used when no <PREFIX>_RPC_URL is set. Public endpoints are rate-limited: production needs a provider. */
  publicRpcUrls: string[];
  /** Env var prefix: <PREFIX>_RPC_URL, <PREFIX>_WS_URL, <PREFIX>_PRIVATE_RPC_URL. */
  envPrefix: string;
  /** Average block time (ms), measured on mainnet. */
  blockTimeMs: number;
  /** Largest block span one eth_getLogs call should cover on a busy public RPC. */
  maxLogBlockRange: number;
  wrappedNative: Address;
  /** Stablecoin quoted against wrapped native for the native USD price (null = use an off-chain price). */
  usd: UsdReference | null;
  multicall3: Address;
  permit2: Address;
  uniswapV4PoolManager: Address | null;
  /** Uniswap-V2-style factory (PancakeSwap V2 on BNB Chain). */
  v2Factory: Address | null;
  /** Uniswap-V3-style factory (PancakeSwap V3 on BNB Chain). */
  v3Factory: Address | null;
  explorerUrl: string;
}

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const EVM_CHAINS: Record<EvmChainId, EvmChainInfo> = {
  base: {
    id: 'base',
    chainId: 8453,
    viem: base,
    publicRpcUrls: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
    envPrefix: 'BASE',
    blockTimeMs: 2000,
    maxLogBlockRange: 50,
    wrappedNative: '0x4200000000000000000000000000000000000006',
    usd: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    multicall3: MULTICALL3,
    permit2: PERMIT2,
    uniswapV4PoolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
    v2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    v3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    explorerUrl: 'https://basescan.org',
  },
  robinhood: {
    id: 'robinhood',
    chainId: 4663,
    viem: robinhoodChain,
    publicRpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
    envPrefix: 'ROBINHOOD',
    blockTimeMs: 105,
    // ~28 logs per block: 400 blocks is ~11k logs, over the public RPC's 10k cap for unfiltered queries.
    maxLogBlockRange: 200,
    wrappedNative: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    usd: null,
    multicall3: MULTICALL3,
    permit2: PERMIT2,
    // Same runtime bytecode as the PoolManager on Base and Ethereum; emits v4 Swap / ModifyLiquidity.
    uniswapV4PoolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
    v2Factory: null,
    v3Factory: null,
    explorerUrl: 'https://robinhoodchain.blockscout.com',
  },
  bsc: {
    id: 'bsc',
    chainId: 56,
    viem: bsc,
    publicRpcUrls: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
    envPrefix: 'BSC',
    blockTimeMs: 450,
    maxLogBlockRange: 100,
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    usd: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
    multicall3: MULTICALL3,
    permit2: PERMIT2,
    uniswapV4PoolManager: null,
    v2Factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    v3Factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    explorerUrl: 'https://bscscan.com',
  },
  eth: {
    id: 'eth',
    chainId: 1,
    viem: mainnet,
    publicRpcUrls: ['https://ethereum-rpc.publicnode.com'],
    envPrefix: 'ETH',
    blockTimeMs: 12000,
    maxLogBlockRange: 20,
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usd: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    multicall3: MULTICALL3,
    permit2: PERMIT2,
    uniswapV4PoolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    explorerUrl: 'https://etherscan.io',
  },
};

/**
 * Robinhood Chain tokenized stocks / ETFs ("<Name> • Robinhood Token") are
 * BeaconProxies of this beacon (read from their EIP-1967 beacon slot): real
 * assets, not memecoins, so live discovery never lists them.
 */
export const ROBINHOOD_STOCK_TOKEN_BEACON: Address = '0xe10b6f6b275de231345c20d14ab812db62151b00';
/** EIP-1967 beacon slot: bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1). */
export const EIP1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
