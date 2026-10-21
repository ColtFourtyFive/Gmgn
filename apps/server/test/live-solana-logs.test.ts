// Solana program-log ingestion, offline on real mainnet data (fixtures/solana-logs,
// see its README): Anchor event decoding of pump.fun and PumpSwap "Program data:"
// lines (and of their event CPIs when the node truncated the logs), the mapping into
// the feed events ingest.ts books, parity with the PumpPortal path for the same
// transactions, dedupe when both sources deliver, mayhem and other-quote launches
// through the launch verifier, and a launch's whole trade sequence booked into a World.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pumpPoolAddress } from '../src/live/enrich/onchain';
import { FeedIngestor, PUMP_MAYHEM_AGENT, PUMP_MAYHEM_SUPPLY, PUMP_POOL_TOKENS, walletSol } from '../src/live/feed/ingest';
import { parseFeedMessage, type CreateEvent, type FeedEvent, type MigrateEvent, type TradeEvent } from '../src/live/feed/messages';
import {
  decodeInnerEvents,
  decodeProgramLogs,
  eventDiscriminator,
  isSolQuote,
  programData,
  PUMP_AMM_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  type DecodedLogEvent,
  type PumpTradeLog,
} from '../src/live/feed/solana/events';
import { mapTransaction, type PoolInfo } from '../src/live/feed/solana/map';
import { LaunchVerifier } from '../src/live/feed/verify';
import { World } from '../src/sim/world';

interface LogTx {
  case?: string;
  signature: string;
  slot: number;
  err: unknown;
  logs: string[];
}
interface RawTx {
  slot: number;
  meta: { err: unknown; innerInstructions: { index: number; instructions: { programIdIndex: number; data: string }[] }[]; loadedAddresses?: { writable: string[]; readonly: string[] }; logMessages: string[] };
  transaction: { message: { accountKeys: string[] } };
}

const DIR = join(__dirname, 'fixtures', 'solana-logs');
const load = <T>(name: string, dir = DIR): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
/** One mainnet transaction per case (decoded event kinds, instruction variants, failures, truncation). */
const cases = load<LogTx[]>('events.json');
/** The PumpPortal fixtures' transactions, read back with getTransaction. */
const parity = load<(LogTx & { blockTime: number })[]>('parity.json');
/** A launch and its next 34 transactions, consecutive on mainnet. */
const sequence = load<{ mint: string; transactions: LogTx[] }>('sequence.json');
const pools = load<Record<string, PoolInfo | null>>('pools.json');
/** Raw getTransaction results of transactions whose logs the node truncated. */
const rawTxs = load<Record<string, RawTx>>('transactions.json');
const PP = join(__dirname, 'fixtures', 'pumpportal');
const lifecycle = load<Record<string, unknown>[]>('lifecycle.json', PP);
const curveTrades = load<Record<string, unknown>[]>('curve-trades.json', PP);
const misc = load<Record<string, Record<string, unknown>>>('misc.json', PP);

const one = (name: string, nth = 0): LogTx => cases.filter((c) => c.case === name)[nth];
const bySig = (prefix: string): LogTx => parity.find((t) => t.signature.startsWith(prefix))!;
const ctx = { poolInfo: (p: string) => pools[p] ?? null, canonicalPool: pumpPoolAddress };
const mapped = (tx: LogTx) => mapTransaction(tx, decodeProgramLogs(tx.logs).events, ctx);
const ppEvents = (frames: Record<string, unknown>[]): FeedEvent[] =>
  frames.map((f) => parseFeedMessage(JSON.stringify(f))).filter((m): m is FeedEvent => m.kind === 'create' || m.kind === 'trade' || m.kind === 'migrate');
const trades = (events: DecodedLogEvent[]) => events.filter((e): e is PumpTradeLog & DecodedLogEvent => e.type === 'trade');
const innerOf = (raw: RawTx) => {
  const keys = [...raw.transaction.message.accountKeys, ...(raw.meta.loadedAddresses?.writable ?? []), ...(raw.meta.loadedAddresses?.readonly ?? [])];
  return decodeInnerEvents(raw.meta.innerInstructions, (i) => keys[i]);
};

function setup(start = 1_800_000_000_000) {
  const world = new World('logs-test', start);
  world.setNativeUsd('sol', 200);
  const ingest = new FeedIngestor(world, { now: () => world.now, pumpPoolAddress });
  return { world, ingest };
}

describe('program-log decoding (mainnet logs)', () => {
  it('takes the discriminators from the SDK IDLs (Anchor: sha256("event:<Name>")[0..8]) and decodes every captured case without errors', () => {
    expect([...eventDiscriminator('TradeEvent')]).toEqual([189, 219, 127, 211, 78, 230, 97, 238]);
    expect([...eventDiscriminator('BuyEvent')]).toEqual([103, 244, 82, 31, 44, 245, 119, 119]);
    for (const tx of [...cases, ...parity, ...sequence.transactions]) {
      const d = decodeProgramLogs(tx.logs);
      expect(d.errors, tx.signature).toEqual([]);
    }
    const names = new Set(cases.flatMap((tx) => decodeProgramLogs(tx.logs).events.map((e) => `${e.program}.${e.event}`)));
    for (const n of ['pump.CreateEvent', 'pump.TradeEvent', 'pump.CompleteEvent', 'pump.PostCompleteBuyEvent', 'pump.CompletePumpAmmMigrationEvent', 'pump-amm.BuyEvent', 'pump-amm.SellEvent', 'pump-amm.CreatePoolEvent']) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it('attributes "Program data:" lines by the invoke stack: an event logged under a router counts, another program\'s payload does not', () => {
    const tx = bySig('k2Qxr9');
    // pump is called by a router (FAdo9N... invoke [1] -> 6EF8 invoke [2]); its event is still pump's
    expect(tx.logs.some((l) => l.startsWith('Program FAdo9NCw1ssek6Z6yeWzWjhLVsr8uiCwcWNUnKgzTnHe invoke [1]'))).toBe(true);
    expect(programData(tx.logs).items.map((i) => i.program)).toEqual(['pump']);
    // the same payload logged by some other program is not an event of ours
    const data = tx.logs.find((l) => l.startsWith('Program data: '))!;
    const forged = ['Program Fake111111111111111111111111111111111 invoke [1]', data, 'Program Fake111111111111111111111111111111111 success'];
    expect(programData(forged).items).toEqual([]);
    expect(decodeProgramLogs(['Program data: !!!', 'garbage', ''])).toEqual({ events: [], errors: [], truncated: false });
  });

  it('decodes a SOL curve trade: post-trade virtual and real reserves, fees, user and block time', () => {
    const [e] = trades(decodeProgramLogs(one('curve-sell').logs).events);
    expect(e).toMatchObject({ program: 'pump', event: 'TradeEvent', type: 'trade', isBuy: false, ixName: 'sell', mayhem: false, quoteMint: '11111111111111111111111111111111' });
    expect(e.quoteAmount).toBe(723_812_205n);
    expect(e.fee).toBe(6_876_216n);
    expect(e.creatorFee).toBe(2_171_437n);
    expect(e.timestamp).toBeGreaterThan(1_792_000_000);
    // a SOL curve's virtual reserves sit exactly 30 SOL / 279.9M tokens above its real ones
    expect(e.virtualQuoteReserves - e.realQuoteReserves).toBe(30_000_000_000n);
    expect(e.virtualTokenReserves - e.realTokenReserves).toBe(279_900_000_000_000n);
    // the wallet received the curve amount less the protocol and creator fees
    const [t] = mapped(one('curve-sell')).events as TradeEvent[];
    expect(t).toMatchObject({ kind: 'trade', side: 'sell', pool: 'pump', source: 'logs', slot: one('curve-sell').slot, at: e.timestamp * 1000 });
    expect(t.walletSol).toBeCloseTo((723_812_205 - 6_876_216 - 2_171_437) / 1e9, 12);
    expect(t.solAmount).toBeCloseTo(0.723812205, 12);
  });

  it('books the instruction variants by what the user paid: buy, buy_exact_quote_in, buy_exact_sol_in, cashback coins', () => {
    for (const name of ['curve-buy_exact_quote_in', 'curve-buy_exact_sol_in', 'curve-cashback']) {
      const [e] = trades(decodeProgramLogs(one(name).logs).events);
      const [t] = mapped(one(name)).events as TradeEvent[];
      expect(t.side).toBe('buy');
      // paid = curve amount + protocol fee + creator fee + cashback (getTransaction deltas match this to the lamport)
      expect(t.walletSol).toBeCloseTo(Number(e.quoteAmount + e.fee + e.creatorFee + e.cashback) / 1e9, 12);
    }
    const [cb] = trades(decodeProgramLogs(one('curve-cashback').logs).events);
    expect(cb.cashback).toBeGreaterThan(0n);
    expect(cb.creatorFee).toBe(0n); // a cashback coin pays its 0.30% to the trader's cashback, not the creator
  });

  it('keeps mayhem coins exact: the agent trades fee-free, other wallets pay fees, real SOL comes from the event', () => {
    const [agent] = trades(decodeProgramLogs(one('curve-mayhem-agent').logs).events);
    expect(agent).toMatchObject({ user: PUMP_MAYHEM_AGENT, mayhem: true, fee: 0n, creatorFee: 0n });
    const [user] = trades(decodeProgramLogs(one('curve-mayhem-user').logs).events);
    expect(user.mayhem).toBe(true);
    expect(user.fee).toBeGreaterThan(0n);
    const [t] = mapped(one('curve-mayhem-user')).events as TradeEvent[];
    expect(t.mayhem).toBe(true);
    expect(t.realSolInBondingCurve).toBeCloseTo(Number(user.realQuoteReserves) / 1e9, 12);
    // the program moves a mayhem curve's virtual SOL off the constant product: virtual - real is not 30 SOL
    expect(user.virtualQuoteReserves - user.realQuoteReserves).not.toBe(30_000_000_000n);
  });

  it('drops curves quoted in another mint (their amounts are not SOL) and hands launches their curve facts', () => {
    const other = mapped(one('curve-other-quote'));
    expect(other.events).toEqual([]);
    expect(other.otherQuote).toBe(1);
    const launch = mapped(one('create-other-quote'));
    const [create] = launch.events as CreateEvent[];
    expect(create.kind).toBe('create');
    expect(launch.facts.get(create.mint)).toMatchObject({ solQuoted: false, quoteMint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', creatorFeeBps: 300 });
    expect(isSolQuote('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isSolQuote('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(false);
  });

  it('merges a launch with its creator\'s buy of the same transaction, like PumpPortal\'s create frame', () => {
    const m = mapped(one('create-sol-devbuy', 1));
    expect(m.events).toHaveLength(1);
    const c = m.events[0] as CreateEvent;
    const [dev] = trades(decodeProgramLogs(one('create-sol-devbuy', 1).logs).events);
    expect(c).toMatchObject({ kind: 'create', trader: dev.user, pool: 'pump', mayhem: false, symbol: 'KIMCHIS' });
    expect(c.initialBuy).toBeCloseTo(34612903.225806, 6);
    expect(c.solAmount).toBe(1);
    expect(c.walletSol).toBeCloseTo(1.0125, 12);
    expect(c.vSolInBondingCurve).toBeCloseTo(31, 9);
    expect(m.facts.get(c.mint)).toEqual({ quoteMint: '11111111111111111111111111111111', solQuoted: true, mayhem: false, creatorFeeBps: 0 });
    const noBuy = mapped(one('create-sol-nobuy')).events[0] as CreateEvent;
    expect(noBuy).toMatchObject({ initialBuy: 0, solAmount: 0, vSolInBondingCurve: 30, vTokensInBondingCurve: 1_073_000_000, realSolInBondingCurve: 0 });
    expect(noBuy.walletSol).toBeUndefined();
  });

  it('folds the part of a completing buy filled past the curve (PostCompleteBuyEvent) into that buy', () => {
    const tx = one('complete-post-buy');
    const d = decodeProgramLogs(tx.logs).events;
    expect(d.map((e) => e.event)).toEqual(expect.arrayContaining(['TradeEvent', 'CompleteEvent', 'PostCompleteBuyEvent']));
    const [curve] = trades(d);
    const post = d.find((e) => e.type === 'postCompleteBuy')!;
    if (post.type !== 'postCompleteBuy') throw new Error('unreachable');
    const [t] = mapped(tx).events as TradeEvent[];
    expect(t.tokenAmount).toBeCloseTo(Number(curve.tokenAmount + post.baseOut) / 1e6, 6);
    expect(t.walletSol).toBeCloseTo(Number(curve.quoteAmount + curve.fee + curve.creatorFee + post.quoteIn + post.fee + post.creatorFee) / 1e9, 12);
    expect(t.walletSol).toBeCloseTo(4.95, 9);
    expect(t.realTokensInBondingCurve).toBe(0);
  });

  it('maps a migration to its pool (from MigrateV2\'s event, or from the canonical pool\'s CreatePoolEvent when the logs were cut)', () => {
    const [m] = mapped(one('migration')).events as MigrateEvent[];
    expect(m).toMatchObject({ kind: 'migrate', pool: 'pump-amm', poolTokens: 206_900_000, source: 'logs' });
    expect(m.poolAddress).toBe(pumpPoolAddress(m.mint));
    // MigrateV2 of the lifecycle fixture: logs truncated before pump's own event, the pool's survived
    const cut = bySig('CDPgoi');
    const d = decodeProgramLogs(cut.logs);
    expect(d.truncated).toBe(true);
    expect(d.events.map((e) => e.event)).toEqual(['CreatePoolEvent']);
    const [fromPool] = mapTransaction(cut, d.events, ctx).events as MigrateEvent[];
    expect(fromPool).toMatchObject({ kind: 'migrate', mint: lifecycle[1].mint, poolTokens: 206_900_000 });
    expect(fromPool.poolNative).toBeCloseTo(84.990359064, 9);
    // a non-canonical pool creation is not a migration
    expect(mapTransaction(cut, d.events, { poolInfo: () => null, canonicalPool: () => 'elsewhere' }).events).toEqual([]);
  });

  it('maps PumpSwap trades through the pool -> mint map: post-trade reserves and the user side', () => {
    const tx = one('amm-sell');
    const [e] = decodeProgramLogs(tx.logs).events.filter((x) => x.type === 'ammTrade');
    if (e.type !== 'ammTrade') throw new Error('unreachable');
    const [t] = mapped(tx).events as TradeEvent[];
    expect(t).toMatchObject({ kind: 'trade', side: 'sell', pool: 'pump-amm', mint: pools[e.pool]!.mint, trader: e.user });
    expect(t.walletSol).toBeCloseTo(Number(e.userQuote) / 1e9, 12);
    expect(t.tokensInPool).toBeCloseTo(Number(e.poolBaseBefore + e.baseAmount) / 1e6, 6);
    // vault after the trade plus the (here negative: -18 SOL of fees in the vault) virtual quote reserve
    expect(e.virtualQuoteReserves).toBeLessThan(0n);
    expect(t.solInPool).toBeCloseTo(Number(e.poolQuoteBefore + e.poolQuoteDelta + e.virtualQuoteReserves) / 1e9, 9);
    // which is exactly the next trade's pre-trade state on the same pool (4arB8U, same slot)
    const [next] = decodeProgramLogs(cases.filter((c) => c.case === 'amm-sell')[1].logs).events.filter((x) => x.type === 'ammTrade');
    if (next.type !== 'ammTrade') throw new Error('unreachable');
    expect(t.tokensInPool).toBe(Number(next.poolBaseBefore) / 1e6);
    const buy = mapped(one('amm-buy_exact_quote_in_v2')).events[0] as TradeEvent;
    expect(buy.side).toBe('buy');
    expect(buy.walletSol).toBeCloseTo(0.6435, 9);
    // a pool nobody knows: reported for a lookup, nothing booked
    const unknown = mapped(one('amm-buy'));
    expect(unknown.events).toEqual([]);
    expect(unknown.unresolved).toHaveLength(1);
    // a multi-hop through a pool quoted in another coin keeps the SOL leg only
    const hop = mapped(one('amm-multi_hop_swap'));
    expect(hop.otherQuote).toBe(1);
    expect(hop.events).toHaveLength(1);
  });

  it('nets a wallet\'s opposite legs on one mint in one transaction (constructed from two real trades)', () => {
    // the sequence's 3dviWp (buy) and 3kghcmfE (sell) by the same wallet, logged as one transaction
    const buy = sequence.transactions.find((t) => t.signature.startsWith('3dviWp'))!;
    const sell = sequence.transactions.find((t) => t.signature.startsWith('3kghcm'))!;
    const both = { signature: 'constructed', slot: sell.slot, logs: [...buy.logs, ...sell.logs] };
    const m = mapTransaction(both, decodeProgramLogs(both.logs).events, ctx);
    // the same amount bought and sold: nothing to book (the World books one trade per signature and wallet)
    expect(m.events).toEqual([]);
    expect(m.roundTrips).toBe(1);
  });

  it('flags logs the node truncated, and reads every event back from the transaction\'s event CPIs', () => {
    expect(decodeProgramLogs(one('truncated').logs).truncated).toBe(true);
    // a five-wallet bundle: the logs carry 3 of the 5 TradeEvents, the inner instructions all 5
    const bundle = bySig('4MePUx');
    const logged = decodeProgramLogs(bundle.logs);
    expect(logged.truncated).toBe(true);
    expect(trades(logged.events)).toHaveLength(3);
    const full = innerOf(rawTxs[bundle.signature]);
    expect(full.errors).toEqual([]);
    expect(full.truncated).toBe(false);
    const all = trades(full.events);
    expect(all).toHaveLength(5);
    expect(all.slice(0, 3)).toEqual(trades(logged.events));
    // and the migration whose pump event the logs lost
    const mig = innerOf(rawTxs[bySig('CDPgoi').signature]);
    expect(mig.events.map((e) => e.event)).toEqual(['CreatePoolEvent', 'InitBoostEvent', 'CompletePumpAmmMigrationEvent']);
    expect(mig.events.every((e) => e.program === (e.event === 'CompletePumpAmmMigrationEvent' ? 'pump' : 'pump-amm'))).toBe(true);
    expect(PUMP_PROGRAM_ID).not.toBe(PUMP_AMM_PROGRAM_ID);
  });
});

describe('program logs -> World (parity with PumpPortal)', () => {
  /** The full events of a PumpPortal fixture transaction: logs, or the event CPIs when the logs were cut. */
  const logEvents = (sig: string): FeedEvent[] => {
    const tx = parity.find((t) => t.signature === sig)!;
    const raw = rawTxs[sig];
    const decoded = raw ? innerOf(raw) : decodeProgramLogs(tx.logs);
    return mapTransaction(tx, decoded.events, ctx).events;
  };
  const logEventsOf = (frames: Record<string, unknown>[]) => [...new Set(frames.map((f) => f.signature as string).filter(Boolean))].flatMap(logEvents);

  it('books the same launch and trades from either source (lifecycle: launch, two five-wallet bundles, migration)', () => {
    const a = setup();
    const b = setup();
    for (const e of ppEvents(lifecycle)) a.ingest.apply(e);
    for (const e of logEventsOf(lifecycle)) expect(['ok'], `${e.kind} ${e.signature}`).toContain(b.ingest.apply(e).status);
    const mint = lifecycle[1].mint as string;
    const ta = a.world.tokens.get(mint)!;
    const tb = b.world.tokens.get(mint)!;
    expect(tb.trades).toHaveLength(ta.trades.length);
    const key = (t: (typeof ta.trades)[number]) => `${t.txHash}|${t.wallet}|${t.side}`;
    const byKey = new Map(tb.trades.map((t) => [key(t), t]));
    for (const t of ta.trades) {
      const u = byKey.get(key(t))!;
      expect(u, key(t)).toBeDefined();
      expect(u.tokenAmount).toBeCloseTo(t.tokenAmount, 6);
      // PumpPortal's amounts get the 1.25% rate, the events' fees are exact: equal to a few lamports
      expect(Math.abs(u.nativeAmount - t.nativeAmount)).toBeLessThan(3e-9);
    }
    // same curve states, completion, migration into the same pool
    expect(tb.status).toBe('migrated');
    expect(tb.pool!.address).toBe(ta.pool!.address);
    expect(tb.pool!.tokens).toBe(PUMP_POOL_TOKENS);
    // the model's pool (84.990 SOL with 17.58 virtual) is what MigrateV2 reported
    expect(tb.pool!.native).toBeCloseTo(ta.pool!.native, 6);
    for (const w of tb.holders) expect(b.world.wallets.get(w)!.positions.get(mint)!.balance).toBeCloseTo(a.world.wallets.get(w)!.positions.get(mint)!.balance, 4);
  });

  it('books the same curve walk (curve-trades: buys, round trips, full exits back to the start)', () => {
    const a = setup();
    const b = setup();
    for (const e of ppEvents(curveTrades)) a.ingest.apply(e);
    for (const e of logEventsOf(curveTrades)) b.ingest.apply(e);
    const mint = curveTrades[0].mint as string;
    const ta = a.world.tokens.get(mint)!;
    const tb = b.world.tokens.get(mint)!;
    expect(tb.trades.map((t) => `${t.side}${t.wallet}${t.tokenAmount.toFixed(6)}`)).toEqual(ta.trades.map((t) => `${t.side}${t.wallet}${t.tokenAmount.toFixed(6)}`));
    for (let i = 0; i < ta.trades.length; i++) expect(Math.abs(tb.trades[i].nativeAmount - ta.trades[i].nativeAmount)).toBeLessThan(3e-9);
    expect(tb.curve!.virtualNative).toBeCloseTo(ta.curve!.virtualNative, 9);
    expect(tb.curve!.virtualTokens).toBeCloseTo(ta.curve!.virtualTokens, 4);
    expect(tb.curve!.realNative).toBeCloseTo(ta.curve!.realNative, 9);
    // the logs carry block times and slots; PumpPortal's frames neither
    expect(tb.createdAt).toBe(parity.find((t) => t.signature === curveTrades[0].signature)!.blockTime * 1000);
    expect(tb.trades.at(-1)!.block).toBe(parity.find((t) => t.signature === curveTrades.at(-1)!.signature)!.slot);
  });

  it('dedupes when both sources deliver the same transactions, in either order', () => {
    for (const order of ['pumpportal-first', 'logs-first'] as const) {
      const { world, ingest } = setup();
      const pp = ppEvents(curveTrades);
      const logs = logEventsOf(curveTrades);
      const [first, second] = order === 'pumpportal-first' ? [pp, logs] : [logs, pp];
      for (const e of first) ingest.apply(e);
      const results = second.map((e) => ingest.apply(e).status);
      expect(results.every((s) => s === 'duplicate' || s === 'ok'), order).toBe(true);
      const t = world.tokens.get(curveTrades[0].mint as string)!;
      expect(t.trades, order).toHaveLength(pp.length);
      expect(ingest.stats.trades).toBe(pp.length - 1);
    }
  });

  it('decides launches from their own event through the verifier: SOL launches pass with their facts, other quotes are rejected, mayhem gets 2B', () => {
    const emitted: FeedEvent[] = [];
    const rejected: string[] = [];
    const verifier = new LaunchVerifier({ reader: () => null, emit: (e) => emitted.push(e), reject: (m) => rejected.push(m) });
    const { world, ingest } = setup();
    for (const sig of [misc.createQuotedInPump.signature, misc.createMayhemWrongCurveKey.signature, misc.createNoBuy.signature] as string[]) {
      const tx = parity.find((t) => t.signature === sig)!;
      const m = mapTransaction(tx, decodeProgramLogs(tx.logs).events, ctx);
      for (const e of m.events) if (e.kind === 'create') verifier.pushVerified(e, m.facts.get(e.mint)!);
    }
    expect(rejected).toEqual([misc.createQuotedInPump.mint]);
    expect(verifier.stats).toMatchObject({ fromEvent: 3, rejected: 1 });
    // PumpPortal's copy of a decided launch needs no second read
    for (const e of ppEvents([misc.createMayhemWrongCurveKey, misc.createQuotedInPump])) verifier.push(e);
    expect(verifier.stats.known).toBe(2);
    for (const e of emitted) ingest.apply(e);
    const mayhem = world.tokens.get(misc.createMayhemWrongCurveKey.mint as string)!;
    expect(mayhem.totalSupply).toBe(PUMP_MAYHEM_SUPPLY);
    expect(world.wallets.get(PUMP_MAYHEM_AGENT)!.positions.get(mayhem.address)!.balance).toBe(1e9);
    expect(world.tokens.has(misc.createQuotedInPump.mint as string)).toBe(false);
    // a create signed for another wallet: the coin's creator is the event's creator, the signer made it
    const signed = world.tokens.get(misc.createNoBuy.mint as string)!;
    expect(signed.creator).not.toBe(misc.createNoBuy.traderPublicKey);
  });

  it('books a launch\'s whole mainnet sequence: the curve ends at the last event\'s reserves, every wallet paid what the chain says', () => {
    const { world, ingest } = setup();
    const evs = sequence.transactions.flatMap((tx) => mapTransaction(tx, decodeProgramLogs(tx.logs).events, ctx).events);
    for (const e of evs) expect(ingest.apply(e).status).toBe('ok');
    const t = world.tokens.get(sequence.mint)!;
    expect(t.trades).toHaveLength(evs.length);
    const last = trades(decodeProgramLogs(sequence.transactions.at(-1)!.logs).events).at(-1)!;
    expect(t.curve!.virtualNative).toBe(Number(last.virtualQuoteReserves) / 1e9);
    expect(t.curve!.virtualTokens).toBe(Number(last.virtualTokenReserves) / 1e6);
    expect(t.curve!.realNative).toBe(Number(last.realQuoteReserves) / 1e9);
    expect(t.curve!.realTokens).toBe(Number(last.realTokenReserves) / 1e6);
    // timestamps from the blocks, in order; slots kept
    const times = t.trades.map((x) => x.timestamp);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(t.trades.at(-1)!.block).toBe(sequence.transactions.at(-1)!.slot);
    // a wallet that bought and sold everything holds nothing, and its PnL is fees and price
    const roundTrip = t.trades.filter((x) => x.wallet === t.trades.find((y) => y.txHash.startsWith('3dviWp'))!.wallet);
    expect(roundTrip.map((x) => x.side)).toEqual(['buy', 'sell']);
    expect(world.wallets.get(roundTrip[0].wallet)!.positions.get(sequence.mint)!.balance).toBe(0);
    expect(roundTrip[0].nativeAmount).toBe(0.25);
  });

  it('books a gap\'s older trade without its stale reserves (the curve keeps the later state)', () => {
    const { world, ingest } = setup();
    const evs = sequence.transactions.flatMap((tx) => mapTransaction(tx, decodeProgramLogs(tx.logs).events, ctx).events);
    const late = evs.slice(-1);
    const early = evs.slice(1, 3);
    ingest.apply(evs[0]);
    for (const e of late) ingest.apply(e);
    const t = world.tokens.get(sequence.mint)!;
    const after = { ...t.curve! };
    for (const e of early) expect(ingest.apply(e).status).toBe('ok');
    expect(t.curve).toEqual(after);
    expect(ingest.staleReserves).toBe(2);
    expect(t.trades).toHaveLength(4);
  });

  it('uses the exact fees over the 1.25% rate (identical for SOL curves to a few lamports)', () => {
    const [e] = trades(decodeProgramLogs(one('curve-buy_exact_sol_in').logs).events);
    const exact = Number(e.quoteAmount + e.fee + e.creatorFee) / 1e9;
    expect(Math.abs(exact - walletSol('buy', Number(e.quoteAmount) / 1e9, 0.0125))).toBeLessThan(3e-9);
  });
});
