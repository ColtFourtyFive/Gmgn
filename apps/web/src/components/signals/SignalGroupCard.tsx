// One token in the grouped signal feed: the kinds it fired (stacked badges),
// what happened last, its market cap at the first signal versus now, how many
// times it fired (per kind in the tooltip), holders / top 10 / liquidity, and
// quick buy.

import { memo } from 'react';
import { formatInt, formatPercent, type SignalKind } from '@trenchscope/shared';
import clsx from 'clsx';
import { Age, Pct, TokenLink, Usd } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Tooltip } from '@/components/ui';
import { Multiple } from '@/components/wallet';
import type { SignalGroup } from './group';
import { SIGNAL_META, SIGNAL_ORDER } from './meta';

const MAX_BADGES = 3;

function KindBadge({ kind, count }: { kind: SignalKind; count: number }) {
  const meta = SIGNAL_META[kind];
  const Icon = meta.icon;
  return (
    <span className="chip font-semibold" style={{ color: `rgb(var(--${meta.token}))`, backgroundColor: `rgb(var(--${meta.token}) / 0.14)` }}>
      <Icon size={12} aria-hidden />
      {meta.label}
      {count > 1 && <span className="num font-normal">×{count}</span>}
    </span>
  );
}

export interface SignalGroupCardProps {
  group: SignalGroup;
  buyAmount: number;
  fresh?: boolean;
}

export const SignalGroupCard = memo(function SignalGroupCard({ group: g, buyAmount, fresh }: SignalGroupCardProps) {
  const s = g.latest;
  const token = s.token;
  const shown = g.kinds.slice(0, MAX_BADGES);
  const more = g.kinds.length - shown.length;
  const sinceFirst = g.firstTriggerMcUsd > 0 ? token.marketCapUsd / g.firstTriggerMcUsd : null;
  const byKind = SIGNAL_ORDER.filter((k) => (g.timesFiredByKind[k] ?? 0) > 0);
  const listed = (k: SignalKind) => g.signals.filter((x) => x.kind === k).length;
  return (
    <article
      className={clsx('panel relative flex min-w-0 flex-col gap-2.5 overflow-hidden p-3 transition-colors hover:border-line-strong', fresh && 'animate-slide-in', g.bearish && 'border-down/40')}
      aria-label={`${token.symbol}: ${g.signals.length} signal${g.signals.length === 1 ? '' : 's'}, latest ${SIGNAL_META[s.kind].label}`}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        {shown.map((k) => (
          <KindBadge key={k} kind={k} count={listed(k)} />
        ))}
        {more > 0 && <span className="chip bg-panel-3 text-muted">+{more}</span>}
        {g.bearish && <span className="chip bg-down/10 text-down">Caution</span>}
        <Age ts={s.createdAt} suffix=" ago" className="ml-auto shrink-0 text-xs text-muted" />
      </header>

      <div className="flex min-w-0 items-center gap-2">
        <TokenLink token={token} size={32} showName className="min-w-0 flex-1" />
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="text-2xs text-faint">MC now</span>
          <Usd value={token.marketCapUsd} className="font-semibold text-fg" />
          <Pct value={token.priceChange24h} className="text-2xs" />
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.5em] text-sm leading-snug text-muted" title={s.detail}>
        {s.detail}
      </p>

      <dl className="grid grid-cols-3 gap-2 rounded border border-line bg-panel-2 px-2.5 py-1.5">
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint" title="Market cap when the token fired its first signal">
            First signal MC
          </dt>
          <dd>
            <Usd value={g.firstTriggerMcUsd} className="text-sm font-medium" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint">Since first</dt>
          <dd>
            <Multiple value={sinceFirst} className="text-sm" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint">Fired</dt>
          <dd>
            <Tooltip
              content={
                <span className="flex flex-col">
                  {byKind.map((k) => (
                    <span key={k} className="flex justify-between gap-3">
                      <span>{SIGNAL_META[k].label}</span>
                      <span className="num">×{g.timesFiredByKind[k]}</span>
                    </span>
                  ))}
                </span>
              }
            >
              <button type="button" className="num text-sm font-medium text-fg underline decoration-dotted underline-offset-2" aria-label={`Fired ${g.timesFired} times: ${byKind.map((k) => `${SIGNAL_META[k].label} ${g.timesFiredByKind[k]}`).join(', ')}`}>
                ×{formatInt(g.timesFired)}
              </button>
            </Tooltip>
          </dd>
        </div>
      </dl>

      <footer className="flex min-h-[24px] items-center gap-2 text-2xs text-muted">
        {s.cur ? (
          <span className="num flex flex-wrap gap-x-2">
            <span>{formatInt(s.cur.holders)} holders</span>
            <span>Top10 {formatPercent(s.cur.top10, { sign: false, digits: 0 })}</span>
            <span>
              Liq <Usd value={s.cur.liquidityUsd} />
            </span>
          </span>
        ) : null}
        <QuickBuyButton chain={s.chain} token={token.address} symbol={token.symbol} amount={buyAmount} className="ml-auto" />
      </footer>
    </article>
  );
});
