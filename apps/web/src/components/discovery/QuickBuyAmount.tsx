import { type ChainId } from '@trenchscope/shared';
import { Zap } from 'lucide-react';
import clsx from 'clsx';
import { NumberInput } from '@/components/ui';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTradeSettings } from '@/hooks/useSettings';
import { nativeSymbol } from '@/lib/chain';

/**
 * One-click buy amount for discovery lists. Starts at the account's
 * instant-buy amount and can be overridden per chain (kept in this browser).
 */
export function useQuickBuyAmount(chain: ChainId): [number, (v: number | null) => void] {
  const { instantBuyAmount } = useTradeSettings(chain);
  const [override, setOverride] = useLocalStorage<number | null>(`ts.discovery.qb.${chain}`, null);
  const amount = typeof override === 'number' && Number.isFinite(override) && override > 0 ? override : instantBuyAmount;
  return [amount, (v) => setOverride(v !== null && v > 0 ? v : null)];
}

export interface QuickBuyAmountProps {
  chain: ChainId;
  value: number;
  onChange: (v: number | null) => void;
  className?: string;
}

/** Compact "⚡ 0.5 SOL" field that sets the amount every quick-buy button on the page uses. */
export function QuickBuyAmount({ chain, value, onChange, className }: QuickBuyAmountProps) {
  return (
    <NumberInput
      size="sm"
      value={value}
      onChange={onChange}
      min={0}
      step={0.01}
      prefix={<Zap size={12} className="fill-current text-up" aria-hidden />}
      suffix={nativeSymbol(chain)}
      aria-label={`Quick buy amount (${nativeSymbol(chain)})`}
      title="Amount used by every quick-buy button on this page"
      wrapperClassName={clsx('!w-[118px]', className)}
      className="num font-semibold"
    />
  );
}
