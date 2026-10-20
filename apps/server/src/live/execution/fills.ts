// Reading what a landed transaction did to a wallet: SOL delta of the owner
// (pre/post balances), token delta for (owner, mint) from the pre/post token
// balances, rent locked in token accounts it created, the network fee. Failed
// transactions get a readable reason from their error and program logs.

import type { TransactionError } from '@solana/web3.js';
import { pumpErrorMessage, PUMP_PROGRAM_ID } from './pump';

/** The parts of getTransaction's response (any encoding of the message) this module reads. */
export interface TxLike {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: TransactionError | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalanceLike[] | null;
    postTokenBalances?: TokenBalanceLike[] | null;
    logMessages?: string[] | null;
    loadedAddresses?: { writable: unknown[]; readonly: unknown[] } | null;
  } | null;
  transaction: { message: unknown; signatures?: string[] };
}

export interface TokenBalanceLike {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

/** Account keys in transaction order: static keys, then lookup-table writable, then readonly. */
export function accountKeysOf(tx: TxLike): string[] {
  const msg = tx.transaction.message as { staticAccountKeys?: unknown[]; accountKeys?: unknown[] };
  const statics = msg.staticAccountKeys ?? msg.accountKeys ?? [];
  const loaded = tx.meta?.loadedAddresses;
  const key = (k: unknown) => (typeof k === 'object' && k !== null && 'pubkey' in k ? String((k as { pubkey: unknown }).pubkey) : String(k));
  return [...statics, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])].map(key);
}

export interface WalletDelta {
  signature: string;
  slot: number;
  blockTime: number | null;
  ok: boolean;
  error: string | null;
  /** meta.fee: base + priority fee (lamports). */
  feeLamports: bigint;
  ownerPreLamports: bigint;
  ownerPostLamports: bigint;
  tokenPreRaw: bigint;
  tokenPostRaw: bigint;
  decimals: number | null;
  /** Rent moved into token accounts of the owner this transaction created (refundable, not a cost). */
  rentLamports: bigint;
  /** Lamports `address` received (for checking the platform fee transfer). */
  received(address: string): bigint;
}

const sumRaw = (balances: TokenBalanceLike[] | null | undefined, owner: string, mint: string) =>
  (balances ?? []).filter((b) => b.owner === owner && b.mint === mint).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);

/** What the transaction did to `owner`'s SOL and `mint` balances. */
export function walletDelta(tx: TxLike, signature: string, owner: string, mint: string | null): WalletDelta {
  const meta = tx.meta;
  if (!meta) throw new Error('transaction has no status metadata');
  const keys = accountKeysOf(tx);
  const idx = keys.indexOf(owner);
  if (idx < 0) throw new Error('wallet is not part of the transaction');
  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  let decimals: number | null = null;
  let rent = 0n;
  if (mint) {
    const any = [...post, ...pre].find((b) => b.owner === owner && b.mint === mint);
    decimals = any?.uiTokenAmount.decimals ?? null;
  }
  // Token accounts of the owner that exist after but not before were created (and funded with rent) here.
  for (const b of post) {
    if (b.owner !== owner || pre.some((p) => p.accountIndex === b.accountIndex)) continue;
    rent += BigInt(meta.postBalances[b.accountIndex] ?? 0) - BigInt(meta.preBalances[b.accountIndex] ?? 0);
  }
  const error = meta.err ? describeTxError(meta.err, meta.logMessages ?? null) : null;
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    ok: !meta.err,
    error,
    feeLamports: BigInt(meta.fee),
    ownerPreLamports: BigInt(meta.preBalances[idx]),
    ownerPostLamports: BigInt(meta.postBalances[idx]),
    tokenPreRaw: mint ? sumRaw(pre, owner, mint) : 0n,
    tokenPostRaw: mint ? sumRaw(post, owner, mint) : 0n,
    decimals,
    rentLamports: rent > 0n ? rent : 0n,
    received(address: string) {
      const i = keys.indexOf(address);
      return i < 0 ? 0n : BigInt(meta.postBalances[i] ?? 0) - BigInt(meta.preBalances[i] ?? 0);
    },
  };
}

/** Jupiter aggregator program and its slippage error (SlippageToleranceExceeded = 6001). */
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const JUPITER_SLIPPAGE_CODE = 6001;

/**
 * A readable reason for a failed (or refused) transaction: slippage, balances, expiry, else the
 * program's own error message, else the raw error.
 */
export function describeTxError(err: unknown, logs: string[] | null, programIds: string[] = []): string {
  const text = (logs ?? []).join('\n');
  const errText = typeof err === 'string' ? err : JSON.stringify(err ?? '');
  if (/BlockhashNotFound|blockhash not found/i.test(errText + text)) return 'transaction expired before it landed (nothing was spent)';
  if (/InsufficientFundsForFee/i.test(errText)) return 'insufficient SOL for the network fee';
  if (/InsufficientFundsForRent/i.test(errText + text)) return 'insufficient SOL: the wallet must keep its rent-exempt minimum';
  if (/insufficient lamports/i.test(text)) return 'insufficient SOL balance';
  if (/SlippageToleranceExceeded|TooMuchSolRequired|TooLittleSolReceived|slippage/i.test(text)) return 'slippage exceeded: the price moved past your tolerance';
  if (/insufficient funds/i.test(text)) return 'insufficient token balance';
  const custom = customError(err) ?? customErrorFromLogs(text);
  if (custom) {
    const program = programIds[custom.index] ?? programFromLogs(text);
    if (program === PUMP_PROGRAM_ID || (!program && custom.code >= 6000 && custom.code < 6100 && pumpErrorMessage(custom.code))) {
      if (custom.code === 6002 || custom.code === 6003) return 'slippage exceeded: the price moved past your tolerance';
      if (custom.code === 6005) return 'the bonding curve completed: the token is migrating';
      const msg = pumpErrorMessage(custom.code);
      if (msg) return `pump.fun: ${msg}`;
    }
    if (program === JUPITER_PROGRAM_ID && custom.code === JUPITER_SLIPPAGE_CODE) return 'slippage exceeded: the price moved past your tolerance';
    if (program === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' || program === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
      if (custom.code === 1) return 'insufficient token balance';
    }
    return `transaction failed (instruction ${custom.index}, error ${custom.code})`;
  }
  const lastError = [...(logs ?? [])].reverse().find((l) => /error|failed/i.test(l));
  return lastError ? `transaction failed: ${lastError.replace(/^Program log: /, '')}` : `transaction failed: ${errText}`;
}

function customError(err: unknown): { index: number; code: number } | null {
  const ie = (err as { InstructionError?: [number, unknown] } | null)?.InstructionError;
  if (!Array.isArray(ie)) return null;
  const detail = ie[1] as { Custom?: number } | string;
  if (typeof detail === 'object' && detail && typeof detail.Custom === 'number') return { index: ie[0], code: detail.Custom };
  return null;
}

/** "Program X failed: custom program error: 0x1771" (a refused send carries logs, not the error object). */
function customErrorFromLogs(text: string): { index: number; code: number } | null {
  const m = /Program \w{32,44} failed: custom program error: 0x([0-9a-fA-F]+)/.exec(text);
  return m ? { index: -1, code: parseInt(m[1], 16) } : null;
}

/** The program that failed, from the "Program X failed" log line. */
function programFromLogs(text: string): string | null {
  const m = /Program (\w{32,44}) failed/.exec(text);
  return m ? m[1] : null;
}
