// Live wallets, offline: reconciling chain balances into the World, deposit
// detection from getTransaction fixtures, withdrawals (authorization chain,
// amount checks, transaction contents, states, idempotency, rate limit,
// resume after restart) and the HTTP routes.

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { decodeTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemInstruction, SystemProgram, TransactionMessage, type TransactionInstruction } from '@solana/web3.js';
import type { WalletTransfer } from '@trenchscope/shared';
import { HttpError, sendError } from '../src/context';
import { lanesFor } from '../src/live/execution/lanes';
import type { TxLike } from '../src/live/execution/fills';
import { FEE_RESERVE_SOL, LiveWallets, parseDeposits, registerWalletRoutes } from '../src/live/wallets';
import { addToken, fixture, liveHarness, newAddress, type LiveHarness } from './fixtures/rpc/fake-chain';

function wrig(balance = 1_000_000_000n) {
  const h = liveHarness();
  const user = h.addUser('acc_1');
  const owner = user.ref.address;
  h.conn.setBalance(owner, balance);
  const wallets = new LiveWallets(h.ctx, { sleep: async () => {}, confirm: { pollMs: 0, timeoutMs: 5_000, rebroadcastMs: 0 } });
  wallets.install();
  // landed withdrawals report their fee
  h.conn.onSend = (s) => h.conn.transactions.set(s.signature, { slot: 1, blockTime: null, meta: { err: null, fee: 15_000, preBalances: [0], postBalances: [0] }, transaction: { message: { accountKeys: [owner] } } });
  return { h, wallets, owner, user };
}

const ixsOf = (h: LiveHarness, i = 0): TransactionInstruction[] => TransactionMessage.decompile(h.conn.sent[i].tx.message).instructions;

describe('World.syncWalletBalances (chain -> World)', () => {
  it('follows the chain: native, transfers in/out at the same average cost, new holdings, closed positions, unknown mints', () => {
    const h = liveHarness();
    const { wallet } = h.addUser('acc_1');
    const a = addToken(h.world, { status: 'migrated' });
    const b = addToken(h.world, { status: 'migrated' });
    const gone = addToken(h.world, { status: 'migrated' });
    h.world.recordExternalTrade(a, { wallet: wallet.address, side: 'buy', nativeAmount: 1, tokenAmount: 1000, at: h.world.now, txHash: 'x1' });
    h.world.recordExternalTrade(gone, { wallet: wallet.address, side: 'buy', nativeAmount: 1, tokenAmount: 500, at: h.world.now, txHash: 'x2' });
    const costA = wallet.positions.get(a.address)!.costBasisUsd;
    const unknown = newAddress();

    const res = h.world.syncWalletBalances(wallet, 2.5, new Map([[a.address, 400], [b.address, 7700], [unknown, 5]]));
    expect(wallet.native).toBe(2.5);
    expect(wallet.positions.get(a.address)).toMatchObject({ balance: 400 });
    expect(wallet.positions.get(a.address)!.costBasisUsd).toBeCloseTo(costA * 0.4, 9);
    expect(wallet.positions.get(b.address)).toMatchObject({ balance: 7700, costBasisUsd: 0, buys: 0 });
    expect(b.holders.has(wallet.address)).toBe(true);
    expect(wallet.positions.get(gone.address)).toMatchObject({ balance: 0, costBasisUsd: 0 });
    expect(gone.holders.has(wallet.address)).toBe(false);
    expect(res.unknown).toEqual([unknown]);
    expect(res.changed.sort()).toEqual([a.address, b.address, gone.address].sort());

    // native only: positions untouched
    expect(h.world.syncWalletBalances(wallet, 1, undefined)).toEqual({ changed: [], unknown: [] });
    expect(wallet.positions.get(a.address)!.balance).toBe(400);
  });
});

describe('balance sync', () => {
  it('reads SOL and both token programs into the World, asks the market to track unknown tokens, pushes the balance', async () => {
    const { h, wallets, owner, user } = wrig(2_500_000_000n);
    const known = addToken(h.world, { status: 'migrated' });
    const unknown = newAddress();
    h.conn.setToken(owner, known.address, 1_234_000_000n, 6);
    h.conn.setToken(owner, unknown, 9_000_000n, 6, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    const res = await wallets.sync('acc_1');
    expect(res).toMatchObject({ chain: 'sol', address: owner, nativeBalance: 2.5 });
    expect(user.wallet.native).toBe(2.5);
    expect(user.wallet.positions.get(known.address)?.balance).toBe(1234);
    expect(h.ctx.market.ensureToken).toHaveBeenCalledWith('sol', unknown);
    expect(h.accounts.pushBalance).toHaveBeenCalledWith('acc_1', 'sol');
  });

  it('drops a read that raced one of the account\'s own transactions', async () => {
    const { h, wallets, user } = wrig(2_500_000_000n);
    const release = lanesFor(h.ctx.live!).commit('acc_1', 1n);
    expect(await wallets.sync('acc_1')).toBeNull();
    expect(user.wallet.native).toBe(0);
    release();
    const slow = h.conn.getBalance.bind(h.conn);
    h.conn.getBalance = async (pk) => {
      lanesFor(h.ctx.live!).touch('acc_1'); // a fill confirmed while we were reading
      return slow(pk);
    };
    expect(await wallets.sync('acc_1')).toBeNull();
    expect(user.wallet.native).toBe(0);
  });
});

describe('deposits', () => {
  const vars = () => ({ OWNER: newAddress(), SENDER: newAddress(), MINT: newAddress(), SENDER_ATA: newAddress(), OWNER_ATA: newAddress(), SIG: 's', BLOCKHASH: newAddress() });

  it('parses incoming SOL and SPL transfers others paid for', () => {
    const v = vars();
    expect(parseDeposits(fixture<TxLike>('rpc/tx-deposit-sol.json', v), v.OWNER)).toEqual([{ mint: null, raw: 500_000_000n, decimals: 9, from: v.SENDER }]);
    // the sender paid the new token account's rent: only the tokens are a deposit
    expect(parseDeposits(fixture<TxLike>('rpc/tx-deposit-spl.json', v), v.OWNER)).toEqual([{ mint: v.MINT, raw: 2_500_000_000n, decimals: 6, from: v.SENDER }]);
    // our own transactions (the wallet pays the fee) and failed ones are never deposits
    expect(parseDeposits(fixture<TxLike>('rpc/tx-deposit-sol.json', { ...v, SENDER: v.OWNER, OWNER: newAddress() }), v.OWNER)).toEqual([]);
    const failed = fixture<TxLike>('rpc/tx-deposit-sol.json', v);
    failed.meta!.err = { InstructionError: [0, 'Custom'] } as never;
    expect(parseDeposits(failed, v.OWNER)).toEqual([]);
  });

  it('scans new signatures since the cursor, records each deposit once, notifies, persists the cursor', async () => {
    const { h, wallets, owner } = wrig();
    const v = { ...vars(), OWNER: owner };
    const token = addToken(h.world, { status: 'migrated', address: v.MINT });
    h.conn.signaturesFor.set(owner, [
      { signature: 'sig-spl', err: null, blockTime: 1_760_000_360 },
      { signature: 'sig-failed', err: { InstructionError: [0, 'Custom'] } as never, blockTime: 1_760_000_330 },
      { signature: 'sig-sol', err: null, blockTime: 1_760_000_300 },
    ]);
    h.conn.transactions.set('sig-sol', fixture('rpc/tx-deposit-sol.json', { ...v, SIG: 'sig-sol' }));
    h.conn.transactions.set('sig-spl', fixture('rpc/tx-deposit-spl.json', { ...v, SIG: 'sig-spl' }));

    const found = await wallets.scanDeposits('acc_1');
    expect(found.map((t) => [t.direction, t.mint, t.amount, t.symbol, t.status, t.counterparty])).toEqual([
      ['deposit', null, 0.5, 'SOL', 'confirmed', v.SENDER],
      ['deposit', token.address, 2500, token.symbol, 'confirmed', v.SENDER],
    ]);
    expect(h.store.transfersFor('acc_1', 10)).toHaveLength(2);
    expect(h.accounts.notify).toHaveBeenCalledTimes(2);
    expect(h.store.getState('live-wallets')).toEqual({ version: 1, cursors: { [owner]: 'sig-spl' } });

    // nothing new: nothing recorded twice
    expect(await wallets.scanDeposits('acc_1')).toEqual([]);
    expect(h.accounts.notify).toHaveBeenCalledTimes(2);

    // a later own transaction (a swap) moves the cursor without a deposit
    h.conn.signaturesFor.get(owner)!.unshift({ signature: 'sig-own', err: null, blockTime: 1_760_000_400 });
    h.conn.transactions.set('sig-own', fixture('rpc/tx-deposit-sol.json', { ...v, SENDER: owner, OWNER: newAddress(), SIG: 'sig-own' }));
    expect(await wallets.scanDeposits('acc_1')).toEqual([]);
    expect(h.store.getState('live-wallets')).toEqual({ version: 1, cursors: { [owner]: 'sig-own' } });
  });
});

describe('withdrawals', () => {
  const req = (to: string, patch: Record<string, unknown> = {}) => ({ chain: 'sol' as const, to, amount: 0.5, code: '123456', ...patch });

  it('authorizes step by step: live only, 2FA on, valid code, whitelisted destination, balance minus the fee reserve', async () => {
    const { h, wallets } = wrig();
    const dest = newAddress();
    const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as HttpError);

    const demoCtx = { ...h.ctx, config: { ...h.ctx.config, mode: 'demo' as const } };
    expect(await fail(new LiveWallets(demoCtx).withdrawals.request('acc_1', req(dest), null))).toMatchObject({ status: 403, code: 'not_available_in_demo' });
    expect(await fail(wallets.withdrawals.request('acc_1', req(dest), '1.2.3.4'))).toMatchObject({ status: 403, code: 'two_factor_required' });
    h.accounts.secondFactor.set('acc_1', '123456');
    expect(await fail(wallets.withdrawals.request('acc_1', req(dest, { code: '000000' }), null))).toMatchObject({ status: 401, code: 'totp_required' });
    expect(await fail(wallets.withdrawals.request('acc_1', req(dest), null))).toMatchObject({ status: 403, code: 'address_not_whitelisted' });
    h.accounts.whitelist.add(dest);
    expect(await fail(wallets.withdrawals.request('acc_1', req(dest, { amount: 1 - FEE_RESERVE_SOL + 0.000000001 }), null))).toMatchObject({ status: 400, code: 'insufficient_balance' });
    expect(h.conn.sent).toHaveLength(0);
    const rejected = h.store.audits.filter((a) => a.action === 'withdrawal_rejected').map((a) => a.detail.code);
    expect(rejected).toEqual(['two_factor_required', 'totp_required', 'address_not_whitelisted', 'insufficient_balance']);
    expect(h.store.audits.find((a) => a.action === 'withdrawal_rejected')?.detail.ip).toBe('1.2.3.4');

    const t = await wallets.withdrawals.request('acc_1', req(dest, { amount: 1 - FEE_RESERVE_SOL }), null);
    expect(t.status).toBe('confirmed');
  });

  it('sends exactly the amount in lamports, records pending -> sent -> confirmed, audits each step, and never sends twice per clientId', async () => {
    const { h, wallets, owner } = wrig();
    const dest = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(dest);

    const [a, b] = await Promise.all([
      wallets.withdrawals.request('acc_1', req(dest, { amount: 0.123456789, clientId: 'w-1' }), null),
      wallets.withdrawals.request('acc_1', req(dest, { amount: 0.123456789, clientId: 'w-1' }), null),
    ]);
    expect(b).toBe(a);
    const again = await wallets.withdrawals.request('acc_1', req(dest, { amount: 0.123456789, clientId: 'w-1', code: 'stale' }), null);
    expect(again.id).toBe(a.id);
    expect(h.conn.sent).toHaveLength(1);
    expect(h.conn.sent[0]).toMatchObject({ via: 'rpc', skipPreflight: false });

    const transfer = SystemInstruction.decodeTransfer(ixsOf(h).find((ix) => ix.programId.equals(SystemProgram.programId))!);
    expect(transfer.lamports).toBe(123_456_789n);
    expect(transfer.fromPubkey.toBase58()).toBe(owner);
    expect(transfer.toPubkey.toBase58()).toBe(dest);

    expect(a).toMatchObject({ direction: 'withdrawal', mint: null, symbol: 'SOL', amount: 0.123456789, counterparty: dest, status: 'confirmed', signature: h.conn.sent[0].signature, networkFee: 0.000015 });
    expect(h.store.upserts.filter((u) => u.id === a.id).map((u) => u.status)).toEqual(['pending', 'sent', 'confirmed']);
    expect(h.store.transferByClientId('acc_1', 'w-1')?.id).toBe(a.id);
    expect(h.store.audits.map((x) => x.action)).toEqual(['withdrawal_requested', 'withdrawal_sent', 'withdrawal_confirmed']);
    expect(lanesFor(h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('withdraws SPL tokens with transferChecked, creating the destination token account idempotently (payer: the user)', async () => {
    const { h, wallets, owner } = wrig();
    const dest = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(dest);
    const token = addToken(h.world, { status: 'migrated' });
    h.conn.setToken(owner, token.address, 5_000_000_000n, 6);
    const mint = new PublicKey(token.address);

    await expect(wallets.withdrawals.request('acc_1', req(dest, { mint: token.address, amount: 5000.000001 }), null)).rejects.toMatchObject({ code: 'insufficient_balance' });
    const t = await wallets.withdrawals.request('acc_1', req(dest, { mint: token.address, amount: 1234.5 }), null);
    expect(t).toMatchObject({ status: 'confirmed', mint: token.address, symbol: token.symbol, amount: 1234.5 });
    const ixs = ixsOf(h);
    const create = ixs.find((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))!;
    expect(create.data[0]).toBe(1); // CreateIdempotent
    expect(create.keys[0].pubkey.toBase58()).toBe(owner); // payer
    const destAta = getAssociatedTokenAddressSync(mint, new PublicKey(dest), false, TOKEN_PROGRAM_ID);
    const decoded = decodeTransferCheckedInstruction(ixs.find((ix) => ix.programId.equals(TOKEN_PROGRAM_ID))!, TOKEN_PROGRAM_ID);
    expect(decoded.data).toMatchObject({ amount: 1_234_500_000n, decimals: 6 });
    expect(decoded.keys.source.pubkey.equals(getAssociatedTokenAddressSync(mint, new PublicKey(owner), false, TOKEN_PROGRAM_ID))).toBe(true);
    expect(decoded.keys.destination.pubkey.equals(destAta)).toBe(true);
    expect(decoded.keys.owner.pubkey.toBase58()).toBe(owner);
  });

  it('rate limits per account and refuses bad destinations', async () => {
    const { h, wallets, owner } = wrig(10_000_000_000n);
    const dest = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(dest);
    h.accounts.whitelist.add(owner);
    for (let i = 0; i < 3; i++) await wallets.withdrawals.request('acc_1', req(dest, { amount: 0.01 }), null);
    await expect(wallets.withdrawals.request('acc_1', req(dest, { amount: 0.01 }), null)).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
    const fresh = wrig();
    fresh.h.accounts.secondFactor.set('acc_1', '123456');
    fresh.h.accounts.whitelist.add(fresh.owner);
    await expect(fresh.wallets.withdrawals.request('acc_1', req(fresh.owner), null)).rejects.toMatchObject({ status: 400, code: 'invalid_input' });
    await expect(fresh.wallets.withdrawals.request('acc_1', req('not-an-address'), null)).rejects.toMatchObject({ status: 400, code: 'invalid_input' });
  });

  it('a refused preflight fails the transfer (nothing moved); an expired one too', async () => {
    const { h, wallets } = wrig();
    const dest = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(dest);
    const { SendTransactionError } = await import('@solana/web3.js');
    h.conn.sendError = new SendTransactionError({ action: 'send', signature: '', transactionMessage: 'Transaction simulation failed: insufficient funds for rent', logs: [] });
    const refused = await wallets.withdrawals.request('acc_1', req(dest), null);
    expect(refused).toMatchObject({ status: 'failed', error: expect.stringMatching(/refused/) });
    h.conn.sendError = null;
    h.conn.autoConfirm = false;
    h.conn.blockHeight = 5000;
    const expired = await wallets.withdrawals.request('acc_1', req(dest), null);
    expect(expired).toMatchObject({ status: 'failed', error: expect.stringMatching(/expired/) });
    expect(h.accounts.notify).toHaveBeenCalledWith('acc_1', expect.objectContaining({ level: 'error' }));
  });

  it('resumes after a restart: never-sent transfers fail, sent ones settle by signature', async () => {
    const { h, wallets } = wrig();
    const base: WalletTransfer = { id: 'w', chain: 'sol', direction: 'withdrawal', mint: null, symbol: 'SOL', amount: 0.1, counterparty: newAddress(), signature: null, status: 'pending', networkFee: 0, createdAt: h.world.now, confirmedAt: null };
    h.store.upsertTransfer('acc_1', { ...base, id: 'w-pending' });
    h.store.upsertTransfer('acc_1', { ...base, id: 'w-landed', status: 'sent', signature: 'sig-landed' });
    h.store.upsertTransfer('acc_1', { ...base, id: 'w-lost', status: 'sent', signature: 'sig-lost', createdAt: h.world.now - 10 * 60_000 });
    h.conn.statuses.set('sig-landed', { slot: 3, confirmations: 1, err: null, confirmationStatus: 'finalized' });
    wallets.start();
    await wallets.withdrawals.idle();
    await wallets.stop();
    const status = (id: string) => h.store.transfers.get(id)!.transfer;
    expect(status('w-pending')).toMatchObject({ status: 'failed', error: expect.stringMatching(/before it was sent/) });
    expect(status('w-landed')).toMatchObject({ status: 'confirmed' });
    expect(status('w-lost')).toMatchObject({ status: 'failed', error: expect.stringMatching(/expired/) });
    expect(h.conn.sent).toHaveLength(0); // nothing is ever re-sent
  });
});

describe('wallet routes', () => {
  async function server(mode: 'live' | 'demo') {
    const r = wrig();
    r.h.accounts.resolveToken = (t: string) => (t === 'tok' ? 'acc_1' : null);
    if (mode === 'demo') r.h.ctx.config = { ...r.h.ctx.config, mode: 'demo' };
    const app = Fastify();
    app.setErrorHandler((err, _req, reply) => (err instanceof HttpError ? sendError(reply, err) : reply.status(500).send({ error: String(err) })));
    await registerWalletRoutes(app, r.h.ctx, mode === 'live' ? r.wallets : null);
    const call = async (method: 'GET' | 'POST', url: string, body?: unknown, auth = true) => {
      const res = await app.inject({ method, url, headers: auth ? { authorization: 'Bearer tok' } : {}, payload: body as Record<string, unknown> | undefined });
      return { status: res.statusCode, body: res.json() as Record<string, unknown> };
    };
    return { ...r, app, call };
  }

  it('serves deposit info, transfers, refresh and withdraw in live mode', async () => {
    const s = await server('live');
    expect(await s.call('GET', '/api/wallet/deposit', undefined, false)).toMatchObject({ status: 401 });
    expect(await s.call('GET', '/api/wallet/deposit?chain=sol')).toEqual({ status: 200, body: { chain: 'sol', address: s.owner, feeReserve: FEE_RESERVE_SOL, commitment: 'confirmed' } });
    expect(await s.call('GET', '/api/wallet/deposit?chain=eth')).toMatchObject({ status: 400, body: { code: 'invalid_input' } });
    expect(await s.call('POST', '/api/wallet/refresh', { chain: 'sol' })).toMatchObject({ status: 200, body: { chain: 'sol', nativeBalance: 1 } });
    expect(await s.call('POST', '/api/wallet/withdraw', { chain: 'sol', to: newAddress(), amount: 0.1, code: '123456' })).toMatchObject({ status: 403, body: { code: 'two_factor_required' } });
    expect(await s.call('POST', '/api/wallet/withdraw', { chain: 'sol', to: newAddress(), amount: -1, code: '123456' })).toMatchObject({ status: 400, body: { code: 'invalid_input' } });
    const dest = newAddress();
    s.h.accounts.secondFactor.set('acc_1', '123456');
    s.h.accounts.whitelist.add(dest);
    const ok = await s.call('POST', '/api/wallet/withdraw', { chain: 'sol', to: dest, amount: 0.1, code: '123456', clientId: 'route-1' });
    expect(ok).toMatchObject({ status: 200, body: { status: 'confirmed', counterparty: dest } });
    const list = await s.app.inject({ method: 'GET', url: '/api/wallet/transfers?limit=5', headers: { authorization: 'Bearer tok' } });
    expect(list.json()).toEqual([expect.objectContaining({ id: ok.body.id })]);
    await s.app.close();
  });

  it('answers 403 not_available_in_demo in demo mode', async () => {
    const s = await server('demo');
    for (const [method, url] of [['GET', '/api/wallet/deposit'], ['GET', '/api/wallet/transfers'], ['POST', '/api/wallet/refresh'], ['POST', '/api/wallet/withdraw']] as const) {
      expect(await s.call(method, url, method === 'POST' ? { chain: 'sol' } : undefined)).toMatchObject({ status: 403, body: { code: 'not_available_in_demo' } });
    }
    await s.app.close();
  });
});
