// Static analysis of runtime bytecode: reachable opcodes, the function selectors
// in the dispatcher, minimal-proxy (clone) detection, and a catalogue of
// privileged functions whose selectors are computed with viem from their
// signatures (never hand-copied).

import { getAddress, toFunctionSelector, type Address, type Hex } from 'viem';

export interface OpcodeFlags {
  selfdestruct: boolean;
  delegatecall: boolean;
  call: boolean;
  callcode: boolean;
  staticcall: boolean;
  create: boolean;
  create2: boolean;
}

export interface MinimalProxy {
  /** eip1167 (45-byte standard), solady (44-byte LibClone), eip7511 (PUSH0), generic (tiny PUSH-address + DELEGATECALL). */
  kind: 'eip1167' | 'solady' | 'eip7511' | 'generic';
  implementation: Address;
}

export interface BytecodeAnalysis {
  size: number;
  /** Selectors (0x-prefixed, lowercase) compared against calldata in reachable code. */
  selectors: Set<string>;
  opcodes: OpcodeFlags;
  minimalProxy: MinimalProxy | null;
}

const PUSH1 = 0x60;
const PUSH4 = 0x63;
const PUSH20 = 0x73;
const PUSH32 = 0x7f;
const JUMPDEST = 0x5b;
const EQ = 0x14;
const LT = 0x10;
const GT = 0x11;
const XOR = 0x18;
const SUB = 0x03;
const JUMPI = 0x57;
const DUP2 = 0x81;
/** STOP, JUMP, RETURN, REVERT, INVALID, SELFDESTRUCT: nothing after them runs until the next JUMPDEST. */
const TERMINATORS = new Set([0x00, 0x56, 0xf3, 0xfd, 0xfe, 0xff]);

function hexToBytes(code: Hex): Uint8Array {
  const s = code.startsWith('0x') ? code.slice(2) : code;
  const out = new Uint8Array(s.length >>> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

/**
 * Solidity appends CBOR metadata whose length sits in the last two bytes. It is
 * data, not code: drop it so its bytes never read as opcodes.
 */
export function codeLength(bytes: Uint8Array): number {
  if (bytes.length < 4) return bytes.length;
  const metaLen = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  const start = bytes.length - 2 - metaLen;
  // CBOR map header (a1..a5) followed by a text key ("ipfs", "bzzr0", "bzzr1", "solc", "experimental").
  if (metaLen > 0 && metaLen < 200 && start > 0 && bytes[start] >= 0xa1 && bytes[start] <= 0xa5 && (bytes[start + 1] & 0xe0) === 0x60) return start;
  return bytes.length;
}

const MINIMAL_PROXIES: { kind: MinimalProxy['kind']; prefix: string; suffix: string }[] = [
  { kind: 'eip1167', prefix: '363d3d373d3d3d363d73', suffix: '5af43d82803e903d91602b57fd5bf3' },
  { kind: 'solady', prefix: '3d3d3d3d363d3d37363d73', suffix: '5af43d3d93803e602a57fd5bf3' },
  { kind: 'eip7511', prefix: '365f5f375f5f365f73', suffix: '5af43d5f5f3e5f3d91602a57fd5bf3' },
];

export function detectMinimalProxy(code: Hex): MinimalProxy | null {
  const h = code.toLowerCase().replace(/^0x/, '');
  for (const p of MINIMAL_PROXIES) {
    if (h.length === p.prefix.length + 40 + p.suffix.length && h.startsWith(p.prefix) && h.endsWith(p.suffix)) {
      return { kind: p.kind, implementation: getAddress(`0x${h.slice(p.prefix.length, p.prefix.length + 40)}`) };
    }
  }
  // Generic: a tiny contract that pushes one address and delegatecalls it (vanity-compressed clones).
  if (h.length <= 2 * 80) {
    const bytes = hexToBytes(code);
    for (let i = 0; i < bytes.length; i++) {
      const op = bytes[i];
      if (op >= PUSH1 && op <= PUSH32) {
        const n = op - PUSH1 + 1;
        if (n >= 14 && n <= 20 && bytes[i + n + 1] === 0x5a && bytes[i + n + 2] === 0xf4) {
          const raw = Array.from(bytes.subarray(i + 1, i + 1 + n), (b) => b.toString(16).padStart(2, '0')).join('');
          return { kind: 'generic', implementation: getAddress(`0x${raw.padStart(40, '0')}`) };
        }
        i += n;
      }
    }
  }
  return null;
}

/**
 * Walks the bytecode once. Code after a terminating opcode is unreachable until
 * the next JUMPDEST, which skips embedded data (constant strings, immutables
 * tables, metadata) so stray 0xff / 0xf4 bytes there are not read as opcodes.
 */
export function analyzeBytecode(code: Hex | undefined | null): BytecodeAnalysis {
  const bytes = code && code !== '0x' ? hexToBytes(code) : new Uint8Array();
  const end = codeLength(bytes);
  const selectors = new Set<string>();
  const opcodes: OpcodeFlags = { selfdestruct: false, delegatecall: false, call: false, callcode: false, staticcall: false, create: false, create2: false };
  let reachable = true;
  for (let i = 0; i < end; i++) {
    const op = bytes[i];
    if (op === JUMPDEST) reachable = true;
    if (reachable) {
      if (op === 0xff) opcodes.selfdestruct = true;
      else if (op === 0xf4) opcodes.delegatecall = true;
      else if (op === 0xf1) opcodes.call = true;
      else if (op === 0xf2) opcodes.callcode = true;
      else if (op === 0xfa) opcodes.staticcall = true;
      else if (op === 0xf0) opcodes.create = true;
      else if (op === 0xf5) opcodes.create2 = true;
      if (op === PUSH4 && i + 5 < end) {
        const next = bytes[i + 5];
        // `DUP1 PUSH4 sel EQ` (legacy), `PUSH4 sel DUP2 EQ` (via-IR), `PUSH4 sel GT|LT` (binary-search pivots),
        // and `PUSH4 sel SUB|XOR PUSHn dest JUMPI` (via-IR last case, Vyper: jump when different)
        const jumpsAfter = (at: number) => {
          const p = bytes[at];
          return p >= PUSH1 && p <= PUSH4 && bytes[at + (p - PUSH1 + 1) + 1] === JUMPI;
        };
        if (next === EQ || next === GT || next === LT || (next === DUP2 && bytes[i + 6] === EQ) || ((next === SUB || next === XOR) && jumpsAfter(i + 6))) {
          selectors.add(`0x${Array.from(bytes.subarray(i + 1, i + 5), (b) => b.toString(16).padStart(2, '0')).join('')}`);
        }
      }
      if (TERMINATORS.has(op)) reachable = false;
    }
    if (op >= PUSH1 && op <= PUSH32) i += op - PUSH1 + 1;
  }
  return { size: bytes.length, selectors, opcodes, minimalProxy: code ? detectMinimalProxy(code) : null };
}

// ---------------------------------------------------------------------------
// Privileged-function catalogue
// ---------------------------------------------------------------------------

export type Capability =
  | 'mint'
  | 'crosschainMint'
  | 'blacklist'
  | 'whitelist'
  | 'setTax'
  | 'pause'
  | 'tradingGate'
  | 'antiWhale'
  | 'antiWhaleSetter'
  | 'cooldown'
  | 'balanceSetter'
  | 'reclaimOwnership'
  | 'ownable'
  | 'accessControl'
  | 'upgrade';

const combos = (names: string[], shapes: string[]): string[] => names.flatMap((n) => shapes.map((s) => `${n}(${s})`));

const ADDR_SHAPES = ['address', 'address,bool', 'address[]', 'address[],bool', 'bool,address'];
const NUM_SHAPES = [
  'uint256',
  'uint256,uint256',
  'uint256,uint256,uint256',
  'uint256,uint256,uint256,uint256',
  'uint256,uint256,uint256,uint256,uint256',
  'uint8',
  'uint8,uint8',
  'uint16',
  'uint16,uint16',
  'uint16,uint16,uint16',
  'uint24',
  'uint32',
  'uint32,uint32',
  'uint256,bool',
];

/** Signatures per capability. Selectors are derived with viem at module load. */
export const CAPABILITY_SIGNATURES: Record<Capability, string[]> = {
  mint: [
    ...combos(
      ['mint', 'mintTo', 'mintFor', 'ownerMint', 'adminMint', 'mintTokens', 'mintToken', 'generateTokens'],
      ['address,uint256', 'address,uint96', 'address,uint128', 'uint256,address'],
    ),
    'mint(uint256)',
    'mint(address)',
    'mint(address,uint256,bytes)',
    'increaseSupply(uint256)',
    'addSupply(uint256)',
    'issue(uint256)',
    'configureMinter(address,uint256)',
    'addMinter(address)',
    'setMinter(address,bool)',
  ],
  // ERC-7802: callable only by the Superchain token bridge (supply moves between chains).
  crosschainMint: ['crosschainMint(address,uint256)'],
  blacklist: [
    ...combos(
      [
        'blacklist',
        'blackList',
        'addBlacklist',
        'addToBlacklist',
        'addBlackList',
        'setBlacklist',
        'setBlackList',
        'setBlacklisted',
        'setIsBlacklisted',
        'blacklistAddress',
        'blockAddress',
        'addBot',
        'addBots',
        'setBot',
        'setBots',
        'setBotAddress',
        'setBotAddresses',
        'blockBots',
        'manageBots',
        'addBotWallet',
        'setSniper',
        'setSnipers',
        'markBot',
        'setIsBot',
        'bulkBlacklist',
        'multiBlacklist',
        'setBlacklistStatus',
        'updateBlacklist',
        'banAddress',
        'freezeAccount',
        'setFrozen',
      ],
      ADDR_SHAPES,
    ),
    'isBlacklisted(address)',
    'isBlackListed(address)',
    '_isBlacklisted(address)',
    'getBlackListStatus(address)',
    'blacklisted(address)',
    'isBot(address)',
    'bots(address)',
  ],
  whitelist: combos(
    [
      'whitelist',
      'addToWhitelist',
      'addWhitelist',
      'setWhitelist',
      'setWhiteList',
      'setWhitelisted',
      'excludeFromFee',
      'excludeFromFees',
      'includeInFee',
      'setExcludedFromFee',
      'setExcludeFromFee',
      'setIsExcludedFromFee',
      'setExcludeFromFees',
      'setFeeExempt',
      'setIsFeeExempt',
    ],
    ADDR_SHAPES,
  ),
  setTax: combos(
    [
      'setFee',
      'setFees',
      'setTax',
      'setTaxes',
      'setBuyTax',
      'setSellTax',
      'setBuyTaxes',
      'setSellTaxes',
      'setBuyFee',
      'setSellFee',
      'setBuyFees',
      'setSellFees',
      'updateFee',
      'updateFees',
      'updateBuyFees',
      'updateSellFees',
      'updateTax',
      'updateTaxes',
      'changeFee',
      'changeFees',
      'changeTax',
      'changeTaxes',
      'setTaxFee',
      'setTaxFeePercent',
      'setLiquidityFee',
      'setLiquidityFeePercent',
      'setMarketingFee',
      'setMarketingFeePercent',
      'setDevFee',
      'setSwapFees',
      'setTransferFee',
      'setTransferFees',
      'setTransferTax',
      'setTaxRate',
      'setTaxRates',
      'setFeeRate',
      'setFeeRates',
      'setFeePercent',
      'setFeesPercent',
      'setTotalFees',
      'setBuyAndSellTax',
      'adjustTaxes',
      'reduceFee',
      'setParams',
    ],
    NUM_SHAPES,
  ),
  pause: [
    'pause()',
    'unpause()',
    'pauseTrading()',
    'resumeTrading()',
    'stopTrading()',
    'toggleTrading()',
    ...combos(
      ['setPaused', 'setPause', 'setTradingEnabled', 'setTrading', 'tradingStatus', 'setTradingOpen', 'setTradingActive', 'setTradeEnabled', 'setIsTradingEnabled', 'updateTradingStatus', 'setTradingStatus', 'enableTrading'],
      ['bool'],
    ),
  ],
  // One-way switches: trading is closed until the owner opens it (cannot be closed again).
  tradingGate: ['openTrading()', 'enableTrading()', 'startTrading()', 'activateTrading()', 'goLive()', 'enableTrading(uint256)', 'launch()'],
  antiWhale: [
    'maxTransactionAmount()',
    '_maxTxAmount()',
    'maxTxAmount()',
    'maxTx()',
    'maxWallet()',
    '_maxWalletSize()',
    'maxWalletSize()',
    'maxWalletAmount()',
    '_maxWalletAmount()',
    'maxBuyAmount()',
    'maxSellAmount()',
    'maxHoldingAmount()',
    'limitsInEffect()',
    'removeLimits()',
    'maxBalanceLimit()',
    'isBalanceLimitActive()',
  ],
  antiWhaleSetter: combos(
    [
      'setMaxTxAmount',
      'setMaxTx',
      'setMaxTxPercent',
      'setMaxTxnAmount',
      'setMaxTransactionAmount',
      'updateMaxTxnAmount',
      'updateMaxTx',
      'setMaxWallet',
      'setMaxWalletSize',
      'setMaxWalletAmount',
      'setMaxWalletPercent',
      'updateMaxWalletAmount',
      'updateMaxWallet',
      'setMaxBuy',
      'setMaxSell',
      'setMaxBuyAmount',
      'setMaxSellAmount',
      'setMaxHoldingAmount',
      'setLimits',
      'updateLimits',
    ],
    ['uint256', 'uint256,uint256', 'uint16', 'uint8'],
  ),
  cooldown: [
    'setCooldownEnabled(bool)',
    'setCooldown(uint256)',
    'setCooldownTime(uint256)',
    'setBuyCooldown(uint256)',
    'setTradeCooldown(uint256)',
    'cooldownEnabled()',
    'setTransferDelayEnabled(bool)',
    'disableTransferDelay()',
    'transferDelayEnabled()',
  ],
  balanceSetter: [
    'setBalance(address,uint256)',
    'setBalances(address[],uint256[])',
    'changeBalance(address,uint256)',
    'updateBalance(address,uint256)',
    'burn(address,uint256)',
    'adminBurn(address,uint256)',
    'destroyBlackFunds(address)',
    'forceTransfer(address,address,uint256)',
    'adminTransfer(address,address,uint256)',
  ],
  // SafeMoon-style lock(): the previous owner can reclaim ownership after "renouncing".
  reclaimOwnership: ['lock(uint256)', 'unlock()', 'geUnlockTime()', 'getUnlockTime()'],
  ownable: ['owner()', 'getOwner()', 'transferOwnership(address)', 'renounceOwnership()'],
  accessControl: ['hasRole(bytes32,address)', 'grantRole(bytes32,address)', 'getRoleAdmin(bytes32)'],
  upgrade: ['upgradeTo(address)', 'upgradeToAndCall(address,bytes)', 'changeAdmin(address)'],
};

/** selector -> [capability, signature][] */
const SELECTOR_INDEX = new Map<string, [Capability, string][]>();
for (const [cap, sigs] of Object.entries(CAPABILITY_SIGNATURES) as [Capability, string[]][]) {
  for (const sig of sigs) {
    const sel = toFunctionSelector(`function ${sig}`);
    const list = SELECTOR_INDEX.get(sel) ?? [];
    list.push([cap, sig]);
    SELECTOR_INDEX.set(sel, list);
  }
}

export interface CapabilityHit {
  capability: Capability;
  signature: string;
  selector: string;
}

/** Privileged functions present in a selector set. */
export function findCapabilities(selectors: Iterable<string>): CapabilityHit[] {
  const hits: CapabilityHit[] = [];
  for (const sel of selectors) {
    for (const [capability, signature] of SELECTOR_INDEX.get(sel.toLowerCase()) ?? []) hits.push({ capability, signature, selector: sel.toLowerCase() });
  }
  return hits.sort((a, b) => a.capability.localeCompare(b.capability) || a.signature.localeCompare(b.signature));
}

export const selectorOf = (signature: string): string => toFunctionSelector(`function ${signature}`);

/** ERC-20 core selectors: a contract with none of them is not a token (or the dispatcher was not parsed). */
export const ERC20_CORE = ['transfer(address,uint256)', 'balanceOf(address)', 'totalSupply()'].map(selectorOf);
