// Universal Router calldata: commands, v4 actions and the swap programs the
// engine uses (exact input, native in or out, platform fee inside the same
// transaction). Encodings follow @uniswap/universal-router-sdk 5.15.0
// (routerCommands.ts) and @uniswap/v4-sdk 2.4.1 (v4Planner.ts), including the
// 2.1.1 layout change that added minHopPriceX36 to every swap.

import { concatHex, encodeAbiParameters, encodeFunctionData, encodePacked, keccak256, numberToHex, zeroAddress, type Address, type Hex } from 'viem';
import { universalRouterAbi } from './abis';
import type { UniversalRouterVersion } from './contracts';
import type { V4Hop, V4PoolKey } from './types';

export const UR_COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  V2_SWAP_EXACT_IN: 0x08,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  V4_SWAP: 0x10,
} as const;

export const V4_ACTION = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
} as const;

/** Recipient placeholders the router resolves at execution time. */
export const MSG_SENDER: Address = '0x0000000000000000000000000000000000000001';
export const ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002';
/** Native currency in router commands and v4 pool keys. */
export const NATIVE: Address = zeroAddress;
/** v4 SETTLE / TAKE amount meaning "the whole open delta". */
export const OPEN_DELTA = 0n;

const POOL_KEY = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const;

const PATH_KEY = {
  type: 'tuple[]',
  components: [
    { name: 'intermediateCurrency', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const;

function exactInSingleType(version: UniversalRouterVersion) {
  const base = [
    { name: 'poolKey', ...POOL_KEY },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
  ] as const;
  return version === '2.0'
    ? ({ type: 'tuple', components: [...base, { name: 'hookData', type: 'bytes' }] } as const)
    : ({ type: 'tuple', components: [...base, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }] } as const);
}

function exactInType(version: UniversalRouterVersion) {
  return version === '2.0'
    ? ({
        type: 'tuple',
        components: [
          { name: 'currencyIn', type: 'address' },
          { name: 'path', ...PATH_KEY },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
        ],
      } as const)
    : ({
        type: 'tuple',
        components: [
          { name: 'currencyIn', type: 'address' },
          { name: 'path', ...PATH_KEY },
          { name: 'minHopPriceX36', type: 'uint256[]' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
        ],
      } as const);
}

/** A v4 action program (the input of one V4_SWAP command). */
export class V4ActionPlan {
  private actions: number[] = [];
  private params: Hex[] = [];

  constructor(private readonly version: UniversalRouterVersion) {}

  swapExactIn(hops: V4Hop[], amountIn: bigint, amountOutMinimum: bigint): this {
    if (hops.length === 1) {
      const [hop] = hops;
      const zeroForOne = hop.currencyIn.toLowerCase() === hop.key.currency0.toLowerCase();
      const value = { poolKey: hop.key, zeroForOne, amountIn, amountOutMinimum, minHopPriceX36: 0n, hookData: '0x' as Hex };
      this.actions.push(V4_ACTION.SWAP_EXACT_IN_SINGLE);
      this.params.push(encodeAbiParameters([exactInSingleType(this.version)] as never, [value] as never));
      return this;
    }
    const path = hops.map((h) => ({ intermediateCurrency: h.currencyOut, fee: h.key.fee, tickSpacing: h.key.tickSpacing, hooks: h.key.hooks, hookData: '0x' as Hex }));
    const value = { currencyIn: hops[0].currencyIn, path, minHopPriceX36: [] as bigint[], amountIn, amountOutMinimum };
    this.actions.push(V4_ACTION.SWAP_EXACT_IN);
    this.params.push(encodeAbiParameters([exactInType(this.version)] as never, [value] as never));
    return this;
  }

  /** Pay the open debt of `currency`: from the router's balance (payerIsUser=false) or the user via Permit2. */
  settle(currency: Address, amount: bigint, payerIsUser: boolean): this {
    this.actions.push(V4_ACTION.SETTLE);
    this.params.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [currency, amount, payerIsUser]));
    return this;
  }

  settleAll(currency: Address, maxAmount: bigint): this {
    this.actions.push(V4_ACTION.SETTLE_ALL);
    this.params.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currency, maxAmount]));
    return this;
  }

  take(currency: Address, recipient: Address, amount: bigint): this {
    this.actions.push(V4_ACTION.TAKE);
    this.params.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [currency, recipient, amount]));
    return this;
  }

  takeAll(currency: Address, minAmount: bigint): this {
    this.actions.push(V4_ACTION.TAKE_ALL);
    this.params.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currency, minAmount]));
    return this;
  }

  encode(): Hex {
    const actions = concatHex(this.actions.map((a) => numberToHex(a, { size: 1 })));
    return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, this.params]);
  }
}

/** A Universal Router program: commands + inputs for execute(). */
export class RouterPlan {
  readonly commands: number[] = [];
  readonly inputs: Hex[] = [];

  constructor(readonly version: UniversalRouterVersion) {}

  private add(command: number, input: Hex): this {
    this.commands.push(command);
    this.inputs.push(input);
    return this;
  }

  wrapEth(recipient: Address, amount: bigint): this {
    return this.add(UR_COMMAND.WRAP_ETH, encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [recipient, amount]));
  }

  unwrapWeth(recipient: Address, amountMin: bigint): this {
    return this.add(UR_COMMAND.UNWRAP_WETH, encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [recipient, amountMin]));
  }

  /** Send a fixed amount of `token` (NATIVE = ETH) from the router's balance. */
  transfer(token: Address, recipient: Address, value: bigint): this {
    return this.add(UR_COMMAND.TRANSFER, encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [token, recipient, value]));
  }

  /** Send `bips` of the router's balance of `token`. */
  payPortion(token: Address, recipient: Address, bips: bigint): this {
    return this.add(UR_COMMAND.PAY_PORTION, encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [token, recipient, bips]));
  }

  /** Send the router's whole balance of `token`, reverting below amountMin. */
  sweep(token: Address, recipient: Address, amountMin: bigint): this {
    return this.add(UR_COMMAND.SWEEP, encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [token, recipient, amountMin]));
  }

  v4Swap(actions: V4ActionPlan): this {
    return this.add(UR_COMMAND.V4_SWAP, actions.encode());
  }

  v3SwapExactIn(recipient: Address, amountIn: bigint, amountOutMin: bigint, path: Hex, payerIsUser: boolean): this {
    const input =
      this.version === '2.0'
        ? encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }], [recipient, amountIn, amountOutMin, path, payerIsUser])
        : encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }], [recipient, amountIn, amountOutMin, path, payerIsUser, []]);
    return this.add(UR_COMMAND.V3_SWAP_EXACT_IN, input);
  }

  v2SwapExactIn(recipient: Address, amountIn: bigint, amountOutMin: bigint, path: Address[], payerIsUser: boolean): this {
    const input =
      this.version === '2.0'
        ? encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'bool' }], [recipient, amountIn, amountOutMin, path, payerIsUser])
        : encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'bool' }, { type: 'uint256[]' }], [recipient, amountIn, amountOutMin, path, payerIsUser, []]);
    return this.add(UR_COMMAND.V2_SWAP_EXACT_IN, input);
  }

  encodeExecute(deadline: bigint): Hex {
    const commands = concatHex(this.commands.map((c) => numberToHex(c, { size: 1 })));
    return encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: [commands, this.inputs, deadline] });
  }
}

/** Uniswap v3 path bytes for a single pool: tokenIn | fee | tokenOut. */
export function v3Path(tokenIn: Address, fee: number, tokenOut: Address): Hex {
  return encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut]);
}

export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

export function poolKeyFor(a: Address, b: Address, fee: number, tickSpacing: number, hooks: Address): V4PoolKey {
  const [currency0, currency1] = sortCurrencies(a, b);
  return { currency0, currency1, fee, tickSpacing, hooks };
}

/** Pool id = keccak256(abi.encode(PoolKey)). */
export function poolIdOf(key: V4PoolKey): Hex {
  return keccak256(encodeAbiParameters([POOL_KEY], [key]));
}
