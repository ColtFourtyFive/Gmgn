// "Sell initials": one click to take out what a position cost (its cost basis
// incl. fees, after earlier sells) and keep the rest of the bag as a free
// ride. The server sizes the sell (POST /trade/initials); it then goes through
// useQuickTrade like every one-click order (safety gates, "Confirm trades",
// fill toast). A bag worth less than it cost has nothing to take out: the
// action is unavailable and says why.

import { useId, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { formatPercent, type ChainId, type PresetId, type SellInitialsQuote } from '@trenchscope/shared';
import { HandCoins } from 'lucide-react';
import clsx from 'clsx';
import { Spinner } from '@/components/ui';
import { useTradeSettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { errorMessage, formatNativeFor } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';
import { useQuickTrade } from './useQuickTrade';

export const initialsKeys = {
  quote: (chain: ChainId, token: string, presetId: PresetId | undefined) => ['quote', 'initials', chain, token, presetId ?? null] as const,
};

/** Spinner key of the sell-initials quick order. */
export const SELL_INITIALS_KEY = 'sell-initials';

/** A fresh sizing (never a cached one: the sell must match the price now). */
export function fetchSellInitials(qc: QueryClient, chain: ChainId, token: string, presetId?: PresetId): Promise<SellInitialsQuote> {
  return qc.fetchQuery({ queryKey: initialsKeys.quote(chain, token, presetId), queryFn: () => api.sellInitials({ chain, token, presetId }), staleTime: 0 });
}

/** Why "sell initials" is unavailable for this quote (null when it can run). */
export function initialsUnavailableReason(q: Pick<SellInitialsQuote, 'status' | 'chain' | 'targetNative' | 'exitValueNative'>, symbol: string): string | null {
  switch (q.status) {
    case 'ok':
      return null;
    case 'under_water':
      return `Under water: selling all your ${symbol} now returns about ${formatNativeFor(q.chain, q.exitValueNative)} after fees, less than the ${formatNativeFor(q.chain, q.targetNative)} it cost. There is nothing to take out yet.`;
    case 'nothing_to_recover':
      return `This ${symbol} bag has no cost basis left to take out.`;
    default:
      return `You don’t hold ${symbol}.`;
  }
}

/** "Sells 42% (1.2M) for ≈ 0.52 SOL: your cost back, the rest rides free." */
export function initialsSummary(q: SellInitialsQuote, symbol: string): string {
  if (q.status !== 'ok' || q.tokens === null) return '';
  return `Sells ${formatPercent(q.sellRate ?? 0, { sign: false, digits: 1 })} of your ${symbol} for ≈ ${formatNativeFor(q.chain, q.expectedOutNative)}: your cost back, the rest rides free.`;
}

/** Live sizing for the trade panel (refreshed every few seconds while shown). */
export function useSellInitialsQuote(chain: ChainId, token: string, presetId: PresetId, enabled: boolean, balance: number) {
  return useQuery({
    // the balance in the key re-sizes right after a fill
    queryKey: [...initialsKeys.quote(chain, token, presetId), balance] as const,
    queryFn: () => api.sellInitials({ chain, token, presetId }),
    enabled: enabled && balance > 0,
    staleTime: 2_000,
    refetchInterval: enabled ? 5_000 : false,
    retry: 1,
  });
}

/**
 * The sell-initials action for one token: sizes it fresh, explains when it is
 * unavailable (toast), else runs it as a one-click sell. Render `dialog` once.
 */
export function useSellInitials(chain: ChainId, token: string, symbol: string) {
  const qc = useQueryClient();
  const trade = useTradeSettings(chain);
  const quick = useQuickTrade(chain, token, symbol);
  const [sizing, setSizing] = useState(false);

  const run = () =>
    requireAuth(() => {
      if (sizing || quick.pending) return;
      setSizing(true);
      fetchSellInitials(qc, chain, token, trade.activeSellPreset)
        .then((q) => {
          const reason = initialsUnavailableReason(q, symbol);
          if (reason || q.tokens === null) toast.info('Nothing to take out', reason ?? undefined);
          else quick.submit({ side: 'sell', tokens: q.tokens, label: `Sell initials (${formatPercent(q.sellRate ?? 0, { sign: false, digits: 0 })})`, key: SELL_INITIALS_KEY });
        })
        .catch((err: unknown) => toast.error('Couldn’t size the sell', errorMessage(err)))
        .finally(() => setSizing(false));
    });

  return { run, pending: sizing || quick.pending, active: sizing || quick.active === SELL_INITIALS_KEY, dialog: quick.dialog };
}

export interface SellInitialsButtonProps {
  chain: ChainId;
  token: string;
  symbol: string;
  /** The position is worth less than it cost (value <= cost basis): nothing to take out. */
  underWater: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Compact "Initials" button for positions views. Under water it stays focusable
 * but inert (aria-disabled) and its description says why; a click explains too.
 */
export function SellInitialsButton({ chain, token, symbol, underWater, size = 'xs', className }: SellInitialsButtonProps) {
  const action = useSellInitials(chain, token, symbol);
  const descId = useId();
  const why = `Under water: your ${symbol} is worth less than it cost, so there is nothing to take out yet.`;
  const hint = underWater ? why : `Sell just enough ${symbol} to get back what it cost (fees included) and keep the rest as a free ride.`;
  return (
    <>
      <button
        type="button"
        aria-disabled={underWater || action.pending || undefined}
        aria-label={`Sell initials of ${symbol}`}
        aria-describedby={descId}
        title={hint}
        onClick={(e) => {
          e.stopPropagation();
          if (underWater) toast.info('Nothing to take out', why);
          else action.run();
        }}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center gap-1 rounded border font-semibold transition-colors',
          underWater ? 'cursor-not-allowed border-line bg-panel-2 text-faint' : 'border-accent/40 bg-accent/10 text-accent hover:border-accent/70 hover:bg-accent/20',
          size === 'xs' ? 'h-6 px-1.5 text-xs' : 'h-8 px-2 text-sm',
          className,
        )}
      >
        {action.active ? <Spinner size={11} label="" /> : <HandCoins size={size === 'xs' ? 12 : 13} aria-hidden />}
        Initials
      </button>
      <span id={descId} className="sr-only">
        {hint}
      </span>
      {action.dialog}
    </>
  );
}
