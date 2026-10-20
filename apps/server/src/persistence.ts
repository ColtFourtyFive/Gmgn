// Snapshot persistence: the whole world + service state is written with
// node:v8 serialization (handles Map/Set) to a single file, atomically.
//
// The file is a sequence of frames, each one v8-serialized slice of the
// snapshot: plain objects near the root are split per field and long arrays
// (tokens, wallets, analytics tracks) into chunks of CHUNK_ITEMS, so the
// periodic save can serialize and write it a slice at a time
// (saveSnapshotAsync) instead of blocking the event loop for seconds while one
// v8.serialize of the whole state runs. Files written as one blob by earlier
// versions still load.

import { closeSync, existsSync, fchmodSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { deserialize, serialize } from 'node:v8';
import type { AppMode } from '@trenchscope/shared';
import type { WorldSnapshot } from './sim/world';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  version: number;
  /** Mode that wrote the snapshot (absent = demo, from before live mode existed). */
  mode?: AppMode;
  savedAt: number;
  world: WorldSnapshot;
  market: unknown;
  accounts: unknown;
  analytics: unknown;
  trading: unknown;
}

/** Marks the framed format (a legacy single-blob v8 file never starts with it). */
const MAGIC = Buffer.from('TSSNAP/frames/1\n');
/** Arrays longer than this are written in chunks of this many items. */
const CHUNK_ITEMS = 200;
/** Plain objects are split into one frame per field down to this depth (root = 0). */
const SPLIT_DEPTH = 3;
/** Async writer: flush and yield to the event loop after this much synchronous work. */
const SLICE_MS = 15;
/**
 * The snapshot holds password hashes and session digests: owner-only file (also forced on a stale
 * temp file, whose mode the rename keeps) and, when the server creates it, owner-only directory.
 */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** One slice: the value at `path`, or (append) items to push onto the array at `path`. */
type Frame = [path: string[], value: unknown, append: boolean];

export function snapshotPath(dataDir: string): string {
  return join(dataDir, 'snapshot.bin');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Frames of `value`, root first. Values are split only where object identity
 * does not matter across the split (separate fields of the root sections,
 * separate items of long arrays); everything below is serialized whole.
 */
function* frames(value: unknown, path: string[] = [], depth = 0): Generator<Frame> {
  if (Array.isArray(value) && value.length > CHUNK_ITEMS) {
    yield [path, [], false];
    for (let i = 0; i < value.length; i += CHUNK_ITEMS) yield [path, value.slice(i, i + CHUNK_ITEMS), true];
    return;
  }
  if (depth < SPLIT_DEPTH && isPlainObject(value)) {
    yield [path, {}, false];
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (v !== undefined) yield* frames(v, [...path, key], depth + 1);
    }
    return;
  }
  yield [path, value, false];
}

function encode(frame: Frame): Buffer[] {
  const body = serialize(frame);
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32LE(body.length, 0);
  return [head, body];
}

function assemble(buf: Buffer): unknown {
  let root: unknown;
  let at = MAGIC.length;
  while (at < buf.length) {
    const len = buf.readUInt32LE(at);
    const [path, value, append] = deserialize(buf.subarray(at + 4, at + 4 + len)) as Frame;
    at += 4 + len;
    if (path.length === 0) {
      root = value;
      continue;
    }
    let parent = root as Record<string, unknown>;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]] as Record<string, unknown>;
    const key = path[path.length - 1];
    if (append) {
      const arr = parent[key] as unknown[];
      for (const item of value as unknown[]) arr.push(item);
    } else parent[key] = value;
  }
  return root;
}

export function loadSnapshot(dataDir: string): Snapshot | null {
  const file = snapshotPath(dataDir);
  if (!existsSync(file)) return null;
  try {
    const buf = readFileSync(file);
    const framed = buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
    const snap = (framed ? assemble(buf) : deserialize(buf)) as Snapshot;
    if (snap.version !== SNAPSHOT_VERSION) {
      console.warn(`[persistence] ignoring snapshot v${snap.version} (expected v${SNAPSHOT_VERSION})`);
      return null;
    }
    return snap;
  } catch (err) {
    console.warn('[persistence] failed to read snapshot, starting fresh', err);
    return null;
  }
}

/** Write a snapshot in one synchronous pass (shutdown). */
export function saveSnapshot(dataDir: string, snap: Snapshot): void {
  mkdirSync(dataDir, { recursive: true, mode: DIR_MODE });
  const file = snapshotPath(dataDir);
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w', FILE_MODE);
  const writeAll = (buf: Buffer) => {
    for (let off = 0; off < buf.length; ) off += writeSync(fd, buf, off);
  };
  try {
    fchmodSync(fd, FILE_MODE);
    writeAll(MAGIC);
    for (const frame of frames(snap)) for (const part of encode(frame)) writeAll(part);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

/**
 * Write a snapshot a slice at a time, yielding to the event loop every
 * SLICE_MS of serialization, so requests and sockets stay served while it
 * runs. The caller keeps the state it captured from changing meanwhile
 * (app.ts holds the engine) or accepts the drift; `onSection` hears each root
 * section (world, market, ...) as its first frame is reached, in key order.
 */
export async function saveSnapshotAsync(dataDir: string, snap: Snapshot, onSection?: (section: string) => void): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: DIR_MODE });
  const file = snapshotPath(dataDir);
  const tmp = `${file}.tmp`;
  const fh = await open(tmp, 'w', FILE_MODE);
  const writeAll = async (parts: Buffer[]) => {
    const buf = Buffer.concat(parts);
    for (let off = 0; off < buf.length; ) off += (await fh.write(buf, off)).bytesWritten;
  };
  try {
    await fh.chmod(FILE_MODE);
    let pending: Buffer[] = [MAGIC];
    let sliceStart = performance.now();
    let section: string | undefined;
    for (const frame of frames(snap)) {
      const top = frame[0][0];
      if (top !== undefined && top !== section) onSection?.((section = top));
      pending.push(...encode(frame));
      if (performance.now() - sliceStart < SLICE_MS) continue;
      await writeAll(pending);
      pending = [];
      await nextTurn();
      sliceStart = performance.now();
    }
    await writeAll(pending);
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
}
