// Copy-trade task schema (docs/API.md, "Trading"). PATCH bodies use patchSchema
// (./common.ts) and are re-validated with this one.

import { z } from 'zod';
import { address, chainSchema, issue, label, positive, presetId, strategySchema } from './common';

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

export type CopyTaskInput = z.output<typeof copyTaskSchema>;
