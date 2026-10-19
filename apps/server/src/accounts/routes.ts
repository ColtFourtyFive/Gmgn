// HTTP routes of the accounts module (docs/API.md, "Accounts").

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CHAINS, isChainId, type ChainId } from '@trenchscope/shared';
import { HttpError, bearerToken, optionalAccount, requireAccount, type AppContext } from '../context';
import { Accounts, MAX_NOTIFICATIONS } from './service';
import { settingsPatchSchema } from './settings';

const chain = z.custom<ChainId>(isChainId, 'unknown chain');
const address = z.string().trim().min(1, 'address is required').max(100, 'address is too long');
const username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'username must be 3-20 characters: letters, digits or underscores');
const password = z.string().min(6, 'password must be at least 6 characters').max(128, 'password must be at most 128 characters');
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
const loginBody = z.object({
  username: z.string().trim().min(1, 'username is required').max(64),
  password: z.string().min(1, 'password is required').max(128),
});
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

export async function registerAccountRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const accounts = ctx.accounts;
  if (!(accounts instanceof Accounts)) throw new Error('account routes require the Accounts service');
  const auth = (req: FastifyRequest) => requireAccount(ctx, req);

  // ---- auth ----

  app.post('/api/auth/guest', async (req) => accounts.createGuest(parse(guestBody, req.body).referralCode));

  app.post('/api/auth/register', async (req) => accounts.register(parse(registerBody, req.body), optionalAccount(ctx, req)));

  app.post('/api/auth/login', async (req) => {
    const body = parse(loginBody, req.body);
    return accounts.login(body.username, body.password);
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
    const ref = parseWalletRef(req.body);
    return accounts.addToWatchlist(id, ref.chain, ref.address);
  });

  app.delete('/api/watchlist/:chain/:address', async (req) => {
    const id = auth(req);
    const ref = parseWalletRef(req.params);
    accounts.removeFromWatchlist(id, ref.chain, ref.address);
    return { ok: true };
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
}
