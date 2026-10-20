// Narrative (meta) of a real token from its name, symbol and description, by
// keyword, into the platform's NARRATIVES (sim/names.ts) so live tokens group
// into the same narrative lists the simulator uses. Unmatched tokens get no
// narrative ('') rather than a guess.

import { DEFAULT_LAUNCH_GLYPH, NARRATIVES, narrativeById } from '../../sim/names';

/** Keywords per narrative id (lower case; matched as whole words or as a word's prefix when >= 4 letters). */
const KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'agent', 'agents', 'agi', 'gpt', 'llm', 'neural', 'robot', 'bot', 'cyborg', 'android', 'sentient', 'machine', 'algorithm', 'compute', 'openai', 'claude', 'grok'],
  cats: ['cat', 'cats', 'kitty', 'kitten', 'meow', 'purr', 'feline', 'neko', 'popcat', 'mew'],
  dogs: ['dog', 'dogs', 'doge', 'doggo', 'inu', 'shib', 'shiba', 'puppy', 'pup', 'woof', 'corgi', 'pug', 'wif', 'bonk', 'husky'],
  frogs: ['frog', 'frogs', 'pepe', 'toad', 'ribbit', 'kek', 'froggy', 'apu'],
  politics: ['trump', 'maga', 'biden', 'president', 'election', 'vote', 'senate', 'congress', 'kamala', 'politics', 'potus', 'republican', 'democrat', 'governor', 'tariff', 'doge.gov'],
  anime: ['anime', 'waifu', 'senpai', 'kawaii', 'manga', 'chan', 'kun', 'otaku', 'chibi', 'sama'],
  celebs: ['elon', 'musk', 'kanye', 'drake', 'taylor', 'swift', 'celebrity', 'celeb', 'famous', 'kardashian', 'snoop', 'mrbeast'],
  gaming: ['game', 'games', 'gamer', 'gaming', 'pixel', 'arcade', 'minecraft', 'nintendo', 'mario', 'sonic', 'roblox', 'fortnite', 'esports', 'player'],
  food: ['food', 'pizza', 'burger', 'taco', 'sushi', 'cheese', 'bread', 'donut', 'banana', 'pasta', 'coffee', 'cookie', 'noodle', 'ramen', 'fries', 'cake', 'milk', 'egg', 'bacon', 'chicken', 'fruit'],
  space: ['moon', 'mars', 'rocket', 'space', 'galaxy', 'star', 'stars', 'astro', 'astronaut', 'nasa', 'alien', 'ufo', 'planet', 'cosmic', 'orbit', 'saturn', 'jupiter', 'comet'],
  memes: ['meme', 'memes', 'wojak', 'chad', 'based', 'troll', 'lol', 'lmao', 'npc', 'gigachad', 'stonks', 'cope', 'seethe', 'rizz', 'sigma', 'skibidi', 'brainrot'],
  desci: ['desci', 'science', 'dna', 'gene', 'genome', 'biotech', 'research', 'longevity', 'lab', 'molecule', 'neuron', 'cell', 'protein'],
  animals: ['otter', 'monkey', 'ape', 'apes', 'bear', 'bull', 'penguin', 'fish', 'whale', 'hamster', 'capybara', 'goat', 'duck', 'bird', 'owl', 'fox', 'wolf', 'tiger', 'lion', 'panda', 'koala', 'rabbit', 'bunny', 'hippo', 'moodeng', 'shark', 'turtle', 'snake', 'horse', 'pig', 'cow', 'sloth', 'squirrel', 'raccoon', 'beaver', 'seal'],
  music: ['music', 'song', 'beat', 'beats', 'rap', 'rapper', 'dj', 'rock', 'sing', 'singer', 'album', 'melody', 'guitar', 'drum', 'hiphop', 'concert'],
  sports: ['football', 'soccer', 'nba', 'nfl', 'sport', 'sports', 'goal', 'basketball', 'baseball', 'tennis', 'golf', 'boxing', 'ufc', 'olympic', 'olympics', 'f1', 'racing', 'champion'],
  absurd: ['potato', 'rock', 'chair', 'spoon', 'sock', 'brick', 'toaster', 'shoe', 'banana', 'stick', 'pebble', 'cardboard', 'nothing', 'void'],
};

/** Name / symbol hits count three times a description hit. */
const TITLE_WEIGHT = 3;

const WORD = /[a-z0-9]+(?:\.[a-z]+)?/g;

function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

function score(tokens: string[], keywords: Set<string>, prefixes: string[]): number {
  let n = 0;
  for (const w of tokens) {
    if (keywords.has(w)) n++;
    else if (w.length > 4 && prefixes.some((p) => w.startsWith(p))) n++;
  }
  return n;
}

const INDEX = NARRATIVES.map((n) => {
  const list = KEYWORDS[n.id] ?? [];
  return { id: n.id, name: n.name, keywords: new Set(list), prefixes: list.filter((k) => k.length >= 4) };
});

export interface NarrativeMatch {
  /** NARRATIVES display name, or '' when nothing matched. */
  narrative: string;
  glyph: string;
}

/** Best narrative for a token; ties go to the earlier narrative in NARRATIVES. */
export function classifyNarrative(name: string, symbol: string, description = ''): NarrativeMatch {
  const title = [...words(name), ...words(symbol)];
  const body = words(description).slice(0, 200);
  let best: { id: string; name: string; s: number } | null = null;
  for (const n of INDEX) {
    const s = TITLE_WEIGHT * score(title, n.keywords, n.prefixes) + score(body, n.keywords, n.prefixes);
    if (s > 0 && (!best || s > best.s)) best = { id: n.id, name: n.name, s };
  }
  if (!best) return { narrative: '', glyph: DEFAULT_LAUNCH_GLYPH };
  return { narrative: best.name, glyph: narrativeById(best.id)?.glyph ?? DEFAULT_LAUNCH_GLYPH };
}
