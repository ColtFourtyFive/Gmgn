// scripts/backup-db.ts: online SQLite backup (VACUUM INTO) of a WAL database a
// writer still holds open, the snapshot copy, manifest, rotation, and the
// nothing-to-back-up case.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDataDir, DB_FILE, SNAPSHOT_FILE } from '../scripts/backup-db';

let root: string;
let dataDir: string;
let outDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'trenchscope-backup-'));
  dataDir = join(root, 'data');
  outDir = join(root, 'backups');
  mkdirSync(dataDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('backup-db', () => {
  it('exits cleanly when there is nothing to back up yet', () => {
    const res = backupDataDir({ dataDir, outDir, keep: 3 });
    expect(res.dir).toBeNull();
    expect(res.message).toMatch(/nothing to back up/);
    expect(existsSync(outDir)).toBe(false);
  });

  it('copies a WAL database a writer holds open (committed rows still in the WAL included) and the snapshot', () => {
    const writer = new DatabaseSync(join(dataDir, DB_FILE));
    try {
      writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE fills (id INTEGER PRIMARY KEY, sig TEXT)');
      const insert = writer.prepare('INSERT INTO fills (sig) VALUES (?)');
      for (let i = 0; i < 50; i++) insert.run(`sig-${i}`);
      expect(existsSync(join(dataDir, `${DB_FILE}-wal`))).toBe(true);
      writeFileSync(join(dataDir, SNAPSHOT_FILE), 'TSSNAP/frames/1\nsnapshot-bytes');

      const res = backupDataDir({ dataDir, outDir, keep: 3, now: new Date('2026-10-20T12:00:00Z') });
      expect(res.dir).toBe(join(outDir, 'trenchscope-20261020T120000Z'));
      expect(res.files.map((f) => f.name)).toEqual([DB_FILE, SNAPSHOT_FILE]);

      // the writer carries on after the backup
      insert.run('after-backup');
      const copy = new DatabaseSync(join(res.dir!, DB_FILE), { readOnly: true });
      try {
        expect((copy.prepare('SELECT COUNT(*) AS n FROM fills').get() as { n: number }).n).toBe(50);
      } finally {
        copy.close();
      }
      expect(readFileSync(join(res.dir!, SNAPSHOT_FILE), 'utf8')).toBe('TSSNAP/frames/1\nsnapshot-bytes');

      const manifest = JSON.parse(readFileSync(join(res.dir!, 'manifest.json'), 'utf8'));
      for (const f of manifest.files) {
        expect(createHash('sha256').update(readFileSync(join(res.dir!, f.name))).digest('hex')).toBe(f.sha256);
      }
      expect(statSync(join(res.dir!, DB_FILE)).mode & 0o777).toBe(0o600);
    } finally {
      writer.close();
    }
  });

  it('keeps only the newest N backups and works with only a snapshot', () => {
    writeFileSync(join(dataDir, SNAPSHOT_FILE), 'snap');
    const made: string[] = [];
    for (let i = 0; i < 4; i++) made.push(backupDataDir({ dataDir, outDir, keep: 2, now: new Date(Date.UTC(2026, 9, 20, 10 + i)) }).dir!);
    // two runs in the same second do not collide
    const same = backupDataDir({ dataDir, outDir, keep: 2, now: new Date(Date.UTC(2026, 9, 20, 13)) });
    expect(same.dir).toBe(`${made[3]}-1`);
    expect(readdirSync(outDir).sort()).toEqual(['trenchscope-20261020T130000Z', 'trenchscope-20261020T130000Z-1']);
    expect(same.files.map((f) => f.name)).toEqual([SNAPSHOT_FILE]);
  });
});
