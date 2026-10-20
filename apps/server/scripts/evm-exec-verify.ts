// Read-only verification of the EVM execution engine against mainnet. For each
// chain it picks live tokens (one per curve venue, v4 / v3 / v2 pools, the
// aggregator), then for buys: quote -> prepare -> eth_simulateV1 from a fresh
// random address funded by state override; for sells: the same from a real
// holder found in the token's recent Transfer logs. It checks the simulated
// output against the quote and slippage, that the fee wallet receives the
// platform fee, and that every approval names an allow-listed spender. Nothing
// is signed or broadcast.
//
// Usage: npx tsx scripts/evm-exec-verify.ts [--chains base,robinhood,bsc,eth] [--record test/fixtures/evm/exec]
//   --record writes each case's RPC / HTTP traffic as a replay fixture for the offline tests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { concatHex, encodeAbiParameters, formatUnits, getAddress, isAddressEqual, keccak256, parseAbiItem, toHex, type Address, type Hex, type PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { EVM_CHAINS, type EvmChainId } from '../src/live/evm/chains';
import type { EvmClients } from '../src/live/evm/clients';
import type { EvmLiveConfig } from '../src/live/evm/config';
import { decodeApprove, chainAllowlist } from '../src/live/evm/exec/allowlist';
import { EvmExecEngine } from '../src/live/evm/exec/engine';
import { errorText } from '../src/live/evm/exec/errors';
import { overlayClient, recordingClient, recordingFetch, type Recording, type StateOverlay } from '../src/live/evm/exec/recorder';
import type { EvmTradeIntent, EvmVenueId } from '../src/live/evm/exec/types';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const RECORD_DIR = argOf('--record');
const CHAINS = (argOf('--chains') ?? 'base,robinhood,bsc,eth').split(',') as EvmChainId[];

const RPC: Record<EvmChainId, string> = {
  base: process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com',
  robinhood: process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
  bsc: process.env.BSC_RPC_URL ?? 'https://bsc-rpc.publicnode.com',
  eth: process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com',
};
/**
 * --receipts reads older receipts: publicnode answers eth_getTransactionReceipt only for its last ~128 blocks
 * ("Archive requests require a personal token"), so receipts are tracked through the chains' own public
 * endpoints (logs are still searched on publicnode: those endpoints refuse log ranges)
 * (BSC dataseed serves receipts but no historical balances: the engine's venue-event fallback is exercised there).
 */
const RECEIPT_RPC: Record<EvmChainId, string> = {
  base: process.env.BASE_RECEIPT_RPC_URL ?? 'https://mainnet.base.org',
  robinhood: RPC.robinhood,
  bsc: process.env.BSC_RECEIPT_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org',
  eth: process.env.ETH_RECEIPT_RPC_URL ?? 'https://ethereum-rpc.publicnode.com',
};
/** Recent-log windows each public RPC accepts. */
const LOG_WINDOW: Record<EvmChainId, bigint> = { base: 2_000n, robinhood: 20_000n, bsc: 1_000n, eth: 500n };
const BUY_AMOUNT: Record<EvmChainId, bigint> = { base: 10n ** 15n, robinhood: 10n ** 15n, bsc: 10n ** 16n, eth: 5n * 10n ** 15n };

// a fresh fee wallet and a fresh trading wallet: never used on-chain, so every wei they receive in a simulation is ours
const FEE_WALLET = privateKeyToAccount(RECORD_DIR ? keccak256(toHex('trenchscope-verify-fee')) : generatePrivateKey()).address;
const FRESH_WALLET = privateKeyToAccount(RECORD_DIR ? keccak256(toHex('trenchscope-verify-wallet')) : generatePrivateKey()).address;

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

interface Case {
  chain: EvmChainId;
  name: string;
  token: Address;
  venues?: EvmVenueId[];
  sell?: boolean;
}

interface Row {
  chain: string;
  case: string;
  side: string;
  venue: string;
  amountIn: string;
  expectedOut: string;
  simOut: string;
  delta: string;
  slip: string;
  fee: string;
  feeSim: string;
  feeMode: string;
  impact: string;
  gas: string;
  steps: string;
  status: string;
}

const rows: Row[] = [];
/** Tokens each buy case would receive (sells without a real holder sell that much from the fresh wallet). */
const boughtTokens = new Map<string, bigint>();

function config(): EvmLiveConfig {
  const chains: EvmLiveConfig['chains'] = {};
  for (const c of CHAINS) chains[c] = { chain: c, rpcUrls: [RPC[c]], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true };
  return { chains, feeWallet: FEE_WALLET, platformFeeBps: 80, kyberswap: { baseUrl: 'https://aggregator-api.kyberswap.com', clientId: 'trenchscope' } };
}

async function recentLogs(client: PublicClient, chain: EvmChainId, address: Address, event: ReturnType<typeof parseAbiItem>, back: bigint) {
  const latest = await client.getBlockNumber();
  const out: Awaited<ReturnType<PublicClient['getLogs']>> = [];
  for (let to = latest; to > latest - back && out.length < 400; to -= LOG_WINDOW[chain]) {
    const from = to - LOG_WINDOW[chain] + 1n;
    try {
      out.push(...(await client.getLogs({ address, event: event as never, fromBlock: from, toBlock: to })));
    } catch {
      // range refused: keep what we have
    }
  }
  return out;
}

/**
 * A wallet holding the token, from its recent Transfer logs: EOAs (including
 * EIP-7702 delegated ones) first; contracts only when allowed (curve tokens are
 * often held by smart accounts) and only if no EOA holds any.
 */
async function findHolder(client: PublicClient, chain: EvmChainId, token: Address, exclude: Address[] = [], allowContracts = false): Promise<Address | null> {
  const logs = await recentLogs(client, chain, token, TRANSFER as never, LOG_WINDOW[chain] * 6n);
  const seen = new Set<string>();
  let contract: Address | null = null;
  for (const l of logs.reverse()) {
    const to = (l as unknown as { args: { to: Address } }).args.to;
    if (!to || seen.has(to.toLowerCase()) || isAddressEqual(to, token) || exclude.some((e) => isAddressEqual(e, to))) continue;
    seen.add(to.toLowerCase());
    const [code, bal] = await Promise.all([client.getCode({ address: to }), client.readContract({ address: token, abi: [parseAbiItem('function balanceOf(address) view returns (uint256)')], functionName: 'balanceOf', args: [to] })]);
    // ignore dust: 10% of it must still be a real sell
    if ((bal as bigint) < 1_000_000n) continue;
    const eoa = code === undefined || code === '0x' || code.startsWith('0xef0100');
    if (eoa) return to;
    if (allowContracts && !contract) contract = to;
    if (seen.size > 60) break;
  }
  return contract;
}

const balanceOfAbi = [parseAbiItem('function balanceOf(address) view returns (uint256)')];

/** Storage key of `owner`'s balance in `token`: Solidity mapping slots 0..60, OpenZeppelin v5 namespaced, Solady. */
async function probeBalanceSlot(client: PublicClient, token: Address, owner: Address): Promise<Hex | null> {
  const marker = 123_456_789_000_000_000_000_000n;
  const keys: Hex[] = [];
  for (let i = 0n; i <= 60n; i++) keys.push(keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [owner, i])));
  keys.push(keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [owner, '0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00'])));
  keys.push(keccak256(concatHex([owner, '0x000000000000000087a211a2'])));
  for (const key of keys) {
    const bal = await client
      .readContract({ address: token, abi: balanceOfAbi, functionName: 'balanceOf', args: [owner], stateOverride: [{ address: token, stateDiff: [{ slot: key, value: toHex(marker, { size: 32 }) }] }] })
      .catch(() => 0n);
    if (bal === marker) return key;
  }
  return null;
}

async function discover(chain: EvmChainId, client: PublicClient): Promise<Case[]> {
  const cases: Case[] = [];
  const add = (name: string, token: Address | null | undefined, venues?: EvmVenueId[], sell = true) => {
    if (token) cases.push({ chain, name, token: getAddress(token), venues, sell });
  };
  if (chain === 'bsc') {
    const tm2 = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
    // the BNB-quoted four.meme token still on its curve with the most recent sales (holders demonstrably can
    // sell: some fresh launches revert "GW" for their early holders)
    const sales = await recentLogs(client, chain, tm2, parseAbiItem('event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)') as never, 6_000n);
    const saleCounts = new Map<string, number>();
    for (const l of sales) {
      const t = (l as unknown as { args: { token: Address } }).args.token;
      saleCounts.set(t, (saleCounts.get(t) ?? 0) + 1);
    }
    const helper = '0xF251F83e40a78868FcfA3FA4599Dad6494E46034';
    let best: { token: Address } | null = null;
    for (const [token] of [...saleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      const info = (await client.readContract({ address: helper, abi: [parseAbiItem('function getTokenInfo(address token) view returns (uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)')], functionName: 'getTokenInfo', args: [token as Address] })) as readonly unknown[];
      if (info[11] || info[2] !== '0x0000000000000000000000000000000000000000' || !isAddressEqual(info[1] as Address, tm2)) continue;
      best = { token: token as Address };
      break;
    }
    add('four.meme curve', best?.token, ['fourmeme']);
    const bscBought = await recentLogs(client, chain, '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0', parseAbiItem('event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)') as never, 3_000n);
    const bscFlapCounts = new Map<string, number>();
    for (const l of bscBought) {
      const t = (l as unknown as { args: { token: Address } }).args.token.toLowerCase();
      bscFlapCounts.set(t, (bscFlapCounts.get(t) ?? 0) + 1);
    }
    add('flap curve', [...bscFlapCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as Address | undefined, ['flap']);
    add('kyberswap (CAKE)', '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', ['kyberswap']);
    add('pancake v2 (CAKE)', '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', ['pancake-v2']);
  }
  if (chain === 'robinhood') {
    const factory = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
    const curveBuys = await client.getLogs({ event: parseAbiItem('event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)'), fromBlock: (await client.getBlockNumber()) - 20_000n });
    const counts = new Map<string, number>();
    for (const l of curveBuys) counts.set(l.address.toLowerCase(), (counts.get(l.address.toLowerCase()) ?? 0) + 1);
    const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [curve] of busiest.slice(0, 10)) {
      // ETH-quoted, still on the curve (USDG / stock-quoted launches are left to the aggregator)
      const [graduated, native, token] = await Promise.all([
        client.readContract({ address: curve as Address, abi: [parseAbiItem('function graduated() view returns (bool)')], functionName: 'graduated' }),
        client.readContract({ address: curve as Address, abi: [parseAbiItem('function isNativeQuote() view returns (bool)')], functionName: 'isNativeQuote' }),
        client.readContract({ address: curve as Address, abi: [parseAbiItem('function token() view returns (address)')], functionName: 'token' }),
      ]);
      if (!graduated && native) {
        add('pons curve', token as Address, ['pons']);
        break;
      }
    }
    const grads = await client.getLogs({ address: factory, event: parseAbiItem('event PoolGraduated(address indexed token, uint256 a, uint256 b, uint256 c)'), fromBlock: (await client.getBlockNumber()) - 1_500_000n });
    add('pons graduate (v4 + hook)', grads.at(-1)?.args.token, ['uniswap-v4']);
    // the most bought Flap token of the last blocks
    const bought = await recentLogs(client, chain, '0x26605F322F7FF986F381bB9A6E3f5dAB0beaeB09', parseAbiItem('event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)') as never, 20_000n);
    const flapCounts = new Map<string, number>();
    for (const l of bought) {
      const t = (l as unknown as { args: { token: Address } }).args.token.toLowerCase();
      flapCounts.set(t, (flapCounts.get(t) ?? 0) + 1);
    }
    add('flap curve', [...flapCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as Address | undefined, ['flap']);
    // a Pools.trade launch: hookless native-ETH v4 pool at 0.25% / tickSpacing 25 with the most liquidity among recent ones
    const pm = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
    const head = await client.getBlockNumber();
    const initEvent = parseAbiItem('event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)');
    const pts: { id: Hex; token: Address }[] = [];
    for (let to = head; to > head - 1_500_000n && pts.length < 30; to -= 300_000n) {
      const inits = await client.getLogs({ address: pm, event: initEvent, fromBlock: to - 299_999n, toBlock: to }).catch(() => []);
      for (const l of inits.reverse()) {
        if (l.args.fee === 2500 && l.args.tickSpacing === 25 && l.args.hooks === '0x0000000000000000000000000000000000000000' && l.args.currency0 === '0x0000000000000000000000000000000000000000') pts.push({ id: l.args.id!, token: l.args.currency1! });
      }
    }
    let ptBest: { token: Address; liq: bigint } | null = null;
    for (const pt of pts.slice(0, 30)) {
      const liq = (await client.readContract({ address: '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b', abi: [parseAbiItem('function getLiquidity(bytes32) view returns (uint128)')], functionName: 'getLiquidity', args: [pt.id] })) as bigint;
      if (!ptBest || liq > ptBest.liq) ptBest = { token: pt.token, liq };
    }
    add('pools.trade (v4 hookless)', ptBest?.token, ['uniswap-v4']);
    add('kyberswap (v3-listed token)', '0x6245e67aFfa44A23077F0Ea7f981A8dC743a0C47', ['kyberswap']);
  }
  if (chain === 'base') {
    const clanker = await recentLogs(client, chain, '0xE85A59c628F7d27878ACeB4bf3b35733630083a9', parseAbiItem('event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)') as never, 6_000n);
    const clankerToken = (clanker.at(-1) as unknown as { args: { tokenAddress: Address } } | undefined)?.args.tokenAddress;
    add('kyberswap (clanker v4)', clankerToken, ['kyberswap']);
    add('clanker v4 direct', clankerToken, ['uniswap-v4']);
    const zora = await recentLogs(client, chain, '0x777777751622c0d3258f214F9DF38E35BF45baF3', parseAbiItem('event CoinCreatedV4(address indexed caller, address indexed payoutRecipient, address indexed platformReferrer, address currency, string uri, string name, string symbol, address coin, (address,address,uint24,int24,address) poolKey, bytes32 poolKeyHash, string version)') as never, 6_000n);
    // the Zora coin with the most transfers lately (a coin nobody bought yet has nothing to sell into)
    let zoraBest: { coin: Address; n: number } | null = null;
    for (const l of zora.slice(-20)) {
      const coin = (l as unknown as { args: { coin: Address } }).args.coin;
      const n = (await recentLogs(client, chain, coin, TRANSFER as never, LOG_WINDOW[chain])).length;
      if (!zoraBest || n > zoraBest.n) zoraBest = { coin, n };
    }
    add('zora coin (v4 multi-hop)', zoraBest?.coin, ['uniswap-v4']);
    add('kyberswap (DEGEN)', '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', ['kyberswap']);
    add('uniswap v3 (DEGEN)', '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', ['uniswap-v3']);
    add('uniswap v2 (DEGEN)', '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', ['uniswap-v2']);
  }
  if (chain === 'eth') {
    add('kyberswap (PEPE)', '0x6982508145454Ce325dDbE47a25d4ec3d2311933', ['kyberswap']);
    add('uniswap v3 (PEPE)', '0x6982508145454Ce325dDbE47a25d4ec3d2311933', ['uniswap-v3']);
    add('uniswap v2 (PEPE)', '0x6982508145454Ce325dDbE47a25d4ec3d2311933', ['uniswap-v2']);
    add('uniswap v4 (USDC, hookless)', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', ['uniswap-v4'], false);
  }
  return cases;
}

const fmt = (v: bigint | null | undefined, decimals: number) => (v === null || v === undefined ? '-' : Number(formatUnits(v, decimals)).toPrecision(6));

async function runCase(c: Case, engine: EvmExecEngine, side: 'buy' | 'sell', wallet: Address | null, fresh: boolean, overlaid = false): Promise<bigint | null> {
  const row: Row = { chain: c.chain, case: overlaid ? `${c.name} (slot-funded)` : c.name, side, venue: '-', amountIn: '-', expectedOut: '-', simOut: '-', delta: '-', slip: '-', fee: '-', feeSim: '-', feeMode: '-', impact: '-', gas: '-', steps: '-', status: '' };
  rows.push(row);
  try {
    const intent: EvmTradeIntent = side === 'buy'
      ? { chain: c.chain, token: c.token, side, amount: BUY_AMOUNT[c.chain], amountKind: 'native', slippageBps: 'auto', speed: 'P2', antiMev: false, venues: c.venues }
      : { chain: c.chain, token: c.token, side, amount: 1000n, amountKind: 'percent', slippageBps: 'auto', speed: 'P2', antiMev: false, venues: c.venues, wallet: wallet! };
    const quote = await engine.quote(intent);
    const outDecimals = side === 'buy' ? quote.tokenDecimals : 18;
    const inDecimals = side === 'buy' ? 18 : quote.tokenDecimals;
    row.venue = `${quote.venue}: ${quote.routeLabel}`;
    row.amountIn = fmt(quote.amountIn, inDecimals);
    row.expectedOut = fmt(quote.expectedOut, outDecimals);
    row.slip = `${(quote.slippageBps / 100).toFixed(1)}%`;
    row.fee = fmt(quote.fees.platformFee, 18);
    row.feeMode = quote.fees.platformFeeMode;
    row.impact = `${(quote.priceImpactBps / 100).toFixed(2)}%`;
    const plan = await engine.prepare(quote, wallet ?? FRESH_WALLET);
    const allow = chainAllowlist(c.chain);
    row.steps = plan.steps
      .map((s) => {
        if (s.kind === 'approve') {
          const a = decodeApprove(s.data);
          return `approve->${allow.spenders.get(a.spender.toLowerCase()) ?? a.spender}`;
        }
        if (s.kind === 'swap') return `swap@${allow.swapTargets.get(s.to.toLowerCase()) ?? (side && s.to.slice(0, 10))}`;
        return s.kind;
      })
      .join(' + ');
    const overrides = fresh ? { [FRESH_WALLET]: { balance: quote.amountIn + 10n ** 18n } } : {};
    const sim = await engine.simulate(plan, { stateOverrides: overrides });
    row.gas = sim.gasUsed.toString();
    if (!sim.ok) {
      row.status = `SIM FAIL ${sim.error?.slice(0, 80)}`;
      return null;
    }
    const separate = quote.fees.platformFeeMode === 'separate-before' || quote.fees.platformFeeMode === 'separate-after' ? quote.fees.platformFee : 0n;
    const simOut = side === 'buy' ? sim.tokenDelta! : sim.nativeReceived! - separate;
    row.simOut = fmt(simOut, outDecimals);
    const delta = quote.expectedOut > 0n ? Number(((simOut - quote.expectedOut) * 1_000_000n) / quote.expectedOut) / 10_000 : 0;
    row.delta = `${delta.toFixed(3)}%`;
    row.feeSim = fmt(sim.feeReceived, 18);
    const problems: string[] = [];
    if (simOut < quote.minOut) problems.push('out<minOut');
    if (quote.fees.platformFeeMode !== 'none') {
      const fee = sim.feeReceived ?? 0n;
      // fixed fees must arrive exactly; a fee in bps of the output follows the simulated output
      let expected = quote.fees.platformFee;
      let tol = 0n;
      if (side === 'sell' && quote.fees.platformFeeMode === 'atomic') {
        expected = quote.venue === 'fourmeme' ? quote.fees.platformFee : ((simOut + fee) * BigInt(quote.fees.platformFeeBps)) / 10_000n;
        tol = expected / 50n + 1n;
      }
      if (fee + tol < expected || fee > expected + tol) problems.push(`fee ${fee}!=${expected}`);
    }
    row.status = problems.length ? `CHECK ${problems.join(', ')}` : 'OK';
    return side === 'buy' ? simOut : null;
  } catch (err) {
    row.status = `ERR ${errorText(err).split('\n')[0].slice(0, 120)}`;
    return null;
  }
}

async function main(): Promise<void> {
  const cfg = config();
  for (const chain of CHAINS) {
    const discoverClient = recordingClient(EVM_CHAINS[chain].viem, RPC[chain], { rpc: [], http: [] });
    let cases: Case[];
    try {
      cases = await discover(chain, discoverClient);
    } catch (err) {
      rows.push({ chain, case: 'discovery', side: '-', venue: '-', amountIn: '-', expectedOut: '-', simOut: '-', delta: '-', slip: '-', fee: '-', feeSim: '-', feeMode: '-', impact: '-', gas: '-', steps: '-', status: `ERR ${errorText(err).slice(0, 120)}` });
      continue;
    }
    for (const c of cases) {
      const restricted: Address[] = [];
      for (const side of ['buy', 'sell', 'sell', 'sell'] as const) {
        if (side === 'sell' && c.sell === false) continue;
        // a retry only after a holder-specific sell revert (e.g. four.meme "GW" for some holders)
        if (side === 'sell' && rows.at(-1)?.side === 'sell' && !rows.at(-1)!.status.includes('reverts')) continue;
        if (side === 'sell' && rows.at(-1)?.side === 'sell') rows.at(-1)!.status += ' -> holder-specific, next holder';
        const rec: Recording = { rpc: [], http: [] };
        const client = recordingClient(EVM_CHAINS[chain].viem, RPC[chain], rec);
        const clients: EvmClients = { [chain]: { read: client, send: client, ws: null } };
        const now = Date.now();
        const engine = new EvmExecEngine({ config: cfg, clients, fetch: recordingFetch(rec), now: () => now });
        let wallet: Address | null = null;
        let overlay: StateOverlay | null = null;
        let caseEngine = engine;
        if (side === 'sell') {
          const curve = c.venues?.some((v) => v === 'flap' || v === 'pons' || v === 'fourmeme') ?? false;
          const venueContracts = ['0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0', '0x26605F322F7FF986F381bB9A6E3f5dAB0beaeB09', '0x5c952063c7fc8610FFDB798152D69F0B9550762b'] as Address[];
          wallet = await findHolder(discoverClient, chain, c.token, [...venueContracts, ...restricted], curve).catch(() => null);
          if (wallet) restricted.push(wallet);
          if (!wallet) {
            // no EOA holder: give the fresh wallet what the buy would have bought, through the balance slot
            const slot = await probeBalanceSlot(discoverClient, c.token, FRESH_WALLET);
            const amount = boughtTokens.get(`${chain}:${c.token}`);
            if (!slot || !amount) {
              rows.push({ chain, case: c.name, side, venue: '-', amountIn: '-', expectedOut: '-', simOut: '-', delta: '-', slip: '-', fee: '-', feeSim: '-', feeMode: '-', impact: '-', gas: '-', steps: '-', status: 'SKIP no holder and no balance slot' });
              continue;
            }
            wallet = FRESH_WALLET;
            overlay = { [FRESH_WALLET]: { balance: 10n ** 18n }, [c.token]: { stateDiff: { [slot]: toHex(amount, { size: 32 }) } } };
            const oc = overlayClient(EVM_CHAINS[chain].viem, client, overlay);
            caseEngine = new EvmExecEngine({ config: cfg, clients: { [chain]: { read: oc, send: oc, ws: null } }, fetch: recordingFetch(rec), now: () => now });
          }
        }
        const out = await runCase(c, caseEngine, side, wallet, side === 'buy', overlay !== null);
        if (side === 'buy' && out) boughtTokens.set(`${chain}:${c.token}`, out);
        if (RECORD_DIR) {
          mkdirSync(RECORD_DIR, { recursive: true });
          const file = join(RECORD_DIR, `${chain}-${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${side}.json`);
          writeFileSync(file, JSON.stringify({ chain, case: c.name, side, token: c.token, venues: c.venues, wallet: wallet ?? FRESH_WALLET, freshWallet: side === 'buy', feeWallet: FEE_WALLET, now, buyAmount: BUY_AMOUNT[chain].toString(), overlay, result: rows.at(-1), recording: rec }, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v), 1));
        }
      }
    }
  }
  const cols: (keyof Row)[] = ['chain', 'case', 'side', 'venue', 'amountIn', 'expectedOut', 'simOut', 'delta', 'slip', 'fee', 'feeSim', 'feeMode', 'impact', 'gas', 'steps', 'status'];
  console.log(`fee wallet ${FEE_WALLET}  fresh wallet ${FRESH_WALLET}`);
  console.log(cols.join(' | '));
  for (const r of rows) console.log(cols.map((c) => r[c]).join(' | '));
}

// --receipts: decode recent real swaps (direct EOA calls to each venue) with engine.track(), comparing the
// balance-delta native amount with the venue's own event, and record them as receipt fixtures.

interface ReceiptCase {
  name: string;
  hash: Hex;
  token: Address;
  side: 'buy' | 'sell';
  /** Native leg and token amount the venue's event reports. */
  eventNative: bigint;
  eventTokens: bigint | null;
}

async function recentReceiptCases(chain: EvmChainId, client: PublicClient): Promise<ReceiptCase[]> {
  const head = await client.getBlockNumber();
  const out: ReceiptCase[] = [];
  const direct = async (hash: Hex, to: Address) => {
    const tx = await client.getTransaction({ hash });
    return tx.to !== null && isAddressEqual(tx.to, to) && tx.input.length > 10;
  };
  const back = chain === 'robinhood' ? 600n : chain === 'bsc' ? 300n : chain === 'base' ? 300n : 60n;
  if (chain === 'robinhood') {
    for (const [evt, side] of [
      ['event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)', 'buy'],
      ['event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)', 'sell'],
    ] as const) {
      const logs = await client.getLogs({ event: parseAbiItem(evt) as never, fromBlock: head - back });
      for (const l of logs.reverse() as unknown as { address: Address; transactionHash: Hex; args: Record<string, bigint | Address> }[]) {
        if (!(await direct(l.transactionHash, l.address))) continue;
        const token = (await client.readContract({ address: l.address, abi: [parseAbiItem('function token() view returns (address)')], functionName: 'token' })) as Address;
        out.push({ name: `pons ${side}`, hash: l.transactionHash, token, side, eventNative: (side === 'buy' ? l.args.quoteIn : l.args.quoteOut) as bigint, eventTokens: (side === 'buy' ? l.args.tokensOut : l.args.tokensIn) as bigint });
        break;
      }
    }
  }
  const flapPortal = chain === 'robinhood' ? '0x26605F322F7FF986F381bB9A6E3f5dAB0beaeB09' : chain === 'bsc' ? '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0' : null;
  if (flapPortal) {
    for (const [evt, side] of [
      ['event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)', 'buy'],
      ['event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)', 'sell'],
    ] as const) {
      const logs = await client.getLogs({ address: flapPortal, event: parseAbiItem(evt) as never, fromBlock: head - back });
      for (const l of logs.reverse() as unknown as { transactionHash: Hex; args: Record<string, bigint | Address> }[]) {
        if (!(await direct(l.transactionHash, flapPortal))) continue;
        out.push({ name: `flap ${side}`, hash: l.transactionHash, token: l.args.token as Address, side, eventNative: l.args.eth as bigint, eventTokens: l.args.amount as bigint });
        break;
      }
    }
  }
  if (chain === 'bsc') {
    const tm2 = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
    for (const [evt, side] of [
      ['event TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)', 'buy'],
      ['event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)', 'sell'],
    ] as const) {
      const logs = await client.getLogs({ address: tm2, event: parseAbiItem(evt) as never, fromBlock: head - back });
      for (const l of logs.reverse() as unknown as { transactionHash: Hex; args: Record<string, bigint | Address> }[]) {
        if (!(await direct(l.transactionHash, tm2))) continue;
        const tx = await client.getTransaction({ hash: l.transactionHash });
        if (side === 'buy' && tx.value === 0n) continue; // BNB-quoted only
        out.push({ name: `four.meme ${side}`, hash: l.transactionHash, token: l.args.token as Address, side, eventNative: side === 'buy' ? (l.args.cost as bigint) + (l.args.fee as bigint) : (l.args.cost as bigint) - (l.args.fee as bigint), eventTokens: l.args.amount as bigint });
        break;
      }
    }
  }
  const kyber = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
  const swapped = await client.getLogs({ address: kyber, event: parseAbiItem('event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)'), fromBlock: head - back });
  const native = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  for (const side of ['buy', 'sell'] as const) {
    for (const l of [...swapped].reverse()) {
      const { srcToken, dstToken, spentAmount, returnAmount, sender, dstReceiver } = l.args;
      const isBuy = isAddressEqual(srcToken!, native);
      if (isBuy !== (side === 'buy') || (!isBuy && !isAddressEqual(dstToken!, native)) || !isAddressEqual(sender!, dstReceiver!)) continue;
      // a wrap / unwrap through the aggregator is not a token trade
      if (isAddressEqual(isBuy ? dstToken! : srcToken!, EVM_CHAINS[chain].wrappedNative)) continue;
      if (!(await direct(l.transactionHash, kyber))) continue;
      out.push({ name: `kyberswap ${side}`, hash: l.transactionHash, token: isBuy ? dstToken! : srcToken!, side, eventNative: isBuy ? spentAmount! : returnAmount!, eventTokens: isBuy ? returnAmount! : spentAmount! });
      break;
    }
  }
  return out;
}

async function receiptsMain(): Promise<void> {
  const cfg = config();
  console.log('chain | case | tx | nativeSource | tokenAmount | event tokens | nativeAmount | event native | gasPaid | status');
  for (const chain of CHAINS) {
    const rec: Recording = { rpc: [], http: [] };
    const client = recordingClient(EVM_CHAINS[chain].viem, RPC[chain], rec);
    let cases: ReceiptCase[] = [];
    try {
      cases = await recentReceiptCases(chain, client);
    } catch (err) {
      console.log(`${chain} | discovery | - | - | - | - | - | - | - | ERR ${errorText(err).slice(0, 100)}`);
    }
    for (const rc of cases) {
      const caseRec: Recording = { rpc: [], http: [] };
      const caseClient = recordingClient(EVM_CHAINS[chain].viem, RECEIPT_RPC[chain], caseRec);
      const engine = new EvmExecEngine({ config: cfg, clients: { [chain]: { read: caseClient, send: caseClient, ws: null } }, kyber: null });
      try {
        const fill = await engine.track(chain, rc.hash, { token: rc.token, side: rc.side });
        const tokOk = rc.eventTokens === null || fill.tokenAmount === rc.eventTokens;
        const natOk = fill.nativeAmount === rc.eventNative;
        console.log(`${chain} | ${rc.name} | ${rc.hash.slice(0, 12)} | ${fill.nativeSource} | ${fill.tokenAmount} | ${rc.eventTokens} | ${fill.nativeAmount} | ${rc.eventNative} | ${fill.gasPaid} | ${tokOk && natOk ? 'OK' : `CHECK${tokOk ? '' : ' tokens'}${natOk ? '' : ' native'}`}`);
        if (RECORD_DIR) {
          mkdirSync(RECORD_DIR, { recursive: true });
          writeFileSync(join(RECORD_DIR, `receipt-${chain}-${rc.name.replace(/[^a-z0-9]+/gi, '-')}.json`), JSON.stringify({ chain, ...rc, fill, recording: caseRec }, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v), 1));
        }
      } catch (err) {
        console.log(`${chain} | ${rc.name} | ${rc.hash.slice(0, 12)} | - | - | - | - | - | - | ERR ${errorText(err).slice(0, 300)}`);
      }
    }
  }
}

void (args.includes('--receipts') ? receiptsMain() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});


