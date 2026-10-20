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

/** Bisection steps over the token amount (2^-60 of the bag: far below any dust). */
const SEARCH_STEPS = 60;

export class Initials {
  constructor(
    private readonly ctx: AppContext,
    private readonly executor: Executor,
  ) {}

  quote(accountId: string, req: SellInitialsRequest): SellInitialsQuote {
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
    out.exitValueNative = this.proceeds(ticket, balance);
    if (!(out.targetNative > 0)) {
      out.status = 'nothing_to_recover';
      return out;
    }
    if (out.exitValueNative < out.targetNative) {
      out.status = 'under_water';
      return out;
    }
    // proceeds grow with the amount sold: find the smallest amount that returns the target
    let lo = 0;
    let hi = balance;
    for (let i = 0; i < SEARCH_STEPS && hi - lo > balance * 1e-12; i++) {
      const mid = (lo + hi) / 2;
      if (this.proceeds(ticket, mid) >= out.targetNative) hi = mid;
      else lo = mid;
    }
    out.status = 'ok';
    out.tokens = hi;
    out.sellRate = hi / balance;
    out.expectedOutNative = this.proceeds(ticket, hi);
    return out;
  }

  /** Native a sell of `tokens` returns after tax and fees (0 when it cannot be priced or pays no more than its fees). */
  private proceeds(ticket: Ticket, tokens: number): number {
    if (!(tokens > 0)) return 0;
    const priced = this.executor.price({ ...ticket, amount: tokens, amountKind: 'tokens' });
    return priced.ok ? priced.quote.expectedOut : 0;
  }
}
