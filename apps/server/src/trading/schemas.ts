// Request schemas of the trading API (docs/API.md, "Trading"). Cross-field
// rules live in superRefine so a 400 names the offending field.

import { z } from 'zod';
import { CHAINS, getLaunchpad, isChainId, type ChainId, type OrderKind, type StrategySpec } from '@trenchscope/shared';
import { DEFAULT_LAUNCH_GLYPH, LAUNCH_GLYPHS, RESERVED_TICKERS } from '../sim/names';

/** GMGN caps condition orders attached to one swap at 10. */
export const MAX_STRATEGY_ORDERS = 10;

const chainSchema = z.custom<ChainId>(isChainId, 'unknown chain');
const address = z.string().trim().min(1, 'address is required').max(100, 'address is too long');
const presetId = z.enum(['P1', 'P2', 'P3']);
const positive = z.number().finite().positive();
const sellPercent = positive.max(100);
const label = z.string().trim().max(32).default('');

function issue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function strategyOrderCount(s: StrategySpec): number {
  return s.takeProfits.length + s.stopLosses.length + (s.trailing ? 1 : 0) + (s.devSellPercent > 0 ? 1 : 0) + (s.migrationSellPercent > 0 ? 1 : 0);
}

const strategySchema = z
  .object({
    takeProfits: z.array(z.object({ changePct: positive, sellPercent })).default([]),
    stopLosses: z.array(z.object({ lossPct: positive.lt(100), sellPercent })).default([]),
    trailing: z
      .object({ drawdownPct: positive.lt(100), sellPercent, activateAtChangePct: z.number().finite().min(0).default(0) })
      .nullable()
      .default(null),
    devSellPercent: z.number().finite().min(0).max(100).default(0),
    migrationSellPercent: z.number().finite().min(0).max(100).default(0),
  })
  .refine((s) => strategyOrderCount(s) <= MAX_STRATEGY_ORDERS, `a strategy can hold at most ${MAX_STRATEGY_ORDERS} exit orders`);

// ---------------------------------------------------------------------------
// Quote & swap
// ---------------------------------------------------------------------------

export const quoteSchema = z.object({
  chain: chainSchema,
  token: address,
  side: z.enum(['buy', 'sell']),
  amount: positive,
  amountKind: z.enum(['native', 'percent', 'tokens']),
  presetId: presetId.optional(),
});

export const swapSchema = quoteSchema
  .extend({
    slippage: positive.max(1).optional(),
    priorityFee: z.number().finite().min(0).max(1).optional(),
    antiMev: z.boolean().optional(),
    strategy: strategySchema.optional(),
    clientId: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.strategy && r.side !== 'buy') issue(ctx, 'strategy', 'exit strategies can only be attached to a buy');
  });

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const ORDER_KINDS = ['limit_buy', 'limit_sell', 'take_profit', 'stop_loss', 'trailing_stop', 'dev_sell', 'migration_buy', 'migration_sell'] as const;
const TRIGGER_TYPES: Record<OrderKind, readonly string[]> = {
  limit_buy: ['price', 'mcap'],
  limit_sell: ['price', 'mcap'],
  take_profit: ['change'],
  stop_loss: ['change'],
  trailing_stop: ['change'],
  dev_sell: ['event'],
  migration_buy: ['event'],
  migration_sell: ['event'],
};

export const createOrderSchema = z
  .object({
    chain: chainSchema,
    token: address,
    kind: z.enum(ORDER_KINDS),
    triggerType: z.enum(['price', 'mcap', 'change', 'event']),
    triggerValue: z.number().finite().min(0),
    amount: positive,
    amountKind: z.enum(['native', 'percent', 'tokens']),
    presetId: presetId.optional(),
    expiresInHours: positive.max(24 * 30).optional(),
    activateAtChangePct: z.number().finite().min(0).optional(),
    direction: z.enum(['above', 'below']).optional(),
    devSellThreshold: positive.max(1).optional(),
  })
  .superRefine((o, ctx) => {
    const allowed = TRIGGER_TYPES[o.kind];
    if (!allowed.includes(o.triggerType)) {
      issue(ctx, 'triggerType', `${o.kind} orders trigger on ${allowed.join(' or ')}`);
      return;
    }
    if (o.triggerType === 'event') return;
    if (!(o.triggerValue > 0)) issue(ctx, 'triggerValue', 'must be positive');
    else if ((o.kind === 'stop_loss' || o.kind === 'trailing_stop') && o.triggerValue >= 100) issue(ctx, 'triggerValue', 'must be below 100%');
  });

export const ordersQuerySchema = z.object({
  status: z.enum(['open', 'history']).optional(),
  chain: chainSchema.optional(),
  token: address.optional(),
});

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const portfolioQuerySchema = z.object({ chain: z.union([z.literal('all'), chainSchema]).default('all') });

export const activityQuerySchema = z.object({
  chain: chainSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(50)
    .transform((n) => Math.min(n, 200)),
});

// ---------------------------------------------------------------------------
// Automation: copy trade, sniper, alerts
// ---------------------------------------------------------------------------

/** PATCH bodies are merged over the stored object and re-validated with the create schema. */
export const patchSchema = z.record(z.string(), z.unknown()).default({});

const usdBound = z.number().finite().min(0).nullable().default(null);

export const copyTaskSchema = z
  .object({
    chain: chainSchema,
    target: address,
    label,
    enabled: z.boolean().default(true),
    buyMode: z.enum(['fixed', 'ratio']),
    buyAmount: z.number().finite().min(0).default(0),
    buyRatio: z.number().finite().min(0).max(100).default(1),
    maxPerToken: positive,
    minMarketCapUsd: usdBound,
    maxMarketCapUsd: usdBound,
    minLiquidityUsd: usdBound,
    firstBuyOnly: z.boolean().default(false),
    sellMode: z.enum(['mirror', 'none']).default('mirror'),
    strategy: strategySchema.nullable().default(null),
    blacklist: z.array(address).max(500).default([]),
    presetId: presetId.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.buyMode === 'fixed' && !(t.buyAmount > 0)) issue(ctx, 'buyAmount', 'must be positive for fixed-amount copies');
    if (t.buyMode === 'ratio' && !(t.buyRatio > 0)) issue(ctx, 'buyRatio', 'must be positive for ratio copies');
    if (t.minMarketCapUsd !== null && t.maxMarketCapUsd !== null && t.minMarketCapUsd > t.maxMarketCapUsd) {
      issue(ctx, 'maxMarketCapUsd', 'must be at least minMarketCapUsd');
    }
  });

export const sniperTaskSchema = z
  .object({
    chain: chainSchema,
    kind: z.enum(['new_token', 'migration', 'dev_launch']),
    label,
    enabled: z.boolean().default(true),
    keywords: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
    devAddresses: z.array(address).max(50).default([]),
    launchpads: z.array(z.string()).max(10).default([]),
    requireSocials: z.boolean().default(false),
    maxDevHoldRate: z.number().finite().min(0).max(1).nullable().default(null),
    minDevMigrated: z.number().int().min(0).nullable().default(null),
    buyAmount: positive,
    maxBuys: z.number().int().min(1).max(1000).default(1),
    strategy: strategySchema.nullable().default(null),
    presetId: presetId.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.kind === 'dev_launch' && t.devAddresses.length === 0) issue(ctx, 'devAddresses', 'dev_launch snipes need at least one dev address');
    for (const id of t.launchpads) {
      if (getLaunchpad(id)?.chain !== t.chain) issue(ctx, 'launchpads', `unknown launchpad ${id} on ${t.chain}`);
    }
  });

const TOKEN_ALERTS = new Set(['price', 'mcap', 'change', 'smart_buys']);

export const alertSchema = z
  .object({
    chain: chainSchema,
    kind: z.enum(['price', 'mcap', 'change', 'wallet_trade', 'new_token', 'smart_buys']),
    token: address.nullable().default(null),
    wallet: address.nullable().default(null),
    keyword: z.string().trim().max(32).nullable().default(null),
    direction: z.enum(['above', 'below']).nullable().default(null),
    value: z.number().finite().min(0).default(0),
    repeat: z.boolean().default(false),
    enabled: z.boolean().default(true),
    note: z.string().trim().max(140).default(''),
  })
  .superRefine((a, ctx) => {
    if (TOKEN_ALERTS.has(a.kind) && !a.token) issue(ctx, 'token', `${a.kind} alerts need a token`);
    if (a.kind === 'wallet_trade' && !a.wallet) issue(ctx, 'wallet', 'wallet_trade alerts need a wallet');
    if ((a.kind === 'price' || a.kind === 'mcap' || a.kind === 'change') && !(a.value > 0)) issue(ctx, 'value', 'must be positive');
    if (a.kind === 'smart_buys' && !(Number.isInteger(a.value) && a.value >= 1)) issue(ctx, 'value', 'must be a whole number of buys (>= 1)');
  });

export type CopyTaskInput = z.output<typeof copyTaskSchema>;
export type SniperTaskInput = z.output<typeof sniperTaskSchema>;
export type AlertInput = z.output<typeof alertSchema>;

// ---------------------------------------------------------------------------
// Token launch
// ---------------------------------------------------------------------------

export const LAUNCH_LIMITS = {
  nameMaxLength: 32,
  symbolMaxLength: 10,
  descriptionMaxLength: 280,
  maxBundleWallets: 4,
  /** Creation-block buy caps (native): the dev buy plus every bundle stay far below what any curve needs to graduate. */
  maxDevBuyNative: { sol: 10, bsc: 3, base: 0.6, eth: 0.6 } as Record<ChainId, number>,
  maxBundleBuyNative: { sol: 5, bsc: 1.5, base: 0.3, eth: 0.3 } as Record<ChainId, number>,
};

/** Control, zero-width, bidi-override, lone-surrogate and line / paragraph separator characters (invisible, broken or direction-flipping text). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
/** Stacked combining marks ("Zalgo" text spilling over neighbouring rows); real scripts need at most three. */
const STACKED_MARKS = /\p{M}{4,}/u;
const visible = (s: string) => !INVISIBLE.test(s) && !STACKED_MARKS.test(s);
const tickerOf = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** An https link (on one of `hosts` when given), canonicalized; blank means "none". */
function socialLink(hosts: string[] | null) {
  const link = z
    .string()
    .trim()
    .max(200, 'link is too long')
    .refine(
      (raw) => {
        if (!URL.canParse(raw)) return false;
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        return url.protocol === 'https:' && !url.username && !url.password && host.includes('.') && (!hosts || hosts.includes(host));
      },
      hosts ? `must be an https link on ${hosts.join(' or ')}` : 'must be an https link',
    )
    .transform((raw) => new URL(raw).href);
  return z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), link.optional());
}

export const launchSchema = z
  .object({
    chain: chainSchema,
    launchpad: z.string().trim().min(1, 'launchpad is required').max(40),
    name: z
      .string()
      .trim()
      .min(1, 'name is required')
      .max(LAUNCH_LIMITS.nameMaxLength)
      .refine(visible, 'name contains control, invisible or stacked characters')
      .refine((s) => !RESERVED_TICKERS.has(tickerOf(s)), 'this name is reserved'),
    symbol: z
      .string()
      .trim()
      .transform((s) => s.replace(/^\$/, '').toUpperCase())
      .pipe(z.string().regex(new RegExp(`^[A-Z0-9]{1,${LAUNCH_LIMITS.symbolMaxLength}}$`), `must be 1-${LAUNCH_LIMITS.symbolMaxLength} letters or digits`))
      .refine((s) => !RESERVED_TICKERS.has(s), 'this ticker is reserved'),
    description: z
      .string()
      .trim()
      .transform((s) => s.replace(/\r\n?/g, '\n'))
      .pipe(z.string().max(LAUNCH_LIMITS.descriptionMaxLength))
      .refine((s) => visible(s.replace(/\n/g, '')), 'description contains control, invisible or stacked characters')
      .default(''),
    socials: z.object({ twitter: socialLink(['x.com', 'twitter.com']), telegram: socialLink(['t.me', 'telegram.me']), website: socialLink(null) }).default({}),
    logoGlyph: z
      .string()
      .refine((g) => LAUNCH_GLYPHS.has(g), 'not an allowed glyph (see /api/launch/config)')
      .default(DEFAULT_LAUNCH_GLYPH),
    devBuyNative: z.number().finite().min(0),
    bundleWallets: z.number().int().min(0).max(LAUNCH_LIMITS.maxBundleWallets).default(0),
    bundleBuyNative: positive.optional(),
    presetId: presetId.optional(),
    strategy: strategySchema.optional(),
  })
  .superRefine((l, ctx) => {
    const unit = CHAINS[l.chain].nativeSymbol;
    if (getLaunchpad(l.launchpad)?.chain !== l.chain) issue(ctx, 'launchpad', `unknown launchpad ${l.launchpad} on ${l.chain}`);
    if (l.devBuyNative > LAUNCH_LIMITS.maxDevBuyNative[l.chain]) issue(ctx, 'devBuyNative', `at most ${LAUNCH_LIMITS.maxDevBuyNative[l.chain]} ${unit}`);
    if (l.bundleWallets > 0 && l.bundleBuyNative === undefined) issue(ctx, 'bundleBuyNative', 'required with bundleWallets');
    // bundle wallets only ever sell alongside the dev wallet (Launches.followSell): without a dev bag they could never exit
    if (l.bundleWallets > 0 && !(l.devBuyNative > 0)) issue(ctx, 'bundleWallets', 'bundle wallets sell with the dev buy, so they need one');
    if (l.bundleBuyNative !== undefined && l.bundleBuyNative > LAUNCH_LIMITS.maxBundleBuyNative[l.chain]) {
      issue(ctx, 'bundleBuyNative', `at most ${LAUNCH_LIMITS.maxBundleBuyNative[l.chain]} ${unit} per bundle wallet`);
    }
    if (l.strategy && !(l.devBuyNative > 0)) issue(ctx, 'strategy', 'exit strategies need a dev buy');
  });

export type LaunchInput = z.output<typeof launchSchema>;
