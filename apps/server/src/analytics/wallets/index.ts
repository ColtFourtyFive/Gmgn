// STUB — replaced by the wallet analytics implementation.
import type { AnalyticsApi, AppContext } from '../../context';

const todo = (): never => {
  throw new Error('wallet analytics: not implemented');
};

/** Wallet-side analytics: classification tags, profiles & stats, holdings, activity, leaderboards, feeds, signals. */
export class WalletAnalytics {
  constructor(protected ctx: AppContext) {}
  install(): void {}
  tags: AnalyticsApi['walletTags'] = (w) => [...w.tags];
  profile: AnalyticsApi['walletProfile'] = todo;
  holdings: AnalyticsApi['walletHoldings'] = todo;
  activity: AnalyticsApi['walletActivity'] = todo;
  leaderboard: AnalyticsApi['leaderboard'] = todo;
  feed: AnalyticsApi['feed'] = todo;
  signals: AnalyticsApi['signals'] = todo;
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}
