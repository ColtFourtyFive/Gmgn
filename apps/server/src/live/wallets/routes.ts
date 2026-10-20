// HTTP routes of live wallets (docs: packages/shared/src/types.ts, "Live mode: funding,
// withdrawals and account security"). Every route requires a session (checked before input
// validation); in demo mode they answer 403 'not_available_in_demo'.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { WithdrawRequest } from '@trenchscope/shared';
import { HttpError, optionalAccount, requireAccount, type AppContext } from '../../context';
import { parse } from '../../trading/common';
import type { LiveWallets } from './service';

const chainSchema = z.literal('sol', { errorMap: () => ({ message: 'live wallets are Solana only' }) });
const address = z.string().trim().min(32).max(44);

export const depositQuerySchema = z.object({ chain: chainSchema.default('sol') });
export const transfersQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
export const refreshSchema = z.object({ chain: chainSchema.default('sol') });
export const withdrawSchema = z.object({
  chain: chainSchema,
  to: address,
  mint: address.nullable().optional(),
  amount: z.number().finite().positive().max(1e12),
  code: z.string().trim().min(4).max(64),
  clientId: z.string().trim().min(1).max(64).optional(),
});

export async function registerWalletRoutes(app: FastifyInstance, ctx: AppContext, wallets: LiveWallets | null): Promise<void> {
  const auth = (req: FastifyRequest): { id: string; wallets: LiveWallets } => {
    const id = requireAccount(ctx, req);
    if (ctx.config.mode !== 'live' || !wallets) throw new HttpError(403, 'real wallets are not available in demo mode', 'not_available_in_demo');
    wallets.touch(id);
    return { id, wallets };
  };

  // Signed-in activity keeps an account's wallet in sync (live mode only).
  if (wallets) {
    app.addHook('onRequest', async (req) => {
      if (!req.url.startsWith('/api/')) return;
      const id = optionalAccount(ctx, req);
      if (id) wallets.touch(id);
    });
  }

  app.get('/api/wallet/deposit', async (req) => {
    const { id, wallets: w } = auth(req);
    parse(depositQuerySchema, req.query);
    return w.depositInfo(id);
  });

  app.get('/api/wallet/transfers', async (req) => {
    const { id, wallets: w } = auth(req);
    return w.transfers(id, parse(transfersQuerySchema, req.query).limit);
  });

  app.post('/api/wallet/refresh', async (req) => {
    const { id, wallets: w } = auth(req);
    parse(refreshSchema, req.body ?? {});
    const wallet = await w.refresh(id);
    if (wallet) return wallet;
    // Refreshed moments ago, a transaction of the account is in flight, or no RPC: answer with what is known.
    if (!ctx.live?.connection || !ctx.accounts.walletRef(id, 'sol')) throw new HttpError(503, 'wallets are unavailable right now', 'wallets_unavailable');
    const account = ctx.accounts.getAccount(id);
    if (!account) throw new HttpError(404, 'account not found', 'not_found');
    return account.wallets.sol;
  });

  app.post('/api/wallet/withdraw', async (req) => {
    const { id, wallets: w } = auth(req);
    const body = parse(withdrawSchema, req.body) as WithdrawRequest;
    return w.withdrawals.request(id, body, req.ip ?? null);
  });
}
