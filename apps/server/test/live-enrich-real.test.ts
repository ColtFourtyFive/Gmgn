// Live enrichment against real mainnet captures (test/fixtures/rpc/real, jupiter/price-v3.json,
// ipfs/pump-metadata.json; recorded by scripts/sol-wallets-verify.ts's checks in October 2026):
// Token-2022 metadata extension and Metaplex decoding, Jupiter Price v3 (shape, chunks that fail
// independently), IPFS gateways (retired public gateways replaced, images moved to the
// configured gateway) and the on-demand lookup of a pump.fun token that predates PumpSwap.

import { PublicKey, type AccountInfo, type Connection, type ParsedAccountData } from '@solana/web3.js';
import { WSOL_MINT } from '@trenchscope/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_IPFS_GATEWAYS } from '../src/live/config';
import { RequestBudget } from '../src/live/enrich/budget';
import type { FetchFn, HostLookup } from '../src/live/enrich/http';
import { TokenLookup } from '../src/live/enrich/lookup';
import { fetchTokenMetadata, metadataUrls, sanitizeMetadata } from '../src/live/enrich/metadata';
import { decodeMetaplexMetadata, parseMintAccount } from '../src/live/enrich/onchain';
import { PriceTicker, fetchJupiterPrices } from '../src/live/enrich/prices';
import { ipfsPathOf, safeImageUrl } from '../src/live/enrich/sanitize';
import { World } from '../src/sim/world';
import { fixture } from './fixtures/rpc/fake-chain';

interface RpcAccount {
  owner: string;
  lamports: number;
  executable: boolean;
  space?: number;
  data: [string, 'base64'] | { program: string; parsed: unknown; space: number };
}

/** An RPC account as web3.js hands it over (owner a PublicKey, base64 data a Buffer). */
function web3Account(a: RpcAccount | null): AccountInfo<Buffer | ParsedAccountData> | null {
  if (!a) return null;
  const data = Array.isArray(a.data) ? Buffer.from(a.data[0], 'base64') : (a.data as ParsedAccountData);
  return { owner: new PublicKey(a.owner), lamports: a.lamports, executable: a.executable, rentEpoch: 0, data };
}

const mints = fixture<Record<string, { address: string; account: RpcAccount } & Record<string, { address: string; account: RpcAccount | null }>>>('rpc/real/mints.json');
const GATEWAYS = DEFAULT_IPFS_GATEWAYS.split(',');
const publicDns: HostLookup = async () => ['93.184.216.34'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('on-chain metadata decoding (real accounts)', () => {
  it('reads a pump.fun Token-2022 mint: metadata extension, renounced authorities, 6 decimals, 1B supply', () => {
    const info = parseMintAccount(web3Account(mints.pumpToken2022.account));
    expect(info).toEqual({
      decimals: 6,
      supply: 1_000_000_000,
      mintAuthority: null,
      freezeAuthority: null,
      meta: { name: 'Holdgiving', symbol: 'Holdgiving', uri: 'https://ipfs.io/ipfs/bafkreih4ki5a3efnn2lf3emqwwjqeptjzm6ne6jzlgbzatglxlux2dlpj4', updateAuthority: null },
    });
  });

  it('decodes a Metaplex metadata account (BONK) and its SPL mint', () => {
    expect(decodeMetaplexMetadata(web3Account(mints.bonkMetaplexMetadata.account)!.data as Buffer)).toEqual({
      name: 'Bonk',
      symbol: 'Bonk',
      uri: 'https://arweave.net/QPC6FYdUn-3V8ytFNuoCS85S2tHAuiDblh6u3CIZLsw',
      updateAuthority: '9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw',
    });
    expect(parseMintAccount(web3Account(mints.bonkSpl.account))).toMatchObject({ decimals: 5, mintAuthority: null, freezeAuthority: null, meta: null });
  });
});

describe('Jupiter Price API v3 (real response)', () => {
  const real = fixture<{ request: string[]; response: Record<string, unknown> }>('jupiter/price-v3.json');

  it('reads usdPrice / decimals / liquidity / priceChange24h; unpriced ids are absent; extra fields pass', async () => {
    const prices = await fetchJupiterPrices(real.request, { baseUrl: 'https://lite-api.jup.ag', fetch: (async () => json(real.response)) as FetchFn });
    expect([...prices.keys()].sort()).toEqual(Object.keys(real.response).sort());
    expect(prices.has('11111111111111111111111111111111')).toBe(false);
    const sol = prices.get(WSOL_MINT)!;
    expect(sol.decimals).toBe(9);
    expect(sol.usdPrice).toBeGreaterThan(1);
    expect(prices.get('HLoBR4vGmDBforxxTGn6SaBe5BD82cXJmg9FCShYpump')).toMatchObject({ decimals: 6, liquidity: expect.any(Number), priceChange24h: expect.any(Number) });
  });

  it('a failing chunk does not cost the others their prices; a 429 stops the rest; all failing throws', async () => {
    const ids = [WSOL_MINT, ...Array.from({ length: 119 }, (_, i) => `Mint${String(i).padStart(4, '0')}`)];
    const answer = (url: string) => Object.fromEntries(new URL(url).searchParams.get('ids')!.split(',').map((id) => [id, { usdPrice: id === WSOL_MINT ? 187 : 0.01 }]));
    const run = async (chunk2: number) => {
      const asked: number[] = [];
      const f = (async (input: string | URL | Request) => {
        const url = String(input);
        const n = new URL(url).searchParams.get('ids')!.split(',')[0] === WSOL_MINT ? 1 : asked.length + 1;
        asked.push(n);
        return n === 2 ? new Response('busy', { status: chunk2 }) : json(answer(url));
      }) as FetchFn;
      return { prices: await fetchJupiterPrices(ids, { baseUrl: 'https://lite-api.jup.ag', fetch: f }), asked };
    };
    const a = await run(500);
    expect(a.asked).toEqual([1, 2, 3]);
    expect(a.prices.get(WSOL_MINT)?.usdPrice).toBe(187);
    expect(a.prices.size).toBe(50 + 20); // chunks 1 and 3
    const b = await run(429);
    expect(b.asked).toEqual([1, 2]);
    expect(b.prices.size).toBe(50);
    await expect(fetchJupiterPrices(ids, { baseUrl: 'https://lite-api.jup.ag', fetch: (async () => new Response('down', { status: 503 })) as FetchFn })).rejects.toThrow(/http 503/);

    // the ticker keeps SOL/USD fresh through a partial failure
    let usd = 0;
    const ticker = new PriceTicker({ baseUrl: 'https://lite-api.jup.ag', fetch: (async (input: string | URL | Request) => (String(input).includes(WSOL_MINT) ? json(answer(String(input))) : new Response('busy', { status: 429 }))) as FetchFn, extraIds: () => ids.slice(1), onNativeUsd: (v) => (usd = v) });
    await ticker.tick();
    expect(usd).toBe(187);
  });
});

describe('IPFS gateways (real pump.fun metadata)', () => {
  const real = fixture<{ uri: string; contentType: string; json: Record<string, unknown> }>('ipfs/pump-metadata.json');
  const imageCid = 'bafybeihkwbffktou5ieivkg4r3s6bulv6ee545mj22blyvdm4hz4j63kwq';

  it('defaults to gateways that still serve: no retired host (ipfs.io, dweb.link, cloudflare-ipfs.com, cf-ipfs.com)', () => {
    expect(GATEWAYS).toEqual(['https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/']);
    for (const g of GATEWAYS) expect(g).not.toMatch(/ipfs\.io|dweb\.link|cloudflare-ipfs|cf-ipfs|w3s\.link|nftstorage\.link/);
  });

  it('tries a pump.fun https://ipfs.io/ipfs/<cid> URI on the configured gateways first, its own host last', () => {
    const cid = real.uri.split('/ipfs/')[1];
    expect(metadataUrls(real.uri, GATEWAYS)).toEqual([`https://ipfs.filebase.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`, real.uri]);
    // subdomain-style gateway links too
    expect(metadataUrls(`https://${cid}.ipfs.dweb.link/`, GATEWAYS)).toEqual([`https://ipfs.filebase.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`, `https://${cid}.ipfs.dweb.link/`]);
    expect(ipfsPathOf(new URL(`https://${imageCid}.ipfs.w3s.link/logo.png`))).toBe(`${imageCid}/logo.png`);
    expect(ipfsPathOf(new URL('https://metadata.j7tracker.io/metadata/e71e5ef85a524d2e.json'))).toBeNull();
  });

  it('serves the image from the first configured gateway (ipfs.io answers browsers with a challenge and CORP same-origin)', () => {
    expect(real.json.image).toBe(`https://ipfs.io/ipfs/${imageCid}`);
    const meta = sanitizeMetadata(real.json, GATEWAYS);
    expect(meta.imageUrl).toBe(`https://ipfs.filebase.io/ipfs/${imageCid}`);
    expect(meta.socials).toEqual({ twitter: 'https://x.com/vanishpad', website: 'https://vanishpad.xyz/' });
    // already on a configured gateway, or not IPFS at all: left alone
    expect(safeImageUrl(`https://gateway.pinata.cloud/ipfs/${imageCid}`, GATEWAYS)).toBe(`https://gateway.pinata.cloud/ipfs/${imageCid}`);
    expect(safeImageUrl('https://axiomtrading-v2.axiom-cdn.io/BUcKV2DN9e8C6HVCvgfkXcVmSydiHNmVKwbDhioHpump.webp', GATEWAYS)).toBe('https://axiomtrading-v2.axiom-cdn.io/BUcKV2DN9e8C6HVCvgfkXcVmSydiHNmVKwbDhioHpump.webp');
    // no gateway configured: kept as written
    expect(safeImageUrl(`https://ipfs.io/ipfs/${imageCid}`, [])).toBe(`https://ipfs.io/ipfs/${imageCid}`);
  });

  it('fetches the metadata from the first gateway that answers (the retired host is not asked first)', async () => {
    const asked: string[] = [];
    const f = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      if (url.startsWith('https://ipfs.io/')) return new Response('This IPFS gateway is switching to a service worker gateway only.', { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      if (url.startsWith('https://ipfs.filebase.io/')) return new Response('', { status: 504 });
      return new Response(JSON.stringify(real.json), { headers: { 'content-type': real.contentType } });
    }) as FetchFn;
    const meta = await fetchTokenMetadata(real.uri, { gateways: GATEWAYS, fetch: f, lookup: publicDns });
    expect(meta.description).toMatch(/^Launch from a wallet that never existed/);
    expect(asked.map((u) => new URL(u).host)).toEqual(['ipfs.filebase.io', 'gateway.pinata.cloud']);
  });
});

describe('on-demand lookup of a pump.fun token that predates PumpSwap (real Fartcoin accounts)', () => {
  const f = mints.fartcoinPrePumpSwap as unknown as Record<'mint' | 'metadata' | 'curve' | 'pumpSwapPool', { address: string; account: RpcAccount | null }>;
  const accounts = new Map(Object.values(f).map((a) => [a.address, web3Account(a.account)]));
  const conn = {
    getMultipleParsedAccounts: async (keys: PublicKey[]) => ({ context: { slot: 1 }, value: keys.map((k) => accounts.get(k.toBase58()) ?? null) }),
    getAccountInfo: async (k: PublicKey) => {
      const a = accounts.get(k.toBase58());
      return a && Buffer.isBuffer(a.data) ? a : null;
    },
    getSignaturesForAddress: async () => [],
  } as unknown as Connection;
  const lookup = (price: number | null) => {
    const world = new World('enrich-real', 1_792_530_000_000);
    world.setNativeUsd('sol', 106.6);
    const fetchFn = (async () => json(price === null ? {} : { [f.mint.address]: { usdPrice: price, liquidity: 4_000_000, decimals: 6 } })) as FetchFn;
    return { world, tokens: new TokenLookup({ world, connection: () => conn, budget: new RequestBudget({ rps: 1000 }), jupiter: { baseUrl: 'https://lite-api.jup.ag', fetch: fetchFn } }) };
  };

  it('a completed curve with no PumpSwap pool that Jupiter prices is a migrated pump token, not "migrating" forever', async () => {
    expect(f.pumpSwapPool.account).toBeNull();
    const { world, tokens } = lookup(0.21);
    const t = (await tokens.ensure(f.mint.address))!;
    expect(t).toMatchObject({ symbol: 'Fartcoin', launchpad: 'pump', status: 'migrated', decimals: 6 });
    // the old curve has no creator (default key): the metadata's update authority stands in
    expect(t.creator).toBe('TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM');
    expect(t.pool).toMatchObject({ dex: 'DEX' });
    expect(world.priceUsd(t)).toBeCloseTo(0.21, 6);
  });

  it('without a price (just completed, not migrated yet) it stays "migrating"', async () => {
    const { tokens } = lookup(null);
    const t = (await tokens.ensure(f.mint.address))!;
    expect(t.status).toBe('migrating');
    expect(t.creator).toBe('TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM');
  });
});
