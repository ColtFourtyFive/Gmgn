// GoPlus token_security (keyless). Verified response format (2026-10):
//   GET https://api.gopluslabs.io/api/v1/token_security/{chainId}?contract_addresses={addr}
//   200 {"code":1,"message":"OK","result":{"<lowercase addr>":{...}}}
//   200 {"code":4029,"message":"too many requests"}   <- rate limit arrives as HTTP 200
// Flags are "1"/"0" strings; a missing key or "" means unknown. Taxes are 0..1
// decimal strings. owner_address: missing = unknown, "" = no owner. Keyless
// requests answer one address per call (extra addresses are dropped) and allow
// roughly 10-15 calls a minute. Chains: 1, 56, 8453 and 4663 (Robinhood Chain).

import { getAddress, isAddress, type Address } from 'viem';
import type { EvmChainId } from '../chains';
import { getJson, ProviderError, type FetchLike } from './http';
import type { ProviderReport } from './merge';
import type { HolderKind, LpLocker, SecurityFacts, TopHolder } from './types';
import { isBurnAddress } from './venues';

export const GOPLUS_CHAIN_IDS: Record<EvmChainId, string> = { eth: '1', bsc: '56', base: '8453', robinhood: '4663' };
export const GOPLUS_RATE_LIMIT_CODE = 4029;

type Raw = Record<string, unknown>;

const flag = (v: unknown): boolean | undefined => (v === '1' || v === 1 ? true : v === '0' || v === 0 ? false : undefined);

function ratio(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(1, n) : undefined;
}

const num = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

const addr = (v: unknown): Address | undefined => (typeof v === 'string' && isAddress(v, { strict: false }) ? getAddress(v) : undefined);

function holderKind(h: Raw): HolderKind {
  const a = str(h.address);
  if (isBurnAddress(a)) return 'burn';
  if (flag(h.is_locked)) return 'locker';
  if (flag(h.is_contract) === true) return 'contract';
  if (flag(h.is_contract) === false) return 'eoa';
  return 'unknown';
}

/** Parses one GoPlus answer. Throws ProviderError for rate limits / API errors; returns null when the token is absent. */
export function parseGoPlus(json: unknown, token: Address): ProviderReport | null {
  const body = json as { code?: number; message?: string; result?: Record<string, Raw> } | null;
  if (!body || typeof body !== 'object') throw new ProviderError('error', 'GoPlus: empty response');
  if (body.code === GOPLUS_RATE_LIMIT_CODE) throw new ProviderError('rate_limited', `GoPlus ${body.code}: ${body.message ?? ''}`);
  if (body.code !== 1) throw new ProviderError('error', `GoPlus ${body.code}: ${body.message ?? ''}`);
  const r = body.result?.[token.toLowerCase()];
  if (!r || Object.keys(r).length === 0) return null;

  const facts: SecurityFacts = {};
  const set = <K extends keyof SecurityFacts>(k: K, v: SecurityFacts[K] | undefined) => {
    if (v !== undefined) facts[k] = v;
  };
  set('isOpenSource', flag(r.is_open_source));
  set('isHoneypot', flag(r.is_honeypot));
  set('buyTax', ratio(r.buy_tax));
  set('sellTax', ratio(r.sell_tax));
  set('transferTax', ratio(r.transfer_tax));
  set('cannotBuy', flag(r.cannot_buy));
  set('cannotSellAll', flag(r.cannot_sell_all));
  set('mintable', flag(r.is_mintable));
  set('proxy', flag(r.is_proxy));
  set('ownerCanChangeBalance', flag(r.owner_change_balance));
  set('taxModifiable', flag(r.slippage_modifiable));
  set('personalTaxModifiable', flag(r.personal_slippage_modifiable));
  set('blacklist', flag(r.is_blacklisted));
  set('whitelist', flag(r.is_whitelisted));
  set('pausable', flag(r.transfer_pausable));
  set('antiWhale', flag(r.is_anti_whale));
  set('antiWhaleModifiable', flag(r.anti_whale_modifiable));
  set('tradingCooldown', flag(r.trading_cooldown));
  set('hiddenOwner', flag(r.hidden_owner));
  set('canTakeBackOwnership', flag(r.can_take_back_ownership));
  set('selfDestruct', flag(r.selfdestruct));
  set('externalCall', flag(r.external_call));

  // owner_address: absent = unknown, "" = no owner.
  let owner: Address | null | undefined;
  if ('owner_address' in r) {
    if (r.owner_address === '') {
      owner = null;
      facts.isRenounced = true;
    } else {
      owner = addr(r.owner_address);
      if (owner) facts.isRenounced = isBurnAddress(owner);
    }
  }

  const holders = Array.isArray(r.holders)
    ? (r.holders as Raw[])
        .map((h): TopHolder | null => {
          const a = addr(h.address);
          const share = ratio(h.percent);
          if (!a || share === undefined) return null;
          const tag = str(h.tag);
          return { address: a, share, balance: str(h.balance) ?? null, kind: holderKind(h), ...(tag ? { label: tag } : {}) };
        })
        .filter((h): h is TopHolder => h !== null)
    : undefined;

  let lp: ProviderReport['lp'];
  let lpHolders: ProviderReport['lpHolders'];
  if (Array.isArray(r.lp_holders) && r.lp_holders.length > 0) {
    let burned = 0;
    let locked = 0;
    const lockers: LpLocker[] = [];
    lpHolders = [];
    for (const h of r.lp_holders as Raw[]) {
      const a = addr(h.address);
      const share = ratio(h.percent) ?? 0;
      if (!a) continue;
      lpHolders.push({ address: a, share, locked: flag(h.is_locked) === true, tag: str(h.tag) ?? null });
      if (isBurnAddress(a)) burned += share;
      else if (flag(h.is_locked)) {
        locked += share;
        lockers.push({ address: a, name: str(h.tag) ?? 'locker', share });
      }
    }
    lp = { pool: null, burnedShare: Math.min(1, burned), lockedShare: Math.min(1, locked), lockers, provider: 'goplus' };
  }

  const pools = Array.isArray(r.dex)
    ? (r.dex as Raw[])
        .map((d) => ({ id: str(d.pair) ?? '', type: str(d.liquidity_type) ?? '', name: str(d.name) ?? '', liquidityUsd: num(d.liquidity) ?? 0 }))
        .filter((d) => d.id !== '')
    : undefined;

  const creatorAddress = addr(r.creator_address);
  const launchpad = r.launchpad_token as Raw | undefined;
  const notes: string[] = [];
  if (flag(r.trust_list)) notes.push('GoPlus trust list');
  const other = str(r.other_potential_risks);
  if (other) notes.push(`GoPlus: ${other}`);

  return {
    provider: 'goplus',
    facts,
    owner,
    name: str(r.token_name),
    symbol: str(r.token_symbol),
    creator: creatorAddress ? { address: creatorAddress, balance: str(r.creator_balance) ?? null, share: ratio(r.creator_percent) ?? null } : undefined,
    holders,
    holderCount: num(r.holder_count),
    lp,
    lpHolders,
    pools,
    launchpadName: launchpad && flag(launchpad.is_launchpad_token) ? str(launchpad.launchpad_name) : undefined,
    notes,
  };
}

export interface GoPlusOptions {
  fetch: FetchLike;
  baseUrl?: string;
}

export async function fetchGoPlus(opts: GoPlusOptions, chain: EvmChainId, token: Address, signal: AbortSignal): Promise<ProviderReport | null> {
  const base = opts.baseUrl ?? 'https://api.gopluslabs.io';
  const url = `${base}/api/v1/token_security/${GOPLUS_CHAIN_IDS[chain]}?contract_addresses=${token.toLowerCase()}`;
  const res = await getJson(opts.fetch, url, signal);
  if (res.status !== 200) throw new ProviderError('error', `GoPlus HTTP ${res.status}`, res.status);
  return parseGoPlus(res.json, token);
}
