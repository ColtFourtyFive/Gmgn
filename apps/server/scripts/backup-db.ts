// Online backup of DATA_DIR, safe while the server runs: the SQLite durable
// store (trenchscope.db) through VACUUM INTO, a consistent copy taken inside
// one read transaction (in WAL mode writers carry on meanwhile), checked with
// PRAGMA quick_check; and the latest snapshot (snapshot.bin), which the server
// replaces by atomic rename, so a plain copy is always a whole file. Each run
// writes one timestamped directory (with a manifest of sizes and sha256) under
// the backup directory and keeps only the newest N.
//
// Usage: npx tsx scripts/backup-db.ts [--data-dir DIR] [--out DIR] [--keep N]
//   DATA_DIR    data directory (default .data)
//   BACKUP_DIR  where backups go (default DATA_DIR/backups; ship them off the host as well)
//   BACKUP_KEEP backups kept (default 14)
// Exits 0 with a message when there is nothing to back up yet, 1 on failure.

import { createHash } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export const DB_FILE = 'trenchscope.db';
export const SNAPSHOT_FILE = 'snapshot.bin';
const BACKUP_NAME = /^trenchscope-\d{8}T\d{6}Z(-\d+)?$/;
const STALE_TMP_MS = 60 * 60_000;

export interface BackupOptions {
  dataDir: string;
  /** Backup root; each run adds one trenchscope-<UTC timestamp> directory. */
  outDir: string;
  /** Newest backups kept (older ones are removed); at least 1. */
  keep: number;
  now?: Date;
}

export interface BackupResult {
  /** The new backup directory, or null when there was nothing to back up. */
  dir: string | null;
  files: { name: string; bytes: number; sha256: string }[];
  /** Old backups removed by rotation. */
  removed: string[];
  message: string;
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function sha256(file: string): string {
  const hash = createHash('sha256');
  const buf = Buffer.alloc(1 << 20);
  const fd = openSync(file, 'r');
  try {
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0; ) hash.update(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

/** Copy the live database into `dest` with VACUUM INTO and check the copy. */
function backupDatabase(src: string, dest: string): void {
  const db = new DatabaseSync(src);
  try {
    // Wait out a writer holding the lock briefly instead of failing (WAL readers rarely need to).
    db.exec('PRAGMA busy_timeout = 10000');
    db.prepare('VACUUM INTO ?').run(dest);
  } finally {
    db.close();
  }
  const copy = new DatabaseSync(dest, { readOnly: true });
  try {
    const row = copy.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (row?.quick_check !== 'ok') throw new Error(`backup failed its integrity check: ${row?.quick_check ?? 'no result'}`);
  } finally {
    copy.close();
  }
}

export function backupDataDir(opts: BackupOptions): BackupResult {
  const dataDir = resolve(opts.dataDir);
  const outDir = resolve(opts.outDir);
  const keep = Math.max(1, Math.floor(opts.keep));
  const dbPath = join(dataDir, DB_FILE);
  const snapPath = join(dataDir, SNAPSHOT_FILE);
  const hasDb = existsSync(dbPath);
  const hasSnap = existsSync(snapPath);
  if (!hasDb && !hasSnap) {
    return { dir: null, files: [], removed: [], message: `nothing to back up in ${dataDir} (no ${DB_FILE} or ${SNAPSHOT_FILE} yet)` };
  }

  // Backups hold password hashes, session digests and (encrypted) 2FA secrets: owner-only.
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const now = opts.now ?? new Date();
  let name = `trenchscope-${stamp(now)}`;
  for (let i = 1; existsSync(join(outDir, name)); i++) name = `trenchscope-${stamp(now)}-${i}`;
  const tmp = join(outDir, `.tmp-${name}-${process.pid}`);
  const final = join(outDir, name);
  mkdirSync(tmp, { mode: 0o700 });

  const files: BackupResult['files'] = [];
  try {
    if (hasDb) backupDatabase(dbPath, join(tmp, DB_FILE));
    if (hasSnap) copyFileSync(snapPath, join(tmp, SNAPSHOT_FILE));
    for (const f of [hasDb && DB_FILE, hasSnap && SNAPSHOT_FILE].filter((f): f is string => Boolean(f))) {
      const p = join(tmp, f);
      chmodSync(p, 0o600);
      files.push({ name: f, bytes: statSync(p).size, sha256: sha256(p) });
    }
    writeFileSync(join(tmp, 'manifest.json'), `${JSON.stringify({ createdAt: now.toISOString(), source: dataDir, files }, null, 2)}\n`, { mode: 0o600 });
    // The directory appears whole or not at all.
    renameSync(tmp, final);
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }

  const removed: string[] = [];
  const entries = readdirSync(outDir);
  for (const old of entries.filter((e) => BACKUP_NAME.test(e)).sort().reverse().slice(keep)) {
    rmSync(join(outDir, old), { recursive: true, force: true });
    removed.push(old);
  }
  // Temp directories of runs that died midway.
  for (const e of entries) {
    if (!e.startsWith('.tmp-trenchscope-')) continue;
    const p = join(outDir, e);
    if (now.getTime() - statSync(p).mtimeMs > STALE_TMP_MS) rmSync(p, { recursive: true, force: true });
  }
  return { dir: final, files, removed, message: `backup written to ${final}` };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const dataDir = arg('data-dir') ?? process.env.DATA_DIR ?? '.data';
  const outDir = arg('out') ?? process.env.BACKUP_DIR ?? join(dataDir, 'backups');
  const keep = Number(arg('keep') ?? process.env.BACKUP_KEEP ?? 14);
  try {
    const res = backupDataDir({ dataDir, outDir, keep: Number.isFinite(keep) && keep >= 1 ? keep : 14 });
    console.log(`[backup] ${res.message}`);
    for (const f of res.files) console.log(`[backup]   ${f.name} ${f.bytes} bytes sha256 ${f.sha256}`);
    if (res.removed.length) console.log(`[backup] rotated out ${res.removed.join(', ')}`);
  } catch (err) {
    console.error('[backup] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
