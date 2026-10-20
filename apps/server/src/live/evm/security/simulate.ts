// Simulated round trip (buy -> transfer -> sell) through eth_call with state
// overrides: the probe contract (probe/RoundTripProbe.sol) is placed at a
// throwaway address with native balance (or a quote-token balance set through a
// storage override) and trades against the pool directly, measuring every leg
// by balance deltas. Nothing is broadcast; eth_call state is discarded.
//
// RoundTripSimulator is the hook other venues plug into (bonding curves, V4
// pools): the checker asks every registered simulator for pools, ranks them and
// runs the owning simulator on the best one.

import { decodeAbiParameters, decodeErrorResult, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, numberToHex, pad, parseAbi, toFunctionSelector, toHex, zeroAddress, type Address, type Hex } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { roundTripProbeAbi } from './probe/abi';
import { ROUND_TRIP_PROBE_RUNTIME } from './probe/bytecode';
import { CallError, ethCall, multicall, type MulticallItem, type RpcClient } from './rpc';
import type { HolderSell, PoolRef, RoundTripLeg, RoundTripResult } from './types';
import { EXTRA_QUOTES, UNKNOWN_V2_FEE_BPS, VENUES, venueByFactory, type Venue } from './venues';

export interface SimulationContext {
  chain: EvmChainId;
  client: RpcClient;
}

/** Pluggable venue simulator (V2/V3 built in; curves / V4 added by the execution team). */
export interface RoundTripSimulator {
  readonly id: string;
  /** Pools of `token` this simulator can trade (any order; the checker ranks them). */
  discover(ctx: SimulationContext, token: Address): Promise<PoolRef[]>;
  /** Whether `pool` (from a caller hint, a template or this simulator's discovery) belongs to this simulator. */
  accepts(pool: PoolRef): boolean;
  /**
   * Optional: turn a bare pool reference (venue "unknown", e.g. a pair address a
   * third party reported) into a runnable one, or null when it is not this simulator's.
   */
  resolve?(ctx: SimulationContext, token: Address, pool: PoolRef): Promise<PoolRef | null>;
  /** Read-only buy -> transfer -> sell from a fresh address. */
  run(ctx: SimulationContext, pool: PoolRef): Promise<RoundTripResult>;
  /** Optional: sell `amount` (0 = all) from an existing holder's address, with its own balance and treatment. */
  sellAs?(ctx: SimulationContext, pool: PoolRef, holder: Address, amount: bigint): Promise<HolderSell>;
}

const seedAddress = (seed: string): Address => getAddress(`0x${keccak256(toHex(seed)).slice(26)}`);
/** Throwaway accounts used by the simulation (no code, no balance on any chain). */
export const PROBE_ADDRESS = seedAddress('trenchscope.security.probe');
export const CALLER_ADDRESS = seedAddress('trenchscope.security.caller');
export const RECIPIENT_ADDRESS = seedAddress('trenchscope.security.recipient');

const SIM_GAS = 30_000_000n;
/** Share of the pool's quote reserve spent on the probe buy (0.1%): small enough for max-tx limits and price impact. */
const BUY_SHARE_DIVISOR = 1000n;
/** Share of the bought tokens sent in the transfer leg (bps). */
const TRANSFER_BPS = 1000;
/** Effective sell tax at or above this reads as a honeypot (selling returns almost nothing). */
export const HONEYPOT_SELL_TAX = 0.9;

const poolAbi = parseAbi([
  'function getPair(address,address) view returns (address)',
  'function getPool(address,address,uint24) view returns (address)',
  'function factory() view returns (address)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function balanceOf(address) view returns (uint256)',
]);

const enc = (target: Address, functionName: (typeof poolAbi)[number]['name'], args: readonly unknown[] = []): MulticallItem => ({
  target,
  data: encodeFunctionData({ abi: poolAbi, functionName, args } as never),
});

const decAddr = (data: Hex): Address | null => {
  try {
    const a = decodeAbiParameters([{ type: 'address' }], data)[0] as Address;
    return a === zeroAddress ? null : getAddress(a);
  } catch {
    return null;
  }
};
const decUint = (data: Hex): bigint | null => {
  try {
    return decodeAbiParameters([{ type: 'uint256' }], data)[0] as bigint;
  } catch {
    return null;
  }
};

/** 1 - actual / expected, clamped to 0..1 and rounded to 4 decimals; null when expected is 0. */
export function lossRatio(expected: bigint, actual: bigint): number | null {
  if (expected <= 0n) return null;
  if (actual >= expected) return 0;
  const kept = Number((actual * 1_000_000n) / expected) / 1_000_000;
  return Math.round(Math.min(1, Math.max(0, 1 - kept)) * 10_000) / 10_000;
}

const ERROR_ABI = parseAbi([
  'error Error(string)',
  'error Panic(uint256)',
  'error TransferFailed(bytes reason)',
  'error FeeOnTransfer(uint256 debited, uint256 received)',
  'error NotSelf()',
  'error BadCallback()',
  // OpenZeppelin v5 ERC-20 errors
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidReceiver(address receiver)',
]);

/** Best-effort human reason for revert data (unwraps the probe's TransferFailed). */
export function decodeRevert(data: Hex | null | undefined, depth = 0): string | null {
  if (!data || data === '0x') return depth === 0 ? 'reverted without reason' : null;
  try {
    const d = decodeErrorResult({ abi: ERROR_ABI, data });
    if (d.errorName === 'Error') return String(d.args?.[0]);
    if (d.errorName === 'Panic') return `panic 0x${(d.args?.[0] as bigint).toString(16)}`;
    if (d.errorName === 'TransferFailed') return decodeRevert(d.args?.[0] as Hex, depth + 1) ?? 'token transfer failed';
    if (d.errorName === 'FeeOnTransfer') return 'fee-on-transfer rejected by the pool';
    if (d.errorName === 'ERC20InsufficientBalance') {
      const [, balance, needed] = d.args as readonly [string, bigint, bigint];
      return `ERC20InsufficientBalance (balance ${balance}, needed ${needed === 2n ** 256n - 1n ? 'uint256 max' : needed})`;
    }
    return d.errorName;
  } catch {
    return `custom error ${data.slice(0, 10)}`;
  }
}

function leg(raw: { ok: boolean; expected: bigint; actual: bigint; gasUsed: bigint; err: Hex }): RoundTripLeg {
  return { ok: raw.ok, expected: raw.expected, actual: raw.actual, gasUsed: raw.gasUsed, error: raw.ok ? null : raw.err, reason: raw.ok ? null : decodeRevert(raw.err) };
}

type ProbeOutcome = {
  buy: { ok: boolean; expected: bigint; actual: bigint; gasUsed: bigint; err: Hex };
  xfer: { ok: boolean; expected: bigint; actual: bigint; gasUsed: bigint; err: Hex };
  sell: { ok: boolean; expected: bigint; actual: bigint; gasUsed: bigint; err: Hex };
  quoteOut: bigint;
  expectedQuoteOut: bigint;
};

const FOT_SELECTOR = toFunctionSelector('function FeeOnTransfer(uint256,uint256)');

/** Turns the probe's raw outcome into taxes and a honeypot verdict. */
export function interpretOutcome(pool: PoolRef, amountIn: bigint, o: ProbeOutcome, skipBuy = false): RoundTripResult {
  const notes: string[] = [];
  const buy = leg(o.buy);
  // A leg that ran always used gas; one that was skipped is all zeros.
  const transfer = o.xfer.gasUsed > 0n ? leg(o.xfer) : null;
  const sell = o.sell.gasUsed > 0n ? leg(o.sell) : null;
  const fot = !!sell && !sell.ok && sell.error?.slice(0, 10) === FOT_SELECTOR;

  const buyTax = !skipBuy && buy.ok ? lossRatio(buy.expected, buy.actual) : null;
  const transferTax = transfer && transfer.ok ? lossRatio(transfer.expected, transfer.actual) : null;
  const tokenSellTax = sell && (sell.ok || fot) ? lossRatio(sell.expected, sell.actual) : null;
  const effectiveSellTax = sell?.ok ? lossRatio(o.expectedQuoteOut, o.quoteOut) : null;
  const sellTax = effectiveSellTax ?? tokenSellTax;

  let isHoneypot: boolean | null = null;
  let cannotBuy: boolean | null = skipBuy ? null : false;
  if (!skipBuy && !buy.ok) {
    cannotBuy = true;
    notes.push(`buy reverted: ${buy.reason}`);
  } else if (!skipBuy && buy.actual === 0n) {
    isHoneypot = true;
    notes.push('buy delivered no tokens');
  } else if (!sell) {
    notes.push('nothing to sell');
  } else if (fot) {
    notes.push(`fee-on-transfer token: this concentrated-liquidity pool cannot take it (token-level sell loss ${tokenSellTax === null ? '?' : (tokenSellTax * 100).toFixed(2)}%)`);
  } else if (!sell.ok) {
    isHoneypot = true;
    notes.push(`sell reverted: ${sell.reason}`);
  } else if (sellTax !== null && sellTax >= HONEYPOT_SELL_TAX) {
    isHoneypot = true;
    notes.push(`selling returns ${((1 - sellTax) * 100).toFixed(1)}% of the expected output`);
  } else isHoneypot = false;
  if (transfer && !transfer.ok) notes.push(`transfer between wallets reverted: ${transfer.reason}`);
  if (sell?.ok && sell.gasUsed > 3_000_000n) notes.push(`very high sell gas (${sell.gasUsed})`);

  return {
    venue: pool.venue,
    pool,
    amountIn,
    buy,
    transfer,
    sell,
    quoteOut: o.quoteOut,
    expectedQuoteOut: o.expectedQuoteOut,
    buyTax,
    sellTax,
    tokenSellTax,
    effectiveSellTax,
    transferTax,
    isHoneypot,
    cannotBuy,
    holderSells: [],
    notes,
  };
}

// ---------------------------------------------------------------------------
// Funding a non-native quote token: find its balance mapping slot
// ---------------------------------------------------------------------------

/** ERC-7201 base of OpenZeppelin v5 ERC20Storage (`_balances` is its first member). */
const OZ5_ERC20_STORAGE = '0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00' as const;
/** Marker values fit in 48 bits so tokens that pack balances into uint64 / uint96 fields still read them back intact. */
const BALANCE_SLOT_MARK = 2n ** 48n;

function balanceSlotCandidates(holder: Address): { slot: Hex; tag: string }[] {
  const out: { slot: Hex; tag: string }[] = [];
  for (let i = 0; i < 64; i++) {
    out.push({ slot: keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [holder, BigInt(i)])), tag: `sol:${i}` });
    out.push({ slot: keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [BigInt(i), holder])), tag: `vy:${i}` });
  }
  out.push({ slot: keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [holder, OZ5_ERC20_STORAGE])), tag: 'oz5' });
  return out;
}

const slotCache = new Map<string, string | null>();

/**
 * Finds which candidate mapping slot holds `holder`'s balance in one eth_call:
 * every candidate gets a distinct marked value and balanceOf tells which one the
 * token reads. Returns the slot tag (cached per token) or null.
 */
export async function findBalanceSlot(client: RpcClient, chain: EvmChainId, token: Address): Promise<string | null> {
  const key = `${chain}:${token.toLowerCase()}`;
  if (slotCache.has(key)) return slotCache.get(key)!;
  const cands = balanceSlotCandidates(PROBE_ADDRESS);
  const stateDiff: Record<Hex, Hex> = {};
  cands.forEach((c, i) => (stateDiff[c.slot] = pad(numberToHex(BALANCE_SLOT_MARK + BigInt(i)), { size: 32 })));
  let tag: string | null = null;
  try {
    const raw = await ethCall(client, { to: token, data: enc(token, 'balanceOf', [PROBE_ADDRESS]).data, overrides: { [token]: { stateDiff } } });
    const v = decUint(raw);
    if (v !== null && v >= BALANCE_SLOT_MARK && v < BALANCE_SLOT_MARK + BigInt(cands.length)) tag = cands[Number(v - BALANCE_SLOT_MARK)].tag;
  } catch {
    tag = null;
  }
  slotCache.set(key, tag);
  return tag;
}

function balanceSlotFor(tag: string, holder: Address): Hex {
  if (tag === 'oz5') return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [holder, OZ5_ERC20_STORAGE]));
  const [kind, n] = tag.split(':');
  return kind === 'sol'
    ? keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [holder, BigInt(n)]))
    : keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [BigInt(n), holder]));
}

// ---------------------------------------------------------------------------
// Uniswap / PancakeSwap V2 and V3
// ---------------------------------------------------------------------------

interface V2V3Extra {
  kind: 0 | 1;
  feeBps: number;
}

const extraOf = (p: PoolRef): V2V3Extra | null => {
  const e = p.extra as Partial<V2V3Extra> | undefined;
  return e && (e.kind === 0 || e.kind === 1) && typeof e.feeBps === 'number' ? { kind: e.kind, feeBps: e.feeBps } : null;
};

const venueIds = (chain?: EvmChainId) => new Set((chain ? VENUES[chain] : Object.values(VENUES).flat()).map((v) => v.id));
const ALL_IDS = venueIds();

/** Quote tokens pools are searched against: wrapped native first, then the chain's USD stablecoin. */
export function quoteTokens(chain: EvmChainId): Address[] {
  const info = EVM_CHAINS[chain];
  return [info.wrappedNative, ...(info.usd ? [info.usd.address] : []), ...(EXTRA_QUOTES[chain] ?? [])];
}

export class V2V3Simulator implements RoundTripSimulator {
  readonly id = 'v2-v3';

  accepts(pool: PoolRef): boolean {
    return (ALL_IDS.has(pool.venue) || pool.venue === 'v2-unknown' || pool.venue === 'v3-unknown') && extraOf(pool) !== null && pool.address.length === 42;
  }

  async discover(ctx: SimulationContext, token: Address): Promise<PoolRef[]> {
    const mc = EVM_CHAINS[ctx.chain].multicall3;
    const lookups: { venue: Venue; quote: Address; fee: number | null; item: MulticallItem }[] = [];
    for (const quote of quoteTokens(ctx.chain)) {
      if (quote.toLowerCase() === token.toLowerCase()) continue;
      for (const v of VENUES[ctx.chain]) {
        if (v.kind === 'v2') lookups.push({ venue: v, quote, fee: null, item: enc(v.factory, 'getPair', [token, quote]) });
        else for (const fee of v.fees) lookups.push({ venue: v, quote, fee, item: enc(v.factory, 'getPool', [token, quote, fee]) });
      }
    }
    const found = await multicall(ctx.client, mc, lookups.map((l) => l.item));
    const pools: { l: (typeof lookups)[number]; address: Address }[] = [];
    found.forEach((r, i) => {
      const a = r.success ? decAddr(r.data) : null;
      if (a) pools.push({ l: lookups[i], address: a });
    });
    if (pools.length === 0) return [];
    const reserves = await multicall(ctx.client, mc, pools.map((p) => enc(p.l.quote, 'balanceOf', [p.address])));
    return pools.map((p, i) => ({
      venue: p.l.venue.id,
      address: p.address,
      token,
      quote: p.l.quote,
      quoteReserve: (reserves[i]?.success ? decUint(reserves[i].data) : null) ?? 0n,
      fee: p.l.venue.kind === 'v2' ? p.l.venue.feeBps * 100 : p.l.fee,
      extra: { kind: p.l.venue.kind === 'v2' ? 0 : 1, feeBps: p.l.venue.kind === 'v2' ? p.l.venue.feeBps : 0 } satisfies V2V3Extra,
    }));
  }

  /** Classifies a bare pair / pool address (factory, tokens, V2 vs V3) into a runnable PoolRef. */
  async resolve(ctx: SimulationContext, token: Address, pool: PoolRef): Promise<PoolRef | null> {
    if (pool.address.length !== 42) return null;
    const addr = getAddress(pool.address);
    const mc = EVM_CHAINS[ctx.chain].multicall3;
    const [f, t0, t1, fee, res] = await multicall(ctx.client, mc, [enc(addr, 'factory'), enc(addr, 'token0'), enc(addr, 'token1'), enc(addr, 'fee'), enc(addr, 'getReserves')]);
    const token0 = t0.success ? decAddr(t0.data) : null;
    const token1 = t1.success ? decAddr(t1.data) : null;
    if (!token0 || !token1) return null;
    const t = token.toLowerCase();
    const quote = token0.toLowerCase() === t ? token1 : token1.toLowerCase() === t ? token0 : null;
    if (!quote) return null;
    const factory = f.success ? decAddr(f.data) : null;
    const venue = factory ? venueByFactory(ctx.chain, factory) : null;
    const isV2 = res.success;
    const isV3 = !isV2 && fee.success;
    if (!isV2 && !isV3) return null;
    const [qb] = await multicall(ctx.client, mc, [enc(quote, 'balanceOf', [addr])]);
    const feeV3 = fee.success ? Number(decUint(fee.data) ?? 0n) : null;
    const feeBps = isV2 ? (venue?.kind === 'v2' ? venue.feeBps : UNKNOWN_V2_FEE_BPS) : 0;
    return {
      venue: venue ? venue.id : isV2 ? 'v2-unknown' : 'v3-unknown',
      address: addr,
      token,
      quote,
      quoteReserve: (qb?.success ? decUint(qb.data) : null) ?? 0n,
      fee: isV2 ? feeBps * 100 : feeV3,
      extra: { kind: isV2 ? 0 : 1, feeBps } satisfies V2V3Extra,
    };
  }

  private async fundingOverrides(ctx: SimulationContext, quote: Address, account: Address, amount: bigint): Promise<{ wrap: boolean; overrides: Record<Address, { code?: Hex; balance?: bigint; stateDiff?: Record<Hex, Hex> }> } | null> {
    const wrapped = EVM_CHAINS[ctx.chain].wrappedNative;
    if (quote.toLowerCase() === wrapped.toLowerCase()) return { wrap: true, overrides: { [account]: { code: ROUND_TRIP_PROBE_RUNTIME, balance: amount * 2n } } };
    const tag = await findBalanceSlot(ctx.client, ctx.chain, quote);
    if (!tag) return null;
    return {
      wrap: false,
      overrides: {
        [account]: { code: ROUND_TRIP_PROBE_RUNTIME },
        [quote]: { stateDiff: { [balanceSlotFor(tag, account)]: pad(numberToHex(amount * 2n), { size: 32 }) } },
      },
    };
  }

  private async probe(ctx: SimulationContext, to: Address, params: Record<string, unknown>, overrides: Record<Address, { code?: Hex; balance?: bigint; stateDiff?: Record<Hex, Hex> }>): Promise<ProbeOutcome> {
    const data = encodeFunctionData({ abi: roundTripProbeAbi, functionName: 'roundTrip', args: [params as never] });
    const raw = await ethCall(ctx.client, { from: CALLER_ADDRESS, to, data, gas: SIM_GAS, overrides });
    return decodeFunctionResult({ abi: roundTripProbeAbi, functionName: 'roundTrip', data: raw }) as unknown as ProbeOutcome;
  }

  async run(ctx: SimulationContext, pool: PoolRef): Promise<RoundTripResult> {
    const extra = extraOf(pool);
    if (!extra) throw new Error(`pool ${pool.address} is not a V2/V3 pool`);
    const amountIn = pool.quoteReserve / BUY_SHARE_DIVISOR;
    const empty = { ok: false, expected: 0n, actual: 0n, gasUsed: 0n, err: '0x' as Hex };
    if (amountIn === 0n) {
      const r = interpretOutcome(pool, 0n, { buy: empty, xfer: empty, sell: empty, quoteOut: 0n, expectedQuoteOut: 0n });
      return { ...r, cannotBuy: null, notes: ['pool has no quote liquidity'] };
    }
    const funding = await this.fundingOverrides(ctx, pool.quote, PROBE_ADDRESS, amountIn);
    if (!funding) {
      const r = interpretOutcome(pool, amountIn, { buy: empty, xfer: empty, sell: empty, quoteOut: 0n, expectedQuoteOut: 0n });
      return { ...r, cannotBuy: null, notes: [`cannot fund quote token ${pool.quote} (balance slot not found)`] };
    }
    const params = {
      kind: extra.kind,
      pool: getAddress(pool.address),
      token: pool.token,
      quote: pool.quote,
      wrap: funding.wrap,
      amountIn,
      feeBps: extra.feeBps,
      recipient: RECIPIENT_ADDRESS,
      transferBps: TRANSFER_BPS,
      skipBuy: false,
      sellAmount: 0n,
    };
    const o = await this.probe(ctx, PROBE_ADDRESS, params, funding.overrides);
    return interpretOutcome(pool, amountIn, o);
  }

  async sellAs(ctx: SimulationContext, pool: PoolRef, holder: Address, amount: bigint): Promise<HolderSell> {
    const extra = extraOf(pool);
    if (!extra) throw new Error(`pool ${pool.address} is not a V2/V3 pool`);
    const params = {
      kind: extra.kind,
      pool: getAddress(pool.address),
      token: pool.token,
      quote: pool.quote,
      wrap: false,
      amountIn: 0n,
      feeBps: extra.feeBps,
      recipient: RECIPIENT_ADDRESS,
      transferBps: 0,
      skipBuy: true,
      sellAmount: amount,
    };
    try {
      // The holder's own address runs the probe code: the token sees the real holder (its balance, its tax / blacklist treatment).
      const o = await this.probe(ctx, holder, params, { [holder]: { code: ROUND_TRIP_PROBE_RUNTIME } });
      const r = interpretOutcome(pool, 0n, o, true);
      return { holder, ok: !!r.sell?.ok, sellTax: r.sellTax, reason: r.sell?.ok ? null : (r.sell?.reason ?? 'nothing to sell') };
    } catch (err) {
      return { holder, ok: false, sellTax: null, reason: err instanceof CallError ? (decodeRevert(err.data) ?? err.message) : (err as Error).message };
    }
  }
}

/** Ranks pools: wrapped-native quote first, then by quote-side reserve. */
export function rankPools(chain: EvmChainId, pools: PoolRef[]): PoolRef[] {
  const wrapped = EVM_CHAINS[chain].wrappedNative.toLowerCase();
  return [...pools].sort((a, b) => {
    const wa = a.quote.toLowerCase() === wrapped ? 1 : 0;
    const wb = b.quote.toLowerCase() === wrapped ? 1 : 0;
    if (wa !== wb) return wb - wa;
    return a.quoteReserve === b.quoteReserve ? 0 : a.quoteReserve > b.quoteReserve ? -1 : 1;
  });
}

export const v2v3Simulator = new V2V3Simulator();
