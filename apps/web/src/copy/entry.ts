// One catalogue entry: the wording per deployment mode (demo: the simulator
// with paper balances; live: real funds), optionally per chain.

import type { AppMode, ChainId } from '@trenchscope/shared';

/** Where the text is shown: the deployment mode and, when it matters, the chain. */
export interface CopyContext {
  mode: AppMode;
  chain?: ChainId;
}

/** Plain text, or text built from the context (e.g. naming the chain). */
export type CopyText = string | ((ctx: CopyContext) => string);

export interface CopyEntry {
  demo: CopyText;
  live: CopyText;
  /** Wording for one chain, overriding `demo` / `live` there. */
  chains?: Partial<Record<ChainId, Partial<Record<AppMode, CopyText>>>>;
}

/** Text only shown in live mode (demo never renders it, and gets the same words if asked). */
export const liveOnly = (live: CopyText): CopyEntry => ({ demo: live, live });

/** The entry's text for this context: the chain's override for the mode, else the mode's text. */
export function resolveCopy(entry: CopyEntry, ctx: CopyContext): string {
  const text = (ctx.chain && entry.chains?.[ctx.chain]?.[ctx.mode]) ?? entry[ctx.mode];
  return typeof text === 'function' ? text(ctx) : text;
}
