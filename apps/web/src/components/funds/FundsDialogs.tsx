import { useEffect } from 'react';
import { useIsLive } from '@/hooks/useMode';
import { closeFunds, useFunds } from '@/store/funds';
import { useSession } from '@/store/session';
import { DepositDialog } from './DepositDialog';
import { WithdrawDialog } from './WithdrawDialog';

/** The live Deposit / Withdraw dialogs, opened through openFunds() (mounted once by the shell). */
export function FundsDialogs() {
  const live = useIsLive();
  const open = useFunds((s) => s.open);
  const mint = useFunds((s) => s.mint);
  const signedIn = useSession((s) => !!s.account);
  useEffect(() => {
    if (!signedIn) closeFunds();
  }, [signedIn]);
  if (!live || !signedIn) return null;
  return (
    <>
      <DepositDialog open={open === 'deposit'} onClose={closeFunds} />
      <WithdrawDialog open={open === 'withdraw'} onClose={closeFunds} initialMint={mint} />
    </>
  );
}
