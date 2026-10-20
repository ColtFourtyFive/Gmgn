// Shared props and small pieces of the trade panel forms.

import type { ReactNode, RefObject } from 'react';
import type { ChainTradeSettings, Position, PresetId, TokenDetail, TradePreset } from '@trenchscope/shared';
import { CircleCheck, CircleX, TrendingUp } from 'lucide-react';
import { Compact, Native, Price } from '@/components/common';
import { Button } from '@/components/ui';
import { useSession } from '@/store/session';
import { swapErrorHint } from '../model';
import type { TradeSide } from '../store';
import type { TradeResult } from './useTradeExecutor';

export interface TradeFormProps {
  token: TokenDetail;
  side: TradeSide;
  presetId: PresetId;
  preset: TradePreset;
  trade: ChainTradeSettings;
  position: Position | null;
  signedIn: boolean;
  /** Native wallet balance (null signed out). */
  balance: number | null;
  /** Largest affordable buy after fees (null signed out). */
  maxBuy: number | null;
  inputRef: RefObject<HTMLInputElement>;
  onTopUp: () => void;
  topUpPending: boolean;
  /** One-click slippage bump offered after a slippage failure. */
  onRaiseSlippage: () => void;
}

/** Signed-out replacement for the submit button (quick start, or log in to an existing account). */
export function StartTradingCta({ label = 'Start paper trading' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Button variant="primary" block icon={<TrendingUp size={14} />} onClick={() => useSession.getState().promptAuth(true, 'quick')}>
        {label}
      </Button>
      <p className="text-center text-2xs text-muted">
        Instant guest account with a paper balance — no wallet, no real funds.{' '}
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => useSession.getState().promptAuth(true, 'login')}>
          Log in
        </button>
      </p>
    </div>
  );
}

/** Label/value line in summaries. */
export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted">{label}</span>
      <span className="num text-right text-fg">{children}</span>
    </div>
  );
}

/** Outcome of the last manual trade, inline under the submit button. */
export function TradeResultLine({ result, token, onRaiseSlippage, onDismiss }: { result: TradeResult | null; token: TokenDetail; onRaiseSlippage: () => void; onDismiss: () => void }) {
  if (!result) return null;
  if (result.ok) {
    const r = result.receipt;
    const buy = r.trade?.side !== 'sell';
    return (
      <div role="status" className="flex items-start gap-1.5 rounded border border-up/30 bg-up/5 px-2 py-1.5 text-xs">
        <CircleCheck size={13} className="mt-px shrink-0 text-up" aria-hidden />
        <p className="min-w-0 flex-1 text-muted">
          <span className="font-medium text-fg">{buy ? 'Bought' : 'Sold'}</span> <Compact value={r.tokenAmount} suffix={` ${token.symbol}`} className="text-fg" /> for{' '}
          <Native value={r.nativeAmount} chain={token.chain} className="text-fg" /> @ <Price value={r.priceUsd} className="text-fg" /> · <span className="num">{r.latencyMs}ms</span>
          {r.orders.length > 0 && <> · {r.orders.length} exit orders armed</>}
        </p>
        <button type="button" className="text-faint hover:text-fg" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
    );
  }
  const hint = swapErrorHint(result.error);
  return (
    <div role="alert" className="flex items-start gap-1.5 rounded border border-down/30 bg-down/5 px-2 py-1.5 text-xs">
      <CircleX size={13} className="mt-px shrink-0 text-down" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-down">{result.error}</p>
        {hint && <p className="mt-0.5 text-muted">{hint.text}</p>}
        {hint?.raiseSlippage && (
          <Button size="xs" variant="outline" className="mt-1" onClick={onRaiseSlippage}>
            Raise slippage
          </Button>
        )}
      </div>
      <button type="button" className="text-faint hover:text-fg" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
