import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeFunctionData, keccak256, pad, parseEther, toHex, type Address, type Hex } from 'viem';
import { EVM_CHAINS } from '../src/live/evm/chains';
import type { EvmLiveConfig } from '../src/live/evm/config';
import { erc20Abi } from '../src/live/evm/exec/abis';
import { EvmExecEngine } from '../src/live/evm/exec/engine';
import { TRANSFER_TOPIC } from '../src/live/evm/exec/rpc';
import { LocalDevEvmSigner } from '../src/live/evm/signer/local';
import type { KeyStore } from '../src/live/evm/signer/types';
import { EvmDepositWatcher } from '../src/live/evm/transfers/deposits';
import { EvmWithdrawals, assertWithdrawalShape } from '../src/live/evm/transfers/withdrawals';
import { FakeChain } from './fixtures/evm/exec/fake-chain';

const TOKEN: Address = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';
const SENDER: Address = '0x00000000000000000000000000000000000a11CE'.toLowerCase() as Address;
const NOW = 1_790_000_000_000;

const config: EvmLiveConfig = {
  chains: { robinhood: { chain: 'robinhood', rpcUrls: ['http://fake'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } },
  feeWallet: null,
  platformFeeBps: 80,
  kyberswap: { baseUrl: 'http://kyber.invalid', clientId: 'test' },
};

function memoryStore(): KeyStore {
  const m = new Map<string, string>();
  return { get: (id) => m.get(id) ?? null, put: (id, b) => void m.set(id, b) };
}

const transferLog = (from: Address, to: Address, value: bigint) => ({ topics: [TRANSFER_TOPIC, pad(from), pad(to)] as Hex[], data: encodeAbiParameters([{ type: 'uint256' }], [value]) });

describe('EvmDepositWatcher', () => {
  it('reports ERC-20 deposits from others and skips the wallet\'s own buys', async () => {
    const chain = new FakeChain({ chain: EVM_CHAINS.robinhood.viem });
    const wallet: Address = '0x0000000000000000000000000000000000c0FFEE'.toLowerCase() as Address;
    const watcher = new EvmDepositWatcher({ chain: 'robinhood', client: chain.client(), wallets: () => [{ accountId: 'acct', address: wallet }], now: () => NOW });
    expect(await watcher.poll()).toEqual([]); // baseline at the head
    chain.head += 5n;
    const depositTx = keccak256(toHex('deposit'));
    const buyTx = keccak256(toHex('own buy'));
    chain.external(depositTx, SENDER, TOKEN, 0n, chain.head - 2n);
    chain.external(buyTx, wallet, TOKEN, 0n, chain.head - 1n);
    chain.logs.push({ block: chain.head - 2n, address: TOKEN, txHash: depositTx, ...transferLog(SENDER, wallet, parseEther('12.5')) });
    chain.logs.push({ block: chain.head - 1n, address: TOKEN, txHash: buyTx, ...transferLog('0x0000000000000000000000000000000000000001', wallet, parseEther('99')) });
    const deposits = await watcher.poll();
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({
      accountId: 'acct',
      transfer: { chain: 'robinhood', direction: 'deposit', mint: TOKEN, symbol: 'TKN', amount: 12.5, counterparty: '0x00000000000000000000000000000000000A11cE', signature: depositTx, status: 'confirmed', networkFee: 0 },
    });
    expect(deposits[0].transfer.id).toBe(`robinhood:${depositTx}:0`);
    // the cursor moved: nothing is reported twice
    expect(await watcher.poll()).toEqual([]);
  });

  it('detects native deposits by balance, net of the platform\'s own moves', async () => {
    const chain = new FakeChain({ chain: EVM_CHAINS.robinhood.viem });
    const wallet: Address = '0x0000000000000000000000000000000000c0FFEE'.toLowerCase() as Address;
    chain.setBalance(wallet, parseEther('1'));
    const watcher = new EvmDepositWatcher({ chain: 'robinhood', client: chain.client(), wallets: () => [{ accountId: 'acct', address: wallet }], now: () => NOW });
    await watcher.poll();
    // someone sends 0.5 ETH
    chain.head += 1n;
    chain.external(keccak256(toHex('in')), SENDER, wallet, parseEther('0.5'));
    const [dep] = await watcher.poll();
    expect(dep.transfer).toMatchObject({ mint: null, symbol: 'ETH', amount: 0.5, counterparty: null });
    // a sell's proceeds the platform reported: not a deposit
    chain.head += 1n;
    chain.external(keccak256(toHex('sell')), wallet, wallet, 0n);
    chain.nonces.set(wallet, 1);
    chain.external(keccak256(toHex('proceeds')), SENDER, wallet, parseEther('0.2'));
    watcher.recordOwnDelta(wallet, parseEther('0.2'));
    expect(await watcher.poll()).toEqual([]);
    // the wallet sent something nobody reported: re-baseline, never guess
    chain.head += 1n;
    chain.nonces.set(wallet, 2);
    chain.external(keccak256(toHex('mystery')), SENDER, wallet, parseEther('0.3'));
    expect(await watcher.poll()).toEqual([]);
    // state survives a restart
    const restored = new EvmDepositWatcher({ chain: 'robinhood', client: chain.client(), wallets: () => [{ accountId: 'acct', address: wallet }] });
    restored.restore(JSON.parse(JSON.stringify(watcher.state())));
    expect(restored.state()).toEqual(watcher.state());
  });
});

describe('EvmWithdrawals', () => {
  async function setup() {
    const signer = new LocalDevEvmSigner({ keystoreKey: 'ab'.repeat(32), store: memoryStore(), nodeEnv: 'test' });
    const ref = await signer.createWallet('w');
    const chain = new FakeChain({
      chain: EVM_CHAINS.robinhood.viem,
      baseFee: 20_000_000n,
      simulateHook: (c) => (c.to.toLowerCase() === TOKEN.toLowerCase() ? { ok: true, gasUsed: 50_000n, logs: [{ address: TOKEN, ...transferLog(ref.address, '0x000000000000000000000000000000000000bEEF', 7n) }] } : { ok: true, gasUsed: 21_000n }),
    });
    chain.setBalance(ref.address, parseEther('1'));
    chain.tokenBalances.set(`${TOKEN}:${ref.address}`.toLowerCase(), 10n);
    const client = chain.client();
    const engine = new EvmExecEngine({ config, clients: { robinhood: { read: client, send: client, ws: null } }, kyber: null, now: () => NOW, pollIntervalMs: 5 });
    return { chain, engine, signer, ref, w: new EvmWithdrawals(engine, () => NOW) };
  }

  it('withdraws native as a plain transfer and records the network fee', async () => {
    const { chain, signer, ref, w } = await setup();
    const plan = await w.build({ chain: 'robinhood', from: ref.address, to: '0x000000000000000000000000000000000000bEEF', token: null, amount: parseEther('0.4') });
    expect(plan.step).toMatchObject({ kind: 'transfer', to: '0x000000000000000000000000000000000000bEEF', data: '0x', value: parseEther('0.4') });
    const t = await w.send(plan, { ref, signer });
    expect(t).toMatchObject({ direction: 'withdrawal', mint: null, symbol: 'ETH', amount: 0.4, counterparty: '0x000000000000000000000000000000000000bEEF', status: 'confirmed', networkFee: 0.000002 });
    expect(chain.mined[0]).toMatchObject({ to: '0x000000000000000000000000000000000000beef', value: parseEther('0.4'), nonce: 0 });
    // max keeps gas back
    const max = await w.maxNative('robinhood', ref.address);
    expect(max).toBeLessThan(chain.balanceAt(ref.address, chain.head));
    expect(max).toBeGreaterThan(0n);
  });

  it('withdraws ERC-20 with transfer(to, amount) and refuses tampered or unaffordable requests', async () => {
    const { signer, ref, w } = await setup();
    const plan = await w.build({ chain: 'robinhood', from: ref.address, to: '0x000000000000000000000000000000000000bEEF', token: TOKEN, amount: 7n });
    expect(plan.step.data).toBe(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: ['0x000000000000000000000000000000000000bEEF', 7n] }));
    const sim = await w.simulate(plan);
    expect(sim).toMatchObject({ ok: true, received: 7n, gasUsed: 50_000n });
    const t = await w.send(plan, { ref, signer });
    expect(t).toMatchObject({ mint: TOKEN, symbol: 'TKN', status: 'confirmed', signature: expect.stringMatching(/^0x/) });
    const tampered = { ...plan, step: { ...plan.step, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: ['0x000000000000000000000000000000000000dEaD', 7n] }) } };
    expect(() => assertWithdrawalShape(tampered)).toThrow(/does not match/);
    await expect(w.build({ chain: 'robinhood', from: ref.address, to: '0x000000000000000000000000000000000000bEEF', token: TOKEN, amount: 11n })).rejects.toMatchObject({ code: 'insufficient_token_balance' });
    await expect(w.build({ chain: 'robinhood', from: ref.address, to: '0x000000000000000000000000000000000000bEEF', token: null, amount: parseEther('5') })).rejects.toMatchObject({ code: 'insufficient_funds' });
    await expect(w.build({ chain: 'robinhood', from: ref.address, to: ref.address, token: null, amount: 1n })).rejects.toMatchObject({ code: 'invalid_intent' });
  });
});
