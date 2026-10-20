// Assembles one swap into a single v0 transaction, in this order:
//   compute unit limit, compute unit price (the preset's priority fee spread over the limit),
//   [buy] platform fee transfer on the SOL going in,
//   the route's setup, swap and cleanup (wSOL unwrap) instructions,
//   [sell] platform fee transfer on the quote's minimum SOL out (after the unwrap, so the SOL is there),
//   [anti-MEV] the Jito tip, last.
// The transaction is atomic: a failed swap pays neither fee nor tip, only the network fee.

import { createHash, verify as verifySignature } from 'node:crypto';
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

export interface SwapInstructionParts {
  setup: TransactionInstruction[];
  swap: TransactionInstruction[];
  cleanup: TransactionInstruction[];
}

export interface SwapTxPlan {
  owner: PublicKey;
  side: 'buy' | 'sell';
  parts: SwapInstructionParts;
  computeUnits: number;
  /** Total priority fee (lamports) the preset bids; the unit price is derived from it. */
  priorityLamports: bigint;
  platformFee: { wallet: PublicKey; lamports: bigint } | null;
  tip: { account: PublicKey; lamports: bigint } | null;
}

/** Instructions above our route's own: compute budget, fee transfer, tip. */
export const EXTRA_COMPUTE_UNITS = 3000;
const MAX_COMPUTE_UNITS = 1_400_000;

/** Micro-lamports per compute unit so that limit x price <= the priority fee (rounded down). */
export function computeUnitPrice(priorityLamports: bigint, computeUnits: number): bigint {
  if (priorityLamports <= 0n || computeUnits <= 0) return 0n;
  return (priorityLamports * 1_000_000n) / BigInt(computeUnits);
}

export function computeBudgetInstructions(computeUnits: number, priorityLamports: bigint): TransactionInstruction[] {
  const units = Math.min(MAX_COMPUTE_UNITS, Math.max(1, Math.ceil(computeUnits)));
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units })];
  const microLamports = computeUnitPrice(priorityLamports, units);
  if (microLamports > 0n) ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  return ixs;
}

export function transferInstruction(from: PublicKey, to: PublicKey, lamports: bigint): TransactionInstruction {
  return SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
}

export function swapInstructions(plan: SwapTxPlan): TransactionInstruction[] {
  const { owner, side, parts, platformFee, tip } = plan;
  const ixs = computeBudgetInstructions(plan.computeUnits, plan.priorityLamports);
  const fee = platformFee && platformFee.lamports > 0n ? transferInstruction(owner, platformFee.wallet, platformFee.lamports) : null;
  if (fee && side === 'buy') ixs.push(fee);
  ixs.push(...parts.setup, ...parts.swap, ...parts.cleanup);
  if (fee && side === 'sell') ixs.push(fee);
  if (tip && tip.lamports > 0n) ixs.push(transferInstruction(owner, tip.account, tip.lamports));
  return ixs;
}

export function compileV0(payer: PublicKey, blockhash: string, instructions: TransactionInstruction[], lookupTables: AddressLookupTableAccount[] = []): VersionedTransaction {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message(lookupTables);
  return new VersionedTransaction(message);
}

/** The transaction's id: its fee payer's signature (base58). */
export function signatureOf(tx: VersionedTransaction): string {
  return bs58.encode(tx.signatures[0]);
}

// Ed25519 public key as an SPKI DER key (fixed 12-byte prefix + the 32 raw bytes) for node:crypto.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Check what a signer returned before anything is sent: the message must be byte-for-byte the one
 * we built (a signer never gets to change a transaction) and the fee payer's signature must verify.
 */
export function assertSignedAsBuilt(builtMessage: Uint8Array, signed: VersionedTransaction, payer: PublicKey): void {
  const expected = Buffer.from(builtMessage);
  const actual = Buffer.from(signed.message.serialize());
  if (!expected.equals(actual)) throw new Error('signer returned a different transaction');
  const sig = signed.signatures[0];
  if (!sig || sig.every((b) => b === 0)) throw new Error('signer returned an unsigned transaction');
  const key = { key: Buffer.concat([ED25519_SPKI_PREFIX, payer.toBuffer()]), format: 'der' as const, type: 'spki' as const };
  if (!verifySignature(null, actual, key, Buffer.from(sig))) throw new Error('signer returned an invalid signature');
}

/** Short stable digest of a transaction message (audit records reference it). */
export function messageDigest(tx: VersionedTransaction): string {
  return createHash('sha256').update(tx.message.serialize()).digest('hex').slice(0, 16);
}
