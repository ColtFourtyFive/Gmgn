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

/**
 * scrypt runs on libuv's threadpool (4 threads by default), which static file reads and WebSocket
 * deflate share: at most this many password hashes run at once, so a sign-in flood never takes it all.
 */
export const MAX_CONCURRENT_HASHES = 2;
/** Hashes that may wait for a slot; past this a hash is refused at once (PasswordHashBusy) instead of queueing without bound. */
export const MAX_QUEUED_HASHES = 32;

/** Thrown when MAX_QUEUED_HASHES hashes are already waiting. */
export class PasswordHashBusy extends Error {
  constructor() {
    super('password hashing is saturated');
  }
}

let hashing = 0;
const hashQueue: (() => void)[] = [];

/** Password hashes running and waiting for a slot right now. */
export function passwordHashLoad(): { running: number; queued: number } {
  return { running: hashing, queued: hashQueue.length };
}

async function scryptGated(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  if (hashing < MAX_CONCURRENT_HASHES) hashing++;
  else if (hashQueue.length >= MAX_QUEUED_HASHES) throw new PasswordHashBusy();
  else await new Promise<void>((resolve) => hashQueue.push(resolve));
  try {
    return await scryptAsync(password, salt, keylen);
  } finally {
    // Hand the slot straight to the next waiter, or free it.
    const next = hashQueue.shift();
    if (next) next();
    else hashing--;
  }
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const key = await scryptGated(password, salt, KEY_LENGTH);
  return { salt: salt.toString('hex'), hash: key.toString('hex') };
}

export async function verifyPassword(password: string, stored: PasswordHash | null): Promise<boolean> {
  const { salt, hash } = stored ?? DUMMY_HASH;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptGated(password, Buffer.from(salt, 'hex'), expected.length);
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
