import { useState } from 'react';
import type { TokenPositionRow } from '@trenchscope/shared';
import clsx from 'clsx';
import { Spinner } from '@/components/ui';
import { useDisplaySettings, useTradeSettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { requireAuth } from '@/store/session';
import { ConfirmDialog } from '../ConfirmDialog';

export const QUICK_SELL_PERCENTS = [25, 50, 100] as const;

/**
 * Market-sell 25 / 50 / 100% of a position with the chain's active sell
 * preset. Honors "confirm trades"; useSwap toasts the fill and refreshes
 * the portfolio. Each row owns its pending state.
 */
export function SellButtons({ row, size = 'xs', className }: { row: TokenPositionRow; size?: 'xs' | 'sm'; className?: string }) {
  const trade = useTradeSettings(row.chain);
  const { confirmTrades } = useDisplaySettings();
  const { swap, pending } = useSwap();
  const [active, setActive] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const symbol = row.tokenInfo.symbol;

  const run = (pct: number) =>
    requireAuth(() => {
      setActive(pct);
      setConfirm(null);
      void swap({ chain: row.chain, token: row.token, side: 'sell', amount: pct, amountKind: 'percent', presetId: trade.activeSellPreset }, { symbol }).finally(() =>
        setActive(null),
      );
    });

  return (
    // Stop clicks here (and in the portaled dialog, which bubbles through React) from reaching row handlers.
    <div className={clsx('flex items-center justify-end gap-1', className)} data-row-ignore onClick={(e) => e.stopPropagation()}>
      {QUICK_SELL_PERCENTS.map((pct) => (
        <button
          key={pct}
          type="button"
          disabled={pending}
          aria-label={`Sell ${pct}% of ${symbol}`}
          title={`Market sell ${pct}% (${trade.activeSellPreset})`}
          onClick={(e) => {
            e.stopPropagation();
            if (confirmTrades) setConfirm(pct);
            else run(pct);
          }}
          className={clsx(
            'num inline-flex shrink-0 items-center justify-center rounded border border-down/30 bg-down/10 font-semibold text-down transition-colors hover:border-down/60 hover:bg-down/20 disabled:cursor-wait disabled:opacity-60',
            size === 'xs' ? 'h-6 min-w-[40px] px-1.5 text-xs' : 'h-8 min-w-[52px] flex-1 px-2 text-sm',
          )}
        >
          {active === pct ? <Spinner size={11} label="" /> : `${pct}%`}
        </button>
      ))}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm !== null && run(confirm)}
        title={`Sell ${confirm ?? ''}% of ${symbol}?`}
        description={`Market sell with sell preset ${trade.activeSellPreset}. Paper trade — no real funds.`}
        confirmLabel="Sell"
        tone="sell"
        pending={pending}
      />
    </div>
  );
}
