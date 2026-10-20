// Sniper tasks: buy new launches matching keyword / dev / launchpad / safety
// filters (new_token, dev_launch), or tokens the moment they migrate to their
// AMM pool (migration, GMGN's "Migrated Snipe"). Launch filters are evaluated
// a tick after creation so the dev's initial buy is visible.

import { CHAINS, formatNative, type SniperTask, type SwapReceipt } from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState } from '../sim/world';
import { badRequest, balanceOf, describeFill, includesIgnoreCase, normalizeAddress, notFound, parse, type Jobs } from './common';
import type { Executor } from './execution';
import { sniperTaskSchema, type SniperTaskInput } from './schemas';

const MAX_SNIPER_TASKS = 20;
/** Delay between a launch and evaluating it, so the dev's first buy has landed. */
export const SNIPE_DELAY_MS = 250;

interface SniperRecord {
  accountId: string;
  task: SniperTask;
  /** Buys submitted but not settled yet (count toward maxBuys). */
  pending: number;
}

export interface StoredSniperTask {
  accountId: string;
  task: SniperTask;
}

export class Sniper {
  private readonly records = new Map<string, SniperRecord>();
  /** Launches waiting for SNIPE_DELAY_MS before their filters are evaluated. */
  private queue: TokenState[] = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
    private readonly jobs: Jobs,
  ) {}

  install(): void {
    const { world, engine } = this.ctx;
    world.on('tokenCreated', (token) => this.onCreated(token));
    world.on('tokenMigrated', (token) => this.onMigrated(token));
    engine.addTicker('trading-sniper', () => this.flush(), { everyMs: SNIPE_DELAY_MS });
  }

  list(accountId: string): SniperTask[] {
    return [...this.records.values()].filter((r) => r.accountId === accountId).map((r) => structuredClone(r.task));
  }

  create(accountId: string, input: SniperTaskInput): SniperTask {
    let count = 0;
    for (const r of this.records.values()) if (r.accountId === accountId) count++;
    if (count >= MAX_SNIPER_TASKS) throw badRequest(`at most ${MAX_SNIPER_TASKS} sniper tasks`, 'limit_reached');
    const task: SniperTask = {
      ...this.resolve(accountId, input),
      id: this.ctx.world.nextId('snipe'),
      buysDone: 0,
      createdAt: this.ctx.world.now,
      lastTriggeredAt: null,
    };
    this.records.set(task.id, { accountId, task, pending: 0 });
    return structuredClone(task);
  }

  update(accountId: string, id: string, patch: Record<string, unknown>): SniperTask {
    const { task } = this.owned(accountId, id);
    Object.assign(task, this.resolve(accountId, parse(sniperTaskSchema, { ...task, ...patch, chain: task.chain })));
    return structuredClone(task);
  }

  remove(accountId: string, id: string): void {
    this.owned(accountId, id);
    this.records.delete(id);
  }

  private resolve(accountId: string, input: SniperTaskInput): Omit<SniperTask, 'id' | 'buysDone' | 'createdAt' | 'lastTriggeredAt'> {
    return {
      ...input,
      devAddresses: input.devAddresses.map(normalizeAddress),
      presetId: input.presetId ?? this.ctx.accounts.getSettings(accountId).trade[input.chain].activeBuyPreset,
    };
  }

  private owned(accountId: string, id: string): SniperRecord {
    const record = this.records.get(id);
    if (!record || record.accountId !== accountId) throw notFound('sniper task');
    return record;
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  private onCreated(token: TokenState): void {
    if (this.ctx.engine.warming) return;
    for (const { task } of this.records.values()) {
      if (task.enabled && task.kind !== 'migration' && task.chain === token.chain) {
        this.queue.push(token);
        return;
      }
    }
  }

  private onMigrated(token: TokenState): void {
    if (this.ctx.engine.warming) return;
    for (const record of this.records.values()) if (record.task.kind === 'migration') this.consider(record, token);
  }

  /** Evaluate launches whose delay has elapsed. */
  flush(): void {
    const now = this.ctx.world.now;
    const due = this.queue.filter((t) => now - t.createdAt >= SNIPE_DELAY_MS);
    if (due.length === 0) return;
    this.queue = this.queue.filter((t) => now - t.createdAt < SNIPE_DELAY_MS);
    for (const token of due) {
      for (const record of this.records.values()) if (record.task.kind !== 'migration') this.consider(record, token);
    }
  }

  private consider(record: SniperRecord, token: TokenState): void {
    const { task } = record;
    if (!task.enabled || task.chain !== token.chain || task.buysDone + record.pending >= task.maxBuys || !this.matches(task, token)) return;
    record.pending++;
    task.lastTriggeredAt = this.ctx.world.now;
    const job = this.executor
      .submit(record.accountId, { chain: token.chain, token: token.address, side: 'buy', amount: task.buyAmount, amountKind: 'native', presetId: task.presetId, strategy: task.strategy }, 'sniper')
      .then(({ receipt }) => this.settle(record, token, receipt));
    this.jobs.spawn(`snipe ${task.id}`, job);
  }

  private matches(task: SniperTask, t: TokenState): boolean {
    const { world } = this.ctx;
    if (task.keywords.length > 0 && !task.keywords.some((k) => includesIgnoreCase(t.name, k) || includesIgnoreCase(t.symbol, k))) return false;
    if (task.devAddresses.length > 0 && !task.devAddresses.includes(t.creator)) return false;
    if (task.launchpads.length > 0 && !task.launchpads.includes(t.launchpad)) return false;
    if (task.requireSocials && !(t.socials.twitter || t.socials.telegram || t.socials.website)) return false;
    if (task.maxDevHoldRate !== null) {
      let devBalance = 0;
      for (const address of [t.creator, ...t.devTeam]) {
        const wallet = world.getWallet(address);
        if (wallet) devBalance += balanceOf(wallet, t);
      }
      if (devBalance / t.totalSupply > task.maxDevHoldRate) return false;
    }
    if (task.minDevMigrated !== null) {
      const created = world.getWallet(t.creator)?.createdTokens ?? [];
      const migrated = created.filter((a) => a !== t.address && world.getToken(a)?.status === 'migrated').length;
      if (migrated < task.minDevMigrated) return false;
    }
    return true;
  }

  private settle(record: SniperRecord, token: TokenState, receipt: SwapReceipt): void {
    const { task } = record;
    record.pending--;
    if (receipt.ok) {
      task.buysDone++;
      if (task.buysDone >= task.maxBuys) task.enabled = false;
    }
    const name = task.label || `${task.kind.replace('_', ' ')} sniper`;
    const progress = `${task.buysDone}/${task.maxBuys}${task.enabled ? '' : ', task complete'}`;
    this.ctx.accounts.notify(record.accountId, {
      kind: 'sniper',
      title: receipt.ok ? `Sniped $${token.symbol}` : `Snipe failed · $${token.symbol}`,
      body: receipt.ok
        ? `${describeFill(token.chain, token.symbol, receipt)} (${name}, ${progress})`
        : `${receipt.error ?? 'swap failed'} (${name}, ${formatNative(task.buyAmount, CHAINS[token.chain].nativeSymbol)})`,
      chain: token.chain,
      token: token.address,
      wallet: null,
      level: receipt.ok ? 'success' : 'error',
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  serialize(): StoredSniperTask[] {
    return [...this.records.values()].map(({ accountId, task }) => ({ accountId, task }));
  }

  restore(stored: StoredSniperTask[]): void {
    this.records.clear();
    this.queue = [];
    for (const { accountId, task } of stored) this.records.set(task.id, { accountId, task, pending: 0 });
  }
}
