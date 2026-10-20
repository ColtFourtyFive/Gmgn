// Accounts service: paper-trading accounts with bearer sessions, one paper
// wallet per chain (living in the World), settings, followed wallets,
// watchlist, notifications and the rewards/referral program.
//
// Live mode (real funds): no guests; registering provisions the account's embedded Solana
// wallet with the signer first (its World wallet starts at 0, balances come from chain sync);
// sessions expire after LIVE_SESSION_TTL_DAYS without use; TOTP 2FA with recovery codes,
// failed-code throttling and the withdrawal whitelist (security.ts); every security-relevant
// action is audited to the durable store, and state is written through to it (setPersistence).

import { randomBytes } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import {
  BLACKLIST_LIMITS,
  CHAINS,
  CHAIN_IDS,
  WATCHLIST_LIMITS,
  formatNative,
  formatUsd,
  shortAddress,
  type Account,
  type AppNotification,
  type AuthResponse,
  type Blacklist,
  type BlacklistEntry,
  type BlacklistKind,
  type ChainId,
  type FollowedWallet,
  type RewardsSummary,
  type SecurityStatus,
  type TokenSummary,
  type TotpEnableResponse,
  type TotpSetup,
  type Trade,
  type UserSettings,
  type UserWallet,
  type WatchlistGroup,
  type WatchlistItem,
  type WatchlistResponse,
  type WhitelistEntry,
} from '@trenchscope/shared';
import { HttpError, type AccountsApi, type AppContext, type AuditRecord, type EmbeddedWalletRef } from '../context';
import { DEFAULT_SESSION_TTL_DAYS, DEFAULT_WHITELIST_DELAY_HOURS, type LiveSecurityConfig } from '../live/config';
import type { WalletState } from '../sim/world';
import { enabledChains } from './live';
import {
  SECURITY_EVENT_ACTIONS,
  SecondFactor,
  SecretBox,
  describeSecurityEvent,
  emptySecurity,
  normalizeSecurity,
  parseSecretsKey,
  type CodeCheck,
  type SecurityState,
} from './security';
import {
  PasswordHashBusy,
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  digestToken,
  hashPassword,
  newSessionToken,
  randomString,
  verifyPassword,
  type PasswordHash,
} from './credentials';
import { REFERRED_CASHBACK_RATE, REWARD_TIERS, USD_PER_POINT, emptyRewards, tierIndexFor, tierVolume, type RewardsCounters } from './rewards';
import { applySettingsPatch, defaultSettings, normalizeSettings, type SettingsPatch } from './settings';

export const MAX_FOLLOWS = 500;
export const MAX_WATCHLIST = 500;
export const MAX_NOTIFICATIONS = 200;
export const FAUCET_COOLDOWN_MS = 60_000;
export const FOLLOW_NOTIFY_THROTTLE_MS = 15_000;
/** Oldest sessions are revoked beyond this many per account, so repeated logins cannot grow memory without bound. */
export const MAX_SESSIONS_PER_ACCOUNT = 20;
/** Sign-in attempts allowed per (username, client address) per window before answering 429 (online password guessing). */
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60_000;
/** PRD §14 Q9: guest accounts are kept this long after their last activity, then purged. */
export const GUEST_RETENTION_MS = 30 * 24 * 3_600_000;
const HOUSEKEEPING_EVERY_MS = 60_000;
/** Usernames with this prefix are reserved for generated guest accounts. */
export const GUEST_PREFIX = 'guest_';
const GUEST_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const DEFAULT_FOLLOW_GROUP = 'Default';
const MAX_INVITEE_ROWS = 200;
const SNAPSHOT_VERSION = 1;
/** Live mode: minimum password length (real funds). */
export const LIVE_MIN_PASSWORD_LENGTH = 10;
/** Security events listed in GET /api/security. */
export const RECENT_SECURITY_EVENTS = 20;

/** Durable write-through of the accounts state (live mode). */
export interface AccountsPersistence {
  /** Save shortly (bursts of changes coalesce into one write). */
  soon(): void;
  /** Save now; throws when the write fails. */
  now(): void;
}

/** A follow as stored; label and tags are read from the wallet when served. */
type StoredFollow = Omit<FollowedWallet, 'label' | 'tags'>;

/** [sha256(token), account id, live mode: wall time the session was last used] */
type StoredSession = [digest: string, accountId: string, lastSeenAt?: number];

interface AccountRecord {
  id: string;
  username: string;
  /** Null for guests until they register. */
  password: PasswordHash | null;
  isGuest: boolean;
  createdAt: number;
  /** Sim time of the last sign-in, authenticated request or fill (guest retention). */
  lastActiveAt: number;
  referralCode: string;
  referredBy: string | null;
  settings: UserSettings;
  /**
   * Wallet address per chain; the WalletState itself lives in the world snapshot. Demo: a paper
   * wallet on every chain. Live: the enabled chains only, at the embedded wallet's address.
   */
  wallets: Partial<Record<ChainId, string>>;
  /** Live mode: the provider-held wallet behind each chain wallet. */
  embedded?: Partial<Record<ChainId, EmbeddedWalletRef>>;
  /** Live mode: second factor, recovery codes, withdrawal whitelist, failed-code throttling. */
  security?: SecurityState;
  /** `${chain}:${address}` -> follow, in follow order. */
  follows: Map<string, StoredFollow>;
  /** Newest first. */
  watchlist: WatchlistItem[];
  /** Ordered by `order` (0..n-1); "All" is implicit. */
  watchlistGroups: WatchlistGroup[];
  blacklist: Blacklist;
  /** Ring buffer, oldest first. */
  notifications: AppNotification[];
  rewards: RewardsCounters;
  /** Sim time of the last faucet deposit per chain. */
  faucetClaims: Partial<Record<ChainId, number>>;
}

type StoredAccount = Omit<AccountRecord, 'follows'> & { follows: StoredFollow[] };

interface AccountsSnapshot {
  version: number;
  accounts: StoredAccount[];
  sessions: StoredSession[];
}

export interface FollowInput {
  remark?: string;
  group?: string;
  notify?: boolean;
}

export interface WatchlistItemPatch {
  groupIds?: string[];
  /** Blank removes the note. */
  note?: string;
}

export interface WatchlistGroupPatch {
  name?: string;
  /** null removes the color. */
  color?: string | null;
  /** New 0-based position; the other groups shift around it. */
  order?: number;
}

export type FaucetResult = { ok: true; wallet: UserWallet } | { ok: false; retryAfterSeconds: number };

const walletKey = (chain: ChainId, address: string) => `${chain}:${address}`;
const emptyBlacklist = (): Blacklist => ({ tokens: [], creators: [], keywords: [] });
const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');
const isAmount = (v: number) => Number.isFinite(v) && v >= 0;

/** A password hash refused because the hashing queue is full: 503, the client retries shortly. */
function hashBusy(err: unknown): unknown {
  return err instanceof PasswordHashBusy ? new HttpError(503, 'sign-in is busy, try again in a moment', 'busy', { 'retry-after': '1' }) : err;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

function removeFromSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

function copyItem(item: WatchlistItem): WatchlistItem {
  return item.groupIds ? { ...item, groupIds: [...item.groupIds] } : { ...item };
}

function isSnapshot(data: unknown): data is AccountsSnapshot {
  if (typeof data !== 'object' || data === null) return false;
  const s = data as Partial<AccountsSnapshot>;
  return s.version === SNAPSHOT_VERSION && Array.isArray(s.accounts) && Array.isArray(s.sessions);
}

/**
 * An empty wallet outside the World, standing in for a chain the account has no wallet on (live
 * mode: chains that are not enabled), so code iterating every chain keeps working.
 */
function detachedWallet(chain: ChainId, accountId: string): WalletState {
  return {
    chain,
    address: '',
    archetype: 'user',
    label: null,
    tags: new Set(),
    native: 0,
    createdAt: 0,
    fundedBy: null,
    fundAmount: null,
    positions: new Map(),
    skill: 0.5,
    aggression: 0.5,
    xFollowers: null,
    followerCount: 0,
    createdTokens: [],
    lastActiveAt: 0,
    accountId,
    memory: {},
  };
}

function isSolanaAddress(address: string): boolean {
  try {
    return new PublicKey(address).toBase58() === address;
  } catch {
    return false;
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class Accounts implements AccountsApi {
  private readonly records = new Map<string, AccountRecord>();
  /** lowercase username -> account id */
  private readonly byUsername = new Map<string, string>();
  private readonly byReferralCode = new Map<string, string>();
  /** sha256(session token) -> account id */
  private readonly sessions = new Map<string, string>();
  /** account id -> its session digests, oldest first */
  private readonly sessionsByAccount = new Map<string, string[]>();
  /** `${lowercase username}|${client address}` -> sign-in attempts in the current window (not persisted) */
  private readonly loginAttempts = new Map<string, { count: number; since: number }>();
  /** paper wallet address -> owning account id */
  private readonly walletOwners = new Map<string, string>();
  /** `${chain}:${address}` -> accounts following that wallet */
  private readonly followers = new Map<string, Set<string>>();
  /** referrer id -> invitee ids */
  private readonly invitees = new Map<string, Set<string>>();
  /** `${account}|${wallet}|${token}` -> sim time of the last follow notification */
  private readonly followNotifiedAt = new Map<string, number>();
  /** Live mode: session digest -> wall time it was last used (sliding expiry). */
  private readonly sessionSeen = new Map<string, number>();
  /** Lowercase usernames being registered (live: while the embedded wallet is provisioned). */
  private readonly reservedNames = new Set<string>();
  /** `${account}|${chain}` -> detached empty wallet for a chain the account has no wallet on. */
  private readonly placeholders = new Map<string, WalletState>();
  private persistence: AccountsPersistence | null = null;
  private readonly factor: SecondFactor;
  /** Wall clock for sessions, second-factor codes and the whitelist (tests replace it). */
  clock: () => number = () => Date.now();

  constructor(private readonly ctx: AppContext) {
    const key = parseSecretsKey(ctx.config.live?.security?.secretsKey);
    this.factor = new SecondFactor(key ? new SecretBox(key) : null, () => this.clock());
  }

  private get live(): boolean {
    return this.ctx.config.mode === 'live';
  }

  private get securityConfig(): LiveSecurityConfig {
    return (
      this.ctx.config.live?.security ?? {
        secretsKey: null,
        whitelistDelayMs: DEFAULT_WHITELIST_DELAY_HOURS * 3_600_000,
        sessionTtlMs: DEFAULT_SESSION_TTL_DAYS * 86_400_000,
      }
    );
  }

  /** Durable write-through (live mode); null = snapshots only. */
  setPersistence(p: AccountsPersistence | null): void {
    this.persistence = p;
  }

  /** State changed: save soon, or now (`urgent`) for changes that must survive a crash. */
  private changed(urgent = false): void {
    if (!this.persistence) return;
    if (urgent) this.persistence.now();
    else this.persistence.soon();
  }

  install(): void {
    const { hub, world, engine } = this.ctx;
    hub.register('user', {
      requiresAuth: true,
      onSubscribe: (sub) => {
        // publishUser reaches the exact name only: a `user:<x>` subscription would never hear again
        if (sub.ch !== 'user') throw new Error('invalid channel (user)');
        const accountId = sub.client.accountId;
        if (!accountId || !this.records.has(accountId)) throw new Error('account not found');
        for (const chain of enabledChains(this.ctx.config)) hub.send(sub, 'balance', this.userWallet(accountId, chain));
      },
    });
    world.on('trade', (trade) => this.onTrade(trade));
    engine.addTicker('accounts-housekeeping', () => this.housekeeping(), { everyMs: HOUSEKEEPING_EVERY_MS });
  }

  // ---------------------------------------------------------------------------
  // Auth & sessions
  // ---------------------------------------------------------------------------

  /** Instant paper account. Unknown referral codes are ignored so a stale invite link never blocks onboarding. */
  createGuest(referralCode?: string): AuthResponse {
    if (this.live) throw new HttpError(403, 'guest accounts are not available with real funds: create an account', 'guest_disabled');
    const referrer = referralCode ? this.findByReferralCode(referralCode) : null;
    return this.startSession(this.createRecord(this.uniqueGuestName(), null, referrer));
  }

  /**
   * Register a new account. When the caller is signed in as a guest, the guest
   * account is upgraded in place so its wallets, positions and settings carry over.
   * Live mode: see registerLive.
   */
  async register(input: { username: string; password: string; referralCode?: string }, callerId: string | null, client = ''): Promise<AuthResponse> {
    if (this.live) return this.registerLive(input, client);
    this.assertUsernameAvailable(input.username);
    const referrer = input.referralCode ? this.findByReferralCode(input.referralCode) : null;
    if (input.referralCode && !referrer) throw new HttpError(400, 'unknown referral code', 'invalid_referral_code');
    const password = await hashPassword(input.password).catch((err) => {
      throw hashBusy(err);
    });
    // Re-check: a concurrent request may have taken the name while we were hashing.
    this.assertUsernameAvailable(input.username);

    const guest = callerId ? this.records.get(callerId) : undefined;
    if (!guest?.isGuest) return this.startSession(this.createRecord(input.username, password, referrer));

    this.byUsername.delete(guest.username.toLowerCase());
    guest.username = input.username;
    guest.password = password;
    guest.isGuest = false;
    this.byUsername.set(guest.username.toLowerCase(), guest.id);
    // A code binds only before the account's first trade (its earlier volume would never reach the referrer).
    if (referrer && !guest.referredBy && referrer.id !== guest.id && guest.rewards.volumeUsd === 0) this.linkReferral(guest, referrer);
    return this.startSession(guest);
  }

  /**
   * Live registration: the embedded wallet is provisioned with the signer before the account
   * exists anywhere (no signer, or the provider fails: 503 'wallets_unavailable' and nothing is
   * created), and the account is on disk before the response, since funds may be sent to its
   * address right after.
   */
  private async registerLive(input: { username: string; password: string; referralCode?: string }, client: string): Promise<AuthResponse> {
    const signer = this.ctx.live?.signer;
    if (!signer) throw new HttpError(503, 'wallets are unavailable right now, try again later', 'wallets_unavailable');
    if (input.password.length < LIVE_MIN_PASSWORD_LENGTH) throw new HttpError(400, `password must be at least ${LIVE_MIN_PASSWORD_LENGTH} characters`, 'invalid_input');
    this.assertUsernameAvailable(input.username);
    const referrer = input.referralCode ? this.findByReferralCode(input.referralCode) : null;
    if (input.referralCode && !referrer) throw new HttpError(400, 'unknown referral code', 'invalid_referral_code');
    const password = await hashPassword(input.password).catch((err) => {
      throw hashBusy(err);
    });
    this.assertUsernameAvailable(input.username);
    const name = input.username.toLowerCase();
    this.reservedNames.add(name);
    try {
      const id = this.uniqueAccountId();
      let ref: EmbeddedWalletRef;
      try {
        ref = await signer.createWallet(id, 'sol');
      } catch (err) {
        console.error(`[accounts] wallet provisioning failed (${signer.provider}): ${errText(err)}`);
        throw new HttpError(503, 'could not create your wallet right now, try again later', 'wallets_unavailable');
      }
      if (ref.chain !== 'sol' || !isSolanaAddress(ref.address) || this.walletOwners.has(ref.address) || this.records.has(id)) {
        console.error(`[accounts] signer ${signer.provider} returned an unusable wallet for ${id}`);
        throw new HttpError(503, 'could not create your wallet right now, try again later', 'wallets_unavailable');
      }
      const record = this.createRecord(input.username, password, referrer && this.records.has(referrer.id) ? referrer : null, { id, embedded: { sol: { ...ref } } });
      const auth = this.startSession(record);
      try {
        this.changed(true);
      } catch (err) {
        console.error(`[accounts] could not save the new account ${id}: ${errText(err)}`);
        this.forgetLiveRecord(record);
        throw new HttpError(503, 'could not create your account right now, try again later', 'unavailable');
      }
      this.audit(id, 'register', { ip: client || null, username: record.username });
      this.audit(id, 'wallet_created', { chain: 'sol', provider: ref.provider, address: ref.address });
      return auth;
    } finally {
      this.reservedNames.delete(name);
    }
  }

  /** Undo a live registration that could not be saved (the account and its World wallet). */
  private forgetLiveRecord(record: AccountRecord): void {
    this.deleteRecord(record);
    const addresses = new Set(Object.values(record.wallets).filter((a): a is string => !!a));
    this.ctx.world.removeWallets(addresses);
    this.ctx.hub.revalidateAuth();
  }

  /**
   * Sign in. Attempts are counted per (username, client address), whether or not the username
   * exists: a guesser only locks out its own address (never the owner signing in from elsewhere),
   * and 429 vs 401 does not reveal which usernames exist.
   * Live mode: with 2FA on, `code` (a TOTP or recovery code) is required once the password is
   * right (401 'totp_required'); sign-ins and failures are audited.
   */
  async login(username: string, password: string, client = '', code?: string): Promise<AuthResponse> {
    const name = username.toLowerCase();
    const attemptKey = `${name}|${client}`;
    // Counted before the (async) hash so concurrent guesses cannot all slip past the limit.
    this.countLoginAttempt(attemptKey);
    const id = this.byUsername.get(name);
    const record = id ? this.records.get(id) : undefined;
    // Always run the hash so unknown usernames are not distinguishable by timing.
    const valid = await verifyPassword(password, record?.password ?? null).catch((err) => {
      throw hashBusy(err);
    });
    const ip = client || null;
    if (!valid || !record) {
      if (this.live) this.audit(record?.id ?? null, 'login_failed', { ip, username: username.slice(0, 64), reason: 'password' });
      throw new HttpError(401, 'invalid username or password', 'invalid_credentials');
    }
    let method = 'password';
    if (this.live && record.security?.totp) {
      if (!code?.trim()) throw new HttpError(401, 'enter the code from your authenticator app', 'totp_required');
      const check = this.checkCode(record, code, 'login', ip, true);
      if (!check.ok) {
        this.audit(record.id, 'login_failed', { ip, reason: 'two_factor' });
        throw new HttpError(401, 'invalid two-factor code', 'totp_required');
      }
      method = check.kind;
    }
    this.loginAttempts.delete(attemptKey);
    const auth = this.startSession(record);
    if (this.live) this.audit(record.id, 'login', { ip, method });
    return auth;
  }

  logout(token: string): void {
    const digest = digestToken(token);
    if (!this.sessions.has(digest)) return;
    this.dropSession(digest);
    this.ctx.hub.revalidateAuth();
    this.changed();
  }

  resolveToken(token: string): string | null {
    const digest = digestToken(token);
    const id = this.sessions.get(digest);
    if (!id) return null;
    if (this.live) {
      // Sliding expiry: a session unused for the TTL is gone (the next save drops it from disk).
      const now = this.clock();
      if (now - (this.sessionSeen.get(digest) ?? now) > this.securityConfig.sessionTtlMs) {
        this.dropSession(digest);
        this.changed();
        return null;
      }
      this.sessionSeen.set(digest, now);
    }
    const record = this.records.get(id);
    if (record) record.lastActiveAt = this.ctx.world.now;
    return id;
  }

  private startSession(record: AccountRecord): AuthResponse {
    record.lastActiveAt = this.ctx.world.now;
    const token = newSessionToken();
    this.addSession(digestToken(token), record.id);
    this.changed();
    return { token, account: this.toAccount(record) };
  }

  private addSession(digest: string, accountId: string, lastSeenAt?: number): void {
    this.sessions.set(digest, accountId);
    if (this.live) this.sessionSeen.set(digest, lastSeenAt ?? this.clock());
    let list = this.sessionsByAccount.get(accountId);
    if (!list) this.sessionsByAccount.set(accountId, (list = []));
    list.push(digest);
    if (list.length > MAX_SESSIONS_PER_ACCOUNT) {
      const oldest = list.shift()!;
      this.sessions.delete(oldest);
      this.sessionSeen.delete(oldest);
      this.ctx.hub.revalidateAuth();
    }
  }

  /** Remove one session from every index (callers revalidate sockets and persist). */
  private dropSession(digest: string): void {
    const accountId = this.sessions.get(digest);
    this.sessions.delete(digest);
    this.sessionSeen.delete(digest);
    if (!accountId) return;
    const list = this.sessionsByAccount.get(accountId);
    const index = list?.indexOf(digest) ?? -1;
    if (list && index >= 0) list.splice(index, 1);
  }

  /** Sign the account out everywhere (password change, 2FA disabled). */
  private revokeSessions(accountId: string): void {
    for (const digest of this.sessionsByAccount.get(accountId) ?? []) {
      this.sessions.delete(digest);
      this.sessionSeen.delete(digest);
    }
    this.sessionsByAccount.delete(accountId);
    this.ctx.hub.revalidateAuth();
  }

  /** Live housekeeping: drop sessions past their TTL. */
  private expireSessions(): void {
    if (!this.live) return;
    const now = this.clock();
    const ttl = this.securityConfig.sessionTtlMs;
    let dropped = 0;
    for (const [digest, seen] of this.sessionSeen) {
      if (now - seen <= ttl) continue;
      this.dropSession(digest);
      dropped++;
    }
    if (!dropped) return;
    this.ctx.hub.revalidateAuth();
    this.changed();
  }

  private countLoginAttempt(key: string): void {
    const now = this.ctx.world.now;
    let entry = this.loginAttempts.get(key);
    if (!entry || now - entry.since >= LOGIN_ATTEMPT_WINDOW_MS) this.loginAttempts.set(key, (entry = { count: 0, since: now }));
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      const seconds = Math.ceil((entry.since + LOGIN_ATTEMPT_WINDOW_MS - now) / 1000);
      throw new HttpError(429, `too many sign-in attempts, try again in ${seconds}s`, 'rate_limited', { 'retry-after': String(seconds) });
    }
    entry.count++;
  }

  private assertUsernameAvailable(username: string): void {
    if (username.toLowerCase().startsWith(GUEST_PREFIX)) {
      throw new HttpError(400, `usernames starting with "${GUEST_PREFIX}" are reserved`, 'invalid_input');
    }
    const lower = username.toLowerCase();
    if (this.byUsername.has(lower) || this.reservedNames.has(lower)) throw new HttpError(409, 'username is already taken', 'username_taken');
  }

  /**
   * A new account with its World wallets: demo, a paper wallet with the starter balance on every
   * chain; live (`live` set), one wallet per embedded wallet, at its address, with no balance.
   */
  private createRecord(
    username: string,
    password: PasswordHash | null,
    referrer: AccountRecord | null,
    live?: { id: string; embedded: Partial<Record<ChainId, EmbeddedWalletRef>> },
  ): AccountRecord {
    const { world } = this.ctx;
    const id = live?.id ?? this.uniqueAccountId();
    const wallets: Partial<Record<ChainId, string>> = {};
    if (live) {
      for (const ref of Object.values(live.embedded)) if (ref) wallets[ref.chain] = this.embeddedWorldWallet(id, ref.chain, ref.address).address;
    } else {
      for (const chain of CHAIN_IDS) {
        wallets[chain] = world.createWallet(chain, 'user', { native: CHAINS[chain].starterBalance, accountId: id, label: null }).address;
      }
    }
    const record: AccountRecord = {
      id,
      username,
      password,
      isGuest: password === null,
      createdAt: world.now,
      lastActiveAt: world.now,
      referralCode: this.uniqueReferralCode(),
      referredBy: null,
      settings: defaultSettings(),
      wallets,
      follows: new Map(),
      watchlist: [],
      watchlistGroups: [],
      blacklist: emptyBlacklist(),
      notifications: [],
      rewards: emptyRewards(),
      faucetClaims: {},
    };
    if (live) record.embedded = live.embedded;
    this.index(record);
    if (referrer) this.linkReferral(record, referrer);
    this.changed();
    return record;
  }

  /**
   * The account's World wallet at an embedded wallet's address (live), created with no balance
   * when missing (the chain sync fills it in). A wallet the World observed there before (an
   * 'external' one) is replaced: its balances are re-read from the chain anyway.
   */
  private embeddedWorldWallet(accountId: string, chain: ChainId, address: string): WalletState {
    const { world } = this.ctx;
    const existing = world.getWallet(address);
    if (existing?.accountId === accountId && existing.archetype === 'user') return existing;
    if (existing) {
      if (existing.accountId) throw new Error(`wallet ${address} already belongs to another account`);
      for (const pos of existing.positions.values()) if (pos.balance > 0) world.tokens.get(pos.token)?.holders.delete(address);
      world.removeWallets(new Set([address]));
    }
    return world.createWallet(chain, 'user', { address, native: 0, accountId, label: null });
  }

  /** Register a record in every lookup index. */
  private index(r: AccountRecord): void {
    this.records.set(r.id, r);
    this.byUsername.set(r.username.toLowerCase(), r.id);
    this.byReferralCode.set(r.referralCode, r.id);
    for (const address of Object.values(r.wallets)) if (address) this.walletOwners.set(address, r.id);
    for (const key of r.follows.keys()) addToSetMap(this.followers, key, r.id);
    if (r.referredBy) addToSetMap(this.invitees, r.referredBy, r.id);
  }

  private linkReferral(record: AccountRecord, referrer: AccountRecord): void {
    record.referredBy = referrer.id;
    addToSetMap(this.invitees, referrer.id, record.id);
  }

  private findByReferralCode(code: string): AccountRecord | null {
    const id = this.byReferralCode.get(code.trim().toUpperCase());
    return (id && this.records.get(id)) || null;
  }

  private uniqueAccountId(): string {
    for (;;) {
      const id = `acc_${randomBytes(8).toString('hex')}`;
      if (!this.records.has(id)) return id;
    }
  }

  private uniqueGuestName(): string {
    for (;;) {
      const name = `${GUEST_PREFIX}${randomString(6, GUEST_ALPHABET)}`;
      if (!this.byUsername.has(name)) return name;
    }
  }

  private uniqueReferralCode(): string {
    for (;;) {
      const code = randomString(REFERRAL_CODE_LENGTH, REFERRAL_ALPHABET);
      if (!this.byReferralCode.has(code)) return code;
    }
  }

  private record(accountId: string): AccountRecord {
    const record = this.records.get(accountId);
    if (!record) throw notFound('account');
    return record;
  }

  // ---------------------------------------------------------------------------
  // Account & paper wallets
  // ---------------------------------------------------------------------------

  getAccount(accountId: string): Account | null {
    const record = this.records.get(accountId);
    return record ? this.toAccount(record) : null;
  }

  walletFor(accountId: string, chain: ChainId): WalletState {
    const address = this.record(accountId).wallets[chain];
    if (!address) return this.placeholder(accountId, chain);
    const wallet = this.ctx.world.getWallet(address);
    if (!wallet) throw new Error(`paper wallet ${address} is missing from the world`);
    return wallet;
  }

  accountIdForWallet(address: string): string | null {
    return this.walletOwners.get(address) ?? null;
  }

  pushBalance(accountId: string, chain: ChainId): void {
    if (!this.records.has(accountId)) return;
    this.ctx.hub.publishUser(accountId, 'balance', this.userWallet(accountId, chain));
  }

  /** A detached empty wallet for a chain the account has no wallet on (live: chains not enabled). */
  private placeholder(accountId: string, chain: ChainId): WalletState {
    const key = `${accountId}|${chain}`;
    let wallet = this.placeholders.get(key);
    if (!wallet) this.placeholders.set(key, (wallet = detachedWallet(chain, accountId)));
    return wallet;
  }

  // ---- live-mode security hooks (demo accounts have no embedded wallets, 2FA or withdrawals) ----

  walletRef(accountId: string, chain: ChainId): EmbeddedWalletRef | null {
    const ref = this.records.get(accountId)?.embedded?.[chain];
    return ref ? { ...ref } : null;
  }

  hasSecondFactor(accountId: string): boolean {
    return this.live && !!this.records.get(accountId)?.security?.totp;
  }

  /** TOTP codes only (recovery codes never authorize withdrawals); throws 429 while the account is locked. */
  verifySecondFactor(accountId: string, code: string): boolean {
    const record = this.records.get(accountId);
    if (!this.live || !record?.security?.totp) return false;
    return this.checkCode(record, code, 'verify', null, false).ok;
  }

  canWithdrawTo(accountId: string, chain: ChainId, address: string): boolean {
    return this.live && this.factor.canWithdrawTo(this.records.get(accountId)?.security, chain, address);
  }

  /**
   * Durable audit entry (live: the store's append-only table; a string `ip` in `detail` becomes
   * the record's ip). Never throws: a failed write is logged and the action goes on.
   */
  audit(accountId: string | null, action: string, detail: Record<string, unknown>): void {
    const store = this.ctx.store;
    if (!store) {
      console.log(`[audit] ${action}`, JSON.stringify({ accountId, ...detail }));
      return;
    }
    const { ip, ...rest } = detail;
    const rec: AuditRecord = { at: this.clock(), accountId, action, ip: typeof ip === 'string' && ip ? ip : null, detail: rest };
    try {
      store.appendAudit(rec);
    } catch (err) {
      console.error(`[audit] could not record ${action} for ${accountId ?? '-'}: ${errText(err)}`);
    }
  }

  /** Paper "deposit": top the wallet back up to the chain's starter balance, at most once per cooldown. */
  claimFaucet(accountId: string, chain: ChainId): FaucetResult {
    if (this.live) throw new HttpError(403, 'the faucet is not available with real funds: deposit SOL to your wallet', 'not_available_in_live');
    const record = this.record(accountId);
    const wallet = this.walletFor(accountId, chain);
    const topUp = CHAINS[chain].starterBalance - wallet.native;
    if (topUp > 0) {
      const now = this.ctx.world.now;
      const elapsed = now - (record.faucetClaims[chain] ?? -Infinity);
      if (elapsed < FAUCET_COOLDOWN_MS) return { ok: false, retryAfterSeconds: Math.ceil((FAUCET_COOLDOWN_MS - elapsed) / 1000) };
      this.ctx.world.transferNative(null, wallet, topUp);
      record.faucetClaims[chain] = now;
      this.pushBalance(accountId, chain);
      this.changed();
    }
    return { ok: true, wallet: this.userWallet(accountId, chain) };
  }

  private userWallet(accountId: string, chain: ChainId): UserWallet {
    const wallet = this.walletFor(accountId, chain);
    return { chain, address: wallet.address, nativeBalance: wallet.native, nativeBalanceUsd: wallet.native * this.ctx.world.nativeUsd(chain) };
  }

  /** Demo: a wallet on every chain. Live: the enabled chains only, plus whether 2FA is on. */
  private toAccount(r: AccountRecord): Account {
    const wallets = {} as Record<ChainId, UserWallet>;
    for (const chain of enabledChains(this.ctx.config)) wallets[chain] = this.userWallet(r.id, chain);
    const account: Account = { id: r.id, username: r.username, isGuest: r.isGuest, createdAt: r.createdAt, referralCode: r.referralCode, referredBy: r.referredBy, wallets };
    if (this.live) account.twoFactorEnabled = !!r.security?.totp;
    return account;
  }

  // ---------------------------------------------------------------------------
  // Security (live mode): password change, TOTP 2FA, withdrawal whitelist
  // ---------------------------------------------------------------------------

  /**
   * Change the password: the current one (and a TOTP code when 2FA is on) is required, every
   * session is signed out and a new one is returned for the caller.
   */
  async changePassword(accountId: string, input: { currentPassword: string; newPassword: string; code?: string }, client = ''): Promise<AuthResponse> {
    const record = this.record(accountId);
    if (!record.password) throw new HttpError(400, 'register the account to set a password', 'invalid_input');
    if (this.live && input.newPassword.length < LIVE_MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `newPassword: must be at least ${LIVE_MIN_PASSWORD_LENGTH} characters`, 'invalid_input');
    }
    const ip = client || null;
    this.countLoginAttempt(`${record.username.toLowerCase()}|${client}`);
    const valid = await verifyPassword(input.currentPassword, record.password).catch((err) => {
      throw hashBusy(err);
    });
    if (!valid) {
      if (this.live) this.audit(accountId, 'password_change_failed', { ip, reason: 'password' });
      throw new HttpError(401, 'current password is incorrect', 'invalid_credentials');
    }
    if (this.live && record.security?.totp) {
      if (!input.code?.trim()) throw new HttpError(401, 'enter the code from your authenticator app', 'totp_required');
      if (!this.checkCode(record, input.code, 'password_change', ip, false).ok) throw new HttpError(401, 'invalid two-factor code', 'totp_required');
    }
    const password = await hashPassword(input.newPassword).catch((err) => {
      throw hashBusy(err);
    });
    if (this.records.get(accountId) !== record) throw notFound('account');
    record.password = password;
    this.revokeSessions(accountId);
    const auth = this.startSession(record);
    this.changed(true);
    if (this.live) {
      this.audit(accountId, 'password_changed', { ip });
      this.securityNotice(accountId, 'Password changed', 'Your password was changed and every other session was signed out.');
    }
    return auth;
  }

  securityStatus(accountId: string): SecurityStatus {
    const record = this.record(accountId);
    const events = this.ctx.store?.auditFor(accountId, RECENT_SECURITY_EVENTS, SECURITY_EVENT_ACTIONS) ?? [];
    return {
      twoFactorEnabled: !!record.security?.totp,
      whitelist: (record.security?.whitelist ?? []).map((e) => ({ ...e })).sort((a, b) => b.addedAt - a.addedAt),
      whitelistDelayMs: this.securityConfig.whitelistDelayMs,
      recentEvents: events.map((e) => ({ at: e.at, action: e.action, ip: e.ip, detail: describeSecurityEvent(e) })),
    };
  }

  /**
   * Start 2FA enrolment (503 'two_factor_unavailable' without SECRETS_KEY). Nothing is enabled
   * yet, so this is neither audited nor written at once (it can be called any number of times).
   */
  beginTotpSetup(accountId: string): TotpSetup {
    const record = this.record(accountId);
    const setup = this.factor.beginSetup((record.security ??= emptySecurity()), accountId, record.username);
    this.changed();
    return setup;
  }

  /** Confirm enrolment with a first code: 2FA is on and the recovery codes are returned (shown once). */
  enableTotp(accountId: string, code: string, client = ''): TotpEnableResponse {
    const record = this.record(accountId);
    const state = (record.security ??= emptySecurity());
    const ip = client || null;
    const result = this.factor.enable(state, accountId, code);
    if (!result.ok) {
      this.codeFailed(record, 'enable', ip, result.locked);
      this.changed(true);
      throw new HttpError(401, 'invalid two-factor code', 'totp_required');
    }
    this.changed(true);
    this.audit(accountId, '2fa_enabled', { ip });
    this.securityNotice(accountId, 'Two-factor authentication enabled', 'Sign-ins, withdrawals and whitelist changes now need a code from your authenticator app.');
    return { enabled: true, recoveryCodes: result.recoveryCodes };
  }

  /** Turn 2FA off with a TOTP or recovery code; signs out every session (this one included). */
  disableTotp(accountId: string, code: string, client = ''): { enabled: false } {
    const record = this.record(accountId);
    if (!record.security?.totp) throw new HttpError(400, 'two-factor authentication is not enabled', 'invalid_input');
    const ip = client || null;
    if (!this.checkCode(record, code, 'disable', ip, true).ok) throw new HttpError(401, 'invalid two-factor code', 'totp_required');
    this.factor.disable(record.security);
    this.revokeSessions(accountId);
    this.changed(true);
    this.audit(accountId, '2fa_disabled', { ip });
    this.securityNotice(accountId, 'Two-factor authentication disabled', 'Two-factor authentication was turned off and every session was signed out. Withdrawals need it back on.');
    return { enabled: false };
  }

  /** Add (or relabel) a withdrawal address: 2FA and a TOTP code required; usable after the whitelist delay. */
  addWhitelist(accountId: string, input: { chain: ChainId; address: string; label: string; code: string }, client = ''): WhitelistEntry {
    const record = this.record(accountId);
    this.requireTotp(record, input.code, 'whitelist_add', client || null);
    const { entry, added } = this.factor.addWhitelist(record.security!, input, this.securityConfig.whitelistDelayMs);
    this.changed(true);
    this.audit(accountId, added ? 'whitelist_add' : 'whitelist_label', { ip: client || null, chain: entry.chain, address: entry.address, label: entry.label, activeAt: entry.activeAt });
    if (added) {
      const hours = Math.round((entry.activeAt - entry.addedAt) / 360_000) / 10;
      this.securityNotice(
        accountId,
        'Withdrawal address added',
        `${entry.label ? `${entry.label} (${shortAddress(entry.address)})` : shortAddress(entry.address)} can receive withdrawals ${hours > 0 ? `in ${hours}h` : 'now'}. Not you? Remove it and change your password.`,
      );
    }
    return entry;
  }

  removeWhitelist(accountId: string, input: { chain: ChainId; address: string; code: string }, client = ''): void {
    const record = this.record(accountId);
    if (!record.security?.whitelist.some((e) => e.chain === input.chain && e.address === input.address)) throw notFound('whitelisted address');
    this.requireTotp(record, input.code, 'whitelist_remove', client || null);
    const removed = this.factor.removeWhitelist(record.security!, input.chain, input.address);
    if (!removed) throw notFound('whitelisted address');
    this.changed(true);
    this.audit(accountId, 'whitelist_remove', { ip: client || null, chain: removed.chain, address: removed.address, label: removed.label });
    this.securityNotice(accountId, 'Withdrawal address removed', `${removed.label || shortAddress(removed.address)} can no longer receive withdrawals.`);
  }

  /** 2FA must be on (403 'two_factor_required') and `code` a valid TOTP code (401 'totp_required'). */
  private requireTotp(record: AccountRecord, code: string, purpose: string, ip: string | null): void {
    if (!record.security?.totp) throw new HttpError(403, 'enable two-factor authentication first', 'two_factor_required');
    if (!this.checkCode(record, code, purpose, ip, false).ok) throw new HttpError(401, 'invalid two-factor code', 'totp_required');
  }

  /** Check a second-factor code (throttled, replay-protected), auditing failures, locks and recovery-code use. */
  private checkCode(record: AccountRecord, code: string, purpose: string, ip: string | null, allowRecovery: boolean): CodeCheck {
    const state = (record.security ??= emptySecurity());
    const result = this.factor.check(state, record.id, code, { allowRecovery });
    if (!result.ok) this.codeFailed(record, purpose, ip, result.locked);
    else if (result.kind === 'recovery') {
      this.audit(record.id, 'recovery_code_used', { ip, purpose, remaining: state.recoveryCodes.length });
      this.securityNotice(record.id, 'Recovery code used', `A recovery code was used (${state.recoveryCodes.length} left).`);
    }
    this.changed(true);
    return result;
  }

  private codeFailed(record: AccountRecord, purpose: string, ip: string | null, locked: boolean): void {
    this.audit(record.id, '2fa_failed', { ip, purpose });
    if (!locked) return;
    this.audit(record.id, '2fa_locked', { ip, until: record.security?.lockedUntil ?? null });
    this.securityNotice(record.id, 'Two-factor codes locked', 'Too many invalid codes: sign-ins with 2FA, withdrawals and whitelist changes are paused for 15 minutes.');
  }

  private securityNotice(accountId: string, title: string, body: string): void {
    this.notify(accountId, { kind: 'system', title, body, chain: null, token: null, wallet: null, level: 'info' });
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSettings(accountId: string): UserSettings {
    return this.record(accountId).settings;
  }

  updateSettings(accountId: string, patch: SettingsPatch): UserSettings {
    const record = this.record(accountId);
    record.settings = applySettingsPatch(record.settings, patch);
    this.changed();
    return record.settings;
  }

  // ---------------------------------------------------------------------------
  // Follows
  // ---------------------------------------------------------------------------

  isFollowing(accountId: string, chain: ChainId, address: string): boolean {
    return this.records.get(accountId)?.follows.has(walletKey(chain, address)) ?? false;
  }

  remarkFor(accountId: string, chain: ChainId, address: string): string | null {
    return this.records.get(accountId)?.follows.get(walletKey(chain, address))?.remark || null;
  }

  /** Newest first. */
  followedWallets(accountId: string, chain?: ChainId): FollowedWallet[] {
    const follows = this.records.get(accountId)?.follows.values() ?? [];
    return [...follows]
      .filter((f) => !chain || f.chain === chain)
      .reverse()
      .map((f) => this.viewFollow(f));
  }

  /** A follow with the wallet's current public label and platform tags. */
  private viewFollow(f: StoredFollow): FollowedWallet {
    const wallet = this.ctx.world.getWallet(f.address);
    return { ...f, label: wallet?.label ?? null, tags: wallet ? this.ctx.analytics.walletTags(wallet) : [] };
  }

  watchedWallets(chain: ChainId): Set<string> {
    const prefix = `${chain}:`;
    const out = new Set<string>();
    for (const key of this.followers.keys()) if (key.startsWith(prefix)) out.add(key.slice(prefix.length));
    return out;
  }

  followersOf(chain: ChainId, address: string): string[] {
    return [...(this.followers.get(walletKey(chain, address)) ?? [])];
  }

  followerCount(chain: ChainId, address: string): number {
    const base = this.ctx.world.getWallet(address)?.followerCount ?? 0;
    return base + (this.followers.get(walletKey(chain, address))?.size ?? 0);
  }

  /** Follow a wallet; following an already-followed wallet updates the given fields. */
  follow(accountId: string, chain: ChainId, address: string, input: FollowInput): FollowedWallet {
    const record = this.record(accountId);
    const key = walletKey(chain, address);
    if (record.follows.has(key)) return this.updateFollow(accountId, chain, address, input);
    // Live mode: a valid address not seen yet becomes an observed wallet (its trades are then streamed).
    const wallet = this.ctx.world.getWallet(address) ?? (this.ctx.config.mode === 'live' ? this.ctx.market.ensureWallet?.(chain, address) : undefined);
    if (!wallet || wallet.chain !== chain) throw notFound('wallet');
    if (wallet.accountId === accountId) throw new HttpError(400, 'you cannot follow your own wallet', 'invalid_input');
    if (record.follows.size >= MAX_FOLLOWS) throw new HttpError(400, `you can follow at most ${MAX_FOLLOWS} wallets`, 'limit_reached');
    const follow: StoredFollow = {
      chain,
      address,
      remark: input.remark ?? '',
      group: input.group ?? DEFAULT_FOLLOW_GROUP,
      createdAt: this.ctx.world.now,
      notify: input.notify ?? true,
    };
    record.follows.set(key, follow);
    addToSetMap(this.followers, key, accountId);
    this.changed();
    return this.viewFollow(follow);
  }

  updateFollow(accountId: string, chain: ChainId, address: string, patch: FollowInput): FollowedWallet {
    const follow = this.record(accountId).follows.get(walletKey(chain, address));
    if (!follow) throw notFound('followed wallet');
    if (patch.remark !== undefined) follow.remark = patch.remark;
    if (patch.group !== undefined) follow.group = patch.group;
    if (patch.notify !== undefined) follow.notify = patch.notify;
    this.changed();
    return this.viewFollow(follow);
  }

  unfollow(accountId: string, chain: ChainId, address: string): void {
    const key = walletKey(chain, address);
    if (!this.record(accountId).follows.delete(key)) throw notFound('followed wallet');
    removeFromSetMap(this.followers, key, accountId);
    this.changed();
  }

  private onTrade(trade: Trade): void {
    if (this.ctx.engine.warming) return;
    const key = walletKey(trade.chain, trade.wallet);
    const followers = this.followers.get(key);
    if (!followers) return;
    for (const accountId of followers) {
      const follow = this.records.get(accountId)?.follows.get(key);
      if (follow?.notify) this.notifyFollowTrade(accountId, follow, trade);
    }
  }

  /** At most one notification per (account, wallet, token) per throttle window. */
  private notifyFollowTrade(accountId: string, follow: StoredFollow, trade: Trade): void {
    const now = this.ctx.world.now;
    const throttleKey = `${accountId}|${trade.wallet}|${trade.token}`;
    const last = this.followNotifiedAt.get(throttleKey);
    if (last !== undefined && now - last < FOLLOW_NOTIFY_THROTTLE_MS) return;
    this.followNotifiedAt.set(throttleKey, now);

    const who = follow.remark || trade.walletLabel || shortAddress(trade.wallet);
    const verb = trade.side === 'buy' ? 'bought' : 'sold';
    const amount = formatNative(trade.nativeAmount, CHAINS[trade.chain].nativeSymbol);
    this.notify(accountId, {
      kind: 'follow_trade',
      title: `${who} ${verb} $${trade.tokenSymbol}`,
      body: `${who} ${verb} ${amount} of $${trade.tokenSymbol} at ${formatUsd(trade.marketCapUsd)} MC`,
      chain: trade.chain,
      token: trade.token,
      wallet: trade.wallet,
    });
  }

  private housekeeping(): void {
    this.pruneThrottles();
    this.purgeIdleGuests();
    this.expireSessions();
  }

  /**
   * Delete guest accounts idle for GUEST_RETENTION_MS (PRD §14 Q9) with their paper wallets, unless
   * something still runs for or refers to them: automation (orders, tasks, alerts), invitees, a token
   * they launched, a follower of one of their wallets.
   */
  private purgeIdleGuests(): void {
    const { world, trading } = this.ctx;
    const now = world.now;
    const wallets = new Set<string>();
    for (const r of this.records.values()) {
      if (!r.isGuest || now - r.lastActiveAt < GUEST_RETENTION_MS) continue;
      if (this.invitees.has(r.id) || trading.hasAutomation(r.id)) continue;
      const own = CHAIN_IDS.map((chain) => {
        const address = r.wallets[chain];
        return address ? world.getWallet(address) : undefined;
      });
      if (own.some((w) => w && (w.createdTokens.some((a) => world.tokens.has(a)) || this.followers.has(walletKey(w.chain, w.address))))) continue;
      this.deleteRecord(r);
      for (const w of own) {
        if (!w) continue;
        // a removed wallet must not stay listed as a holder
        for (const pos of w.positions.values()) if (pos.balance > 0) world.tokens.get(pos.token)?.holders.delete(w.address);
        wallets.add(w.address);
      }
    }
    if (wallets.size === 0) return;
    world.removeWallets(wallets);
    this.ctx.hub.revalidateAuth();
    this.changed();
  }

  private deleteRecord(r: AccountRecord): void {
    for (const digest of this.sessionsByAccount.get(r.id) ?? []) {
      this.sessions.delete(digest);
      this.sessionSeen.delete(digest);
    }
    this.sessionsByAccount.delete(r.id);
    this.records.delete(r.id);
    this.byUsername.delete(r.username.toLowerCase());
    this.byReferralCode.delete(r.referralCode);
    for (const address of Object.values(r.wallets)) if (address) this.walletOwners.delete(address);
    for (const chain of CHAIN_IDS) this.placeholders.delete(`${r.id}|${chain}`);
    for (const key of r.follows.keys()) removeFromSetMap(this.followers, key, r.id);
    if (r.referredBy) removeFromSetMap(this.invitees, r.referredBy, r.id);
    this.ctx.trading.forgetAccount(r.id);
  }

  private pruneThrottles(): void {
    const now = this.ctx.world.now;
    for (const [key, at] of this.followNotifiedAt) if (now - at >= FOLLOW_NOTIFY_THROTTLE_MS) this.followNotifiedAt.delete(key);
    for (const [key, entry] of this.loginAttempts) if (now - entry.since >= LOGIN_ATTEMPT_WINDOW_MS) this.loginAttempts.delete(key);
  }

  // ---------------------------------------------------------------------------
  // Watchlist
  // ---------------------------------------------------------------------------

  watchlist(accountId: string): WatchlistItem[] {
    return this.records.get(accountId)?.watchlist.map(copyItem) ?? [];
  }

  /** Watchlist items, summaries of the tokens that still exist, and the groups. */
  watchlistView(accountId: string): WatchlistResponse {
    const items = this.watchlist(accountId);
    const tokens: TokenSummary[] = [];
    for (const item of items) {
      const token = this.ctx.world.getToken(item.address);
      if (!token) continue;
      try {
        tokens.push(this.ctx.analytics.tokenSummary(token));
      } catch {
        // Summaries are best effort; the items alone still render a usable list.
      }
    }
    return { items, tokens, groups: this.watchlistGroups(accountId) };
  }

  /** Add a token; adding one already listed applies `patch` to it instead. */
  addToWatchlist(accountId: string, chain: ChainId, address: string, patch: WatchlistItemPatch = {}): WatchlistItem {
    const record = this.record(accountId);
    const existing = record.watchlist.find((i) => i.chain === chain && i.address === address);
    if (existing) return this.patchItem(record, existing, patch);
    const token = this.ctx.world.getToken(address);
    if (!token || token.chain !== chain) throw notFound('token');
    if (record.watchlist.length >= MAX_WATCHLIST) throw new HttpError(400, `watchlist is full (max ${MAX_WATCHLIST})`, 'limit_reached');
    const item: WatchlistItem = { chain, address, addedAt: this.ctx.world.now };
    this.patchItem(record, item, patch);
    record.watchlist.unshift(item);
    return copyItem(item);
  }

  updateWatchlistItem(accountId: string, chain: ChainId, address: string, patch: WatchlistItemPatch): WatchlistItem {
    const record = this.record(accountId);
    const item = record.watchlist.find((i) => i.chain === chain && i.address === address);
    if (!item) throw notFound('watchlist item');
    return this.patchItem(record, item, patch);
  }

  /** Empty group lists and blank notes are stored as absent fields. */
  private patchItem(record: AccountRecord, item: WatchlistItem, patch: WatchlistItemPatch): WatchlistItem {
    if (patch.groupIds !== undefined) {
      const ids = [...new Set(patch.groupIds)];
      const unknown = ids.find((id) => !record.watchlistGroups.some((g) => g.id === id));
      if (unknown) throw new HttpError(400, `groupIds: unknown group ${unknown}`, 'invalid_input');
      if (ids.length) item.groupIds = ids;
      else delete item.groupIds;
    }
    if (patch.note !== undefined) {
      if (patch.note) item.note = patch.note;
      else delete item.note;
    }
    this.changed();
    return copyItem(item);
  }

  removeFromWatchlist(accountId: string, chain: ChainId, address: string): void {
    const list = this.record(accountId).watchlist;
    const index = list.findIndex((i) => i.chain === chain && i.address === address);
    if (index < 0) throw notFound('watchlist item');
    list.splice(index, 1);
    this.changed();
  }

  watchlistGroups(accountId: string): WatchlistGroup[] {
    return this.record(accountId).watchlistGroups.map((g) => ({ ...g }));
  }

  createWatchlistGroup(accountId: string, input: { name: string; color?: string }): WatchlistGroup {
    const record = this.record(accountId);
    const groups = record.watchlistGroups;
    if (groups.length >= WATCHLIST_LIMITS.maxGroups) throw new HttpError(400, `at most ${WATCHLIST_LIMITS.maxGroups} watchlist groups`, 'limit_reached');
    this.assertGroupName(record, input.name, null);
    const group: WatchlistGroup = { id: this.ctx.world.nextId('wlg'), name: input.name, order: groups.length };
    if (input.color) group.color = input.color;
    groups.push(group);
    this.changed();
    return { ...group };
  }

  updateWatchlistGroup(accountId: string, id: string, patch: WatchlistGroupPatch): WatchlistGroup {
    const record = this.record(accountId);
    const groups = record.watchlistGroups;
    const index = groups.findIndex((g) => g.id === id);
    if (index < 0) throw notFound('watchlist group');
    const group = groups[index];
    if (patch.name !== undefined) {
      this.assertGroupName(record, patch.name, id);
      group.name = patch.name;
    }
    if (patch.color === null) delete group.color;
    else if (patch.color !== undefined) group.color = patch.color;
    if (patch.order !== undefined) {
      groups.splice(index, 1);
      groups.splice(Math.min(patch.order, groups.length), 0, group);
      groups.forEach((g, i) => (g.order = i));
    }
    this.changed();
    return { ...group };
  }

  /** Delete a group; its items stay in the watchlist (under "All"). */
  deleteWatchlistGroup(accountId: string, id: string): void {
    const record = this.record(accountId);
    const index = record.watchlistGroups.findIndex((g) => g.id === id);
    if (index < 0) throw notFound('watchlist group');
    record.watchlistGroups.splice(index, 1);
    record.watchlistGroups.forEach((g, i) => (g.order = i));
    for (const item of record.watchlist) if (item.groupIds?.includes(id)) this.patchItem(record, item, { groupIds: item.groupIds.filter((g) => g !== id) });
    this.changed();
  }

  private assertGroupName(record: AccountRecord, name: string, selfId: string | null): void {
    const lower = name.toLowerCase();
    if (lower === 'all') throw new HttpError(400, 'name: "All" is the built-in group', 'invalid_input');
    if (record.watchlistGroups.some((g) => g.id !== selfId && g.name.toLowerCase() === lower)) {
      throw new HttpError(409, 'a watchlist group with this name already exists', 'duplicate');
    }
  }

  // ---------------------------------------------------------------------------
  // Blacklist (hidden tokens / creators / keywords; lists apply it through TokenFilters)
  // ---------------------------------------------------------------------------

  blacklist(accountId: string): Blacklist {
    const b = this.record(accountId).blacklist;
    return { tokens: b.tokens.map((e) => ({ ...e })), creators: b.creators.map((e) => ({ ...e })), keywords: [...b.keywords] };
  }

  /**
   * Add a token / creator (`value` = address on `chain`, which must exist there) or a keyword
   * (already normalized). Re-adding an entry is a no-op. Returns the updated blacklist.
   */
  addToBlacklist(accountId: string, kind: BlacklistKind, value: string, chain?: ChainId): Blacklist {
    const record = this.record(accountId);
    const b = record.blacklist;
    if (kind === 'keyword') {
      if (!b.keywords.includes(value)) {
        if (b.keywords.length >= BLACKLIST_LIMITS.keywords) throw new HttpError(400, `at most ${BLACKLIST_LIMITS.keywords} blacklisted keywords`, 'limit_reached');
        b.keywords.unshift(value);
        this.changed();
      }
      return this.blacklist(accountId);
    }
    if (!chain) throw new HttpError(400, `chain: required for ${kind}s`, 'invalid_input');
    const list = kind === 'token' ? b.tokens : b.creators;
    if (list.some((e) => e.chain === chain && e.address === value)) return this.blacklist(accountId);
    const { world } = this.ctx;
    if (kind === 'token' ? world.getToken(value)?.chain !== chain : world.getWallet(value)?.chain !== chain) throw notFound(kind === 'token' ? 'token' : 'wallet');
    if (list.length >= BLACKLIST_LIMITS[`${kind}s`]) throw new HttpError(400, `at most ${BLACKLIST_LIMITS[`${kind}s`]} blacklisted ${kind}s`, 'limit_reached');
    const entry: BlacklistEntry = { chain, address: value, addedAt: world.now };
    list.unshift(entry);
    this.changed();
    return this.blacklist(accountId);
  }

  /** Remove an entry (tokens / creators on any chain unless `chain` is given). 404 when nothing matched. */
  removeFromBlacklist(accountId: string, kind: BlacklistKind, value: string, chain?: ChainId): Blacklist {
    const b = this.record(accountId).blacklist;
    let removed: boolean;
    if (kind === 'keyword') {
      removed = b.keywords.includes(value);
      b.keywords = b.keywords.filter((k) => k !== value);
    } else {
      const key = kind === 'token' ? 'tokens' : 'creators';
      const kept = b[key].filter((e) => e.address !== value || (chain !== undefined && e.chain !== chain));
      removed = kept.length !== b[key].length;
      b[key] = kept;
    }
    if (!removed) throw notFound('blacklist entry');
    this.changed();
    return this.blacklist(accountId);
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  notify(accountId: string, n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
    const record = this.record(accountId);
    const notification: AppNotification = { ...n, id: this.ctx.world.nextId('ntf'), createdAt: this.ctx.world.now, read: false };
    record.notifications.push(notification);
    if (record.notifications.length > MAX_NOTIFICATIONS) record.notifications.shift();
    this.ctx.hub.publishUser(accountId, 'notification', notification);
    this.changed();
    return notification;
  }

  /** Newest first. */
  listNotifications(accountId: string, limit: number): AppNotification[] {
    return this.record(accountId).notifications.slice(-limit).reverse();
  }

  /** Mark the given notifications (all when `ids` is omitted) as read. */
  markNotificationsRead(accountId: string, ids?: string[]): void {
    const wanted = ids ? new Set(ids) : null;
    for (const n of this.record(accountId).notifications) if (!wanted || wanted.has(n.id)) n.read = true;
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // Rewards & referrals
  // ---------------------------------------------------------------------------

  recordTradeVolume(accountId: string, volumeUsd: number, platformFeeUsd: number): void {
    const record = this.records.get(accountId);
    if (!record || !isAmount(volumeUsd) || !isAmount(platformFeeUsd)) return;
    const own = record.rewards;
    own.volumeUsd += volumeUsd;
    own.feesPaidUsd += platformFeeUsd;
    own.points += volumeUsd / USD_PER_POINT;
    record.lastActiveAt = this.ctx.world.now;
    this.changed();

    const referrer = record.referredBy ? this.records.get(record.referredBy) : undefined;
    if (!referrer) return;
    own.cashbackUsd += platformFeeUsd * REFERRED_CASHBACK_RATE;
    referrer.rewards.inviteeVolumeUsd += volumeUsd;
    const rebate = platformFeeUsd * REWARD_TIERS[tierIndexFor(tierVolume(referrer.rewards))].rebateRate;
    referrer.rewards.rebatesEarnedUsd += rebate;
    own.rebateGeneratedUsd += rebate;
  }

  rewards(accountId: string): RewardsSummary {
    const record = this.record(accountId);
    const r = record.rewards;
    const tierIndex = tierIndexFor(tierVolume(r));
    const tier = REWARD_TIERS[tierIndex];
    const next = REWARD_TIERS[tierIndex + 1];
    const invitees: RewardsSummary['invitees'] = [];
    for (const id of this.invitees.get(record.id) ?? []) {
      const invitee = this.records.get(id);
      if (!invitee) continue;
      invitees.push({ username: invitee.username, joinedAt: invitee.createdAt, volumeUsd: invitee.rewards.volumeUsd, rebateUsd: invitee.rewards.rebateGeneratedUsd });
    }
    invitees.sort((a, b) => b.volumeUsd - a.volumeUsd);
    return {
      referralCode: record.referralCode,
      referralLink: `/?ref=${record.referralCode}`,
      invitedCount: invitees.length,
      inviteeVolumeUsd: r.inviteeVolumeUsd,
      rebateRate: tier.rebateRate,
      rebatesEarnedUsd: r.rebatesEarnedUsd,
      ownVolumeUsd: r.volumeUsd,
      feesPaidUsd: r.feesPaidUsd,
      cashbackRate: record.referredBy ? REFERRED_CASHBACK_RATE : 0,
      cashbackUsd: r.cashbackUsd,
      points: Math.floor(r.points),
      tier: tier.name,
      nextTier: next ? { name: next.name, volumeUsd: next.minVolumeUsd } : null,
      invitees: invitees.slice(0, MAX_INVITEE_ROWS),
    };
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  serialize(): AccountsSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      accounts: [...this.records.values()].map((r) => ({ ...r, follows: [...r.follows.values()] })),
      // Live sessions carry their last use (sliding expiry survives restarts).
      sessions: [...this.sessions].map(([digest, accountId]): StoredSession => {
        const seen = this.sessionSeen.get(digest);
        return seen === undefined ? [digest, accountId] : [digest, accountId, seen];
      }),
    };
  }

  restore(data: unknown): void {
    if (!isSnapshot(data)) return;
    const snap = structuredClone(data);
    for (const map of [
      this.records,
      this.byUsername,
      this.byReferralCode,
      this.sessions,
      this.sessionsByAccount,
      this.loginAttempts,
      this.walletOwners,
      this.followers,
      this.invitees,
      this.followNotifiedAt,
      this.sessionSeen,
      this.placeholders,
    ]) {
      map.clear();
    }
    for (const stored of snap.accounts) {
      const record: AccountRecord = {
        ...stored,
        settings: normalizeSettings(stored.settings),
        // absent in snapshots saved before guest retention: count from the restore
        lastActiveAt: stored.lastActiveAt ?? this.ctx.world.now,
        rewards: { ...emptyRewards(), ...stored.rewards },
        // absent in snapshots saved before watchlist groups and the blacklist existed
        watchlistGroups: stored.watchlistGroups ?? [],
        blacklist: stored.blacklist ?? emptyBlacklist(),
        follows: new Map(stored.follows.map((f) => [walletKey(f.chain, f.address), f])),
      };
      const security = normalizeSecurity(stored.security);
      if (security) record.security = security;
      else delete record.security;
      this.index(record);
    }
    // Snapshot order is creation order, so the per-account cap keeps the newest sessions.
    for (const [digest, accountId, seen] of snap.sessions) if (this.records.has(accountId)) this.addSession(digest, accountId, seen);
    if (this.live) this.ensureWorldWallets();
  }

  /**
   * Live: the World (from a snapshot that may be older than the durable accounts state, or none)
   * must hold every account's wallet; a missing one is recreated empty and the chain sync refills it.
   */
  private ensureWorldWallets(): void {
    for (const r of this.records.values()) {
      for (const ref of Object.values(r.embedded ?? {})) {
        if (!ref) continue;
        try {
          r.wallets[ref.chain] = this.embeddedWorldWallet(r.id, ref.chain, ref.address).address;
          this.walletOwners.set(ref.address, r.id);
        } catch (err) {
          console.error(`[accounts] cannot restore the ${ref.chain} wallet of ${r.id}: ${errText(err)}`);
        }
      }
    }
  }
}
