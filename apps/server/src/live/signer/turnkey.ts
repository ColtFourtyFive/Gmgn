// Turnkey-held embedded wallets. Keys are generated and kept inside Turnkey's
// enclaves; the server holds only an API key of the organization and asks
// Turnkey to sign, so Turnkey's policies (e.g. allowed programs) apply to every
// signature. One wallet per account: ED25519, Solana address format, path
// m/44'/501'/0'/0' (Phantom / Solflare compatible derivation).

import type { ChainId } from '@trenchscope/shared';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { TurnkeySigner } from '@turnkey/solana';
import type { EmbeddedWalletRef, SignerApi } from '../../context';

export interface TurnkeyCredentials {
  apiBaseUrl: string;
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}

export const SOLANA_WALLET_ACCOUNT = {
  curve: 'CURVE_ED25519',
  pathFormat: 'PATH_FORMAT_BIP32',
  path: "m/44'/501'/0'/0'",
  addressFormat: 'ADDRESS_FORMAT_SOLANA',
} as const;

/** The subset of Turnkey's API client this signer calls (a fake implements it in tests). */
export interface TurnkeyApi {
  createWallet(body: { walletName: string; accounts: (typeof SOLANA_WALLET_ACCOUNT)[] }): Promise<{ walletId: string; addresses: string[] }>;
  getWallets(body: Record<string, never>): Promise<{ wallets: { walletId: string; walletName: string }[] }>;
  getWalletAccounts(body: { walletId: string }): Promise<{ accounts: { address: string; addressFormat: string }[] }>;
}

/** Stable per-account wallet name: a retried provisioning finds the wallet it already created. */
export const walletNameFor = (accountId: string, chain: ChainId) => `trenchscope:${accountId}:${chain}`;

export class TurnkeyWalletSigner implements SignerApi {
  readonly provider = 'turnkey';
  private client: Promise<{ api: TurnkeyApi; signer: TurnkeySigner }> | null = null;

  constructor(
    private readonly creds: TurnkeyCredentials,
    /** Injected API client (tests); by default the SDK's server client, loaded on first use. */
    private readonly injected: TurnkeyApi | null = null,
  ) {}

  /** The SDKs load on first use: demo deployments and boot never pay for them. */
  private connect(): Promise<{ api: TurnkeyApi; signer: TurnkeySigner }> {
    this.client ??= (async () => {
      const { TurnkeySigner } = await import('@turnkey/solana');
      let api = this.injected;
      if (!api) {
        const { Turnkey } = await import('@turnkey/sdk-server');
        api = new Turnkey({
          apiBaseUrl: this.creds.apiBaseUrl,
          apiPublicKey: this.creds.apiPublicKey,
          apiPrivateKey: this.creds.apiPrivateKey,
          defaultOrganizationId: this.creds.organizationId,
        }).apiClient() as unknown as TurnkeyApi;
      }
      const client = api as unknown as ConstructorParameters<typeof TurnkeySigner>[0]['client'];
      return { api, signer: new TurnkeySigner({ organizationId: this.creds.organizationId, client }) };
    })();
    return this.client;
  }

  async createWallet(accountId: string, chain: ChainId): Promise<EmbeddedWalletRef> {
    if (chain !== 'sol') throw new Error(`embedded wallets are Solana only (asked for ${chain})`);
    const { api } = await this.connect();
    const walletName = walletNameFor(accountId, chain);
    let walletId: string;
    let address: string | undefined;
    try {
      const res = await api.createWallet({ walletName, accounts: [SOLANA_WALLET_ACCOUNT] });
      walletId = res.walletId;
      address = res.addresses[0];
    } catch (err) {
      // Wallet names are unique: a retry after a lost response finds the wallet created the first time.
      const existing = (await api.getWallets({}).catch(() => ({ wallets: [] as { walletId: string; walletName: string }[] }))).wallets.find(
        (w) => w.walletName === walletName,
      );
      if (!existing) throw err;
      walletId = existing.walletId;
      const accounts = await api.getWalletAccounts({ walletId });
      address = accounts.accounts.find((a) => a.addressFormat === SOLANA_WALLET_ACCOUNT.addressFormat)?.address;
    }
    if (!address) throw new Error('Turnkey returned no Solana address');
    new PublicKey(address); // must be a valid base58 key
    return { chain, address, provider: this.provider, providerWalletId: walletId };
  }

  async signTransaction(ref: EmbeddedWalletRef, tx: VersionedTransaction): Promise<VersionedTransaction> {
    if (ref.provider !== this.provider) throw new Error(`wallet is held by ${ref.provider}, not turnkey`);
    const { signer } = await this.connect();
    const signed = await signer.signTransaction(tx, ref.address, this.creds.organizationId);
    if (!(signed instanceof VersionedTransaction)) throw new Error('Turnkey returned a legacy transaction');
    return signed;
  }
}
