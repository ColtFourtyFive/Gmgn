// Live-mode configuration for the EVM chains (Base, Robinhood Chain, BNB Chain,
// Ethereum), read from the environment. Like the Solana config, nothing here
// stops the server from booting: missing pieces are reported as problems and
// the features that need them stay off.

import { isAddress, type Address } from 'viem';
import { EVM_CHAIN_IDS, EVM_CHAINS, type EvmChainId } from './chains';

export interface EvmChainConfig {
  chain: EvmChainId;
  /** HTTP JSON-RPC endpoints, tried in order (configured first, then the public defaults). */
  rpcUrls: string[];
  /** WebSocket RPC for log / head subscriptions; null = poll over HTTP. */
  wsUrl: string | null;
  /** Private / MEV-protected endpoint for sending transactions; null = send through rpcUrls. */
  privateRpcUrl: string | null;
  /** Whether rpcUrls holds only rate-limited public endpoints (reported in live status). */
  publicRpcOnly: boolean;
}

export interface EvmLiveConfig {
  chains: Partial<Record<EvmChainId, EvmChainConfig>>;
  /** Wallet receiving platform fees on every EVM chain; null disables fee collection. */
  feeWallet: Address | null;
  platformFeeBps: number;
  kyberswap: { baseUrl: string; clientId: string };
}

export interface LoadedEvmLiveConfig {
  config: EvmLiveConfig;
  problems: string[];
}

const DEFAULT_PLATFORM_FEE_BPS = 80;

function env(e: NodeJS.ProcessEnv, key: string): string | null {
  const v = e[key]?.trim();
  return v ? v : null;
}

function list(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * EVM chains enabled in live mode: LIVE_CHAINS (comma-separated chain ids, e.g.
 * "sol,base,robinhood") or every supported EVM chain when unset.
 */
export function enabledEvmChains(e: NodeJS.ProcessEnv = process.env): EvmChainId[] {
  const raw = list(env(e, 'LIVE_CHAINS'));
  if (raw.length === 0) return [...EVM_CHAIN_IDS];
  return EVM_CHAIN_IDS.filter((c) => raw.includes(c));
}

export function loadEvmLiveConfig(e: NodeJS.ProcessEnv = process.env): LoadedEvmLiveConfig {
  const problems: string[] = [];
  const chains: EvmLiveConfig['chains'] = {};
  for (const id of enabledEvmChains(e)) {
    const info = EVM_CHAINS[id];
    const configured = list(env(e, `${info.envPrefix}_RPC_URL`));
    if (configured.length === 0) problems.push(`${info.envPrefix}_RPC_URL is not set: ${info.viem.name} uses rate-limited public RPCs`);
    chains[id] = {
      chain: id,
      rpcUrls: [...configured, ...info.publicRpcUrls.filter((u) => !configured.includes(u))],
      wsUrl: env(e, `${info.envPrefix}_WS_URL`),
      privateRpcUrl: env(e, `${info.envPrefix}_PRIVATE_RPC_URL`),
      publicRpcOnly: configured.length === 0,
    };
  }

  const rawFeeWallet = env(e, 'EVM_FEE_WALLET_ADDRESS');
  let feeWallet: Address | null = null;
  if (rawFeeWallet && isAddress(rawFeeWallet)) feeWallet = rawFeeWallet;
  else if (rawFeeWallet) problems.push('EVM_FEE_WALLET_ADDRESS is not a valid address: platform fees are not collected on EVM chains');
  const bps = Number(env(e, 'PLATFORM_FEE_BPS') ?? DEFAULT_PLATFORM_FEE_BPS);
  const platformFeeBps = Number.isFinite(bps) && bps >= 0 && bps <= 300 ? Math.round(bps) : DEFAULT_PLATFORM_FEE_BPS;
  if (!feeWallet && platformFeeBps > 0 && Object.keys(chains).length > 0) problems.push('EVM_FEE_WALLET_ADDRESS is not set: platform fees are not collected on EVM chains');

  return {
    problems,
    config: {
      chains,
      feeWallet,
      platformFeeBps,
      kyberswap: {
        baseUrl: env(e, 'KYBERSWAP_API_URL') ?? 'https://aggregator-api.kyberswap.com',
        clientId: env(e, 'KYBERSWAP_CLIENT_ID') ?? 'trenchscope',
      },
    },
  };
}
