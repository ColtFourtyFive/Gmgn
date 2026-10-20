// Runs the EVM security checker against real tokens on every live EVM chain and
// prints a table. Read-only: eth_call / eth_getCode / eth_getStorageAt and
// keyless HTTP APIs only.
// Usage: NODE_USE_ENV_PROXY=1 npx tsx scripts/evm-security-check.ts [--chain base] [--only label] [--discover]
//        [--token <chain>:<address>] [--record <dir>] [--json]
//   --token     checks one token instead of the built-in list
//   --discover  also checks the newest pools' tokens per chain (GeckoTerminal new_pools)
//   --record    writes each token's RPC + HTTP traffic as a replayable fixture

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAddress, type Address } from 'viem';
import { EVM_CHAIN_IDS, EVM_CHAINS, type EvmChainId } from '../src/live/evm/chains';
import { createEvmPublicClient } from '../src/live/evm/clients';
import { loadEvmLiveConfig } from '../src/live/evm/config';
import { EvmSecurityChecker, toTokenSecurityFlags, type EvmSecurityReport, type RpcClient } from '../src/live/evm/security';
import type { FetchLike } from '../src/live/evm/security/http';

interface Target {
  chain: EvmChainId;
  label: string;
  address: string;
}

const TARGETS: Target[] = [
  // Base
  { chain: 'base', label: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { chain: 'base', label: 'WETH', address: '0x4200000000000000000000000000000000000006' },
  { chain: 'base', label: 'DEGEN', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed' },
  { chain: 'base', label: 'MAG (USDC pair, buys only)', address: '0x5a036842bb34dbbd41b58f4b3b25596f37f09ff3' },
  { chain: 'base', label: 'Clanker v4 PadMemes', address: '0xf86180ce76ea3433db117f1c9762555a6b258b07' },
  { chain: 'base', label: 'Zora coin ISO 20022', address: '0x7416a1c65b43de87dcbfe9ddca36345bec52d230' },
  // Robinhood Chain
  { chain: 'robinhood', label: 'WETH', address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' },
  { chain: 'robinhood', label: 'USDG', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' },
  { chain: 'robinhood', label: 'Flap KEK (1% tax)', address: '0x86e5d8818eff06f0dea9e5eca87f056bc44c7777' },
  { chain: 'robinhood', label: 'Flap (fresh, curve)', address: '0xad3bbc9e59f8067fecb33d1e2a1104f8ca107777' },
  { chain: 'robinhood', label: 'Pons V2 HUST', address: '0xf6a78f0fa7675f77e37aa8c57b70307acfe8ae4a' },
  { chain: 'robinhood', label: 'pools.trade MITSU', address: '0x1cad5848e7556fa9272302264e3cb2904bde77ac' },
  { chain: 'robinhood', label: 'CREORA (Uniswap V2)', address: '0x3c803f4badcc2eb6b16d0887db2a703695ca822b' },
  { chain: 'robinhood', label: 'ENDAI (buys only)', address: '0xC882f10529a5518ee3393Af5a80e9fF00d38d44b' },
  // BNB Chain
  { chain: 'bsc', label: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
  { chain: 'bsc', label: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
  { chain: 'bsc', label: 'AGT (honeypot)', address: '0x8f7231837140aFE62264a476979dFA4b48e0761F' },
  { chain: 'bsc', label: 'four.meme DAISY (curve)', address: '0xd64ed896062e93bd26b2506dc3e95765c86c4444' },
  { chain: 'bsc', label: 'four.meme HI (tax, curve)', address: '0x3f53cea83d2631b816d86516cc59af27b501ffff' },
  { chain: 'bsc', label: 'four.meme (graduated)', address: '0xeccbb861c0dda7efd964010085488b69317e4444' },
  { chain: 'bsc', label: 'Flap 9% tax (curve)', address: '0x89abca8f91773c16092ba3bfee6b608960fa7777' },
  // Ethereum
  { chain: 'eth', label: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { chain: 'eth', label: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  { chain: 'eth', label: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { chain: 'eth', label: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' },
  { chain: 'eth', label: 'KERC (high sell tax)', address: '0xDcd29c63DF9BEEf043524E05F15Edc1aaC6201d1' },
];

const GT_NETWORK: Record<EvmChainId, string> = { base: 'base', robinhood: 'robinhood', bsc: 'bsc', eth: 'eth' };

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const chainFilter = opt('--chain') as EvmChainId | undefined;
const only = opt('--only');
const recordDir = opt('--record');
const asJson = args.includes('--json');

interface Recording {
  rpc: { method: string; params: unknown; result?: unknown; error?: { message: string; data?: unknown } }[];
  http: { url: string; status: number; headers: Record<string, string>; body: string }[];
}
let recording: Recording | null = null;

function recordingClient(inner: RpcClient): RpcClient {
  return {
    request: (async (a: { method: string; params?: unknown }) => {
      try {
        const result = await inner.request(a as never);
        recording?.rpc.push({ method: a.method, params: a.params, result });
        return result;
      } catch (err) {
        let data: unknown;
        for (let e: unknown = err; e && data === undefined; e = (e as { cause?: unknown }).cause) data = (e as { data?: unknown }).data;
        recording?.rpc.push({ method: a.method, params: a.params, error: { message: (err as Error).message.split('\n')[0], ...(data !== undefined ? { data } : {}) } });
        throw err;
      }
    }) as RpcClient['request'],
  };
}

const recordingFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init as RequestInit);
  const body = await res.text();
  const headers: Record<string, string> = {};
  for (const h of ['content-type', 'cf-mitigated']) {
    const v = res.headers.get(h);
    if (v) headers[h] = v;
  }
  recording?.http.push({ url, status: res.status, headers, body });
  return { status: res.status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? res.headers.get(n) }, text: async () => body };
};

async function discover(chain: EvmChainId): Promise<Target[]> {
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${GT_NETWORK[chain]}/new_pools?include=base_token,dex`);
  if (r.status !== 200) return [];
  const d = (await r.json()) as { data?: { attributes: { name: string }; relationships: { base_token: { data: { id: string } }; dex: { data: { id: string } } } }[] };
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const p of d.data ?? []) {
    const addr = p.relationships.base_token.data.id.split('_')[1];
    const dex = p.relationships.dex.data.id;
    if (seen.has(dex) || seen.has(addr)) continue;
    seen.add(dex);
    seen.add(addr);
    out.push({ chain, label: `new ${p.attributes.name.split(' / ')[0]} (${dex})`, address: addr });
    if (out.length >= 4) break;
  }
  return out;
}

const { config } = loadEvmLiveConfig();
const clients: Partial<Record<EvmChainId, RpcClient>> = {};
for (const id of EVM_CHAIN_IDS) {
  const cfg = config.chains[id];
  if (cfg) clients[id] = recordingClient(createEvmPublicClient(cfg));
}
const checker = new EvmSecurityChecker({ clients, fetch: recordingFetch, enable: {} });

const adhoc = opt('--token');
let targets = adhoc
  ? [{ chain: adhoc.split(':')[0] as EvmChainId, label: adhoc.split(':')[1].slice(0, 10), address: adhoc.split(':')[1] }]
  : TARGETS.filter((t) => (!chainFilter || t.chain === chainFilter) && (!only || t.label.toLowerCase().includes(only.toLowerCase())));
if (args.includes('--discover')) for (const c of EVM_CHAIN_IDS) if (!chainFilter || c === chainFilter) targets = targets.concat(await discover(c));

const yn = (v: boolean | null) => (v === null ? '—' : v ? 'yes' : 'no');
const tax = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 2 : 1)}%`);
const rows: string[][] = [];
const head = ['token', 'chain', 'open src', 'renounced', 'honeypot', 'buy', 'sell', 'flags', 'launchpad', 'sim', 'sources', 'cov', 'ms'];

function flagsOf(r: EvmSecurityReport): string {
  const f = r.flags;
  const out: string[] = [];
  if (f.mintable) out.push('mint');
  if (f.upgradeable) out.push('upgradeable');
  else if (r.proxy?.kind === 'minimal-clone') out.push('clone');
  else if (f.proxy) out.push('proxy');
  if (f.blacklist) out.push('blacklist');
  if (f.taxModifiable) out.push('tax-mod');
  if (f.pausable) out.push('pausable');
  if (f.ownerCanChangeBalance) out.push('balance-mod');
  if (f.antiWhale) out.push(f.antiWhaleModifiable ? 'anti-whale(mod)' : 'anti-whale');
  if (f.tradingCooldown) out.push('cooldown');
  if (f.hiddenOwner || f.canTakeBackOwnership) out.push('hidden-owner');
  if (f.selfDestruct) out.push('selfdestruct');
  if (f.externalCall) out.push('ext-call');
  if (r.cannotBuy) out.push('cannot-buy');
  return out.join(',') || '-';
}

function sourcesOf(r: EvmSecurityReport): string {
  const short: Record<string, string> = { goplus: 'GP', honeypotis: 'HP', onchain: 'OC', launchpad: 'LP', explorer: 'EX', simulation: 'SIM' };
  const byProvider = new Map<string, string>();
  for (const s of r.sources) {
    const k = short[s.provider];
    const mark = s.outcome === 'ok' ? '' : s.outcome === 'not_found' ? '∅' : s.outcome === 'rate_limited' ? '⏳' : s.outcome === 'blocked' ? '⛔' : s.outcome === 'unsupported' ? '✗' : s.outcome === 'skipped' ? '-' : '!';
    const prev = byProvider.get(k);
    // provider is ok if any of its calls was ok
    if (prev === undefined || (prev !== '' && mark === '')) byProvider.set(k, mark);
  }
  return [...byProvider].map(([k, m]) => `${k}${m}`).join(' ');
}

for (const t of targets) {
  if (!clients[t.chain]) continue;
  recording = recordDir ? { rpc: [], http: [] } : null;
  const started = Date.now();
  let r: EvmSecurityReport;
  try {
    r = await checker.check(t.chain, t.address, { fresh: true });
  } catch (err) {
    rows.push([t.label, t.chain, 'ERROR', (err as Error).message.slice(0, 60)]);
    continue;
  }
  const ms = Date.now() - started;
  if (recordDir && recording) {
    mkdirSync(recordDir, { recursive: true });
    const file = join(recordDir, `${t.chain}-${t.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`);
    writeFileSync(file, JSON.stringify({ chain: t.chain, token: getAddress(t.address) as Address, recordedAt: new Date().toISOString(), ...recording }, null, 1));
  }
  if (asJson) console.log(JSON.stringify({ label: t.label, report: r, mapping: toTokenSecurityFlags(r) }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
  const sim = r.simulation;
  rows.push([
    `${t.label}${r.symbol && !t.label.includes(r.symbol) ? ` [${r.symbol}]` : ''}`,
    EVM_CHAINS[t.chain].id,
    yn(r.isOpenSource),
    yn(r.isRenounced) + (r.ownerRole && r.ownerRole !== 'renounced' && r.ownerRole !== 'privileged' ? `(${r.ownerRole})` : ''),
    yn(r.isHoneypot),
    tax(r.buyTax),
    tax(r.sellTax),
    flagsOf(r),
    r.launchpad ? `${r.launchpad.id}${r.launchpad.phase ? `/${r.launchpad.phase}` : ''}` : '-',
    sim ? `${sim.venue}${sim.isHoneypot === null ? '?' : ''}` : '-',
    sourcesOf(r),
    `${Math.round(r.coverage * 100)}%`,
    String(ms),
  ]);
  if (r.disagreements.length && !asJson) {
    for (const d of r.disagreements) rows.push(['', '', `  ≠ ${d.field}: ${d.values.map((v) => `${v.provider}=${typeof v.value === 'number' ? tax(v.value) : String(v.value)}`).join(' ')} → ${d.chosen}`]);
  }
  // Keep keyless GoPlus inside its budget (about 10 calls a minute).
  if (targets.indexOf(t) < targets.length - 1) await new Promise((res) => setTimeout(res, 6500));
}

if (!asJson) {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.filter((r) => r.length === head.length).map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) => (cells.length === head.length ? cells.map((c, i) => c.padEnd(widths[i])).join(' │ ') : cells.filter(Boolean).join(' '));
  console.log(line(head));
  console.log(widths.map((w) => '─'.repeat(w)).join('─┼─'));
  for (const r of rows) console.log(line(r));
  console.log('\nsources: GP GoPlus, HP honeypot.is, OC on-chain, LP launchpad registry, EX explorers, SIM round trip; ∅ no data, ⏳ rate limited, ⛔ blocked (Cloudflare), ✗ unsupported chain, ! error');
}
