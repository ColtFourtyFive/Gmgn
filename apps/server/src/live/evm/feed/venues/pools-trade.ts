// Pools.trade (Uniswap Labs' launchpad on Robinhood Chain). Tokens come from
// Uniswap's UERC20 factory (TokenCreated with description / website / image)
// and Uniswap's LiquidityLauncher puts the whole 1B supply into a Uniswap V4
// pool against ETH (0.25% fee, liquidity locked): an "instant" launch
// initializes and funds the pool in the creation transaction, a "crowd" launch
// after its auction. The token is listed at its pool's first swap (the
// creator's same-block buy for instant launches), when the pool is funded.

import { decodeAbiParameters, toEventSelector } from 'viem';
import { LruMap } from '../lru';
import { cleanSocials, cleanText, type Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, Venue } from './types';
import type { UniswapV4Venue, V4Init } from './uniswap-v4';

export const POOLS_TRADE = {
  /** Uniswap UERC20 token factory. */
  tokenFactory: '0x000000e200088d55c39a11f609e5f667729ad49b',
} as const;

export const POOLS_TRADE_TOPIC = {
  tokenCreated: toEventSelector('TokenCreated(address,(string,string,string,bytes))'),
} as const;

interface Pending {
  token: string;
  description: string;
  website: string;
  image: string;
  creator: string | null;
  erc20: Erc20Info | null;
}

interface CreatedEvent extends FeedEvent {
  kind: 'created';
  pending: Pending;
}

export class PoolsTradeVenue implements Venue {
  readonly id = 'pools-trade';
  /** Created tokens waiting for their pool's first swap (crowd launches wait hours). */
  private readonly pending = new LruMap<string, Pending>(5000);

  constructor(private readonly v4: UniswapV4Venue) {
    v4.addClaimant({ expects: (init) => this.pending.has(init.pool.token), onSwap: (init, ctx) => this.list(init, ctx) });
  }

  interests(): LogInterest[] {
    return [{ address: [POOLS_TRADE.tokenFactory], topics: [POOLS_TRADE_TOPIC.tokenCreated] }];
  }

  decode(log: RawLog): CreatedEvent | null {
    if (log.address !== POOLS_TRADE.tokenFactory || log.topics[0] !== POOLS_TRADE_TOPIC.tokenCreated) return null;
    const [token, meta] = decodeAbiParameters(
      [
        { type: 'address' },
        {
          type: 'tuple',
          components: [
            { name: 'description', type: 'string' },
            { name: 'website', type: 'string' },
            { name: 'image', type: 'string' },
            { name: 'data', type: 'bytes' },
          ],
        },
      ],
      log.data,
    );
    const pending: Pending = { token: token.toLowerCase(), description: meta.description, website: meta.website, image: meta.image, creator: null, erc20: null };
    this.pending.set(pending.token, pending);
    // The creation tx's sender is the creator.
    return { venue: this, log, kind: 'created', pending, trade: true };
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    const created = (events as CreatedEvent[]).map((e) => e.pending);
    const erc20 = await ctx.meta.erc20(created.map((p) => p.token));
    for (const p of created) p.erc20 = erc20.get(p.token) ?? null;
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const e = event as CreatedEvent;
    e.pending.creator = ctx.traderOf(e.log);
    if (!e.pending.erc20) this.pending.delete(e.pending.token);
  }

  /** List the token on its pool's first swap. */
  private list(init: V4Init, ctx: FeedContext): boolean {
    const p = this.pending.get(init.pool.token);
    if (!p?.erc20) return false;
    this.pending.delete(p.token);
    const pool = init.pool;
    pool.tokenDecimals = p.erc20.decimals;
    pool.lpBurnedRate = 1;
    const description = cleanText(p.description, 600);
    const t = ctx.launch({
      token: p.token,
      launchpad: 'pools-trade',
      venue: this.v4.id,
      creator: p.creator ?? p.token,
      createdAt: pool.createdAt || ctx.now(),
      erc20: p.erc20,
      status: 'migrated',
      pool,
      description,
      imageUrl: ctx.meta.imageUrl(p.image),
      metadataUri: p.image || null,
      socials: socialsFromText(description, p.website),
    });
    return !!t;
  }
}

/** X / Telegram links written into a description, plus the website field. */
export function socialsFromText(text: string, website: string) {
  const x = text.match(/https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,30}(?:\/status\/\d+)?/)?.[0];
  const tg = text.match(/https:\/\/t\.me\/[A-Za-z0-9_+]{3,64}/)?.[0];
  return cleanSocials({ twitter: x, telegram: tg, website });
}
