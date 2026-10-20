// EVM token security, end to end on recorded mainnet traffic (2026-10): every
// JSON-RPC call (eth_getCode / eth_getStorageAt / eth_call incl. the round-trip
// probe with state overrides) and every HTTP answer (GoPlus, honeypot.is,
// Blockscout, Sourcify) replays from test/fixtures/evm/security/replay, so the
// checker's merge, launchpad recognition, simulation verdicts, caching and rate
// limiting are tested offline and deterministically.

import { describe, expect, it } from 'vitest';
import { EvmSecurityChecker, toTokenSecurityFlags, type EvmSecurityCheckerOptions } from '../src/live/evm/security';
import { loadRecording, replay, type Recording } from './fixtures/evm/security/replay';

function setup(name: string, opts: Partial<EvmSecurityCheckerOptions> = {}, override?: Parameters<typeof replay>[1]) {
  const rec: Recording = loadRecording(name);
  const r = replay(rec, override);
  const clock = { t: 1_800_000_000_000 };
  const checker = new EvmSecurityChecker({ clients: { [rec.chain]: r.client }, fetch: r.fetch, now: () => clock.t, ...opts });
  return { rec, r, clock, checker, check: (o?: Parameters<EvmSecurityChecker['check']>[2]) => checker.check(rec.chain as 'base', rec.token, o) };
}

const outcome = (report: { sources: { provider: string; detail?: string; outcome: string }[] }, provider: string, detail?: string) =>
  report.sources.find((s) => s.provider === provider && (detail === undefined || s.detail === detail))?.outcome;

describe('EvmSecurityChecker on recorded tokens', () => {
  it('Robinhood Chain Flap tax token: launchpad template, measured 1% taxes, burned LP, holder sells', async () => {
    const { r, check } = setup('robinhood-flap-kek-1-tax');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep).toMatchObject({ chain: 'robinhood', symbol: 'KEK', decimals: 18, isOpenSource: true, isRenounced: true, isHoneypot: false, buyTax: 0.01, sellTax: 0.01, transferTax: 0, ownerRole: 'renounced' });
    expect(rep.proxy).toMatchObject({ kind: 'minimal-clone', implementation: '0x7777C8743C88B3aff3cf262135beF2c8b2e83333' });
    expect(rep.flags.proxy).toBe(false); // an immutable clone is not a proxy risk
    expect(rep.launchpad).toMatchObject({ id: 'flap', template: 'tax', phase: 'graduated' });
    expect(rep.simulation?.venue).toBe('uniswap-v2');
    expect(rep.simulation?.holderSells.length).toBe(2);
    expect(rep.simulation?.holderSells.every((h) => h.ok)).toBe(true);
    expect(rep.lp).toMatchObject({ burnedShare: 1, provider: 'onchain' });
    expect(rep.holders?.some((h) => h.kind === 'pool')).toBe(true);
    expect(rep.holders?.some((h) => h.kind === 'burn')).toBe(true);
    expect(rep.creator.address).not.toBeNull();
    // honeypot.is has no Robinhood Chain; the explorer sits behind Cloudflare from the recording host
    expect(outcome(rep, 'honeypotis')).toBe('unsupported');
    expect(outcome(rep, 'explorer', 'blockscout')).toBe('blocked');
    expect(rep.coverage).toBeGreaterThanOrEqual(0.9);

    const m = toTokenSecurityFlags(rep);
    expect(m.fields).toEqual({ renouncedMint: null, renouncedFreeze: null, isOpenSource: true, isRenounced: true, isHoneypot: false, buyTax: 0.01, sellTax: 0.01 });
    expect(m.lpBurnedRate).toBe(1);
  });

  it('BNB Chain honeypot: the simulated sell reverts', async () => {
    const { r, check } = setup('bsc-agt-honeypot');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.isHoneypot).toBe(true);
    expect(rep.simulation?.isHoneypot).toBe(true);
    expect(rep.simulation?.sell?.ok).toBe(false);
    const hp = rep.disagreements.find((d) => d.field === 'isHoneypot');
    if (hp) expect(hp.chosen).toBe('simulation');
    expect(toTokenSecurityFlags(rep).checks.find((c) => c.key === 'evm_simulation')).toMatchObject({ value: 'Sell blocked', level: 'bad' });
  });

  it('four.meme token on the bonding curve: the launchpad owns it (renounced for the UI), template taxes', async () => {
    const { r, check } = setup('bsc-four-meme-daisy-curve');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.launchpad).toMatchObject({ id: 'four.meme', template: 'standard', phase: 'bonding-curve', evidence: 'TokenManager2._tokenInfos' });
    expect(rep.ownerRole).toBe('launchpad');
    expect(rep.owner).toBe('0x5c952063c7fc8610FFDB798152D69F0B9550762b');
    expect(rep.isRenounced).toBe(false); // strict: an owner exists
    expect(toTokenSecurityFlags(rep).fields.isRenounced).toBe(true); // ...but it is the launchpad, not the dev
    // GoPlus reports owner 0x0: the on-chain reading wins and the conflict is recorded
    expect(rep.disagreements.find((d) => d.field === 'isRenounced')).toMatchObject({ chosen: 'onchain' });
    expect(rep.buyTax).toBe(0);
    expect(rep.simulation).toBeNull(); // still on the curve: no V2/V3 pool
  });

  it('Clanker v4 token: admin limited to metadata, no V2/V3 pool to simulate', async () => {
    const { r, check } = setup('base-clanker-v4-padmemes');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.launchpad).toMatchObject({ id: 'clanker-v4' });
    expect(rep.ownerRole).toBe('metadata-only');
    expect(rep.flags.mintable).toBe(false);
    expect(rep.buyTax).toBe(0);
    expect(rep.simulation).toBeNull();
    expect(outcome(rep, 'simulation', 'round-trip')).toBe('not_found');
    // GoPlus lists the Clanker locker as a plain LP holder (100%): the template makes it a lock
    expect(rep.lp).toMatchObject({ lockedShare: 1, lockers: [{ name: 'Clanker LP locker', share: 1 }] });
    expect(toTokenSecurityFlags(rep).lpBurnedRate).toBe(1);
    expect(toTokenSecurityFlags(rep).fields.isRenounced).toBe(true);
  });

  it('Ethereum USDC: upgradeable proxy with mint / blacklist / pause, clean round trip', async () => {
    const { r, check } = setup('eth-usdc');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.flags).toMatchObject({ proxy: true, upgradeable: true, mintable: true, blacklist: true, pausable: true });
    expect(rep.isRenounced).toBe(false);
    expect(rep.ownerRole).toBe('privileged');
    expect(rep.isHoneypot).toBe(false);
    expect(rep.buyTax).toBe(0);
    expect(rep.privilegedFunctions).toContain('mint: mint(address,uint256)');
  });

  it('Ethereum high-tax token: effective sell tax from the simulation outranks honeypot.is / GoPlus', async () => {
    const { r, check } = setup('eth-kerc-high-sell-tax');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.isHoneypot).toBe(true);
    expect(rep.sellTax).toBeGreaterThanOrEqual(0.9);
    expect(rep.buyTax).toBeCloseTo(0.05, 3);
    const sell = rep.disagreements.find((d) => d.field === 'sellTax');
    expect(sell?.chosen).toBe('simulation');
    expect(sell?.values.map((v) => v.provider)).toContain('honeypotis');
  });

  it('a USDC-paired honeypot on Base: quote funded through the discovered balance slot', async () => {
    const { r, check } = setup('base-mag-usdc-pair-buys-only');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.simulation?.pool.quote).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(rep.simulation?.buy.ok).toBe(true);
    expect(rep.simulation?.sell?.reason).toContain('ERC20InsufficientBalance');
    expect(rep.isHoneypot).toBe(true);
  });

  it('pools.trade token on Robinhood Chain: UERC20 CREATE2 address verified against the factory', async () => {
    const { r, check } = setup('robinhood-pools-trade-mitsu');
    const rep = await check();
    expect(r.misses).toEqual([]);
    expect(rep.launchpad).toMatchObject({ id: 'pools.trade', evidence: 'factory.getUERC20Address' });
    expect(rep.ownerRole).toBe('none');
    expect(rep.isRenounced).toBe(true);
    expect(rep.flags).toMatchObject({ mintable: false, blacklist: false, pausable: false, taxModifiable: false });
  });
});

describe('caching, dedupe, rate limits and unknowns', () => {
  it('serves the cached report for 10 minutes, then checks again', async () => {
    const { r, clock, check } = setup('robinhood-flap-kek-1-tax');
    const a = await check();
    const calls = r.calls.rpc;
    expect(await check()).toBe(a);
    expect(r.calls.rpc).toBe(calls);
    clock.t += 10 * 60_000 - 1;
    expect(await check()).toBe(a);
    clock.t += 2;
    const b = await check();
    expect(b).not.toBe(a);
    expect(r.calls.rpc).toBeGreaterThan(calls);
  });

  it('caches tokens younger than an hour for 1 minute only', async () => {
    const { clock, check } = setup('robinhood-flap-kek-1-tax');
    const a = await check({ createdAt: clock.t - 10 * 60_000 });
    clock.t += 59_000;
    expect(await check({ createdAt: clock.t - 10 * 60_000 })).toBe(a);
    clock.t += 2000;
    expect(await check()).not.toBe(a);
  });

  it('deduplicates concurrent checks of the same token', async () => {
    const one = setup('robinhood-flap-kek-1-tax');
    await one.check();
    const single = one.r.calls.rpc;
    const two = setup('robinhood-flap-kek-1-tax');
    const [a, b] = await Promise.all([two.check(), two.check()]);
    expect(a).toBe(b);
    expect(two.r.calls.rpc).toBe(single);
  });

  it('GoPlus code 4029: recorded as rate limited, backed off, and the report cached briefly', async () => {
    let goplusHits = 0;
    const s = setup('robinhood-flap-kek-1-tax', {}, {
      http: (url) => {
        if (!url.includes('gopluslabs')) return undefined;
        goplusHits++;
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"code":4029,"message":"too many requests"}' };
      },
    });
    const a = await s.check();
    expect(outcome(a, 'goplus')).toBe('rate_limited');
    expect(a.isHoneypot).toBe(false); // the simulation still answers
    expect(goplusHits).toBe(1);
    // A degraded report is cached for 1 minute, not 10. The first backoff (30 s) is over by then: GoPlus is asked again.
    s.clock.t += 61_000;
    const b = await s.check();
    expect(b).not.toBe(a);
    expect(goplusHits).toBe(2);
    // The second strike doubles the backoff to 60 s: a fresh check 30 s later does not call GoPlus at all.
    s.clock.t += 30_000;
    const c = await s.check({ fresh: true });
    expect(goplusHits).toBe(2);
    expect(c.sources.find((x) => x.provider === 'goplus')).toMatchObject({ outcome: 'rate_limited', error: 'backing off 30 s' });
  });

  it('reports unknown as null when every provider fails', async () => {
    const checker = new EvmSecurityChecker({
      clients: {
        base: {
          request: (async () => {
            throw new Error('rpc down');
          }) as never,
        },
      },
      fetch: async () => {
        throw new Error('network down');
      },
    });
    const rep = await checker.check('base', '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed');
    expect(rep).toMatchObject({ isOpenSource: null, isRenounced: null, isHoneypot: null, buyTax: null, sellTax: null, transferTax: null, ownerRole: null, simulation: null, holders: null, coverage: 0 });
    expect(Object.values(rep.flags).every((v) => v === null)).toBe(true);
    expect(rep.sources.filter((s) => s.outcome === 'error').length).toBeGreaterThan(0);
    const m = toTokenSecurityFlags(rep);
    expect(m.taxKnown).toEqual({ buy: false, sell: false });
    expect(m.fields.isHoneypot).toBeNull();
  });

  it('rejects non-EVM chains and chains without a client', async () => {
    const checker = new EvmSecurityChecker({ clients: {} });
    await expect(checker.check('sol', 'So11111111111111111111111111111111111111112')).rejects.toThrow('not an EVM chain');
    await expect(checker.check('base', '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed')).rejects.toThrow('no RPC client');
  });
});
