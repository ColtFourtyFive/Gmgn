// EVM embedded-wallet signers: Turnkey in production, an encrypted local
// keystore in development. One address per account across all EVM chains.

export { LocalDevEvmSigner, decryptKey, encryptKey, parseKeystoreKey, type LocalDevEvmSignerOptions } from './local';
export {
  TURNKEY_EVM_ACCOUNT,
  TurnkeyEvmSigner,
  createTurnkeyEvmClient,
  recommendedTurnkeyPolicies,
  turnkeyWalletName,
  verifySignedTransaction,
  type TurnkeyCredentials,
  type TurnkeyEvmClient,
  type TurnkeyPolicy,
} from './turnkey';
export { EvmSignerError, assertSignable, toEmbeddedWalletRef, type EvmSignerApi, type EvmWalletRef, type KeyStore } from './types';
