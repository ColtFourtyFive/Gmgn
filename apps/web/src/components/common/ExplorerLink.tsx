import type { MouseEvent, ReactNode } from 'react';
import { explorerAddressUrl, explorerTokenUrl, explorerTxUrl, shortAddress, type ChainId } from '@trenchscope/shared';
import { ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { useIsLive } from '@/hooks/useMode';
import { CopyButton } from '@/components/ui/CopyButton';

export type ExplorerKind = 'tx' | 'address' | 'token';

const KIND_LABEL: Record<ExplorerKind, string> = { tx: 'transaction', address: 'wallet', token: 'token' };

/** Explorer name per chain (live links use solscan.io on Solana). */
export function explorerName(chain: ChainId): string {
  return chain === 'sol' ? 'Solscan' : chain === 'bsc' ? 'BscScan' : chain === 'base' ? 'BaseScan' : 'Etherscan';
}

export function explorerUrl(chain: ChainId, kind: ExplorerKind, value: string): string {
  return kind === 'tx' ? explorerTxUrl(chain, value) : kind === 'address' ? explorerAddressUrl(chain, value) : explorerTokenUrl(chain, value);
}

// Links live inside clickable rows/cards: never let the click reach them.
const stop = (e: MouseEvent) => e.stopPropagation();

export interface ExplorerLinkProps {
  chain: ChainId;
  kind: ExplorerKind;
  value: string;
  /** Visible text; omitted = icon only (named "View … on Solscan"). */
  children?: ReactNode;
  /** Icon size in px. */
  size?: number;
  className?: string;
}

/**
 * Block explorer link (new tab). Live mode only: demo hashes and addresses
 * are not on-chain, so in demo this renders nothing.
 */
export function ExplorerLink({ chain, kind, value, children, size = 11, className }: ExplorerLinkProps) {
  const live = useIsLive();
  if (!live || !value) return null;
  const label = `View ${KIND_LABEL[kind]} on ${explorerName(chain)}`;
  return (
    <a
      href={explorerUrl(chain, kind, value)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      aria-label={children ? undefined : label}
      title={label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded text-faint transition-colors hover:text-accent',
        children ? 'text-xs font-medium text-accent hover:underline' : 'touch-target p-0.5',
        className,
      )}
    >
      {children}
      <ExternalLink size={size} aria-hidden />
    </a>
  );
}

/** Short transaction hash with copy (and, live, a Solscan link). */
export function TxHash({ chain, hash, size = 11, className }: { chain: ChainId; hash: string; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)} title={hash}>
      <span className="num font-mono">{shortAddress(hash, 4, 4)}</span>
      <CopyButton text={hash} label="Copy transaction hash" size={size} />
      <ExplorerLink chain={chain} kind="tx" value={hash} size={size} />
    </span>
  );
}
