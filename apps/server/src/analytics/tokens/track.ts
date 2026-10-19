// Per-token analytics state maintained incrementally from observable events
// (trades, funding links, blocks, timestamps). Nothing here reads hidden
// simulation state (archetype, fate, hype, sim, memory, skill).
//
// Derived cohorts (kept here, unioned with the world's token.bundlers /
// token.snipers / token.insiders sets at read time, never written back into
// the simulation so market behaviour cannot depend on analytics):
//   bundler  - bought in the creation block, other than the creator
//   sniper   - bought within SNIPER_BLOCKS blocks after the creation block
//              (excluding creation-block bundlers and the dev team)
//   insider  - funded by the creator / dev team / the creator's (private) funder,
//              or funded by the same private wallet as >= 2 other buyers whose
//              first buy landed within EARLY_WINDOW_MS of launch
// Plus dev behaviour (peak, sells, early sells, re-buys), round-trip (wash)
// volume, holder in/out flows per minute, and last-known identity fields so
// dev histories survive the simulator deleting old dormant tokens.

import type { ChainId, Side, TokenStatus, Trade } from '@trenchscope/shared';
import { DUST_RATE, type TokenState, type WalletState, type World } from '../../sim/world';

export const SNIPER_BLOCKS = 3;
export const EARLY_WINDOW_MS = 10 * 60_000;
export const WASH_ROUNDTRIP_MS = 60_000;
/** A wallet's round-trip count is forgotten after this much inactivity on the token. */
export const WASH_MEMORY_MS = 10 * 60_000;
/** Round trips before a wallet's cycling counts as wash volume (a single quick flip is normal bot/sniper behaviour). */
export const WASH_MIN_ROUNDTRIPS = 2;
export const DEV_EARLY_MS = 30 * 60_000;
const FLOW_KEEP_MS = 24 * 3600_000 + 5 * 60_000;

/** Per-minute flow bucket: wash volume + holder entries/exits. */
export interface FlowBucket {
  t: number;
  washUsd: number;
  holdersIn: number;
  holdersOut: number;
}

interface LastTrade {
  t: number;
  side: Side;
  usd: number;
  counted: boolean;
  /** Round trips completed by this wallet on this token (reset after WASH_MEMORY_MS idle). */
  rt: number;
}

export interface TokenTrack {
  address: string;
  chain: ChainId;
  symbol: string;
  name: string;
  logoSeed: string;
  logoGlyph: string;
  launchpad: string;
  creator: string;
  createdAt: number;
  createBlock: number;
  /** Lower-cased for search. */
  symbolLc: string;
  nameLc: string;

  // last-known values (kept after the token is deleted from the world)
  status: TokenStatus;
  migratedAt: number | null;
  marketCapUsd: number;
  athMarketCapUsd: number;
  rugged: boolean;
  /** Token no longer exists in world.tokens; collections were released. */
  gone: boolean;

  // derived cohorts
  bundlers: Set<string>;
  snipers: Set<string>;
  insiders: Set<string>;
  /** Early buyers grouped by private funder. */
  earlyFunders: Map<string, string[]>;

  /** Cumulative traded volume (USD). */
  volumeUsd: number;

  // dev group (creator + devTeam) behaviour
  devBuys: number;
  devPeak: number;
  devSold: number;
  devSoldEarly: number;
  devBoughtMore: boolean;
  devFirstSellAt: number | null;

  lastTrade: Map<string, LastTrade>;
  flows: FlowBucket[];
}

/** Labelled, non-KOL wallets (exchange hot wallets etc.) are public entities, not insider links. */
export function isPublicEntity(w: WalletState | undefined): boolean {
  return !!w && w.label !== null && !w.tags.has('kol');
}

export function isDevGroup(t: TokenState, address: string): boolean {
  return address === t.creator || t.devTeam.has(address);
}

/** Current combined token balance of creator + dev team. */
export function devGroupBalance(world: World, t: TokenState): number {
  let bal = world.wallets.get(t.creator)?.positions.get(t.address)?.balance ?? 0;
  for (const a of t.devTeam) bal += world.wallets.get(a)?.positions.get(t.address)?.balance ?? 0;
  return bal;
}

export function newTrack(world: World, t: TokenState): TokenTrack {
  return {
    address: t.address,
    chain: t.chain,
    symbol: t.symbol,
    name: t.name,
    logoSeed: t.logoSeed,
    logoGlyph: t.logoGlyph,
    launchpad: t.launchpad,
    creator: t.creator,
    createdAt: t.createdAt,
    createBlock: world.blockAt(t.chain, t.createdAt),
    symbolLc: t.symbol.toLowerCase(),
    nameLc: t.name.toLowerCase(),
    status: t.status,
    migratedAt: t.migratedAt,
    marketCapUsd: world.marketCapUsd(t),
    athMarketCapUsd: t.athMarketCapUsd,
    rugged: false,
    gone: false,
    bundlers: new Set(),
    snipers: new Set(),
    insiders: new Set(),
    earlyFunders: new Map(),
    volumeUsd: 0,
    devBuys: 0,
    devPeak: 0,
    devSold: 0,
    devSoldEarly: 0,
    devBoughtMore: false,
    devFirstSellAt: null,
    lastTrade: new Map(),
    flows: [],
  };
}

/** Get (or append) the flow bucket for the minute containing `ts`. */
function flowBucket(s: TokenTrack, ts: number): FlowBucket {
  const minute = ts - (ts % 60000);
  const last = s.flows[s.flows.length - 1];
  if (last && last.t === minute) return last;
  if (last && minute < last.t) return last; // out-of-order: fold into the latest bucket
  const b: FlowBucket = { t: minute, washUsd: 0, holdersIn: 0, holdersOut: 0 };
  s.flows.push(b);
  if (s.flows.length > 1500) s.flows.splice(0, s.flows.length - 1445);
  return b;
}

/** Sum flow buckets that end after `since`. */
export function flowSince(s: TokenTrack, since: number): { washUsd: number; holdersIn: number; holdersOut: number } {
  let washUsd = 0;
  let holdersIn = 0;
  let holdersOut = 0;
  const flows = s.flows;
  for (let i = flows.length - 1; i >= 0; i--) {
    const b = flows[i];
    if (b.t + 60000 <= since) break;
    washUsd += b.washUsd;
    holdersIn += b.holdersIn;
    holdersOut += b.holdersOut;
  }
  return { washUsd, holdersIn, holdersOut };
}

/**
 * Feed one executed trade into the token's track. O(1) apart from the dev
 * group balance (dev team is a handful of wallets) and insider groups.
 */
export function recordTrade(world: World, s: TokenTrack, trade: Trade, t: TokenState, w: WalletState): void {
  const a = w.address;
  const ts = trade.timestamp;
  s.volumeUsd += trade.usdAmount;
  const pos = w.positions.get(t.address);
  const dust = t.totalSupply * DUST_RATE;
  const fb = flowBucket(s, ts);

  // holder entries / exits (balance crossing the dust threshold)
  if (pos) {
    if (trade.side === 'buy') {
      if (pos.balance > dust && pos.balance - trade.tokenAmount <= dust) fb.holdersIn++;
    } else if (pos.balance <= dust && pos.balance + trade.tokenAmount > dust) fb.holdersOut++;
  }

  const dev = isDevGroup(t, a);
  if (dev) {
    if (trade.side === 'buy') {
      if (s.devBuys > 0 && trade.block > s.createBlock) s.devBoughtMore = true;
      s.devBuys++;
    } else {
      s.devSold += trade.tokenAmount;
      if (ts - t.createdAt <= DEV_EARLY_MS) s.devSoldEarly += trade.tokenAmount;
      if (s.devFirstSellAt === null) s.devFirstSellAt = ts;
    }
    const bal = devGroupBalance(world, t);
    if (bal > s.devPeak) s.devPeak = bal;
  }

  if (trade.side === 'buy' && a !== t.creator) {
    const db = trade.block - s.createBlock;
    if (db <= 0) s.bundlers.add(a);
    else if (db <= SNIPER_BLOCKS && !dev && !s.bundlers.has(a) && !t.bundlers.has(a)) s.snipers.add(a);
    if (!dev && pos && pos.buys === 1) classifyInsider(world, s, t, w, ts);
  }

  // Wash detection: a round trip is an opposite-side trade by the same wallet
  // within 60s. Volume counts as wash once the wallet keeps cycling (its 2nd+
  // round trip on this token); one quick flip is ordinary bot/sniper behaviour,
  // and labelled MEV sandwich bots are extraction, not wash trading.
  const lt = s.lastTrade.get(a);
  if (lt) {
    if (ts - lt.t > WASH_MEMORY_MS) lt.rt = 0;
    if (lt.side !== trade.side && ts - lt.t <= WASH_ROUNDTRIP_MS) {
      lt.rt++;
      if (lt.rt >= WASH_MIN_ROUNDTRIPS && !w.tags.has('sandwich')) {
        fb.washUsd += trade.usdAmount + (lt.counted ? 0 : lt.usd);
        lt.counted = true;
      } else lt.counted = false;
    } else lt.counted = false;
    lt.t = ts;
    lt.side = trade.side;
    lt.usd = trade.usdAmount;
  } else s.lastTrade.set(a, { t: ts, side: trade.side, usd: trade.usdAmount, counted: false, rt: 0 });
}

function classifyInsider(world: World, s: TokenTrack, t: TokenState, w: WalletState, ts: number): void {
  const f = w.fundedBy;
  if (!f || s.insiders.has(w.address)) return;
  if (isDevGroup(t, f)) {
    s.insiders.add(w.address);
    return;
  }
  const funder = world.wallets.get(f);
  if (isPublicEntity(funder)) return;
  const devFunder = world.wallets.get(t.creator)?.fundedBy ?? null;
  if (devFunder !== null && f === devFunder) {
    s.insiders.add(w.address);
    return;
  }
  if (ts - t.createdAt > EARLY_WINDOW_MS) return;
  let g = s.earlyFunders.get(f);
  if (!g) {
    g = [];
    s.earlyFunders.set(f, g);
  }
  if (!g.includes(w.address)) g.push(w.address);
  if (g.length >= 3) for (const x of g) s.insiders.add(x);
}

/**
 * Best-effort initialisation for tokens that existed before this module saw
 * their trades (snapshot restore without analytics state): replays the trade
 * ring, which covers launch-time cohorts for young tokens.
 */
export function backfillTrack(world: World, s: TokenTrack, t: TokenState, count: number = t.trades.length): void {
  const n = Math.min(count, t.trades.length);
  for (let i = 0; i < n; i++) {
    const tr = t.trades[i];
    s.volumeUsd += tr.usdAmount;
    if (tr.side !== 'buy' || tr.wallet === t.creator) continue;
    const db = tr.block - s.createBlock;
    if (db <= 0) s.bundlers.add(tr.wallet);
    else if (db <= SNIPER_BLOCKS && !isDevGroup(t, tr.wallet) && !s.bundlers.has(tr.wallet)) s.snipers.add(tr.wallet);
  }
  const bal = devGroupBalance(world, t);
  if (bal > s.devPeak) s.devPeak = bal;
}

/** Drop round-trip memory older than the wash window and flows older than 24h. */
export function pruneTrack(s: TokenTrack, now: number): void {
  if (s.lastTrade.size > 0) {
    const cutoff = now - WASH_MEMORY_MS;
    for (const [k, v] of s.lastTrade) if (v.t < cutoff) s.lastTrade.delete(k);
  }
  if (s.earlyFunders.size > 0 && now - s.createdAt > EARLY_WINDOW_MS * 2) s.earlyFunders.clear();
  const flowCutoff = now - FLOW_KEEP_MS;
  let drop = 0;
  while (drop < s.flows.length && s.flows[drop].t < flowCutoff) drop++;
  if (drop > 0) s.flows.splice(0, drop);
}

/** Release per-wallet collections once the token is gone; identity + last values remain. */
export function tombstone(s: TokenTrack): void {
  s.gone = true;
  s.bundlers = new Set();
  s.snipers = new Set();
  s.insiders = new Set();
  s.earlyFunders = new Map();
  s.lastTrade = new Map();
  s.flows = [];
}
