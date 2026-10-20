import { describe, expect, it } from 'vitest';
import type { WhitelistEntry } from '@trenchscope/shared';
import {
  activeWhitelist,
  formatCountdown,
  formatUnits,
  isSolanaAddress,
  isTotpCode,
  isTotpOrRecoveryCode,
  maxWithdrawUnits,
  newClientId,
  parseUnits,
  pendingWhitelist,
  unitsFromNumber,
  validateWithdraw,
  whitelistLabel,
  withdrawAmount,
  type WithdrawAsset,
} from './model';

const SOL: WithdrawAsset = { mint: null, symbol: 'SOL', balance: 1.5 };
const BONK: WithdrawAsset = { mint: 'BonkMint1111111111111111111111111111111111', symbol: 'BONK', balance: 1234.567891 };
const DEST = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('exact amounts in base units', () => {
  it('parses typed decimals without float rounding', () => {
    expect(parseUnits('1.5', 9)).toBe(1_500_000_000n);
    expect(parseUnits('0.1', 9)).toBe(100_000_000n);
    expect(parseUnits('.25', 6)).toBe(250_000n);
    expect(parseUnits('3', 6)).toBe(3_000_000n);
    expect(parseUnits('0.000000001', 9)).toBe(1n);
  });

  it('rejects anything that is not a plain decimal, and more digits than the asset has', () => {
    for (const bad of ['', '1e3', '-1', '1,5', '1.2.3', 'abc', '.']) expect(parseUnits(bad, 9)).toBeNull();
    expect(parseUnits('0.0000000001', 9)).toBeNull();
    expect(parseUnits('1.1234567', 6)).toBeNull();
  });

  it('reads API floats back to their exact base units (rounded down)', () => {
    expect(unitsFromNumber(0.3, 9)).toBe(300_000_000n);
    expect(unitsFromNumber(1.000000001, 9)).toBe(1_000_000_001n);
    expect(unitsFromNumber(0.1 + 0.2, 9)).toBe(300_000_000n);
    expect(unitsFromNumber(-1, 9)).toBe(0n);
    expect(unitsFromNumber(Number.NaN, 9)).toBe(0n);
  });

  it('formats base units without trailing zeros', () => {
    expect(formatUnits(1_500_000_000n, 9)).toBe('1.5');
    expect(formatUnits(1n, 9)).toBe('0.000000001');
    expect(formatUnits(42_000_000n, 6)).toBe('42');
    expect(formatUnits(0n, 9)).toBe('0');
  });
});

describe('withdrawal limits', () => {
  it('Max keeps the SOL fee reserve; tokens go in full', () => {
    expect(formatUnits(maxWithdrawUnits(SOL, 0.01), 9)).toBe('1.49');
    expect(maxWithdrawUnits({ mint: null, balance: 0.005 }, 0.01)).toBe(0n);
    expect(formatUnits(maxWithdrawUnits(BONK, 0.01), 6)).toBe('1234.567891');
  });

  it('validates asset, amount, destination and the 6-digit code', () => {
    const ok = { asset: SOL, amount: '1.2', to: DEST, code: '123456' };
    expect(validateWithdraw(ok, 0.01, 1.5)).toEqual({});
    expect(validateWithdraw({ ...ok, asset: null }, 0.01, 1.5).asset).toBeTruthy();
    expect(validateWithdraw({ ...ok, amount: '' }, 0.01, 1.5).amount).toBe('Enter an amount');
    expect(validateWithdraw({ ...ok, amount: '0' }, 0.01, 1.5).amount).toBe('Enter an amount above 0');
    expect(validateWithdraw({ ...ok, amount: '1.0000000001' }, 0.01, 1.5).amount).toBe('Use at most 9 decimals');
    expect(validateWithdraw({ ...ok, amount: 'abc' }, 0.01, 1.5).amount).toMatch(/Enter a number/);
    expect(validateWithdraw({ ...ok, amount: '1.495' }, 0.01, 1.5).amount).toBe('More than you can withdraw: at most 1.49 SOL (0.01 SOL stays for network fees)');
    expect(validateWithdraw({ ...ok, amount: '1.49' }, 0.01, 1.5)).toEqual({});
    expect(validateWithdraw({ ...ok, to: null }, 0.01, 1.5).to).toBeTruthy();
    expect(validateWithdraw({ ...ok, code: '12345' }, 0.01, 1.5).code).toBeTruthy();
    expect(validateWithdraw({ ...ok, code: '123 456' }, 0.01, 1.5)).toEqual({});
  });

  it('caps token withdrawals at the balance and needs SOL for the fee', () => {
    const t = { asset: BONK, amount: '1234.567892', to: DEST, code: '123456' };
    expect(validateWithdraw(t, 0.01, 1).amount).toBe('More than you hold: at most 1234.567891 BONK');
    expect(validateWithdraw({ ...t, amount: '1000' }, 0.01, 1)).toEqual({});
    expect(validateWithdraw({ ...t, amount: '1000' }, 0.01, 0).amount).toMatch(/SOL in the wallet to pay the network fee/);
  });

  it('sends exactly the typed amount', () => {
    expect(withdrawAmount(SOL, '0.3')).toBe(0.3);
    expect(withdrawAmount(SOL, '1.000000001')).toBe(1.000000001);
    expect(withdrawAmount(SOL, '0')).toBeNull();
    expect(withdrawAmount(BONK, '1.1234567')).toBeNull();
  });
});

describe('whitelist and codes', () => {
  const now = 10_000_000;
  const entries: WhitelistEntry[] = [
    { chain: 'sol', address: DEST, label: 'Ledger', addedAt: 0, activeAt: now - 1 },
    { chain: 'sol', address: 'So1ana2222222222222222222222222222222222222', label: '', addedAt: now - 10, activeAt: now + 3_600_000 },
    { chain: 'bsc', address: '0xabc', label: 'Other chain', addedAt: 0, activeAt: 0 },
  ];

  it('splits active and pending addresses of the chain', () => {
    expect(activeWhitelist(entries, 'sol', now).map((e) => e.label)).toEqual(['Ledger']);
    expect(pendingWhitelist(entries, 'sol', now).map((e) => e.address)).toEqual([entries[1].address]);
    expect(whitelistLabel(entries[0])).toBe('Ledger · 7xKX...gAsU');
  });

  it('formats the activation countdown', () => {
    expect(formatCountdown(3_600_000 * 23 + 5 * 60_000)).toBe('23h 05m');
    expect(formatCountdown(250_000)).toBe('4m 10s');
    expect(formatCountdown(86_400_000 * 2 + 3_600_000)).toBe('2d 01h');
    expect(formatCountdown(-5)).toBe('0m 00s');
  });

  it('checks codes and addresses, and makes unique idempotency keys', () => {
    expect(isTotpCode('123456')).toBe(true);
    expect(isTotpCode('12345a')).toBe(false);
    expect(isTotpOrRecoveryCode('123456')).toBe(true);
    expect(isTotpOrRecoveryCode('abcd-efgh-jkmn')).toBe(true);
    expect(isTotpOrRecoveryCode('ABCDEFGHJKMN')).toBe(true);
    expect(isTotpOrRecoveryCode('abcd-efgh')).toBe(false);
    expect(isSolanaAddress(DEST)).toBe(true);
    expect(isSolanaAddress('0x1234')).toBe(false);
    const a = newClientId();
    expect(a).not.toBe(newClientId());
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
