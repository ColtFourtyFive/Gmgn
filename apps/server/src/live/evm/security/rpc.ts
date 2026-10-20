// Raw JSON-RPC helpers. The checker talks to the node through client.request
// (eth_call / eth_getCode / eth_getStorageAt) and encodes Multicall3 batches
// itself, so the requests it sends depend only on its inputs: viem's automatic
// multicall batching would regroup calls by timing, which makes recorded
// fixtures unreplayable.

import { decodeFunctionResult, encodeFunctionData, numberToHex, parseAbi, type Address, type Hex, type PublicClient } from 'viem';

export type RpcClient = Pick<PublicClient, 'request'>;

export interface StateOverride {
  code?: Hex;
  balance?: bigint;
  /** slot -> 32-byte value */
  stateDiff?: Record<Hex, Hex>;
}

export interface CallRequest {
  to: Address;
  data: Hex;
  from?: Address;
  gas?: bigint;
  overrides?: Record<Address, StateOverride>;
}

/** Revert or RPC error from eth_call, with the revert data when the node returned it. */
export class CallError extends Error {
  constructor(
    message: string,
    public data: Hex | null,
  ) {
    super(message);
    this.name = 'CallError';
  }
}

function rpcOverrides(o: Record<Address, StateOverride>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [addr, s] of Object.entries(o)) {
    const e: Record<string, unknown> = {};
    if (s.code) e.code = s.code;
    if (s.balance !== undefined) e.balance = numberToHex(s.balance);
    if (s.stateDiff) e.stateDiff = s.stateDiff;
    out[addr.toLowerCase()] = e;
  }
  return out;
}

function revertData(err: unknown): Hex | null {
  // viem wraps RPC errors; the revert payload sits on the innermost cause's `data`.
  let e: unknown = err;
  for (let i = 0; i < 6 && e; i++) {
    const d = (e as { data?: unknown }).data;
    if (typeof d === 'string' && d.startsWith('0x')) return d as Hex;
    if (d && typeof d === 'object' && typeof (d as { data?: unknown }).data === 'string') return (d as { data: Hex }).data;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

export async function ethCall(client: RpcClient, req: CallRequest): Promise<Hex> {
  const tx: Record<string, string> = { to: req.to.toLowerCase(), data: req.data };
  if (req.from) tx.from = req.from.toLowerCase();
  if (req.gas !== undefined) tx.gas = numberToHex(req.gas);
  const params: unknown[] = [tx, 'latest'];
  if (req.overrides) params.push(rpcOverrides(req.overrides));
  try {
    return (await client.request({ method: 'eth_call', params } as never)) as Hex;
  } catch (err) {
    throw new CallError((err as Error).message.split('\n')[0], revertData(err));
  }
}

export async function getCode(client: RpcClient, address: Address): Promise<Hex> {
  const code = (await client.request({ method: 'eth_getCode', params: [address.toLowerCase(), 'latest'] } as never)) as Hex | null;
  return code ?? '0x';
}

export async function getStorageAt(client: RpcClient, address: Address, slot: Hex): Promise<Hex> {
  return (await client.request({ method: 'eth_getStorageAt', params: [address.toLowerCase(), slot, 'latest'] } as never)) as Hex;
}

const multicall3Abi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
]);

export interface MulticallItem {
  target: Address;
  data: Hex;
}

export interface MulticallResult {
  success: boolean;
  data: Hex;
}

/** Multicall3 aggregate3 with allowFailure on every call, in chunks of `chunk`. */
export async function multicall(client: RpcClient, multicall3: Address, items: MulticallItem[], chunk = 200): Promise<MulticallResult[]> {
  const out: MulticallResult[] = [];
  for (let i = 0; i < items.length; i += chunk) {
    const slice = items.slice(i, i + chunk);
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [slice.map((c) => ({ target: c.target, allowFailure: true, callData: c.data }))],
    });
    const raw = await ethCall(client, { to: multicall3, data });
    const res = decodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', data: raw }) as readonly { success: boolean; returnData: Hex }[];
    for (const r of res) out.push({ success: r.success && r.returnData !== '0x', data: r.returnData });
  }
  return out;
}
