import { beforeEach, describe, expect, it } from 'vitest';
import { encodeFunctionData, parseEther, type Address, type Hex } from 'viem';
import { EVM_CHAINS } from '../src/live/evm/chains';
import type { EvmLiveConfig } from '../src/live/evm/config';
import { universalRouterAbi } from '../src/live/evm/exec/abis';
import { EVM_VENUES } from '../src/live/evm/exec/contracts';
import { EvmExecEngine } from '../src/live/evm/exec/engine';
import type { EvmPlanStep, EvmQuote, EvmTxPlan } from '../src/live/evm/exec/types';
import { LocalDevEvmSigner } from '../src/live/evm/signer/local';
import type { EvmWalletRef, KeyStore } from '../src/live/evm/signer/types';
import { FakeChain, type FakeChainOptions } from './fixtures/evm/exec/fake-chain';

const FEE_WALLET: Address = '0x000000000000000000000000000000000000fee1';
const TOKEN: Address = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';
const UR = EVM_VENUES.base.uniswap!.universalRouter;
const NOW = 1_790_000_000_000;

const config: EvmLiveConfig = {
  chains: { base: { chain: 'base', rpcUrls: ['http://fake'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } },
  feeWallet: FEE_WALLET,
  platformFeeBps: 80,
  kyberswap: { baseUrl: 'http://kyber.invalid', clientId: 'test' },
};

function memoryStore(): KeyStore {
  const m = new Map<string, string>();
  return { get: (id) => m.get(id) ?? null, put: (id, b) => void m.set(id, b) };
}

function quote(side: 'buy' | 'sell', feeMode: EvmQuote['fees']['platformFeeMode'], fee: bigint): EvmQuote {
  return {
    id: 'q',
    chain: 'base',
    token: TOKEN,
    side,
    intent: { chain: 'base', token: TOKEN, side, amount: parseEther('0.01'), amountKind: 'native', slippageBps: 100, speed: 'P2', antiMev: false },
    venue: 'uniswap-v4',
    route: 'pool',
    routeLabel: 'test',
    tokenDecimals: 18,
    tokenSymbol: 'T',
    balanceBefore: null,
    amountIn: parseEther('0.01'),
    venueAmountIn: parseEther('0.01') - fee,
    expectedOut: 1000n,
    minOut: 990n,
    slippageBps: 100,
    priceImpactBps: 0,
    nativeLeg: parseEther('0.01'),
    fees: { platformFeeBps: 80, platformFee: fee, platformFeeMode: feeMode, venueFeeBps: 0, venueFee: 0n, tokenTaxBps: 0, gasUnits: 0n, gasCost: 0n, totalCostBps: 0 },
    createdAt: NOW,
    expiresAt: NOW + 20_000,
    venueData: { venue: 'uniswap-v4', hops: [] },
  };
}

const swapData = encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: ['0x', [], 0n] });

function plan(wallet: Address, opts: { fee?: 'before-swap' | 'after-swap'; side?: 'buy' | 'sell' } = {}): EvmTxPlan {
  const fee = parseEther('0.00008');
  const steps: EvmPlanStep[] = [];
  if (opts.fee === 'before-swap') steps.push({ kind: 'fee', to: FEE_WALLET, data: '0x', value: fee, description: 'fee', timing: 'before-swap' });
  steps.push({ kind: 'swap', to: UR, data: swapData, value: opts.side === 'sell' ? 0n : parseEther('0.01'), description: 'swap', timing: 'swap' });
  if (opts.fee === 'after-swap') steps.push({ kind: 'fee', to: FEE_WALLET, data: '0x', value: fee, description: 'fee', timing: 'after-swap' });
  const mode = opts.fee === 'before-swap' ? 'separate-before' : opts.fee === 'after-swap' ? 'separate-after' : 'none';
  return { id: `p-${Math.random()}`, chain: 'base', wallet, quote: quote(opts.side ?? 'buy', mode, opts.fee ? fee : 0n), steps, deadline: null, createdAt: NOW };
}

let signer: LocalDevEvmSigner;
let a: EvmWalletRef;
let b: EvmWalletRef;

beforeEach(async () => {
  signer = new LocalDevEvmSigner({ keystoreKey: 'ab'.repeat(32), store: memoryStore(), nodeEnv: 'test' });
  a = await signer.createWallet('a');
  b = await signer.createWallet('b');
});

function setup(opts: Omit<FakeChainOptions, 'chain'> = {}) {
  const chain = new FakeChain({ chain: EVM_CHAINS.base.viem, ...opts });
  chain.setBalance(a.address, parseEther('1'));
  chain.setBalance(b.address, parseEther('1'));
  const client = chain.client();
  const engine = new EvmExecEngine({ config, clients: { base: { read: client, send: client, ws: null } }, kyber: null, now: () => NOW, pollIntervalMs: 5 });
  return { chain, engine };
}

describe('EvmExecEngine.send', () => {
  it('serializes sends per wallet: contiguous nonces per plan, wallets independent', async () => {
    const { chain, engine } = setup();
    const results = await Promise.all([
      engine.send(plan(a.address, { fee: 'before-swap' }), { ref: a, signer }),
      engine.send(plan(a.address, { fee: 'before-swap' }), { ref: a, signer }),
      engine.send(plan(b.address), { ref: b, signer }),
      engine.send(plan(a.address, { fee: 'before-swap' }), { ref: a, signer }),
    ]);
    const aNonces = chain.mined.filter((t) => t.from === a.address).map((t) => t.nonce);
    expect(aNonces).toEqual([0, 1, 2, 3, 4, 5]);
    for (const r of [results[0], results[1], results[3]]) {
      expect(r.txs.map((t) => t.kind)).toEqual(['fee', 'swap']);
      expect(r.txs[1].nonce).toBe(r.txs[0].nonce + 1);
      expect(r.feeTx).toEqual({ hash: r.txs[0].hash, status: 'confirmed' });
      expect(r.fill.status).toBe('success');
      expect(r.fill.platformFee).toBe(parseEther('0.00008'));
    }
    expect(results[2].txs.map((t) => t.nonce)).toEqual([0]);
    // EIP-1559 fields from the fee policy, gas limit = simulated gas x 1.2
    expect(results[2].txs[0]).toMatchObject({ gasLimit: 120_000n, maxPriorityFeePerGas: 1_500_000n, maxFeePerGas: 5_000_000n * 2n + 1_500_000n, via: 'public' });
  });

  it('resyncs and retries once on "nonce too low"', async () => {
    const { chain, engine } = setup();
    chain.nonces.set(a.address.toLowerCase(), 5);
    chain.pendingLag.set(a.address.toLowerCase(), 1); // the node's pending count is stale once
    const r = await engine.send(plan(a.address), { ref: a, signer });
    expect(chain.sendAttempts.map((t) => t.nonce)).toEqual([3, 5]);
    expect(r.txs[0].nonce).toBe(5);
    expect(engine.nonces.localNext('base', a.address)).toBe(6);
  });

  it('reports replacement-underpriced and insufficient-funds with clear codes', async () => {
    const underpriced = setup({ sendHook: () => 'replacement transaction underpriced' });
    await expect(underpriced.engine.send(plan(a.address), { ref: a, signer })).rejects.toMatchObject({ code: 'replacement_underpriced' });
    expect(underpriced.chain.sendAttempts).toHaveLength(2);
    const poor = setup({ sendHook: () => 'insufficient funds for gas * price + value: have 1 want 2' });
    await expect(poor.engine.send(plan(a.address), { ref: a, signer })).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(poor.chain.sendAttempts).toHaveLength(1);
  });

  it('refuses plans whose simulation reverts, mapping slippage reverts', async () => {
    const { chain, engine } = setup({ simulateHook: (_c, i) => (i === 0 ? { ok: false, error: 'execution reverted (V4TooLittleReceived)' } : { ok: true }) });
    await expect(engine.send(plan(a.address), { ref: a, signer })).rejects.toMatchObject({ code: 'slippage' });
    expect(chain.sendAttempts).toHaveLength(0);
  });

  it('never charges a separate-after fee for a reverted swap', async () => {
    const { chain, engine } = setup({ revertHook: (t) => t.to?.toLowerCase() === UR.toLowerCase() });
    const r = await engine.send(plan(a.address, { fee: 'after-swap', side: 'sell' }), { ref: a, signer });
    expect(r.fill.status).toBe('reverted');
    expect(r.feeTx).toEqual({ hash: null, status: 'skipped' });
    expect(chain.mined).toHaveLength(1);
  });

  it('sends a separate-after fee once the sell confirmed and decodes proceeds from the balance delta', async () => {
    const proceeds = parseEther('0.02');
    const { chain, engine } = setup({ creditHook: (t) => (t.to?.toLowerCase() === UR.toLowerCase() ? [{ to: t.from, amount: proceeds }] : []) });
    const r = await engine.send(plan(a.address, { fee: 'after-swap', side: 'sell' }), { ref: a, signer });
    expect(r.txs.map((t) => t.kind)).toEqual(['swap', 'fee']);
    expect(r.feeTx?.status).toBe('confirmed');
    expect(r.fill).toMatchObject({ status: 'success', nativeSource: 'balance', walletNativeDelta: proceeds, nativeAmount: proceeds, platformFee: parseEther('0.00008') });
    expect(r.fill.gasPaid).toBe(100_000n * chain.baseFee);
  });

  it('refuses a signer for another wallet and plans outside the allow-list', async () => {
    const { engine } = setup();
    await expect(engine.send(plan(a.address), { ref: b, signer })).rejects.toMatchObject({ code: 'signer_error' });
    const bad = plan(a.address);
    bad.steps[0] = { ...bad.steps[0], to: '0x000000000000000000000000000000000000bad1' as Address, data: '0xdeadbeef' as Hex };
    await expect(engine.send(bad, { ref: a, signer })).rejects.toMatchObject({ code: 'not_allowlisted' });
  });
});
