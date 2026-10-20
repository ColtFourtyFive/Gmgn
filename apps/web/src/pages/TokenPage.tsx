// Token page (/:chain/token/:address): header, live stats, candlestick chart
// with trade markers, trade panel, audit / holders / dev / info panels and
// the activity / holders / traders / position / orders / dev-tokens tabs.
//
// Data: api.token for the first paint, then one `token:<chain>:<address>`
// subscription (detail every ~1s, trade batches, candles for the chart's
// resolution) fanned out through a TokenFeed. Layouts: ≥1280 two columns
// (sticky right column), 768–1279 stacked, phones tabbed with a sticky
// buy/sell bar.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { formatPrice, RESOLUTIONS, type Resolution, type TokenDetail } from '@trenchscope/shared';
import clsx from 'clsx';
import { Page } from '@/components/layout';
import {
  BottomTabs,
  DevPanel,
  HolderStrip,
  isNotFound,
  MobileTradeBar,
  PriceChart,
  SecurityPanel,
  StatsStrip,
  TokenFeed,
  TokenFeedContext,
  TokenHeader,
  TokenInfoPanel,
  TokenNotFound,
  TokenPageSkeleton,
  TradePanel,
  useMyPosition,
  useTokenDetail,
  useTokenOrders,
  useTokenStream,
  useTokenUi,
  type MobileTab,
} from '@/components/token';
import { ErrorState, Tabs } from '@/components/ui';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useBreakpoint, useIsMobile } from '@/hooks/useMediaQuery';
import { useChain } from '@/lib/chain';

const MOBILE_TABS: { value: MobileTab; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'trade', label: 'Trade' },
  { value: 'info', label: 'Info' },
  { value: 'activity', label: 'Activity' },
];

/** "$SYMBOL $price · Trenchscope" while the page is open. */
function useDocumentTitle(token: TokenDetail | undefined): void {
  const original = useRef(typeof document !== 'undefined' ? document.title : 'Trenchscope');
  useEffect(() => {
    const prev = original.current;
    return () => {
      document.title = prev;
    };
  }, []);
  const symbol = token?.symbol;
  const price = token?.priceUsd;
  useEffect(() => {
    if (symbol && price !== undefined) document.title = `$${symbol} ${formatPrice(price)} · Trenchscope`;
  }, [symbol, price]);
}

export default function TokenPage() {
  const chain = useChain();
  const { address = '' } = useParams();
  const wide = useBreakpoint('xl');
  const mobile = useIsMobile();
  const [storedRes, setResolution] = useLocalStorage<Resolution>('ts.token.resolution', '1m');
  const resolution = RESOLUTIONS.includes(storedRes) ? storedRes : '1m';
  const feed = useMemo(() => new TokenFeed(), [chain, address]); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = useTokenDetail(chain, address);
  const notFound = isNotFound(detail.error);
  useTokenStream(chain, address, resolution, feed, !!address && !notFound);

  useEffect(() => {
    useTokenUi.getState().reset();
  }, [chain, address]);

  const t = detail.data;
  const canonical = t?.address ?? address;
  const position = useMyPosition(chain, canonical);
  const openOrders = useTokenOrders(chain, canonical, 'open');
  const mobileTab = useTokenUi((s) => s.mobileTab);
  const setMobileTab = useTokenUi((s) => s.setMobileTab);
  const tabsRef = useRef<HTMLElement>(null);
  useDocumentTitle(t);

  if (!t) {
    return (
      <Page>
        {notFound ? (
          <TokenNotFound chain={chain} address={address} />
        ) : detail.isError ? (
          <ErrorState title="Couldn’t load this token" error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        ) : (
          <TokenPageSkeleton wide={wide} />
        )}
      </Page>
    );
  }

  const pos = position.data ?? null;
  const openTab = (tab: 'dev' | 'holders') => {
    useTokenUi.getState().setBottomTab(tab);
    if (mobile) setMobileTab('activity');
    else requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const header = <TokenHeader token={t} compact={mobile} />;
  const stats = <StatsStrip token={t} />;
  const chart = <PriceChart token={t} resolution={resolution} onResolutionChange={setResolution} position={pos} orders={openOrders.data} height={wide ? 460 : mobile ? 330 : 400} />;
  const trade = <TradePanel token={t} position={pos} />;
  const security = <SecurityPanel token={t} />;
  const holders = <HolderStrip token={t} onOpenHolders={() => openTab('holders')} />;
  const dev = <DevPanel token={t} onOpenTokens={() => openTab('dev')} />;
  const info = <TokenInfoPanel token={t} />;
  const bottom = (
    <BottomTabs
      ref={tabsRef}
      token={t}
      position={pos}
      positionLoading={position.isPending && position.fetchStatus !== 'idle'}
      positionError={position.error}
      onRetryPosition={() => void position.refetch()}
      maxHeight={wide ? 560 : mobile ? '60vh' : 480}
      className="scroll-mt-3"
    />
  );

  let body: ReactNode;
  if (mobile) {
    body = (
      <div className="flex min-w-0 flex-col gap-2">
        {header}
        <div className="sticky top-0 z-sticky -mx-3 bg-bg/95 px-3 backdrop-blur">
          <Tabs value={mobileTab} onChange={setMobileTab} items={MOBILE_TABS} aria-label="Token sections" className="[&>button]:flex-1 [&>button]:justify-center" />
        </div>
        {mobileTab === 'chart' && (
          <>
            {stats}
            {chart}
          </>
        )}
        {mobileTab === 'trade' && trade}
        {mobileTab === 'info' && (
          <>
            {security}
            {holders}
            {dev}
            {info}
          </>
        )}
        {mobileTab === 'activity' && bottom}
        {mobileTab !== 'trade' && <MobileTradeBar token={t} />}
      </div>
    );
  } else if (wide) {
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          {header}
          {stats}
          {chart}
          {bottom}
        </div>
        <aside aria-label="Trade and token details" className="sticky top-0 flex max-h-[calc(100dvh-6.5rem)] min-w-0 flex-col gap-2 overflow-y-auto">
          {trade}
          {security}
          {holders}
          {dev}
          {info}
        </aside>
      </div>
    );
  } else {
    body = (
      <div className="flex min-w-0 flex-col gap-2">
        {header}
        {stats}
        {chart}
        <div className="grid items-start gap-2 md:grid-cols-2">
          {trade}
          <div className="flex min-w-0 flex-col gap-2">
            {security}
            {holders}
          </div>
        </div>
        {bottom}
        <div className="grid items-start gap-2 md:grid-cols-2">
          {dev}
          {info}
        </div>
      </div>
    );
  }

  return (
    <TokenFeedContext.Provider value={feed}>
      <Page className={clsx('max-w-[1920px]', mobile && 'pb-0')}>{body}</Page>
    </TokenFeedContext.Provider>
  );
}
