import { describe, expect, it } from 'vitest';
import type { FollowedWallet } from '@trenchscope/shared';
import { followsToCsv, followsToJson, parseCsv, planImport } from './followsIO';

const SOL_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const SOL_B = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy';
const EVM_A = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

function follow(patch: Partial<FollowedWallet>): FollowedWallet {
  return { chain: 'sol', address: SOL_A, remark: '', group: 'Default', createdAt: 0, notify: true, label: null, tags: [], ...patch };
}

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, separators inside quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n\r\nd;e\tf\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
    expect(parseCsv('"multi\nline",x')).toEqual([['multi\nline', 'x']]);
  });
});

describe('export → import round trip', () => {
  const list = [
    follow({ address: SOL_A, remark: 'big, "fish"', group: 'Whales', notify: false }),
    follow({ chain: 'bsc', address: EVM_A.toLowerCase(), remark: '=HYPERLINK("x")', group: 'Default' }),
  ];

  it('restores every field from CSV, including formula-guarded remarks', () => {
    const plan = planImport(followsToCsv(list), { defaultChain: 'sol', existing: [] });
    expect(plan.format).toBe('csv');
    expect(plan.rows).toEqual([
      { chain: 'sol', address: SOL_A, remark: 'big, "fish"', group: 'Whales', notify: false },
      { chain: 'bsc', address: EVM_A.toLowerCase(), remark: '=HYPERLINK("x")', group: 'Default', notify: true },
    ]);
    expect(followsToCsv(list)).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('restores every field from JSON', () => {
    const plan = planImport(followsToJson(list, 0), { defaultChain: 'sol', existing: [] });
    expect(plan.format).toBe('json');
    expect(plan.rows.map((r) => [r.chain, r.remark, r.notify])).toEqual([
      ['sol', 'big, "fish"', false],
      ['bsc', '=HYPERLINK("x")', true],
    ]);
    expect(plan.byChain).toEqual({ sol: 1, bsc: 1 });
  });
});

describe('planImport', () => {
  it('reads a plain address list on the default chain and splits new, existing, duplicate and invalid rows', () => {
    const text = [SOL_A, SOL_B, SOL_B, 'not-an-address', EVM_A].join('\n');
    const plan = planImport(text, { defaultChain: 'sol', existing: [follow({ address: SOL_A })] });
    expect(plan.total).toBe(5);
    expect(plan.rows.map((r) => r.address)).toEqual([SOL_B]);
    expect(plan.existing).toBe(1);
    expect(plan.duplicates).toBe(1);
    expect(plan.invalid.map((i) => i.row)).toEqual([4, 5]);
    expect(plan.invalid[1].reason).toMatch(/Solana address/);
  });

  it('validates each row against its own chain and dedupes EVM addresses case-insensitively', () => {
    const json = JSON.stringify([
      { chain: 'BNB Chain', address: EVM_A },
      { chain: 'bsc', address: EVM_A.toLowerCase() },
      { chain: 'eth', address: SOL_A },
      { chain: 'dogechain', address: EVM_A },
      SOL_B,
    ]);
    const plan = planImport(json, { defaultChain: 'sol', existing: [] });
    expect(plan.rows).toEqual([
      { chain: 'bsc', address: EVM_A.toLowerCase(), remark: '', group: 'Default', notify: true },
      { chain: 'sol', address: SOL_B, remark: '', group: 'Default', notify: true },
    ]);
    expect(plan.duplicates).toBe(1);
    expect(plan.invalid.map((i) => i.reason)).toEqual([expect.stringMatching(/Ethereum address/), expect.stringMatching(/Unknown chain/)]);
  });

  it('caps remark and group lengths and refuses unusable files', () => {
    const plan = planImport(`address,remark,group\n${SOL_A},${'r'.repeat(40)},${'g'.repeat(30)}`, { defaultChain: 'sol', existing: [] });
    expect(plan.rows[0].remark).toHaveLength(32);
    expect(plan.rows[0].group).toHaveLength(24);
    expect(() => planImport('  ', { defaultChain: 'sol', existing: [] })).toThrow(/empty/);
    expect(() => planImport('{"follows": 3}', { defaultChain: 'sol', existing: [] })).toThrow(/list of wallets/);
    expect(() => planImport('[1,', { defaultChain: 'sol', existing: [] })).toThrow(/could not be read/);
  });
});
