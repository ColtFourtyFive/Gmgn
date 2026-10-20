import { describe, expect, it } from 'vitest';
import { keccak256, parseEther, parseGwei, parseTransaction, recoverTransactionAddress, serializeTransaction, type TransactionSerializable } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { TCreateWalletBody, TSignTransactionBody } from '@turnkey/sdk-server';
import { EVM_CHAINS } from '../src/live/evm/chains';
import { LocalDevEvmSigner, decryptKey, encryptKey, parseKeystoreKey } from '../src/live/evm/signer/local';
import { TURNKEY_EVM_ACCOUNT, TurnkeyEvmSigner, recommendedTurnkeyPolicies, turnkeyWalletName, type TurnkeyEvmClient } from '../src/live/evm/signer/turnkey';
import { EvmSignerError, toEmbeddedWalletRef, type KeyStore } from '../src/live/evm/signer/types';

const KEY = '0x' + 'ab'.repeat(32);

function memoryStore(): KeyStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (id) => map.get(id) ?? null, put: (id, blob) => void map.set(id, blob) };
}

const tx = (chainId: number): TransactionSerializable => ({
  type: 'eip1559',
  chainId,
  nonce: 7,
  to: '0x000000000000000000000000000000000000dEaD',
  value: parseEther('0.01'),
  data: '0x',
  gas: 21_000n,
  maxFeePerGas: parseGwei('0.02'),
  maxPriorityFeePerGas: 0n,
});

describe('LocalDevEvmSigner', () => {
  it('round-trips the key through AES-256-GCM and signs for every EVM chain with one address', async () => {
    const store = memoryStore();
    const signer = new LocalDevEvmSigner({ keystoreKey: KEY, store, nodeEnv: 'development' });
    const ref = await signer.createWallet('acct-1');
    expect(ref.provider).toBe('local-dev');
    expect(ref.providerWalletId).toBe('evm:acct-1');
    // idempotent per account
    expect((await signer.createWallet('acct-1')).address).toBe(ref.address);
    // the blob holds no plaintext key
    const blob = store.map.get('evm:acct-1')!;
    expect(JSON.parse(blob)).toMatchObject({ v: 1, alg: 'aes-256-gcm', address: ref.address });
    for (const chain of ['base', 'robinhood', 'bsc', 'eth'] as const) {
      const signed = await signer.signTransaction(ref, tx(EVM_CHAINS[chain].chainId));
      expect(await recoverTransactionAddress({ serializedTransaction: signed as never })).toBe(ref.address);
      expect(parseTransaction(signed).chainId).toBe(EVM_CHAINS[chain].chainId);
      expect(toEmbeddedWalletRef(ref, chain)).toEqual({ chain, address: ref.address, provider: 'local-dev', providerWalletId: 'evm:acct-1' });
    }
  });

  it('binds ciphertexts to their entry and key', () => {
    const key = parseKeystoreKey(KEY);
    const pk = generatePrivateKey();
    const address = privateKeyToAccount(pk).address;
    const blob = encryptKey(key, 'evm:a', address, pk);
    expect(decryptKey(key, 'evm:a', blob).privateKey).toBe(pk);
    // moved to another account's entry
    expect(() => decryptKey(key, 'evm:b', blob)).toThrow(EvmSignerError);
    // another keystore key
    expect(() => decryptKey(parseKeystoreKey('cd'.repeat(32)), 'evm:a', blob)).toThrow(/cannot be decrypted/);
    // tampered ciphertext
    const parsed = JSON.parse(blob);
    parsed.ct = Buffer.from('00'.repeat(32), 'hex').toString('base64');
    expect(() => decryptKey(key, 'evm:a', JSON.stringify(parsed))).toThrow(EvmSignerError);
  });

  it('refuses production, bad keys and other providers\' wallets', async () => {
    expect(() => new LocalDevEvmSigner({ keystoreKey: KEY, store: memoryStore(), nodeEnv: 'production' })).toThrow(/production/);
    expect(() => new LocalDevEvmSigner({ keystoreKey: 'abcd', store: memoryStore(), nodeEnv: 'test' })).toThrow(/32 bytes/);
    const signer = new LocalDevEvmSigner({ keystoreKey: KEY, store: memoryStore(), nodeEnv: 'test' });
    const ref = await signer.createWallet('x');
    await expect(signer.signTransaction({ ...ref, provider: 'turnkey' }, tx(8453))).rejects.toThrow(/turnkey/);
    await expect(signer.signTransaction(ref, { ...tx(8453), nonce: undefined })).rejects.toThrow(/nonce/);
  });
});

/** A fake Turnkey API: holds one secp256k1 key per wallet and signs like the enclave would. */
function fakeTurnkey(opts: { wrongKey?: boolean; tamper?: boolean } = {}) {
  const keys = new Map<string, `0x${string}`>();
  const calls: { createWallet: TCreateWalletBody[]; signTransaction: TSignTransactionBody[] } = { createWallet: [], signTransaction: [] };
  const client: TurnkeyEvmClient = {
    async createWallet(input) {
      calls.createWallet.push(input);
      const pk = generatePrivateKey();
      const address = privateKeyToAccount(pk).address;
      keys.set(address.toLowerCase(), pk);
      return { activity: {} as never, walletId: `wallet-${keys.size}`, addresses: [address] };
    },
    async signTransaction(input) {
      calls.signTransaction.push(input);
      const pk = opts.wrongKey ? generatePrivateKey() : keys.get(input.signWith.toLowerCase())!;
      const parsed = parseTransaction(`0x${input.unsignedTransaction}`) as TransactionSerializable;
      const signed = await privateKeyToAccount(pk).signTransaction(opts.tamper ? { ...parsed, nonce: (parsed.nonce ?? 0) + 1 } : parsed);
      return { activity: {} as never, signedTransaction: signed.slice(2) };
    },
    async getWallets() {
      return { wallets: [] };
    },
    async getWalletAccounts() {
      return { accounts: [] };
    },
  };
  return { client, calls };
}

describe('TurnkeyEvmSigner', () => {
  it('creates an Ethereum account at m/44\'/60\'/0\'/0/0 in the organization', async () => {
    const { client, calls } = fakeTurnkey();
    const signer = new TurnkeyEvmSigner(client, 'org-123');
    const ref = await signer.createWallet('acct-9');
    expect(calls.createWallet).toEqual([
      {
        organizationId: 'org-123',
        walletName: turnkeyWalletName('acct-9'),
        accounts: [{ curve: 'CURVE_SECP256K1', pathFormat: 'PATH_FORMAT_BIP32', path: "m/44'/60'/0'/0/0", addressFormat: 'ADDRESS_FORMAT_ETHEREUM' }],
      },
    ]);
    expect(TURNKEY_EVM_ACCOUNT.path).toBe("m/44'/60'/0'/0/0");
    expect(ref).toMatchObject({ provider: 'turnkey', providerWalletId: 'wallet-1' });
  });

  it('signs the unsigned serialized transaction (hex, no 0x) as TRANSACTION_TYPE_ETHEREUM and verifies the result', async () => {
    const { client, calls } = fakeTurnkey();
    const signer = new TurnkeyEvmSigner(client, 'org-123');
    const ref = await signer.createWallet('acct-9');
    const t = tx(4663);
    const signed = await signer.signTransaction(ref, t);
    expect(calls.signTransaction).toEqual([{ organizationId: 'org-123', signWith: ref.address, unsignedTransaction: serializeTransaction(t).slice(2), type: 'TRANSACTION_TYPE_ETHEREUM' }]);
    expect(await recoverTransactionAddress({ serializedTransaction: signed as never })).toBe(ref.address);
    expect(keccak256(signed)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('rejects a signature by another key or over another transaction', async () => {
    const wrong = fakeTurnkey({ wrongKey: true });
    const s1 = new TurnkeyEvmSigner(wrong.client, 'org');
    const r1 = await s1.createWallet('a');
    await expect(s1.signTransaction(r1, tx(8453))).rejects.toMatchObject({ code: 'wallet_mismatch' });
    const tampered = fakeTurnkey({ tamper: true });
    const s2 = new TurnkeyEvmSigner(tampered.client, 'org');
    const r2 = await s2.createWallet('b');
    await expect(s2.signTransaction(r2, tx(8453))).rejects.toMatchObject({ code: 'signing_failed' });
  });

  it('builds per-chain allow-list policies with lowercase targets', () => {
    const policies = recommendedTurnkeyPolicies({
      apiUserId: 'user-1',
      targets: { base: ['0x6fF5693b99212Da76ad316178A184AB56D299b43'], robinhood: ['0x8876789976dEcBfCbBbe364623C63652db8C0904'] },
      feeWallet: '0x000000000000000000000000000000000000bEEF',
    });
    const swaps = policies.find((p) => p.policyName === 'trenchscope-evm-swaps-base')!;
    expect(swaps.condition).toContain('eth.tx.chain_id == 8453');
    expect(swaps.condition).toContain("'0x6ff5693b99212da76ad316178a184ab56d299b43'");
    expect(swaps.consensus).toBe("approvers.any(user, user.id == 'user-1')");
    expect(policies.find((p) => p.policyName === 'trenchscope-evm-swaps-robinhood')!.condition).toContain('eth.tx.chain_id == 4663');
    expect(policies.some((p) => p.policyName === 'trenchscope-evm-swaps-bsc')).toBe(false);
    expect(policies.find((p) => p.policyName === 'trenchscope-evm-platform-fee')!.condition).toContain("'0x000000000000000000000000000000000000beef'");
  });
});
