// Launchpad template recognition. Each launchpad is recognised by asking its own
// registry on-chain (not by vanity suffixes or names), then the template's known
// facts are attached. Every address and view below was verified on mainnet
// (2026-10) against live tokens:
//   four.meme (BNB Chain)  TokenManager2._tokenInfos(token)[0] == token; owner() is the manager while on the
//                          curve, the zero address after migration (PancakeSwap LP burned to 0x…dEaD).
//                          Tax template (Token9, verified source on Sourcify): feeRateBuy / feeRateSell in
//                          percent (<= 10), charged only on the PancakeSwap pair after migration.
//   Flap (BNB Chain, Robinhood)  portal.getTokenV2(token) succeeds only for Flap tokens (word 0 = status:
//                          1 on the curve, 4 after migration). Tax template: buyTaxRate / sellTaxRate in bps
//                          (100 = 1%, matched by the round-trip simulation).
//   Clanker v4 (Base)      factory.tokenDeploymentInfo(token) = (token, hook, locker, extensions[]).
//                          Token source: crosschainMint/Burn only by the Superchain bridge, admin can only
//                          update image / metadata / admin, no transfer fee or restriction.
//   Zora (Base)            factory.getVersionForDeployedCoin(token) > 0 (coins are clones of coinV4Impl).
//   Pons V2 (Robinhood)    launchFactory.getLaunchedToken(token) = (token, curve, deployer, ...).
//   pools.trade (Robinhood) Uniswap UERC20: factory.getUERC20Address(name, symbol, decimals, creator, graffiti)
//                          == token, with creator one of the pools.trade launch entry contracts.

import { encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { selectorOf } from './bytecode';
import type { ProviderReport } from './merge';
import type { OnchainInspection } from './onchain';
import { multicall, type MulticallItem, type RpcClient } from './rpc';
import type { LaunchpadMatch, LpInfo, OwnerRole, PoolRef, SecurityFacts } from './types';
import { isBurnAddress } from './venues';

export const LAUNCHPAD_ADDRESSES = {
  fourMemeTokenManager2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  flapPortalBsc: '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0',
  flapPortalRobinhood: '0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09',
  clankerV4Factory: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9',
  zoraFactory: '0x777777751622c0d3258f214F9DF38E35BF45baF3',
  ponsV2LaunchFactory: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
  ponsV2LaunchLocker: '0x267444d099b10fb5ed7c3cc7b7c767adca574952',
  uerc20Factory: '0x000000e200088d55c39a11f609e5f667729ad49b',
  poolsTradeEntries: ['0x0000ffffbe8efe702c8703ae3477ff5de3d319c0', '0x00004c4ccc709ef590f7c81102c0689f0263d4e9'],
} as const;

// Registry views return structs; only their calldata is encoded here and the
// answers are read word by word (wordAt / wordAddr), so their outputs are stubbed.
const abi = parseAbi([
  'function _tokenInfos(address) view returns (uint256)',
  'function getTokenV2(address) view returns (uint256)',
  'function tokenDeploymentInfo(address) view returns (uint256)',
  'function getVersionForDeployedCoin(address) view returns (uint8)',
  'function getLaunchedToken(address) view returns (uint256)',
  'function getUERC20Address(string,string,uint8,address,bytes32) view returns (address)',
  'function creator() view returns (address)',
  'function graffiti() view returns (bytes32)',
  'function feeRateBuy() view returns (uint256)',
  'function feeRateSell() view returns (uint256)',
  'function buyTaxRate() view returns (uint256)',
  'function sellTaxRate() view returns (uint256)',
  'function mainPool() view returns (address)',
]);

type Fn = (typeof abi)[number]['name'];
const item = (target: string, functionName: Fn, args: readonly unknown[] = []): MulticallItem => ({
  target: getAddress(target),
  data: encodeFunctionData({ abi, functionName, args } as never),
});

/** 32-byte word `i` of ABI-encoded return data. */
const wordAt = (data: Hex, i: number): Hex | null => (data.length >= 2 + 64 * (i + 1) ? (`0x${data.slice(2 + 64 * i, 2 + 64 * (i + 1))}` as Hex) : null);
const wordAddr = (data: Hex, i: number): Address | null => {
  const w = wordAt(data, i);
  return w ? getAddress(`0x${w.slice(-40)}`) : null;
};
const wordNum = (data: Hex, i: number): bigint | null => {
  const w = wordAt(data, i);
  return w ? BigInt(w) : null;
};
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface LaunchpadResult {
  match: LaunchpadMatch;
  /** Ownership meaning under this template (overrides the on-chain reading when set). */
  ownerRole?: OwnerRole;
  /** Template facts, reported as provider 'launchpad'. */
  report: ProviderReport;
  lp?: LpInfo;
  creator?: Address;
  /** Pools the template points at (main pool / bonding curve). */
  pools?: PoolRef[];
}

interface Ctx {
  client: RpcClient;
  chain: EvmChainId;
  token: Address;
  inspection: OnchainInspection;
}

interface LaunchpadDef {
  id: string;
  name: string;
  chains: Partial<Record<EvmChainId, Address>>;
  /** Registry call, or null when the token's selectors rule the launchpad out. */
  probe(ctx: Ctx, registry: Address): MulticallItem[] | null;
  /** Interprets the probe results; returns null when the token is not from this launchpad. */
  finish(ctx: Ctx, registry: Address, results: { success: boolean; data: Hex }[]): Promise<LaunchpadResult | null>;
}

const hasSel = (ctx: Ctx, sig: string) => ctx.inspection.selectors.has(selectorOf(sig));

async function reads(ctx: Ctx, items: MulticallItem[]): Promise<({ success: boolean; data: Hex })[]> {
  return items.length ? multicall(ctx.client, EVM_CHAINS[ctx.chain].multicall3, items) : [];
}

const pctOf = (n: bigint | null, denom: number): number | undefined => (n === null || n > BigInt(denom) ? undefined : Number(n) / denom);

const fourMeme: LaunchpadDef = {
  id: 'four.meme',
  name: 'four.meme',
  chains: { bsc: LAUNCHPAD_ADDRESSES.fourMemeTokenManager2 },
  probe: (ctx, registry) => [item(registry, '_tokenInfos', [ctx.token])],
  async finish(ctx, registry, [info]) {
    if (!info?.success || !same(wordAddr(info.data, 0), ctx.token)) return null;
    const i = ctx.inspection;
    const quoteWord = wordAddr(info.data, 1);
    const quote = quoteWord && !isBurnAddress(quoteWord) ? quoteWord : null;
    const tax = hasSel(ctx, 'feeRateBuy()') && hasSel(ctx, 'feeRateSell()');
    const facts: SecurityFacts = {};
    const lines = [`Registered in four.meme TokenManager2 (${short(registry)})`];
    if (tax) {
      const [b, s] = await reads(ctx, [item(ctx.token, 'feeRateBuy'), item(ctx.token, 'feeRateSell')]);
      const buy = b?.success ? pctOf(wordNum(b.data, 0), 100) : undefined;
      const sell = s?.success ? pctOf(wordNum(s.data, 0), 100) : undefined;
      if (buy !== undefined) facts.buyTax = buy;
      if (sell !== undefined) facts.sellTax = sell;
      facts.transferTax = 0;
      lines.push(
        `Tax template: ${buy === undefined ? '?' : (buy * 100).toFixed(0)}% buy / ${sell === undefined ? '?' : (sell * 100).toFixed(0)}% sell, charged on the PancakeSwap pair after migration (contract caps it at 10%)`,
      );
    } else {
      facts.buyTax = 0;
      facts.sellTax = 0;
      facts.transferTax = 0;
      lines.push('Standard template: fixed supply minted at launch, no fee logic');
    }
    const onCurve = same(i.owner, registry);
    const graduated = i.ownerFunction !== null && isBurnAddress(i.owner);
    lines.push(
      onCurve
        ? 'On the bonding curve: the TokenManager owns the token and blocks transfers to pools until migration'
        : 'Migration renounces ownership and burns the PancakeSwap LP',
    );
    return {
      match: { id: 'four.meme', name: 'four.meme', template: tax ? 'tax' : 'standard', evidence: 'TokenManager2._tokenInfos', phase: onCurve ? 'bonding-curve' : graduated ? 'graduated' : null, facts: lines },
      ownerRole: onCurve ? 'launchpad' : undefined,
      report: { provider: 'launchpad', facts, launchpadName: 'four.meme' },
      pools: onCurve ? [{ venue: 'four.meme-curve', address: registry, token: ctx.token, quote: quote ?? EVM_CHAINS.bsc.wrappedNative, quoteReserve: 0n, fee: null }] : undefined,
    };
  },
};

const FLAP_PHASES: Record<string, string> = { '1': 'bonding-curve', '4': 'graduated' };

const flap: LaunchpadDef = {
  id: 'flap',
  name: 'Flap',
  chains: { bsc: LAUNCHPAD_ADDRESSES.flapPortalBsc, robinhood: LAUNCHPAD_ADDRESSES.flapPortalRobinhood },
  probe: (ctx, registry) => [item(registry, 'getTokenV2', [ctx.token])],
  async finish(ctx, registry, [info]) {
    if (!info?.success) return null;
    const status = wordNum(info.data, 0);
    const tax = hasSel(ctx, 'buyTaxRate()') && hasSel(ctx, 'sellTaxRate()');
    const facts: SecurityFacts = {};
    const lines = [`Registered in the Flap portal (${short(registry)})`];
    let mainPool: Address | null = null;
    if (tax) {
      const [b, s, m] = await reads(ctx, [item(ctx.token, 'buyTaxRate'), item(ctx.token, 'sellTaxRate'), item(ctx.token, 'mainPool')]);
      const buy = b?.success ? pctOf(wordNum(b.data, 0), 10_000) : undefined;
      const sell = s?.success ? pctOf(wordNum(s.data, 0), 10_000) : undefined;
      if (buy !== undefined) facts.buyTax = buy;
      if (sell !== undefined) facts.sellTax = sell;
      mainPool = m?.success ? wordAddr(m.data, 0) : null;
      lines.push(`Tax template: ${buy === undefined ? '?' : (buy * 100).toFixed(2)}% buy / ${sell === undefined ? '?' : (sell * 100).toFixed(2)}% sell (buyTaxRate / sellTaxRate)`);
    }
    const onCurve = same(ctx.inspection.owner, registry);
    if (onCurve) lines.push('On the bonding curve: the portal owns the token');
    const phase = status === null ? null : (FLAP_PHASES[status.toString()] ?? `status ${status}`);
    const wrapped = EVM_CHAINS[ctx.chain].wrappedNative;
    return {
      match: { id: 'flap', name: 'Flap', template: tax ? 'tax' : 'standard', evidence: 'portal.getTokenV2', phase, facts: lines },
      ownerRole: onCurve ? 'launchpad' : undefined,
      report: { provider: 'launchpad', facts, launchpadName: 'Flap' },
      pools: mainPool && !isBurnAddress(mainPool) ? [{ venue: 'unknown', address: mainPool, token: ctx.token, quote: wrapped, quoteReserve: 0n, fee: null }] : undefined,
    };
  },
};

const clankerV4: LaunchpadDef = {
  id: 'clanker-v4',
  name: 'Clanker v4',
  chains: { base: LAUNCHPAD_ADDRESSES.clankerV4Factory },
  probe: (ctx, registry) => [item(registry, 'tokenDeploymentInfo', [ctx.token])],
  async finish(ctx, registry, [info]) {
    // ABI: offset (0x20), then (token, hook, locker, offset(extensions), ...)
    if (!info?.success || !same(wordAddr(info.data, 1), ctx.token)) return null;
    const hook = wordAddr(info.data, 2);
    const locker = wordAddr(info.data, 3);
    const metadataOnly = hasSel(ctx, 'updateAdmin(address)') && !ctx.inspection.capabilities.some((c) => ['mint', 'blacklist', 'setTax', 'pause', 'balanceSetter', 'upgrade'].includes(c.capability));
    const facts: SecurityFacts = { mintable: false, buyTax: 0, sellTax: 0, transferTax: 0, blacklist: false, pausable: false, taxModifiable: false, ownerCanChangeBalance: false };
    const lines = [
      `Deployed by the Clanker v4 factory (${short(registry)})`,
      'Fixed supply; crosschainMint / crosschainBurn only callable by the Superchain token bridge',
      'Admin can only update the image / metadata and hand over the admin role',
      `No transfer fee in the token${hook ? ` (swap fees are charged by the Clanker hook ${short(hook)})` : ''}`,
    ];
    if (locker) lines.push(`Initial liquidity position held by the Clanker LP locker ${short(locker)}`);
    return {
      match: { id: 'clanker-v4', name: 'Clanker v4', template: 'standard', evidence: 'factory.tokenDeploymentInfo', phase: null, facts: lines },
      ownerRole: metadataOnly ? 'metadata-only' : undefined,
      report: { provider: 'launchpad', facts, launchpadName: 'Clanker' },
      lp: locker ? { pool: null, burnedShare: null, lockedShare: null, lockers: [{ address: locker, name: 'Clanker LP locker', share: null }], provider: 'launchpad' } : undefined,
    };
  },
};

const zora: LaunchpadDef = {
  id: 'zora',
  name: 'Zora',
  chains: { base: LAUNCHPAD_ADDRESSES.zoraFactory },
  probe: (ctx, registry) => [item(registry, 'getVersionForDeployedCoin', [ctx.token])],
  async finish(ctx, registry, [info]) {
    const version = info?.success ? wordNum(info.data, 0) : null;
    if (!version) return null;
    const lines = [`Deployed by the Zora coin factory (${short(registry)}), coin version ${version}`];
    if (hasSel(ctx, 'migrateLiquidity(address,bytes)')) lines.push('Owners can migrate pool liquidity (migrateLiquidity) and change the payout recipient / metadata');
    return {
      match: { id: 'zora', name: 'Zora', template: `coin-v${version}`, evidence: 'factory.getVersionForDeployedCoin', phase: null, facts: lines },
      report: { provider: 'launchpad', facts: {}, launchpadName: 'Zora' },
    };
  },
};

const ponsV2: LaunchpadDef = {
  id: 'pons-v2',
  name: 'Pons V2',
  chains: { robinhood: LAUNCHPAD_ADDRESSES.ponsV2LaunchFactory },
  probe: (ctx, registry) => [item(registry, 'getLaunchedToken', [ctx.token])],
  async finish(ctx, registry, [info]) {
    if (!info?.success || !same(wordAddr(info.data, 0), ctx.token)) return null;
    const curve = wordAddr(info.data, 1);
    const deployer = wordAddr(info.data, 2);
    const lines = [`Registered in the Pons V2 launch factory (${short(registry)})`];
    if (curve) lines.push(`Bonding curve ${short(curve)}`);
    lines.push(`After graduation the Uniswap v4 position is held by PonsV2LaunchLocker (${short(LAUNCHPAD_ADDRESSES.ponsV2LaunchLocker)})`);
    return {
      match: { id: 'pons-v2', name: 'Pons V2', template: 'standard', evidence: 'launchFactory.getLaunchedToken', phase: null, facts: lines },
      report: { provider: 'launchpad', facts: {}, launchpadName: 'Pons' },
      creator: deployer && !isBurnAddress(deployer) ? deployer : undefined,
      pools: curve ? [{ venue: 'pons-v2-curve', address: curve, token: ctx.token, quote: EVM_CHAINS.robinhood.wrappedNative, quoteReserve: 0n, fee: null }] : undefined,
    };
  },
};

const poolsTrade: LaunchpadDef = {
  id: 'pools.trade',
  name: 'pools.trade',
  chains: { robinhood: LAUNCHPAD_ADDRESSES.uerc20Factory },
  probe: (ctx) => (hasSel(ctx, 'creator()') && hasSel(ctx, 'graffiti()') ? [item(ctx.token, 'creator'), item(ctx.token, 'graffiti')] : null),
  async finish(ctx, registry, [c, g]) {
    const i = ctx.inspection;
    if (!c?.success || !g?.success || !i.name || !i.symbol || i.decimals === null) return null;
    const creator = wordAddr(c.data, 0)!;
    const graffiti = wordAt(g.data, 0)!;
    const [p] = await reads(ctx, [item(registry, 'getUERC20Address', [i.name, i.symbol, i.decimals, creator, graffiti])]);
    if (!p?.success || !same(wordAddr(p.data, 0), ctx.token)) return null;
    const viaLauncher = LAUNCHPAD_ADDRESSES.poolsTradeEntries.some((e) => same(e, creator));
    const lines = [
      `Uniswap UERC20 token: CREATE2 address matches the factory (${short(registry)})`,
      viaLauncher ? 'Created through the pools.trade launcher; trades on a hookless Uniswap v4 pool' : `Created directly by ${short(creator)}`,
    ];
    return {
      match: { id: viaLauncher ? 'pools.trade' : 'uerc20', name: viaLauncher ? 'pools.trade' : 'Uniswap UERC20', template: 'uerc20', evidence: 'factory.getUERC20Address', phase: null, facts: lines },
      report: { provider: 'launchpad', facts: {}, launchpadName: viaLauncher ? 'pools.trade' : undefined },
      creator: viaLauncher ? undefined : creator,
    };
  },
};

export const LAUNCHPADS: LaunchpadDef[] = [fourMeme, flap, clankerV4, zora, ponsV2, poolsTrade];

/** Asks every launchpad registry on the token's chain (one multicall) and finishes the first match. */
export async function recognizeLaunchpad(client: RpcClient, chain: EvmChainId, inspection: OnchainInspection): Promise<LaunchpadResult | null> {
  if (!inspection.isContract) return null;
  const ctx: Ctx = { client, chain, token: inspection.token, inspection };
  const plans: { def: LaunchpadDef; registry: Address; items: MulticallItem[]; offset: number }[] = [];
  const all: MulticallItem[] = [];
  for (const def of LAUNCHPADS) {
    const registry = def.chains[chain];
    if (!registry) continue;
    const items = def.probe(ctx, getAddress(registry));
    if (!items) continue;
    plans.push({ def, registry: getAddress(registry), items, offset: all.length });
    all.push(...items);
  }
  if (all.length === 0) return null;
  const results = await reads(ctx, all);
  for (const p of plans) {
    const res = await p.def.finish(ctx, p.registry, results.slice(p.offset, p.offset + p.items.length));
    if (res) return res;
  }
  return null;
}

