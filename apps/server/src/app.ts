// Composition root: builds the world, services, HTTP routes and WebSocket hub.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { CHAIN_IDS, LAUNCHPADS, PLATFORM_FEE_RATE, type MetaResponse } from '@trenchscope/shared';
import { Accounts, registerAccountRoutes } from './accounts';
import { Analytics, registerMarketRoutes } from './analytics';
import { HttpError, sendError, type AppConfig, type AppContext } from './context';
import { loadSnapshot, saveSnapshot, saveSnapshotAsync, SNAPSHOT_VERSION, type Snapshot } from './persistence';
import { congestionOf, priorityFeeTiers } from './sim/congestion';
import { Engine } from './sim/engine';
import { MarketSim } from './sim/market';
import { World } from './sim/world';
import { Trading, registerTradingRoutes } from './trading';
import { Hub } from './ws/hub';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  market: MarketSim;
  /** Persist a snapshot now, in one blocking pass (no-op when persistence is disabled). */
  save(): void;
  /**
   * Persist a snapshot a slice at a time with the sim held, so requests and sockets
   * stay served meanwhile (the periodic save). Resolves when written; overlapping
   * calls share the save in progress.
   */
  saveInBackground(): Promise<void>;
  close(): Promise<void>;
}

export function defaultConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir: process.env.DATA_DIR ?? '.data',
    seed: process.env.SIM_SEED ?? 'trenchscope',
    warmupMinutes: Number(process.env.WARMUP_MINUTES ?? 90),
    snapshotEveryMs: Number(process.env.SNAPSHOT_EVERY_MS ?? 900000),
    webDist: process.env.WEB_DIST ?? null,
    trustProxy: proxyHops(process.env.TRUST_PROXY),
    accountCreationsPerIpPer10Min: Number(process.env.ACCOUNT_CREATIONS_PER_IP ?? 30),
    loginAttemptsPerIpPer10Min: Number(process.env.LOGIN_ATTEMPTS_PER_IP ?? 60),
    wsConnectionsPerIp: Number(process.env.WS_CONNECTIONS_PER_IP ?? 20),
    ...overrides,
  };
}

export async function buildApp(config: AppConfig, opts: { start?: boolean; persist?: boolean; logger?: boolean } = {}): Promise<BuiltApp> {
  const persist = opts.persist ?? config.snapshotEveryMs > 0;
  const snapshot = persist ? loadSnapshot(config.dataDir) : null;

  const world = snapshot ? World.restore(snapshot.world) : new World(config.seed);
  const engine = new Engine(world);
  const hub = new Hub({ maxConnectionsPerIp: config.wsConnectionsPerIp });
  const ctx = { config, world, engine, hub } as AppContext;
  const accounts = new Accounts(ctx);
  const analytics = new Analytics(ctx);
  const trading = new Trading(ctx);
  ctx.accounts = accounts;
  ctx.analytics = analytics;
  ctx.trading = trading;
  const market = new MarketSim(ctx);
  ctx.market = market;

  // Install order = ticker order: market dynamics first, then analytics, trading, accounts.
  market.install();
  analytics.install();
  trading.install();
  accounts.install();
  hub.setAuthResolver((token) => ctx.accounts.resolveToken(token));

  if (snapshot) {
    market.restore(snapshot.market);
    ctx.accounts.restore(snapshot.accounts);
    ctx.analytics.restore(snapshot.analytics);
    ctx.trading.restore(snapshot.trading);
    console.log(`[app] restored snapshot from ${new Date(snapshot.savedAt).toISOString()} (${world.tokens.size} tokens)`);
  } else {
    market.seedPopulation();
    if (config.warmupMinutes > 0) engine.warmup(config.warmupMinutes * 60000);
  }

  // Headers up to 128KB so list URLs can carry exclusion filters (the `filters` param itself stops at 64KB).
  // Trust a hop count, never every hop: with `true` the client's own leftmost X-Forwarded-For entry
  // would become req.ip, so anyone could pick the address the per-IP limits count against.
  const hops = config.trustProxy === true ? 1 : config.trustProxy || 0;
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024, trustProxy: hops > 0 ? hops : false, http: { maxHeaderSize: 128 * 1024 } });
  await app.register(cors, { origin: true });
  // List snapshots are large, repetitive JSON: permessage-deflate shrinks them ~10x. Every deflate job
  // shares ws's process-wide queue (concurrencyLimit), so only frames over `threshold` are compressed:
  // pongs, acks, fills, orders, balances, trades and candles skip the queue. ws applies the threshold
  // only with server_no_context_takeover (otherwise it deflates every frame, however small).
  // Subscriptions may carry a whole blacklist in their filters (up to 2 x 500 addresses per list).
  await app.register(websocket, {
    options: {
      maxPayload: 256 * 1024,
      perMessageDeflate: { threshold: 16 * 1024, serverNoContextTakeover: true, zlibDeflateOptions: { level: 3 }, concurrencyLimit: 4 },
    },
  });
  const headers = securityHeaders(config.webDist);
  app.addHook('onRequest', async (_req, reply) => {
    reply.headers(headers);
  });
  installIpLimit(app, ['/api/auth/guest', '/api/auth/register'], config.accountCreationsPerIpPer10Min, 'too many new accounts from this address');
  installIpLimit(app, ['/api/auth/login'], config.loginAttemptsPerIpPer10Min, 'too many sign-in attempts from this address');

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    const status = (err as { statusCode?: number }).statusCode;
    const message = err instanceof Error ? err.message : 'request failed';
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: message });
    console.error('[app] unhandled error', err);
    return reply.status(500).send({ error: 'internal error' });
  });

  // Sockets count against their client IP (behind a remote proxy set TRUST_PROXY, or every user shares
  // the proxy's IP); loopback peers (local dev proxy, same-host reverse proxy, tests) are not capped.
  app.get('/ws', { websocket: true }, (socket, req) => {
    hub.attach(socket, connectionCapAddress(req.ip, req.socket.remoteAddress));
  });

  app.get('/api/health', async () => ({ ok: true, now: world.now, tokens: world.tokens.size, clients: hub.clientCount, tps: engine.tps }));

  app.get('/api/meta', async (): Promise<MetaResponse> => buildMeta(ctx));

  await registerMarketRoutes(app, ctx);
  await registerAccountRoutes(app, ctx);
  await registerTradingRoutes(app, ctx);

  // `market` channel: chain-level info every 5s.
  hub.register('market', {
    onSubscribe(sub) {
      // pushes go to the exact name only: a `market:<x>` subscription would never hear again
      if (sub.ch !== 'market') throw new Error('invalid channel (market)');
      hub.send(sub, 'market', buildMeta(ctx).chains);
    },
  });
  engine.addTicker('market-channel', () => hub.publish('market', 'market', buildMeta(ctx).chains), { everyMs: 5000 });

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) return reply.status(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  // Section order is write order: analytics (derived, and the bulk of the file) goes last.
  const capture = (): Snapshot => ({
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    world: world.serialize(),
    market: market.serialize(),
    accounts: ctx.accounts.serialize(),
    trading: ctx.trading.serialize(),
    analytics: ctx.analytics.serialize(),
  });
  const save = () => {
    if (!persist) return;
    try {
      saveSnapshot(config.dataDir, capture());
    } catch (err) {
      console.error('[app] snapshot failed', err);
    }
  };
  // The captured state references live objects: hold the sim while the ledger and everything that
  // refers to it (world, market, accounts, trading) is written, so those slices agree (only user actions
  // in those seconds can still land in between). Analytics is derived rolling state: the sim runs again
  // while it is written, so live streams and order triggers stall only for the ledger part (the engine
  // then catches up in tick-sized steps), and its drift of a few trades heals with the next ones.
  let saving: Promise<void> | null = null;
  let closed = false;
  const saveInBackground = (): Promise<void> => {
    if (!persist || closed) return Promise.resolve();
    if (saving) return saving;
    const release = engine.hold();
    saving = saveSnapshotAsync(config.dataDir, capture(), (section) => {
      if (section === 'analytics') release();
    })
      .catch((err) => console.error('[app] snapshot failed', err))
      .finally(() => {
        release();
        saving = null;
      });
    return saving;
  };

  let snapTimer: NodeJS.Timeout | null = null;
  let stopHeartbeat: (() => void) | null = null;
  if (opts.start ?? true) {
    // Build the leaderboards (seconds of work in a big world) before the port opens, not on the first
    // live tick, when reconnecting clients resubscribe; the ticker keeps them fresh in time slices.
    analytics.wallets.refreshLeaderboards();
    engine.start();
    stopHeartbeat = hub.startHeartbeat();
    if (persist && config.snapshotEveryMs > 0) {
      snapTimer = setInterval(() => void saveInBackground(), config.snapshotEveryMs);
      snapTimer.unref?.();
    }
  }

  return {
    app,
    ctx,
    market,
    save,
    saveInBackground,
    async close() {
      closed = true;
      if (snapTimer) clearInterval(snapTimer);
      stopHeartbeat?.();
      engine.stop();
      if (saving) await saving;
      save();
      await app.close();
    },
  };
}

/**
 * Security headers for every response (API and the served SPA). The CSP fits the Vite build: its
 * own module scripts plus the inline scripts of the built index.html (by hash, e.g. the theme
 * bootstrap), Google Fonts for Inter / JetBrains Mono, inline styles (style attributes in
 * component and chart markup), data:/blob: images (avatars, share cards) and same-origin or
 * ws(s) connections; nothing may frame the app.
 */
export function securityHeaders(webDist: string | null): Record<string, string> {
  const scriptSrc = ["'self'", ...inlineScriptHashes(webDist)];
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

/** CSP hashes ('sha256-...') of the inline <script> blocks in the built index.html. */
function inlineScriptHashes(webDist: string | null): string[] {
  const file = webDist ? join(webDist, 'index.html') : null;
  if (!file || !existsSync(file)) return [];
  const html = readFileSync(file, 'utf8');
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].trim()) hashes.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return hashes;
}

function isLoopback(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
}

/**
 * The address a WebSocket counts against for the per-IP cap, or null for an uncapped local client. Both
 * the client address and the transport peer must be loopback: a remote client claiming 127.0.0.1 in
 * X-Forwarded-For (TRUST_PROXY on, port reachable directly) is still capped.
 */
export function connectionCapAddress(clientIp: string, peerIp: string | undefined): string | null {
  return isLoopback(clientIp) && isLoopback(peerIp ?? '') ? null : clientIp;
}

/** TRUST_PROXY: `1` / `true` trusts the one proxy in front, `N` a chain of N proxies; anything else is off. */
function proxyHops(raw: string | undefined): number {
  if (raw === 'true') return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Cap unauthenticated POST endpoints per client IP per 10 minutes (set TRUST_PROXY behind a proxy,
 * or every user shares the proxy's IP): guest and register each add wallets to the world, and every
 * login runs a password hash, whether or not the username exists.
 */
function installIpLimit(app: FastifyInstance, routes: string[], perWindow: number, what: string): void {
  if (perWindow <= 0) return;
  const WINDOW_MS = 10 * 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const limited = new Set(routes);
  app.addHook('onRequest', async (req, reply) => {
    // Match the route the router resolved, not the raw URL: any spelling that reaches the
    // handlers (percent-encoded letters, e.g. /api/auth/gues%74) must count too.
    if (req.method !== 'POST' || !limited.has(req.routeOptions.url ?? '')) return;
    const now = Date.now();
    if (hits.size > 10_000) for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
    let h = hits.get(req.ip);
    if (!h || h.resetAt <= now) hits.set(req.ip, (h = { count: 0, resetAt: now + WINDOW_MS }));
    if (++h.count > perWindow) {
      const retry = Math.ceil((h.resetAt - now) / 1000);
      return reply.status(429).header('retry-after', String(retry)).send({ error: `${what}, try again in ${retry}s`, code: 'rate_limited' });
    }
  });
}

export function buildMeta(ctx: AppContext): MetaResponse {
  const { world, engine } = ctx;
  return {
    serverTime: world.now,
    platformFeeRate: PLATFORM_FEE_RATE,
    chains: CHAIN_IDS.map((id) => {
      const c = world.chains[id];
      let volume24hUsd = 0;
      let tracked = 0;
      for (const addr of world.tokensByChain[id]) {
        const t = world.tokens.get(addr);
        if (!t || t.dormant) continue;
        tracked++;
        volume24hUsd += (t.cache.volume24hUsd as number | undefined) ?? 0;
      }
      return {
        chain: id,
        nativeUsd: c.nativeUsd,
        nativeChange24h: c.nativeUsdOpen24h > 0 ? c.nativeUsd / c.nativeUsdOpen24h - 1 : 0,
        priorityFee: priorityFeeTiers(id, c.congestion),
        tokensTracked: tracked,
        launches1h: c.launches.length,
        migrations1h: c.migrations.length,
        volume24hUsd,
        congestion: congestionOf(c.congestion),
      };
    }),
    launchpads: LAUNCHPADS.map((l) => ({ id: l.id, chain: l.chain, name: l.name, color: l.color })),
    sim: { seed: world.seed, startedAt: world.startedAt, speed: 1, tradesPerSecond: engine.tps },
  };
}
