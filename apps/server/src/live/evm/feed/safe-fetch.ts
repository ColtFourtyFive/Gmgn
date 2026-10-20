// SSRF-safe fetch of token metadata documents named on-chain (anyone can put
// any URL in a token's metadata): https only, every resolved address must be
// public (checked inside the socket's DNS lookup, so the address connected to
// is the address checked: no DNS-rebinding window), bounded size and time,
// redirects re-checked hop by hop.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Test seam: resolve a hostname (defaults to the system resolver). */
  resolve?: (host: string) => Promise<LookupAddress[]>;
}

const DEFAULTS = { timeoutMs: 6000, maxBytes: 256 * 1024, maxRedirects: 2 };

// One list per family: Node's BlockList also matches IPv4 addresses against IPv4-mapped IPv6 rules.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedV4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blockedV6.addSubnet(net, prefix, 'ipv6');

/** True for addresses on the public internet (not private, loopback, link-local, multicast, reserved or IPv4-mapped). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) {
    const a = address.toLowerCase();
    // IPv4-mapped / -compatible forms (::ffff:a.b.c.d, ::ffff:xxxx:xxxx, ::a.b.c.d) are refused outright.
    if (/^::(ffff:)?\d+\.\d+\.\d+\.\d+$/.test(a) || /^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return false;
    return !blockedV6.check(a, 'ipv6');
  }
  return false;
}

/** Only https URLs to named hosts or public literal addresses, no credentials, default port. */
export function isAllowedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) return null;
  if (!isIP(host) && (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/i.test(host) || host.toLowerCase() === 'localhost')) return null;
  return url;
}

function systemResolve(host: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));
}

/** GET `raw` and return the body (text), or null when blocked, failed, too big or slow. */
export async function safeFetchText(raw: string, opts: SafeFetchOptions = {}): Promise<string | null> {
  const o = { ...DEFAULTS, ...opts };
  const resolve = opts.resolve ?? systemResolve;
  let current = raw;
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    const url = isAllowedUrl(current);
    if (!url) return null;
    const res = await fetchOnce(url, o, resolve).catch(() => null);
    if (!res) return null;
    if (res.redirect) {
      try {
        current = new URL(res.redirect, url).toString();
      } catch {
        return null;
      }
      continue;
    }
    return res.body;
  }
  return null;
}

/** GET `raw` and parse JSON; null when blocked, failed or not JSON. */
export async function safeFetchJson(raw: string, opts: SafeFetchOptions = {}): Promise<unknown | null> {
  const text = await safeFetchText(raw, opts);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fetchOnce(
  url: URL,
  o: Required<Omit<SafeFetchOptions, 'resolve'>>,
  resolve: (host: string) => Promise<LookupAddress[]>,
): Promise<{ body: string | null; redirect: string | null } | null> {
  return new Promise((done) => {
    let settled = false;
    const finish = (v: { body: string | null; redirect: string | null } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(v);
    };
    const req = request(
      url,
      {
        method: 'GET',
        headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1', 'user-agent': 'trenchscope-metadata/1' },
        // Resolve and vet the host here, so the socket connects to exactly the address vetted.
        lookup: (hostname, _opts, cb) => {
          resolve(hostname).then(
            (addrs) => {
              const ok = addrs.length > 0 && addrs.every((a) => isPublicAddress(a.address));
              if (!ok) return cb(new Error(`blocked address for ${hostname}`), '', 4);
              const a = addrs[0];
              // Node >= 20 asks for all addresses when autoSelectFamily is on.
              if ((_opts as { all?: boolean }).all) return (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, [a]);
              cb(null, a.address, a.family);
            },
            (err: Error) => cb(err, '', 4),
          );
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return finish({ body: null, redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return finish(null);
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > o.maxBytes) {
          res.destroy();
          return finish(null);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > o.maxBytes) {
            res.destroy();
            finish(null);
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => finish({ body: Buffer.concat(chunks).toString('utf8'), redirect: null }));
        res.on('error', () => finish(null));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(null);
    }, o.timeoutMs);
    req.on('error', () => finish(null));
    req.end();
  });
}
