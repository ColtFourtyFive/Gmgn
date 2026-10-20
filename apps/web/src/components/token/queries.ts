// Data hooks of the token page. Query keys follow the app conventions:
// private trading data lives under ['token-position'], ['orders'] and
// ['portfolio'] so fills and order events (user channel, useSwap) refresh it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChainId, CreateOrderRequest, Order, Resolution, TokenDetail, TokenPositionRow, Trade } from '@trenchscope/shared';
import { invalidateTradingQueries } from '@/hooks/useUserChannel';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useChannel, useConnectionState } from '@/lib/ws';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import type { CandleEvent, TokenFeed } from './feed';
import { useTokenUi, type ChartUnit } from './store';

export const tokenKeys = {
  detail: (chain: ChainId, address: string) => ['token-detail', chain, address] as const,
  candles: (chain: ChainId, address: string, resolution: Resolution) => ['token-candles', chain, address, resolution] as const,
  trades: (chain: ChainId, address: string, q: object) => ['token-trades', chain, address, q] as const,
  holders: (chain: ChainId, address: string, tag: string, viewer: boolean) => ['token-holders', chain, address, tag, viewer] as const,
  traders: (chain: ChainId, address: string, q: object) => ['token-traders', chain, address, q] as const,
  earlyBuyers: (chain: ChainId, address: string, viewer: boolean) => ['token-early-buyers', chain, address, viewer] as const,
  position: (chain: ChainId, address: string, wallet: string | null) => ['token-position', chain, address, wallet] as const,
  orders: (chain: ChainId, address: string, status: 'open' | 'history') => ['orders', 'token', chain, address, status] as const,
  fills: (chain: ChainId, address: string) => ['portfolio', 'token-fills', chain, address] as const,
  quote: (q: object) => ['quote', q] as const,
};

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
const retryUnlessMissing = (count: number, err: unknown) => !isNotFound(err) && count < 2;

/**
 * Token detail: REST for the first paint, then kept live by the page's
 * `token` channel (useTokenStream writes into this cache). Polls only while
 * the realtime connection is down.
 */
export function useTokenDetail(chain: ChainId, address: string) {
  const conn = useConnectionState();
  return useQuery({
    queryKey: tokenKeys.detail(chain, address),
    queryFn: () => api.token(chain, address),
    enabled: !!address,
    staleTime: 30_000,
    retry: retryUnlessMissing,
    refetchOnWindowFocus: false,
    refetchInterval: conn === 'open' ? false : 5_000,
  });
}

/**
 * The single `token:<chain>:<address>` subscription of the page: 'token'
 * updates the detail cache, 'trades' and 'candle' fan out through the feed.
 */
export function useTokenStream(chain: ChainId, address: string, resolution: Resolution, feed: TokenFeed, enabled: boolean): void {
  const qc = useQueryClient();
  useChannel(enabled ? `token:${chain}:${address}` : null, { resolution }, (type, data) => {
    if (type === 'token') qc.setQueryData(tokenKeys.detail(chain, address), data as TokenDetail);
    else if (type === 'trades') feed.pushTrades(data as Trade[]);
    else if (type === 'candle') feed.pushCandle(data as CandleEvent);
  });
}

/** The signed-in user's paper wallet address on `chain` (null signed out). */
export function useOwnWallet(chain: ChainId): string | null {
  return useSession((s) => (s.token ? (s.account?.wallets[chain]?.address ?? null) : null));
}

/**
 * The viewer's position in this token (null when never traded). Comes from
 * the wallet holdings endpoint (closed positions included so realized PnL
 * stays visible); refreshed by fills via the ['token-position'] prefix.
 */
export function useMyPosition(chain: ChainId, address: string) {
  const wallet = useOwnWallet(chain);
  return useQuery<TokenPositionRow | null>({
    queryKey: tokenKeys.position(chain, address, wallet),
    queryFn: async () => {
      const rows = await api.walletHoldings(chain, wallet as string, { includeClosed: true });
      return rows.find((r) => r.token === address) ?? null;
    },
    enabled: !!wallet,
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

/** The viewer's orders for this token (open or history). */
export function useTokenOrders(chain: ChainId, address: string, status: 'open' | 'history', enabled = true) {
  const signedIn = useSession((s) => !!s.token);
  return useQuery<Order[]>({
    queryKey: tokenKeys.orders(chain, address, status),
    queryFn: () => api.orders({ status, chain, token: address }),
    enabled: signedIn && enabled,
    staleTime: 5_000,
    refetchInterval: status === 'open' ? 15_000 : 30_000,
    retry: 1,
  });
}

/**
 * Chart / activity unit (price or market cap). Signed-in users persist it in
 * settings.display.chartUnit; everyone else in localStorage.
 */
export function useChartUnit(): [ChartUnit, (unit: ChartUnit) => void] {
  const signedIn = useSession((s) => !!s.token);
  const saved = useSession((s) => s.settings?.display.chartUnit);
  const override = useTokenUi((s) => s.unitOverride);
  const [local, setLocal] = useLocalStorage<ChartUnit>('ts.token.unit', 'mcap');
  const unit: ChartUnit = override ?? (signedIn && saved ? saved : local);
  const set = useCallback(
    (next: ChartUnit) => {
      useTokenUi.getState().setUnitOverride(next);
      setLocal(next);
      if (useSession.getState().token) void useSession.getState().saveSettings({ display: { chartUnit: next } }).catch(() => undefined);
    },
    [setLocal],
  );
  return [unit, set];
}

/** Create an order with toasts and refresh order/position queries. */
export function useCreateOrder(): { create: (req: CreateOrderRequest, success: { title: string; body?: string }) => Promise<Order | null>; pending: boolean } {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const create = useCallback(
    async (req: CreateOrderRequest, success: { title: string; body?: string }) => {
      setPending(true);
      try {
        const order = await api.createOrder(req);
        toast.success(success.title, success.body);
        invalidateTradingQueries(qc);
        return order;
      } catch (err) {
        toast.error('Order not placed', errorMessage(err));
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );
  return { create, pending };
}

/** Run `fn` when the realtime connection comes back after a drop (to backfill what the stream missed). */
export function useOnReconnect(fn: () => void): void {
  const conn = useConnectionState();
  const seenOpen = useRef(conn === 'open');
  const wasDown = useRef(false);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (conn === 'closed' && seenOpen.current) wasDown.current = true;
    else if (conn === 'open') seenOpen.current = true;
    if (conn === 'open' && wasDown.current) {
      wasDown.current = false;
      cb.current();
    }
  }, [conn]);
}
