// Private `user` WebSocket channel: notifications, balances, orders, fills.
// Mounted once by the AppShell; also exports the trade-toast helpers that
// useSwap shares so one fill never produces two toasts.

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { formatCompact, formatPrice, type AppNotification, type ChainId, type SwapReceipt, type UserWallet } from '@trenchscope/shared';
import { routes } from '@/lib/chain';
import { formatNativeFor } from '@/lib/format';
import { playCue } from '@/lib/sounds';
import { useChannel } from '@/lib/ws';
import { useSession } from '@/store/session';
import { toast, type ToastKind } from '@/store/toasts';
import { useUi } from '@/store/ui';

/** React-query key prefixes refreshed after any order/fill event. Use them as the first key element. */
export const TRADING_QUERY_KEYS = [['orders'], ['portfolio'], ['token-position']] as const;

export function invalidateTradingQueries(qc: QueryClient): void {
  for (const queryKey of TRADING_QUERY_KEYS) void qc.invalidateQueries({ queryKey: [...queryKey] });
}

/** Toast describing a filled swap: "Bought PEPE · 1.2M PEPE for 0.5 SOL @ $0.0₅41". */
export function toastFill(receipt: SwapReceipt, symbol?: string): void {
  const trade = receipt.trade;
  if (!trade) return;
  const sym = symbol ?? trade.tokenSymbol;
  const verb = trade.side === 'buy' ? 'Bought' : 'Sold';
  toast.success(
    `${verb} ${sym}`,
    `${formatCompact(receipt.tokenAmount)} ${sym} for ${formatNativeFor(trade.chain, receipt.nativeAmount)} @ ${formatPrice(receipt.priceUsd)}`,
    { to: routes.token(trade.chain, trade.token), label: 'View token' },
  );
}

// ---------------------------------------------------------------------------
// One toast per fill. Every executed swap reaches this tab as a WS `fill`,
// which arrives first; the best description of it comes from elsewhere:
//   - manual swaps: the HTTP receipt (useSwap, via trackManualSwap),
//   - orders / snipes / copy trades: the `notification` the server sends
//     right after the fill ("Limit buy filled", "Sniped $X", ...),
//   - anything else (e.g. a swap made in another tab): the fill itself.
// So fill toasts wait briefly and are dropped when one of the others claims them.
// ---------------------------------------------------------------------------

const FILL_TOAST_DELAY_MS = 500;
const CLAIMED_CAP = 500;

const fillKey = (chain: ChainId, token: string) => `${chain}:${token}`;
/** Trade ids already toasted (or deliberately silenced). */
const claimed = new Set<string>();
/** WS fills waiting for their toast, by trade id. */
const pending = new Map<string, { key: string; receipt: SwapReceipt; timer?: ReturnType<typeof setTimeout> }>();
/** Manual swaps in flight per chain:token; their fills wait for the HTTP receipt. */
const inflight = new Map<string, number>();

function claim(tradeId: string): void {
  claimed.add(tradeId);
  if (claimed.size > CLAIMED_CAP) claimed.delete(claimed.values().next().value as string);
}

function arm(tradeId: string): void {
  const entry = pending.get(tradeId);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (inflight.has(entry.key)) return; // re-armed when the manual swap settles
    pending.delete(tradeId);
    if (claimed.has(tradeId)) return;
    claim(tradeId);
    toastFill(entry.receipt);
    playCue('fill');
  }, FILL_TOAST_DELAY_MS);
}

function onFillEvent(receipt: SwapReceipt): void {
  const trade = receipt.trade;
  if (!receipt.ok || !trade || claimed.has(trade.id) || pending.has(trade.id)) return;
  pending.set(trade.id, { key: fillKey(trade.chain, trade.token), receipt });
  arm(trade.id);
}

/**
 * An execution notification directly follows its fill, so it replaces the
 * toast of the newest pending fill of its token. Returns false when there is
 * none (the execution failed).
 */
function claimPendingFill(key: string): boolean {
  const id = [...pending].reverse().find(([, entry]) => entry.key === key)?.[0];
  if (!id) return false;
  clearTimeout(pending.get(id)?.timer);
  pending.delete(id);
  claim(id);
  return true;
}

/**
 * Register a manual swap so the user channel does not toast its fill; the
 * returned `settle(receipt)` claims the fill (the caller toasts it) and
 * releases other fills of the token held meanwhile. useSwap does this.
 */
export function trackManualSwap(chain: ChainId, token: string): (receipt: SwapReceipt | null) => void {
  const key = fillKey(chain, token);
  inflight.set(key, (inflight.get(key) ?? 0) + 1);
  let settled = false;
  return (receipt) => {
    if (settled) return;
    settled = true;
    const left = (inflight.get(key) ?? 1) - 1;
    if (left > 0) inflight.set(key, left);
    else inflight.delete(key);
    const own = receipt?.trade?.id;
    if (own) {
      claim(own);
      clearTimeout(pending.get(own)?.timer);
      pending.delete(own);
    }
    for (const [id, entry] of pending) if (entry.key === key) arm(id);
  };
}

/** Notifications that report an automated execution (each follows its fill). */
const EXECUTION_KINDS = new Set<AppNotification['kind']>(['order_filled', 'copytrade', 'sniper']);

function notificationToast(n: AppNotification): void {
  let kind: ToastKind = 'info';
  // An explicit error level wins; it never claims a fill (failed executions publish none).
  if (n.kind === 'order_failed' || n.level === 'error') kind = 'error';
  else if (EXECUTION_KINDS.has(n.kind)) {
    // Failed executions publish no fill, and sniper/copytrade use one kind for both outcomes.
    const filled = !!n.chain && !!n.token && claimPendingFill(fillKey(n.chain, n.token));
    kind = filled || n.kind === 'order_filled' ? 'success' : 'error';
  }
  const link =
    n.chain && n.token
      ? { to: routes.token(n.chain, n.token), label: 'View token' }
      : n.chain && n.wallet
        ? { to: routes.wallet(n.chain, n.wallet), label: 'View wallet' }
        : undefined;
  toast.push({ kind, title: n.title, body: n.body, link });
  playCue(kind === 'error' ? 'error' : kind === 'success' ? 'fill' : 'alert');
}

/** Apply one `user` channel event: caches, balance, unread count and toasts. */
export function handleUserEvent(qc: QueryClient, type: string, data: unknown): void {
  switch (type) {
    case 'notification':
      useUi.getState().bumpUnread();
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      notificationToast(data as AppNotification);
      break;
    case 'balance': {
      const w = data as UserWallet;
      useSession.getState().setAccountBalance(w.chain, w.nativeBalance, w.nativeBalanceUsd);
      break;
    }
    case 'order':
      invalidateTradingQueries(qc);
      break;
    case 'fill':
      invalidateTradingQueries(qc);
      onFillEvent(data as SwapReceipt);
      break;
  }
}

/** Subscribe to the `user` channel while signed in (mount once, in the shell). */
export function useUserChannel(): void {
  const signedIn = useSession((s) => !!s.token);
  const qc = useQueryClient();
  useChannel(signedIn ? 'user' : null, undefined, (type, data) => handleUserEvent(qc, type, data));
}
