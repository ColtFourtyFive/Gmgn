// Token page skeleton, not-found state and the phone buy/sell bar.

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CHAINS, type ChainId, type TokenDetail } from '@trenchscope/shared';
import { Flame, Search, SearchX, TrendingUp } from 'lucide-react';
import { ChainIcon, FlashValue, Pct, Price, Usd } from '@/components/common';
import { Button, Kbd, Skeleton } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { useUi } from '@/store/ui';
import { useTokenUi } from './store';

export function TokenPageSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-busy aria-label="Loading token">
      <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_340px] gap-2' : 'flex flex-col gap-2'}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="panel flex items-center gap-3 p-3">
            <Skeleton circle width={48} height={48} />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
          </div>
          <div className="panel grid grid-cols-3 gap-3 p-3 sm:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
          <div className="panel p-3">
            <Skeleton className="h-[360px] w-full" />
          </div>
        </div>
        {wide && (
          <div className="flex flex-col gap-2">
            <div className="panel flex flex-col gap-2 p-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="panel p-3">
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 404 state. Probes search for the same address: a token on another chain
 * gets a direct link, and a wallet address redirects to its wallet page.
 */
export function TokenNotFound({ chain, address }: { chain: ChainId; address: string }) {
  const desktopSearch = useBreakpoint('lg');
  const navigate = useNavigate();
  const probe = useQuery({ queryKey: ['search', 'token-404', address], queryFn: () => api.search(address), enabled: address.length >= 20, retry: false, staleTime: 60_000 });
  const same = (a: string) => a.toLowerCase() === address.toLowerCase();
  const elsewhere = probe.data?.tokens.find((t) => same(t.address));
  const wallet = probe.data?.wallets.find((w) => same(w.address));
  useEffect(() => {
    if (wallet && !elsewhere) navigate(routes.wallet(wallet.chain, wallet.address), { replace: true });
  }, [wallet, elsewhere, navigate]);
  const openSearch = () => {
    if (desktopSearch) {
      const input = document.querySelector<HTMLInputElement>('header input[type="search"], header input');
      if (input) {
        input.focus();
        return;
      }
    }
    useUi.getState().setSearchOpen(true);
  };
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-3 text-faint">
        <SearchX size={22} />
      </span>
      <div>
        <h1 className="text-lg font-semibold">Token not found</h1>
        <p className="mt-1 max-w-md text-sm text-muted">
          No token with address <span className="break-all font-mono text-xs text-fg">{address}</span> is tracked on this chain. It may be on another chain, or the
          link is out of date.
        </p>
      </div>
      {elsewhere && (
        <Link to={routes.token(elsewhere.chain, elsewhere.address)} className="flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-sm hover:bg-accent/15">
          <ChainIcon chain={elsewhere.chain} size={16} />
          <span>
            <span className="font-semibold">{elsewhere.symbol}</span> is on {CHAINS[elsewhere.chain].name} — open it
          </span>
        </Link>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant={elsewhere ? 'outline' : 'primary'} icon={<Search size={14} />} onClick={openSearch}>
          Search tokens <Kbd>/</Kbd>
        </Button>
        <Link to={routes.trenches(chain)} className="btn-outline">
          <Flame size={14} /> Trenches
        </Link>
        <Link to={routes.trending(chain)} className="btn-outline">
          <TrendingUp size={14} /> Trending
        </Link>
      </div>
      <p className="text-xs text-faint">Tip: search by name, symbol, contract address or a wallet.</p>
    </div>
  );
}

/** Sticky bar above the phone tab bar: live price + Buy / Sell shortcuts into the Trade tab. */
export function MobileTradeBar({ token }: { token: TokenDetail }) {
  const openTrade = useTokenUi((s) => s.openTrade);
  return (
    <div data-sticky-bottom className="sticky bottom-0 z-sticky -mx-3 mt-2 flex items-center gap-2 border-t border-line bg-panel/95 px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="num truncate text-sm font-semibold text-fg">
          <FlashValue value={token.priceUsd}>
            <Price value={token.priceUsd} />
          </FlashValue>
        </span>
        <span className="num flex items-center gap-1.5 truncate text-2xs text-muted">
          MC <Usd value={token.marketCapUsd} className="text-fg" />
          <Pct value={token.stats['5m'].priceChange} digits={1} />
          <span className="text-faint">5m</span>
        </span>
      </div>
      <Button variant="buy" className="min-w-[84px]" onClick={() => openTrade('buy')}>
        Buy
      </Button>
      <Button variant="sell" className="min-w-[84px]" onClick={() => openTrade('sell')}>
        Sell
      </Button>
    </div>
  );
}
