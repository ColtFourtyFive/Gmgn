// Deposit detection for account wallets on one EVM chain.
//
//  - ERC-20 deposits: Transfer(from, to = an account wallet) logs, scanned from
//    the last processed block to the confirmed head in windows the RPC accepts
//    (chains.ts maxLogBlockRange), the wallets OR-ed into topic 2 in batches.
//    Transfers inside transactions the wallet itself sent (its own buys) are
//    not deposits and are skipped.
//  - native deposits: balance polling. Native only moves into an EOA through
//    plain or internal transfers, which no log records, so each poll compares
//    the wallet's balance with the last one corrected by the native the
//    platform knows the wallet moved since (trades, fees, gas, withdrawals:
//    reported through recordOwnDelta). An unexplained increase is a deposit.
//    When the wallet sent transactions the watcher was not told about (its
//    nonce moved without reported deltas) it re-baselines instead of guessing.
//
// The watcher keeps its cursor in `state()` / `restore()` so the orchestrator
// persists it with the durable store; deposits are idempotent by id
// (chain:tx:logIndex for ERC-20, chain:native:wallet:block for native).

import { formatUnits, getAddress, isAddressEqual, pad, type Address, type Hex, type PublicClient } from 'viem';
import type { WalletTransfer } from '@trenchscope/shared';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { TRANSFER_TOPIC } from '../exec/rpc';
import { erc20Abi } from '../exec/abis';

export interface WatchedWallet {
  accountId: string;
  address: Address;
}

export interface DepositWatcherState {
  /** Last block whose logs were processed. */
  lastBlock: string | null;
  /** address -> last balance (wei) and nonce seen. */
  native: Record<string, { balance: string; nonce: number; block: string }>;
}

export interface EvmDeposit {
  accountId: string;
  transfer: WalletTransfer;
}

export interface EvmDepositWatcherOptions {
  chain: EvmChainId;
  client: PublicClient;
  wallets: () => WatchedWallet[];
  /** Blocks behind the head before a deposit counts (reorg safety). */
  confirmations?: number;
  /** Wallets per log query (OR-ed topics). */
  walletsPerQuery?: number;
  /** ERC-20 tokens to report (default: all). Spam airdrops can be filtered here. */
  tokenFilter?: (token: Address) => boolean;
  now?: () => number;
}

const DEFAULT_CONFIRMATIONS: Record<EvmChainId, number> = { base: 1, robinhood: 1, bsc: 3, eth: 3 };
/** First poll looks back this many blocks at most. */
const FIRST_LOOKBACK_BLOCKS = 200n;

export class EvmDepositWatcher {
  private lastBlock: bigint | null = null;
  private readonly native = new Map<string, { balance: bigint; nonce: number; block: bigint }>();
  private readonly ownDeltas = new Map<string, bigint>();
  private readonly tokenMeta = new Map<string, { symbol: string; decimals: number }>();
  private readonly confirmations: number;
  private readonly now: () => number;

  constructor(private readonly opts: EvmDepositWatcherOptions) {
    this.confirmations = opts.confirmations ?? DEFAULT_CONFIRMATIONS[opts.chain];
    this.now = opts.now ?? Date.now;
  }

  state(): DepositWatcherState {
    const native: DepositWatcherState['native'] = {};
    for (const [a, v] of this.native) native[a] = { balance: v.balance.toString(), nonce: v.nonce, block: v.block.toString() };
    return { lastBlock: this.lastBlock === null ? null : this.lastBlock.toString(), native };
  }

  restore(s: DepositWatcherState | null | undefined): void {
    if (!s) return;
    this.lastBlock = s.lastBlock === null ? null : BigInt(s.lastBlock);
    this.native.clear();
    for (const [a, v] of Object.entries(s.native)) this.native.set(a, { balance: BigInt(v.balance), nonce: v.nonce, block: BigInt(v.block) });
  }

  /**
   * Native the platform moved for the wallet since the last poll (negative =
   * spent: buys, fees, gas, withdrawals; positive = sell proceeds). Lets the
   * next poll tell deposits from the wallet's own activity.
   */
  recordOwnDelta(address: Address, delta: bigint): void {
    const key = address.toLowerCase();
    this.ownDeltas.set(key, (this.ownDeltas.get(key) ?? 0n) + delta);
  }

  /** One polling round: returns new deposits (ERC-20 and native). */
  async poll(): Promise<EvmDeposit[]> {
    const wallets = this.opts.wallets();
    if (wallets.length === 0) return [];
    const head = await this.opts.client.getBlockNumber({ cacheTime: 0 });
    const safe = head - BigInt(Math.max(this.confirmations - 1, 0));
    const out: EvmDeposit[] = [];
    out.push(...(await this.pollTokens(wallets, safe)));
    out.push(...(await this.pollNative(wallets, safe)));
    return out;
  }

  private async meta(token: Address): Promise<{ symbol: string; decimals: number }> {
    const key = token.toLowerCase();
    const cached = this.tokenMeta.get(key);
    if (cached) return cached;
    const [symbol, decimals] = await Promise.all([
      this.opts.client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }).catch(() => '?'),
      this.opts.client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
    ]);
    const m = { symbol, decimals: Number(decimals) };
    this.tokenMeta.set(key, m);
    return m;
  }

  private async pollTokens(wallets: WatchedWallet[], safe: bigint): Promise<EvmDeposit[]> {
    const from = this.lastBlock === null ? safe - FIRST_LOOKBACK_BLOCKS + 1n : this.lastBlock + 1n;
    if (from > safe) return [];
    const byAddress = new Map(wallets.map((w) => [w.address.toLowerCase(), w]));
    const range = BigInt(EVM_CHAINS[this.opts.chain].maxLogBlockRange);
    const batch = this.opts.walletsPerQuery ?? 50;
    const out: EvmDeposit[] = [];
    const senders = new Map<string, Address>();
    for (let start = from; start <= safe; start += range) {
      const end = start + range - 1n > safe ? safe : start + range - 1n;
      for (let i = 0; i < wallets.length; i += batch) {
        const topics = wallets.slice(i, i + batch).map((w) => pad(w.address));
        const logs = await this.opts.client.request({
          method: 'eth_getLogs',
          params: [{ fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}`, topics: [TRANSFER_TOPIC, null, topics] }],
        } as never) as { address: Address; topics: Hex[]; data: Hex; transactionHash: Hex; logIndex: Hex; blockNumber: Hex }[];
        for (const l of logs) {
          if (l.topics.length < 3) continue; // ERC-721 Transfer has 4 topics and no data; ERC-20 has 3
          if (l.topics.length !== 3) continue;
          const to = getAddress(`0x${l.topics[2].slice(26)}`);
          const w = byAddress.get(to.toLowerCase());
          if (!w) continue;
          const token = getAddress(l.address);
          if (this.opts.tokenFilter && !this.opts.tokenFilter(token)) continue;
          // skip tokens arriving through the wallet's own transactions (its buys)
          let sender = senders.get(l.transactionHash);
          if (!sender) {
            sender = (await this.opts.client.getTransaction({ hash: l.transactionHash })).from;
            senders.set(l.transactionHash, sender);
          }
          if (isAddressEqual(sender, w.address)) continue;
          const value = BigInt(l.data);
          if (value === 0n) continue;
          const m = await this.meta(token);
          const at = this.now();
          out.push({
            accountId: w.accountId,
            transfer: {
              id: `${this.opts.chain}:${l.transactionHash}:${BigInt(l.logIndex)}`,
              chain: this.opts.chain,
              direction: 'deposit',
              mint: token,
              symbol: m.symbol,
              amount: Number(formatUnits(value, m.decimals)),
              counterparty: getAddress(`0x${l.topics[1].slice(26)}`),
              signature: l.transactionHash,
              status: 'confirmed',
              networkFee: 0,
              createdAt: at,
              confirmedAt: at,
            },
          });
        }
      }
    }
    this.lastBlock = safe;
    return out;
  }

  private async pollNative(wallets: WatchedWallet[], safe: bigint): Promise<EvmDeposit[]> {
    const out: EvmDeposit[] = [];
    const symbol = EVM_CHAINS[this.opts.chain].viem.nativeCurrency.symbol;
    for (const w of wallets) {
      const key = w.address.toLowerCase();
      const [balance, nonce] = await Promise.all([
        this.opts.client.getBalance({ address: w.address, blockNumber: safe }),
        this.opts.client.getTransactionCount({ address: w.address, blockNumber: safe }),
      ]);
      const prev = this.native.get(key);
      const own = this.ownDeltas.get(key);
      this.ownDeltas.delete(key);
      this.native.set(key, { balance, nonce, block: safe });
      if (!prev || safe <= prev.block) continue;
      // the wallet sent transactions nobody reported: its balance change is not attributable
      if (nonce !== prev.nonce && own === undefined) continue;
      const unexplained = balance - (prev.balance + (own ?? 0n));
      if (unexplained <= 0n) continue;
      const at = this.now();
      out.push({
        accountId: w.accountId,
        transfer: {
          id: `${this.opts.chain}:native:${key}:${safe}`,
          chain: this.opts.chain,
          direction: 'deposit',
          mint: null,
          symbol,
          amount: Number(formatUnits(unexplained, 18)),
          counterparty: null,
          signature: null,
          status: 'confirmed',
          networkFee: 0,
          createdAt: at,
          confirmedAt: at,
        },
      });
    }
    return out;
  }
}
