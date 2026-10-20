// Deposit detection: incoming SOL and SPL transfers to an embedded wallet in
// transactions someone else paid for. Transactions the wallet itself paid
// for (its swaps and withdrawals) are never deposits.
//
// Verified on mainnet (scripts/sol-wallets-verify.ts, fixtures in test/fixtures/rpc/real):
// pre/post token balances carry `owner` and `programId` for SPL and Token-2022; account keys
// are the static keys then the lookup tables' writable, then readonly addresses; and a token
// transfer into an account the wallet already has does not list the wallet among the keys
// (only its token account), so the scanner reads the token accounts' signatures too.

import type { Connection } from '@solana/web3.js';
import { accountKeysOf, type TokenBalanceLike, type TxLike } from '../execution/fills';

/**
 * Newest transaction format read here. Mainnet carries v1 transactions (SIMD-0385: no lookup
 * tables, compute budget in the message) besides legacy and v0; asking for less makes the RPC
 * refuse the whole read ("Transaction version (1) is not supported by the requesting client").
 */
export const MAX_TX_VERSION = 1;

export type TxRead = { status: 'ok'; tx: TxLike } | { status: 'missing' } | { status: 'unsupported'; version: number };

/** getTransaction for any transaction a wallet may appear in; a format newer than MAX_TX_VERSION is reported, not thrown. */
export async function readTransaction(connection: Connection, signature: string): Promise<TxRead> {
  try {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' });
    return tx ? { status: 'ok', tx: tx as unknown as TxLike } : { status: 'missing' };
  } catch (err) {
    const m = /transaction version \((\d+)\) is not supported/i.exec(err instanceof Error ? err.message : String(err));
    if (m) return { status: 'unsupported', version: Number(m[1]) };
    throw err;
  }
}

export interface ParsedDeposit {
  /** null = native SOL. */
  mint: string | null;
  raw: bigint;
  decimals: number;
  /** Who sent it: the owner of a token account of the mint that lost what we gained, else the fee payer. */
  from: string | null;
}

/** The deposits `owner` received in a landed transaction (none when it failed or the owner paid for it). */
export function parseDeposits(tx: TxLike, owner: string): ParsedDeposit[] {
  const meta = tx.meta;
  if (!meta || meta.err) return [];
  const keys = accountKeysOf(tx);
  const feePayer = keys[0] ?? null;
  if (!feePayer || feePayer === owner) return [];
  const out: ParsedDeposit[] = [];

  const idx = keys.indexOf(owner);
  if (idx >= 0) {
    const delta = BigInt(meta.postBalances[idx] ?? 0) - BigInt(meta.preBalances[idx] ?? 0);
    if (delta > 0n) out.push({ mint: null, raw: delta, decimals: 9, from: feePayer });
  }

  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  const mints = new Set([...pre, ...post].filter((b) => b.owner === owner).map((b) => b.mint));
  for (const mint of mints) {
    const sum = (list: TokenBalanceLike[], who: (b: TokenBalanceLike) => boolean) =>
      list.filter((b) => b.mint === mint && who(b)).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
    const gained = sum(post, (b) => b.owner === owner) - sum(pre, (b) => b.owner === owner);
    if (gained <= 0n) continue;
    const decimals = [...post, ...pre].find((b) => b.mint === mint)?.uiTokenAmount.decimals ?? 0;
    // The sender: another owner whose balance of the mint dropped.
    let from: string | null = feePayer;
    for (const b of pre) {
      if (b.mint !== mint || !b.owner || b.owner === owner) continue;
      const after = post.find((p) => p.accountIndex === b.accountIndex);
      if (BigInt(b.uiTokenAmount.amount) > BigInt(after?.uiTokenAmount.amount ?? '0')) {
        from = b.owner;
        break;
      }
    }
    out.push({ mint, raw: gained, decimals, from });
  }
  return out;
}

/** Deterministic id: re-scanning the same transaction never records a deposit twice. */
export const depositId = (signature: string, mint: string | null) => `dep_${signature}_${mint ?? 'SOL'}`;
