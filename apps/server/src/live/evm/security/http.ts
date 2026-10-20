// HTTP for third-party security providers: timeouts, JSON parsing, and the
// failure kinds the checker records (rate limited, Cloudflare challenge, ...).

import type { SourceOutcome } from './types';

export type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class ProviderError extends Error {
  constructor(
    public outcome: Exclude<SourceOutcome, 'ok' | 'skipped'>,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface HttpResponse {
  status: number;
  json: unknown;
}

/** True for a Cloudflare interstitial ("Just a moment...") instead of the API answer. */
export function isCloudflareChallenge(status: number, headers: { get(name: string): string | null }, body: string): boolean {
  if (headers.get('cf-mitigated') === 'challenge') return true;
  if (status !== 403 && status !== 503 && status !== 429) return false;
  const ct = headers.get('content-type') ?? '';
  return ct.includes('text/html') && /Just a moment|challenge-platform|cf_chl_/i.test(body);
}

/**
 * GET a JSON document. Rate-limit answers and Cloudflare challenges become
 * ProviderErrors; other HTTP statuses are returned with their parsed body (the
 * providers give meaning to their own 4xx answers).
 */
export async function getJson(fetchImpl: FetchLike, url: string, signal: AbortSignal, headers?: Record<string, string>): Promise<HttpResponse> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, { signal, headers: { accept: 'application/json', ...headers } });
  } catch (err) {
    if (signal.aborted) throw new ProviderError('timeout', 'request aborted');
    throw new ProviderError('error', (err as Error).message);
  }
  const body = await res.text();
  if (isCloudflareChallenge(res.status, res.headers, body)) throw new ProviderError('blocked', 'Cloudflare challenge', res.status);
  if (res.status === 429) throw new ProviderError('rate_limited', 'HTTP 429', 429);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError('error', `HTTP ${res.status}: non-JSON response`, res.status);
  }
  return { status: res.status, json };
}
