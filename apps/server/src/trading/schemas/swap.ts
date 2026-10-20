// Quote, initials and swap request schemas (docs/API.md, "Trading").

import { z } from 'zod';
import { address, chainSchema, issue, positive, presetId, strategySchema } from './common';

export const quoteSchema = z.object({
  chain: chainSchema,
  token: address,
  side: z.enum(['buy', 'sell']),
  amount: positive,
  amountKind: z.enum(['native', 'percent', 'tokens']),
  presetId: presetId.optional(),
});

export const initialsSchema = z.object({
  chain: chainSchema,
  token: address,
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
