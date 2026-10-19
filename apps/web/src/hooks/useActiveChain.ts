import { useLocation } from 'react-router-dom';
import { isChainId, type ChainId } from '@trenchscope/shared';
import { useUi } from '@/store/ui';

/** `:chain` segment of a pathname, or null on global routes. */
export function chainFromPath(pathname: string): ChainId | null {
  const first = pathname.split('/')[1];
  return isChainId(first) ? first : null;
}

/**
 * Chain the user is working on, usable anywhere (also outside `:chain`
 * routes, where `useChain()` cannot read params): the route's chain when
 * present, else the chain last picked in the chain switcher.
 */
export function useActiveChain(): ChainId {
  const { pathname } = useLocation();
  const preferred = useUi((s) => s.chain);
  return chainFromPath(pathname) ?? preferred;
}
