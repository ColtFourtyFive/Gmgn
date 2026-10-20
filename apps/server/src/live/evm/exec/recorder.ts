// Record / replay of JSON-RPC and HTTP traffic, so the engine can be verified
// against real chains once (scripts/evm-exec-verify.ts --record) and tested
// offline and deterministically afterwards (test/live-evm-exec-*.test.ts).
// Requests are keyed by method + parameters (lowercased), answered in recorded
// order per key (the last answer repeats when a key is asked more often).
// The wrapping transports never retry (viem's default backoff would replay a
// missing or recorded-error answer several times); the recording transport's
// inner http client does the retrying against the real node.

import { createPublicClient, custom, http, type Chain, type PublicClient } from 'viem';

export interface RecordedRpc {
  key: string;
  result?: unknown;
  error?: { message: string; code?: number; data?: unknown };
}

export interface RecordedHttp {
  key: string;
  status: number;
  body: unknown;
}

export interface Recording {
  rpc: RecordedRpc[];
  http: RecordedHttp[];
}

const norm = (v: unknown): unknown => {
  if (typeof v === 'string') return v.toLowerCase();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = norm((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
};

export function rpcKey(method: string, params: unknown): string {
  return `${method} ${JSON.stringify(norm(params ?? []))}`;
}

export function httpKey(url: string, init?: { method?: string; body?: unknown }): string {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = typeof init?.body === 'string' ? JSON.stringify(norm(JSON.parse(init.body))) : '';
  return `${init?.method ?? 'GET'} ${u.origin}${u.pathname}?${new URLSearchParams(params).toString()} ${body}`;
}

/** A public client that records every request it forwards to `url`. */
export function recordingClient(chain: Chain, url: string, rec: Recording): PublicClient {
  const inner = http(url, { retryCount: 3, retryDelay: 400, timeout: 20_000 })({ chain, retryCount: 3 });
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        const key = rpcKey(method, params);
        try {
          const result = await inner.request({ method, params } as never);
          rec.rpc.push({ key, result });
          return result;
        } catch (err) {
          const e = err as { message?: string; code?: number; data?: unknown; cause?: { code?: number; data?: unknown } };
          rec.rpc.push({ key, error: { message: e.message ?? String(err), code: e.code ?? e.cause?.code, data: e.data ?? e.cause?.data } });
          throw err;
        }
      },
    }, { retryCount: 0 }),
  });
}

/** A public client answering from a recording; unknown requests throw. */
export function replayClient(chain: Chain, rec: Recording): PublicClient {
  const queues = new Map<string, RecordedRpc[]>();
  for (const r of rec.rpc) {
    const q = queues.get(r.key) ?? [];
    q.push(r);
    queues.set(r.key, q);
  }
  const used = new Map<string, number>();
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        const key = rpcKey(method, params);
        const q = queues.get(key);
        if (!q || q.length === 0) throw new Error(`replay: no recorded answer for ${key.slice(0, 300)}`);
        const i = used.get(key) ?? 0;
        used.set(key, i + 1);
        const r = q[Math.min(i, q.length - 1)];
        if (r.error) {
          const err = new Error(r.error.message) as Error & { code?: number; data?: unknown };
          err.code = r.error.code;
          err.data = r.error.data;
          throw err;
        }
        return r.result;
      },
    }, { retryCount: 0 }),
  });
}

/** fetch that records every response. */
export function recordingFetch(rec: Recording, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const res = await inner(input, init);
    const body = await res.json().catch(() => null);
    rec.http.push({ key: httpKey(url, { method: init?.method, body: init?.body }), status: res.status, body });
    return new Response(JSON.stringify(body), { status: res.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** fetch answering from a recording. */
export function replayFetch(rec: Recording): typeof fetch {
  const queues = new Map<string, RecordedHttp[]>();
  for (const r of rec.http) {
    const q = queues.get(r.key) ?? [];
    q.push(r);
    queues.set(r.key, q);
  }
  const used = new Map<string, number>();
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const key = httpKey(url, { method: init?.method, body: init?.body });
    const q = queues.get(key);
    if (!q) throw new Error(`replay: no recorded response for ${key.slice(0, 300)}`);
    const i = used.get(key) ?? 0;
    used.set(key, i + 1);
    const r = q[Math.min(i, q.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

export type StateOverlay = Record<string, { balance?: bigint; stateDiff?: Record<string, string> }>;

type RawOverrides = Record<string, { balance?: string; stateDiff?: Record<string, string> }>;

function mergeOverrides(existing: unknown, overlay: StateOverlay): RawOverrides {
  const out: RawOverrides = { ...((existing as RawOverrides | undefined) ?? {}) };
  for (const [addr, o] of Object.entries(overlay)) {
    const key = addr.toLowerCase();
    const cur = out[key] ?? {};
    out[key] = {
      ...cur,
      ...(o.balance !== undefined ? { balance: `0x${o.balance.toString(16)}` } : {}),
      ...(o.stateDiff ? { stateDiff: { ...(cur.stateDiff ?? {}), ...o.stateDiff } } : {}),
    };
  }
  return out;
}

/**
 * A client that runs every read against state with `overlay` applied (native
 * balances and storage slots): eth_call / eth_estimateGas get state overrides,
 * eth_simulateV1 merges them into its block, eth_getBalance answers overridden
 * balances. Verification uses it to sell from a wallet whose token balance was
 * set through the token's balance slot.
 */
export function overlayClient(chain: Chain, base: PublicClient, overlay: StateOverlay): PublicClient {
  const balances = new Map(Object.entries(overlay).filter(([, o]) => o.balance !== undefined).map(([a, o]) => [a.toLowerCase(), o.balance as bigint]));
  return createPublicClient({
    chain,
    transport: custom({
      async request({ method, params }) {
        const p = (params ?? []) as unknown[];
        const who = String(p[0]).toLowerCase();
        if (method === 'eth_getBalance' && balances.has(who)) return `0x${(balances.get(who) as bigint).toString(16)}`;
        if (method === 'eth_call' || method === 'eth_estimateGas') {
          return base.request({ method, params: [p[0], p[1] ?? 'latest', mergeOverrides(p[2], overlay)] } as never);
        }
        if (method === 'eth_simulateV1') {
          const sim = { ...(p[0] as Record<string, unknown>) };
          const blocks = (sim.blockStateCalls as Record<string, unknown>[]).map((b, i) => (i === 0 ? { ...b, stateOverrides: mergeOverrides(b.stateOverrides, overlay) } : b));
          return base.request({ method, params: [{ ...sim, blockStateCalls: blocks }, p[1] ?? 'latest'] } as never);
        }
        return base.request({ method, params } as never);
      },
    }, { retryCount: 0 }),
  });
}
