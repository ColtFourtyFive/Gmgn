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
import { loadSnapshot, saveSnapshot, SNAPSHOT_VERSION, type Snapshot } from './persistence';
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
  /** Persist a snapshot now (no-op when persistence is disabled). */
  save(): void;
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
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
    accountCreationsPerIpPer10Min: Number(process.env.ACCOUNT_CREATIONS_PER_IP ?? 30),
    ...overrides,
  };
}

export async function buildApp(config: AppConfig, opts: { start?: boolean; persist?: boolean; logger?: boolean } = {}): Promise<BuiltApp> {
  const persist = opts.persist ?? config.snapshotEveryMs > 0;
  const snapshot = persist ? loadSnapshot(config.dataDir) : null;

  const world = snapshot ? World.restore(snapshot.world) : new World(config.seed);
  const engine = new Engine(world);
  const hub = new Hub();
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
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024, trustProxy: config.trustProxy, http: { maxHeaderSize: 128 * 1024 } });
  await app.register(cors, { origin: true });
  // List snapshots are large, repetitive JSON: permessage-deflate shrinks them ~10x. Subscriptions
  // may carry a whole blacklist in their filters (up to 2 x 500 addresses per list).
  await app.register(websocket, {
    options: { maxPayload: 256 * 1024, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 }, concurrencyLimit: 4 } },
  });
  const headers = securityHeaders(config.webDist);
  app.addHook('onRequest', async (_req, reply) => {
    reply.headers(headers);
  });
  installAccountCreationLimit(app, config.accountCreationsPerIpPer10Min);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    const status = (err as { statusCode?: number }).statusCode;
    const message = err instanceof Error ? err.message : 'request failed';
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: message });
    console.error('[app] unhandled error', err);
    return reply.status(500).send({ error: 'internal error' });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    hub.attach(socket);
  });

  app.get('/api/health', async () => ({ ok: true, now: world.now, tokens: world.tokens.size, clients: hub.clientCount, tps: engine.tps }));

  app.get('/api/meta', async (): Promise<MetaResponse> => buildMeta(ctx));

  await registerMarketRoutes(app, ctx);
  await registerAccountRoutes(app, ctx);
  await registerTradingRoutes(app, ctx);

  // `market` channel: chain-level info every 5s.
  hub.register('market', {
    onSubscribe(sub) {
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

  const save = () => {
    if (!persist) return;
    const snap: Snapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      world: world.serialize(),
      market: market.serialize(),
      accounts: ctx.accounts.serialize(),
      analytics: ctx.analytics.serialize(),
      trading: ctx.trading.serialize(),
    };
    try {
      saveSnapshot(config.dataDir, snap);
    } catch (err) {
      console.error('[app] snapshot failed', err);
    }
  };

  let snapTimer: NodeJS.Timeout | null = null;
  if (opts.start ?? true) {
    engine.start();
    if (persist && config.snapshotEveryMs > 0) {
      snapTimer = setInterval(save, config.snapshotEveryMs);
      snapTimer.unref?.();
    }
  }

  return {
    app,
    ctx,
    market,
    save,
    async close() {
      if (snapTimer) clearInterval(snapTimer);
      engine.stop();
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

/**
 * Guest and register endpoints need no auth and each new account adds wallets
 * to the world, so cap them per client IP (set TRUST_PROXY behind a proxy, or
 * every user shares the proxy's IP).
 */
function installAccountCreationLimit(app: FastifyInstance, perWindow: number): void {
  if (perWindow <= 0) return;
  const WINDOW_MS = 10 * 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const limited = new Set(['/api/auth/guest', '/api/auth/register']);
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'POST' || !limited.has(req.url.split('?')[0])) return;
    const now = Date.now();
    if (hits.size > 10_000) for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
    let h = hits.get(req.ip);
    if (!h || h.resetAt <= now) hits.set(req.ip, (h = { count: 0, resetAt: now + WINDOW_MS }));
    if (++h.count > perWindow) {
      const retry = Math.ceil((h.resetAt - now) / 1000);
      return reply.status(429).header('retry-after', String(retry)).send({ error: `too many new accounts from this address, try again in ${retry}s`, code: 'rate_limited' });
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
