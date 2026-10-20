// Live-mode configuration from the environment. Every external dependency is
// optional at boot: missing pieces disable the features that need them (and
// are reported by /api/meta's live status) instead of stopping the server.

import type { ChainId } from '@trenchscope/shared';
import bs58 from 'bs58';

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
    /**
     * Solana market-data sources (LIVE_SOLANA_SOURCES, default "logs,pumpportal"): 'logs' = the pump.fun
     * and PumpSwap programs' logs over the RPC WebSocket (needs wsUrl), 'pumpportal' = PumpPortal's feed.
     * Absent = the default.
     */
    solanaSources?: SolanaSource[];
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
  /** Account security (absent = defaults, with no SECRETS_KEY: 2FA and so withdrawals disabled). */
  security?: LiveSecurityConfig;
}

export interface LiveSecurityConfig {
  /** SECRETS_KEY: 32-byte hex key sealing TOTP secrets at rest (AES-256-GCM); null disables 2FA. */
  secretsKey: string | null;
  /** WHITELIST_DELAY_HOURS: wait before a new withdrawal address can receive funds (ms). */
  whitelistDelayMs: number;
  /** LIVE_SESSION_TTL_DAYS: a session expires after this long without use (ms, sliding). */
  sessionTtlMs: number;
}

export type SolanaSource = 'logs' | 'pumpportal';
export const DEFAULT_SOLANA_SOURCES: SolanaSource[] = ['logs', 'pumpportal'];

/**
 * LIVE_SOLANA_SOURCES: a comma list of 'logs' and 'pumpportal' (order does not matter: program logs are
 * the primary source whenever an RPC WebSocket is configured). Unknown names are reported and ignored;
 * nothing usable means the default. 'logs' without a WebSocket URL is reported (PumpPortal then carries
 * launches and migrations alone, and trades only with a funded key).
 */
export function parseSolanaSources(raw: string | null, wsUrl: string | null, problems: string[]): SolanaSource[] {
  let sources = DEFAULT_SOLANA_SOURCES;
  if (raw) {
    const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const valid = names.filter((s): s is SolanaSource => s === 'logs' || s === 'pumpportal');
    const unknown = names.filter((s) => s !== 'logs' && s !== 'pumpportal');
    if (unknown.length) problems.push(`LIVE_SOLANA_SOURCES: unknown source(s) ${unknown.join(', ')} ignored (use logs, pumpportal)`);
    if (valid.length) sources = [...new Set(valid)];
  }
  if (sources.includes('logs') && !wsUrl) {
    problems.push('No Solana RPC WebSocket (SOLANA_WS_URL / SOLANA_RPC_URL): the program-log feed is off, so Solana trades stream only through PumpPortal with a funded PUMPPORTAL_API_KEY');
  }
  return sources;
}

export const DEFAULT_WHITELIST_DELAY_HOURS = 24;
export const DEFAULT_SESSION_TTL_DAYS = 14;

/** Security settings from the environment; problems are appended to `problems`. */
export function loadSecurityConfig(e: NodeJS.ProcessEnv, problems: string[]): LiveSecurityConfig {
  const raw = env(e, 'SECRETS_KEY');
  const secretsKey = raw && /^[0-9a-fA-F]{64}$/.test(raw) ? raw : null;
  if (!raw) problems.push('SECRETS_KEY is not set: two-factor authentication (and so withdrawals) is disabled');
  else if (!secretsKey) problems.push('SECRETS_KEY must be 32 bytes of hex (64 characters): two-factor authentication (and so withdrawals) is disabled');
  const hours = Number(env(e, 'WHITELIST_DELAY_HOURS') ?? DEFAULT_WHITELIST_DELAY_HOURS);
  const days = Number(env(e, 'LIVE_SESSION_TTL_DAYS') ?? DEFAULT_SESSION_TTL_DAYS);
  return {
    secretsKey,
    whitelistDelayMs: (Number.isFinite(hours) && hours >= 0 && hours <= 24 * 30 ? hours : DEFAULT_WHITELIST_DELAY_HOURS) * 3_600_000,
    sessionTtlMs: (Number.isFinite(days) && days > 0 && days <= 365 ? days : DEFAULT_SESSION_TTL_DAYS) * 86_400_000,
  };
}

export interface LoadedLiveConfig {
  config: LiveConfig;
  /** Human-readable reasons features are disabled (logged at boot, surfaced in live status). */
  problems: string[];
}

const DEFAULT_PLATFORM_FEE_BPS = 80;
/**
 * Public IPFS gateways tried in order when IPFS_GATEWAYS is unset; the first also serves token
 * images to browsers. Checked on mainnet metadata in October 2026: ipfs.filebase.io (fast) and
 * gateway.pinata.cloud (slow) serve JSON and images cross-origin; ipfs.io and dweb.link were
 * retired (429 to servers, a challenge page with CORP same-origin to browsers), w3s.link and
 * nftstorage.link redirect to them, cloudflare-ipfs.com and cf-ipfs.com no longer resolve.
 */
export const DEFAULT_IPFS_GATEWAYS = 'https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/';

function env(e: NodeJS.ProcessEnv, key: string): string | null {
  const v = e[key]?.trim();
  return v ? v : null;
}

/** A base58 string that decodes to a 32-byte public key. */
function isSolanaAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
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
  // Kept as configured (swaps then answer 503 trading_unavailable) so a typo never silently drops fees.
  else if (feeWallet && platformFeeBps > 0 && !isSolanaAddress(feeWallet)) problems.push('FEE_WALLET_ADDRESS is not a valid Solana address: trading is disabled until it is fixed');
  const security = loadSecurityConfig(e, problems);
  const wsUrl = env(e, 'SOLANA_WS_URL') ?? (rpcUrl ? wsFromHttp(rpcUrl) : null);
  const solanaSources = parseSolanaSources(env(e, 'LIVE_SOLANA_SOURCES'), wsUrl, problems);

  return {
    problems,
    config: {
      chain: 'sol',
      rpcUrl,
      wsUrl,
      feed: {
        pumpPortalUrl: env(e, 'PUMPPORTAL_WS_URL') ?? 'wss://pumpportal.fun/api/data',
        maxTrackedTokens: Math.max(100, Number(env(e, 'LIVE_MAX_TRACKED_TOKENS') ?? 3000) || 3000),
        solanaSources,
      },
      jupiter: {
        baseUrl: env(e, 'JUPITER_API_URL') ?? (env(e, 'JUPITER_API_KEY') ? 'https://api.jup.ag' : 'https://lite-api.jup.ag'),
        apiKey: env(e, 'JUPITER_API_KEY'),
      },
      jitoUrl: env(e, 'JITO_BLOCK_ENGINE_URL') ?? 'https://mainnet.block-engine.jito.wtf',
      signer: { provider, turnkey, localKeystoreKey: provider === 'local-dev' ? localKeystoreKey : null },
      fees: { platformFeeBps, feeWallet },
      // A dedicated gateway (e.g. Pinata or Filebase with your own key) is better in production.
      ipfsGateways: (env(e, 'IPFS_GATEWAYS') ?? DEFAULT_IPFS_GATEWAYS).split(',').map((g) => g.trim()).filter(Boolean),
      security,
    },
  };
}
