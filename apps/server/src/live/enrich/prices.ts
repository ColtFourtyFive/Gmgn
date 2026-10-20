// USD prices from Jupiter Price API v3 (GET <base>/price/v3?ids=<mint>,<mint>):
//   { "<mint>": { "usdPrice": 187.2, "blockId": 123, "decimals": 9, "priceChange24h": -1.3, "liquidity": 1.2e9 }, ... }
// Mints Jupiter cannot price are simply absent. The ticker refreshes SOL/USD
// (world.setNativeUsd) about every 30 s, plus the prices of tracked tokens no
// feed streams (tokens from other venues that someone holds or watches).

import { WSOL_MINT } from '@trenchscope/shared';
import { z } from 'zod';
import { fetchServiceJson, type FetchFn } from './http';

export interface JupiterPrice {
  usdPrice: number;
  decimals: number | null;
  liquidity: number | null;
  priceChange24h: number | null;
}

/** Jupiter answers at most this many ids per request. */
export const PRICE_IDS_PER_REQUEST = 50;

const entry = z
  .object({
    usdPrice: z.number().finite().positive(),
    decimals: z.number().int().min(0).max(255).nullish(),
    liquidity: z.number().finite().nonnegative().nullish(),
    priceChange24h: z.number().finite().nullish(),
  })
  .passthrough();

export interface JupiterOptions {
  baseUrl: string;
  apiKey?: string | null;
  fetch?: FetchFn;
  timeoutMs?: number;
}

/** Prices of up to any number of mints (chunked); entries that fail validation are skipped. */
export async function fetchJupiterPrices(ids: string[], opts: JupiterOptions): Promise<Map<string, JupiterPrice>> {
  const out = new Map<string, JupiterPrice>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += PRICE_IDS_PER_REQUEST) {
    const chunk = unique.slice(i, i + PRICE_IDS_PER_REQUEST);
    const url = `${opts.baseUrl.replace(/\/+$/, '')}/price/v3?ids=${chunk.map(encodeURIComponent).join(',')}`;
    const json = await fetchServiceJson(url, {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs ?? 5000,
      maxBytes: 512 * 1024,
      headers: opts.apiKey ? { 'x-api-key': opts.apiKey } : undefined,
    });
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('unexpected price response');
    for (const id of chunk) {
      const r = entry.safeParse((json as Record<string, unknown>)[id]);
      if (!r.success) continue;
      out.set(id, { usdPrice: r.data.usdPrice, decimals: r.data.decimals ?? null, liquidity: r.data.liquidity ?? null, priceChange24h: r.data.priceChange24h ?? null });
    }
  }
  return out;
}

export interface PriceTickerOptions extends JupiterOptions {
  everyMs?: number;
  /** Other mints to price on each pass. */
  extraIds?: () => string[];
  onNativeUsd: (usd: number) => void;
  onPrices?: (prices: Map<string, JupiterPrice>) => void;
  log?: Pick<Console, 'warn'>;
}

/** Refreshes SOL/USD (and extra mints) on a timer; the first pass runs at start. */
export class PriceTicker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private failures = 0;
  lastOkAt: number | null = null;
  lastSolUsd: number | null = null;

  constructor(private readonly opts: PriceTickerOptions) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.everyMs ?? 30_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One refresh (exposed for tests). */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const extra = (this.opts.extraIds?.() ?? []).filter((id) => id !== WSOL_MINT);
      const prices = await fetchJupiterPrices([WSOL_MINT, ...extra], this.opts);
      const sol = prices.get(WSOL_MINT);
      // A sane band: a broken upstream must not reprice every SOL amount in the app.
      if (sol && sol.usdPrice > 1 && sol.usdPrice < 100_000) {
        this.lastSolUsd = sol.usdPrice;
        this.opts.onNativeUsd(sol.usdPrice);
      }
      prices.delete(WSOL_MINT);
      if (prices.size > 0) this.opts.onPrices?.(prices);
      this.lastOkAt = Date.now();
      this.failures = 0;
    } catch (err) {
      // Log the first failure and then every 20th, not every 30 s while an outage lasts.
      if (this.failures++ % 20 === 0) this.opts.log?.warn(`[live] price refresh failed: ${err instanceof Error ? err.message : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
