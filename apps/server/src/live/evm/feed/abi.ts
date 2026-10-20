// Shared ABIs and event topics of the EVM feed: ERC-20, Uniswap-style AMMs
// (V2 pairs, V3 pools, the V4 PoolManager) and ERC-4337 bundles. Each event's
// topic0 is derived from its signature here and checked against recorded
// mainnet logs in the tests; venue-specific ABIs live with their venue.

import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, toEventSelector, type Abi, type Hex } from 'viem';

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
/** Legacy tokens (e.g. MKR-style) return bytes32 for name / symbol. */
export const erc20Bytes32Abi = parseAbi(['function name() view returns (bytes32)', 'function symbol() view returns (bytes32)']);

export const v2PairAbi = parseAbi([
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function factory() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function getPair(address, address) view returns (address)',
]);

export const v3PoolAbi = parseAbi([
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function getPool(address, address, uint24) view returns (address)',
]);

/** PancakeSwap V3 pools emit the protocol fees with every swap. */
export const pancakeV3SwapAbi = parseAbi([
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)',
]);

/** slot0 differs between forks after the first two words; only sqrtPriceX96 and tick are read. */
export const slot0Abi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick)']);

export const v4PoolManagerAbi = parseAbi([
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  'event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)',
  'function extsload(bytes32 slot) view returns (bytes32)',
]);

export const entryPointAbi = parseAbi([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
]);

export const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

export const TOPIC = {
  v2PairCreated: toEventSelector('PairCreated(address,address,address,uint256)'),
  v2Sync: toEventSelector('Sync(uint112,uint112)'),
  v2Swap: toEventSelector('Swap(address,uint256,uint256,uint256,uint256,address)'),
  v3PoolCreated: toEventSelector('PoolCreated(address,address,uint24,int24,address)'),
  v3Swap: toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)'),
  pancakeV3Swap: toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)'),
  v4Initialize: toEventSelector('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)'),
  v4Swap: toEventSelector('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'),
  v4ModifyLiquidity: toEventSelector('ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)'),
  userOperation: toEventSelector('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'),
  transfer: toEventSelector('Transfer(address,address,uint256)'),
} as const;

/** ERC-4337 EntryPoints (v0.6, v0.7, v0.8): the bundler is tx.from, the trader is the userOp sender. */
export const ENTRY_POINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
]);

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Arbitrum's ArbSys precompile (Robinhood Chain is an Arbitrum Orbit chain):
 * arbBlockNumber() is the L2 block whose state a call ran against (block.number
 * there is the parent chain's). Checked on Robinhood Chain at latest and past blocks.
 */
export const ARBSYS = '0x0000000000000000000000000000000000000064';
export const ARB_BLOCK_NUMBER_CALL = '0xa3b1b31d' as const;

/** Uniswap V4 PoolKey. */
export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

/** V4 PoolId = keccak256(abi.encode(PoolKey)). */
export function v4PoolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [key.currency0 as Hex, key.currency1 as Hex, key.fee, key.tickSpacing, key.hooks as Hex],
    ),
  );
}

/** PoolManager storage of a pool's Slot0 (StateLibrary: keccak256(poolId . POOLS_SLOT=6)); liquidity sits 3 slots on. */
export function v4StateSlots(poolId: Hex): { slot0: Hex; liquidity: Hex } {
  const base = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId, 6n]));
  const liquidity = `0x${(BigInt(base) + 3n).toString(16).padStart(64, '0')}` as Hex;
  return { slot0: base, liquidity };
}

/** Lowercase 0x-address from a 32-byte topic. */
export function topicAddress(topic: Hex): string {
  return `0x${topic.slice(26)}`.toLowerCase();
}

/** Left-pad an address into a 32-byte topic. */
export function addressTopic(address: string): Hex {
  return `0x${address.toLowerCase().slice(2).padStart(64, '0')}` as Hex;
}

/** Encode a call by function name (loosely typed: names come from the ABIs above). */
export function encodeCall(abi: Abi, functionName: string, args: readonly unknown[] = []): Hex {
  return encodeFunctionData({ abi, functionName, args } as never);
}

/** Decode a call result by function name; null for a missing / undecodable result. */
export function decodeCall<T = unknown>(abi: Abi, functionName: string, data: Hex | null | undefined): T | null {
  if (!data || data === '0x') return null;
  try {
    return decodeFunctionResult({ abi, functionName, data } as never) as T;
  } catch {
    return null;
  }
}
