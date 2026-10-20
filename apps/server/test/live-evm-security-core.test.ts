// EVM token security, offline core: bytecode analysis and the selector catalogue,
// round-trip tax math and verdicts, provider merging / disagreements, coverage,
// the TokenState mapping, and the cache / rate-limit primitives.

import { describe, expect, it } from 'vitest';
import { encodeErrorResult, parseAbi, toFunctionSelector, type Hex } from 'viem';
import { analyzeBytecode, codeLength, detectMinimalProxy, findCapabilities, selectorOf } from '../src/live/evm/security/bytecode';
import { toTokenSecurityFlags } from '../src/live/evm/security/flags';
import { RateLimiter, Semaphore, TtlCache, withTimeout } from '../src/live/evm/security/limits';
import { coverageOf, mergeFacts, type ProviderReport } from '../src/live/evm/security/merge';
import { roundTripProbeAbi } from '../src/live/evm/security/probe/abi';
import { CODE_SIZE_READER_RUNTIME, ROUND_TRIP_PROBE_RUNTIME } from '../src/live/evm/security/probe/bytecode';
import { decodeRevert, interpretOutcome, lossRatio, rankPools } from '../src/live/evm/security/simulate';
import type { EvmSecurityReport, PoolRef } from '../src/live/evm/security/types';

// ---------------------------------------------------------------------------
// Bytecode
// ---------------------------------------------------------------------------

/** Tiny dispatcher: `PUSH1 0 CALLDATALOAD PUSH1 0xe0 SHR DUP1 PUSH4 <sel> EQ PUSH2 <dest> JUMPI ... STOP`. */
function dispatcher(sels: string[], tail = ''): Hex {
  let code = '60003560e01c';
  for (const s of sels) code += `80${'63'}${s.slice(2)}14610100` + '57';
  code += '00'; // STOP
  return `0x${code}${tail}` as Hex;
}

describe('bytecode analysis', () => {
  it('computes selectors with viem (well-known values)', () => {
    expect(selectorOf('transfer(address,uint256)')).toBe('0xa9059cbb');
    expect(selectorOf('owner()')).toBe('0x8da5cb5b');
    expect(selectorOf('mint(address,uint256)')).toBe('0x40c10f19');
    expect(selectorOf('balanceOf(address)')).toBe('0x70a08231');
  });

  it('reads PUSH4 EQ dispatcher selectors and maps them to capabilities', () => {
    const sels = ['transfer(address,uint256)', 'balanceOf(address)', 'totalSupply()', 'mint(address,uint256)', 'addBots(address[])', 'setFees(uint256,uint256)', 'pause()'].map(selectorOf);
    const a = analyzeBytecode(dispatcher(sels));
    expect([...a.selectors].sort()).toEqual([...sels].sort());
    const caps = new Set(findCapabilities(a.selectors).map((c) => c.capability));
    expect(caps).toEqual(new Set(['mint', 'blacklist', 'setTax', 'pause']));
  });

  it('reads via-IR (`PUSH4 sel DUP2 EQ`) and binary-search pivots (`PUSH4 sel GT`)', () => {
    const sel = selectorOf('setMaxWallet(uint256)').slice(2);
    const pivot = selectorOf('blacklist(address)').slice(2);
    const a = analyzeBytecode(`0x63${sel}811461010057 80 63${pivot}11610200 57 00`.replace(/ /g, '') as Hex);
    expect(a.selectors.has(`0x${sel}`)).toBe(true);
    expect(a.selectors.has(`0x${pivot}`)).toBe(true);
  });

  it('ignores opcodes in unreachable data and in the CBOR metadata', () => {
    // SELFDESTRUCT (ff) and DELEGATECALL (f4) bytes after STOP without a JUMPDEST are data.
    const data = analyzeBytecode('0x6001600201 00 fff4f1 00'.replace(/ /g, '') as Hex);
    expect(data.opcodes).toMatchObject({ selfdestruct: false, delegatecall: false, call: false });
    // ... reachable again at a JUMPDEST some PUSH targets (PUSH1 4 JUMP STOP JUMPDEST SELFDESTRUCT)
    expect(analyzeBytecode('0x600456005bff').opcodes.selfdestruct).toBe(true);
    // ... but not at a stray 0x5b inside appended data that nothing jumps to
    expect(analyzeBytecode('0x6003565b00 fe 5b ff'.replace(/ /g, '') as Hex).opcodes.selfdestruct).toBe(false);
    // PUSH data is skipped: 0x7fff... is PUSH32 of 0xff bytes
    expect(analyzeBytecode(`0x7f${'ff'.repeat(32)}00`).opcodes.selfdestruct).toBe(false);
    // Solidity CBOR metadata: a2 64 'ipfs' 58 22 <34 bytes> 64 'solc' 43 <3 bytes> 0033
    const meta = `a264697066735822${'ff'.repeat(34)}64736f6c6343${'080d1a'}0033`;
    const bytes = Uint8Array.from(Buffer.from(`5b00${meta}`, 'hex'));
    expect(codeLength(bytes)).toBe(2);
    expect(analyzeBytecode(`0x5b00${meta}`).opcodes.selfdestruct).toBe(false);
  });

  it('detects minimal proxies (EIP-1167, Solady, generic) and their implementation', () => {
    const impl = '7777c8743c88b3aff3cf262135bef2c8b2e83333';
    expect(detectMinimalProxy(`0x363d3d373d3d3d363d73${impl}5af43d82803e903d91602b57fd5bf3`)).toEqual({ kind: 'eip1167', implementation: '0x7777C8743C88B3aff3cf262135beF2c8b2e83333' });
    expect(detectMinimalProxy(`0x3d3d3d3d363d3d37363d73${impl}5af43d3d93803e602a57fd5bf3`)?.kind).toBe('solady');
    // PUSH16 vanity-compressed clone
    expect(detectMinimalProxy(`0x363d3d373d3d3d363d6f${impl.slice(8)}5af43d82803e903d91602b57fd5bf3`)?.kind).toBe('generic');
    expect(detectMinimalProxy(dispatcher([selectorOf('transfer(address,uint256)')]))).toBeNull();
    expect(analyzeBytecode(`0x363d3d373d3d3d363d73${impl}5af43d82803e903d91602b57fd5bf3`).minimalProxy?.kind).toBe('eip1167');
  });

  it('keeps probe/abi.ts in sync with the compiled probe (every function selector is dispatched)', () => {
    const probe = analyzeBytecode(ROUND_TRIP_PROBE_RUNTIME);
    for (const item of roundTripProbeAbi) {
      if (item.type !== 'function') continue;
      const sig = `${item.name}(${item.inputs.map((i) => (i.type === 'tuple' ? `(${(i as unknown as { components: readonly { type: string }[] }).components.map((c) => c.type).join(',')})` : i.type)).join(',')})`;
      expect(probe.selectors.has(toFunctionSelector(`function ${sig}`)), sig).toBe(true);
    }
    expect(analyzeBytecode(CODE_SIZE_READER_RUNTIME).selectors.has(selectorOf('codeSizes(address[])'))).toBe(true);
    // compiled for EVM paris: no PUSH0 (0x5f) opcode anywhere in reachable code is required by older chains
    expect(probe.size).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Round trip math and verdicts
// ---------------------------------------------------------------------------

const POOL: PoolRef = { venue: 'uniswap-v2', address: '0x00000000000000000000000000000000000000aa', token: '0x00000000000000000000000000000000000000bb', quote: '0x00000000000000000000000000000000000000cc', quoteReserve: 10n ** 21n, fee: 3000, extra: { kind: 0, feeBps: 30 } };
const ok = (expected: bigint, actual: bigint, gas = 100_000n) => ({ ok: true, expected, actual, gasUsed: gas, err: '0x' as Hex });
const fail = (err: Hex, gas = 50_000n) => ({ ok: false, expected: 0n, actual: 0n, gasUsed: gas, err });
const skipped = { ok: false, expected: 0n, actual: 0n, gasUsed: 0n, err: '0x' as Hex };
const errAbi = parseAbi(['error Error(string)', 'error TransferFailed(bytes reason)', 'error FeeOnTransfer(uint256 debited, uint256 received)']);

describe('round-trip interpretation', () => {
  it('computes loss ratios to 4 decimals and clamps', () => {
    expect(lossRatio(1000n, 990n)).toBe(0.01);
    expect(lossRatio(1000n, 1000n)).toBe(0);
    expect(lossRatio(1000n, 1100n)).toBe(0); // reflections can over-deliver
    expect(lossRatio(1000n, 0n)).toBe(1);
    expect(lossRatio(0n, 0n)).toBeNull();
    expect(lossRatio(145508643364295116368031n, 144053556930652165204351n)).toBe(0.01); // measured Flap 1% buy (Robinhood)
  });

  it('a clean round trip is not a honeypot, with zero taxes', () => {
    const r = interpretOutcome(POOL, 10n ** 18n, { buy: ok(1000n, 1000n), xfer: ok(100n, 100n), sell: ok(900n, 900n), quoteOut: 5000n, expectedQuoteOut: 5000n });
    expect(r).toMatchObject({ isHoneypot: false, cannotBuy: false, buyTax: 0, sellTax: 0, transferTax: 0, tokenSellTax: 0, effectiveSellTax: 0 });
  });

  it('reports the effective sell tax (quote level) over the token-level loss', () => {
    // KERC-like: 10% token tax, but the contract dumps its tax tokens first: 76.57% less quote than quoted.
    const r = interpretOutcome(POOL, 10n ** 18n, { buy: ok(1000n, 950n), xfer: ok(95n, 95n), sell: ok(855n, 769n), quoteOut: 2343n, expectedQuoteOut: 10_000n });
    expect(r.buyTax).toBe(0.05);
    expect(r.tokenSellTax).toBeCloseTo(0.1006, 4);
    expect(r.effectiveSellTax).toBe(0.7657);
    expect(r.sellTax).toBe(0.7657);
    expect(r.isHoneypot).toBe(false);
    const extreme = interpretOutcome(POOL, 10n ** 18n, { buy: ok(1000n, 1000n), xfer: skipped, sell: ok(1000n, 1000n), quoteOut: 50n, expectedQuoteOut: 1000n });
    expect(extreme.isHoneypot).toBe(true); // selling returns 5% of the quote
  });

  it('a reverting sell is a honeypot; a reverting buy is "cannot buy" (not a honeypot verdict)', () => {
    const panic = encodeErrorResult({ abi: errAbi, errorName: 'TransferFailed', args: ['0x4e487b710000000000000000000000000000000000000000000000000000000000000011'] });
    const hp = interpretOutcome(POOL, 1n, { buy: ok(1000n, 760n), xfer: ok(100n, 0n), sell: fail(panic), quoteOut: 0n, expectedQuoteOut: 900n });
    expect(hp.isHoneypot).toBe(true);
    expect(hp.sell?.reason).toBe('panic 0x11');
    expect(hp.transferTax).toBe(1);
    const closed = interpretOutcome(POOL, 1n, { buy: fail(encodeErrorResult({ abi: errAbi, errorName: 'Error', args: ['Trading not open'] })), xfer: skipped, sell: skipped, quoteOut: 0n, expectedQuoteOut: 0n });
    expect(closed).toMatchObject({ isHoneypot: null, cannotBuy: true, buyTax: null, sellTax: null });
    expect(closed.notes[0]).toContain('Trading not open');
  });

  it('a fee-on-transfer sell rejected by a V3 pool is inconclusive but yields the token-level tax', () => {
    const fot = encodeErrorResult({ abi: errAbi, errorName: 'FeeOnTransfer', args: [1000n, 950n] });
    const r = interpretOutcome({ ...POOL, venue: 'uniswap-v3', extra: { kind: 1, feeBps: 0 } }, 1n, { buy: ok(1000n, 1000n), xfer: skipped, sell: { ok: false, expected: 1000n, actual: 950n, gasUsed: 90_000n, err: fot }, quoteOut: 0n, expectedQuoteOut: 800n });
    expect(r.isHoneypot).toBeNull();
    expect(r.sellTax).toBe(0.05);
    expect(r.effectiveSellTax).toBeNull();
  });

  it('a buy that delivers nothing is a honeypot', () => {
    expect(interpretOutcome(POOL, 1n, { buy: ok(1000n, 0n), xfer: skipped, sell: skipped, quoteOut: 0n, expectedQuoteOut: 0n }).isHoneypot).toBe(true);
  });

  it('decodes revert reasons', () => {
    expect(decodeRevert(encodeErrorResult({ abi: errAbi, errorName: 'Error', args: ['TRANSFER_FAILED'] }))).toBe('TRANSFER_FAILED');
    expect(decodeRevert('0x')).toBe('reverted without reason');
    expect(decodeRevert('0x12345678')).toBe('custom error 0x12345678');
  });

  it('ranks wrapped-native pools first, then by quote reserve', () => {
    const weth = '0x4200000000000000000000000000000000000006';
    const a = { ...POOL, address: '0x01' as Hex, quote: weth, quoteReserve: 5n } as PoolRef;
    const b = { ...POOL, address: '0x02' as Hex, quote: weth, quoteReserve: 9n } as PoolRef;
    const c = { ...POOL, address: '0x03' as Hex, quoteReserve: 10n ** 30n } as PoolRef;
    expect(rankPools('base', [a, c, b]).map((p) => p.address)).toEqual(['0x02', '0x01', '0x03']);
  });
});

// ---------------------------------------------------------------------------
// Merge, coverage, mapping
// ---------------------------------------------------------------------------

describe('merging providers', () => {
  const sim: ProviderReport = { provider: 'simulation', facts: { isHoneypot: false, buyTax: 0.01, sellTax: 0.01 } };
  const onchain: ProviderReport = { provider: 'onchain', facts: { mintable: false, proxy: false, isRenounced: true } };
  const gp: ProviderReport = { provider: 'goplus', facts: { isHoneypot: false, buyTax: 0.015, sellTax: 0.1, mintable: true, isOpenSource: true, hiddenOwner: false } };
  const hp: ProviderReport = { provider: 'honeypotis', facts: { sellTax: 0.7657, isHoneypot: true } };

  it('takes the most authoritative known value and keeps unknown as null', () => {
    const { values } = mergeFacts([gp, hp, onchain, sim]);
    expect(values.buyTax).toBe(0.01); // simulation
    expect(values.sellTax).toBe(0.01);
    expect(values.isHoneypot).toBe(false);
    expect(values.mintable).toBe(false); // onchain over goplus
    expect(values.isOpenSource).toBe(true); // only goplus knows
    expect(values.hiddenOwner).toBe(false);
    expect(values.transferTax).toBeNull();
    expect(values.blacklist).toBeNull();
  });

  it('records disagreements beyond the tax tolerance', () => {
    const { disagreements } = mergeFacts([gp, hp, onchain, sim]);
    const fields = disagreements.map((d) => d.field).sort();
    // buyTax 0.01 vs 0.015 is within 1pp: not a disagreement
    expect(fields).toEqual(['isHoneypot', 'mintable', 'sellTax']);
    const sell = disagreements.find((d) => d.field === 'sellTax')!;
    expect(sell.chosen).toBe('simulation');
    expect(sell.values).toEqual([
      { provider: 'simulation', value: 0.01 },
      { provider: 'honeypotis', value: 0.7657 },
      { provider: 'goplus', value: 0.1 },
    ]);
  });

  it('launchpad template facts outrank bytecode heuristics but not the simulation', () => {
    const lp: ProviderReport = { provider: 'launchpad', facts: { buyTax: 0.09, mintable: false } };
    const oc: ProviderReport = { provider: 'onchain', facts: { mintable: true } };
    expect(mergeFacts([oc, lp]).values.mintable).toBe(false);
    expect(mergeFacts([lp, { provider: 'simulation', facts: { buyTax: 0.0899 } }]).values.buyTax).toBe(0.0899);
  });
});

function report(over: Partial<EvmSecurityReport> = {}): EvmSecurityReport {
  const flags = {
    mintable: null,
    proxy: null,
    upgradeable: null,
    ownerCanChangeBalance: null,
    taxModifiable: null,
    personalTaxModifiable: null,
    blacklist: null,
    whitelist: null,
    pausable: null,
    antiWhale: null,
    antiWhaleModifiable: null,
    tradingCooldown: null,
    hiddenOwner: null,
    canTakeBackOwnership: null,
    selfDestruct: null,
    externalCall: null,
  };
  return {
    chain: 'base',
    token: '0x00000000000000000000000000000000000000bb',
    checkedAt: 0,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null,
    isOpenSource: null,
    isRenounced: null,
    isHoneypot: null,
    buyTax: null,
    sellTax: null,
    transferTax: null,
    cannotBuy: null,
    cannotSellAll: null,
    flags,
    owner: null,
    ownerRole: null,
    proxy: null,
    privilegedFunctions: [],
    lp: null,
    holders: null,
    holderCount: null,
    creator: { address: null, balance: null, share: null },
    launchpad: null,
    simulation: null,
    sources: [],
    disagreements: [],
    coverage: 0,
    notes: [],
    ...over,
  };
}

describe('coverage and TokenState mapping', () => {
  it('coverage counts known fields only', () => {
    expect(coverageOf(report())).toBe(0);
    const r = report({ isOpenSource: true, isRenounced: false, isHoneypot: false, buyTax: 0, sellTax: 0, creator: { address: '0x00000000000000000000000000000000000000cc', balance: null, share: null } });
    expect(coverageOf(r)).toBe(0.3); // 6 of 20
  });

  it('unknown stays unknown: null flags, taxes 0 with taxKnown false, renouncedMint/Freeze null', () => {
    const m = toTokenSecurityFlags(report());
    expect(m.fields).toEqual({ renouncedMint: null, renouncedFreeze: null, isOpenSource: null, isRenounced: null, isHoneypot: null, buyTax: 0, sellTax: 0 });
    expect(m.taxKnown).toEqual({ buy: false, sell: false });
    expect(m.lpBurnedRate).toBeNull();
    expect(m.checks.find((c) => c.key === 'evm_tax_unknown')?.level).toBe('warn');
    const mint = m.checks.find((c) => c.key === 'evm_mint')!;
    expect(mint).toEqual({ key: 'evm_mint', label: 'Mint function', value: '—', level: 'info' });
  });

  it('maps ownership roles: launchpad / metadata-only owners count as renounced for the UI', () => {
    expect(toTokenSecurityFlags(report({ ownerRole: 'launchpad', isRenounced: false })).fields.isRenounced).toBe(true);
    expect(toTokenSecurityFlags(report({ ownerRole: 'metadata-only', isRenounced: false })).fields.isRenounced).toBe(true);
    expect(toTokenSecurityFlags(report({ ownerRole: 'privileged', isRenounced: false })).fields.isRenounced).toBe(false);
    expect(toTokenSecurityFlags(report({ ownerRole: null, isRenounced: true })).fields.isRenounced).toBe(true);
  });

  it('passes measured taxes as 0..1 ratios and builds checklist rows in the SecurityCheck shape', () => {
    const m = toTokenSecurityFlags(
      report({
        isHoneypot: false,
        buyTax: 0.05,
        sellTax: 0.7657,
        transferTax: 0.02,
        flags: { ...report().flags, mintable: true, upgradeable: true, proxy: true, blacklist: false },
        lp: { pool: null, burnedShare: 0.6, lockedShare: 0.3, lockers: [{ address: '0x00000000000000000000000000000000000000dd', name: 'UNCX', share: 0.3 }], provider: 'goplus' },
      }),
    );
    expect(m.fields.buyTax).toBe(0.05);
    expect(m.fields.sellTax).toBe(0.7657);
    expect(m.taxKnown).toEqual({ buy: true, sell: true });
    expect(m.lpBurnedRate).toBe(0.9);
    const byKey = Object.fromEntries(m.checks.map((c) => [c.key, c]));
    expect(byKey.evm_mint).toMatchObject({ value: 'Yes', level: 'bad', hint: 'Owner can mint new supply' });
    expect(byKey.evm_proxy).toMatchObject({ value: 'Upgradeable', level: 'bad' });
    expect(byKey.evm_blacklist).toEqual({ key: 'evm_blacklist', label: 'Blacklist', value: 'No', level: 'good' });
    expect(byKey.evm_transfer_tax).toMatchObject({ value: '2.0%', level: 'warn' });
    expect(byKey.evm_lp_lockers.value).toBe('UNCX 30%');
    for (const c of m.checks) {
      expect(typeof c.key).toBe('string');
      expect(['good', 'warn', 'bad', 'info']).toContain(c.level);
      expect(c.key.startsWith('evm_')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('cache, concurrency and rate limits', () => {
  it('TtlCache expires entries and evicts the least recently used past its cap', () => {
    let t = 0;
    const c = new TtlCache<number>(2, () => t);
    c.set('a', 1, 100);
    c.set('b', 2, 100);
    expect(c.get('a')).toBe(1); // a is now most recent
    c.set('c', 3, 100); // evicts b
    expect(c.get('b')).toBeUndefined();
    expect(c.size).toBe(2);
    t = 150;
    expect(c.get('a')).toBeUndefined();
  });

  it('Semaphore caps concurrency', async () => {
    const s = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        s.run(async () => {
          peak = Math.max(peak, ++active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it('RateLimiter refills over its window and backs off exponentially after a rate-limit answer', () => {
    let t = 0;
    const l = new RateLimiter({ perWindow: 2, windowMs: 60_000, backoffMs: 30_000, maxBackoffMs: 100_000 }, () => t);
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
    t = 30_000;
    expect(l.tryTake()).toBe(true); // one token back after half a window
    l.penalize();
    expect(l.backoffRemainingMs).toBe(30_000);
    t = 59_000;
    expect(l.tryTake()).toBe(false);
    t = 91_000;
    expect(l.tryTake()).toBe(true);
    l.penalize();
    expect(l.backoffRemainingMs).toBe(60_000); // doubled
    l.succeed();
    l.penalize();
    expect(l.backoffRemainingMs).toBe(30_000); // ladder reset by a success
  });

  it('withTimeout rejects slow work and aborts its signal', async () => {
    let aborted = false;
    await expect(
      withTimeout('slow', 10, (signal) => new Promise((r) => {
        signal.addEventListener('abort', () => (aborted = true));
        setTimeout(r, 200);
      })),
    ).rejects.toThrow('slow timed out after 10 ms');
    expect(aborted).toBe(true);
  });
});
