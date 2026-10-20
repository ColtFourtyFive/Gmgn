// Alert schemas (docs/API.md, "Trading"): token, wallet and keyword alerts,
// signal subscriptions and holding alerts. PATCH bodies use patchSchema
// (./common.ts) and are re-validated with alertSchema.

import { z } from 'zod';
import { getLaunchpad, type SignalKind } from '@trenchscope/shared';
import { SIGNAL_KINDS } from '../../analytics/wallets/signals';
import { address, chainSchema, issue } from './common';

const TOKEN_ALERTS = new Set(['price', 'mcap', 'change', 'smart_buys']);

/** Signal subscriptions: groups per rule, launchpads per group. */
export const SIGNAL_SUBSCRIPTION_LIMITS = { groups: 5, launchpads: 20, nameMaxLength: 40, maxPerHour: 120 };

const bound = z.number().finite().min(0).nullable().default(null);

/** min <= max for each bound pair of a group. */
const BOUND_PAIRS = [
  ['mcMin', 'mcMax'],
  ['triggerMcMin', 'triggerMcMax'],
  ['minAgeMin', 'maxAgeMin'],
] as const;

export const signalGroupSchema = z
  .object({
    kinds: z
      .array(z.enum(SIGNAL_KINDS as [SignalKind, ...SignalKind[]]))
      .max(SIGNAL_KINDS.length)
      .transform((k) => [...new Set(k)])
      .default([]),
    mcMin: bound,
    mcMax: bound,
    triggerMcMin: bound,
    triggerMcMax: bound,
    minLiquidityUsd: bound,
    minHolders: bound,
    maxTop10: z.number().finite().min(0).max(1).nullable().default(null),
    minSmart: bound,
    minAgeMin: bound,
    maxAgeMin: bound,
    launchpads: z.array(z.string().trim().min(1).max(40)).max(SIGNAL_SUBSCRIPTION_LIMITS.launchpads).default([]),
    excludeRisk: z.boolean().default(true),
  })
  .superRefine((g, ctx) => {
    for (const [lo, hi] of BOUND_PAIRS) {
      const a = g[lo];
      const b = g[hi];
      if (a !== null && b !== null && a > b) issue(ctx, hi, `must be at least ${lo}`);
    }
  });

export const signalSubscriptionSchema = z.object({
  name: z.string().trim().max(SIGNAL_SUBSCRIPTION_LIMITS.nameMaxLength).default(''),
  groups: z.array(signalGroupSchema).min(1, 'add at least one group').max(SIGNAL_SUBSCRIPTION_LIMITS.groups),
  maxPerHour: z.number().int().min(1).max(SIGNAL_SUBSCRIPTION_LIMITS.maxPerHour).default(30),
});

const pctTrigger = (max: number) => z.number().finite().positive().max(max).nullable();

export const holdingSchema = z
  .object({
    basis: z.enum(['vs_cost', '5m_change']).default('vs_cost'),
    upPct: pctTrigger(100_000).default(20),
    downPct: pctTrigger(100).default(null),
    devSell: z.boolean().default(false),
    liquidityDropPct: pctTrigger(100).default(null),
    minPositionUsd: z.number().finite().min(0).max(1e9).default(10),
    cooldownMin: z.number().int().min(1).max(7 * 24 * 60).default(60),
  })
  .refine((h) => h.upPct !== null || h.downPct !== null || h.devSell || h.liquidityDropPct !== null, 'turn on at least one trigger');

export const alertSchema = z
  .object({
    chain: chainSchema,
    kind: z.enum(['price', 'mcap', 'change', 'wallet_trade', 'new_token', 'smart_buys', 'signal_subscription', 'holding']),
    token: address.nullable().default(null),
    wallet: address.nullable().default(null),
    keyword: z.string().trim().max(32).nullable().default(null),
    direction: z.enum(['above', 'below']).nullable().default(null),
    value: z.number().finite().min(0).default(0),
    repeat: z.boolean().default(false),
    enabled: z.boolean().default(true),
    note: z.string().trim().max(140).default(''),
    signals: signalSubscriptionSchema.nullable().default(null),
    holding: holdingSchema.nullable().default(null),
  })
  .superRefine((a, ctx) => {
    if (TOKEN_ALERTS.has(a.kind) && !a.token) issue(ctx, 'token', `${a.kind} alerts need a token`);
    if (a.kind === 'signal_subscription' && !a.signals) issue(ctx, 'signals', 'signal subscriptions need signals { groups }');
    if (a.kind === 'holding' && !a.holding) issue(ctx, 'holding', 'holding alerts need holding { triggers }');
    if (a.kind === 'signal_subscription' && a.signals)
      for (const g of a.signals.groups) for (const id of g.launchpads) if (getLaunchpad(id)?.chain !== a.chain) issue(ctx, 'signals', `unknown launchpad ${id} on ${a.chain}`);
    if (a.kind === 'wallet_trade' && !a.wallet) issue(ctx, 'wallet', 'wallet_trade alerts need a wallet');
    if ((a.kind === 'price' || a.kind === 'mcap' || a.kind === 'change') && !(a.value > 0)) issue(ctx, 'value', 'must be positive');
    if (a.kind === 'smart_buys' && !(Number.isInteger(a.value) && a.value >= 1)) issue(ctx, 'value', 'must be a whole number of buys (>= 1)');
  });

export type AlertInput = z.output<typeof alertSchema>;
