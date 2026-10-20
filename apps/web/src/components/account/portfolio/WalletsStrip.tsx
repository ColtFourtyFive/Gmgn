import { useQueryClient } from '@tanstack/react-query';
import { CHAIN_IDS, CHAINS, type ChainId, type UserWallet } from '@trenchscope/shared';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink, ChainIcon, FlashValue, Native, Usd } from '@/components/common';
import { useDeposit } from '@/components/layout/AccountControls';
import { Button } from '@/components/ui';
import { useSession } from '@/store/session';
import type { ChainScope } from '../queries';

function WalletCard({ chain, wallet, dim }: { chain: ChainId; wallet: UserWallet; dim: boolean }) {
  const { deposit, pending } = useDeposit(chain);
  const qc = useQueryClient();
  const topUp = async () => {
    await deposit();
    void qc.invalidateQueries({ queryKey: ['portfolio'] });
  };
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1 rounded border border-line bg-panel-2 px-2.5 py-2 transition-opacity', dim && 'opacity-50')}>
      <div className="flex items-center gap-1.5">
        <ChainIcon chain={chain} size={14} />
        <span className="truncate text-xs font-medium text-muted">{CHAINS[chain].name}</span>
        <Button
          size="xs"
          variant="ghost"
          loading={pending}
          icon={<Plus size={12} strokeWidth={2.5} />}
          onClick={() => void topUp()}
          title={`Top the paper wallet back up to ${CHAINS[chain].starterBalance} ${CHAINS[chain].nativeSymbol} (once a minute)`}
          className="-mr-1 ml-auto !px-1.5 text-accent"
        >
          Faucet
        </Button>
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <FlashValue value={wallet.nativeBalance}>
          <Native value={wallet.nativeBalance} chain={chain} className="text-md font-semibold text-fg" />
        </FlashValue>
        <Usd value={wallet.nativeBalanceUsd} className="truncate text-xs text-muted" />
      </div>
      <AddressLink chain={chain} address={wallet.address} className="text-xs text-muted" />
    </div>
  );
}

/** The four paper wallets: native balance, address and faucet button. */
export function WalletsStrip({ scope, className }: { scope: ChainScope; className?: string }) {
  const wallets = useSession((s) => s.account?.wallets);
  if (!wallets) return null;
  return (
    <div className={clsx('grid grid-cols-2 gap-2 lg:grid-cols-4', className)}>
      {CHAIN_IDS.map((c) => (wallets[c] ? <WalletCard key={c} chain={c} wallet={wallets[c]} dim={scope !== 'all' && scope !== c} /> : null))}
    </div>
  );
}
