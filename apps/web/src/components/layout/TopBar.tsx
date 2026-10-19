import { Search } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useDisplaySettings } from '@/hooks/useSettings';
import { useUi } from '@/store/ui';
import { AccountMenu, BalancePill, ThemeToggle } from './AccountControls';
import { ChainSwitcher } from './ChainSwitcher';
import { Logo } from './Logo';
import { MainNav } from './MainNav';
import { NotificationsBell } from './NotificationsBell';
import { Omnibox } from './Omnibox';

/**
 * App header. ≥lg: inline omnibox; md..lg: search button; <md: compact
 * controls only (sections live in the bottom tab bar + drawer).
 */
export function TopBar() {
  const chain = useActiveChain();
  const desktop = useBreakpoint('md');
  const wide = useBreakpoint('lg');
  const xl = useBreakpoint('xl');
  const { hotkeys } = useDisplaySettings();
  const openSearch = () => useUi.getState().setSearchOpen(true);
  useHotkeys({ '/': openSearch }, { enabled: !wide && hotkeys });

  return (
    <header className="relative z-header flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-3 md:gap-3">
      <Logo compact={!xl} />
      {desktop ? <MainNav chain={chain} /> : <span className="flex-1" />}
      {wide ? (
        <Omnibox className="w-[clamp(200px,18vw,300px)] shrink-0" />
      ) : (
        <IconButton label="Search (/)" icon={<Search size={16} />} onClick={openSearch} />
      )}
      <ChainSwitcher compact={!desktop} />
      <BalancePill chain={chain} compact={!desktop} />
      <div className="flex shrink-0 items-center gap-1">
        <NotificationsBell />
        {desktop && <ThemeToggle />}
        <AccountMenu />
      </div>
    </header>
  );
}
