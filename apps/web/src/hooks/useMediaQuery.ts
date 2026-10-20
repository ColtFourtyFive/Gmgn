import { useCallback, useSyncExternalStore } from 'react';

/** Tailwind breakpoints (min-width, px). */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

function mql(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Live result of a CSS media query (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = mql(query);
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mql(query)?.matches ?? false,
    () => false,
  );
}

/** True at or above a Tailwind breakpoint, e.g. useBreakpoint('lg'). */
export function useBreakpoint(bp: keyof typeof BREAKPOINTS): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[bp]}px)`);
}

/** Below the `md` breakpoint: mobile layout (bottom tab bar, drawers, sheets). */
export function useIsMobile(): boolean {
  return !useBreakpoint('md');
}

/** User asked the OS to minimise motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Behavior for programmatic scrolling (scrollIntoView / scrollTo): smooth,
 * or instant when the user prefers reduced motion. The CSS reduced-motion
 * rules do not reach scrolls started from script.
 */
export function scrollBehavior(): ScrollBehavior {
  return mql('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
}
