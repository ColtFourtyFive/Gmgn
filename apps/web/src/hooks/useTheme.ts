import { useCallback, useEffect } from 'react';
import { useSession } from '@/store/session';
import { useUi, type Theme } from '@/store/ui';

/**
 * Current theme plus setters. Changes apply instantly, persist in
 * localStorage, and are saved to account settings when signed in.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const theme = useUi((s) => s.theme);

  const setTheme = useCallback((next: Theme) => {
    useUi.getState().setTheme(next);
    const session = useSession.getState();
    if (session.token && session.settings?.display.theme !== next) {
      session.saveSettings({ display: { theme: next } }).catch(() => {
        /* local theme already applied; account sync is best effort */
      });
    }
  }, []);

  const toggle = useCallback(() => setTheme(useUi.getState().theme === 'dark' ? 'light' : 'dark'), [setTheme]);

  return { theme, setTheme, toggle };
}

/** Adopt the account's saved theme whenever settings load (mounted once by the shell). */
export function useThemeSync(): void {
  const saved = useSession((s) => s.settings?.display.theme);
  useEffect(() => {
    if (saved && saved !== useUi.getState().theme) useUi.getState().setTheme(saved);
  }, [saved]);
}
