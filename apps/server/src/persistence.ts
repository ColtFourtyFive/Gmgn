// Snapshot persistence: the whole world + service state is written with
// node:v8 serialization (handles Map/Set) to a single file, atomically.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import type { WorldSnapshot } from './sim/world';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  version: number;
  savedAt: number;
  world: WorldSnapshot;
  market: unknown;
  accounts: unknown;
  analytics: unknown;
  trading: unknown;
}

export function snapshotPath(dataDir: string): string {
  return join(dataDir, 'snapshot.bin');
}

export function loadSnapshot(dataDir: string): Snapshot | null {
  const file = snapshotPath(dataDir);
  if (!existsSync(file)) return null;
  try {
    const snap = deserialize(readFileSync(file)) as Snapshot;
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

export function saveSnapshot(dataDir: string, snap: Snapshot): void {
  mkdirSync(dataDir, { recursive: true });
  const file = snapshotPath(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, serialize(snap));
  renameSync(tmp, file);
}
