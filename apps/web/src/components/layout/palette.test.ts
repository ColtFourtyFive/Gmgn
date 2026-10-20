import { describe, expect, it } from 'vitest';
import { CHAIN_IDS, CHAINS } from '@trenchscope/shared';
import { addRecent, MAX_RECENT, mentionedChains, rankCommands, validRecents, type PaletteCommand, type RecentItem } from './palette';

const noop = () => undefined;
const pages = ['Trenches', 'Trending', 'New Pairs', 'Leaderboard', 'Sniper'];
// Active chain sol: its pages are listed by default, other chains' only when named.
const commands: PaletteCommand[] = [
  { id: 'chain:bsc', group: 'Chains', title: 'Switch to BNB Chain', keywords: ['bsc', 'BSC'], run: noop },
  { id: 'action:settings', group: 'Actions', title: 'Open settings', keywords: ['preferences'], run: noop },
  ...CHAIN_IDS.flatMap((c) =>
    pages.map((title): PaletteCommand => ({
      id: `page:${title}:${c}`,
      group: 'Pages',
      title,
      subtitle: CHAINS[c].name,
      keywords: [c],
      chain: c,
      otherChain: c !== 'sol',
      run: noop,
    })),
  ),
];
const ids = (query: string) => rankCommands(query, commands).map((r) => r.item.id);

describe('palette command ranking', () => {
  it('lists only the active chain pages for plain queries', () => {
    expect(ids('trending')).toEqual(['page:Trending:sol']);
  });

  it('adds another chain pages when the query names that chain', () => {
    expect(ids('trending bsc')).toEqual(['page:Trending:bsc']);
    expect(ids('base new pairs')).toEqual(['page:New Pairs:base']);
  });

  it('drops weak scattered matches', () => {
    // "bo" only appears mid-word in "Leaderboard".
    expect(ids('bo')).toEqual([]);
    expect(ids('board')).toEqual(['page:Leaderboard:sol']);
  });

  it('matches keywords and word starts', () => {
    expect(ids('pref')).toEqual(['action:settings']);
    expect(ids('np')[0]).toBe('page:New Pairs:sol');
  });

  it('detects chain names by prefix', () => {
    expect(mentionedChains('trending bs')).toEqual(['bsc']);
    expect(mentionedChains('ethereum')).toEqual(['eth']);
    expect(mentionedChains('trending rh')).toEqual(['robinhood']);
    expect(mentionedChains('hood')).toEqual(['robinhood']);
    expect(mentionedChains('b sniper')).toEqual([]);
  });
});

describe('palette recents', () => {
  const cmd = (id: string): RecentItem => ({ type: 'command', id });

  it('moves re-opened items to the front without duplicates', () => {
    let list: RecentItem[] = [];
    for (const id of ['a', 'b', 'c', 'a']) list = addRecent(list, cmd(id));
    expect(list).toEqual([cmd('a'), cmd('c'), cmd('b')]);
  });

  it(`keeps at most ${MAX_RECENT}`, () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < 9; i++) list = addRecent(list, cmd(`c${i}`));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toEqual(cmd('c8'));
  });

  it('ignores malformed stored values', () => {
    const token = { type: 'token', token: { chain: 'sol', address: 'x', symbol: 'PEPE', name: 'Pepe', logoSeed: 's', logoGlyph: '🐸' } };
    const wallet = { type: 'wallet', wallet: { chain: 'bsc', address: 'w', label: null, tags: ['smart'], avatarSeed: 'w' } };
    expect(validRecents('nope')).toEqual([]);
    expect(validRecents([cmd('a'), { type: 'token' }, { type: 'wallet', wallet: {} }, null, 3, token, wallet])).toEqual([cmd('a'), token, wallet]);
  });

  it('drops entries missing fields the palette renders (they would crash the shell)', () => {
    const token = { chain: 'sol', address: 'x', symbol: 'PEPE', name: 'Pepe', logoSeed: 's', logoGlyph: '🐸' };
    const wallet = { chain: 'bsc', address: 'w', label: 'KOL', tags: ['kol'], avatarSeed: 'w' };
    expect(
      validRecents([
        { type: 'token', token: { address: 'x', symbol: 'X' } },
        { type: 'token', token: { ...token, chain: 'doge' } },
        { type: 'token', token: { ...token, logoSeed: undefined } },
        { type: 'wallet', wallet: { ...wallet, tags: ['nope'] } },
        { type: 'wallet', wallet: { ...wallet, avatarSeed: 1 } },
        { type: 'wallet', wallet: { ...wallet, label: undefined } },
      ]),
    ).toEqual([]);
  });
});
