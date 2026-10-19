// REST routes for token-side analytics (see docs/API.md "Market data").
// Query params are validated with zod; JSON-encoded `filters` are parsed and
// validated strictly. 400 on bad params, 404 for unknown tokens or a token
// requested under the wrong chain.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RESOLUTIONS, STAT_WINDOWS, isChainId, type ChainId, type Resolution, type StatWindow, type TrendingSort } from '@trenchscope/shared';
import { HttpError, viewerOf, type AppContext } from '../../context';
import type { TokenState } from '../../sim/world';
import { FilterParseError, parseTokenFiltersParam, parseTrenchesFiltersParam } from '../filters';
import { TRADER_SORTS, TRADE_FILTERS, tokenAnalyticsFor, type TokenAnalytics } from './index';

const WALLET_TAG_FILTERS = ['all', 'smart', 'kol', 'sniper', 'bundler', 'insider', 'dev', 'whale', 'fresh', 'bot', 'sandwich', 'top_holder', 'following', 'you'] as const;
const TRENDING_SORTS = ['hot', 'volume', 'swaps', 'marketCap', 'liquidity', 'holders', 'priceChange', 'age', 'smartDegenCount', 'kolCount', 'netBuy'] as const;

const intParam = (lo: number, hi: number) => z.coerce.number().int().min(lo).max(hi).optional();
const order = z.enum(['asc', 'desc']).optional();

const schemas = {
  trenches: z.object({ filters: z.string().optional(), limit: intParam(1, 100) }),
  trending: z.object({
    window: z.enum(STAT_WINDOWS as [string, ...string[]]).optional(),
    sort: z.enum(TRENDING_SORTS).optional(),
    order,
    filters: z.string().optional(),
    limit: intParam(1, 100),
  }),
  newPairs: z.object({ filters: z.string().optional(), limit: intParam(1, 100) }),
  candles: z.object({ resolution: z.enum(RESOLUTIONS as [string, ...string[]]).optional(), limit: intParam(1, 2000) }),
  trades: z.object({
    filter: z.enum(TRADE_FILTERS as [string, ...string[]]).optional(),
    wallet: z.string().min(1).max(100).optional(),
    minUsd: z.coerce.number().finite().min(0).optional(),
    limit: intParam(1, 500),
    before: z.coerce.number().finite().optional(),
  }),
  holders: z.object({ tag: z.enum(WALLET_TAG_FILTERS).optional(), limit: intParam(1, 500) }),
  topTraders: z.object({
    tag: z.enum(WALLET_TAG_FILTERS).optional(),
    sort: z.enum(TRADER_SORTS as [string, ...string[]]).optional(),
    order,
    limit: intParam(1, 500),
  }),
  search: z.object({ q: z.string().max(200).optional(), chain: z.string().optional() }),
};

type ChainParams = { chain: string };
type TokenParams = { chain: string; address: string };

function parseQuery<T>(schema: z.ZodType<T>, req: FastifyRequest): T {
  const r = schema.safeParse(req.query ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(400, i ? `invalid ${i.path.join('.') || 'query'}: ${i.message}` : 'invalid query', 'bad_request');
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

  app.get<{ Params: ChainParams }>('/api/:chain/trenches', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.trenches, req);
    const filters = withFilters(() => parseTrenchesFiltersParam(q.filters));
    return ta().trenches({ chain, filters, limit: q.limit });
  });

  app.get<{ Params: ChainParams }>('/api/:chain/trending', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.trending, req);
    const filters = withFilters(() => parseTokenFiltersParam(q.filters));
    return ta().trending({
      chain,
      window: (q.window ?? '1h') as StatWindow,
      sort: q.sort as TrendingSort | undefined,
      order: q.order,
      filters,
      limit: q.limit,
    });
  });

  app.get<{ Params: ChainParams }>('/api/:chain/new-pairs', async (req) => {
    const chain = parseChain(req.params.chain);
    const q = parseQuery(schemas.newPairs, req);
    const filters = withFilters(() => parseTokenFiltersParam(q.filters));
    return ta().newPairs(chain, filters, q.limit);
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

  app.get<{ Params: TokenParams }>('/api/:chain/tokens/:address/dev', async (req) => {
    return ta().devInfo(tokenOf(req.params));
  });

  app.get('/api/search', async (req) => {
    const q = parseQuery(schemas.search, req);
    let chain: ChainId | undefined;
    if (q.chain !== undefined && q.chain !== '' && q.chain !== 'all') chain = parseChain(q.chain);
    return ta().search(q.q ?? '', chain);
  });
}
