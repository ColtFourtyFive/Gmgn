import { CHAIN_IDS, isChainId } from '@trenchscope/shared';
import { CHAIN_SHORT, ChainIcon } from '@/components/common';
import { SegmentedControl, type TabItem } from '@/components/ui';
import type { ChainScope } from './queries';

export interface ChainFilterProps {
  value: ChainScope;
  onChange: (value: ChainScope) => void;
  /** Optional count badges per chain (and "all"). */
  counts?: Partial<Record<ChainScope, number>>;
  size?: 'sm' | 'md';
  className?: string;
}

/** "All · SOL · BSC · Base · ETH" pill switcher for account pages. */
export function ChainFilter({ value, onChange, counts, size = 'sm', className }: ChainFilterProps) {
  const items: TabItem<ChainScope>[] = [
    { value: 'all', label: 'All', count: counts?.all },
    ...CHAIN_IDS.map((c) => ({ value: c, label: CHAIN_SHORT[c], icon: <ChainIcon chain={c} size={12} />, count: counts?.[c] })),
  ];
  return <SegmentedControl value={value} onChange={onChange} items={items} size={size} aria-label="Chain" className={className} />;
}

/** Parse a ?chain= search param into a scope ("all" when missing/unknown). */
export function parseScope(v: string | null): ChainScope {
  return isChainId(v) ? v : 'all';
}
