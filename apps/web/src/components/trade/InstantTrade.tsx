// Bodies of the Instant trade dock (the shell frames them: a floating panel
// on desktop, a bottom sheet on phones):
//   InstantTradeTab  one token: price, MC, the viewer's position and one-click
//                    buys (quick-buy amounts) / sells (quick-sell %) with the
//                    chain's active presets
//   DockPositions    the viewer's open positions on a chain with value, PnL
//                    and one-click 50 / 100% sells
// Both read the portfolio summary under ['portfolio'], so fills refresh them;
// only the main wallet's rows count (a launch's bundle wallets only sell
// alongside it, see API.md "Portfolio").

import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatNative, formatPercent, type ChainId, type PortfolioSummary, type TokenDetail, type TokenPositionRow, type TradePreset } from '@trenchscope/shared';
import { ArrowUpRight, LogIn, ShieldCheck, Wallet, Zap } from 'lucide-react';
import clsx from 'clsx';
import { accountKeys } from '@/components/account/queries';
import { Compact, Native, Pct, Price, TokenAvatar, TokenLink, Usd } from '@/components/common';
import { isNotFound, tokenKeys } from '@/components/token/queries';
import { Button, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui';
import { useTradeSettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { useChannel, useConnectionState } from '@/lib/ws';
import { useSession } from '@/store/session';
import { quickOrderKey, quickOrderLabel, useQuickTrade, type QuickOrder } from './useQuickTrade';

const mainWalletRows = (s: PortfolioSummary) => s.positions.filter((p) => p.walletRole !== 'bundle');

/** The viewer's open main-wallet positions on a chain (same cache as the Portfolio page). */
function usePositions(chain: ChainId) {
  const signedIn = useSession((s) => !!s.token);
  return useQuery({
    queryKey: accountKeys.portfolio(chain),
    queryFn: () => api.portfolio(chain),
    select: mainWalletRows,
    enabled: signedIn,
    refetchInterval: 5_000,
  });
}

function SignInCta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-dashed border-line-strong px-3 py-4 text-center">
      <p className="max-w-[260px] text-sm text-muted">{children}</p>
      <Button variant="primary" size="sm" icon={<LogIn size={13} />} onClick={() => useSession.getState().promptAuth(true)}>
        Sign in to trade
      </Button>
    </div>
  );
}

function OrderButton({ order, chain, symbol, trade, disabled, className }: { order: QuickOrder; chain: ChainId; symbol: string; trade: ReturnType<typeof useQuickTrade>; disabled?: boolean; className?: string }) {
  const buy = order.side === 'buy';
  return (
    <button
      type="button"
      disabled={disabled || trade.pending}
      aria-busy={trade.active === quickOrderKey(order) || undefined}
      aria-label={`${quickOrderLabel(order, chain)} of ${symbol}`}
      onClick={() => trade.submit(order)}
      className={clsx(
        'num inline-flex h-8 min-w-0 items-center justify-center gap-0.5 rounded border px-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        buy ? 'border-up/30 bg-up/10 text-up hover:border-up/60 hover:bg-up/20' : 'border-down/30 bg-down/10 text-down hover:border-down/60 hover:bg-down/20',
        className,
      )}
    >
      {trade.active === quickOrderKey(order) ? (
        <Spinner size={12} label="" />
      ) : buy ? (
        <>
          <Zap size={11} className="shrink-0 fill-current" aria-hidden />
          {formatNative(order.amount)}
        </>
      ) : (
        `${order.percent}%`
      )}
    </button>
  );
}

/** "P1 · 15%" with a shield when the preset routes anti-MEV. */
function PresetChip({ preset, side }: { preset: TradePreset; side: 'buy' | 'sell' }) {
  const slippage = preset.autoSlippage ? 'auto' : formatPercent(preset.slippage, { sign: false, digits: 0 });
  return (
    <span className="num inline-flex items-center gap-1 text-2xs text-muted" title={`Active ${side} preset (change it in the token page trade panel or Settings)`}>
      {preset.antiMev && <ShieldCheck size={11} className="text-up" aria-label="Anti-MEV" />}
      {preset.id} · {slippage} slippage
    </span>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <dt className="text-2xs text-faint">{label}</dt>
      <dd className="truncate text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

function PositionLine({ position, loading, symbol }: { position: TokenPositionRow | null; loading: boolean; symbol: string }) {
  if (loading) return <Skeleton className="h-11 w-full" />;
  if (!position) return <p className="rounded border border-dashed border-line px-2.5 py-2 text-xs text-muted">No position in {symbol} yet.</p>;
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-line bg-panel-2 px-2.5 py-1.5">
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-2xs text-faint">Position</span>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Usd value={position.valueUsd} className="text-sm font-semibold text-fg" />
          <Compact value={position.balance} suffix={` ${symbol}`} className="truncate text-xs text-muted" />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className="text-2xs text-faint">PnL</span>
        <span className="flex items-baseline gap-1">
          <Usd value={position.totalPnlUsd} colored signed className="text-sm font-semibold" />
          <Pct value={position.pnlRate} digits={0} className="text-xs" />
        </span>
      </span>
    </div>
  );
}

export interface InstantTradeTabProps {
  /** Token to trade: the token page on screen, else the last one viewed. */
  target: { chain: ChainId; address: string } | null;
  /** The target's token page is on screen (its stream keeps the detail live). */
  onPage: boolean;
}

/** Quick buys / sells of one token with the active presets. */
export function InstantTradeTab({ target, onPage }: InstantTradeTabProps) {
  if (!target) {
    return (
      <EmptyState
        compact
        icon={<Zap size={16} />}
        title="No token picked yet"
        description="Open any token: it stays here for one-click buys and sells while you browse."
      />
    );
  }
  return <TokenTrade key={`${target.chain}:${target.address}`} chain={target.chain} address={target.address} onPage={onPage} />;
}

function TokenTrade({ chain, address, onPage }: { chain: ChainId; address: string; onPage: boolean }) {
  const qc = useQueryClient();
  const conn = useConnectionState();
  const signedIn = useSession((s) => !!s.token);
  const balance = useSession((s) => s.account?.wallets[chain]?.nativeBalance);
  const settings = useTradeSettings(chain);
  const detail = useQuery({
    queryKey: tokenKeys.detail(chain, address),
    queryFn: () => api.token(chain, address),
    staleTime: 30_000,
    retry: (count, err) => !isNotFound(err) && count < 2,
    refetchInterval: conn === 'open' ? false : 5_000,
  });
  // Off its page the dock keeps the token live itself; on it, the page's own subscription does.
  useChannel(onPage ? null : `token:${chain}:${address}`, null, (type, data) => {
    if (type === 'token') qc.setQueryData(tokenKeys.detail(chain, address), data as TokenDetail);
  });
  const positions = usePositions(chain);
  const t = detail.data;
  const trade = useQuickTrade(chain, t?.address ?? address, t?.symbol ?? '');

  if (!t) {
    if (!detail.isError) {
      return (
        <div className="flex flex-col gap-3 p-3" aria-busy>
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    const gone = isNotFound(detail.error);
    return (
      <ErrorState
        compact
        title={gone ? 'This token is gone' : 'Couldn’t load the token'}
        error={gone ? undefined : detail.error}
        onRetry={gone ? undefined : () => void detail.refetch()}
        retrying={detail.isFetching}
      />
    );
  }

  const position = positions.data?.find((p) => p.token === t.address) ?? null;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <TokenLink token={t} size={32} showName className="min-w-0 flex-1" />
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <Price value={t.priceUsd} className="font-semibold text-fg" />
          <Pct value={t.stats['24h']?.priceChange} digits={1} className="text-xs" />
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded border border-line bg-panel-2 px-2.5 py-1.5">
        <Stat label="MC">
          <Usd value={t.marketCapUsd} />
        </Stat>
        <Stat label="Liquidity">
          <Usd value={t.liquidityUsd} />
        </Stat>
        <Stat label="Holders">
          <Compact value={t.holderCount} />
        </Stat>
      </dl>

      {signedIn ? (
        <>
          <PositionLine position={position} loading={positions.isPending} symbol={t.symbol} />
          <section aria-label="Quick buy" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="table-head">Buy</h4>
              <PresetChip preset={settings.buyPresets[settings.activeBuyPreset]} side="buy" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {settings.quickBuyAmounts.map((amount) => (
                <OrderButton key={amount} order={{ side: 'buy', amount }} chain={chain} symbol={t.symbol} trade={trade} />
              ))}
            </div>
          </section>
          <section aria-label="Quick sell" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="table-head">Sell</h4>
              <PresetChip preset={settings.sellPresets[settings.activeSellPreset]} side="sell" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {settings.quickSellPercents.map((percent) => (
                <OrderButton key={percent} order={{ side: 'sell', percent }} chain={chain} symbol={t.symbol} trade={trade} disabled={!position} />
              ))}
            </div>
          </section>
          <p className="flex items-center justify-between text-xs text-muted">
            Balance
            <Native value={balance} chain={chain} className="text-fg" />
          </p>
        </>
      ) : (
        <SignInCta>Paper trade {t.symbol} in one click: sign in for an instant guest wallet.</SignInCta>
      )}
      {!onPage && (
        <Link to={routes.token(chain, t.address)} className="link inline-flex items-center gap-1 self-start text-xs text-muted">
          Open the full trade panel <ArrowUpRight size={12} aria-hidden />
        </Link>
      )}
      {trade.dialog}
    </div>
  );
}

const SELL_PERCENTS = [50, 100] as const;

const PositionRow = memo(function PositionRow({ row }: { row: TokenPositionRow }) {
  const symbol = row.tokenInfo.symbol;
  const trade = useQuickTrade(row.chain, row.token, symbol);
  return (
    <li className="flex items-center gap-2 border-b border-line/60 px-3 py-2 transition-colors last:border-b-0 hover:bg-panel-2">
      <Link to={routes.token(row.chain, row.token)} title={`Open ${symbol}`} className="group/pos flex min-w-0 flex-1 items-center gap-2">
        <TokenAvatar seed={row.tokenInfo.logoSeed} glyph={row.tokenInfo.logoGlyph} size={28} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-semibold text-fg transition-colors group-hover/pos:text-accent">{symbol}</span>
            <Usd value={row.valueUsd} className="text-xs text-muted" />
          </span>
          <span className="flex items-baseline gap-1 text-xs">
            <Usd value={row.totalPnlUsd} colored signed />
            <Pct value={row.pnlRate} digits={0} />
          </span>
        </span>
      </Link>
      {SELL_PERCENTS.map((percent) => (
        <OrderButton key={percent} order={{ side: 'sell', percent }} chain={row.chain} symbol={symbol} trade={trade} className="h-7 w-12 shrink-0 text-xs" />
      ))}
      {trade.dialog}
    </li>
  );
});

/** The viewer's open positions on `chain`, most valuable first. */
export function DockPositions({ chain }: { chain: ChainId }) {
  const signedIn = useSession((s) => !!s.token);
  const q = usePositions(chain);
  if (!signedIn) {
    return (
      <div className="p-3">
        <SignInCta>Sign in to see your open positions here and sell them in one click.</SignInCta>
      </div>
    );
  }
  if (q.isError && !q.data) return <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  if (!q.data) {
    return (
      <ul aria-busy className="flex flex-col">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-line/60 px-3 py-2.5">
            <Skeleton circle width={28} height={28} />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-6 w-24" />
          </li>
        ))}
      </ul>
    );
  }
  const rows = q.data;
  if (rows.length === 0) {
    return <EmptyState compact icon={<Wallet size={16} />} title={`No open positions on ${CHAINS[chain].name}`} description="Buy a token and it shows up here with one-click sells." />;
  }
  return (
    <>
      <p className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs text-muted">
        <span>
          {rows.length} open on {CHAINS[chain].name}
        </span>
        <Usd value={rows.reduce((sum, r) => sum + r.valueUsd, 0)} className="font-medium text-fg" />
      </p>
      <ul aria-label="Open positions">
        {rows.map((r) => (
          <PositionRow key={r.token} row={r} />
        ))}
      </ul>
    </>
  );
}
