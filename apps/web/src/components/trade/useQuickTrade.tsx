import { useState, type ReactNode } from 'react';
import { formatNative, type ChainId } from '@trenchscope/shared';
import { ConfirmDialog } from '@/components/account/ConfirmDialog';
import { useDisplaySettings, useTradeSettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { nativeSymbol } from '@/lib/chain';
import { requireAuth } from '@/store/session';

/** A one-click market order: buy a native amount or sell a percent of the position. */
export type QuickOrder = { side: 'buy'; amount: number } | { side: 'sell'; percent: number };

/** Stable id of an order (which button shows the spinner). */
export const quickOrderKey = (o: QuickOrder) => (o.side === 'buy' ? `buy:${o.amount}` : `sell:${o.percent}`);

export function quickOrderLabel(o: QuickOrder, chain: ChainId): string {
  return o.side === 'buy' ? `Buy ${formatNative(o.amount, nativeSymbol(chain))}` : `Sell ${o.percent}%`;
}

/**
 * One-click market trades on a token with the chain's active buy / sell
 * preset: prompts sign-in, asks first when "Confirm trades" is on, and
 * toasts the fill (useSwap). Render `dialog` once next to the buttons; one
 * order runs at a time (`active` is the key of the running one).
 */
export function useQuickTrade(chain: ChainId, token: string, symbol: string): {
  submit: (o: QuickOrder) => void;
  pending: boolean;
  active: string | null;
  dialog: ReactNode;
} {
  const trade = useTradeSettings(chain);
  const { confirmTrades } = useDisplaySettings();
  const { swap, pending } = useSwap();
  const [active, setActive] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<QuickOrder | null>(null);

  const run = (o: QuickOrder) => {
    setConfirm(null);
    setActive(quickOrderKey(o));
    const req =
      o.side === 'buy'
        ? { chain, token, side: 'buy' as const, amount: o.amount, amountKind: 'native' as const, presetId: trade.activeBuyPreset }
        : { chain, token, side: 'sell' as const, amount: o.percent, amountKind: 'percent' as const, presetId: trade.activeSellPreset };
    void swap(req, { symbol }).finally(() => setActive(null));
  };

  const submit = (o: QuickOrder) => {
    if (pending) return;
    requireAuth(() => (confirmTrades ? setConfirm(o) : run(o)));
  };

  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      onClose={() => setConfirm(null)}
      onConfirm={() => confirm && run(confirm)}
      title={confirm ? `${quickOrderLabel(confirm, chain)} of ${symbol}?` : ''}
      description={`Market ${confirm?.side ?? 'order'} with preset ${confirm?.side === 'sell' ? trade.activeSellPreset : trade.activeBuyPreset}. Paper trade — no real funds.`}
      confirmLabel={confirm?.side === 'sell' ? 'Sell' : 'Buy'}
      tone={confirm?.side === 'sell' ? 'sell' : 'buy'}
      pending={pending}
    />
  );

  return { submit, pending, active, dialog };
}
