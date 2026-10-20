// Condition-order request schemas (docs/API.md, "Trading").

import { z } from 'zod';
import type { OrderKind } from '@trenchscope/shared';
import { address, chainSchema, issue, positive, presetId } from './common';

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
