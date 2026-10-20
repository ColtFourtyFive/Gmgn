// Builds the live-mode services (RPC connection, wallet signer) from config.

import { Connection } from '@solana/web3.js';
import type { AppConfig, LiveServices } from '../context';
import { createSigner } from './signer';

export function createLiveServices(config: AppConfig): LiveServices | null {
  const live = config.live;
  if (config.mode !== 'live' || !live) return null;
  const connection = live.rpcUrl ? new Connection(live.rpcUrl, { commitment: 'confirmed', wsEndpoint: live.wsUrl ?? undefined }) : null;
  const signer = createSigner(live, config.dataDir, config.liveProblems);
  return { config: live, connection, signer };
}
