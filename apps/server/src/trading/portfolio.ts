// Portfolio: per-account summary over the paper wallets (the open positions
// list comes from the analytics module's holdings rows; totals, PnL and win
// rate from one pass over the ledger), an equity curve sampled every 5 minutes
// and after each fill (kept for 7 days), and the merged activity feed across
// chains.

import { CHAIN_IDS, type ChainId, type FeedItem, type PortfolioSummary, type TokenPositionRow } from '@trenchscope/shared';
import type { AppContext, Viewer } from '../context';
import type { WalletState, World } from '../sim/world';
import { HOUR_MS } from './common';

const SAMPLE_EVERY_MS = 5 * 60_000;
const RETENTION_MS = 7 * 24 * HOUR_MS;
/** Fills closer together than this replace the previous sample instead of adding one. */
const FILL_COALESCE_MS = 5_000;

export interface EquityPoint {
  t: number;
  /** USD value per chain, in CHAIN_IDS order. */
  v: number[];
}

interface LedgerTotals {
  holdingsUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  /** Positions (open or closed) with positive total PnL. */
  wins: number;
  traded: number;
}

/**
 * Totals over every position the wallet ever opened, with the holdings-row
 * formulas. Read from the ledger because holdings rows are capped per wallet
 * and closed ones would be built (token refs included) only to be summed.
 */
function ledgerTotals(world: World, wallet: WalletState): LedgerTotals {
  const totals: LedgerTotals = { holdingsUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0, wins: 0, traded: 0 };
  for (const pos of wallet.positions.values()) {
    const token = world.getToken(pos.token);
    if (!token) continue;
    const value = pos.balance > 0 ? pos.balance * world.priceUsd(token) : 0;
    const unrealized = pos.balance > 0 ? value - pos.costBasisUsd : 0;
    totals.holdingsUsd += value;
    totals.realizedPnlUsd += pos.realizedPnlUsd;
    totals.unrealizedPnlUsd += unrealized;
    totals.traded++;
    if (pos.realizedPnlUsd + unrealized > 0) totals.wins++;
  }
  return totals;
}

export class Portfolio {
  private readonly equity = new Map<string, EquityPoint[]>();

  constructor(private readonly ctx: AppContext) {}

  install(): void {
    this.ctx.engine.addTicker('trading-equity', () => this.sampleAll(), { everyMs: SAMPLE_EVERY_MS });
  }

  summary(accountId: string, chain: ChainId | 'all'): PortfolioSummary {
    const { world, accounts, analytics } = this.ctx;
    const viewer: Viewer = { accountId };
    const chains = chain === 'all' ? CHAIN_IDS : [chain];
    let nativeBalanceUsd = 0;
    let holdingsValueUsd = 0;
    let realizedPnlUsd = 0;
    let unrealizedPnlUsd = 0;
    let wins = 0;
    let traded = 0;
    const positions: TokenPositionRow[] = [];
    for (const c of chains) {
      const wallet = accounts.walletFor(accountId, c);
      nativeBalanceUsd += wallet.native * world.nativeUsd(c);
      positions.push(...analytics.walletHoldings(wallet, { includeClosed: false, sort: 'value', limit: 1000 }, viewer));
      // Closed positions count toward PnL and win rate too.
      const totals = ledgerTotals(world, wallet);
      holdingsValueUsd += totals.holdingsUsd;
      realizedPnlUsd += totals.realizedPnlUsd;
      unrealizedPnlUsd += totals.unrealizedPnlUsd;
      wins += totals.wins;
      traded += totals.traded;
    }
    positions.sort((a, b) => b.valueUsd - a.valueUsd);
    const totalValueUsd = nativeBalanceUsd + holdingsValueUsd;
    const indexes = chains.map((c) => CHAIN_IDS.indexOf(c));
    const equity = (this.equity.get(accountId) ?? []).map((p) => ({ t: p.t, valueUsd: indexes.reduce((sum, i) => sum + p.v[i], 0) }));
    equity.push({ t: world.now, valueUsd: totalValueUsd });
    return {
      chain,
      totalValueUsd,
      nativeBalanceUsd,
      holdingsValueUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      totalPnlUsd: realizedPnlUsd + unrealizedPnlUsd,
      winRate: traded > 0 ? wins / traded : 0,
      positions,
      equity,
    };
  }

  /** The account's trades across its wallets, newest first. */
  activity(accountId: string, chain: ChainId | undefined, limit: number): FeedItem[] {
    const { accounts, analytics } = this.ctx;
    const items: FeedItem[] = [];
    for (const c of chain ? [chain] : CHAIN_IDS) {
      items.push(...analytics.walletActivity(accounts.walletFor(accountId, c), { limit }, { accountId }));
    }
    return items.sort((a, b) => b.trade.timestamp - a.trade.timestamp).slice(0, limit);
  }

  /** Sample the account's equity now (after a fill, close samples are coalesced). */
  record(accountId: string): void {
    const now = this.ctx.world.now;
    let points = this.equity.get(accountId);
    if (!points) this.equity.set(accountId, (points = []));
    const last = points[points.length - 1];
    if (last && now - last.t < FILL_COALESCE_MS) points.pop();
    points.push({ t: now, v: this.valueByChain(accountId) });
    while (points.length && now - points[0].t > RETENTION_MS) points.shift();
  }

  /** Accounts that never traded are skipped: their curve starts with their first fill. */
  private sampleAll(): void {
    for (const accountId of this.equity.keys()) this.record(accountId);
  }

  private valueByChain(accountId: string): number[] {
    const { world, accounts } = this.ctx;
    return CHAIN_IDS.map((chain) => {
      const wallet = accounts.walletFor(accountId, chain);
      return wallet.native * world.nativeUsd(chain) + ledgerTotals(world, wallet).holdingsUsd;
    });
  }

  serialize(): [string, EquityPoint[]][] {
    return [...this.equity];
  }

  restore(stored: [string, EquityPoint[]][]): void {
    this.equity.clear();
    for (const [accountId, points] of stored) this.equity.set(accountId, points);
  }
}
