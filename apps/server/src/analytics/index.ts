// Analytics facade: token-side analytics (lists, token pages, security) and
// wallet-side analytics (classification, profiles, leaderboards, feeds,
// signals) live in separate modules; this class exposes them as AnalyticsApi.

import type { FastifyInstance } from 'fastify';
import type { AnalyticsApi, AppContext } from '../context';
import { TokenAnalytics } from './tokens';
import { registerTokenRoutes } from './tokens/routes';
import { WalletAnalytics } from './wallets';
import { registerWalletRoutes } from './wallets/routes';

export class Analytics implements AnalyticsApi {
  readonly tokens: TokenAnalytics;
  readonly wallets: WalletAnalytics;

  constructor(ctx: AppContext) {
    this.tokens = new TokenAnalytics(ctx);
    this.wallets = new WalletAnalytics(ctx);
  }

  /** Wallet classification runs first so token summaries see fresh tags. */
  install(): void {
    this.wallets.install();
    this.tokens.install();
  }

  tokenSummary: AnalyticsApi['tokenSummary'] = (t) => this.tokens.summary(t);
  tokenRef: AnalyticsApi['tokenRef'] = (t) => this.tokens.ref(t);
  tokenDetail: AnalyticsApi['tokenDetail'] = (t) => this.tokens.detail(t);
  devInfo: AnalyticsApi['devInfo'] = (t) => this.tokens.devInfo(t);
  viewTrade: AnalyticsApi['viewTrade'] = (trade, viewer) => this.tokens.viewTrade(trade, viewer);
  trades: AnalyticsApi['trades'] = (t, opts, viewer) => this.tokens.trades(t, opts, viewer);
  holders: AnalyticsApi['holders'] = (t, opts, viewer) => this.tokens.holders(t, opts, viewer);
  topTraders: AnalyticsApi['topTraders'] = (t, opts, viewer) => this.tokens.topTraders(t, opts, viewer);
  trenches: AnalyticsApi['trenches'] = (q) => this.tokens.trenches(q);
  trending: AnalyticsApi['trending'] = (q) => this.tokens.trending(q);
  newPairs: AnalyticsApi['newPairs'] = (chain, filters, limit) => this.tokens.newPairs(chain, filters, limit);
  narratives: AnalyticsApi['narratives'] = (chain) => this.tokens.narratives(chain);
  search: AnalyticsApi['search'] = (q, chain, viewer) => this.tokens.search(q, chain, viewer);

  walletTags: AnalyticsApi['walletTags'] = (w) => this.wallets.tags(w);
  walletProfile: AnalyticsApi['walletProfile'] = (w, viewer) => this.wallets.profile(w, viewer);
  walletHoldings: AnalyticsApi['walletHoldings'] = (w, opts, viewer) => this.wallets.holdings(w, opts, viewer);
  walletActivity: AnalyticsApi['walletActivity'] = (w, opts, viewer) => this.wallets.activity(w, opts, viewer);
  createdTokens: AnalyticsApi['createdTokens'] = (w, limit) => this.tokens.createdTokens(w, limit);
  walletCalls: AnalyticsApi['walletCalls'] = (w, limit) => this.wallets.walletCalls(w, limit);
  leaderboard: AnalyticsApi['leaderboard'] = (chain, opts, viewer) => this.wallets.leaderboard(chain, opts, viewer);
  feed: AnalyticsApi['feed'] = (chain, kind, limit, viewer) => this.wallets.feed(chain, kind, limit, viewer);
  signals: AnalyticsApi['signals'] = (chain, opts) => this.wallets.signals(chain, opts);
  tokenSignals: AnalyticsApi['tokenSignals'] = (t, limit) => this.wallets.tokenSignals(t, limit);
  onSignal: AnalyticsApi['onSignal'] = (listener) => this.wallets.signalEngine.onSignal(listener);
  callouts: AnalyticsApi['callouts'] = (chain, filter, limit) => this.wallets.callouts(chain, filter, limit);

  serialize(): unknown {
    return { tokens: this.tokens.serialize(), wallets: this.wallets.serialize() };
  }

  restore(data: unknown): void {
    const d = (data ?? {}) as { tokens?: unknown; wallets?: unknown };
    this.tokens.restore(d.tokens);
    this.wallets.restore(d.wallets);
  }
}

export async function registerMarketRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await registerTokenRoutes(app, ctx);
  await registerWalletRoutes(app, ctx);
}
