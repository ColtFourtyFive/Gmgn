// Copy trading: mirror a target wallet's buys (fixed amount or a ratio of the
// target's size, capped per token) and, in mirror mode, sell the same share
// of the position whenever the target sells. Copy sells only touch tokens the
// task itself bought, like GMGN's Copy Sell: the task's holdings shrink with
// any sell of the account's wallet (manual, strategy legs), and a target sell
// that arrives while a copy buy is still confirming is applied to that buy
// once it lands. A mirror sell too small to pay its fees is filtered, not
// failed: the share stays in the task's holdings and leaves with a later,
// larger mirror sell or the target's exit. A task that keeps failing (e.g.
// the wallet ran dry) pauses itself after COPY_AUTO_PAUSE_FAILURES in a row.

import { COPY_AUTO_PAUSE_FAILURES, shortAddress, type CopyTradeTask, type SwapReceipt, type Trade } from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState, WalletState } from '../sim/world';
import { badRequest, balanceOf, describeFill, normalizeAddress, notFound, parse, type Jobs } from './common';
import { PROCEEDS_BELOW_FEES, type Executor } from './execution';
import { copyTaskSchema, type CopyTaskInput } from './schemas';

const MAX_COPY_TASKS = 20;
/** Copies smaller than this (native) are skipped. */
const MIN_COPY_NATIVE = 1e-6;

interface CopyRecord {
  accountId: string;
  task: CopyTradeTask;
  /** Tokens bought by this task and not yet sold (by it or otherwise). */
  holdings: Map<string, number>;
  /** Native trade size this task has committed per token (maxPerToken). */
  spent: Map<string, number>;
  /** Copy buys still confirming, per token (not persisted: in-flight swaps are not either). */
  inflight: Map<string, Set<InflightBuy>>;
}

/** A copy buy in flight, and the target sells it missed. */
interface InflightBuy {
  /** Share of the bought tokens to keep once the buy lands (1 = no target sell meanwhile). */
  keep: number;
  /** The latest target sell seen while in flight. */
  sell: Trade | null;
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
    this.add({ accountId, task, holdings: new Map(), spent: new Map(), inflight: new Map() });
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

  private onTrade(trade: Trade, token: TokenState, wallet: WalletState): void {
    if (this.ctx.engine.warming) return;
    if (trade.side === 'sell' && wallet.accountId) this.syncHoldings(wallet.accountId, wallet, token);
    const records = this.byTarget.get(targetKey(trade.chain, trade.wallet));
    if (!records) return;
    for (const record of records) {
      if (!record.task.enabled) continue;
      if (trade.side === 'buy') this.copyBuy(record, trade, token, wallet);
      else if (record.task.sellMode === 'mirror') this.copySell(record, trade, token, wallet);
    }
  }

  /**
   * A sell from an account's wallet (by hand, a strategy leg or a copy sell):
   * no task of the account can still hold more of the token than the wallet
   * does, so a later mirror sell never dumps tokens bought some other way.
   */
  private syncHoldings(accountId: string, wallet: WalletState, token: TokenState): void {
    const balance = balanceOf(wallet, token);
    for (const record of this.records.values()) {
      if (record.accountId !== accountId || record.task.chain !== wallet.chain) continue;
      const held = record.holdings.get(token.address);
      if (held === undefined || held <= balance) continue;
      // Only the account's paper wallet holds copied tokens (not its launch bundle wallets).
      if (this.ctx.accounts.walletFor(accountId, wallet.chain) !== wallet) return;
      if (balance > 0) record.holdings.set(token.address, balance);
      else record.holdings.delete(token.address);
    }
  }

  private copyBuy(record: CopyRecord, trade: Trade, token: TokenState, target: WalletState): void {
    const { world } = this.ctx;
    const { task } = record;
    if (task.blacklist.includes(token.address)) return;
    // The target's buy completed the curve: nothing is tradable until the pool opens.
    if (token.status === 'migrating') return;
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
    const inflight: InflightBuy = { keep: 1, sell: null };
    let pending = record.inflight.get(token.address);
    if (!pending) record.inflight.set(token.address, (pending = new Set()));
    pending.add(inflight);

    const job = this.executor
      .submit(record.accountId, { chain: token.chain, token: token.address, side: 'buy', amount, amountKind: 'native', presetId: task.presetId, strategy: task.strategy }, 'copytrade')
      .then(({ receipt }) => {
        pending.delete(inflight);
        if (pending.size === 0 && record.inflight.get(token.address) === pending) record.inflight.delete(token.address);
        record.spent.set(token.address, Math.max(0, (record.spent.get(token.address) ?? 0) - amount + (receipt.ok ? receipt.nativeAmount : 0)));
        if (receipt.ok) {
          record.holdings.set(token.address, (record.holdings.get(token.address) ?? 0) + receipt.tokenAmount);
          task.stats.buys++;
          task.stats.spentNative += receipt.nativeAmount + receipt.platformFeeNative + receipt.networkFeeNative;
          task.stats.lastCopiedAt = world.now;
        }
        this.notify(record, token, trade, receipt);
        // The target sold while this buy was confirming: mirror that on what it bought.
        if (receipt.ok && inflight.sell && inflight.keep < 1 && task.enabled && task.sellMode === 'mirror' && this.records.get(task.id) === record) {
          const held = this.heldBy(record, token);
          if (held > 0) this.sell(record, inflight.sell, token, held, Math.min(held, receipt.tokenAmount * (1 - inflight.keep)));
        }
      });
    this.jobs.spawn(`copy buy ${task.id}`, job);
  }

  private copySell(record: CopyRecord, trade: Trade, token: TokenState, target: WalletState): void {
    const targetLeft = balanceOf(target, token);
    const share = targetLeft <= 0 ? 1 : trade.tokenAmount / (targetLeft + trade.tokenAmount);
    // Copy buys still confirming hold none of the tokens yet: they apply the share when they land.
    for (const inflight of record.inflight.get(token.address) ?? []) {
      inflight.keep *= 1 - share;
      inflight.sell = trade;
    }
    const held = this.heldBy(record, token);
    if (held <= 0) {
      record.holdings.delete(token.address);
      return;
    }
    this.sell(record, trade, token, held, share >= 1 ? held : held * share);
  }

  /** The task's holding, never more than the wallet still has (the user may have sold some by hand). */
  private heldBy(record: CopyRecord, token: TokenState): number {
    return Math.min(record.holdings.get(token.address) ?? 0, balanceOf(this.ctx.accounts.walletFor(record.accountId, record.task.chain), token));
  }

  /** Mirror a target sell: sell `amount` of the task's `held` tokens. */
  private sell(record: CopyRecord, trade: Trade, token: TokenState, held: number, amount: number): void {
    const { task } = record;
    record.holdings.set(token.address, held - amount);

    const job = this.executor
      .submit(record.accountId, { chain: token.chain, token: token.address, side: 'sell', amount, amountKind: 'tokens', presetId: task.presetId }, 'copytrade')
      .then(({ receipt }) => {
        const balance = balanceOf(this.ctx.accounts.walletFor(record.accountId, task.chain), token);
        const left = Math.min((record.holdings.get(token.address) ?? 0) + amount - (receipt.ok ? receipt.tokenAmount : 0), balance);
        if (left > 0) record.holdings.set(token.address, left);
        else record.holdings.delete(token.address);
        // Dust the network fee would eat is not a failure: it stays held for the next mirror sell.
        if (!receipt.ok && receipt.error === PROCEEDS_BELOW_FEES) return;
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
    for (const s of stored) this.add({ accountId: s.accountId, task: s.task, holdings: new Map(s.holdings), spent: new Map(s.spent), inflight: new Map() });
  }
}
