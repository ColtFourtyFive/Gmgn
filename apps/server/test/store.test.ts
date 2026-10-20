// Durable store (SQLite via node:sqlite): state blobs, append-only audit,
// idempotent fills and transfers, durability across reopen, and the
// write-through scheduler used in live mode.

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletTransfer } from '@trenchscope/shared';
import type { LiveFillRecord } from '../src/context';
import { ACCOUNTS_FLUSH_MS, DurableSync, SCHEMA_VERSION, STORE_FILE, TRADING_SAVE_EVERY_MS, decodeValue, encodeValue, openStore, type SqliteStore } from '../src/store';

let dir: string;
const opened: SqliteStore[] = [];

function open(path = join(dir, STORE_FILE)): SqliteStore {
  const store = openStore(path);
  opened.push(store);
  return store;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-store-'));
});

afterEach(() => {
  for (const s of opened.splice(0)) s.close();
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function fill(over: Partial<LiveFillRecord> = {}): LiveFillRecord {
  return {
    accountId: 'acc_1',
    chain: 'sol',
    signature: 'sig1',
    token: 'Mint111',
    side: 'buy',
    nativeAmount: 0.5,
    tokenAmount: 1_234_567.891,
    platformFee: 0.004,
    networkFee: 0.000105,
    priceUsd: 0.0000812,
    at: 1_700_000_000_000,
    source: 'manual',
    route: 'jupiter',
    ...over,
  };
}

function transfer(over: Partial<WalletTransfer> = {}): WalletTransfer {
  return {
    id: 'wd_1',
    chain: 'sol',
    direction: 'withdrawal',
    mint: null,
    symbol: 'SOL',
    amount: 1.25,
    counterparty: 'Dest1111111111111111111111111111111111111',
    signature: null,
    status: 'pending',
    networkFee: 0,
    createdAt: 1_700_000_000_000,
    confirmedAt: null,
    ...over,
  };
}

describe('codec', () => {
  it('round-trips bigint, Map, Set and non-finite numbers that plain JSON loses', () => {
    const value = { lamports: 12_345_678_901_234_567_890n, m: new Map([['a', 1]]), s: new Set(['x', 'y']), inf: Infinity, neg: -Infinity, nan: NaN, nested: [{ n: 1n }], plain: 'ok' };
    const back = decodeValue(encodeValue(value)) as typeof value;
    expect(back.lamports).toBe(12_345_678_901_234_567_890n);
    expect(back.m).toEqual(new Map([['a', 1]]));
    expect(back.s).toEqual(new Set(['x', 'y']));
    expect(back.inf).toBe(Infinity);
    expect(back.neg).toBe(-Infinity);
    expect(Number.isNaN(back.nan)).toBe(true);
    expect(back.nested[0].n).toBe(1n);
    expect(back.plain).toBe('ok');
    expect(decodeValue(encodeValue(undefined))).toBeNull();
  });
});

describe('SqliteStore', () => {
  it('creates an owner-only WAL database with synchronous=FULL and the current schema', () => {
    const path = join(dir, 'nested', STORE_FILE);
    const store = open(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
    expect(store.pragma('journal_mode')).toBe('wal');
    expect(store.pragma('synchronous')).toBe(2); // FULL
    expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
  });

  it('works in memory for tests', () => {
    const store = open(':memory:');
    store.putState('k', { a: 1 });
    expect(store.getState('k')).toEqual({ a: 1 });
  });

  it('stores state blobs by key (latest wins) and skips identical rewrites', () => {
    const store = open();
    expect(store.getState('accounts')).toBeNull();
    store.putState('accounts', { version: 1, n: 1 });
    store.putState('accounts', { version: 1, n: 2 });
    store.putState('trading', { orders: [] });
    expect(store.getState('accounts')).toEqual({ version: 1, n: 2 });
    expect(store.getState('trading')).toEqual({ orders: [] });
    expect(store.putStateIfChanged('accounts', { version: 1, n: 2 })).toBe(false);
    expect(store.putStateIfChanged('accounts', { version: 1, n: 3 })).toBe(true);
    expect(store.getState('accounts')).toEqual({ version: 1, n: 3 });
  });

  it('keeps everything across a close and reopen of the file', () => {
    const path = join(dir, STORE_FILE);
    const a = open(path);
    a.putState('accounts', { version: 1, accounts: [{ id: 'acc_1' }] });
    a.appendAudit({ at: 1, accountId: 'acc_1', action: 'login', ip: '1.2.3.4', detail: { method: 'totp' } });
    a.appendFill(fill());
    a.upsertTransfer('acc_1', transfer(), 'client-1');
    a.close();

    const b = open(path);
    expect(b.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(b.getState('accounts')).toEqual({ version: 1, accounts: [{ id: 'acc_1' }] });
    expect(b.auditFor('acc_1', 10)).toEqual([{ at: 1, accountId: 'acc_1', action: 'login', ip: '1.2.3.4', detail: { method: 'totp' } }]);
    expect(b.fillsFor('acc_1', { limit: 10 })).toEqual([fill()]);
    expect(b.transferByClientId('acc_1', 'client-1')).toEqual(transfer());
    expect(b.openTransfers()).toEqual([{ accountId: 'acc_1', transfer: transfer() }]);
  });

  it('refuses a database written by a newer schema', () => {
    const path = join(dir, STORE_FILE);
    open(path).close();
    const raw = new DatabaseSync(path);
    raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION + 1, 0);
    raw.close();
    expect(() => openStore(path)).toThrow(/newer than this server/);
  });

  it('audit is append-only, newest first, filterable by action, ip kept apart from the detail', () => {
    const store = open();
    store.appendAudit({ at: 1, accountId: 'acc_1', action: 'login', ip: '1.1.1.1', detail: {} });
    store.appendAudit({ at: 2, accountId: 'acc_1', action: 'swap_sent', ip: null, detail: { lamports: 5n } });
    store.appendAudit({ at: 3, accountId: 'acc_2', action: 'login', ip: null, detail: {} });
    store.appendAudit({ at: 4, accountId: 'acc_1', action: '2fa_enabled', ip: '1.1.1.1', detail: {} });
    store.appendAudit({ at: 5, accountId: null, action: 'login_failed', ip: '9.9.9.9', detail: { username: 'nobody' } });
    expect(store.auditFor('acc_1', 10).map((a) => a.at)).toEqual([4, 2, 1]);
    expect(store.auditFor('acc_1', 2).map((a) => a.at)).toEqual([4, 2]);
    expect(store.auditFor('acc_1', 10, ['login', '2fa_enabled']).map((a) => a.action)).toEqual(['2fa_enabled', 'login']);
    expect(store.auditFor('acc_1', 10)[1].detail).toEqual({ lamports: 5n });

    const raw = new DatabaseSync(store.path);
    expect(() => raw.exec("UPDATE audit SET action = 'x'")).toThrow(/append-only/);
    expect(() => raw.exec('DELETE FROM audit')).toThrow(/append-only/);
    raw.close();
    expect(store.auditFor('acc_1', 10)).toHaveLength(3);
  });

  it('records a fill once per (account, signature); newest first, by token', () => {
    const store = open();
    expect(store.appendFill(fill())).toBe(true);
    expect(store.appendFill(fill({ nativeAmount: 99 }))).toBe(false); // the same signature again: ignored
    expect(store.appendFill(fill({ accountId: 'acc_2' }))).toBe(true); // another account's view of the tx
    expect(store.appendFill(fill({ signature: 'sig2', token: 'Mint222', at: 1_700_000_001_000, side: 'sell' }))).toBe(true);
    expect(store.fillsFor('acc_1', { limit: 10 }).map((f) => f.signature)).toEqual(['sig2', 'sig1']);
    expect(store.fillsFor('acc_1', { limit: 10 })[1].nativeAmount).toBe(0.5);
    expect(store.fillsFor('acc_1', { token: 'Mint111', limit: 10 }).map((f) => f.signature)).toEqual(['sig1']);
    expect(store.fillsFor('acc_1', { limit: 1 })).toHaveLength(1);
    expect(store.fillsFor('nobody', { limit: 10 })).toEqual([]);
  });

  it('upserts transfers by id, keeps client ids unique per account and never reopens a final transfer', () => {
    const store = open();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.upsertTransfer('acc_1', transfer(), 'c-1');
    store.upsertTransfer('acc_1', transfer({ status: 'sent', signature: 'txsig' })); // no client id: the stored one stays
    expect(store.transferByClientId('acc_1', 'c-1')).toMatchObject({ status: 'sent', signature: 'txsig' });
    expect(store.openTransfers()).toHaveLength(1);

    store.upsertTransfer('acc_1', transfer({ status: 'confirmed', signature: 'txsig', confirmedAt: 5 }));
    expect(store.openTransfers()).toEqual([]);
    store.upsertTransfer('acc_1', transfer({ status: 'sent', signature: 'txsig' })); // a late 'sent' write
    expect(store.transfersFor('acc_1', 10)).toEqual([transfer({ status: 'confirmed', signature: 'txsig', confirmedAt: 5 })]);
    expect(store.openTransfers()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ignored reopening confirmed transfer wd_1/));

    // Same client id, another transfer: refused. Same client id on another account: fine.
    expect(() => store.upsertTransfer('acc_1', transfer({ id: 'wd_2' }), 'c-1')).toThrow(/already used/);
    store.upsertTransfer('acc_2', transfer({ id: 'wd_3' }), 'c-1');
    expect(store.transferByClientId('acc_2', 'c-1')?.id).toBe('wd_3');
    // An id is bound to its account.
    expect(() => store.upsertTransfer('acc_2', transfer({ status: 'failed' }))).toThrow(/another account/);
    expect(store.transferByClientId('acc_1', 'c-1')?.status).toBe('confirmed');
    expect(store.transferByClientId('acc_1', 'nope')).toBeNull();
    warn.mockRestore();
  });

  it('lists transfers newest first with deposits and open ones for resumption', () => {
    const store = open();
    store.upsertTransfer('acc_1', transfer({ id: 'dep_1', direction: 'deposit', status: 'confirmed', createdAt: 10, confirmedAt: 10 }));
    store.upsertTransfer('acc_1', transfer({ id: 'wd_1', createdAt: 20 }));
    store.upsertTransfer('acc_1', transfer({ id: 'wd_2', createdAt: 30, status: 'sent' }));
    store.upsertTransfer('acc_2', transfer({ id: 'wd_9', createdAt: 40 }));
    expect(store.transfersFor('acc_1', 10).map((t) => t.id)).toEqual(['wd_2', 'wd_1', 'dep_1']);
    expect(store.transfersFor('acc_1', 2).map((t) => t.id)).toEqual(['wd_2', 'wd_1']);
    expect(store.openTransfers().map((o) => [o.accountId, o.transfer.id])).toEqual([
      ['acc_1', 'wd_1'],
      ['acc_1', 'wd_2'],
      ['acc_2', 'wd_9'],
    ]);
  });

  it('close is idempotent; a closed store refuses work', () => {
    const store = open();
    store.close();
    store.close();
    expect(store.isOpen).toBe(false);
    expect(() => store.putState('k', 1)).toThrow();
  });
});

describe('DurableSync', () => {
  it('coalesces account changes into one write within ACCOUNTS_FLUSH_MS, writes at once when asked, and flushes on stop', () => {
    vi.useFakeTimers();
    const store = open(':memory:');
    let accounts = { n: 0 };
    let trading = { orders: 0 };
    const put = vi.spyOn(store, 'putState');
    const putIfChanged = vi.spyOn(store, 'putStateIfChanged');
    const sync = new DurableSync(store, { accounts: () => accounts, trading: () => trading });

    accounts = { n: 1 };
    sync.accountsChanged();
    accounts = { n: 2 };
    sync.accountsChanged();
    expect(store.getState('accounts')).toBeNull();
    vi.advanceTimersByTime(ACCOUNTS_FLUSH_MS);
    expect(store.getState('accounts')).toEqual({ n: 2 });
    expect(putIfChanged).toHaveBeenCalledTimes(1);

    accounts = { n: 3 };
    sync.flushAccounts(); // urgent: synchronous
    expect(store.getState('accounts')).toEqual({ n: 3 });

    sync.start();
    trading = { orders: 1 };
    vi.advanceTimersByTime(TRADING_SAVE_EVERY_MS);
    expect(store.getState('trading')).toEqual({ orders: 1 });
    const writes = putIfChanged.mock.results.filter((r) => r.value === true).length;
    vi.advanceTimersByTime(TRADING_SAVE_EVERY_MS * 3); // unchanged: no further writes
    expect(putIfChanged.mock.results.filter((r) => r.value === true).length).toBe(writes);

    trading = { orders: 2 };
    sync.tradingChanged(); // after a fill: within ACCOUNTS_FLUSH_MS, not the next period
    vi.advanceTimersByTime(ACCOUNTS_FLUSH_MS);
    expect(store.getState('trading')).toEqual({ orders: 2 });

    accounts = { n: 4 };
    trading = { orders: 3 };
    sync.accountsChanged();
    sync.stop();
    expect(store.getState('accounts')).toEqual({ n: 4 });
    expect(store.getState('trading')).toEqual({ orders: 3 });
    sync.accountsChanged(); // stopped: nothing scheduled
    expect(vi.getTimerCount()).toBe(0);
    expect(put).not.toHaveBeenCalled();
  });

  it('a failed background write is logged, not thrown; an urgent one throws to its caller', () => {
    vi.useFakeTimers();
    const store = open(':memory:');
    const sync = new DurableSync(store, {
      accounts: () => {
        throw new Error('boom');
      },
      trading: () => ({}),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sync.accountsChanged();
    vi.advanceTimersByTime(ACCOUNTS_FLUSH_MS);
    expect(error).toHaveBeenCalledWith('[store] saving accounts failed', 'boom');
    expect(() => sync.flushAccounts()).toThrow('boom');
    error.mockRestore();
  });
});
