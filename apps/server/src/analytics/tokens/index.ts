// STUB — replaced by the token analytics implementation.
import type { AnalyticsApi, AppContext } from '../../context';

const todo = (): never => {
  throw new Error('token analytics: not implemented');
};

/** Token-side analytics: summaries/details, security & rug scoring, holders, lists, narratives, search. */
export class TokenAnalytics {
  constructor(protected ctx: AppContext) {}
  install(): void {}
  summary: AnalyticsApi['tokenSummary'] = todo;
  ref: AnalyticsApi['tokenRef'] = todo;
  detail: AnalyticsApi['tokenDetail'] = todo;
  devInfo: AnalyticsApi['devInfo'] = todo;
  viewTrade: AnalyticsApi['viewTrade'] = todo;
  trades: AnalyticsApi['trades'] = todo;
  holders: AnalyticsApi['holders'] = todo;
  topTraders: AnalyticsApi['topTraders'] = todo;
  trenches: AnalyticsApi['trenches'] = todo;
  trending: AnalyticsApi['trending'] = todo;
  newPairs: AnalyticsApi['newPairs'] = todo;
  narratives: AnalyticsApi['narratives'] = todo;
  search: AnalyticsApi['search'] = todo;
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}
