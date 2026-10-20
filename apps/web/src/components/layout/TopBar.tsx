import { Command, Search, Zap } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { MOD_KEY, useHotkeys } from '@/hooks/useHotkeys';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useDisplaySettings } from '@/hooks/useSettings';
import { useDock } from '@/store/dock';
import { useUi } from '@/store/ui';
import { AccountMenu, BalancePill, ThemeToggle } from './AccountControls';
import { ChainSwitcher } from './ChainSwitcher';
import { Logo } from './Logo';
import { MainNav } from './MainNav';
import { NotificationsBell } from './NotificationsBell';
import { Omnibox } from './Omnibox';

/**
 * App header. ≥lg: inline omnibox (with the ⌘K palette hint); below lg:
 * search and command palette buttons; <md: compact controls only (sections
 * live in the bottom tab bar + drawer). ≥md also toggles the Instant trade
 * dock (phones open it from the menu).
 */
export function TopBar() {
  const chain = useActiveChain();
  const desktop = useBreakpoint('md');
  const wide = useBreakpoint('lg');
  const xl = useBreakpoint('xl');
  const { hotkeys } = useDisplaySettings();
  const dockOpen = useDock((s) => s.open && !s.collapsed);
  const openSearch = () => useUi.getState().setSearchOpen(true);
  useHotkeys({ '/': openSearch }, { enabled: !wide && hotkeys });

  return (
    <header className="relative z-header flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-3 md:gap-3">
      <Logo compact={!xl} />
      {desktop ? <MainNav chain={chain} /> : <span className="flex-1" />}
      {wide ? (
        <Omnibox className="w-[clamp(200px,18vw,300px)] shrink-0" />
      ) : (
        <div data-tour="search" className="flex shrink-0 items-center">
          <IconButton label="Search (/)" icon={<Search size={16} />} onClick={openSearch} />
          <IconButton
            label={`Command palette (${MOD_KEY}+K)`}
            icon={<Command size={15} />}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => useUi.getState().setPaletteOpen(true)}
          />
        </div>
      )}
      <div data-tour="chain" className="flex shrink-0 items-center">
        <ChainSwitcher compact={!desktop} />
      </div>
      <BalancePill chain={chain} compact={!desktop} />
      <div className="flex shrink-0 items-center gap-1">
        {desktop && (
          <IconButton
            data-tour="dock"
            data-dock-toggle
            label="Instant trade & positions (I)"
            icon={<Zap size={16} />}
            active={dockOpen}
            aria-keyshortcuts="I"
            onClick={() => useDock.getState().toggle()}
          />
        )}
        <NotificationsBell />
        {desktop && <ThemeToggle />}
        <AccountMenu />
      </div>
    </header>
  );
}
