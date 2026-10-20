// Untrusted text and URLs from the chain, the feed and token metadata: strip
// control / zero-width / bidi characters, cap lengths, and keep only public
// https URLs (no IP literals, no local or internal host names). Every string a
// token creator controls goes through here before it reaches the World.

import { isIP } from 'node:net';

/** C0/C1 controls, soft hyphen, combining grapheme joiner, zero-width and bidi controls, BOM, interlinear annotations. */
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb],
];
const INVISIBLE_CLASS = `[${INVISIBLE_RANGES.map(([a, b]) => (a === b ? String.fromCodePoint(a) : `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`)).join('')}]`;
const INVISIBLE = new RegExp(INVISIBLE_CLASS, 'g');
const HAS_INVISIBLE = new RegExp(INVISIBLE_CLASS);

/** One-line display text: whitespace collapsed, invisible characters removed, at most `max` characters. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return [...value.replace(/\s+/g, ' ').replace(INVISIBLE, '').trim()].slice(0, max).join('').trim();
}

/** Base58 Solana address (32-byte keys encode to 32-44 characters). */
export const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Base58 transaction signature (64 bytes). */
export const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.arpa', '.test', '.invalid', '.example'];

/** Host names that must never be fetched by the server or linked from a token. */
export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || isIP(h.replace(/^\[|\]$/g, '')) !== 0) return true;
  if (h === 'localhost' || !h.includes('.')) return true;
  return LOCAL_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * A public https URL, or null: https only, no credentials, default port, and a
 * DNS host name (IP literals, localhost and internal suffixes are refused).
 */
export function publicHttpsUrl(raw: unknown, maxLength = 512): URL | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > maxLength || HAS_INVISIBLE.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (isForbiddenHost(url.hostname)) return null;
  return url;
}

/** IPv4 / IPv6 addresses that are not publicly routable (loopback, private, link-local, CGNAT, multicast, reserved). */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return true;
  if (ip === '::' || ip === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateV4(mapped[1]);
  if (/^::ffff:/.test(ip)) return true;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (ip.startsWith('2001:db8:') || ip.startsWith('2001:0db8:')) return true; // documentation
  return false;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || ip.startsWith('192.0.0.') || ip.startsWith('192.0.2.'))) return true;
  if (a === 198 && (b === 18 || b === 19 || ip.startsWith('198.51.100.'))) return true;
  if (ip.startsWith('203.0.113.')) return true;
  return a >= 224;
}

/** ipfs://<cid>/<path> (or a bare /ipfs/<cid> path) through the first gateway; null when it is not an IPFS reference. */
export function ipfsToGateway(raw: string, gateways: string[]): string | null {
  const gateway = gateways.find((g) => publicHttpsUrl(g));
  if (!gateway) return null;
  const m = /^ipfs:\/\/(?:ipfs\/)?([^?#]+)$/i.exec(raw.trim()) ?? /^\/?ipfs\/([^?#]+)$/i.exec(raw.trim());
  if (!m || !/^[A-Za-z0-9]{46,100}(\/[\w.\-/%]*)?$/.test(m[1])) return null;
  return `${gateway.replace(/\/+$/, '')}/${m[1]}`;
}

/** CIDv1 base32 (lowercase) as it appears as a subdomain gateway label. */
const SUBDOMAIN_CID = /^(b[a-z2-7]{50,99})\.ipfs\.[a-z0-9.-]+$/;

/**
 * `<cid>[/path]` of an https IPFS gateway URL, path style (https://host/ipfs/<cid>/path) or
 * subdomain style (https://<cid>.ipfs.host/path); null for anything else.
 */
export function ipfsPathOf(url: URL): string | null {
  const sub = SUBDOMAIN_CID.exec(url.hostname.toLowerCase());
  const raw = sub ? `${sub[1]}${url.pathname === '/' ? '' : url.pathname}` : (/^\/ipfs\/(.+)$/.exec(url.pathname)?.[1] ?? null);
  if (!raw) return null;
  return /^[A-Za-z0-9]{46,100}(\/[\w.\-/%]*)?$/.test(raw) ? raw.replace(/\/+$/, '') : null;
}

/** Whether `url` is already served by one of the configured gateways. */
function onGateway(url: URL, gateways: string[]): boolean {
  return gateways.some((g) => {
    const gw = publicHttpsUrl(g);
    return !!gw && gw.host === url.host && url.pathname.startsWith(gw.pathname.replace(/\/*$/, '/'));
  });
}

/**
 * An image URL a browser may load: public https, or an ipfs:// reference turned into a gateway URL.
 * Images on any other IPFS gateway are moved to the first configured one: content-addressed, the
 * same bytes, and the public gateways metadata names come and go (pump.fun writes
 * https://ipfs.io/ipfs/<cid>, which since September 2026 answers browsers with a challenge page
 * and `Cross-Origin-Resource-Policy: same-origin`, so the image would never render).
 */
export function safeImageUrl(raw: unknown, gateways: string[]): string | null {
  if (typeof raw !== 'string') return null;
  const viaIpfs = /^ipfs:\/\//i.test(raw.trim()) ? ipfsToGateway(raw, gateways) : null;
  const url = publicHttpsUrl(viaIpfs ?? raw);
  if (!url) return null;
  const cidPath = viaIpfs ? null : ipfsPathOf(url);
  if (cidPath && !onGateway(url, gateways)) {
    const moved = ipfsToGateway(`ipfs://${cidPath}`, gateways);
    if (moved) return moved;
  }
  return url.href;
}

const TWITTER_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'www.t.me', 'telegram.org']);

/** Social links from metadata: X / Telegram must point at their own hosts; a bare handle becomes a profile URL. */
export function safeSocial(kind: 'twitter' | 'telegram' | 'website', raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let value = raw.trim();
  if (!value) return undefined;
  const handle = /^@?([A-Za-z0-9_]{1,32})$/.exec(value);
  if (handle && kind === 'twitter') value = `https://x.com/${handle[1]}`;
  else if (handle && kind === 'telegram') value = `https://t.me/${handle[1]}`;
  else if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  // http links are upgraded rather than dropped: the host still has to pass every check.
  value = value.replace(/^http:\/\//i, 'https://');
  const url = publicHttpsUrl(value);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  if (kind === 'twitter' && !TWITTER_HOSTS.has(host)) return undefined;
  if (kind === 'telegram' && !TELEGRAM_HOSTS.has(host)) return undefined;
  return url.href;
}
