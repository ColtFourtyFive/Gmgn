import { describe, expect, it } from 'vitest';
import type { FeedItem, TokenRef, WalletTag } from '@trenchscope/shared';
import { mergeTags, multipleTone } from '@/components/wallet/utils';
import { aggregateHot, HOT_WINDOW_MS, hotWindowLabel, hotWindowMs } from './HotBySmartMoney';
import { tokenRisk } from './risk';

const NOW = 10_000_000;

function ref(address: string, mcap = 1000): TokenRef {
  return { chain: 'sol', address, symbol: address.toUpperCase(), name: address, logoSeed: address, logoGlyph: '', priceUsd: 1, marketCapUsd: mcap, liquidityUsd: 0, status: 'curve', launchpad: 'moonpit', createdAt: 0, priceChange24h: 0 };
}

let seq = 0;
function item(token: string, wallet: string, opts: { side?: 'buy' | 'sell'; ago?: number; usd?: number; tags?: WalletTag[] } = {}): FeedItem {
  const { side = 'buy', ago = 60_000, usd = 100, tags = ['smart'] } = opts;
  return {
    trade: {
      id: `t${seq++}`,
      chain: 'sol',
      token,
      tokenSymbol: token,
      wallet,
      walletTags: tags,
      walletLabel: null,
      side,
      nativeAmount: 1,
      tokenAmount: 1,
      usdAmount: usd,
      priceUsd: 1,
      priceNative: 1,
      marketCapUsd: 1000,
      timestamp: NOW - ago,
      txHash: 'x',
      block: 1,
      isDev: false,
      makerHoldRate: 0,
      realizedPnlUsd: null,
    },
    token: ref(token),
    isFirstBuy: true,
    isClose: false,
  };
}

describe('aggregateHot', () => {
  it('keeps tokens bought by at least two distinct smart wallets in the window', () => {
    const items = [
      item('aaa', 'w1'),
      item('aaa', 'w2', { usd: 50 }),
      item('aaa', 'w2'), // same wallet again: counted once
      item('bbb', 'w1'),
      item('bbb', 'w3', { side: 'sell' }), // sells ignored
      item('ccc', 'w1', { ago: HOT_WINDOW_MS + 1 }), // too old
      item('ccc', 'w2'),
      item('ddd', 'w4', { tags: ['kol'] }), // not smart
      item('ddd', 'w5'),
    ];
    const hot = aggregateHot(items, new Map([['aaa', ref('aaa', 5000)]]), NOW);
    expect(hot.map((h) => h.token.address)).toEqual(['aaa']);
    expect(hot[0].wallets).toEqual(['w1', 'w2']);
    expect(hot[0].buyUsd).toBe(250);
    expect(hot[0].token.marketCapUsd).toBe(5000); // latest ref wins
  });

  it('ranks by wallet count, then buy volume', () => {
    const items = [item('x', 'a'), item('x', 'b'), item('y', 'a', { usd: 1000 }), item('y', 'b'), item('z', 'a'), item('z', 'b'), item('z', 'c')];
    expect(aggregateHot(items, new Map(), NOW).map((h) => h.token.address)).toEqual(['z', 'y', 'x']);
  });

  it('names the window the feed really covers: a full 200-trade snapshot of a busy chain spans minutes, not 30m', () => {
    // 200 smart trades over the last 275s (newest first), as GET /feed?kind=smart&limit=200 returns on a busy chain.
    const busy = Array.from({ length: 200 }, (_, i) => item('t', `w${i}`, { ago: Math.round((i * 275_000) / 199) }));
    const span = hotWindowMs(busy, 200, NOW);
    expect(span).toBe(275_000);
    expect(hotWindowLabel(span)).toEqual({ short: 'last 4m', long: 'the last 4 minutes' });
    // A snapshot smaller than the request holds every smart trade the server has: the whole window.
    expect(hotWindowMs(busy.slice(0, 120), 200, NOW)).toBe(HOT_WINDOW_MS);
    expect(hotWindowLabel(HOT_WINDOW_MS).short).toBe('30m');
    // Live pushes extend the list back in time; the label never claims more than 30m.
    const long = [...busy, item('t', 'old', { ago: 45 * 60_000 })];
    expect(hotWindowMs(long, 200, NOW)).toBe(HOT_WINDOW_MS);
  });
});

describe('wallet utils', () => {
  it('mergeTags puts viewer tags first without duplicates and keeps identity when there are none', () => {
    const base: WalletTag[] = ['smart', 'following'];
    expect(mergeTags(base, [])).toBe(base);
    expect(mergeTags(base, ['you', 'following'])).toEqual(['you', 'following', 'smart']);
  });

  it('multipleTone colors 2x+ green and sub-1x red', () => {
    expect(multipleTone(2.1)).toBe('text-up');
    expect(multipleTone(1)).toBe('text-fg');
    expect(multipleTone(0.996)).toBe('text-fg');
    expect(multipleTone(0.9)).toBe('text-down');
    expect(multipleTone(null)).toBe('text-faint');
  });
});

describe('tokenRisk', () => {
  it('flags high server risk levels and leaves refs without a security read unknown', () => {
    expect(tokenRisk({ riskLevel: 'high' })).toBe('risky');
    expect(tokenRisk({ riskLevel: 'medium' })).toBe('ok');
    expect(tokenRisk({ riskLevel: 'low' })).toBe('ok');
    expect(tokenRisk(ref('x'))).toBe('unknown');
  });
});
