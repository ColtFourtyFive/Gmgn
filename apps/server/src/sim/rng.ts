// Seeded, fast PRNG (sfc32) plus distribution helpers. Every stochastic
// decision in the simulator flows through an Rng so runs are reproducible.

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string = 1) {
    let h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    // splitmix32 to expand the seed into four words
    const next = () => {
      h = (h + 0x9e3779b9) | 0;
      let z = h;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  float(min = 0, max = 1): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.float(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal with given median and log-space sigma. */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma));
  }

  /** Exponential with given mean. */
  exp(mean: number): number {
    let u = 0;
    while (u === 0) u = this.next();
    return -Math.log(u) * mean;
  }

  /** Poisson-distributed count (Knuth for small lambda, normal approx for large). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Serializable state for snapshots. */
  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const HEX = '0123456789abcdef';

/** Solana-style base58 address (32-44 chars). Optional vanity suffix (e.g. "pump"-style). */
export function base58Address(rng: Rng, length = 44, suffix = ''): string {
  let s = '';
  const n = length - suffix.length;
  for (let i = 0; i < n; i++) s += B58[Math.floor(rng.next() * 58)];
  return s + suffix;
}

/** EVM-style 0x address. Optional vanity suffix (hex). */
export function evmAddress(rng: Rng, suffix = ''): string {
  let s = '0x';
  const n = 40 - suffix.length;
  for (let i = 0; i < n; i++) s += HEX[Math.floor(rng.next() * 16)];
  return s + suffix;
}

export function txHash(rng: Rng, style: 'base58' | 'evm'): string {
  if (style === 'evm') {
    let s = '0x';
    for (let i = 0; i < 64; i++) s += HEX[Math.floor(rng.next() * 16)];
    return s;
  }
  return base58Address(rng, 88);
}
