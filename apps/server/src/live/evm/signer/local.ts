// Development-only signer: a secp256k1 key per account, generated locally and
// kept encrypted at rest (AES-256-GCM under LOCAL_KEYSTORE_KEY) in an injected
// KeyStore. The ciphertext is bound to its keystore id and address (GCM
// additional data), so a blob copied to another account's entry fails to
// decrypt. Refused when NODE_ENV=production: production keys live in Turnkey.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getAddress, isAddressEqual, type Address, type Hex, type TransactionSerializable } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { EvmSignerError, assertSignable, type EvmSignerApi, type EvmWalletRef, type KeyStore } from './types';

const BLOB_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

interface KeyBlob {
  v: number;
  alg: typeof ALGORITHM;
  address: Address;
  iv: string;
  tag: string;
  ct: string;
}

/** Parse LOCAL_KEYSTORE_KEY: 32 bytes as 64 hex characters (0x prefix optional). */
export function parseKeystoreKey(hex: string): Buffer {
  const clean = hex.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new EvmSignerError('LOCAL_KEYSTORE_KEY must be 32 bytes of hex (64 characters)', 'signer_unavailable');
  return Buffer.from(clean, 'hex');
}

export function encryptKey(key: Buffer, id: string, address: Address, privateKey: Hex): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(`${id}|${address.toLowerCase()}`, 'utf8'));
  const ct = Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2), 'hex')), cipher.final()]);
  const blob: KeyBlob = { v: BLOB_VERSION, alg: ALGORITHM, address, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  return JSON.stringify(blob);
}

export function decryptKey(key: Buffer, id: string, raw: string): { address: Address; privateKey: Hex } {
  let blob: KeyBlob;
  try {
    blob = JSON.parse(raw) as KeyBlob;
  } catch {
    throw new EvmSignerError(`keystore entry ${id} is corrupt`, 'signer_unavailable');
  }
  if (blob.v !== BLOB_VERSION || blob.alg !== ALGORITHM) throw new EvmSignerError(`keystore entry ${id} has an unknown format`, 'signer_unavailable');
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'base64'));
    decipher.setAAD(Buffer.from(`${id}|${blob.address.toLowerCase()}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const pk = Buffer.concat([decipher.update(Buffer.from(blob.ct, 'base64')), decipher.final()]);
    const privateKey = `0x${pk.toString('hex')}` as Hex;
    if (!isAddressEqual(privateKeyToAccount(privateKey).address, blob.address)) throw new Error('address mismatch');
    return { address: getAddress(blob.address), privateKey };
  } catch {
    throw new EvmSignerError(`keystore entry ${id} cannot be decrypted with LOCAL_KEYSTORE_KEY`, 'signer_unavailable');
  }
}

export interface LocalDevEvmSignerOptions {
  /** LOCAL_KEYSTORE_KEY (32-byte hex). */
  keystoreKey: string;
  store: KeyStore;
  /** Defaults to process.env.NODE_ENV. */
  nodeEnv?: string;
}

export class LocalDevEvmSigner implements EvmSignerApi {
  readonly provider = 'local-dev';
  private readonly key: Buffer;
  private readonly store: KeyStore;

  constructor(opts: LocalDevEvmSignerOptions) {
    if ((opts.nodeEnv ?? process.env.NODE_ENV) === 'production') {
      throw new EvmSignerError('the local-dev EVM signer is refused in production: configure Turnkey', 'signer_unavailable');
    }
    this.key = parseKeystoreKey(opts.keystoreKey);
    this.store = opts.store;
  }

  static entryId(accountId: string): string {
    return `evm:${accountId}`;
  }

  async createWallet(accountId: string): Promise<EvmWalletRef> {
    const id = LocalDevEvmSigner.entryId(accountId);
    const existing = this.store.get(id);
    if (existing) return { address: decryptKey(this.key, id, existing).address, provider: this.provider, providerWalletId: id };
    const privateKey = generatePrivateKey();
    const address = privateKeyToAccount(privateKey).address;
    this.store.put(id, encryptKey(this.key, id, address, privateKey));
    return { address, provider: this.provider, providerWalletId: id };
  }

  async signTransaction(ref: EvmWalletRef, tx: TransactionSerializable): Promise<Hex> {
    if (ref.provider !== this.provider) throw new EvmSignerError(`wallet belongs to signer ${ref.provider}`, 'wallet_mismatch');
    assertSignable(tx);
    const raw = this.store.get(ref.providerWalletId);
    if (!raw) throw new EvmSignerError(`no local key for ${ref.providerWalletId}`, 'wallet_mismatch');
    const { address, privateKey } = decryptKey(this.key, ref.providerWalletId, raw);
    if (!isAddressEqual(address, ref.address)) throw new EvmSignerError('keystore entry does not hold this wallet', 'wallet_mismatch');
    try {
      return await privateKeyToAccount(privateKey).signTransaction(tx);
    } catch (err) {
      throw new EvmSignerError(`signing failed: ${(err as Error).message}`, 'signing_failed');
    }
  }
}
