// An in-memory EVM node for engine tests: nonces, native balances per block,
// ERC-20 balances/allowances, instant mining of raw transactions, and hooks to
// inject send errors and reverts. Speaks just enough JSON-RPC for viem.

import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, keccak256, numberToHex, parseTransaction, recoverTransactionAddress, type Address, type Chain, type Hex, type PublicClient } from 'viem';
import { erc20Abi } from '../../../../src/live/evm/exec/abis';

export interface MinedTx {
  hash: Hex;
  from: Address;
  to: Address | null;
  nonce: number;
  value: bigint;
  data: Hex;
  gas: bigint;
  maxFeePerGas: bigint;
  block: bigint;
  status: 'success' | 'reverted';
}

export interface FakeChainOptions {
  chain: Chain;
  baseFee?: bigint;
  /** Per-call error for eth_sendRawTransaction (return a message to reject). */
  sendHook?: (tx: MinedTx, attempt: number) => string | null;
  /** Whether a mined transaction reverts. */
  revertHook?: (tx: MinedTx) => boolean;
  /** Logs a mined transaction emits. */
  logsHook?: (tx: MinedTx) => { address: Address; topics: Hex[]; data: Hex }[];
  /** eth_simulateV1 result per call (default: success, 100k gas, no logs). */
  simulateHook?: (call: { from: Address; to: Address; data?: Hex; value?: Hex }, index: number) => { ok: boolean; gasUsed?: bigint; logs?: unknown[]; error?: string };
  /** Native wei an address received from others (internal transfers) when its tx was mined. */
  creditHook?: (tx: MinedTx) => { to: Address; amount: bigint }[];
}

const GAS_USED = 100_000n;

export class FakeChain {
  head = 1000n;
  readonly mined: MinedTx[] = [];
  readonly sendAttempts: MinedTx[] = [];
  /** address -> mined nonce; pendingLag makes 'pending' answers stale on purpose. */
  readonly nonces = new Map<string, number>();
  readonly pendingLag = new Map<string, number>();
  /** address -> balance history: [block, balance] ascending. */
  private readonly balances = new Map<string, [bigint, bigint][]>();
  readonly tokenBalances = new Map<string, bigint>();
  readonly allowances = new Map<string, bigint>();
  /** Logs served by eth_getLogs (deposit tests). */
  readonly logs: { block: bigint; address: Address; topics: Hex[]; data: Hex; txHash: Hex }[] = [];
  private attempt = 0;

  /** A transaction sent by someone else (answers eth_getTransactionByHash), crediting `to` natively if value > 0. */
  external(hash: Hex, from: Address, to: Address, value: bigint, block = this.head): void {
    this.mined.push({ hash, from, to, nonce: 0, value, data: '0x', gas: 21_000n, maxFeePerGas: 0n, block, status: 'success' });
    if (value > 0n) this.moveBalance(to, value, block);
  }

  constructor(private readonly opts: FakeChainOptions) {}

  setBalance(address: Address, wei: bigint): void {
    this.balances.set(address.toLowerCase(), [[this.head, wei]]);
  }

  balanceAt(address: Address, block: bigint): bigint {
    const hist = this.balances.get(address.toLowerCase()) ?? [];
    let v = 0n;
    for (const [b, bal] of hist) if (b <= block) v = bal;
    return v;
  }

  private moveBalance(address: Address, delta: bigint, block: bigint): void {
    const key = address.toLowerCase();
    const hist = this.balances.get(key) ?? [];
    const cur = this.balanceAt(address, block);
    hist.push([block, cur + delta]);
    this.balances.set(key, hist);
  }

  get baseFee(): bigint {
    return this.opts.baseFee ?? 5_000_000n;
  }

  client(): PublicClient {
    return createPublicClient({ chain: this.opts.chain, transport: custom({ request: ({ method, params }) => this.request(method, (params ?? []) as unknown[]) }), pollingInterval: 5 });
  }

  private block(n: bigint) {
    return {
      number: numberToHex(n),
      hash: keccak256(numberToHex(n, { size: 32 })),
      parentHash: keccak256(numberToHex(n - 1n, { size: 32 })),
      timestamp: numberToHex(1_790_000_000n + n),
      baseFeePerGas: numberToHex(this.baseFee),
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      miner: '0x0000000000000000000000000000000000000000',
      transactions: this.mined.filter((t) => t.block === n).map((t) => t.hash),
      difficulty: '0x0',
      extraData: '0x',
      logsBloom: `0x${'00'.repeat(256)}`,
      nonce: '0x0000000000000000',
      receiptsRoot: keccak256('0x01'),
      sha3Uncles: keccak256('0x02'),
      size: '0x1',
      stateRoot: keccak256('0x03'),
      totalDifficulty: '0x0',
      transactionsRoot: keccak256('0x04'),
      uncles: [],
      mixHash: keccak256('0x05'),
    };
  }

  private receipt(t: MinedTx) {
    return {
      blockHash: keccak256(numberToHex(t.block, { size: 32 })),
      blockNumber: numberToHex(t.block),
      contractAddress: null,
      cumulativeGasUsed: numberToHex(GAS_USED),
      effectiveGasPrice: numberToHex(this.baseFee),
      from: t.from,
      gasUsed: numberToHex(GAS_USED),
      logs: (this.opts.logsHook?.(t) ?? []).map((l, i) => ({ ...l, blockNumber: numberToHex(t.block), transactionHash: t.hash, logIndex: numberToHex(i), transactionIndex: '0x0', blockHash: keccak256(numberToHex(t.block, { size: 32 })), removed: false })),
      logsBloom: `0x${'00'.repeat(256)}`,
      status: t.status === 'success' ? '0x1' : '0x0',
      to: t.to,
      transactionHash: t.hash,
      transactionIndex: '0x0',
      type: '0x2',
    };
  }

  private txJson(t: MinedTx) {
    return {
      blockHash: keccak256(numberToHex(t.block, { size: 32 })),
      blockNumber: numberToHex(t.block),
      from: t.from,
      gas: numberToHex(t.gas),
      hash: t.hash,
      input: t.data,
      nonce: numberToHex(t.nonce),
      to: t.to,
      transactionIndex: '0x0',
      value: numberToHex(t.value),
      type: '0x2',
      maxFeePerGas: numberToHex(t.maxFeePerGas),
      maxPriorityFeePerGas: '0x0',
      chainId: numberToHex(this.opts.chain.id),
      accessList: [],
      v: '0x0',
      r: '0x1',
      s: '0x1',
      yParity: '0x0',
    };
  }

  async request(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case 'eth_chainId':
        return numberToHex(this.opts.chain.id);
      case 'eth_blockNumber':
        return numberToHex(this.head);
      case 'eth_getBlockByNumber': {
        const tag = params[0] as string;
        return this.block(tag === 'latest' || tag === 'pending' ? this.head : BigInt(tag));
      }
      case 'eth_feeHistory':
        return { oldestBlock: numberToHex(this.head - 4n), baseFeePerGas: Array(6).fill(numberToHex(this.baseFee)), gasUsedRatio: Array(5).fill(0.5), reward: Array(5).fill([numberToHex(1_000_000n)]) };
      case 'eth_maxPriorityFeePerGas':
        return numberToHex(1_000_000n);
      case 'eth_getTransactionCount': {
        const [addr, tag] = params as [string, string];
        const mined = this.nonces.get(addr.toLowerCase()) ?? 0;
        const lag = this.pendingLag.get(addr.toLowerCase()) ?? 0;
        if (tag === 'pending' && lag > 0) {
          this.pendingLag.set(addr.toLowerCase(), lag - 1);
          return numberToHex(Math.max(0, mined - 2));
        }
        return numberToHex(mined);
      }
      case 'eth_getBalance': {
        const [addr, tag] = params as [Address, string];
        return numberToHex(this.balanceAt(addr, tag === 'latest' || tag === 'pending' ? this.head : BigInt(tag)));
      }
      case 'eth_call': {
        const [call] = params as [{ to: Address; data: Hex }];
        const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
        if (decoded.functionName === 'balanceOf') return numberToHex(this.tokenBalances.get(`${call.to}:${decoded.args[0]}`.toLowerCase()) ?? 0n, { size: 32 });
        if (decoded.functionName === 'allowance') return numberToHex(this.allowances.get(`${call.to}:${decoded.args[0]}:${decoded.args[1]}`.toLowerCase()) ?? 0n, { size: 32 });
        if (decoded.functionName === 'decimals') return numberToHex(18, { size: 32 });
        if (decoded.functionName === 'symbol') return encodeFunctionResult({ abi: erc20Abi, functionName: 'symbol', result: 'TKN' });
        throw new Error(`fake eth_call: ${decoded.functionName}`);
      }
      case 'eth_estimateGas':
        return numberToHex(21_000n);
      case 'eth_simulateV1': {
        const [{ blockStateCalls }] = params as [{ blockStateCalls: { calls: { from: Address; to: Address; data?: Hex; value?: Hex }[] }[] }];
        return [
          {
            ...this.block(this.head + 1n),
            calls: blockStateCalls[0].calls.map((c, i) => {
              const r = this.opts.simulateHook?.(c, i) ?? { ok: true };
              return { status: r.ok ? '0x1' : '0x0', gasUsed: numberToHex(r.gasUsed ?? GAS_USED), returnData: '0x', logs: r.logs ?? [], ...(r.ok ? {} : { error: { code: 3, message: r.error ?? 'execution reverted' } }) };
            }),
          },
        ];
      }
      case 'eth_sendRawTransaction': {
        const raw = params[0] as Hex;
        const p = parseTransaction(raw);
        const from = await recoverTransactionAddress({ serializedTransaction: raw as never });
        const t: MinedTx = { hash: keccak256(raw), from, to: p.to ?? null, nonce: p.nonce ?? 0, value: p.value ?? 0n, data: p.data ?? '0x', gas: p.gas ?? 0n, maxFeePerGas: p.maxFeePerGas ?? 0n, block: this.head + 1n, status: 'success' };
        this.sendAttempts.push(t);
        const err = this.opts.sendHook?.(t, this.attempt++);
        if (err) throw Object.assign(new Error(err), { code: -32000 });
        const expected = this.nonces.get(from.toLowerCase()) ?? 0;
        if (t.nonce < expected) throw Object.assign(new Error('nonce too low'), { code: -32000 });
        if (t.nonce > expected) throw Object.assign(new Error(`nonce gap: expected ${expected}`), { code: -32000 });
        if (this.opts.revertHook?.(t)) t.status = 'reverted';
        this.head += 1n;
        this.nonces.set(from.toLowerCase(), expected + 1);
        this.moveBalance(from, -(t.status === 'success' ? t.value : 0n) - GAS_USED * this.baseFee, this.head);
        if (t.status === 'success') for (const c of this.opts.creditHook?.(t) ?? []) this.moveBalance(c.to, c.amount, this.head);
        this.mined.push(t);
        return t.hash;
      }
      case 'eth_getTransactionReceipt': {
        const t = this.mined.find((m) => m.hash === params[0]);
        return t ? this.receipt(t) : null;
      }
      case 'eth_getTransactionByHash': {
        const t = this.mined.find((m) => m.hash === params[0]);
        return t ? this.txJson(t) : null;
      }
      case 'eth_getLogs': {
        const [f] = params as [{ fromBlock: Hex; toBlock: Hex; topics?: (Hex | Hex[] | null)[] }];
        const from = BigInt(f.fromBlock);
        const to = BigInt(f.toBlock);
        const match = (want: Hex | Hex[] | null | undefined, have: Hex | undefined) =>
          want === null || want === undefined || (Array.isArray(want) ? want.some((w) => w.toLowerCase() === have?.toLowerCase()) : want.toLowerCase() === have?.toLowerCase());
        return this.logs
          .filter((l) => l.block >= from && l.block <= to && (f.topics ?? []).every((t, i) => match(t, l.topics[i])))
          .map((l, i) => ({ address: l.address, topics: l.topics, data: l.data, blockNumber: numberToHex(l.block), transactionHash: l.txHash, logIndex: numberToHex(i), transactionIndex: '0x0', blockHash: keccak256(numberToHex(l.block, { size: 32 })), removed: false }));
      }
      default:
        throw new Error(`fake chain: unsupported ${method}`);
    }
  }
}
