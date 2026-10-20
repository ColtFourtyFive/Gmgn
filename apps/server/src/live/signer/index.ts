// The embedded-wallet signer for the configured provider: Turnkey in
// production, the encrypted local keystore in development, none otherwise.

import { join } from 'node:path';
import type { SignerApi } from '../../context';
import type { LiveConfig } from '../config';
import { LocalDevSigner } from './local-dev';
import { TurnkeyWalletSigner } from './turnkey';

export { LocalDevSigner } from './local-dev';
export { TurnkeyWalletSigner, SOLANA_WALLET_ACCOUNT, walletNameFor, type TurnkeyApi } from './turnkey';

export const DEV_KEYSTORE_FILE = 'dev-keystore.json';

/** Build the signer; a provider that fails to start is reported in `problems` and leaves wallets disabled. */
export function createSigner(live: LiveConfig, dataDir: string, problems: string[], env: NodeJS.ProcessEnv = process.env): SignerApi | null {
  try {
    if (live.signer.provider === 'turnkey' && live.signer.turnkey) return new TurnkeyWalletSigner(live.signer.turnkey);
    if (live.signer.provider === 'local-dev' && live.signer.localKeystoreKey) {
      return new LocalDevSigner(live.signer.localKeystoreKey, join(dataDir, DEV_KEYSTORE_FILE), env);
    }
  } catch (err) {
    const problem = `wallet signer (${live.signer.provider}) failed to start: ${err instanceof Error ? err.message : String(err)}`;
    problems.push(problem);
    console.warn(`[live] ${problem}`);
  }
  return null;
}
