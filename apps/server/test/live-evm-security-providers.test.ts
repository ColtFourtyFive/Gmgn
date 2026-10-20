// EVM token security, third-party providers: parsing of recorded GoPlus,
// honeypot.is, Blockscout and Sourcify answers (2026-10), including rate-limit
// codes, "not found" answers and Cloudflare challenges. Unknown stays absent.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBlockscoutAddress, parseBlockscoutHolders, parseSourcify } from '../src/live/evm/security/explorer';
import { parseGoPlus } from '../src/live/evm/security/goplus';
import { parseHoneypotIs } from '../src/live/evm/security/honeypotis';
import { getJson, isCloudflareChallenge, ProviderError, type FetchLike } from '../src/live/evm/security/http';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/evm/security/providers/${name}`, import.meta.url), 'utf8'));

describe('GoPlus token_security', () => {
  it('parses a trust-listed proxy stablecoin (Base USDC): taxes 0, proxy, owner, holders with contract flags', () => {
    const r = parseGoPlus(fixture('goplus-base-usdc.json'), '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')!;
    expect(r.facts).toMatchObject({ isOpenSource: true, isHoneypot: false, buyTax: 0, sellTax: 0, proxy: true, cannotBuy: false, isRenounced: false });
    // fields GoPlus omits for trust-listed tokens stay unknown
    expect(r.facts.mintable).toBeUndefined();
    expect(r.facts.transferTax).toBeUndefined(); // "" = unknown
    expect(r.owner).toBe('0x4fc7850364958d97B4d3f5A08f79db2493f8cA44');
    expect(r.holders).toHaveLength(10);
    expect(r.holders![0]).toMatchObject({ kind: 'contract', share: 0.057835287227030885 });
    expect(r.holders![1].kind).toBe('eoa');
    expect(r.holderCount).toBe(11232645);
    expect(r.notes).toContain('GoPlus trust list');
  });

  it('keeps empty taxes unknown for a token not yet in a DEX (Robinhood Pons V2 token)', () => {
    const r = parseGoPlus(fixture('goplus-robinhood-pons-hust.json'), '0xf6a78f0fa7675f77e37aa8c57b70307acfe8ae4a')!;
    expect(r.facts.buyTax).toBeUndefined();
    expect(r.facts.sellTax).toBeUndefined();
    expect(r.facts).toMatchObject({ isOpenSource: true, isHoneypot: false, mintable: false, blacklist: false, selfDestruct: false });
    expect(r.owner).toBeUndefined(); // owner_address absent = unknown
    expect(r.facts.isRenounced).toBeUndefined();
    expect(r.creator?.address).toBe('0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42');
  });

  it('parses a Flap tax token on Robinhood Chain: 1% taxes, launchpad name, LP lock tags', () => {
    const r = parseGoPlus(fixture('goplus-robinhood-flap-kek.json'), '0x86e5d8818eff06f0dea9e5eca87f056bc44c7777')!;
    expect(r.facts).toMatchObject({ buyTax: 0.01, sellTax: 0.01, transferTax: 0, isRenounced: true, isHoneypot: false });
    expect(r.launchpadName).toBe('Flap');
    expect(r.owner).toBe('0x0000000000000000000000000000000000000000');
  });

  it('parses four.meme launchpad metadata (BNB Chain)', () => {
    const r = parseGoPlus(fixture('goplus-bsc-fourmeme-daisy.json'), '0xd64ed896062e93bd26b2506dc3e95765c86c4444')!;
    expect(r.launchpadName).toBe('four.meme');
    expect(r.facts.isRenounced).toBe(true);
  });

  it('turns code 4029 (HTTP 200) into a rate-limit error and other codes into errors', () => {
    const limited = { code: 4029, message: 'too many requests' };
    expect(() => parseGoPlus(limited, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')).toThrowError(ProviderError);
    try {
      parseGoPlus(limited, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    } catch (e) {
      expect((e as ProviderError).outcome).toBe('rate_limited');
    }
    try {
      parseGoPlus({ code: 2004, message: 'bad parameter' }, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    } catch (e) {
      expect((e as ProviderError).outcome).toBe('error');
    }
    expect(parseGoPlus({ code: 1, message: 'OK', result: {} }, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')).toBeNull();
  });
});

describe('honeypot.is v2', () => {
  it('parses a clean simulation (Base DEGEN)', () => {
    const r = parseHoneypotIs(200, fixture('honeypotis-base-degen.json'))!;
    expect(r.facts).toMatchObject({ isHoneypot: false, buyTax: 0, sellTax: 0, transferTax: 0, isOpenSource: true, proxy: false });
    expect(r.pools?.[0].id).toBe('0xc9034c3E7F58003E6ae0C8438e7c8f4598d5ACAA');
  });

  it('parses percent taxes and the honeypot verdict (Ethereum KERC: 5% buy / 76.57% sell)', () => {
    const r = parseHoneypotIs(200, fixture('honeypotis-eth-kerc.json'))!;
    expect(r.facts.buyTax).toBe(0.05);
    expect(r.facts.sellTax).toBeCloseTo(0.7657, 6);
    expect(r.facts.isHoneypot).toBe(true);
    expect(r.facts.isOpenSource).toBe(false);
    expect(r.notes?.some((n) => n.includes('41/41 sampled holders can sell'))).toBe(true);
  });

  it('treats "pair not found" as no data and an invalid chain as unsupported', () => {
    expect(parseHoneypotIs(404, { code: 404, error: 'pair not found' })).toBeNull();
    try {
      parseHoneypotIs(400, { code: 400, error: 'Invalid chain' });
      expect.unreachable();
    } catch (e) {
      expect((e as ProviderError).outcome).toBe('unsupported');
    }
  });

  it('leaves taxes unknown when the simulation did not run', () => {
    const r = parseHoneypotIs(200, { simulationSuccess: false, honeypotResult: {}, contractCode: { openSource: true } })!;
    expect(r.facts.buyTax).toBeUndefined();
    expect(r.facts.isHoneypot).toBeUndefined();
    expect(r.facts.isOpenSource).toBe(true);
  });
});

describe('explorers', () => {
  it('parses Blockscout address info (Ethereum USDC: verified EIP-1967 proxy, creator)', () => {
    const b = parseBlockscoutAddress(fixture('blockscout-eth-usdc-address.json'));
    expect(b).toMatchObject({ isContract: true, isVerified: true, creator: '0x95Ba4cF87D6723ad9C0Db21737D862bE80e93911', proxyType: 'eip1967_oz' });
    expect(b.implementations).toEqual(['0x43506849D7C04F9138D1A2050bbF3A0c054402dd']);
    expect(b.holderCount).toBeGreaterThan(1_000_000);
  });

  it('parses Blockscout holders with raw values', () => {
    const h = parseBlockscoutHolders({
      items: [
        { address: { hash: '0xF977814e90dA44bFA03b6295A0616a897441aceC', is_contract: false, name: null }, value: '1456830014084891533469641791413', token_id: null },
        { address: { hash: 'not-an-address' }, value: '1' },
      ],
      next_page_params: null,
    });
    expect(h).toEqual([{ address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', value: 1456830014084891533469641791413n, isContract: false, label: null }]);
  });

  it('Sourcify: a match is verified, a 404 is unknown (not "unverified")', () => {
    expect(parseSourcify(200, fixture('sourcify-base-degen.json'))).toBe(true);
    expect(parseSourcify(404, fixture('sourcify-robinhood-not-found.json'))).toBeNull();
  });

  it('detects a Cloudflare challenge in front of an explorer API', async () => {
    const challenge = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>';
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
    expect(isCloudflareChallenge(403, headers({ 'cf-mitigated': 'challenge' }), challenge)).toBe(true);
    expect(isCloudflareChallenge(403, headers({ 'content-type': 'text/html; charset=UTF-8' }), challenge)).toBe(true);
    expect(isCloudflareChallenge(404, headers({ 'content-type': 'application/json' }), '{"message":"Not found"}')).toBe(false);
    const fetchImpl: FetchLike = async () => ({ status: 403, headers: headers({ 'cf-mitigated': 'challenge', 'content-type': 'text/html' }), text: async () => challenge });
    await expect(getJson(fetchImpl, 'https://robinhoodchain.blockscout.com/api/v2/addresses/0x0', new AbortController().signal)).rejects.toMatchObject({ outcome: 'blocked' });
    const limited: FetchLike = async () => ({ status: 429, headers: headers({}), text: async () => 'slow down' });
    await expect(getJson(limited, 'https://x.test', new AbortController().signal)).rejects.toMatchObject({ outcome: 'rate_limited' });
  });
});
