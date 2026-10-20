// Holder scan, dev history, dev status, TokenSecurity (incl. the rug ratio
// composite and the audit checklist). Inputs are observable data only:
// balances, positions, funding links, cohorts derived from blocks/timestamps,
// labels/tags, contract flags and the creator's launch history.

import type {
  ChainId,
  DevStatus,
  DevToken,
  HolderTagStats,
  RiskLevel,
  SafetyBand,
  SafetyReason,
  SafetyScore,
  SecurityCheck,
  TokenSecurity,
  WalletTag,
} from '@trenchscope/shared';
import type { TokenState, WalletState, World } from '../../sim/world';
import { devGroupBalance, isDevGroup, type TokenTrack } from './track';

// ---------------------------------------------------------------------------
// Holder scan (O(holders); cached by the caller)
// ---------------------------------------------------------------------------

export interface GroupTally {
  count: number;
  balance: number;
}

export interface HolderScan {
  holderCount: number;
  /** Sum of the 10 / 100 largest wallet balances (curve/pool are not wallets). */
  top10Balance: number;
  top100Balance: number;
  /** Top 10 wallet addresses, largest first. */
  top10: string[];
  dev: GroupTally;
  insider: GroupTally;
  sniper: GroupTally;
  bundler: GroupTally;
  smart: GroupTally;
  kol: GroupTally;
  whale: GroupTally;
  fresh: GroupTally;
  bot: GroupTally;
}

const tally = (): GroupTally => ({ count: 0, balance: 0 });

/** Cohort membership: world-provided token cohorts unioned with analytics-derived ones. */
export class Cohorts {
  private devFunder: string | null;
  constructor(
    private world: World,
    private t: TokenState,
    private s: TokenTrack,
  ) {
    this.devFunder = world.wallets.get(t.creator)?.fundedBy ?? null;
  }
  isDev(a: string): boolean {
    return isDevGroup(this.t, a);
  }
  isSniper(a: string): boolean {
    return this.s.snipers.has(a) || this.t.snipers.has(a);
  }
  isBundler(a: string): boolean {
    return this.s.bundlers.has(a) || this.t.bundlers.has(a);
  }
  /** Insider: cohort member, or funded directly by the dev team / the dev's private funder. */
  isInsider(a: string, w?: WalletState): boolean {
    if (this.s.insiders.has(a) || this.t.insiders.has(a)) return true;
    const f = (w ?? this.world.wallets.get(a))?.fundedBy;
    if (!f || isDevGroup(this.t, a)) return false;
    if (isDevGroup(this.t, f)) return true;
    if (this.devFunder !== null && f === this.devFunder) {
      const fw = this.world.wallets.get(f);
      return !(fw && fw.label !== null && !fw.tags.has('kol'));
    }
    return false;
  }
  /** Token-relative tags for a wallet (dev, sniper, bundler, insider). */
  tags(a: string, w?: WalletState): WalletTag[] {
    const out: WalletTag[] = [];
    if (this.isDev(a)) out.push('dev');
    if (this.isSniper(a)) out.push('sniper');
    if (this.isBundler(a)) out.push('bundler');
    if (this.isInsider(a, w)) out.push('insider');
    return out;
  }
  sniperCount(): number {
    let n = this.s.snipers.size;
    for (const a of this.t.snipers) if (!this.s.snipers.has(a)) n++;
    return n;
  }
  /** Sum of a cohort's traded volume (bought + sold USD) on this token. */
  cohortVolume(kind: 'bundler' | 'insider'): number {
    const seen = new Set<string>();
    let v = 0;
    const add = (a: string) => {
      if (seen.has(a) || isDevGroup(this.t, a)) return;
      seen.add(a);
      const p = this.world.wallets.get(a)?.positions.get(this.t.address);
      if (p) v += p.boughtUsd + p.soldUsd;
    };
    if (kind === 'bundler') {
      for (const a of this.s.bundlers) add(a);
      for (const a of this.t.bundlers) add(a);
    } else {
      for (const a of this.s.insiders) add(a);
      for (const a of this.t.insiders) add(a);
    }
    return v;
  }
}

/** Insert (balance, address) into a descending top-K list. */
function pushTop(bal: number[], addr: string[], b: number, a: string, k: number): void {
  const n = bal.length;
  if (n === k && b <= bal[n - 1]) return;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bal[mid] >= b) lo = mid + 1;
    else hi = mid;
  }
  bal.splice(lo, 0, b);
  addr.splice(lo, 0, a);
  if (bal.length > k) {
    bal.pop();
    addr.pop();
  }
}

export function scanHolders(world: World, t: TokenState, cohorts: Cohorts, walletTags: (w: WalletState) => WalletTag[]): HolderScan {
  const scan: HolderScan = {
    holderCount: 0,
    top10Balance: 0,
    top100Balance: 0,
    top10: [],
    dev: tally(),
    insider: tally(),
    sniper: tally(),
    bundler: tally(),
    smart: tally(),
    kol: tally(),
    whale: tally(),
    fresh: tally(),
    bot: tally(),
  };
  const topBal: number[] = [];
  const topAddr: string[] = [];
  const add = (g: GroupTally, b: number) => {
    g.count++;
    g.balance += b;
  };
  for (const a of t.holders) {
    const w = world.wallets.get(a);
    if (!w) continue;
    const b = w.positions.get(t.address)?.balance ?? 0;
    if (b <= 0) continue;
    scan.holderCount++;
    pushTop(topBal, topAddr, b, a, 100);
    if (cohorts.isDev(a)) add(scan.dev, b);
    if (cohorts.isInsider(a, w)) add(scan.insider, b);
    if (cohorts.isSniper(a)) add(scan.sniper, b);
    if (cohorts.isBundler(a)) add(scan.bundler, b);
    const tags = walletTags(w);
    if (tags.length > 0) {
      if (tags.includes('smart')) add(scan.smart, b);
      if (tags.includes('kol')) add(scan.kol, b);
      if (tags.includes('whale')) add(scan.whale, b);
      if (tags.includes('fresh')) add(scan.fresh, b);
      if (tags.includes('bot')) add(scan.bot, b);
    }
  }
  for (let i = 0; i < topBal.length; i++) {
    scan.top100Balance += topBal[i];
    if (i < 10) scan.top10Balance += topBal[i];
  }
  scan.top10 = topAddr.slice(0, 10);
  return scan;
}

export function holderTagStats(scan: HolderScan, supply: number): HolderTagStats {
  const r = (g: GroupTally) => (supply > 0 ? g.balance / supply : 0);
  return {
    smartCount: scan.smart.count,
    kolCount: scan.kol.count,
    sniperCount: scan.sniper.count,
    bundlerCount: scan.bundler.count,
    insiderCount: scan.insider.count,
    whaleCount: scan.whale.count,
    freshCount: scan.fresh.count,
    botCount: scan.bot.count,
    devCount: scan.dev.count,
    smartHoldRate: r(scan.smart),
    kolHoldRate: r(scan.kol),
    sniperHoldRate: r(scan.sniper),
    bundlerHoldRate: r(scan.bundler),
    insiderHoldRate: r(scan.insider),
    whaleHoldRate: r(scan.whale),
    freshHoldRate: r(scan.fresh),
    botHoldRate: r(scan.bot),
  };
}

// ---------------------------------------------------------------------------
// Dev status + rugged flag
// ---------------------------------------------------------------------------

/**
 * Dev group (creator + dev team) status:
 *   sold_all    - held at some point and now holds ~nothing (< 0.1% of peak)
 *   sold_part   - sold more than 10% of the peak holding
 *   bought_more - bought again after the launch block
 *   hold        - otherwise (including devs that never bought)
 */
export function devStatusOf(s: TokenTrack, devBalance: number): DevStatus {
  if (s.devPeak > 0 && devBalance <= s.devPeak * 0.001) return 'sold_all';
  if (s.devPeak > 0 && s.devSold > s.devPeak * 0.1) return 'sold_part';
  if (s.devBoughtMore) return 'bought_more';
  return 'hold';
}

/** Rugged: dev sold >= 90% of its peak within 30 min of launch and price fell >= 70% from ATH. */
export function isRugged(s: TokenTrack, priceUsd: number, athPriceUsd: number): boolean {
  return s.devPeak > 0 && s.devSoldEarly >= s.devPeak * 0.9 && athPriceUsd > 0 && priceUsd <= athPriceUsd * 0.3;
}

// ---------------------------------------------------------------------------
// Dev history across the creator's launches (cached per creator by the caller)
// ---------------------------------------------------------------------------

export interface DevAggregate {
  created: number;
  migrated: number;
  rugged: number;
  /** Launches whose outcome is known: migrated, rugged, gone or older than 1h. */
  resolved: number;
  bestAth: number;
  tokens: DevToken[];
  /** Per-launch outcome bits as counted above (DEV_MIGRATED | DEV_RUGGED | DEV_RESOLVED). */
  flags: Map<string, number>;
}

export const DEV_MIGRATED = 1;
export const DEV_RUGGED = 2;
export const DEV_RESOLVED = 4;

export const RESOLVE_AGE_MS = 60 * 60_000;

/** DevToken row of a token that still exists. */
export function devTokenRow(world: World, t: TokenState, rugged: boolean): DevToken {
  const mcap = world.marketCapUsd(t);
  return {
    chain: t.chain,
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    logoSeed: t.logoSeed,
    logoGlyph: t.logoGlyph,
    createdAt: t.createdAt,
    status: t.status,
    marketCapUsd: mcap,
    athMarketCapUsd: Math.max(t.athMarketCapUsd, mcap),
    rugged,
  };
}

export function devAggregate(
  world: World,
  creator: string,
  trackOf: (address: string) => TokenTrack | undefined,
  liveRugged: (t: TokenState) => boolean,
): DevAggregate {
  const w = world.wallets.get(creator);
  const agg: DevAggregate = { created: 0, migrated: 0, rugged: 0, resolved: 0, bestAth: 0, tokens: [], flags: new Map() };
  if (!w) return agg;
  const list = w.createdTokens;
  agg.created = list.length;
  const now = world.now;
  for (let i = list.length - 1; i >= 0; i--) {
    const addr = list[i];
    const t = world.tokens.get(addr);
    let row: DevToken | null = null;
    let resolved = false;
    if (t) {
      const rugged = liveRugged(t);
      row = devTokenRow(world, t, rugged);
      resolved = t.status !== 'curve' || rugged || t.dormant || now - t.createdAt > RESOLVE_AGE_MS;
    } else {
      const s = trackOf(addr);
      if (!s) continue;
      row = {
        chain: s.chain,
        address: s.address,
        symbol: s.symbol,
        name: s.name,
        logoSeed: s.logoSeed,
        logoGlyph: s.logoGlyph,
        createdAt: s.createdAt,
        status: s.status,
        marketCapUsd: s.marketCapUsd,
        athMarketCapUsd: s.athMarketCapUsd,
        rugged: s.rugged,
      };
      resolved = true;
    }
    let bits = 0;
    if (row.status === 'migrated') {
      agg.migrated++;
      bits |= DEV_MIGRATED;
    }
    if (row.rugged) {
      agg.rugged++;
      bits |= DEV_RUGGED;
    }
    if (resolved) {
      agg.resolved++;
      bits |= DEV_RESOLVED;
    }
    agg.flags.set(addr, bits);
    if (row.athMarketCapUsd > agg.bestAth) agg.bestAth = row.athMarketCapUsd;
    if (agg.tokens.length < 50) agg.tokens.push(row);
  }
  return agg;
}

// ---------------------------------------------------------------------------
// Rug ratio composite
// ---------------------------------------------------------------------------

export interface RugInputs {
  chain: ChainId;
  status: TokenState['status'];
  ageMs: number;
  devHoldRate: number;
  devStatus: DevStatus;
  /** Dev-group tokens sold within 30 min of launch / dev peak holding. */
  devSoldEarlyFrac: number;
  /** 1 - price / ATH price. */
  athDrawdown: number;
  bundlerRate: number;
  bundlerHoldRate: number;
  insiderHoldRate: number;
  ratTraderRate: number;
  sniperHoldRate: number;
  top10HolderRate: number;
  /** Creator's other launches (this token excluded). */
  devOtherCreated: number;
  devOtherResolved: number;
  devOtherRugged: number;
  devOtherMigrated: number;
  renouncedMint: boolean | null;
  renouncedFreeze: boolean | null;
  isHoneypot: boolean | null;
  isOpenSource: boolean | null;
  isRenounced: boolean | null;
  buyTax: number;
  sellTax: number;
  lpBurnedRate: number | null;
  isWashTrading: boolean;
}

const clamp01 = (v: number) => (v <= 0 || !Number.isFinite(v) ? 0 : v >= 1 ? 1 : v);

/**
 * Rug ratio = 1 - PRODUCT_i (1 - weight_i * signal_i)   (noisy-OR, every signal_i in [0, 1])
 *
 *   devHold           (devHoldRate - 2%) / 18%                creator + dev team share
 *   bundlers          max(bundlerRate / 45%, bundlerHold / 20%)
 *   insiders          max(insiderHold / 20%, ratTraderRate / 40%)
 *   snipers           (sniperHold - 5%) / 25%
 *   top10             (top10 - 35%) / 40%                     young tokens are naturally concentrated
 *   devHistory        ((rugged + 0.2) / (resolved + 4) - 5%) / 55%   creator's other launches, shrunk
 *   serialLauncher    (1 - migrationRate) * log10(launches) / 1.5, from 3+ other launches
 *   mintFreeze        SOL: mint or freeze authority still active
 *   honeypot / honeypotUnknown / closedSource / ownerNotRenounced   EVM contract flags
 *   tax               (max(buy, sell tax) - 3%) / 12%
 *   lpNotBurned       migrated pool with < 95% LP burned
 *   devDump           dev sold > 50-90% of its peak within 30 min x ATH drawdown / 60%
 *   washTrading       isWashTrading
 *
 * Several moderate red flags compound; one decisive flag (honeypot, completed
 * dev dump) dominates. Evaluated against the simulator's hidden fates (test
 * only, analytics never reads them): at ~2.5 min after launch AUC is ~0.99
 * for rug/slow_rug/pump_dump vs runner/moon and ~0.96-0.98 vs all other
 * fates; ~97% of bad launches score > 0.3 (high), ~75-85% of runners < 0.1.
 */
export const RUG_WEIGHTS = {
  devHold: 0.4,
  bundlers: 0.4,
  insiders: 0.5,
  snipers: 0.15,
  top10: 0.3,
  devHistory: 0.6,
  serialLauncher: 0.25,
  mintFreeze: 0.6,
  honeypot: 1,
  honeypotUnknown: 0.15,
  closedSource: 0.35,
  ownerNotRenounced: 0.2,
  tax: 0.5,
  lpNotBurned: 0.45,
  devDump: 0.75,
  washTrading: 0.2,
} as const;

export type RugTerm = keyof typeof RUG_WEIGHTS;

/** Individual signals in [0,1] (before weighting). Exposed for evaluation/debugging. */
export function rugSignals(i: RugInputs): Record<RugTerm, number> {
  const evm = i.chain !== 'sol';
  // Dev history with a Beta(1, 4)-style prior: one bad launch out of one is not 100%.
  const histRug = (i.devOtherRugged + 0.2) / (i.devOtherResolved + 4);
  const migRate = i.devOtherResolved > 0 ? i.devOtherMigrated / i.devOtherResolved : 0;
  const serial = i.devOtherCreated >= 3 ? clamp01((1 - migRate) * (Math.log10(i.devOtherCreated) / 1.5)) : 0;
  const tax = Math.max(i.buyTax, i.sellTax);
  return {
    devHold: clamp01((i.devHoldRate - 0.02) / 0.18),
    bundlers: clamp01(Math.max(i.bundlerRate / 0.45, i.bundlerHoldRate / 0.2)),
    insiders: clamp01(Math.max(i.insiderHoldRate / 0.2, i.ratTraderRate / 0.4)),
    snipers: clamp01((i.sniperHoldRate - 0.05) / 0.25),
    top10: clamp01((i.top10HolderRate - 0.35) / 0.4),
    devHistory: clamp01((histRug - 0.05) / 0.55),
    serialLauncher: serial,
    mintFreeze: !evm && (i.renouncedMint === false || i.renouncedFreeze === false) ? 1 : 0,
    honeypot: evm && i.isHoneypot === true ? 1 : 0,
    honeypotUnknown: evm && i.isHoneypot === null ? 1 : 0,
    closedSource: evm && i.isOpenSource === false ? 1 : evm && i.isOpenSource === null ? 0.5 : 0,
    ownerNotRenounced: evm && i.isRenounced === false ? 1 : evm && i.isRenounced === null ? 0.5 : 0,
    tax: clamp01((tax - 0.03) / 0.12),
    lpNotBurned: i.lpBurnedRate === null ? 0 : clamp01((0.95 - i.lpBurnedRate) / 0.95),
    devDump: clamp01((i.devSoldEarlyFrac - 0.5) / 0.4) * clamp01(i.athDrawdown / 0.6),
    washTrading: i.isWashTrading ? 1 : 0,
  };
}

export function rugRatio(i: RugInputs): number {
  const sig = rugSignals(i);
  let keep = 1;
  for (const k of Object.keys(RUG_WEIGHTS) as RugTerm[]) keep *= 1 - RUG_WEIGHTS[k] * sig[k];
  const r = 1 - keep;
  return Math.round(clamp01(r) * 1e4) / 1e4;
}

export function riskLevelOf(rug: number, honeypot: boolean | null): RiskLevel {
  if (honeypot === true) return 'high';
  if (rug < 0.1) return 'low';
  if (rug <= 0.3) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// Audit checklist (hints only where a check is not green, to keep list payloads small)
// ---------------------------------------------------------------------------

const pct = (v: number) => {
  const p = v * 100;
  if (p === 0) return '0%';
  if (p < 0.1) return '<0.1%';
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
};

const yesNo = (v: boolean | null, yes = 'Yes', no = 'No') => (v === null ? 'Unknown' : v ? yes : no);

export interface ChecksInput {
  security: Omit<TokenSecurity, 'checks'>;
  chain: ChainId;
  onCurve: boolean;
  smartDegenCount: number;
}

/** Thresholds follow the reference product's quick-scoring card (see research notes). */
export function buildChecks({ security: s, chain, onCurve, smartDegenCount }: ChecksInput): SecurityCheck[] {
  const checks: SecurityCheck[] = [];
  if (chain === 'sol') {
    checks.push({
      key: 'mint',
      label: 'Mint authority',
      value: yesNo(s.renouncedMint, 'Renounced', 'Active'),
      level: s.renouncedMint === null ? 'info' : s.renouncedMint ? 'good' : 'bad',
      hint: s.renouncedMint === false ? 'Dev can mint new supply' : undefined,
    });
    checks.push({
      key: 'freeze',
      label: 'Freeze authority',
      value: yesNo(s.renouncedFreeze, 'Renounced', 'Active'),
      level: s.renouncedFreeze === null ? 'info' : s.renouncedFreeze ? 'good' : 'bad',
      hint: s.renouncedFreeze === false ? 'Dev can freeze holder accounts' : undefined,
    });
  } else {
    checks.push({
      key: 'honeypot',
      label: 'Honeypot',
      value: yesNo(s.isHoneypot),
      level: s.isHoneypot === null ? 'warn' : s.isHoneypot ? 'bad' : 'good',
      hint: s.isHoneypot ? 'Buys work, sells are blocked' : s.isHoneypot === null ? 'Sell path untested' : undefined,
    });
    checks.push({
      key: 'open_source',
      label: 'Contract verified',
      value: yesNo(s.isOpenSource),
      level: s.isOpenSource === null ? 'warn' : s.isOpenSource ? 'good' : 'bad',
      hint: s.isOpenSource === false ? 'Source code not published' : undefined,
    });
    checks.push({
      key: 'renounced',
      label: 'Ownership renounced',
      value: yesNo(s.isRenounced),
      level: s.isRenounced === null ? 'warn' : s.isRenounced ? 'good' : 'warn',
      hint: s.isRenounced === false ? 'Owner can still change contract settings' : undefined,
    });
  }
  const maxTax = Math.max(s.buyTax, s.sellTax);
  checks.push({
    key: 'tax',
    label: 'Buy / sell tax',
    value: `${pct(s.buyTax)} / ${pct(s.sellTax)}`,
    level: maxTax <= 0 ? 'good' : maxTax > 0.1 ? 'bad' : 'warn',
    hint: maxTax > 0.1 ? 'Tax above 10% eats most gains' : undefined,
  });
  checks.push({
    key: 'lp',
    label: 'LP burned',
    value: s.lpBurnedRate === null ? (onCurve ? 'On curve' : 'N/A') : pct(s.lpBurnedRate),
    level: s.lpBurnedRate === null ? 'info' : s.lpBurnedRate >= 0.99 ? 'good' : s.lpBurnedRate >= 0.5 ? 'warn' : 'bad',
    hint: s.lpBurnedRate !== null && s.lpBurnedRate < 0.99 ? 'Unburned LP can be pulled' : undefined,
  });
  checks.push({
    key: 'top10',
    label: 'Top 10 holders',
    value: pct(s.top10HolderRate),
    level: s.top10HolderRate < 0.2 ? 'good' : s.top10HolderRate <= 0.5 ? 'warn' : 'bad',
    hint: s.top10HolderRate >= 0.2 ? `Top 100 hold ${pct(s.top100HolderRate)}` : undefined,
  });
  const devLabel = s.devStatus === 'sold_all' ? 'Sold all' : s.devStatus === 'sold_part' ? `${pct(s.devHoldRate)} (sold part)` : s.devStatus === 'bought_more' ? `${pct(s.devHoldRate)} (bought more)` : pct(s.devHoldRate);
  checks.push({
    key: 'dev',
    label: 'Dev holding',
    value: devLabel,
    level: s.devHoldRate <= 0.02 ? 'good' : s.devHoldRate <= 0.1 ? 'warn' : 'bad',
    hint: s.devStatus === 'sold_all' ? 'Dev no longer holds this token' : s.devHoldRate > 0.1 ? 'Dev can dump a large bag' : undefined,
  });
  checks.push({
    key: 'insiders',
    label: 'Insiders',
    value: pct(s.insiderHoldRate),
    level: s.insiderHoldRate <= 0.05 ? 'good' : s.insiderHoldRate <= 0.15 ? 'warn' : 'bad',
    hint: s.insiderHoldRate > 0.05 ? 'Wallets funded by or linked to the dev' : undefined,
  });
  checks.push({
    key: 'snipers',
    label: 'Snipers',
    value: `${s.sniperCount} (${pct(s.sniperHoldRate)})`,
    level: s.sniperCount < 5 ? 'good' : s.sniperCount <= 20 ? 'warn' : 'bad',
    hint: s.sniperCount >= 5 ? 'Bought within the first blocks after launch' : undefined,
  });
  checks.push({
    key: 'bundlers',
    label: 'Bundlers',
    value: pct(s.bundlerRate),
    level: s.bundlerRate <= 0.1 ? 'good' : s.bundlerRate <= 0.3 ? 'warn' : 'bad',
    hint: s.bundlerRate > 0.1 ? 'Share of volume from launch-block bundles' : undefined,
  });
  checks.push({
    key: 'fresh',
    label: 'Fresh wallets',
    value: pct(s.freshWalletRate),
    level: s.freshWalletRate <= 0.1 ? 'good' : s.freshWalletRate <= 0.3 ? 'warn' : 'bad',
    hint: s.freshWalletRate > 0.1 ? 'Share of holders that are brand-new wallets' : undefined,
  });
  checks.push({
    key: 'bots',
    label: 'Bot degens',
    value: pct(s.botDegenRate),
    level: s.botDegenRate <= 0.5 ? 'good' : s.botDegenRate <= 0.7 ? 'warn' : 'bad',
  });
  checks.push({
    key: 'wash',
    label: 'Wash trading',
    value: s.isWashTrading ? 'Yes' : 'No',
    level: s.isWashTrading ? 'bad' : 'good',
    hint: s.isWashTrading ? 'Much of the volume is fast round-trips' : undefined,
  });
  checks.push({
    key: 'smart',
    label: 'Smart money',
    value: String(smartDegenCount),
    level: smartDegenCount >= 3 ? 'good' : smartDegenCount >= 1 ? 'info' : 'warn',
  });
  checks.push({
    key: 'rug',
    label: 'Rug ratio',
    value: pct(s.rugRatio),
    level: s.rugRatio < 0.1 ? 'good' : s.rugRatio <= 0.3 ? 'warn' : 'bad',
    hint: s.rugRatio >= 0.1 ? 'Composite rug likelihood from holder, dev and contract signals' : undefined,
  });
  // Drop undefined hints so payloads stay compact.
  for (const c of checks) if (c.hint === undefined) delete c.hint;
  return checks;
}

// ---------------------------------------------------------------------------
// Safety score (PRD 8.6.1: the contract and holder sections)
// ---------------------------------------------------------------------------

type ReasonLevel = SafetyReason['level'];
/** [threshold, points, level]: the first tier whose threshold the value exceeds applies (one tier per field). */
type Tiers = readonly (readonly [number, number, ReasonLevel])[];

interface Deduction {
  key: string;
  label: string;
  points: number;
  level: ReasonLevel;
}

interface Cap {
  key: string;
  label: string;
  cap: number;
}

export const SAFETY_WEIGHTS = { contract: 0.5625, holders: 0.4375 } as const;
const TAX_TIERS: Tiers = [[0.1, 25, 'bad'], [0.05, 10, 'warn']];
const TOP10_TIERS: Tiers = [[0.5, 25, 'bad'], [0.3, 14, 'warn'], [0.2, 6, 'warn']];
const DEV_TIERS: Tiers = [[0.05, 20, 'bad'], [0.02, 10, 'warn']];
const BUNDLER_TIERS: Tiers = [[0.3, 20, 'bad'], [0.15, 10, 'warn'], [0.05, 4, 'warn']];
const SNIPER_TIERS: Tiers = [[0.15, 15, 'bad'], [0.05, 6, 'warn']];
const INSIDER_TIERS: Tiers = [[0.05, 12, 'bad'], [0.01, 5, 'warn']];
const BOT_TIERS: Tiers = [[0.7, 12, 'bad'], [0.5, 6, 'warn']];
const FRESH_TIERS: Tiers = [[0.5, 8, 'warn']];
/** Holder-based checks, unknown while nobody holds the token. */
const HOLDER_CHECKS = 7;
/** Reasons listed; past this the smallest are summed into one 'other' reason. */
const MAX_REASONS = 6;
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface SafetyInputs {
  chain: ChainId;
  security: Omit<TokenSecurity, 'checks' | 'safety'>;
  /** Wallets holding the token now. */
  holderCount: number;
}

/**
 * Safety score 0..100 (higher = safer), deterministic and explained by its reasons:
 *
 *   score = 100 - 0.5625 * min(100, contract) - 0.4375 * min(100, holders), then capped
 *
 * (the PRD weights for a token without the price section: memecoins rarely have the 8 x 15m
 * candles it needs). Within a field only the worst tier applies.
 *
 *   CONTRACT                                   HOLDERS
 *   SOL mint authority active     25 bad       top 10 hold > 50 / 30 / 20%        25 bad / 14 / 6
 *   SOL freeze authority active   20 bad       dev holds > 5 / 2%                 20 bad / 10
 *   EVM source not verified       15 bad       bundler volume > 30 / 15 / 5%      20 bad / 10 / 4
 *   EVM owner not renounced        8           snipers hold > 15 / 5%             15 bad / 6
 *   max tax > 10 / 5%             25 bad / 10  insiders hold > 5 / 1%             12 bad / 5
 *   migrated, LP burned < 95%     12 bad       bots > 70 / 50% of holders         12 bad / 6
 *                                              fresh wallets > 50% of holders      8
 *                                              wash trading                       10 bad
 *
 * Caps (the lowest applies): honeypot 0, SOL mint or freeze authority active 25 (both hard gates:
 * band danger), rugRatio >= 0.5 59, >= 0.3 79, EVM honeypot or verification unknown 79, EVM pool
 * LP < 95% burned 79. A reason's impact is its points x section weight (scaled down if a section
 * passes 100), plus the points a binding cap removed, so impacts add up to 100 - score (before
 * rounding, unless the score floors at 0). At most 6 are listed, largest first: past that the 5
 * largest and one 'other' reason carrying the rest.
 * Coverage = known / applicable checks: SOL mint + freeze or EVM honeypot + source + owner, tax,
 * LP once migrated, the 7 holder checks (known once anyone holds), wash trading and the rug ratio.
 * Band: a hard gate -> danger; coverage < 0.5 -> unknown; else >= 70 safe, >= 40 caution, danger.
 */
export function safetyScore({ chain, security: s, holderCount }: SafetyInputs): SafetyScore {
  const contract: Deduction[] = [];
  const holders: Deduction[] = [];
  const caps: Cap[] = [];
  let known = 0;
  let applicable = 0;
  const check = (isKnown: boolean): boolean => {
    applicable++;
    if (isKnown) known++;
    return isKnown;
  };
  const tiered = (into: Deduction[], key: string, label: string, value: number, tiers: Tiers) => {
    const hit = tiers.find(([threshold]) => value > threshold);
    if (hit) into.push({ key, label, points: hit[1], level: hit[2] });
  };

  if (chain === 'sol') {
    if (check(s.renouncedMint !== null) && !s.renouncedMint) {
      contract.push({ key: 'mint', label: 'Mint authority active', points: 25, level: 'bad' });
      caps.push({ key: 'mint', label: 'Mint authority active', cap: 25 });
    }
    if (check(s.renouncedFreeze !== null) && !s.renouncedFreeze) {
      contract.push({ key: 'freeze', label: 'Freeze authority active', points: 20, level: 'bad' });
      caps.push({ key: 'freeze', label: 'Freeze authority active', cap: 25 });
    }
  } else {
    const unverified: Cap = { key: 'unverified', label: 'Contract checks incomplete', cap: 79 };
    if (!check(s.isHoneypot !== null)) caps.push(unverified);
    else if (s.isHoneypot) caps.push({ key: 'honeypot', label: 'Honeypot: sells are blocked', cap: 0 });
    if (!check(s.isOpenSource !== null)) caps.push(unverified);
    else if (!s.isOpenSource) contract.push({ key: 'open_source', label: 'Contract not verified', points: 15, level: 'bad' });
    if (check(s.isRenounced !== null) && !s.isRenounced) contract.push({ key: 'renounced', label: 'Ownership not renounced', points: 8, level: 'warn' });
  }
  check(true);
  const maxTax = Math.max(s.buyTax, s.sellTax);
  tiered(contract, 'tax', `Tax ${pct(maxTax)}`, maxTax, TAX_TIERS);
  // LP only exists once migrated (curve tokens skip the check rather than count it unknown).
  if (s.lpBurnedRate !== null && check(true) && s.lpBurnedRate < 0.95) {
    const label = `Only ${pct(s.lpBurnedRate)} of LP burned`;
    contract.push({ key: 'lp', label, points: 12, level: 'bad' });
    if (chain !== 'sol') caps.push({ key: 'lp', label, cap: 79 });
  }

  if (holderCount > 0) {
    applicable += HOLDER_CHECKS;
    known += HOLDER_CHECKS;
    tiered(holders, 'top10', `Top 10 hold ${pct(s.top10HolderRate)}`, s.top10HolderRate, TOP10_TIERS);
    tiered(holders, 'dev', `Dev holds ${pct(s.devHoldRate)}`, s.devHoldRate, DEV_TIERS);
    tiered(holders, 'bundlers', `Bundlers ${pct(s.bundlerRate)} of volume`, s.bundlerRate, BUNDLER_TIERS);
    tiered(holders, 'snipers', `Snipers hold ${pct(s.sniperHoldRate)}`, s.sniperHoldRate, SNIPER_TIERS);
    tiered(holders, 'insiders', `Insiders hold ${pct(s.insiderHoldRate)}`, s.insiderHoldRate, INSIDER_TIERS);
    tiered(holders, 'bots', `Bots are ${pct(s.botDegenRate)} of holders`, s.botDegenRate, BOT_TIERS);
    tiered(holders, 'fresh', `Fresh wallets are ${pct(s.freshWalletRate)} of holders`, s.freshWalletRate, FRESH_TIERS);
  } else applicable += HOLDER_CHECKS;
  check(true);
  if (s.isWashTrading) holders.push({ key: 'wash', label: 'Wash trading', points: 10, level: 'bad' });
  check(true);
  if (s.rugRatio >= 0.5) caps.push({ key: 'rug', label: `Rug risk ${pct(s.rugRatio)}`, cap: 59 });
  else if (s.rugRatio >= 0.3) caps.push({ key: 'rug', label: `Rug risk ${pct(s.rugRatio)}`, cap: 79 });

  const reasons = new Map<string, SafetyReason>();
  const add = (key: string, label: string, impact: number, level: ReasonLevel) => {
    const r = reasons.get(key);
    if (!r) reasons.set(key, { key, label, impact, level });
    else {
      r.impact += impact;
      if (level === 'bad') r.level = 'bad';
    }
  };
  const deduct = (list: Deduction[], weight: number): number => {
    const sum = list.reduce((a, d) => a + d.points, 0);
    const scale = sum > 100 ? (weight * 100) / sum : weight;
    for (const d of list) add(d.key, d.label, d.points * scale, d.level);
    return sum * scale;
  };
  let score = Math.max(0, 100 - deduct(contract, SAFETY_WEIGHTS.contract) - deduct(holders, SAFETY_WEIGHTS.holders));
  let binding: Cap | null = null;
  for (const c of caps) if (!binding || c.cap < binding.cap) binding = c;
  if (binding && binding.cap < score) {
    add(binding.key, binding.label, score - binding.cap, 'bad');
    score = binding.cap;
  }
  score = Math.round(score);
  const coverage = applicable > 0 ? Math.round((known / applicable) * 100) / 100 : 0;
  const gated = caps.some((c) => c.cap <= 25);
  const band: SafetyBand = gated ? 'danger' : coverage < 0.5 ? 'unknown' : score >= 70 ? 'safe' : score >= 40 ? 'caution' : 'danger';
  const byImpact = (a: SafetyReason, b: SafetyReason) => b.impact - a.impact || a.key.localeCompare(b.key);
  const ranked = [...reasons.values()]
    .map((r) => ({ reason: { ...r, impact: round1(r.impact) }, raw: r.impact }))
    .filter((r) => r.reason.impact > 0)
    .sort((a, b) => byImpact(a.reason, b.reason));
  if (ranked.length <= MAX_REASONS) return { score, band, coverage, reasons: ranked.map((r) => r.reason) };
  // The smallest fold into one 'other' reason, so the list still explains the whole gap to 100.
  const rest = ranked.slice(MAX_REASONS - 1);
  const other: SafetyReason = {
    key: 'other',
    label: `${rest.length} more checks`,
    impact: round1(rest.reduce((a, r) => a + r.raw, 0)),
    level: rest.some((r) => r.reason.level === 'bad') ? 'bad' : 'warn',
  };
  return { score, band, coverage, reasons: [...ranked.slice(0, MAX_REASONS - 1).map((r) => r.reason), other].sort(byImpact) };
}

export { devGroupBalance };
