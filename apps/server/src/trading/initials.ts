// "Sell initials" (PRD §6.8.3, TK-T): size the sell that takes out what a
// position cost and leaves the rest of the bag as a free ride. The target is
// the PnL engine's cost basis of the tokens still held (average cost incl.
// fees, already reduced by earlier sells), in native at the rate the position
// was bought at; the sale is priced like a manual sell (venue curve or pool,
// token tax, platform fee, the preset's network fee), so what it returns is
// what the ledger would book. Read-only: the client places the sell itself
// (amountKind 'tokens'), through the usual gates and confirmation.

import type { SellInitialsQuote, SellInitialsRequest } from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { Executor, Ticket } from './execution';

/**
 * Quotes spent searching the token amount. Proceeds are close to linear in the amount, so a bracketed
 * secant search converges in a few steps; a live venue quotes over the network, so it gets fewer.
 */
const SEARCH_STEPS = { sim: 40, live: 8 };
/** Stop once the sell returns the target within this share of it (the bracket keeps it on the high side). */
const TARGET_TOLERANCE = 1e-6;

export class Initials {
  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
  ) {}

  async quote(accountId: string, req: SellInitialsRequest): Promise<SellInitialsQuote> {
    // validates the token (404) and resolves the wallet and the effective sell preset
    const ticket = this.executor.ticket(accountId, { chain: req.chain, token: req.token, side: 'sell', amount: 100, amountKind: 'percent', presetId: req.presetId }, 'manual');
    const { wallet, token } = ticket;
    const pos = wallet.positions.get(token.address);
    const balance = pos && pos.balance > 0 ? pos.balance : 0;
    const out: SellInitialsQuote = {
      chain: token.chain,
      token: token.address,
      status: 'no_position',
      balance,
      costBasisUsd: 0,
      targetNative: 0,
      tokens: null,
      sellRate: null,
      expectedOutNative: 0,
      exitValueNative: 0,
    };
    if (!pos || balance <= 0) return out;
    out.costBasisUsd = pos.costBasisUsd;
    // boughtNative / boughtUsd: native per USD over the fee-inclusive buys (exact for a single buy)
    const rate = pos.boughtNative > 0 && pos.boughtUsd > 0 ? pos.boughtNative / pos.boughtUsd : 1 / this.ctx.world.nativeUsd(token.chain);
    out.targetNative = pos.costBasisUsd * rate;
    out.exitValueNative = await this.proceeds(ticket, balance);
    if (!(out.targetNative > 0)) {
      out.status = 'nothing_to_recover';
      return out;
    }
    if (out.exitValueNative < out.targetNative) {
      out.status = 'under_water';
      return out;
    }
    // Proceeds grow with the amount sold: find the smallest amount that returns the target. The bracket
    // [lo, hi] always has proceeds(lo) < target <= proceeds(hi); each step tries the secant point between
    // them (Illinois variant, so one end cannot stall), falling back to the midpoint when it leaves the bracket.
    const target = out.targetNative;
    let lo = 0;
    let hi = balance;
    // f values used for the secant step (scaled by the Illinois rule) and the true proceeds at hi
    let fLo = -target;
    let fHi = out.exitValueNative - target;
    let hiOut = out.exitValueNative;
    let side = 0;
    const steps = SEARCH_STEPS[this.executor.venue.kind];
    for (let i = 0; i < steps && hi - lo > balance * 1e-12 && hiOut - target > target * TARGET_TOLERANCE; i++) {
      let x = lo + (-fLo * (hi - lo)) / (fHi - fLo);
      if (!(x > lo && x < hi)) x = (lo + hi) / 2;
      const xOut = await this.proceeds(ticket, x);
      if (xOut >= target) {
        hi = x;
        hiOut = xOut;
        fHi = xOut - target;
        if (side === 1) fLo /= 2;
        side = 1;
      } else {
        lo = x;
        fLo = xOut - target;
        if (side === -1) fHi /= 2;
        side = -1;
      }
    }
    out.status = 'ok';
    out.tokens = hi;
    out.sellRate = hi / balance;
    out.expectedOutNative = hiOut;
    return out;
  }

  /** Native a sell of `tokens` returns after tax and fees (0 when it cannot be priced or pays no more than its fees). */
  private async proceeds(ticket: Ticket, tokens: number): Promise<number> {
    if (!(tokens > 0)) return 0;
    try {
      const quote = await this.executor.venue.quote({ ...ticket, amount: tokens, amountKind: 'tokens' });
      return quote.expectedOut;
    } catch {
      return 0;
    }
  }
}
