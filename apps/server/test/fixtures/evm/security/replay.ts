// Replays traffic recorded by `scripts/evm-security-check.ts --record <dir>`:
// JSON-RPC requests are matched on method + params, HTTP requests on URL. An
// unrecorded request fails loudly so a test never silently reaches the network.

import { readFileSync } from 'node:fs';
import type { FetchLike } from '../../../../src/live/evm/security/http';
import type { RpcClient } from '../../../../src/live/evm/security/rpc';

export interface Recording {
  chain: string;
  token: string;
  rpc: { method: string; params: unknown; result?: unknown; error?: { message: string; data?: unknown } }[];
  http: { url: string; status: number; headers: Record<string, string>; body: string }[];
}

export function loadRecording(name: string): Recording {
  return JSON.parse(readFileSync(new URL(`./replay/${name}.json`, import.meta.url), 'utf8')) as Recording;
}

const keyOf = (method: string, params: unknown) => `${method} ${JSON.stringify(params)}`;

export interface Replay {
  client: RpcClient;
  fetch: FetchLike;
  /** Requests served so far (rpc + http). */
  calls: { rpc: number; http: number };
  /** Requests that had no recording. */
  misses: string[];
}

type HttpAnswer = { status: number; headers?: Record<string, string>; body: string };

/**
 * Blockscout hosts that answered the recording machine with a Cloudflare
 * challenge; once the checker saw one it backed off, so later requests to them
 * were never recorded. Replays answer them with the same challenge.
 */
const CHALLENGED_HOSTS = ['https://base.blockscout.com/', 'https://robinhoodchain.blockscout.com/'];
const CHALLENGE: HttpAnswer = { status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html; charset=UTF-8' }, body: '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' };

export function replay(rec: Recording, override?: { http?: (url: string) => HttpAnswer | undefined }): Replay {
  const rpc = new Map<string, Recording['rpc'][number]>();
  for (const r of rec.rpc) if (!rpc.has(keyOf(r.method, r.params))) rpc.set(keyOf(r.method, r.params), r);
  const http = new Map<string, Recording['http'][number]>();
  for (const h of rec.http) if (!http.has(h.url)) http.set(h.url, h);
  const out: Replay = {
    calls: { rpc: 0, http: 0 },
    misses: [],
    client: {
      request: (async (a: { method: string; params?: unknown }) => {
        out.calls.rpc++;
        const hit = rpc.get(keyOf(a.method, a.params));
        if (!hit) {
          out.misses.push(keyOf(a.method, a.params).slice(0, 200));
          throw new Error(`unrecorded RPC request ${a.method}`);
        }
        if (hit.error) throw Object.assign(new Error(hit.error.message), { data: hit.error.data });
        return hit.result;
      }) as RpcClient['request'],
    },
    fetch: async (url) => {
      out.calls.http++;
      const o = override?.http?.(url) ?? (!http.has(url) && CHALLENGED_HOSTS.some((h) => url.startsWith(h)) ? CHALLENGE : undefined);
      const hit = o ? { url, status: o.status, headers: o.headers ?? {}, body: o.body } : http.get(url);
      if (!hit) {
        out.misses.push(url);
        throw new Error(`unrecorded HTTP request ${url}`);
      }
      return { status: hit.status, headers: { get: (n: string) => hit.headers[n.toLowerCase()] ?? null }, text: async () => hit.body };
    },
  };
  return out;
}
