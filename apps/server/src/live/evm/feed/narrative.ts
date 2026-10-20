// Narrative (meta) and logo glyph for a real token, from keywords in its name,
// symbol and description, using the simulator's narrative catalogue so live
// tokens group under the same narratives the UI already knows.

import { NARRATIVES, narrativeById } from '../../../sim/names';

const KEYWORDS: [id: string, words: RegExp][] = [
  ['ai', /\b(ai|agent|agents|gpt|llm|bot|neural|robot|agi|claude|grok|cyborg|android)\b/i],
  ['cats', /\b(cat|cats|kitty|kitten|meow|purr|neko|popcat|mew)\b/i],
  ['dogs', /\b(dog|dogs|doge|inu|shib|puppy|pup|woof|bonk|corgi|shiba|wif)\b/i],
  ['frogs', /\b(frog|pepe|toad|ribbit|kek)\b/i],
  ['politics', /\b(trump|maga|biden|president|elon|vote|election|kamala|congress|senate|politic\w*|america|usa)\b/i],
  ['anime', /\b(anime|waifu|chan|kun|senpai|manga|otaku|kawaii|sensei)\b/i],
  ['gaming', /\b(game|gaming|gamer|pixel|arcade|play|quest|minecraft|nintendo|xbox)\b/i],
  ['food', /\b(food|pizza|burger|taco|sushi|coffee|cookie|cake|banana|apple|ramen|bread|donut)\b/i],
  ['space', /\b(moon|mars|space|rocket|astro\w*|galaxy|alien|ufo|nasa|orbit|star)\b/i],
  ['desci', /\b(desci|science|bio|gene|dna|lab|research|longevity|neuro)\b/i],
  ['music', /\b(music|song|beat|dj|rap|rapper|album|guitar|piano|vibe)\b/i],
  ['sports', /\b(sport|football|soccer|nba|nfl|basketball|tennis|golf|f1|racing|ufc|boxing)\b/i],
  ['animals', /\b(otter|penguin|monkey|ape|bear|bull|fish|bird|duck|hippo|panda|goat|horse|whale|shark|tiger|lion|wolf|fox|rabbit|bunny|hamster)\b/i],
  ['celebs', /\b(celeb|celebrity|kanye|drake|taylor|swift|kardashian|mrbeast)\b/i],
  ['memes', /\b(meme|memes|lol|wojak|chad|based|gigachad|troll|nyan)\b/i],
];

/** The narrative display name and a glyph from it, defaulting to Classic Memes. */
export function classifyNarrative(name: string, symbol: string, description: string): { narrative: string; glyph: string } {
  const text = `${name} ${symbol} ${description}`.slice(0, 800);
  for (const [id, re] of KEYWORDS) {
    if (re.test(text)) {
      const n = narrativeById(id);
      if (n) return { narrative: n.name, glyph: n.glyph };
    }
  }
  const fallback = narrativeById('memes') ?? NARRATIVES[0];
  return { narrative: fallback.name, glyph: fallback.glyph };
}
