// Withdrawals from an embedded wallet to a whitelisted address.
//
// Authorization chain, each refusal audited: live mode only, 2FA enabled, a valid TOTP code,
// a whitelisted destination past its activation delay, a per-account rate limit, then the
// balance (SOL: amount <= balance - fee reserve; SPL: amount <= token balance, SOL for the fee
// and the destination's token account rent). The transfer is recorded 'pending' before it is
// signed and 'sent' with its signature before it is broadcast, so a crash at any point leaves a
// record that resumes correctly: 'pending' was never sent; 'sent' is confirmed by signature.
// A retry with the same clientId returns the recorded transfer and never sends twice.

import { randomBytes } from 'node:crypto';
import type { WalletTransfer, WithdrawRequest } from '@trenchscope/shared';
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, SystemProgram, type Connection, type TransactionInstruction, type VersionedTransaction } from '@solana/web3.js';
import { HttpError, type AppContext, type EmbeddedWalletRef, type SignerApi } from '../../context';
import {
  RENT_EXEMPT_MIN_LAMPORTS,
  SIGNATURE_FEE_LAMPORTS,
  TOKEN_ACCOUNT_RENT_LAMPORTS,
  fromBaseUnits,
  lamportsToSol,
  solToLamports,
  toBaseUnits,
} from '../execution/amounts';
import { walletDelta, type TxLike } from '../execution/fills';
import { lanesFor } from '../execution/lanes';
import { confirmSignature, sendSigned, SendRefusedError, type ConfirmOptions, type SendDeps } from '../execution/send';
import { assertSignedAsBuilt, compileV0, computeBudgetInstructions, signatureOf } from '../execution/tx';
import { readTokenBalance } from './balances';

/** SOL kept back for network fees and rent (DepositInfo.feeReserve): never withdrawable, never spent by "max" buys. */
export const FEE_RESERVE_SOL = 0.003;
export const FEE_RESERVE_LAMPORTS = solToLamports(FEE_RESERVE_SOL);
/** A withdrawal bids a small fixed priority fee: it is not racing anyone. */
const WITHDRAW_PRIORITY_LAMPORTS = 10_000n;
const SOL_TRANSFER_COMPUTE_UNITS = 1_000;
const SPL_TRANSFER_COMPUTE_UNITS = 60_000;
/** Per-account limits: 3 a minute, 20 an hour. */
const RATE_LIMITS = [
  { windowMs: 60_000, max: 3 },
  { windowMs: 3_600_000, max: 20 },
];
/** A resumed 'sent' transfer still unknown this long after creation can no longer land (its blockhash expired). */
const RESUME_EXPIRY_MS = 5 * 60_000;

export interface WithdrawalDeps {
  sleep: (ms: number) => Promise<void>;
  /** Wall clock (ms): rate limits and confirmation timeouts. */
  now: () => number;
  fetch: typeof fetch;
  confirm: ConfirmOptions;
}

const defaultDeps = (): WithdrawalDeps => ({
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  fetch: (...args) => fetch(...args),
  confirm: { pollMs: 500, timeoutMs: 60_000, rebroadcastMs: 2000 },
});

export class Withdrawals {
  deps: WithdrawalDeps;
  /** `${accountId}|${clientId}` -> the request in progress. */
  private readonly inflight = new Map<string, Promise<WalletTransfer>>();
  private readonly recent = new Map<string, number[]>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(
    private readonly ctx: AppContext,
    /** Called when a withdrawal reached a final state (re-read balances, push them). */
    private readonly onSettled: (accountId: string) => void,
    deps: Partial<WithdrawalDeps> = {},
  ) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /** Resolves once background confirmations have settled. */
  async idle(): Promise<void> {
    while (this.background.size) await Promise.all([...this.background]);
  }

  request(accountId: string, req: WithdrawRequest, ip: string | null): Promise<WalletTransfer> {
    const key = req.clientId ? `${accountId}|${req.clientId}` : null;
    const pending = key ? this.inflight.get(key) : undefined;
    if (pending) return pending;
    const job = this.handle(accountId, req, ip);
    if (key) {
      this.inflight.set(key, job);
      void job.then(
        () => this.inflight.delete(key),
        () => this.inflight.delete(key),
      );
    }
    return job;
  }

  private reject(accountId: string, ip: string | null, req: WithdrawRequest, status: number, message: string, code: string): HttpError {
    this.ctx.accounts.audit(accountId, 'withdrawal_rejected', { ip, code, to: req.to, mint: req.mint ?? null, amount: req.amount });
    return new HttpError(status, message, code);
  }

  private async handle(accountId: string, req: WithdrawRequest, ip: string | null): Promise<WalletTransfer> {
    const { ctx } = this;
    if (ctx.config.mode !== 'live') throw new HttpError(403, 'withdrawals are not available in demo mode', 'not_available_in_demo');
    if (req.chain !== 'sol') throw new HttpError(400, 'chain: live wallets are Solana only', 'invalid_input');
    if (req.clientId && ctx.store) {
      const done = ctx.store.transferByClientId(accountId, req.clientId);
      if (done) return done;
    }
    const { accounts } = ctx;
    if (!accounts.hasSecondFactor(accountId)) throw this.reject(accountId, ip, req, 403, 'enable two-factor authentication before withdrawing', 'two_factor_required');
    if (!accounts.verifySecondFactor(accountId, req.code)) throw this.reject(accountId, ip, req, 401, 'invalid two-factor code', 'totp_required');
    let to: PublicKey;
    try {
      to = new PublicKey(req.to);
    } catch {
      throw this.reject(accountId, ip, req, 400, 'to: not a valid Solana address', 'invalid_input');
    }
    let mint: PublicKey | null = null;
    if (req.mint) {
      try {
        mint = new PublicKey(req.mint);
      } catch {
        throw this.reject(accountId, ip, req, 400, 'mint: not a valid token address', 'invalid_input');
      }
      if (!PublicKey.isOnCurve(to.toBytes())) throw this.reject(accountId, ip, req, 400, 'to: tokens can only be sent to a wallet address', 'invalid_input');
    }
    if (!accounts.canWithdrawTo(accountId, 'sol', to.toBase58())) {
      throw this.reject(accountId, ip, req, 403, 'destination is not an active whitelisted address', 'address_not_whitelisted');
    }
    this.takeRateLimitSlot(accountId, ip, req);

    const live = ctx.live;
    const connection = live?.connection ?? null;
    const signer = live?.signer ?? null;
    const ref = accounts.walletRef(accountId, 'sol');
    if (!connection || !signer || !ref) throw new HttpError(503, 'wallets are unavailable right now', 'wallets_unavailable');
    if (ref.address === to.toBase58()) throw this.reject(accountId, ip, req, 400, 'to: that is this wallet', 'invalid_input');

    const sent = await lanesFor(live!).run(accountId, () => this.prepareAndSend(accountId, req, ip, { connection, signer, ref, to, mint }));
    if (sent.transfer.status !== 'sent') return sent.transfer;
    return this.confirm(accountId, sent.transfer, sent.lastValidBlockHeight, sent.raw, sent.release, false);
  }

  private takeRateLimitSlot(accountId: string, ip: string | null, req: WithdrawRequest): void {
    const now = this.deps.now();
    const longest = Math.max(...RATE_LIMITS.map((l) => l.windowMs));
    const times = (this.recent.get(accountId) ?? []).filter((t) => now - t < longest);
    for (const { windowMs, max } of RATE_LIMITS) {
      const inWindow = times.filter((t) => now - t < windowMs);
      if (inWindow.length >= max) {
        const retry = Math.max(1, Math.ceil((inWindow[0] + windowMs - now) / 1000));
        this.recent.set(accountId, times);
        const err = this.reject(accountId, ip, req, 429, `too many withdrawals; try again in ${retry}s`, 'rate_limited');
        err.headers = { 'retry-after': String(retry) };
        throw err;
      }
    }
    times.push(now);
    this.recent.set(accountId, times);
  }

  /** In the account's lane: balance checks, record 'pending', sign, record 'sent', broadcast. */
  private async prepareAndSend(
    accountId: string,
    req: WithdrawRequest,
    ip: string | null,
    w: { connection: Connection; signer: SignerApi; ref: EmbeddedWalletRef; to: PublicKey; mint: PublicKey | null },
  ): Promise<{ transfer: WalletTransfer; lastValidBlockHeight: number; raw: Uint8Array; release: () => void }> {
    const { ctx } = this;
    const { connection, signer, ref, to, mint } = w;
    const owner = new PublicKey(ref.address);
    const lanes = lanesFor(ctx.live!);
    const balance = BigInt(await connection.getBalance(owner, 'confirmed'));
    const spendable = balance - lanes.committed(accountId);
    const networkFee = SIGNATURE_FEE_LAMPORTS + WITHDRAW_PRIORITY_LAMPORTS;
    const insufficient = (what: string) => this.reject(accountId, ip, req, 400, `insufficient balance: ${what}`, 'insufficient_balance');

    let instructions: TransactionInstruction[];
    let commitLamports: bigint;
    let amountRaw: bigint;
    let decimals: number;
    let symbol: string;
    if (!mint) {
      decimals = 9;
      symbol = 'SOL';
      amountRaw = toBaseUnits(req.amount, 9);
      if (amountRaw <= 0n) throw this.reject(accountId, ip, req, 400, 'amount: too small', 'invalid_input');
      if (amountRaw > spendable - FEE_RESERVE_LAMPORTS) {
        throw insufficient(`at most ${lamportsToSol(maxBig(0n, spendable - FEE_RESERVE_LAMPORTS))} SOL can be withdrawn (${FEE_RESERVE_SOL} SOL stays for fees)`);
      }
      instructions = [...computeBudgetInstructions(SOL_TRANSFER_COMPUTE_UNITS, WITHDRAW_PRIORITY_LAMPORTS), SystemProgram.transfer({ fromPubkey: owner, toPubkey: to, lamports: amountRaw })];
      commitLamports = amountRaw + networkFee;
    } else {
      const held = await readTokenBalance(connection, owner, mint);
      if (!held || held.raw <= 0n) throw insufficient('no balance of this token');
      decimals = held.decimals;
      symbol = ctx.world.getToken(mint.toBase58())?.symbol ?? 'tokens';
      amountRaw = toBaseUnits(req.amount, decimals);
      if (amountRaw <= 0n) throw this.reject(accountId, ip, req, 400, 'amount: too small', 'invalid_input');
      if (amountRaw > held.raw) throw insufficient(`the wallet holds ${fromBaseUnits(held.raw, decimals)} ${symbol}`);
      const program = new PublicKey(held.program);
      const source = getAssociatedTokenAddressSync(mint, owner, false, program);
      const dest = getAssociatedTokenAddressSync(mint, to, false, program);
      const destExists = !!(await connection.getAccountInfo(dest, 'confirmed'));
      const rent = destExists ? 0n : TOKEN_ACCOUNT_RENT_LAMPORTS;
      if (networkFee + rent > spendable - RENT_EXEMPT_MIN_LAMPORTS) {
        throw insufficient(`${lamportsToSol(networkFee + rent + RENT_EXEMPT_MIN_LAMPORTS)} SOL is needed for the network fee${rent ? ' and the receiving token account' : ''}`);
      }
      instructions = [
        ...computeBudgetInstructions(SPL_TRANSFER_COMPUTE_UNITS, WITHDRAW_PRIORITY_LAMPORTS),
        createAssociatedTokenAccountIdempotentInstruction(owner, dest, to, mint, program),
        createTransferCheckedInstruction(source, mint, dest, owner, amountRaw, decimals, [], program),
      ];
      commitLamports = networkFee + rent;
    }

    const transfer: WalletTransfer = {
      id: `wd_${randomBytes(8).toString('hex')}`,
      chain: 'sol',
      direction: 'withdrawal',
      mint: mint ? mint.toBase58() : null,
      symbol,
      amount: fromBaseUnits(amountRaw, decimals),
      counterparty: to.toBase58(),
      signature: null,
      status: 'pending',
      networkFee: 0,
      createdAt: ctx.world.now,
      confirmedAt: null,
    };
    const save = () => ctx.store?.upsertTransfer(accountId, { ...transfer }, req.clientId);
    save();
    ctx.accounts.audit(accountId, 'withdrawal_requested', { ip, id: transfer.id, to: transfer.counterparty, mint: transfer.mint, amount: amountRaw.toString(), decimals });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = compileV0(owner, blockhash, instructions);
    const built = tx.message.serialize();
    let signed: VersionedTransaction;
    try {
      signed = await signer.signTransaction(ref, tx);
      assertSignedAsBuilt(built, signed, owner);
    } catch (err) {
      this.fail(accountId, transfer, `signing failed: ${err instanceof Error ? err.message : String(err)}`, save);
      return { transfer, lastValidBlockHeight, raw: new Uint8Array(), release: () => {} };
    }
    transfer.signature = signatureOf(signed);
    transfer.status = 'sent';
    save();
    ctx.accounts.audit(accountId, 'withdrawal_sent', { ip, id: transfer.id, signature: transfer.signature });
    const raw = signed.serialize();
    const release = lanes.commit(accountId, commitLamports);
    try {
      await sendSigned(this.sendDeps(), raw, 'rpc', { preflight: true });
    } catch (err) {
      release();
      if (!(err instanceof SendRefusedError)) throw err;
      // Refused before landing (preflight): nothing moved.
      this.fail(accountId, transfer, `refused: ${err.message}`, save);
    }
    return { transfer, lastValidBlockHeight, raw, release };
  }

  private sendDeps(): SendDeps {
    const live = this.ctx.live!;
    return { connection: live.connection!, jitoUrl: null, fetch: this.deps.fetch, sleep: this.deps.sleep, now: this.deps.now };
  }

  private fail(accountId: string, transfer: WalletTransfer, error: string, save: () => void): void {
    transfer.status = 'failed';
    transfer.error = error;
    save();
    this.ctx.accounts.audit(accountId, 'withdrawal_failed', { id: transfer.id, signature: transfer.signature, error });
    this.ctx.accounts.notify(accountId, {
      kind: 'system',
      title: `Withdrawal failed · ${transfer.symbol}`,
      body: error,
      chain: 'sol',
      token: transfer.mint,
      wallet: transfer.counterparty,
      level: 'error',
    });
  }

  /**
   * Wait for a sent withdrawal. Confirmed -> 'confirmed' (or 'failed' with the on-chain error),
   * expired -> 'failed' (it can never land); still unknown at the timeout -> stays 'sent' and is
   * tracked in the background. `lastValidBlockHeight` null (resumed after a restart) expires by age.
   */
  private async confirm(
    accountId: string,
    transfer: WalletTransfer,
    lastValidBlockHeight: number | null,
    raw: Uint8Array | null,
    release: () => void,
    background: boolean,
  ): Promise<WalletTransfer> {
    const { ctx } = this;
    const save = () => ctx.store?.upsertTransfer(accountId, { ...transfer });
    const sig = transfer.signature!;
    const deps = this.sendDeps();
    let final = true;
    try {
      const height = lastValidBlockHeight ?? (await this.expiredHeightByAge(transfer));
      const result = await confirmSignature(
        deps,
        sig,
        height,
        background ? { ...this.deps.confirm, timeoutMs: RESUME_EXPIRY_MS * 2 } : this.deps.confirm,
        raw && raw.length ? () => sendSigned(deps, raw, 'rpc', { preflight: false }) : undefined,
      );
      if (result.status === 'expired') {
        this.fail(accountId, transfer, 'the transaction expired before it landed (nothing was sent)', save);
      } else if (result.status === 'timeout') {
        if (!background) {
          final = false;
          this.track(accountId, transfer, lastValidBlockHeight, raw, release);
        }
        // In the background: leave it 'sent'; the next restart resumes it.
      } else {
        const tx = (await deps.connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)) as TxLike | null;
        const fee = tx?.meta ? lamportsToSol(BigInt(tx.meta.fee)) : 0;
        transfer.networkFee = fee;
        if (result.err) {
          const reason = tx ? (walletDelta(tx, sig, ctx.accounts.walletRef(accountId, 'sol')?.address ?? '', null).error ?? 'transaction failed') : 'transaction failed';
          this.fail(accountId, transfer, reason, save);
        } else {
          transfer.status = 'confirmed';
          transfer.confirmedAt = ctx.world.now;
          delete transfer.error;
          save();
          ctx.accounts.audit(accountId, 'withdrawal_confirmed', { id: transfer.id, signature: sig, slot: result.slot });
          ctx.accounts.notify(accountId, {
            kind: 'system',
            title: `Withdrawal confirmed · ${transfer.symbol}`,
            body: `${transfer.amount} ${transfer.symbol} sent to ${transfer.counterparty}`,
            chain: 'sol',
            token: transfer.mint,
            wallet: transfer.counterparty,
            level: 'success',
          });
        }
      }
      return transfer;
    } finally {
      if (final) {
        release();
        lanesFor(ctx.live!).touch(accountId);
        this.onSettled(accountId);
      }
    }
  }

  private track(accountId: string, transfer: WalletTransfer, lastValidBlockHeight: number | null, raw: Uint8Array | null, release: () => void): void {
    const job = this.confirm(accountId, transfer, lastValidBlockHeight, raw, release, true)
      .catch((err) => console.error('[wallets] withdrawal tracking failed', err))
      .finally(() => this.background.delete(job));
    this.background.add(job);
  }

  /**
   * After a restart the blockhash height is unknown: a transfer older than RESUME_EXPIRY_MS is past
   * any blockhash's life (current height - 1 makes the first unknown status final), a younger one is
   * given until it reaches that age (in blocks at ~400ms).
   */
  private async expiredHeightByAge(transfer: WalletTransfer): Promise<number> {
    const height = await this.ctx.live!.connection!.getBlockHeight('confirmed');
    const ageMs = Math.max(0, this.ctx.world.now - transfer.createdAt);
    if (ageMs >= RESUME_EXPIRY_MS) return height - 1;
    return height + Math.ceil((RESUME_EXPIRY_MS - ageMs) / 400);
  }

  /** Boot: settle transfers a restart interrupted. 'pending' were never broadcast; 'sent' are confirmed by signature. */
  resume(): void {
    const store = this.ctx.store;
    if (!store || !this.ctx.live?.connection) return;
    for (const { accountId, transfer } of store.openTransfers()) {
      if (transfer.direction !== 'withdrawal') continue;
      const save = () => store.upsertTransfer(accountId, { ...transfer });
      if (transfer.status === 'pending' || !transfer.signature) {
        this.fail(accountId, transfer, 'interrupted before it was sent (nothing was sent)', save);
        continue;
      }
      this.track(accountId, transfer, null, null, () => {});
    }
  }
}

const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
