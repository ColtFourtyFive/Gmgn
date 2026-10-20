import { describe, expect, it } from 'vitest';
import type { Signal } from '@trenchscope/shared';
import { aggregateCallers } from './callerStats';

let seq = 0;
function call(caller: string, maxMultiple: number, createdAt = 0): Signal {
  return {
    id: `c${seq++}`,
    chain: 'sol',
    kind: 'kol_call',
    token: { chain: 'sol', address: `t${seq}`, symbol: 'T', name: 'T', logoSeed: 's', logoGlyph: '', priceUsd: 1, marketCapUsd: 1, liquidityUsd: 0, status: 'curve', launchpad: 'moonpit', createdAt: 0, priceChange24h: 0 },
    title: 'KOL call',
    detail: '',
    marketCapAtTrigger: 1,
    maxMultiple,
    wallets: [caller],
    createdAt,
  };
}

describe('aggregateCallers', () => {
  it('ranks by hit rate, then average multiple, then call count, and skips one-off callers', () => {
    const calls = [
      call('a', 3, 1),
      call('a', 1.2, 5),
      call('b', 2.5),
      call('b', 4),
      call('c', 2.1),
      call('c', 2.2),
      call('d', 10), // a single call: not ranked
    ];
    const ranked = aggregateCallers(calls);
    expect(ranked.map((c) => c.address)).toEqual(['b', 'c', 'a']);
    expect(ranked[0]).toMatchObject({ calls: 2, hits: 2, hitRate: 1, avgMultiple: 3.25 });
    expect(ranked[0].best.maxMultiple).toBe(4);
    expect(ranked[2]).toMatchObject({ hits: 1, hitRate: 0.5, lastAt: 5 });
    expect(aggregateCallers(calls, 1)[0].address).toBe('d');
  });
});
