// Launch verification (feed/verify.ts): pump.fun curve accounts captured on
// mainnet decode to their quote mint / mayhem flag / creator fee, and the
// verifier holds each launch (and the events behind it) until its curve is read,
// drops launches quoted in another mint, retries curves not visible yet and
// never loses a launch to a missing or failing RPC.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PublicKey, type AccountInfo, type Connection } from '@solana/web3.js';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPumpSdk } from '../src/live/enrich/onchain';
import { parseFeedMessage, type CreateEvent, type FeedEvent } from '../src/live/feed/messages';
import { curveFeeRate, decodeCurveFacts, LaunchVerifier, rpcCurveReader, type CurveFacts, type CurveReader, type LaunchVerifierOptions } from '../src/live/feed/verify';

const FIX = join(__dirname, 'fixtures', 'pumpportal');
type CurveFixture = { mint: string; address: string; owner: string; lamports: number; data: string };
const curves = JSON.parse(readFileSync(join(FIX, 'curves.json'), 'utf8')) as Record<'SOL' | 'PUMP_QUOTED' | 'CARDS_QUOTED' | 'MAYHEM' | 'MIGRATED', CurveFixture>;
const misc = JSON.parse(readFileSync(join(FIX, 'misc.json'), 'utf8')) as Record<string, Record<string, unknown>>;
const lifecycle = JSON.parse(readFileSync(join(FIX, 'lifecycle.json'), 'utf8')) as Record<string, unknown>[];

const account = (c: CurveFixture): AccountInfo<Buffer> => ({ executable: false, owner: new PublicKey(c.owner), lamports: c.lamports, rentEpoch: 0, data: Buffer.from(c.data, 'base64') });
const ev = (frame: Record<string, unknown>): FeedEvent => {
  const m = parseFeedMessage(JSON.stringify(frame));
  if (m.kind !== 'create' && m.kind !== 'trade' && m.kind !== 'migrate') throw new Error(`not an event: ${m.kind}`);
  return m;
};
const sol = (over: Partial<CurveFacts> = {}): CurveFacts => ({ quoteMint: '11111111111111111111111111111111', solQuoted: true, mayhem: false, creatorFeeBps: 0, ...over });

const verifiers: LaunchVerifier[] = [];
afterEach(() => {
  for (const v of verifiers.splice(0)) v.close();
});

function verifier(read: CurveReader | null, extra: Partial<LaunchVerifierOptions> = {}) {
  const out: FeedEvent[] = [];
  const rejected: string[] = [];
  const v = new LaunchVerifier({ reader: () => read, emit: (e) => out.push(e), reject: (m) => rejected.push(m), batchMs: 10, retryMs: 10, ...extra });
  verifiers.push(v);
  return { v, out, rejected };
}

async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('pump.fun curve accounts (mainnet bytes)', () => {
  it('reads the quote mint, mayhem flag and creator fee', () => {
    expect(decodeCurveFacts(account(curves.SOL))).toEqual(sol());
    expect(decodeCurveFacts(account(curves.PUMP_QUOTED))).toEqual({ quoteMint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', solQuoted: false, mayhem: false, creatorFeeBps: 300 });
    expect(decodeCurveFacts(account(curves.CARDS_QUOTED))).toMatchObject({ quoteMint: 'CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp', solQuoted: false });
    expect(decodeCurveFacts(account(curves.MAYHEM))).toEqual(sol({ mayhem: true }));
    // a migrated curve is zeroed but still says SOL
    expect(decodeCurveFacts(account(curves.MIGRATED))).toEqual(sol());
  });

  it('refuses accounts that are not pump.fun curves', () => {
    expect(decodeCurveFacts(null)).toBeNull();
    expect(decodeCurveFacts({ ...account(curves.SOL), owner: PublicKey.default })).toBeNull();
    expect(decodeCurveFacts({ ...account(curves.SOL), data: Buffer.alloc(10) })).toBeNull();
  });

  it('turns the creator fee into the curve fee rate (0 = the default 0.30%)', () => {
    expect(curveFeeRate({ creatorFeeBps: 0 })).toBeCloseTo(0.0125, 12);
    expect(curveFeeRate({ creatorFeeBps: 300 })).toBeCloseTo(0.0395, 12);
  });

  it('reads curves at the PDA derived from the mint, never the frame bondingCurveKey', async () => {
    const sdk = loadPumpSdk()!;
    const mayhem = misc.createMayhemWrongCurveKey as { mint: string; bondingCurveKey: string };
    const asked: { keys: string[]; commitment?: string }[] = [];
    const accounts = new Map([[curves.MAYHEM.address, account(curves.MAYHEM)]]);
    const connection = {
      async getMultipleAccountsInfo(keys: PublicKey[], cfg?: { commitment?: string }) {
        asked.push({ keys: keys.map((k) => k.toBase58()), commitment: cfg?.commitment });
        return keys.map((k) => accounts.get(k.toBase58()) ?? null);
      },
    } as unknown as Connection;
    const read = rpcCurveReader(connection, (fn) => fn());
    const facts = await read([mayhem.mint, curves.SOL.mint]);
    expect(asked).toEqual([{ keys: [sdk.bondingCurvePda(new PublicKey(mayhem.mint)).toBase58(), curves.SOL.address], commitment: 'processed' }]);
    expect(asked[0].keys[0]).toBe(curves.MAYHEM.address);
    expect(asked[0].keys[0]).not.toBe(mayhem.bondingCurveKey);
    expect(facts).toEqual([sol({ mayhem: true }), null]);
  });
});

describe('launch verifier', () => {
  it('holds launches until their curves are read in one batch, then releases SOL ones and drops the rest', async () => {
    const asked: string[][] = [];
    const byMint = new Map<string, CurveFacts>([
      [curves.SOL.mint, sol({ creatorFeeBps: 0 })],
      [misc.createMayhemWrongCurveKey.mint as string, sol({ mayhem: true })],
      [misc.createQuotedInPump.mint as string, { quoteMint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', solQuoted: false, mayhem: false, creatorFeeBps: 300 }],
    ]);
    const { v, out, rejected } = verifier(async (mints) => {
      asked.push(mints);
      return mints.map((m) => byMint.get(m) ?? null);
    });
    const solCreate = { ...ev(misc.createNoBuy), mint: curves.SOL.mint } as CreateEvent;
    const mayhem = ev(misc.createMayhemWrongCurveKey);
    const quoted = ev(misc.createQuotedInPump);
    const other = ev(lifecycle[12]); // a migration of a mint nobody is checking: straight through
    v.push(solCreate);
    v.push(mayhem);
    v.push(quoted);
    v.push(other);
    expect(out).toEqual([other]);
    expect(v.size).toBe(3);
    await until(() => v.size === 0);
    expect(asked).toEqual([[solCreate.mint, mayhem.mint, quoted.mint]]);
    expect(rejected).toEqual([quoted.mint]);
    expect(out.map((e) => e.mint)).toEqual([other.mint, solCreate.mint, mayhem.mint]);
    expect(out[1]).toMatchObject({ kind: 'create', curveFeeRate: 0.0125, mayhem: false });
    expect(out[2]).toMatchObject({ kind: 'create', mayhem: true });
    expect(v.stats).toMatchObject({ verified: 2, rejected: 1, unverified: 0 });
  });

  it('keeps a held launch first: its own trades and migration wait behind it, in order', async () => {
    let resolve: (f: (CurveFacts | null)[]) => void = () => {};
    const { v, out } = verifier(() => new Promise((r) => (resolve = r)));
    const [create, buy1, buy2] = lifecycle.slice(1, 4).map(ev);
    const migrate = ev(lifecycle[12]);
    v.push(create);
    v.push(buy1);
    v.push(buy2);
    v.push(migrate);
    await until(() => v.size === 1 && out.length === 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(out).toEqual([]);
    resolve([sol()]);
    await until(() => out.length === 4);
    expect(out.map((e) => e.kind)).toEqual(['create', 'trade', 'trade', 'migrate']);
    expect(out[1]).toBe(buy1);
  });

  it('reads a curve that is not visible yet again, then releases the launch unverified', async () => {
    let reads = 0;
    const { v, out } = verifier(async (mints) => {
      reads++;
      return mints.map(() => null);
    }, { maxAttempts: 3 });
    v.push(ev(misc.createNoBuy));
    await until(() => out.length === 1);
    expect(reads).toBe(3);
    expect(v.stats).toMatchObject({ retried: 2, unverified: 1, verified: 0 });
    expect((out[0] as CreateEvent).curveFeeRate).toBeUndefined();
  });

  it('releases launches unverified when the read fails or there is no RPC at all', async () => {
    const failing = verifier(async () => {
      throw new Error('429 Too Many Requests');
    });
    failing.v.push(ev(misc.createNoBuy));
    await until(() => failing.out.length === 1);
    expect(failing.v.stats).toMatchObject({ readErrors: 1, unverified: 1 });
    const none = verifier(null);
    const create = ev(misc.createNoBuy);
    none.v.push(create);
    expect(none.out).toEqual([create]);
    expect(none.v.stats.unverified).toBe(1);
  });

  it('passes other launchpads through unchecked, and launches beyond maxPending unverified', () => {
    const { v, out } = verifier(async (m) => m.map(() => sol()), { maxPending: 1 });
    const bonk = ev(misc.createBonk);
    v.push(bonk);
    expect(out).toEqual([bonk]);
    v.push(ev(misc.createNoBuy));
    const second = ev(misc.createQuotedInPump);
    v.push(second);
    expect(out).toEqual([bonk, second]);
    expect(v.stats.unverified).toBe(1);
  });

  it('batches at most maxBatch curves per read', async () => {
    const asked: number[] = [];
    const { v, out } = verifier(async (mints) => {
      asked.push(mints.length);
      return mints.map(() => sol());
    }, { maxBatch: 2 });
    const base = ev(misc.createNoBuy) as CreateEvent;
    const mints = ['DLdYrQ2qGJqXNtQ8CtaFLPdTB43QaZgtoYg7itGCxo5j', 'AM1y1MDPwNwE38zECwJHJ1iN8bLD7o9YNYWjKP5ipump', 'GQ7RhPxwAeREjrr3sLoh2EWXWgtaCMueixvSqAzm2JAc', 'H8P49pQxXUD6Bvdu1yZ1HSCnCGN4mQdD7fgUwdQxWsVb', '7JFy6LQNL1FFreGt1caZPWoGKpJCtj4qC5Gs1o18pump'];
    for (const mint of mints) v.push({ ...base, mint });
    await until(() => out.length === 5);
    expect(asked).toEqual([2, 2, 1]);
  });
});
