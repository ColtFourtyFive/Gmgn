// Schema migrations of the durable store: the registry ./sqlite.ts applies when it opens a
// database. Each migration runs in one transaction together with its schema_migrations row.
//
// Rules for every workstream that changes the schema:
//   1. Append only. A migration that has been merged is never edited, renumbered, reordered or
//      removed: databases in the field have already run it. Fix forward with a new migration.
//   2. Numbered. Versions are unique positive integers in strictly increasing list order;
//      SCHEMA_VERSION is the last one. test/store.test.ts checks this, and so does every open.
//   3. Reserve before numbering. At the start of each wave the contract steward appends a block
//      per workstream that needs schema changes to MIGRATION_RANGES (by default workstream Wn.k
//      gets n*1000 + k*10 to n*1000 + k*10 + 9). A workstream numbers its migrations only inside
//      its own block and keeps them together, at the place in the list where their numbers sort
//      (for the newest wave, the end), so parallel branches never pick the same number.
//   4. Blocks merge in any order, so a deployed database can receive a lower-numbered migration
//      after a higher one: the store applies every registered version the database has not
//      recorded, in list order. A migration may depend only on migrations of earlier waves and
//      earlier ones in its own block, never on another workstream's block of the same wave.
//   5. A database recording a version above SCHEMA_VERSION was written by a newer server and is
//      refused.

export interface Migration {
  version: number;
  sql: string;
}

/** A block of migration versions reserved for one owner (rule 3). */
export interface MigrationRange {
  owner: string;
  from: number;
  to: number;
}

/** Reserved version blocks, appended per wave by the contract steward (rule 3). */
export const MIGRATION_RANGES: readonly MigrationRange[] = [{ owner: 'base schema and Wave 0', from: 1, to: 999 }];

/** Schema versions, applied in order inside one transaction each. Never edit a shipped one: append. */
export const MIGRATIONS: readonly Migration[] = [
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

/** Throws unless there is at least one migration and the versions are positive integers in strictly increasing order (rule 2). */
export function checkMigrations(migrations: readonly Migration[]): void {
  if (migrations.length === 0) throw new Error('store migrations: the registry is empty');
  let prev = 0;
  for (const m of migrations) {
    if (!Number.isSafeInteger(m.version) || m.version <= prev) {
      throw new Error(`store migration v${m.version} is out of order (after v${prev}): versions must be positive integers in strictly increasing order`);
    }
    prev = m.version;
  }
}
