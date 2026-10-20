// Data hooks of the token page. Query keys follow the app conventions:
// private trading data lives under ['token-position'], ['orders'] and
// ['portfolio'] so fills and order events (user channel, useSwap) refresh it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChainId, CreateOrderRequest, Order, Position, Resolution, TokenDetail, Trade } from '@trenchscope/shared';
import { ensureLiveTradeAck } from '@/components/trade/LiveTradeAck';
import { invalidateTradingQueries } from '@/hooks/useUserChannel';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toastTradeFailure } from '@/hooks/useSwap';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { isLiveMode } from '@/lib/mode';
import { useChannel, useConnectionState } from '@/lib/ws';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import type { CandleEvent, TokenFeed } from './feed';
import { useTokenUi, type ChartUnit, type ValueCurrency } from './store';

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

/** Most rows the holdings endpoint returns in one read. */
export const HOLDINGS_MAX = 1000;

/**
 * The viewer's position in this token (null when never traded). Comes from
 * the wallet holdings endpoint (closed positions included so realized PnL
 * stays visible; most recently active first, at the endpoint's maximum, as
 * the default 200 rows by value cut off closed and small positions of busy
 * accounts). When the account holds more positions than that, the token's
 * own trader list (top-traders, tag `you`: every wallet that ever traded it)
 * answers instead. Refreshed by fills via the ['token-position'] prefix.
 */
export function useMyPosition(chain: ChainId, address: string) {
  const wallet = useOwnWallet(chain);
  return useQuery<Position | null>({
    queryKey: tokenKeys.position(chain, address, wallet),
    queryFn: async () => {
      const rows = await api.walletHoldings(chain, wallet as string, { includeClosed: true, sort: 'recent', limit: HOLDINGS_MAX });
      const row = rows.find((r) => r.token === address);
      if (row || rows.length < HOLDINGS_MAX) return row ?? null;
      const mine = await api.topTraders(chain, address, { tag: 'you', limit: 500 });
      return mine.find((r) => r.wallet.toLowerCase() === (wallet as string).toLowerCase()) ?? null;
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
      const ui = useTokenUi.getState();
      ui.setUnitOverride(next);
      setLocal(next);
      if (useSession.getState().token)
        void useSession
          .getState()
          .saveSettings({ display: { chartUnit: next } })
          // Saved: drop the override so a later change in Settings applies too.
          .then(() => useTokenUi.getState().unitOverride === next && ui.setUnitOverride(null))
          .catch(() => undefined);
    },
    [setLocal],
  );
  return [unit, set];
}

/**
 * Currency of the token page's chart and market stats: USD or the chain's
 * native token. Signed-in users persist it in settings.display.currency
 * (Settings → Display → "Values in"), so the chart toggle and the setting
 * stay in sync; everyone else in localStorage.
 */
export function useValueCurrency(): [ValueCurrency, (currency: ValueCurrency) => void] {
  const signedIn = useSession((s) => !!s.token);
  const saved = useSession((s) => s.settings?.display.currency);
  const override = useTokenUi((s) => s.currencyOverride);
  const [local, setLocal] = useLocalStorage<ValueCurrency>('ts.token.currency', 'usd');
  const picked = override ?? (signedIn && saved ? saved : local);
  const currency: ValueCurrency = picked === 'native' ? 'native' : 'usd';
  const set = useCallback(
    (next: ValueCurrency) => {
      const ui = useTokenUi.getState();
      ui.setCurrencyOverride(next);
      setLocal(next);
      if (useSession.getState().token)
        void useSession
          .getState()
          .saveSettings({ display: { currency: next } })
          .then(() => useTokenUi.getState().currencyOverride === next && ui.setCurrencyOverride(null))
          .catch(() => undefined);
    },
    [setLocal],
  );
  return [currency, set];
}

/** Create an order with toasts and refresh order/position queries. */
export function useCreateOrder(): { create: (req: CreateOrderRequest, success: { title: string; body?: string }) => Promise<Order | null>; pending: boolean } {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const create = useCallback(
    async (req: CreateOrderRequest, success: { title: string; body?: string }) => {
      // Live orders fill with real funds later: the one-time acknowledgement comes first (demo skips the await).
      if (isLiveMode() && !(await ensureLiveTradeAck())) return null;
      setPending(true);
      try {
        const order = await api.createOrder(req);
        toast.success(success.title, success.body);
        invalidateTradingQueries(qc);
        return order;
      } catch (err) {
        toastTradeFailure('Order not placed', errorMessage(err), err instanceof ApiError ? err.code : undefined);
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
