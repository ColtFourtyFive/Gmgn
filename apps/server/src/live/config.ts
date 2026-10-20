// Live-mode configuration from the environment. Every external dependency is
// optional at boot: missing pieces disable the features that need them (and
// are reported by /api/meta's live status) instead of stopping the server.

import type { ChainId } from '@trenchscope/shared';

export interface LiveConfig {
  chain: Extract<ChainId, 'sol'>;
  /** HTTPS JSON-RPC endpoint (e.g. Helius / QuickNode / Triton); null disables RPC-backed features and trading. */
  rpcUrl: string | null;
  /** WebSocket RPC endpoint; derived from rpcUrl when unset. */
  wsUrl: string | null;
  feed: {
    /** PumpPortal data WebSocket (pump.fun / PumpSwap launches, trades, migrations). */
    pumpPortalUrl: string;
    /** Tokens whose trades are streamed at once; the least active are dropped beyond this. */
    maxTrackedTokens: number;
  };
  jupiter: {
    /** Swap API base (https://lite-api.jup.ag free tier, https://api.jup.ag with a key). */
    baseUrl: string;
    apiKey: string | null;
  };
  /** Jito block engine for MEV-protected sends (bundles / sendTransaction); null = plain RPC sends only. */
  jitoUrl: string | null;
  signer: {
    provider: 'turnkey' | 'local-dev' | null;
    turnkey: { apiBaseUrl: string; organizationId: string; apiPublicKey: string; apiPrivateKey: string } | null;
    /** local-dev only: 32-byte hex key encrypting dev keypairs at rest. Refused in production. */
    localKeystoreKey: string | null;
  };
  fees: {
    /** Platform fee in basis points charged on every swap. */
    platformFeeBps: number;
    /** Wallet receiving platform fees; null disables fee collection (and is reported). */
    feeWallet: string | null;
  };
  /** Gateways tried in order for ipfs:// and /ipfs/ metadata URIs. */
  ipfsGateways: string[];
}

export interface LoadedLiveConfig {
  config: LiveConfig;
  /** Human-readable reasons features are disabled (logged at boot, surfaced in live status). */
  problems: string[];
}

const DEFAULT_PLATFORM_FEE_BPS = 80;

function env(e: NodeJS.ProcessEnv, key: string): string | null {
  const v = e[key]?.trim();
  return v ? v : null;
}

function wsFromHttp(url: string): string {
  return url.replace(/^http(s?):\/\//, (_m, s: string) => `ws${s}://`);
}

export function loadLiveConfig(e: NodeJS.ProcessEnv = process.env): LoadedLiveConfig {
  const problems: string[] = [];
  const rpcUrl = env(e, 'SOLANA_RPC_URL');
  if (!rpcUrl) problems.push('SOLANA_RPC_URL is not set: balances, holders, deposits and trading are disabled');

  const turnkeyKeys = ['TURNKEY_ORGANIZATION_ID', 'TURNKEY_API_PUBLIC_KEY', 'TURNKEY_API_PRIVATE_KEY'];
  const turnkey = turnkeyKeys.every((k) => env(e, k))
    ? {
        apiBaseUrl: env(e, 'TURNKEY_API_BASE_URL') ?? 'https://api.turnkey.com',
        organizationId: env(e, 'TURNKEY_ORGANIZATION_ID')!,
        apiPublicKey: env(e, 'TURNKEY_API_PUBLIC_KEY')!,
        apiPrivateKey: env(e, 'TURNKEY_API_PRIVATE_KEY')!,
      }
    : null;
  const localKeystoreKey = env(e, 'LOCAL_KEYSTORE_KEY');
  const production = e.NODE_ENV === 'production';
  let provider: LiveConfig['signer']['provider'] = null;
  if (turnkey) provider = 'turnkey';
  else if (localKeystoreKey && !production) provider = 'local-dev';
  else if (localKeystoreKey && production) problems.push('LOCAL_KEYSTORE_KEY is ignored in production: configure Turnkey');
  if (!provider) problems.push('no wallet signer configured (TURNKEY_ORGANIZATION_ID / TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY): wallets and trading are disabled');

  const bps = Number(env(e, 'PLATFORM_FEE_BPS') ?? DEFAULT_PLATFORM_FEE_BPS);
  const platformFeeBps = Number.isFinite(bps) && bps >= 0 && bps <= 300 ? Math.round(bps) : DEFAULT_PLATFORM_FEE_BPS;
  const feeWallet = env(e, 'FEE_WALLET_ADDRESS');
  if (!feeWallet && platformFeeBps > 0) problems.push('FEE_WALLET_ADDRESS is not set: platform fees are not collected');

  return {
    problems,
    config: {
      chain: 'sol',
      rpcUrl,
      wsUrl: env(e, 'SOLANA_WS_URL') ?? (rpcUrl ? wsFromHttp(rpcUrl) : null),
      feed: {
        pumpPortalUrl: env(e, 'PUMPPORTAL_WS_URL') ?? 'wss://pumpportal.fun/api/data',
        maxTrackedTokens: Math.max(100, Number(env(e, 'LIVE_MAX_TRACKED_TOKENS') ?? 3000) || 3000),
      },
      jupiter: {
        baseUrl: env(e, 'JUPITER_API_URL') ?? (env(e, 'JUPITER_API_KEY') ? 'https://api.jup.ag' : 'https://lite-api.jup.ag'),
        apiKey: env(e, 'JUPITER_API_KEY'),
      },
      jitoUrl: env(e, 'JITO_BLOCK_ENGINE_URL') ?? 'https://mainnet.block-engine.jito.wtf',
      signer: { provider, turnkey, localKeystoreKey: provider === 'local-dev' ? localKeystoreKey : null },
      fees: { platformFeeBps, feeWallet },
      ipfsGateways: (env(e, 'IPFS_GATEWAYS') ?? 'https://ipfs.io/ipfs/,https://cloudflare-ipfs.com/ipfs/').split(',').map((g) => g.trim()).filter(Boolean),
    },
  };
}
