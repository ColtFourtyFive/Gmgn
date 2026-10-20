// Thin UI helpers around the shared formatters (@trenchscope/shared/format).
// Components in components/common render these; use them directly only for
// plain strings (titles, toasts, aria labels).

import { CHAINS, formatNative, type ChainId } from '@trenchscope/shared';
import { ApiError } from '@/lib/api';

export type Tone = 'up' | 'down' | 'neutral';

/** Sign of a value as a semantic tone (null/0/NaN -> neutral). */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'neutral';
  return value > 0 ? 'up' : 'down';
}

const TONE_CLASS: Record<Tone, string> = { up: 'text-up', down: 'text-down', neutral: 'text-muted' };

/** Tailwind text color for a signed value: green / red / muted. */
export function toneClass(value: number | null | undefined): string {
  return TONE_CLASS[toneOf(value)];
}

/** Native amount with the chain's symbol: "1.25 SOL". */
export function formatNativeFor(chain: ChainId, value: number | null | undefined, digits?: number): string {
  return formatNative(value, CHAINS[chain].nativeSymbol, digits);
}

/** Human readable message from anything thrown (ApiError, Error, string). */
/**
 * A lazy page chunk (or its CSS) failed to load: a network blip, or a deploy
 * removed the old hashed files. React caches the failed import, so only a
 * reload recovers. Chrome, Firefox, Safari and Vite word it differently.
 */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /dynamically imported module|importing a module script failed|loading (css )?chunk|unable to preload css/i.test(message);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (isChunkLoadError(err)) return 'This part of the app didn’t load — the connection dropped or a new version is out. Reload the page.';
  if (err instanceof ApiError) {
    if (err.status === 0 || err.status >= 502) return 'Server unreachable — is the API running?';
    return err.message || fallback;
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) return 'Network error — server unreachable';
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  return fallback;
}
