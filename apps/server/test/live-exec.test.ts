// Live execution end to end, offline: the Executor's live venue against a fake
// Solana RPC, a stubbed Jupiter / Jito (documented response shapes, see
// fixtures/jupiter) and pump curve state built from the SDK's own types. Real
// v0 transactions are built and signed with Keypairs, then decompiled and
// checked: fee transfer, tip, slippage bounds, compute budget, routing.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BorshInstructionCoder, type Idl } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemInstruction,
  SystemProgram,
  TransactionMessage,
  type TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import { WSOL_MINT, type SwapReceipt } from '@trenchscope/shared';
import { HttpError } from '../src/context';
import { maxWithSlippage, minWithSlippage } from '../src/live/execution/amounts';
import { JITO_TIP_ACCOUNTS } from '../src/live/execution/jito';
import { lanesFor } from '../src/live/execution/lanes';
import { PUMP_PROGRAM_ID, pumpIdl, quoteCurveBuy, quoteCurveSell, type PumpCurveState } from '../src/live/execution/pump';
import { LIVE_TX_EXPIRED, LiveVenue } from '../src/live/execution/venue';
import { Executor } from '../src/trading/execution';
import { FEE_WALLET, addToken, fakeFetch, fixture, liveHarness, lookupTable, newAddress, type LiveHarness } from './fixtures/rpc/fake-chain';

afterEach(() => {
  vi.useRealTimers();
});

interface Rig {
  h: LiveHarness;
  executor: Executor;
  venue: LiveVenue;
  owner: string;
  vars: Record<string, string>;
  ff: ReturnType<typeof fakeFetch>;
}

/** A live executor over the fake chain with one funded user holding 3 SOL. */
function rig(opts: { quote?: string; swap?: string; tx?: string; signer?: boolean } = {}): Rig {
  const h = liveHarness({ signer: opts.signer });
  const user = h.addUser('acc_1');
  const owner = user.ref.address;
  h.conn.setBalance(owner, 3_000_000_000n);
  const vars: Record<string, string> = {
    OWNER: owner,
    MINT: newAddress(),
    FEE_WALLET,
    WSOL_ATA: newAddress(),
    OWNER_ATA: newAddress(),
    AMM: newAddress(),
    POOL_BASE: newAddress(),
    POOL_QUOTE: newAddress(),
    ALT: newAddress(),
    TIP: JITO_TIP_ACCOUNTS[0],
    BLOCKHASH: newAddress(),
  };
  h.conn.lookupTables.set(vars.ALT, lookupTable(vars.ALT, [vars.POOL_BASE, vars.POOL_QUOTE]));
  const ff = fakeFetch({
    quote: () => fixture(opts.quote ?? 'jupiter/quote-buy.json', vars),
    swapInstructions: () => fixture(opts.swap ?? 'jupiter/swap-instructions-buy.json', vars),
    jito: (body) => ({ jsonrpc: '2.0', id: 1, result: h.conn.record(Buffer.from(body.params[0], 'base64'), 'jito', true) }),
  });
  if (opts.tx) h.conn.onSend = (s) => h.conn.transactions.set(s.signature, fixture(opts.tx!, { ...vars, SIG: s.signature }));
  const executor = new Executor(h.ctx, () => [], 0);
  const venue = executor.venue as LiveVenue;
  venue.deps = { ...venue.deps, fetch: ff.fetch, sleep: async () => {}, random: () => 0, confirm: { pollMs: 0, timeoutMs: 5_000, rebroadcastMs: 0 }, fetchTxAttempts: 3 };
  return { h, executor, venue, owner, vars, ff };
}

/** The sent transaction's instructions, lookup tables resolved. */
function instructionsOf(r: Rig, i = 0): TransactionInstruction[] {
  const sent = r.h.conn.sent[i];
  const tables = sent.tx.message.addressTableLookups.map((l) => r.h.conn.lookupTables.get(l.accountKey.toBase58())!);
  return TransactionMessage.decompile(sent.tx.message, { addressLookupTableAccounts: tables }).instructions;
}

const transfersOf = (ixs: TransactionInstruction[]) =>
  ixs
    .map((ix, i) => ({ ix, i }))
    .filter(({ ix }) => ix.programId.equals(SystemProgram.programId) && ix.data.readUInt32LE(0) === 2)
    .map(({ ix, i }) => ({ i, ...SystemInstruction.decodeTransfer(ix) }));

const swapReq = (token: string, patch: Record<string, unknown> = {}) => ({ chain: 'sol' as const, token, side: 'buy' as const, amount: 1, amountKind: 'native' as const, antiMev: false, slippage: 0.25, ...patch });

describe('live venue selection', () => {
  it('uses the live venue in live mode (the demo keeps the simulator)', () => {
    const r = rig();
    expect(r.executor.venue.kind).toBe('live');
    expect(r.venue.idempotencyWindowMs).toBeGreaterThan(60_000);
  });
});

describe('Jupiter route (migrated tokens)', () => {
  it('buys: one v0 transaction with compute budget, platform fee on SOL in, route via lookup table; public RPC; fill booked like demo', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));

    // the router was asked for exactly this swap
    const quoteReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/quote'))!;
    expect(Object.fromEntries(quoteReq.url.searchParams)).toMatchObject({ inputMint: WSOL_MINT, outputMint: r.vars.MINT, amount: '1000000000', slippageBps: '2500' });
    expect(quoteReq.headers['x-api-key']).toBe('test-key');
    const ixReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/swap-instructions'))!;
    expect(ixReq.body).toMatchObject({ userPublicKey: r.owner, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true });

    // sent once, to public RPC with preflight on
    expect(r.h.conn.sent).toHaveLength(1);
    expect(r.h.conn.sent[0]).toMatchObject({ via: 'rpc', skipPreflight: false });
    expect(r.h.conn.sent[0].tx.message.addressTableLookups).toHaveLength(1);
    const ixs = instructionsOf(r);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(183_000);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ixs[1]).microLamports).toBe((800_000n * 1_000_000n) / 183_000n);
    const transfers = transfersOf(ixs);
    const fee = transfers.find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(8_000_000n); // floor(1e9 * 80 / 10000)
    const swapAt = ixs.findIndex((ix) => ix.programId.toBase58() === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    expect(fee.i).toBeLessThan(swapAt);
    expect(transfers.some((t) => JITO_TIP_ACCOUNTS.includes(t.toPubkey.toBase58()))).toBe(false);
    // Jupiter's own compute budget instructions are replaced by ours
    expect(ixs.filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId))).toHaveLength(2);

    // the fill, parsed from the landed transaction
    expect(receipt.ok).toBe(true);
    expect(receipt.txHash).toBe(r.h.conn.sent[0].signature);
    expect(receipt.nativeAmount).toBeCloseTo(1, 12);
    expect(receipt.tokenAmount).toBe(35_000_000);
    expect(receipt.platformFeeNative).toBeCloseTo(0.008, 12);
    expect(receipt.networkFeeNative).toBeCloseTo(0.000805, 12);
    expect(receipt.trade).toMatchObject({ side: 'buy', wallet: r.owner, txHash: receipt.txHash, tokenAmount: 35_000_000 });
    const wallet = r.h.users.get('acc_1')!.wallet;
    expect(wallet.positions.get(token.address)?.balance).toBe(35_000_000);
    expect(wallet.native).toBeCloseTo(1.98915572, 9);
    expect(r.h.store.fills).toEqual([
      expect.objectContaining({ accountId: 'acc_1', signature: receipt.txHash, side: 'buy', route: 'jupiter', source: 'manual', tokenAmount: 35_000_000 }),
    ]);
    expect(r.h.publishUser).toHaveBeenCalledWith('acc_1', 'fill', receipt);
    expect(r.h.accounts.pushBalance).toHaveBeenCalledWith('acc_1', 'sol');
    expect(r.h.accounts.recordTradeVolume).toHaveBeenCalled();
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('sells with anti-MEV: fee on the minimum SOL out after the unwrap, Jito tip last, sent only to the block engine', async () => {
    const r = rig({ quote: 'jupiter/quote-sell.json', swap: 'jupiter/swap-instructions-sell.json', tx: 'rpc/tx-jupiter-sell.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.setToken(r.owner, token.address, 35_000_000_000_000n, 6);
    const receipt = await r.executor.swap('acc_1', { chain: 'sol', token: token.address, side: 'sell', amount: 100, amountKind: 'percent', antiMev: true, slippage: 0.05 });

    const quoteReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/quote'))!;
    expect(Object.fromEntries(quoteReq.url.searchParams)).toMatchObject({ inputMint: r.vars.MINT, outputMint: WSOL_MINT, amount: '35000000000000', slippageBps: '500' });
    expect(r.h.conn.calls).not.toContain('sendRawTransaction');
    expect(r.h.conn.sent).toHaveLength(1);
    expect(r.h.conn.sent[0].via).toBe('jito');
    const jito = r.ff.requests.find((q) => q.url.pathname.endsWith('/api/v1/transactions'))!;
    expect(jito.url.searchParams.get('bundleOnly')).toBe('true');

    const ixs = instructionsOf(r);
    const transfers = transfersOf(ixs);
    const cleanupAt = ixs.findIndex((ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === 9);
    const fee = transfers.find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(7_220_000n); // floor(otherAmountThreshold 902_500_000 * 80 / 10000)
    expect(fee.i).toBeGreaterThan(cleanupAt);
    const tip = transfers[transfers.length - 1];
    expect(tip.i).toBe(ixs.length - 1);
    expect(tip.toPubkey.toBase58()).toBe(JITO_TIP_ACCOUNTS[0]);
    expect(tip.lamports).toBe(2_000_000n); // the P2 preset's 0.002 SOL tip

    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(0.948, 12);
    expect(receipt.tokenAmount).toBe(35_000_000);
    expect(receipt.platformFeeNative).toBeCloseTo(0.00722, 12);
    expect(receipt.networkFeeNative).toBeCloseTo(0.002805, 12);
    expect(r.h.users.get('acc_1')!.wallet.positions.get(token.address)?.balance ?? 0).toBe(0);
  });

  it('an on-chain failure is a 502 tx_failed with a readable reason (a failed receipt for automation)', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.onSend = (s) => {
      r.h.conn.statuses.set(s.signature, { slot: 1, confirmations: 1, err: { InstructionError: [6, { Custom: 6001 }] }, confirmationStatus: 'confirmed' });
      r.h.conn.transactions.set(s.signature, fixture('rpc/tx-jupiter-failed.json', { ...r.vars, SIG: s.signature }));
    };
    const err = await r.executor.swap('acc_1', swapReq(token.address)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 502, code: 'tx_failed' });
    expect((err as Error).message).toMatch(/slippage exceeded/);
    expect(r.h.store.fills).toHaveLength(0);
    expect(r.h.users.get('acc_1')!.wallet.native).toBeCloseTo(2.999195, 9);
    expect(r.h.accounts.audit).toHaveBeenCalledWith('acc_1', 'swap_failed', expect.objectContaining({ reason: expect.stringMatching(/slippage/) }));

    const automated = await r.executor.submit('acc_1', swapReq(token.address), 'strategy');
    expect(automated.receipt).toMatchObject({ ok: false, error: expect.stringMatching(/slippage exceeded/) });
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('a refused preflight never lands: 502 with the reason, nothing committed', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.sendError = new SendTransactionError({
      action: 'send',
      signature: '',
      transactionMessage: 'Transaction simulation failed: Error processing Instruction 6: custom program error: 0x1771',
      logs: ['Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771'],
    });
    await expect(r.executor.swap('acc_1', swapReq(token.address))).rejects.toMatchObject({ status: 502, code: 'tx_failed', message: expect.stringMatching(/slippage/) });
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('when the market feed books our swap first, the fill still carries our fees into the position', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const prev = r.h.conn.onSend!;
    r.h.conn.onSend = (s) => {
      prev(s);
      // the PumpPortal feed reports the same swap (no fees known to it) before our confirmation reads it
      r.h.world.recordExternalTrade(token, { wallet: r.owner, side: 'buy', nativeAmount: 1, tokenAmount: 35_000_000, at: r.h.world.now, txHash: s.signature });
    };
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(receipt.ok).toBe(true);
    expect(receipt.trade?.txHash).toBe(receipt.txHash);
    expect(token.trades.filter((t) => t.txHash === receipt.txHash)).toHaveLength(1);
    const pos = r.h.users.get('acc_1')!.wallet.positions.get(token.address)!;
    expect(pos.costBasisUsd).toBeCloseTo((1 + 0.008 + 0.000805) * 200, 6);
    expect(pos.balance).toBe(35_000_000);
  });

  it('a malformed fee wallet is a configuration error, not a crash', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.ctx.live!.config.fees.feeWallet = 'not-a-key';
    await expect(r.executor.quote('acc_1', swapReq(token.address))).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/FEE_WALLET_ADDRESS/) });
  });

  it('returns a real quote for /api/trade/quote', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const q = await r.executor.quote('acc_1', swapReq(token.address));
    expect(q).toMatchObject({ route: 'pool', venue: 'Pump.fun Amm', amountIn: 1, expectedOut: 35_000_000, minOut: 26_250_000, slippage: 0.25, priceImpact: 0.0123 });
    expect(q.platformFeeNative).toBeCloseTo(0.008, 12);
    expect(q.networkFeeNative).toBeCloseTo(0.000805, 12);
    expect(r.h.conn.sent).toHaveLength(0);
  });
});

/** Pump curve state as the SDK decodes it (reserves of a fresh pump.fun curve). */
function pumpState(tokenProgram = TOKEN_2022_PROGRAM_ID, ataExists = false): PumpCurveState {
  const Z = PublicKey.default;
  return {
    global: {
      initialized: true,
      authority: Z,
      feeRecipient: Keypair.generate().publicKey,
      feeRecipients: [],
      reservedFeeRecipient: Z,
      reservedFeeRecipients: [],
      feeBasisPoints: new BN(95),
      creatorFeeBasisPoints: new BN(30),
      creatorFeeConfigurable: false,
      tokenTotalSupply: new BN('1000000000000000'),
      buybackFeeRecipients: [],
      buybackBasisPoints: new BN(0),
    } as unknown as PumpCurveState['global'],
    feeConfig: null,
    bondingCurve: {
      virtualTokenReserves: new BN('1073000000000000'),
      virtualQuoteReserves: new BN('30000000000'),
      realTokenReserves: new BN('793100000000000'),
      realQuoteReserves: new BN(0),
      tokenTotalSupply: new BN('1000000000000000'),
      complete: false,
      creator: Keypair.generate().publicKey,
      isMayhemMode: false,
      isCashbackCoin: false,
      quoteMint: Z,
      creatorFeeBps: new BN(0),
    } as unknown as PumpCurveState['bondingCurve'],
    bondingCurveAccountInfo: { data: Buffer.alloc(0), owner: new PublicKey(PUMP_PROGRAM_ID), lamports: 1, executable: false },
    associatedUserAccountInfo: ataExists ? { data: Buffer.alloc(165), owner: tokenProgram, lamports: 2039280, executable: false } : null,
    tokenProgram,
  };
}

/** A landed pump trade as getTransaction reports it (owner, fee wallet, owner token account). */
function pumpTx(owner: string, mint: string, sol: { pre: bigint; post: bigint }, tokens: { pre: bigint | null; post: bigint }, fee = 805_000) {
  const ata = newAddress();
  const tb = (amount: bigint) => [{ accountIndex: 2, mint, owner, programId: TOKEN_2022_PROGRAM_ID.toBase58(), uiTokenAmount: { amount: amount.toString(), decimals: 6 } }];
  return {
    slot: 1,
    blockTime: 1_760_000_000,
    meta: {
      err: null,
      fee,
      preBalances: [Number(sol.pre), 0, tokens.pre === null ? 0 : 2_039_280],
      postBalances: [Number(sol.post), 0, 2_039_280],
      preTokenBalances: tokens.pre === null ? [] : tb(tokens.pre),
      postTokenBalances: tb(tokens.post),
      logMessages: [],
      loadedAddresses: { writable: [], readonly: [] },
    },
    transaction: { signatures: [], message: { accountKeys: [owner, FEE_WALLET, ata] } },
  };
}

describe('pump.fun curve route (tokens still on their curve)', () => {
  const coder = () => new BorshInstructionCoder(pumpIdl() as Idl);

  it('buys exact tokens bounded by a max SOL cost, fee on the SOL in, creating the token account', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'curve', address: r.vars.MINT });
    const state = pumpState();
    r.venue.deps.pump = { load: async () => state };
    const expected = quoteCurveBuy(state, 1_000_000_000n).tokens;
    r.h.conn.onSend = (s) =>
      r.h.conn.transactions.set(s.signature, pumpTx(r.owner, token.address, { pre: 3_000_000_000n, post: 3_000_000_000n - 1_000_000_000n - 8_000_000n - 805_000n - 2_039_280n }, { pre: null, post: expected }));

    const q = await r.executor.quote('acc_1', swapReq(token.address));
    expect(q).toMatchObject({ route: 'curve', venue: 'pump.fun', amountIn: 1 });
    expect(q.expectedOut).toBeCloseTo(Number(expected) / 1e6, 6);
    expect(q.minOut).toBe(q.expectedOut);

    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(r.ff.requests.some((q) => q.url.pathname.includes('/swap/v1/'))).toBe(false);
    const ixs = instructionsOf(r);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(203_000);
    const pumpIx = ixs.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM_ID)!;
    const decoded = coder().decode(pumpIx.data) as { name: string; data: { amount: BN; max_sol_cost: BN } };
    expect(decoded.name).toBe('buy');
    expect(BigInt(decoded.data.amount.toString())).toBe(expected);
    expect(BigInt(decoded.data.max_sol_cost.toString())).toBe(maxWithSlippage(1_000_000_000n, 2500));
    expect(ixs.some((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))).toBe(true);
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(8_000_000n);
    expect(fee.i).toBeLessThan(ixs.indexOf(pumpIx));

    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(1, 12);
    expect(receipt.tokenAmount).toBeCloseTo(Number(expected) / 1e6, 6);
    expect(r.h.store.fills[0]).toMatchObject({ route: 'pump', side: 'buy' });
  });

  it('sells a share of the chain balance for at least the minimum SOL out; fee after the sell', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'curve', address: r.vars.MINT });
    const state = pumpState(TOKEN_2022_PROGRAM_ID, true);
    r.venue.deps.pump = { load: async () => state };
    const held = 34_000_000_000_001n;
    r.h.conn.setToken(r.owner, token.address, held, 6, TOKEN_2022_PROGRAM_ID.toBase58());
    const half = held / 2n;
    const out = quoteCurveSell(state, half).lamports;
    const minOut = minWithSlippage(out, 1000);
    r.h.conn.onSend = (s) => r.h.conn.transactions.set(s.signature, pumpTx(r.owner, token.address, { pre: 3_000_000_000n, post: 3_000_000_000n + out - (minOut * 80n) / 10_000n - 805_000n }, { pre: held, post: held - half }));

    const receipt = await r.executor.swap('acc_1', { chain: 'sol', token: token.address, side: 'sell', amount: 50, amountKind: 'percent', antiMev: false, slippage: 0.1 });
    const ixs = instructionsOf(r);
    const pumpIx = ixs.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM_ID)!;
    const decoded = coder().decode(pumpIx.data) as { name: string; data: { amount: BN; min_sol_output: BN } };
    expect(decoded.name).toBe('sell');
    expect(BigInt(decoded.data.amount.toString())).toBe(half);
    expect(BigInt(decoded.data.min_sol_output.toString())).toBe(minOut);
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe((minOut * 80n) / 10_000n);
    expect(fee.i).toBeGreaterThan(ixs.indexOf(pumpIx));
    expect(receipt.ok).toBe(true);
    expect(receipt.tokenAmount).toBeCloseTo(Number(half) / 1e6, 6);
    expect(receipt.nativeAmount).toBeCloseTo(Number(out) / 1e9, 9);
  });

  it('refuses a completed curve as migrating and falls back to Jupiter for non-SOL curves', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'curve', address: r.vars.MINT });
    const done = pumpState();
    done.bondingCurve.complete = true;
    r.venue.deps.pump = { load: async () => done };
    const res = await r.executor.swap('acc_1', swapReq(token.address));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/migrating/) });
    expect(r.h.conn.sent).toHaveLength(0);

    r.venue.deps.pump = { load: async () => null }; // e.g. a USDC-quoted curve
    const routed = await r.executor.swap('acc_1', swapReq(token.address));
    expect(routed.ok).toBe(true);
    expect(r.h.store.fills[0].route).toBe('jupiter');
  });
});

describe('money safety', () => {
  it('a retried clientId replays the first receipt and never sends twice', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const a = r.executor.swap('acc_1', swapReq(token.address, { clientId: 'c-1' }));
    const b = r.executor.swap('acc_1', swapReq(token.address, { clientId: 'c-1' }));
    const [ra, rb] = await Promise.all([a, b]);
    const rc = await r.executor.swap('acc_1', swapReq(token.address, { clientId: 'c-1' }));
    expect(rb).toBe(ra);
    expect(rc).toBe(ra);
    expect(r.h.conn.sent).toHaveLength(1);
  });

  it('serializes sends per account (never two balance checks racing), other accounts run alongside', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const other = r.h.addUser('acc_2');
    r.h.conn.setBalance(other.ref.address, 3_000_000_000n);
    r.h.signer.delayMs = 15;
    const sends: string[] = [];
    const prev = r.h.conn.onSend!;
    r.h.conn.onSend = (s) => {
      sends.push(`send:${s.tx.message.staticAccountKeys[0].toBase58()}`);
      prev(s);
    };
    const log = r.h.signer.events;
    const owner1 = r.owner;
    await Promise.all([
      r.executor.swap('acc_1', swapReq(token.address, { clientId: 'a' })),
      r.executor.swap('acc_1', swapReq(token.address, { clientId: 'b' })),
      r.executor.swap('acc_2', swapReq(token.address, { clientId: 'c' })).catch(() => null),
    ]);
    const mine = log.filter((e) => e.endsWith(owner1));
    // account 1: the second signing starts only after the first one ended (and was sent)
    expect(mine).toEqual([`sign-start:${owner1}`, `sign-end:${owner1}`, `sign-start:${owner1}`, `sign-end:${owner1}`]);
    // account 2 signed while account 1 was still in its first signing
    const firstEnd = log.indexOf(`sign-end:${owner1}`);
    expect(log.indexOf(`sign-start:${other.ref.address}`)).toBeLessThan(firstEnd);
    expect(sends.filter((s) => s.endsWith(owner1))).toHaveLength(2);
  });

  it('checks SOL net of what unconfirmed sends may still spend; nothing is sent when short', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.setBalance(r.owner, 1_000_000_000n);
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(receipt).toMatchObject({ ok: false, error: expect.stringMatching(/insufficient SOL balance/) });
    expect(r.h.conn.sent).toHaveLength(0);

    r.h.conn.setBalance(r.owner, 3_000_000_000n);
    const release = lanesFor(r.h.ctx.live!).commit('acc_1', 2_500_000_000n);
    expect((await r.executor.swap('acc_1', swapReq(token.address))).error).toMatch(/insufficient SOL balance/);
    release();
  });

  it('needs an RPC, a signer and a provisioned wallet: 503 trading_unavailable (failed receipts for automation)', async () => {
    const noSigner = rig({ signer: false });
    const token = addToken(noSigner.h.world, { status: 'migrated', address: noSigner.vars.MINT });
    await expect(noSigner.executor.swap('acc_1', swapReq(token.address))).rejects.toMatchObject({ status: 503, code: 'trading_unavailable' });
    expect((await noSigner.executor.submit('acc_1', swapReq(token.address), 'copytrade')).receipt).toMatchObject({ ok: false, error: expect.stringMatching(/signer/) });

    const r = rig();
    const t2 = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.users.get('acc_1')!.ref = null as never;
    await expect(r.executor.swap('acc_1', swapReq(t2.address))).rejects.toMatchObject({ status: 503, code: 'trading_unavailable', message: expect.stringMatching(/not provisioned/) });
    r.h.ctx.live!.connection = null;
    await expect(r.executor.quote('acc_1', swapReq(t2.address))).rejects.toMatchObject({ status: 503, code: 'trading_unavailable' });
  });

  it('an expired transaction is a failure that spent nothing; the commitment is released', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.autoConfirm = false;
    r.h.conn.blockHeight = 2000; // past lastValidBlockHeight (1150)
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(receipt).toMatchObject({ ok: false, error: LIVE_TX_EXPIRED });
    expect(r.h.conn.sent).toHaveLength(1);
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('keeps tracking a slow confirmation in the background and books the fill when it lands (no re-send)', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.h.conn.autoConfirm = false;
    let clock = 0;
    r.venue.deps = { ...r.venue.deps, now: () => (clock += 250), sleep: (ms) => new Promise((res) => setTimeout(res, Math.max(1, ms))), confirm: { pollMs: 1, timeoutMs: 2_000, rebroadcastMs: 0 } };
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    const sig = r.h.conn.sent[0].signature;
    expect(receipt).toMatchObject({ ok: false, txHash: sig, error: expect.stringMatching(/still confirming/) });
    expect(r.venue.isTracking(sig)).toBe(true);
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBeGreaterThan(0n);

    r.h.conn.transactions.set(sig, fixture('rpc/tx-jupiter-buy.json', { ...r.vars, SIG: sig }));
    r.h.conn.statuses.set(sig, { slot: 5, confirmations: 1, err: null, confirmationStatus: 'confirmed' });
    await r.venue.idle();
    expect(r.h.conn.sent).toHaveLength(1);
    expect(r.h.publishUser).toHaveBeenCalledWith('acc_1', 'fill', expect.objectContaining({ ok: true, txHash: sig }) as SwapReceipt);
    expect(r.h.store.fills).toHaveLength(1);
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('orders, copy trades and snipes go through the same pipeline (guarded before sending)', async () => {
    const r = rig({ tx: 'rpc/tx-jupiter-buy.json' });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    const cancelled = await r.executor.submit('acc_1', swapReq(token.address), 'strategy', { guard: () => 'order cancelled' });
    expect(cancelled).toMatchObject({ aborted: 'order cancelled', receipt: { ok: false } });
    expect(r.h.conn.sent).toHaveLength(0);
    const filled = await r.executor.submit('acc_1', swapReq(token.address), 'sniper');
    expect(filled.receipt.ok).toBe(true);
    expect(r.h.store.fills[0].source).toBe('sniper');
  });

  it('token launches stay a demo feature', () => {
    const r = rig();
    expect(() => r.executor.fillAtLaunch({} as never)).toThrow(/not available in live/);
  });
});

