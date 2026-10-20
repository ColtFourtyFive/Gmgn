// Live execution building blocks, offline: integer money math, transaction
// assembly (fees, tip, compute budget), the Jupiter client against recorded
// lite-api.jup.ag responses, fill parsing on real mainnet transactions and on
// mainnet simulations of the venue's own swaps, rent, send routing and
// confirmation, failure reasons.

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type * as PumpSdk from '@pump-fun/pump-sdk';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
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
import bs58 from 'bs58';
import { WSOL_MINT } from '@trenchscope/shared';
import { RENT_EXEMPT_MIN_LAMPORTS, TOKEN_ACCOUNT_RENT_LAMPORTS, bpsOf, fromBaseUnits, maxWithSlippage, minWithSlippage, percentOf, slippageToBps, solToLamports, toBaseUnits } from '../src/live/execution/amounts';
import { accountKeysOf, describeTxError, walletDelta, type TxLike } from '../src/live/execution/fills';
import { JITO_TIP_ACCOUNTS, jitoTransactionsUrl, pickTipAccount } from '../src/live/execution/jito';
import { JupiterClient, JupiterRouteError, JupiterUnavailableError, routeComputeUnits, routeLabel, simulationFailure, swapInstructionsSchema, toInstruction, type JupiterQuote } from '../src/live/execution/jupiter';
import { PUMP_PROGRAM_ID, pumpVolumeAccumulatorOf } from '../src/live/execution/pump';
import { PUMPSWAP_PROGRAM_ID, poolVolumeAccumulatorOf } from '../src/live/execution/pumpswap';
import { ACCOUNT_SIZE, LEGACY_LAMPORTS_PER_BYTE, RentSchedule, rentExemptMinimum } from '../src/live/execution/rent';
import { confirmSignature, sendSigned, SendRefusedError } from '../src/live/execution/send';
import { assertSignedAsBuilt, compileV0, computeUnitPrice, swapInstructions } from '../src/live/execution/tx';
import { FIXTURES, FakeConnection, fakeFetch, fixture, newAddress } from './fixtures/rpc/fake-chain';

// The SDK's ESM build does not load under Node's ESM loader (see live/execution/pump.ts): its CommonJS build.
const { PUMP_SDK } = createRequire(import.meta.url)('@pump-fun/pump-sdk') as typeof PumpSdk;

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

describe('Jupiter client (recorded lite-api.jup.ag responses)', () => {
  const vars = () => ({ MINT: newAddress(), OWNER: newAddress(), OWNER_ATA: newAddress(), WSOL_ATA: newAddress(), UVA_PUMP: newAddress(), UVA_AMM: newAddress() });

  it('quotes ExactIn with the slippage bound and the API key header; route steps may carry a null bps', async () => {
    const v = vars();
    const ff = fakeFetch({ quote: () => fixture('jupiter/quote-buy.json', v) });
    const client = new JupiterClient({ baseUrl: 'https://api.jup.test/', apiKey: 'secret-key' }, ff.fetch);
    const q = await client.quote({ inputMint: WSOL_MINT, outputMint: v.MINT, amount: 10_000_000n, slippageBps: 1000 });
    const req = ff.requests[0];
    expect(req.url.origin + req.url.pathname).toBe('https://api.jup.test/swap/v1/quote');
    expect(Object.fromEntries(req.url.searchParams)).toMatchObject({ inputMint: WSOL_MINT, outputMint: v.MINT, amount: '10000000', slippageBps: '1000', swapMode: 'ExactIn', restrictIntermediateTokens: 'true', maxAccounts: '54' });
    expect(req.headers['x-api-key']).toBe('secret-key');
    expect(q).toMatchObject({ outAmount: '3806559599', otherAmountThreshold: '3425903640', slippageBps: 1000 });
    expect(q.routePlan[0]).toMatchObject({ percent: 100, bps: null });
    expect(routeLabel(q)).toBe('Pump.fun Amm');
  });

  it('sends no API key on the free tier and posts the quote for instructions', async () => {
    const v = vars();
    const ff = fakeFetch({ swapInstructions: () => fixture('jupiter/swap-instructions-sell.json', v) });
    const client = new JupiterClient({ baseUrl: 'https://lite-api.jup.test', apiKey: null }, ff.fetch);
    const quote = fixture<JupiterQuote>('jupiter/quote-sell.json', v);
    const res = await client.swapInstructions(quote, v.OWNER);
    const req = ff.requests[0];
    expect(req.method).toBe('POST');
    expect(req.headers['x-api-key']).toBeUndefined();
    expect(req.body).toMatchObject({ userPublicKey: v.OWNER, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, quoteResponse: { outAmount: '25204439' } });
    expect(routeComputeUnits(res)).toBe(93_400);
    // without the field, the limit is read from Jupiter's SetComputeUnitLimit instruction (the same number)
    expect(routeComputeUnits({ ...res, computeUnitLimit: undefined })).toBe(93_400);
    expect(toInstruction(res.swapInstruction).programId.toBase58()).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    expect(res.addressLookupTableAddresses).toEqual(['3rUkY2dKAeg1MSywtHqSVZPUftaYKeAPi6aWYKoCCM2f']);
  });

  it('tells "no route" (NO_ROUTES_FOUND, TOKEN_NOT_TRADABLE) apart from an unavailable router', async () => {
    const quote = (fetchFn: typeof fetch) => new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, fetchFn).quote({ inputMint: WSOL_MINT, outputMint: newAddress(), amount: 1n, slippageBps: 100 });
    for (const body of [fixture('jupiter/error-no-route.json'), fixture('jupiter/error-not-tradable.json', { MINT: newAddress() })]) {
      await expect(quote(fakeFetch({ quote: () => ({ status: 400, json: body }) }).fetch)).rejects.toBeInstanceOf(JupiterRouteError);
    }
    // a 400 without a route code (a malformed request) is not the user's "no route"
    await expect(quote(fakeFetch({ quote: () => ({ status: 400, json: { error: 'Query parameter outputMint cannot be parsed: WrongSize' } }) }).fetch)).rejects.toBeInstanceOf(JupiterUnavailableError);
    await expect(quote(fakeFetch({ quote: () => ({ status: 429, json: { error: 'Too many requests' } }) }).fetch)).rejects.toBeInstanceOf(JupiterUnavailableError);
    await expect(quote(fakeFetch({ quote: () => ({ inAmount: 'lots' }) }).fetch)).rejects.toBeInstanceOf(JupiterUnavailableError);
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(quote(down)).rejects.toBeInstanceOf(JupiterUnavailableError);
  });

  it('accepts the recorded swap-instructions shape (lookup table, setup, cleanup, simulated limit)', () => {
    const parsed = swapInstructionsSchema.safeParse(fixture('jupiter/swap-instructions-buy.json', vars()));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.setupInstructions).toHaveLength(3);
      expect(parsed.data.cleanupInstruction).toBeTruthy();
      expect(parsed.data.simulationError).toBeNull();
      expect(routeComputeUnits(parsed.data)).toBe(100_710);
      expect(parsed.data.addressLookupTableAddresses).toEqual(['BbRnvbxKkFEDU85LX7xKyob3BgXYX4dsHNvVFEFTbLiQ']);
    }
  });

  it('a route that fails in Jupiter\'s simulation is refused; a simulation Jupiter could not run only drops its compute limit', async () => {
    const v = vars();
    const quote = fixture<JupiterQuote>('jupiter/quote-buy.json', v);
    const answer = (simulationError: unknown) =>
      new JupiterClient({ baseUrl: 'https://j.test', apiKey: null }, fakeFetch({ swapInstructions: () => ({ ...fixture<object>('jupiter/swap-instructions-buy.json', v), computeUnitLimit: 1_400_000, simulationError }) }).fetch).swapInstructions(quote, v.OWNER);
    // seen on mainnet: a wallet short of SOL
    await expect(answer({ errorCode: 'TRANSACTION_ERROR', error: 'Error processing Instruction 2: custom program error: 0x1' })).rejects.toThrow(new JupiterRouteError('the swap would fail: insufficient balance'));
    await expect(answer({ errorCode: 'TRANSACTION_ERROR', error: 'Error processing Instruction 4: custom program error: 0x1771' })).rejects.toThrow(/slippage exceeded/);
    // seen on mainnet: Jupiter's own RPC failed; the route stands, its 1.4M default limit does not
    const res = await answer({ errorCode: 'SIMULATION_ERROR', error: 'Failed to simulate the swap: RPC failed' });
    expect(res.computeUnitLimit).toBeUndefined();
    expect(res.computeBudgetInstructions).toEqual([]);
    expect(routeComputeUnits(res)).toBeNull();
    expect(simulationFailure('Error processing Instruction 3: custom program error: 0x26')).toBe('the swap would fail: Error processing Instruction 3: custom program error: 0x26');
  });
});

/** Trade events of the pump programs in a transaction's logs (what the program says the trader paid / got). */
function tradeEventsOf(logs: string[]): { side: 'buy' | 'sell'; tokens: bigint; sol: bigint; user: string }[] {
  const disc = (name: string) => createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);
  const out: ReturnType<typeof tradeEventsOf> = [];
  for (const line of logs) {
    if (!line.startsWith('Program data: ')) continue;
    const data = Buffer.from(line.slice(14), 'base64');
    const head = data.subarray(0, 8);
    if (head.equals(disc('TradeEvent'))) {
      const e = PUMP_SDK.decodeTradeEventBc(data.subarray(8));
      const fees = BigInt(e.fee.toString()) + BigInt(e.creatorFee.toString());
      const sol = BigInt(e.solAmount.toString());
      out.push({ side: e.isBuy ? 'buy' : 'sell', tokens: BigInt(e.tokenAmount.toString()), sol: e.isBuy ? sol + fees : sol - fees, user: e.user.toBase58() });
    } else if (head.equals(disc('BuyEvent'))) {
      const e = PUMP_SDK.decodeBuyEventAmm(data.subarray(8));
      const paid = e.ixName === 'buy_exact_quote_in' ? e.quoteAmountIn : e.userQuoteAmountIn;
      out.push({ side: 'buy', tokens: BigInt(e.baseAmountOut.toString()), sol: BigInt(paid.toString()), user: e.user.toBase58() });
    } else if (head.equals(disc('SellEvent'))) {
      const e = PUMP_SDK.decodeSellEventAmm(data.subarray(8));
      out.push({ side: 'sell', tokens: BigInt(e.baseAmountIn.toString()), sol: BigInt(e.userQuoteAmountOut.toString()), user: e.user.toBase58() });
    }
  }
  return out;
}

/** Top-level System transfers from `from` to accounts that are not its own token accounts (tips, bot fees). */
function transfersOut(tx: TxLike & { transaction: { message: { accountKeys: string[]; instructions: { programIdIndex: number; accounts: number[]; data: string }[] } } }, from: string): bigint {
  const keys = accountKeysOf(tx);
  const own = new Set([...(tx.meta!.preTokenBalances ?? []), ...(tx.meta!.postTokenBalances ?? [])].filter((b) => b.owner === from).map((b) => keys[b.accountIndex]));
  own.add(getAssociatedTokenAddressSync(NATIVE_MINT, new PublicKey(from), true, TOKEN_PROGRAM_ID).toBase58());
  let total = 0n;
  for (const ix of tx.transaction.message.instructions) {
    if (keys[ix.programIdIndex] !== SystemProgram.programId.toBase58()) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (data.length === 12 && data.readUInt32LE(0) === 2 && keys[ix.accounts[0]] === from && !own.has(keys[ix.accounts[1]])) total += data.readBigUInt64LE(4);
  }
  return total;
}

describe('fill parsing on real mainnet transactions (test/fixtures/rpc/real-*.json)', () => {
  const real = readdirSync(join(FIXTURES, 'rpc')).filter((f) => f.startsWith('real-'));

  it('covers legacy and v0 (with lookup tables), pump.fun, PumpSwap and Jupiter, buys and sells', () => {
    for (const pattern of [/^real-pump-buy-/, /^real-pump-sell-/, /^real-pumpswap-buy-/, /^real-pumpswap-sell-/, /^real-jupiter-/, /-legacy/, /-v0-alt/]) {
      expect(real.some((f) => pattern.test(f)), String(pattern)).toBe(true);
    }
  });

  it.each(real)('%s: token and SOL legs match what the program reports', (file) => {
    const tx = fixture<Parameters<typeof transfersOut>[0]>(`rpc/${file}`);
    const signer = tx.transaction.message.accountKeys[0];
    const mint = [...(tx.meta!.postTokenBalances ?? []), ...(tx.meta!.preTokenBalances ?? [])].find((b) => b.owner === signer && b.mint !== WSOL_MINT)!.mint;
    const d = walletDelta(tx, 'sig', signer, mint, [pumpVolumeAccumulatorOf(new PublicKey(signer)).toBase58(), poolVolumeAccumulatorOf(new PublicKey(signer)).toBase58()]);
    expect(d.ok).toBe(true);
    expect(d.decimals).toBe(6);
    const tokenDelta = d.tokenPostRaw - d.tokenPreRaw;
    expect(tokenDelta).not.toBe(0n);
    // The same answer from web3.js's parsed shape (PublicKey objects instead of strings).
    const parsedShape = {
      ...tx,
      transaction: { ...tx.transaction, message: { staticAccountKeys: tx.transaction.message.accountKeys.map((k) => new PublicKey(k)) } },
      meta: { ...tx.meta!, loadedAddresses: tx.meta!.loadedAddresses ? { writable: tx.meta!.loadedAddresses.writable.map((k) => new PublicKey(String(k))), readonly: tx.meta!.loadedAddresses.readonly.map((k) => new PublicKey(String(k))) } : null },
    } as unknown as TxLike;
    const d2 = walletDelta(parsedShape, 'sig', signer, mint);
    expect(d2.tokenPostRaw - d2.tokenPreRaw).toBe(tokenDelta);
    expect(d2.ownerPostLamports).toBe(d.ownerPostLamports);
    if (file.startsWith('real-jupiter')) return; // a Jupiter route may take an integrator fee inside it
    const [ev] = tradeEventsOf(tx.meta!.logMessages ?? []).filter((e) => e.user === signer);
    const sol = d.ownerPostLamports - d.ownerPreLamports;
    const leg = ev.side === 'buy' ? -sol - d.feeLamports - d.rentLamports - transfersOut(tx, signer) : sol + d.feeLamports + d.rentLamports + transfersOut(tx, signer);
    expect(ev.side === 'buy' ? tokenDelta : -tokenDelta).toBe(ev.tokens);
    expect(leg).toBe(ev.sol);
  });

  it('counts a closed token account\'s refund as rent, not proceeds (PumpSwap sell that closed the emptied account)', () => {
    const tx = fixture<TxLike>('rpc/real-pumpswap-sell-legacy.json');
    const signer = accountKeysOf(tx)[0];
    const mint = (tx.meta!.preTokenBalances ?? []).find((b) => b.owner === signer && b.mint !== WSOL_MINT)!.mint;
    const d = walletDelta(tx, 'sig', signer, mint);
    expect(d.tokenPostRaw - d.tokenPreRaw).toBe(-4_430_493_669n);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(70_347_581n);
    expect(d.rentLamports).toBe(-1_513_840n); // the Token-2022 account's rent came back
  });

  it('reads token accounts addressed through lookup tables at their writable indexes (static, then loaded writable, then readonly)', () => {
    const tx = fixture<TxLike & { transaction: { message: { accountKeys: string[] } } }>('rpc/real-jupiter-v0-alt.json');
    const keys = accountKeysOf(tx);
    const loaded = tx.meta!.loadedAddresses!;
    expect(keys.length).toBe(tx.transaction.message.accountKeys.length + loaded.writable.length + loaded.readonly.length);
    expect(keys.slice(tx.transaction.message.accountKeys.length, tx.transaction.message.accountKeys.length + loaded.writable.length)).toEqual(loaded.writable);
    const viaTables = (tx.meta!.postTokenBalances ?? []).filter((b) => b.accountIndex >= tx.transaction.message.accountKeys.length);
    expect(viaTables.length).toBeGreaterThan(0);
  });
});

describe('fill parsing of the venue\'s own swaps (mainnet simulations in getTransaction\'s shape)', () => {
  const vars = {
    OWNER: newAddress(),
    MINT: newAddress(),
    FEE_WALLET: newAddress(),
    WSOL_ATA: newAddress(),
    OWNER_ATA: newAddress(),
    UVA_PUMP: newAddress(),
    UVA_AMM: newAddress(),
    TIP: JITO_TIP_ACCOUNTS[3],
    SIG: 'sig',
    BLOCKHASH: newAddress(),
  };

  it('reads a Jupiter buy: token delta, SOL delta, fee, rent of the accounts opened less the wSOL account closed, platform fee and tip received', () => {
    const tx = fixture<TxLike>('rpc/tx-jupiter-buy.json', vars);
    const d = walletDelta(tx, 'sig', vars.OWNER, vars.MINT, [vars.UVA_PUMP, vars.UVA_AMM]);
    expect(d.ok).toBe(true);
    expect(d.tokenPostRaw - d.tokenPreRaw).toBe(3_602_664_396n);
    expect(d.decimals).toBe(6);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(-11_105_760n);
    expect(d.feeLamports).toBe(105_000n);
    // 1513840 (token account) + 1346200 (pump-amm volume accumulator Jupiter's PumpSwap step opened) - 2039280 (wSOL account closed)
    expect(d.rentLamports).toBe(820_760n);
    expect(d.received(vars.FEE_WALLET)).toBe(80_000n);
    expect(d.received(vars.TIP)).toBe(100_000n);
    // the venue leg: SOL out less network fee, tip, platform fee and rent
    expect(-(d.ownerPostLamports - d.ownerPreLamports) - d.feeLamports - 100_000n - 80_000n - d.rentLamports).toBe(10_000_000n);
    // without the accumulator, its rent would have been booked as price
    expect(walletDelta(tx, 'sig', vars.OWNER, vars.MINT).rentLamports).toBe(820_760n - 1_346_200n);
  });

  it('reads a Jupiter sell, including the tip paid to the block engine', () => {
    const d = walletDelta(fixture<TxLike>('rpc/tx-jupiter-sell.json', vars), 'sig', vars.OWNER, vars.MINT);
    expect(d.tokenPostRaw - d.tokenPreRaw).toBe(-25_341_017_950n);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(24_817_968n);
    expect(d.received(vars.TIP)).toBe(100_000n);
    expect(d.received(vars.FEE_WALLET)).toBe(181_471n);
    expect(d.rentLamports).toBe(0n);
  });

  it('reads a real failed Jupiter swap as a readable slippage failure that still cost the network fee', () => {
    const d = walletDelta(fixture<TxLike>('rpc/tx-jupiter-failed.json', vars), 'sig', vars.OWNER, vars.MINT);
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/slippage exceeded/);
    expect(d.ownerPostLamports - d.ownerPreLamports).toBe(-d.feeLamports);
  });

  it('describes common failures in words (codes confirmed by mainnet simulation)', () => {
    expect(describeTxError('BlockhashNotFound', null)).toMatch(/expired/);
    expect(describeTxError({ InstructionError: [2, { Custom: 1 }] }, [], ['', '', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'])).toBe('insufficient token balance');
    // pump.fun TooMuchSolRequired / TooLittleSolReceived, BondingCurveComplete, SellZeroAmount
    expect(describeTxError({ InstructionError: [4, { Custom: 6002 }] }, [], ['', '', '', '', PUMP_PROGRAM_ID])).toMatch(/slippage/);
    expect(describeTxError({ InstructionError: [2, { Custom: 6003 }] }, [], ['', '', PUMP_PROGRAM_ID])).toMatch(/slippage/);
    expect(describeTxError({ InstructionError: [3, { Custom: 6005 }] }, [], ['', '', '', PUMP_PROGRAM_ID])).toMatch(/migrating/);
    expect(describeTxError({ InstructionError: [2, { Custom: 6022 }] }, [], ['', '', PUMP_PROGRAM_ID])).toBe('pump.fun: Sell zero amount');
    // pump-amm ExceededSlippage, and another of its errors by name
    expect(describeTxError({ InstructionError: [3, { Custom: 6004 }] }, [], ['', '', '', PUMPSWAP_PROGRAM_ID])).toMatch(/slippage/);
    expect(describeTxError({ InstructionError: [3, { Custom: 6020 }] }, [], ['', '', '', PUMPSWAP_PROGRAM_ID])).toMatch(/^PumpSwap: /);
    // Jupiter SlippageToleranceExceeded
    expect(describeTxError({ InstructionError: [4, { Custom: 6001 }] }, [], ['', '', '', '', 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'])).toMatch(/slippage/);
    expect(describeTxError({ InstructionError: [0, 'InsufficientFundsForRent'] }, null)).toMatch(/rent/);
    expect(describeTxError({ InstructionError: [2, { Custom: 1 }] }, ['Transfer: insufficient lamports 100, need 2000'])).toBe('insufficient SOL balance');
  });
});

describe('rent schedule', () => {
  it('reads the per-byte rate from the cluster and prices every account the swaps open', async () => {
    const conn = new FakeConnection();
    const rates = await new RentSchedule().rates(conn.asConnection());
    expect(rates).toEqual({ lamportsPerByte: 5080n, live: true });
    // mainnet, October 2026
    expect(rentExemptMinimum(ACCOUNT_SIZE.system, rates.lamportsPerByte)).toBe(650_240n);
    expect(rentExemptMinimum(ACCOUNT_SIZE.token, rates.lamportsPerByte)).toBe(1_488_440n);
    expect(rentExemptMinimum(ACCOUNT_SIZE.token2022, rates.lamportsPerByte)).toBe(1_513_840n);
    expect(rentExemptMinimum(ACCOUNT_SIZE.volumeAccumulator, rates.lamportsPerByte)).toBe(1_346_200n);
  });

  it('caches for an hour, keeps the last rate on RPC errors and never under-reserves before the first answer', async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const conn = {
      getMinimumBalanceForRentExemption: async (bytes: number) => {
        calls++;
        if (fail) throw new Error('503');
        return (128 + bytes) * 5080;
      },
    };
    const schedule = new RentSchedule(() => now);
    expect((await schedule.rates(conn as never)).lamportsPerByte).toBe(5080n);
    now += 30 * 60_000;
    await schedule.rates(conn as never);
    expect(calls).toBe(1);
    now += 31 * 60_000;
    fail = true;
    expect(await schedule.rates(conn as never)).toEqual({ lamportsPerByte: 5080n, live: true });
    expect(calls).toBe(2);
    const cold = new RentSchedule();
    expect(await cold.rates(conn as never)).toEqual({ lamportsPerByte: LEGACY_LAMPORTS_PER_BYTE, live: false });
    expect(rentExemptMinimum(0, LEGACY_LAMPORTS_PER_BYTE)).toBe(RENT_EXEMPT_MIN_LAMPORTS);
    expect(rentExemptMinimum(165, LEGACY_LAMPORTS_PER_BYTE)).toBe(TOKEN_ACCOUNT_RENT_LAMPORTS);
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
