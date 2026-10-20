// Sniper task schema (docs/API.md, "Trading"). PATCH bodies use patchSchema
// (./common.ts) and are re-validated with this one.

import { z } from 'zod';
import { getLaunchpad } from '@trenchscope/shared';
import { address, chainSchema, issue, label, positive, presetId, strategySchema } from './common';

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

export type SniperTaskInput = z.output<typeof sniperTaskSchema>;
