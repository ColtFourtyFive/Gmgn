// Debounced live quote under the amount fields: expected and minimum
// output, price impact (warn > 3%, danger > 10%), fees and route.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, formatPercent, type AmountKind, type ChainId, type PresetId, type Quote, type Side } from '@trenchscope/shared';
import { Route, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { Compact, Native, Pct, Price, Usd } from '@/components/common';
import { Skeleton, Spinner } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import { errorMessage, formatNativeFor } from '@/lib/format';
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

/**
 * `amount` debounced while it is being edited, but applied at once when the
 * side or amount unit switches: the other side's (or unit's) amount must
 * never be quoted with the new side (0.5 SOL read as 0.5%, 25% as 25 SOL).
 */
function useDebouncedAmount(amount: number | null, context: string, delayMs: number): number | null {
  const [state, setState] = useState({ context, amount });
  const switched = state.context !== context;
  // Adjust while rendering, so no render ever pairs the new context with the old amount.
  if (switched) setState({ context, amount });
  const debounced = useDebounce(amount, delayMs);
  useEffect(() => {
    if (!switched) setState((s) => (s.amount === debounced ? s : { context, amount: debounced }));
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  return switched ? amount : state.amount;
}

type QuoteKey = { chain: ChainId; token: string; side: Side; amount: number | null; amountKind: AmountKind; presetId: PresetId };

/** Live quote for the current form values (amount debounced 300ms, refreshed every 4s). */
export function useLiveQuote(p: QuoteParams, enabled: boolean) {
  const signedIn = useSession((s) => !!s.token);
  const amount = useDebouncedAmount(p.amount, `${p.chain}:${p.token}:${p.side}:${p.amountKind}`, 300);
  const key: QuoteKey = { chain: p.chain, token: p.token, side: p.side, amount, amountKind: p.amountKind, presetId: p.presetId };
  return useQuery<Quote>({
    queryKey: tokenKeys.quote(key),
    queryFn: () => api.quote({ chain: p.chain, token: p.token, side: p.side, amount: amount as number, amountKind: p.amountKind, presetId: p.presetId }),
    enabled: enabled && signedIn && amount !== null && amount > 0,
    // Keep the previous quote while a new amount loads, but never across a
    // side/unit switch (it would show the other side's output in this side's units).
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey[1] as QuoteKey | undefined;
      return k && k.chain === p.chain && k.token === p.token && k.side === p.side && k.amountKind === p.amountKind ? prev : undefined;
    },
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

/**
 * What a screen reader hears: the quote once it settles after the user
 * changed the amount, side or preset, not every 4s refresh (the visible
 * block is not a live region, so active tokens do not chatter).
 */
function useQuoteAnnouncement(query: ReturnType<typeof useLiveQuote>, describe: (q: Quote) => string): string {
  const [text, setText] = useState('');
  const q = query.data;
  const settled = !!q && !query.isPlaceholderData;
  const shown = useRef(false);
  const awaiting = useRef(false);
  useEffect(() => {
    if (!settled) {
      // A new request after a quote was shown: announce its result.
      awaiting.current = shown.current;
      return;
    }
    shown.current = true;
    if (!awaiting.current || !q) return;
    awaiting.current = false;
    setText(describe(q));
  }, [settled, q]); // eslint-disable-line react-hooks/exhaustive-deps
  return text;
}

export function QuotePreview(props: QuotePreviewProps) {
  const { query, chain, symbol, side } = props;
  const announcement = useQuoteAnnouncement(query, (q) => {
    const out = side === 'buy' ? `${formatCompact(q.expectedOut)} ${symbol}` : formatNativeFor(chain, q.expectedOut);
    const danger = impactTone(q.priceImpact) === 'danger' ? ' Very high impact.' : '';
    return `Quote: you receive about ${out}, price impact ${formatPercent(q.priceImpact, { sign: false })}.${danger}`;
  });
  return (
    <>
      <QuoteBody {...props} />
      <span role="status" className="sr-only">
        {props.signedIn && props.hasAmount ? announcement : ''}
      </span>
    </>
  );
}

function QuoteBody({ query, chain, symbol, side, nativeUsd, signedIn, hasAmount }: QuotePreviewProps) {
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
    <dl className={clsx('flex flex-col gap-1 rounded bg-panel-2 p-2 text-xs transition-opacity', query.isFetching && query.isPlaceholderData && 'opacity-60')}>
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
