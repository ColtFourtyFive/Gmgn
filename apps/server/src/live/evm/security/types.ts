// Public types of the EVM token security checker. Every fact is "known or
// null": null means no provider could establish it (the UI renders "—"), never
// a silent false / 0.

import type { Address, Hex } from 'viem';
import type { EvmChainId } from '../chains';

export type Tri = boolean | null;

/** Who produced a fact. Order of authority on conflict: simulation > onchain > launchpad > third parties. */
export type SecurityProvider = 'simulation' | 'onchain' | 'launchpad' | 'explorer' | 'goplus' | 'honeypotis';

/** How a provider call ended (cached in the report so the UI / logs can explain gaps). */
export type SourceOutcome =
  | 'ok'
  | 'not_found' // provider has no data for this token (e.g. honeypot.is "pair not found")
  | 'unsupported' // chain not supported by the provider
  | 'rate_limited'
  | 'blocked' // e.g. Cloudflare challenge in front of an explorer
  | 'timeout'
  | 'error'
  | 'skipped'; // not attempted (disabled, backing off, nothing to do)

export interface SourceStatus {
  provider: SecurityProvider;
  /** Finer name, e.g. "blockscout", "sourcify", "uniswap-v2". */
  detail?: string;
  outcome: SourceOutcome;
  /** ms epoch when the provider answered (or failed). */
  fetchedAt: number;
  ms: number;
  error?: string;
}

/** Boolean / numeric facts merged across providers (all optional: absent = provider does not know). */
export interface SecurityFacts {
  isOpenSource?: boolean;
  /** Owner is the zero / dead address, or the contract has no owner function. */
  isRenounced?: boolean;
  isHoneypot?: boolean;
  /** 0..1 */
  buyTax?: number;
  sellTax?: number;
  transferTax?: number;
  cannotBuy?: boolean;
  cannotSellAll?: boolean;
  mintable?: boolean;
  /** A proxy delegating to replaceable code (minimal clones are not counted: their target is fixed). */
  proxy?: boolean;
  /** Code can be replaced (proxy with an admin / UUPS / beacon owner). */
  upgradeable?: boolean;
  ownerCanChangeBalance?: boolean;
  /** Owner can change buy / sell taxes (GoPlus slippage_modifiable). */
  taxModifiable?: boolean;
  /** Owner can set a tax for specific addresses (GoPlus personal_slippage_modifiable). */
  personalTaxModifiable?: boolean;
  blacklist?: boolean;
  whitelist?: boolean;
  /** Owner can pause transfers / trading (GoPlus transfer_pausable). */
  pausable?: boolean;
  /** Max tx / max wallet limits exist (GoPlus is_anti_whale). */
  antiWhale?: boolean;
  antiWhaleModifiable?: boolean;
  tradingCooldown?: boolean;
  hiddenOwner?: boolean;
  canTakeBackOwnership?: boolean;
  selfDestruct?: boolean;
  externalCall?: boolean;
}

export type FactKey = keyof SecurityFacts;

/** What ownership means for this token, after launchpad templates are taken into account. */
export type OwnerRole =
  | 'none' // no owner / admin function
  | 'renounced' // owner is the zero or dead address
  | 'launchpad' // owner is the launchpad contract (bonding curve phase), not the dev
  | 'metadata-only' // an admin exists but can only edit metadata (template-verified)
  | 'privileged'; // an owner / admin with unknown or full powers

export type ProxyKind = 'eip1967' | 'eip1967-beacon' | 'eip1822' | 'oz-legacy' | 'minimal-clone' | 'unknown-delegate';

export interface ProxyInfo {
  kind: ProxyKind;
  implementation: Address | null;
  /** EIP-1967 admin slot (transparent proxies) or the beacon. */
  admin: Address | null;
  beacon: Address | null;
}

export type HolderKind = 'burn' | 'pool' | 'locker' | 'launchpad' | 'contract' | 'eoa' | 'unknown';

export interface TopHolder {
  address: Address;
  /** Share of total supply, 0..1. */
  share: number;
  /** Balance in whole tokens (decimal string, decimals applied), when known. */
  balance: string | null;
  kind: HolderKind;
  label?: string;
}

export interface LpLocker {
  address: Address;
  name: string;
  /** Share of the pool's LP supply, 0..1 (null when the position is an NFT / V4 position). */
  share: number | null;
}

export interface LpInfo {
  /** Pool the shares refer to (V2 pair); null when the provider aggregates several pools. */
  pool: Address | null;
  /** Share of LP held by burn addresses, 0..1. */
  burnedShare: number | null;
  /** Share of LP held by known lockers, 0..1. */
  lockedShare: number | null;
  lockers: LpLocker[];
  provider: SecurityProvider;
}

export interface CreatorInfo {
  address: Address | null;
  /** Balance in whole tokens (decimal string, decimals applied). */
  balance: string | null;
  /** Share of total supply, 0..1. */
  share: number | null;
}

export interface LaunchpadMatch {
  /** Stable id, e.g. "four.meme", "flap", "clanker-v4", "zora", "pons-v2", "pools.trade". */
  id: string;
  name: string;
  /** Template variant, e.g. "standard", "tax". */
  template: string;
  /** How it was recognised (registry call, clone target, ...). */
  evidence: string;
  /** Lifecycle state when the launchpad exposes it, e.g. "bonding-curve", "graduated". */
  phase: string | null;
  /** Human-readable facts the template guarantees (shown as audit hints). */
  facts: string[];
}

/** One leg of the simulated round trip. */
export interface RoundTripLeg {
  ok: boolean;
  /** buy: tokens the pool sent; transfer / sell: tokens debited from the sender. */
  expected: bigint;
  /** buy: tokens received; transfer: tokens the recipient got; sell: tokens the pool got. */
  actual: bigint;
  gasUsed: bigint;
  /** Revert data (hex) when the leg failed. */
  error: Hex | null;
  /** Decoded revert reason, when recognisable. */
  reason: string | null;
}

export interface RoundTripResult {
  /** Simulator id, e.g. "uniswap-v2", "pancake-v3". */
  venue: string;
  pool: PoolRef;
  amountIn: bigint;
  buy: RoundTripLeg;
  transfer: RoundTripLeg | null;
  sell: RoundTripLeg | null;
  /** Quote received for the sell leg, and what the pool would have paid before the sell started. */
  quoteOut: bigint;
  expectedQuoteOut: bigint;
  buyTax: number | null;
  /** Reported sell tax: the effective (quote-level) loss when measurable, else the token-level loss. */
  sellTax: number | null;
  /** Tokens lost between the seller and the pool. */
  tokenSellTax: number | null;
  /** Quote lost against the pre-sell quote (token tax plus any tax tokens the contract dumps first). */
  effectiveSellTax: number | null;
  transferTax: number | null;
  /** True: sells revert or return (almost) nothing. False: the round trip completed. Null: inconclusive. */
  isHoneypot: boolean | null;
  cannotBuy: boolean | null;
  /** Sells simulated from real holder addresses (their own balances, their own tax treatment). */
  holderSells: HolderSell[];
  notes: string[];
}

export interface HolderSell {
  holder: Address;
  ok: boolean;
  sellTax: number | null;
  reason: string | null;
}

/** A pool / venue a simulator can trade on. */
export interface PoolRef {
  /** Simulator / venue id that owns this pool. */
  venue: string;
  /** Pool address (V2 pair, V3 pool) or a venue-specific id (e.g. a V4 pool id). */
  address: Hex;
  token: Address;
  quote: Address;
  /** Quote-side liquidity used to rank pools (raw quote units). */
  quoteReserve: bigint;
  /** Fee in hundredths of a bip (V3 style, 3000 = 0.3%) when known. */
  fee: number | null;
  /** Venue-specific data (e.g. a V4 PoolKey) the simulator needs. */
  extra?: Record<string, unknown>;
}

export interface Disagreement {
  field: string;
  values: { provider: SecurityProvider; value: boolean | number | string | null }[];
  /** Provider whose value the report kept. */
  chosen: SecurityProvider;
}

export interface EvmSecurityReport {
  chain: EvmChainId;
  token: Address;
  checkedAt: number;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  /** Total supply in whole tokens (decimal string, decimals applied). */
  totalSupply: string | null;

  isOpenSource: Tri;
  isRenounced: Tri;
  isHoneypot: Tri;
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
  cannotBuy: Tri;
  cannotSellAll: Tri;

  /** Every merged boolean flag (null = unknown). */
  flags: {
    mintable: Tri;
    proxy: Tri;
    upgradeable: Tri;
    ownerCanChangeBalance: Tri;
    taxModifiable: Tri;
    personalTaxModifiable: Tri;
    blacklist: Tri;
    whitelist: Tri;
    pausable: Tri;
    antiWhale: Tri;
    antiWhaleModifiable: Tri;
    tradingCooldown: Tri;
    hiddenOwner: Tri;
    canTakeBackOwnership: Tri;
    selfDestruct: Tri;
    externalCall: Tri;
  };
  /** Current owner / admin when one exists (zero address when renounced to it). */
  owner: Address | null;
  ownerRole: OwnerRole | null;
  proxy: ProxyInfo | null;
  /** Privileged functions found in the bytecode, e.g. "blacklist: addBots(address[])". */
  privilegedFunctions: string[];
  lp: LpInfo | null;
  holders: TopHolder[] | null;
  holderCount: number | null;
  creator: CreatorInfo;
  launchpad: LaunchpadMatch | null;
  simulation: RoundTripResult | null;

  sources: SourceStatus[];
  disagreements: Disagreement[];
  /** Share of the tracked fields (see COVERAGE_FIELDS) with a known value, 0..1. */
  coverage: number;
  notes: string[];
}

export interface EvmSecurityCheckOptions {
  /** Token creation time (ms epoch) when known: tokens < 1 h old are cached for 1 min instead of 10. */
  createdAt?: number;
  /** Pools the caller already knows (main pool first); skips discovery for those venues. */
  pools?: PoolRef[];
  /** Bypass the cache (still deduplicated with an in-flight check). */
  fresh?: boolean;
  /** Abort the whole check. */
  signal?: AbortSignal;
}
