// Conditional orders: limit buy/sell on price or market cap, take-profit /
// stop-loss / trailing stops relative to an entry price, dev-sell and
// migration triggers, and the exit orders a strategy attaches to a buy
// (GMGN's "Advanced Trading Strategy"). Price triggers are evaluated on a
// 250ms ticker over open orders indexed by token; event triggers react to
// world events. Triggered orders execute through the regular swap path.

import {
  type ChainId,
  type CreateOrderRequest,
  type Order,
  type OrderKind,
  type OrderStatus,
  type Side,
  type StrategySpec,
  type Trade,
} from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState, WalletState } from '../sim/world';
import { HOUR_MS, assertAmount, badRequest, balanceOf, describeFill, normalizeAddress, notFound, type Jobs } from './common';
import type { ExecResult, Executor, TradeIntent, TradeSource } from './execution';
import { MAX_STRATEGY_ORDERS } from './schemas';

const EVALUATE_EVERY_MS = 250;
const MAX_OPEN_ORDERS = 200;
/** Closed orders kept per account (oldest dropped first). */
const HISTORY_PER_ACCOUNT = 300;
/** Share of the dev's holdings sold in one trade that trips a strategy dev-sell exit. */
const DEFAULT_DEV_SELL_THRESHOLD = 0.2;
const POSITION_CLOSED = 'position closed';

const ORDER_LABELS: Record<OrderKind, string> = {
  limit_buy: 'Limit buy',
  limit_sell: 'Limit sell',
  take_profit: 'Take profit',
  stop_loss: 'Stop loss',
  trailing_stop: 'Trailing stop',
  dev_sell: 'Dev-sell exit',
  migration_buy: 'Migration snipe',
  migration_sell: 'Migration sell',
};

function orderSide(kind: OrderKind): Side {
  return kind === 'limit_buy' || kind === 'migration_buy' ? 'buy' : 'sell';
}

type OrderSpec = Pick<
  Order,
  | 'kind'
  | 'triggerType'
  | 'triggerValue'
  | 'amount'
  | 'amountKind'
  | 'presetId'
  | 'direction'
  | 'refPriceUsd'
  | 'activateAtChangePct'
  | 'devSellThreshold'
  | 'groupId'
  | 'source'
  | 'expiresAt'
>;

export interface OrderFilter {
  status?: 'open' | 'history';
  chain?: ChainId;
  token?: string;
}

/** Price change from the order's entry reference, in percent. */
function changePct(order: Order, priceUsd: number): number {
  return order.refPriceUsd ? (priceUsd / order.refPriceUsd - 1) * 100 : 0;
}

export class OrderBook {
  private readonly orders = new Map<string, Order>();
  /** Account id -> its orders in creation order. */
  private readonly byAccount = new Map<string, Order[]>();
  private readonly openByToken = new Map<string, Set<Order>>();
  /** Orders whose swap is in flight (triggered, waiting for confirmation). */
  private readonly executing = new Set<string>();

  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
    private readonly jobs: Jobs,
  ) {}

  install(): void {
    const { world, engine } = this.ctx;
    world.on('trade', (trade, token, wallet) => this.onTrade(trade, token, wallet));
    world.on('tokenMigrated', (token) => this.onMigrated(token));
    engine.addTicker('trading-orders', () => this.evaluate(), { everyMs: EVALUATE_EVERY_MS });
  }

  // ---------------------------------------------------------------------------
  // Queries & user actions
  // ---------------------------------------------------------------------------

  /** Open orders newest first; history by last update, newest first. */
  list(accountId: string, filter: OrderFilter = {}): Order[] {
    const token = filter.token && normalizeAddress(filter.token);
    const orders = (this.byAccount.get(accountId) ?? []).filter(
      (o) =>
        (!filter.status || (filter.status === 'open') === (o.status === 'open')) &&
        (!filter.chain || o.chain === filter.chain) &&
        (!token || o.token === token),
    );
    orders.reverse();
    if (filter.status === 'history') orders.sort((a, b) => b.updatedAt - a.updatedAt);
    return orders.map((o) => ({ ...o }));
  }

  create(accountId: string, req: CreateOrderRequest): Order {
    const { world, accounts } = this.ctx;
    const token = world.getToken(normalizeAddress(req.token));
    if (!token || token.chain !== req.chain) throw notFound('token');
    const side = orderSide(req.kind);
    assertAmount(side, req.amount, req.amountKind);
    if (side === 'sell' && balanceOf(accounts.walletFor(accountId, req.chain), token) <= 0) {
      throw badRequest('you have no position in this token', 'no_position');
    }
    if ((req.kind === 'migration_buy' || req.kind === 'migration_sell') && token.status === 'migrated') {
      throw badRequest('token has already migrated');
    }
    if (this.openCount(accountId) >= MAX_OPEN_ORDERS) throw badRequest(`at most ${MAX_OPEN_ORDERS} open orders`, 'limit_reached');

    const settings = accounts.getSettings(accountId).trade[req.chain];
    const price = world.priceUsd(token);
    const isLimit = req.kind === 'limit_buy' || req.kind === 'limit_sell';
    const current = req.triggerType === 'mcap' ? price * token.totalSupply : price;
    const order = this.add(accountId, token, {
      kind: req.kind,
      triggerType: req.triggerType,
      triggerValue: req.triggerValue,
      amount: req.amount,
      amountKind: req.amountKind,
      presetId: req.presetId ?? (side === 'buy' ? settings.activeBuyPreset : settings.activeSellPreset),
      // Without an explicit direction the trigger fires when the value moves toward it.
      direction: isLimit ? (req.direction ?? (req.triggerValue >= current ? 'above' : 'below')) : null,
      // Manual relative orders measure change from the price at creation.
      refPriceUsd: req.triggerType === 'change' ? price : null,
      activateAtChangePct: req.kind === 'trailing_stop' ? req.activateAtChangePct || null : null,
      devSellThreshold: req.kind === 'dev_sell' ? (req.devSellThreshold ?? DEFAULT_DEV_SELL_THRESHOLD) : null,
      groupId: null,
      source: 'manual',
      expiresAt: req.expiresInHours ? world.now + req.expiresInHours * HOUR_MS : null,
    });
    return { ...order };
  }

  /**
   * Exit orders for a filled buy, sharing one groupId. Sizes are a percent of
   * the holding at trigger time. Best effort: capped by the open-order limit.
   */
  createStrategy(accountId: string, token: TokenState, entryPriceUsd: number, spec: StrategySpec, source: TradeSource): Order[] {
    const { world, accounts } = this.ctx;
    const base = {
      triggerType: 'change' as const,
      amountKind: 'percent' as const,
      presetId: accounts.getSettings(accountId).trade[token.chain].activeSellPreset,
      direction: null,
      refPriceUsd: entryPriceUsd,
      activateAtChangePct: null,
      devSellThreshold: null,
      groupId: world.nextId('grp'),
      source,
      expiresAt: null,
    };
    const specs: OrderSpec[] = [
      ...spec.takeProfits.map((tp) => ({ ...base, kind: 'take_profit' as const, triggerValue: tp.changePct, amount: tp.sellPercent })),
      ...spec.stopLosses.map((sl) => ({ ...base, kind: 'stop_loss' as const, triggerValue: sl.lossPct, amount: sl.sellPercent })),
    ];
    if (spec.trailing) {
      const { drawdownPct, sellPercent, activateAtChangePct } = spec.trailing;
      specs.push({ ...base, kind: 'trailing_stop', triggerValue: drawdownPct, amount: sellPercent, activateAtChangePct: activateAtChangePct || null });
    }
    if (spec.devSellPercent > 0) {
      specs.push({ ...base, kind: 'dev_sell', triggerType: 'event', triggerValue: 0, amount: spec.devSellPercent, devSellThreshold: DEFAULT_DEV_SELL_THRESHOLD });
    }
    if (spec.migrationSellPercent > 0 && token.status !== 'migrated') {
      specs.push({ ...base, kind: 'migration_sell', triggerType: 'event', triggerValue: 0, amount: spec.migrationSellPercent });
    }
    const room = Math.max(0, MAX_OPEN_ORDERS - this.openCount(accountId));
    return specs.slice(0, Math.min(MAX_STRATEGY_ORDERS, room)).map((s) => this.add(accountId, token, s));
  }

  cancel(accountId: string, id: string): Order {
    const order = this.orders.get(id);
    if (!order || order.accountId !== accountId) throw notFound('order');
    if (order.status === 'open') this.close(order, 'cancelled', null);
    return { ...order };
  }

  /** The account's position in a token went to zero: its remaining sell orders are void. */
  closePosition(accountId: string, tokenAddress: string): void {
    for (const order of this.openByToken.get(tokenAddress) ?? []) {
      // In-flight orders are skipped: their guard sees the empty position.
      if (order.accountId === accountId && order.side === 'sell' && !this.executing.has(order.id)) this.close(order, 'cancelled', POSITION_CLOSED);
    }
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  /** Check expiry and price triggers of every open order (one price read per token). */
  evaluate(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const [address, orders] of this.openByToken) {
      const token = world.getToken(address);
      if (!token) {
        for (const order of orders) if (!this.executing.has(order.id)) this.close(order, 'cancelled', 'token delisted');
        continue;
      }
      const price = world.priceUsd(token);
      const mcap = price * token.totalSupply;
      for (const order of orders) {
        if (this.executing.has(order.id)) continue;
        if (order.expiresAt !== null && now >= order.expiresAt) this.close(order, 'expired', null);
        else if (token.status !== 'migrating' && this.triggered(order, price, mcap)) this.fire(order);
      }
    }
  }

  private triggered(order: Order, price: number, mcap: number): boolean {
    switch (order.kind) {
      case 'limit_buy':
      case 'limit_sell': {
        const value = order.triggerType === 'mcap' ? mcap : price;
        return order.direction === 'above' ? value >= order.triggerValue : value <= order.triggerValue;
      }
      case 'take_profit':
        return changePct(order, price) >= order.triggerValue;
      case 'stop_loss':
        return changePct(order, price) <= -order.triggerValue;
      case 'trailing_stop':
        return this.trail(order, price);
      default:
        return false; // event-driven kinds
    }
  }

  /** Trailing stop: arm at the activation gain (immediately for a trailing SL), then ratchet the peak. */
  private trail(order: Order, price: number): boolean {
    if (!order.armed) {
      if (changePct(order, price) < (order.activateAtChangePct ?? 0)) return false;
      order.armed = true;
      order.peakPriceUsd = price;
      order.updatedAt = this.ctx.world.now;
      this.publish(order);
    }
    if (order.peakPriceUsd === null || price > order.peakPriceUsd) order.peakPriceUsd = price;
    return price <= order.peakPriceUsd * (1 - order.triggerValue / 100);
  }

  private onTrade(trade: Trade, token: TokenState, wallet: WalletState): void {
    if (this.ctx.engine.warming || trade.side !== 'sell' || !trade.isDev) return;
    const orders = this.openByToken.get(token.address);
    if (!orders) return;
    const before = balanceOf(wallet, token) + trade.tokenAmount;
    const soldShare = before > 0 ? trade.tokenAmount / before : 0;
    for (const order of orders) {
      if (order.kind === 'dev_sell' && !this.executing.has(order.id) && soldShare >= (order.devSellThreshold ?? DEFAULT_DEV_SELL_THRESHOLD)) this.fire(order);
    }
  }

  private onMigrated(token: TokenState): void {
    if (this.ctx.engine.warming) return;
    for (const order of this.openByToken.get(token.address) ?? []) {
      if ((order.kind === 'migration_buy' || order.kind === 'migration_sell') && !this.executing.has(order.id)) this.fire(order);
    }
  }

  private fire(order: Order): void {
    this.executing.add(order.id);
    const intent: TradeIntent = { chain: order.chain, token: order.token, side: order.side, amount: order.amount, amountKind: order.amountKind, presetId: order.presetId };
    const guard = () => {
      if (order.status !== 'open') return 'order cancelled';
      return order.side === 'sell' && !this.holds(order) ? POSITION_CLOSED : null;
    };
    const job = this.executor
      .submit(order.accountId, intent, order.source, { guard })
      .then((result) => this.settle(order, result))
      .finally(() => this.executing.delete(order.id));
    this.jobs.spawn(`order ${order.id}`, job);
  }

  private settle(order: Order, { receipt, aborted }: ExecResult): void {
    if (order.status !== 'open') return; // cancelled while in flight
    if (aborted) {
      this.close(order, 'cancelled', aborted);
      return;
    }
    order.receipt = receipt;
    if (receipt.ok) order.filledAt = this.ctx.world.now;
    this.close(order, receipt.ok ? 'filled' : 'failed', receipt.ok ? null : (receipt.error ?? 'swap failed'));
    const title = `${ORDER_LABELS[order.kind]} ${receipt.ok ? 'filled' : 'failed'} · $${order.tokenSymbol}`;
    this.ctx.accounts.notify(order.accountId, {
      kind: receipt.ok ? 'order_filled' : 'order_failed',
      title,
      body: receipt.ok ? describeFill(order.chain, order.tokenSymbol, receipt) : (order.failReason ?? 'order failed'),
      chain: order.chain,
      token: order.token,
      wallet: null,
    });
  }

  private holds(order: Order): boolean {
    const token = this.ctx.world.getToken(order.token);
    return !!token && balanceOf(this.ctx.accounts.walletFor(order.accountId, order.chain), token) > 0;
  }

  // ---------------------------------------------------------------------------
  // Bookkeeping
  // ---------------------------------------------------------------------------

  private add(accountId: string, token: TokenState, spec: OrderSpec): Order {
    const now = this.ctx.world.now;
    const armed = spec.kind !== 'trailing_stop' || !spec.activateAtChangePct;
    const order: Order = {
      ...spec,
      id: this.ctx.world.nextId('ord'),
      accountId,
      chain: token.chain,
      token: token.address,
      tokenSymbol: token.symbol,
      side: orderSide(spec.kind),
      armed,
      peakPriceUsd: spec.kind === 'trailing_stop' && armed ? spec.refPriceUsd : null,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      filledAt: null,
      receipt: null,
      failReason: null,
    };
    this.index(order);
    this.publish(order);
    return order;
  }

  private index(order: Order): void {
    this.orders.set(order.id, order);
    let list = this.byAccount.get(order.accountId);
    if (!list) this.byAccount.set(order.accountId, (list = []));
    list.push(order);
    if (order.status !== 'open') return;
    let open = this.openByToken.get(order.token);
    if (!open) this.openByToken.set(order.token, (open = new Set()));
    open.add(order);
  }

  private close(order: Order, status: Exclude<OrderStatus, 'open'>, reason: string | null): void {
    order.status = status;
    order.failReason = reason;
    order.updatedAt = this.ctx.world.now;
    const open = this.openByToken.get(order.token);
    open?.delete(order);
    if (open?.size === 0) this.openByToken.delete(order.token);
    this.trimHistory(order.accountId);
    this.publish(order);
  }

  private trimHistory(accountId: string): void {
    const list = this.byAccount.get(accountId);
    if (!list) return;
    let closed = list.reduce((n, o) => n + (o.status === 'open' ? 0 : 1), 0);
    while (closed > HISTORY_PER_ACCOUNT) {
      const oldest = list.findIndex((o) => o.status !== 'open');
      this.orders.delete(list[oldest].id);
      list.splice(oldest, 1);
      closed--;
    }
  }

  private openCount(accountId: string): number {
    return (this.byAccount.get(accountId) ?? []).reduce((n, o) => n + (o.status === 'open' ? 1 : 0), 0);
  }

  private publish(order: Order): void {
    this.ctx.hub.publishUser(order.accountId, 'order', order);
  }

  serialize(): Order[] {
    return [...this.orders.values()];
  }

  restore(orders: Order[]): void {
    this.orders.clear();
    this.byAccount.clear();
    this.openByToken.clear();
    this.executing.clear();
    for (const order of orders) this.index(order);
  }
}
