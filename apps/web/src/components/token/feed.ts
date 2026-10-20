// Live event fan-out for one token page. The page owns a single
// `token:<chain>:<address>` subscription (the realtime client keeps one set
// of params per channel) and pushes trade batches and candle updates into a
// TokenFeed; the chart, the activity table and the markers read from it.

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { Candle, Resolution, Trade } from '@trenchscope/shared';

/** Live trades kept in memory (newest first). */
export const LIVE_TRADES_CAP = 500;

export interface CandleEvent {
  resolution: Resolution;
  candle: Candle;
}

type Listener<T> = (value: T) => void;

export class TokenFeed {
  private trades: Trade[] = [];
  private tradeListeners = new Set<Listener<Trade[]>>();
  private candleListeners = new Set<Listener<CandleEvent>>();
  /** Arrival time (ms) of each live trade, for "new row" highlights. */
  readonly arrivedAt = new Map<string, number>();

  /** Append a server batch (oldest first within the batch). */
  pushTrades(batch: Trade[]): void {
    if (!Array.isArray(batch) || batch.length === 0) return;
    const now = Date.now();
    const known = new Set(this.trades.slice(0, 50).map((t) => t.id));
    const fresh: Trade[] = [];
    for (let i = batch.length - 1; i >= 0; i--) {
      const t = batch[i];
      if (known.has(t.id)) continue;
      fresh.push(t);
      this.arrivedAt.set(t.id, now);
    }
    if (fresh.length === 0) return;
    const next = fresh.concat(this.trades);
    if (next.length > LIVE_TRADES_CAP) {
      for (const dropped of next.slice(LIVE_TRADES_CAP)) this.arrivedAt.delete(dropped.id);
      next.length = LIVE_TRADES_CAP;
    }
    this.trades = next;
    for (const l of this.tradeListeners) l(fresh);
  }

  /** Live trades since the page opened, newest first (stable reference between batches). */
  recent = (): Trade[] => this.trades;

  subscribeTrades = (fn: Listener<Trade[]>): (() => void) => {
    this.tradeListeners.add(fn);
    return () => this.tradeListeners.delete(fn);
  };

  pushCandle(ev: CandleEvent): void {
    if (!ev || !ev.candle) return;
    for (const l of this.candleListeners) l(ev);
  }

  subscribeCandles = (fn: Listener<CandleEvent>): (() => void) => {
    this.candleListeners.add(fn);
    return () => this.candleListeners.delete(fn);
  };
}

export const TokenFeedContext = createContext<TokenFeed | null>(null);

/** The page's live feed (a detached empty feed outside a token page). */
const DETACHED = new TokenFeed();
export function useTokenFeed(): TokenFeed {
  return useContext(TokenFeedContext) ?? DETACHED;
}

/** Live trades (newest first); re-renders once per server batch (~4/s on busy tokens). */
export function useLiveTrades(): Trade[] {
  const feed = useTokenFeed();
  const subscribe = useCallback((cb: () => void) => feed.subscribeTrades(() => cb()), [feed]);
  return useSyncExternalStore(subscribe, feed.recent, feed.recent);
}
