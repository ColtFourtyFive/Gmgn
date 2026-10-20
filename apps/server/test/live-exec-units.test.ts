// Live execution building blocks, offline: integer money math, transaction
// assembly (fees, tip, compute budget), the Jupiter client against documented
// response shapes, fill parsing from getTransaction fixtures, send routing and
// confirmation, failure reasons.

import { describe, expect, it } from 'vitest';
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js';
import { WSOL_MINT } from '@trenchscope/shared';
import { bpsOf, fromBaseUnits, maxWithSlippage, minWithSlippage, percentOf, slippageToBps, solToLamports, toBaseUnits } from '../src/live/execution/amounts';
import { describeTxError, walletDelta, type TxLike } from '../src/live/execution/fills';
import { JITO_TIP_ACCOUNTS, jitoTransactionsUrl, pickTipAccount } from '../src/live/execution/jito';
import { JupiterClient, JupiterRouteError, JupiterUnavailableError, routeComputeUnits, routeLabel, swapInstructionsSchema, toInstruction } from '../src/live/execution/jupiter';
import { confirmSignature, sendSigned, SendRefusedError } from '../src/live/execution/send';
import { assertSignedAsBuilt, compileV0, computeUnitPrice, swapInstructions } from '../src/live/execution/tx';
import { FakeConnection, fakeFetch, fixture, newAddress } from './fixtures/rpc/fake-chain';

const addr = () => new PublicKey(newAddress());

describe('integer money math', () => {
  it('converts display amounts to base units rounding down, never up', () => {
    expect(toBaseUnits(1, 9)).toBe(1_000_000_000n);
    expect(toBaseUnits(0.1, 9)).toBe(100_000_000n);
    expect(toBaseUnits(0.123456789, 9)).toBe(123_456_789n);
    // 0.1234567899 would round up with toFixed(9): it must floor
    expect(toBaseUnits(0.1234567899, 9)).toBe(123_456_789n);
    expect(toBaseUnits(35_000_000, 6)).toBe(35_000_000_000_000n);
    expect(toBaseUnits(1e-10, 9)).toBe(0n);
    expect(() => toBaseUnits(-1, 9)).toThrow();
    expect(() => toBaseUnits(Number.NaN, 9)).toThrow();
    expect(fromBaseUnits(35_000_000_000_000n, 6)).toBe(35_000_000);
    expect(fromBaseUnits(1_989_155_720n, 9)).toBeCloseTo(1.98915572, 12);
  });

  it('takes fees as floor(amount * bps / 10000)', () => {
    expect(bpsOf(1_000_000_000n, 80)).toBe(8_000_000n);
    expect(bpsOf(902_500_000n, 80)).toBe(7_220_000n);
    expect(bpsOf(999n, 80)).toBe(7n); // 7.992 -> 7
    expect(bpsOf(1n, 80)).toBe(0n);
    expect(() => bpsOf(1n, 0.5)).toThrow();
  });

  it('bounds slippage in basis points and sizes percent sells exactly', () => {
    expect(slippageToBps(0.25)).toBe(2500);
    expect(slippageToBps(0)).toBe(1);
    expect(slippageToBps(2)).toBe(10_000);
    expect(minWithSlippage(950_000_000n, 500)).toBe(902_500_000n);
    expect(maxWithSlippage(1_000_000_000n, 2500)).toBe(1_250_000_000n);
    expect(percentOf(35_000_000_000_001n, 100)).toBe(35_000_000_000_001n);
    expect(percentOf(1000n, 50)).toBe(500n);
    expect(percentOf(1000n, 33.333)).toBe(333n);
    expect(solToLamports(0.0008)).toBe(800_000n);
  });
});

describe('swap transaction assembly', () => {
  const owner = Keypair.generate();
  const feeWallet = addr();
  const tip = new PublicKey(JITO_TIP_ACCOUNTS[0]);
  const setup = new TransactionInstruction({ programId: addr(), keys: [], data: Buffer.from([1]) });
  const swap = new TransactionInstruction({ programId: addr(), keys: [], data: Buffer.from([2]) });
  const cleanup = new TransactionInstruction({ programId: addr(), keys: [], data: Buffer.from([3]) });
  const parts = { setup: [setup], swap: [swap], cleanup: [cleanup] };

  const transfers = (ixs: TransactionInstruction[]) =>
    ixs.map((ix, i) => ({ i, ix })).filter(({ ix }) => ix.programId.equals(SystemProgram.programId)).map(({ i, ix }) => ({ i, ...SystemInstruction.decodeTransfer(ix) }));

  it('buys: compute budget, then the platform fee on the SOL in, then the route; no tip without anti-MEV', () => {
    const ixs = swapInstructions({ owner: owner.publicKey, side: 'buy', parts, computeUnits: 183_000, priorityLamports: 800_000n, platformFee: { wallet: feeWallet, lamports: 8_000_000n }, tip: null });
    expect(ixs.map((ix) => ix.programId.toBase58())).toEqual([
      ComputeBudgetProgram.programId.toBase58(),
      ComputeBudgetProgram.programId.toBase58(),
      SystemProgram.programId.toBase58(),
      setup.programId.toBase58(),
      swap.programId.toBase58(),
      cleanup.programId.toBase58(),
    ]);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(ixs[0]).units).toBe(183_000);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitPrice(ixs[1]).microLamports).toBe(computeUnitPrice(800_000n, 183_000));
    const [fee] = transfers(ixs);
    expect(fee).toMatchObject({ i: 2, lamports: 8_000_000n });
    expect(fee.toPubkey.equals(feeWallet)).toBe(true);
    expect(fee.fromPubkey.equals(owner.publicKey)).toBe(true);
  });

  it('sells: the platform fee comes after the swap and the wSOL unwrap; the Jito tip is last', () => {
    const ixs = swapInstructions({
      owner: owner.publicKey,
      side: 'sell',
      parts,
      computeUnits: 183_000,
      priorityLamports: 800_000n,
      platformFee: { wallet: feeWallet, lamports: 7_220_000n },
      tip: { account: tip, lamports: 2_000_000n },
    });
    const t = transfers(ixs);
    const cleanupAt = ixs.indexOf(cleanup);
    expect(t).toHaveLength(2);
    expect(t[0].i).toBeGreaterThan(cleanupAt);
    expect(t[0].toPubkey.equals(feeWallet) && t[0].lamports === 7_220_000n).toBe(true);
    expect(t[1].i).toBe(ixs.length - 1);
    expect(t[1].toPubkey.equals(tip) && t[1].lamports === 2_000_000n).toBe(true);
  });

  it('spreads the priority fee over the compute limit without exceeding it', () => {
    const price = computeUnitPrice(800_000n, 183_000);
    expect(price).toBe(4_371_584n);
    expect((price * 183_000n) / 1_000_000n).toBeLessThanOrEqual(800_000n);
    expect(computeUnitPrice(0n, 1000)).toBe(0n);
    // no fee: no price instruction at all
    const ixs = swapInstructions({ owner: owner.publicKey, side: 'buy', parts, computeUnits: 1000, priorityLamports: 0n, platformFee: null, tip: null });
    expect(ixs.filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId))).toHaveLength(1);
  });

  it('refuses a signer that changed the transaction or did not sign it', () => {
    const tx = compileV0(owner.publicKey, newAddress(), [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: feeWallet, lamports: 1n })]);
    const built = tx.message.serialize();
    expect(() => assertSignedAsBuilt(built, tx, owner.publicKey)).toThrow(/unsigned/);
    tx.sign([owner]);
    expect(() => assertSignedAsBuilt(built, tx, owner.publicKey)).not.toThrow();
    const other = compileV0(owner.publicKey, newAddress(), [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: addr(), lamports: 1n })]);
    other.sign([owner]);
    expect(() => assertSignedAsBuilt(built, other, owner.publicKey)).toThrow(/different transaction/);
    const forged = compileV0(owner.publicKey, newAddress(), [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: feeWallet, lamports: 1n })]);
    const forgedBuilt = forged.message.serialize();
    forged.signatures[0] = new Uint8Array(64).fill(7);
    expect(() => assertSignedAsBuilt(forgedBuilt, forged, owner.publicKey)).toThrow(/invalid signature/);
  });
});

describe('Jupiter client', () => {
  const vars = { MINT: newAddress(), AMM: newAddress() };

  it('quotes ExactIn with the slippage bound and the API key header', async () => {
    const ff = fakeFetch({ quote: () => fixture('jupiter/quote-buy.json', vars) });
    const client = new JupiterClient({ baseUrl: 'https://api.jup.test/', apiKey: 'secret-key' }, ff.fetch);
    const q = await client.quote({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: 1_000_000_000n, slippageBps: 2500 });
    const req = ff.requests[0];
    expect(req.url.origin + req.url.pathname).toBe('https://api.jup.test/swap/v1/quote');
    expect(Object.fromEntries(req.url.searchParams)).toMatchObject({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: '1000000000', slippageBps: '2500', swapMode: 'ExactIn' });
    expect(req.headers['x-api-key']).toBe('secret-key');
    expect(q.outAmount).toBe('35000000000000');
    expect(routeLabel(q)).toBe('Pump.fun Amm');
  });

  it('sends no API key on the free tier and posts the quote for instructions', async () => {
    const ff = fakeFetch({ swapInstructions: () => fixture('jupiter/swap-instructions-sell.json', { ...vars, OWNER: newAddress(), WSOL_ATA: newAddress(), OWNER_ATA: newAddress(), POOL_BASE: newAddress(), POOL_QUOTE: newAddress() }) });
    const client = new JupiterClient({ baseUrl: 'https://lite-api.jup.test', apiKey: null }, ff.fetch);
    const quote = fixture<Parameters<JupiterClient['swapInstructions']>[0]>('jupiter/quote-sell.json', vars);
    const owner = newAddress();
    const res = await client.swapInstructions(quote, owner);
    const req = ff.requests[0];
    expect(req.method).toBe('POST');
    expect(req.headers['x-api-key']).toBeUndefined();
    expect(req.body).toMatchObject({ userPublicKey: owner, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, quoteResponse: { outAmount: '950000000' } });
    // no computeUnitLimit field: read from the SetComputeUnitLimit instruction
    expect(routeComputeUnits(res)).toBe(180_000);
    expect(toInstruction(res.swapInstruction).programId.toBase58()).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  });

  it('tells "no route" apart from an unavailable router', async () => {
    const noRoute = fakeFetch({ quote: () => ({ status: 400, json: fixture('jupiter/error-no-route.json') }) });
    await expect(new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, noRoute.fetch).quote({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: 1n, slippageBps: 100 })).rejects.toBeInstanceOf(JupiterRouteError);
    const limited = fakeFetch({ quote: () => ({ status: 429, json: { error: 'Too many requests' } }) });
    await expect(new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, limited.fetch).quote({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: 1n, slippageBps: 100 })).rejects.toBeInstanceOf(JupiterUnavailableError);
    const broken = fakeFetch({ quote: () => ({ inAmount: 'lots' }) });
    await expect(new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, broken.fetch).quote({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: 1n, slippageBps: 100 })).rejects.toBeInstanceOf(JupiterUnavailableError);
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, down).quote({ inputMint: WSOL_MINT, outputMint: vars.MINT, amount: 1n, slippageBps: 100 })).rejects.toBeInstanceOf(JupiterUnavailableError);
  });

  it('accepts the documented swap-instructions shape', () => {
    const parsed = swapInstructionsSchema.safeParse(fixture('jupiter/swap-instructions-buy.json', { MINT: newAddress(), AMM: newAddress(), OWNER: newAddress(), WSOL_ATA: newAddress(), OWNER_ATA: newAddress(), POOL_BASE: newAddress(), POOL_QUOTE: newAddress(), ALT: newAddress() }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.setupInstructions).toHaveLength(3);
      expect(routeComputeUnits(parsed.data)).toBe(180_000);
    }
  });
});

describe('fill parsing (getTransaction fixtures)', () => {
  const vars = {
    OWNER: newAddress(),
    MINT: newAddress(),
    FEE_WALLET: newAddress(),
    WSOL_ATA: newAddress(),
    OWNER_ATA: newAddress(),
    AMM: newAddress(),
    POOL_BASE: newAddress(),
    POOL_QUOTE: newAddress(),
    ALT: newAddress(),
    TIP: JITO_TIP_ACCOUNTS[3],
    SIG: 'sig',
    BLOCKHASH: newAddress(),
  };

  it('reads a buy: token delta, owner SOL delta, fee, created token account rent, platform fee received', () => {
    const tx = fixture<TxLike>('rpc/tx-jupiter-buy.json', vars);
    const d = walletDelta(tx, 'sig', vars.OWNER, vars.MINT);
    expect(d.ok).toBe(true);
    expect(d.tokenPostRaw - d.tokenPreRaw).toBe(35_000_000_000_000n);
    expect(d.decimals).toBe(6);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(-1_010_844_280n);
    expect(d.feeLamports).toBe(805_000n);
    expect(d.rentLamports).toBe(2_039_280n);
    expect(d.received(vars.FEE_WALLET)).toBe(8_000_000n);
    // lookup-table accounts are indexed after the static keys
    expect(d.received(vars.POOL_QUOTE)).toBe(1_000_000_000n);
    // the venue leg: SOL out minus network fee, platform fee and refundable rent
    expect(-(d.ownerPostLamports - d.ownerPreLamports) - d.feeLamports - 8_000_000n - d.rentLamports).toBe(1_000_000_000n);
  });

  it('reads a sell, including the tip paid to the block engine', () => {
    const d = walletDelta(fixture<TxLike>('rpc/tx-jupiter-sell.json', vars), 'sig', vars.OWNER, vars.MINT);
    expect(d.tokenPostRaw - d.tokenPreRaw).toBe(-35_000_000_000_000n);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(937_975_000n);
    expect(d.received(vars.TIP)).toBe(2_000_000n);
    expect(d.received(vars.FEE_WALLET)).toBe(7_220_000n);
    expect(d.rentLamports).toBe(0n);
  });

  it('reads a failed swap as a readable slippage failure that still cost the network fee', () => {
    const d = walletDelta(fixture<TxLike>('rpc/tx-jupiter-failed.json', vars), 'sig', vars.OWNER, vars.MINT);
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/slippage exceeded/);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(-805_000n);
  });

  it('describes common failures in words', () => {
    expect(describeTxError('BlockhashNotFound', null)).toMatch(/expired/);
    expect(describeTxError({ InstructionError: [2, { Custom: 1 }] }, [], ['', '', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'])).toBe('insufficient token balance');
    expect(describeTxError({ InstructionError: [3, { Custom: 6002 }] }, [], ['', '', '', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'])).toMatch(/slippage/);
    expect(describeTxError({ InstructionError: [3, { Custom: 6005 }] }, [], ['', '', '', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'])).toMatch(/migrating/);
    expect(describeTxError({ InstructionError: [0, 'InsufficientFundsForRent'] }, null)).toMatch(/rent/);
    expect(describeTxError({ InstructionError: [2, { Custom: 1 }] }, ['Transfer: insufficient lamports 100, need 2000'])).toBe('insufficient SOL balance');
  });
});

describe('sending and confirming', () => {
  const deps = (conn: FakeConnection, extra: Partial<Parameters<typeof sendSigned>[0]> = {}) => ({
    connection: conn.asConnection(),
    jitoUrl: 'https://jito.test',
    fetch: fakeFetch({}).fetch,
    sleep: async () => {},
    now: () => Date.now(),
    ...extra,
  });
  const signedTx = () => {
    const kp = Keypair.generate();
    const tx = compileV0(kp.publicKey, newAddress(), [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: addr(), lamports: 5n })]);
    tx.sign([kp]);
    return tx;
  };

  it('anti-MEV goes to the Jito block engine only (bundleOnly, base64); otherwise public RPC with preflight', async () => {
    const conn = new FakeConnection();
    const ff = fakeFetch({ jito: (body) => ({ jsonrpc: '2.0', id: 1, result: conn.record(Buffer.from(body.params[0], 'base64'), 'jito', true) }) });
    const tx = signedTx();
    await sendSigned(deps(conn, { fetch: ff.fetch }), tx.serialize(), 'jito');
    expect(conn.calls).not.toContain('sendRawTransaction');
    expect(ff.requests[0].url.href).toBe(jitoTransactionsUrl('https://jito.test'));
    expect(ff.requests[0].url.searchParams.get('bundleOnly')).toBe('true');
    expect(ff.requests[0].body).toMatchObject({ method: 'sendTransaction', params: [expect.any(String), { encoding: 'base64' }] });
    expect(conn.sent[0].via).toBe('jito');

    await sendSigned(deps(conn), signedTx().serialize(), 'rpc');
    expect(conn.sent[1]).toMatchObject({ via: 'rpc', skipPreflight: false });
    expect(pickTipAccount(() => 0.99).toBase58()).toBe(JITO_TIP_ACCOUNTS[7]);
  });

  it('a preflight failure is a definite refusal; a transport error may still have delivered it', async () => {
    const conn = new FakeConnection();
    conn.sendError = new SendTransactionError({
      action: 'send',
      signature: '',
      transactionMessage: 'Transaction simulation failed: Error processing Instruction 6: custom program error: 0x1771',
      logs: ['Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771'],
    });
    const err = await sendSigned(deps(conn), signedTx().serialize(), 'rpc').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SendRefusedError);
    expect(describeTxError((err as SendRefusedError).txError ?? (err as Error).message, (err as SendRefusedError).logs)).toMatch(/slippage/);
    conn.sendError = new TypeError('fetch failed');
    await expect(sendSigned(deps(conn), signedTx().serialize(), 'rpc')).resolves.toEqual({ ambiguous: true });
    const jitoDown = (async () => {
      throw new TypeError('socket hang up');
    }) as unknown as typeof fetch;
    await expect(sendSigned(deps(conn, { fetch: jitoDown }), signedTx().serialize(), 'jito')).resolves.toEqual({ ambiguous: true });
    const jitoRejects = fakeFetch({ jito: () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bundle tip too low' } }) });
    await expect(sendSigned(deps(conn, { fetch: jitoRejects.fetch }), signedTx().serialize(), 'jito')).rejects.toBeInstanceOf(SendRefusedError);
  });

  it('confirms by status, expires only on a definite unknown past lastValidBlockHeight, and rebroadcasts the same bytes', async () => {
    const conn = new FakeConnection();
    const opts = { pollMs: 0, timeoutMs: 10_000, rebroadcastMs: 1 };
    conn.statuses.set('landed', { slot: 9, confirmations: 1, err: null, confirmationStatus: 'confirmed' });
    await expect(confirmSignature(deps(conn), 'landed', 1150, opts)).resolves.toEqual({ status: 'confirmed', slot: 9, err: null });

    conn.blockHeight = 1200;
    await expect(confirmSignature(deps(conn), 'gone', 1150, opts)).resolves.toEqual({ status: 'expired' });

    // RPC errors never count as "unknown": no expiry verdict, the wait times out instead
    let t = 0;
    const flaky = Object.assign(new FakeConnection(), { blockHeight: 1200 });
    flaky.getSignatureStatuses = async () => {
      throw new Error('503');
    };
    const rebroadcasts: number[] = [];
    const res = await confirmSignature(deps(flaky, { now: () => (t += 100) }), 'x', 1150, { pollMs: 0, timeoutMs: 1000, rebroadcastMs: 300 }, async () => rebroadcasts.push(t));
    expect(res).toEqual({ status: 'timeout' });
    expect(rebroadcasts.length).toBeGreaterThan(0);

    // A transaction message built from fixtures decompiles with its lookup table
    const kp = Keypair.generate();
    const tx = compileV0(kp.publicKey, newAddress(), [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: addr(), lamports: 1n })]);
    expect(TransactionMessage.decompile(tx.message).instructions).toHaveLength(1);
  });
});
