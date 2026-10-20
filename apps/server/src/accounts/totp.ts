// TOTP second factor (RFC 6238 over RFC 4226 HOTP) with node:crypto only:
// HMAC-SHA-1, 30-second steps, 6 digits, accepted one step either side of now.
// The caller keeps the last accepted step per account and passes it back, so a
// code (or an older one in the window) is accepted once only (RFC 6238 §5.2).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of the current one (clock drift / typing time). */
export const TOTP_WINDOW = 1;
/** 160-bit secrets, as RFC 4226 recommends for HMAC-SHA-1. */
export const TOTP_SECRET_BYTES = 20;

export type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, upper case, no padding (what authenticator apps expect). */
export function base32Encode(buf: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Decode base32 (case-insensitive; spaces, dashes and padding ignored). Throws on other characters. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): Buffer {
  return randomBytes(TOTP_SECRET_BYTES);
}

/** RFC 4226 HOTP value of `counter` (dynamic truncation, zero-padded to `digits`). */
export function hotp(key: Uint8Array, counter: number | bigint, digits = TOTP_DIGITS, algorithm: TotpAlgorithm = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The time step (T) containing `atMs`. */
export function totpStep(atMs: number, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(atMs / 1000 / period);
}

export function totp(key: Uint8Array, atMs: number, opts: { digits?: number; period?: number; algorithm?: TotpAlgorithm } = {}): string {
  return hotp(key, totpStep(atMs, opts.period), opts.digits, opts.algorithm);
}

/** A well-formed code (digits only, spaces ignored), or null. */
export function normalizeTotpCode(code: string, digits = TOTP_DIGITS): string | null {
  const clean = code.replace(/\s/g, '');
  return new RegExp(`^\\d{${digits}}$`).test(clean) ? clean : null;
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The step `code` matches within ±TOTP_WINDOW of `atMs` and after `lastStep` (replay protection),
 * or null. Every candidate step is compared, so timing does not reveal which one matched.
 */
export function verifyTotp(key: Uint8Array, code: string, atMs: number, lastStep: number | null): number | null {
  const clean = normalizeTotpCode(code);
  if (!clean) return null;
  const now = totpStep(atMs);
  let matched: number | null = null;
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    if (step < 0) continue;
    const ok = sameCode(hotp(key, step), clean);
    if (ok && matched === null && (lastStep === null || step > lastStep)) matched = step;
  }
  return matched;
}

/** Key URI for authenticator apps (Google Authenticator "Key Uri Format"). */
export function otpauthUrl(opts: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
