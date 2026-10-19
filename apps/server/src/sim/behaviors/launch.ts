// Token launches: who deploys, the token's identity and hidden fate, contract
// security flags, and the launch-block cohorts (dev buy, same-block bundles,
// dev-funded insiders, first-block snipers, informed early entries).

import { CHAINS, cpIn, launchpadsFor, type ChainId, type Socials } from '@trenchscope/shared';
import type { TokenFate, TokenState, WalletState, World } from '../world';
import type { Rng } from '../rng';
import { NARRATIVES, copycatMeta, generateTokenMeta, makeSocials, narrativeByName } from '../names';
import { anchorLaunch, isBadFate, isGoodFate, pickFate, planLaunch, simOf, type TokenSim } from './fate';
import { memOf, type Roster } from './roster';
import type { Scheduler } from './scheduler';
import type { Desk } from './trader';

const SEC = 1000;
const MIN = 60 * SEC;

/** Trades per second a token sees at unit activity, per chain. */
export const CHAIN_ACTIVITY: Record<ChainId, number> = { sol: 0.65, bsc: 0.5, base: 0.45, eth: 0.8 };

const COPYCAT_FATES: TokenFate[] = ['dud', 'rug', 'pump_dump'];
const COPYCAT_WEIGHTS = [70, 20, 10];

interface SecurityRates {
  /** Honeypot probability for rug fates (everything else is never a honeypot). */
  honeypot: number;
  tax: number;
  closedSource: number;
  ownerKept: number;
}

const EVM_SECURITY: Record<Exclude<ChainId, 'sol'>, SecurityRates> = {
  bsc: { honeypot: 0.3, tax: 0.1, closedSource: 0.05, ownerKept: 0.1 },
  base: { honeypot: 0.12, tax: 0.05, closedSource: 0.02, ownerKept: 0.05 },
  eth: { honeypot: 0.12, tax: 0.06, closedSource: 0.02, ownerKept: 0.06 },
};

type SecurityFlags = Pick<TokenState, 'renouncedMint' | 'renouncedFreeze' | 'isOpenSource' | 'isRenounced' | 'isHoneypot' | 'buyTax' | 'sellTax'>;

export interface LaunchHooks {
  /** Relative launch weight of each narrative (NARRATIVES order) on the chain right now. */
  narrativeWeights(chain: ChainId): number[];
  /** Currently hottest token on the chain (copycat target). */
  hotToken(chain: ChainId): TokenState | undefined;
}

export class Launcher {
  constructor(
    private readonly world: World,
    private readonly roster: Roster,
    private readonly desk: Desk,
    private readonly scheduler: Scheduler,
    private readonly hooks: LaunchHooks,
  ) {}

  launch(chain: ChainId): TokenState {
    const { world, roster } = this;
    const rng = world.rng;
    const now = world.now;
    const pads = launchpadsFor(chain);
    const lp = rng.weighted(pads, pads.map((p) => p.weight));

    let dev: WalletState;
    let boss: WalletState;
    if (rng.chance(0.6)) dev = boss = roster.pickSerialDev(chain);
    else ({ dev, boss } = roster.spawnFreshDev(chain));

    const hot = rng.chance(0.08) ? this.hooks.hotToken(chain) : undefined;
    const fate = hot ? rng.weighted(COPYCAT_FATES, COPYCAT_WEIGHTS) : pickFate(rng, memOf(dev).rep ?? 0.5);
    const weights = this.hooks.narrativeWeights(chain);
    const narrative = (hot && narrativeByName(hot.narrative)) || rng.weighted(NARRATIVES, weights);
    const meta = hot ? copycatMeta(rng, hot) : generateTokenMeta(rng, narrative, CHAINS[chain].name);
    const good = isGoodFate(fate);
    const bad = isBadFate(fate);
    let donor: Socials | undefined;
    let density = good ? 0.9 : fate === 'dud' ? 0.45 : 0.6;
    if (fate === 'rug') {
      // ruggers ship no socials or paste someone else's
      density = rng.chance(0.4) ? 0 : 0.5;
      donor = density > 0 ? this.hooks.hotToken(chain)?.socials : undefined;
    }
    const profile = makeSocials(rng, meta, density, good ? 4000 : 600, donor);
    const security = this.security(chain, fate);

    // launch-block allocations (shares of supply)
    const devShare = bad ? rng.float(0.05, 0.2) : rng.chance(0.2) ? 0 : rng.float(0.003, 0.05);
    const bundled = bad ? rng.chance(0.85) : rng.chance(fate === 'dud' ? 0.12 : 0.05);
    const bundleShares = bundled ? splitShare(rng, rng.int(2, 8), bad ? rng.float(0.1, 0.4) : rng.float(0.04, 0.15)) : [];
    const insiderShares = Array.from({ length: bad ? rng.int(1, 6) : rng.chance(0.3) ? rng.int(1, 2) : 0 }, () => rng.float(0.005, 0.03));
    capShares(devShare, bundleShares, insiderShares, 0.55);

    const nu = world.nativeUsd(chain);
    const taxMult = 1 / (1 - security.buyTax);
    const costs = allocationCosts(lp.virtualNative, lp.virtualTokens, lp.feeRate, lp.totalSupply, [devShare, ...bundleShares, ...insiderShares]).map((c) => c * taxMult);
    const fee = CHAINS[chain].baseNetworkFee;
    roster.ensureNative(dev, (costs[0] + sum(costs.slice(1 + bundleShares.length)) * 1.3 + fee * 20) * nu + 20);

    const t = world.createToken({
      chain,
      launchpad: lp.id,
      creator: dev,
      symbol: meta.symbol,
      name: meta.name,
      description: meta.description,
      logoSeed: meta.logoSeed,
      logoGlyph: meta.logoGlyph,
      narrative: meta.narrative,
      socials: profile.socials,
      xFollowers: profile.xFollowers,
      fate,
      hype: 0,
      isCopycat: Boolean(hot),
      security,
    });

    const curve = t.curve!;
    const k = curve.virtualNative * curve.virtualTokens;
    const supplyUsd = t.totalSupply * nu;
    const heat = weights[NARRATIVES.indexOf(narrative)] ?? 1;
    const gradLn = Math.log(world.graduationMarketCapUsd(t));
    const sim: TokenSim = planLaunch(rng, fate, {
      now,
      launchLn: Math.log(world.marketCapUsd(t)),
      gradLn,
      lnAtProgress: (p) => {
        const vt = curve.virtualTokens - p * curve.initialRealTokens;
        return Math.log((k / (vt * vt)) * supplyUsd);
      },
      act: CHAIN_ACTIVITY[chain] * Math.min(2, Math.max(0.5, Math.sqrt(heat))),
    });
    t.sim = sim as unknown as Record<string, unknown>;
    t.hype = sim.path[2];

    if (costs[0] > 0) this.desk.buyTokens(dev, t, costs[0]);
    if (bundleShares.length) this.bundle(t, dev, boss, costs.slice(1, 1 + bundleShares.length));
    anchorLaunch(sim, rng, Math.log(world.marketCapUsd(t)), gradLn);
    this.insiders(t, dev, boss, costs.slice(1 + bundleShares.length));
    this.scheduleSnipers(t, dev, bundled);
    this.scheduleInformed(t, fate);
    return t;
  }

  /** Same-block bundle: crew wallets funded by the dev's side (or via an exchange) buy at creation. */
  private bundle(t: TokenState, dev: WalletState, boss: WalletState, costs: number[]): void {
    const rng = this.world.rng;
    const viaExchange = rng.chance(0.4);
    const fee = CHAINS[t.chain].baseNetworkFee;
    const wallets = this.crew(boss, 'bundlers', costs.length);
    // honeypot contracts whitelist the dev's bundle wallets so they can exit
    const whitelist = t.isHoneypot === true;
    wallets.forEach((w, i) => {
      const native = costs[i] * 1.02 + fee * 3;
      const from = viaExchange ? this.roster.funder(t.chain) : boss;
      if (from === boss) this.roster.ensureNative(boss, native * this.world.nativeUsd(t.chain) * 1.2);
      this.world.transferNative(from, w, native);
      t.bundlers.add(w.address);
      if (whitelist || (i === 0 && rng.chance(0.35))) t.devTeam.add(w.address);
      this.desk.buyTokens(w, t, costs[i]);
    });
  }

  /** Dev-funded wallets that accumulate within the first minute. */
  private insiders(t: TokenState, dev: WalletState, boss: WalletState, costs: number[]): void {
    if (!costs.length) return;
    const rng = this.world.rng;
    const nu = this.world.nativeUsd(t.chain);
    const fee = CHAINS[t.chain].baseNetworkFee;
    this.crew(boss, 'insiders', costs.length).forEach((w, i) => {
      const native = costs[i] * 1.3;
      this.world.transferNative(dev, w, native + fee * 3);
      t.insiders.add(w.address);
      this.scheduler.push(t.createdAt + rng.float(2, 60) * SEC, 'insider', t.address, w.address, native * nu);
    });
  }

  /** Crew wallets controlled by `boss`: mostly reused, sometimes new (and remembered). */
  private crew(boss: WalletState, kind: 'bundlers' | 'insiders', count: number): WalletState[] {
    const rng = this.world.rng;
    const m = memOf(boss);
    const pool = (m[kind] ??= []);
    const out: WalletState[] = [];
    for (let i = 0; i < count; i++) {
      let w: WalletState | undefined;
      if (pool.length > out.length && rng.chance(0.7)) {
        const cand = this.world.wallets.get(rng.pick(pool));
        if (cand && !out.includes(cand)) w = cand;
      }
      if (!w) {
        w = this.roster.create(boss.chain, kind === 'bundlers' ? 'bundler' : 'insider', { role: 'crew', bank: 0 }, { skill: 0.5 });
        if (pool.length < 16) pool.push(w.address);
      }
      out.push(w);
    }
    return out;
  }

  /** Snipers hit launches that "look good": socials, a dev with graduations, visible early volume. */
  private scheduleSnipers(t: TokenState, dev: WalletState, bundled: boolean): void {
    const rng = this.world.rng;
    let migrated = 0;
    let rugged = 0;
    for (const addr of dev.createdTokens.slice(-30)) {
      const prev = this.world.tokens.get(addr);
      if (!prev || prev === t) continue;
      if (prev.status === 'migrated') migrated++;
      if (simOf(prev).ruggedAt) rugged++;
    }
    const socials = Number(Boolean(t.socials.twitter)) + Number(Boolean(t.socials.telegram)) + Number(Boolean(t.socials.website));
    const score = Math.max(0.05, 0.25 + 0.15 * socials + (migrated > 0 ? 0.4 : 0) - Math.min(0.3, rugged * 0.05) + (bundled ? 0.25 : 0));
    const n = Math.min(10, rng.poisson(score * 3));
    const blockMs = CHAINS[t.chain].blockTimeMs;
    const chosen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const w = this.roster.pick(t.chain, 'sniper');
      if (!w || chosen.has(w.address)) continue;
      chosen.add(w.address);
      this.scheduler.push(t.createdAt + blockMs * rng.int(1, 3), 'snipe', t.address, w.address);
    }
  }

  /** Smart money and KOLs get early on tokens that will run (and sometimes on paid shills). */
  private scheduleInformed(t: TokenState, fate: TokenFate): void {
    const rng = this.world.rng;
    const good = isGoodFate(fate);
    const bad = isBadFate(fate);
    const smart = rng.poisson(fate === 'moon' ? 5 : good ? 2.5 : bad ? 0.25 : 0.1);
    for (let i = 0; i < smart; i++) this.scheduler.push(t.createdAt + rng.float(20 * SEC, 8 * MIN), 'smartEntry', t.address);
    const kols = rng.poisson(good ? 1 : bad ? 0.5 : 0.08);
    for (let i = 0; i < kols; i++) this.scheduler.push(t.createdAt + rng.float(1, 15) * MIN, 'kolEntry', t.address);
  }

  private security(chain: ChainId, fate: TokenFate): SecurityFlags {
    const rng = this.world.rng;
    const bad = isBadFate(fate);
    if (chain === 'sol') {
      const kept = rng.chance(fate === 'rug' ? 0.08 : 0.003);
      return { renouncedMint: !kept, renouncedFreeze: !(kept && rng.chance(0.6)), isOpenSource: null, isRenounced: null, isHoneypot: null, buyTax: 0, sellTax: 0 };
    }
    const r = EVM_SECURITY[chain];
    const taxed = rng.chance(r.tax * (bad ? 1.5 : 0.8));
    const buyTax = taxed ? rng.float(0.01, 0.05) : 0;
    return {
      renouncedMint: null,
      renouncedFreeze: null,
      isOpenSource: !rng.chance(r.closedSource * (bad ? 2 : 0.5)),
      isRenounced: !rng.chance(r.ownerKept * (bad ? 1.6 : 0.6)),
      isHoneypot: fate === 'rug' && rng.chance(r.honeypot),
      buyTax,
      sellTax: taxed ? rng.float(buyTax, 0.1) : 0,
    };
  }
}

/** Split a total share into `n` uneven parts. */
function splitShare(rng: Rng, n: number, total: number): number[] {
  const w = Array.from({ length: n }, () => rng.float(0.5, 1.5));
  const s = sum(w);
  return w.map((x) => (x / s) * total);
}

/** Scale bundle/insider allocations so the launch total stays below `max` of supply (the curve must not complete at launch). */
function capShares(dev: number, bundles: number[], insiders: number[], max: number): void {
  const others = sum(bundles) + sum(insiders);
  if (dev + others <= max) return;
  const f = (max - dev) / others;
  for (let i = 0; i < bundles.length; i++) bundles[i] *= f;
  for (let i = 0; i < insiders.length; i++) insiders[i] *= f;
}

/** Native cost of buying each share in sequence on a fresh curve. */
function allocationCosts(vNative: number, vTokens: number, feeRate: number, supply: number, shares: number[]): number[] {
  let vn = vNative;
  let vt = vTokens;
  return shares.map((share) => {
    if (share <= 0) return 0;
    const tokens = share * supply;
    const cost = cpIn(tokens, vn, vt, feeRate);
    vn += cost * (1 - feeRate);
    vt -= tokens;
    return cost;
  });
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
