// DEV / TEST TOOL ONLY: a local stand-in for the PumpPortal data feed
// (wss://pumpportal.fun/api/data), so live mode can be booted and exercised
// without network access. It speaks the same subscribe protocol and emits
// frames in the recorded PumpPortal format (see src/live/feed/messages.ts and
// test/fixtures/pumpportal/*.json). It is NOT market data: every token, wallet
// and signature it emits is made up, and none of them exist on-chain.
//
//   subscribeNewToken / subscribeMigration                 -> acks, then create / migrate frames
//   subscribeTokenTrade / subscribeAccountTrade { keys }   -> acks, then buy / sell frames of those
//                                                             mints / trader wallets
//   unsubscribeTokenTrade / unsubscribeAccountTrade { keys }
//
// Synthesized mode (default): launches pump.fun-style tokens on a constant-product
// virtual curve (30 SOL / 1.073B tokens, 793.1M sold on the curve), trades them
// with a pool of made-up wallets, migrates the ones whose curve completes and
// keeps trading them as PumpSwap ('pump-amm') trades. Replay mode (--replay)
// sends the frames of a recorded JSON array (e.g. test/fixtures/pumpportal/lifecycle.json)
// in order, one per interval, to the subscribers each frame matches.
//
// Usage (from apps/server):
//   npx tsx scripts/fake-pumpportal.ts [--port 0] [--host 127.0.0.1] [--interval 1000] [--seed dev]
//        [--max-tokens 12] [--wallet <address>]... [--no-uri] [--require-api-key] [--replay <file.json>]
// then start the server with PUMPPORTAL_WS_URL=ws://127.0.0.1:<port>/api/data (MODE=live).
// The first stdout line is `[fake-pumpportal] listening on ws://<host>:<port>/api/data`.

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import bs58 from 'bs58';
import { WebSocketServer, type WebSocket } from 'ws';

export interface FakePumpPortalOptions {
  port?: number;
  host?: string;
  /** Milliseconds between ticks (each tick may launch a token and emits a few trades). */
  intervalMs?: number;
  /** Seed of the deterministic generator. */
  seed?: string;
  /** Tokens kept trading at once (synthesized mode). */
  maxTokens?: number;
  /** Wallet addresses that trade alongside the made-up ones (e.g. a followed wallet). */
  wallets?: string[];
  /** Emit create frames without a metadata uri (avoids metadata fetches entirely). */
  noUri?: boolean;
  /** Refuse token / account trade subscriptions unless the URL carries ?api-key= (as the real feed is reported to). */
  requireApiKey?: boolean;
  /** Replay these recorded frames instead of synthesizing a market. */
  replay?: unknown[];
  /** Log subscriptions to stderr. */
  verbose?: boolean;
}

export interface FakePumpPortal {
  url: string;
  port: number;
  /** Frames sent so far, by txType ('create', 'buy', 'sell', 'migrate'). */
  stats(): Record<string, number>;
  /** Emit one tick now (tests drive the feed without waiting for the timer). */
  tick(): void;
  /** Send one hand-written frame to the subscribers it matches (tests). */
  emit(frame: Record<string, unknown>): void;
  /** Mints the synthesized market currently trades (tests). */
  activeMints(): string[];
  /** Connected clients subscribed to a mint's or a wallet's trades (tests). */
  subscribers(key: string): number;
  close(): Promise<void>;
}

// pump.fun curve constants (LIVE_LAUNCHPADS 'pump'): virtual reserves at launch and the curve's sellable tokens.
const VIRTUAL_SOL = 30;
const VIRTUAL_TOKENS = 1_073_000_000;
const CURVE_TOKENS = 793_100_000;
const COMPLETE_AT_TOKENS = VIRTUAL_TOKENS - CURVE_TOKENS;
const SUPPLY = 1_000_000_000;

const NAMES = ['Ribbit', 'Moon', 'Pepe', 'Doge', 'Cat', 'Frog', 'Wojak', 'Giga', 'Chad', 'Bonk', 'Turbo', 'Based', 'Rocket', 'Goblin', 'Shiba', 'Penguin'];
const SUFFIXES = ['Coin', 'Inu', 'AI', 'Cult', 'Club', 'World', 'Classic', 'Mania', '2.0', 'Army'];

interface FakeToken {
  mint: string;
  curveKey: string;
  creator: string;
  /** Virtual reserves while on the curve; pool reserves after migration. */
  vSol: number;
  vTokens: number;
  migrated: boolean;
  /** Runners attract big buys and complete their curve; duds fade. */
  runner: boolean;
  trades: number;
  balances: Map<string, number>;
}

interface Client {
  socket: WebSocket;
  hasKey: boolean;
  newTokens: boolean;
  migrations: boolean;
  tokens: Set<string>;
  accounts: Set<string>;
}

/** mulberry32 seeded from a string: reproducible feeds for tests. */
function rngFrom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export async function startFakePumpPortal(opts: FakePumpPortalOptions = {}): Promise<FakePumpPortal> {
  const rand = rngFrom(opts.seed ?? 'fake-pumpportal');
  const bytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));
  const address = () => bs58.encode(bytes(32));
  const signature = () => bs58.encode(bytes(64));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const traders = [...Array.from({ length: 40 }, address), ...(opts.wallets ?? [])];
  const maxTokens = Math.max(1, opts.maxTokens ?? 12);
  const tokens: FakeToken[] = [];
  const clients = new Set<Client>();
  const counts: Record<string, number> = {};
  const replay = opts.replay ? [...opts.replay] : null;

  const wss = new WebSocketServer({ port: opts.port ?? 0, host: opts.host ?? '127.0.0.1', path: '/api/data' });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const port = (wss.address() as AddressInfo).port;
  const log = (msg: string) => opts.verbose && console.error(`[fake-pumpportal] ${msg}`);

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const client: Client = { socket, hasKey: !!url.searchParams.get('api-key'), newTokens: false, migrations: false, tokens: new Set(), accounts: new Set() };
    clients.add(client);
    socket.on('close', () => clients.delete(client));
    socket.on('message', (raw) => {
      let msg: { method?: unknown; keys?: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        socket.send(JSON.stringify({ errors: 'Invalid message. Message must be valid JSON.' }));
        return;
      }
      const keys = Array.isArray(msg.keys) ? msg.keys.filter((k): k is string => typeof k === 'string') : null;
      const needsKeys = (what: string) => {
        if (!keys) {
          socket.send(JSON.stringify({ errors: `Invalid message. Message must contain parameter 'keys' which should be an array of strings.` }));
          return true;
        }
        if (opts.requireApiKey && !client.hasKey && what.startsWith('subscribe')) {
          socket.send(JSON.stringify({ message: 'Please use an API key funded with at least 0.02 SOL to subscribe to trade data.' }));
          return true;
        }
        return false;
      };
      switch (msg.method) {
        case 'subscribeNewToken':
          client.newTokens = true;
          socket.send(JSON.stringify({ message: 'Successfully subscribed to token creation events.' }));
          break;
        case 'subscribeMigration':
          client.migrations = true;
          socket.send(JSON.stringify({ message: 'Successfully subscribed to migration events.' }));
          break;
        case 'subscribeTokenTrade':
          if (needsKeys('subscribe')) return;
          for (const k of keys!) client.tokens.add(k);
          log(`token trades +${keys!.length} (${client.tokens.size})`);
          socket.send(JSON.stringify({ message: 'Successfully subscribed to keys.' }));
          break;
        case 'subscribeAccountTrade':
          if (needsKeys('subscribe')) return;
          for (const k of keys!) client.accounts.add(k);
          log(`account trades +${keys!.length} (${client.accounts.size})`);
          socket.send(JSON.stringify({ message: 'Successfully subscribed to keys.' }));
          break;
        case 'unsubscribeTokenTrade':
          if (needsKeys('unsubscribe')) return;
          for (const k of keys!) client.tokens.delete(k);
          socket.send(JSON.stringify({ message: 'Unsubscribed from keys.' }));
          break;
        case 'unsubscribeAccountTrade':
          if (needsKeys('unsubscribe')) return;
          for (const k of keys!) client.accounts.delete(k);
          socket.send(JSON.stringify({ message: 'Unsubscribed from keys.' }));
          break;
        case 'unsubscribeNewToken':
          client.newTokens = false;
          socket.send(JSON.stringify({ message: 'Unsubscribed from token creation events.' }));
          break;
        case 'unsubscribeMigration':
          client.migrations = false;
          socket.send(JSON.stringify({ message: 'Unsubscribed from migration events.' }));
          break;
        default:
          socket.send(JSON.stringify({ errors: 'Invalid message. Unknown method.' }));
      }
    });
  });

  /** Send a frame to every client whose subscriptions match it (as the real feed routes them). */
  const emit = (frame: Record<string, unknown>) => {
    const type = String(frame.txType ?? 'other');
    const text = JSON.stringify(frame);
    let delivered = false;
    for (const c of clients) {
      const match =
        type === 'create'
          ? c.newTokens
          : type === 'migrate'
            ? c.migrations
            : (c.tokens.has(String(frame.mint)) || c.accounts.has(String(frame.traderPublicKey))) && (!opts.requireApiKey || c.hasKey);
      if (match && c.socket.readyState === c.socket.OPEN) {
        c.socket.send(text);
        delivered = true;
      }
    }
    if (delivered || type === 'create' || type === 'migrate') counts[type] = (counts[type] ?? 0) + 1;
  };

  const marketCapSol = (t: FakeToken) => round((t.vSol / t.vTokens) * SUPPLY, 9);

  const launch = () => {
    const t: FakeToken = {
      mint: address(),
      curveKey: address(),
      creator: pick(traders),
      vSol: VIRTUAL_SOL,
      vTokens: VIRTUAL_TOKENS,
      migrated: false,
      runner: rand() < 0.3,
      trades: 0,
      balances: new Map(),
    };
    // The creator's initial buy happens in the creation transaction (0 for some launches).
    const initialSol = rand() < 0.2 ? 0 : round(0.2 + rand() * 2.8, 9);
    const k = t.vSol * t.vTokens;
    const bought = initialSol > 0 ? t.vTokens - k / (t.vSol + initialSol) : 0;
    t.vSol += initialSol;
    t.vTokens -= bought;
    if (bought > 0) t.balances.set(t.creator, bought);
    tokens.push(t);
    const name = `${pick(NAMES)} ${pick(SUFFIXES)}`;
    emit({
      signature: signature(),
      mint: t.mint,
      traderPublicKey: t.creator,
      txType: 'create',
      initialBuy: round(bought, 6),
      solAmount: initialSol,
      bondingCurveKey: t.curveKey,
      vTokensInBondingCurve: round(t.vTokens, 6),
      vSolInBondingCurve: round(t.vSol, 9),
      marketCapSol: marketCapSol(t),
      name,
      symbol: name.split(' ')[0].toUpperCase().slice(0, 10),
      uri: opts.noUri ? '' : `ipfs://${bs58.encode(Uint8Array.of(0x12, 0x20, ...bytes(32)))}`,
      pool: 'pump',
    });
  };

  const trade = (t: FakeToken) => {
    const holders = [...t.balances.entries()].filter(([, b]) => b > 1);
    const sell = holders.length > 0 && rand() < (t.runner && !t.migrated ? 0.25 : 0.45);
    const k = t.vSol * t.vTokens;
    let trader: string;
    let solAmount: number;
    let tokenAmount: number;
    if (sell) {
      const [who, held] = pick(holders);
      trader = who;
      tokenAmount = rand() < 0.3 ? held : held * (0.2 + rand() * 0.6);
      solAmount = t.vSol - k / (t.vTokens + tokenAmount);
      t.vSol -= solAmount;
      t.vTokens += tokenAmount;
      t.balances.set(who, held - tokenAmount);
    } else {
      trader = pick(traders);
      solAmount = t.runner ? 1 + rand() * 7 : 0.05 + rand() * 1.5;
      tokenAmount = t.vTokens - k / (t.vSol + solAmount);
      // A buy that would take more than the curve has left only gets what is left (the curve completes).
      if (!t.migrated && t.vTokens - tokenAmount < COMPLETE_AT_TOKENS) {
        tokenAmount = t.vTokens - COMPLETE_AT_TOKENS;
        solAmount = k / (t.vTokens - tokenAmount) - t.vSol;
      }
      t.vSol += solAmount;
      t.vTokens -= tokenAmount;
      t.balances.set(trader, (t.balances.get(trader) ?? 0) + tokenAmount);
    }
    t.trades++;
    const frame: Record<string, unknown> = {
      signature: signature(),
      mint: t.mint,
      traderPublicKey: trader,
      txType: sell ? 'sell' : 'buy',
      tokenAmount: round(tokenAmount, 6),
      solAmount: round(solAmount, 9),
      newTokenBalance: round(t.balances.get(trader) ?? 0, 6),
    };
    if (t.migrated) {
      // PumpSwap trades as the recorded format has them: no reserves, a market cap.
      Object.assign(frame, { marketCapSol: marketCapSol(t), pool: 'pump-amm' });
    } else {
      Object.assign(frame, {
        bondingCurveKey: t.curveKey,
        vTokensInBondingCurve: round(t.vTokens, 6),
        vSolInBondingCurve: round(t.vSol, 9),
        marketCapSol: marketCapSol(t),
        pool: 'pump',
      });
    }
    emit(frame);
    if (!t.migrated && t.vTokens <= COMPLETE_AT_TOKENS + 1e-6) {
      // Curve complete: the real SOL and the unsold tokens move to the PumpSwap pool.
      t.migrated = true;
      t.vSol -= VIRTUAL_SOL;
      t.vTokens = SUPPLY - CURVE_TOKENS;
      emit({ signature: signature(), mint: t.mint, txType: 'migrate', pool: 'pump-amm' });
    }
  };

  const tick = () => {
    if (replay) {
      // A recording is finite: hold it until a client has subscribed to something.
      if (![...clients].some((c) => c.newTokens || c.migrations || c.tokens.size || c.accounts.size)) return;
      const frame = replay.shift();
      if (frame && typeof frame === 'object') emit(frame as Record<string, unknown>);
      return;
    }
    // Launches keep coming (about one every three ticks); the oldest token leaves the rotation when it is full.
    if (tokens.length === 0 || rand() < 0.35) launch();
    if (tokens.length > maxTokens) {
      const dud = tokens.findIndex((t) => !t.runner);
      tokens.splice(dud >= 0 ? dud : 0, 1);
    }
    for (let i = 0; i < 3 && tokens.length; i++) trade(pick(tokens));
    // Duds fade out of the rotation; runners stay a while after migrating.
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if ((!t.runner && t.trades > 25) || t.trades > 120) tokens.splice(i, 1);
    }
  };

  const timer = setInterval(tick, Math.max(10, opts.intervalMs ?? 1000));
  timer.unref?.();

  return {
    url: `ws://${opts.host ?? '127.0.0.1'}:${port}/api/data`,
    port,
    stats: () => ({ ...counts }),
    tick,
    emit,
    activeMints: () => tokens.map((t) => t.mint),
    subscribers: (key) => [...clients].filter((c) => c.tokens.has(key) || c.accounts.has(key)).length,
    async close() {
      clearInterval(timer);
      for (const c of clients) c.socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

function parseArgs(argv: string[]): FakePumpPortalOptions {
  const opts: FakePumpPortalOptions = { wallets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--port') opts.port = Number(next());
    else if (a === '--host') opts.host = next();
    else if (a === '--interval') opts.intervalMs = Number(next());
    else if (a === '--seed') opts.seed = next();
    else if (a === '--max-tokens') opts.maxTokens = Number(next());
    else if (a === '--wallet') opts.wallets!.push(next());
    else if (a === '--no-uri') opts.noUri = true;
    else if (a === '--require-api-key') opts.requireApiKey = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--replay') {
      const data = JSON.parse(readFileSync(next(), 'utf8')) as unknown;
      opts.replay = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    } else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

const USAGE = `fake-pumpportal: DEV/TEST ONLY local stand-in for wss://pumpportal.fun/api/data (synthetic data)
  --port <n>            listen port (default 0 = random; the bound URL is printed)
  --host <addr>         listen address (default 127.0.0.1)
  --interval <ms>       tick period (default 1000); a tick may launch a token and emits a few trades
  --seed <text>         generator seed (default fake-pumpportal)
  --max-tokens <n>      tokens trading at once (default 12)
  --wallet <address>    also trade from this wallet (repeatable), e.g. a followed or KOL wallet
  --no-uri              emit launches without a metadata uri
  --require-api-key     refuse trade subscriptions unless the URL has ?api-key=
  --replay <file.json>  replay recorded frames (array or object of frames) instead of synthesizing
  --verbose             log subscriptions to stderr
Point the server at it with MODE=live PUMPPORTAL_WS_URL=ws://127.0.0.1:<port>/api/data.`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }
  const feed = await startFakePumpPortal(parseArgs(process.argv.slice(2)));
  console.log(`[fake-pumpportal] listening on ${feed.url}`);
  console.log('[fake-pumpportal] DEV/TEST ONLY: synthetic tokens, wallets and signatures; nothing here exists on-chain');
  const stop = async () => {
    console.log(`[fake-pumpportal] stopping (sent ${JSON.stringify(feed.stats())})`);
    await feed.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  // Keep running: the tick timer is unref'd so tests that import this module can exit.
  setInterval(() => undefined, 1 << 30);
}
