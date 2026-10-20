// Live enrichment: URL / text sanitising and SSRF guards, the metadata fetcher
// and queue (stubbed fetch + DNS), Jupiter prices and the SOL/USD ticker
// (stubbed fetch), the RPC budget, on-chain decoders (Metaplex, jsonParsed
// mints) and writing on-chain holders into the World.

import { Keypair, PublicKey } from '@solana/web3.js';
import { WSOL_MINT } from '@trenchscope/shared';
import { describe, expect, it, vi } from 'vitest';
import { BudgetExceeded, RequestBudget } from '../src/live/enrich/budget';
import { FetchRefused, fetchPublicJson, type FetchFn, type HostLookup } from '../src/live/enrich/http';
import { MetadataQueue, fetchTokenMetadata, metadataUrls, sanitizeMetadata } from '../src/live/enrich/metadata';
import { decodeMetaplexMetadata, parseMintAccount } from '../src/live/enrich/onchain';
import { PriceTicker, fetchJupiterPrices } from '../src/live/enrich/prices';
import { isPrivateAddress, publicHttpsUrl, safeImageUrl, safeSocial } from '../src/live/enrich/sanitize';
import { applyAuthorities, applyHolders } from '../src/live/enrich/security';
import { AddressRefused, pinnedFetch, publicOnlyLookup } from '../src/live/enrich/transport';
import { World } from '../src/sim/world';

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];
const CID = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const publicDns: HostLookup = async () => ['93.184.216.34'];

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('URL and text guards', () => {
  it('keeps public https URLs only', () => {
    expect(publicHttpsUrl('https://ipfs.io/ipfs/x')?.hostname).toBe('ipfs.io');
    for (const bad of [
      'http://ipfs.io/x',
      'https://127.0.0.1/x',
      'https://2130706433/x', // decimal IPv4 -> 127.0.0.1
      'https://0x7f000001/x',
      'https://[::1]/x',
      'https://[fd00::1]/x',
      'https://localhost/x',
      'https://metadata.google.internal/x',
      'https://printer.local/x',
      'https://intranet/x',
      'https://user:pw@ipfs.io/x',
      'https://ipfs.io:8443/x',
      'javascript:alert(1)',
      'file:///etc/passwd',
      `https://ipfs.io/${String.fromCodePoint(0x202e)}x`,
      'x'.repeat(600),
    ]) {
      expect(publicHttpsUrl(bad), bad).toBeNull();
    }
  });

  it('recognises non-public addresses', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::2', '::ffff:10.0.0.1', '224.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('turns ipfs:// images into gateway URLs and drops anything not public https', () => {
    expect(safeImageUrl(`ipfs://${CID}`, GATEWAYS)).toBe(`https://ipfs.io/ipfs/${CID}`);
    expect(safeImageUrl('https://cf-ipfs.com/ipfs/abc.png', GATEWAYS)).toBe('https://cf-ipfs.com/ipfs/abc.png');
    expect(safeImageUrl('http://evil.example.org/a.png', GATEWAYS)).toBeNull();
    expect(safeImageUrl('data:image/svg+xml;base64,AAAA', GATEWAYS)).toBeNull();
    expect(safeImageUrl('https://10.0.0.1/a.png', GATEWAYS)).toBeNull();
  });

  it('keeps social links on their own hosts', () => {
    expect(safeSocial('twitter', '@ribbit_sol')).toBe('https://x.com/ribbit_sol');
    expect(safeSocial('twitter', 'https://twitter.com/ribbit')).toBe('https://twitter.com/ribbit');
    expect(safeSocial('twitter', 'https://evil.com/ribbit')).toBeUndefined();
    expect(safeSocial('telegram', 't.me/ribbitportal')).toBe('https://t.me/ribbitportal');
    expect(safeSocial('telegram', 'https://t.me.evil.com/x')).toBeUndefined();
    expect(safeSocial('website', 'http://ribbit.fun')).toBe('https://ribbit.fun/');
    expect(safeSocial('website', 'https://192.168.0.1')).toBeUndefined();
    expect(safeSocial('website', 'javascript:alert(1)')).toBeUndefined();
  });
});

describe('metadata', () => {
  it('lists gateway candidates for ipfs:// and gateway links', () => {
    expect(metadataUrls(`ipfs://${CID}`, GATEWAYS)).toEqual([`https://ipfs.io/ipfs/${CID}`, `https://cloudflare-ipfs.com/ipfs/${CID}`]);
    expect(metadataUrls(`https://ipfs.io/ipfs/${CID}`, GATEWAYS)).toEqual([`https://ipfs.io/ipfs/${CID}`, `https://cloudflare-ipfs.com/ipfs/${CID}`]);
    expect(metadataUrls('https://meta.example.com/x.json', GATEWAYS)).toEqual(['https://meta.example.com/x.json']);
    expect(metadataUrls('http://meta.example.com/x.json', GATEWAYS)).toEqual([]);
    expect(metadataUrls('', GATEWAYS)).toEqual([]);
  });

  it('sanitises the JSON: capped clean text, public https image and social links only', () => {
    const rlo = String.fromCodePoint(0x202e);
    const m = sanitizeMetadata(
      {
        name: 'Ribbit',
        description: `the frog${rlo} that\u0000 ribbits\n\n${'x'.repeat(2000)}`,
        image: `ipfs://${CID}`,
        twitter: 'https://x.com/ribbit',
        telegram: 'https://evil.com/ribbit',
        website: 'https://ribbit.fun',
        extensions: { telegram: 'https://t.me/ribbit' },
      },
      GATEWAYS,
    );
    expect(m.imageUrl).toBe(`https://ipfs.io/ipfs/${CID}`);
    expect(m.description.startsWith('the frog that ribbits x')).toBe(true);
    expect([...m.description].length).toBeLessThanOrEqual(600);
    // the top-level telegram link is off-host: it is dropped, not replaced by a later field
    expect(m.socials).toEqual({ twitter: 'https://x.com/ribbit', website: 'https://ribbit.fun/' });
    expect(sanitizeMetadata('not an object', GATEWAYS)).toEqual({ description: '', imageUrl: null, socials: {} });
    expect(sanitizeMetadata({ image: 'https://169.254.169.254/latest/meta-data' }, GATEWAYS).imageUrl).toBeNull();
  });

  it('fetches through the guards: public DNS, manual redirects re-checked, JSON only, size and time capped', async () => {
    const calls: string[] = [];
    const fetchOk: FetchFn = async (url) => {
      calls.push(String(url));
      return json({ image: `ipfs://${CID}`, description: 'hi' });
    };
    expect(await fetchTokenMetadata(`ipfs://${CID}`, { gateways: GATEWAYS, fetch: fetchOk, lookup: publicDns })).toMatchObject({ description: 'hi', imageUrl: `https://ipfs.io/ipfs/${CID}` });
    expect(calls).toEqual([`https://ipfs.io/ipfs/${CID}`]);

    // a host that resolves to a private address is refused before any request
    const never = vi.fn<FetchFn>();
    await expect(fetchPublicJson('https://rebind.example.com/x', { fetch: never, lookup: async () => ['10.0.0.5'] })).rejects.toBeInstanceOf(FetchRefused);
    expect(never).not.toHaveBeenCalled();

    // redirects are followed by hand and each hop is checked
    const redirecting: FetchFn = async (url) =>
      String(url).includes('first') ? new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }) : json({});
    await expect(fetchPublicJson('https://first.example.com/x', { fetch: redirecting, lookup: publicDns })).rejects.toThrow(/non-public/);
    const hop: FetchFn = async (url) => (new URL(String(url)).pathname === '/x' ? new Response(null, { status: 301, headers: { location: '/moved.json' } }) : json({ ok: 1 }));
    expect(await fetchPublicJson('https://first.example.com/x', { fetch: hop, lookup: publicDns })).toEqual({ ok: 1 });
    const loop: FetchFn = async () => new Response(null, { status: 302, headers: { location: 'https://loop.example.com/again' } });
    await expect(fetchPublicJson('https://loop.example.com/x', { fetch: loop, lookup: publicDns })).rejects.toThrow(/redirects/);

    // not JSON
    const html: FetchFn = async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    await expect(fetchPublicJson('https://html.example.com/x', { fetch: html, lookup: publicDns })).rejects.toThrow(/not JSON/);

    // a body that never declares its size is cut at the cap while streaming
    const chunk = new Uint8Array(64 * 1024).fill(32);
    let pulled = 0;
    const huge: FetchFn = async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulled++;
            c.enqueue(chunk);
            if (pulled > 50) c.close();
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    await expect(fetchPublicJson('https://huge.example.com/x', { fetch: huge, lookup: publicDns })).rejects.toThrow(/over 262144 bytes/);
    expect(pulled).toBeLessThan(10);
    const declared: FetchFn = async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) } });
    await expect(fetchPublicJson('https://declared.example.com/x', { fetch: declared, lookup: publicDns })).rejects.toThrow(/over/);

    // a server that never answers is abandoned at the timeout
    const hang: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason ?? new Error('aborted'))));
    const t0 = Date.now();
    await expect(fetchPublicJson('https://slow.example.com/x', { fetch: hang, lookup: publicDns, timeoutMs: 50 })).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('tries the next gateway when one fails', async () => {
    const fetchFn: FetchFn = async (url) => (String(url).startsWith('https://ipfs.io') ? new Response('busy', { status: 429 }) : json({ image: 'https://img.example.com/a.png' }));
    expect((await fetchTokenMetadata(`ipfs://${CID}`, { gateways: GATEWAYS, fetch: fetchFn, lookup: publicDns })).imageUrl).toBe('https://img.example.com/a.png');
  });

  it('queues fetches with a per-URI cache: one fetch for launches sharing a URI', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json({ image: 'https://img.example.com/a.png', twitter: '@frog' }));
    const applied: string[] = [];
    const q = new MetadataQueue({ gateways: GATEWAYS, fetch: fetchFn, lookup: publicDns, apply: (mint) => applied.push(mint) });
    q.push('mint1', `ipfs://${CID}`);
    await vi.waitFor(() => expect(applied).toEqual(['mint1']));
    q.push('mint2', `ipfs://${CID}`);
    expect(applied).toEqual(['mint1', 'mint2']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // refused URIs are remembered too; a URI that cannot be fetched at all is never queued
    q.push('mint3', 'http://plain.example.com/x.json');
    await vi.waitFor(() => expect(q.stats.refused).toBe(1));
    expect(q.pending).toBe(0);
    q.close();
  });
});

describe('pinned transport', () => {
  const resolver = (map: Record<string, string[]>) => (host: string, cb: (err: Error | null, a: { address: string; family: number }[]) => void) =>
    cb(null, (map[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

  it('connect-time lookup yields public addresses only (every answer must be public)', async () => {
    const lookup = publicOnlyLookup(resolver({ 'ok.example.com': ['93.184.216.34', '2606:4700::1'], 'mixed.example.com': ['93.184.216.34', '10.0.0.1'] }));
    const call = (host: string, options: Record<string, unknown>) =>
      new Promise<{ err: Error | null; address: unknown; family?: number }>((resolve) =>
        (lookup as unknown as (h: string, o: unknown, cb: (err: Error | null, address: unknown, family?: number) => void) => void)(host, options, (err, address, family) => resolve({ err, address, family })),
      );
    expect(await call('ok.example.com', {})).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    expect((await call('ok.example.com', { family: 6 })).address).toBe('2606:4700::1');
    expect((await call('ok.example.com', { all: true })).address).toHaveLength(2);
    expect((await call('mixed.example.com', {})).err).toBeInstanceOf(AddressRefused);
    expect((await call('nothing.example.com', {})).err).toBeInstanceOf(AddressRefused);
  });

  it('refuses to connect when the name resolves to a private address at connect time (DNS rebinding)', async () => {
    const f = pinnedFetch(resolver({ 'rebind.example.com': ['127.0.0.1'] }));
    await expect(f('https://rebind.example.com/x.json')).rejects.toBeInstanceOf(AddressRefused);
    await expect(f('http://plain.example.com/x.json')).rejects.toBeInstanceOf(AddressRefused);
  });
});

describe('Jupiter prices', () => {
  it('reads the v3 price map, chunked by 50 ids, with the API key header', async () => {
    const urls: string[] = [];
    const headers: (string | null)[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      urls.push(String(url));
      headers.push(new Headers(init?.headers).get('x-api-key'));
      const ids = new URL(String(url)).searchParams.get('ids')!.split(',');
      return json(Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0 ? { usdPrice: 1 + i, decimals: 6, liquidity: 1000, priceChange24h: -2.5, blockId: 1 } : { usdPrice: 'oops' }])));
    };
    const ids = Array.from({ length: 60 }, (_, i) => `mint${i}`);
    const prices = await fetchJupiterPrices(ids, { baseUrl: 'https://api.jup.example/', apiKey: 'secret', fetch: fetchFn });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/^https:\/\/api\.jup\.example\/price\/v3\?ids=mint0,mint1,/);
    expect(headers).toEqual(['secret', 'secret']);
    expect(prices.size).toBe(30);
    expect(prices.get('mint0')).toEqual({ usdPrice: 1, decimals: 6, liquidity: 1000, priceChange24h: -2.5 });
    expect(prices.has('mint1')).toBe(false);
  });

  it('ticks SOL/USD into the callback and ignores absurd values', async () => {
    let sol = 187.25;
    const fetchFn: FetchFn = async () => json({ [WSOL_MINT]: { usdPrice: sol } });
    const seen: number[] = [];
    const ticker = new PriceTicker({ baseUrl: 'https://lite-api.jup.example', fetch: fetchFn, onNativeUsd: (u) => seen.push(u), log: { warn: () => {} } });
    await ticker.tick();
    sol = 0.0001;
    await ticker.tick();
    expect(seen).toEqual([187.25]);
    const failing = new PriceTicker({ baseUrl: 'https://x.example', fetch: async () => new Response('down', { status: 503 }), onNativeUsd: () => seen.push(-1), log: { warn: () => {} } });
    await failing.tick();
    expect(seen).toEqual([187.25]);
  });
});

describe('RPC budget', () => {
  it('runs at most rps per second, high priority first, and refuses past a full queue', async () => {
    let now = 0;
    const budget = new RequestBudget({ rps: 2, burst: 2, maxLow: 1, now: () => now });
    const order: string[] = [];
    const job = (name: string) => async () => {
      order.push(name);
      return name;
    };
    const p = [budget.run(job('l1')), budget.run(job('l2')), budget.run(job('l3')), budget.run(job('l4'))];
    await expect(p[3]).rejects.toBeInstanceOf(BudgetExceeded);
    const h = budget.run(job('h1'), 'high');
    await Promise.resolve();
    expect(order).toEqual(['l1', 'l2']);
    now = 1000; // two more tokens
    await vi.waitFor(() => expect(order).toEqual(['l1', 'l2', 'h1', 'l3']));
    await expect(h).resolves.toBe('h1');
    budget.close();
    await expect(budget.run(job('late'))).rejects.toBeInstanceOf(BudgetExceeded);
  });
});

describe('on-chain decoders', () => {
  it('decodes a Metaplex metadata account (NUL-padded borsh strings)', () => {
    const str = (s: string, len: number) => {
      const b = Buffer.alloc(4 + len);
      b.writeUInt32LE(len, 0);
      Buffer.from(s).copy(b, 4);
      return b;
    };
    const ua = Keypair.generate().publicKey;
    const data = Buffer.concat([Buffer.from([4]), ua.toBuffer(), Keypair.generate().publicKey.toBuffer(), str('Ribbit Frog', 32), str('RIBBIT', 10), str(`https://ipfs.io/ipfs/${CID}`, 200), Buffer.alloc(40)]);
    expect(decodeMetaplexMetadata(data)).toEqual({ name: 'Ribbit Frog', symbol: 'RIBBIT', uri: `https://ipfs.io/ipfs/${CID}`, updateAuthority: ua.toBase58() });
    expect(decodeMetaplexMetadata(Buffer.alloc(20))).toBeNull();
  });

  it('reads jsonParsed mint accounts (SPL and Token-2022 metadata extension)', () => {
    const owner = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const acc = (info: Record<string, unknown>) => ({ executable: false, owner, lamports: 1, rentEpoch: 0, data: { program: 'spl-token', parsed: { type: 'mint', info }, space: 82 } });
    expect(parseMintAccount(acc({ decimals: 6, supply: '1000000000000000', mintAuthority: null, freezeAuthority: null, isInitialized: true }))).toEqual({
      decimals: 6,
      supply: 1e9,
      mintAuthority: null,
      freezeAuthority: null,
      meta: null,
    });
    const ext = parseMintAccount(
      acc({
        decimals: 9,
        supply: '5000000000',
        mintAuthority: 'AuthAuthAuthAuthAuthAuthAuthAuthAuthAuthAuth',
        freezeAuthority: null,
        extensions: [{ extension: 'tokenMetadata', state: { name: 'Twenty Two', symbol: 'TT', uri: 'https://x.example.com/m.json', updateAuthority: null } }],
      }),
    );
    expect(ext).toMatchObject({ decimals: 9, supply: 5, mintAuthority: 'AuthAuthAuthAuthAuthAuthAuthAuthAuthAuthAuth', meta: { name: 'Twenty Two', symbol: 'TT', updateAuthority: null } });
    expect(parseMintAccount({ ...acc({}), data: { program: 'spl-token', parsed: { type: 'account', info: {} }, space: 165 } })).toBeNull();
    expect(parseMintAccount(null)).toBeNull();
  });
});

describe('on-chain state in the World', () => {
  const token = (world: World) =>
    world.addExternalToken({
      chain: 'sol',
      address: Keypair.generate().publicKey.toBase58(),
      launchpad: 'pump',
      symbol: 'T',
      name: 'T',
      description: '',
      imageUrl: null,
      metadataUri: null,
      creator: Keypair.generate().publicKey.toBase58(),
      createdAt: world.now,
      decimals: 6,
      totalSupply: 1e9,
      status: 'curve',
      curve: { virtualNative: 40, virtualTokens: 800e6, realNative: 10, realTokens: 520e6, initialRealTokens: 793.1e6, feeRate: 0.0125 },
      pool: null,
      socials: {},
      narrative: '',
      logoGlyph: '🚀',
    });

  it('writes the largest holders into positions at a neutral cost, leaves account wallets alone, and closes emptied ones', () => {
    const world = new World('holders', 1_800_000_000_000);
    const t = token(world);
    const user = world.createWallet('sol', 'user', { accountId: 'acc1' });
    const h1 = Keypair.generate().publicKey.toBase58();
    const h2 = Keypair.generate().publicKey.toBase58();
    applyHolders(world, t, [
      { owner: h1, balance: 50e6 },
      { owner: h2, balance: 20e6 },
      { owner: user.address, balance: 1e6 },
    ], (a) => !!world.wallets.get(a)?.accountId);
    const p1 = world.wallets.get(h1)!.positions.get(t.address)!;
    expect(p1.balance).toBe(50e6);
    expect(p1.costBasisUsd).toBeCloseTo(50e6 * world.priceUsd(t), 6);
    expect(p1.buys).toBe(0);
    expect(t.holders.has(h1) && t.holders.has(h2) && t.traders.has(h1)).toBe(true);
    expect(user.positions.has(t.address)).toBe(false);
    const v = t.version;
    world.syncHolderBalance(t, h1, 25e6);
    expect(p1.balance).toBe(25e6);
    expect(p1.costBasisUsd).toBeCloseTo(25e6 * world.priceUsd(t), 6);
    world.syncHolderBalance(t, h2, 0);
    expect(t.holders.has(h2)).toBe(false);
    expect(world.wallets.get(h2)!.positions.get(t.address)!.closedAt).not.toBeNull();
    expect(t.version).toBeGreaterThan(v);
  });

  it('records mint / freeze authorities as read', () => {
    const world = new World('auth', 1_800_000_000_000);
    const t = token(world);
    const v = t.version;
    applyAuthorities(t, null, null);
    expect(t.version).toBe(v);
    applyAuthorities(t, 'SomeAuthority', null);
    expect(t.renouncedMint).toBe(false);
    expect(t.renouncedFreeze).toBe(true);
    expect(t.version).toBe(v + 1);
  });
});
