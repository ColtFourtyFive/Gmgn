// Optional KOL labels for real wallets, from a JSON file the operator curates
// (LIVE_KOL_FILE): [{ "address": "<base58>", "name": "Ansem", "twitter": "blknoiz06" }, ...].
// Labelled wallets carry the 'kol' tag and their name as the public label, are
// never swept from the World, and their trades are streamed (account trades).

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { BASE58_ADDRESS, cleanText } from './sanitize';

export interface KolEntry {
  address: string;
  name: string;
  /** X profile URL, when given. */
  twitter: string | null;
}

/** Labels beyond this many are ignored (each one is a streamed account). */
export const MAX_KOLS = 1000;

const entrySchema = z.object({
  address: z.string().regex(BASE58_ADDRESS),
  name: z.string().min(1).max(200),
  twitter: z.string().max(200).nullish(),
});

/** Parse the KOL list; invalid entries are skipped (and counted), duplicates keep the first. */
export function parseKolList(json: unknown): { entries: KolEntry[]; skipped: number } {
  const entries: KolEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  if (!Array.isArray(json)) return { entries, skipped: 1 };
  for (const raw of json) {
    const r = entrySchema.safeParse(raw);
    const name = r.success ? cleanText(r.data.name, 40) : '';
    if (!r.success || !name || seen.has(r.data.address) || entries.length >= MAX_KOLS) {
      skipped++;
      continue;
    }
    seen.add(r.data.address);
    const handle = r.data.twitter ? cleanText(r.data.twitter, 60).replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '') : '';
    entries.push({ address: r.data.address, name, twitter: /^[A-Za-z0-9_]{1,30}$/.test(handle) ? `https://x.com/${handle}` : null });
  }
  return { entries, skipped };
}

/** Read the KOL file (null path = no labels). A missing or broken file is logged, not fatal. */
export function loadKolFile(path: string | null, log: Pick<Console, 'warn' | 'info'> = console): KolEntry[] {
  if (!path) return [];
  try {
    const { entries, skipped } = parseKolList(JSON.parse(readFileSync(path, 'utf8')));
    log.info(`[live] ${entries.length} KOL labels loaded${skipped ? ` (${skipped} invalid entries skipped)` : ''}`);
    return entries;
  } catch (err) {
    log.warn(`[live] cannot read LIVE_KOL_FILE: ${err instanceof Error ? err.message : 'error'}`);
    return [];
  }
}
