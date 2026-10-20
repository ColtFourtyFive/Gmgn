// honeypot.is v2 (keyless). Verified response format (2026-10):
//   GET https://api.honeypot.is/v2/IsHoneypot?address={token}&chainID={1|56|8453}
//   200 { token, withToken, summary: { risk, riskLevel, flags[] }, simulationSuccess,
//         honeypotResult: { isHoneypot, honeypotReason? }, simulationResult: { buyTax, sellTax,
//         transferTax, buyGas, sellGas } (taxes in PERCENT), holderAnalysis?, contractCode:
//         { openSource, rootOpenSource, isProxy, hasProxyCalls }, pair: { pair: { address, type } } }
//   404 {"code":404,"error":"pair not found"} / "Token not found"
//   400 {"code":400,"error":"Invalid chain"}            <- Robinhood Chain (4663) is not supported
// Its taxes are quote-level (expected vs received through the router), so a
// token whose contract dumps its own tax tokens during a sell shows a higher
// sell tax here than the token-level transfer loss.

import { getAddress, isAddress, type Address } from 'viem';
import type { EvmChainId } from '../chains';
import { getJson, ProviderError, type FetchLike } from './http';
import type { ProviderReport } from './merge';
import type { SecurityFacts } from './types';

export const HONEYPOT_IS_CHAIN_IDS: Partial<Record<EvmChainId, number>> = { eth: 1, bsc: 56, base: 8453 };

type Raw = Record<string, unknown>;

const pct = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(1, v / 100) : undefined);

/** Parses an IsHoneypot answer (any status). Returns null for "pair / token not found". */
export function parseHoneypotIs(status: number, json: unknown): ProviderReport | null {
  const body = (json ?? {}) as Raw;
  if (status === 404) return null;
  if (status === 400) throw new ProviderError('unsupported', `honeypot.is: ${String(body.error ?? 'bad request')}`, 400);
  if (status !== 200) throw new ProviderError('error', `honeypot.is HTTP ${status}: ${String(body.error ?? '')}`, status);

  const facts: SecurityFacts = {};
  const notes: string[] = [];
  const sim = body.simulationResult as Raw | undefined;
  const hp = body.honeypotResult as Raw | undefined;
  if (body.simulationSuccess === true && sim) {
    const buy = pct(sim.buyTax);
    const sell = pct(sim.sellTax);
    const xfer = pct(sim.transferTax);
    if (buy !== undefined) facts.buyTax = buy;
    if (sell !== undefined) facts.sellTax = sell;
    if (xfer !== undefined) facts.transferTax = xfer;
    if (typeof hp?.isHoneypot === 'boolean') facts.isHoneypot = hp.isHoneypot;
  } else if (body.simulationSuccess === false) {
    notes.push('honeypot.is: simulation failed');
  }
  if (typeof hp?.honeypotReason === 'string' && hp.honeypotReason) notes.push(`honeypot.is: ${hp.honeypotReason}`);

  const code = body.contractCode as Raw | undefined;
  if (typeof code?.openSource === 'boolean') facts.isOpenSource = code.openSource;
  if (typeof code?.isProxy === 'boolean') facts.proxy = code.isProxy;

  const ha = body.holderAnalysis as Raw | undefined;
  if (ha) {
    const holders = Number(ha.holders);
    const failed = Number(ha.failed);
    const avg = Number(ha.averageTax);
    if (Number.isFinite(holders) && holders > 0) {
      notes.push(`honeypot.is: ${Number.isFinite(failed) ? holders - failed : '?'}/${holders} sampled holders can sell${Number.isFinite(avg) ? `, average tax ${avg.toFixed(1)}%` : ''}`);
    }
  }
  const summary = body.summary as Raw | undefined;
  if (typeof summary?.risk === 'string') notes.push(`honeypot.is risk: ${summary.risk}`);

  const pairInfo = (body.pair as Raw | undefined)?.pair as Raw | undefined;
  const pairAddr = typeof pairInfo?.address === 'string' && isAddress(pairInfo.address, { strict: false }) ? getAddress(pairInfo.address) : undefined;
  const token = body.token as Raw | undefined;
  const totalHolders = Number(token?.totalHolders);

  return {
    provider: 'honeypotis',
    facts,
    name: typeof token?.name === 'string' ? token.name : undefined,
    symbol: typeof token?.symbol === 'string' ? token.symbol : undefined,
    holderCount: Number.isFinite(totalHolders) ? totalHolders : undefined,
    pools: pairAddr ? [{ id: pairAddr, type: String(pairInfo?.type ?? ''), name: String(pairInfo?.name ?? ''), liquidityUsd: Number((body.pair as Raw).liquidity) || 0 }] : undefined,
    notes,
  };
}

export interface HoneypotIsOptions {
  fetch: FetchLike;
  baseUrl?: string;
}

export async function fetchHoneypotIs(opts: HoneypotIsOptions, chain: EvmChainId, token: Address, signal: AbortSignal): Promise<ProviderReport | null> {
  const id = HONEYPOT_IS_CHAIN_IDS[chain];
  if (!id) throw new ProviderError('unsupported', `honeypot.is does not support ${chain}`);
  const base = opts.baseUrl ?? 'https://api.honeypot.is';
  const res = await getJson(opts.fetch, `${base}/v2/IsHoneypot?address=${token}&chainID=${id}`, signal);
  return parseHoneypotIs(res.status, res.json);
}
