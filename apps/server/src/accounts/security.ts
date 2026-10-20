// Account security for live mode: the TOTP second factor (secrets sealed with
// AES-256-GCM under SECRETS_KEY), one-time recovery codes (stored as SHA-256
// digests), failed-code throttling and the withdrawal address whitelist.
//
// Everything here works on an account's SecurityState (persisted with the
// account); the Accounts service adds auditing, notifications and persistence.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { shortAddress, type ChainId, type TotpSetup, type WhitelistEntry } from '@trenchscope/shared';
import { HttpError, type AuditRecord } from '../context';
import { randomString } from './credentials';
import { base32Encode, newTotpSecret, otpauthUrl, verifyTotp } from './totp';

export const TOTP_ISSUER = 'Trenchscope';
export const RECOVERY_CODE_COUNT = 10;
/** Recovery codes: 3 groups of 4 from a 32-letter alphabet (60 bits). */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const RECOVERY_GROUPS = 3;
const RECOVERY_GROUP_LENGTH = 4;
/** Failed second-factor codes allowed per account per window before it locks. */
export const MAX_CODE_FAILURES = 5;
export const CODE_FAILURE_WINDOW_MS = 10 * 60_000;
export const CODE_LOCK_MS = 15 * 60_000;
export const MAX_WHITELIST_ENTRIES = 20;
/** An unconfirmed 2FA setup expires after this long. */
export const TOTP_SETUP_TTL_MS = 30 * 60_000;

const SEALED_VERSION = 'v1';
const IV_BYTES = 12;

/** The SECRETS_KEY env value as a 32-byte key, or null when absent / malformed. */
export function parseSecretsKey(hex: string | null | undefined): Buffer | null {
  const clean = hex?.trim();
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return Buffer.from(clean, 'hex');
}

/**
 * AES-256-GCM sealing of small secrets. `context` (the account id) is bound as associated data,
 * so a sealed value copied onto another account does not open.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox needs a 32-byte key');
  }

  seal(plain: Uint8Array, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [SEALED_VERSION, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join(':');
  }

  /** Throws when the value was tampered with, sealed for another context or under another key. */
  open(sealed: string, context: string): Buffer {
    const [version, iv, tag, body] = sealed.split(':');
    if (version !== SEALED_VERSION || !iv || !tag || body === undefined) throw new Error('unrecognized sealed secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]);
  }
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const groups: string[] = [];
    for (let g = 0; g < RECOVERY_GROUPS; g++) groups.push(randomString(RECOVERY_GROUP_LENGTH, RECOVERY_ALPHABET));
    codes.add(groups.join('-'));
  }
  return [...codes];
}

/** A recovery code in canonical form (lower case, no separators), or null when it cannot be one. */
export function normalizeRecoveryCode(code: string): string | null {
  const clean = code.replace(/[\s-]/g, '').toLowerCase();
  const re = new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH}}$`);
  return re.test(clean) ? clean : null;
}

/** Digest stored for a recovery code (salted with the account id). */
export function hashRecoveryCode(accountId: string, code: string): string {
  const clean = normalizeRecoveryCode(code) ?? code;
  return createHash('sha256').update(`trenchscope-recovery:${accountId}:${clean}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Per-account security state
// ---------------------------------------------------------------------------

export interface SecurityState {
  /** Enabled TOTP: the sealed secret and the last accepted step (replay protection). */
  totp: { secret: string; enabledAt: number; lastStep: number | null } | null;
  /** Setup awaiting its first code (POST /api/security/2fa/enable). */
  pendingTotp: { secret: string; createdAt: number } | null;
  /** SHA-256 digests of the unused recovery codes. */
  recoveryCodes: string[];
  whitelist: WhitelistEntry[];
  /** Times of failed codes inside the current window. */
  codeFailures: number[];
  /** Second-factor checks are refused until then (0 = not locked). */
  lockedUntil: number;
}

export function emptySecurity(): SecurityState {
  return { totp: null, pendingTotp: null, recoveryCodes: [], whitelist: [], codeFailures: [], lockedUntil: 0 };
}

/** A stored state with any missing fields filled in (older saves). */
export function normalizeSecurity(s: Partial<SecurityState> | undefined): SecurityState | undefined {
  if (!s) return undefined;
  return { ...emptySecurity(), ...s, whitelist: [...(s.whitelist ?? [])], recoveryCodes: [...(s.recoveryCodes ?? [])], codeFailures: [...(s.codeFailures ?? [])] };
}

export type CodeKind = 'totp' | 'recovery';

/** Outcome of a second-factor check; `locked` is true when this failure locked the account. */
export type CodeCheck = { ok: true; kind: CodeKind } | { ok: false; locked: boolean };

export class SecondFactor {
  constructor(
    private readonly box: SecretBox | null,
    private readonly clock: () => number,
  ) {}

  get available(): boolean {
    return this.box !== null;
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new HttpError(503, 'two-factor authentication is not configured on this server', 'two_factor_unavailable');
    return this.box;
  }

  private openSecret(sealed: string, accountId: string): Buffer {
    try {
      return this.requireBox().open(sealed, accountId);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Wrong / rotated SECRETS_KEY or a damaged value: never fall back to "no second factor".
      console.error(`[security] cannot open the TOTP secret of ${accountId}: ${err instanceof Error ? err.message : err}`);
      throw new HttpError(503, 'two-factor authentication is unavailable right now', 'two_factor_unavailable');
    }
  }

  /** Start (or restart) enrolment: a fresh secret, pending until confirmed with a code. */
  beginSetup(state: SecurityState, accountId: string, username: string): TotpSetup {
    if (state.totp) throw new HttpError(409, 'two-factor authentication is already enabled', 'two_factor_enabled');
    const box = this.requireBox();
    const raw = newTotpSecret();
    state.pendingTotp = { secret: box.seal(raw, accountId), createdAt: this.clock() };
    const secret = base32Encode(raw);
    return { secret, otpauthUrl: otpauthUrl({ issuer: TOTP_ISSUER, account: username, secret }) };
  }

  /** Confirm enrolment with a code from the pending secret; returns the plain recovery codes (shown once). */
  enable(state: SecurityState, accountId: string, code: string): { ok: true; recoveryCodes: string[] } | { ok: false; locked: boolean } {
    if (state.totp) throw new HttpError(409, 'two-factor authentication is already enabled', 'two_factor_enabled');
    const pending = state.pendingTotp;
    const now = this.clock();
    if (!pending || now - pending.createdAt > TOTP_SETUP_TTL_MS) {
      state.pendingTotp = null;
      throw new HttpError(400, 'start two-factor setup first (or again: it expired)', 'invalid_input');
    }
    this.assertNotLocked(state);
    const step = verifyTotp(this.openSecret(pending.secret, accountId), code, now, null);
    if (step === null) return { ok: false, locked: this.recordFailure(state) };
    const recoveryCodes = newRecoveryCodes();
    state.totp = { secret: pending.secret, enabledAt: now, lastStep: step };
    state.pendingTotp = null;
    state.recoveryCodes = recoveryCodes.map((c) => hashRecoveryCode(accountId, c));
    state.codeFailures = [];
    return { ok: true, recoveryCodes };
  }

  /**
   * Check a code against the enabled factor: a TOTP code (accepted once), or with `allowRecovery`
   * an unused recovery code (consumed). Throws 429 while locked; false when 2FA is off.
   */
  check(state: SecurityState, accountId: string, code: string, opts: { allowRecovery?: boolean } = {}): CodeCheck {
    if (!state.totp) return { ok: false, locked: false };
    this.assertNotLocked(state);
    const now = this.clock();
    const step = verifyTotp(this.openSecret(state.totp.secret, accountId), code, now, state.totp.lastStep);
    if (step !== null) {
      state.totp.lastStep = step;
      state.codeFailures = [];
      return { ok: true, kind: 'totp' };
    }
    if (opts.allowRecovery && normalizeRecoveryCode(code)) {
      const digest = Buffer.from(hashRecoveryCode(accountId, code), 'hex');
      // Compare against every stored digest so timing does not tell which (if any) matched.
      let index = -1;
      state.recoveryCodes.forEach((stored, i) => {
        const b = Buffer.from(stored, 'hex');
        if (b.length === digest.length && timingSafeEqual(b, digest) && index < 0) index = i;
      });
      if (index >= 0) {
        state.recoveryCodes.splice(index, 1);
        state.codeFailures = [];
        return { ok: true, kind: 'recovery' };
      }
    }
    return { ok: false, locked: this.recordFailure(state) };
  }

  disable(state: SecurityState): void {
    state.totp = null;
    state.pendingTotp = null;
    state.recoveryCodes = [];
  }

  /** 429 while the account is locked after too many failed codes. */
  assertNotLocked(state: SecurityState): void {
    const now = this.clock();
    if (state.lockedUntil > now) {
      const seconds = Math.ceil((state.lockedUntil - now) / 1000);
      throw new HttpError(429, `too many invalid codes, try again in ${seconds}s`, 'rate_limited', { 'retry-after': String(seconds) });
    }
  }

  /** Count a failed code; true when it locked the account. */
  private recordFailure(state: SecurityState): boolean {
    const now = this.clock();
    state.codeFailures = state.codeFailures.filter((t) => now - t < CODE_FAILURE_WINDOW_MS);
    state.codeFailures.push(now);
    if (state.codeFailures.length < MAX_CODE_FAILURES) return false;
    state.codeFailures = [];
    state.lockedUntil = now + CODE_LOCK_MS;
    return true;
  }

  // ---- whitelist ----

  /** Add (or relabel) a withdrawal address; a new one becomes usable after `delayMs`. */
  addWhitelist(state: SecurityState, entry: { chain: ChainId; address: string; label: string }, delayMs: number): { entry: WhitelistEntry; added: boolean } {
    const existing = state.whitelist.find((e) => e.chain === entry.chain && e.address === entry.address);
    if (existing) {
      existing.label = entry.label;
      return { entry: { ...existing }, added: false };
    }
    if (state.whitelist.length >= MAX_WHITELIST_ENTRIES) throw new HttpError(400, `at most ${MAX_WHITELIST_ENTRIES} whitelisted addresses`, 'limit_reached');
    const now = this.clock();
    const created: WhitelistEntry = { chain: entry.chain, address: entry.address, label: entry.label, addedAt: now, activeAt: now + Math.max(0, delayMs) };
    state.whitelist.push(created);
    return { entry: { ...created }, added: true };
  }

  removeWhitelist(state: SecurityState, chain: ChainId, address: string): WhitelistEntry | null {
    const index = state.whitelist.findIndex((e) => e.chain === chain && e.address === address);
    if (index < 0) return null;
    return state.whitelist.splice(index, 1)[0];
  }

  canWithdrawTo(state: SecurityState | undefined, chain: ChainId, address: string): boolean {
    const entry = state?.whitelist.find((e) => e.chain === chain && e.address === address);
    return !!entry && entry.activeAt <= this.clock();
  }
}

// ---------------------------------------------------------------------------
// Security events (GET /api/security reads them from the audit table)
// ---------------------------------------------------------------------------

/** Audit actions listed as an account's security events. */
export const SECURITY_EVENT_ACTIONS: readonly string[] = [
  'register',
  'wallet_created',
  'login',
  'login_failed',
  'password_changed',
  'password_change_failed',
  '2fa_enabled',
  '2fa_disabled',
  '2fa_failed',
  '2fa_locked',
  'recovery_code_used',
  'whitelist_add',
  'whitelist_label',
  'whitelist_remove',
  'withdrawal_requested',
  'withdrawal_rejected',
  'withdrawal_sent',
  'withdrawal_confirmed',
  'withdrawal_failed',
];

const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const addr = (v: unknown) => (typeof v === 'string' && v.length > 16 ? shortAddress(v) : str(v));

/** One-line human description of an audit record (never includes secrets: audit details hold none). */
export function describeSecurityEvent(rec: AuditRecord): string {
  const d = rec.detail ?? {};
  switch (rec.action) {
    case 'register':
      return 'account created';
    case 'wallet_created':
      return `wallet ${addr(d.address)} created`;
    case 'login':
      return d.method === 'recovery' ? 'signed in with a recovery code' : d.method === 'totp' ? 'signed in with password and 2FA code' : 'signed in';
    case 'login_failed':
      return d.reason === 'two_factor' ? 'sign-in failed: invalid 2FA code' : 'sign-in failed: wrong password';
    case 'password_changed':
      return 'password changed, other sessions signed out';
    case 'password_change_failed':
      return 'password change failed: wrong current password';
    case '2fa_enabled':
      return '2FA enabled';
    case '2fa_disabled':
      return '2FA disabled, all sessions signed out';
    case '2fa_failed':
      return `invalid 2FA code${d.purpose ? ` (${str(d.purpose).replace(/_/g, ' ')})` : ''}`;
    case '2fa_locked':
      return '2FA locked for 15 minutes after repeated invalid codes';
    case 'recovery_code_used':
      return `recovery code used (${str(d.remaining)} left)`;
    case 'whitelist_add':
      return `withdrawal address ${addr(d.address)}${d.label ? ` (${str(d.label)})` : ''} added`;
    case 'whitelist_label':
      return `withdrawal address ${addr(d.address)} relabelled${d.label ? ` "${str(d.label)}"` : ''}`;
    case 'whitelist_remove':
      return `withdrawal address ${addr(d.address)} removed`;
    default: {
      const parts = Object.entries(d)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => `${k}: ${k === 'to' || k === 'address' || k === 'signature' || k === 'mint' ? addr(v) : str(v)}`);
      return parts.join(', ');
    }
  }
}
