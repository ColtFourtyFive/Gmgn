// viem clients per EVM chain: one public client over the configured RPCs (in
// fallback order, with retries and JSON-RPC batching) and, when configured, a
// separate client for the private / MEV-protected send endpoint.

import { createPublicClient, fallback, http, webSocket, type PublicClient, type Transport } from 'viem';
import { EVM_CHAINS, type EvmChainId } from './chains';
import type { EvmChainConfig } from './config';

const RPC_TIMEOUT_MS = 10_000;

function httpTransport(url: string): Transport {
  return http(url, { batch: { batchSize: 50, wait: 10 }, retryCount: 3, retryDelay: 250, timeout: RPC_TIMEOUT_MS });
}

/** Read client for a chain: configured RPCs first, public ones after, ranked by health. */
export function createEvmPublicClient(cfg: EvmChainConfig): PublicClient {
  const info = EVM_CHAINS[cfg.chain];
  const transports = cfg.rpcUrls.map(httpTransport);
  return createPublicClient({
    chain: info.viem,
    transport: transports.length === 1 ? transports[0] : fallback(transports, { rank: false, retryCount: 1 }),
    batch: { multicall: { batchSize: 1024, wait: 10 } },
  });
}

/** Subscription client over the chain's WebSocket RPC, or null when none is configured. */
export function createEvmWsClient(cfg: EvmChainConfig): PublicClient | null {
  if (!cfg.wsUrl) return null;
  return createPublicClient({ chain: EVM_CHAINS[cfg.chain].viem, transport: webSocket(cfg.wsUrl, { retryCount: 5, reconnect: true }) });
}

/** Client used to broadcast signed transactions: the private endpoint when configured. */
export function createEvmSendClient(cfg: EvmChainConfig): PublicClient {
  if (!cfg.privateRpcUrl) return createEvmPublicClient(cfg);
  return createPublicClient({ chain: EVM_CHAINS[cfg.chain].viem, transport: http(cfg.privateRpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }) });
}

export type EvmClients = Partial<Record<EvmChainId, { read: PublicClient; send: PublicClient; ws: PublicClient | null }>>;
