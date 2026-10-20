// EVM live market feed: one ChainFeed per enabled EVM chain (Base, Robinhood
// Chain, BNB Chain, Ethereum) writing real launches, trades, curve
// completions and DEX migrations into the shared World ledger, plus the native
// USD prices from on-chain pools. LiveMarket owns one instance:
//
//   const feed = new EvmMarketFeed({ world, config: loadEvmLiveConfig().config });
//   feed.start();                         // after the World is restored
//   await feed.ensureToken('base', addr); // a pasted contract address
//   feed.status();                        // per chain health for live status
//   await feed.stop();
//
// Tokens pinned through World.addPinSource are never evicted from tracking.

import type { LiveStatus } from '@trenchscope/shared';
import type { PublicClient } from 'viem';
import type { TokenState, World } from '../../../sim/world';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { createEvmPublicClient, createEvmWsClient } from '../clients';
import type { EvmLiveConfig } from '../config';
import { NativePriceFeed, type NativePriceStatus } from '../price';
import { ChainFeed, type EvmChainFeedStatus } from './chain-feed';
import { loadEvmFeedSettings, type EvmFeedSettings } from './config';
import { createUnbatchedClient, RequestBudget, ViemEvmRpc, type EvmRpc } from './rpc';
import { buildVenues } from './venues/registry';

export interface EvmMarketFeedOptions {
  world: World;
  /** Enabled chains, RPC endpoints and WebSocket URLs (loadEvmLiveConfig). */
  config: EvmLiveConfig;
  /** Feed settings (loadEvmFeedSettings from the environment when omitted). */
  settings?: EvmFeedSettings;
  /** Prebuilt read clients per chain (e.g. shared with execution); built from config otherwise. */
  clients?: Partial<Record<EvmChainId, PublicClient>>;
  /** Replace the RPC layer (tests replay recorded chain data). */
  rpcs?: Partial<Record<EvmChainId, EvmRpc>>;
  /** Use WebSocket head subscriptions where <PREFIX>_WS_URL is set (default true). */
  websockets?: boolean;
  /** Wallets that must survive ledger pruning (followed by accounts, copy-trade leaders, alerts). */
  keepWallet?: (chain: EvmChainId, address: string) => boolean;
  /** Fetch off-chain token metadata (tests). */
  fetchJson?: (url: string) => Promise<unknown | null>;
  now?: () => number;
}

export interface EvmChainStatus extends EvmChainFeedStatus {
  nativeUsd: number | null;
  nativePrice: NativePriceStatus | null;
}

export class EvmMarketFeed {
  readonly chains = new Map<EvmChainId, ChainFeed>();
  readonly prices: NativePriceFeed;
  readonly settings: EvmFeedSettings;
  private started = false;

  constructor(private readonly opts: EvmMarketFeedOptions) {
    this.settings = opts.settings ?? loadEvmFeedSettings(opts.config.chains);
    const rpcs: Partial<Record<EvmChainId, EvmRpc>> = {};
    for (const cfg of Object.values(opts.config.chains)) {
      if (!cfg) continue;
      const s = this.settings.chains[cfg.chain];
      if (!s) continue;
      const info = EVM_CHAINS[cfg.chain];
      const budget = new RequestBudget(s.rps);
      // eth_getLogs goes through its own unbatched client: one slow log query never holds up a batch.
      const rpc =
        opts.rpcs?.[cfg.chain] ??
        new ViemEvmRpc(opts.clients?.[cfg.chain] ?? createEvmPublicClient(cfg), budget, info.multicall3, undefined, createUnbatchedClient(info.viem, cfg.rpcUrls));
      rpcs[cfg.chain] = rpc;
      const feed = new ChainFeed({
        chain: cfg.chain,
        world: opts.world,
        rpc,
        budget,
        venues: buildVenues(cfg.chain, { newPairs: this.settings.newPairs, newPairMinSwaps: this.settings.newPairMinSwaps, newPairMinVolume: s.newPairMinVolume }),
        maxTrackedTokens: this.settings.maxTrackedTokens,
        pollMs: s.pollMs,
        confirmations: s.confirmations,
        rescan: s.rescan,
        backfill: s.backfill,
        logMaxAddresses: s.logMaxAddresses,
        emitterlessRange: s.emitterlessRange,
        ipfsGateways: this.settings.ipfsGateways,
        pruneWorld: this.settings.pruneWorld,
        ws: opts.websockets === false || opts.rpcs ? null : createEvmWsClient(cfg),
        now: opts.now,
        fetchJson: opts.fetchJson,
        keepWallet: opts.keepWallet ? (addr) => opts.keepWallet!(cfg.chain, addr) : undefined,
      });
      this.chains.set(cfg.chain, feed);
    }
    this.prices = new NativePriceFeed(opts.world, rpcs, 15_000, opts.now);
  }

  /** Start polling every chain and refreshing native prices. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.prices.start();
    for (const f of this.chains.values()) f.start();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.prices.stop();
    await Promise.all([...this.chains.values()].map((f) => f.stop()));
  }

  feed(chain: EvmChainId): ChainFeed | undefined {
    return this.chains.get(chain);
  }

  /**
   * Load a token the feed has not seen (e.g. a pasted contract address): its
   * launchpad curve, or its deepest native pool, registered and tracked. Null
   * when the chain is not enabled or nothing tradable was found.
   */
  async ensureToken(chain: EvmChainId, address: string): Promise<TokenState | null> {
    const feed = this.chains.get(chain);
    return feed ? feed.ensureToken(address) : null;
  }

  status(): Partial<Record<EvmChainId, EvmChainStatus>> {
    const out: Partial<Record<EvmChainId, EvmChainStatus>> = {};
    for (const [chain, f] of this.chains) {
      const price = this.prices.status(chain);
      out[chain] = { ...f.status(), nativeUsd: price?.usd ?? null, nativePrice: price };
    }
    return out;
  }

  /** One chain's health in the LiveStatus shape (signer / trading fields are the caller's). */
  liveStatus(chain: EvmChainId): Pick<LiveStatus, 'feedConnected' | 'lastEventAt' | 'rpcHealthy' | 'trackedTokens'> | null {
    const f = this.chains.get(chain);
    if (!f) return null;
    const s = f.status();
    return { feedConnected: s.connected, lastEventAt: s.lastEventAt, rpcHealthy: s.connected && s.lagBlocks < 1000, trackedTokens: s.trackedTokens };
  }
}

export { ChainFeed } from './chain-feed';
export type { EvmChainFeedStatus } from './chain-feed';
export { loadEvmFeedSettings } from './config';
export type { EvmFeedSettings } from './config';
