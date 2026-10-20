// Snapshot persistence: the framed format round-trips (sync and sliced async
// writers), legacy single-blob files still load, and the periodic save keeps
// the event loop turning while it holds the sim still.

import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { loadSnapshot, saveSnapshot, saveSnapshotAsync, snapshotPath, SNAPSHOT_VERSION, type Snapshot } from '../src/persistence';
import { CATCH_UP_STEPS_PER_TICK, Engine } from '../src/sim/engine';
import { World } from '../src/sim/world';

let dir: string;
let built: BuiltApp | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-snap-'));
});

afterEach(async () => {
  await built?.close();
  built = null;
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function capture(b: BuiltApp): Snapshot {
  const { ctx } = b;
  return {
    version: SNAPSHOT_VERSION,
    savedAt: 1,
    world: ctx.world.serialize(),
    market: b.market.serialize(),
    accounts: ctx.accounts.serialize(),
    analytics: ctx.analytics.serialize(),
    trading: ctx.trading.serialize(),
  };
}

/** Count event-loop turns until stopped. */
function spinner() {
  let turns = 0;
  let on = true;
  const spin = () => {
    turns++;
    if (on) setImmediate(spin);
  };
  setImmediate(spin);
  return {
    stop: () => {
      on = false;
      return turns;
    },
  };
}

describe('snapshot persistence', () => {
  it('round-trips through the framed format (sliced and blocking writers) and still reads single-blob files', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    built = await buildApp(defaultConfig({ warmupMinutes: 10, snapshotEveryMs: 0, dataDir: dir }), { start: false, persist: false });
    const snap = capture(built);
    const expected = deserialize(serialize(snap)) as Snapshot;
    expect(snap.world.wallets.length).toBeGreaterThan(1000); // long arrays are written in chunks

    const spin = spinner();
    await saveSnapshotAsync(dir, snap);
    expect(spin.stop()).toBeGreaterThan(2); // the event loop kept turning between slices
    expect(loadSnapshot(dir)).toEqual(expected);

    saveSnapshot(dir, snap);
    expect(loadSnapshot(dir)).toEqual(expected);

    writeFileSync(snapshotPath(dir), serialize(snap)); // written by an earlier version
    expect(loadSnapshot(dir)).toEqual(expected);
  });

  it.skipIf(process.platform === 'win32')('writes the snapshot owner-only (it holds password hashes), whatever the umask', async () => {
    const snap: Snapshot = { version: SNAPSHOT_VERSION, savedAt: 1, world: {} as Snapshot['world'], market: null, accounts: { secret: 1 }, analytics: null, trading: null };
    const mode = (path: string) => statSync(path).mode & 0o777;
    const previous = process.umask(0o022);
    try {
      const fresh = join(dir, 'data');
      saveSnapshot(fresh, snap);
      expect(mode(fresh)).toBe(0o700);
      expect(mode(snapshotPath(fresh))).toBe(0o600);
      // a stale world-readable temp file from an earlier writer does not leak its mode
      const shared = join(dir, 'shared');
      mkdirSync(shared, { mode: 0o755 });
      writeFileSync(`${snapshotPath(shared)}.tmp`, 'stale', { mode: 0o644 });
      await saveSnapshotAsync(shared, snap);
      expect(mode(snapshotPath(shared))).toBe(0o600);
      writeFileSync(`${snapshotPath(shared)}.tmp`, 'stale', { mode: 0o644 });
      saveSnapshot(shared, snap);
      expect(mode(snapshotPath(shared))).toBe(0o600);
      expect(loadSnapshot(shared)).toEqual(snap);
    } finally {
      process.umask(previous);
    }
  });

  it('writes a snapshot on shutdown when the interval is set, and none at all with SNAPSHOT_EVERY_MS=0 (README)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: false });
    await built.close();
    built = null;
    expect(existsSync(snapshotPath(dir))).toBe(false);
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 3_600_000, dataDir: dir }), { start: false });
    await built.close();
    built = null;
    expect(existsSync(snapshotPath(dir))).toBe(true);
  });

  it('holds the sim while the periodic save runs, and the file restores the held state', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    built = await buildApp(defaultConfig({ warmupMinutes: 10, snapshotEveryMs: 0, dataDir: dir }), { start: true, persist: true });
    const guest = await built.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    const { account } = guest.json() as { account: { id: string } };
    const { world, engine } = built.ctx;

    // Engine.hold: no ticks (the clock stands still) until released, then it catches up.
    const at = world.now;
    const release = engine.hold();
    await new Promise((r) => setTimeout(r, 600));
    expect(world.now).toBe(at);
    release();
    await vi.waitFor(() => expect(world.now).toBeGreaterThan(at));

    const hold = vi.spyOn(engine, 'hold');
    const tokens = world.tokens.size;
    const wallets = world.wallets.size;
    const done = built.saveInBackground();
    expect(built.saveInBackground()).toBe(done); // overlapping saves share the one in progress
    expect(hold).toHaveBeenCalledTimes(1);
    await done;
    const snap = loadSnapshot(dir)!;
    expect(snap.world.tokens).toHaveLength(tokens);
    expect(snap.world.wallets).toHaveLength(wallets);
    const restored = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: false, persist: true });
    expect(restored.ctx.accounts.walletFor(account.id, 'sol').accountId).toBe(account.id);
    await restored.app.close();
  });

  it('holds the sim only while the ledger sections are written, not the derived analytics', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: false, persist: true });
    const engine = built.ctx.engine as unknown as { holds: number };
    const heldWhile: Record<string, boolean> = {};
    // frames() reads each root section's fields lazily, as it writes them
    const probe = (section: string, real: () => unknown) => () => {
      const data = real() as Record<string, unknown>;
      return {
        ...data,
        get probe() {
          heldWhile[section] = engine.holds > 0;
          return 1;
        },
      };
    };
    const { ctx } = built;
    for (const [section, owner] of [['world', ctx.world], ['market', built.market], ['accounts', ctx.accounts], ['trading', ctx.trading], ['analytics', ctx.analytics]] as const) {
      const real = owner.serialize.bind(owner);
      vi.spyOn(owner as { serialize(): unknown }, 'serialize').mockImplementation(probe(section, real));
    }
    const sections: string[] = [];
    await saveSnapshotAsync(dir, capture(built), (section) => sections.push(section));
    expect(sections).toEqual(['version', 'savedAt', 'world', 'market', 'accounts', 'analytics', 'trading']); // key order
    await built.saveInBackground();
    expect(heldWhile).toEqual({ world: true, market: true, accounts: true, trading: true, analytics: false });
    expect(engine.holds).toBe(0);
  });
});

describe('engine catch-up', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays a held span in tick-sized steps, a few per interval, instead of one jump', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 0, 1), toFake: ['setInterval', 'clearInterval', 'Date'] });
    const world = new World('catch-up', Date.now());
    const engine = new Engine(world);
    const steps: number[] = [];
    engine.addTicker('probe', (dt) => steps.push(dt));
    engine.start();
    try {
      vi.advanceTimersByTime(1000);
      expect(steps).toEqual([250, 250, 250, 250]);
      const release = engine.hold();
      vi.advanceTimersByTime(3000);
      expect(steps).toHaveLength(4); // frozen
      release();
      vi.advanceTimersByTime(engine.tickMs);
      expect(steps.slice(4)).toEqual(Array(CATCH_UP_STEPS_PER_TICK).fill(engine.tickMs));
      vi.advanceTimersByTime(5 * engine.tickMs);
      expect(Math.max(...steps)).toBe(engine.tickMs);
      expect(world.now).toBe(Date.now()); // caught up with wall time
      const n = steps.length;
      vi.advanceTimersByTime(engine.tickMs);
      expect(steps.slice(n)).toEqual([engine.tickMs]); // and back to one step per interval
    } finally {
      engine.stop();
    }
  });
});
