// Early buyers (TK-E): the token's first 70 buyers as a grid of status
// squares (holding / added / sold part / sold all), a legend with counts and
// the share they still hold. Hover a square for the wallet, click to open it.
// Polled every 5s (GET .../early-buyers); viewer tags need the auth token.

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EARLY_BUYERS_LIMIT, formatDuration, formatPercent, shortAddress, type EarlyBuyer, type EarlyBuyersResponse, type EarlyBuyerStatus, type TokenDetail } from '@trenchscope/shared';
import { Sunrise } from 'lucide-react';
import clsx from 'clsx';
import { Compact, Usd, WalletTags } from '@/components/common';
import { ErrorState, Panel, Skeleton, Tooltip } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { useSession } from '@/store/session';
import { tokenKeys } from './queries';

export const EARLY_STATUS: Record<EarlyBuyerStatus, { label: string; token: string; hint: string }> = {
  holding: { label: 'Holding', token: 'up', hint: 'Still holds its first buy' },
  added: { label: 'Added', token: 'info', hint: 'Bought more since its first buy' },
  sold_part: { label: 'Sold part', token: 'warn', hint: 'Holds less than its first buy' },
  sold_all: { label: 'Sold all', token: 'down', hint: 'Sold everything' },
};

/** Square fill; sold-all squares are dimmed so the wallets still in stand out (the legend uses the same fill). */
const fill = (status: EarlyBuyerStatus) => `rgb(var(--${EARLY_STATUS[status].token}) / ${status === 'sold_all' ? 0.55 : 0.85})`;

/** Outline of sniper squares: the foreground colour, visible on every status fill. */
const SNIPER_RING = 'inset 0 0 0 1.5px rgb(var(--fg) / 0.85)';
const STATUS_ORDER: EarlyBuyerStatus[] = ['holding', 'added', 'sold_part', 'sold_all'];
const COUNT_KEY = { holding: 'holding', added: 'added', sold_part: 'soldPart', sold_all: 'soldAll' } as const;

/** "41 still holding · 12 sold all · hold 20.8% of supply" (still holding = anything above dust). */
export function earlySummaryLine(s: EarlyBuyersResponse['summary']): string {
  const still = s.holding + s.added + s.soldPart;
  return `${still} still holding · ${s.soldAll} sold all · hold ${formatPercent(s.holdRateTotal, { sign: false, digits: 1 })} of supply`;
}

function BuyerTip({ b, createdAt }: { b: EarlyBuyer; createdAt: number }) {
  const status = EARLY_STATUS[b.status];
  return (
    <span className="flex w-[230px] flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span className="num text-faint">#{b.rank}</span>
        <span className={clsx('truncate font-semibold', !b.walletLabel && 'num font-mono')}>{b.walletLabel ?? shortAddress(b.wallet, 4, 4)}</span>
        <WalletTags tags={b.walletTags} max={4} className="ml-auto shrink-0" />
      </span>
      <span className="text-muted">
        Bought <Usd value={b.boughtUsd} className="text-fg" /> · {formatDuration(Math.max(0, (b.firstBuyAt - createdAt) / 1000))} after launch
      </span>
      <span>
        <span style={{ color: `rgb(var(--${status.token}))` }}>{status.label}</span>
        <span className="text-muted">
          {' '}
          · holds <Compact value={b.balance} /> ({formatPercent(b.holdRate, { sign: false, digits: b.holdRate < 0.001 ? 3 : 2 })})
        </span>
      </span>
      <span className="text-muted">
        PnL <Usd value={b.realizedPnlUsd} colored signed /> realized · <Usd value={b.unrealizedPnlUsd} colored signed /> open
      </span>
    </span>
  );
}

/** One square: status colour, sniper outline, "D" for the dev; links to the wallet. */
const BuyerSquare = memo(function BuyerSquare({ b, chain, createdAt }: { b: EarlyBuyer; chain: TokenDetail['chain']; createdAt: number }) {
  const status = EARLY_STATUS[b.status];
  const sniper = b.walletTags.includes('sniper');
  return (
    <Tooltip content={<BuyerTip b={b} createdAt={createdAt} />} delay={80} anchorClassName="w-full">
      <Link
        to={routes.wallet(chain, b.wallet)}
        aria-label={`#${b.rank} ${b.walletLabel ?? shortAddress(b.wallet)}: ${status.label}`}
        className="flex aspect-square w-full items-center justify-center rounded-[3px] text-[9px] font-bold leading-none text-black/70 transition-transform hover:scale-125 focus-visible:scale-125"
        style={{
          backgroundColor: fill(b.status),
          boxShadow: sniper ? SNIPER_RING : undefined,
        }}
      >
        {b.walletTags.includes('dev') ? 'D' : null}
      </Link>
    </Tooltip>
  );
});

export const EarlyBuyers = memo(function EarlyBuyers({ token, className }: { token: TokenDetail; className?: string }) {
  const viewer = useSession((s) => !!s.token);
  const q = useQuery({
    queryKey: tokenKeys.earlyBuyers(token.chain, token.address, viewer),
    queryFn: () => api.earlyBuyers(token.chain, token.address),
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 1,
  });
  const data = q.data;
  const s = data?.summary;

  return (
    <Panel className={className} title="Early buyers" icon={<Sunrise size={14} />} subtitle={data ? `first ${data.buyers.length}` : undefined}>
      {q.isError && !data ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : !data || !s ? (
        <Skeleton className="h-[104px]" />
      ) : data.buyers.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">No buys yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-[3px]" aria-label={`First ${data.buyers.length} buyers`}>
            {data.buyers.map((b) => (
              <li key={b.wallet} className="flex">
                <BuyerSquare b={b} chain={token.chain} createdAt={token.createdAt} />
              </li>
            ))}
            {Array.from({ length: Math.max(0, EARLY_BUYERS_LIMIT - data.buyers.length) }, (_, i) => (
              <li key={`slot${i}`} aria-hidden className="aspect-square rounded-[3px] border border-dashed border-line" />
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Status counts">
            {STATUS_ORDER.map((k) => (
              <li key={k} className="flex items-center gap-1" title={EARLY_STATUS[k].hint}>
                <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: fill(k) }} />
                <span className="text-muted">{EARLY_STATUS[k].label}</span>
                <span className="num font-medium text-fg">{s[COUNT_KEY[k]]}</span>
              </li>
            ))}
            <li className="flex items-center gap-1 text-muted" title="Sniper wallets (bought in the first blocks)">
              <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ boxShadow: SNIPER_RING }} />
              Sniper
            </li>
          </ul>
          <p className="num text-xs text-fg">{earlySummaryLine(s)}</p>
        </div>
      )}
    </Panel>
  );
});
