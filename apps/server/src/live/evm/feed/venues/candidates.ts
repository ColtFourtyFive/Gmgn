// New pools paired with the native asset that no launchpad claimed: "new
// pairs" of tokens launched straight into a DEX. Most fresh pools never trade
// (or are spam), so a pool is only listed once it has traded `minSwaps` times
// for at least `minVolume` native within its first hours.

import { LruMap } from '../lru';
import type { Erc20Info } from '../metadata';
import type { AmmPool } from '../pools';
import type { FeedContext } from './types';

export interface Candidate {
  pool: AmmPool;
  /** Sender of the pool's creation transaction (the deployer, usually). */
  creator: string | null;
  /** Raw native volume and swap count so far. */
  volume: bigint;
  swaps: number;
}

export interface CandidateRules {
  /** Native (raw) volume before listing. */
  minVolume: bigint;
  minSwaps: number;
  /** How long a pool may take to qualify. */
  ttlMs: number;
  cap: number;
}

export class PairCandidates {
  private readonly map: LruMap<string, Candidate>;

  constructor(readonly rules: CandidateRules) {
    this.map = new LruMap(rules.cap);
  }

  get size(): number {
    return this.map.size;
  }

  add(c: Candidate): void {
    this.map.set(c.pool.id, c);
  }

  get(id: string): Candidate | undefined {
    return this.map.peek(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  delete(id: string): void {
    this.map.delete(id);
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  /** The candidate pool of a token, if any. */
  forToken(token: string): Candidate | undefined {
    for (const c of this.map.values()) if (c.pool.token === token) return c;
    return undefined;
  }

  expire(now: number): void {
    for (const [id, c] of [...this.map.entries()]) if (now - c.pool.createdAt > this.rules.ttlMs) this.map.delete(id);
  }
}

/** Index of the swap (raw native volumes, in order) that meets the listing rules, or -1. */
export function qualifiesAt(rules: { minVolume: bigint; minSwaps: number }, volume: bigint, swaps: number, volumes: bigint[]): number {
  let vol = volume;
  let n = swaps;
  for (let i = 0; i < volumes.length; i++) {
    vol += volumes[i];
    n++;
    if (n >= rules.minSwaps && vol >= rules.minVolume) return i;
  }
  return -1;
}

/**
 * Candidates whose swaps this window qualify them for listing: loads their
 * metadata (dropping excluded tokens) and flags the qualifying swap and the
 * ones after it as trades. Returns the listing metadata by pool id.
 */
export async function preparePromotions(
  groups: Map<string, { token: string; volume: bigint; swaps: number; window: { volume: bigint; event: { trade?: boolean } }[] }>,
  rules: { minVolume: bigint; minSwaps: number },
  ctx: FeedContext,
): Promise<Map<string, Erc20Info>> {
  const promote: { id: string; token: string; from: number; events: { trade?: boolean }[] }[] = [];
  for (const [id, g] of groups) {
    if (g.window.length === 0) continue;
    const at = qualifiesAt(
      rules,
      g.volume,
      g.swaps,
      g.window.map((w) => w.volume),
    );
    if (at >= 0) promote.push({ id, token: g.token, from: at, events: g.window.map((w) => w.event) });
  }
  const out = new Map<string, Erc20Info>();
  if (promote.length === 0) return out;
  const erc20 = await ctx.meta.erc20(promote.map((p) => p.token));
  await ctx.screen(
    promote.map((p) => p.token),
    erc20,
  );
  for (const p of promote) {
    const info = erc20.get(p.token);
    if (!info || ctx.isExcluded(p.token) || ctx.token(p.token)) continue;
    out.set(p.id, info);
    for (let i = p.from; i < p.events.length; i++) p.events[i].trade = true;
  }
  return out;
}
