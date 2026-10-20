// Turnkey-backed EVM signer: each account gets a Turnkey HD wallet with one
// Ethereum account (ADDRESS_FORMAT_ETHEREUM at m/44'/60'/0'/0/0), and every
// transaction is signed inside Turnkey's enclave with signTransaction
// (TRANSACTION_TYPE_ETHEREUM over the unsigned serialized transaction). The
// signed result is parsed and its signer recovered before it is returned, so a
// response for the wrong wallet or a different transaction is rejected.
//
// Request shapes follow @turnkey/sdk-server 8.7.1 (types from @turnkey/sdk-types
// 1.11.0) and the way @turnkey/viem calls it: unsignedTransaction is the
// serialized transaction hex without 0x, the result is hex without 0x.
//
// Recommended Turnkey policies (see recommendedTurnkeyPolicies below): the
// platform's API user may only sign transactions on the four EVM chains whose
// `to` is an allow-listed router / launchpad / token approval target, the fee
// wallet, or a plain value transfer / ERC-20 transfer (withdrawals to the
// user's whitelisted address). Turnkey evaluates policies before signing, so a
// compromised server cannot drain wallets through arbitrary contracts.

import type {
  TCreateWalletBody,
  TCreateWalletResponse,
  TGetWalletAccountsBody,
  TGetWalletAccountsResponse,
  TGetWalletsBody,
  TGetWalletsResponse,
  TSignTransactionBody,
  TSignTransactionResponse,
} from '@turnkey/sdk-server';
import { Turnkey, defaultEthereumAccountAtIndex } from '@turnkey/sdk-server';
import { getAddress, isAddressEqual, keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction, type Address, type Hex, type TransactionSerializable } from 'viem';
import { EVM_CHAINS, EVM_CHAIN_IDS } from '../chains';
import { EvmSignerError, assertSignable, type EvmSignerApi, type EvmWalletRef } from './types';

/** The subset of Turnkey's API client the signer uses (the real TurnkeyApiClient satisfies it; tests pass a fake). */
export interface TurnkeyEvmClient {
  createWallet(input: TCreateWalletBody): Promise<TCreateWalletResponse>;
  signTransaction(input: TSignTransactionBody): Promise<TSignTransactionResponse>;
  getWallets(input?: TGetWalletsBody): Promise<TGetWalletsResponse>;
  getWalletAccounts(input: TGetWalletAccountsBody): Promise<TGetWalletAccountsResponse>;
}

export interface TurnkeyCredentials {
  apiBaseUrl: string;
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}

/** The HD path and address format of an account's EVM key (BIP-44 coin type 60, first account). */
export const TURNKEY_EVM_ACCOUNT = defaultEthereumAccountAtIndex(0);

export function turnkeyWalletName(accountId: string): string {
  return `trenchscope-evm-${accountId}`;
}

export function createTurnkeyEvmClient(creds: TurnkeyCredentials): TurnkeyEvmClient {
  return new Turnkey({
    apiBaseUrl: creds.apiBaseUrl,
    apiPublicKey: creds.apiPublicKey,
    apiPrivateKey: creds.apiPrivateKey,
    defaultOrganizationId: creds.organizationId,
  }).apiClient();
}

export class TurnkeyEvmSigner implements EvmSignerApi {
  readonly provider = 'turnkey';

  constructor(
    private readonly client: TurnkeyEvmClient,
    private readonly organizationId: string,
  ) {}

  static fromCredentials(creds: TurnkeyCredentials): TurnkeyEvmSigner {
    return new TurnkeyEvmSigner(createTurnkeyEvmClient(creds), creds.organizationId);
  }

  /**
   * Create the account's Turnkey wallet. Call once per account and persist the
   * ref; after a crash between creation and persistence use findWallet().
   */
  async createWallet(accountId: string): Promise<EvmWalletRef> {
    let res: TCreateWalletResponse;
    try {
      res = await this.client.createWallet({
        organizationId: this.organizationId,
        walletName: turnkeyWalletName(accountId),
        accounts: [TURNKEY_EVM_ACCOUNT],
      });
    } catch (err) {
      throw new EvmSignerError(`turnkey createWallet failed: ${(err as Error).message}`, 'signer_unavailable');
    }
    const address = res.addresses?.[0];
    if (!res.walletId || !address) throw new EvmSignerError('turnkey createWallet returned no Ethereum address', 'signer_unavailable');
    return { address: getAddress(address), provider: this.provider, providerWalletId: res.walletId };
  }

  /** Look up an account's existing wallet by name (recovery path; lists the organization's wallets). */
  async findWallet(accountId: string): Promise<EvmWalletRef | null> {
    const { wallets } = await this.client.getWallets({ organizationId: this.organizationId });
    const wallet = wallets.find((w) => w.walletName === turnkeyWalletName(accountId));
    if (!wallet) return null;
    const { accounts } = await this.client.getWalletAccounts({ organizationId: this.organizationId, walletId: wallet.walletId });
    const account = accounts.find((a) => a.addressFormat === 'ADDRESS_FORMAT_ETHEREUM' && a.path === TURNKEY_EVM_ACCOUNT.path);
    return account ? { address: getAddress(account.address), provider: this.provider, providerWalletId: wallet.walletId } : null;
  }

  async signTransaction(ref: EvmWalletRef, tx: TransactionSerializable): Promise<Hex> {
    if (ref.provider !== this.provider) throw new EvmSignerError(`wallet belongs to signer ${ref.provider}`, 'wallet_mismatch');
    assertSignable(tx);
    const unsigned = serializeTransaction(tx);
    let res: TSignTransactionResponse;
    try {
      res = await this.client.signTransaction({
        organizationId: this.organizationId,
        signWith: ref.address,
        unsignedTransaction: unsigned.slice(2),
        type: 'TRANSACTION_TYPE_ETHEREUM',
      });
    } catch (err) {
      throw new EvmSignerError(`turnkey signTransaction failed: ${(err as Error).message}`, 'signing_failed');
    }
    const signed = (res.signedTransaction.startsWith('0x') ? res.signedTransaction : `0x${res.signedTransaction}`) as Hex;
    await verifySignedTransaction(signed, unsigned, ref.address);
    return signed;
  }
}

/** The signed transaction must be our unsigned transaction plus a signature by `address`. */
export async function verifySignedTransaction(signed: Hex, unsigned: Hex, address: Address): Promise<void> {
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(signed);
  } catch {
    throw new EvmSignerError('signer returned an unparseable transaction', 'signing_failed');
  }
  const { r: _r, s: _s, v: _v, yParity: _y, ...fields } = parsed as TransactionSerializable & { r?: Hex; s?: Hex; v?: bigint; yParity?: number };
  if (keccak256(serializeTransaction(fields as TransactionSerializable)) !== keccak256(unsigned)) {
    throw new EvmSignerError('signer returned a different transaction than requested', 'signing_failed');
  }
  const recovered = await recoverTransactionAddress({ serializedTransaction: signed as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction'] });
  if (!isAddressEqual(recovered, address)) throw new EvmSignerError('signature does not recover to the wallet address', 'wallet_mismatch');
}

export interface TurnkeyPolicy {
  policyName: string;
  effect: 'EFFECT_ALLOW' | 'EFFECT_DENY';
  /** Who may use the policy: the platform's API user only. */
  consensus: string;
  condition: string;
  notes: string;
}

/**
 * The policies we recommend installing in the Turnkey organization (one per
 * chain, plus withdrawals), given the allow-listed contract targets per chain.
 * Addresses are lowercased (Turnkey compares strings). Kept as separate
 * policies because Turnkey's engine does not short-circuit.
 *
 *  - swaps: `to` in the chain's allow-list (routers, launchpads, Permit2) or a
 *    token approve() call (selector 0x095ea7b3; the spender is checked by the
 *    engine before signing — Turnkey cannot parse it without an uploaded ABI);
 *  - fee transfers: plain value transfers to the platform fee wallet;
 *  - withdrawals: plain value transfers (empty data) and ERC-20 transfer()
 *    (0xa9059cbb) — the destination is the user's 2FA-gated whitelist, which
 *    Turnkey cannot see, so this is the widest rule and is worth gating behind
 *    a separate approver if the product allows it.
 */
export function recommendedTurnkeyPolicies(opts: {
  apiUserId: string;
  /** Allow-listed contract targets per EVM chain (see exec/allowlist.ts: allowlistedTargets). */
  targets: Partial<Record<(typeof EVM_CHAIN_IDS)[number], Address[]>>;
  feeWallet: Address | null;
}): TurnkeyPolicy[] {
  const consensus = `approvers.any(user, user.id == '${opts.apiUserId}')`;
  const policies: TurnkeyPolicy[] = [];
  for (const chain of EVM_CHAIN_IDS) {
    const targets = (opts.targets[chain] ?? []).map((a) => `'${a.toLowerCase()}'`);
    if (targets.length === 0) continue;
    const chainId = EVM_CHAINS[chain].chainId;
    policies.push({
      policyName: `trenchscope-evm-swaps-${chain}`,
      effect: 'EFFECT_ALLOW',
      consensus,
      condition: `activity.resource == 'PRIVATE_KEY' && activity.action == 'SIGN' && eth.tx.chain_id == ${chainId} && eth.tx.to in [${targets.join(', ')}]`,
      notes: `Swaps on ${EVM_CHAINS[chain].viem.name} through allow-listed routers and launchpads only.`,
    });
    policies.push({
      policyName: `trenchscope-evm-approvals-${chain}`,
      effect: 'EFFECT_ALLOW',
      consensus,
      condition: `activity.resource == 'PRIVATE_KEY' && activity.action == 'SIGN' && eth.tx.chain_id == ${chainId} && eth.tx.value == 0 && eth.tx.data[0..10] == '0x095ea7b3'`,
      notes: 'Exact-amount ERC-20 approvals; the engine only builds them for allow-listed spenders.',
    });
  }
  const chainIds = EVM_CHAIN_IDS.map((c) => EVM_CHAINS[c].chainId).join(', ');
  if (opts.feeWallet) {
    policies.push({
      policyName: 'trenchscope-evm-platform-fee',
      effect: 'EFFECT_ALLOW',
      consensus,
      condition: `activity.resource == 'PRIVATE_KEY' && activity.action == 'SIGN' && eth.tx.chain_id in [${chainIds}] && eth.tx.to == '${opts.feeWallet.toLowerCase()}' && (eth.tx.data == '' || eth.tx.data == '0x')`,
      notes: 'Platform fee transfers (native) to the fee wallet.',
    });
  }
  policies.push({
    policyName: 'trenchscope-evm-withdrawals',
    effect: 'EFFECT_ALLOW',
    consensus,
    condition: `activity.resource == 'PRIVATE_KEY' && activity.action == 'SIGN' && eth.tx.chain_id in [${chainIds}] && (eth.tx.data == '' || eth.tx.data == '0x' || (eth.tx.value == 0 && eth.tx.data[0..10] == '0xa9059cbb'))`,
    notes: 'Withdrawals: native transfers and ERC-20 transfer() to the user\'s whitelisted address (whitelist + TOTP enforced by the server).',
  });
  return policies;
}
