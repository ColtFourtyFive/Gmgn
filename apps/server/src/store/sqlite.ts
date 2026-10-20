// Durable store for live mode: one SQLite file (node:sqlite, synchronous API)
// holding module state blobs plus the append-only money and audit records.
//
//   state      key -> JSON blob (accounts, trading, live-wallets cursors, ...), latest only
//   audit      append-only (triggers refuse UPDATE / DELETE)
//   fills      confirmed swaps, unique per (account, signature): a re-recorded fill is a no-op
//   transfers  deposits / withdrawals upserted by id; a client idempotency key is unique per
//              account; a final status (confirmed / failed) never goes back to an open one
//
// WAL journal with synchronous=FULL: every write is on disk when the call returns. The file
// is owner-only (0600; SQLite gives its -wal / -shm files the same mode).

import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';
import type { ChainId, TransferStatus, WalletTransfer } from '@trenchscope/shared';
import type { AuditRecord, DurableStore, LiveFillRecord } from '../context';
import { decodeValue, encodeValue } from './codec';

export const STORE_FILE = 'trenchscope.db';
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const FINAL_STATUSES: readonly TransferStatus[] = ['confirmed', 'failed'];
const OPEN_STATUSES: readonly TransferStatus[] = ['pending', 'sent'];

/** Schema versions, applied in order inside one transaction each. Never edit a shipped one: append. */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        account_id TEXT,
        action TEXT NOT NULL,
        ip TEXT,
        detail TEXT NOT NULL
      );
      CREATE INDEX audit_by_account ON audit (account_id, id);
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
      CREATE TABLE fills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        chain TEXT NOT NULL,
        signature TEXT NOT NULL,
        token TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        native_amount REAL NOT NULL,
        token_amount REAL NOT NULL,
        platform_fee REAL NOT NULL,
        network_fee REAL NOT NULL,
        price_usd REAL NOT NULL,
        at INTEGER NOT NULL,
        source TEXT NOT NULL,
        route TEXT NOT NULL,
        UNIQUE (account_id, signature)
      );
      CREATE INDEX fills_by_account ON fills (account_id, at, id);
      CREATE INDEX fills_by_account_token ON fills (account_id, token, at, id);
      CREATE TABLE transfers (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        client_id TEXT,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE UNIQUE INDEX transfers_by_client ON transfers (account_id, client_id) WHERE client_id IS NOT NULL;
      CREATE INDEX transfers_by_account ON transfers (account_id, created_at);
      CREATE INDEX transfers_open ON transfers (status) WHERE status IN ('pending', 'sent');
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

type Row = Record<string, unknown>;

/**
 * node:sqlite, loaded on first use: it is still experimental in Node 22 and prints a warning when
 * loaded, which demo mode (no store) should never show.
 */
let DatabaseSync: typeof DatabaseSyncType | null = null;
function sqlite(): typeof DatabaseSyncType {
  DatabaseSync ??= (createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  return DatabaseSync;
}

interface Statements {
  getState: StatementSync;
  putState: StatementSync;
  appendAudit: StatementSync;
  auditFor: StatementSync;
  auditForActions: StatementSync;
  appendFill: StatementSync;
  fillsFor: StatementSync;
  fillsForToken: StatementSync;
  upsertTransfer: StatementSync;
  transferById: StatementSync;
  transfersFor: StatementSync;
  transferByClientId: StatementSync;
  openTransfers: StatementSync;
}

/** Create the database file owner-only before SQLite opens it (and tighten an existing one). */
function prepareFile(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  if (!existsSync(path)) closeSync(openSync(path, 'a', FILE_MODE));
  chmodSync(path, FILE_MODE);
}

function toFill(row: Row): LiveFillRecord {
  return {
    accountId: row.account_id as string,
    chain: row.chain as ChainId,
    signature: row.signature as string,
    token: row.token as string,
    side: row.side as 'buy' | 'sell',
    nativeAmount: row.native_amount as number,
    tokenAmount: row.token_amount as number,
    platformFee: row.platform_fee as number,
    networkFee: row.network_fee as number,
    priceUsd: row.price_usd as number,
    at: row.at as number,
    source: row.source as string,
    route: row.route as string,
  };
}

function toAudit(row: Row): AuditRecord {
  return {
    at: row.at as number,
    accountId: (row.account_id as string | null) ?? null,
    action: row.action as string,
    ip: (row.ip as string | null) ?? null,
    detail: decodeValue(row.detail as string) as Record<string, unknown>,
  };
}

const toTransfer = (row: Row) => decodeValue(row.data as string) as WalletTransfer;

/** Clamp a caller's limit to a sane positive integer. */
const rowLimit = (limit: number) => Math.max(1, Math.min(10_000, Math.floor(Number.isFinite(limit) ? limit : 1)));

export class SqliteStore implements DurableStore {
  private readonly db: DatabaseSyncType;
  private readonly st: Statements;
  /** key -> the encoded value last written (putStateIfChanged skips identical writes). */
  private readonly written = new Map<string, string>();
  private closed = false;

  constructor(
    readonly path: string,
    private readonly clock: () => number = Date.now,
  ) {
    const memory = path === ':memory:';
    if (!memory) prepareFile(path);
    this.db = new (sqlite())(path);
    try {
      this.db.exec('PRAGMA busy_timeout = 5000');
      if (!memory) this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = FULL');
      this.migrate();
      this.st = this.prepare();
    } catch (err) {
      this.db.close();
      throw err;
    }
  }

  /** Applied schema version (0 = empty database). */
  schemaVersion(): number {
    const row = this.db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as Row | undefined;
    return (row?.v as number | null) ?? 0;
  }

  /** A PRAGMA's current value (tests and diagnostics). */
  pragma(name: 'journal_mode' | 'synchronous'): unknown {
    const row = this.db.prepare(`PRAGMA ${name}`).get() as Row | undefined;
    return row ? Object.values(row)[0] : null;
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    const current = this.schemaVersion();
    if (current > SCHEMA_VERSION) throw new Error(`store schema v${current} is newer than this server (v${SCHEMA_VERSION}): refusing to open it`);
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      this.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, this.clock());
      });
    }
  }

  private prepare(): Statements {
    const p = (sql: string) => this.db.prepare(sql);
    const auditCols = 'at, account_id, action, ip, detail';
    const fillCols = 'account_id, chain, signature, token, side, native_amount, token_amount, platform_fee, network_fee, price_usd, at, source, route';
    return {
      getState: p('SELECT value FROM state WHERE key = ?'),
      putState: p('INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
      appendAudit: p(`INSERT INTO audit (${auditCols}) VALUES (?, ?, ?, ?, ?)`),
      auditFor: p(`SELECT ${auditCols} FROM audit WHERE account_id = ? ORDER BY id DESC LIMIT ?`),
      auditForActions: p(`SELECT ${auditCols} FROM audit WHERE account_id = ? AND action IN (SELECT value FROM json_each(?)) ORDER BY id DESC LIMIT ?`),
      appendFill: p(`INSERT INTO fills (${fillCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, signature) DO NOTHING`),
      fillsFor: p(`SELECT ${fillCols} FROM fills WHERE account_id = ? ORDER BY at DESC, id DESC LIMIT ?`),
      fillsForToken: p(`SELECT ${fillCols} FROM fills WHERE account_id = ? AND token = ? ORDER BY at DESC, id DESC LIMIT ?`),
      // The WHERE keeps an id bound to its account and a final status final (see the header).
      upsertTransfer: p(`
        INSERT INTO transfers (id, account_id, client_id, direction, status, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status,
          data = excluded.data,
          updated_at = excluded.updated_at,
          client_id = COALESCE(transfers.client_id, excluded.client_id)
        WHERE transfers.account_id = excluded.account_id
          AND NOT (transfers.status IN ('confirmed', 'failed') AND excluded.status IN ('pending', 'sent'))`),
      transferById: p('SELECT account_id, status FROM transfers WHERE id = ?'),
      transfersFor: p('SELECT data FROM transfers WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'),
      transferByClientId: p('SELECT data FROM transfers WHERE account_id = ? AND client_id = ?'),
      openTransfers: p(`SELECT account_id, data FROM transfers WHERE status IN ('pending', 'sent') ORDER BY created_at, rowid`),
    };
  }

  /** Run `fn` in one IMMEDIATE transaction (rolled back when it throws). */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // State blobs
  // ---------------------------------------------------------------------------

  getState(key: string): unknown {
    const row = this.st.getState.get(key) as Row | undefined;
    if (!row) return null;
    const text = row.value as string;
    this.written.set(key, text);
    return decodeValue(text);
  }

  putState(key: string, value: unknown): void {
    this.writeState(key, encodeValue(value));
  }

  /** putState unless the encoded value equals the one last written for `key`; true when written. */
  putStateIfChanged(key: string, value: unknown): boolean {
    const text = encodeValue(value);
    if (this.written.get(key) === text) return false;
    this.writeState(key, text);
    return true;
  }

  private writeState(key: string, text: string): void {
    this.st.putState.run(key, text, this.clock());
    this.written.set(key, text);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  appendAudit(rec: AuditRecord): void {
    this.st.appendAudit.run(rec.at, rec.accountId, rec.action, rec.ip, encodeValue(rec.detail ?? {}));
  }

  auditFor(accountId: string, limit: number, actions?: readonly string[]): AuditRecord[] {
    const rows = actions
      ? this.st.auditForActions.all(accountId, JSON.stringify(actions), rowLimit(limit))
      : this.st.auditFor.all(accountId, rowLimit(limit));
    return (rows as Row[]).map(toAudit);
  }

  // ---------------------------------------------------------------------------
  // Fills
  // ---------------------------------------------------------------------------

  appendFill(f: LiveFillRecord): boolean {
    const res = this.st.appendFill.run(
      f.accountId,
      f.chain,
      f.signature,
      f.token,
      f.side,
      f.nativeAmount,
      f.tokenAmount,
      f.platformFee,
      f.networkFee,
      f.priceUsd,
      f.at,
      f.source,
      f.route,
    );
    return Number(res.changes) === 1;
  }

  fillsFor(accountId: string, opts: { token?: string; limit: number }): LiveFillRecord[] {
    const rows = opts.token ? this.st.fillsForToken.all(accountId, opts.token, rowLimit(opts.limit)) : this.st.fillsFor.all(accountId, rowLimit(opts.limit));
    return (rows as Row[]).map(toFill);
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  /**
   * Insert or update by id. Throws when the id belongs to another account or `clientId` is already
   * used by another transfer of the account; a confirmed / failed transfer is never reopened (the
   * write is ignored, so a late 'sent' update cannot make a resumed confirmation send again).
   */
  upsertTransfer(accountId: string, t: WalletTransfer, clientId?: string): void {
    if (!t.id) throw new Error('transfer id is required');
    let res: { changes: number | bigint };
    try {
      res = this.st.upsertTransfer.run(t.id, accountId, clientId ?? null, t.direction, t.status, t.createdAt, this.clock(), encodeValue(t));
    } catch (err) {
      if (clientId && /UNIQUE/i.test(err instanceof Error ? err.message : '')) throw new Error(`transfer clientId ${clientId} is already used by another transfer`);
      throw err;
    }
    if (Number(res.changes) > 0) return;
    const existing = this.st.transferById.get(t.id) as Row | undefined;
    if (existing && existing.account_id !== accountId) throw new Error(`transfer ${t.id} belongs to another account`);
    if (existing && FINAL_STATUSES.includes(existing.status as TransferStatus) && OPEN_STATUSES.includes(t.status)) {
      console.warn(`[store] ignored reopening ${existing.status} transfer ${t.id} as ${t.status}`);
    }
  }

  transfersFor(accountId: string, limit: number): WalletTransfer[] {
    return (this.st.transfersFor.all(accountId, rowLimit(limit)) as Row[]).map(toTransfer);
  }

  transferByClientId(accountId: string, clientId: string): WalletTransfer | null {
    const row = this.st.transferByClientId.get(accountId, clientId) as Row | undefined;
    return row ? toTransfer(row) : null;
  }

  openTransfers(): { accountId: string; transfer: WalletTransfer }[] {
    return (this.st.openTransfers.all() as Row[]).map((row) => ({ accountId: row.account_id as string, transfer: toTransfer(row) }));
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

/** Open (creating and migrating when needed) the store at `path`; ':memory:' for a throwaway one. */
export function openStore(path: string, clock?: () => number): SqliteStore {
  return new SqliteStore(path, clock);
}
