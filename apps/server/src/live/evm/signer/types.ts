// Embedded-wallet signing for the EVM chains. One secp256k1 key per account
// gives one address that is used on every EVM chain (Base, Robinhood Chain,
// BNB Chain, Ethereum); the chain id lives in each transaction, so a signature
// for one chain can never be replayed on another (EIP-155 / EIP-1559).

import type { Address, Hex, TransactionSerializable } from 'viem';
import type { ChainId } from '@trenchscope/shared';
import type { EmbeddedWalletRef } from '../../../context';
import type { EvmChainId } from '../chains';

/** An account's EVM wallet held by the key provider (never a raw key). Same address on every EVM chain. */
export interface EvmWalletRef {
  address: Address;
  /** 'turnkey', or 'local-dev' in development. */
  provider: string;
  /** Provider-side id: the Turnkey wallet id, or the local keystore entry id. */
  providerWalletId: string;
}

/** Signs EVM transactions for embedded wallets; the provider enforces its signing policies. */
export interface EvmSignerApi {
  readonly provider: string;
  /** Provision the account's EVM wallet. Idempotent per account where the provider allows it. */
  createWallet(accountId: string): Promise<EvmWalletRef>;
  /**
   * Sign a fully populated transaction (chainId, nonce, gas and fees set) and
   * return the serialized signed transaction, ready for eth_sendRawTransaction.
   */
  signTransaction(ref: EvmWalletRef, tx: TransactionSerializable): Promise<Hex>;
}

/** Durable key-value storage for encrypted local-dev keys (the orchestrator backs it with the durable store). */
export interface KeyStore {
  get(id: string): string | null;
  put(id: string, blob: string): void;
}

/** The per-chain view of an EVM wallet, in the shape the accounts module stores for every chain. */
export function toEmbeddedWalletRef(ref: EvmWalletRef, chain: EvmChainId): EmbeddedWalletRef {
  return { chain: chain as ChainId, address: ref.address, provider: ref.provider, providerWalletId: ref.providerWalletId };
}

export class EvmSignerError extends Error {
  constructor(
    message: string,
    public readonly code: 'signer_unavailable' | 'wallet_mismatch' | 'signing_failed' | 'invalid_transaction',
  ) {
    super(message);
    this.name = 'EvmSignerError';
  }
}

/** Fields every transaction must carry before it is handed to a signer. */
export function assertSignable(tx: TransactionSerializable): void {
  if (tx.chainId === undefined || tx.chainId <= 0) throw new EvmSignerError('transaction has no chainId', 'invalid_transaction');
  if (tx.nonce === undefined) throw new EvmSignerError('transaction has no nonce', 'invalid_transaction');
  if (tx.gas === undefined || tx.gas <= 0n) throw new EvmSignerError('transaction has no gas limit', 'invalid_transaction');
  const eip1559 = 'maxFeePerGas' in tx && tx.maxFeePerGas !== undefined;
  const legacy = 'gasPrice' in tx && tx.gasPrice !== undefined;
  if (!eip1559 && !legacy) throw new EvmSignerError('transaction has no fee fields', 'invalid_transaction');
}
