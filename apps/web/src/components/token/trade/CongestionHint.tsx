// Network congestion hint under the trade panel's preset row. While the chain
// is busy or congested and the active preset bids below the suggested
// priority-fee tier, it says what that costs (docs/API.md "Landing under
// congestion": slower landing, and below the low tier while congested a
// 25-55% chance to expire) and offers to raise the preset to the suggestion.

import { CHAINS, type ChainId, type ChainMarketInfo, type PresetId, type TradePreset, PRESET_LABELS } from '@trenchscope/shared';
import { TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { Native } from '@/components/common';
import { useMeta } from '@/hooks/useMeta';
import { errorMessage } from '@/lib/format';
import { useChannelState } from '@/lib/ws';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';
import type { TradeSide } from '../store';
import { savePreset } from './PresetBar';

/** 'fail': may expire (congested, bid below the low tier); 'slow': lands late (busy or worse, below medium). */
export type FeeVerdict = 'fail' | 'slow' | null;

/** The server's rule: a preset bids its priority fee plus, on the anti-MEV route, its tip. */
export function feeVerdict(preset: TradePreset, market: ChainMarketInfo | undefined): FeeVerdict {
  const c = market?.congestion;
  if (!market || !c || c.label === 'normal') return null;
  const bid = preset.priorityFee + (preset.antiMev ? preset.tip : 0);
  if (c.label === 'congested' && bid < market.priorityFee.low) return 'fail';
  return bid < market.priorityFee.medium ? 'slow' : null;
}

/** Live market info of a chain: the `market` channel (5s), else /api/meta. */
export function useChainMarket(chain: ChainId): ChainMarketInfo | undefined {
  const live = useChannelState<ChainMarketInfo[]>('market', 'market');
  const meta = useMeta().data;
  return (live ?? meta?.chains)?.find((m) => m.chain === chain);
}

export interface CongestionHintProps {
  chain: ChainId;
  side: TradeSide;
  presetId: PresetId;
  preset: TradePreset;
}

export function CongestionHint({ chain, side, presetId, preset }: CongestionHintProps) {
  const market = useChainMarket(chain);
  const verdict = feeVerdict(preset, market);
  if (!verdict || !market) return null;
  const suggested = market.priorityFee.medium;
  const name = CHAINS[chain].name;

  const raise = () =>
    requireAuth(() => {
      savePreset(chain, side, presetId, { priorityFee: suggested })
        .then(() => toast.success(`Priority fee raised on ${PRESET_LABELS[presetId]}`, `${side === 'buy' ? 'Buy' : 'Sell'} preset now bids the suggested fee.`))
        .catch((err) => toast.error('Couldn’t update preset', errorMessage(err)));
    });

  // Only the verdict is a live region: the fee tiers move every 5s and would be re-announced.
  return (
    <div className={clsx('flex items-start gap-1.5 border-b border-line px-2.5 py-1.5 text-xs', verdict === 'fail' ? 'bg-down/10' : 'bg-warn/10')}>
      <TriangleAlert size={13} className={clsx('mt-px shrink-0', verdict === 'fail' ? 'text-down' : 'text-warn')} aria-hidden />
      <p className="min-w-0 flex-1 text-muted">
        {verdict === 'fail' ? (
          <>
            <span role="status">
              <span className="font-medium text-down">{name} is congested:</span> trades may fail to land.
            </span>{' '}
            {presetId} bids below the suggested <Native value={market.priorityFee.low} chain={chain} className="text-fg" /> minimum.
          </>
        ) : (
          <>
            <span role="status">
              <span className="font-medium text-warn">
                {name} is {market.congestion?.label}:
              </span>{' '}
              trades may land slowly.
            </span>{' '}
            {presetId} bids below the suggested <Native value={suggested} chain={chain} className="text-fg" />.
          </>
        )}
      </p>
      <button type="button" onClick={raise} className="shrink-0 font-medium text-accent hover:underline">
        Use <Native value={suggested} chain={chain} />
      </button>
    </div>
  );
}
