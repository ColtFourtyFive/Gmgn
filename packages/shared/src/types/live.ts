// Shared contract: server meta (mode, chain market info, live stack status) and live mode funding,
// withdrawals and account security. Conventions: ../types.ts.

import type { ChainId } from '../chains';

export interface ChainMarketInfo {
  chain: ChainId;
  nativeUsd: number;
  nativeChange24h: number;
  /** Simulated network priority fee suggestion (native), scaled with congestion. */
  priorityFee: { low: number; medium: number; high: number };
  tokensTracked: number;
  launches1h: number;
  migrations1h: number;
  volume24hUsd: number;
  /** Network load; always set by the server. */
  congestion?: ChainCongestion;
}

/** normal < 0.4 <= busy < 0.7 <= congested. */
export type CongestionLabel = 'normal' | 'busy' | 'congested';

export interface ChainCongestion {
  /** 0..1 */
  level: number;
  label: CongestionLabel;
}

/**
 * live = real chain data and real on-chain trades from custodied embedded wallets;
 * demo = the deterministic market simulator with paper balances (never real funds).
 */
export type AppMode = 'live' | 'demo';

/** Health of the live data/execution stack (live mode only). */
export interface LiveStatus {
  /** Market feed connected and delivering events. */
  feedConnected: boolean;
  /** Last feed event received (ms), null before the first one. */
  lastEventAt: number | null;
  /** RPC answered the last health probe. */
  rpcHealthy: boolean;
  /** Embedded-wallet signer in use ('turnkey', or 'local-dev' for development only). */
  signer: string;
  /** Swaps can be executed (signer + RPC + router configured). */
  tradingEnabled: boolean;
  /** Tokens currently tracked from the feed. */
  trackedTokens: number;
  /** Why live features are disabled (missing or invalid configuration), empty when fully configured. */
  problems?: string[];
}

export interface MetaResponse {
  serverTime: number;
  /** live or demo; the web adapts navigation, copy and features to it. */
  mode: AppMode;
  /** Chains this server serves (live: the chains with real integrations). */
  enabledChains: ChainId[];
  platformFeeRate: number;
  chains: ChainMarketInfo[];
  launchpads: { id: string; chain: ChainId; name: string; color: string }[];
  /** Simulation status (demo mode); `scenario` = the simulator preset (SIM_SCENARIO), absent in live mode. */
  sim: { seed: string; startedAt: number; speed: number; tradesPerSecond: number; scenario?: string };
  /** Live stack health (live mode). */
  live?: LiveStatus;
  /** Where the other mode runs (e.g. the demo site), when configured. */
  demoUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Live mode: funding, withdrawals and account security
//
//   GET  /api/wallet/deposit?chain=sol      -> DepositInfo
//   GET  /api/wallet/transfers?limit=       -> WalletTransfer[] (newest first)
//   POST /api/wallet/withdraw               WithdrawRequest -> WalletTransfer
//   POST /api/wallet/refresh                { chain } -> UserWallet (re-reads balances from chain)
//   GET  /api/security                      -> SecurityStatus
//   POST /api/security/2fa/setup            -> TotpSetup (pending until enabled)
//   POST /api/security/2fa/enable           { code } -> TotpEnableResponse
//   POST /api/security/2fa/disable          { code } -> { enabled: false }
//   POST /api/security/whitelist            { chain, address, label, code } -> WhitelistEntry
//   POST /api/security/whitelist/remove     { chain, address, code } -> { ok: true }
//   POST /api/auth/login                    { username, password, code? } (401 code 'totp_required'
//                                           when 2FA is on and the code is missing or wrong)
//   POST /api/auth/password                 { currentPassword, newPassword, code? } -> AuthResponse
//                                           (every session is signed out; the response is a new one)
//
// Live-mode rules: register needs a password of 10+ characters; sessions expire after
// LIVE_SESSION_TTL_DAYS (default 14) without use; 2FA disable signs out every session (the
// caller's too); login and 2FA disable also take a recovery code in `code`, withdrawals and
// whitelist changes a TOTP code only; a new whitelist address is usable after whitelistDelayMs.
//
// Live-mode error codes: 'guest_disabled' (403, no guest accounts with real funds),
// 'chain_not_enabled' (400: a chain other than enabledChains in params / query / body),
// 'two_factor_unavailable' (503: SECRETS_KEY not configured), 'two_factor_enabled' (409: setup
// while 2FA is on), 'rate_limited' (429 + retry-after: 5 invalid 2FA codes in 10 min lock 15 min),
// 'not_available_in_live' (403: faucet, token launch), 'wallets_unavailable' (503: no signer),
// 'trading_unavailable' (503: RPC / router / signer missing), 'totp_required' (401),
// 'two_factor_required' (403: enable 2FA first), 'address_not_whitelisted' (403),
// 'insufficient_balance' (400), 'tx_failed' (502: the transaction failed on-chain).
// ---------------------------------------------------------------------------

/** Where to send funds to trade (the account's embedded wallet). */
export interface DepositInfo {
  chain: ChainId;
  /** The account's embedded wallet: send SOL or SPL tokens here. */
  address: string;
  /** SOL kept back from "max" buys for network fees and rent (native). */
  feeReserve: number;
  /** Deposits are credited once they reach this commitment. */
  commitment: 'confirmed' | 'finalized';
}

export type TransferStatus = 'pending' | 'sent' | 'confirmed' | 'failed';

/** A deposit seen on-chain or a withdrawal the user requested. */
export interface WalletTransfer {
  id: string;
  chain: ChainId;
  direction: 'deposit' | 'withdrawal';
  /** null = native SOL; otherwise the SPL token mint. */
  mint: string | null;
  symbol: string;
  /** Amount in display units (SOL / tokens). */
  amount: number;
  /** Sender of a deposit, destination of a withdrawal (null when unknown). */
  counterparty: string | null;
  signature: string | null;
  status: TransferStatus;
  error?: string;
  /** Network fee paid (native), 0 for deposits. */
  networkFee: number;
  createdAt: number;
  confirmedAt: number | null;
}

export interface WithdrawRequest {
  chain: ChainId;
  /** Destination: an active whitelisted address. */
  to: string;
  /** null / absent = native SOL; otherwise the SPL token mint. */
  mint?: string | null;
  /** Amount in display units (SOL / tokens). */
  amount: number;
  /** Current TOTP code. */
  code: string;
  /** Client idempotency key: a retry with the same key never sends twice. */
  clientId?: string;
}

export interface WhitelistEntry {
  chain: ChainId;
  address: string;
  label: string;
  addedAt: number;
  /** Withdrawals to it are allowed from this time (new addresses wait SecurityStatus.whitelistDelayMs). */
  activeAt: number;
}

export interface SecurityEvent {
  at: number;
  /** e.g. 'login', 'login_failed', '2fa_enabled', '2fa_disabled', 'whitelist_add', 'whitelist_remove', 'withdrawal'. */
  action: string;
  ip: string | null;
  detail: string;
}

export interface SecurityStatus {
  twoFactorEnabled: boolean;
  whitelist: WhitelistEntry[];
  /** Delay before a newly added whitelist address can receive withdrawals (ms). */
  whitelistDelayMs: number;
  /** Recent security events, newest first. */
  recentEvents: SecurityEvent[];
}

/** A pending TOTP enrolment: confirm with /api/security/2fa/enable. */
export interface TotpSetup {
  /** Base32 secret for manual entry. */
  secret: string;
  /** otpauth:// URI for the authenticator-app QR code. */
  otpauthUrl: string;
}

export interface TotpEnableResponse {
  enabled: true;
  /** One-time recovery codes (each disables 2FA once); shown only now. */
  recoveryCodes: string[];
}
