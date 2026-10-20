// Portfolio and activity query schemas (docs/API.md, "Trading").

import { z } from 'zod';
import { chainSchema } from './common';

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
