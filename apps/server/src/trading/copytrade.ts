// Copy trading: mirror a target wallet's buys (fixed amount or a ratio of the
// target's size, capped per token) and, in mirror mode, sell the same share
// of the position whenever the target sells. Copy sells only touch tokens the
// task itself bought, like GMGN's Copy Sell. A task that keeps failing (e.g.
// the wallet ran dry) pauses itself after COPY_AUTO_PAUSE_FAILURES in a row.

import { COPY_AUTO_PAUSE_FAILURES, shortAddress, type CopyTradeTask, type SwapReceipt, type Trade } from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState, WalletState } from '../sim/world';
import { badRequest, balanceOf, describeFill, normalizeAddress, notFound, parse, type Jobs } from './common';
import type { Executor } from './execution';
import { copyTaskSchema, type CopyTaskInput } from './schemas';

const MAX_COPY_TASKS = 20;
/** Copies smaller than this (native) are skipped. */
const MIN_COPY_NATIVE = 1e-6;

interface CopyRecord {
  accountId: string;
  task: CopyTradeTask;
  /** Tokens bought by this task and not yet sold by it. */
  holdings: Map<string, number>;
  /** Native trade size this task has committed per token (maxPerToken). */
  spent: Map<string, number>;
}

export interface StoredCopyTask {
  accountId: string;
  task: CopyTradeTask;
  holdings: [string, number][];
  spent: [string, number][];
}

const targetKey = (chain: string, address: string) => `${chain}:${address}`;

export class CopyTrader {
  private readonly records = new Map<string, CopyRecord>();
  private readonly byTarget = new Map<string, Set<CopyRecord>>();

  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
    private readonly jobs: Jobs,
  ) {}

  install(): void {
    this.ctx.world.on('trade', (trade, token, wallet) => this.onTrade(trade, token, wallet));
  }

  list(accountId: string): CopyTradeTask[] {
    return [...this.records.values()].filter((r) => r.accountId === accountId).map((r) => structuredClone(r.task));
  }

  create(accountId: string, input: CopyTaskInput): CopyTradeTask {
    if (this.countFor(accountId) >= MAX_COPY_TASKS) throw badRequest(`at most ${MAX_COPY_TASKS} copy-trade tasks`, 'limit_reached');
    const task: CopyTradeTask = {
      ...this.resolve(accountId, input),
      id: this.ctx.world.nextId('copy'),
      createdAt: this.ctx.world.now,
      stats: { buys: 0, sells: 0, spentNative: 0, receivedNative: 0, lastCopiedAt: null },
      consecutiveFailures: 0,
    };
    this.add({ accountId, task, holdings: new Map(), spent: new Map() });
    return structuredClone(task);
  }

  update(accountId: string, id: string, patch: Record<string, unknown>): CopyTradeTask {
    const record = this.owned(accountId, id);
    const { task } = record;
    const resolved = this.resolve(accountId, parse(copyTaskSchema, { ...task, ...patch, chain: task.chain }));
    // Re-enabling a (possibly auto-paused) task starts its failure streak over.
    if (resolved.enabled && !task.enabled) task.consecutiveFailures = 0;
    this.unindex(record);
    Object.assign(task, resolved);
    this.index(record);
    return structuredClone(task);
  }

  remove(accountId: string, id: string): void {
    const record = this.owned(accountId, id);
    this.unindex(record);
    this.records.delete(id);
  }

  /** Validated input -> task fields: the target must be another existing wallet on the chain. */
  private resolve(accountId: string, input: CopyTaskInput): Omit<CopyTradeTask, 'id' | 'createdAt' | 'stats'> {
    const target = normalizeAddress(input.target);
    const wallet = this.ctx.world.getWallet(target);
    if (!wallet || wallet.chain !== input.chain) throw notFound('wallet');
    if (wallet.accountId === accountId) throw badRequest('you cannot copy your own wallet');
    return {
      ...input,
      target,
      blacklist: input.blacklist.map(normalizeAddress),
      presetId: input.presetId ?? this.ctx.accounts.getSettings(accountId).trade[input.chain].activeBuyPreset,
    };
  }

  private countFor(accountId: string): number {
    let n = 0;
    for (const r of this.records.values()) if (r.accountId === accountId) n++;
    return n;
  }

  private owned(accountId: string, id: string): CopyRecord {
    const record = this.records.get(id);
    if (!record || record.accountId !== accountId) throw notFound('copy-trade task');
    return record;
  }

  private add(record: CopyRecord): void {
    this.records.set(record.task.id, record);
    this.index(record);
  }

  private index(record: CopyRecord): void {
    const key = targetKey(record.task.chain, record.task.target);
    let set = this.byTarget.get(key);
    if (!set) this.byTarget.set(key, (set = new Set()));
    set.add(record);
  }

  private unindex(record: CopyRecord): void {
    const key = targetKey(record.task.chain, record.task.target);
    const set = this.byTarget.get(key);
    set?.delete(record);
    if (set?.size === 0) this.byTarget.delete(key);
  }

  // ---------------------------------------------------------------------------
  // Mirroring
  // ---------------------------------------------------------------------------

  private onTrade(trade: Trade, token: TokenState, target: WalletState): void {
    if (this.ctx.engine.warming) return;
    const records = this.byTarget.get(targetKey(trade.chain, trade.wallet));
    if (!records) return;
    for (const record of records) {
      if (!record.task.enabled) continue;
      if (trade.side === 'buy') this.copyBuy(record, trade, token, target);
      else if (record.task.sellMode === 'mirror') this.copySell(record, trade, token, target);
    }
  }

  private copyBuy(record: CopyRecord, trade: Trade, token: TokenState, target: WalletState): void {
    const { world } = this.ctx;
    const { task } = record;
    if (task.blacklist.includes(token.address)) return;
    const mcap = world.marketCapUsd(token);
    if (task.minMarketCapUsd !== null && mcap < task.minMarketCapUsd) return;
    if (task.maxMarketCapUsd !== null && mcap > task.maxMarketCapUsd) return;
    if (task.minLiquidityUsd !== null && world.liquidityUsd(token) < task.minLiquidityUsd) return;
    if (task.firstBuyOnly && (target.positions.get(token.address)?.buys ?? 0) > 1) return;

    const spent = record.spent.get(token.address) ?? 0;
    const wanted = task.buyMode === 'fixed' ? task.buyAmount : trade.nativeAmount * task.buyRatio;
    const amount = Math.min(wanted, task.maxPerToken - spent);
    if (!(amount > MIN_COPY_NATIVE)) return;
    // Reserve the budget now so rapid target buys cannot overshoot maxPerToken.
    record.spent.set(token.address, spent + amount);

    const job = this.executor
      .submit(record.accountId, { chain: token.chain, token: token.address, side: 'buy', amount, amountKind: 'native', presetId: task.presetId, strategy: task.strategy }, 'copytrade')
      .then(({ receipt }) => {
        record.spent.set(token.address, Math.max(0, (record.spent.get(token.address) ?? 0) - amount + (receipt.ok ? receipt.nativeAmount : 0)));
        if (receipt.ok) {
          record.holdings.set(token.address, (record.holdings.get(token.address) ?? 0) + receipt.tokenAmount);
          task.stats.buys++;
          task.stats.spentNative += receipt.nativeAmount + receipt.platformFeeNative + receipt.networkFeeNative;
          task.stats.lastCopiedAt = world.now;
        }
        this.notify(record, token, trade, receipt);
      });
    this.jobs.spawn(`copy buy ${task.id}`, job);
  }

  private copySell(record: CopyRecord, trade: Trade, token: TokenState, target: WalletState): void {
    const { task } = record;
    // The user may have sold some of it by hand; never sell more than is still held.
    const held = Math.min(record.holdings.get(token.address) ?? 0, balanceOf(this.ctx.accounts.walletFor(record.accountId, task.chain), token));
    if (held <= 0) {
      record.holdings.delete(token.address);
      return;
    }
    const targetLeft = balanceOf(target, token);
    const amount = targetLeft <= 0 ? held : (held * trade.tokenAmount) / (targetLeft + trade.tokenAmount);
    record.holdings.set(token.address, held - amount);

    const job = this.executor
      .submit(record.accountId, { chain: token.chain, token: token.address, side: 'sell', amount, amountKind: 'tokens', presetId: task.presetId }, 'copytrade')
      .then(({ receipt }) => {
        const left = (record.holdings.get(token.address) ?? 0) + amount - (receipt.ok ? receipt.tokenAmount : 0);
        if (left > 0) record.holdings.set(token.address, left);
        else record.holdings.delete(token.address);
        if (receipt.ok) {
          task.stats.sells++;
          task.stats.receivedNative += receipt.nativeAmount - receipt.platformFeeNative - receipt.networkFeeNative;
          task.stats.lastCopiedAt = this.ctx.world.now;
        }
        this.notify(record, token, trade, receipt);
      });
    this.jobs.spawn(`copy sell ${task.id}`, job);
  }

  /** Notify the copy's outcome and track the failure streak (pausing the task at the limit). */
  private notify(record: CopyRecord, token: TokenState, trade: Trade, receipt: SwapReceipt): void {
    const { task } = record;
    const who = task.label || trade.walletLabel || shortAddress(trade.wallet);
    const action = trade.side === 'buy' ? 'buy' : 'sell';
    const error = receipt.error ?? 'swap failed';
    this.ctx.accounts.notify(record.accountId, {
      kind: 'copytrade',
      title: receipt.ok ? `Copied ${who}'s ${action} · $${token.symbol}` : `Copy ${action} failed · $${token.symbol}`,
      body: receipt.ok ? describeFill(token.chain, token.symbol, receipt) : error,
      chain: token.chain,
      token: token.address,
      wallet: trade.wallet,
      level: receipt.ok ? 'success' : 'error',
    });
    task.consecutiveFailures = receipt.ok ? 0 : (task.consecutiveFailures ?? 0) + 1;
    if (!task.enabled || task.consecutiveFailures < COPY_AUTO_PAUSE_FAILURES) return;
    task.enabled = false;
    this.ctx.accounts.notify(record.accountId, {
      kind: 'copytrade',
      title: `Copy trading paused · ${who}`,
      body: `${COPY_AUTO_PAUSE_FAILURES} copies failed in a row (last: ${error}). Fix the cause, then re-enable the task.`,
      chain: task.chain,
      token: null,
      wallet: task.target,
      level: 'error',
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  serialize(): StoredCopyTask[] {
    return [...this.records.values()].map((r) => ({ accountId: r.accountId, task: r.task, holdings: [...r.holdings], spent: [...r.spent] }));
  }

  restore(stored: StoredCopyTask[]): void {
    this.records.clear();
    this.byTarget.clear();
    for (const s of stored) this.add({ accountId: s.accountId, task: s.task, holdings: new Map(s.holdings), spent: new Map(s.spent) });
  }
}
