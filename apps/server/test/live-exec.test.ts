// Live execution end to end, offline, on data captured from mainnet by
// scripts/sol-exec-verify.ts --record: the Executor's live venue over a fake
// Solana RPC that serves the accounts the venue read on mainnet (pump.fun
// curves, PumpSwap pools: decoded by the real loaders and SDKs), Jupiter
// answering with its recorded lite-api.jup.ag responses (lookup tables
// included), and "landed" transactions that are mainnet simulations of the
// venue's own transactions in getTransaction's shape. Real v0 transactions are
// built and signed with test keypairs, then decompiled and checked: fee
// transfer, tip, slippage bounds, compute budget, routing; fills come from the
// landed balances.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BorshInstructionCoder, type Idl } from '@coral-xyz/anchor';
import { pumpAmmJson } from '@pump-fun/pump-swap-sdk';
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
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
import { JITO_TIP_ACCOUNTS } from '../src/live/execution/jito';
import { lanesFor } from '../src/live/execution/lanes';
import { PUMP_PROGRAM_ID, pumpBondingCurveOf, pumpIdl, pumpVolumeAccumulatorOf } from '../src/live/execution/pump';
import { PUMPSWAP_PROGRAM_ID, poolVolumeAccumulatorOf } from '../src/live/execution/pumpswap';
import { LIVE_TX_EXPIRED, LiveVenue, TransactionTooLargeError, lamportsNeeded } from '../src/live/execution/venue';
import { Executor } from '../src/trading/execution';
import { FEE_WALLET, addToken, fakeFetch, fixture, liveHarness, lookupTable, newAddress, type LiveHarness } from './fixtures/rpc/fake-chain';

afterEach(() => {
  vi.useRealTimers();
});

/** A recorded scenario: the plan's numbers, the accounts the venue read, the simulated landing. */
interface Scenario {
  scenario: Record<'side' | 'route' | 'mint' | 'inRaw' | 'heldRaw' | 'outRaw' | 'minOutRaw' | 'maxInRaw' | 'platformFee' | 'rentLamports' | 'routeLamports' | 'tokens', string> & { slippageBps: number; computeUnits: number };
  accounts: Record<string, { owner: string; lamports: number; data: string } | null>;
  landing: unknown;
}

interface Rig {
  h: LiveHarness;
  executor: Executor;
  venue: LiveVenue;
  owner: string;
  vars: Record<string, string>;
  ff: ReturnType<typeof fakeFetch>;
}

/**
 * A live executor over the fake chain with one funded user holding 3 SOL, presets as the recordings
 * were made (0.0001 SOL priority fee and Jito tip, 10% slippage given per request).
 */
function rig(opts: { jupiter?: 'buy' | 'sell'; landing?: (vars: Record<string, string>) => unknown; signer?: boolean; mint?: string } = {}): Rig {
  const h = liveHarness({ signer: opts.signer });
  const user = h.addUser('acc_1');
  const owner = user.ref.address;
  h.conn.setBalance(owner, 3_000_000_000n);
  const settings = h.accounts.getSettings('acc_1').trade.sol;
  for (const presets of [settings.buyPresets, settings.sellPresets]) for (const p of Object.values(presets)) p.tip = 0.0001;
  const mint = opts.mint ?? newAddress();
  const ownerKey = new PublicKey(owner);
  const vars: Record<string, string> = {
    OWNER: owner,
    MINT: mint,
    FEE_WALLET,
    OWNER_ATA: getAssociatedTokenAddressSync(new PublicKey(mint), ownerKey, true, TOKEN_2022_PROGRAM_ID).toBase58(),
    WSOL_ATA: getAssociatedTokenAddressSync(NATIVE_MINT, ownerKey, true, TOKEN_PROGRAM_ID).toBase58(),
    UVA: pumpVolumeAccumulatorOf(ownerKey).toBase58(),
    UVA_PUMP: pumpVolumeAccumulatorOf(ownerKey).toBase58(),
    UVA_AMM: poolVolumeAccumulatorOf(ownerKey).toBase58(),
    TIP: JITO_TIP_ACCOUNTS[0],
    BLOCKHASH: newAddress(),
  };
  for (const side of ['buy', 'sell'] as const) {
    for (const [key, addresses] of Object.entries(fixture<Record<string, string[]>>(`jupiter/lookup-tables-${side}.json`))) h.conn.lookupTables.set(key, lookupTable(key, addresses));
  }
  const side = opts.jupiter ?? 'buy';
  const ff = fakeFetch({
    quote: () => fixture(`jupiter/quote-${side}.json`, vars),
    swapInstructions: () => fixture(`jupiter/swap-instructions-${side}.json`, vars),
    jito: (body) => ({ jsonrpc: '2.0', id: 1, result: h.conn.record(Buffer.from(body.params[0], 'base64'), 'jito', true) }),
  });
  if (opts.landing) h.conn.onSend = (s) => h.conn.transactions.set(s.signature, opts.landing!({ ...vars, SIG: s.signature }));
  const executor = new Executor(h.ctx, () => [], 0);
  const venue = executor.venue as LiveVenue;
  venue.deps = { ...venue.deps, fetch: ff.fetch, sleep: async () => {}, random: () => 0, confirm: { pollMs: 0, timeoutMs: 5_000, rebroadcastMs: 0 }, fetchTxAttempts: 3 };
  return { h, executor, venue, owner, vars, ff };
}

/** A rig whose chain holds a recorded scenario's accounts, landing the scenario's simulated transaction. */
function scenarioRig(name: string, opts: { signer?: boolean } = {}) {
  const probe = fixture<Scenario>(`rpc/sim-${name}.json`);
  const r = rig({ ...opts, mint: probe.scenario.mint, landing: (vars) => fixture<Scenario>(`rpc/sim-${name}.json`, vars).landing });
  // The volume accumulator a first buy opens: pump.fun's on the curve, pump-amm's on a pool.
  if (name.startsWith('pumpswap')) r.vars.UVA = r.vars.UVA_AMM;
  r.h.conn.loadAccounts(probe.accounts);
  const s = fixture<Scenario>(`rpc/sim-${name}.json`, r.vars);
  return { ...r, s: s.scenario };
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

/** The recordings' request: 0.01 SOL, Jito with a 0.0001 SOL tip, 10% slippage, 0.0001 SOL priority fee. */
const swapReq = (token: string, patch: Record<string, unknown> = {}) => ({ chain: 'sol' as const, token, side: 'buy' as const, amount: 0.01, amountKind: 'native' as const, antiMev: true, slippage: 0.1, priorityFee: 0.0001, ...patch });
const sellReq = (token: string, patch: Record<string, unknown> = {}) => swapReq(token, { side: 'sell', amount: 50, amountKind: 'percent', ...patch });

const big = (v: BN | bigint | number) => BigInt(v.toString());

describe('live venue selection', () => {
  it('uses the live venue in live mode (the demo keeps the simulator)', () => {
    const r = rig();
    expect(r.executor.venue.kind).toBe('live');
    expect(r.venue.idempotencyWindowMs).toBeGreaterThan(60_000);
  });
});

describe('Jupiter route (recorded lite-api.jup.ag responses)', () => {
  it('buys: one v0 transaction with compute budget, platform fee on SOL in, route via its lookup table, Jito tip; fill from the landing', async () => {
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null }; // no canonical pool: Jupiter
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));

    // the router was asked for exactly this swap
    const quoteReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/quote'))!;
    expect(Object.fromEntries(quoteReq.url.searchParams)).toMatchObject({ inputMint: WSOL_MINT, outputMint: r.vars.MINT, amount: '10000000', slippageBps: '1000', swapMode: 'ExactIn' });
    expect(quoteReq.headers['x-api-key']).toBe('test-key');
    const ixReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/swap-instructions'))!;
    expect(ixReq.body).toMatchObject({ userPublicKey: r.owner, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, quoteResponse: { outAmount: '3806559599' } });

    // sent once, to the block engine only
    expect(r.h.conn.sent).toHaveLength(1);
    expect(r.h.conn.calls).not.toContain('sendRawTransaction');
    expect(r.h.conn.sent[0].via).toBe('jito');
    expect(r.h.conn.sent[0].tx.message.addressTableLookups.map((l) => l.accountKey.toBase58())).toEqual(['BbRnvbxKkFEDU85LX7xKyob3BgXYX4dsHNvVFEFTbLiQ']);
    const ixs = instructionsOf(r);
    // Jupiter's simulated limit (100710) plus room for our fee, tip and budget instructions
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(103_710);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ixs[1]).microLamports).toBe((100_000n * 1_000_000n) / 103_710n);
    expect(ixs.filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId))).toHaveLength(2); // Jupiter's own are replaced
    const transfers = transfersOf(ixs);
    const fee = transfers.find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(80_000n); // floor(0.01 SOL * 80 / 10000)
    const swapAt = ixs.findIndex((ix) => ix.programId.toBase58() === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    expect(fee.i).toBeLessThan(swapAt);
    const tip = transfers[transfers.length - 1];
    expect(tip).toMatchObject({ i: ixs.length - 1, lamports: 100_000n });
    expect(tip.toPubkey.toBase58()).toBe(JITO_TIP_ACCOUNTS[0]);

    // the fill, read from the landing: the route took exactly 0.01 SOL; the ATA and the pump-amm volume
    // accumulator Jupiter's PumpSwap step opened are rent, and the closed wSOL account's refund is not proceeds
    expect(receipt.ok).toBe(true);
    expect(receipt.txHash).toBe(r.h.conn.sent[0].signature);
    expect(receipt.nativeAmount).toBeCloseTo(0.01, 12);
    expect(receipt.tokenAmount).toBeCloseTo(3602.664396, 9);
    expect(receipt.platformFeeNative).toBeCloseTo(0.00008, 12);
    expect(receipt.networkFeeNative).toBeCloseTo(0.000205, 12); // meta.fee 105000 + tip 100000
    expect(receipt.trade).toMatchObject({ side: 'buy', wallet: r.owner, txHash: receipt.txHash });
    const wallet = r.h.users.get('acc_1')!.wallet;
    expect(wallet.positions.get(token.address)?.balance).toBeCloseTo(3602.664396, 9);
    expect(wallet.native).toBeCloseTo(0.246066, 9);
    expect(r.h.store.fills).toEqual([expect.objectContaining({ accountId: 'acc_1', signature: receipt.txHash, side: 'buy', route: 'jupiter', source: 'manual' })]);
    expect(r.h.publishUser).toHaveBeenCalledWith('acc_1', 'fill', receipt);
    expect(r.h.accounts.pushBalance).toHaveBeenCalledWith('acc_1', 'sol');
    expect(r.h.accounts.recordTradeVolume).toHaveBeenCalled();
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('sells: fee on the minimum SOL out after the unwrap, Jito tip last; proceeds from the landing', async () => {
    const r = rig({ jupiter: 'sell', landing: (vars) => fixture('rpc/tx-jupiter-sell.json', vars) });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null };
    r.h.conn.setToken(r.owner, token.address, 50_682_035_901n, 6, TOKEN_2022_PROGRAM_ID.toBase58());
    const receipt = await r.executor.swap('acc_1', sellReq(token.address));

    const quoteReq = r.ff.requests.find((q) => q.url.pathname.endsWith('/quote'))!;
    expect(Object.fromEntries(quoteReq.url.searchParams)).toMatchObject({ inputMint: r.vars.MINT, outputMint: WSOL_MINT, amount: '25341017950', slippageBps: '1000' });
    expect(r.h.conn.sent[0].via).toBe('jito');
    const ixs = instructionsOf(r);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(96_400);
    const transfers = transfersOf(ixs);
    const cleanupAt = ixs.findIndex((ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === 9);
    const fee = transfers.find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(181_471n); // floor(otherAmountThreshold 22683996 * 80 / 10000)
    expect(fee.i).toBeGreaterThan(cleanupAt);
    expect(transfers[transfers.length - 1]).toMatchObject({ i: ixs.length - 1, lamports: 100_000n });

    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(0.025204439, 12);
    expect(receipt.tokenAmount).toBeCloseTo(25341.01795, 9);
    expect(receipt.platformFeeNative).toBeCloseTo(0.000181471, 12);
    expect(receipt.networkFeeNative).toBeCloseTo(0.000205, 12);
  });

  it('an on-chain failure (a real Jupiter slippage failure) is a 502 tx_failed with a readable reason', async () => {
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-failed.json', vars) });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null };
    const landed = fixture<{ meta: { postBalances: number[] } }>('rpc/tx-jupiter-failed.json');
    r.h.conn.onSend = (s) => {
      r.h.conn.statuses.set(s.signature, { slot: 1, confirmations: 1, err: { InstructionError: [3, { Custom: 6001 }] }, confirmationStatus: 'confirmed' });
      r.h.conn.transactions.set(s.signature, fixture('rpc/tx-jupiter-failed.json', { ...r.vars, SIG: s.signature }));
    };
    const err = await r.executor.swap('acc_1', swapReq(token.address, { antiMev: false })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 502, code: 'tx_failed', message: expect.stringMatching(/slippage exceeded/) });
    expect(r.h.store.fills).toHaveLength(0);
    expect(r.h.users.get('acc_1')!.wallet.native).toBeCloseTo(landed.meta.postBalances[0] / 1e9, 9);
    expect(r.h.accounts.audit).toHaveBeenCalledWith('acc_1', 'swap_failed', expect.objectContaining({ reason: expect.stringMatching(/slippage/) }));

    const automated = await r.executor.submit('acc_1', swapReq(token.address, { antiMev: false }), 'strategy');
    expect(automated.receipt).toMatchObject({ ok: false, error: expect.stringMatching(/slippage exceeded/) });
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('a route that fails in Jupiter\'s own simulation is refused before signing (a failed receipt, not an error)', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null };
    const ff = fakeFetch({
      quote: () => fixture('jupiter/quote-buy.json', r.vars),
      swapInstructions: () => ({ ...fixture<object>('jupiter/swap-instructions-buy.json', r.vars), computeUnitLimit: 1_400_000, simulationError: { errorCode: 'TRANSACTION_ERROR', error: 'Error processing Instruction 2: custom program error: 0x1' } }),
    });
    r.venue.deps.fetch = ff.fetch;
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(receipt).toMatchObject({ ok: false, error: expect.stringMatching(/insufficient balance/) });
    expect(r.h.signer.signed).toHaveLength(0);
    expect(r.h.conn.sent).toHaveLength(0);
  });

  it('a refused preflight never lands: 502 with the reason, nothing committed', async () => {
    const r = rig();
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null };
    r.h.conn.sendError = new SendTransactionError({
      action: 'send',
      signature: '',
      transactionMessage: 'Transaction simulation failed: Error processing Instruction 6: custom program error: 0x1771',
      logs: ['Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771'],
    });
    await expect(r.executor.swap('acc_1', swapReq(token.address, { antiMev: false }))).rejects.toMatchObject({ status: 502, code: 'tx_failed', message: expect.stringMatching(/slippage/) });
    expect(r.h.conn.sent).toHaveLength(0);
    expect(lanesFor(r.h.ctx.live!).committed('acc_1')).toBe(0n);
  });

  it('when the market feed books our swap first, the fill still carries our fees into the position', async () => {
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
    const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
    r.venue.deps.pumpSwap = { load: async () => null };
    const prev = r.h.conn.onSend!;
    r.h.conn.onSend = (s) => {
      prev(s);
      // the PumpPortal feed reports the same swap (no fees known to it) before our confirmation reads it
      r.h.world.recordExternalTrade(token, { wallet: r.owner, side: 'buy', nativeAmount: 0.01, tokenAmount: 3602.664396, at: r.h.world.now, txHash: s.signature });
    };
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(receipt.ok).toBe(true);
    expect(receipt.trade?.txHash).toBe(receipt.txHash);
    expect(token.trades.filter((t) => t.txHash === receipt.txHash)).toHaveLength(1);
    const pos = r.h.users.get('acc_1')!.wallet.positions.get(token.address)!;
    expect(pos.costBasisUsd).toBeCloseTo((0.01 + 0.00008 + 0.000205) * 200, 6);
    expect(pos.balance).toBeCloseTo(3602.664396, 9);
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
    r.venue.deps.pumpSwap = { load: async () => null };
    const q = await r.executor.quote('acc_1', swapReq(token.address));
    expect(q).toMatchObject({ route: 'pool', venue: 'Pump.fun Amm', amountIn: 0.01, expectedOut: 3806.559599, minOut: 3425.90364, slippage: 0.1 });
    expect(q.priceImpact).toBeCloseTo(0.0270214565682, 9);
    expect(q.platformFeeNative).toBeCloseTo(0.00008, 12);
    expect(q.networkFeeNative).toBeCloseTo(0.000205, 12);
    expect(r.h.conn.sent).toHaveLength(0);
  });
});

describe('pump.fun curve route (accounts recorded on mainnet, decoded by the SDK)', () => {
  const coder = () => new BorshInstructionCoder(pumpIdl() as Idl);

  it('buys exact tokens bounded by a max SOL cost; a first buy opens the token account and the volume accumulator (rent)', async () => {
    const r = scenarioRig('pump-buy');
    const token = addToken(r.h.world, { status: 'curve', address: r.s.mint });
    const q = await r.executor.quote('acc_1', swapReq(token.address));
    expect(q).toMatchObject({ route: 'curve', venue: 'pump.fun', amountIn: 0.01 });
    expect(q.expectedOut).toBeCloseTo(Number(r.s.outRaw) / 1e6, 6);
    expect(q.minOut).toBe(q.expectedOut);
    const plan = await r.venue.plan(r.executor.ticket('acc_1', swapReq(token.address), 'manual'), r.h.conn.asConnection(), new PublicKey(r.owner));
    expect(plan.outRaw).toBe(BigInt(r.s.outRaw)); // the SDK's curve math on the recorded reserves
    // 1513840 (Token-2022 account) + 1346200 (volume accumulator) + 650240 (a launch's unfunded creator
    // vault, which the first buyer funds outside max_sol_cost)
    expect(plan.rentLamports).toBe(1_513_840n + 1_346_200n + 650_240n);
    expect(lamportsNeeded(plan)).toBe(11_000_000n + 80_000n + 5000n + 100_000n + 100_000n + 3_510_280n);

    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(r.ff.requests.some((x) => x.url.pathname.includes('/swap/v1/'))).toBe(false);
    const ixs = instructionsOf(r);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(r.s.computeUnits);
    const pumpIx = ixs.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM_ID)!;
    expect(pumpIx.keys).toHaveLength(18); // 16 + bonding-curve v2 PDA + buyback fee recipient
    const decoded = coder().decode(pumpIx.data) as { name: string; data: { amount: BN; max_sol_cost: BN } };
    expect(decoded.name).toBe('buy');
    expect(big(decoded.data.amount)).toBe(BigInt(r.s.outRaw));
    expect(big(decoded.data.max_sol_cost)).toBe(BigInt(r.s.maxInRaw));
    expect(ixs.some((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))).toBe(true);
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(80_000n);
    expect(fee.i).toBeLessThan(ixs.indexOf(pumpIx));

    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(0.01, 12); // the accumulator's rent is not part of the price
    expect(receipt.tokenAmount).toBeCloseTo(Number(r.s.tokens) / 1e6, 6);
    expect(receipt.networkFeeNative).toBeCloseTo(0.000205, 12);
    expect(r.h.store.fills[0]).toMatchObject({ route: 'pump', side: 'buy' });
  });

  it('sells a share of the chain balance for at least the minimum SOL out; fee after the sell', async () => {
    const r = scenarioRig('pump-sell');
    const token = addToken(r.h.world, { status: 'curve', address: r.s.mint });
    r.h.conn.setToken(r.owner, token.address, BigInt(r.s.heldRaw), 6, TOKEN_2022_PROGRAM_ID.toBase58());
    const receipt = await r.executor.swap('acc_1', sellReq(token.address));
    const ixs = instructionsOf(r);
    const pumpIx = ixs.find((ix) => ix.programId.toBase58() === PUMP_PROGRAM_ID)!;
    const decoded = coder().decode(pumpIx.data) as { name: string; data: { amount: BN; min_sol_output: BN } };
    expect(decoded.name).toBe('sell');
    expect(big(decoded.data.amount)).toBe(BigInt(r.s.inRaw));
    expect(big(decoded.data.min_sol_output)).toBe(BigInt(r.s.minOutRaw));
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(BigInt(r.s.platformFee));
    expect(fee.i).toBeGreaterThan(ixs.indexOf(pumpIx));
    expect(receipt.ok).toBe(true);
    expect(receipt.tokenAmount).toBeCloseTo(Number(r.s.inRaw) / 1e6, 6);
    expect(receipt.nativeAmount).toBeCloseTo(Number(r.s.routeLamports) / 1e9, 9);
    expect(receipt.platformFeeNative).toBeCloseTo(Number(r.s.platformFee) / 1e9, 12);
  });

  it('a completed curve is "migrating" until its canonical pool exists, then trades on the pool', async () => {
    const buy = fixture<Scenario>('rpc/sim-pump-buy.json');
    const curveKey = pumpBondingCurveOf(new PublicKey(buy.scenario.mint)).toBase58();
    const completed = (data: string) => {
      const bytes = Buffer.from(data, 'base64');
      bytes[48] = 1; // BondingCurve.complete, after the discriminator and five u64 fields
      return bytes.toString('base64');
    };
    const r = scenarioRig('pump-buy');
    const token = addToken(r.h.world, { status: 'curve', address: r.s.mint });
    r.h.conn.loadAccounts({ [curveKey]: { ...buy.accounts[curveKey]!, data: completed(buy.accounts[curveKey]!.data) } });
    const res = await r.executor.swap('acc_1', swapReq(token.address));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/migrating/) });
    expect(r.h.conn.sent).toHaveLength(0);

    // The PumpSwap scenario's mint, still listed as on its curve (the feed has not seen the migration):
    // the same completed curve under its PDA, and the recorded pool.
    const p = scenarioRig('pumpswap-buy');
    const t2 = addToken(p.h.world, { status: 'curve', address: p.s.mint });
    const ownCurve = pumpBondingCurveOf(new PublicKey(p.s.mint)).toBase58();
    p.h.conn.loadAccounts({ ...buy.accounts, [ownCurve]: { ...buy.accounts[curveKey]!, data: completed(buy.accounts[curveKey]!.data) } });
    const plan = await p.venue.plan(p.executor.ticket('acc_1', swapReq(t2.address), 'manual'), p.h.conn.asConnection(), new PublicKey(p.owner));
    expect(plan).toMatchObject({ route: 'pumpswap', outRaw: BigInt(p.s.outRaw) });
  });

  it('non-SOL curves (a coin quoted in another pump coin) go to Jupiter', async () => {
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
    const token = addToken(r.h.world, { status: 'curve', address: r.vars.MINT });
    r.venue.deps.pump = { load: async () => null };
    const routed = await r.executor.swap('acc_1', swapReq(token.address));
    expect(routed.ok).toBe(true);
    expect(r.h.store.fills[0].route).toBe('jupiter');
  });
});

describe('PumpSwap route (migrated pump.fun tokens, pool accounts recorded on mainnet)', () => {
  const coder = () => new BorshInstructionCoder(pumpAmmJson as unknown as Idl);

  it('buys exact tokens on the canonical pool bounded by a max SOL cost, wrapping and unwrapping SOL', async () => {
    const r = scenarioRig('pumpswap-buy');
    const token = addToken(r.h.world, { status: 'migrated', address: r.s.mint });
    const q = await r.executor.quote('acc_1', swapReq(token.address));
    expect(q).toMatchObject({ route: 'pool', venue: 'PumpSwap', amountIn: 0.01 });
    expect(q.expectedOut).toBeCloseTo(Number(r.s.outRaw) / 1e6, 6);
    const plan = await r.venue.plan(r.executor.ticket('acc_1', swapReq(token.address), 'manual'), r.h.conn.asConnection(), new PublicKey(r.owner));
    expect(plan).toMatchObject({ route: 'pumpswap', outRaw: BigInt(r.s.outRaw), maxInRaw: 11_000_000n });
    // token account + volume accumulator + the wrapped-SOL account while the swap runs
    expect(plan.rentLamports).toBe(1_513_840n + 1_346_200n + 1_488_440n);

    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(r.ff.requests).toHaveLength(1); // the Jito send only: no Jupiter
    const ixs = instructionsOf(r);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(203_000);
    const poolIx = ixs.find((ix) => ix.programId.toBase58() === PUMPSWAP_PROGRAM_ID)!;
    const decoded = coder().decode(poolIx.data) as { name: string; data: { base_amount_out: BN; max_quote_amount_in: BN } };
    expect(decoded.name).toBe('buy');
    expect(big(decoded.data.base_amount_out)).toBe(BigInt(r.s.outRaw));
    expect(big(decoded.data.max_quote_amount_in)).toBe(11_000_000n);
    const wrap = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === r.vars.WSOL_ATA)!;
    expect(wrap.lamports).toBe(11_000_000n);
    const close = ixs.findIndex((ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === 9);
    expect(close).toBeGreaterThan(ixs.indexOf(poolIx));
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee).toMatchObject({ lamports: 80_000n });
    expect(fee.i).toBeLessThan(ixs.indexOf(poolIx));

    // the recorded buy cost 10014015 lamports (the pool moved between quote and simulation, within the bound)
    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(Number(r.s.routeLamports) / 1e9, 12);
    expect(receipt.tokenAmount).toBeCloseTo(Number(r.s.tokens) / 1e6, 6);
    expect(r.h.store.fills[0]).toMatchObject({ route: 'pumpswap', side: 'buy' });
  });

  it('sells on the pool for at least the minimum SOL out, unwrapped before the platform fee', async () => {
    const r = scenarioRig('pumpswap-sell');
    const token = addToken(r.h.world, { status: 'migrated', address: r.s.mint });
    r.h.conn.setToken(r.owner, token.address, BigInt(r.s.heldRaw), 6, TOKEN_2022_PROGRAM_ID.toBase58());
    const receipt = await r.executor.swap('acc_1', sellReq(token.address));
    const ixs = instructionsOf(r);
    const poolIx = ixs.find((ix) => ix.programId.toBase58() === PUMPSWAP_PROGRAM_ID)!;
    const decoded = coder().decode(poolIx.data) as { name: string; data: { base_amount_in: BN; min_quote_amount_out: BN } };
    expect(decoded.name).toBe('sell');
    expect(big(decoded.data.base_amount_in)).toBe(BigInt(r.s.inRaw));
    expect(big(decoded.data.min_quote_amount_out)).toBe(BigInt(r.s.minOutRaw));
    const close = ixs.findIndex((ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === 9);
    const fee = transfersOf(ixs).find((t) => t.toPubkey.toBase58() === FEE_WALLET)!;
    expect(fee.lamports).toBe(BigInt(r.s.platformFee));
    expect(fee.i).toBeGreaterThan(close);
    expect(receipt.ok).toBe(true);
    expect(receipt.nativeAmount).toBeCloseTo(Number(r.s.routeLamports) / 1e9, 12);
    expect(receipt.tokenAmount).toBeCloseTo(Number(r.s.inRaw) / 1e6, 6);
  });

  it('falls back to Jupiter when there is no pool, the pool cannot be read, or its swap does not fit one transaction', async () => {
    for (const load of [async () => null, async () => Promise.reject(new Error('429 Too Many Requests'))]) {
      const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
      const token = addToken(r.h.world, { status: 'migrated', address: r.vars.MINT });
      r.venue.deps.pumpSwap = { load };
      const receipt = await r.executor.swap('acc_1', swapReq(token.address));
      expect(receipt.ok).toBe(true);
      expect(r.h.store.fills[0].route).toBe('jupiter');
    }

    const r = scenarioRig('pumpswap-buy');
    const token = addToken(r.h.world, { status: 'migrated', address: r.s.mint });
    r.h.conn.onSend = (s) => r.h.conn.transactions.set(s.signature, fixture('rpc/tx-jupiter-buy.json', { ...r.vars, MINT: r.s.mint, SIG: s.signature }));
    const build = r.venue.buildTransaction.bind(r.venue);
    const spy = vi.spyOn(r.venue, 'buildTransaction').mockImplementation(async (plan, conn) => {
      if (plan.route === 'pumpswap') throw new TransactionTooLargeError();
      return build(plan, conn);
    });
    const receipt = await r.executor.swap('acc_1', swapReq(token.address));
    expect(spy.mock.calls.map(([plan]) => plan.route)).toEqual(['pumpswap', 'jupiter']);
    expect(receipt.ok).toBe(true);
    expect(r.h.store.fills[0].route).toBe('jupiter');
    expect(r.h.conn.sent).toHaveLength(1);
  });
});

describe('money safety', () => {
  it('a retried clientId replays the first receipt and never sends twice', async () => {
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
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
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
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

  it('checks SOL net of what unconfirmed sends may still spend, rent of the accounts it opens included; nothing is sent when short', async () => {
    const r = scenarioRig('pump-buy');
    const token = addToken(r.h.world, { status: 'curve', address: r.s.mint });
    const plan = await r.venue.plan(r.executor.ticket('acc_1', swapReq(token.address), 'manual'), r.h.conn.asConnection(), new PublicKey(r.owner));
    // the wallet keeps its own rent-exempt minimum (650240 lamports at mainnet's current rate)
    expect(plan.reserveLamports).toBe(650_240n);
    r.h.conn.setBalance(r.owner, lamportsNeeded(plan) + plan.reserveLamports - 1n);
    const short = await r.executor.swap('acc_1', swapReq(token.address));
    expect(short).toMatchObject({ ok: false, error: expect.stringMatching(/insufficient SOL balance/) });
    expect(r.h.conn.sent).toHaveLength(0);
    r.h.conn.setBalance(r.owner, lamportsNeeded(plan) + plan.reserveLamports);
    expect((await r.executor.swap('acc_1', swapReq(token.address))).ok).toBe(true);

    const j = rig();
    const t2 = addToken(j.h.world, { status: 'migrated', address: j.vars.MINT });
    j.venue.deps.pumpSwap = { load: async () => null };
    j.h.conn.setBalance(j.owner, 3_000_000_000n);
    const release = lanesFor(j.h.ctx.live!).commit('acc_1', 2_995_000_000n);
    expect((await j.executor.swap('acc_1', swapReq(t2.address))).error).toMatch(/insufficient SOL balance/);
    // refused before the router is asked for instructions (its simulation of an unfunded swap says less)
    expect(j.ff.requests.some((q) => q.url.pathname.endsWith('/swap-instructions'))).toBe(false);
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
    const r = rig({ landing: (vars) => fixture('rpc/tx-jupiter-buy.json', vars) });
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

  it('the SDK-built swaps need no signer but the wallet (one signature, the wallet pays)', async () => {
    for (const name of ['pump-buy', 'pumpswap-buy']) {
      const r = scenarioRig(name);
      const token = addToken(r.h.world, { status: name === 'pump-buy' ? 'curve' : 'migrated', address: r.s.mint });
      await r.executor.swap('acc_1', swapReq(token.address));
      const tx = r.h.conn.sent[0].tx;
      expect(tx.message.header.numRequiredSignatures).toBe(1);
      expect(tx.message.staticAccountKeys[0].toBase58()).toBe(r.owner);
    }
  });
});
