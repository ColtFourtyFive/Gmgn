// Sending and confirming signed transactions. A transaction goes either to
// public RPC (preflight on) or, for anti-MEV swaps, only to the Jito block
// engine. Confirmation polls the signature status and the block height: a
// transaction whose blockhash expired (block height past lastValidBlockHeight)
// with no status never landed and never will. While waiting, the same signed
// bytes are rebroadcast to the same destination (same signature: it can land
// at most once). Nothing here ever re-signs with a new blockhash.

import { SendTransactionError, type Connection, type TransactionError } from '@solana/web3.js';
import { JitoSendError, sendViaJito } from './jito';

export type SendRoute = 'rpc' | 'jito';

export interface SendDeps {
  connection: Connection;
  jitoUrl: string | null;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ConfirmOptions {
  /** Poll interval (ms). */
  pollMs: number;
  /** Give up waiting after this long (ms) and report 'timeout' (the caller may keep tracking). */
  timeoutMs: number;
  /** Rebroadcast the same bytes this often (ms); 0 disables. */
  rebroadcastMs: number;
}

export type ConfirmResult =
  | { status: 'confirmed'; slot: number; err: TransactionError | null }
  | { status: 'expired' }
  | { status: 'timeout' };

/** The transaction was refused before landing (preflight simulation failed, block engine rejected it). */
export class SendRefusedError extends Error {
  constructor(
    message: string,
    readonly logs: string[] | null = null,
    readonly txError: unknown = null,
  ) {
    super(message);
  }
}

/**
 * Submit signed bytes. Throws SendRefusedError when the endpoint definitely refused them (preflight
 * simulation failed, block engine rejected them): the transaction cannot land. Resolves with
 * `ambiguous: true` when the request failed in a way that may still have delivered it (network
 * error, timeout): the caller confirms as if sent, and the blockhash expiry settles it.
 */
export async function sendSigned(deps: SendDeps, raw: Uint8Array, route: SendRoute, opts: { preflight: boolean } = { preflight: true }): Promise<{ ambiguous: boolean }> {
  if (route === 'jito') {
    if (!deps.jitoUrl) throw new SendRefusedError('anti-MEV route unavailable: no Jito block engine configured');
    try {
      await sendViaJito(deps.fetch, deps.jitoUrl, raw);
      return { ambiguous: false };
    } catch (err) {
      if (err instanceof JitoSendError && err.ambiguous) return { ambiguous: true };
      throw new SendRefusedError(err instanceof Error ? err.message : String(err));
    }
  }
  try {
    await deps.connection.sendRawTransaction(raw, {
      skipPreflight: !opts.preflight,
      preflightCommitment: 'confirmed',
      // We rebroadcast ourselves (same bytes) while confirming.
      maxRetries: 0,
    });
    return { ambiguous: false };
  } catch (err) {
    const e = err as { message?: string; logs?: unknown; transactionLogs?: unknown; transactionError?: unknown };
    const message = e.message ?? 'transaction refused by RPC';
    // A JSON-RPC error answer (preflight failure, invalid transaction) is definite; a transport failure is not.
    if (!(err instanceof SendTransactionError) && !/failed to send transaction|simulation failed|invalid transaction/i.test(message)) return { ambiguous: true };
    const logs = Array.isArray(e.logs) ? (e.logs as string[]) : Array.isArray(e.transactionLogs) ? (e.transactionLogs as string[]) : null;
    throw new SendRefusedError(message, logs, e.transactionError ?? null);
  }
}

/**
 * Wait for a signature to reach 'confirmed' (or 'finalized'), until its blockhash expires or the
 * timeout passes. `rebroadcast` resends the same bytes; its failures are ignored.
 */
export async function confirmSignature(
  deps: SendDeps,
  signature: string,
  lastValidBlockHeight: number,
  opts: ConfirmOptions,
  rebroadcast?: () => Promise<unknown>,
): Promise<ConfirmResult> {
  const started = deps.now();
  let lastBroadcast = started;
  for (;;) {
    const status = await signatureStatus(deps.connection, signature);
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      return { status: 'confirmed', slot: status.slot, err: status.err };
    }
    // Expiry is only ever concluded from a definite "unknown signature" (null), never from an RPC error.
    if (status === null) {
      const height = await deps.connection.getBlockHeight('confirmed').catch(() => null);
      if (height !== null && height > lastValidBlockHeight) {
        // One last look with history search: it may have landed just before the hash expired.
        const final = await signatureStatus(deps.connection, signature, true);
        if (final && final.confirmationStatus !== 'processed') return { status: 'confirmed', slot: final.slot, err: final.err };
        if (final === null) return { status: 'expired' };
      }
    }
    if (deps.now() - started >= opts.timeoutMs) return { status: 'timeout' };
    if (rebroadcast && opts.rebroadcastMs > 0 && deps.now() - lastBroadcast >= opts.rebroadcastMs) {
      lastBroadcast = deps.now();
      await rebroadcast().catch(() => undefined);
    }
    await deps.sleep(opts.pollMs);
  }
}

/** The signature's status: null when the RPC does not know it, undefined when the RPC call failed. */
async function signatureStatus(connection: Connection, signature: string, searchTransactionHistory = false) {
  try {
    const res = await connection.getSignatureStatuses([signature], { searchTransactionHistory });
    return res.value[0] ?? null;
  } catch {
    return undefined;
  }
}
