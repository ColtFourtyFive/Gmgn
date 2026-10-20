// Live funding model (pure, unit-tested): exact decimal amounts in base units
// (bigint, never float arithmetic), withdrawal limits that keep the fee
// reserve, whitelist activation and 2FA code checks.

import { shortAddress, type ChainId, type WhitelistEntry } from '@trenchscope/shared';

/** SOL has 9 decimals (lamports). */
export const SOL_DECIMALS = 9;
/**
 * Decimals assumed for SPL tokens: pump.fun mints use 6. The contract carries
 * no per-token decimals, so withdrawals never send more precision than this;
 * the server converts to the mint's real base units.
 */
export const TOKEN_DECIMALS = 6;

export function decimalsFor(mint: string | null): number {
  return mint === null ? SOL_DECIMALS : TOKEN_DECIMALS;
}

/** A 6-digit TOTP code, spaces ignored. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function isTotpCode(raw: string): boolean {
  return /^\d{6}$/.test(normalizeCode(raw));
}

/**
 * A TOTP code or a recovery code (3 groups of 4 letters / digits, dashes and
 * case ignored). Sign-in and turning 2FA off accept both; withdrawals and
 * whitelist changes only a TOTP code.
 */
export function isTotpOrRecoveryCode(raw: string): boolean {
  if (isTotpCode(raw)) return true;
  return /^[a-z0-9]{12}$/i.test(raw.replace(/[\s-]/g, ''));
}

/**
 * Exact base units of a typed decimal amount ("1.5" SOL -> 1_500_000_000n).
 * null when it is not a plain non-negative decimal or has more fractional
 * digits than `decimals` (no rounding: what is typed is what is sent).
 */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const [int = '', frac = ''] = t.split('.');
  if (frac.length > decimals) return null;
  return BigInt((int || '0') + frac.padEnd(decimals, '0'));
}

/**
 * Base units of an API amount (display units, e.g. a balance), rounded down.
 * Server amounts are exact multiples of a base unit; toFixed with a few guard
 * digits recovers them from their float form before truncating.
 */
export function unitsFromNumber(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  const fixed = value.toFixed(Math.min(100, decimals + 3));
  if (/e/i.test(fixed)) return 0n; // beyond toFixed's range: never a real balance
  const [int, frac = ''] = fixed.split('.');
  return BigInt(int + frac.slice(0, decimals).padEnd(decimals, '0'));
}

/** Decimal string of base units, without trailing zeros (1_500_000_000n, 9 -> "1.5"). */
export function formatUnits(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const s = abs.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Something that can be withdrawn: native SOL (mint null) or an SPL token held. */
export interface WithdrawAsset {
  mint: string | null;
  symbol: string;
  /** Balance in display units. */
  balance: number;
  imageUrl?: string | null;
  logoSeed?: string;
  logoGlyph?: string;
}

/**
 * Largest withdrawal in base units: tokens can go in full; SOL keeps
 * `feeReserve` back for the network fee (and token-account rent) so the
 * wallet can still pay for the transfer and later trades.
 */
export function maxWithdrawUnits(asset: Pick<WithdrawAsset, 'mint' | 'balance'>, feeReserve: number): bigint {
  const decimals = decimalsFor(asset.mint);
  const balance = unitsFromNumber(asset.balance, decimals);
  if (asset.mint !== null) return balance;
  const left = balance - unitsFromNumber(feeReserve, SOL_DECIMALS);
  return left > 0n ? left : 0n;
}

export interface WithdrawDraft {
  asset: WithdrawAsset | null;
  amount: string;
  to: string | null;
  code: string;
}

export type WithdrawErrors = Partial<Record<'asset' | 'amount' | 'to' | 'code', string>>;

/** Field errors of a withdrawal draft (empty when it can be sent). */
export function validateWithdraw(d: WithdrawDraft, feeReserve: number, solBalance: number): WithdrawErrors {
  const errors: WithdrawErrors = {};
  if (!d.asset) errors.asset = 'Pick what to withdraw';
  else {
    const decimals = decimalsFor(d.asset.mint);
    const units = d.amount.trim() === '' ? null : parseUnits(d.amount, decimals);
    const max = maxWithdrawUnits(d.asset, feeReserve);
    if (d.amount.trim() === '') errors.amount = 'Enter an amount';
    else if (units === null) errors.amount = /^\d*\.\d+$/.test(d.amount.trim()) ? `Use at most ${decimals} decimals` : 'Enter a number, like 0.5';
    else if (units === 0n) errors.amount = 'Enter an amount above 0';
    else if (units > max) {
      errors.amount =
        d.asset.mint === null
          ? `More than you can withdraw: at most ${formatUnits(max, decimals)} SOL (${formatUnits(unitsFromNumber(feeReserve, SOL_DECIMALS), SOL_DECIMALS)} SOL stays for network fees)`
          : `More than you hold: at most ${formatUnits(max, decimals)} ${d.asset.symbol}`;
    }
    if (d.asset.mint !== null && unitsFromNumber(solBalance, SOL_DECIMALS) === 0n) errors.amount ??= 'You need some SOL in the wallet to pay the network fee';
  }
  if (!d.to) errors.to = 'Pick a whitelisted address';
  if (!isTotpCode(d.code)) errors.code = 'Enter the 6-digit code from your authenticator app';
  return errors;
}

/** The amount to send, in display units, exactly as typed (null when invalid). */
export function withdrawAmount(asset: WithdrawAsset, text: string): number | null {
  const units = parseUnits(text, decimalsFor(asset.mint));
  return units === null || units === 0n ? null : Number(formatUnits(units, decimalsFor(asset.mint)));
}

/** Whitelisted addresses of `chain` that can receive withdrawals now. */
export function activeWhitelist(entries: readonly WhitelistEntry[], chain: ChainId, now: number): WhitelistEntry[] {
  return entries.filter((e) => e.chain === chain && e.activeAt <= now);
}

/** Whitelisted addresses of `chain` still waiting out the activation delay, soonest first. */
export function pendingWhitelist(entries: readonly WhitelistEntry[], chain: ChainId, now: number): WhitelistEntry[] {
  return entries.filter((e) => e.chain === chain && e.activeAt > now).sort((a, b) => a.activeAt - b.activeAt);
}

/** "23h 05m", "4m 10s": time until a pending address activates. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(sec)}s`;
}

/** "Cold wallet · 7xKX…sgAs" */
export function whitelistLabel(e: Pick<WhitelistEntry, 'label' | 'address'>): string {
  const short = shortAddress(e.address, 4, 4);
  return e.label ? `${e.label} · ${short}` : short;
}

/** Plausible Solana address (base58, 32–44 chars); the server checks it for real. */
export function isSolanaAddress(v: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim());
}

/** Idempotency key for one withdrawal: a retry with the same key never sends twice. */
export function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
