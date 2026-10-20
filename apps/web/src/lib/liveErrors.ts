// Plain-language messages for the live-mode API error codes (contract:
// packages/shared/src/types.ts, "Live-mode error codes"). errorMessage() uses
// them so every toast, inline error and form note says the same thing.

import { isLiveMode } from './mode';

export type LiveErrorCode =
  | 'guest_disabled'
  | 'chain_not_enabled'
  | 'two_factor_unavailable'
  | 'two_factor_enabled'
  | 'not_available_in_live'
  | 'wallets_unavailable'
  | 'trading_unavailable'
  | 'totp_required'
  | 'two_factor_required'
  | 'address_not_whitelisted'
  | 'insufficient_balance'
  | 'tx_failed';

const TEXT: Record<LiveErrorCode, string> = {
  guest_disabled: 'Guest accounts aren’t available with real funds. Create an account with a username and password.',
  chain_not_enabled: 'That chain isn’t available here: Trenchscope live trades Solana only.',
  two_factor_unavailable: 'Two-factor authentication is temporarily unavailable. Try again later.',
  two_factor_enabled: 'Two-factor authentication is already on.',
  not_available_in_live: 'This feature isn’t available on the live platform.',
  wallets_unavailable: 'Wallets are temporarily unavailable. Try again in a minute.',
  trading_unavailable: 'Trading is temporarily unavailable. No order was sent; try again shortly.',
  totp_required: 'Enter the current 6-digit code from your authenticator app.',
  two_factor_required: 'Turn on two-factor authentication in Security settings first.',
  address_not_whitelisted: 'That address isn’t an active whitelisted address. Add it in Security settings and wait for it to activate.',
  insufficient_balance: 'Not enough balance for this amount plus network fees. Deposit SOL or lower the amount.',
  tx_failed: 'The transaction failed on Solana.',
};

/** Codes only a live server sends; insufficient_balance also comes from demo launches (mapped in live only). */
const LIVE_ONLY = new Set<string>(Object.keys(TEXT).filter((c) => c !== 'insufficient_balance'));

export function isLiveErrorCode(code: string | undefined): code is LiveErrorCode {
  return code !== undefined && Object.hasOwn(TEXT, code);
}

/**
 * Message for a live error code, or null when the code is not one (or is
 * shared with demo while the app runs in demo, so demo keeps the server's
 * wording). tx_failed keeps the server's reason after the summary.
 */
export function liveErrorText(code: string | undefined, serverMessage?: string): string | null {
  if (!isLiveErrorCode(code)) return null;
  if (!LIVE_ONLY.has(code) && !isLiveMode()) return null;
  if (code === 'tx_failed' && serverMessage && serverMessage !== TEXT.tx_failed) return `${TEXT.tx_failed} ${capitalize(serverMessage)}`;
  if (code === 'totp_required' && serverMessage && /invalid|wrong|incorrect/i.test(serverMessage)) return 'That code didn’t work. Enter the current 6-digit code from your authenticator app.';
  return TEXT[code];
}

function capitalize(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const sentence = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
