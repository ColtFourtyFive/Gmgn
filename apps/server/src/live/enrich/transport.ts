// HTTPS transport for untrusted URLs with the address check pinned to the
// connection: the DNS answer the socket connects to is the one validated
// (every address must be public), so a host that answers a public address to
// a pre-check and a private one to the connect (DNS rebinding) is still
// refused. Redirects are not followed here (fetchPublicJson re-checks each hop),
// bodies are not decompressed (identity encoding is requested).

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { isPrivateAddress } from './sanitize';

/** A refused destination (thrown from the connect-time lookup). */
export class AddressRefused extends Error {}

type Resolver = (hostname: string, cb: (err: Error | null, addresses: LookupAddress[]) => void) => void;

const systemResolver: Resolver = (hostname, cb) => dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => cb(err, addresses ?? []));

/** A net lookup that only ever yields public addresses (all of a host's answers must be public). */
export function publicOnlyLookup(resolve: Resolver = systemResolver): LookupFunction {
  return ((hostname: string, options: LookupOptions, callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const wanted = options.family === 4 || options.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses;
      if (wanted.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        return callback(new AddressRefused(`host ${hostname} resolves to a non-public address`), '', 0);
      }
      if (options.all) return callback(null, wanted);
      callback(null, wanted[0].address, wanted[0].family);
    });
  }) as LookupFunction;
}

/** fetch-shaped GET over node:https with the public-only lookup. */
export function pinnedFetch(resolve?: Resolver): typeof fetch {
  const lookup = publicOnlyLookup(resolve);
  return ((input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolveRes, reject) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.protocol !== 'https:') {
        reject(new AddressRefused('https only'));
        return;
      }
      const headers: Record<string, string> = { 'accept-encoding': 'identity' };
      new Headers(init?.headers).forEach((v, k) => {
        headers[k] = v;
      });
      const req = request(url, { method: 'GET', headers, lookup, signal: init?.signal ?? undefined }, (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status > 599) {
          res.destroy();
          reject(new Error(`unexpected status ${status}`));
          return;
        }
        const out = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) out.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        const nullBody = status === 204 || status === 205 || status === 304 || (status >= 300 && status < 400);
        if (nullBody) res.resume();
        resolveRes(new Response(nullBody ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status, headers: out }));
      });
      req.on('error', reject);
      req.end();
    })) as typeof fetch;
}
