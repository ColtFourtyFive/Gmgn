// HTTP routes of the accounts module (docs/API.md, "Accounts"; live-mode security:
// packages/shared/src/types.ts, "Live mode: funding, withdrawals and account security").

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { BLACKLIST_LIMITS, CHAINS, WATCHLIST_LIMITS, isChainId, type BlacklistKind, type ChainId } from '@trenchscope/shared';
import { HttpError, bearerToken, optionalAccount, requireAccount, type AppContext } from '../context';
import { Accounts, LIVE_MIN_PASSWORD_LENGTH, MAX_NOTIFICATIONS } from './service';
import { settingsPatchSchema } from './settings';

const chain = z.custom<ChainId>(isChainId, 'unknown chain');
const address = z.string().trim().min(1, 'address is required').max(100, 'address is too long');
const username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'username must be 3-20 characters: letters, digits or underscores');
const password = z.string().min(6, 'password must be at least 6 characters').max(128, 'password must be at most 128 characters');
/** Live mode: real funds behind the account. */
const livePassword = z
  .string()
  .min(LIVE_MIN_PASSWORD_LENGTH, `password must be at least ${LIVE_MIN_PASSWORD_LENGTH} characters`)
  .max(128, 'password must be at most 128 characters');
/** A TOTP or recovery code (format checked by the security module). */
const code = z.string().trim().min(1, 'code is required').max(64, 'code is too long');
const solanaAddress = z
  .string()
  .trim()
  .refine((a) => {
    try {
      return new PublicKey(a).toBase58() === a;
    } catch {
      return false;
    }
  }, 'not a valid Solana address');
/** Empty strings count as "no code". */
const referralCode = z
  .string()
  .trim()
  .max(32, 'referral code is too long')
  .optional()
  .transform((code) => code || undefined);
const remark = z.string().trim().max(32, 'remark must be at most 32 characters');
const group = z.string().trim().min(1, 'group cannot be empty').max(24, 'group must be at most 24 characters');

const guestBody = z.object({ referralCode }).default({});
const registerBody = z.object({ username, password, referralCode });
const liveRegisterBody = z.object({ username, password: livePassword, referralCode });
const loginBody = z.object({
  username: z.string().trim().min(1, 'username is required').max(64),
  password: z.string().min(1, 'password is required').max(128),
});
/** Live mode, 2FA on: plus a TOTP or recovery code (blank = none). */
const liveLoginBody = loginBody.extend({
  code: z
    .string()
    .trim()
    .max(64, 'code is too long')
    .optional()
    .transform((c) => c || undefined),
});
const passwordChangeBody = (live: boolean) =>
  z.object({ currentPassword: z.string().min(1, 'currentPassword is required').max(128), newPassword: live ? livePassword : password, code: code.optional() });
const chainBody = z.object({ chain });
const walletRef = z.object({ chain, address });
const followPatch = z.object({ remark: remark.optional(), group: group.optional(), notify: z.boolean().optional() });
const followBody = walletRef.merge(followPatch);
const followsQuery = z.object({ chain: chain.optional() });
const notificationsQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(50)
    .transform((n) => Math.min(n, MAX_NOTIFICATIONS)),
});
const markReadBody = z.object({ ids: z.array(z.string()).max(MAX_NOTIFICATIONS).optional() }).default({});

/** Control, zero-width, bidi and line / paragraph separator characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const visibleText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} must be at most ${max} characters`)
    .refine((s) => !INVISIBLE.test(s), `${what} contains control or invisible characters`);
const groupName = visibleText(WATCHLIST_LIMITS.groupNameMaxLength, 'name').pipe(z.string().min(1, 'name is required'));
const groupColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be #rrggbb')
  .transform((c) => c.toLowerCase());
const groupBody = z.object({ name: groupName, color: groupColor.optional() });
const groupPatch = z.object({ name: groupName.optional(), color: groupColor.nullable().optional(), order: z.number().int().min(0).optional() });
const watchPatch = z.object({
  groupIds: z.array(z.string().min(1).max(40)).max(WATCHLIST_LIMITS.maxGroups).optional(),
  note: visibleText(WATCHLIST_LIMITS.noteMaxLength, 'note').optional(),
});
const watchBody = walletRef.merge(watchPatch);

const blacklistKind = z.enum(['token', 'creator', 'keyword']);
const blacklistBody = z.object({ kind: blacklistKind, chain: chain.optional(), value: z.string() });
const blacklistRef = z.object({ kind: blacklistKind, value: z.string() });
const blacklistQuery = z.object({ chain: chain.optional() });
/** Keywords are stored lower-cased without a leading "$" (how list filters match them). */
const keyword = z.object({
  value: z
    .string()
    .refine((k) => !INVISIBLE.test(k), 'keyword contains control or invisible characters')
    .transform((k) => k.trim().replace(/^\$/, '').trim().toLowerCase())
    .pipe(z.string().min(1, 'keyword is required').max(BLACKLIST_LIMITS.keywordMaxLength, `keyword must be at most ${BLACKLIST_LIMITS.keywordMaxLength} characters`)),
});
const blacklistAddress = z.object({ value: address });

const codeBody = z.object({ code });
const whitelistBody = z.object({ chain, address: solanaAddress, label: visibleText(32, 'label').default(''), code });
const whitelistRemoveBody = z.object({ chain, address: solanaAddress, code });

/** Validate input; failures become 400s naming the offending field. */
function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.join('.');
  throw new HttpError(400, path ? `${path}: ${issue.message}` : issue.message, 'invalid_input');
}

/** Simulated EVM addresses are lowercase; accept checksummed input. */
function normalizeAddress(chain: ChainId, address: string): string {
  return CHAINS[chain].addressStyle === 'evm' ? address.toLowerCase() : address;
}

function parseWalletRef(value: unknown): { chain: ChainId; address: string } {
  const ref = parse(walletRef, value);
  return { chain: ref.chain, address: normalizeAddress(ref.chain, ref.address) };
}

/** A blacklist value in stored form: a normalized keyword, or an address (lower-cased when EVM-style). */
function blacklistValue(kind: BlacklistKind, value: string): string {
  if (kind === 'keyword') return parse(keyword, { value }).value;
  const raw = parse(blacklistAddress, { value }).value;
  return /^0x/i.test(raw) ? raw.toLowerCase() : raw;
}

export async function registerAccountRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const accounts = ctx.accounts;
  if (!(accounts instanceof Accounts)) throw new Error('account routes require the Accounts service');
  const auth = (req: FastifyRequest) => requireAccount(ctx, req);
  const live = ctx.config.mode === 'live';
  /** Signed in, live mode only (account security is about real funds). */
  const liveAuth = (req: FastifyRequest) => {
    const id = auth(req);
    if (!live) throw new HttpError(403, 'account security settings are only available in live mode', 'not_available_in_demo');
    return id;
  };

  // ---- auth ----

  app.post('/api/auth/guest', async (req) => {
    if (live) throw new HttpError(403, 'guest accounts are not available with real funds: create an account', 'guest_disabled');
    return accounts.createGuest(parse(guestBody, req.body).referralCode);
  });

  app.post('/api/auth/register', async (req) => {
    if (live) return accounts.register(parse(liveRegisterBody, req.body), null, req.ip);
    return accounts.register(parse(registerBody, req.body), optionalAccount(ctx, req));
  });

  app.post('/api/auth/login', async (req) => {
    if (live) {
      const body = parse(liveLoginBody, req.body);
      return accounts.login(body.username, body.password, req.ip, body.code);
    }
    const body = parse(loginBody, req.body);
    return accounts.login(body.username, body.password, req.ip);
  });

  /** Change the password; every session is signed out and a fresh one returned (AuthResponse). */
  app.post('/api/auth/password', async (req) => {
    const id = auth(req);
    return accounts.changePassword(id, parse(passwordChangeBody(live), req.body), req.ip);
  });

  app.post('/api/auth/logout', async (req) => {
    auth(req);
    const token = bearerToken(req);
    if (token) accounts.logout(token);
    return { ok: true };
  });

  // ---- account, settings, faucet ----

  app.get('/api/me', async (req) => {
    const account = accounts.getAccount(auth(req));
    if (!account) throw new HttpError(404, 'account not found', 'not_found');
    return account;
  });

  app.get('/api/settings', async (req) => accounts.getSettings(auth(req)));

  app.put('/api/settings', async (req) => {
    const id = auth(req);
    return accounts.updateSettings(id, parse(settingsPatchSchema, req.body));
  });

  app.post('/api/wallet/faucet', async (req, reply) => {
    const id = auth(req);
    if (live) throw new HttpError(403, 'the faucet is not available with real funds: deposit SOL to your wallet', 'not_available_in_live');
    const result = accounts.claimFaucet(id, parse(chainBody, req.body).chain);
    if (result.ok) return result.wallet;
    const seconds = result.retryAfterSeconds;
    return reply
      .code(429)
      .header('retry-after', String(seconds))
      .send({ error: `faucet is cooling down, try again in ${seconds}s`, code: 'faucet_cooldown' });
  });

  // ---- follows ----

  app.get('/api/follows', async (req) => {
    const id = auth(req);
    return accounts.followedWallets(id, parse(followsQuery, req.query).chain);
  });

  app.post('/api/follows', async (req) => {
    const id = auth(req);
    const { chain, address, ...input } = parse(followBody, req.body);
    return accounts.follow(id, chain, normalizeAddress(chain, address), input);
  });

  app.patch('/api/follows/:chain/:address', async (req) => {
    const id = auth(req);
    const ref = parseWalletRef(req.params);
    return accounts.updateFollow(id, ref.chain, ref.address, parse(followPatch.default({}), req.body));
  });

  app.delete('/api/follows/:chain/:address', async (req) => {
    const id = auth(req);
    const ref = parseWalletRef(req.params);
    accounts.unfollow(id, ref.chain, ref.address);
    return { ok: true };
  });

  // ---- watchlist ----

  app.get('/api/watchlist', async (req) => accounts.watchlistView(auth(req)));

  app.post('/api/watchlist', async (req) => {
    const id = auth(req);
    const { chain, address, ...patch } = parse(watchBody, req.body);
    return accounts.addToWatchlist(id, chain, normalizeAddress(chain, address), patch);
  });

  // Static `groups` routes win over the `:chain/:address` ones in the router.
  app.get('/api/watchlist/groups', async (req) => accounts.watchlistGroups(auth(req)));

  app.post('/api/watchlist/groups', async (req) => {
    const id = auth(req);
    return accounts.createWatchlistGroup(id, parse(groupBody, req.body));
  });

  app.patch('/api/watchlist/groups/:id', async (req) => {
    const id = auth(req);
    return accounts.updateWatchlistGroup(id, (req.params as { id: string }).id, parse(groupPatch.default({}), req.body));
  });

  app.delete('/api/watchlist/groups/:id', async (req) => {
    accounts.deleteWatchlistGroup(auth(req), (req.params as { id: string }).id);
    return { ok: true };
  });

  app.patch('/api/watchlist/:chain/:address', async (req) => {
    const id = auth(req);
    const ref = parseWalletRef(req.params);
    return accounts.updateWatchlistItem(id, ref.chain, ref.address, parse(watchPatch.default({}), req.body));
  });

  app.delete('/api/watchlist/:chain/:address', async (req) => {
    const id = auth(req);
    const ref = parseWalletRef(req.params);
    accounts.removeFromWatchlist(id, ref.chain, ref.address);
    return { ok: true };
  });

  // ---- blacklist ----

  app.get('/api/blacklist', async (req) => accounts.blacklist(auth(req)));

  app.post('/api/blacklist', async (req) => {
    const id = auth(req);
    const body = parse(blacklistBody, req.body);
    return accounts.addToBlacklist(id, body.kind, blacklistValue(body.kind, body.value), body.chain);
  });

  app.delete('/api/blacklist/:kind/:value', async (req) => {
    const id = auth(req);
    const ref = parse(blacklistRef, req.params);
    return accounts.removeFromBlacklist(id, ref.kind, blacklistValue(ref.kind, ref.value), parse(blacklistQuery, req.query).chain);
  });

  // ---- notifications & rewards ----

  app.get('/api/notifications', async (req) => {
    const id = auth(req);
    return accounts.listNotifications(id, parse(notificationsQuery, req.query).limit);
  });

  app.post('/api/notifications/read', async (req) => {
    const id = auth(req);
    accounts.markNotificationsRead(id, parse(markReadBody, req.body).ids);
    return { ok: true };
  });

  app.get('/api/rewards', async (req) => accounts.rewards(auth(req)));

  // ---- security (live mode) ----

  app.get('/api/security', async (req) => accounts.securityStatus(liveAuth(req)));

  app.post('/api/security/2fa/setup', async (req) => accounts.beginTotpSetup(liveAuth(req)));

  app.post('/api/security/2fa/enable', async (req) => {
    const id = liveAuth(req);
    return accounts.enableTotp(id, parse(codeBody, req.body).code, req.ip);
  });

  app.post('/api/security/2fa/disable', async (req) => {
    const id = liveAuth(req);
    return accounts.disableTotp(id, parse(codeBody, req.body).code, req.ip);
  });

  app.post('/api/security/whitelist', async (req) => {
    const id = liveAuth(req);
    return accounts.addWhitelist(id, parse(whitelistBody, req.body), req.ip);
  });

  app.post('/api/security/whitelist/remove', async (req) => {
    const id = liveAuth(req);
    accounts.removeWhitelist(id, parse(whitelistRemoveBody, req.body), req.ip);
    return { ok: true };
  });
}
