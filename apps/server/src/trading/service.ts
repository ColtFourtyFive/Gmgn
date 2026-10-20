// Trading facade: paper-trade execution plus the automation built on it
// (conditional orders and exit strategies, copy trading, sniping, alerts) and
// the portfolio view. Sub-services share one executor and one job tracker;
// post-fill bookkeeping that spans them lives here.

import type { Order } from '@trenchscope/shared';
import type { AppContext, TradingApi } from '../context';
import { Alerts, type StoredAlert } from './alerts';
import { balanceOf, Jobs } from './common';
import { CopyTrader, type StoredCopyTask } from './copytrade';
import { Executor, latencyFromEnv, type Fill } from './execution';
import { OrderBook } from './orders';
import { Portfolio, type EquityPoint } from './portfolio';
import { Sniper, type StoredSniperTask } from './sniper';

const SNAPSHOT_VERSION = 1;

export interface TradingOptions {
  /** Fixed simulated confirmation latency (ms); null = random 120-600ms (+150ms anti-MEV). Defaults to TRADE_LATENCY_MS. */
  latencyMs?: number | null;
}

interface TradingSnapshot {
  version: number;
  orders: Order[];
  copyTasks: StoredCopyTask[];
  sniperTasks: StoredSniperTask[];
  alerts: StoredAlert[];
  equity: [string, EquityPoint[]][];
}

function isSnapshot(data: unknown): data is TradingSnapshot {
  return typeof data === 'object' && data !== null && (data as Partial<TradingSnapshot>).version === SNAPSHOT_VERSION;
}

export class Trading implements TradingApi {
  private readonly jobs = new Jobs();
  readonly executor: Executor;
  readonly orders: OrderBook;
  readonly copyTrade: CopyTrader;
  readonly sniper: Sniper;
  readonly alerts: Alerts;
  readonly portfolio: Portfolio;

  private readonly world: AppContext['world'];

  constructor(ctx: AppContext, opts: TradingOptions = {}) {
    this.world = ctx.world;
    this.executor = new Executor(ctx, (fill) => this.onFill(fill), opts.latencyMs === undefined ? latencyFromEnv() : opts.latencyMs);
    this.orders = new OrderBook(ctx, this.executor, this.jobs);
    this.copyTrade = new CopyTrader(ctx, this.executor, this.jobs);
    this.sniper = new Sniper(ctx, this.executor, this.jobs);
    this.alerts = new Alerts(ctx);
    this.portfolio = new Portfolio(ctx);
  }

  install(): void {
    this.executor.install();
    this.orders.install();
    this.copyTrade.install();
    this.sniper.install();
    this.alerts.install();
    this.portfolio.install();
    this.world.addPinSource(() => this.orders.tokensWithOpenOrders());
    this.world.addPinSource(() => this.alerts.referencedTokens());
  }

  /** Resolves once every triggered order, copy trade and snipe in flight has settled. */
  idle(): Promise<void> {
    return this.jobs.idle();
  }

  /** Runs right after a fill hits the ledger; returns the exit orders created for it. */
  private onFill({ ticket, receipt }: Fill): Order[] {
    const { accountId, token, wallet } = ticket;
    const created =
      ticket.side === 'buy' && ticket.strategy
        ? this.orders.createStrategy(accountId, token, receipt.priceUsd, ticket.strategy, ticket.source === 'manual' ? 'strategy' : ticket.source)
        : [];
    if (ticket.side === 'sell' && balanceOf(wallet, token) <= 0) this.orders.closePosition(accountId, token.address);
    this.portfolio.record(accountId);
    return created;
  }

  serialize(): TradingSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      orders: this.orders.serialize(),
      copyTasks: this.copyTrade.serialize(),
      sniperTasks: this.sniper.serialize(),
      alerts: this.alerts.serialize(),
      equity: this.portfolio.serialize(),
    };
  }

  restore(data: unknown): void {
    if (!isSnapshot(data)) return;
    const snap = structuredClone(data);
    this.orders.restore(snap.orders);
    this.copyTrade.restore(snap.copyTasks);
    this.sniper.restore(snap.sniperTasks);
    this.alerts.restore(snap.alerts);
    this.portfolio.restore(snap.equity);
  }
}
