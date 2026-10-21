// The program-log feed's moving parts, offline: the RPC WebSocket client against a
// local 'ws' server standing in for the Solana RPC (logsSubscribe per program at
// confirmed, failed transactions skipped, a transaction of both subscriptions
// passed once, refusals, reconnect + resubscribe, slot gaps, silence), the source
// (trade filtering, pool lookups for watched wallets, truncated logs read back
// from the transaction), the gap catch-up over a fake RPC, and LiveMarket with
// LIVE_SOLANA_SOURCES=logs booking real mainnet transactions into the World.
// Frames are real mainnet notifications (fixtures/solana-logs/stream.json).

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageAccountKeys, PublicKey, type Connection } from '@solana/web3.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { loadLiveConfig, parseSolanaSources } from '../src/live/config';
import { pumpPoolAddress } from '../src/live/enrich/onchain';
import type { FeedEvent, MigrateEvent, TradeEvent } from '../src/live/feed/messages';
import { catchUpGap, readTransactionEvents } from '../src/live/feed/solana/catchup';
import { endpointHost, ProgramLogClient, type LogNotification, type ProgramLogClientOptions, type SlotGap } from '../src/live/feed/solana/client';
import { decodeProgramLogs, PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID } from '../src/live/feed/solana/events';
import type { PoolInfo } from '../src/live/feed/solana/map';
import { SolanaLogSource, type SolanaLogSourceOptions } from '../src/live/feed/solana/source';
import type { LiveMarket } from '../src/live/market';

interface LogTx {
  case?: string;
  signature: string;
  slot: number;
  err: unknown;
  logs: string[];
}
interface RawTx {
  slot: number;
  meta: { err: unknown; innerInstructions: { index: number; instructions: { programIdIndex: number; data: string }[] }[]; loadedAddresses?: { writable: string[]; readonly: string[] }; logMessages: string[] };
  transaction: { message: { accountKeys: string[] } };
}

const DIR = join(__dirname, 'fixtures', 'solana-logs');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T;
/** 200 consecutive mainnet notifications, as received (both subscriptions, failed ones included). */
const stream = load<string[]>('stream.json');
const cases = load<LogTx[]>('events.json');
const parity = load<LogTx[]>('parity.json');
const pools = load<Record<string, PoolInfo | null>>('pools.json');
const rawTxs = load<Record<string, RawTx>>('transactions.json');
const curveTrades = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pumpportal', 'curve-trades.json'), 'utf8')) as Record<string, unknown>[];
const one = (name: string): LogTx => cases.find((c) => c.case === name)!;
const bySig = (prefix: string): LogTx => parity.find((t) => t.signature.startsWith(prefix))!;
const quiet = { warn: () => {}, info: () => {} };

/** A getTransaction response as web3.js returns it, from a raw json-encoded result. */
function txResponse(raw: RawTx) {
  const keys = raw.transaction.message.accountKeys.map((k) => new PublicKey(k));
  const lookups = { writable: (raw.meta.loadedAddresses?.writable ?? []).map((k) => new PublicKey(k)), readonly: (raw.meta.loadedAddresses?.readonly ?? []).map((k) => new PublicKey(k)) };
  return { slot: raw.slot, meta: { ...raw.meta, loadedAddresses: lookups }, transaction: { message: { getAccountKeys: () => new MessageAccountKeys(keys, lookups) } } };
}

const notification = (tx: { signature: string; slot: number; logs: string[]; err?: unknown }, subscription = 1) =>
  JSON.stringify({ jsonrpc: '2.0', method: 'logsNotification', params: { result: { context: { slot: tx.slot }, value: { signature: tx.signature, err: tx.err ?? null, logs: tx.logs } }, subscription } });

// ---- fake Solana RPC WebSocket ------------------------------------------------

interface FakeRpc {
  wss: WebSocketServer;
  url: string;
  sockets: WebSocket[];
  requests: { id: number; method: string; params: unknown[] }[];
  /** Answer a logsSubscribe (default: a subscription id). */
  answer: (req: { id: number; params: unknown[] }) => unknown;
}

const servers: WebSocketServer[] = [];
const clients: { stop(): Promise<void> }[] = [];

async function fakeRpc(opts: { autoPong?: boolean } = {}): Promise<FakeRpc> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', autoPong: opts.autoPong ?? true });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  servers.push(wss);
  let nextSub = 100;
  const rpc: FakeRpc = {
    wss,
    url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/?api-key=SECRET-KEY`,
    sockets: [],
    requests: [],
    answer: (req) => ({ jsonrpc: '2.0', result: nextSub++, id: req.id }),
  };
  wss.on('connection', (ws) => {
    rpc.sockets.push(ws);
    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw)) as { id: number; method: string; params: unknown[] };
      rpc.requests.push(req);
      ws.send(JSON.stringify(rpc.answer(req)));
    });
  });
  return rpc;
}

function client(url: string, extra: Partial<ProgramLogClientOptions> = {}) {
  const txs: LogNotification[] = [];
  const gaps: SlotGap[] = [];
  const states: boolean[] = [];
  const warnings: string[] = [];
  const c = new ProgramLogClient({
    url,
    onTransaction: (tx) => txs.push(tx),
    onGap: (g) => gaps.push(g),
    onStatus: (s) => states.push(s),
    backoffBaseMs: 20,
    backoffMaxMs: 100,
    log: { warn: (m: string) => warnings.push(m), info: () => {} },
    ...extra,
  });
  clients.push(c);
  return { c, txs, gaps, states, warnings };
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.stop()));
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          for (const ws of s.clients) ws.terminate();
          s.close(() => resolve());
        }),
    ),
  );
});

describe('program-log client (fake RPC WebSocket)', () => {
  it('subscribes to pump.fun and PumpSwap logs at confirmed and is connected once both are acknowledged', async () => {
    const rpc = await fakeRpc();
    const { c } = client(rpc.url);
    c.start();
    await until(() => c.connected);
    expect(rpc.requests.map((r) => [r.method, r.params])).toEqual([
      ['logsSubscribe', [{ mentions: [PUMP_PROGRAM_ID] }, { commitment: 'confirmed' }]],
      ['logsSubscribe', [{ mentions: [PUMP_AMM_PROGRAM_ID] }, { commitment: 'confirmed' }]],
    ]);
    expect([...c.state.values()]).toEqual(['active', 'active']);
    expect(c.host).toBe(endpointHost(rpc.url));
    expect(c.host).not.toContain('SECRET');
  });

  it('replays 200 real notifications: failed transactions skipped, one passed on per signature', async () => {
    const rpc = await fakeRpc();
    const { c, txs } = client(rpc.url);
    c.start();
    await until(() => c.connected);
    for (const f of stream) rpc.sockets[0].send(f);
    const frames = stream.map((f) => JSON.parse(f) as { params: { result: { context: { slot: number }; value: { signature: string; err: unknown } } } });
    const ok = frames.filter((f) => f.params.result.value.err === null);
    const unique = new Set(ok.map((f) => f.params.result.value.signature));
    await until(() => c.stats.notifications === stream.length);
    expect(c.stats.failed).toBe(frames.length - ok.length);
    expect(c.stats.failed).toBeGreaterThan(100); // most of pump's traffic is bots' failed transactions
    expect(c.stats.transactions).toBe(unique.size);
    expect(c.stats.duplicates).toBe(ok.length - unique.size);
    expect(c.stats.duplicates).toBeGreaterThan(0); // transactions mentioning both programs
    expect(txs.map((t) => t.signature)).toEqual([...unique]);
    expect(c.lastSlot).toBe(frames[0].params.result.context.slot);
    // garbage never throws
    rpc.sockets[0].send('not json');
    rpc.sockets[0].send(JSON.stringify({ jsonrpc: '2.0', method: 'logsNotification', params: { result: { value: {} } } }));
    await until(() => c.stats.malformed === 2);
  });

  it('reports a refused subscription (the RPC does not offer logsSubscribe) and is not connected', async () => {
    const rpc = await fakeRpc();
    rpc.answer = (req) => (req.id === 1 ? { jsonrpc: '2.0', error: { code: 35, message: 'method is not available on free plan' }, id: req.id } : { jsonrpc: '2.0', result: 7, id: req.id });
    const { c, warnings } = client(rpc.url);
    c.start();
    await until(() => c.stats.refusals === 1 && c.state.get(PUMP_AMM_PROGRAM_ID) === 'active');
    expect(c.state.get(PUMP_PROGRAM_ID)).toBe('refused');
    expect(c.connected).toBe(false);
    expect(c.stats.lastRefusal).toBe('pump: method is not available on free plan (35)');
    expect(warnings.join('\n')).not.toContain('SECRET-KEY');
  });

  it('reconnects with backoff after a drop, resubscribes, and reports the slots in between as a gap', async () => {
    const rpc = await fakeRpc();
    const { c, gaps, txs } = client(rpc.url);
    c.start();
    await until(() => c.connected);
    const [a, b] = parity;
    rpc.sockets[0].send(notification({ ...a, slot: 1000 }));
    await until(() => txs.length === 1);
    rpc.sockets[0].terminate();
    await until(() => rpc.sockets.length === 2 && c.connected);
    expect(rpc.requests.filter((r) => r.method === 'logsSubscribe')).toHaveLength(4);
    expect(c.stats.disconnects).toBe(1);
    rpc.sockets[1].send(notification({ ...b, slot: 1012 }));
    await until(() => gaps.length === 1);
    expect(gaps[0]).toMatchObject({ fromSlot: 1000, toSlot: 1012 });
    expect(c.stats).toMatchObject({ gaps: 1, gapSlots: 13 });
    // a transaction already seen before the drop is not passed on again
    rpc.sockets[1].send(notification({ ...a, slot: 1000 }));
    rpc.sockets[1].send(notification({ ...b, slot: 1013 }));
    await until(() => c.stats.duplicates === 2);
    expect(txs).toHaveLength(2);
    expect(c.backoffDelay(0)).toBeLessThanOrEqual(20);
    expect(c.backoffDelay(10)).toBeLessThanOrEqual(100);
  });

  it('treats a silent connection as dead (no data, no pong) and reconnects', async () => {
    const rpc = await fakeRpc({ autoPong: false });
    const { c } = client(rpc.url, { pingEveryMs: 30, staleMs: 120 });
    c.start();
    await until(() => rpc.sockets.length >= 2, 4000);
    expect(c.stats.disconnects).toBeGreaterThanOrEqual(1);
  });

  it('reconnects when the subscriptions are acknowledged but deliver nothing (pongs alone do not count)', async () => {
    const rpc = await fakeRpc();
    const { c } = client(rpc.url, { pingEveryMs: 30, staleMs: 2000, silentMs: 150 });
    c.start();
    await until(() => c.connected);
    await until(() => !c.connected, 2000);
    await until(() => rpc.sockets.length >= 2 && c.stats.silent >= 1, 4000);
    // the new connection subscribes again
    await until(() => rpc.requests.filter((r) => r.method === 'logsSubscribe').length >= 4);
  });
});

// ---- source -------------------------------------------------------------------

function source(extra: Partial<SolanaLogSourceOptions> = {}) {
  const emitted: { events: FeedEvent[]; origin: string }[] = [];
  const s = new SolanaLogSource({
    url: 'ws://127.0.0.1:9/unused',
    emit: (events, _facts, origin) => emitted.push({ events, origin }),
    wantsTrade: () => true,
    poolInfo: (p) => pools[p] ?? null,
    canonicalPool: pumpPoolAddress,
    log: quiet,
    ...extra,
  });
  const flat = () => emitted.flatMap((e) => e.events);
  return { s, emitted, flat };
}

describe('program-log source', () => {
  it('books trades only where wanted, but always launches, migrations and the trades bundled with a launch', () => {
    const { s, flat } = source({ wantsTrade: () => false });
    for (const name of ['curve-sell', 'curve-buy_exact_sol_in', 'create-sol-nobuy', 'migration']) s.processTransaction(one(name), 'stream');
    // a launch transaction with other wallets' buys in it (the lifecycle's bundle: create + dev buy)
    s.processTransaction(bySig('gRkwSm'), 'stream');
    expect(flat().map((e) => e.kind)).toEqual(['create', 'migrate', 'create']);
    expect(s.stats.filtered).toBe(2);
    expect(s.stats.emitted).toEqual({ creates: 2, trades: 0, migrations: 1 });
    expect(s.stats.decoded['pump.TradeEvent']).toBe(3);
    expect(s.health().eventsPerSecByType['pump.TradeEvent']).toBeUndefined(); // rates count whole seconds only
  });

  it('reads a truncated transaction back whole: the bundle\'s 5 trades instead of the 3 its logs kept', async () => {
    const bundle = bySig('4MePUx');
    const partial = source();
    partial.s.processTransaction(bundle, 'stream');
    expect(partial.flat()).toHaveLength(3);
    const conn = { getTransaction: async (sig: string) => txResponse(rawTxs[sig]) } as unknown as Connection;
    const whole = source({ readTransaction: (sig) => readTransactionEvents(conn, sig, (fn) => fn()) });
    whole.s.processTransaction(bundle, 'stream');
    await until(() => whole.flat().length > 0);
    expect(whole.flat()).toHaveLength(5);
    expect(new Set(whole.flat().map((e) => (e as TradeEvent).trader)).size).toBe(5);
    expect(whole.s.stats).toMatchObject({ truncated: 1, recovered: 1, recoveryFailed: 0 });
    // the read failing: the partial logs are used
    const failing = source({ readTransaction: async () => null });
    failing.s.processTransaction(bundle, 'stream');
    await until(() => failing.flat().length > 0);
    expect(failing.flat()).toHaveLength(3);
    expect(failing.s.stats.recoveryFailed).toBe(1);
  });

  it('looks up an unknown pool once when a watched wallet trades on it, then books the trade', async () => {
    const tx = one('amm-buy');
    const ammTrade = decodeProgramLogs(tx.logs).events.find((e) => e.type === 'ammTrade')!;
    if (ammTrade.type !== 'ammTrade') throw new Error('unreachable');
    const unknownPool = ammTrade.pool;
    expect(pools[unknownPool]).toBeNull();
    const resolved: string[] = [];
    const watchedSrc = source({
      poolInfo: () => null,
      isWatched: () => true,
      resolvePool: async (pool) => {
        resolved.push(pool);
        return { mint: 'Watched1111111111111111111111111111111111111', decimals: 6 };
      },
    });
    watchedSrc.s.processTransaction(tx, 'stream');
    watchedSrc.s.processTransaction(tx, 'stream');
    await until(() => watchedSrc.flat().length > 0);
    expect(resolved).toEqual([unknownPool]);
    expect(watchedSrc.flat()[0]).toMatchObject({ kind: 'trade', mint: 'Watched1111111111111111111111111111111111111', pool: 'pump-amm' });
    expect(watchedSrc.s.poolInfo(unknownPool)).toEqual({ mint: 'Watched1111111111111111111111111111111111111', decimals: 6 });
    // nobody watching: no lookup, counted
    const plain = source({ poolInfo: () => null, isWatched: () => false, resolvePool: async () => null });
    plain.s.processTransaction(tx, 'stream');
    expect(plain.s.stats.unresolvedPools).toBe(1);
    expect(plain.s.stats.poolLookups.started).toBe(0);
  });

  it('learns a migrated coin\'s canonical pool from the migration (its later pool trades then map to the mint)', () => {
    const { s, flat } = source({ poolInfo: () => null });
    s.processTransaction(one('migration'), 'stream');
    const mig = flat().find((e): e is MigrateEvent => e.kind === 'migrate')!;
    expect(mig.poolAddress).toBe(pumpPoolAddress(mig.mint));
    expect(s.poolInfo(mig.poolAddress!)).toEqual({ mint: mig.mint, decimals: 6 });
  });

  it('never throws on a broken transaction (a per-message guard)', () => {
    const { s } = source({
      wantsTrade: () => {
        throw new Error('boom');
      },
    });
    expect(() => s.processTransaction(one('curve-sell'), 'stream')).not.toThrow();
    expect(s.stats.decodeErrors).toBe(1);
    expect(s.stats.lastDecodeError).toContain('boom');
  });
});

describe('gap catch-up (fake RPC)', () => {
  it('pages back through a mint\'s signatures to the gap, reads the missed transactions and skips the seen ones', async () => {
    const sigs = Object.keys(rawTxs).map((signature) => ({ signature, slot: rawTxs[signature].slot, err: null }));
    const calls: { limit?: number; before?: string }[] = [];
    const newer = Array.from({ length: 4 }, (_, i) => ({ signature: `newer${i}`, slot: 459354200 + i, err: null }));
    const all = [...newer.reverse(), ...sigs];
    const conn = {
      getSignaturesForAddress: async (_k: PublicKey, o: { limit?: number; before?: string }) => {
        calls.push(o);
        const from = o.before ? all.findIndex((s) => s.signature === o.before) + 1 : 0;
        return all.slice(from, from + (o.limit ?? 1000));
      },
      getTransaction: async (sig: string) => (rawTxs[sig] ? txResponse(rawTxs[sig]) : null),
    } as unknown as Connection;
    const seen = new Set([sigs[0].signature]);
    const r = await catchUpGap({ fromSlot: 459354088, toSlot: 459354100 }, ['7JFy6LQNL1FFreGt1caZPWoGKpJCtj4qC5Gs1o18pump'], { connection: conn, run: (fn) => fn(), seen: (s) => seen.has(s), signaturesPerAddress: 3 });
    // newest first: the first page holds only newer signatures, the next ones reach the gap
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1].before).toBeDefined();
    expect(r.missing).toBe(sigs.length - 1);
    expect(r.transactions.map((t) => t.signature)).toEqual(sigs.slice(1).map((s) => s.signature));
    expect(r.transactions.every((t) => t.decoded && t.decoded.truncated === false)).toBe(true);
    // replayed through the source: the event CPIs, not the truncated logs
    const { s, flat } = source();
    for (const t of r.transactions) s.processTransaction(t, 'catchup');
    expect(flat().filter((e) => e.kind === 'trade').length + flat().filter((e) => e.kind === 'migrate').length).toBeGreaterThanOrEqual(5);
  });
});

// ---- LiveMarket with LIVE_SOLANA_SOURCES=logs -----------------------------------

describe('LiveMarket on program logs', () => {
  let rpc: FakeRpc;
  let built: BuiltApp;
  let market: LiveMarket;
  let dir: string;

  beforeAll(async () => {
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }));
    rpc = await fakeRpc();
    servers.splice(servers.indexOf(rpc.wss), 1); // kept across this block's tests
    dir = mkdtempSync(join(tmpdir(), 'trenchscope-logs-'));
    const live = loadLiveConfig({ SOLANA_WS_URL: rpc.url, LIVE_SOLANA_SOURCES: 'logs', JUPITER_API_URL: 'http://jupiter.test' });
    built = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: live.problems, warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: true, persist: false });
    market = built.market as LiveMarket;
    built.ctx.world.setNativeUsd('sol', 200);
    await until(() => market.liveStatus().feedConnected, 5000);
  });

  afterAll(async () => {
    await built?.close();
    for (const ws of rpc.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => rpc.wss.close(() => resolve()));
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs on program logs alone (no PumpPortal socket) and reports the source in diagnostics', () => {
    const d = market.diagnostics();
    expect(d.sources.configured).toEqual(['logs']);
    expect(d.sources.logs).toMatchObject({ enabled: true, connected: true });
    expect(d.sources.logs!.detail.endpoint).toBe(endpointHost(rpc.url));
    expect(d.sources.pumpportal.enabled).toBe(false);
    expect(market.liveStatus().problems ?? []).toEqual([]);
  });

  it('books a real launch and its trades from mainnet logs into the World, with block times and slots', async () => {
    const sigs = [...new Set(curveTrades.map((f) => f.signature as string))];
    for (const sig of sigs) rpc.sockets[0].send(notification(parity.find((t) => t.signature === sig)!, 100));
    const mint = curveTrades[0].mint as string;
    const world = built.ctx.world;
    await until(() => (world.tokens.get(mint)?.trades.length ?? 0) === curveTrades.length, 5000);
    const t = world.tokens.get(mint)!;
    expect(t).toMatchObject({ launchpad: 'pump', symbol: 'COWL', status: 'curve' });
    expect(t.trades.every((x) => x.block >= 459353955)).toBe(true);
    // the curve walked back to its starting reserves, as on-chain
    expect(t.curve!.virtualTokens).toBeCloseTo(1_073_000_000, 0);
    const d = market.diagnostics();
    expect(d.sources.logs!.detail.stats.emitted.trades).toBe(curveTrades.length - 1);
    expect(d.ingest.trades).toBeGreaterThanOrEqual(curveTrades.length - 1);
    expect(d.verify.fromEvent).toBeGreaterThanOrEqual(1);
  });

  it('drops a launch quoted in another mint and the trades of tokens it does not keep', async () => {
    const world = built.ctx.world;
    const before = market.diagnostics();
    const launch = decodeProgramLogs(one('create-other-quote').logs).events.find((e) => e.type === 'create')!;
    if (launch.type !== 'create') throw new Error('unreachable');
    rpc.sockets[0].send(notification(one('create-other-quote'), 100));
    rpc.sockets[0].send(notification(one('curve-sell'), 100));
    await until(() => market.diagnostics().sources.logs!.detail.stats.filtered > before.sources.logs!.detail.stats.filtered);
    await until(() => market.diagnostics().verify.rejected > before.verify.rejected);
    expect(world.tokens.has(launch.mint)).toBe(false);
  });

  it('sheds trades nobody needs when the queue backs up, never launches', () => {
    const internals = market as unknown as { queue: FeedEvent[]; onLogEvents(e: FeedEvent[], f: Map<string, unknown>, o: string): void };
    const saved = internals.queue;
    internals.queue = new Array(60_000).fill(saved[0] ?? { kind: 'migrate', signature: 's', mint: 'm' });
    const shedBefore = market.diagnostics().sources.logs!.shed;
    const trade: TradeEvent = { kind: 'trade', side: 'buy', signature: 'sig', mint: 'NoOne111111111111111111111111111111111111111', trader: 'NoOne111111111111111111111111111111111111112', tokenAmount: 1, solAmount: 1, source: 'logs' };
    internals.onLogEvents([trade], new Map(), 'stream');
    expect(market.diagnostics().sources.logs!.shed).toBe(shedBefore + 1);
    internals.queue = saved;
  });

  it('reports a refused subscription as a live-status problem', async () => {
    rpc.answer = (req) => ({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: req.id });
    rpc.sockets.at(-1)!.terminate();
    await until(() => (market.liveStatus().problems ?? []).some((p) => p.includes('refused logsSubscribe')), 5000);
    expect(market.liveStatus().feedConnected).toBe(false);
    const meta = await built.app.inject({ method: 'GET', url: '/api/meta' });
    expect((meta.json() as { live: { problems: string[] } }).live.problems.some((p) => p.includes('Method not found'))).toBe(true);
  });
});

describe('LIVE_SOLANA_SOURCES', () => {
  it('defaults to program logs and PumpPortal, reports unknown names and logs without a WebSocket', () => {
    const problems: string[] = [];
    expect(parseSolanaSources(null, 'wss://rpc.example', problems)).toEqual(['logs', 'pumpportal']);
    expect(parseSolanaSources('pumpportal, LOGS ,bogus', 'wss://rpc.example', problems)).toEqual(['pumpportal', 'logs']);
    expect(problems).toEqual([expect.stringContaining('bogus')]);
    expect(parseSolanaSources('logs', null, problems)).toEqual(['logs']);
    expect(problems.at(-1)).toContain('program-log feed is off');
    expect(loadLiveConfig({ SOLANA_RPC_URL: 'https://rpc.example/?api-key=x' }).config).toMatchObject({ wsUrl: 'wss://rpc.example/?api-key=x', feed: { solanaSources: ['logs', 'pumpportal'] } });
  });
});
