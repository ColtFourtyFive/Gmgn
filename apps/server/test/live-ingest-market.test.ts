// LiveMarket against a fake Solana RPC (no network): on-demand loading of
// unknown mints (pump curve, migrated PumpSwap pool, another venue priced by
// Jupiter, not-a-mint with a negative cache), trades parked until their token
// loads, protection / idle sleep / World pruning / wallet sweeping, on-chain
// authorities and top holders, the RPC probe and the tracked-set snapshot.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, PublicKey, type AccountInfo, type Connection, type ParsedAccountData } from '@solana/web3.js';
import { WSOL_MINT, type SearchResult, type TokenDetail } from '@trenchscope/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp, defaultConfig, type BuiltApp } from '../src/app';
import { loadLiveConfig } from '../src/live/config';
import { metadataPda, METAPLEX_PROGRAM_ID, loadPumpAmmSdk, loadPumpSdk } from '../src/live/enrich/onchain';
import { parseFeedMessage, type CreateEvent, type FeedEvent } from '../src/live/feed/messages';
import { LiveMarket } from '../src/live/market';

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const sdk = loadPumpSdk()!;
const amm = loadPumpAmmSdk()!;

// ---- account builders -------------------------------------------------------

const u64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};
const raw = (owner: PublicKey, data: Buffer): AccountInfo<Buffer> => ({ executable: false, owner, lamports: 1, rentEpoch: 0, data });
const parsed = (program: string, info: unknown, type: string): AccountInfo<ParsedAccountData> => ({
  executable: false,
  owner: TOKEN_PROGRAM,
  lamports: 1,
  rentEpoch: 0,
  data: { program, parsed: { type, info }, space: 82 },
});
const mintAccount = (opts: { decimals?: number; supply?: string; mintAuthority?: string | null } = {}) =>
  parsed('spl-token', { decimals: opts.decimals ?? 6, supply: opts.supply ?? '1000000000000000', mintAuthority: opts.mintAuthority ?? null, freezeAuthority: null, isInitialized: true }, 'mint');
const tokenAccount = (owner: string, amount: string, decimals = 6) => parsed('spl-token', { owner, tokenAmount: { amount, decimals, uiAmount: Number(amount) / 10 ** decimals } }, 'account');

function metaplex(name: string, symbol: string, uri: string): AccountInfo<Buffer> {
  const str = (s: string, len: number) => {
    const b = Buffer.alloc(4 + len);
    b.writeUInt32LE(len, 0);
    Buffer.from(s).copy(b, 4);
    return b;
  };
  return raw(METAPLEX_PROGRAM_ID, Buffer.concat([Buffer.from([4]), Keypair.generate().publicKey.toBuffer(), Keypair.generate().publicKey.toBuffer(), str(name, 32), str(symbol, 10), str(uri, 200)]));
}

/** pump.fun BondingCurve, 83-byte layout (the SDK zero-pads newer fields: quote mint = SOL). */
function curveAccount(c: { vTokens: bigint; vSol: bigint; rTokens: bigint; rSol: bigint; complete: boolean; creator: PublicKey }): AccountInfo<Buffer> {
  const data = Buffer.concat([
    Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]),
    u64(c.vTokens),
    u64(c.vSol),
    u64(c.rTokens),
    u64(c.rSol),
    u64(1_000_000_000_000_000n),
    Buffer.from([c.complete ? 1 : 0]),
    c.creator.toBuffer(),
    Buffer.from([0, 0]),
  ]);
  return raw(sdk.PUMP_PROGRAM_ID, data);
}

function poolAccount(mint: PublicKey, base: PublicKey, quote: PublicKey): AccountInfo<Buffer> {
  const index = Buffer.alloc(2);
  const data = Buffer.concat([
    Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]),
    Buffer.from([255]),
    index,
    Keypair.generate().publicKey.toBuffer(),
    mint.toBuffer(),
    new PublicKey(WSOL_MINT).toBuffer(),
    Keypair.generate().publicKey.toBuffer(),
    base.toBuffer(),
    quote.toBuffer(),
    u64(1000n),
    Keypair.generate().publicKey.toBuffer(),
  ]);
  return raw(amm.PUMP_AMM_PROGRAM_ID, data);
}

// ---- fake RPC ---------------------------------------------------------------

type Acc = AccountInfo<Buffer | ParsedAccountData> | null;

class FakeRpc {
  accounts = new Map<string, Acc>();
  signatures = new Map<string, { signature: string; slot: number; blockTime: number | null }[]>();
  largest = new Map<string, { address: PublicKey; amount: string; decimals: number; uiAmount: number; uiAmountString: string }[]>();
  calls: string[] = [];
  slotOk = true;

  async getMultipleParsedAccounts(keys: PublicKey[]) {
    this.calls.push('getMultipleParsedAccounts');
    return { context: { slot: 1 }, value: keys.map((k) => this.accounts.get(k.toBase58()) ?? null) };
  }
  async getParsedAccountInfo(key: PublicKey) {
    this.calls.push('getParsedAccountInfo');
    return { context: { slot: 1 }, value: this.accounts.get(key.toBase58()) ?? null };
  }
  async getAccountInfo(key: PublicKey) {
    this.calls.push('getAccountInfo');
    const a = this.accounts.get(key.toBase58());
    return a && Buffer.isBuffer(a.data) ? (a as AccountInfo<Buffer>) : null;
  }
  async getMultipleAccountsInfo(keys: PublicKey[]) {
    this.calls.push('getMultipleAccountsInfo');
    return keys.map((k) => {
      const a = this.accounts.get(k.toBase58());
      return a && Buffer.isBuffer(a.data) ? (a as AccountInfo<Buffer>) : null;
    });
  }
  async getSignaturesForAddress(key: PublicKey) {
    this.calls.push('getSignaturesForAddress');
    return this.signatures.get(key.toBase58()) ?? [];
  }
  async getTokenLargestAccounts(key: PublicKey) {
    this.calls.push('getTokenLargestAccounts');
    return { context: { slot: 1 }, value: this.largest.get(key.toBase58()) ?? [] };
  }
  async getSlot() {
    this.calls.push('getSlot');
    if (!this.slotOk) throw new Error('rpc down');
    return 123;
  }
}

// ---- app --------------------------------------------------------------------

let built: BuiltApp;
let market: LiveMarket;
let rpc: FakeRpc;
let dir: string;

const get = async <T>(url: string) => {
  const res = await built.app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() as T };
};
const internals = () => market as unknown as { enqueue(e: FeedEvent): void; housekeeping(): void; protect(): void; probeRpc(): Promise<void>; rpcHealthy: boolean };

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/price/v3')) {
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return new Response(JSON.stringify(Object.fromEntries(ids.map((id) => [id, { usdPrice: id === WSOL_MINT ? 200 : 0.002, liquidity: 400_000, decimals: 9 }]))), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('nope', { status: 404 });
  });
  dir = mkdtempSync(join(tmpdir(), 'trenchscope-livemarket-'));
  const live = loadLiveConfig({ PUMPPORTAL_WS_URL: 'ws://127.0.0.1:9/none', JUPITER_API_URL: 'http://jupiter.test', LIVE_MAX_TRACKED_TOKENS: '100' });
  built = await buildApp(defaultConfig({ mode: 'live', live: live.config, liveProblems: [], warmupMinutes: 0, snapshotEveryMs: 0, dataDir: dir }), { start: false, persist: false });
  market = built.market as LiveMarket;
  rpc = new FakeRpc();
  built.ctx.live!.connection = rpc as unknown as Connection;
  built.ctx.world.setNativeUsd('sol', 200);
});

afterAll(async () => {
  await built.close();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  rpc.calls = [];
});

function pumpMint(opts: { complete?: boolean } = {}) {
  const mint = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  rpc.accounts.set(mint.toBase58(), mintAccount());
  rpc.accounts.set(metadataPda(mint).toBase58(), metaplex('Otter Club', 'OTTER', 'https://meta.example.com/otter.json'));
  rpc.accounts.set(
    sdk.bondingCurvePda(mint).toBase58(),
    curveAccount(
      opts.complete
        ? { vTokens: 279_900_000_000_000n, vSol: 115_005_359_056n, rTokens: 0n, rSol: 85_005_359_056n, complete: true, creator }
        : { vTokens: 900_000_000_000_000n, vSol: 35_766_666_666n, rTokens: 620_100_000_000_000n, rSol: 5_766_666_666n, complete: false, creator },
    ),
  );
  rpc.signatures.set(mint.toBase58(), [
    { signature: 's2', slot: 2, blockTime: 1_700_000_100 },
    { signature: 's1', slot: 1, blockTime: 1_700_000_000 },
  ]);
  return { mint, creator };
}

describe('on-demand token loading', () => {
  it('loads a pump.fun mint still on its curve from the chain and starts streaming it', async () => {
    const { mint, creator } = pumpMint();
    const res = await get<TokenDetail>(`/api/sol/tokens/${mint.toBase58()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ symbol: 'OTTER', name: 'Otter Club', launchpad: 'pump', status: 'curve', creator: creator.toBase58(), createdAt: 1_700_000_000_000, narrative: 'Animals', decimals: 6 });
    expect(res.body.curve?.virtualNative).toBeCloseTo(35.766666666, 9);
    expect(res.body.curve?.realTokens).toBeCloseTo(620_100_000, 6);
    expect(res.body.security.renouncedMint).toBe(true);
    expect(market.diagnostics().tracked).toBeGreaterThanOrEqual(1);
    // one batched account read + one signature read
    expect(rpc.calls).toEqual(['getMultipleParsedAccounts', 'getSignaturesForAddress']);
    // a token created long ago is filed before newer ones, not at the end
    expect(built.ctx.world.tokensByChain.sol[0]).toBe(mint.toBase58());
  });

  it('loads a migrated pump.fun mint with its PumpSwap pool reserves', async () => {
    const { mint } = pumpMint({ complete: true });
    const poolKey = sdk.canonicalPumpPoolPda(mint);
    const base = Keypair.generate().publicKey;
    const quote = Keypair.generate().publicKey;
    rpc.accounts.set(poolKey.toBase58(), poolAccount(mint, base, quote));
    rpc.accounts.set(base.toBase58(), tokenAccount(poolKey.toBase58(), '206900000000000'));
    rpc.accounts.set(quote.toBase58(), tokenAccount(poolKey.toBase58(), '84990000000', 9));
    const res = await get<TokenDetail>(`/api/sol/tokens/${mint.toBase58()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('migrated');
    expect(res.body.pool).toMatchObject({ address: poolKey.toBase58(), dex: 'PumpSwap', lpBurnedRate: 1 });
    expect(res.body.pool?.nativeReserve).toBeCloseTo(84.99, 9);
    expect(res.body.pool?.tokenReserve).toBeCloseTo(206_900_000, 3);
  });

  it('prices a token from another venue with Jupiter (no launchpad)', async () => {
    const mint = Keypair.generate().publicKey;
    rpc.accounts.set(mint.toBase58(), mintAccount({ decimals: 9, supply: '1000000000000000000', mintAuthority: Keypair.generate().publicKey.toBase58() }));
    rpc.accounts.set(metadataPda(mint).toBase58(), metaplex('Plain Coin', 'PLAIN', ''));
    const res = await get<TokenDetail>(`/api/sol/tokens/${mint.toBase58()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ launchpad: '', status: 'migrated', symbol: 'PLAIN', totalSupply: 1e9, decimals: 9 });
    expect(res.body.priceUsd).toBeCloseTo(0.002, 9);
    expect(res.body.liquidityUsd).toBeCloseTo(400_000, 0);
    expect(res.body.security.renouncedMint).toBe(false);
  });

  it('404s what is not a mint, remembers the miss and shares one lookup between concurrent requests', async () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const [a, b] = await Promise.all([get(`/api/sol/tokens/${wallet}`), get(`/api/sol/tokens/${wallet}`)]);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(rpc.calls).toEqual(['getMultipleParsedAccounts']);
    expect((await get(`/api/sol/tokens/${wallet}`)).status).toBe(404);
    expect(rpc.calls).toHaveLength(1);
  });

  it('search for an unseen mint loads it; an unseen non-mint address becomes a wallet hit', async () => {
    const { mint } = pumpMint();
    const res = await get<SearchResult>(`/api/search?q=${mint.toBase58()}`);
    expect(res.body.tokens[0]?.address).toBe(mint.toBase58());
    const someone = Keypair.generate().publicKey.toBase58();
    const w = await get<SearchResult>(`/api/search?q=${someone}`);
    expect(w.body.tokens).toEqual([]);
    expect(w.body.wallets[0]?.address).toBe(someone);
  });

  it('parks a trade of an unknown token until it loads, then books it', async () => {
    const { mint } = pumpMint();
    const trader = Keypair.generate().publicKey.toBase58();
    internals().enqueue({ kind: 'trade', side: 'buy', signature: '5'.repeat(88), mint: mint.toBase58(), trader, tokenAmount: 1_000_000, solAmount: 0.04, newTokenBalance: 1_000_000, pool: 'pump', vSolInBondingCurve: 35.8, vTokensInBondingCurve: 899e6 });
    built.ctx.engine.step(250);
    await vi.waitFor(() => expect(built.ctx.world.tokens.has(mint.toBase58())).toBe(true));
    built.ctx.engine.step(250);
    const t = built.ctx.world.tokens.get(mint.toBase58())!;
    expect(t.trades.map((x) => x.wallet)).toEqual([trader]);
    expect(t.curve?.virtualNative).toBeCloseTo(35.8, 9);
  });
});

describe('protection, idle sleep and pruning', () => {
  const launch = (mint: string): FeedEvent => ({
    kind: 'create',
    signature: `${mint}${mint}`.slice(0, 88),
    mint,
    trader: Keypair.generate().publicKey.toBase58(),
    initialBuy: 0,
    solAmount: 0,
    name: 'Quiet',
    symbol: 'QUIET',
    uri: '',
    pool: 'pump',
  });

  it('sleeps and unstreams idle tokens but keeps the ones an account holds or watchlists', async () => {
    const { world, engine } = built.ctx;
    const idle = Keypair.generate().publicKey.toBase58();
    const held = Keypair.generate().publicKey.toBase58();
    internals().enqueue(launch(idle));
    internals().enqueue(launch(held));
    engine.step(250);
    const user = world.createWallet('sol', 'user', { accountId: 'acct-live-test' });
    world.syncHolderBalance(world.tokens.get(held)!, user.address, 5_000_000);
    internals().protect();
    expect(market.protectedTokens().has(held)).toBe(true);
    world.now += 31 * 60_000;
    internals().housekeeping();
    expect(world.tokens.get(idle)!.dormant).toBe(true);
    expect(world.tokens.get(held)!.dormant).toBe(false);
    const tracked = new Set(market.serialize().tracked.map(([m]) => m));
    expect(tracked.has(idle)).toBe(false);
    expect(tracked.has(held)).toBe(true);
    // the tracked set survives a restart
    const again = new LiveMarket(built.ctx, { env: {} });
    again.restore(market.serialize());
    expect(again.liveStatus().trackedTokens).toBe(market.liveStatus().trackedTokens);
    await again.stop();
  });

  it('keeps the World bounded: oldest dormant tokens nobody references go, with their observed wallets', () => {
    const { world } = built.ctx;
    const before = world.tokensByChain.sol.length;
    const creators: string[] = [];
    for (let i = 0; i < 1100; i++) {
      const creator = Keypair.generate().publicKey.toBase58();
      creators.push(creator);
      const t = world.addExternalToken({
        chain: 'sol',
        address: Keypair.generate().publicKey.toBase58(),
        launchpad: 'pump',
        symbol: `T${i}`,
        name: `T${i}`,
        description: '',
        imageUrl: null,
        metadataUri: null,
        creator,
        createdAt: world.now - 10 * 86_400_000 + i,
        decimals: 6,
        totalSupply: 1e9,
        status: 'curve',
        curve: { virtualNative: 30, virtualTokens: 1.073e9, realNative: 0, realTokens: 793.1e6, initialRealTokens: 793.1e6, feeRate: 0.0125 },
        pool: null,
        socials: {},
        narrative: '',
        logoGlyph: '🚀',
      });
      t.lastTradeAt = world.now - 2 * 3600_000;
    }
    world.now += 2 * 3600_000;
    internals().housekeeping(); // sleep them
    internals().housekeeping(); // prune
    expect(world.tokensByChain.sol.length).toBeLessThanOrEqual(1000);
    expect(world.tokensByChain.sol.length).toBeLessThan(before + 1100);
    // the creators of deleted tokens had nothing else: swept
    const gone = creators.filter((c) => !world.wallets.has(c));
    expect(gone.length).toBeGreaterThan(0);
    expect(market.diagnostics().pruned.tokens).toBeGreaterThan(0);
  });
});

describe('on-chain security and health', () => {
  it('reads authorities and top holders of protected tokens, skipping program-owned accounts', async () => {
    const { world } = built.ctx;
    const { mint } = pumpMint();
    await market.ensureToken('sol', mint.toBase58());
    const t = world.tokens.get(mint.toBase58())!;
    rpc.accounts.set(mint.toBase58(), mintAccount({ mintAuthority: Keypair.generate().publicKey.toBase58() }));
    const holder = Keypair.generate().publicKey.toBase58();
    const holderAta = Keypair.generate().publicKey;
    const curveAta = Keypair.generate().publicKey;
    rpc.accounts.set(holderAta.toBase58(), tokenAccount(holder, '50000000000000'));
    rpc.accounts.set(curveAta.toBase58(), tokenAccount(sdk.bondingCurvePda(mint).toBase58(), '600000000000000'));
    rpc.largest.set(mint.toBase58(), [
      { address: curveAta, amount: '600000000000000', decimals: 6, uiAmount: 6e8, uiAmountString: '600000000' },
      { address: holderAta, amount: '50000000000000', decimals: 6, uiAmount: 5e7, uiAmountString: '50000000' },
    ]);
    // authorities were read at load: only holders are due now
    const user = world.createWallet('sol', 'user', { accountId: 'acct-sec' });
    world.syncHolderBalance(t, user.address, 1_000_000);
    internals().protect();
    await vi.waitFor(() => expect(world.wallets.get(holder)?.positions.get(t.address)?.balance).toBe(5e7));
    expect(t.holders.has(sdk.bondingCurvePda(mint).toBase58())).toBe(false);
    // the mint now has an authority, but this token's were read at load: not due again yet
    expect(t.renouncedMint).toBe(true);
    // ten minutes on the authorities are read again
    world.now += 11 * 60_000;
    internals().protect();
    await vi.waitFor(() => expect(t.renouncedMint).toBe(false));
  });

  it('probes the RPC for live status', async () => {
    await internals().probeRpc();
    expect(market.liveStatus().rpcHealthy).toBe(true);
    rpc.slotOk = false;
    await internals().probeRpc();
    expect(market.liveStatus().rpcHealthy).toBe(false);
    rpc.slotOk = true;
  });
});

describe('launch verification and migrated pools (feed -> chain)', () => {
  const FIX = join(__dirname, 'fixtures', 'pumpportal');
  const curves = JSON.parse(readFileSync(join(FIX, 'curves.json'), 'utf8')) as Record<string, { owner: string; data: string }>;
  const misc = JSON.parse(readFileSync(join(FIX, 'misc.json'), 'utf8')) as Record<string, Record<string, unknown>>;
  /** A bonding-curve account as mainnet returned it (fixtures/pumpportal/curves.json). */
  const mainnetCurve = (name: string) => raw(new PublicKey(curves[name].owner), Buffer.from(curves[name].data, 'base64'));
  const launchOf = (mint: string, frame = misc.createNoBuy): CreateEvent => ({ ...(parseFeedMessage(JSON.stringify(frame)) as CreateEvent), mint, signature: `${mint}${mint}`.slice(0, 88) });
  type Internals = { verifier: { push(e: FeedEvent): void; size: number }; drain(): void; queue: FeedEvent[] };

  let m: LiveMarket;
  beforeAll(() => {
    m = new LiveMarket(built.ctx, { env: {}, verify: { batchMs: 5, retryMs: 5 }, poolReadDelaysMs: [0, 20] });
  });
  afterAll(async () => {
    await m.stop();
  });
  const mi = () => m as unknown as Internals;

  it('books a SOL-quoted launch after reading its curve, and drops one quoted in the PUMP token with its trades', async () => {
    const { world } = built.ctx;
    const solMint = Keypair.generate().publicKey;
    const pumpQuoted = Keypair.generate().publicKey;
    rpc.accounts.set(sdk.bondingCurvePda(solMint).toBase58(), mainnetCurve('SOL'));
    rpc.accounts.set(sdk.bondingCurvePda(pumpQuoted).toBase58(), mainnetCurve('PUMP_QUOTED'));
    const solLaunch = launchOf(solMint.toBase58());
    const quotedLaunch = launchOf(pumpQuoted.toBase58(), misc.createQuotedInPump);
    const quotedBuy: FeedEvent = {
      kind: 'trade',
      side: 'buy',
      signature: '6'.repeat(88),
      mint: quotedLaunch.mint,
      trader: Keypair.generate().publicKey.toBase58(),
      tokenAmount: 1e6,
      solAmount: 0.03,
      pool: 'pump',
      vSolInBondingCurve: 30.03,
      vTokensInBondingCurve: 1.072e9,
    };
    mi().verifier.push(solLaunch);
    mi().verifier.push(quotedLaunch);
    mi().verifier.push(quotedBuy); // held behind its launch, dropped with it
    expect(mi().queue).toHaveLength(0);
    await vi.waitFor(() => expect(mi().verifier.size).toBe(0));
    expect(rpc.calls).toEqual(['getMultipleAccountsInfo']);
    mi().drain();
    expect(world.tokens.get(solLaunch.mint)?.curve?.feeRate).toBeCloseTo(0.0125, 12);
    expect(world.tokens.has(quotedLaunch.mint)).toBe(false);
    // a later trade of the dropped launch is ignored, not parked and looked up on chain
    mi().verifier.push({ ...quotedBuy, signature: '7'.repeat(88) });
    mi().drain();
    expect(world.tokens.has(quotedLaunch.mint)).toBe(false);
    expect(m.diagnostics().verify).toMatchObject({ verified: 1, rejected: 1, pending: 0 });
    expect(m.diagnostics().ingest.ignored).toBeGreaterThanOrEqual(1);
    expect(m.diagnostics().parked).toBe(0);
    expect(rpc.calls).toEqual(['getMultipleAccountsInfo']);
  });

  it("reads a migrated token's PumpSwap pool back from the chain", async () => {
    const { world } = built.ctx;
    const mint = Keypair.generate().publicKey;
    rpc.accounts.set(sdk.bondingCurvePda(mint).toBase58(), mainnetCurve('SOL'));
    mi().verifier.push(launchOf(mint.toBase58()));
    await vi.waitFor(() => expect(mi().verifier.size).toBe(0));
    mi().drain();
    const t = world.tokens.get(mint.toBase58())!;
    mi().verifier.push({ kind: 'migrate', signature: '8'.repeat(88), mint: mint.toBase58(), pool: 'pump-amm' });
    mi().drain();
    expect(t.status).toBe('migrated');
    expect(t.pool!.native).toBeCloseTo(84.990359, 5); // the migration model, until the read lands
    const poolKey = sdk.canonicalPumpPoolPda(mint);
    const base = Keypair.generate().publicKey;
    const quote = Keypair.generate().publicKey;
    rpc.accounts.set(poolKey.toBase58(), poolAccount(mint, base, quote));
    rpc.accounts.set(base.toBase58(), tokenAccount(poolKey.toBase58(), '206900000000000'));
    rpc.accounts.set(quote.toBase58(), tokenAccount(poolKey.toBase58(), '67405853768', 9));
    await vi.waitFor(() => expect(t.pool!.native).toBeCloseTo(67.405853768, 9));
    expect(t.pool!.tokens).toBeCloseTo(206_900_000, 3);
    expect(m.diagnostics().poolReads.applied).toBe(1);
  });
});
