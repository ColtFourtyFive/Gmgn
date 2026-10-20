// User-facing copy that differs by deployment mode (demo vs live) and chain.
// Ask for a key instead of writing `live ? … : …` in a component:
//   copy('portfolio.subtitle', { mode, chain })   plain code
//   const t = useCopy(chain); t('portfolio.subtitle')   components (current mode)
// Entries live in one file per area (trade.ts, account.ts, …), merged below;
// add an area as a file plus one line in COPY. Keys are prefixed by area.

import type { ChainId } from '@trenchscope/shared';
import { useMode } from '@/hooks/useMode';
import { ACCOUNT_COPY } from './account';
import { resolveCopy, type CopyContext, type CopyEntry } from './entry';
import { TRADE_COPY } from './trade';

export { liveOnly, resolveCopy, type CopyContext, type CopyEntry, type CopyText } from './entry';

/** Every area's entries (copy.test.ts checks each area is merged here and no key is defined twice). */
export const COPY = { ...TRADE_COPY, ...ACCOUNT_COPY } satisfies Record<string, CopyEntry>;

export type CopyKey = keyof typeof COPY;

/** The text for `key` in this mode (and on this chain, when given). */
export function copy(key: CopyKey, ctx: CopyContext): string {
  return resolveCopy(COPY[key], ctx);
}

/** copy() bound to the current mode and, optionally, a chain. */
export function useCopy(chain?: ChainId): (key: CopyKey) => string {
  const mode = useMode();
  return (key) => copy(key, { mode, chain });
}
