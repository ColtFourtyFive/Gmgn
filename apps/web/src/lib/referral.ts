// Referral links (`/?ref=CODE`): the code is captured when the app boots,
// before any redirect drops the query string, and kept for this tab until
// an account is created, so browsing before signing up keeps it too.

const KEY = 'ts.ref';

/** Remember the `ref` param of a landing URL's query string (no-op without one). */
export function captureReferral(search: string): void {
  const code = new URLSearchParams(search).get('ref')?.trim();
  if (!code) return;
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable: the URL param still works on the landing page */
  }
}

/** The referral code this tab arrived with ('' when none). */
export function pendingReferral(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Forget the code once an account exists. */
export function clearReferral(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
