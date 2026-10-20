// Operations surface: liveness, readiness (demo and live), Prometheus metrics
// (format, route templates, auth), request ids and the redacting JSON logger.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { loadLiveConfig } from '../src/live/config';
import { counter, createLogger, installOps, opsOptions, redact } from '../src/ops';
import { scrubString } from '../src/ops/log';
import { Exposition, Histogram } from '../src/ops/metrics';

let built: BuiltApp;

beforeAll(async () => {
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, trustProxy: false }), { start: false, persist: false });
});

afterAll(async () => {
  await built.close();
});

const get = (url: string, headers: Record<string, string> = {}) => built.app.inject({ method: 'GET', url, headers });

/** Parse an exposition: families (HELP/TYPE) and samples; fails on malformed lines. */
function parseMetrics(text: string) {
  const types = new Map<string, string>();
  const helps = new Set<string>();
  const samples: { name: string; labels: Record<string, string>; value: number }[] = [];
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let m = /^# HELP ([a-zA-Z_:][a-zA-Z0-9_:]*) .+$/.exec(line);
    if (m) {
      expect(helps.has(m[1]), `HELP ${m[1]} once`).toBe(false);
      helps.add(m[1]);
      continue;
    }
    m = /^# TYPE ([a-zA-Z_:][a-zA-Z0-9_:]*) (counter|gauge|histogram)$/.exec(line);
    if (m) {
      expect(types.has(m[1]), `TYPE ${m[1]} once`).toBe(false);
      types.set(m[1], m[2]);
      continue;
    }
    m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})? (-?[0-9.e+-]+|NaN|\+Inf|-Inf)$/.exec(line);
    expect(m, `malformed line: ${line}`).not.toBeNull();
    const labels: Record<string, string> = {};
    for (const l of (m![2] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) labels[l[1]] = l[2];
    const name = m![1];
    const family = types.has(name) ? name : name.replace(/_(bucket|sum|count)$/, '');
    expect(types.has(family), `sample ${name} has a TYPE`).toBe(true);
    samples.push({ name, labels, value: Number(m![3]) });
  }
  return { types, samples };
}

describe('liveness', () => {
  it('answers /healthz with ok, uptime and loop delay, uncached', async () => {
    const res = await get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(typeof body.eventLoopDelayP99Ms).toBe('number');
  });

  it('tags every response with a request id; a client-sent id is ignored without a trusted proxy', async () => {
    const res = await get('/api/health', { 'x-request-id': 'client-chosen-id-123' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const other = await get('/api/health');
    expect(other.headers['x-request-id']).not.toBe(res.headers['x-request-id']);
  });
});

describe('readiness (demo)', () => {
  it('is not ready until the engine runs, then ready', async () => {
    const before = await get('/readyz');
    expect(before.statusCode).toBe(503);
    expect(before.json()).toMatchObject({ status: 'not_ready', mode: 'demo', checks: { engine: 'down' } });

    built.ctx.engine.start();
    try {
      const after = await get('/readyz');
      expect(after.statusCode).toBe(200);
      expect(after.json()).toEqual({ status: 'ready', mode: 'demo', checks: { engine: 'ok' }, degraded: [] });
    } finally {
      built.ctx.engine.stop();
    }
  });
});

describe('metrics', () => {
  it('serves a valid Prometheus exposition with process, http, ws, world and mode metrics', async () => {
    const addr = built.ctx.world.tokensByChain.sol[0] ?? 'NoSuchToken111111111111111111111111111111111';
    await get('/api/health');
    await get(`/api/sol/tokens/${addr}`);
    await get('/api/sol/tokens/AnotherAddress1111111111111111111111111111111');
    await get('/api/does-not-exist');

    const res = await get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    const { types, samples } = parseMetrics(res.body);
    const one = (name: string, labels: Record<string, string> = {}) =>
      samples.find((s) => s.name === name && Object.entries(labels).every(([k, v]) => s.labels[k] === v));

    for (const name of ['process_resident_memory_bytes', 'nodejs_heap_size_used_bytes', 'process_uptime_seconds', 'nodejs_eventloop_lag_p50_seconds', 'nodejs_eventloop_lag_p99_seconds']) {
      expect(types.get(name), name).toBe('gauge');
      expect(one(name)!.value).toBeGreaterThanOrEqual(0);
    }
    expect(one('trenchscope_info', { mode: 'demo' })!.value).toBe(1);
    expect(one('trenchscope_ws_connections')!.value).toBe(0);
    expect(one('trenchscope_ws_subscriptions', { family: 'trenches' })!.value).toBe(0);
    expect(one('trenchscope_world_tokens', { chain: 'sol' })!.value).toBe(built.ctx.world.tokensByChain.sol.length);
    expect(one('trenchscope_world_wallets', { chain: 'base' })!.value).toBeGreaterThan(0);
    expect(types.get('trenchscope_world_trades_total')).toBe('counter');
    expect(one('trenchscope_engine_running')!.value).toBe(0);

    // Route templates, never raw URLs: both token lookups share one series.
    expect(types.get('trenchscope_http_requests_total')).toBe('counter');
    expect(one('trenchscope_http_requests_total', { method: 'GET', route: '/api/health', status: '200' })!.value).toBeGreaterThanOrEqual(1);
    const tokenSeries = samples.filter((s) => s.name === 'trenchscope_http_requests_total' && s.labels.route === '/api/:chain/tokens/:address');
    expect(tokenSeries.reduce((n, s) => n + s.value, 0)).toBe(2);
    expect(res.body).not.toContain('AnotherAddress');
    expect(one('trenchscope_http_requests_total', { route: 'unmatched', status: '404' })).toBeDefined();

    // Histogram: cumulative buckets ending in +Inf == count.
    expect(types.get('trenchscope_http_request_duration_seconds')).toBe('histogram');
    const buckets = samples.filter((s) => s.name === 'trenchscope_http_request_duration_seconds_bucket' && s.labels.route === '/api/health');
    for (let i = 1; i < buckets.length; i++) expect(buckets[i].value).toBeGreaterThanOrEqual(buckets[i - 1].value);
    expect(buckets.at(-1)!.labels.le).toBe('+Inf');
    expect(buckets.at(-1)!.value).toBe(one('trenchscope_http_request_duration_seconds_count', { route: '/api/health' })!.value);

    // No live metrics in demo mode.
    expect(res.body).not.toContain('trenchscope_live_');
  });

  it('exports counters other modules register', async () => {
    counter('trenchscope_test_rpc_errors_total', 'RPC errors (test)', ['chain']).inc({ chain: 'sol' }, 2);
    expect(counter('trenchscope_test_rpc_errors_total', 'same counter').get({ chain: 'sol' })).toBe(2);
    const res = await get('/metrics');
    expect(res.body).toContain('# TYPE trenchscope_test_rpc_errors_total counter');
    expect(res.body).toContain('trenchscope_test_rpc_errors_total{chain="sol"} 2');
  });

  it('requires METRICS_TOKEN as a bearer token when set, and 404s when disabled', async () => {
    const app = Fastify();
    installOps(app, built.ctx, { metrics: true, metricsToken: 's3cret-metrics-token', accessLog: false });
    const off = Fastify();
    installOps(off, built.ctx, { metrics: false, metricsToken: null, accessLog: false });
    try {
      expect((await app.inject({ url: '/metrics' })).statusCode).toBe(401);
      const wrong = await app.inject({ url: '/metrics', headers: { authorization: 'Bearer nope' } });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.headers['www-authenticate']).toBe('Bearer');
      const ok = await app.inject({ url: '/metrics', headers: { authorization: 'Bearer s3cret-metrics-token' } });
      expect(ok.statusCode).toBe(200);
      expect(ok.body).toContain('trenchscope_info');
      // probes stay open
      expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
      expect((await off.inject({ url: '/metrics' })).statusCode).toBe(404);
    } finally {
      await app.close();
      await off.close();
    }
  });

  it('reads its options from the environment', () => {
    expect(opsOptions({})).toEqual({ metrics: true, metricsToken: null, accessLog: false });
    expect(opsOptions({ METRICS: '0', METRICS_TOKEN: ' t ', ACCESS_LOG: '1' })).toEqual({ metrics: false, metricsToken: 't', accessLog: true });
  });

  it('escapes label values and folds series past the cap', () => {
    const out = new Exposition();
    out.gauge('x_test', 'help', [[{ v: 'a"b\\c\nd' }, 1]]);
    expect(out.toString()).toContain('x_test{v="a\\"b\\\\c\\nd"} 1');
    const h = new Histogram('h_test', 'help', ['route'], [1]);
    for (let i = 0; i < 2100; i++) h.observe({ route: `/r${i}` }, 0.5);
    const text = new Exposition();
    h.write(text);
    expect(text.toString()).toContain('h_test_count{route="__overflow__"} 100');
  });
});

describe('live mode', () => {
  let dir: string;
  let live: BuiltApp;
  const SECRET = 'TURNKEY-PRIVATE-KEY-THAT-MUST-NOT-LEAK';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'trenchscope-ops-'));
    const loaded = loadLiveConfig({ TURNKEY_ORGANIZATION_ID: 'org-1', TURNKEY_API_PUBLIC_KEY: 'pub-1', TURNKEY_API_PRIVATE_KEY: SECRET });
    live = await buildApp(defaultConfig({ mode: 'live', live: loaded.config, liveProblems: loaded.problems, dataDir: dir, warmupMinutes: 0, snapshotEveryMs: 0 }), {
      start: false,
      persist: false,
    });
  });

  afterAll(async () => {
    await live.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports the live stack on /readyz without secrets: 503 while the feed is down, RPC not configured', async () => {
    const res = await live.app.inject({ url: '/readyz' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.mode).toBe('live');
    expect(body.checks.feed).toBe('down');
    expect(body.checks.rpc).toBe('not_configured');
    expect(body.live.chains.length).toBeGreaterThan(0);
    expect(body.live.chains[0].chain).toBe('sol');
    expect(body.live.problems).toBeGreaterThan(0);
    expect(res.body).not.toContain(SECRET);
    expect(res.body).not.toContain('org-1');
  });

  it('is ready with the core up and lists a chain whose own report is down as degraded', async () => {
    const market = live.ctx.market;
    const original = market.liveStatus.bind(market);
    const now = Date.now();
    market.liveStatus = () =>
      Object.assign(original()!, {
        feedConnected: true,
        lastEventAt: now - 2000,
        chains: [
          { chain: 'sol', feedConnected: true, rpcHealthy: true, tradingEnabled: false, trackedTokens: 12, lastEventAt: now - 2000, rpcUrl: 'https://rpc.example/?api-key=nope' },
          { chain: 'base', feedConnected: false, rpcHealthy: true, trackedTokens: 0, lastEventAt: null },
        ],
      });
    live.ctx.engine.start();
    try {
      const res = await live.app.inject({ url: '/readyz' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.checks).toEqual({ engine: 'ok', feed: 'ok', rpc: 'not_configured' });
      expect(body.degraded).toContain('chain:base');
      expect(body.degraded).not.toContain('chain:sol');
      expect(body.live.chains).toEqual([
        { chain: 'sol', feedConnected: true, rpcHealthy: true, tradingEnabled: false, trackedTokens: 12, lastEventAt: now - 2000 },
        { chain: 'base', feedConnected: false, rpcHealthy: true, trackedTokens: 0, lastEventAt: null },
      ]);
      expect(res.body).not.toContain('api-key');

      const metrics = (await live.app.inject({ url: '/metrics' })).body;
      expect(metrics).toContain('trenchscope_live_feed_connected{chain="base"} 0');
      expect(metrics).toContain('trenchscope_live_tracked_tokens{chain="sol"} 12');
      expect(metrics).toMatch(/trenchscope_live_feed_last_event_age_seconds\{chain="sol"\} [0-9.]+/);
      expect(metrics).not.toMatch(/trenchscope_live_feed_last_event_age_seconds\{chain="base"\}/);
    } finally {
      live.ctx.engine.stop();
      market.liveStatus = original;
    }
  });

  it('exports per-chain live gauges', async () => {
    const res = await live.app.inject({ url: '/metrics' });
    expect(res.statusCode).toBe(200);
    parseMetrics(res.body);
    expect(res.body).toContain('trenchscope_info{mode="live"');
    expect(res.body).toMatch(/trenchscope_live_feed_connected\{chain="sol"\} [01]/);
    expect(res.body).not.toContain(SECRET);
  });
});

describe('logging', () => {
  it('redacts secret keys, URL credentials, secret query params and bearer tokens', () => {
    const out = redact({
      apiKey: 'k1',
      nested: { password: 'p1', authorization: 'Bearer abcdefgh12345', cookie: 'sid=1', tokens: 12, ok: 'fine' },
      rpc: 'https://mainnet.helius-rpc.com/?api-key=0123456789abcdef',
      alchemy: 'https://robinhood-mainnet.g.alchemy.com/v2/AbCdEf0123456789xyz',
      basic: 'postgres://user:hunter2@db:5432/x',
      header: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      err: Object.assign(new Error('failed calling https://x.io/?token=supersecret'), { code: 'E1' }),
    }) as Record<string, any>;
    const text = JSON.stringify(out);
    for (const secret of ['k1', 'p1', 'abcdefgh12345', 'sid=1', '0123456789abcdef', 'AbCdEf0123456789xyz', 'hunter2', 'eyJhbGciOiJIUzI1NiJ9', 'supersecret']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(out.nested.tokens).toBe(12);
    expect(out.nested.ok).toBe('fine');
    expect(out.err).toMatchObject({ type: 'Error', code: 'E1' });
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(redact(cyclic)).toEqual({ a: 1, self: '[circular]' });
    expect(scrubString('/api/sol/tokens/So11111111111111111111111111111111111111112')).toBe('/api/sol/tokens/So11111111111111111111111111111111111111112');
  });

  it('writes JSON lines and works as a Fastify loggerInstance', async () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'info', base: { svc: 'test' }, write: (l) => lines.push(l) });
    log.debug('hidden');
    log.info({ secret: 'xyz', count: 3 }, 'hello');
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({ level: 'info', msg: 'hello', svc: 'test', secret: '[redacted]', count: 3 });
    expect(lines).toHaveLength(1);

    const app = Fastify({ loggerInstance: log as unknown as FastifyBaseLogger });
    app.get('/x', async () => ({ ok: true }));
    await app.inject({ url: '/x?token=leaky-token-value', headers: { authorization: 'Bearer leaky-bearer-value' } });
    await app.close();
    const reqLines = lines.slice(1).map((l) => JSON.parse(l));
    expect(reqLines.some((l) => l.msg === 'incoming request' && l.reqId && l.req?.method === 'GET')).toBe(true);
    expect(reqLines.some((l) => l.msg === 'request completed' && l.res?.statusCode === 200)).toBe(true);
    expect(lines.join('\n')).not.toContain('leaky');
  });

  it('keeps a trusted proxy request id', async () => {
    const app = Fastify({ trustProxy: 1 });
    installOps(app, { ...built.ctx, config: { ...built.ctx.config, trustProxy: 1 } }, { metrics: true, metricsToken: null, accessLog: false });
    try {
      const res = await app.inject({ url: '/healthz', headers: { 'x-request-id': 'proxy-assigned-0001' } });
      expect(res.headers['x-request-id']).toBe('proxy-assigned-0001');
      const bad = await app.inject({ url: '/healthz', headers: { 'x-request-id': 'bad id with spaces' } });
      expect(bad.headers['x-request-id']).not.toBe('bad id with spaces');
    } finally {
      await app.close();
    }
  });
});
