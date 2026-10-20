// EVM market feed settings from the environment (per chain where it matters).
//
//   EVM_MAX_TRACKED_TOKENS     tokens whose trades are followed per chain (default 1500)
//   <PREFIX>_RPC_RPS           request budget per second (default 4 on Robinhood's public RPC,
//                              8 on other public RPCs, 25 with a configured provider)
//   <PREFIX>_FEED_POLL_MS      head poll interval (default: about two blocks, 1-4 s)
//   <PREFIX>_CONFIRMATIONS     blocks behind the head treated as final (Base / Robinhood 0, BSC / Ethereum 2)
//   EVM_FEED_BACKFILL_BLOCKS   blocks before the head to start from (default 0)
//   EVM_NEW_PAIRS              list tokens launched straight into a DEX pool ("1" default, "0" off)
//   EVM_NEW_PAIR_MIN_SWAPS     swaps a fresh pool needs before it is listed (default 2)
//   EVM_FEED_PRUNE_WORLD       drop old untracked tokens from the ledger ("1" default)
//   EVM_IPFS_GATEWAYS          gateways for ipfs:// metadata (default filebase, pinata)

import { EVM_CHAINS, type EvmChainId } from '../chains';
import type { EvmChainConfig } from '../config';

export interface EvmFeedChainSettings {
  chain: EvmChainId;
  rps: number;
  pollMs: number;
  confirmations: number;
  /** Blocks re-queried every window (late-indexing load-balanced backends). */
  rescan: number;
  backfill: number;
  /** Native volume (whole units) a new pool must trade before it is listed. */
  newPairMinVolume: number;
}

export interface EvmFeedSettings {
  maxTrackedTokens: number;
  newPairs: boolean;
  newPairMinSwaps: number;
  pruneWorld: boolean;
  ipfsGateways: string[];
  chains: Partial<Record<EvmChainId, EvmFeedChainSettings>>;
}

const DEFAULTS: Record<EvmChainId, { pollMs: number; confirmations: number; rescan: number; publicRps: number; newPairMinVolume: number }> = {
  // 2 s blocks, sequencer-ordered.
  base: { pollMs: 2000, confirmations: 0, rescan: 2, publicRps: 8, newPairMinVolume: 0.05 },
  // ~105 ms blocks, sequencer-ordered; the public RPC rate-limits hard.
  robinhood: { pollMs: 2500, confirmations: 0, rescan: 10, publicRps: 4, newPairMinVolume: 0.05 },
  // 0.45 s blocks, fast finality but shallow reorgs happen.
  bsc: { pollMs: 1500, confirmations: 2, rescan: 2, publicRps: 8, newPairMinVolume: 0.2 },
  eth: { pollMs: 4000, confirmations: 2, rescan: 1, publicRps: 8, newPairMinVolume: 0.05 },
};

function num(e: NodeJS.ProcessEnv, key: string): number | null {
  const v = e[key]?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function loadEvmFeedSettings(chains: Partial<Record<EvmChainId, EvmChainConfig>>, e: NodeJS.ProcessEnv = process.env): EvmFeedSettings {
  const out: EvmFeedSettings['chains'] = {};
  for (const cfg of Object.values(chains)) {
    if (!cfg) continue;
    const d = DEFAULTS[cfg.chain];
    const prefix = EVM_CHAINS[cfg.chain].envPrefix;
    out[cfg.chain] = {
      chain: cfg.chain,
      rps: Math.max(1, num(e, `${prefix}_RPC_RPS`) ?? (cfg.publicRpcOnly ? d.publicRps : 25)),
      pollMs: Math.max(250, num(e, `${prefix}_FEED_POLL_MS`) ?? d.pollMs),
      confirmations: Math.max(0, Math.round(num(e, `${prefix}_CONFIRMATIONS`) ?? d.confirmations)),
      rescan: d.rescan,
      backfill: Math.max(0, Math.round(num(e, 'EVM_FEED_BACKFILL_BLOCKS') ?? 0)),
      newPairMinVolume: d.newPairMinVolume,
    };
  }
  const gateways = (e.EVM_IPFS_GATEWAYS?.trim() || 'https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => /^https:\/\//.test(g))
    .map((g) => (g.endsWith('/') ? g : `${g}/`));
  return {
    maxTrackedTokens: Math.max(50, Math.round(num(e, 'EVM_MAX_TRACKED_TOKENS') ?? 1500)),
    newPairs: (e.EVM_NEW_PAIRS?.trim() ?? '1') !== '0',
    newPairMinSwaps: Math.max(1, Math.round(num(e, 'EVM_NEW_PAIR_MIN_SWAPS') ?? 2)),
    pruneWorld: (e.EVM_FEED_PRUNE_WORLD?.trim() ?? '1') !== '0',
    ipfsGateways: gateways,
    chains: out,
  };
}
