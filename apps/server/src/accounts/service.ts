// Accounts service: paper-trading accounts with bearer sessions, one paper
// wallet per chain (living in the World), settings, followed wallets,
// watchlist, notifications and the rewards/referral program.

import { randomBytes } from 'node:crypto';
import {
  CHAINS,
  CHAIN_IDS,
  formatNative,
  formatUsd,
  shortAddress,
  type Account,
  type AppNotification,
  type AuthResponse,
  type ChainId,
  type FollowedWallet,
  type RewardsSummary,
  type TokenSummary,
  type Trade,
  type UserSettings,
  type UserWallet,
  type WatchlistItem,
} from '@trenchscope/shared';
import { HttpError, type AccountsApi, type AppContext } from '../context';
import type { WalletState } from '../sim/world';
import {
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
/** Sign-in attempts allowed per account per window before answering 429 (online password guessing). */
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60_000;
const HOUSEKEEPING_EVERY_MS = 60_000;
/** Usernames with this prefix are reserved for generated guest accounts. */
export const GUEST_PREFIX = 'guest_';
const GUEST_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const DEFAULT_FOLLOW_GROUP = 'Default';
const MAX_INVITEE_ROWS = 200;
const SNAPSHOT_VERSION = 1;

interface AccountRecord {
  id: string;
  username: string;
  /** Null for guests until they register. */
  password: PasswordHash | null;
  isGuest: boolean;
  createdAt: number;
  referralCode: string;
  referredBy: string | null;
  settings: UserSettings;
  /** Paper wallet address per chain; the WalletState itself lives in the world snapshot. */
  wallets: Record<ChainId, string>;
  /** `${chain}:${address}` -> follow, in follow order. */
  follows: Map<string, FollowedWallet>;
  /** Newest first. */
  watchlist: WatchlistItem[];
  /** Ring buffer, oldest first. */
  notifications: AppNotification[];
  rewards: RewardsCounters;
  /** Sim time of the last faucet deposit per chain. */
  faucetClaims: Partial<Record<ChainId, number>>;
}

type StoredAccount = Omit<AccountRecord, 'follows'> & { follows: FollowedWallet[] };

interface AccountsSnapshot {
  version: number;
  accounts: StoredAccount[];
  /** [sha256(token), account id] */
  sessions: [string, string][];
}

export interface FollowInput {
  remark?: string;
  group?: string;
  notify?: boolean;
}

export type FaucetResult = { ok: true; wallet: UserWallet } | { ok: false; retryAfterSeconds: number };

const walletKey = (chain: ChainId, address: string) => `${chain}:${address}`;
const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');
const isAmount = (v: number) => Number.isFinite(v) && v >= 0;

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

function isSnapshot(data: unknown): data is AccountsSnapshot {
  if (typeof data !== 'object' || data === null) return false;
  const s = data as Partial<AccountsSnapshot>;
  return s.version === SNAPSHOT_VERSION && Array.isArray(s.accounts) && Array.isArray(s.sessions);
}

export class Accounts implements AccountsApi {
  private readonly records = new Map<string, AccountRecord>();
  /** lowercase username -> account id */
  private readonly byUsername = new Map<string, string>();
  private readonly byReferralCode = new Map<string, string>();
  /** sha256(session token) -> account id */
  private readonly sessions = new Map<string, string>();
  /** account id -> its session digests, oldest first */
  private readonly sessionsByAccount = new Map<string, string[]>();
  /** account id -> sign-in attempts in the current window (not persisted) */
  private readonly loginAttempts = new Map<string, { count: number; since: number }>();
  /** paper wallet address -> owning account id */
  private readonly walletOwners = new Map<string, string>();
  /** `${chain}:${address}` -> accounts following that wallet */
  private readonly followers = new Map<string, Set<string>>();
  /** referrer id -> invitee ids */
  private readonly invitees = new Map<string, Set<string>>();
  /** `${account}|${wallet}|${token}` -> sim time of the last follow notification */
  private readonly followNotifiedAt = new Map<string, number>();

  constructor(private readonly ctx: AppContext) {}

  install(): void {
    const { hub, world, engine } = this.ctx;
    hub.register('user', {
      requiresAuth: true,
      onSubscribe: (sub) => {
        const accountId = sub.client.accountId;
        if (!accountId || !this.records.has(accountId)) throw new Error('account not found');
        for (const chain of CHAIN_IDS) hub.send(sub, 'balance', this.userWallet(accountId, chain));
      },
    });
    world.on('trade', (trade) => this.onTrade(trade));
    engine.addTicker('accounts-housekeeping', () => this.pruneThrottles(), { everyMs: HOUSEKEEPING_EVERY_MS });
  }

  // ---------------------------------------------------------------------------
  // Auth & sessions
  // ---------------------------------------------------------------------------

  /** Instant paper account. Unknown referral codes are ignored so a stale invite link never blocks onboarding. */
  createGuest(referralCode?: string): AuthResponse {
    const referrer = referralCode ? this.findByReferralCode(referralCode) : null;
    return this.startSession(this.createRecord(this.uniqueGuestName(), null, referrer));
  }

  /**
   * Register a new account. When the caller is signed in as a guest, the guest
   * account is upgraded in place so its wallets, positions and settings carry over.
   */
  async register(input: { username: string; password: string; referralCode?: string }, callerId: string | null): Promise<AuthResponse> {
    this.assertUsernameAvailable(input.username);
    const referrer = input.referralCode ? this.findByReferralCode(input.referralCode) : null;
    if (input.referralCode && !referrer) throw new HttpError(400, 'unknown referral code', 'invalid_referral_code');
    const password = await hashPassword(input.password);
    // Re-check: a concurrent request may have taken the name while we were hashing.
    this.assertUsernameAvailable(input.username);

    const guest = callerId ? this.records.get(callerId) : undefined;
    if (!guest?.isGuest) return this.startSession(this.createRecord(input.username, password, referrer));

    this.byUsername.delete(guest.username.toLowerCase());
    guest.username = input.username;
    guest.password = password;
    guest.isGuest = false;
    this.byUsername.set(guest.username.toLowerCase(), guest.id);
    if (referrer && !guest.referredBy && referrer.id !== guest.id) this.linkReferral(guest, referrer);
    return this.startSession(guest);
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const id = this.byUsername.get(username.toLowerCase());
    const record = id ? this.records.get(id) : undefined;
    // Counted before the (async) hash so concurrent guesses cannot all slip past the limit.
    if (record) this.countLoginAttempt(record.id);
    // Always run the hash so unknown usernames are not distinguishable by timing.
    const valid = await verifyPassword(password, record?.password ?? null);
    if (!valid || !record) throw new HttpError(401, 'invalid username or password', 'invalid_credentials');
    this.loginAttempts.delete(record.id);
    return this.startSession(record);
  }

  logout(token: string): void {
    const digest = digestToken(token);
    const accountId = this.sessions.get(digest);
    if (!accountId) return;
    this.sessions.delete(digest);
    const list = this.sessionsByAccount.get(accountId);
    list?.splice(list.indexOf(digest), 1);
    this.ctx.hub.revalidateAuth();
  }

  resolveToken(token: string): string | null {
    return this.sessions.get(digestToken(token)) ?? null;
  }

  private startSession(record: AccountRecord): AuthResponse {
    const token = newSessionToken();
    this.addSession(digestToken(token), record.id);
    return { token, account: this.toAccount(record) };
  }

  private addSession(digest: string, accountId: string): void {
    this.sessions.set(digest, accountId);
    let list = this.sessionsByAccount.get(accountId);
    if (!list) this.sessionsByAccount.set(accountId, (list = []));
    list.push(digest);
    if (list.length > MAX_SESSIONS_PER_ACCOUNT) {
      this.sessions.delete(list.shift()!);
      this.ctx.hub.revalidateAuth();
    }
  }

  private countLoginAttempt(accountId: string): void {
    const now = this.ctx.world.now;
    let entry = this.loginAttempts.get(accountId);
    if (!entry || now - entry.since >= LOGIN_ATTEMPT_WINDOW_MS) this.loginAttempts.set(accountId, (entry = { count: 0, since: now }));
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      const seconds = Math.ceil((entry.since + LOGIN_ATTEMPT_WINDOW_MS - now) / 1000);
      throw new HttpError(429, `too many sign-in attempts, try again in ${seconds}s`, 'rate_limited');
    }
    entry.count++;
  }

  private assertUsernameAvailable(username: string): void {
    if (username.toLowerCase().startsWith(GUEST_PREFIX)) {
      throw new HttpError(400, `usernames starting with "${GUEST_PREFIX}" are reserved`, 'invalid_input');
    }
    if (this.byUsername.has(username.toLowerCase())) throw new HttpError(409, 'username is already taken', 'username_taken');
  }

  private createRecord(username: string, password: PasswordHash | null, referrer: AccountRecord | null): AccountRecord {
    const { world } = this.ctx;
    const id = this.uniqueAccountId();
    const wallets = {} as Record<ChainId, string>;
    for (const chain of CHAIN_IDS) {
      wallets[chain] = world.createWallet(chain, 'user', { native: CHAINS[chain].starterBalance, accountId: id, label: null }).address;
    }
    const record: AccountRecord = {
      id,
      username,
      password,
      isGuest: password === null,
      createdAt: world.now,
      referralCode: this.uniqueReferralCode(),
      referredBy: null,
      settings: defaultSettings(),
      wallets,
      follows: new Map(),
      watchlist: [],
      notifications: [],
      rewards: emptyRewards(),
      faucetClaims: {},
    };
    this.index(record);
    if (referrer) this.linkReferral(record, referrer);
    return record;
  }

  /** Register a record in every lookup index. */
  private index(r: AccountRecord): void {
    this.records.set(r.id, r);
    this.byUsername.set(r.username.toLowerCase(), r.id);
    this.byReferralCode.set(r.referralCode, r.id);
    for (const chain of CHAIN_IDS) this.walletOwners.set(r.wallets[chain], r.id);
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

  /** Paper "deposit": top the wallet back up to the chain's starter balance, at most once per cooldown. */
  claimFaucet(accountId: string, chain: ChainId): FaucetResult {
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
    }
    return { ok: true, wallet: this.userWallet(accountId, chain) };
  }

  private userWallet(accountId: string, chain: ChainId): UserWallet {
    const wallet = this.walletFor(accountId, chain);
    return { chain, address: wallet.address, nativeBalance: wallet.native, nativeBalanceUsd: wallet.native * this.ctx.world.nativeUsd(chain) };
  }

  private toAccount(r: AccountRecord): Account {
    const wallets = {} as Record<ChainId, UserWallet>;
    for (const chain of CHAIN_IDS) wallets[chain] = this.userWallet(r.id, chain);
    return { id: r.id, username: r.username, isGuest: r.isGuest, createdAt: r.createdAt, referralCode: r.referralCode, referredBy: r.referredBy, wallets };
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
      .map((f) => ({ ...f }));
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
    const wallet = this.ctx.world.getWallet(address);
    if (!wallet || wallet.chain !== chain) throw notFound('wallet');
    if (wallet.accountId === accountId) throw new HttpError(400, 'you cannot follow your own wallet', 'invalid_input');
    if (record.follows.size >= MAX_FOLLOWS) throw new HttpError(400, `you can follow at most ${MAX_FOLLOWS} wallets`, 'limit_reached');
    const follow: FollowedWallet = {
      chain,
      address,
      remark: input.remark ?? '',
      group: input.group ?? DEFAULT_FOLLOW_GROUP,
      createdAt: this.ctx.world.now,
      notify: input.notify ?? true,
    };
    record.follows.set(key, follow);
    addToSetMap(this.followers, key, accountId);
    return { ...follow };
  }

  updateFollow(accountId: string, chain: ChainId, address: string, patch: FollowInput): FollowedWallet {
    const follow = this.record(accountId).follows.get(walletKey(chain, address));
    if (!follow) throw notFound('followed wallet');
    if (patch.remark !== undefined) follow.remark = patch.remark;
    if (patch.group !== undefined) follow.group = patch.group;
    if (patch.notify !== undefined) follow.notify = patch.notify;
    return { ...follow };
  }

  unfollow(accountId: string, chain: ChainId, address: string): void {
    const key = walletKey(chain, address);
    if (!this.record(accountId).follows.delete(key)) throw notFound('followed wallet');
    removeFromSetMap(this.followers, key, accountId);
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
  private notifyFollowTrade(accountId: string, follow: FollowedWallet, trade: Trade): void {
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

  private pruneThrottles(): void {
    const now = this.ctx.world.now;
    for (const [key, at] of this.followNotifiedAt) if (now - at >= FOLLOW_NOTIFY_THROTTLE_MS) this.followNotifiedAt.delete(key);
    for (const [id, entry] of this.loginAttempts) if (now - entry.since >= LOGIN_ATTEMPT_WINDOW_MS) this.loginAttempts.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Watchlist
  // ---------------------------------------------------------------------------

  watchlist(accountId: string): WatchlistItem[] {
    return this.records.get(accountId)?.watchlist.map((item) => ({ ...item })) ?? [];
  }

  /** Watchlist items plus summaries of the tokens that still exist. */
  watchlistView(accountId: string): { items: WatchlistItem[]; tokens: TokenSummary[] } {
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
    return { items, tokens };
  }

  addToWatchlist(accountId: string, chain: ChainId, address: string): WatchlistItem {
    const record = this.record(accountId);
    const existing = record.watchlist.find((i) => i.chain === chain && i.address === address);
    if (existing) return { ...existing };
    const token = this.ctx.world.getToken(address);
    if (!token || token.chain !== chain) throw notFound('token');
    if (record.watchlist.length >= MAX_WATCHLIST) throw new HttpError(400, `watchlist is full (max ${MAX_WATCHLIST})`, 'limit_reached');
    const item: WatchlistItem = { chain, address, addedAt: this.ctx.world.now };
    record.watchlist.unshift(item);
    return { ...item };
  }

  removeFromWatchlist(accountId: string, chain: ChainId, address: string): void {
    const list = this.record(accountId).watchlist;
    const index = list.findIndex((i) => i.chain === chain && i.address === address);
    if (index < 0) throw notFound('watchlist item');
    list.splice(index, 1);
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
      sessions: [...this.sessions],
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
    ]) {
      map.clear();
    }
    for (const stored of snap.accounts) {
      this.index({
        ...stored,
        settings: normalizeSettings(stored.settings),
        rewards: { ...emptyRewards(), ...stored.rewards },
        follows: new Map(stored.follows.map((f) => [walletKey(f.chain, f.address), f])),
      });
    }
    // Snapshot order is creation order, so the per-account cap keeps the newest sessions.
    for (const [digest, accountId] of snap.sessions) if (this.records.has(accountId)) this.addSession(digest, accountId);
  }
}
