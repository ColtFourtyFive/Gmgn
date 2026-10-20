// EVM feed venues: event layouts and curve accounting checked against real
// mainnet data (reserve reads before / after recorded trades, recorded logs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeAbiParameters } from 'viem';
import { TOPIC } from '../src/live/evm/feed/abi';
import type { RpcFixture } from '../src/live/evm/feed/fixture-rpc';
import { cleanSocials, cleanText, cleanUrl } from '../src/live/evm/feed/metadata';
import { classifyNarrative } from '../src/live/evm/feed/narrative';
import { parseRawLog } from '../src/live/evm/feed/rpc';
import { CLANKER_TOPIC, parseClankerMetadata } from '../src/live/evm/feed/venues/clanker';
import { FLAP_PORTALS, FLAP_TOPIC, flapCurveState, type FlapCurve } from '../src/live/evm/feed/venues/flap';
import { FOUR_MEME, FOUR_TOPIC, fourCurveState } from '../src/live/evm/feed/venues/fourmeme';
import { applyTrade, graduatedKey, PONS, PONS_TOPIC, ponsCurveState, undoTrade, type PonsCurve } from '../src/live/evm/feed/venues/pons';
import { POOLS_TRADE_TOPIC, socialsFromText } from '../src/live/evm/feed/venues/pools-trade';

const FIXTURES = join(__dirname, 'fixtures/evm/feed');
const load = (name: string): RpcFixture => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as RpcFixture;

/** A Pons V2 curve (0x81968cbc...) as read on mainnet at block 93,675,099. */
function ponsCurve(quoteReserve: bigint, tokenReserve: bigint): PonsCurve {
  return {
    curve: '0x81968cbc29013e12c907082e38a06021b4838eda',
    token: '0x35e99180511f479a13db10ac6ff20bebe4282bdb',
    phantomQuote: 1_680_000_000_000_000_000n,
    launchSupply: 10n ** 27n,
    reserved: 285_714_285_714_285_714_285_714_285n,
    feeBps: 100,
    quoteReserve,
    tokenReserve,
    graduated: false,
    launchedAt: 0,
  };
}

describe('Pons V2 curve', () => {
  it('reproduces getReserves() after a real CurveBuy (block 93,675,100)', () => {
    const c = ponsCurve(3_218_587_570_418_812_289n, 521_968_087_940_323_901_955_133_818n);
    // CurveBuy data: quote in (gross), tokens out, fee, creator tax
    applyTrade(c, { side: 'buy', quote: 34_820_776_498_382_876n, tokens: 5_531_278_248_318_227_963_904_229n, fee: 348_207_764_983_828n, tax: 0n });
    expect(c.quoteReserve).toBe(3_253_060_139_152_211_337n);
    expect(c.tokenReserve).toBe(516_436_809_692_005_673_991_229_589n);
  });

  it('reproduces getReserves() after a buy and a sell in one block (93,675,097)', () => {
    const c = ponsCurve(3_266_815_394_114_912_354n, 514_262_300_534_789_561_010_550_459n);
    const buy = { side: 'buy' as const, quote: 1_643_003_986_338_421n, tokens: 255_927_952_179_719_850_459_158n, fee: 16_430_039_863_384n, tax: 0n };
    const sell = { side: 'sell' as const, quote: 24_540_026_339_045_602n, tokens: 3_928_021_018_518_416_105_930_752n, fee: 247_879_053_929_753n, tax: 0n };
    applyTrade(c, buy);
    applyTrade(c, sell);
    expect(c.quoteReserve).toBe(3_243_654_062_668_412_036n);
    expect(c.tokenReserve).toBe(517_934_393_601_128_257_266_022_053n);
    // walking back restores the earlier read exactly
    undoTrade(c, sell);
    undoTrade(c, buy);
    expect(c.quoteReserve).toBe(3_266_815_394_114_912_354n);
    expect(c.tokenReserve).toBe(514_262_300_534_789_561_010_550_459n);
  });

  it('nets the creator tax out of a taxed buy (real read: quote reserve +0.016589268442 ETH)', () => {
    const c = ponsCurve(3n * 10n ** 18n, 5n * 10n ** 26n);
    applyTrade(c, { side: 'buy', quote: 17_102_338_600_000_000n, tokens: 1_933_236_707_553_318_588_954_415n, fee: 171_023_386_000_000n, tax: 342_046_772_000_000n });
    expect(c.quoteReserve - 3n * 10n ** 18n).toBe(16_589_268_442_000_000n);
  });

  it('maps to World curve state: 1.68 ETH x 1B start, 5/7 sellable, graduation at 4.2 ETH', () => {
    const start = ponsCurveState(ponsCurve(1_680_000_000_000_000_000n, 10n ** 27n));
    expect(start).toMatchObject({ virtualNative: 1.68, virtualTokens: 1e9, realNative: 0, feeRate: 0.01 });
    expect(start.realTokens).toBeCloseTo(714_285_714.2857, 3);
    expect(start.initialRealTokens).toBeCloseTo(714_285_714.2857, 3);
    // at the graduation threshold the sellable tokens are gone
    const end = ponsCurveState(ponsCurve(5_880_000_000_000_000_000n, 285_714_285_714_285_714_285_714_285n));
    expect(end.realNative).toBeCloseTo(4.2, 12);
    expect(end.realTokens).toBe(0);
    // constant product holds along the way
    expect(start.virtualNative * start.virtualTokens).toBeCloseTo(end.virtualNative * end.virtualTokens, -3);
  });

  it('graduates into the V4 pool ETH / token, fee 0, tick spacing 200, PonsV2MemeHook', () => {
    expect(graduatedKey('0xB11384A6AC2B3708E3D25A834C8A88687ACCBCD1')).toEqual({
      currency0: '0x0000000000000000000000000000000000000000',
      currency1: '0xb11384a6ac2b3708e3d25a834c8a88687accbcd1',
      fee: 0,
      tickSpacing: 200,
      hooks: PONS.memeHook,
    });
  });
});

describe('Flap CDPV2 curve', () => {
  const robinhood: FlapCurve = {
    token: '0xcb808288df748ea6b59e4923b016c25f43127777',
    r: 1_918_979_700_000_000_000n,
    h: 107_036_752_000_000_000_000_000_000n,
    k: 2_124_381_054_241_934_400_000_000_000n,
    thresh: 800_000_000n * 10n ** 18n,
    quote: '0x0000000000000000000000000000000000000000',
    buyTaxBps: 900,
    sellTaxBps: 900,
  };

  it('starts at r x (1e9 + h) and graduates with 5 ETH raised at 800M', () => {
    const start = flapCurveState(robinhood, 0n);
    expect(start.virtualNative).toBeCloseTo(1.9189797, 12);
    expect(start.virtualTokens).toBe(1_107_036_752);
    expect(start.realNative).toBe(0);
    expect(start.realTokens).toBe(800_000_000);
    const end = flapCurveState(robinhood, 800_000_000n * 10n ** 18n);
    expect(end.realNative).toBeCloseTo(5, 9);
    expect(end.realTokens).toBe(0);
  });

  it('a real TokenBought moves the reserve by eth - fee - tax (FIZZ creator buy, block 93,277,177)', () => {
    const before = flapCurveState(robinhood, 0n);
    const after = flapCurveState(robinhood, 98_464_622_337_644_421_267n);
    const eth = 189_647_049_405n;
    const fee = 1_896_470_494n;
    const tax = 17_068_234_446n;
    expect((after.realNative - before.realNative) * 1e18).toBeCloseTo(Number(eth - fee - tax), -1);
  });

  it('BSC launches (r = 6.14 BNB) graduate with ~16 BNB raised', () => {
    const bsc: FlapCurve = { ...robinhood, r: 6_140_000_000_000_000_000n, k: 6_797_205_657_280_000_000_000_000_000n };
    // k / (1e9 + h - 800M) - r = 6,797,205,657.28 / 307,036,752 - 6.14
    expect(flapCurveState(bsc, 800_000_000n * 10n ** 18n).realNative).toBeCloseTo(15.998085, 6);
  });
});

describe('four.meme curve', () => {
  it('(funds + a)(offers + b) is constant over recorded BNB-quoted trades', () => {
    const f = load('bsc-window.json');
    const trades = f.logs
      .map(parseRawLog)
      .filter((l) => l.address === FOUR_MEME.tokenManager && (l.topics[0] === FOUR_TOPIC.purchase || l.topics[0] === FOUR_TOPIC.sale))
      .map((l) => {
        const [token, , , , , , offers, funds] = decodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
          l.data,
        );
        return { token: token.toLowerCase(), offers, funds };
      });
    expect(trades.length).toBeGreaterThan(0);
    // The constant product implied by each trade's post-state is the same for every trade of a token,
    // with a = maxFunds x 25/73 and b = maxOffers x 25/73 (max offers 800M; max funds from the curve).
    const byToken = new Map<string, { offers: bigint; funds: bigint }[]>();
    for (const t of trades) byToken.set(t.token, [...(byToken.get(t.token) ?? []), t]);
    let checked = 0;
    for (const list of byToken.values()) {
      for (const maxFunds of [13_600_000_000_000_000_000n, 13_700_000_000_000_000_000n, 13_800_000_000_000_000_000n, 10_000n * 10n ** 18n]) {
        const c = { token: '', maxOffers: 800_000_000n * 10n ** 18n, maxFunds, feeRate: 0.01 };
        const ks = list.map((t) => {
          const s = fourCurveState(c, t.offers, t.funds);
          return s.virtualNative * s.virtualTokens;
        });
        if (list.length > 1 && Math.max(...ks) / Math.min(...ks) - 1 < 1e-9) checked++;
      }
    }
    // Single-trade tokens can't show constancy; the formula must fit every multi-trade token for one max-funds value.
    const multi = [...byToken.values()].filter((l) => l.length > 1).length;
    expect(checked).toBeGreaterThanOrEqual(multi);
  });

  it('virtual reserves are 25/73 of max funds and max offers', () => {
    const s = fourCurveState({ token: '', maxOffers: 800_000_000n * 10n ** 18n, maxFunds: 13_700_000_000_000_000_000n, feeRate: 0.01 }, 800_000_000n * 10n ** 18n, 0n);
    expect(s.virtualNative).toBeCloseTo((13.7 * 25) / 73, 12);
    expect(s.virtualTokens).toBeCloseTo(800_000_000 * (1 + 25 / 73), 3);
    expect(s.realTokens).toBe(800_000_000);
  });
});

describe('event signatures match recorded mainnet logs', () => {
  const topicsIn = (name: string) => new Set(load(name).logs.map((l) => (l.topics as string[])[0]));

  it('Robinhood: Pons curves and factory, Pools.trade, Uniswap V4', () => {
    const t = topicsIn('robinhood-window.json');
    for (const topic of [PONS_TOPIC.tokenLaunched, PONS_TOPIC.curveBuy, TOPIC.v4Initialize, TOPIC.v4Swap]) expect(t.has(topic)).toBe(true);
    expect(PONS_TOPIC.tokenLaunched).toBe('0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607');
    expect(PONS_TOPIC.curveBuy).toBe('0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455');
    expect(PONS_TOPIC.curveSell).toBe('0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df');
    expect(PONS_TOPIC.curveCompleted).toBe('0xf8d37a90738ae063b8b8058b66f5880cf3cf7ab0c5d4fa78219696591dfbfb67');
    expect(PONS_TOPIC.poolGraduated).toBe('0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259');
    expect(POOLS_TRADE_TOPIC.tokenCreated).toBe('0x4ef8284ecf42d4cd19686572ffd87f630858c82398911e776cb831de35eddbf4');
    expect(TOPIC.v4Swap).toBe('0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f');
    expect(TOPIC.v4Initialize).toBe('0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438');
  });

  it('BNB Chain: four.meme, Flap, PancakeSwap', () => {
    const t = topicsIn('bsc-window.json');
    for (const topic of [FOUR_TOPIC.tokenCreate, FOUR_TOPIC.purchase, FLAP_TOPIC.tokenCreated, FLAP_TOPIC.bought, FLAP_TOPIC.supplyChanged, FLAP_TOPIC.curveSetV2, TOPIC.v2PairCreated]) {
      expect(t.has(topic)).toBe(true);
    }
    expect(FOUR_TOPIC.tokenCreate).toBe('0x396d5e902b675b032348d3d2e9517ee8f0c4a926603fbc075d3d282ff00cad20');
    expect(FOUR_TOPIC.purchase).toBe('0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942');
    expect(FOUR_TOPIC.sale).toBe('0x0a5575b3648bae2210cee56bf33254cc1ddfbc7bf637c0af2ac18b14fb1bae19');
    expect(FOUR_TOPIC.liquidityAdded).toBe('0xc18aa71171b358b706fe3dd345299685ba21a5316c66ffa9e319268b033c44b0');
    expect(FLAP_TOPIC.launchedToDex).toBe('0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d');
    expect(FLAP_PORTALS.bsc).toBe('0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0');
  });

  it('Base: Clanker v4 TokenCreated', () => {
    expect(topicsIn('base-clanker.json').has(CLANKER_TOPIC.tokenCreated)).toBe(true);
    expect(CLANKER_TOPIC.tokenCreated).toBe('0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67');
  });
});

describe('metadata', () => {
  it("parses Clanker's metadata JSON", () => {
    const m = parseClankerMetadata(
      '{"description":"Onchain trading built for real users.","socialMediaUrls":[{"platform":"website","url":"https://ticko.xyz/"},{"platform":"x","url":"https://x.com/tickoxyz"},{"platform":"telegram","url":""}],"auditUrls":[]}',
    );
    expect(m).toEqual({ description: 'Onchain trading built for real users.', socials: { twitter: 'https://x.com/tickoxyz', website: 'https://ticko.xyz/' } });
    expect(parseClankerMetadata('not json')).toEqual({ description: '', socials: {} });
  });

  it('pulls X / Telegram links out of a Pools.trade description', () => {
    expect(socialsFromText('Just a cat mining emeralds.\nhttps://x.com/KAMALA_ONSOL', '')).toEqual({ twitter: 'https://x.com/KAMALA_ONSOL' });
  });

  it('keeps only https links, X / Telegram on their own hosts, clean capped text', () => {
    expect(cleanUrl('javascript:alert(1)')).toBeNull();
    expect(cleanUrl('http://example.com/a')).toBe('https://example.com/a');
    expect(cleanUrl('https://user:pw@example.com')).toBeNull();
    expect(cleanSocials({ twitter: '@fatcat_hood', telegram: 'https://t.me/#0xabc', website: 'fatcathood.com' })).toEqual({ twitter: 'https://x.com/fatcat_hood', website: 'https://fatcathood.com/' });
    expect(cleanSocials({ twitter: 'https://evil.example/x' })).toEqual({});
    expect(cleanText('a\u0000b‮c', 10)).toBe('abc');
    expect(cleanText('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('classifies narratives from names', () => {
    expect(classifyNarrative('Fat Cat', 'FATCAT', '').narrative).toBe('Cats');
    expect(classifyNarrative('Sentinel', 'SNTL', 'an autonomous agent').narrative).toBe('AI Agents');
    expect(classifyNarrative('Zzz', 'ZZZ', '').narrative).toBe('Classic Memes');
  });
});

