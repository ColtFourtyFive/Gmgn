// Development-only signer: a keypair per account, generated locally and kept
// encrypted at rest (AES-256-GCM under LOCAL_KEYSTORE_KEY, bound to the account
// and address) in DATA_DIR/dev-keystore.json (mode 0600). It refuses to start
// with NODE_ENV=production: real deployments keep keys in Turnkey.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChainId } from '@trenchscope/shared';
import { Keypair, type VersionedTransaction } from '@solana/web3.js';
import type { EmbeddedWalletRef, SignerApi } from '../../context';

interface StoredKey {
  accountId: string;
  chain: ChainId;
  address: string;
  /** base64 of the 12-byte IV, ciphertext of the 64-byte secret key and 16-byte GCM tag. */
  iv: string;
  data: string;
  tag: string;
}

interface Keystore {
  version: 1;
  keys: StoredKey[];
}

export class LocalDevSigner implements SignerApi {
  readonly provider = 'local-dev';
  private readonly key: Buffer;
  private readonly stored = new Map<string, StoredKey>();

  constructor(
    hexKey: string,
    private readonly file: string,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    if (env.NODE_ENV === 'production') throw new Error('the local-dev signer is refused in production: configure Turnkey');
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) throw new Error('LOCAL_KEYSTORE_KEY must be 32 bytes of hex (64 characters)');
    this.key = Buffer.from(hexKey, 'hex');
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Keystore;
      if (raw.version !== 1 || !Array.isArray(raw.keys)) throw new Error(`unrecognised dev keystore ${file}`);
      for (const k of raw.keys) {
        this.decrypt(k); // fail at boot, not at the first trade, when the key does not match
        this.stored.set(`${k.accountId}|${k.chain}`, k);
      }
    }
  }

  async createWallet(accountId: string, chain: ChainId): Promise<EmbeddedWalletRef> {
    if (chain !== 'sol') throw new Error(`embedded wallets are Solana only (asked for ${chain})`);
    const id = `${accountId}|${chain}`;
    let k = this.stored.get(id);
    if (!k) {
      const kp = Keypair.generate();
      k = this.encrypt(accountId, chain, kp);
      this.stored.set(id, k);
      this.save();
    }
    return { chain, address: k.address, provider: this.provider, providerWalletId: `local:${accountId}` };
  }

  async signTransaction(ref: EmbeddedWalletRef, tx: VersionedTransaction): Promise<VersionedTransaction> {
    if (ref.provider !== this.provider) throw new Error(`wallet is held by ${ref.provider}, not local-dev`);
    const k = [...this.stored.values()].find((s) => s.address === ref.address && s.chain === ref.chain);
    if (!k) throw new Error('no local key for this wallet');
    tx.sign([this.decrypt(k)]);
    return tx;
  }

  private aad(accountId: string, chain: ChainId, address: string): Buffer {
    return Buffer.from(`trenchscope-dev-key|${accountId}|${chain}|${address}`);
  }

  private encrypt(accountId: string, chain: ChainId, kp: Keypair): StoredKey {
    const address = kp.publicKey.toBase58();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(accountId, chain, address));
    const data = Buffer.concat([cipher.update(kp.secretKey), cipher.final()]);
    return { accountId, chain, address, iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }

  private decrypt(k: StoredKey): Keypair {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(k.iv, 'base64'));
    decipher.setAAD(this.aad(k.accountId, k.chain, k.address));
    decipher.setAuthTag(Buffer.from(k.tag, 'base64'));
    let secret: Buffer;
    try {
      secret = Buffer.concat([decipher.update(Buffer.from(k.data, 'base64')), decipher.final()]);
    } catch {
      throw new Error('dev keystore cannot be decrypted with LOCAL_KEYSTORE_KEY');
    }
    const kp = Keypair.fromSecretKey(secret);
    if (kp.publicKey.toBase58() !== k.address) throw new Error('dev keystore entry does not match its address');
    return kp;
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const body: Keystore = { version: 1, keys: [...this.stored.values()] };
    writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }
}
