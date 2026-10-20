// A venue is one source of launches and trades on a chain (a launchpad's
// contracts, or an AMM's factory / pools). The chain feed fetches every
// venue's log interests per block window, lets each venue decode the logs it
// owns (in chain order, so a launch's parameters and its first buy in the same
// transaction line up), runs the venues' batched async lookups, then applies
// every event to the World in chain order.

import type { Socials } from '@trenchscope/shared';
import type { ExternalTrade, TokenState, World } from '../../../../sim/world';
import type { EvmChainId, EvmChainInfo } from '../../chains';
import type { Erc20Info, TokenMetadata } from '../metadata';
import type { LogInterest } from '../poller';
import type { AmmPool, PoolBook } from '../pools';
import type { EvmRpc, RawLog } from '../rpc';
import type { TrackedTokens } from '../tracked';

/** A token's pool found by ensureToken: its native depth (whole units) and how it would be listed. */
export interface PoolProbe {
  depth: number;
  pool: AmmPool;
  /** LIVE_LAUNCHPADS id for a token first seen through a DEX pool. */
  launchpad: string;
  venue: string;
}

export interface FeedEvent {
  venue: Venue;
  log: RawLog;
  /** A trade: its transaction's sender is resolved before apply. */
  trade?: boolean;
}

export interface CurveInput {
  virtualNative: number;
  virtualTokens: number;
  realNative: number;
  realTokens: number;
  initialRealTokens: number;
  feeRate: number;
}

export interface LaunchInput {
  token: string;
  /** LIVE_LAUNCHPADS id. */
  launchpad: string;
  /** Venue that follows the token's trades. */
  venue: string;
  creator: string;
  createdAt: number;
  erc20: Erc20Info;
  status: 'curve' | 'migrated';
  curve?: CurveInput;
  pool?: AmmPool;
  description?: string;
  imageUrl?: string | null;
  metadataUri?: string | null;
  socials?: Socials;
  /** Off-chain document to fetch in the background (description / image / socials). */
  offchain?: { uri: string; parse: (doc: unknown) => { description?: string; imageUrl?: string | null; socials?: Socials } };
  buyTax?: number;
  sellTax?: number;
}

/** What venues can reach: chain data, shared caches and the ledger writes. */
export interface FeedContext {
  readonly chain: EvmChainId;
  readonly info: EvmChainInfo;
  readonly world: World;
  readonly rpc: EvmRpc;
  readonly pools: PoolBook;
  readonly meta: TokenMetadata;
  readonly tracked: TrackedTokens;
  /** The window being processed (its last block). */
  readonly windowTo: bigint;
  /** Wall clock (ms; the World clock in live mode). */
  now(): number;
  /** Wrapped native or the zero address (native ETH in V4 pools). */
  isNative(address: string): boolean;
  /** Block time of a log (ms). */
  timeOf(log: RawLog): number;
  /** The trader of a swap log (resolved transaction sender), or `reported` when unknown. */
  traderOf(log: RawLog, reported?: string): string | null;
  /** This chain's token in the World. */
  token(address: string): TokenState | undefined;
  /** Not a memecoin (e.g. Robinhood Chain stock tokens): never listed. Known only after `screen`. */
  isExcluded(token: string): boolean;
  /** Check tokens against the exclusion rules (batched reads). */
  screen(tokens: string[], erc20: Map<string, Erc20Info>): Promise<void>;
  /** Register a launch in the World and start tracking it. */
  launch(input: LaunchInput): TokenState | null;
  trade(t: TokenState, trade: ExternalTrade): void;
  complete(t: TokenState, at: number): void;
  migrate(t: TokenState, pool: AmmPool, at: number): void;
  /** Push a pool's state into its token (no trade). */
  syncPool(t: TokenState, pool: AmmPool): void;
  /** Count an event for the venue (status). */
  count(venue: string, what: 'launches' | 'trades' | 'migrations' | 'skipped'): void;
  error(venue: string, err: unknown): void;
  /** Other venues of the chain (pool adoption after graduation). */
  venue<T extends Venue>(id: string): T | undefined;
}

export interface Venue {
  readonly id: string;
  /** Logs to fetch for the next window (static contracts plus what is followed now). */
  interests(ctx: FeedContext): LogInterest[];
  /** Decode a log (in chain order; may note pending state for later logs of the window). */
  decode(log: RawLog, ctx: FeedContext): FeedEvent | null;
  /** Extra logs this window needs for things first seen in it (e.g. a pool created this window). */
  followUp?(ctx: FeedContext): LogInterest[];
  /** Batched async lookups before apply (metadata, unknown curves, pool state). */
  prepare?(events: FeedEvent[], ctx: FeedContext): Promise<void>;
  /** Apply one decoded event to the ledger. */
  apply(event: FeedEvent, ctx: FeedContext): void;
  /** End of window: drop per-window scratch state. */
  endWindow?(ctx: FeedContext): void;
  /** ensureToken: load a token this venue launched that the feed has not seen; true when registered. */
  detect?(token: string, ctx: FeedContext): Promise<boolean>;
  /** ensureToken fallback for DEX venues: the token's deepest native pool here, if any. */
  probe?(token: string, ctx: FeedContext): Promise<PoolProbe | null>;
  /** Stop following a token (evicted from the tracked set). */
  untrack?(token: string): void;
  /** Periodic upkeep (expire candidates, refresh state). */
  housekeeping?(ctx: FeedContext): Promise<void>;
}
