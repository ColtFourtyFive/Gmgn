import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui';
import { chainFromPath } from '@/hooks/useActiveChain';
import { useClockSync } from '@/hooks/useMeta';
import { useThemeSync } from '@/hooks/useTheme';
import { TRADING_QUERY_KEYS, useUserChannel } from '@/hooks/useUserChannel';
import { useDock } from '@/store/dock';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { AuthModal } from './AuthModal';
import { CommandPalette } from './CommandPalette';
import { InstantDock } from './InstantDock';
import { MobileNavDrawer, MobileTabBar, SearchSheet } from './MobileNav';
import { tokenRoute } from './nav';
import { PageErrorBoundary } from './PageErrorBoundary';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { Tour } from './Tour';

/**
 * Keep the preferred chain in sync with `:chain` routes, remember the last
 * token page (the Instant trade dock's target elsewhere) and reset per-page
 * overlays on navigation.
 */
function useRouteEffects(main: RefObject<HTMLElement>, pathname: string): void {
  const routeChain = chainFromPath(pathname);
  useEffect(() => {
    if (routeChain && routeChain !== useUi.getState().chain) useUi.getState().setChain(routeChain);
  }, [routeChain]);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    const ui = useUi.getState();
    ui.setMobileNavOpen(false);
    ui.setSearchOpen(false);
    ui.setPaletteOpen(false);
    useDock.getState().setSheetOpen(false);
    const token = tokenRoute(pathname);
    if (token) useDock.getState().setLastToken(token);
  }, [pathname, main]);
}

/** Signing in/out changes viewer-relative data everywhere: drop private caches and refetch. */
function useAuthQueryReset(): void {
  const token = useSession((s) => s.token);
  const qc = useQueryClient();
  const prev = useRef(token);
  useEffect(() => {
    if (prev.current === token) return;
    prev.current = token;
    // Blacklist and watchlist are per-account too: a different account must not briefly inherit them.
    for (const queryKey of [['notifications'], ['blacklist'], ['watchlist'], ...TRADING_QUERY_KEYS]) qc.removeQueries({ queryKey: [...queryKey] });
    void qc.invalidateQueries();
  }, [token, qc]);
}

/**
 * Application frame: top bar, scrollable main area, desktop status bar,
 * phone tab bar + drawers, auth modal, command palette (Ctrl/Cmd+K), the
 * Instant trade dock, the onboarding tour and toasts. Also mounts the private
 * user channel, theme/clock sync. `<main>` is the scroll container and fills
 * the remaining height, so pages can use `h-full` for terminal layouts. A
 * page that throws while rendering is contained by PageErrorBoundary.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useUserChannel();
  useThemeSync();
  useClockSync();
  useAuthQueryReset();
  useRouteEffects(mainRef, pathname);

  return (
    <div className="h-app flex flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-toast focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <TopBar />
      <main ref={mainRef} id="main" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none">
        <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>
      </main>
      <StatusBar className="hidden md:flex" />
      <MobileTabBar className="md:hidden" />
      <MobileNavDrawer />
      <SearchSheet />
      <AuthModal />
      <CommandPalette />
      <InstantDock />
      <Tour />
      <Toaster />
    </div>
  );
}
