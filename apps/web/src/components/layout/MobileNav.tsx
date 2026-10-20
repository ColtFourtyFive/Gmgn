import { Link, useLocation } from 'react-router-dom';
import { Compass, LogIn, LogOut, Menu as MenuIcon, Plus, UserPlus, Zap } from 'lucide-react';
import clsx from 'clsx';
import { Native, SimBanner, WalletAvatar } from '@/components/common';
import { Button, Drawer, Toggle } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useTheme } from '@/hooks/useTheme';
import { useDock } from '@/store/dock';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { startTour } from '@/store/tour';
import { useUi } from '@/store/ui';
import { useDeposit } from './AccountControls';
import { ChainPicker } from './ChainSwitcher';
import { Omnibox } from './Omnibox';
import { ACCOUNT_ITEMS, activeSection, MOBILE_TABS, NAV_ITEMS } from './nav';

/** Phone bottom tab bar: four primary sections + "More" (opens the nav drawer). */
export function MobileTabBar({ className }: { className?: string }) {
  const chain = useActiveChain();
  const section = activeSection(useLocation().pathname);
  const drawerOpen = useUi((s) => s.mobileNavOpen);
  const tabClass = (active: boolean) =>
    clsx('flex flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors', active ? 'text-accent' : 'text-muted');
  return (
    <nav aria-label="Primary" className={clsx('shrink-0 border-t border-line bg-panel pb-safe', className)}>
      <div className="flex h-14 items-stretch">
        {MOBILE_TABS.map((item) => {
          const active = item.section === section && !drawerOpen;
          return (
            <Link key={item.key} to={item.href(chain)} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
              <item.icon size={19} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => useUi.getState().setMobileNavOpen(true)} aria-expanded={drawerOpen} className={tabClass(drawerOpen)}>
          <MenuIcon size={19} aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}

/** "More" sheet on phones: chain picker, every section, Instant trade, account links, theme, the tour. */
export function MobileNavDrawer() {
  const open = useUi((s) => s.mobileNavOpen);
  const close = () => useUi.getState().setMobileNavOpen(false);
  const chain = useActiveChain();
  const section = activeSection(useLocation().pathname);
  const account = useSession((s) => s.account);
  const wallet = account?.wallets[chain];
  const { deposit, pending } = useDeposit(chain);
  const { theme, setTheme } = useTheme();

  return (
    <Drawer open={open} onClose={close} side="bottom" title="Menu" bodyClassName="flex flex-col gap-4 p-3">
      <ChainPicker />

      <nav aria-label="All sections" className="grid grid-cols-3 gap-1.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            to={item.href(chain)}
            onClick={close}
            aria-current={item.section === section ? 'page' : undefined}
            className={clsx(
              'flex h-16 flex-col items-center justify-center gap-1 rounded border text-xs font-medium transition-colors',
              item.section === section ? 'border-accent/50 bg-accent/10 text-fg' : 'border-line bg-panel-2 text-muted hover:text-fg',
            )}
          >
            <item.icon size={18} aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="soft"
          icon={<Zap size={14} />}
          onClick={() => {
            close();
            useDock.getState().setSheetOpen(true);
          }}
        >
          Instant trade
        </Button>
        <Button
          variant="soft"
          icon={<Compass size={14} />}
          onClick={() => {
            close();
            startTour();
          }}
        >
          Take the tour
        </Button>
      </div>

      {account ? (
        <section className="flex flex-col gap-2 rounded border border-line bg-panel-2 p-3">
          <div className="flex items-center gap-2.5">
            <WalletAvatar seed={account.id} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{account.username}</p>
              {wallet && <Native value={wallet.nativeBalance} chain={chain} className="text-sm text-muted" />}
            </div>
            <Button size="sm" variant="outline" icon={<Plus size={13} />} loading={pending} onClick={() => void deposit()}>
              Deposit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {account.isGuest && (
              <button
                type="button"
                onClick={() => {
                  close();
                  useSession.getState().promptAuth(true);
                }}
                className="col-span-2 flex h-9 items-center gap-2 rounded px-2 text-sm font-medium text-accent hover:bg-panel-3"
              >
                <UserPlus size={15} aria-hidden />
                Register to keep this account
              </button>
            )}
            {ACCOUNT_ITEMS.map((it) => (
              <Link key={it.key} to={it.href} onClick={close} className="flex h-9 items-center gap-2 rounded px-2 text-sm text-fg hover:bg-panel-3">
                <it.icon size={15} className="text-muted" aria-hidden />
                {it.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                close();
                void useSession
                  .getState()
                  .logout()
                  .then(() => toast.info('Signed out'));
              }}
              className="flex h-9 items-center gap-2 rounded px-2 text-sm text-down hover:bg-down/10"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <Button
          variant="primary"
          block
          icon={<LogIn size={14} />}
          onClick={() => {
            close();
            useSession.getState().promptAuth(true);
          }}
        >
          Sign in to trade
        </Button>
      )}

      <Toggle label="Light theme" checked={theme === 'light'} onChange={(on) => setTheme(on ? 'light' : 'dark')} />
      <SimBanner className="justify-center" />
    </Drawer>
  );
}

/** Full-height search sheet for phones and tablets (opened by the top-bar search button or "/"). */
export function SearchSheet() {
  const open = useUi((s) => s.searchOpen);
  const close = () => useUi.getState().setSearchOpen(false);
  return (
    <Drawer open={open} onClose={close} side="bottom" title="Search" className="h-[88dvh]" bodyClassName="p-3">
      <Omnibox variant="sheet" autoFocus onNavigate={close} />
    </Drawer>
  );
}
