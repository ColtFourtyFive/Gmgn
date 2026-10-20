// Token metadata JSON (the `uri` a launch registers): image, description and
// social links. Fetched through fetchPublicJson (https only, public hosts, 8 s a
// URL, 256 KB, JSON only); ipfs:// URIs and IPFS gateway links go through the
// configured gateways in turn.
// Everything taken from the JSON is sanitised: text loses control characters
// and is length capped, and only public https image / social URLs survive.
// A small worker pool drains a bounded queue; results are cached per URI.

import type { Socials } from '@trenchscope/shared';
import { FetchRefused, fetchPublicJson, type FetchFn, type HostLookup } from './http';
import { cleanText, ipfsPathOf, ipfsToGateway, publicHttpsUrl, safeImageUrl, safeSocial } from './sanitize';

export interface TokenMetadata {
  description: string;
  imageUrl: string | null;
  socials: Socials;
}

const MAX_DESCRIPTION = 600;
/**
 * Per candidate URL. Measured on mainnet metadata (October 2026): ipfs.filebase.io answers in
 * ~0.3-0.5 s, gateway.pinata.cloud in 3.7-6.8 s, so 5 s would cut the fallback off half the time.
 */
export const METADATA_TIMEOUT_MS = 8000;

/**
 * Candidate https URLs for a metadata URI (gateways in order for IPFS), or [] when it cannot be fetched.
 * An https gateway link (pump.fun writes https://ipfs.io/ipfs/<cid>; path or subdomain style) is
 * tried on the configured gateways first and on its own host last: the public gateways metadata
 * names are retired one after another (ipfs.io and dweb.link stopped serving in September 2026,
 * cloudflare-ipfs.com and cf-ipfs.com no longer resolve).
 */
export function metadataUrls(uri: string, gateways: string[]): string[] {
  const raw = uri.trim();
  if (!raw) return [];
  const viaGateways = (cidPath: string) => gateways.map((g) => ipfsToGateway(`ipfs://${cidPath}`, [g])).filter((u): u is string => !!u);
  const ipfs = /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(raw)?.[1] ?? null;
  if (ipfs) return viaGateways(ipfs);
  const url = publicHttpsUrl(raw, 1024);
  if (!url) return [];
  const cidPath = ipfsPathOf(url);
  return [...new Set([...(cidPath ? viaGateways(cidPath) : []), url.href])];
}

/** The sanitised fields of a metadata JSON object (unknown shapes yield empty fields). */
export function sanitizeMetadata(json: unknown, gateways: string[]): TokenMetadata {
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const ext = obj.extensions && typeof obj.extensions === 'object' && !Array.isArray(obj.extensions) ? (obj.extensions as Record<string, unknown>) : {};
  const pick = (...vals: unknown[]) => vals.find((v) => typeof v === 'string' && v.trim() !== '');
  const socials: Socials = {};
  const twitter = safeSocial('twitter', pick(obj.twitter, ext.twitter, obj.x));
  const telegram = safeSocial('telegram', pick(obj.telegram, ext.telegram));
  const website = safeSocial('website', pick(obj.website, ext.website, obj.external_url));
  if (twitter) socials.twitter = twitter;
  if (telegram) socials.telegram = telegram;
  if (website) socials.website = website;
  return {
    description: cleanText(obj.description, MAX_DESCRIPTION),
    imageUrl: safeImageUrl(pick(obj.image, obj.image_url, obj.imageUrl, obj.icon), gateways),
    socials,
  };
}

export interface MetadataFetcherOptions {
  gateways: string[];
  fetch?: FetchFn;
  lookup?: HostLookup;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Fetch and sanitise one metadata URI, trying each candidate URL. Throws when none answers. */
export async function fetchTokenMetadata(uri: string, opts: MetadataFetcherOptions & { signal?: AbortSignal }): Promise<TokenMetadata> {
  const urls = metadataUrls(uri, opts.gateways);
  if (urls.length === 0) throw new FetchRefused('metadata uri is not fetchable');
  let last: unknown = null;
  for (const url of urls) {
    try {
      const json = await fetchPublicJson(url, { fetch: opts.fetch, lookup: opts.lookup, timeoutMs: opts.timeoutMs ?? METADATA_TIMEOUT_MS, maxBytes: opts.maxBytes ?? 256 * 1024, signal: opts.signal });
      return sanitizeMetadata(json, opts.gateways);
    } catch (err) {
      last = err;
      if (err instanceof FetchRefused && !/^https:\/\/[^/]+\/ipfs\//.test(url)) break;
    }
  }
  throw last instanceof Error ? last : new Error('metadata fetch failed');
}

export interface MetadataQueueStats {
  queued: number;
  fetched: number;
  failed: number;
  refused: number;
  dropped: number;
}

/**
 * Bounded FIFO of mints whose metadata to fetch, drained by `concurrency` workers. `apply`
 * receives each result (cached per URI so copycat launches sharing one URI cost one fetch).
 */
export class MetadataQueue {
  private readonly queue: { mint: string; uri: string }[] = [];
  private readonly queued = new Set<string>();
  private readonly cache = new Map<string, TokenMetadata | null>();
  private active = 0;
  private closed = false;
  private readonly ctrl = new AbortController();
  readonly stats: MetadataQueueStats = { queued: 0, fetched: 0, failed: 0, refused: 0, dropped: 0 };

  constructor(
    private readonly opts: MetadataFetcherOptions & {
      apply: (mint: string, meta: TokenMetadata) => void;
      concurrency?: number;
      maxQueue?: number;
      cacheSize?: number;
    },
  ) {}

  get pending(): number {
    return this.queue.length + this.active;
  }

  /** Queue a fetch; `urgent` jumps the line (a token someone is looking at). */
  push(mint: string, uri: string | null | undefined, urgent = false): void {
    if (this.closed || !uri || this.queued.has(mint)) return;
    const cached = this.cache.get(uri);
    if (cached !== undefined) {
      if (cached) this.opts.apply(mint, cached);
      return;
    }
    if (this.queue.length >= (this.opts.maxQueue ?? 2000)) {
      // Under a launch storm the oldest queued launches lose their metadata first.
      const dropped = urgent ? this.queue.pop() : this.queue.shift();
      if (dropped) this.queued.delete(dropped.mint);
      this.stats.dropped++;
    }
    this.queued.add(mint);
    this.stats.queued++;
    if (urgent) this.queue.unshift({ mint, uri });
    else this.queue.push({ mint, uri });
    this.drain();
  }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
    this.queued.clear();
    this.ctrl.abort();
  }

  private drain(): void {
    while (!this.closed && this.active < (this.opts.concurrency ?? 4) && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.queued.delete(job.mint);
        this.drain();
      });
    }
  }

  private async run(job: { mint: string; uri: string }): Promise<void> {
    let meta: TokenMetadata | null = null;
    try {
      meta = await fetchTokenMetadata(job.uri, { ...this.opts, signal: this.ctrl.signal });
      this.stats.fetched++;
    } catch (err) {
      if (err instanceof FetchRefused) this.stats.refused++;
      else this.stats.failed++;
      // Refusals are permanent; network failures are not cached so a later push can retry.
      if (!(err instanceof FetchRefused)) return;
    }
    if (this.closed) return;
    this.remember(job.uri, meta);
    if (meta) this.opts.apply(job.mint, meta);
  }

  private remember(uri: string, meta: TokenMetadata | null): void {
    this.cache.set(uri, meta);
    const max = this.opts.cacheSize ?? 5000;
    if (this.cache.size > max) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
