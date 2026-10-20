import { memo } from 'react';
import { Link } from 'react-router-dom';
import { shortAddress, type Signal } from '@trenchscope/shared';
import clsx from 'clsx';
import { Age, LaunchpadBadge, Pct, TokenLink, Usd, WalletAvatar } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { Tooltip } from '@/components/ui';
import { routes } from '@/lib/chain';
import { Multiple } from '@/components/wallet';
import { SIGNAL_META } from './meta';

const MAX_WALLETS = 5;

function Wallets({ signal }: { signal: Signal }) {
  const shown = signal.wallets.slice(0, MAX_WALLETS);
  const rest = signal.wallets.length - shown.length;
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wide text-faint">Wallets</span>
      <span className="flex items-center -space-x-1">
        {shown.map((w) => (
          <Tooltip key={w} content={shortAddress(w, 6, 6)}>
            <Link to={routes.wallet(signal.chain, w)} className="rounded ring-2 ring-panel transition-transform hover:z-[1] hover:scale-110" aria-label={`Wallet ${shortAddress(w)}`}>
              <WalletAvatar seed={w} size={18} />
            </Link>
          </Tooltip>
        ))}
      </span>
      {rest > 0 && <span className="num text-xs text-muted">+{rest}</span>}
    </span>
  );
}

export interface SignalCardProps {
  signal: Signal;
  buyAmount: number;
  fresh?: boolean;
}

/** One token signal: kind, token with current MC, what happened, MC at trigger, max/current multiple, wallets, quick buy. */
export const SignalCard = memo(function SignalCard({ signal: s, buyAmount, fresh }: SignalCardProps) {
  const meta = SIGNAL_META[s.kind];
  const Icon = meta.icon;
  const nowMultiple = s.marketCapAtTrigger > 0 ? s.token.marketCapUsd / s.marketCapAtTrigger : null;
  const hit = s.maxMultiple >= 2;
  const color = `rgb(var(--${meta.token}))`;
  return (
    <article
      className={clsx(
        'panel relative flex min-w-0 flex-col gap-2.5 overflow-hidden p-3 transition-colors hover:border-line-strong',
        fresh && 'animate-slide-in',
        hit && 'border-up/40',
      )}
      aria-label={`${meta.label}: ${s.token.symbol}`}
    >
      <span className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: color }} aria-hidden />
      <header className="flex items-center gap-2">
        <Tooltip content={meta.description}>
          <span className="chip font-semibold" style={{ color, backgroundColor: `rgb(var(--${meta.token}) / 0.14)` }} tabIndex={0}>
            <Icon size={12} aria-hidden />
            {s.title || meta.label}
          </span>
        </Tooltip>
        {meta.sentiment === 'bearish' && <span className="chip bg-down/10 text-down">Caution</span>}
        {hit && (
          <span className="chip bg-up/15 font-semibold text-up" title="Reached at least 2x the market cap at the signal">
            Hit 2x+
          </span>
        )}
        <Age ts={s.createdAt} suffix=" ago" className="ml-auto shrink-0 text-xs text-muted" />
      </header>

      <div className="flex min-w-0 items-center gap-2">
        <TokenLink token={s.token} size={32} showName className="min-w-0 flex-1" />
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="text-2xs text-faint">MC now</span>
          <Usd value={s.token.marketCapUsd} className="font-semibold text-fg" />
          <Pct value={s.token.priceChange24h} className="text-2xs" />
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.5em] text-sm leading-snug text-muted" title={s.detail}>
        {s.detail}
      </p>

      <dl className="grid grid-cols-3 gap-2 rounded border border-line bg-panel-2 px-2.5 py-1.5">
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint">MC at signal</dt>
          <dd>
            <Usd value={s.marketCapAtTrigger} className="text-sm font-medium" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint" title="Highest market cap since the signal / market cap at the signal">
            Max since
          </dt>
          <dd>
            <Multiple value={s.maxMultiple} className="text-sm" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-2xs text-faint">Now</dt>
          <dd>
            <Multiple value={nowMultiple} className="text-sm" />
          </dd>
        </div>
      </dl>

      <footer className="flex min-h-[24px] items-center gap-2">
        {s.wallets.length > 0 ? <Wallets signal={s} /> : <LaunchpadBadge launchpad={s.token.launchpad} />}
        <QuickBuyButton chain={s.chain} token={s.token.address} symbol={s.token.symbol} amount={buyAmount} className="ml-auto" />
      </footer>
    </article>
  );
});
