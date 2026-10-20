import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChainId } from '@trenchscope/shared';
import { ChevronDown, Compass, LogOut, Moon, Plus, RefreshCw, Sun, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { ChainIcon, Native, WalletAvatar } from '@/components/common';
import { Button, IconButton, Menu, Popover, Skeleton, Spinner } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage, formatNativeFor } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { startTour } from '@/store/tour';
import { ACCOUNT_ITEMS } from './nav';
import { requestSignOut } from './SignOutDialog';

/** Top up the paper wallet via the faucet, with toasts. */
export function useDeposit(chain: ChainId): { deposit: () => Promise<void>; pending: boolean } {
  const [pending, setPending] = useState(false);
  const deposit = async () => {
    setPending(true);
    try {
      const w = await api.faucet(chain);
      useSession.getState().setAccountBalance(chain, w.nativeBalance, w.nativeBalanceUsd);
      toast.success('Paper wallet topped up', `${formatNativeFor(chain, w.nativeBalance)} available`);
    } catch (err) {
      toast.error('Deposit failed', errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return { deposit, pending };
}

/** Native balance of the signed-in user's paper wallet on `chain`, plus Deposit. */
export function BalancePill({ chain, compact, className }: { chain: ChainId; compact?: boolean; className?: string }) {
  const wallet = useSession((s) => s.account?.wallets[chain]);
  const { deposit, pending } = useDeposit(chain);
  if (!wallet) return null;
  return (
    // The pill clips its corners, so its controls draw the focus ring inside their box.
    <div className={clsx('flex h-8 shrink-0 items-center overflow-hidden rounded border border-line bg-panel-2', className)}>
      <Link to={routes.portfolio()} title="Paper wallet balance" className={clsx('flex h-full items-center gap-1.5 px-2 hover:bg-panel-3 focus-visible:outline-offset-[-2px]', compact ? 'rounded-[5px]' : 'rounded-l-[5px]')}>
        <ChainIcon chain={chain} size={14} />
        <Native value={wallet.nativeBalance} digits={compact ? 2 : 3} chain={compact ? undefined : chain} className="text-sm font-semibold" />
      </Link>
      {!compact && (
        <button
          type="button"
          onClick={() => void deposit()}
          disabled={pending}
          title="Top the paper wallet back up to the starter balance (once a minute)"
          className="flex h-full items-center gap-1 rounded-r-[5px] border-l border-line px-2 text-xs font-semibold text-accent transition-colors hover:bg-panel-3 focus-visible:outline-offset-[-2px] disabled:opacity-60"
        >
          {pending ? <Spinner size={12} label="" /> : <Plus size={12} strokeWidth={2.5} />}
          Deposit
        </button>
      )}
    </div>
  );
}

/** Sun/moon theme switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return <IconButton label={`Switch to ${next} theme`} icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} onClick={toggle} className={className} />;
}

/** "Sign in" button, or the account avatar with its menu. */
export function AccountMenu() {
  const account = useSession((s) => s.account);
  const ready = useSession((s) => s.ready);
  const token = useSession((s) => s.token);
  const restoreFailed = useSession((s) => s.restoreError != null);
  const restoring = useSession((s) => s.restoring);
  const navigate = useNavigate();

  if (!account) {
    // A stored token is being verified: avoid flashing "Sign in" (and offer a retry once an attempt failed).
    if (!ready && token && restoreFailed) {
      return (
        <IconButton
          label="Couldn’t load your account. Retry"
          icon={restoring ? <Spinner size={14} label="" /> : <RefreshCw size={15} />}
          onClick={() => useSession.getState().retryRestore()}
          className="text-down"
        />
      );
    }
    if (!ready && token) return <Skeleton circle width={24} height={24} />;
    return (
      <Button variant="primary" size="sm" onClick={() => useSession.getState().promptAuth(true)}>
        Sign in
      </Button>
    );
  }

  return (
    <Popover
      placement="bottom-end"
      role="menu"
      aria-label="Account"
      trigger={
        // The name starts with the username shown on wide screens (Label in Name, speech input).
        <button type="button" aria-label={`${account.username} · Account menu`} className="flex h-8 items-center gap-1.5 rounded px-1 text-muted transition-colors hover:bg-panel-3 hover:text-fg">
          <WalletAvatar seed={account.id} size={22} />
          <span className="hidden max-w-[110px] truncate text-sm font-medium text-fg xl:inline">{account.username}</span>
          <ChevronDown size={13} className="hidden sm:block" />
        </button>
      }
    >
      {(close) => (
        <div className="w-60">
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            <WalletAvatar seed={account.id} size={30} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">{account.username}</p>
              <p className="truncate text-xs text-muted">
                {account.isGuest ? 'Guest' : 'Paper'} account · code {account.referralCode}
              </p>
            </div>
          </div>
          <Menu
            onDone={close}
            items={[
              ...(account.isGuest
                ? [{ key: 'register', label: 'Register account', icon: <UserPlus size={14} />, onSelect: () => useSession.getState().promptAuth(true) }]
                : []),
              ...ACCOUNT_ITEMS.map((it) => ({ key: it.key, label: it.label, icon: <it.icon size={14} />, onSelect: () => navigate(it.href) })),
              { key: 'tour', label: 'Take the tour', icon: <Compass size={14} />, onSelect: startTour },
              { key: 'signout', label: 'Sign out', icon: <LogOut size={14} />, danger: true, onSelect: requestSignOut },
            ]}
          />
        </div>
      )}
    </Popover>
  );
}
