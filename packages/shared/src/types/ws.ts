// Shared contract: the realtime protocol (WebSocket at /ws): channels, their payloads and the
// client / server messages. Conventions: ../types.ts.

/**
 * Channels:
 *   market                         -> 'market'    MetaResponse['chains'] every 5s
 *   trenches:<chain>               -> 'trenches'  TrenchesSnapshot every 1s (params: TrenchesQuery['filters'])
 *   trending:<chain>               -> 'trending'  TrendingSnapshot every 2s (params: Omit<TrendingQuery,'chain'>)
 *   newpairs:<chain>               -> 'newpairs'  TokenSummary[] every 2s (params: { filters })
 *   token:<chain>:<address>        -> 'token'     TokenDetail every 1s
 *                                   -> 'trades'    Trade[] batches (~250ms)
 *                                   -> 'candle'    { resolution, candle } (params: { resolution })
 *                                   -> 'signals'   Signal[] when the token fires a signal
 *   feed:<chain>:<smart|kol|follow|all> -> 'feed' FeedItem[] batches
 *   signals:<chain>                -> 'signals'   Signal[] batches
 *   wallet:<chain>:<address>       -> 'trades'    Trade[] batches of that wallet
 *   user (requires auth)           -> 'notification' AppNotification on event
 *                                   -> 'order'     Order on create/fill/cancel/fail
 *                                   -> 'balance'   UserWallet after its native balance changes
 *                                   -> 'fill'      SwapReceipt after any swap executed for the user
 */
export type WsClientMessage =
  | { op: 'auth'; token: string }
  | { op: 'sub'; ch: string; params?: unknown }
  | { op: 'unsub'; ch: string }
  | { op: 'ping' };

export type WsServerMessage =
  | { op: 'data'; ch: string; type: string; data: unknown }
  | { op: 'ack'; ch: string }
  | { op: 'auth'; ok: boolean; accountId?: string }
  | { op: 'error'; message: string; ch?: string }
  | { op: 'pong'; t: number };
