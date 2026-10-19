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
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.status >= 502) return 'Server unreachable — is the API running?';
    return err.message || fallback;
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) return 'Network error — server unreachable';
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  return fallback;
}
