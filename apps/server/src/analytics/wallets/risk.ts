// Wallet risk check (PRD §6.9 card 2, §8.4.5; research §7.5): flags a viewer
// should see before following or copying a wallet. Observable data only:
// native transfers (dust from look-alike addresses = address poisoning, the
// funding link), the wallet's own trades (round trips, flips), positions
// (honeypot tokens, size), launches and their rug classification. Each flag
// carries the definition shown in its tooltip.

import { formatCompact, formatPercent, formatUsd, shortAddress, type ChainId, type RiskLevel, type Trade, type WalletRiskFlag, type WalletRiskFlagLevel, type WalletRiskReport } from '@trenchscope/shared';
import type { WalletState } from '../../sim/world';
import { WASH_MIN_ROUNDTRIPS, WASH_ROUNDTRIP_MS, isPublicEntity } from '../tokens/track';
import { DAY_MS } from './metrics';

/** A native transfer worth less than this (USD) is dust. */
export const DUST_TRANSFER_USD = 0.01;
/** Characters at each end a look-alike copies (after "0x" on EVM). */
export const LOOKALIKE_CHARS = 4;
/** Dust transfers / non-dust counterparties kept per wallet. */
const DUST_KEEP = 50;
const PEERS_KEEP = 6;

export const RISK_THRESHOLDS = {
  /** phishing: red at this many dust transfers or 2+ distinct look-alike senders (amber at 1). */
  phishingBad: 5,
  /** wash: red at this many cycled tokens making >= washBadShare of the sample (amber at 1). */
  washBadTokens: 3,
  washBadShare: 0.3,
  /** flagged funder: red at this many rugged launches (amber at 1). */
  funderBadRugs: 2,
  /** new wallet with size: younger than this... */
  newWalletMs: DAY_MS,
  /** ...that put this much USD into tokens (amber) / this much (red). */
  newLargeWarnUsd: 2_000,
  newLargeBadUsd: 10_000,
  /** rugs created: red at this many (amber at 1). */
  rugsBad: 3,
  /** honeypot tokens: red above this share of tokens traded (amber above 0). */
  honeypotBadShare: 0.1,
  /** buy -> sell within this many ms... */
  fastMs: 5_000,
  /** ...amber above / red above this share of round trips. */
  fastWarnShare: 0.1,
  fastBadShare: 0.3,
};

/** The part of an address a look-alike copies: first and last LOOKALIKE_CHARS (EVM: case-insensitive, after 0x). */
function ends(address: string): string {
  const body = address.startsWith('0x') ? address.slice(2).toLowerCase() : address;
  return `${body.slice(0, LOOKALIKE_CHARS)}…${body.slice(-LOOKALIKE_CHARS)}`;
}

/** Different addresses that read the same at a glance (same first and last characters). */
export function looksAlike(a: string, b: string): boolean {
  return a !== b && a.length === b.length && ends(a) === ends(b);
}

export interface DustIn {
  from: string;
  at: number;
}

interface TransferRec {
  /** Dust received, oldest first (at most DUST_KEEP). */
  dust: DustIn[];
  /** Recent non-dust counterparties (sent to or received from), oldest first (at most PEERS_KEEP). */
  peers: string[];
}

/** Native transfers per wallet as an indexer sees them: dust received and recent real counterparties. */
export class TransferBook {
  private recs = new Map<string, TransferRec>();

  private rec(address: string): TransferRec {
    let r = this.recs.get(address);
    if (!r) this.recs.set(address, (r = { dust: [], peers: [] }));
    return r;
  }

  /**
   * One native transfer. A wallet's funder is already its known counterparty, and a public entity's
   * (exchange hot wallet's) partners are everyone: neither is kept as a peer, which keeps the index small.
   */
  record(from: WalletState, to: WalletState, usd: number, at: number): void {
    if (usd < DUST_TRANSFER_USD) {
      const d = this.rec(to.address).dust;
      d.push({ from: from.address, at });
      if (d.length > DUST_KEEP) d.splice(0, d.length - DUST_KEEP);
      return;
    }
    this.peer(to, from.address);
    this.peer(from, to.address);
  }

  private peer(w: WalletState, other: string): void {
    if (w.fundedBy === other || isPublicEntity(w)) return;
    const p = this.rec(w.address).peers;
    const i = p.indexOf(other);
    if (i >= 0) p.splice(i, 1);
    p.push(other);
    if (p.length > PEERS_KEEP) p.shift();
  }

  dustIn(address: string): readonly DustIn[] {
    return this.recs.get(address)?.dust ?? [];
  }

  peers(address: string): readonly string[] {
    return this.recs.get(address)?.peers ?? [];
  }

  /** Forget wallets that no longer exist. */
  prune(alive: (address: string) => boolean): void {
    for (const a of this.recs.keys()) if (!alive(a)) this.recs.delete(a);
  }

  dump(): [string, TransferRec][] {
    return [...this.recs];
  }

  load(d: [string, TransferRec][] | undefined): void {
    this.recs = new Map(d ?? []);
  }
}

/** Per token, buy -> sell round trips within WASH_ROUNDTRIP_MS in a trade sample (oldest first). */
export function washCycles(trades: readonly Pick<Trade, 'token' | 'side' | 'timestamp'>[]): { tokens: number; washTokens: number } {
  const state = new Map<string, { buyAt: number | null; rt: number }>();
  for (const t of trades) {
    let s = state.get(t.token);
    if (!s) state.set(t.token, (s = { buyAt: null, rt: 0 }));
    if (t.side === 'buy') s.buyAt = t.timestamp;
    else {
      if (s.buyAt !== null && t.timestamp - s.buyAt <= WASH_ROUNDTRIP_MS) s.rt++;
      s.buyAt = null;
    }
  }
  let washTokens = 0;
  for (const s of state.values()) if (s.rt >= WASH_MIN_ROUNDTRIPS) washTokens++;
  return { tokens: state.size, washTokens };
}

/** Everything the report reads, gathered by WalletAnalytics.risk. */
export interface RiskInputs {
  now: number;
  /** Native transfers are indexed (the simulator); live mode does not track them yet. */
  transfersTracked: boolean;
  createdAt: number;
  dustIn: readonly DustIn[];
  /** Addresses the wallet really transacted with: its funder and recent transfer partners. */
  counterparties: readonly string[];
  /** Recent trades of the wallet, oldest first. */
  trades: readonly Pick<Trade, 'token' | 'side' | 'timestamp'>[];
  /** First funder and its launches (null when no funding was seen). */
  funder: { address: string; launches: number; rugged: number } | null;
  /** Fee-inclusive USD put into tokens over the wallet's life. */
  boughtUsd: number;
  launches: number;
  rugged: number;
  tokensTraded: number;
  honeypotTokens: number;
  /** First-buy -> first-sell windows (ms) of recent round trips. */
  roundTrips: readonly number[];
}

const T = RISK_THRESHOLDS;

const DEFINITIONS: Record<WalletRiskFlag['key'], string> = {
  phishing: `Address poisoning: dust or zero-value transfers (under ${formatUsd(DUST_TRANSFER_USD)}) received from addresses that copy the first and last ${LOOKALIKE_CHARS} characters of a wallet this one really transacted with (its funder or a transfer partner). Scammers hope the owner copies the fake address from the history. Being targeted is not the owner's fault, but never copy an address out of a transfer history. Amber at 1 transfer, red at ${T.phishingBad}+ or from 2+ look-alikes.`,
  wash: `Wash-trading pattern: tokens in the wallet's recent trades that it bought and sold back within ${WASH_ROUNDTRIP_MS / 1000}s at least ${WASH_MIN_ROUNDTRIPS} times: volume without exposure, the round trips wash traders and volume bots leave. Amber at 1 token, red at ${T.washBadTokens}+ tokens making ${formatPercent(T.washBadShare, { sign: false, digits: 0 })}+ of the tokens sampled.`,
  flagged_funder: `Funded by a flagged dev: the wallet's first funding came from a wallet that launched tokens classed as rugged (the dev team dumped or liquidity was pulled). Insiders and bundlers are often funded this way. Amber at 1 rugged launch, red at ${T.funderBadRugs}+.`,
  new_large: `New wallet, large size: first funded less than 24h ago and already put ${formatUsd(T.newLargeWarnUsd, 0)}+ into tokens (red at ${formatUsd(T.newLargeBadUsd, 0)}+). Fresh wallets moving size are often side wallets of insiders or bundlers.`,
  serial_rugger: `Rugs created: tokens this wallet launched that are classed as rugged (the dev team dumped or liquidity was pulled). Amber at 1, red at ${T.rugsBad}+.`,
  honeypot: `Honeypot tokens traded: tokens it traded whose contract blocks selling. Red above ${formatPercent(T.honeypotBadShare, { sign: false, digits: 0 })} of the tokens traded.`,
  fast_trades: `Buy→sell within ${T.fastMs / 1000}s: share of its round trips (first buy to first sell of a token) closed within ${T.fastMs / 1000} seconds. Bot-like flips are hard to copy in time. Amber above ${formatPercent(T.fastWarnShare, { sign: false, digits: 0 })}, red above ${formatPercent(T.fastBadShare, { sign: false, digits: 0 })}.`,
};

const LABELS: Record<WalletRiskFlag['key'], string> = {
  phishing: 'Address poisoning',
  wash: 'Wash-trading pattern',
  flagged_funder: 'Funded by a flagged dev',
  new_large: 'New wallet, large size',
  serial_rugger: 'Rugs created',
  honeypot: 'Honeypot tokens traded',
  fast_trades: 'Buy→sell within 5s',
};

function flag(key: WalletRiskFlag['key'], level: WalletRiskFlagLevel, value: string, count: number, rate: number | null, addresses?: string[]): WalletRiskFlag {
  return { key, label: LABELS[key], level, value, count, rate, definition: DEFINITIONS[key], ...(addresses?.length ? { addresses: addresses.slice(0, 5) } : {}) };
}

const share = (n: number, of: number) => (of > 0 ? n / of : null);
const pct = (r: number | null) => formatPercent(r ?? 0, { sign: false, digits: 0 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function riskReport(chain: ChainId, address: string, i: RiskInputs): WalletRiskReport {
  const flags: WalletRiskFlag[] = [];

  // address poisoning
  if (!i.transfersTracked) flags.push(flag('phishing', 'unknown', 'Transfers not indexed', 0, null));
  else {
    const lookalikes = i.dustIn.filter((d) => i.counterparties.some((c) => looksAlike(d.from, c)));
    const senders = [...new Set(lookalikes.map((d) => d.from))];
    const n = lookalikes.length;
    const level = n === 0 ? 'ok' : n >= T.phishingBad || senders.length >= 2 ? 'bad' : 'warn';
    flags.push(flag('phishing', level, n === 0 ? 'None received' : `${plural(n, 'dust transfer')} from ${plural(senders.length, 'look-alike')}`, n, null, senders));
  }

  // wash-trading round trips
  const wash = washCycles(i.trades);
  const washRate = share(wash.washTokens, wash.tokens);
  flags.push(
    wash.tokens === 0
      ? flag('wash', 'unknown', 'No recent trades', 0, null)
      : flag(
          'wash',
          wash.washTokens === 0 ? 'ok' : wash.washTokens >= T.washBadTokens && (washRate ?? 0) >= T.washBadShare ? 'bad' : 'warn',
          wash.washTokens === 0 ? 'None' : `${wash.washTokens} of ${plural(wash.tokens, 'token')}`,
          wash.washTokens,
          washRate,
        ),
  );

  // funding source
  if (!i.funder) flags.push(flag('flagged_funder', 'unknown', 'Funding source not seen', 0, null));
  else {
    const r = i.funder.rugged;
    flags.push(
      flag(
        'flagged_funder',
        r === 0 ? 'ok' : r >= T.funderBadRugs ? 'bad' : 'warn',
        r === 0 ? (i.funder.launches > 0 ? `Funder launched ${i.funder.launches}, none rugged` : 'Funder launched nothing') : `Funder ${shortAddress(i.funder.address)} rugged ${r} of ${i.funder.launches}`,
        r,
        share(r, i.funder.launches),
        r > 0 ? [i.funder.address] : undefined,
      ),
    );
  }

  // new wallet with size
  if (!(i.createdAt > 0)) flags.push(flag('new_large', 'unknown', 'Wallet age unknown', 0, null));
  else {
    const age = i.now - i.createdAt;
    const young = age < T.newWalletMs;
    const level = !young || i.boughtUsd < T.newLargeWarnUsd ? 'ok' : i.boughtUsd >= T.newLargeBadUsd ? 'bad' : 'warn';
    const ageText = age < 3_600_000 ? `${Math.max(1, Math.round(age / 60_000))}m` : age < DAY_MS ? `${Math.round(age / 3_600_000)}h` : `${Math.round(age / DAY_MS)}d`;
    flags.push(flag('new_large', level, `${ageText} old, ${formatUsd(i.boughtUsd)} bought`, Math.round(i.boughtUsd), null));
  }

  // launches classed as rugged
  flags.push(
    flag(
      'serial_rugger',
      i.rugged === 0 ? 'ok' : i.rugged >= T.rugsBad ? 'bad' : 'warn',
      i.launches === 0 ? 'No launches' : `${i.rugged} of ${plural(i.launches, 'launch', 'launches')}`,
      i.rugged,
      share(i.rugged, i.launches),
    ),
  );

  // honeypot tokens
  const hpRate = share(i.honeypotTokens, i.tokensTraded);
  flags.push(
    i.tokensTraded === 0
      ? flag('honeypot', 'unknown', 'No tokens traded', 0, null)
      : flag(
          'honeypot',
          i.honeypotTokens === 0 ? 'ok' : (hpRate ?? 0) > T.honeypotBadShare ? 'bad' : 'warn',
          `${i.honeypotTokens} of ${formatCompact(i.tokensTraded)} (${pct(hpRate)})`,
          i.honeypotTokens,
          hpRate,
        ),
  );

  // fast round trips
  const fast = i.roundTrips.filter((ms) => ms <= T.fastMs).length;
  const fastRate = share(fast, i.roundTrips.length);
  flags.push(
    i.roundTrips.length === 0
      ? flag('fast_trades', 'unknown', 'No round trips yet', 0, null)
      : flag('fast_trades', (fastRate ?? 0) > T.fastBadShare ? 'bad' : (fastRate ?? 0) > T.fastWarnShare ? 'warn' : 'ok', `${fast} of ${i.roundTrips.length} (${pct(fastRate)})`, fast, fastRate),
  );

  const level: RiskLevel = flags.some((f) => f.level === 'bad') ? 'high' : flags.some((f) => f.level === 'warn') ? 'medium' : 'low';
  return { chain, address, level, flags, updatedAt: i.now };
}
