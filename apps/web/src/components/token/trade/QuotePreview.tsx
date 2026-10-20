// Debounced live quote under the amount fields: expected and minimum
// output, price impact (warn > 3%, danger > 10%), fees and route.

import type { ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AmountKind, ChainId, PresetId, Quote, Side } from '@trenchscope/shared';
import { Route, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { Compact, Native, Pct, Price, Usd } from '@/components/common';
import { Skeleton, Spinner } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { tokenKeys } from '../queries';

export interface QuoteParams {
  chain: ChainId;
  token: string;
  side: Side;
  amount: number | null;
  amountKind: AmountKind;
  presetId: PresetId;
}

/** Live quote for the current form values (debounced 300ms, refreshed every 4s). */
export function useLiveQuote(p: QuoteParams, enabled: boolean) {
  const signedIn = useSession((s) => !!s.token);
  const amount = useDebounce(p.amount, 300);
  const key = { chain: p.chain, token: p.token, side: p.side, amount, amountKind: p.amountKind, presetId: p.presetId };
  return useQuery<Quote>({
    queryKey: tokenKeys.quote(key),
    queryFn: () => api.quote({ chain: p.chain, token: p.token, side: p.side, amount: amount as number, amountKind: p.amountKind, presetId: p.presetId }),
    enabled: enabled && signedIn && amount !== null && amount > 0,
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    refetchInterval: 4_000,
    retry: false,
  });
}

export function impactTone(impact: number | null | undefined): 'ok' | 'warn' | 'danger' {
  if (!impact || impact <= 0.03) return 'ok';
  return impact > 0.1 ? 'danger' : 'warn';
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex min-w-0 items-center justify-between gap-2', className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="num min-w-0 truncate text-right text-fg">{children}</dd>
    </div>
  );
}

export interface QuotePreviewProps {
  query: ReturnType<typeof useLiveQuote>;
  chain: ChainId;
  symbol: string;
  side: Side;
  nativeUsd: number;
  signedIn: boolean;
  hasAmount: boolean;
}

export function QuotePreview({ query, chain, symbol, side, nativeUsd, signedIn, hasAmount }: QuotePreviewProps) {
  if (!signedIn) return <p className="rounded border border-dashed border-line px-2 py-1.5 text-xs text-muted">Live quotes (output, price impact, fees) appear once you start paper trading.</p>;
  if (!hasAmount) return null;
  const q = query.data;
  if (query.isError && !q) {
    return (
      <p role="status" className="flex items-center gap-1.5 rounded bg-panel-2 px-2 py-1.5 text-xs text-muted">
        <TriangleAlert size={12} className="shrink-0 text-warn" aria-hidden />
        {errorMessage(query.error, 'No quote available')}
      </p>
    );
  }
  if (!q) {
    return (
      <div className="flex flex-col gap-1.5 rounded bg-panel-2 p-2" aria-busy>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }
  const tone = impactTone(q.priceImpact);
  const buy = side === 'buy';
  const fees = q.platformFeeNative + q.networkFeeNative;
  return (
    <dl className={clsx('flex flex-col gap-1 rounded bg-panel-2 p-2 text-xs transition-opacity', query.isFetching && query.isPlaceholderData && 'opacity-60')} aria-live="polite">
      <Row label="You receive">
        <span className="font-semibold">
          ≈ {buy ? <Compact value={q.expectedOut} suffix={` ${symbol}`} /> : <Native value={q.expectedOut} chain={chain} />}
        </span>
      </Row>
      <Row label={`Min received (${q.slippage ? `${Math.round(q.slippage * 1000) / 10}%` : '—'} slip)`}>
        {buy ? <Compact value={q.minOut} suffix={` ${symbol}`} /> : <Native value={q.minOut} chain={chain} />}
      </Row>
      <Row label="Price impact">
        <span className={clsx('inline-flex items-center gap-1', tone === 'danger' ? 'font-semibold text-down' : tone === 'warn' ? 'text-warn' : 'text-fg')}>
          {tone !== 'ok' && <TriangleAlert size={11} aria-hidden />}
          <Pct value={q.priceImpact} sign={false} colored={false} digits={q.priceImpact < 0.01 ? 2 : 1} />
        </span>
      </Row>
      <Row label="Exec. price">
        <Price value={q.executionPriceUsd} />
      </Row>
      <Row label="Fees">
        <span title={`Platform ${q.platformFeeNative} + network ${q.networkFeeNative}`}>
          <Native value={fees} chain={chain} /> <span className="text-muted">(<Usd value={fees * nativeUsd} />)</span>
        </span>
      </Row>
      <Row label="Route">
        <span className="inline-flex items-center gap-1">
          <Route size={11} className="text-faint" aria-hidden />
          {q.venue}
          <span className="text-muted">· {q.route === 'curve' ? 'bonding curve' : 'AMM pool'}</span>
          {query.isFetching && <Spinner size={10} label="" />}
        </span>
      </Row>
      {tone === 'danger' && <p className="mt-0.5 text-2xs text-down">Very high impact — consider a smaller size or splitting the order.</p>}
    </dl>
  );
}
