// Trade panel: Buy / Sell, order type (Market | Limit | Auto), execution
// preset with inline editor (and a congestion hint when its priority fee is
// below the suggestion), then the form of the selected order type.

import { useEffect, useRef, useState } from 'react';
import { CHAINS, PLATFORM_FEE_RATE, formatPercent, type Position, type PresetId, type TokenDetail, type UserSettings, PRESET_LABELS } from '@trenchscope/shared';
import { FlaskConical } from 'lucide-react';
import clsx from 'clsx';
import { Tabs } from '@/components/ui';
import { useDeposit } from '@/components/layout/AccountControls';
import { useHotkeys } from '@/hooks/useHotkeys';
import { scrollBehavior } from '@/hooks/useMediaQuery';
import { useDisplaySettings, useTradeSettings } from '@/hooks/useSettings';
import type { DeepPartial } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { feeReserve, maxBuyAmount } from '../model';
import { useChartUnit } from '../queries';
import { useTokenUi, type TradeMode, type TradeSide } from '../store';
import { AutoForm } from './AutoForm';
import { CongestionHint } from './CongestionHint';
import { LimitForm } from './LimitForm';
import { MarketForm } from './MarketForm';
import { PresetBar, savePreset } from './PresetBar';
import type { TradeFormProps } from './shared';

const MODE_ITEMS: { value: TradeMode; label: string; title: string }[] = [
  { value: 'market', label: 'Market', title: 'Execute now at the market price' },
  { value: 'limit', label: 'Limit', title: 'Buy or sell when price / market cap reaches a trigger' },
  { value: 'auto', label: 'Auto', title: 'Exit strategies, dev-sell and migration triggers' },
];

export interface TradePanelProps {
  token: TokenDetail;
  position: Position | null;
  className?: string;
}

export function TradePanel({ token, position, className }: TradePanelProps) {
  const chain = token.chain;
  const side = useTokenUi((s) => s.side);
  const mode = useTokenUi((s) => s.mode);
  const focusTick = useTokenUi((s) => s.focusTick);
  const { setSide, setMode } = useTokenUi.getState();
  const trade = useTradeSettings(chain);
  const display = useDisplaySettings();
  const signedIn = useSession((s) => !!s.token);
  const wallet = useSession((s) => s.account?.wallets[chain] ?? null);
  const [unit] = useChartUnit();
  const { deposit, pending: topUpPending } = useDeposit(chain);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active preset per side: saved in settings when signed in, local otherwise.
  const savedPreset = side === 'buy' ? trade.activeBuyPreset : trade.activeSellPreset;
  const [localPreset, setLocalPreset] = useState<Record<TradeSide, PresetId | null>>({ buy: null, sell: null });
  const presetId = localPreset[side] ?? savedPreset;
  const preset = (side === 'buy' ? trade.buyPresets : trade.sellPresets)[presetId];

  const onPresetChange = (id: PresetId) => {
    setLocalPreset((p) => ({ ...p, [side]: id }));
    if (useSession.getState().token) {
      void useSession
        .getState()
        .saveSettings({ trade: { [chain]: side === 'buy' ? { activeBuyPreset: id } : { activeSellPreset: id } } } as DeepPartial<UserSettings>)
        .catch(() => undefined);
    }
  };

  const onRaiseSlippage = () => {
    const next = Math.min(0.5, Math.max(preset.slippage + 0.1, 0.3));
    savePreset(chain, side, presetId, { slippage: next, autoSlippage: false })
      .then(() => toast.info(`Slippage raised to ${Math.round(next * 100)}%`, `${side === 'buy' ? 'Buy' : 'Sell'} preset ${PRESET_LABELS[presetId]}`))
      .catch((err) => toast.error('Couldn’t update preset', errorMessage(err)));
  };

  // Hotkeys ask for focus (requests made before this panel mounted — e.g. the
  // phone bar switching to the Trade tab — only select the side).
  const mountTick = useRef(focusTick);
  useEffect(() => {
    if (focusTick === mountTick.current) return;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, [focusTick]);

  useHotkeys(
    {
      b: () => useTokenUi.getState().openTrade('buy'),
      s: () => useTokenUi.getState().openTrade('sell'),
    },
    { enabled: display.hotkeys },
  );

  const balance = signedIn && wallet ? wallet.nativeBalance : null;
  const reserve = preset ? feeReserve(CHAINS[chain].baseNetworkFee, preset.priorityFee, preset.tip, preset.antiMev) : 0;
  const maxBuy = balance === null ? null : maxBuyAmount(balance, reserve);

  const formProps: TradeFormProps = {
    token,
    side,
    presetId,
    preset,
    trade,
    position,
    signedIn,
    balance,
    maxBuy,
    inputRef,
    onTopUp: () => void deposit(),
    topUpPending,
    onRaiseSlippage,
  };

  return (
    <section ref={panelRef} aria-label="Trade" className={clsx('panel flex min-w-0 flex-col', className)}>
      <div
        role="radiogroup"
        aria-label="Side"
        className="grid grid-cols-2 gap-1 p-1.5 pb-0"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
          e.preventDefault();
          const next = side === 'buy' ? 'sell' : 'buy';
          setSide(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-side="${next}"]`)?.focus();
        }}
      >
        {(['buy', 'sell'] as const).map((s) => {
          const active = side === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-side={s}
              onClick={() => setSide(s)}
              className={clsx(
                'h-8 rounded text-sm font-semibold transition-colors',
                active ? (s === 'buy' ? 'bg-up text-up-fg' : 'bg-down text-down-fg') : 'bg-panel-2 text-muted hover:text-fg',
              )}
            >
              {s === 'buy' ? 'Buy' : 'Sell'}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-line px-1.5">
        <Tabs size="sm" value={mode} onChange={setMode} items={MODE_ITEMS} aria-label="Order type" className="border-b-0" />
        {preset && <PresetBar chain={chain} side={side} presetId={presetId} onPresetChange={onPresetChange} preset={preset} />}
      </div>
      {preset && <CongestionHint chain={chain} side={side} presetId={presetId} preset={preset} />}
      <div className="p-2.5">
        {mode === 'market' && <MarketForm {...formProps} />}
        {mode === 'limit' && <LimitForm {...formProps} defaultTrigger={unit} />}
        {mode === 'auto' && <AutoForm {...formProps} />}
      </div>
      <p className="flex items-center gap-1 border-t border-line px-2.5 py-1.5 text-2xs text-faint">
        <FlaskConical size={11} className="text-accent" aria-hidden />
        Paper trading on simulated markets · {formatPercent(PLATFORM_FEE_RATE, { sign: false, digits: 1 })} platform fee
      </p>
    </section>
  );
}
