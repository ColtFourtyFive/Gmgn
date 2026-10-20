// Call-out rows: desktop grid rows under a sticky header, stacked cards on
// phones. Each call: caller (→ wallet page), token, MC at the call, the best
// multiple since (green from 2x), the multiple now, age and a quick buy.

import { memo, type ReactNode } from 'react';
import type { Signal } from '@trenchscope/shared';
import { ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { Age, TokenLink, Usd } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Badge, Tooltip } from '@/components/ui';
import { CALL_HIT_MULTIPLE, Multiple, WalletCell } from '@/components/wallet';
import { callerOf } from './callerStats';
import type { CallerInfo } from './useCallouts';

export const CALL_GRID = 'md:grid md:grid-cols-[56px_minmax(170px,1.3fr)_minmax(150px,1.2fr)_minmax(92px,0.7fr)_minmax(84px,0.6fr)_minmax(72px,0.5fr)_68px] md:items-center md:gap-x-3';

const nowMultiple = (s: Signal) => (s.marketCapAtTrigger > 0 ? s.token.marketCapUsd / s.marketCapAtTrigger : null);

function Token({ s }: { s: Signal }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <TokenLink token={s.token} size={22} />
      {s.token.riskLevel === 'high' && (
        <Tooltip content="High rug risk (concentration, insiders, bundlers or honeypot)">
          <ShieldAlert size={13} className="shrink-0 text-down" aria-label="High rug risk" tabIndex={0} />
        </Tooltip>
      )}
      {s.maxMultiple >= CALL_HIT_MULTIPLE && (
        <Badge tone="up" className="shrink-0" title="Reached at least 2x the market cap at the call">
          Hit
        </Badge>
      )}
    </span>
  );
}

export interface CallRowProps {
  call: Signal;
  caller: CallerInfo | null;
  buyAmount: number;
  fresh: boolean;
  mobile: boolean;
}

/** One call. */
export const CallRow = memo(function CallRow({ call: s, caller, buyAmount, fresh, mobile }: CallRowProps) {
  const address = callerOf(s);
  const who = <WalletCell chain={s.chain} address={address} label={caller?.label} tags={caller?.tags} dense maxTags={2} preview={!mobile} />;
  const qb = <QuickBuyButton chain={s.chain} token={s.token.address} symbol={s.token.symbol} amount={buyAmount} />;
  const rowClass = clsx('border-b border-l-2 border-b-line/60 transition-colors hover:bg-panel-2', s.maxMultiple >= CALL_HIT_MULTIPLE ? 'border-l-up/60' : 'border-l-kol/40', fresh && 'animate-slide-in');

  if (mobile)
    return (
      <li className={clsx(rowClass, 'flex flex-col gap-1.5 px-3 py-2')}>
        <span className="flex min-w-0 items-center justify-between gap-2">
          {who}
          <Age ts={s.createdAt} suffix=" ago" className="shrink-0 text-xs text-muted" />
        </span>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <Token s={s} />
          {qb}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>
            Called at <Usd value={s.marketCapAtTrigger} className="text-fg" />
          </span>
          <span>
            Max <Multiple value={s.maxMultiple} />
          </span>
          <span>
            Now <Multiple value={nowMultiple(s)} />
          </span>
        </span>
      </li>
    );

  return (
    <li className={clsx(rowClass, CALL_GRID, 'px-3 py-1.5 text-sm')}>
      <Age ts={s.createdAt} className="text-xs text-muted" />
      {who}
      <Token s={s} />
      <Usd value={s.marketCapAtTrigger} className="text-right" />
      <Multiple value={s.maxMultiple} className="text-right" />
      <Multiple value={nowMultiple(s)} className="text-right text-xs" />
      <span className="flex justify-end">{qb}</span>
    </li>
  );
});

/** Column header for the desktop grid. */
export function CallHeader({ children }: { children?: ReactNode }) {
  return (
    <div className={clsx(CALL_GRID, 'table-head sticky top-0 z-sticky hidden h-8 border-b border-line bg-panel px-3 md:grid')} role="presentation">
      <span>Age</span>
      <span>Caller</span>
      <span>Token</span>
      <span className="text-right">MC at call</span>
      <span className="text-right" title="Highest market cap since the call / market cap at the call">
        Max since
      </span>
      <span className="text-right">Now</span>
      <span className="text-right">{children ?? 'Buy'}</span>
    </div>
  );
}
