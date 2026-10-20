// Token launches ("Cooking", GMGN's create-token flow): a signed-in user
// deploys a token on a launchpad's bonding curve from their paper wallet, with
// an optional dev buy (exit strategy attached) and up to four bundle wallets
// buying in the creation block. The market simulator then adopts the token and
// trades it like its own launches; it never sells the launcher's wallets.
// Bundle wallets follow the launcher's exits (followSell). Launches pay a flat
// fee and are rate limited per account.

import {
  CHAINS,
  CHAIN_IDS,
  PLATFORM_FEE_RATE,
  formatNative,
  formatUsd,
  launchpadsFor,
  type ChainId,
  type LaunchConfig,
  type LaunchpadConfig,
  type LaunchpadCurve,
  type LaunchResponse,
  type Order,
  type Socials,
  type SwapReceipt,
} from '@trenchscope/shared';
import { HttpError, type AppContext } from '../context';
import { DEFAULT_LAUNCH_GLYPH, LAUNCH_GLYPHS, RESERVED_TICKERS, seedString } from '../sim/names';
import type { TokenState, WalletState } from '../sim/world';
import { HOUR_MS, badRequest, balanceOf } from './common';
import { fillReceipt, networkFeeOf, type Executor, type Fill, type Ticket } from './execution';
import { LAUNCH_LIMITS, type LaunchInput } from './schemas';

/** Flat launch fee: 0.02 SOL, and about the same USD value on the other chains at their reference prices. */
export const LAUNCH_FEE_NATIVE: Record<ChainId, number> = { sol: 0.02, bsc: 0.006, base: 0.0011, eth: 0.0011 };
export const LAUNCHES_PER_HOUR = 5;

/** A launchpad's fresh curve: where it starts and where it graduates, at the given native price. */
function curveOf(lp: LaunchpadConfig, nativeUsd: number): LaunchpadCurve {
  const vtEnd = lp.virtualTokens - lp.curveTokens;
  const vnEnd = (lp.virtualNative * lp.virtualTokens) / vtEnd;
  return {
    id: lp.id,
    chain: lp.chain,
    name: lp.name,
    color: lp.color,
    totalSupply: lp.totalSupply,
    virtualNative: lp.virtualNative,
    virtualTokens: lp.virtualTokens,
    curveTokens: lp.curveTokens,
    feeRate: lp.feeRate,
    migrationFeeNative: lp.migrationFeeNative,
    graduationNative: vnEnd - lp.virtualNative,
    launchMarketCapUsd: (lp.virtualNative / lp.virtualTokens) * nativeUsd * lp.totalSupply,
    graduationMarketCapUsd: (vnEnd / vtEnd) * nativeUsd * lp.totalSupply,
  };
}

export class Launches {
  /** account id -> sim times of its launches within the last hour (not persisted). */
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
    /** Creates a buy's strategy exits measured from the price at call time (the facade's createExits). */
    private readonly createExits: (fill: Fill) => Order[],
  ) {}

  install(): void {
    this.ctx.world.on('tokenMigrated', (t) => this.onMigrated(t));
  }

  config(): LaunchConfig {
    const { world } = this.ctx;
    const launchpads = {} as Record<ChainId, LaunchpadCurve[]>;
    for (const chain of CHAIN_IDS) launchpads[chain] = launchpadsFor(chain).map((lp) => curveOf(lp, world.nativeUsd(chain)));
    return {
      launchpads,
      launchFeeNative: { ...LAUNCH_FEE_NATIVE },
      glyphs: [...LAUNCH_GLYPHS.keys()],
      glyphNarratives: Object.fromEntries([...LAUNCH_GLYPHS].map(([glyph, n]) => [glyph, n.name])),
      defaultGlyph: DEFAULT_LAUNCH_GLYPH,
      reservedTickers: [...RESERVED_TICKERS],
      limits: {
        ...LAUNCH_LIMITS,
        maxDevBuyNative: { ...LAUNCH_LIMITS.maxDevBuyNative },
        maxBundleBuyNative: { ...LAUNCH_LIMITS.maxBundleBuyNative },
        launchesPerHour: LAUNCHES_PER_HOUR,
      },
    };
  }

  /**
   * Deploy the token, then fill the creation-block buys: the dev buy from the
   * account's wallet, then each bundle wallet (funded from it with exactly its
   * buy plus fees). The balance covers fee + every buy before anything happens.
   * The dev buy's exits are created once the whole block has filled: the
   * launcher's own bundle buys are not a market move to take profit on.
   */
  launch(accountId: string, input: LaunchInput): LaunchResponse {
    const { world, accounts, analytics, market } = this.ctx;
    const { chain } = input;
    const launched = this.launchesWithinHour(accountId);
    const wallet = accounts.walletFor(accountId, chain);
    const settings = accounts.getSettings(accountId).trade[chain];
    const preset = settings.buyPresets[input.presetId ?? settings.activeBuyPreset];
    const buyCost = (native: number) => (native > 0 ? native * (1 + PLATFORM_FEE_RATE) + networkFeeOf(chain, preset) : 0);
    const bundleCost = buyCost(input.bundleBuyNative ?? 0);
    const needed = LAUNCH_FEE_NATIVE[chain] + buyCost(input.devBuyNative) + input.bundleWallets * bundleCost;
    if (wallet.native + 1e-12 < needed) {
      const unit = CHAINS[chain].nativeSymbol;
      throw badRequest(`insufficient ${unit} balance: ${formatNative(needed, unit)} needed incl. the launch fee`, 'insufficient_balance');
    }

    // The launch fee leaves the paper economy.
    wallet.native -= LAUNCH_FEE_NATIVE[chain];
    const socials: Socials = {};
    for (const key of ['twitter', 'telegram', 'website'] as const) if (input.socials[key]) socials[key] = input.socials[key];
    const token = world.createToken({
      chain,
      launchpad: input.launchpad,
      creator: wallet,
      symbol: input.symbol,
      name: input.name,
      description: input.description,
      logoSeed: seedString(world.rng),
      logoGlyph: input.logoGlyph,
      narrative: LAUNCH_GLYPHS.get(input.logoGlyph)!.name,
      socials,
      xFollowers: null,
      // placeholders: the market draws the hidden fate when it adopts the token
      fate: 'dud',
      hype: 0,
    });

    const devBuy: Ticket = { accountId, wallet, token, side: 'buy', amount: input.devBuyNative, amountKind: 'native', preset, strategy: null, source: 'manual' };
    const receipts: SwapReceipt[] = [];
    const devReceipt = input.devBuyNative > 0 ? this.executor.fillAtLaunch(devBuy) : null;
    if (devReceipt) receipts.push(devReceipt);
    for (let i = 0; i < input.bundleWallets; i++) {
      const bundler = world.createWallet(chain, 'user', { accountId });
      world.transferNative(wallet, bundler, bundleCost);
      token.bundlers.add(bundler.address);
      receipts.push(this.executor.fillAtLaunch({ ...devBuy, wallet: bundler, amount: input.bundleBuyNative! }));
    }
    if (devReceipt?.ok && input.strategy) {
      devReceipt.orders = this.createExits({ ticket: { ...devBuy, strategy: input.strategy }, receipt: devReceipt }).map((o) => ({ ...o }));
    }
    market.adopt(token);
    launched.push(world.now);
    accounts.pushBalance(accountId, chain);
    return { token: analytics.tokenDetail(token), receipts };
  }

  /**
   * Bundle wallets exit with their launcher: when the account sells a token it
   * launched, each of its bundle wallets sells the same share of its bag (a
   * `fill` on the user channel each, like their launch buys) and the proceeds
   * sweep back to the account's wallet.
   */
  followSell({ accountId, wallet, token }: Ticket, receipt: SwapReceipt): void {
    if (token.creator !== wallet.address || token.bundlers.size === 0) return;
    const { world, accounts, hub } = this.ctx;
    const share = receipt.tokenAmount / (balanceOf(wallet, token) + receipt.tokenAmount);
    for (const address of token.bundlers) {
      const bundler = world.getWallet(address);
      if (!bundler || bundler.accountId !== accountId) continue;
      const held = balanceOf(bundler, token);
      if (held <= 0) continue;
      const out = world.executeSwap(bundler, token, 'sell', share >= 0.999 ? held : held * share, {
        platformFeeRate: PLATFORM_FEE_RATE,
        networkFee: CHAINS[token.chain].baseNetworkFee,
      });
      if (out.ok && out.trade) {
        accounts.recordTradeVolume(accountId, out.usdAmount, out.platformFeeNative * world.nativeUsd(token.chain));
        hub.publishUser(accountId, 'fill', fillReceipt({ ...out, trade: out.trade }, receipt.latencyMs));
      }
      // a sweep between the account's own wallets, not a funding link
      wallet.native += bundler.native;
      bundler.native = 0;
    }
  }

  /** The account's bundle wallets on a chain: those funded for the launches of its chain wallet. */
  bundleWallets(accountId: string, chain: ChainId): WalletState[] {
    const { world, accounts } = this.ctx;
    const wallets: WalletState[] = [];
    for (const address of accounts.walletFor(accountId, chain).createdTokens) {
      for (const bundler of world.getToken(address)?.bundlers ?? []) {
        const wallet = world.getWallet(bundler);
        if (wallet?.accountId === accountId) wallets.push(wallet);
      }
    }
    return wallets;
  }

  /** The account's launch times within the last hour (sim time), to append to; 429 once the hour is full. */
  private launchesWithinHour(accountId: string): number[] {
    const now = this.ctx.world.now;
    for (const [id, times] of this.recent) {
      const live = times.filter((t) => now - t < HOUR_MS);
      if (live.length) this.recent.set(id, live);
      else this.recent.delete(id);
    }
    let times = this.recent.get(accountId);
    if (!times) this.recent.set(accountId, (times = []));
    if (times.length >= LAUNCHES_PER_HOUR) {
      const seconds = Math.ceil((times[0] + HOUR_MS - now) / 1000);
      throw new HttpError(429, `at most ${LAUNCHES_PER_HOUR} launches per hour; try again in ${seconds}s`, 'rate_limited', { 'retry-after': String(seconds) });
    }
    return times;
  }

  private onMigrated(t: TokenState): void {
    const accountId = this.ctx.accounts.accountIdForWallet(t.creator);
    if (!accountId) return;
    this.ctx.accounts.notify(accountId, {
      kind: 'system',
      title: `Your token $${t.symbol} graduated`,
      body: `$${t.symbol} completed its bonding curve and migrated to ${t.pool?.dex ?? 'its AMM pool'} at ${formatUsd(this.ctx.world.marketCapUsd(t))} MC.`,
      chain: t.chain,
      token: t.address,
      wallet: null,
      level: 'success',
    });
  }
}
