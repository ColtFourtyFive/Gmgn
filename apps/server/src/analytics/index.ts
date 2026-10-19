// STUB — replaced by the analytics implementation.
import type { FastifyInstance } from 'fastify';
import type { AnalyticsApi, AppContext } from '../context';

const todo = (): never => {
  throw new Error('analytics: not implemented');
};

export class Analytics implements AnalyticsApi {
  constructor(private ctx: AppContext) {}
  install(): void {}
  tokenSummary = todo;
  tokenRef = todo;
  tokenDetail = todo;
  devInfo = todo;
  viewTrade = todo;
  trades = todo;
  holders = todo;
  topTraders = todo;
  trenches = todo;
  trending = todo;
  newPairs = todo;
  walletProfile = todo;
  walletHoldings = todo;
  walletActivity = todo;
  leaderboard = todo;
  feed = todo;
  signals = todo;
  narratives = todo;
  search = todo;
  walletTags = todo;
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}

export async function registerMarketRoutes(_app: FastifyInstance, _ctx: AppContext): Promise<void> {}
