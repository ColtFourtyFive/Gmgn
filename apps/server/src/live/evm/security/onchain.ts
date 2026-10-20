// On-chain static checks that work on any EVM chain: bytecode (proxy slots,
// clones, opcodes, privileged selectors), ownership (owner() / getOwner() /
// admin() / owners()), ERC-20 metadata. Facts that depend on who controls the
// contract are derived separately (deriveOnchainReport) because a launchpad
// template can change what ownership means.

import { decodeAbiParameters, encodeFunctionData, formatUnits, getAddress, hexToString, parseAbi, type Address, type Hex } from 'viem';
import { EVM_CHAINS, type EvmChainId } from '../chains';
import { analyzeBytecode, ERC20_CORE, findCapabilities, selectorOf, type BytecodeAnalysis, type Capability, type CapabilityHit } from './bytecode';
import type { ProviderReport } from './merge';
import { getCode, getStorageAt, multicall, type RpcClient } from './rpc';
import type { OwnerRole, ProxyInfo, SecurityFacts } from './types';
import { isBurnAddress } from './venues';

/** keccak256("eip1967.proxy.implementation") - 1, etc. */
export const SLOTS = {
  eip1967Implementation: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  eip1967Admin: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
  eip1967Beacon: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
  /** keccak256("PROXIABLE") (EIP-1822). */
  eip1822Proxiable: '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7',
  /** keccak256("org.zeppelinos.proxy.implementation") / ".admin" (OpenZeppelin legacy). */
  ozImplementation: '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
  ozAdmin: '0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b',
} as const satisfies Record<string, Hex>;

export const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function getOwner() view returns (address)',
  'function admin() view returns (address)',
  'function owners() view returns (address[])',
  'function implementation() view returns (address)',
]);

const OWNER_FUNCTIONS = ['owner', 'getOwner', 'admin'] as const;
const OWNER_SELECTORS = ['owner()', 'getOwner()', 'admin()', 'owners()'].map(selectorOf);

export interface OnchainInspection {
  token: Address;
  isContract: boolean;
  analysis: BytecodeAnalysis;
  /** Code that actually runs (clone target / proxy implementation), when the token delegates. */
  implementation: { address: Address; analysis: BytecodeAnalysis } | null;
  proxy: ProxyInfo | null;
  /** Union of the proxy's and the implementation's dispatcher selectors. */
  selectors: Set<string>;
  capabilities: CapabilityHit[];
  /** Whether the dispatcher parse looks complete (ERC-20 core selectors found). */
  selectorsReliable: boolean;
  /** owner() / getOwner() / admin() answer, first that succeeded. */
  owner: Address | null;
  ownerFunction: string | null;
  /** owners() (multi-owner tokens). */
  owners: Address[] | null;
  /** An owner-style function exists but every call to it failed. */
  ownerUnreadable: boolean;
  /** Effective upgrade authority (proxy admin / ProxyAdmin owner / beacon owner). */
  upgradeAdmin: Address | null;
  /** true / false when determined from the proxy setup; null when unknown. */
  upgradeable: boolean | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
}

const word = (v: Hex): Address | null => {
  if (!v || v.length < 66) return null;
  const a = `0x${v.slice(-40)}`;
  return /^0x0{40}$/i.test(a) ? null : getAddress(a);
};

function decodeString(data: Hex): string | null {
  try {
    return (decodeAbiParameters([{ type: 'string' }], data)[0] as string).replace(/\0/g, '').trim() || null;
  } catch {
    // Some old tokens return bytes32.
    if (data.length === 66) {
      try {
        return hexToString(data, { size: 32 }).replace(/\0/g, '').trim() || null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function decodeAddress(data: Hex): Address | null {
  try {
    return getAddress(decodeAbiParameters([{ type: 'address' }], data)[0] as string);
  } catch {
    return null;
  }
}

const call = (target: Address, functionName: (typeof tokenAbi)[number]['name'], args: readonly unknown[] = []) => ({
  target,
  data: encodeFunctionData({ abi: tokenAbi, functionName, args } as never),
});

export async function inspectToken(client: RpcClient, chain: EvmChainId, token: Address): Promise<OnchainInspection> {
  const mc = EVM_CHAINS[chain].multicall3;
  const [code, meta] = await Promise.all([
    getCode(client, token),
    multicall(client, mc, [
      call(token, 'name'),
      call(token, 'symbol'),
      call(token, 'decimals'),
      call(token, 'totalSupply'),
      call(token, 'owner'),
      call(token, 'getOwner'),
      call(token, 'admin'),
      call(token, 'owners'),
    ]),
  ]);
  const analysis = analyzeBytecode(code);
  const isContract = analysis.size > 0;

  // Proxy detection: clones by code pattern, others by their storage slots (only
  // read when the code can delegate at all).
  let proxy: ProxyInfo | null = null;
  let upgradeAdmin: Address | null = null;
  let upgradeable: boolean | null = isContract ? false : null;
  if (analysis.minimalProxy) {
    proxy = { kind: 'minimal-clone', implementation: analysis.minimalProxy.implementation, admin: null, beacon: null };
    upgradeable = false;
  } else if (analysis.opcodes.delegatecall) {
    const [impl, admin, beacon, proxiable, ozImpl, ozAdmin] = await Promise.all(
      [SLOTS.eip1967Implementation, SLOTS.eip1967Admin, SLOTS.eip1967Beacon, SLOTS.eip1822Proxiable, SLOTS.ozImplementation, SLOTS.ozAdmin].map((s) =>
        getStorageAt(client, token, s).then(word),
      ),
    );
    if (beacon) proxy = { kind: 'eip1967-beacon', implementation: null, admin: null, beacon };
    else if (impl) proxy = { kind: 'eip1967', implementation: impl, admin, beacon: null };
    else if (proxiable) proxy = { kind: 'eip1822', implementation: proxiable, admin: null, beacon: null };
    else if (ozImpl) proxy = { kind: 'oz-legacy', implementation: ozImpl, admin: ozAdmin, beacon: null };
    else if (analysis.size < 1024 && ERC20_CORE.filter((s) => analysis.selectors.has(s)).length < 2) {
      proxy = { kind: 'unknown-delegate', implementation: null, admin: null, beacon: null };
      upgradeable = null;
    }
    if (proxy && proxy.kind !== 'unknown-delegate') {
      // Who can upgrade: the admin (or the ProxyAdmin contract's owner), or the beacon's owner.
      const authority = proxy.beacon ?? proxy.admin;
      const extra = await multicall(client, mc, [
        ...(proxy.beacon ? [call(proxy.beacon, 'implementation')] : []),
        ...(authority ? [call(authority, 'owner')] : []),
      ]);
      let i = 0;
      if (proxy.beacon) {
        const r = extra[i++];
        proxy.implementation = r?.success ? decodeAddress(r.data) : null;
      }
      if (authority) {
        const r = extra[i++];
        const authorityOwner = r?.success ? decodeAddress(r.data) : null;
        // A ProxyAdmin / beacon contract answers owner(); an EOA admin upgrades directly.
        upgradeAdmin = authorityOwner ?? authority;
        upgradeable = !isBurnAddress(upgradeAdmin);
      } else {
        upgradeable = null; // UUPS / EIP-1822: decided from the implementation's upgrade functions below
      }
    }
  }

  let implementation: OnchainInspection['implementation'] = null;
  if (proxy?.implementation) {
    const implCode = await getCode(client, proxy.implementation);
    implementation = { address: proxy.implementation, analysis: analyzeBytecode(implCode) };
  }

  const selectors = new Set<string>([...analysis.selectors, ...(implementation?.analysis.selectors ?? [])]);
  const capabilities = findCapabilities(selectors);
  const selectorsReliable = ERC20_CORE.filter((s) => selectors.has(s)).length >= 2;

  const [nameR, symbolR, decimalsR, supplyR, ...ownerRs] = meta;
  const ownersR = ownerRs.pop()!;
  let owner: Address | null = null;
  let ownerFunction: string | null = null;
  let ownerUnreadable = false;
  for (let i = 0; i < OWNER_FUNCTIONS.length; i++) {
    const r = ownerRs[i];
    if (r.success && r.data.length === 66) {
      owner = decodeAddress(r.data);
      ownerFunction = `${OWNER_FUNCTIONS[i]}()`;
      break;
    }
  }
  let owners: Address[] | null = null;
  if (ownersR.success) {
    try {
      owners = (decodeAbiParameters([{ type: 'address[]' }], ownersR.data)[0] as readonly string[]).map((a) => getAddress(a));
    } catch {
      owners = null;
    }
  }
  if (!ownerFunction && !owners) {
    ownerUnreadable = OWNER_SELECTORS.some((s) => selectors.has(s));
  }
  // UUPS: upgradeable when the implementation exposes upgrade functions and someone controls them.
  if (proxy && (proxy.kind === 'eip1967' || proxy.kind === 'eip1822') && !proxy.admin) {
    const hasUpgrade = capabilities.some((c) => c.capability === 'upgrade');
    upgradeable = !hasUpgrade ? false : owner && !isBurnAddress(owner) ? true : owner ? false : null;
    if (hasUpgrade && owner) upgradeAdmin = owner;
  }

  let decimals: number | null = null;
  if (decimalsR.success) {
    try {
      const d = Number(decodeAbiParameters([{ type: 'uint8' }], decimalsR.data)[0]);
      decimals = d <= 255 ? d : null;
    } catch {
      decimals = null;
    }
  }
  let totalSupply: bigint | null = null;
  if (supplyR.success) {
    try {
      totalSupply = decodeAbiParameters([{ type: 'uint256' }], supplyR.data)[0] as bigint;
    } catch {
      totalSupply = null;
    }
  }

  return {
    token,
    isContract,
    analysis,
    implementation,
    proxy,
    selectors,
    capabilities,
    selectorsReliable,
    owner,
    ownerFunction,
    owners,
    ownerUnreadable,
    upgradeAdmin,
    upgradeable,
    name: nameR.success ? decodeString(nameR.data) : null,
    symbol: symbolR.success ? decodeString(symbolR.data) : null,
    decimals,
    totalSupply,
  };
}

/** Ownership as read on-chain (before launchpad templates refine it). */
export function ownerRoleOf(i: OnchainInspection): OwnerRole | null {
  if (!i.isContract) return null;
  if (i.upgradeable === true) return 'privileged';
  const liveOwners = i.owners?.filter((a) => !isBurnAddress(a)) ?? [];
  if (liveOwners.length > 0) return 'privileged';
  if (i.ownerFunction) return i.owner === null || isBurnAddress(i.owner) ? 'renounced' : 'privileged';
  if (i.owners) return 'renounced'; // owners() answered with an empty / burned list
  if (i.ownerUnreadable) return null;
  if (i.capabilities.some((c) => c.capability === 'accessControl')) return null;
  return i.selectorsReliable ? 'none' : null;
}

/** Whether someone (other than a launchpad or a metadata-only admin) can call privileged functions. */
export function controlledBy(role: OwnerRole | null, i: OnchainInspection): boolean | null {
  if (role === 'privileged' || i.upgradeable === true) return true;
  if (i.capabilities.some((c) => c.capability === 'accessControl')) return true;
  if (role === null || i.upgradeable === null) return null;
  return false;
}

const has = (i: OnchainInspection, c: Capability) => i.capabilities.some((h) => h.capability === c);

/** The 'onchain' provider report for an inspection under a given ownership role. */
export function deriveOnchainReport(i: OnchainInspection, role: OwnerRole | null): ProviderReport {
  const facts: SecurityFacts = {};
  if (!i.isContract) return { provider: 'onchain', facts, notes: ['no contract code at this address'] };
  const ctl = controlledBy(role, i);
  // A capability the owner can use: false without the function, otherwise depends on control.
  const owned = (c: Capability): boolean | undefined => (!has(i, c) ? false : ctl === null ? undefined : ctl);
  const set = <K extends keyof SecurityFacts>(k: K, v: SecurityFacts[K] | undefined) => {
    if (v !== undefined) facts[k] = v;
  };

  if (role === 'renounced' || role === 'none') facts.isRenounced = true;
  else if (role === 'privileged' || role === 'launchpad' || role === 'metadata-only') facts.isRenounced = false;

  // A minimal clone delegates to fixed code: reported in `proxy` (kind minimal-clone) but not as a proxy risk.
  facts.proxy = i.proxy !== null && i.proxy.kind !== 'minimal-clone';
  if (i.upgradeable !== null) facts.upgradeable = i.upgradeable;

  // Opcode facts come from the code that actually runs (a clone's / proxy's implementation).
  const runs = i.implementation?.analysis ?? (i.proxy ? null : i.analysis);
  if (runs && runs.size > 0) {
    facts.selfDestruct = runs.opcodes.selfdestruct || (i.proxy?.kind !== 'minimal-clone' && i.analysis.opcodes.selfdestruct);
    // No CALL opcode proves the token never calls out; one being present (fee swaps, rescues) proves nothing.
    if (!runs.opcodes.call && !runs.opcodes.callcode) facts.externalCall = false;
  }

  if (i.selectorsReliable) {
    set('mintable', owned('mint'));
    set('blacklist', owned('blacklist'));
    set('whitelist', owned('whitelist'));
    set('taxModifiable', owned('setTax'));
    set('pausable', owned('pause'));
    set('ownerCanChangeBalance', owned('balanceSetter'));
    facts.antiWhale = has(i, 'antiWhale') || has(i, 'antiWhaleSetter');
    set('antiWhaleModifiable', owned('antiWhaleSetter'));
    facts.tradingCooldown = has(i, 'cooldown');
    // lock(uint256) + unlock(): the previous owner can take ownership back after "renouncing".
    facts.canTakeBackOwnership = i.capabilities.filter((c) => c.capability === 'reclaimOwnership').length >= 2;
  }

  const notes: string[] = [];
  if (!i.selectorsReliable) notes.push('dispatcher not recognised: privileged-function flags unknown');
  if (has(i, 'crosschainMint')) notes.push('crosschainMint (ERC-7802) present: supply can move between chains through the bridge');
  if (has(i, 'tradingGate') && ctl) notes.push('owner-controlled trading switch (openTrading / enableTrading)');
  if (i.proxy && i.proxy.kind !== 'minimal-clone' && i.upgradeAdmin) notes.push(`upgrade authority ${i.upgradeAdmin}`);

  const owner = i.ownerFunction ? i.owner : undefined;
  return {
    provider: 'onchain',
    facts,
    owner,
    name: i.name ?? undefined,
    symbol: i.symbol ?? undefined,
    notes,
  };
}

/** Human-units decimal string of a raw amount. */
export const units = (raw: bigint, decimals: number | null): string => (decimals === null ? raw.toString() : formatUnits(raw, decimals));
