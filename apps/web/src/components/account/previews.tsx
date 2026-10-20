// Live previews under address fields: confirm the typed address resolves to
// the wallet / token the user means before saving a task or alert.

import { CHAINS, shortAddress, type ChainId } from '@trenchscope/shared';
import { CircleAlert } from 'lucide-react';
import { Pct, Price, TokenAvatar, Usd, WalletAvatar, WalletTags } from '@/components/common';
import { Badge, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { isAddressFor } from './address';
import { useTokenMeta, useWalletProfile } from './queries';

function Missing({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-down" role="status">
      <CircleAlert size={12} aria-hidden /> {text}
    </p>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-panel-2 px-2.5 py-2" aria-busy="true">
      <Skeleton circle width={24} height={24} />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/** Resolves a wallet address: label, tags, 30d PnL / win rate. Renders nothing for malformed input. */
export function WalletPreview({ chain, address }: { chain: ChainId; address: string }) {
  const q = useWalletProfile(chain, address);
  if (!isAddressFor(chain, address)) return null;
  if (q.isLoading) return <Loading />;
  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return <Missing text={missing ? `No wallet with this address on ${CHAINS[chain].name}` : errorMessage(q.error)} />;
  }
  const w = q.data;
  if (!w) return null;
  const s = w.stats['30d'];
  return (
    <div className="flex items-center gap-2.5 rounded border border-line bg-panel-2 px-2.5 py-2">
      <WalletAvatar seed={w.avatarSeed} size={28} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg">{w.label || w.remark || shortAddress(w.address)}</span>
          {w.style.title && (
            <Badge title="Trading style" className="shrink-0">
              {w.style.title}
            </Badge>
          )}
          <WalletTags tags={w.tags} max={3} />
        </p>
        <p className="truncate text-xs text-muted">
          30d PnL <Usd value={s.totalPnlUsd} colored signed /> · Win <Pct value={s.winRate} colored={false} sign={false} digits={0} /> · {s.tokensTraded} tokens
        </p>
      </div>
    </div>
  );
}

/** Resolves a token address: avatar, symbol, price, market cap, 5m change. */
export function TokenPreview({ chain, address }: { chain: ChainId; address: string }) {
  const q = useTokenMeta(chain, address, { live: true });
  if (!isAddressFor(chain, address)) return null;
  if (q.isLoading) return <Loading />;
  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return <Missing text={missing ? `No token with this address on ${CHAINS[chain].name}` : errorMessage(q.error)} />;
  }
  const t = q.data;
  if (!t) return null;
  return (
    <div className="flex items-center gap-2.5 rounded border border-line bg-panel-2 px-2.5 py-2">
      <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} imageUrl={t.imageUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-semibold text-fg">{t.symbol}</span> <span className="text-muted">{t.name}</span>
        </p>
        <p className="truncate text-xs text-muted">
          <Price value={t.priceUsd} className="text-fg" /> · MC <Usd value={t.marketCapUsd} className="text-fg" /> · 5m <Pct value={t.stats['5m'].priceChange} />
        </p>
      </div>
    </div>
  );
}
