// Wallet page card grid: PnL (+ daily calendar), Analysis (style + copy
// score + behaviour stats) and PnL distribution, for the selected period.

import { memo, type ReactNode } from 'react';
import { formatDuration, formatInt, formatPercent, formatUsd, type WalletPeriod, type WalletPeriodStats, type WalletStyle } from '@trenchscope/shared';
import { CalendarDays, ChartColumn, Gauge, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Compact, FlashValue, Pct, Usd } from '@/components/common';
import { Panel, Tooltip } from '@/components/ui';
import { CopyScoreGauge, StyleBadges, StyleTitle } from './StyleBits';
import { distributionTotal, PNL_BUCKETS } from './utils';

export const PERIOD_LABEL: Record<WalletPeriod, string> = { '1d': '1D', '7d': '7D', '30d': '30D', all: 'All' };

function Stat({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className="truncate text-xs text-muted" title={hint}>
        {label}
      </dt>
      <dd className="num min-w-0 truncate text-md font-semibold text-fg">{children}</dd>
    </div>
  );
}

/** Wins vs losses split bar with counts. */
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const w = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-panel-3" aria-hidden>
        {total > 0 && (
          <>
            <span className="h-full bg-up" style={{ width: `${w}%` }} />
            <span className="h-full flex-1 bg-down" />
          </>
        )}
      </div>
      <div className="flex justify-between text-2xs">
        <span className="num text-up">{formatInt(wins)} won</span>
        <span className="num text-down">{formatInt(losses)} lost</span>
      </div>
    </div>
  );
}

const DAY_FMT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Daily realized PnL heatmap: 7 columns by UTC weekday, green/red by sign, intensity by size. */
export const PnlCalendar = memo(function PnlCalendar({ days }: { days: WalletPeriodStats['dailyPnl'] }) {
  if (days.length === 0) return null;
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnlUsd)), 1e-9);
  const lead = (new Date(days[0].day).getUTCDay() + 6) % 7;
  const green = days.filter((d) => d.pnlUsd > 0).length;
  const red = days.filter((d) => d.pnlUsd < 0).length;
  const last = days[days.length - 1].day;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted">
          <CalendarDays size={12} /> Daily realized PnL <span className="text-faint">(UTC)</span>
        </span>
        <span className="num text-muted">
          <span className="text-up">{green}</span> / <span className="text-down">{red}</span> / {days.length} days
        </span>
      </div>
      <div className="grid w-full max-w-[260px] grid-cols-7 gap-[3px] self-center" role="list" aria-label="Daily realized PnL calendar">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-2xs text-faint" aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const strength = Math.pow(Math.abs(d.pnlUsd) / maxAbs, 0.6);
          const alpha = d.pnlUsd === 0 ? 0 : 0.2 + 0.7 * strength;
          const tone = d.pnlUsd > 0 ? 'up' : 'down';
          const date = new Date(d.day);
          return (
            <Tooltip
              key={d.day}
              anchorClassName="w-full"
              content={
                <span className="flex flex-col">
                  <span className="text-muted">{date.toLocaleDateString('en-US', DAY_FMT)}</span>
                  <Usd value={d.pnlUsd} colored signed />
                </span>
              }
            >
              <span
                role="listitem"
                tabIndex={0}
                aria-label={`${date.toLocaleDateString('en-US', DAY_FMT)}: ${formatUsd(d.pnlUsd)}`}
                className={clsx(
                  'num flex aspect-square w-full items-center justify-center rounded-[4px] text-2xs',
                  // Translucent red tints read best with white text (down-fg is tuned for solid bg-down).
                  d.pnlUsd === 0 ? 'bg-panel-3 text-muted' : strength > 0.55 ? (tone === 'up' ? 'text-up-fg' : 'text-white') : 'text-fg',
                  d.day === last && 'ring-1 ring-accent',
                )}
                style={d.pnlUsd === 0 ? undefined : { backgroundColor: `rgb(var(--${tone}) / ${alpha.toFixed(2)})` }}
              >
                {date.getUTCDate()}
              </span>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export interface PnlCardProps {
  stats: WalletPeriodStats;
  period: WalletPeriod;
  className?: string;
}

export const PnlCard = memo(function PnlCard({ stats: s, period, className }: PnlCardProps) {
  return (
    <Panel title="PnL" subtitle={PERIOD_LABEL[period]} icon={<Wallet size={14} />} className={className} bodyClassName="flex flex-col gap-3">
      <div>
        <div className="text-xs text-muted">Realized PnL</div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <FlashValue value={s.realizedPnlUsd}>
            <Usd value={s.realizedPnlUsd} colored signed className="text-2xl font-bold" />
          </FlashValue>
          <Pct value={s.totalCostUsd > 0 ? s.pnlRate : null} className="text-md font-semibold" />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Unrealized PnL" hint="Paper PnL of positions still held, at the current price">
          <FlashValue value={s.unrealizedPnlUsd}>
            <Usd value={s.unrealizedPnlUsd} colored signed />
          </FlashValue>
        </Stat>
        <Stat label="Total PnL" hint="Realized + unrealized">
          <FlashValue value={s.totalPnlUsd}>
            <Usd value={s.totalPnlUsd} colored signed />
          </FlashValue>
        </Stat>
        <Stat label="Win rate" hint="Tokens with positive total PnL / tokens traded">
          <Pct value={s.wins + s.losses > 0 ? s.winRate : null} sign={false} colored={false} />
        </Stat>
        <Stat label="Total cost" hint="USD spent buying in the period">
          <Usd value={s.totalCostUsd} />
        </Stat>
      </dl>
      {/* Outside the <dl>: a definition list may only hold term / description groups. */}
      <WinLossBar wins={s.wins} losses={s.losses} />
      <div className="border-t border-line pt-3">
        <PnlCalendar days={s.dailyPnl} />
      </div>
    </Panel>
  );
});

export interface AnalysisCardProps {
  stats: WalletPeriodStats;
  style: WalletStyle;
  period: WalletPeriod;
  className?: string;
}

export const AnalysisCard = memo(function AnalysisCard({ stats: s, style, period, className }: AnalysisCardProps) {
  return (
    <Panel title="Analysis" subtitle={PERIOD_LABEL[period]} icon={<Gauge size={14} />} className={className} bodyClassName="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Trading style · 7D</span>
          <StyleTitle style={style} />
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <span className="text-2xs uppercase tracking-wide text-faint">Copy score</span>
          <CopyScoreGauge score={style.copyScore} size={104} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-3">
        <Stat label="Tokens traded">{formatInt(s.tokensTraded)}</Stat>
        <Stat label="Buys / Sells">
          <span className="text-up">{formatInt(s.buys)}</span>
          <span className="text-faint"> / </span>
          <span className="text-down">{formatInt(s.sells)}</span>
        </Stat>
        <Stat label="Avg hold" hint="Average holding time per token">
          {s.tokensTraded > 0 ? formatDuration(s.avgHoldSeconds) : '--'}
        </Stat>
        <Stat label="Buy volume">
          <Usd value={s.buyVolumeUsd} />
        </Stat>
        <Stat label="Sell volume">
          <Usd value={s.sellVolumeUsd} />
        </Stat>
        <Stat label="Avg buy" hint="Average USD size of one buy">
          <Usd value={s.buys > 0 ? s.avgBuyUsd : null} />
        </Stat>
      </dl>
      {style.badges.length > 0 && (
        <div className="border-t border-line pt-3">
          <StyleBadges badges={style.badges} detailed />
        </div>
      )}
    </Panel>
  );
});

export interface DistributionCardProps {
  stats: WalletPeriodStats;
  period: WalletPeriod;
  className?: string;
}

/**
 * Tokens per return bucket as horizontal bars. Counts tokens, not dollars.
 * The server buckets each token by realized + current unrealized PnL over its
 * cost (WalletPeriodStats.distribution), so open positions count at their mark.
 */
export const DistributionCard = memo(function DistributionCard({ stats: s, period, className }: DistributionCardProps) {
  const d = s.distribution;
  const total = distributionTotal(d);
  const max = Math.max(1, ...PNL_BUCKETS.map((b) => d[b.key]));
  return (
    <Panel title="Distribution" subtitle={PERIOD_LABEL[period]} icon={<ChartColumn size={14} />} className={className} bodyClassName="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">Tokens by return</span>
        <span className="text-xs text-muted">
          <Compact value={total} className="font-semibold text-fg" /> tokens
        </span>
      </div>
      {/* Stacked overview bar */}
      <div className="flex h-2 overflow-hidden rounded-full bg-panel-3" aria-hidden>
        {total > 0 &&
          PNL_BUCKETS.map((b) =>
            d[b.key] > 0 ? (
              <span key={b.key} className="h-full" style={{ width: `${(d[b.key] / total) * 100}%`, backgroundColor: `rgb(var(--${b.tone}) / ${0.3 + 0.7 * b.strength})` }} />
            ) : null,
          )}
      </div>
      <ul className="flex flex-col gap-2">
        {PNL_BUCKETS.map((b) => {
          const n = d[b.key];
          return (
            <li key={b.key} className="grid grid-cols-[84px_1fr_64px] items-center gap-2 text-xs">
              <span className={clsx('flex items-center gap-1.5 whitespace-nowrap', b.tone === 'up' ? 'text-up' : 'text-down')}>
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: `rgb(var(--${b.tone}) / ${0.3 + 0.7 * b.strength})` }} aria-hidden />
                <span className="num">{b.label}</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-sm bg-panel-3" aria-hidden>
                <span className="block h-full rounded-sm transition-[width] duration-500" style={{ width: `${(n / max) * 100}%`, backgroundColor: `rgb(var(--${b.tone}) / ${0.3 + 0.7 * b.strength})` }} />
              </span>
              <span className="num text-right text-fg">
                {formatInt(n)} <span className="text-faint">({formatPercent(total > 0 ? n / total : 0, { sign: false, digits: 0 })})</span>
              </span>
            </li>
          );
        })}
      </ul>
      {total === 0 && <p className="text-center text-xs text-muted">No tokens traded in this period.</p>}
      <p className="mt-auto text-2xs leading-snug text-faint">
        Tokens grouped by total return (realized + unrealized) on cost: open positions count at their current value, so this is not a win count.
      </p>
    </Panel>
  );
});
