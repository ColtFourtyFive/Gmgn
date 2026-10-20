// REST routes for token-side analytics (see docs/API.md "Market data").
// Query params are validated with zod; JSON-encoded `filters` are parsed and
// validated strictly. The list routes also take their params as a POST JSON
// body (filters as an object) for exclusion lists too long for a URL. 400 on
// bad params, 404 for unknown tokens or a token requested under the wrong chain.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RESOLUTIONS, STAT_WINDOWS, isChainId, type ChainId, type Resolution, type StatWindow, type TokenFilters, type TrendingSort } from '@trenchscope/shared';
import { HttpError, viewerOf, type AppContext } from '../../context';
import type { TokenState } from '../../sim/world';
import { FilterParseError, parseTokenFiltersParam, parseTrenchesFiltersParam, validateTokenFilters, validateTrenchesFilters } from '../filters';
import { TRADER_SORTS, TRADE_FILTERS, tokenAnalyticsFor, type TokenAnalytics } from './index';

const WALLET_TAG_FILTERS = ['all', 'smart', 'kol', 'sniper', 'bundler', 'insider', 'dev', 'whale', 'fresh', 'bot', 'sandwich', 'top_holder', 'following', 'you'] as const;
const TRENDING_SORTS = ['hot', 'volume', 'swaps', 'marketCap', 'liquidity', 'holders', 'priceChange', 'age', 'smartDegenCount', 'kolCount', 'netBuy'] as const;

/** Integer >= lo (400 otherwise); values above the documented max are clamped, like the wallet routes do. */
const intParam = (lo: number, hi: number) =>
  z.coerce
    .number()
    .int()
    .min(lo)
    .transform((v) => Math.min(v, hi))
    .optional();
/** JSON-body twin of intParam (no string coercion). */
const intField = (lo: number, hi: number) =>
  z
    .number()
    .int()
    .min(lo)
    .transform((v) => Math.min(v, hi))
    .optional();
const order = z.enum(['asc', 'desc']).optional();
const trendingBase = { window: z.enum(STAT_WINDOWS as [string, ...string[]]).optional(), sort: z.enum(TRENDING_SORTS).optional(), order };

const schemas = {
  trenches: z.object({ filters: z.string().optional(), limit: intParam(1, 100) }),
  trending: z.object({ ...trendingBase, filters: z.string().optional(), limit: intParam(1, 100) }),
  newPairs: z.object({ filters: z.string().optional(), limit: intParam(1, 100) }),
  trenchesBody: z.object({ filters: z.unknown().optional(), limit: intField(1, 100) }),
  trendingBody: z.object({ ...trendingBase, filters: z.unknown().optional(), limit: intField(1, 100) }),
  newPairsBody: z.object({ filters: z.unknown().optional(), limit: intField(1, 100) }),
  candles: z.object({ resolution: z.enum(RESOLUTIONS as [string, ...string[]]).optional(), limit: intParam(1, 2000) }),
  trades: z.object({
    filter: z.enum(TRADE_FILTERS as [string, ...string[]]).optional(),
    wallet: z.string().min(1).max(100).optional(),
    minUsd: z.coerce.number().finite().min(0).optional(),
    limit: intParam(1, 500),
    before: z.coerce.number().finite().optional(),
    beforeId: z.string().min(1).max(100).optional(),
  }),
  holders: z.object({ tag: z.enum(WALLET_TAG_FILTERS).optional(), limit: intParam(1, 500) }),
  topTraders: z.object({
    tag: z.enum(WALLET_TAG_FILTERS).optional(),
    sort: z.enum(TRADER_SORTS as [string, ...string[]]).optional(),
    order,
    limit: intParam(1, 500),
  }),
  search: z.object({ q: z.string().max(200).optional(), chain: z.string().optional() }),
  signals: z.object({ limit: intParam(1, 500) }),
};

type ChainParams = { chain: string };
type TokenParams = { chain: string; address: string };

function parseQuery<T>(schema: z.ZodType<T>, req: FastifyRequest): T {
  return parseInput(schema, req.query, 'query');
}

function parseBody<T>(schema: z.ZodType<T>, req: FastifyRequest): T {
  return parseInput(schema, req.body, 'body');
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(400, i ? `invalid ${i.path.join('.') || what}: ${i.message}` : `invalid ${what}`, 'bad_request');
  }
  return r.data;
}

function parseChain(raw: string): ChainId {
  if (!isChainId(raw)) throw new HttpError(400, `unknown chain ${raw}`, 'bad_chain');
  return raw;
}

function withFilters<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof FilterParseError) throw new HttpError(400, err.message, 'bad_filters');
    throw err;
  }
}

export async function registerTokenRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const ta = (): TokenAnalytics => {
    const inst = tokenAnalyticsFor(ctx);
    if (!inst) throw new HttpError(503, 'token analytics unavailable');
    return inst;
  };

  const tokenOf = (params: TokenParams): TokenState => {
    const chain = parseChain(params.chain);
    const t = ctx.world.tokens.get(params.address) ?? (chain !== 'sol' ? ctx.world.tokens.get(params.address.toLowerCase()) : undefined);
    if (!t || t.chain !== chain) throw new HttpError(404, 'token not found', 'not_found');
    return t;
  };

  const trending = (chain: ChainId, q: z.infer<typeof schemas.trendingBody>, filters: TokenFilters | undefined) =>
    ta().trending({ chain, window: (q.window ?? '1h') as StatWindow, sort: q.sort as TrendingSort | undefined, order: q.order, filters, limit: q.limit });

  app.get<{ Params: ChainParams }>('/api/:chain/trenches', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.trenches, req);
    return ta().trenches({ chain, filters: withFilters(() => parseTrenchesFiltersParam(q.filters)), limit: q.limit });
  });

  app.post<{ Params: ChainParams }>('/api/:chain/trenches', async (req) => {
    const chain = parseChain(req.params.chain);
    const b = parseBody(schemas.trenchesBody, req);
    return ta().trenches({ chain, filters: withFilters(() => validateTrenchesFilters(b.filters)), limit: b.limit });
  });

  app.get<{ Params: ChainParams }>('/api/:chain/trending', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.trending, req);
    return trending(chain, q, withFilters(() => parseTokenFiltersParam(q.filters)));
  });

  app.post<{ Params: ChainParams }>('/api/:chain/trending', async (req) => {
    const chain = parseChain(req.params.chain);
    const b = parseBody(schemas.trendingBody, req);
    return trending(chain, b, withFilters(() => validateTokenFilters(b.filters)));
  });

  app.get<{ Params: ChainParams }>('/api/:chain/new-pairs', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.newPairs, req);
    return ta().newPairs(chain, withFilters(() => parseTokenFiltersParam(q.filters)), q.limit);
  });

  app.post<{ Params: ChainParams }>('/api/:chain/new-pairs', async (req) => {
    const chain = parseChain(req.params.chain);
    const b = parseBody(schemas.newPairsBody, req);
    return ta().newPairs(chain, withFilters(() => validateTokenFilters(b.filters)), b.limit);
  });

  app.get<{ Params: ChainParams }>('/api/:chain/narratives', async (req) => {
    const chain = parseChain(req.params.chain);
    return ta().narratives(chain);
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address', async (req) => {
    return ta().detail(tokenOf(req.params));
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/candles', async (req) => {
    const t = tokenOf(req.params);
    const q = parseQuery(schemas.candles, req);
    const resolution = (q.resolution ?? '1m') as Resolution;
    const limit = q.limit ?? 500;
    const arr = t.candles[resolution];
    return { resolution, candles: arr.slice(Math.max(0, arr.length - limit)), supply: t.totalSupply };
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/trades', async (req) => {
    const t = tokenOf(req.params);
    const q = parseQuery(schemas.trades, req);
    // EVM addresses are generated lower-case; accept checksummed input like the token lookup does.
    if (q.wallet && t.chain !== 'sol' && !ctx.world.wallets.has(q.wallet)) q.wallet = q.wallet.toLowerCase();
    return ta().trades(t, q, viewerOf(ctx, req));
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/holders', async (req) => {
    const t = tokenOf(req.params);
    const q = parseQuery(schemas.holders, req);
    return ta().holders(t, q, viewerOf(ctx, req));
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/top-traders', async (req) => {
    const t = tokenOf(req.params);
    const q = parseQuery(schemas.topTraders, req);
    return ta().topTraders(t, q, viewerOf(ctx, req));
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/early-buyers', async (req) => {
    return ta().earlyBuyers(tokenOf(req.params), viewerOf(ctx, req));
  });

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/dev', async (req) => {
    return ta().devInfo(tokenOf(req.params));
  });

  // The token's signals (chart markers); new ones are also pushed on its `token` channel ('signals').
  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/signals', async (req) => {
    const t = tokenOf(req.params);
    const q = parseQuery(schemas.signals, req);
    return ctx.analytics.tokenSignals(t, q.limit ?? 200);
  });

  app.get('/api/search', async (req) => {
    const q = parseQuery(schemas.search, req);
    let chain: ChainId | undefined;
    if (q.chain !== undefined && q.chain !== '' && q.chain !== 'all') chain = parseChain(q.chain);
    return ta().search(q.q ?? '', chain, viewerOf(ctx, req));
  });
}
