// HTTP routes of the trading module (docs/API.md, "Trading" and "Token
// launch"). Every route but the launch config requires a session;
// authentication is checked before input validation.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, requireAccount, type AppContext } from '../context';
import { parse } from './common';
import {
  activityQuerySchema,
  alertSchema,
  copyTaskSchema,
  createOrderSchema,
  launchSchema,
  ordersQuerySchema,
  patchSchema,
  portfolioQuerySchema,
  quoteSchema,
  sniperTaskSchema,
  swapSchema,
} from './schemas';
import { Trading } from './service';

const idOf = (req: FastifyRequest) => (req.params as { id: string }).id;

export async function registerTradingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const trading = ctx.trading;
  if (!(trading instanceof Trading)) throw new Error('trading routes require the Trading service');
  const auth = (req: FastifyRequest) => requireAccount(ctx, req);

  // ---- execution ----

  app.post('/api/trade/quote', async (req) => {
    const id = auth(req);
    return trading.executor.quote(id, parse(quoteSchema, req.body));
  });

  app.post('/api/trade/swap', async (req) => {
    const id = auth(req);
    return trading.executor.swap(id, parse(swapSchema, req.body));
  });

  // ---- orders ----

  app.get('/api/orders', async (req) => {
    const id = auth(req);
    return trading.orders.list(id, parse(ordersQuerySchema, req.query));
  });

  app.post('/api/orders', async (req) => {
    const id = auth(req);
    return trading.orders.create(id, parse(createOrderSchema, req.body));
  });

  app.delete('/api/orders/:id', async (req) => trading.orders.cancel(auth(req), idOf(req)));

  // ---- portfolio ----

  app.get('/api/portfolio', async (req) => {
    const id = auth(req);
    return trading.portfolio.summary(id, parse(portfolioQuerySchema, req.query).chain);
  });

  app.get('/api/portfolio/activity', async (req) => {
    const id = auth(req);
    const q = parse(activityQuerySchema, req.query);
    return trading.portfolio.activity(id, q.chain, q.limit);
  });

  // ---- copy trade ----

  app.get('/api/copytrade', async (req) => trading.copyTrade.list(auth(req)));

  app.post('/api/copytrade', async (req) => {
    const id = auth(req);
    return trading.copyTrade.create(id, parse(copyTaskSchema, req.body));
  });

  app.patch('/api/copytrade/:id', async (req) => {
    const id = auth(req);
    return trading.copyTrade.update(id, idOf(req), parse(patchSchema, req.body));
  });

  app.delete('/api/copytrade/:id', async (req) => {
    trading.copyTrade.remove(auth(req), idOf(req));
    return { ok: true };
  });

  // ---- sniper ----

  app.get('/api/sniper', async (req) => trading.sniper.list(auth(req)));

  app.post('/api/sniper', async (req) => {
    const id = auth(req);
    return trading.sniper.create(id, parse(sniperTaskSchema, req.body));
  });

  app.patch('/api/sniper/:id', async (req) => {
    const id = auth(req);
    return trading.sniper.update(id, idOf(req), parse(patchSchema, req.body));
  });

  app.delete('/api/sniper/:id', async (req) => {
    trading.sniper.remove(auth(req), idOf(req));
    return { ok: true };
  });

  // ---- token launch ----

  app.get('/api/launch/config', async () => {
    // The launch config describes the simulator's launchpads: nothing to launch on in live mode.
    if (ctx.config.mode === 'live') throw new HttpError(403, 'token launch is not available in live mode', 'not_available_in_live');
    return trading.launches.config();
  });

  app.post('/api/launch', async (req) => {
    const id = auth(req);
    // Live mode trades real tokens only: launching (simulated curves, bundle wallets) is demo-only.
    if (ctx.config.mode === 'live') throw new HttpError(403, 'token launch is not available in live mode', 'not_available_in_live');
    return trading.launches.launch(id, parse(launchSchema, req.body));
  });

  // ---- alerts ----

  app.get('/api/alerts', async (req) => trading.alerts.list(auth(req)));

  app.post('/api/alerts', async (req) => {
    const id = auth(req);
    return trading.alerts.create(id, parse(alertSchema, req.body));
  });

  app.patch('/api/alerts/:id', async (req) => {
    const id = auth(req);
    return trading.alerts.update(id, idOf(req), parse(patchSchema, req.body));
  });

  app.delete('/api/alerts/:id', async (req) => {
    trading.alerts.remove(auth(req), idOf(req));
    return { ok: true };
  });
}
