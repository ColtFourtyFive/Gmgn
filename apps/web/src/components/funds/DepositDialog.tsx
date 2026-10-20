// Live Deposit dialog: the account's embedded Solana wallet address as a QR
// code and text (copy), what may be sent there, the fee reserve and a manual
// balance refresh. Deposits are detected on-chain by the server.

import type { ChainId } from '@trenchscope/shared';
import { RefreshCw } from 'lucide-react';
import { Native } from '@/components/common';
import { ExplorerLink } from '@/components/common/ExplorerLink';
import { Note } from '@/components/account/FormBits';
import { Button, CopyButton, ErrorState, Modal, Skeleton } from '@/components/ui';
import { formatNativeFor } from '@/lib/format';
import { useSession } from '@/store/session';
import { QrCode } from './QrCode';
import { useDepositInfo, useRefreshBalances } from './queries';

export interface DepositDialogProps {
  open: boolean;
  onClose: () => void;
  chain?: ChainId;
}

export function DepositDialog({ open, onClose, chain = 'sol' }: DepositDialogProps) {
  const { refresh, pending } = useRefreshBalances(chain);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Deposit"
      description="Send SOL or tokens to your Trenchscope wallet on Solana to start trading."
      footer={
        <>
          <Button variant="ghost" icon={<RefreshCw size={13} />} loading={pending} onClick={() => void refresh()}>
            Refresh balances
          </Button>
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        </>
      }
    >
      <DepositBody chain={chain} />
    </Modal>
  );
}

function DepositBody({ chain }: { chain: ChainId }) {
  const info = useDepositInfo(chain);
  const balance = useSession((s) => s.account?.wallets[chain]?.nativeBalance);

  if (info.isError && !info.data) {
    return <ErrorState compact title="Couldn’t load your deposit address" error={info.error} onRetry={() => void info.refetch()} retrying={info.isFetching} />;
  }
  const d = info.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2">
        {d ? <QrCode value={d.address} alt="QR code of your Solana deposit address" /> : <Skeleton width={176} height={176} className="rounded" />}
        {balance !== undefined && (
          <p className="text-xs text-muted">
            Balance <Native value={balance} chain={chain} className="font-semibold text-fg" />
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted">Your Solana deposit address</p>
        {d ? (
          <div className="flex items-start gap-2 rounded border border-line bg-panel-2 px-2.5 py-2">
            <code className="num min-w-0 flex-1 break-all font-mono text-sm text-fg" data-testid="deposit-address">
              {d.address}
            </code>
            <CopyButton text={d.address} label="Copy address" showLabel />
          </div>
        ) : (
          <Skeleton className="h-10 w-full" />
        )}
        {d && (
          <ExplorerLink chain={chain} kind="address" value={d.address} className="self-start">
            View on Solscan
          </ExplorerLink>
        )}
      </div>

      <Note tone="warn" title="Send only SOL or Solana SPL tokens to this address">
        Coins sent from another network (Ethereum, BNB Chain, Base…) or NFTs can’t be recovered.
      </Note>
      {d && (
        <Note>
          Deposits are credited once {d.commitment} on Solana; your balance updates automatically. About {formatNativeFor(chain, d.feeReserve)} stays in the wallet for
          network fees and token-account rent: Max buys and withdrawals leave it untouched.
        </Note>
      )}
    </div>
  );
}
