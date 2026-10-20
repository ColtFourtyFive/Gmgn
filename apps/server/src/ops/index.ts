// Operations surface: /healthz (liveness), /readyz (readiness), /metrics
// (Prometheus text), request ids (x-request-id) and optional JSON access logs.
// Installed on the root instance so its hooks see every route, the static web
// app included. Configuration comes from the environment:
//   METRICS=0          disable /metrics (404)
//   METRICS_TOKEN=…    require `Authorization: Bearer …` on /metrics
//   ACCESS_LOG=1       one JSON line per request on stdout (ops probes skipped)

import { createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CHAIN_IDS, type ChainId } from '@trenchscope/shared';
import { bearerToken, type AppContext } from '../context';
import { liveChains, readiness, safeLiveStatus } from './health';
import { assignRequestId, createLogger, pathOnly, requestIdOf } from './log';
import { Counter, Exposition, Histogram, LoopDelayMonitor, writeRegistry, type Labels } from './metrics';

export { counter } from './metrics';
export { createLogger, redact, requestIdOf, type Logger } from './log';

export interface OpsOptions {
  /** Serve /metrics (METRICS=0 turns it off). */
  metrics: boolean;
  /** Bearer token /metrics requires (METRICS_TOKEN); null = open, so restrict it at the proxy. */
  metricsToken: string | null;
  /** JSON access log line per request (ACCESS_LOG=1). */
  accessLog: boolean;
}

export function opsOptions(e: NodeJS.ProcessEnv = process.env): OpsOptions {
  return {
    metrics: !/^(0|false|no|off)$/i.test(e.METRICS?.trim() ?? ''),
    metricsToken: e.METRICS_TOKEN?.trim() || null,
    accessLog: /^(1|true|yes|on)$/i.test(e.ACCESS_LOG?.trim() ?? ''),
  };
}

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const OPS_ROUTES = new Set(['/healthz', '/readyz', '/metrics']);
/** Channel families the hub's providers register (market, analytics, wallets, accounts). */
const WS_FAMILIES = ['market', 'trenches', 'trending', 'newpairs', 'token', 'feed', 'signals', 'wallet', 'user'];

/**
 * Route label: the matched route template (never the raw URL, so ids and addresses in paths do not
 * become series). Files of the built web app collapse into `static`; anything unmatched (404s, SPA
 * fallback) into `unmatched`.
 */
function routeLabel(req: FastifyRequest): string {
  const url = req.routeOptions.url;
  if (!url) return 'unmatched';
  if (url.startsWith('/api/') || url === '/ws' || OPS_ROUTES.has(url)) return url;
  return 'static';
}

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function installOps(app: FastifyInstance, ctx: AppContext, opts: OpsOptions = opsOptions()): void {
  const loop = new LoopDelayMonitor();
  loop.start();
  app.addHook('onClose', async () => loop.stop());

  const requests = new Counter('trenchscope_http_requests_total', 'HTTP requests by method, route template and status', ['method', 'route', 'status']);
  const latency = new Histogram('trenchscope_http_request_duration_seconds', 'HTTP request latency by method and route template', ['method', 'route'], HTTP_BUCKETS);
  const accessLog = opts.accessLog ? createLogger({ base: { svc: 'trenchscope', mode: ctx.config.mode } }) : null;
  // Behind a trusted proxy (TRUST_PROXY), keep the request id it assigned so proxy and app logs correlate.
  const trustIncomingId = Boolean(ctx.config.trustProxy);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', assignRequestId(req, trustIncomingId));
  });

  app.addHook('onResponse', async (req, reply) => {
    const method = METHODS.has(req.method) ? req.method : 'OTHER';
    const route = routeLabel(req);
    requests.inc({ method, route, status: String(reply.statusCode) });
    latency.observe({ method, route }, reply.elapsedTime / 1000);
    if (accessLog && !OPS_ROUTES.has(route)) {
      accessLog.info(
        { reqId: requestIdOf(req), method: req.method, route, path: pathOnly(req.url), status: reply.statusCode, ms: Math.round(reply.elapsedTime * 10) / 10, ip: req.ip },
        'request',
      );
    }
  });

  // Liveness: answering at all means the process is up and its event loop turns.
  app.get('/healthz', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), eventLoopDelayP99Ms: Math.round(loop.snapshot().p99 * 1000) };
  });

  app.get('/readyz', async (_req, reply) => {
    const r = readiness(ctx);
    return reply
      .header('cache-control', 'no-store')
      .status(r.status === 'ready' ? 200 : 503)
      .send(r);
  });

  app.get('/metrics', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!opts.metrics) return reply.status(404).send({ error: 'not found' });
    if (opts.metricsToken && !tokenMatches(bearerToken(req), opts.metricsToken)) {
      return reply.status(401).header('www-authenticate', 'Bearer').send({ error: 'unauthorized' });
    }
    let body: string;
    try {
      const out = new Exposition();
      writeProcess(out, loop);
      requests.write(out);
      latency.write(out);
      writeApp(out, ctx);
      writeRegistry(out);
      body = out.toString();
    } catch (err) {
      console.error('[ops] metrics failed', err);
      return reply.status(500).send({ error: 'metrics unavailable' });
    }
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(body);
  });
}

function writeProcess(out: Exposition, loop: LoopDelayMonitor): void {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const lag = loop.snapshot();
  out
    .gauge('process_resident_memory_bytes', 'Resident set size', mem.rss)
    .gauge('nodejs_heap_size_used_bytes', 'V8 heap in use', mem.heapUsed)
    .gauge('nodejs_heap_size_total_bytes', 'V8 heap allocated', mem.heapTotal)
    .gauge('nodejs_external_memory_bytes', 'Memory of C++ objects bound to JS objects (buffers)', mem.external)
    .counterValue('process_cpu_user_seconds_total', 'User CPU time', cpu.user / 1e6)
    .counterValue('process_cpu_system_seconds_total', 'System CPU time', cpu.system / 1e6)
    .gauge('process_start_time_seconds', 'Process start time (unix seconds)', Math.round(performance.timeOrigin / 1000))
    .gauge('process_uptime_seconds', 'Process uptime', Math.round(process.uptime()))
    .gauge('nodejs_eventloop_lag_p50_seconds', 'Event-loop delay beyond the sampling interval, median of the last 15 s window', lag.p50)
    .gauge('nodejs_eventloop_lag_p99_seconds', 'Event-loop delay beyond the sampling interval, p99 of the last 15 s window', lag.p99)
    .gauge('nodejs_eventloop_lag_max_seconds', 'Event-loop delay beyond the sampling interval, max of the last 15 s window', lag.max)
    .gauge('nodejs_eventloop_lag_mean_seconds', 'Event-loop delay beyond the sampling interval, mean of the last 15 s window', lag.mean);
}

function perChain(fn: (chain: ChainId) => number): [Labels, number][] {
  return CHAIN_IDS.map((chain) => [{ chain }, fn(chain)]);
}

function writeApp(out: Exposition, ctx: AppContext): void {
  const { world, engine, hub, config } = ctx;
  out.gauge('trenchscope_info', 'Server mode and runtime (value is always 1)', [[{ mode: config.mode, node_version: process.version }, 1]]);

  // Engine (the market clock and every ticker: sim, analytics, orders, channels)
  out
    .gauge('trenchscope_engine_running', 'Whether the engine tick loop runs (1) or not (0)', engine.running ? 1 : 0)
    .gauge('trenchscope_engine_trades_per_second', 'Trades booked per second, 10 s average', engine.tps)
    .gauge('trenchscope_engine_tick_seconds', 'Wall time the last engine tick took', engine.lastTickCostMs / 1000)
    .gauge('trenchscope_engine_clock_lag_seconds', 'How far the market clock is behind wall time', engine.running ? Math.max(0, (Date.now() - world.now) / 1000) : 0);

  // World ledger sizes
  const active = Object.fromEntries(CHAIN_IDS.map((c) => [c, 0])) as Record<ChainId, number>;
  for (const t of world.tokens.values()) if (!t.dormant && t.chain in active) active[t.chain]++;
  out
    .gauge('trenchscope_world_tokens', 'Tokens in the ledger', perChain((c) => world.tokensByChain[c]?.length ?? 0))
    .gauge('trenchscope_world_tokens_active', 'Tokens in the ledger that are not dormant', perChain((c) => active[c]))
    .gauge('trenchscope_world_wallets', 'Wallets in the ledger', perChain((c) => {
      let n = 0;
      for (const list of world.walletsByArchetype[c]?.values() ?? []) n += list.length;
      return n;
    }))
    .counterValue('trenchscope_world_trades_total', 'Trades booked into the ledger (persisted with the snapshot)', world.tradeTotal);

  // WebSocket hub
  const channels: [Labels, number][] = [];
  const groups: [Labels, number][] = [];
  const subs: [Labels, number][] = [];
  for (const family of WS_FAMILIES) {
    const gs = hub.groups(family);
    channels.push([{ family }, hub.activeChannels(family).length]);
    groups.push([{ family }, gs.length]);
    subs.push([{ family }, gs.reduce((n, g) => n + g.clients.length, 0)]);
  }
  out
    .gauge('trenchscope_ws_connections', 'Open WebSocket connections', hub.clientCount)
    .gauge('trenchscope_ws_channels', 'Channels with at least one subscriber, by channel family', channels)
    .gauge('trenchscope_ws_subscription_groups', 'Distinct (channel, params) groups computed per push, by channel family', groups)
    .gauge('trenchscope_ws_subscriptions', 'Subscriptions, by channel family', subs);

  // Live stack
  const status = safeLiveStatus(ctx);
  if (status) {
    const chains = liveChains(ctx, status);
    const bool = (k: 'feedConnected' | 'rpcHealthy' | 'tradingEnabled'): [Labels, number][] =>
      chains.filter((c) => c[k] !== undefined).map((c) => [{ chain: c.chain }, c[k] ? 1 : 0]);
    const now = Date.now();
    out
      .gauge('trenchscope_live_feed_connected', 'Live market feed connected (1) or not (0)', bool('feedConnected'))
      .gauge('trenchscope_live_rpc_healthy', 'RPC answered its last health probe (1) or not (0)', bool('rpcHealthy'))
      .gauge('trenchscope_live_trading_enabled', 'Swaps can be executed (1) or not (0)', bool('tradingEnabled'))
      .gauge('trenchscope_live_tracked_tokens', 'Tokens tracked from the live feed', chains.filter((c) => c.trackedTokens !== undefined).map((c) => [{ chain: c.chain }, c.trackedTokens!]))
      .gauge(
        'trenchscope_live_feed_last_event_age_seconds',
        'Seconds since the live feed delivered its last event (absent before the first one)',
        chains.filter((c) => typeof c.lastEventAt === 'number').map((c) => [{ chain: c.chain }, Math.max(0, (now - c.lastEventAt!) / 1000)]),
      )
      .gauge('trenchscope_live_config_problems', 'Live features disabled by missing configuration (see the boot log)', config.liveProblems.length);
  }
}
