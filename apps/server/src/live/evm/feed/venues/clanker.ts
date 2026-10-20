// Clanker v4 (Base). deployToken mints the 100B supply, initializes a Uniswap
// V4 pool against WETH (dynamic fee, tick spacing 200, a Clanker hook), funds
// the positions, runs extensions (the creator's dev buy is a swap in the same
// transaction) and finally emits TokenCreated with the image, the metadata
// JSON (description, socialMediaUrls) and the pool id. Decoding covers the
// whole window before anything is applied, so the token is listed at the dev
// buy (its first trade) or, without one, at TokenCreated. Checked against the
// verified Clanker factory ABI and mainnet deploy receipts.

import { decodeAbiParameters, parseAbi, toEventSelector } from 'viem';
import { decodeCall, encodeCall, topicAddress, v4PoolId, type PoolKey } from '../abi';
import { LruMap } from '../lru';
import { cleanSocials, cleanText, type Erc20Info } from '../metadata';
import type { LogInterest } from '../poller';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, Venue } from './types';
import { DYNAMIC_FEE_FLAG, type UniswapV4Venue, type V4Init } from './uniswap-v4';

export const CLANKER = {
  /** Clanker v4 factory on Base. */
  factory: '0xe85a59c628f7d27878aceb4bf3b35733630083a9',
  tickSpacing: 200,
} as const;

export const CLANKER_TOPIC = {
  tokenCreated: toEventSelector(
    'TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])',
  ),
} as const;

const factoryAbi = parseAbi(['function tokenDeploymentInfo(address token) view returns ((address token, address hook, address locker, address[] extensions))']);

interface Launch {
  txHash: string;
  token: string;
  admin: string;
  image: string;
  name: string;
  symbol: string;
  metadata: string;
  poolId: string;
  pairedToken: string;
  erc20: Erc20Info | null;
}

interface CreatedEvent extends FeedEvent {
  kind: 'created';
  launch: Launch;
}

export class ClankerVenue implements Venue {
  readonly id = 'clanker';
  /** Launches by pool id (the pool's Initialize precedes TokenCreated in the deploy tx). */
  private readonly byPool = new LruMap<string, Launch>(2000);
  /** Launches listed recently (dev-buy attribution). */
  private readonly listed = new LruMap<string, Launch>(500);
  private windowTokens: string[] = [];

  constructor(private readonly v4: UniswapV4Venue) {
    v4.addClaimant({
      expects: (init) => this.byPool.has(init.id) || this.listed.has(init.id),
      onSwap: (init, ctx) => this.list(init, ctx),
      // The dev buy is run by Clanker's deployer in the deploy tx, for the token admin.
      traderOf: (init, log) => {
        const l = this.listed.get(init.id);
        return l && l.txHash === log.transactionHash ? l.admin : null;
      },
    });
  }

  interests(): LogInterest[] {
    return [{ address: [CLANKER.factory], topics: [CLANKER_TOPIC.tokenCreated] }];
  }

  decode(log: RawLog, ctx: FeedContext): CreatedEvent | null {
    if (log.address !== CLANKER.factory || log.topics[0] !== CLANKER_TOPIC.tokenCreated || log.topics.length !== 3) return null;
    const [, image, name, symbol, metadata, , , , poolId, pairedToken] = decodeAbiParameters(
      [
        { type: 'address' },
        { type: 'string' },
        { type: 'string' },
        { type: 'string' },
        { type: 'string' },
        { type: 'string' },
        { type: 'int24' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'address[]' },
      ],
      log.data,
    );
    // Only launches against the native asset price in the World's unit.
    if (!ctx.isNative(pairedToken)) return null;
    const launch: Launch = {
      txHash: log.transactionHash,
      token: topicAddress(log.topics[1]),
      admin: topicAddress(log.topics[2]),
      image,
      name,
      symbol,
      metadata,
      poolId: poolId.toLowerCase(),
      pairedToken: pairedToken.toLowerCase(),
      erc20: null,
    };
    this.byPool.set(launch.poolId, launch);
    this.windowTokens.push(launch.token);
    return { venue: this, log, kind: 'created', launch };
  }

  async prepare(events: FeedEvent[], ctx: FeedContext): Promise<void> {
    const launches = (events as CreatedEvent[]).map((e) => e.launch);
    const erc20 = await ctx.meta.erc20(launches.map((l) => l.token));
    for (const l of launches) l.erc20 = erc20.get(l.token) ?? null;
  }

  apply(event: FeedEvent, ctx: FeedContext): void {
    const { launch } = event as CreatedEvent;
    if (ctx.token(launch.token)) return; // listed at its dev buy
    const init = this.v4.recentInit(launch.poolId);
    if (init) this.list(init, ctx);
    this.byPool.delete(launch.poolId);
  }

  private list(init: V4Init, ctx: FeedContext): boolean {
    const l = this.byPool.get(init.id);
    if (!l?.erc20 || init.pool.token !== l.token) return false;
    this.byPool.delete(init.id);
    this.listed.set(init.id, l);
    const pool = init.pool;
    pool.tokenDecimals = l.erc20.decimals;
    // Clanker positions are held by its locker for good.
    pool.lpBurnedRate = 1;
    const meta = parseClankerMetadata(l.metadata);
    const t = ctx.launch({
      token: l.token,
      launchpad: 'clanker',
      venue: this.v4.id,
      creator: l.admin,
      createdAt: pool.createdAt || ctx.now(),
      erc20: { ...l.erc20, name: l.erc20.name || cleanText(l.name, 64), symbol: l.erc20.symbol || cleanText(l.symbol, 24) },
      status: 'migrated',
      pool,
      description: meta.description,
      imageUrl: ctx.meta.imageUrl(l.image),
      metadataUri: l.image || null,
      socials: meta.socials,
    });
    return !!t;
  }

  launching(): string[] {
    return this.windowTokens;
  }

  endWindow(): void {
    this.windowTokens = [];
  }

  /** ensureToken: a Clanker v4 token on its WETH pool. */
  async detect(token: string, ctx: FeedContext): Promise<boolean> {
    const [raw] = await ctx.rpc.call([{ target: CLANKER.factory, data: encodeCall(factoryAbi, 'tokenDeploymentInfo', [token]) }]);
    const info = decodeCall<{ token: string; hook: string }>(factoryAbi, 'tokenDeploymentInfo', raw);
    if (!info || info.token.toLowerCase() !== token) return false;
    const weth = ctx.info.wrappedNative.toLowerCase();
    const key: PoolKey = {
      currency0: token < weth ? token : weth,
      currency1: token < weth ? weth : token,
      fee: DYNAMIC_FEE_FLAG,
      tickSpacing: CLANKER.tickSpacing,
      hooks: info.hook.toLowerCase(),
    };
    const erc20 = (await ctx.meta.erc20([token])).get(token);
    if (!erc20) return false;
    const pool = await this.v4.loadPool(key, v4PoolId(key), token, erc20.decimals, ctx.now(), ctx);
    if (!pool) return false;
    pool.lpBurnedRate = 1;
    return !!ctx.launch({ token, launchpad: 'clanker', venue: this.v4.id, creator: token, createdAt: ctx.now(), erc20, status: 'migrated', pool });
  }
}

/** Clanker's metadata JSON: { description, socialMediaUrls: [{ platform, url }] }. */
export function parseClankerMetadata(raw: string): { description: string; socials: ReturnType<typeof cleanSocials> } {
  let doc: { description?: unknown; socialMediaUrls?: unknown } = {};
  try {
    doc = JSON.parse(raw) as typeof doc;
  } catch {
    // not JSON
  }
  const urls = Array.isArray(doc.socialMediaUrls) ? (doc.socialMediaUrls as { platform?: unknown; url?: unknown }[]) : [];
  const find = (...names: string[]) => urls.find((u) => typeof u.platform === 'string' && names.includes(u.platform.toLowerCase()) && typeof u.url === 'string' && u.url)?.url;
  return {
    description: cleanText(doc.description, 600),
    socials: cleanSocials({ twitter: find('x', 'twitter'), telegram: find('telegram'), website: find('website') }),
  };
}
