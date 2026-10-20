// Fuzzy matching for the command palette: case-insensitive subsequence
// search that rewards word starts, consecutive runs and early matches, so
// "np" finds "New Pairs" before "Sniper" and "set" ranks "Settings" first.

export interface FuzzyMatch {
  /** Higher is better; only comparable between matches of the same pattern. */
  score: number;
  /** Matched character positions in the text (for highlighting). */
  indices: number[];
}

const MATCH = 1;
const WORD_START = 6;
const TEXT_START = 3;
const CONSECUTIVE = 4;
/** Cost per skipped character between two matched characters. */
const GAP = 0.15;
/** Cost per character before the first match (capped). */
const LEADING = 0.1;
const LEADING_MAX = 3;
/** Tie-breaker: shorter texts win among otherwise equal matches. */
const LENGTH = 0.02;

const SEPARATOR = /[\s\-_/.:·,()[\]$@#]/;

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  const c = text[i];
  if (SEPARATOR.test(prev)) return true;
  // camelCase and letter→digit transitions: "NewPairs", "PEPE2".
  return (/[a-z]/.test(prev) && /[A-Z]/.test(c)) || (/\D/.test(prev) && /\d/.test(c));
}

/**
 * Best way to match `pattern` as a subsequence of `text` (null when it does
 * not occur). Dynamic programming over (pattern char, text position) with an
 * affine gap, O(pattern × text).
 */
export function fuzzyMatch(pattern: string, text: string): FuzzyMatch | null {
  const p = pattern.toLowerCase();
  const t = text.toLowerCase();
  const m = p.length;
  const n = t.length;
  if (m === 0) return { score: 0, indices: [] };
  if (m > n) return null;

  const bonus = new Float64Array(n);
  for (let j = 0; j < n; j++) bonus[j] = MATCH + (isWordStart(text, j) ? WORD_START : 0) + (j === 0 ? TEXT_START : 0);

  // score[i * n + j]: best score with pattern[i] matched at text[j]; from[]: predecessor position.
  const score = new Float64Array(m * n).fill(-Infinity);
  const from = new Int32Array(m * n).fill(-1);
  for (let j = 0; j < n; j++) if (t[j] === p[0]) score[j] = bonus[j] - Math.min(j * LEADING, LEADING_MAX);

  for (let i = 1; i < m; i++) {
    const prev = (i - 1) * n;
    const row = i * n;
    // Best predecessor at k <= j - 2, decayed by GAP per skipped character.
    let run = -Infinity;
    let runAt = -1;
    for (let j = 1; j < n; j++) {
      if (j >= 2) {
        const cand = score[prev + j - 2];
        if (cand >= run - GAP) {
          run = cand;
          runAt = j - 2;
        } else run -= GAP;
      }
      if (t[j] !== p[i]) continue;
      const adjacent = score[prev + j - 1] + CONSECUTIVE;
      const gapped = run - GAP;
      if (adjacent === -Infinity && gapped === -Infinity) continue;
      if (adjacent >= gapped) {
        score[row + j] = bonus[j] + adjacent;
        from[row + j] = j - 1;
      } else {
        score[row + j] = bonus[j] + gapped;
        from[row + j] = runAt;
      }
    }
  }

  const last = (m - 1) * n;
  let best = -Infinity;
  let end = -1;
  for (let j = 0; j < n; j++) {
    if (score[last + j] > best) {
      best = score[last + j];
      end = j;
    }
  }
  if (end < 0) return null;
  const indices = new Array<number>(m);
  for (let i = m - 1, j = end; i >= 0; i--) {
    indices[i] = j;
    j = from[i * n + j];
  }
  return { score: best - (n - m) * LENGTH, indices };
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** Highlight positions in the item's first field (its title). */
  indices: number[];
}

/** Matches in secondary fields (subtitle, keywords) count a little less than title matches. */
const SECONDARY_WEIGHT = 0.8;

/**
 * Rank items for a free-text query. Every whitespace-separated term must
 * match one of the item's fields (the first one is the title); the item's
 * score is the sum of its terms' best matches. An empty query keeps all
 * items in their original order; ties keep the original order too.
 */
export function fuzzyRank<T>(query: string, items: readonly T[], fields: (item: T) => readonly string[]): Ranked<T>[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items.map((item) => ({ item, score: 0, indices: [] }));
  const ranked: (Ranked<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    const fs = fields(item);
    let total = 0;
    const highlight = new Set<number>();
    for (const term of terms) {
      let best = -Infinity;
      let bestTitle: FuzzyMatch | null = null;
      for (let f = 0; f < fs.length; f++) {
        const match = fuzzyMatch(term, fs[f]);
        if (!match) continue;
        const s = f === 0 ? match.score : match.score * SECONDARY_WEIGHT;
        if (s > best) {
          best = s;
          bestTitle = f === 0 ? match : null;
        }
      }
      if (best === -Infinity) return;
      total += best;
      if (bestTitle) for (const i of bestTitle.indices) highlight.add(i);
    }
    ranked.push({ item, score: total, indices: [...highlight].sort((a, b) => a - b), order });
  });
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.map(({ item, score, indices }) => ({ item, score, indices }));
}
