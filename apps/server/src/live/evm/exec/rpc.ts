// Thin RPC helpers over a viem PublicClient: eth_simulateV1 (multi-call
// simulation with state overrides and traced native transfers), token
// metadata and balances. Every EVM chain's public RPC we use supports
// eth_simulateV1 with traceTransfers (checked on Base, Robinhood Chain, BNB
// Chain and Ethereum); traced native transfers come back as ERC-20 style
// Transfer logs from 0xeeee...eeee.

import { decodeFunctionResult, encodeFunctionData, numberToHex, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, type ContractFunctionReturnType, type Hex, type PublicClient } from 'viem';
import { SIMULATED_NATIVE_LOG_ADDRESS, erc20Abi } from './abis';
import { describeRevert, errorText } from './errors';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const;

export interface SimCall {
  from: Address;
  to: Address;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
}

export interface SimLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

export interface SimCallResult {
  ok: boolean;
  gasUsed: bigint;
  returnData: Hex;
  logs: SimLog[];
  error: string | null;
}

/** eth_simulateV1 state override: native balance and raw storage slots per account. */
export type SimStateOverrides = Record<Address, { balance?: bigint; stateDiff?: Record<Hex, Hex> }>;

interface RawSimCall {
  status: Hex;
  gasUsed: Hex;
  returnData: Hex;
  logs?: { address: Address; topics: Hex[]; data: Hex }[];
  error?: { message?: string; data?: Hex; code?: number };
}

const TRANSIENT_SIM = /global signer not initialized|timeout|rate limit|too many|429|503|502|header not found/i;

/** Run calls in order in one simulated block. Throws when the RPC itself fails (not when a call reverts). */
export async function simulateCalls(client: PublicClient, calls: SimCall[], overrides: SimStateOverrides = {}, retries = 2): Promise<SimCallResult[]> {
  const stateOverrides: Record<string, { balance?: Hex; stateDiff?: Record<Hex, Hex> }> = {};
  for (const [addr, o] of Object.entries(overrides)) {
    stateOverrides[addr.toLowerCase()] = {
      ...(o.balance !== undefined ? { balance: numberToHex(o.balance) } : {}),
      ...(o.stateDiff ? { stateDiff: o.stateDiff } : {}),
    };
  }
  const params = [
    {
      blockStateCalls: [
        {
          stateOverrides,
          calls: calls.map((c) => ({
            from: c.from,
            to: c.to,
            ...(c.data ? { data: c.data } : {}),
            ...(c.value !== undefined && c.value > 0n ? { value: numberToHex(c.value) } : {}),
            ...(c.gas !== undefined ? { gas: numberToHex(c.gas) } : {}),
          })),
        },
      ],
      traceTransfers: true,
      validation: false,
    },
    'latest',
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = (await client.request({ method: 'eth_simulateV1', params } as never)) as { calls: RawSimCall[] }[];
      return res[0].calls.map((c) => ({
        ok: BigInt(c.status) === 1n,
        gasUsed: BigInt(c.gasUsed),
        returnData: c.returnData,
        logs: (c.logs ?? []).map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
        error: BigInt(c.status) === 1n ? null : describeRevert(c.error?.message ?? 'execution reverted', c.error?.data ?? c.returnData),
      }));
    } catch (err) {
      lastErr = err;
      if (!TRANSIENT_SIM.test(errorText(err))) break;
    }
  }
  throw lastErr;
}

const addrTopic = (t: Hex | undefined): string => (t ? `0x${t.slice(26)}`.toLowerCase() : '');

/** Net amount of `token` (or native, via traced transfers) that reached `who` across the logs. */
export function netTransfer(logs: SimLog[], token: Address | 'native', who: Address): bigint {
  const asset = token === 'native' ? SIMULATED_NATIVE_LOG_ADDRESS : token.toLowerCase();
  const me = who.toLowerCase();
  let net = 0n;
  for (const l of logs) {
    if (l.address.toLowerCase() !== asset || l.topics[0] !== TRANSFER_TOPIC || l.topics.length < 3) continue;
    const value = BigInt(l.data);
    if (addrTopic(l.topics[2]) === me) net += value;
    if (addrTopic(l.topics[1]) === me) net -= value;
  }
  return net;
}

/** Sum of native transfers into `who` (traced), ignoring what it sent. */
export function nativeInto(logs: SimLog[], who: Address): bigint {
  const me = who.toLowerCase();
  let sum = 0n;
  for (const l of logs) {
    if (l.address.toLowerCase() === SIMULATED_NATIVE_LOG_ADDRESS && l.topics[0] === TRANSFER_TOPIC && addrTopic(l.topics[2]) === me) sum += BigInt(l.data);
  }
  return sum;
}

export interface TokenInfo {
  address: Address;
  decimals: number;
  symbol: string;
}

export async function tokenInfo(client: PublicClient, token: Address): Promise<TokenInfo> {
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }).catch(() => '?'),
  ]);
  return { address: token, decimals: Number(decimals), symbol };
}

export function tokenBalance(client: PublicClient, token: Address, owner: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
}

export function tokenAllowance(client: PublicClient, token: Address, owner: Address, spender: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
}

export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
}

export function decodeUint(data: Hex): bigint {
  return decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data });
}

/**
 * eth_call a non-view function (quoters that revert-return or write) and decode
 * its result: simulateContract without its heavy generic inference.
 */
export async function staticCall<const abi extends Abi, name extends ContractFunctionName<abi>>(
  client: PublicClient,
  address: Address,
  abi: abi,
  functionName: name,
  args: ContractFunctionArgs<abi, 'nonpayable' | 'payable' | 'view' | 'pure', name>,
): Promise<ContractFunctionReturnType<abi, 'nonpayable' | 'payable' | 'view' | 'pure', name>> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const res = await client.call({ to: address, data });
  if (!res.data) throw new Error(`${String(functionName)} returned no data`);
  return decodeFunctionResult({ abi, functionName, data: res.data } as never) as ContractFunctionReturnType<abi, 'nonpayable' | 'payable' | 'view' | 'pure', name>;
}
