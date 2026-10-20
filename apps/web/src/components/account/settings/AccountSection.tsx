import { Link } from 'react-router-dom';
import { CHAINS } from '@trenchscope/shared';
import { Compass, Gift, LogOut, ShieldCheck, UserPlus, UserRound, Wallet } from 'lucide-react';
import { AddressLink, Age, ChainIcon, ExplorerLink, Native, WalletAvatar } from '@/components/common';
import { FundsActions } from '@/components/funds/LiveWalletPanel';
import { requestSignOut } from '@/components/layout/SignOutDialog';
import { Badge, Button, CopyButton, Panel } from '@/components/ui';
import { useEnabledChains, useIsLive } from '@/hooks/useMode';
import { routes } from '@/lib/chain';
import { useSession } from '@/store/session';
import { startTour } from '@/store/tour';
import { DetailRow, Note } from '../FormBits';

/** Profile facts, paper wallets (live: the Solana wallet with Deposit / Withdraw), referral shortcut, the onboarding tour and sign-out. */
export function AccountSection() {
  const account = useSession((s) => s.account);
  const live = useIsLive();
  const chains = useEnabledChains();
  if (!account) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Profile" icon={<UserRound size={14} />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <WalletAvatar seed={account.id} size={44} />
            <div className="min-w-0">
              <p className="flex items-center gap-2">
                <span className="truncate text-md font-semibold text-fg">{account.username}</span>
                <Badge tone={account.isGuest ? 'warn' : 'up'}>{account.isGuest ? 'Guest' : 'Registered'}</Badge>
              </p>
              <p className="text-xs text-muted">
                Member since {new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ·{' '}
                <Age ts={account.createdAt} suffix=" ago" />
              </p>
            </div>
          </div>
          {account.isGuest && (
            <Note tone="warn" title="Guest account">
              It lives only in this browser — clearing site data or signing out loses it. Register a username and password to keep your wallets, positions and settings
              and sign in from anywhere.
              <span className="mt-2 block">
                <Button size="xs" variant="primary" icon={<UserPlus size={12} />} onClick={() => useSession.getState().promptAuth(true)}>
                  Register account
                </Button>
              </span>
            </Note>
          )}
          <dl className="flex flex-col gap-1.5">
            <DetailRow label="Account ID">
              <span className="inline-flex items-center gap-1 font-mono">
                {account.id}
                <CopyButton text={account.id} label="Copy account ID" />
              </span>
            </DetailRow>
            <DetailRow label="Referral code">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono font-semibold text-accent">{account.referralCode}</span>
                <CopyButton text={account.referralCode} label="Copy referral code" />
                <Link to={routes.rewards()} className="inline-flex items-center gap-1 text-accent hover:underline">
                  <Gift size={12} /> Rewards
                </Link>
              </span>
            </DetailRow>
            {/* referredBy is the referrer's internal account id: say that an invite was used, never print the id. */}
            {account.referredBy && <DetailRow label="Joined via">A referral invite</DetailRow>}
          </dl>
          <div className="flex justify-between gap-2 border-t border-line pt-3">
            <Button variant="outline" size="sm" icon={<Compass size={13} />} onClick={startTour}>
              Take the tour
            </Button>
            {/* The same sign-out as the account menu: guests confirm (with "Register instead"), registered accounts sign out at once. */}
            <Button variant="danger" size="sm" icon={<LogOut size={13} />} onClick={requestSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title={live ? 'Wallet' : 'Paper wallets'} icon={<Wallet size={14} />} subtitle={live ? 'Your embedded Solana wallet' : 'One per chain'}>
        <ul className="flex flex-col divide-y divide-line">
          {chains.map((c) => {
            const w = account.wallets[c];
            if (!w) return null;
            return (
              <li key={c} className="flex items-center gap-2.5 py-2">
                <ChainIcon chain={c} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{CHAINS[c].name}</p>
                  <span className="flex min-w-0 items-center gap-0.5">
                    <AddressLink chain={c} address={w.address} className="text-xs text-muted" />
                    <ExplorerLink chain={c} kind="address" value={w.address} />
                  </span>
                </div>
                <Native value={w.nativeBalance} chain={c} className="text-sm font-semibold text-fg" />
              </li>
            );
          })}
        </ul>
        {live ? (
          <div className="mt-2 flex flex-col gap-2">
            <FundsActions />
            <p className="text-xs text-faint">
              Withdrawals need two-factor authentication and a whitelisted address:{' '}
              <Link to={routes.settings('security')} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                <ShieldCheck size={12} aria-hidden /> Security settings
              </Link>
              .
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-faint">
            Top wallets up from the <Link to={routes.portfolio()} className="text-accent hover:underline">Portfolio</Link> page (Deposit, once a minute per chain).
          </p>
        )}
      </Panel>
    </div>
  );
}
