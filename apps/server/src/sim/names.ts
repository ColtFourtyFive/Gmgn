// Original memecoin identities for the simulator: narratives (metas), token
// names / symbols / descriptions / glyphs, fictional socials and KOL handles.
// Everything here is invented; no real tokens, trademarks or people.

import type { Socials } from '@trenchscope/shared';
import type { Rng } from './rng';

export interface NarrativeDef {
  /** Stable id (url-safe). */
  id: string;
  /** Display name; stored on TokenState.narrative. */
  name: string;
  /** Representative glyph for narrative lists. */
  glyph: string;
  glyphs: string[];
  /** Characters / nouns a token can be named after. */
  heads: string[];
  /** Adjectives / prefixes. */
  mods: string[];
  /** Suffix words ("Agent", "Inu"...). */
  tails: string[];
  /** One-line lore sentences for descriptions (lowercase start, no period). */
  lore: string[];
}

export const NARRATIVES: NarrativeDef[] = [
  {
    id: 'ai',
    name: 'AI Agents',
    glyph: '🤖',
    glyphs: ['🤖', '🧠', '💾', '🛰️', '🦾'],
    heads: ['Glyphmind', 'Byte', 'Synapse', 'Kernel', 'Tensor', 'Botley', 'Cortexa', 'Neuro', 'Promptly', 'Looper', 'Vectra', 'Daemon'],
    mods: ['Sentient', 'Autonomous', 'Rogue', 'Overclocked', 'Recursive', 'Sleepy', 'Feral', 'Agentic'],
    tails: ['Agent', 'AI', 'Protocol', 'Swarm', 'OS', 'Labs'],
    lore: [
      'an autonomous agent that posts, trades and occasionally apologizes',
      'trained exclusively on 3am group-chat screenshots',
      'the first agent to file its own memecoin taxes',
      'a swarm of tiny models arguing about the chart',
      'it reads every reply so you do not have to',
    ],
  },
  {
    id: 'cats',
    name: 'Cats',
    glyph: '🐱',
    glyphs: ['🐱', '😼', '🐈', '😹', '🐾'],
    heads: ['Mittens', 'Purrcy', 'Whiskerton', 'Loafie', 'Tabbs', 'Meowlo', 'Furrball', 'Catsby', 'Noodle', 'Biscuit'],
    mods: ['Grumpy', 'Chonky', 'Zoomie', 'Sir', 'Loaf', 'Midnight', 'Smol', 'Judgy'],
    tails: ['Cat', 'Kitty', 'Purr', 'Paws', 'Meow'],
    lore: [
      'a cat that knocks red candles off the table',
      'nine lives, zero sell buttons',
      'sleeps 16 hours a day and still outperforms your bags',
      'the official mascot of knocking things over',
    ],
  },
  {
    id: 'dogs',
    name: 'Dogs',
    glyph: '🐶',
    glyphs: ['🐶', '🐕', '🦴', '🐩', '🐾'],
    heads: ['Barkley', 'Snoot', 'Wagsworth', 'Pupper', 'Borkus', 'Fetch', 'Biscuit', 'Doggo', 'Woofington', 'Corgo'],
    mods: ['Good', 'Lil', 'Zoomie', 'Brave', 'Floppy', 'Turbo', 'Sleepy', 'Captain'],
    tails: ['Inu', 'Dog', 'Pup', 'Bork', 'Woof'],
    lore: [
      'a very good boy who only fetches green candles',
      'the dog that ate the whitepaper',
      'loyal holders, waggy charts',
      'barks at every jeet that walks past the chart',
    ],
  },
  {
    id: 'frogs',
    name: 'Frogs',
    glyph: '🐸',
    glyphs: ['🐸', '🪷', '🌿'],
    heads: ['Ribbert', 'Croaksworth', 'Toadie', 'Lilypad', 'Hopkins', 'Frogo', 'Gribbit', 'Polliwog', 'Puddleton', 'Bogsby'],
    mods: ['Smug', 'Based', 'Swamp', 'Comfy', 'Sad', 'Feels', 'Rare', 'Moist'],
    tails: ['Frog', 'Toad', 'Croak', 'Hop'],
    lore: [
      'a smug frog sitting on the rarest lily pad in the swamp',
      'croaks once for every new holder',
      'the swamp is undefeated',
      'rare, comfy and extremely online',
    ],
  },
  {
    id: 'politics',
    name: 'Politics',
    glyph: '🗳️',
    glyphs: ['🗳️', '🏛️', '🎩', '📜', '🦅'],
    heads: ['Filibuster', 'Ballot', 'Senator Snoot', 'Gerrymander', 'Lobbyist', 'Veto', 'Caucus', 'Mayor Moo', 'Pundit', 'Quorum'],
    mods: ['Landslide', 'Swing', 'Grassroots', 'Bipartisan', 'Unelected', 'Shadow', 'Recount', 'Midterm'],
    tails: ['Party', 'Vote', 'Coin', 'Caucus', 'Act'],
    lore: [
      'a fictional candidate running on a platform of only green candles',
      'the only campaign funded entirely by memes',
      'filibustering the sell pressure since launch',
      'every holder gets one vote and zero refunds',
    ],
  },
  {
    id: 'anime',
    name: 'Anime',
    glyph: '🌸',
    glyphs: ['🌸', '⚔️', '🍥', '🎌', '✨'],
    heads: ['Sakurin', 'Kawaiko', 'Senpai', 'Mecha', 'Ninjin', 'Tanuko', 'Hoshiko', 'Ramenmaru', 'Kitsuna', 'Chibi'],
    mods: ['Super', 'Ultra', 'Magical', 'Final Form', 'Chosen', 'Neo', 'Shonen', 'Dreamy'],
    tails: ['Chan', 'Kun', 'Sama', 'San', 'Senshi'],
    lore: [
      'episode one of a 900-episode arc about number go up',
      'powering up for three episodes before the breakout',
      'the protagonist never sells, it only trains harder',
      'a magical girl who transforms jeets into diamond hands',
    ],
  },
  {
    id: 'celebs',
    name: 'Celebrity Parody',
    glyph: '🌟',
    glyphs: ['🌟', '🎬', '📸', '💅', '🎤'],
    heads: ['Paparazzi Pete', 'Red Carpet Rex', 'Influencer Ivy', 'Popstar Pixel', 'Tabloid Tom', 'Diva Dot', 'Cameo Carl', 'Selfie Sue', 'Gossip Gary', 'Hollywood Hank'],
    mods: ['Famous', 'Verified', 'Viral', 'Exclusive', 'Iconic', 'Leaked', 'A-List', 'Canceled'],
    tails: ['Star', 'Fame', 'Coin', 'Drama'],
    lore: [
      'a completely made-up celebrity with a completely real chart',
      'trending for reasons nobody can explain',
      'famous for being famous, now on-chain',
      'the paparazzi caught this one pumping',
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    glyph: '🎮',
    glyphs: ['🎮', '👾', '🕹️', '🏆', '🎲'],
    heads: ['Respawn', 'Speedrun', 'Lootbox', 'Pixel', 'Noob', 'Boss Fight', 'Combo', 'Glitch', 'Sidequest', 'Hitbox'],
    mods: ['Pro', 'Retro', 'Hardcore', 'Turbo', 'Final', 'Legendary', 'Cozy', 'Ranked'],
    tails: ['Quest', 'Game', 'XP', 'Arcade', 'Run'],
    lore: [
      'a speedrun from launch to the moon, glitches allowed',
      'press start to hold',
      'every candle is a new level',
      'loot drops for the last holder standing',
    ],
  },
  {
    id: 'food',
    name: 'Food',
    glyph: '🍔',
    glyphs: ['🍔', '🍕', '🌮', '🍩', '🍜', '🥟'],
    heads: ['Nugget', 'Dumpling', 'Taco', 'Waffle', 'Pickle', 'Burrito', 'Donut', 'Noodle', 'Pancake', 'Meatball'],
    mods: ['Spicy', 'Crispy', 'Extra', 'Double', 'Midnight', 'Cheesy', 'Saucy', 'Golden'],
    tails: ['Coin', 'Bites', 'Feast', 'Snack'],
    lore: [
      'the official snack of the trenches',
      'deep fried, double sauced, never sold',
      'cooking something special in the kitchen',
      'served hot, eaten at the top',
    ],
  },
  {
    id: 'space',
    name: 'Space',
    glyph: '🚀',
    glyphs: ['🚀', '🪐', '🌙', '👽', '☄️', '🛸'],
    heads: ['Orbit', 'Nebula', 'Comet', 'Lunar', 'Astro', 'Quasar', 'Rover', 'Zorp', 'Cosmo', 'Starling'],
    mods: ['Deep', 'Galactic', 'Hyper', 'Warp', 'Interstellar', 'Zero-G', 'Cosmic', 'Escape'],
    tails: ['Mission', 'Rocket', 'Pad', 'Station', 'Coin'],
    lore: [
      'a mission to the moon with no return ticket',
      'escape velocity reached at launch',
      'the alien that came for the memes and stayed for the chart',
      'fueling up on the launch pad',
    ],
  },
  {
    id: 'memes',
    name: 'Classic Memes',
    glyph: '😂',
    glyphs: ['😂', '🗿', '🤡', '💀', '🫡'],
    heads: ['Stonks', 'Copium', 'Doomer Jr', 'Chadwick', 'Bruh Moment', 'Ratio', 'Cope', 'Based', 'Npc', 'Sigma'],
    mods: ['Ultimate', 'Peak', 'Certified', 'Classic', 'Cursed', 'Deep Fried', 'Big', 'Lil'],
    tails: ['Coin', 'Meme', 'Moment', 'Era'],
    lore: [
      'a timeless meme finally given a ticker',
      'the meme your parents were warned about',
      'certified peak internet',
      'deep fried to perfection',
    ],
  },
  {
    id: 'desci',
    name: 'DeSci',
    glyph: '🧬',
    glyphs: ['🧬', '🔬', '🧪', '🧫', '⚗️'],
    heads: ['Mitochondria', 'Petri', 'Helix', 'Neuron', 'Enzyme', 'Peptide', 'Isotope', 'Lab Rat', 'Sequencer', 'Placebo'],
    mods: ['Open', 'Peer-Reviewed', 'Longevity', 'Quantum', 'Decentralized', 'Clinical', 'Mad', 'Funded'],
    tails: ['DAO', 'Lab', 'Science', 'Bio'],
    lore: [
      'funding research into why every chart looks like this',
      'the powerhouse of the portfolio',
      'peer reviewed by anonymous degens',
      'a lab rat that escaped and learned to trade',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    glyph: '🦦',
    glyphs: ['🦦', '🐧', '🦛', '🦔', '🐻', '🦥', '🐿️'],
    heads: ['Otterly', 'Waddles', 'Hippobot', 'Quilliam', 'Bearington', 'Slothy', 'Nutsby', 'Capy', 'Moochi', 'Pudge'],
    mods: ['Baby', 'Pygmy', 'Fluffy', 'Tiny', 'Angry', 'Chunky', 'Sleepy', 'Wild'],
    tails: ['Coin', 'Gang', 'Club', 'Zoo'],
    lore: [
      'the internet\'s newest favorite zoo animal',
      'small, round and unreasonably bullish',
      'the zookeepers lost control of this one',
      'too cute to sell',
    ],
  },
  {
    id: 'music',
    name: 'Music',
    glyph: '🎵',
    glyphs: ['🎵', '🎸', '🎧', '🥁', '🎹'],
    heads: ['Bassline', 'Drop', 'Mixtape', 'Riff', 'Encore', 'Banger', 'Vinyl', 'Remix', 'Kazoo', 'Synth'],
    mods: ['Lofi', 'Heavy', 'Platinum', 'Underground', 'Infinite', 'Midnight', 'Funky', 'Loud'],
    tails: ['Records', 'Beats', 'Tour', 'Wave'],
    lore: [
      'every buy is a beat, every sell is a skipped track',
      'the drop is coming',
      'on repeat in every trench',
      'a mixtape so hot it melted the bonding curve',
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    glyph: '⚽',
    glyphs: ['⚽', '🏀', '🥊', '🏈', '🏆', '⛳'],
    heads: ['Slam Dunk', 'Hat Trick', 'Knockout', 'Buzzer', 'Touchdown', 'Underdog', 'Benchwarmer', 'Hail Mary', 'Photo Finish', 'Overtime'],
    mods: ['Clutch', 'MVP', 'Rookie', 'Undefeated', 'Golden', 'Final Round', 'Home Team', 'Penalty'],
    tails: ['FC', 'Club', 'League', 'Cup'],
    lore: [
      'the underdog of the league, with a clutch chart',
      'down two scores at halftime and still holding',
      'a buzzer beater from the trenches',
      'the crowd is chanting the ticker',
    ],
  },
  {
    id: 'absurd',
    name: 'Absurd',
    glyph: '🥔',
    glyphs: ['🥔', '🧦', '🪑', '🫠', '🧻', '🪨'],
    heads: ['Potato', 'Lost Sock', 'Chair', 'Rock', 'Spoon', 'Traffic Cone', 'Toaster', 'Doorknob', 'Brick', 'Rubber Duck'],
    mods: ['Just A', 'Emotional', 'Sentient', 'Haunted', 'Angry', 'Mildly', 'Forgotten', 'Literally'],
    tails: ['Coin', 'Token', 'Movement', 'Thing'],
    lore: [
      'it is just a potato and that is the whole point',
      'nobody knows why this exists, everybody holds it',
      'a movement with no leader, no plan and no exit',
      'zero utility, maximum conviction',
    ],
  },
];

const BY_ID = new Map(NARRATIVES.map((n) => [n.id, n]));
const BY_NAME = new Map(NARRATIVES.map((n) => [n.name, n]));

export function narrativeById(id: string): NarrativeDef | undefined {
  return BY_ID.get(id);
}

/** Lookup by display name, i.e. the value stored on TokenState.narrative. */
export function narrativeByName(name: string): NarrativeDef | undefined {
  return BY_NAME.get(name);
}

/** Logo glyphs a user launch may pick: every narrative glyph, tagging the token with that (first) narrative. */
export const LAUNCH_GLYPHS: ReadonlyMap<string, NarrativeDef> = (() => {
  const glyphs = new Map<string, NarrativeDef>();
  for (const n of NARRATIVES) for (const g of [n.glyph, ...n.glyphs]) if (!glyphs.has(g)) glyphs.set(g, n);
  return glyphs;
})();
export const DEFAULT_LAUNCH_GLYPH = '🚀';

export interface TokenMeta {
  name: string;
  symbol: string;
  description: string;
  logoGlyph: string;
  logoSeed: string;
  narrative: string;
}

const CLOSERS = [
  'Fair launch. No presale. No promises.',
  'Community owned from block one.',
  'No roadmap, just vibes.',
  'Dev is a {chain} native who never sleeps.',
  'Join the community and bring memes.',
  'LP burns on graduation.',
  'Not financial advice, just a {head} with a dream.',
  '',
];

/**
 * Tickers generated names never reuse and launches may not take: well-known real memecoins (and a
 * listed stock), the chains' native and stable assets, and our own brand.
 */
export const RESERVED_TICKERS: ReadonlySet<string> = new Set([
  'ACT', 'BOME', 'BONK', 'BRETT', 'COIN', 'DOGE', 'FLOKI', 'GIGA', 'GOAT', 'MEW', 'MICHI', 'MOG', 'MYRO', 'NEIRO',
  'PENGU', 'PEPE', 'PNUT', 'PONKE', 'POPCAT', 'SAMO', 'SHIB', 'SLERF', 'TOSHI', 'TRUMP', 'TURBO', 'WIF', 'WOJAK',
  'SOL', 'ETH', 'BNB', 'USDC', 'USDT', 'WETH', 'TRENCH', 'TRENCHSCOPE',
]);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tickerCase(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Ticker from the name's words: initials, a blend, or (mostly) the distinctive
 * `core` word, so a generic tail ("Coin", "Club") never becomes the whole ticker.
 */
function symbolFrom(rng: Rng, words: string[], core: string): string {
  const letters = words.map(tickerCase).filter(Boolean);
  const last = letters[letters.length - 1] ?? 'MEME';
  const main = tickerCase(core) || last;
  const roll = rng.next();
  let sym: string;
  if (letters.length > 1 && roll < 0.3) sym = letters.map((w) => w[0]).join('') + (letters.length < 3 ? last.slice(1, 3) : '');
  else if (letters.length > 1 && roll < 0.45) sym = (letters[0].slice(0, 3) + last.slice(0, 3)).slice(0, 6);
  else sym = main.length <= 6 ? main : main.slice(0, rng.int(3, 5));
  if (sym.length < 2) sym = main.slice(0, 4);
  if (RESERVED_TICKERS.has(sym)) sym = [3, 4, 5, 6].map((n) => main.slice(0, n)).find((s) => !RESERVED_TICKERS.has(s)) ?? `${sym.slice(0, 5)}X`;
  return sym;
}

/** Random avatar seed. */
export function seedString(rng: Rng, len = 10): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(rng.next() * 36).toString(36);
  return s;
}

/** Fresh, original identity for a launch in the given narrative. */
export function generateTokenMeta(rng: Rng, narrative: NarrativeDef, chainName: string): TokenMeta {
  const head = rng.pick(narrative.heads);
  const pattern = rng.next();
  let words: string[];
  let core = head;
  if (pattern < 0.3) words = [rng.pick(narrative.mods), head];
  else if (pattern < 0.55) words = [head, rng.pick(narrative.tails)];
  else if (pattern < 0.75) words = [head];
  else if (pattern < 0.88) {
    core = rng.pick(narrative.mods) + head.split(' ')[0];
    words = [core];
  } else words = ['The', rng.pick(narrative.mods), head];
  const name = words.join(' ');
  const symbol = symbolFrom(rng, words.filter((w) => w !== 'The'), core);
  const closer = rng.pick(CLOSERS).replace('{chain}', chainName).replace('{head}', head.toLowerCase());
  const lore = rng.pick(narrative.lore);
  const description = `${name} ($${symbol}). ${lore.charAt(0).toUpperCase()}${lore.slice(1)}. ${closer}`.trim();
  return {
    name,
    symbol,
    description,
    logoGlyph: rng.pick(narrative.glyphs),
    logoSeed: seedString(rng),
    narrative: narrative.name,
  };
}

/** A copycat reuses a hot token's name, ticker and image. */
export function copycatMeta(rng: Rng, source: TokenMeta): TokenMeta {
  const { name, symbol, logoGlyph, logoSeed, narrative } = source;
  const description = rng.chance(0.5) ? source.description : `The real ${name}. Ignore the fakes. $${symbol}`;
  return { name, symbol, description, logoGlyph, logoSeed, narrative };
}

const TLDS = ['fun', 'xyz', 'meme', 'lol', 'io', 'wtf', 'vip', 'club'];

export interface SocialProfile {
  socials: Socials;
  xFollowers: number | null;
}

/**
 * Fictional socials. `density` 0..1 scales how likely each link is present;
 * `donor` reuses another token's links (copy-pasted socials of low-effort launches).
 */
export function makeSocials(rng: Rng, meta: Pick<TokenMeta, 'name' | 'symbol'>, density: number, followersMedian: number, donor?: Socials): SocialProfile {
  if (donor && rng.chance(0.6)) return { socials: { ...donor }, xFollowers: donor.twitter ? Math.round(rng.lognormal(followersMedian, 1)) : null };
  const base = slug(meta.name).slice(0, 18) || slug(meta.symbol);
  const socials: Socials = {};
  if (rng.chance(density)) socials.twitter = `https://x.com/${rng.chance(0.5) ? base : `${slug(meta.symbol)}_${rng.pick(['coin', 'official', 'onchain', 'hq', 'cto'])}`}`;
  if (rng.chance(density * 0.8)) socials.telegram = `https://t.me/${base}${rng.pick(['portal', 'entry', 'chat', 'official', ''])}`;
  if (rng.chance(density * 0.6)) socials.website = `https://${base}.${rng.pick(TLDS)}`;
  return { socials, xFollowers: socials.twitter ? Math.max(12, Math.round(rng.lognormal(followersMedian, 1.1))) : null };
}

/** Community-takeover socials: new community-run accounts. */
export function ctoSocials(rng: Rng, meta: Pick<TokenMeta, 'name' | 'symbol'>): Socials {
  const base = slug(meta.symbol) || slug(meta.name).slice(0, 12);
  return {
    twitter: `https://x.com/${base}_cto`,
    telegram: `https://t.me/${base}cto${rng.pick(['', 'portal', 'community'])}`,
  };
}

/** Fictional KOL personas (handles are invented; never real people). */
export const KOL_HANDLES: string[] = [
  '@moonmaxi', 'Pepe Lord', '0xSnipe', '@trenchwizard', 'Candle Captain', '@rugradar', 'Bag Whisperer', '@gaslessgwen',
  'Ape Theory', '@liquidlarry', 'Meme Marauder', '@bondingbilly', 'Chart Monk', '@floorfinder', 'Jeet Slayer', '@slippagesam',
  'Wick Hunter', '@degendelphi', '0xNapkin', '@mooncellar', 'Ledger Lynx', '@alphaotter', 'Sol Sensei', '@curvecrusher',
  'Pump Prophet', '@thetrenchrat', 'Gem Goblin', '@midcapmarta', 'Rotation Rex', '@bagsofbagel', '0xMango', '@lowcapleo',
  'Volume Viking', '@nightshiftape', 'Degen Dolores', '@ser_sniper', 'Mint Mystic', '@bluefinbets', 'Rug Medic', '@hodlhazel',
  '@exitliqeli', 'Tick Tock Trader', '@fomofelix', 'Granola Gains', '@wenlambowalt', '0xPigeon', '@copepilot', 'Paper Hands Pam',
  '@diamondduck', 'Stoic Shiller', '@memeorologist', 'Basis Point Bea', '@gigabrainglen', 'Kek Commander', '@shillsergeant', 'Lunar Lenny',
  '@ratiorider', '0xTurnip', '@alphaleakz', 'Narrative Nomad', '@cabalcarl', 'Snipe Sorceress', '@bondingbandit', 'Greenline Gus',
  '@sendooor', 'Tendie Tycoon', '@pandapump', 'Mooncake Mia', '@trenchtourist', '0xWaffle', '@onchainoracle', 'Laser Eyes Lou',
  '@airdropangel', 'Vibe Validator', '@megaphonemax', 'Dip Diver', '@kekwkiwi', 'Cowboy Candles', '@flipflopfrank', 'Max Pain Mo',
  '@runnerradar', '0xBiscuit', '@parabolicpia', 'Hype Hermit', '@tokentinker', 'Midnight Minter', '@solstitch', 'Base Camp Benny',
  '@bnbbaron', 'Gas Goblin', '@ethernauted', 'Rocket Rina', '@lilwhalewatch', 'Bull Flag Bart', '@nofadefi', 'Pixel Prophet',
  '@chadcandle', 'Zero To Hero Zed', '@alphaalpaca', 'Meta Mage', '@deepbidsdana', '0xNoodle',
];

export function funderLabel(index: number): string {
  return `SimEx Hot Wallet ${index + 1}`;
}
