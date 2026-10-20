// Venue detection and selection for an arbitrary token: bonding curves first
// (a token still on its launchpad curve trades there; a graduated one falls
// through), then pools: the aggregator first (best execution, fee inside the
// route), then direct pools when the aggregator is down or does not know the
// token yet (fresh Clanker / Zora / Pons graduates, Pools.trade launches).

import type { Address } from 'viem';
import type { EvmChainId } from '../chains';
import { EvmExecError, errorText, isEvmExecError } from './errors';
import type { EvmVenueId, V4PoolKey } from './types';
import { FlapVenue } from './venues/flap';
import { FourMemeVenue } from './venues/fourmeme';
import { KyberSwapVenue } from './venues/kyberswap';
import { PonsVenue } from './venues/pons';
import { UniswapV4Venue } from './venues/univ4';
import { PancakeV2Venue, UniswapV2Venue, UniswapV3Venue } from './venues/v2v3';
import type { Detection, QuoteInput, Venue, VenueEnv, VenueQuote } from './venues/types';

export const CURVE_VENUES: EvmVenueId[] = ['fourmeme', 'flap', 'pons'];

/** Detection order per chain: curves, then the aggregator, then direct pools. */
export const VENUE_ORDER: Record<EvmChainId, EvmVenueId[]> = {
  bsc: ['fourmeme', 'flap', 'kyberswap', 'pancake-v2'],
  robinhood: ['pons', 'flap', 'kyberswap', 'uniswap-v4', 'uniswap-v3', 'uniswap-v2'],
  base: ['kyberswap', 'uniswap-v4', 'uniswap-v3', 'uniswap-v2'],
  eth: ['kyberswap', 'uniswap-v4', 'uniswap-v3', 'uniswap-v2'],
};

export function defaultVenues(): Record<EvmVenueId, Venue> {
  return {
    fourmeme: new FourMemeVenue(),
    flap: new FlapVenue(),
    pons: new PonsVenue(),
    kyberswap: new KyberSwapVenue(),
    'uniswap-v4': new UniswapV4Venue(),
    'uniswap-v3': new UniswapV3Venue(),
    'uniswap-v2': new UniswapV2Venue(),
    'pancake-v2': new PancakeV2Venue(),
  };
}

export interface RoutingAttempt {
  venue: EvmVenueId;
  stage: 'detect' | 'quote';
  outcome: 'curve' | 'graduated' | 'pool' | 'none' | 'quoted' | 'failed';
  error?: string;
}

export interface RoutedQuote {
  quote: VenueQuote;
  attempts: RoutingAttempt[];
}

/**
 * Find the venue for a trade and quote it. `order` restricts and orders the
 * venues (default VENUE_ORDER for the chain).
 */
export async function routeAndQuote(env: VenueEnv, venues: Record<EvmVenueId, Venue>, input: QuoteInput, order: EvmVenueId[], hint?: V4PoolKey): Promise<RoutedQuote> {
  const attempts: RoutingAttempt[] = [];
  const token: Address = input.token.address;
  const errors: EvmExecError[] = [];

  const tryQuote = async (venue: Venue, detection: Detection): Promise<VenueQuote | null> => {
    try {
      const q = await venue.quote(env, input, detection);
      attempts.push({ venue: venue.id, stage: 'quote', outcome: 'quoted' });
      return q;
    } catch (err) {
      attempts.push({ venue: venue.id, stage: 'quote', outcome: 'failed', error: errorText(err) });
      // a trade the wallet cannot fund or a sell too small for its fees fails the same way on every venue
      if (isEvmExecError(err) && (err.code === 'invalid_intent' || err.code === 'proceeds_below_fees')) throw err;
      errors.push(isEvmExecError(err) ? err : new EvmExecError('quote_failed', errorText(err)));
      return null;
    }
  };

  // 1. bonding curves, detected in parallel
  const curves = order.filter((v) => CURVE_VENUES.includes(v));
  const detections = await Promise.all(curves.map((id) => venues[id].detect(env, token).catch(() => null)));
  let graduated = false;
  for (let i = 0; i < curves.length; i++) {
    const d = detections[i];
    attempts.push({ venue: curves[i], stage: 'detect', outcome: d?.status ?? 'none' });
    if (d?.status === 'graduated') graduated = true;
    if (d?.status !== 'curve') continue;
    const q = await tryQuote(venues[curves[i]], d);
    if (q) return { quote: q, attempts };
  }

  // 2. pools: aggregator, then direct pools, first quote wins
  for (const id of order.filter((v) => !CURVE_VENUES.includes(v))) {
    const venue = venues[id];
    let d: Detection | null;
    try {
      d = await venue.detect(env, token, hint);
    } catch (err) {
      attempts.push({ venue: id, stage: 'detect', outcome: 'failed', error: errorText(err) });
      continue;
    }
    attempts.push({ venue: id, stage: 'detect', outcome: d?.status ?? 'none' });
    if (!d) continue;
    const q = await tryQuote(venue, d);
    if (q) return { quote: q, attempts };
  }

  const detail = { attempts, graduated };
  if (errors.length > 0) {
    const routeless = errors.every((e) => e.code === 'no_route');
    throw new EvmExecError(routeless ? 'no_route' : 'quote_failed', errors.map((e) => e.message).join('; '), detail);
  }
  throw new EvmExecError('no_route', `no venue trades ${token} on ${env.chain}`, detail);
}
