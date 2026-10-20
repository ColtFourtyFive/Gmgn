// Embedded-wallet signers, offline: the local development keystore (AES-256-GCM
// at rest, refused in production) and the Turnkey signer against a fake
// Turnkey API client (wallet creation parameters, retry, transaction signing).

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { createLiveServices } from '../src/live/services';
import { createSigner, DEV_KEYSTORE_FILE, LocalDevSigner, SOLANA_WALLET_ACCOUNT, TurnkeyWalletSigner, walletNameFor, type TurnkeyApi } from '../src/live/signer';
import { assertSignedAsBuilt, compileV0 } from '../src/live/execution/tx';
import { defaultConfig } from '../src/app';
import { liveConfig, newAddress } from './fixtures/rpc/fake-chain';

const KEY = 'a1'.repeat(32);
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ts-signer-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function transferTx(from: PublicKey): VersionedTransaction {
  return compileV0(from, bs58.encode(Keypair.generate().publicKey.toBytes()), [SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(newAddress()), lamports: 1234n })]);
}

describe('local-dev signer', () => {
  it('creates one wallet per account and signs transactions that verify', async () => {
    const signer = new LocalDevSigner(KEY, join(dir, DEV_KEYSTORE_FILE), {});
    const ref = await signer.createWallet('acc_1', 'sol');
    expect(ref).toMatchObject({ chain: 'sol', provider: 'local-dev' });
    expect(await signer.createWallet('acc_1', 'sol')).toEqual(ref); // idempotent
    expect((await signer.createWallet('acc_2', 'sol')).address).not.toBe(ref.address);

    const owner = new PublicKey(ref.address);
    const tx = transferTx(owner);
    const built = tx.message.serialize();
    const signed = await signer.signTransaction(ref, tx);
    expect(() => assertSignedAsBuilt(built, signed, owner)).not.toThrow();
    await expect(signer.createWallet('acc_1', 'eth')).rejects.toThrow(/Solana only/);
  });

  it('keeps keys encrypted at rest (0600) and reloads them only with the same key', async () => {
    const file = join(dir, DEV_KEYSTORE_FILE);
    const signer = new LocalDevSigner(KEY, file, {});
    const ref = await signer.createWallet('acc_1', 'sol');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const text = readFileSync(file, 'utf8');
    const stored = JSON.parse(text) as { keys: { data: string; address: string }[] };
    expect(stored.keys[0].address).toBe(ref.address);
    // neither the raw secret key (base58 / base64 / hex) nor a plaintext keypair is in the file
    expect(text).not.toMatch(/secretKey|privateKey/);
    expect(Buffer.from(stored.keys[0].data, 'base64')).toHaveLength(64); // ciphertext of the 64-byte secret

    const again = new LocalDevSigner(KEY, file, {});
    const tx = transferTx(new PublicKey(ref.address));
    const built = tx.message.serialize();
    const signed = await again.signTransaction(ref, tx);
    expect(() => assertSignedAsBuilt(built, signed, new PublicKey(ref.address))).not.toThrow();
    expect(() => new LocalDevSigner('b2'.repeat(32), file, {})).toThrow(/cannot be decrypted/);
  });

  it('is refused in production and with a malformed key', () => {
    expect(() => new LocalDevSigner(KEY, join(dir, 'k.json'), { NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => new LocalDevSigner('abc', join(dir, 'k.json'), {})).toThrow(/64 characters/);
  });

  it('wires into the live services by configured provider; a broken provider is reported, not fatal', () => {
    const cfg = liveConfig({ signer: { provider: 'local-dev', turnkey: null, localKeystoreKey: KEY } });
    const services = createLiveServices(defaultConfig({ mode: 'live', live: cfg, liveProblems: [], dataDir: dir }));
    expect(services?.signer?.provider).toBe('local-dev');
    expect(services?.connection).not.toBeNull();

    const problems: string[] = [];
    expect(createSigner(liveConfig({ signer: { provider: 'local-dev', turnkey: null, localKeystoreKey: 'zz' } }), dir, problems)).toBeNull();
    expect(problems[0]).toMatch(/failed to start/);
    expect(createSigner(liveConfig({ signer: { provider: null, turnkey: null, localKeystoreKey: null } }), dir, [])).toBeNull();
    const tk = createSigner(liveConfig({ signer: { provider: 'turnkey', turnkey: { apiBaseUrl: 'https://api.turnkey.test', organizationId: 'org', apiPublicKey: 'pub', apiPrivateKey: 'priv' }, localKeystoreKey: null } }), dir, []);
    expect(tk?.provider).toBe('turnkey');
    expect(createLiveServices(defaultConfig({ mode: 'demo' }))).toBeNull();
  });
});

/** A fake Turnkey API: wallets in memory, signing with keypairs it holds (like the enclave would). */
class FakeTurnkey implements TurnkeyApi {
  wallets = new Map<string, { walletId: string; walletName: string; kp: Keypair }>();
  createCalls: Parameters<TurnkeyApi['createWallet']>[0][] = [];
  signCalls: { signWith: string; type: string }[] = [];
  failCreateOnce = false;

  async createWallet(body: Parameters<TurnkeyApi['createWallet']>[0]) {
    this.createCalls.push(body);
    const existing = [...this.wallets.values()].find((w) => w.walletName === body.walletName);
    if (existing) throw new Error('Turnkey error 3: wallet label must be unique');
    const w = { walletId: `w-${this.wallets.size + 1}`, walletName: body.walletName, kp: Keypair.generate() };
    this.wallets.set(w.walletId, w);
    if (this.failCreateOnce) {
      this.failCreateOnce = false;
      throw new Error('socket hang up'); // created, but the response was lost
    }
    return { walletId: w.walletId, addresses: [w.kp.publicKey.toBase58()] };
  }

  async getWallets() {
    return { wallets: [...this.wallets.values()].map(({ walletId, walletName }) => ({ walletId, walletName })) };
  }

  async getWalletAccounts(body: { walletId: string }) {
    const w = this.wallets.get(body.walletId)!;
    return { accounts: [{ address: w.kp.publicKey.toBase58(), addressFormat: 'ADDRESS_FORMAT_SOLANA' }] };
  }

  /** Shape of the server client's signTransaction (TRANSACTION_TYPE_SOLANA, hex in / hex out). */
  async signTransaction(body: { signWith: string; unsignedTransaction: string; type: string }) {
    this.signCalls.push({ signWith: body.signWith, type: body.type });
    const w = [...this.wallets.values()].find((x) => x.kp.publicKey.toBase58() === body.signWith)!;
    const tx = VersionedTransaction.deserialize(Buffer.from(body.unsignedTransaction, 'hex'));
    tx.sign([w.kp]);
    return { activity: { id: 'act', status: 'ACTIVITY_STATUS_COMPLETED' }, signedTransaction: Buffer.from(tx.serialize()).toString('hex') };
  }
}

describe('Turnkey signer', () => {
  const creds = { apiBaseUrl: 'https://api.turnkey.test', organizationId: 'org-1', apiPublicKey: 'pub', apiPrivateKey: 'priv' };

  it('creates an ED25519 Solana wallet per account at m/44\'/501\'/0\'/0\'', async () => {
    const api = new FakeTurnkey();
    const signer = new TurnkeyWalletSigner(creds, api);
    const ref = await signer.createWallet('acc_9', 'sol');
    expect(api.createCalls[0]).toEqual({ walletName: walletNameFor('acc_9', 'sol'), accounts: [SOLANA_WALLET_ACCOUNT] });
    expect(SOLANA_WALLET_ACCOUNT).toEqual({ curve: 'CURVE_ED25519', pathFormat: 'PATH_FORMAT_BIP32', path: "m/44'/501'/0'/0'", addressFormat: 'ADDRESS_FORMAT_SOLANA' });
    expect(ref).toMatchObject({ chain: 'sol', provider: 'turnkey', providerWalletId: 'w-1' });
    expect(() => new PublicKey(ref.address)).not.toThrow();
  });

  it('finds the wallet a lost response already created instead of failing provisioning', async () => {
    const api = new FakeTurnkey();
    api.failCreateOnce = true;
    const signer = new TurnkeyWalletSigner(creds, api);
    const ref = await signer.createWallet('acc_1', 'sol');
    expect(api.wallets.size).toBe(1);
    expect(ref.providerWalletId).toBe('w-1');
    expect(ref.address).toBe([...api.wallets.values()][0].kp.publicKey.toBase58());
  });

  it('signs through Turnkey (Solana transaction type) and returns a verifiable v0 transaction', async () => {
    const api = new FakeTurnkey();
    const signer = new TurnkeyWalletSigner(creds, api);
    const ref = await signer.createWallet('acc_1', 'sol');
    const owner = new PublicKey(ref.address);
    const tx = transferTx(owner);
    const built = tx.message.serialize();
    const signed = await signer.signTransaction(ref, tx);
    expect(api.signCalls).toEqual([{ signWith: ref.address, type: 'TRANSACTION_TYPE_SOLANA' }]);
    expect(signed).toBeInstanceOf(VersionedTransaction);
    expect(() => assertSignedAsBuilt(built, signed, owner)).not.toThrow();
    await expect(signer.signTransaction({ ...ref, provider: 'local-dev' }, tx)).rejects.toThrow(/not turnkey/);
  });
});
