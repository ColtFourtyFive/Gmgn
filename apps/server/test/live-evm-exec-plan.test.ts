import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, maxUint160, maxUint256, parseEther, sliceHex, zeroAddress, type Address, type Hex } from 'viem';
import { erc20Abi, KYBER_NATIVE, permit2Abi, universalRouterAbi } from '../src/live/evm/exec/abis';
import { allowlistedTargets, chainAllowlist, validatePlan } from '../src/live/evm/exec/allowlist';
import { EVM_VENUES } from '../src/live/evm/exec/contracts';
import { EvmExecError } from '../src/live/evm/exec/errors';
import { validateKyberBuild, type KyberBuild, type KyberBuildExpectation } from '../src/live/evm/exec/kyber';
import type { EvmPlanStep, EvmQuote, EvmTxPlan, V4Hop } from '../src/live/evm/exec/types';
import { MSG_SENDER, NATIVE, OPEN_DELTA, RouterPlan, UR_COMMAND, V4ActionPlan, V4_ACTION, poolIdOf, poolKeyFor, v3Path } from '../src/live/evm/exec/ur';

const FIX = join(__dirname, 'fixtures/evm/exec');
const TOKEN: Address = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';
const FEE: Address = '0x000000000000000000000000000000000000beef';
const NOW_S = 1_790_000_000;

function planWith(steps: EvmPlanStep[], chain: EvmTxPlan['chain'] = 'base'): EvmTxPlan {
  return {
    id: 'p',
    chain,
    wallet: '0x00000000000000000000000000000000000c0ffe',
    quote: { token: TOKEN } as EvmQuote,
    steps,
    deadline: null,
    createdAt: 0,
  };
}

const swap = (to: Address): EvmPlanStep => ({ kind: 'swap', to, data: '0x12345678', value: 0n, description: 's', timing: 'swap' });
const approve = (spender: Address, amount: bigint): EvmPlanStep => ({ kind: 'approve', to: TOKEN, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }), value: 0n, description: 'a', timing: 'before-swap' });
const ctx = { feeWallet: FEE, verifiedTargets: [] as Address[], nowSeconds: NOW_S };
const UR_BASE = EVM_VENUES.base.uniswap!.universalRouter;
const KYBER = EVM_VENUES.base.kyberRouter!;

describe('plan allow-list', () => {
  it('accepts exact approvals to allow-listed spenders and swaps to allow-listed routers', () => {
    expect(() => validatePlan(planWith([approve(KYBER, 10n), swap(KYBER)]), ctx)).not.toThrow();
    expect(() => validatePlan(planWith([approve(EVM_VENUES.bsc.fourMeme!.tokenManager2, 10n), swap(EVM_VENUES.bsc.fourMeme!.tokenManager2)], 'bsc'), ctx)).not.toThrow();
    const permit = encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [TOKEN, UR_BASE, 10n, NOW_S + 1200] });
    expect(() => validatePlan(planWith([approve('0x000000000022D473030F116dDEE9F6B43aC78BA3', 10n), { kind: 'permit2-approve', to: '0x000000000022D473030F116dDEE9F6B43aC78BA3', data: permit, value: 0n, description: 'p', timing: 'before-swap' }, swap(UR_BASE)]), ctx)).not.toThrow();
  });

  it('rejects infinite approvals, unknown spenders and unknown swap targets', () => {
    expect(() => validatePlan(planWith([approve(KYBER, maxUint256), swap(KYBER)]), ctx)).toThrow(/exact/);
    expect(() => validatePlan(planWith([approve('0x000000000000000000000000000000000000dEaD', 10n), swap(KYBER)]), ctx)).toThrow(/not allow-listed/);
    expect(() => validatePlan(planWith([swap('0x000000000000000000000000000000000000dEaD')]), ctx)).toThrow(EvmExecError);
    // a router allow-listed on another chain is not allow-listed here
    expect(() => validatePlan(planWith([swap(EVM_VENUES.bsc.fourMeme!.tokenManager2)], 'base'), ctx)).toThrow(/not allow-listed/);
    // approvals target the traded token only
    const other = { ...approve(KYBER, 10n), to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address };
    expect(() => validatePlan(planWith([other, swap(KYBER)]), ctx)).toThrow(/traded token/);
  });

  it('checks Permit2 spender, amount and expiry', () => {
    const p2 = (spender: Address, amount: bigint, exp: number): EvmPlanStep => ({
      kind: 'permit2-approve',
      to: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [TOKEN, spender, amount, exp] }),
      value: 0n,
      description: 'p',
      timing: 'before-swap',
    });
    expect(() => validatePlan(planWith([p2(KYBER, 10n, NOW_S + 600), swap(UR_BASE)]), ctx)).toThrow(/Permit2 spender/);
    expect(() => validatePlan(planWith([p2(UR_BASE, maxUint160, NOW_S + 600), swap(UR_BASE)]), ctx)).toThrow(/exact/);
    expect(() => validatePlan(planWith([p2(UR_BASE, 10n, NOW_S + 86_400), swap(UR_BASE)]), ctx)).toThrow(/expiry/);
  });

  it('allows one fee transfer, as plain value to the fee wallet', () => {
    const fee = (to: Address, data: Hex = '0x'): EvmPlanStep => ({ kind: 'fee', to, data, value: 1n, description: 'f', timing: 'before-swap' });
    expect(() => validatePlan(planWith([fee(FEE), swap(KYBER)]), ctx)).not.toThrow();
    expect(() => validatePlan(planWith([fee('0x000000000000000000000000000000000000dEaD'), swap(KYBER)]), ctx)).toThrow(/fee wallet/);
    expect(() => validatePlan(planWith([fee(FEE, '0x01'), swap(KYBER)]), ctx)).toThrow(/calldata/);
    expect(() => validatePlan(planWith([fee(FEE), fee(FEE), swap(KYBER)]), ctx)).toThrow(/twice/);
    expect(() => validatePlan(planWith([fee(FEE)]), ctx)).toThrow(/exactly one swap/);
  });

  it('accepts a Pons curve only when verified against the factory for this plan', () => {
    const curve: Address = '0x95f75DDB3c10f3610Feb4e40c7c31809a7B4AF1b';
    const steps = [approve(curve, 5n), swap(curve)];
    expect(() => validatePlan(planWith(steps, 'robinhood'), ctx)).toThrow(/not allow-listed/);
    expect(() => validatePlan(planWith(steps, 'robinhood'), { ...ctx, verifiedTargets: [curve] })).not.toThrow();
  });

  it('lists the allow-listed targets per chain', () => {
    expect(allowlistedTargets('robinhood').map((a) => a.toLowerCase())).toEqual(
      expect.arrayContaining(['0x8876789976decbfcbbbe364623c63652db8c0904', '0x6131b5fae19ea4f9d964eac0408e4408b66337b5', '0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09', '0x000000000022d473030f116ddee9f6b43ac78ba3']),
    );
    expect(chainAllowlist('bsc').permit2Spenders.size).toBe(0);
    expect(chainAllowlist('eth').swapTargets.has('0x66a9893cc07d91d95644aedd05d03f95e1dba8af')).toBe(true);
  });
});

describe('Universal Router encoding', () => {
  const key = poolKeyFor(zeroAddress, TOKEN, 0, 200, '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044');
  const hops: V4Hop[] = [{ key, currencyIn: zeroAddress, currencyOut: TOKEN }];

  for (const version of ['2.0', '2.1.1'] as const) {
    it(`encodes a native-in v4 buy with the fee inside (UR ${version})`, () => {
      const actions = new V4ActionPlan(version).swapExactIn(hops, 990n, 5n).settle(zeroAddress, OPEN_DELTA, false).takeAll(TOKEN, 5n);
      const data = new RouterPlan(version).transfer(NATIVE, FEE, 10n).v4Swap(actions).sweep(NATIVE, MSG_SENDER, 0n).encodeExecute(123n);
      const call = decodeFunctionData({ abi: universalRouterAbi, data });
      const [commands, inputs, deadline] = call.args;
      expect(commands).toBe(`0x${[UR_COMMAND.TRANSFER, UR_COMMAND.V4_SWAP, UR_COMMAND.SWEEP].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
      expect(deadline).toBe(123n);
      expect(decodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], inputs[0])).toEqual([NATIVE, '0x000000000000000000000000000000000000bEEF', 10n]);
      const [acts, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[1]);
      expect(acts).toBe(`0x${[V4_ACTION.SWAP_EXACT_IN_SINGLE, V4_ACTION.SETTLE, V4_ACTION.TAKE_ALL].map((a) => a.toString(16).padStart(2, '0')).join('')}`);
      const base = [
        { name: 'poolKey', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
      ] as const;
      const struct = version === '2.0' ? [...base, { name: 'hookData', type: 'bytes' }] : [...base, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }];
      const [swapParams] = decodeAbiParameters([{ type: 'tuple', components: struct }] as never, params[0]) as [Record<string, unknown>];
      expect(swapParams).toMatchObject({ zeroForOne: true, amountIn: 990n, amountOutMinimum: 5n });
      expect((swapParams.poolKey as { hooks: string }).hooks).toBe('0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044');
      // 2.1.1 adds one word (minHopPriceX36) to the struct
      expect(sliceHex(params[0], 0).length).toBe(version === '2.0' ? 2 + 64 * 11 : 2 + 64 * 12);
    });
  }

  it('encodes v3 paths and pool ids', () => {
    expect(v3Path('0x4200000000000000000000000000000000000006', 3000, TOKEN)).toBe('0x4200000000000000000000000000000000000006000bb84ed4e862860bed51a9570b96d89af5e1b0efefed');
    // pool id of the graduated Pons pool verified on Robinhood Chain (StateView liquidity > 0)
    expect(poolIdOf(poolKeyFor(zeroAddress, '0xb11384a6ac2b3708e3d25a834c8a88687accbcd1', 0, 200, '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'))).toBe('0x089ada66d5258297e1cab1516708a9fb1aef166df3ee901a75f3f2c7f7e79202');
  });

  it('adds the empty minHopPriceX36 array to v2/v3 swaps from UR 2.1.1', () => {
    const v20 = new RouterPlan('2.0').v2SwapExactIn(MSG_SENDER, 1n, 1n, [TOKEN, zeroAddress], true);
    const v211 = new RouterPlan('2.1.1').v2SwapExactIn(MSG_SENDER, 1n, 1n, [TOKEN, zeroAddress], true);
    expect(decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'bool' }, { type: 'uint256[]' }], v211.inputs[0])[5]).toEqual([]);
    expect(v211.inputs[0].length).toBeGreaterThan(v20.inputs[0].length);
  });
});

describe('KyberSwap build validation (real Base builds: ETH->USDC buy, USDC->ETH sell, fee 80 bps)', () => {
  const load = (f: string) => {
    const j = JSON.parse(readFileSync(join(FIX, f), 'utf8'));
    const d = j.build.data;
    const build: KyberBuild = { amountIn: BigInt(d.amountIn), amountOut: BigInt(d.amountOut), gas: BigInt(d.gas), data: d.data, routerAddress: d.routerAddress, value: BigInt(d.transactionValue) };
    return build;
  };
  const buy = load('kyber-base-build-buy.json');
  const sell = load('kyber-base-build-sell.json');
  const wallet: Address = '0x00000000000000000000000000000000000c0ffe';
  const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const buyExp: KyberBuildExpectation = { allowedRouters: [KYBER], tokenIn: KYBER_NATIVE, tokenOut: USDC, amountIn: parseEther('0.01'), wallet, minOut: 23_901_540n, minReturnFloor: 23_901_540n, fee: { bps: 80, chargeBy: 'currency_in', receiver: FEE } };
  const sellExp: KyberBuildExpectation = { allowedRouters: [KYBER], tokenIn: USDC, tokenOut: KYBER_NATIVE, amountIn: 100_000_000n, wallet, minOut: 40_351_534_127_555_635n, minReturnFloor: 40_351_534_127_555_635n, fee: { bps: 80, chargeBy: 'currency_out', receiver: FEE } };

  it('accepts the real builds', () => {
    expect(validateKyberBuild(buy, buyExp)).toEqual({ minReturnAmount: 23_901_540n, selector: 'swap' });
    expect(validateKyberBuild(sell, sellExp).minReturnAmount).toBe(40_351_534_127_555_635n);
  });

  it('rejects anything that does not match the request', () => {
    const bad = (b: KyberBuild, e: KyberBuildExpectation, re: RegExp) => expect(() => validateKyberBuild(b, e)).toThrow(re);
    bad({ ...buy, routerAddress: '0x000000000000000000000000000000000000dEaD' }, buyExp, /not allow-listed/);
    bad(buy, { ...buyExp, wallet: '0x000000000000000000000000000000000000dEaD' }, /wallet/);
    bad(buy, { ...buyExp, amountIn: parseEther('0.02') }, /input amount/);
    bad(buy, { ...buyExp, tokenOut: TOKEN }, /destination token/);
    bad(buy, { ...buyExp, minReturnFloor: 23_901_541n }, /minReturnAmount/);
    bad(buy, { ...buyExp, minOut: 30_000_000n }, /below our minOut/);
    bad({ ...buy, value: 0n }, buyExp, /value/);
    bad(buy, { ...buyExp, fee: { ...buyExp.fee!, receiver: '0x000000000000000000000000000000000000dEaD' } }, /fee receiver/);
    bad(buy, { ...buyExp, fee: { ...buyExp.fee!, bps: 30 } }, /fee amount/);
    bad(buy, { ...buyExp, fee: { ...buyExp.fee!, chargeBy: 'currency_out' } }, /wrong side/);
    bad(sell, { ...sellExp, fee: null }, /unexpected fee receivers/);
    bad({ ...buy, data: '0xdeadbeef' }, buyExp, /not a MetaAggregationRouterV2 swap/);
  });
});
