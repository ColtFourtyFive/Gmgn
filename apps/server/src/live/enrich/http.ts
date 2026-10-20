// Outbound HTTP for live ingestion. Two flavours:
//   fetchPublicJson   untrusted URLs (token metadata): https only, public DNS
//                     hosts that resolve to public addresses (checked up front and
//                     again on the connection itself, see transport.ts), redirects
//                     followed by hand and re-checked hop by hop, JSON only, size
//                     and time capped
//   fetchServiceJson  operator-configured services (Jupiter): time and size capped
// Both read the body incrementally and abort past the cap, so a hostile or
// broken server can neither stall a worker nor fill memory.

import { lookup as dnsLookup } from 'node:dns/promises';
import { isPrivateAddress, publicHttpsUrl } from './sanitize';
import { pinnedFetch } from './transport';

export type FetchFn = typeof fetch;
/** Resolve a host name to its addresses (DNS in production, a stub in tests). */
export type HostLookup = (hostname: string) => Promise<string[]>;

export const systemLookup: HostLookup = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** The request was refused by policy (not a network failure): never retried. */
export class FetchRefused extends Error {}

export interface FetchLimits {
  timeoutMs?: number;
  maxBytes?: number;
}

export interface PublicFetchOptions extends FetchLimits {
  fetch?: FetchFn;
  lookup?: HostLookup;
  maxRedirects?: number;
  /** Aborts the request (shutdown). */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const JSON_TYPES = /json|text\/plain|octet-stream/i;

/** Every address the host resolves to must be public (a name pointing at 10.0.0.1 is refused). */
async function assertPublicHost(hostname: string, lookup: HostLookup): Promise<void> {
  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch (err) {
    throw new Error(`dns lookup failed for ${hostname}: ${err instanceof Error ? err.message : 'error'}`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new FetchRefused(`host ${hostname} resolves to a non-public address`);
}

function withTimeout(ms: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timed out after ${ms}ms`)), ms);
  const onAbort = () => ctrl.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort, { once: true });
  if (outer?.aborted) ctrl.abort(outer.reason);
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

/** Read a response body as UTF-8, failing as soon as it grows past `maxBytes`. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new FetchRefused(`response over ${maxBytes} bytes`);
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchRefused(`response over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/**
 * GET an untrusted URL that must answer JSON (token metadata). Refuses non-https, non-public
 * hosts (literal or resolved), more than `maxRedirects` hops, non-JSON content types, bodies
 * over `maxBytes` (256 KB) and anything slower than `timeoutMs` (5 s) in total.
 */
let defaultTransport: FetchFn | null = null;

export async function fetchPublicJson(rawUrl: string, opts: PublicFetchOptions = {}): Promise<unknown> {
  const f = opts.fetch ?? (defaultTransport ??= pinnedFetch());
  const lookup = opts.lookup ?? systemLookup;
  const maxRedirects = opts.maxRedirects ?? 3;
  let url = publicHttpsUrl(rawUrl, 1024);
  if (!url) throw new FetchRefused('url is not a public https URL');
  const t = withTimeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url.hostname, lookup);
      const res = await f(url.href, { redirect: 'manual', signal: t.signal, headers: { accept: 'application/json' } });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get('location');
        if (!location || hop >= maxRedirects) throw new FetchRefused('too many redirects');
        let next: URL | null = null;
        try {
          next = publicHttpsUrl(new URL(location, url).href, 1024);
        } catch {
          next = null;
        }
        if (!next) throw new FetchRefused('redirect to a non-public URL');
        url = next;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`http ${res.status}`);
      }
      const type = res.headers.get('content-type') ?? '';
      if (type && !JSON_TYPES.test(type)) {
        await res.body?.cancel().catch(() => {});
        throw new FetchRefused(`content type ${type.slice(0, 60)} is not JSON`);
      }
      const text = await readCapped(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
      try {
        return JSON.parse(text);
      } catch {
        throw new FetchRefused('body is not JSON');
      }
    }
  } finally {
    t.done();
  }
}

/** GET a configured service endpoint as JSON, time and size capped. */
export async function fetchServiceJson(
  url: string,
  opts: FetchLimits & { fetch?: FetchFn; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<unknown> {
  const f = opts.fetch ?? fetch;
  const t = withTimeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  try {
    const res = await f(url, { signal: t.signal, headers: { accept: 'application/json', ...opts.headers } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`http ${res.status}`);
    }
    return JSON.parse(await readCapped(res, opts.maxBytes ?? 1024 * 1024));
  } finally {
    t.done();
  }
}
