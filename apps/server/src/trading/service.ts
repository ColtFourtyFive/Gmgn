// Trading facade: paper-trade execution plus the automation built on it
// (conditional orders and exit strategies, copy trading, sniping, alerts),
// token launches and the portfolio view. Sub-services share one executor and
// one job tracker; post-fill bookkeeping that spans them lives here.

import type { Order, SwapReceipt } from '@trenchscope/shared';
import type { AppContext, TradingApi } from '../context';
import type { TokenState } from '../sim/world';
import { Alerts, type StoredAlert } from './alerts';
import { balanceOf, Jobs } from './common';
import { CopyTrader, type StoredCopyTask } from './copytrade';
import { Executor, latencyFromEnv, type Fill } from './execution';
import { Launches } from './launch';
import { OrderBook, type EntryRefs } from './orders';
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
  readonly launches: Launches;
  readonly portfolio: Portfolio;

  private readonly world: AppContext['world'];

  constructor(ctx: AppContext, opts: TradingOptions = {}) {
    this.world = ctx.world;
    this.executor = new Executor(ctx, (fill) => this.onFill(fill), opts.latencyMs === undefined ? latencyFromEnv() : opts.latencyMs);
    this.orders = new OrderBook(ctx, this.executor, this.jobs);
    this.copyTrade = new CopyTrader(ctx, this.executor, this.jobs);
    this.sniper = new Sniper(ctx, this.executor, this.jobs);
    this.alerts = new Alerts(ctx);
    this.launches = new Launches(ctx, this.executor, (fill) => this.createExits(fill));
    this.portfolio = new Portfolio(ctx, this.launches);
  }

  install(): void {
    this.executor.install();
    this.orders.install();
    this.copyTrade.install();
    this.sniper.install();
    this.alerts.install();
    this.launches.install();
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
    const created = this.createExits({ ticket, receipt });
    if (ticket.side === 'sell') {
      if (balanceOf(wallet, token) <= 0) this.orders.closePosition(accountId, token.address);
      this.launches.followSell(ticket, receipt);
    }
    this.portfolio.record(accountId);
    return created;
  }

  /** The exit orders of a buy's strategy, measured from the price now (see entryRefs). */
  private createExits({ ticket, receipt }: Fill): Order[] {
    const { accountId, token, strategy, source } = ticket;
    if (ticket.side !== 'buy' || !strategy) return [];
    return this.orders.createStrategy(accountId, token, this.entryRefs(token, receipt), strategy, source === 'manual' ? 'strategy' : source);
  }

  /**
   * Exit-leg references for a buy fill, read right after it hit the ledger
   * (PRD TE-52). receipt.priceUsd is the average fill price including the buy
   * tax and venue fee, while the spot after the fill includes the buyer's own
   * price impact: measuring every leg from it fired take-profits on large buys
   * and stop-losses on taxed tokens with no market move at all.
   */
  private entryRefs(token: TokenState, receipt: SwapReceipt): EntryRefs {
    const spotUsd = this.world.priceUsd(token);
    const nativeUsd = this.world.nativeUsd(token.chain);
    const tokens = receipt.tokenAmount;
    if (!(tokens > 0)) return { takeProfitUsd: spotUsd, stopLossUsd: spotUsd, spotUsd };
    const costUsd = ((receipt.nativeAmount + receipt.platformFeeNative + receipt.networkFeeNative) * nativeUsd) / tokens;
    const venueFeeRate = token.pool?.feeRate ?? token.curve?.feeRate ?? 0;
    const venuePriceUsd = receipt.priceUsd * (1 - token.buyTax) * (1 - venueFeeRate);
    return { takeProfitUsd: Math.max(spotUsd, costUsd), stopLossUsd: Math.min(spotUsd, venuePriceUsd), spotUsd };
  }

  hasAutomation(accountId: string): boolean {
    return (
      this.orders.openCount(accountId) > 0 ||
      this.copyTrade.list(accountId).length > 0 ||
      this.sniper.list(accountId).length > 0 ||
      this.alerts.list(accountId).length > 0
    );
  }

  forgetAccount(accountId: string): void {
    this.orders.forgetAccount(accountId);
    this.portfolio.forget(accountId);
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
