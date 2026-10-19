// Password hashing (scrypt + per-user salt), session tokens and random codes.
// Session tokens are only ever stored as SHA-256 digests.

import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

export interface PasswordHash {
  /** hex */
  salt: string;
  /** hex */
  hash: string;
}

/** Compared against when the username does not exist, so lookups cost the same either way. */
const DUMMY_HASH: PasswordHash = { salt: '00'.repeat(16), hash: '00'.repeat(KEY_LENGTH) };

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return { salt: salt.toString('hex'), hash: key.toString('hex') };
}

export async function verifyPassword(password: string, stored: PasswordHash | null): Promise<boolean> {
  const { salt, hash } = stored ?? DUMMY_HASH;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected) && stored !== null;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function randomString(length: number, alphabet: string): string {
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

/** Referral codes avoid look-alike characters (0/O, 1/I/L). */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 7;
