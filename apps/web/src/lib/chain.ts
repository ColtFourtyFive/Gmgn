import { useParams } from 'react-router-dom';
import { CHAINS, isChainId, type ChainId } from '@trenchscope/shared';

const LAST_CHAIN_KEY = 'ts.chain';

export function lastChain(): ChainId {
  try {
    const v = localStorage.getItem(LAST_CHAIN_KEY);
    if (isChainId(v)) return v;
  } catch {
    /* ignore */
  }
  return 'sol';
}

export function rememberChain(chain: ChainId): void {
  try {
    localStorage.setItem(LAST_CHAIN_KEY, chain);
  } catch {
    /* ignore */
  }
}

/** Current chain from the `:chain` route param (falls back to the last used chain). */
export function useChain(): ChainId {
  const { chain } = useParams();
  return isChainId(chain) ? chain : lastChain();
}

export function nativeSymbol(chain: ChainId): string {
  return CHAINS[chain].nativeSymbol;
}

/** Route helpers so links stay consistent. */
export const routes = {
  trenches: (c: ChainId) => `/${c}/trenches`,
  trending: (c: ChainId) => `/${c}/trending`,
  newPairs: (c: ChainId) => `/${c}/new-pairs`,
  token: (c: ChainId, address: string) => `/${c}/token/${address}`,
  wallet: (c: ChainId, address: string) => `/${c}/address/${address}`,
  monitor: (c: ChainId) => `/${c}/monitor`,
  signals: (c: ChainId) => `/${c}/signals`,
  leaderboard: (c: ChainId) => `/${c}/leaderboard`,
  narratives: (c: ChainId) => `/${c}/narratives`,
  copytrade: (c: ChainId) => `/${c}/copytrade`,
  sniper: (c: ChainId) => `/${c}/sniper`,
  portfolio: () => '/portfolio',
  watchlist: () => '/watchlist',
  alerts: () => '/alerts',
  rewards: () => '/rewards',
  settings: () => '/settings',
};
