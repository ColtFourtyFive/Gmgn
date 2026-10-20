// Live wallets, offline: reconciling chain balances into the World, deposit
// detection from real mainnet getTransaction captures (legacy, v0 with lookup
// tables, v1; SPL and Token-2022), the scanner (token accounts, unreadable
// versions, backlogs), withdrawals (authorization chain, amount checks, rent
// as the cluster states it, Token-2022 extensions, transaction contents,
// states, idempotency, rate limit, resume after restart) and the HTTP routes.

import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  MintLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemInstruction, SystemProgram, TransactionMessage, type Connection, type TransactionInstruction } from '@solana/web3.js';
import type { WalletTransfer } from '@trenchscope/shared';
import { HttpError, sendError } from '../src/context';
import { lanesFor } from '../src/live/execution/lanes';
import { accountKeysOf, type TxLike } from '../src/live/execution/fills';
import { FEE_RESERVE_SOL, LiveWallets, parseDeposits, readChainBalances, registerWalletRoutes } from '../src/live/wallets';
import { rentExemptLamports } from '../src/live/wallets/rent';
import { WithdrawalRefused, planWithdrawal } from '../src/live/wallets/withdrawals';
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

/** The cluster's rent as mainnet states it since 2026 (Rent sysvar: 5080 lamports per byte). */
const liveRent = (h: LiveHarness) => {
  (h.conn as unknown as { getMinimumBalanceForRentExemption: (n: number) => Promise<number> }).getMinimumBalanceForRentExemption = async (n) => (n + 128) * 5080;
};

/** A Token-2022 mint account's data with the given extensions (TLV after the account-type byte). */
function t22MintData(extensions: [ExtensionType, Buffer][]): Buffer {
  const base = Buffer.alloc(MintLayout.span);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 10n ** 15n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, base);
  const tlv = extensions.map(([type, data]) => {
    const head = Buffer.alloc(4);
    head.writeUInt16LE(type, 0);
    head.writeUInt16LE(data.length, 2);
    return Buffer.concat([head, data]);
  });
  return Buffer.concat([base, Buffer.alloc(165 - MintLayout.span), Buffer.from([1]), ...tlv]);
}

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

describe('deposits (real mainnet transactions: test/fixtures/rpc/real)', () => {
  const BINANCE = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
  const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const PUMP_MINT = 'HLoBR4vGmDBforxxTGn6SaBe5BD82cXJmg9FCShYpump';
  const CURVE = 'EXuDsA2orirLPTdsXmqzganJ3w4aHyCFMp1b9tHPztUz';
  const real = (name: string) => fixture<TxLike>(`rpc/real/${name}`);
  const sigOf = (tx: TxLike) => tx.transaction.signatures![0];

  it('SOL from an exchange withdrawal (legacy): each recipient gets its own delta, the payer is the sender', () => {
    const tx = real('tx-sol-transfer-legacy.json');
    expect(parseDeposits(tx, 'FaHEzWE248Et7t8itE766KLdj3UzBo6cbPW8TD3i64Yb')).toEqual([{ mint: null, raw: 346_522_080n, decimals: 9, from: BINANCE }]);
    // a recipient the transfer created (0 lamports before)
    expect(parseDeposits(tx, '8EWQzRsYFGCmfQfgJ4brsyWXdSjWEY4BAqj3FxizPLi2')).toEqual([{ mint: null, raw: 865_831_740n, decimals: 9, from: BINANCE }]);
    // the payer's own transaction is never a deposit; neither is a failed one
    expect(parseDeposits(tx, BINANCE)).toEqual([]);
    const failed = real('tx-sol-transfer-legacy.json');
    failed.meta!.err = { InstructionError: [2, 'Custom'] } as never;
    expect(parseDeposits(failed, 'FaHEzWE248Et7t8itE766KLdj3UzBo6cbPW8TD3i64Yb')).toEqual([]);
  });

  it('SPL into a token account the wallet already has: the wallet is not among the keys, its token balance owner is', () => {
    const tx = real('tx-spl-transfer-existing-account.json');
    const owner = '5cJ1M5YA7pKfN3XmXAos1528P2oeGpn2CDMqAskAYmzR';
    expect(accountKeysOf(tx)).not.toContain(owner);
    expect(accountKeysOf(tx)).toContain('7PPGBufZ86SY3qH4Ptmx4ap2FyiSKaH65etxRnfNzEFm');
    expect(parseDeposits(tx, owner)).toEqual([{ mint: USDT, raw: 9_590_100n, decimals: 6, from: BINANCE }]);
  });

  it('SPL creating the associated account (the sender paid its rent): only the tokens are a deposit', () => {
    const tx = real('tx-spl-transfer-new-ata.json');
    const owner = 'D7onq9G73UEoG7z2So6Q52fwuFZpqSW4sNuERmEL8ei7';
    expect(accountKeysOf(tx)).toContain(owner); // the create instruction names the wallet
    expect(parseDeposits(tx, owner)).toEqual([{ mint: USDC, raw: 111_860_000n, decimals: 6, from: BINANCE }]);
    // the new account's rent is today's 165-byte minimum (5080 lamports per byte), not the pre-2026 2,039,280
    expect(tx.meta!.postBalances[2] - tx.meta!.preBalances[2]).toBe(1_488_440);
  });

  it('Token-2022 through lookup tables (v0): owner and programId on token balances, loaded addresses after the static keys', () => {
    const tx = real('tx-pump-sell-v0-alt.json');
    expect((tx as unknown as { version: number }).version).toBe(0);
    expect(tx.meta!.postTokenBalances!.every((b) => b.owner && b.programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')).toBe(true);
    expect(parseDeposits(tx, CURVE)).toEqual([{ mint: PUMP_MINT, raw: 6_650_268_495_453n, decimals: 6, from: 'EUqDRQpFM6TVk64i1GrGMEejkAHfiZ5VidwBmCvnjHqH' }]);
    // the pump.fun fee recipient is loaded from a lookup table (index 14 = 14 static keys + writable 0)
    const keys = accountKeysOf(tx);
    expect(keys.indexOf('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV')).toBe(14);
    expect(parseDeposits(tx, '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV')).toEqual([{ mint: null, raw: 1_074_370n, decimals: 9, from: 'EUqDRQpFM6TVk64i1GrGMEejkAHfiZ5VidwBmCvnjHqH' }]);
  });

  it('v1 transactions (no lookup tables, compute budget in the message) parse the same way', () => {
    const tx = real('tx-pump-sell-v1.json');
    expect((tx as unknown as { version: number }).version).toBe(1);
    expect((tx.transaction.message as { transactionConfig?: unknown }).transactionConfig).toMatchObject({ computeUnitLimit: expect.any(Number) });
    expect(parseDeposits(tx, CURVE)).toEqual([{ mint: PUMP_MINT, raw: 10_914_275_824_230n, decimals: 6, from: 'HUXT7mw1snjxMrBVPJ9eJxMKgDb36NjDHRCL6FvfhUfM' }]);
  });

  /** A wallet whose embedded address is a real mainnet address (only reads happen in these tests). */
  function realWallet(address: string, balance = 1_000_000_000n) {
    const r = wrig(balance);
    r.h.accounts.walletRef = ((id: string) => (id === 'acc_1' ? { ...r.user.ref, address } : null)) as typeof r.h.accounts.walletRef;
    r.h.conn.setBalance(address, balance);
    r.wallets.touch('acc_1');
    return r;
  }
  const sig = (s: string, err: unknown = null) => ({ signature: s, err: err as never, blockTime: 1_792_530_000 });

  it('scans the wallet since its cursor: records each deposit once, notifies, persists the cursor, and moves past its own transactions', async () => {
    const OWNER = 'FaHEzWE248Et7t8itE766KLdj3UzBo6cbPW8TD3i64Yb';
    const { h, wallets } = realWallet(OWNER);
    const tx = real('tx-sol-transfer-legacy.json');
    h.conn.signaturesFor.set(OWNER, [sig('sig-failed', { InstructionError: [0, 'Custom'] }), sig(sigOf(tx))]);
    h.conn.transactions.set(sigOf(tx), tx);
    const found = await wallets.scanDeposits('acc_1');
    expect(found.map((t) => [t.direction, t.mint, t.amount, t.symbol, t.status, t.counterparty, t.signature])).toEqual([['deposit', null, 0.34652208, 'SOL', 'confirmed', BINANCE, sigOf(tx)]]);
    expect(found[0].createdAt).toBe(tx.blockTime! * 1000);
    expect(h.store.transfersFor('acc_1', 10)).toHaveLength(1);
    expect(h.accounts.notify).toHaveBeenCalledTimes(1);
    expect(h.store.getState('live-wallets')).toEqual({ version: 1, cursors: { [OWNER]: 'sig-failed' } });
    // nothing new: nothing recorded twice
    expect(await wallets.scanDeposits('acc_1')).toEqual([]);
    expect(h.accounts.notify).toHaveBeenCalledTimes(1);
    // a later transaction the wallet paid for moves the cursor without a deposit
    const own = real('tx-sol-transfer-legacy.json');
    h.conn.signaturesFor.get(OWNER)!.unshift(sig('sig-own'));
    h.conn.transactions.set('sig-own', { ...own, transaction: { ...own.transaction, message: { ...(own.transaction.message as object), accountKeys: [OWNER, BINANCE, ...accountKeysOf(own).slice(2)] } } });
    expect(await wallets.scanDeposits('acc_1')).toEqual([]);
    expect(h.store.getState('live-wallets')).toEqual({ version: 1, cursors: { [OWNER]: 'sig-own' } });
  });

  it('finds SPL deposits into existing token accounts through their own signatures (the wallet\'s list does not have them)', async () => {
    const OWNER = '5cJ1M5YA7pKfN3XmXAos1528P2oeGpn2CDMqAskAYmzR';
    const ACCOUNT = '7PPGBufZ86SY3qH4Ptmx4ap2FyiSKaH65etxRnfNzEFm';
    const { h, wallets } = realWallet(OWNER);
    const tx = real('tx-spl-transfer-existing-account.json');
    h.conn.setToken(OWNER, USDT, 9_590_100n, 6);
    h.conn.tokenAccounts.get(OWNER)![0].pubkey = ACCOUNT;
    h.conn.signaturesFor.set(OWNER, []); // as on mainnet: the transfer is not listed for the wallet
    h.conn.signaturesFor.set(ACCOUNT, [sig(sigOf(tx))]);
    h.conn.transactions.set(sigOf(tx), tx);
    await wallets.pass();
    const recorded = h.store.transfersFor('acc_1', 10);
    expect(recorded.map((t) => [t.mint, t.amount, t.symbol, t.counterparty])).toEqual([[USDT, 9.5901, 'tokens', BINANCE]]);
    expect((h.store.getState('live-wallets') as { cursors: Record<string, string> }).cursors).toEqual({ [ACCOUNT]: sigOf(tx) });

    // balance unchanged: the token account is not read again until it moves (or the slow sweep)
    const calls = () => h.conn.calls.filter((c) => c === 'getSignaturesForAddress').length;
    let before = calls();
    await wallets.pass();
    expect(calls() - before).toBe(1); // the wallet only
    h.conn.setToken(OWNER, USDT, 19_590_100n, 6);
    h.conn.tokenAccounts.get(OWNER)![0].pubkey = ACCOUNT;
    before = calls();
    await wallets.pass();
    expect(calls() - before).toBe(2); // the wallet and the moved token account

    // a closed token account forgets its cursor
    h.conn.tokenAccounts.set(OWNER, []);
    await wallets.pass();
    expect((h.store.getState('live-wallets') as { cursors: Record<string, string> }).cursors).toEqual({});
  });

  it('keeps a token account due until its scan caught up (a transaction the RPC cannot return yet)', async () => {
    const OWNER = '5cJ1M5YA7pKfN3XmXAos1528P2oeGpn2CDMqAskAYmzR';
    const ACCOUNT = '7PPGBufZ86SY3qH4Ptmx4ap2FyiSKaH65etxRnfNzEFm';
    const { h, wallets } = realWallet(OWNER);
    const tx = real('tx-spl-transfer-existing-account.json');
    const hold = (raw: bigint) => {
      h.conn.setToken(OWNER, USDT, raw, 6);
      h.conn.tokenAccounts.get(OWNER)![0].pubkey = ACCOUNT;
    };
    hold(1_000n);
    h.conn.signaturesFor.set(ACCOUNT, [sig('sig-old', { InstructionError: [0, 'Custom'] })]);
    await wallets.pass(); // first scan: caught up at sig-old
    // the deposit lands: the balance moves, the signature is listed, getTransaction answers null for now
    hold(9_591_100n);
    h.conn.signaturesFor.get(ACCOUNT)!.unshift(sig(sigOf(tx)));
    await wallets.pass();
    expect(h.store.transfersFor('acc_1', 10)).toEqual([]);
    h.conn.transactions.set(sigOf(tx), tx);
    await wallets.pass(); // balance unchanged since, but the account never caught up: still due
    expect(h.store.transfersFor('acc_1', 10).map((t) => t.signature)).toEqual([sigOf(tx)]);
  });

  it('reads v1 transactions (maxSupportedTransactionVersion 1); a newer format is skipped, never blocking the scan', async () => {
    const { h, wallets } = realWallet(CURVE);
    const v1 = real('tx-pump-sell-v1.json');
    const v0 = real('tx-pump-sell-v0-alt.json');
    h.conn.signaturesFor.set(CURVE, [sig(sigOf(v0)), sig('sig-v2'), sig(sigOf(v1))]);
    h.conn.transactions.set(sigOf(v1), v1);
    h.conn.transactions.set(sigOf(v0), v0);
    const asked: unknown[] = [];
    const read = h.conn.getTransaction.bind(h.conn);
    // As the RPC answers: a version above maxSupportedTransactionVersion is an error, not null.
    (h.conn as unknown as { getTransaction: (s: string, o?: { maxSupportedTransactionVersion?: number }) => Promise<unknown> }).getTransaction = async (s, o) => {
      asked.push(o?.maxSupportedTransactionVersion);
      const version = s === 'sig-v2' ? 2 : ((h.conn.transactions.get(s) as { version?: unknown } | undefined)?.version ?? 0);
      if (typeof version === 'number' && version > (o?.maxSupportedTransactionVersion ?? -1)) {
        throw new Error(`failed to get transaction: Transaction version (${version}) is not supported by the requesting client. Please try the request again with the following configuration parameter: "maxSupportedTransactionVersion": ${version}`);
      }
      return read(s);
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const found = await wallets.scanDeposits('acc_1');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/version 2/));
    warn.mockRestore();
    expect(asked.every((v) => v === 1)).toBe(true);
    expect(found.map((t) => [t.signature, t.mint, t.amount])).toEqual([
      [sigOf(v1), PUMP_MINT, 10_914_275.82423],
      [sigOf(v0), PUMP_MINT, 6_650_268.495453],
    ]);
    expect(h.store.getState('live-wallets')).toEqual({ version: 1, cursors: { [CURVE]: sigOf(v0) } });
  });

  it('catches up a backlog longer than one pass oldest first, skipping nothing between the cursor and the head', async () => {
    const OWNER = 'FaHEzWE248Et7t8itE766KLdj3UzBo6cbPW8TD3i64Yb';
    const { h, wallets } = realWallet(OWNER);
    const tx = real('tx-sol-transfer-legacy.json');
    // 1 cursor + 650 newer signatures (failed ones need no read) with deposits at the oldest, middle and newest
    const list = Array.from({ length: 651 }, (_, i) => sig(`s${i}`, i === 0 || i === 1 || i === 325 || i === 650 ? null : { InstructionError: [0, 'Custom'] })).reverse();
    h.conn.signaturesFor.set(OWNER, list);
    for (const i of [1, 325, 650]) h.conn.transactions.set(`s${i}`, tx);
    h.store.putState('live-wallets', { version: 1, cursors: { [OWNER]: 's0' } });
    wallets.start();
    await wallets.stop();
    expect(await wallets.scanDeposits('acc_1')).toEqual([]); // 500 read and more below: nothing processed yet
    const second = await wallets.scanDeposits('acc_1'); // the older window, up from the cursor (s1..s150)
    expect(second.map((t) => t.signature)).toEqual(['s1']);
    const third = await wallets.scanDeposits('acc_1'); // exactly 500 left: read whole (a 1-signature probe finds nothing below)
    expect(third.map((t) => t.signature)).toEqual(['s325', 's650']);
    expect((h.store.getState('live-wallets') as { cursors: Record<string, string> }).cursors[OWNER]).toBe('s650');
  });
});

describe('balances (real getParsedTokenAccountsByOwner: test/fixtures/rpc/real/token-accounts-by-owner.json)', () => {
  it('sums both token programs per mint, with each account, its program and whether it is frozen', async () => {
    const real = fixture<{ owner: string; spl: { value: { pubkey: string; account: { owner: string; data: unknown } }[] }; token2022: { value: { pubkey: string; account: { owner: string; data: unknown } }[] } }>('rpc/real/token-accounts-by-owner.json');
    const asWeb3 = (v: typeof real.spl.value) => ({ context: { slot: 1 }, value: v.map((a) => ({ pubkey: new PublicKey(a.pubkey), account: { ...a.account, owner: new PublicKey(a.account.owner) } })) });
    const conn = {
      getBalance: async () => 47_244_410_527,
      getParsedTokenAccountsByOwner: async (_o: PublicKey, f: { programId: PublicKey }) => asWeb3(f.programId.equals(TOKEN_PROGRAM_ID) ? real.spl.value : real.token2022.value),
    } as unknown as Connection;
    const b = await readChainBalances(conn, new PublicKey(real.owner));
    expect(b.complete).toBe(true);
    expect(b.lamports).toBe(47_244_410_527n);
    expect(b.tokens.get('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toMatchObject({ raw: 0n, decimals: 6, program: TOKEN_PROGRAM_ID.toBase58() });
    const frozen = b.tokens.get('8KPijodwFchMiz8jVvKsMoJcY2x2rpxmNnupYREJH9LD')!;
    expect(frozen).toMatchObject({ raw: 1_000_000_000n, program: TOKEN_2022_PROGRAM_ID.toBase58(), parts: [{ address: '7ZazqN7mk5fgob3QR5vdyMAkKUPM5vFacAVKbuki11ye', raw: 1_000_000_000n, frozen: true }] });
    expect(b.tokens.get('HLoBR4vGmDBforxxTGn6SaBe5BD82cXJmg9FCShYpump')?.parts).toEqual([{ address: '5dyigpkKoA8XZeyJrttDttzgHa75ZfRQzssf8C4vtVto', raw: 0n, frozen: false }]);
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

  it('withdraws SPL tokens with transferChecked from the account the chain reports, creating the destination account idempotently (payer: the user)', async () => {
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
    // no associated account here: the wallet's account of the mint, as getParsedTokenAccountsByOwner lists it
    expect(decoded.keys.source.pubkey.toBase58()).toBe(h.conn.tokenAccounts.get(owner)![0].pubkey);
    expect(decoded.keys.destination.pubkey.equals(destAta)).toBe(true);
    expect(decoded.keys.owner.pubkey.toBase58()).toBe(owner);
  });

  it('refuses SOL below the rent-exempt minimum to an empty address (the cluster\'s figure), and sends it to a funded one', async () => {
    const { h, wallets } = wrig();
    const empty = newAddress();
    const funded = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(empty);
    h.accounts.whitelist.add(funded);
    h.conn.setBalance(funded, 5_000_000n);
    liveRent(h);
    // mainnet simulation: 600,000 lamports to a new address fails with InsufficientFundsForRent, 650,240 lands
    await expect(wallets.withdrawals.request('acc_1', req(empty, { amount: 0.0006 }), null)).rejects.toMatchObject({ status: 400, code: 'invalid_input', message: expect.stringMatching(/at least 0\.00065024 SOL/) });
    expect(h.conn.sent).toHaveLength(0);
    expect(await wallets.withdrawals.request('acc_1', req(empty, { amount: 0.00065024 }), null)).toMatchObject({ status: 'confirmed' });
    expect(await wallets.withdrawals.request('acc_1', req(funded, { amount: 0.000001 }), null)).toMatchObject({ status: 'confirmed' });
  });

  it('withdraws a Token-2022 pump.fun token (real mint): destination sized from the mint\'s extensions, rent from the cluster', async () => {
    const { h, wallets, owner } = wrig();
    const dest = newAddress();
    h.accounts.secondFactor.set('acc_1', '123456');
    h.accounts.whitelist.add(dest);
    liveRent(h);
    const { address, account } = fixture<{ pumpToken2022Raw: { address: string; account: { lamports: number; data: [string, string] } } }>('rpc/real/mints.json').pumpToken2022Raw;
    const mint = new PublicKey(address);
    h.conn.accounts.set(address, { owner: TOKEN_2022_PROGRAM_ID, lamports: account.lamports, data: Buffer.from(account.data[0], 'base64') });
    h.conn.setToken(owner, address, 5_000_000_000n, 6, TOKEN_2022_PROGRAM_ID.toBase58());
    const ata = getAssociatedTokenAddressSync(mint, new PublicKey(owner), false, TOKEN_2022_PROGRAM_ID);
    h.conn.tokenAccounts.get(owner)![0].pubkey = ata.toBase58();

    const plan = await planWithdrawal(h.ctx.live!.connection!, { owner: new PublicKey(owner), to: new PublicKey(dest), mint, amount: 1000, committed: 0n });
    // metadataPointer + tokenMetadata on the mint; the associated account adds ImmutableOwner: 170 bytes, 1,513,840 lamports
    expect(plan.token).toMatchObject({ destinationExists: false, destinationBytes: 170 });
    expect(plan.rentLamports).toBe(1_513_840n);
    expect(plan.commitLamports).toBe(15_000n + 1_513_840n);

    expect(await wallets.withdrawals.request('acc_1', req(dest, { mint: address, amount: 1000 }), null)).toMatchObject({ status: 'confirmed', amount: 1000 });
    const ixs = ixsOf(h);
    const create = ixs.find((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))!;
    expect(create.keys[5].pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    const decoded = decodeTransferCheckedInstruction(ixs.find((ix) => ix.programId.equals(TOKEN_2022_PROGRAM_ID))!, TOKEN_2022_PROGRAM_ID);
    expect(decoded.data).toMatchObject({ amount: 1_000_000_000n, decimals: 6 });
    expect(decoded.keys.source.pubkey.equals(ata)).toBe(true);
    expect(decoded.keys.destination.pubkey.equals(getAssociatedTokenAddressSync(mint, new PublicKey(dest), false, TOKEN_2022_PROGRAM_ID))).toBe(true);
  });

  it('refuses what a plain transfer cannot move: non-transferable and transfer-hook mints, frozen token accounts', async () => {
    const { h, owner } = wrig();
    const to = new PublicKey(newAddress());
    const plan = (mint: PublicKey) => planWithdrawal(h.ctx.live!.connection!, { owner: new PublicKey(owner), to, mint, amount: 1, committed: 0n });
    for (const [ext, data, message] of [
      [ExtensionType.NonTransferable, Buffer.alloc(0), /cannot be transferred/],
      [ExtensionType.TransferHook, Buffer.alloc(64), /transfer hook/],
    ] as const) {
      const mint = Keypair.generate().publicKey;
      h.conn.accounts.set(mint.toBase58(), { owner: TOKEN_2022_PROGRAM_ID, lamports: 1, data: t22MintData([[ext, data]]) });
      h.conn.setToken(owner, mint.toBase58(), 5_000_000n, 6, TOKEN_2022_PROGRAM_ID.toBase58());
      await expect(plan(mint)).rejects.toThrow(message);
      await expect(plan(mint)).rejects.toBeInstanceOf(WithdrawalRefused);
    }
    // a frozen account as mainnet reports it (state: 'frozen', a real Token-2022 airdrop)
    const real = fixture<{ token2022: { value: { pubkey: string; account: { owner: string; data: unknown } }[] } }>('rpc/real/token-accounts-by-owner.json');
    const frozen = real.token2022.value.find((a) => (a.account.data as { parsed: { info: { state: string } } }).parsed.info.state === 'frozen')!;
    const frozenMint = new PublicKey((frozen.account.data as { parsed: { info: { mint: string } } }).parsed.info.mint);
    h.conn.getParsedTokenAccountsByOwner = (async () => ({ context: { slot: 1 }, value: [{ pubkey: new PublicKey(frozen.pubkey), account: { ...frozen.account, owner: new PublicKey(frozen.account.owner) } }] })) as never;
    await expect(plan(frozenMint)).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/frozen/) });
  });

  it('reads rent from the cluster once an hour, and falls back to the higher pre-2026 rate when it cannot', async () => {
    let asked = 0;
    const conn = { getMinimumBalanceForRentExemption: async (n: number) => (asked++, (n + 128) * 5080) } as unknown as Connection;
    expect(await rentExemptLamports(conn, 0, 1_000)).toBe(650_240n);
    expect(await rentExemptLamports(conn, 0, 2_000)).toBe(650_240n);
    expect(asked).toBe(1);
    expect(await rentExemptLamports(conn, 0, 1_000 + 3_600_000)).toBe(650_240n);
    expect(asked).toBe(2);
    const down = { getMinimumBalanceForRentExemption: async () => Promise.reject(new Error('rpc down')) } as unknown as Connection;
    expect(await rentExemptLamports(down, 165)).toBe(2_039_280n);
    expect(await rentExemptLamports(down, 0)).toBe(890_880n);
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
