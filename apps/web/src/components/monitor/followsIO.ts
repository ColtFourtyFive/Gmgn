// Bulk follow import / export (pure). Exports are JSON or CSV files of the
// followed wallets; imports read either (or a plain list of addresses), check
// each row for its chain (address format, remark / group limits) and split
// the rows into new follows, ones already followed, duplicates and invalid rows.

import { CHAINS, isChainId, type ChainId, type FollowedWallet } from '@trenchscope/shared';
import { DEFAULT_GROUP, GROUP_MAX, REMARK_MAX } from '@/components/wallet/follows';
import { isWalletAddress, normAddress } from '@/components/wallet/utils';

/** The server's cap on followed wallets per account. */
export const MAX_FOLLOWS = 500;
/** Rows read from one file at most. */
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_TOO_LARGE = 'This file is too large (1 MB max).';

export const CSV_COLUMNS = ['chain', 'address', 'remark', 'group', 'notify'] as const;

export interface FollowRow {
  chain: ChainId;
  address: string;
  remark: string;
  group: string;
  notify: boolean;
}

export interface ImportIssue {
  /** 1-based data row (CSV line after the header, or JSON entry). */
  row: number;
  reason: string;
}

export interface ImportPlan {
  format: 'json' | 'csv';
  /** Rows read from the file. */
  total: number;
  /** New follows, in file order. */
  rows: FollowRow[];
  /** Already followed (skipped). */
  existing: number;
  /** Repeats of an earlier row in the file (skipped). */
  duplicates: number;
  invalid: ImportIssue[];
  byChain: Partial<Record<ChainId, number>>;
}

const CHAIN_ALIASES: Record<string, ChainId> = { solana: 'sol', bnb: 'bsc', 'bnb chain': 'bsc', bnbchain: 'bsc', ethereum: 'eth', ether: 'eth' };

function chainOf(raw: unknown, fallback: ChainId): ChainId | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (isChainId(v)) return v;
  return CHAIN_ALIASES[v] ?? null;
}

function boolOf(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  const v = String(raw ?? '').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(v);
}

/** Spreadsheet apps run cells that start with = + - @ as formulas: exports prefix them with ', imports drop it. */
const FORMULA = /^[=+\-@]/;
const unguard = (s: string) => (s.startsWith("'") && FORMULA.test(s.slice(1)) ? s.slice(1) : s);

function csvCell(value: string): string {
  const v = FORMULA.test(value) ? `'${value}` : value;
  return /[",;\t\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const exportRows = (list: FollowedWallet[]) => list.map(({ chain, address, remark, group, notify }) => ({ chain, address, remark, group, notify }));

export function followsToJson(list: FollowedWallet[], exportedAt: number): string {
  return JSON.stringify({ app: 'trenchscope', kind: 'follows', version: 1, exportedAt: new Date(exportedAt).toISOString(), follows: exportRows(list) }, null, 2);
}

export function followsToCsv(list: FollowedWallet[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const f of exportRows(list)) lines.push([f.chain, f.address, f.remark, f.group, String(f.notify)].map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}

/**
 * RFC 4180 rows (comma, semicolon or tab separated): quoted cells may hold
 * separators, quotes ("") and line breaks. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  return rows;
}

type RawRow = Record<string, unknown>;

function csvRecords(text: string): RawRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const head = rows[0].map((c) => c.trim().toLowerCase());
  if (head.includes('address')) return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, unguard((r[i] ?? '').trim())])));
  // No header: our column order when the first cell is a chain, else address [, remark, group].
  return rows.map((r) => {
    const cells = r.map((c) => unguard(c.trim()));
    const cols = cells[0] !== '' && chainOf(cells[0], 'sol') !== null ? CSV_COLUMNS : (['address', 'remark', 'group'] as const);
    return Object.fromEntries(cols.map((h, i) => [h, cells[i] ?? '']));
  });
}

function jsonRecords(text: string): RawRow[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { follows?: unknown }).follows) ? (data as { follows: unknown[] }).follows : null;
  if (!list) throw new Error('Expected a list of wallets (an array, or an object with a "follows" array).');
  return list.map((e) => (typeof e === 'string' ? { address: e } : e && typeof e === 'object' ? (e as RawRow) : { address: '' }));
}

export interface ImportOptions {
  /** Chain for rows that do not name one. */
  defaultChain: ChainId;
  /** Wallets already followed. */
  existing: Pick<FollowedWallet, 'chain' | 'address'>[];
}

/** Read an export (JSON or CSV) or a plain address list; throws with a readable message when the file can't be used. */
export function planImport(text: string, opts: ImportOptions): ImportPlan {
  if (text.length > IMPORT_MAX_BYTES) throw new Error(IMPORT_TOO_LARGE);
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) throw new Error('This file is empty.');
  const format = trimmed.startsWith('[') || trimmed.startsWith('{') ? 'json' : 'csv';
  let records: RawRow[];
  try {
    records = format === 'json' ? jsonRecords(trimmed) : csvRecords(trimmed);
  } catch (err) {
    throw new Error(err instanceof SyntaxError ? 'This JSON file could not be read.' : err instanceof Error ? err.message : String(err));
  }
  if (records.length === 0) throw new Error('No wallets found in this file.');
  if (records.length > IMPORT_MAX_ROWS) throw new Error(`Import at most ${IMPORT_MAX_ROWS} wallets at a time.`);

  const key = (chain: ChainId, address: string) => `${chain}:${normAddress(chain, address)}`;
  const followed = new Set(opts.existing.map((f) => key(f.chain, f.address)));
  const seen = new Set<string>();
  const plan: ImportPlan = { format, total: records.length, rows: [], existing: 0, duplicates: 0, invalid: [], byChain: {} };
  records.forEach((r, i) => {
    const row = i + 1;
    const chain = chainOf(r.chain, opts.defaultChain);
    if (!chain) {
      plan.invalid.push({ row, reason: `Unknown chain “${String(r.chain).slice(0, 16)}”` });
      return;
    }
    const address = typeof r.address === 'string' ? r.address.trim() : '';
    if (!isWalletAddress(chain, address)) {
      plan.invalid.push({ row, reason: address ? `Not a ${CHAINS[chain].name} address: ${address.slice(0, 14)}${address.length > 14 ? '…' : ''}` : 'No address' });
      return;
    }
    const k = key(chain, address);
    if (seen.has(k)) {
      plan.duplicates++;
      return;
    }
    seen.add(k);
    if (followed.has(k)) {
      plan.existing++;
      return;
    }
    plan.rows.push({
      chain,
      address: normAddress(chain, address),
      remark: String(r.remark ?? '').trim().slice(0, REMARK_MAX),
      group: String(r.group ?? '').trim().slice(0, GROUP_MAX) || DEFAULT_GROUP,
      notify: r.notify === undefined || r.notify === '' ? true : boolOf(r.notify),
    });
    plan.byChain[chain] = (plan.byChain[chain] ?? 0) + 1;
  });
  return plan;
}
