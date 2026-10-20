// Building blocks shared by the trading request schemas (../schemas.ts is the
// barrel): field validators, the exit-strategy schema and the issue helper that
// cross-field rules (superRefine) use so a 400 names the offending field.

import { z } from 'zod';
import { isChainId, type ChainId, type StrategySpec } from '@trenchscope/shared';

/** GMGN caps condition orders attached to one swap at 10. */
export const MAX_STRATEGY_ORDERS = 10;

export const chainSchema = z.custom<ChainId>(isChainId, 'unknown chain');
export const address = z.string().trim().min(1, 'address is required').max(100, 'address is too long');
export const presetId = z.enum(['P1', 'P2', 'P3']);
export const positive = z.number().finite().positive();
export const sellPercent = positive.max(100);
export const label = z.string().trim().max(32).default('');

export function issue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function strategyOrderCount(s: StrategySpec): number {
  return s.takeProfits.length + s.stopLosses.length + (s.trailing ? 1 : 0) + (s.devSellPercent > 0 ? 1 : 0) + (s.migrationSellPercent > 0 ? 1 : 0);
}

export const strategySchema = z
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

/** PATCH bodies are merged over the stored object and re-validated with the create schema. */
export const patchSchema = z.record(z.string(), z.unknown()).default({});
