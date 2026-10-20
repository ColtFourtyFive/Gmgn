// Route wrappers used by the route table (routes.tsx): chain validation, the
// demo-only gate and the root redirect. App re-exports them.

import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { isChainId } from '@trenchscope/shared';
import { switchChainPath } from '@/components/layout/nav';
import { useEnabledChains, useIsLive } from '@/hooks/useMode';
import { lastChain, rememberChain } from '@/lib/chain';
import { defaultChain } from '@/lib/mode';

/**
 * Validates :chain and remembers it. Unknown chains redirect to the last used
 * chain (demo) or the first chain this deployment serves (live); a known chain
 * the deployment does not serve (live: anything but Solana) opens the same
 * section on the first served chain.
 */
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { chain } = useParams();
  const { pathname, search } = useLocation();
  const enabled = useEnabledChains();
  const live = useIsLive();
  const valid = isChainId(chain);
  const served = valid && enabled.includes(chain);
  useEffect(() => {
    if (served) rememberChain(chain);
  }, [chain, served]);
  if (!valid) return <Navigate to={`/${live ? defaultChain() : lastChain()}/trenches`} replace />;
  if (!served) return <Navigate to={{ pathname: switchChainPath(pathname, defaultChain()) ?? `/${defaultChain()}/trenches`, search }} replace />;
  return <>{children}</>;
}

/** Pages the live deployment does not offer (token launch): live visitors land on the chain's trenches. */
export function DemoOnly({ children }: { children: React.ReactNode }) {
  const live = useIsLive();
  const { chain } = useParams();
  if (live) return <Navigate to={`/${isChainId(chain) ? chain : defaultChain()}/trenches`} replace />;
  return <>{children}</>;
}

/** `/` opens the last used chain's trenches, keeping the query string (referral links are `/?ref=CODE`). */
export function RootRedirect() {
  const { search, hash } = useLocation();
  useEnabledChains(); // re-resolve once meta confirms the chains
  return <Navigate to={{ pathname: `/${defaultChain()}/trenches`, search, hash }} replace />;
}
