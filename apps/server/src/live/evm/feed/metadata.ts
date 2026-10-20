// Token metadata: ERC-20 name / symbol / decimals / totalSupply in one
// multicall per window, and the venue's off-chain document (IPFS JSON) fetched
// in the background through the SSRF-safe fetcher, so a slow gateway never
// holds up the ledger. Everything a token contract or its metadata says is
// untrusted: text is cleaned and capped, links must be https.

import type { Socials } from '@trenchscope/shared';
import { decodeFunctionResult, encodeFunctionData, hexToString, type Hex } from 'viem';
import { erc20Abi, erc20Bytes32Abi } from './abi';
import { LruMap } from './lru';
import type { EvmRpc } from './rpc';
import { safeFetchJson } from './safe-fetch';

export interface Erc20Info {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export interface OffchainMeta {
  description?: string;
  imageUrl?: string | null;
  socials?: Socials;
}

const MAX_NAME = 64;
const MAX_SYMBOL = 24;
const MAX_DESCRIPTION = 600;
const MAX_URL = 512;
const QUEUE_CAP = 300;

/** Printable text, single-spaced lines, capped. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** An https link (http upgraded) or null. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.length > MAX_URL) return null;
  if (/^http:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  if (!/^https:\/\//i.test(s)) {
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) s = `https://${s}`;
    else return null;
  }
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Socials from loose fields: full links, or bare handles for X / Telegram. */
export function cleanSocials(f: { twitter?: unknown; telegram?: unknown; website?: unknown }): Socials {
  const out: Socials = {};
  const handle = (v: unknown, base: string): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/^@/, '');
    if (/^[A-Za-z0-9_]{2,32}$/.test(t)) return `${base}${t}`;
    return cleanUrl(t);
  };
  const tw = handle(f.twitter, 'https://x.com/');
  const tg = handle(f.telegram, 'https://t.me/');
  const web = cleanUrl(f.website);
  if (tw && /^https:\/\/(www\.)?(x|twitter)\.com\//i.test(tw)) out.twitter = tw;
  if (tg && /^https:\/\/(www\.)?(t\.me|telegram\.me)\//i.test(tg) && !/#/.test(tg)) out.telegram = tg;
  if (web) out.website = web;
  return out;
}

export class TokenMetadata {
  private readonly erc20Cache = new LruMap<string, Erc20Info | null>(5000);
  private readonly queue: { uri: string; apply: (doc: unknown) => void }[] = [];
  private inflight = 0;
  fetched = 0;
  failed = 0;

  constructor(
    private readonly rpc: EvmRpc,
    readonly gateways: string[],
    private readonly fetchJson: (url: string) => Promise<unknown | null> = (url) => safeFetchJson(url),
    private readonly concurrency = 2,
  ) {}

  /** ERC-20 basics of `tokens` (cached; non-ERC-20 contracts are left out). */
  async erc20(tokens: string[]): Promise<Map<string, Erc20Info>> {
    const out = new Map<string, Erc20Info>();
    const missing: string[] = [];
    for (const t of new Set(tokens)) {
      const c = this.erc20Cache.get(t);
      if (c) out.set(t, c);
      else if (c === undefined) missing.push(t);
    }
    if (missing.length === 0) return out;
    const fns = ['name', 'symbol', 'decimals', 'totalSupply'] as const;
    const calls = missing.flatMap((t) => fns.map((fn) => ({ target: t, data: encodeFunctionData({ abi: erc20Abi, functionName: fn }) })));
    const res = await this.rpc.call(calls);
    missing.forEach((t, i) => {
      const [name, symbol, decimals, supply] = res.slice(i * 4, i * 4 + 4);
      const info = decodeErc20(name, symbol, decimals, supply);
      this.erc20Cache.set(t, info);
      if (info) out.set(t, info);
    });
    return out;
  }

  /** Seed the cache (a venue that already read the token). */
  remember(token: string, info: Erc20Info): void {
    this.erc20Cache.set(token, info);
  }

  /** https URL of an ipfs:// URI, a bare CID or an https link; null otherwise. */
  resolveUri(raw: unknown, gateway = 0): string | null {
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    const gw = this.gateways[gateway] ?? this.gateways[0];
    const ipfs = s.match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]{46,100})(\/[\w.\-/%]*)?$/);
    if (ipfs && gw) return `${gw}${ipfs[1]}${ipfs[2] ?? ''}`;
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/.test(s) && gw) return `${gw}${s}`;
    return cleanUrl(s);
  }

  /** Image link for the UI (ipfs resolved through the first gateway). */
  imageUrl(raw: unknown): string | null {
    return this.resolveUri(raw);
  }

  /** Fetch a metadata document in the background and hand it to `apply` (queue bounded, oldest dropped). */
  fetchLater(uri: string, apply: (doc: unknown) => void): void {
    if (!this.resolveUri(uri)) return;
    this.queue.push({ uri, apply });
    if (this.queue.length > QUEUE_CAP) this.queue.splice(0, this.queue.length - QUEUE_CAP);
    this.pump();
  }

  get pending(): number {
    return this.queue.length + this.inflight;
  }

  private pump(): void {
    while (this.inflight < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inflight++;
      void this.fetchDoc(job.uri)
        .then((doc) => {
          if (doc === null) {
            this.failed++;
            return;
          }
          this.fetched++;
          try {
            job.apply(doc);
          } catch {
            this.failed++;
          }
        })
        .finally(() => {
          this.inflight--;
          this.pump();
        });
    }
  }

  /** Try each gateway in turn for IPFS documents. */
  private async fetchDoc(uri: string): Promise<unknown | null> {
    const tries = /^(ipfs:\/\/|Qm|b[a-z2-7]{50})/.test(uri.trim()) ? Math.max(1, this.gateways.length) : 1;
    for (let g = 0; g < tries; g++) {
      const url = this.resolveUri(uri, g);
      if (!url) return null;
      const doc = await this.fetchJson(url);
      if (doc !== null && typeof doc === 'object') return doc;
    }
    return null;
  }
}

function decodeErc20(name: Hex | null, symbol: Hex | null, decimals: Hex | null, supply: Hex | null): Erc20Info | null {
  if (!decimals || !supply || !symbol) return null;
  try {
    const d = Number(decodeFunctionResult({ abi: erc20Abi, functionName: 'decimals', data: decimals }));
    const s = decodeFunctionResult({ abi: erc20Abi, functionName: 'totalSupply', data: supply });
    if (!(d >= 0 && d <= 36)) return null;
    return { name: cleanText(decodeString(name, 'name'), MAX_NAME), symbol: cleanText(decodeString(symbol, 'symbol'), MAX_SYMBOL), decimals: d, totalSupply: s };
  } catch {
    return null;
  }
}

function decodeString(data: Hex | null, fn: 'name' | 'symbol'): string {
  if (!data) return '';
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: fn, data });
  } catch {
    try {
      return hexToString(decodeFunctionResult({ abi: erc20Bytes32Abi, functionName: fn, data }), { size: 32 }).replace(/\u0000+$/, '');
    } catch {
      return '';
    }
  }
}

export const METADATA_LIMITS = { MAX_NAME, MAX_SYMBOL, MAX_DESCRIPTION };
