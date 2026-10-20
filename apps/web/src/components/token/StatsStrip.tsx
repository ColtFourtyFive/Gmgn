// KPI strip: price, market cap, ATH, liquidity, holders, 24h volume, then
// rolling windows (1m..24h) with change, buy/sell counts and volumes, net
// flow and makers for the selected window.

import { memo, type ReactNode } from 'react';
import { STAT_WINDOWS, type StatWindow, type TokenDetail } from '@trenchscope/shared';
import clsx from 'clsx';
import { Compact, FlashValue, Pct, Price, Usd } from '@/components/common';
import { BuySellBar } from '@/components/discovery';
import { Tooltip } from '@/components/ui';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { nativeSymbol } from '@/lib/chain';

function Kpi({ label, children, sub, hint, className }: { label: string; children: ReactNode; sub?: ReactNode; hint?: string; className?: string }) {
  const head = <span className={clsx('text-2xs uppercase tracking-wide text-faint', hint && 'cursor-help')}>{label}</span>;
  return (
    <div className={clsx('flex min-w-0 flex-col', className)}>
      {hint ? (
        <Tooltip content={hint} anchorClassName="min-w-0">
          <span tabIndex={0}>{head}</span>
        </Tooltip>
      ) : (
        head
      )}
      <span className="num truncate text-md font-semibold leading-5 text-fg">{children}</span>
      {sub && <span className="num truncate text-2xs text-muted">{sub}</span>}
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-2xs text-faint">{label}</span>
      <span className="num truncate text-sm text-fg">{children}</span>
    </div>
  );
}

export const StatsStrip = memo(function StatsStrip({ token: t, className }: { token: TokenDetail; className?: string }) {
  const [win, setWin] = useLocalStorage<StatWindow>('ts.token.window', '5m');
  const w = t.stats[win] ?? t.stats['5m'];
  const belowAth = t.athMarketCapUsd > 0 ? t.marketCapUsd / t.athMarketCapUsd - 1 : null;
  const net = w.buyVolumeUsd - w.sellVolumeUsd;
  const sym = nativeSymbol(t.chain);

  return (
    <section className={clsx('panel flex min-w-0 flex-col', className)} aria-label="Market stats">
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 p-2.5 sm:grid-cols-6 sm:p-3">
        <Kpi label="Price" sub={<Price value={t.priceNative} symbol={sym} />}>
          <FlashValue value={t.priceUsd}>
            <Price value={t.priceUsd} />
          </FlashValue>
        </Kpi>
        <Kpi label="Market cap" sub={<Pct value={t.stats['24h'].priceChange} arrow />}>
          <FlashValue value={t.marketCapUsd}>
            <Usd value={t.marketCapUsd} />
          </FlashValue>
        </Kpi>
        <Kpi
          label="ATH MC"
          hint="All-time-high market cap and how far the token trades below it."
          sub={belowAth !== null && belowAth < -0.0005 ? <Pct value={belowAth} digits={1} /> : <span className="text-up">At ATH</span>}
        >
          <Usd value={t.athMarketCapUsd} />
        </Kpi>
        <Kpi label="Liquidity" sub={t.pool ? `${t.pool.dex}` : 'Curve'}>
          <Usd value={t.liquidityUsd} />
        </Kpi>
        <Kpi label="Holders" sub={<>{t.smartDegenCount} smart · {t.kolCount} KOL</>}>
          <FlashValue value={t.holderCount}>
            <Compact value={t.holderCount} digits={1} />
          </FlashValue>
        </Kpi>
        <Kpi label="24h volume" sub={<Compact value={t.stats['24h'].swaps} suffix=" swaps" />}>
          <Usd value={t.stats['24h'].volumeUsd} />
        </Kpi>
      </div>
      <div className="border-t border-line">
        <div role="tablist" aria-label="Stats window" className="grid grid-cols-5">
          {STAT_WINDOWS.map((k) => {
            const active = k === win;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setWin(k)}
                className={clsx(
                  'flex flex-col items-center gap-0 border-b-2 py-1 transition-colors',
                  active ? 'border-accent bg-panel-2' : 'border-transparent hover:bg-panel-2/60',
                )}
              >
                <span className={clsx('text-2xs font-medium', active ? 'text-fg' : 'text-muted')}>{k}</span>
                <Pct value={t.stats[k].priceChange} digits={1} className="text-xs font-semibold" />
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-2.5 py-2 sm:grid-cols-4 sm:px-3">
          <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="flex items-center justify-between text-2xs text-faint">
              <span>
                Buys <span className="num text-up">{w.buys}</span>
              </span>
              <span>
                Sells <span className="num text-down">{w.sells}</span>
              </span>
            </span>
            <BuySellBar buys={w.buys} sells={w.sells} />
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="flex items-center justify-between text-2xs text-faint">
              <span>
                Buy vol <Usd value={w.buyVolumeUsd} className="text-up" />
              </span>
              <span>
                Sell vol <Usd value={w.sellVolumeUsd} className="text-down" />
              </span>
            </span>
            <BuySellBar buys={w.buyVolumeUsd} sells={w.sellVolumeUsd} />
          </div>
          <Metric label={`Net (${win})`}>
            <Usd value={net} colored signed />
          </Metric>
          <div className="grid grid-cols-2 gap-x-3">
            <Metric label="Volume">
              <Usd value={w.volumeUsd} />
            </Metric>
            <Metric label="Makers">
              <Compact value={w.makers} digits={1} />
            </Metric>
          </div>
        </div>
      </div>
    </section>
  );
});
