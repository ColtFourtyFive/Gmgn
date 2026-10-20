// Live market source: real Solana launches and trades written into the shared
// World ledger, so analytics, trading and the WebSocket channels work the same
// way they do over the simulator.

import type { LiveStatus } from '@trenchscope/shared';
import type { AppContext, MarketSource } from '../context';
import type { TokenState } from '../sim/world';

export class LiveMarket implements MarketSource {
  readonly mode = 'live' as const;
  private lastEventAt: number | null = null;

  constructor(private readonly ctx: AppContext) {}

  install(): void {}

  /** Nothing to seed: the ledger fills from the feed. */
  bootstrap(): void {}

  start(): void {}

  async stop(): Promise<void> {}

  /** User launches are a demo-mode feature; live tokens come from the chain. */
  adopt(_t: TokenState): void {}

  liveStatus(): LiveStatus {
    const live = this.ctx.live;
    return {
      feedConnected: false,
      lastEventAt: this.lastEventAt,
      rpcHealthy: false,
      signer: live?.signer?.provider ?? 'none',
      tradingEnabled: false,
      trackedTokens: this.ctx.world.tokensByChain.sol.length,
    };
  }

  serialize(): unknown {
    return { version: 1 };
  }

  restore(_data: unknown): void {}
}
