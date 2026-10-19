// Viewer-relative decoration shared by token and wallet analytics:
// adds 'you' / 'following' tags and the viewer's private remark.

import type { ChainId, WalletTag } from '@trenchscope/shared';
import type { AppContext, Viewer } from '../context';

export function viewerTags(ctx: AppContext, viewer: Viewer, chain: ChainId, wallet: string, base: WalletTag[]): WalletTag[] {
  if (!viewer.accountId) return base;
  let tags = base;
  if (ctx.accounts.accountIdForWallet(wallet) === viewer.accountId) tags = [...tags, 'you'];
  else if (ctx.accounts.isFollowing(viewer.accountId, chain, wallet)) tags = [...tags, 'following'];
  return tags;
}

/** Display label: the viewer's remark wins over the public label. */
export function viewerLabel(ctx: AppContext, viewer: Viewer, chain: ChainId, wallet: string, label: string | null): string | null {
  if (!viewer.accountId) return label;
  return ctx.accounts.remarkFor(viewer.accountId, chain, wallet) ?? label;
}
