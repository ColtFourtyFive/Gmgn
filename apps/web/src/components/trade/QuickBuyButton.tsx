import type { MouseEvent } from 'react';
import { formatNative, type ChainId } from '@trenchscope/shared';
import { Zap } from 'lucide-react';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Spinner';
import { useTradeSettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { nativeSymbol } from '@/lib/chain';
import { requireAuth } from '@/store/session';

export interface QuickBuyButtonProps {
  chain: ChainId;
  /** Token address. */
  token: string;
  /** Symbol for the result toast. */
  symbol?: string;
  /** Native amount; defaults to settings.trade[chain].instantBuyAmount. */
  amount?: number;
  size?: 'xs' | 'sm';
  /** `soft` (tinted, for dense rows) or `solid`. */
  variant?: 'soft' | 'solid';
  className?: string;
}

/**
 * One-click market buy ("⚡ 0.5") with the active buy preset. Prompts sign-in
 * when signed out, shows a spinner while executing and toasts the fill.
 * Click propagation is stopped so it works inside clickable rows and cards.
 */
export function QuickBuyButton({ chain, token, symbol, amount, size = 'xs', variant = 'soft', className }: QuickBuyButtonProps) {
  const trade = useTradeSettings(chain);
  const { swap, pending } = useSwap();
  const value = amount ?? trade.instantBuyAmount;

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    requireAuth(() => {
      void swap({ chain, token, side: 'buy', amount: value, amountKind: 'native', presetId: trade.activeBuyPreset }, { symbol });
    });
  };

  return (
    <button
      type="button"
      data-quick-buy
      onClick={onClick}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`Buy ${formatNative(value, nativeSymbol(chain))}${symbol ? ` of ${symbol}` : ''}`}
      title={`Instant buy ${formatNative(value, nativeSymbol(chain))}`}
      className={clsx(
        'num inline-flex shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded font-semibold transition-colors disabled:cursor-wait',
        size === 'xs' ? 'h-6 min-w-[52px] px-1.5 text-xs' : 'h-7 min-w-[60px] px-2 text-sm',
        variant === 'solid' ? 'bg-up text-up-fg hover:brightness-110' : 'border border-up/30 bg-up/10 text-up hover:border-up/60 hover:bg-up/20',
        className,
      )}
    >
      {pending ? <Spinner size={12} label="" /> : <Zap size={size === 'xs' ? 11 : 12} className="fill-current" aria-hidden />}
      {formatNative(value)}
    </button>
  );
}
