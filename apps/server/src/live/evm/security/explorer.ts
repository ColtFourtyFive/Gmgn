// Keyless explorer lookups: Blockscout v2 (verification, creator, top holders)
// and Sourcify v2 (verification). Verified formats (2026-10):
//   Blockscout GET {host}/api/v2/addresses/{addr}
//     200 { is_contract, is_verified, creator_address_hash, creation_transaction_hash,
//           proxy_type, implementations: [{ address_hash, name }], token: { holders_count, ... } }
//   Blockscout GET {host}/api/v2/tokens/{addr}/holders
//     200 { items: [{ address: { hash, is_contract, name }, value: "<raw>" }], next_page_params }
//   Sourcify GET https://sourcify.dev/server/v2/contract/{chainId}/{addr}
//     200 { match: "match" | "exact_match", ... }   404 { match: null, ... } (unknown, not "unverified")
// base.blockscout.com and robinhoodchain.blockscout.com may answer with a
// Cloudflare challenge (HTTP 403, cf-mitigated: challenge); that is reported as
// "blocked" and the host is backed off. BNB Chain has no Blockscout instance.

import { getAddress, isAddress, type Address } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { getJson, ProviderError, type FetchLike } from './http';

export const BLOCKSCOUT_HOSTS: Partial<Record<EvmChainId, string>> = {
  eth: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  robinhood: 'https://robinhoodchain.blockscout.com',
};

export const SOURCIFY_BASE = 'https://sourcify.dev/server';

type Raw = Record<string, unknown>;

const asAddress = (v: unknown): Address | null => (typeof v === 'string' && isAddress(v, { strict: false }) ? getAddress(v) : null);

export interface BlockscoutAddress {
  isContract: boolean | null;
  isVerified: boolean | null;
  creator: Address | null;
  creationTx: string | null;
  proxyType: string | null;
  implementations: Address[];
  holderCount: number | null;
}

export function parseBlockscoutAddress(json: unknown): BlockscoutAddress {
  const b = (json ?? {}) as Raw;
  const token = (b.token ?? null) as Raw | null;
  const holders = token ? Number(token.holders_count ?? token.holders) : NaN;
  return {
    isContract: typeof b.is_contract === 'boolean' ? b.is_contract : null,
    isVerified: typeof b.is_verified === 'boolean' ? b.is_verified : null,
    creator: asAddress(b.creator_address_hash),
    creationTx: typeof b.creation_transaction_hash === 'string' ? b.creation_transaction_hash : null,
    proxyType: typeof b.proxy_type === 'string' ? b.proxy_type : null,
    implementations: Array.isArray(b.implementations) ? (b.implementations as Raw[]).map((i) => asAddress(i.address_hash ?? i.address)).filter((a): a is Address => a !== null) : [],
    holderCount: Number.isFinite(holders) ? holders : null,
  };
}

export interface RawHolder {
  address: Address;
  /** Raw token units. */
  value: bigint;
  isContract: boolean | null;
  label: string | null;
}

export function parseBlockscoutHolders(json: unknown): RawHolder[] {
  const items = ((json ?? {}) as Raw).items;
  if (!Array.isArray(items)) return [];
  const out: RawHolder[] = [];
  for (const it of items as Raw[]) {
    const a = (it.address ?? {}) as Raw;
    const address = asAddress(a.hash);
    if (!address || typeof it.value !== 'string' || !/^\d+$/.test(it.value)) continue;
    out.push({ address, value: BigInt(it.value), isContract: typeof a.is_contract === 'boolean' ? a.is_contract : null, label: typeof a.name === 'string' && a.name ? a.name : null });
  }
  return out;
}

/** true = verified on Sourcify; null = not found there (which does not mean unverified). */
export function parseSourcify(status: number, json: unknown): boolean | null {
  if (status === 404) return null;
  if (status !== 200) throw new ProviderError('error', `Sourcify HTTP ${status}`, status);
  const m = ((json ?? {}) as Raw).match;
  return m === 'match' || m === 'exact_match' ? true : null;
}

export async function fetchBlockscoutAddress(fetchImpl: FetchLike, host: string, address: Address, signal: AbortSignal): Promise<BlockscoutAddress | null> {
  const res = await getJson(fetchImpl, `${host}/api/v2/addresses/${address}`, signal);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new ProviderError('error', `Blockscout HTTP ${res.status}`, res.status);
  return parseBlockscoutAddress(res.json);
}

export async function fetchBlockscoutHolders(fetchImpl: FetchLike, host: string, token: Address, signal: AbortSignal): Promise<RawHolder[]> {
  const res = await getJson(fetchImpl, `${host}/api/v2/tokens/${token}/holders`, signal);
  if (res.status === 404) return [];
  if (res.status !== 200) throw new ProviderError('error', `Blockscout HTTP ${res.status}`, res.status);
  return parseBlockscoutHolders(res.json);
}

export async function fetchSourcify(fetchImpl: FetchLike, chain: EvmChainId, address: Address, signal: AbortSignal, base = SOURCIFY_BASE): Promise<boolean | null> {
  const res = await getJson(fetchImpl, `${base}/v2/contract/${EVM_CHAINS[chain].chainId}/${address}`, signal);
  return parseSourcify(res.status, res.json);
}
