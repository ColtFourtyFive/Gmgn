// Wallet-side REST routes (docs/API.md): wallet profile / holdings / activity /
// created tokens / calls, leaderboard, Monitor feed, signals and call-outs.
// Inputs are zod-validated; unknown wallets (or a wallet on another chain) are 404.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CHAIN_IDS, type ChainId } from '@trenchscope/shared';
import { HttpError, requireAccount, viewerOf, type AppContext } from '../../context';
import type { WalletState } from '../../sim/world';
import { SIGNAL_KINDS } from './signals';

const Chain = z.enum(CHAIN_IDS as [ChainId, ...ChainId[]]);
const ChainParams = z.object({ chain: Chain });
const WalletParams = z.object({ chain: Chain, address: z.string().min(1).max(128) });
const Limit = z.coerce.number().int().positive().optional();
const Bool = z.enum(['1', '0', 'true', 'false']).optional();

const HoldingsQuery = z.object({
  includeClosed: Bool,
  sort: z.enum(['value', 'pnl', 'recent']).optional(),
  limit: Limit,
});
const ActivityQuery = z.object({
  type: z.enum(['all', 'buy', 'sell']).optional(),
  limit: Limit,
  before: z.coerce.number().optional(),
});
const LimitQuery = z.object({ limit: Limit });
const LeaderboardQuery = z.object({
  tag: z.enum(['smart', 'kol', 'sniper', 'whale', 'all']).optional(),
  period: z.enum(['1d', '7d', '30d']).optional(),
  sort: z.enum(['pnl', 'winRate', 'volume', 'tokens', 'pnlRate']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: Limit,
});
const FeedQuery = z.object({
  kind: z.enum(['smart', 'kol', 'follow', 'all']).optional(),
  limit: Limit,
});
const SignalsQuery = z.object({
  kind: z.enum(SIGNAL_KINDS as [string, ...string[]]).optional(),
  limit: Limit,
});
const CalloutsQuery = z.object({
  filter: z.enum(['all', 'kol', 'hits']).optional(),
  limit: Limit,
});

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
    throw new HttpError(400, `invalid request (${msg})`, 'bad_request');
  }
  return r.data;
}

function findWallet(ctx: AppContext, chain: ChainId, address: string): WalletState {
  let w = ctx.world.getWallet(address);
  if (!w && address.startsWith('0x')) w = ctx.world.getWallet(address.toLowerCase());
  if (!w || w.chain !== chain) throw new HttpError(404, 'wallet not found', 'not_found');
  return w;
}

export async function registerWalletRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const wallet = (req: FastifyRequest) => {
    const p = parse(WalletParams, req.params);
    return findWallet(ctx, p.chain, p.address);
  };

  app.get('/api/:chain/wallets/:address', async (req) => {
    const w = wallet(req);
    return ctx.analytics.walletProfile(w, viewerOf(ctx, req));
  });

  app.get('/api/:chain/wallets/:address/holdings', async (req) => {
    const w = wallet(req);
    const q = parse(HoldingsQuery, req.query);
    const includeClosed = q.includeClosed === '1' || q.includeClosed === 'true';
    const opts: { includeClosed: boolean; sort?: string; limit?: number } = { includeClosed, sort: q.sort };
    if (q.limit !== undefined) opts.limit = q.limit;
    return ctx.analytics.walletHoldings(w, opts, viewerOf(ctx, req));
  });

  app.get('/api/:chain/wallets/:address/activity', async (req) => {
    const w = wallet(req);
    const q = parse(ActivityQuery, req.query);
    return ctx.analytics.walletActivity(w, { type: q.type, limit: q.limit, before: q.before }, viewerOf(ctx, req));
  });

  app.get('/api/:chain/wallets/:address/created-tokens', async (req) => {
    const w = wallet(req);
    return ctx.analytics.createdTokens(w, parse(LimitQuery, req.query).limit);
  });

  app.get('/api/:chain/wallets/:address/calls', async (req) => {
    const w = wallet(req);
    return ctx.analytics.walletCalls(w, parse(LimitQuery, req.query).limit);
  });

  app.get('/api/:chain/leaderboard', async (req) => {
    const { chain } = parse(ChainParams, req.params);
    const q = parse(LeaderboardQuery, req.query);
    return ctx.analytics.leaderboard(chain, { tag: q.tag, period: q.period, sort: q.sort, order: q.order, limit: q.limit }, viewerOf(ctx, req));
  });

  app.get('/api/:chain/feed', async (req) => {
    const { chain } = parse(ChainParams, req.params);
    const q = parse(FeedQuery, req.query);
    const kind = q.kind ?? 'all';
    const viewer = kind === 'follow' ? { accountId: requireAccount(ctx, req) } : viewerOf(ctx, req);
    return ctx.analytics.feed(chain, kind, q.limit ?? 50, viewer);
  });

  app.get('/api/:chain/signals', async (req) => {
    const { chain } = parse(ChainParams, req.params);
    const q = parse(SignalsQuery, req.query);
    return ctx.analytics.signals(chain, { kind: q.kind, limit: q.limit });
  });

  app.get('/api/:chain/callouts', async (req) => {
    const { chain } = parse(ChainParams, req.params);
    const q = parse(CalloutsQuery, req.query);
    return ctx.analytics.callouts(chain, q.filter ?? 'all', q.limit);
  });
}
