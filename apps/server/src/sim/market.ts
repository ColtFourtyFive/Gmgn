// The living market. MarketSim owns every simulated participant and drives
// the world each engine tick:
//   - launches tokens (Poisson per chain) with hidden fates and launch cohorts
//   - steps each active token: fair-value path + momentum -> hype -> order flow
//   - runs scheduled agent actions (snipes, informed exits, KOL calls, migrations)
//   - plays fate scripts (rugs, coordinated dumps, slow dev sells)
//   - ambient upkeep: native prices, narrative rotation, watchers, wallet funding,
//     address-poisoning dust sprays
//   - housekeeping: dormancy, pruning, CTOs, boosts, rare revivals
// All randomness comes from world.rng and all time from world.now, so a seed
// reproduces the same market.

import { CHAINS, CHAIN_IDS, type ChainId, type Trade } from '@trenchscope/shared';
import type { AppContext, MarketSource } from '../context';
import { newCongestionModel, stepCongestion, type CongestionModel } from './congestion';
import type { TokenState, WalletState, World } from './world';
import { NARRATIVES, ctoSocials } from './names';
import { addBump, evalPath, hasUpside, isBadFate, isGoodFate, planCrash, planMigrated, planRevival, simOf, type TokenSim } from './behaviors/fate';
import { Launcher } from './behaviors/launch';
import { Poisoner } from './behaviors/phishing';
import { CHAIN_SCALE, Roster, memOf, type Role } from './behaviors/roster';
import { Scheduler, type Action, type SchedulerState } from './behaviors/scheduler';
import { CHECKED_ROLES, Desk, buySizeUsd, checkIntervalMs, informedExit, retailSellFraction } from './behaviors/trader';

const SEC = 1000;
const MIN = 60 * SEC;

const MAX_TOKENS_PER_CHAIN = 2500;
const DORMANT_AFTER_MS = 30 * MIN;
/** A crew wallet that never traded is swept once unused this long (its launch buy comes within a minute). */
const INERT_CREW_IDLE_MS = 60 * MIN;
/** A fresh (newcomer) wallet holding nothing live is swept after a day without trading. */
const INERT_FRESH_IDLE_MS = 24 * 60 * MIN;
/** Tokens below this activity are stepped every COLD_STEP_MS instead of every tick. */
const COLD_HYPE = 0.03;
/** Below this activity (trades/s) nobody is watching any more: the token goes quiet. */
const DEAD_ACTIVITY = 0.004;
const COLD_STEP_MS = 5 * SEC;
/** Longest stretch one token step covers (a snapshot restored hours later must not replay the gap in one burst). */
const MAX_STEP_MS = 10 * SEC;
const DORMANT_TRADES_KEPT = 200;
const SANDWICH_MIN_USD = 2500;
/** KOL calls per token are capped: a handful of shills, not a stampede of them. */
const MAX_CALLS = 4;
/**
 * Informed holders don't all hit thin liquidity at once: their combined exits per
 * token are held to about this share of the token's liquidity per minute.
 */
const EXIT_BUDGET = 0.04;
/** Address-poisoning campaigns per minute on a sol-scale chain (each dusts 3-12 wallets). */
const PHISH_CAMPAIGNS_PER_MIN = 0.6;

type Stage = 'early' | 'curve' | 'migrated';

const BUYER_ROLES: Role[] = ['retail', 'fresh', 'bot', 'sniper', 'smart', 'kol', 'whale'];
const SMART_IDX = 4;
const WHALE_IDX = 6;
/** Who shows up to buy, by token stage (BUYER_ROLES order). */
const BUYER_MIX: Record<Stage, number[]> = {
  early: [0.4, 0.08, 0.3, 0.1, 0.05, 0.03, 0],
  curve: [0.55, 0.08, 0.22, 0.03, 0.07, 0.05, 0],
  migrated: [0.5, 0.05, 0.15, 0.02, 0.08, 0.05, 0.1],
};

interface ChainState {
  /** Slow launch-rate cycle (+-20%). */
  cyclePhase: number;
  cyclePeriodMs: number;
  /** Narrative log-heat (NARRATIVES order), mean-reverting: drives the meta rotation. */
  heat: number[];
  /** Network congestion model (its level is published on world.chains). */
  congestion: CongestionModel;
}

export interface ChainSimStats {
  launches: number;
  migrations: number;
  rugs: number;
  dumps: number;
  ctos: number;
  boosts: number;
  revivals: number;
  pruned: number;
  trades: number;
}

interface MarketSnapshot {
  version: 1;
  scheduler: SchedulerState;
  chains: Record<ChainId, ChainState>;
  stats: Record<ChainId, ChainSimStats>;
}

export interface MarketOptions {
  /** Token cap per chain: beyond it the oldest dormant tokens no human launched or traded are deleted. */
  maxTokensPerChain?: number;
}

function emptyStats(): ChainSimStats {
  return { launches: 0, migrations: 0, rugs: 0, dumps: 0, ctos: 0, boosts: 0, revivals: 0, pruned: 0, trades: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function tradable(t: TokenState): boolean {
  return t.status !== 'migrating';
}

export class MarketSim implements MarketSource {
  readonly mode = 'demo' as const;
  private readonly world: World;
  private readonly roster: Roster;
  private readonly desk: Desk;
  private readonly scheduler = new Scheduler();
  private readonly launcher: Launcher;
  private readonly poisoner: Poisoner;
  /** Non-dormant tokens per chain (runtime index, rebuilt on restore). */
  private active = {} as Record<ChainId, TokenState[]>;
  private chains = {} as Record<ChainId, ChainState>;
  private readonly maxTokensPerChain: number;
  /** Counters since boot (persisted), used by diagnostics and the sim report. */
  stats = {} as Record<ChainId, ChainSimStats>;

  constructor(
    private readonly ctx: AppContext,
    opts: MarketOptions = {},
  ) {
    this.world = ctx.world;
    this.maxTokensPerChain = opts.maxTokensPerChain ?? MAX_TOKENS_PER_CHAIN;
    this.roster = new Roster(this.world);
    this.desk = new Desk(this.world);
    this.launcher = new Launcher(this.world, this.roster, this.desk, this.scheduler, {
      narrativeWeights: (chain) => this.chains[chain].heat.map(Math.exp),
      hotToken: (chain) => this.hottest(chain),
    });
    this.poisoner = new Poisoner(this.world, this.roster);
    CHAIN_IDS.forEach((c, i) => {
      this.active[c] = [];
      this.chains[c] = { cyclePhase: i * 1.7, cyclePeriodMs: (50 + 10 * i) * MIN, heat: NARRATIVES.map(() => 0), congestion: newCongestionModel(0) };
      this.stats[c] = emptyStats();
    });
  }

  install(): void {
    const { world, engine } = this.ctx;
    world.on('trade', this.onTrade);
    world.on('curveCompleted', (t) => this.scheduler.push(world.now + world.rng.float(2, 10) * SEC, 'migrate', t.address));
    engine.addTicker('market', (dt) => this.tick(dt), { everyMs: 0, duringWarmup: true });
    engine.addTicker('market-ambient', (dt) => this.ambient(dt), { everyMs: 5 * SEC, duringWarmup: true });
    engine.addTicker('market-housekeeping', () => this.housekeeping(), { everyMs: 30 * SEC, duringWarmup: true });
  }

  /** Fresh start: seed the agent population, then fast-forward WARMUP_MINUTES of history. */
  bootstrap(): void {
    this.seedPopulation();
    const minutes = this.ctx.config.warmupMinutes;
    if (minutes > 0) this.ctx.engine.warmup(minutes * 60000);
  }

  /** The simulator runs on engine ticks: nothing to connect. */
  start(): void {}

  async stop(): Promise<void> {}

  liveStatus(): null {
    return null;
  }

  seedPopulation(): void {
    const rng = this.world.rng;
    this.roster.seed();
    for (const c of CHAIN_IDS) {
      this.chains[c] = {
        cyclePhase: rng.float(0, 2 * Math.PI),
        cyclePeriodMs: rng.float(40, 90) * MIN,
        heat: NARRATIVES.map(() => rng.normal(0, 0.6)),
        congestion: newCongestionModel(this.stats[c].trades),
      };
    }
  }

  serialize(): MarketSnapshot {
    return { version: 1, scheduler: this.scheduler.serialize(), chains: this.chains, stats: this.stats };
  }

  restore(data: unknown): void {
    const snap = data as MarketSnapshot | null;
    if (snap?.version === 1) {
      this.scheduler.restore(snap.scheduler);
      this.chains = snap.chains;
      this.stats = snap.stats;
      for (const c of CHAIN_IDS) this.chains[c].congestion ??= newCongestionModel(this.stats[c].trades);
    }
    // snapshots from before pruned tokens took their positions with them
    this.world.dropOrphanPositions();
    this.roster.rebuild();
    // a world saved before the market simulator existed has no agents yet
    if (this.roster.list(CHAIN_IDS[0], 'funder').length === 0) this.seedPopulation();
    for (const c of CHAIN_IDS) {
      this.active[c] = [];
      for (const addr of this.world.tokensByChain[c]) {
        const t = this.world.tokens.get(addr);
        if (t && !t.dormant) this.active[c].push(t);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main tick
  // ---------------------------------------------------------------------------

  private tick(dtMs: number): void {
    const now = this.world.now;
    for (let a = this.scheduler.popDue(now); a; a = this.scheduler.popDue(now)) this.runAction(a, now);
    for (const chain of CHAIN_IDS) {
      const c = this.chains[chain];
      // a launch rush (see sim/congestion.ts) brings a wave of new launches with it
      const rushBoost = 1 + 2 * c.congestion.rush;
      const rate = rushBoost * CHAINS[chain].launchesPerMinute * (1 + 0.2 * Math.sin((2 * Math.PI * (now - this.world.startedAt)) / c.cyclePeriodMs + c.cyclePhase));
      const n = this.world.rng.poisson((rate * dtMs) / MIN);
      for (let i = 0; i < n; i++) this.launch(chain);
      const list = this.active[chain];
      for (let i = 0; i < list.length; i++) this.stepToken(list[i], now);
    }
  }

  private launch(chain: ChainId): void {
    const t = this.launcher.launch(chain);
    this.active[chain].push(t);
    this.stats[chain].launches++;
    // bundles on tokens without a scripted dump take profit on their own
    if (!isBadFate(t.fate)) for (const addr of t.bundlers) this.watch(this.world.wallets.get(addr)!, 'crew', t);
  }

  /**
   * Trade a token launched outside the simulator (a user's launch, after its
   * creation-block buys) like any other launch: see Launcher.adopt.
   */
  adopt(t: TokenState): void {
    this.launcher.adopt(t);
    this.active[t.chain].push(t);
    this.stats[t.chain].launches++;
  }

  /** Advance one token: fair value, momentum and hype, then Poisson order flow. */
  private stepToken(t: TokenState, now: number): void {
    const s = simOf(t);
    if (s.next > now) return;
    const dt = Math.min(now - s.last, MAX_STEP_MS) / SEC;
    if (dt <= 0) return;
    s.last = now;
    const { world } = this;
    const rng = world.rng;
    if (!tradable(t)) return;
    const lnMcap = Math.log(world.marketCapUsd(t));
    // a rug fires as soon as its inflow target is hit (honeypots only ever go up until then)
    if (now >= s.eventAt || (s.eventKind === 'rug' && lnMcap >= s.triggerLn)) this.fateEvent(t, s, now, lnMcap);

    const p = evalPath(s, now);
    const target = p.ln + s.noise;
    const act = p.act;
    s.noise += -s.noise * Math.min(1, dt / 120) + s.vol * Math.sqrt(dt) * rng.normal();
    s.emaFast += (lnMcap - s.emaFast) * (1 - Math.exp(-dt / 20));
    s.emaSlow += (lnMcap - s.emaSlow) * (1 - Math.exp(-dt / 180));
    const momentum = s.emaFast - s.emaSlow;
    if (rng.chance(dt * 0.0008)) {
      // news / whale shock
      addBump(s, rng.float(0.3, 1.2) * act);
      s.noise += rng.normal(0.1, 0.15);
    }
    s.bump *= Math.exp(-dt / 240);
    const base = act + s.bump;
    // attention follows momentum, and traders keep showing up while the token trades far from its value
    const gapNow = target - lnMcap;
    const discovery = gapNow > 0 ? 2 * clamp(gapNow - 0.2, 0, 1) : clamp(-gapNow - 0.2, 0, 1);
    const want = base < DEAD_ACTIVITY ? 0 : base * (1 + clamp(2 * momentum, -0.5, 1)) * (1 + discovery);
    t.hype += (want - t.hype) * (1 - Math.exp(-dt / 30));

    const n = rng.poisson(t.hype * dt);
    if (n > 0) {
      const stage: Stage = t.status === 'migrated' ? 'migrated' : now - t.createdAt < 90 * SEC ? 'early' : 'curve';
      // a buy can complete the curve mid-burst; trading pauses until migration
      for (let i = 0; i < n && tradable(t); i++) {
        const ln = Math.log(world.marketCapUsd(t));
        if (s.eventKind === 'rug' && ln >= s.triggerLn) {
          this.rug(t, s, now);
          break;
        }
        const gap = target - ln;
        // the crowd leans toward value, but chases green candles and panics on red ones
        const pBuy = clamp(0.5 + 0.38 * Math.tanh(1.6 * gap) + 0.18 * Math.tanh(4 * momentum), 0.05, 0.95);
        if (rng.next() < pBuy) this.flowBuy(t, s, stage, gap, momentum, now);
        else this.flowSell(t, s);
      }
    }
    s.next = t.hype < COLD_HYPE ? now + COLD_STEP_MS : 0;
  }

  // ---------------------------------------------------------------------------
  // Order flow
  // ---------------------------------------------------------------------------

  private pickBuyerRole(stage: Stage, t: TokenState, gap: number, momentum: number): Role {
    const mix = BUYER_MIX[stage];
    const smartMul = isGoodFate(t.fate) ? 2.5 : 0.5;
    // whales size into momentum, but only while the token is clearly cheap
    const whaleMul = gap > 0.15 ? 1 + 3 * Math.max(0, momentum) : 0;
    let total = 0;
    for (let i = 0; i < mix.length; i++) total += mix[i] * (i === SMART_IDX ? smartMul : i === WHALE_IDX ? whaleMul : 1);
    let r = this.world.rng.next() * total;
    for (let i = 0; i < mix.length; i++) {
      r -= mix[i] * (i === SMART_IDX ? smartMul : i === WHALE_IDX ? whaleMul : 1);
      if (r <= 0) return BUYER_ROLES[i];
    }
    return 'retail';
  }

  /**
   * The informed edge: smart money mostly buys tokens whose hidden plan still has
   * upside (and not above value); whales get a weaker version of the same read.
   */
  private informedWants(role: Role, w: WalletState, t: TokenState, s: TokenSim, gap: number, now: number): boolean {
    const rng = this.world.rng;
    const upside = hasUpside(t.fate, s, now + 5 * MIN);
    if (role === 'smart') return upside ? gap > -0.05 && rng.chance(0.9) : rng.chance((1 - w.skill) * 0.2);
    if (role === 'whale') return upside || !rng.chance(w.skill * 0.6);
    return true;
  }

  /** Skilled wallets read the contract before aping. */
  private avoidsContract(w: WalletState, t: TokenState): boolean {
    return (t.isHoneypot === true || t.sellTax > 0.05 || t.renouncedMint === false) && this.world.rng.chance(w.skill);
  }

  private flowBuy(t: TokenState, s: TokenSim, stage: Stage, gap: number, momentum: number, now: number): void {
    // a rugged honeypot is common knowledge: nobody buys it any more
    if (t.isHoneypot && s.ruggedAt) return;
    const { world, roster } = this;
    const rng = world.rng;
    let role = this.pickBuyerRole(stage, t, gap, momentum);
    let w = roster.pick(t.chain, role);
    if (w && (role === 'smart' || role === 'sniper' || role === 'whale') && (this.avoidsContract(w, t) || !this.informedWants(role, w, t, s, gap, now))) {
      role = 'retail';
      w = roster.pick(t.chain, role);
    }
    if (!w) return;
    let usd = buySizeUsd(rng, role, w, world.nativeUsd(t.chain));
    if (role === 'retail' || role === 'fresh') {
      // bigger, deeper tokens attract bigger tickets; FOMO chases green candles
      usd *= clamp(Math.sqrt(world.liquidityUsd(t) / 40_000), 1, 8) * (1 + clamp(2 * momentum, 0, 1.5));
    }
    const mev = t.status === 'migrated' && usd >= SANDWICH_MIN_USD && rng.chance(0.12) ? roster.pick(t.chain, 'sandwich') : undefined;
    if (mev) this.desk.buy(mev, t, usd * rng.float(0.5, 1.5));
    const r = this.desk.buy(w, t, usd);
    if (mev) this.desk.dump(mev, t, 1);
    if (!r) return;
    if (CHECKED_ROLES.has(role)) this.watch(w, role, t);
    if (role === 'kol') this.maybeCall(w, t, 0.15);
  }

  /** Anonymous sell flow comes from sampled retail holders. */
  private flowSell(t: TokenState, s: TokenSim): void {
    if (t.isHoneypot) return;
    const list = s.holderList;
    if (list.length === 0) return;
    const { world } = this;
    const rng = world.rng;
    for (let tries = 0; tries < 4; tries++) {
      const w = world.wallets.get(list[Math.floor(rng.next() * list.length)]);
      if (!w) continue;
      const role = memOf(w).role;
      if (role !== 'retail' && role !== 'fresh') continue;
      const pos = w.positions.get(t.address);
      if (!pos || pos.balance <= 0) continue;
      const mult = pos.costBasisUsd > 0 ? (world.priceUsd(t) * pos.balance) / pos.costBasisUsd : 1;
      this.desk.sell(w, t, retailSellFraction(rng, mult));
      return;
    }
  }

  /** Keep `holderList` in sync with token.holders for every trade (agents and humans). */
  private onTrade = (trade: Trade, t: TokenState, w: WalletState): void => {
    const s = simOf(t);
    if (!s.holderIdx) return;
    const holding = t.holders.has(w.address);
    const idx = s.holderIdx.get(w.address);
    if (holding && idx === undefined) {
      s.holderIdx.set(w.address, s.holderList.length);
      s.holderList.push(w.address);
    } else if (!holding && idx !== undefined) {
      const last = s.holderList.pop()!;
      if (last !== w.address) {
        s.holderList[idx] = last;
        s.holderIdx.set(last, idx);
      }
      s.holderIdx.delete(w.address);
    }
    this.stats[t.chain].trades++;
    if (t.dormant) this.wake(t);
    if (trade.side === 'buy' && w.positions.get(t.address)?.buys === 1) {
      // a new informed / followed buyer attracts attention
      const role = memOf(w).role;
      if (role === 'kol') addBump(s, 0.01);
      else if (role === 'smart' || role === 'whale') addBump(s, 0.005);
    }
  };

  // ---------------------------------------------------------------------------
  // Scheduled actions
  // ---------------------------------------------------------------------------

  private watch(w: WalletState, role: Role, t: TokenState): void {
    const m = memOf(w);
    const watching = (m.watching ??= new Set());
    if (watching.has(t.address)) return;
    watching.add(t.address);
    this.scheduler.push(this.world.now + checkIntervalMs(this.world.rng, role), 'check', t.address, w.address, this.world.priceUsd(t));
  }

  private maybeCall(kol: WalletState, t: TokenState, p: number): void {
    const rng = this.world.rng;
    const { callers } = simOf(t);
    if (callers.length < MAX_CALLS && !callers.includes(kol.address) && rng.chance(p)) {
      this.scheduler.push(this.world.now + rng.float(10, 90) * SEC, 'kolCall', t.address, kol.address);
    }
  }

  private runAction(a: Action, now: number): void {
    const { world, roster, desk } = this;
    const rng = world.rng;
    const t = world.tokens.get(a.token);
    const w = a.wallet ? world.wallets.get(a.wallet) : undefined;
    if (!t || t.dormant) {
      if (a.kind === 'check' && w) memOf(w).watching?.delete(a.token);
      return;
    }
    // nothing trades while the curve migrates: retry shortly
    if (t.status === 'migrating' && a.kind !== 'migrate') {
      this.scheduler.push(now + 3 * SEC, a.kind, a.token, a.wallet, a.x);
      return;
    }
    const nu = world.nativeUsd(t.chain);
    // block-timed buys keep the token's trade history in order
    const at = Math.max(a.at, t.lastTradeAt);
    switch (a.kind) {
      case 'migrate':
        this.migrate(t, now);
        break;
      case 'snipe':
        if (w && t.status === 'curve' && !this.avoidsContract(w, t) && desk.buy(w, t, buySizeUsd(rng, 'sniper', w, nu), at)) {
          t.snipers.add(w.address);
          this.watch(w, 'sniper', t);
        }
        break;
      case 'insider':
        if (w && desk.buy(w, t, a.x, at) && !isBadFate(t.fate)) this.watch(w, 'crew', t);
        break;
      case 'smartEntry': {
        // the sharpest of a few candidates finds runners; the weakest walks into traps
        const good = isGoodFate(t.fate);
        let pick: WalletState | undefined;
        for (let i = 0; i < 3; i++) {
          const c = roster.pick(t.chain, 'smart');
          if (c && (!pick || (good ? c.skill > pick.skill : c.skill < pick.skill))) pick = c;
        }
        if (!pick || (pick.positions.get(t.address)?.balance ?? 0) > 0 || this.avoidsContract(pick, t)) break;
        if (desk.buy(pick, t, buySizeUsd(rng, 'smart', pick, nu))) this.watch(pick, 'smart', t);
        break;
      }
      case 'kolEntry': {
        const kol = roster.pick(t.chain, 'kol');
        if (kol && desk.buy(kol, t, buySizeUsd(rng, 'kol', kol, nu))) {
          this.watch(kol, 'kol', t);
          this.maybeCall(kol, t, isBadFate(t.fate) ? 0.8 : 0.6);
        }
        break;
      }
      case 'check':
        if (w) this.check(a, t, w, now);
        break;
      case 'kolCall':
        if (w) this.kolCall(t, w, now);
        break;
      case 'kolDump':
        if (w) desk.sell(w, t, rng.float(0.6, 1));
        break;
      case 'boost':
        this.boost(t, now);
        break;
    }
  }

  /** Informed holder re-evaluates its exit rules, then schedules its next look. */
  private check(a: Action, t: TokenState, w: WalletState, now: number): void {
    const m = memOf(w);
    const pos = w.positions.get(t.address);
    if (!pos || pos.balance <= 0) {
      m.watching?.delete(t.address);
      return;
    }
    const priceUsd = this.world.priceUsd(t);
    const s = simOf(t);
    const frac = informedExit(this.world.rng, m.role, w, pos, {
      now,
      priceUsd,
      peakUsd: a.x,
      // sharper wallets read the top earlier, so informed exits are staggered
      danger: now >= s.dangerAt - (w.skill - 0.5) * 20 * MIN,
      upside: hasUpside(t.fate, s, now),
      hype: t.hype,
    });
    if (frac > 0 && !this.exitRoom(t, s, now)) {
      // the exit door is crowded: wait for liquidity to come back
      this.scheduler.push(now + this.world.rng.float(5, 15) * SEC, 'check', t.address, w.address, Math.max(a.x, priceUsd));
      return;
    }
    const sale = frac > 0 ? this.desk.sell(w, t, frac) : null;
    if (sale) s.exitFlow += sale.usdAmount;
    // a rejected sell (honeypot, or a bag worth less than the network fee) is stuck for good
    const stuck = frac > 0 && !sale;
    if (pos.balance > 0 && !stuck) {
      this.scheduler.push(now + checkIntervalMs(this.world.rng, m.role), 'check', t.address, w.address, Math.max(a.x, priceUsd));
    } else {
      m.watching?.delete(t.address);
    }
  }

  /** Whether informed exits on this token still fit in the per-minute budget. */
  private exitRoom(t: TokenState, s: TokenSim, now: number): boolean {
    s.exitFlow *= Math.exp(-(now - s.exitFlowAt) / MIN);
    s.exitFlowAt = now;
    return s.exitFlow < this.world.liquidityUsd(t) * EXIT_BUDGET;
  }

  private kolCall(t: TokenState, kol: WalletState, now: number): void {
    const s = simOf(t);
    if (s.callers.length >= MAX_CALLS || s.callers.includes(kol.address)) return;
    s.callers.push(kol.address);
    this.world.emit('kolCall', t, kol);
    // reach scales with followers: 5k -> small bump, 800k -> a stampede
    const reach = Math.log10(Math.max(5000, kol.xFollowers ?? 5000) / 5000);
    addBump(s, 0.05 + 0.12 * reach);
    s.noise += 0.05 + 0.12 * reach;
    if (memOf(kol).dumper) this.scheduler.push(now + this.world.rng.float(1, 6) * MIN, 'kolDump', t.address, kol.address);
  }

  // ---------------------------------------------------------------------------
  // Fate scripts
  // ---------------------------------------------------------------------------

  private fateEvent(t: TokenState, s: TokenSim, now: number, lnMcap: number): void {
    const rng = this.world.rng;
    switch (s.eventKind) {
      case 'rug':
        // wait for retail inflow to arrive (or give up waiting at the deadline)
        if (lnMcap >= s.triggerLn || now >= s.deadline) this.rug(t, s, now);
        return;
      case 'dump':
        this.dump(t, s, now);
        return;
      case 'devSell': {
        // slow rug: the dev bleeds the bag out in chunks, the bundle trails it, and the rest goes at the end
        this.devSell(t, rng.float(0.08, 0.25));
        for (const addr of t.bundlers) if (rng.chance(0.5)) this.sellAs(addr, t, rng.float(0.15, 0.4));
        const left = this.world.wallets.get(t.creator)?.positions.get(t.address)?.balance ?? 0;
        if (left > 0 && now < s.deadline) s.eventAt = now + rng.float(30, 150) * SEC;
        else this.rug(t, s, now);
        return;
      }
      case 'devExit':
        this.devSell(t, 1);
        this.clearEvent(s);
        return;
      case 'devTrim':
        this.devSell(t, rng.float(0.2, 0.5));
        this.clearEvent(s);
        return;
    }
  }

  private clearEvent(s: TokenSim): void {
    s.eventKind = 'none';
    s.eventAt = Infinity;
  }

  private devSell(t: TokenState, fraction: number): void {
    this.sellAs(t.creator, t, fraction);
  }

  /**
   * Scripted sell by a dev-side wallet (no impact splitting: these are the crashes).
   * Paper-trading wallets (a user's own launch and its bundles) never sell on a script.
   */
  private sellAs(addr: string, t: TokenState, fraction: number): void {
    const w = this.world.wallets.get(addr);
    if (w && w.accountId === null) this.desk.dump(w, t, fraction);
  }

  /** Dev, dev team, bundlers and insiders dump everything; proceeds flow back to the dev. */
  private rug(t: TokenState, s: TokenSim, now: number): void {
    const { world } = this;
    const dev = world.wallets.get(t.creator);
    const crew = new Set([...t.devTeam, ...t.bundlers, ...t.insiders]);
    this.devSell(t, 1);
    for (const addr of crew) this.sellAs(addr, t, 1);
    if (dev) {
      for (const addr of crew) {
        const w = world.wallets.get(addr);
        if (w && w.native > 0) world.transferNative(w, dev, w.native * 0.97);
      }
      this.cashOut(dev);
    }
    s.ruggedAt = now;
    this.stats[t.chain].rugs++;
    planCrash(s, world.rng, now, Math.log(world.marketCapUsd(t)));
  }

  /** Coordinated insider dump after a pump. */
  private dump(t: TokenState, s: TokenSim, now: number): void {
    const rng = this.world.rng;
    for (const addr of [...t.insiders, ...t.bundlers, ...t.devTeam]) this.sellAs(addr, t, rng.float(0.7, 1));
    this.devSell(t, rng.float(0.7, 1));
    s.dumpedAt = now;
    this.stats[t.chain].dumps++;
    planCrash(s, rng, now, Math.log(this.world.marketCapUsd(t)));
  }

  /** Profitable devs move most of their native up the funding chain (exchange or their main wallet). */
  private cashOut(dev: WalletState): void {
    const { world } = this;
    const bankNative = memOf(dev).bank / world.nativeUsd(dev.chain);
    if (dev.native <= bankNative * 2) return;
    const parent = dev.fundedBy ? world.wallets.get(dev.fundedBy) : undefined;
    world.transferNative(dev, parent ?? this.roster.funder(dev.chain), dev.native - bankNative);
  }

  private migrate(t: TokenState, now: number): void {
    const { world } = this;
    const rng = world.rng;
    world.migrate(t);
    if (t.status !== 'migrated') return;
    this.stats[t.chain].migrations++;
    const s = simOf(t);
    planMigrated(s, rng, t.fate, now, Math.log(world.marketCapUsd(t)));
    addBump(s, 0.4);
    // paid screener boosts: most runners buy one, some ordinary graduations too
    if (rng.chance(s.outcome === 'fizzle' ? 0.1 : 0.45)) this.scheduler.push(now + rng.float(5, 40) * MIN, 'boost', t.address);
    if (s.outcome === 'fizzle') return;
    // the dev team ships a site; a user's launch keeps the links its launcher set
    if (!t.socials.website && !this.launchedByUser(t) && rng.chance(0.5)) {
      t.socials = { ...t.socials, website: `https://${t.symbol.toLowerCase()}${rng.pick(['', 'coin', 'hq'])}.${rng.pick(['fun', 'xyz', 'meme'])}` };
      t.version++;
      world.emit('tokenFlag', t, 'socials');
    }
  }

  private boost(t: TokenState, now: number): void {
    const s = simOf(t);
    t.boosted = true;
    t.version++;
    s.boostUntil = now + this.world.rng.float(30, 120) * MIN;
    addBump(s, 0.4);
    s.noise += 0.1;
    this.stats[t.chain].boosts++;
    this.world.emit('tokenFlag', t, 'boost');
  }

  /** Community takeover: the dev is gone but holders adopt the token. */
  private cto(t: TokenState, now: number): void {
    const { world } = this;
    t.cto = true;
    t.socials = ctoSocials(world.rng, t);
    t.xFollowers = Math.round(world.rng.lognormal(800, 1));
    t.version++;
    this.stats[t.chain].ctos++;
    world.emit('tokenFlag', t, 'cto');
    world.emit('tokenFlag', t, 'socials');
    planRevival(simOf(t), world.rng, now, Math.log(world.marketCapUsd(t)));
  }

  private devSoldAll(t: TokenState): boolean {
    const pos = this.world.wallets.get(t.creator)?.positions.get(t.address);
    return Boolean(pos && pos.soldTokens > 0 && pos.balance <= 0);
  }

  // ---------------------------------------------------------------------------
  // Ambient upkeep (every 5s)
  // ---------------------------------------------------------------------------

  private ambient(dtMs: number): void {
    const { world } = this;
    const rng = world.rng;
    const dt = dtMs / SEC;
    // native assets: gentle mean-reverting walk around the starting price (Base shares ETH)
    for (const chain of ['sol', 'bsc', 'eth'] as const) {
      const start = Math.log(CHAINS[chain].nativeUsdStart);
      const ln = Math.log(world.nativeUsd(chain));
      world.setNativeUsd(chain, Math.exp(ln + ((start - ln) * dt) / (6 * 3600) + 1.5e-4 * Math.sqrt(dt) * rng.normal()));
    }
    world.setNativeUsd('base', world.nativeUsd('eth'));

    for (const chain of CHAIN_IDS) {
      const scale = CHAIN_SCALE[chain];
      world.chains[chain].congestion = stepCongestion(this.chains[chain].congestion, rng, dt, this.stats[chain].trades, this.ctx.engine.warming);
      const heat = this.chains[chain].heat;
      for (let i = 0; i < heat.length; i++) heat[i] += (-heat[i] * dt) / 2400 + 0.0173 * Math.sqrt(dt) * rng.normal();
      for (const t of this.active[chain]) {
        const watchers = Math.round((t.hype * 18 + t.holders.size * 0.015 + (t.boosted ? 6 : 0)) * Math.sqrt(scale) * rng.float(0.8, 1.2));
        if (watchers !== t.watchers) {
          t.watchers = watchers;
          t.version++;
        }
      }
      for (let i = rng.poisson((1.5 * scale * dt) / 60); i > 0; i--) this.roster.spawnFresh(chain);
      this.roster.maintain(chain, rng.poisson(10 * scale * (dt / 5)));
      this.poisoner.step(chain, dtMs, PHISH_CAMPAIGNS_PER_MIN * scale);
    }
  }

  // ---------------------------------------------------------------------------
  // Housekeeping (every 30s)
  // ---------------------------------------------------------------------------

  private housekeeping(): void {
    const { world } = this;
    const rng = world.rng;
    const now = world.now;
    world.pruneCounters();
    for (const chain of CHAIN_IDS) {
      const keep: TokenState[] = [];
      for (const t of this.active[chain]) {
        if (!world.tokens.has(t.address)) continue;
        const s = simOf(t);
        if (t.boosted && now > s.boostUntil) {
          t.boosted = false;
          t.version++;
        }
        // abandoned but still alive: occasionally the holders take it over
        if (!t.cto && t.hype > 0.01 && now - t.createdAt > 20 * MIN && t.holders.size >= 40 && this.devSoldAll(t) && rng.chance(0.03)) this.cto(t, now);
        if (t.status !== 'migrating' && now - t.lastTradeAt > DORMANT_AFTER_MS && t.hype < 0.05) this.sleep(t);
        else keep.push(t);
      }
      this.active[chain] = keep;
      this.prune(chain);
      if (rng.chance(0.04 * CHAIN_SCALE[chain])) this.reviveRandom(chain, now);
    }
  }

  /** Stop simulating a quiet token and drop its heavy history. */
  private sleep(t: TokenState): void {
    t.dormant = true;
    t.watchers = 0;
    if (t.trades.length > DORMANT_TRADES_KEPT) t.trades = t.trades.slice(-DORMANT_TRADES_KEPT);
    t.candles['1s'] = [];
    t.candles['15s'] = [];
    t.version++;
  }

  /** A trade on a dormant token (e.g. a human buying a dead coin) brings it back to life. */
  private wake(t: TokenState): void {
    const s = simOf(t);
    t.dormant = false;
    s.last = this.world.now;
    s.next = 0;
    addBump(s, 0.1);
    this.active[t.chain].push(t);
  }

  /** Rediscover a random dormant token from anywhere in the chain's history. */
  private reviveRandom(chain: ChainId, now: number): void {
    const { world } = this;
    const addrs = world.tokensByChain[chain];
    let t: TokenState | undefined;
    for (let i = 0; i < 4 && !t?.dormant && addrs.length; i++) t = world.tokens.get(addrs[Math.floor(world.rng.next() * addrs.length)]);
    if (!t?.dormant) return;
    this.wake(t);
    this.stats[chain].revivals++;
    if (!t.cto && this.devSoldAll(t) && world.rng.chance(0.5)) this.cto(t, now);
    else planRevival(simOf(t), world.rng, now, Math.log(world.marketCapUsd(t)));
  }

  /**
   * Keep at most maxTokensPerChain: drop the oldest dormant tokens no human ever
   * touched and no module pins (open orders, alerts) with the simulated wallets'
   * positions in them (folded into all-time totals), then sweep the single-use
   * wallets left with nothing in a live token.
   */
  private prune(chain: ChainId): void {
    const { world } = this;
    const addrs = world.tokensByChain[chain];
    if (addrs.length <= this.maxTokensPerChain) return;
    let excess = addrs.length - Math.floor(this.maxTokensPerChain * 0.96);
    const pinned = world.pinnedTokens();
    const deleted: TokenState[] = [];
    let write = 0;
    for (const addr of addrs) {
      const t = world.tokens.get(addr);
      if (!t) continue;
      if (excess > 0 && t.dormant && !pinned.has(addr) && !this.touchedByUser(t)) {
        world.tokens.delete(addr);
        deleted.push(t);
        excess--;
        this.stats[chain].pruned++;
        continue;
      }
      addrs[write++] = addr;
    }
    addrs.length = write;
    world.dropPositions(deleted);
    this.sweepInertWallets(chain);
  }

  /**
   * Wallets left with nothing in a live token are dead weight: crew (bundler /
   * insider) wallets (that traded, or sat unused for INERT_CREW_IDLE_MS),
   * single-use launcher (freshDev) wallets whose launches were all pruned, and
   * newcomer (fresh) wallets idle for INERT_FRESH_IDLE_MS (the stream of new ones
   * never stops). Wallets a user follows are kept.
   */
  private sweepInertWallets(chain: ChainId): void {
    const { world } = this;
    const now = world.now;
    const dead = new Set<string>();
    const idle = (w: WalletState, ms: number) => now - w.lastActiveAt >= ms;
    for (const arch of ['bundler', 'insider', 'dev', 'fresh'] as const) {
      for (const addr of world.walletsOf(chain, arch)) {
        const w = world.wallets.get(addr);
        if (!w || w.accountId) continue;
        const inert =
          arch === 'dev'
            ? memOf(w).role === 'freshDev' && !w.createdTokens.some((a) => world.tokens.has(a))
            : arch === 'fresh'
              ? memOf(w).role === 'fresh' && idle(w, INERT_FRESH_IDLE_MS)
              : !!w.pruned || idle(w, INERT_CREW_IDLE_MS);
        if (!inert) continue;
        let alive = false;
        for (const token of w.positions.keys()) {
          if (world.tokens.has(token)) {
            alive = true;
            break;
          }
        }
        // (no accounts service in sim-only contexts)
        if (!alive && !this.ctx.accounts?.followersOf(chain, addr).length) dead.add(addr);
      }
    }
    world.removeWallets(dead);
    this.roster.forget(dead);
  }

  private launchedByUser(t: TokenState): boolean {
    return this.world.wallets.get(t.creator)?.archetype === 'user';
  }

  /** Launched or traded by a paper-trading account. */
  private touchedByUser(t: TokenState): boolean {
    if (this.launchedByUser(t)) return true;
    for (const addr of t.traders) if (this.world.wallets.get(addr)?.archetype === 'user') return true;
    return false;
  }

  /** Hottest active token on the chain (copycat target). */
  private hottest(chain: ChainId): TokenState | undefined {
    let best: TokenState | undefined;
    for (const t of this.active[chain]) if (!best || t.hype > best.hype) best = t;
    return best;
  }
}
