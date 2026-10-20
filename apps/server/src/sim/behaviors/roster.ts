// Agent roster: who the simulated market participants are (role, bankroll,
// hidden traits), how they get funded, and fast per-chain role indexes for
// picking actors. Agent traits live in wallet.memory (AgentMemory) so they
// persist with world snapshots; the indexes are rebuilt on restore.

import { CHAIN_IDS, type ChainId } from '@trenchscope/shared';
import type { Archetype, WalletState, World } from '../world';
import { KOL_HANDLES, funderLabel } from '../names';

export type Role =
  | 'retail'
  | 'fresh'
  | 'bot'
  | 'sniper'
  | 'smart'
  | 'kol'
  | 'whale'
  | 'sandwich'
  | 'funder' //     exchange hot wallet: funds new wallets, receives cash-outs
  | 'serialDev' //  long-lived launcher with a hidden reputation
  | 'freshDev' //   single-use launcher wallet
  | 'crew'; //      bundler / insider wallet controlled by a dev

/** Per-agent scratch state (wallet.memory) owned by the market simulator. */
export interface AgentMemory {
  role: Role;
  /** Reference bankroll in USD: top-ups refill toward it, profits above it get cashed out. */
  bank: number;
  /** Devs: hidden reputation, 0 = serial rugger .. 1 = builder. */
  rep?: number;
  /** Devs: reusable bundler / insider wallets they control (sock puppets use their boss's). */
  bundlers?: string[];
  insiders?: string[];
  /** KOLs: sells into their own calls. */
  dumper?: boolean;
  /** Tokens with a pending informed-exit check for this wallet. */
  watching?: Set<string>;
}

export function memOf(w: WalletState): AgentMemory {
  return w.memory as unknown as AgentMemory;
}

/** Relative activity of each chain (population counts, launch side effects). */
export const CHAIN_SCALE: Record<ChainId, number> = { sol: 1, base: 0.4, robinhood: 0.35, bsc: 0.5, eth: 0.25 };

const DAY = 86_400_000;
const FUNDERS_PER_CHAIN = 4;
const FUNDER_BANK_USD = 40_000_000;

interface RoleSpec {
  role: Role;
  archetype: Archetype;
  /** Count on a sol-scale chain. */
  count: number;
  /** Lognormal bankroll (median USD, sigma). */
  bank: [number, number];
  skill: [number, number];
}

const POPULATION: RoleSpec[] = [
  { role: 'retail', archetype: 'retail', count: 1500, bank: [500, 1.1], skill: [0.1, 0.5] },
  { role: 'bot', archetype: 'bot', count: 60, bank: [2500, 0.6], skill: [0.3, 0.6] },
  { role: 'sniper', archetype: 'sniper', count: 80, bank: [8000, 0.7], skill: [0.4, 0.7] },
  { role: 'smart', archetype: 'smart', count: 150, bank: [25_000, 0.8], skill: [0.65, 0.95] },
  { role: 'kol', archetype: 'kol', count: 60, bank: [40_000, 0.9], skill: [0.35, 0.7] },
  { role: 'whale', archetype: 'whale', count: 40, bank: [500_000, 0.7], skill: [0.4, 0.75] },
  { role: 'sandwich', archetype: 'sandwich', count: 5, bank: [150_000, 0.3], skill: [0.9, 1] },
  { role: 'serialDev', archetype: 'dev', count: 300, bank: [4000, 0.8], skill: [0.3, 0.6] },
];

/** Roles that trade on their own and get bankroll top-ups. */
const TRADING_ROLES: Role[] = ['retail', 'fresh', 'bot', 'sniper', 'smart', 'kol', 'whale', 'sandwich'];

interface DevIndex {
  devs: WalletState[];
  cum: number[];
}

export class Roster {
  private lists = new Map<string, WalletState[]>();
  private devIndex = {} as Record<ChainId, DevIndex>;

  constructor(private readonly world: World) {
    this.clear();
  }

  private clear(): void {
    this.lists.clear();
    for (const c of CHAIN_IDS) this.devIndex[c] = { devs: [], cum: [] };
  }

  list(chain: ChainId, role: Role): WalletState[] {
    const key = `${chain}:${role}`;
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = []));
    return l;
  }

  pick(chain: ChainId, role: Role): WalletState | undefined {
    const l = this.list(chain, role);
    return l.length ? l[Math.floor(this.world.rng.next() * l.length)] : undefined;
  }

  private index(w: WalletState, m: AgentMemory): void {
    this.list(w.chain, m.role).push(w);
    if (m.role === 'serialDev') {
      const idx = this.devIndex[w.chain];
      const rep = m.rep ?? 0.5;
      // serial ruggers launch far more often than builders
      const weight = rep < 0.25 ? 1.8 : rep > 0.7 ? 0.7 : 1;
      idx.devs.push(w);
      idx.cum.push((idx.cum[idx.cum.length - 1] ?? 0) + weight);
    }
  }

  /** Create a wallet with its agent memory and index it. */
  create(chain: ChainId, archetype: Archetype, mem: AgentMemory, opts: Parameters<World['createWallet']>[2] = {}): WalletState {
    const w = this.world.createWallet(chain, archetype, opts);
    w.memory = mem as unknown as Record<string, unknown>;
    this.index(w, mem);
    return w;
  }

  /** Drop wallets housekeeping removed from the world from the role lists (which would keep them alive). */
  forget(addresses: Set<string>): void {
    if (addresses.size === 0) return;
    for (const [key, list] of this.lists) {
      const kept = list.filter((w) => !addresses.has(w.address));
      if (kept.length !== list.length) this.lists.set(key, kept);
    }
  }

  /** Rebuild indexes from world wallets (after a snapshot restore). */
  rebuild(): void {
    this.clear();
    for (const w of this.world.wallets.values()) {
      const m = memOf(w);
      if (m.role) this.index(w, m);
    }
  }

  pickSerialDev(chain: ChainId): WalletState {
    const { devs, cum } = this.devIndex[chain];
    const r = this.world.rng.next() * cum[cum.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return devs[lo];
  }

  /** A serial rugger (for sock-puppet launches); falls back to any serial dev. */
  pickRugger(chain: ChainId): WalletState {
    for (let i = 0; i < 8; i++) {
      const d = this.pickSerialDev(chain);
      if ((memOf(d).rep ?? 1) < 0.25) return d;
    }
    return this.pickSerialDev(chain);
  }

  /** A random exchange hot wallet, refilled from "cold storage" when it runs low. */
  funder(chain: ChainId): WalletState {
    const f = this.pick(chain, 'funder')!;
    const nu = this.world.nativeUsd(chain);
    if (f.native * nu < FUNDER_BANK_USD * 0.2) this.world.transferNative(null, f, FUNDER_BANK_USD / nu);
    return f;
  }

  /** Transfer a USD-denominated amount of native (sets fundedBy on first funding). */
  fund(from: WalletState, to: WalletState, usd: number): boolean {
    return this.world.transferNative(from, to, usd / this.world.nativeUsd(to.chain));
  }

  /** Seed the initial agent population on every chain. */
  seed(): void {
    const { world } = this;
    const rng = world.rng;
    const now = world.now;
    for (const chain of CHAIN_IDS) {
      const scale = CHAIN_SCALE[chain];
      const nu = world.nativeUsd(chain);
      for (let i = 0; i < FUNDERS_PER_CHAIN; i++) {
        this.create(chain, 'retail', { role: 'funder', bank: FUNDER_BANK_USD }, { label: funderLabel(i), native: FUNDER_BANK_USD / nu, createdAt: now - rng.float(700, 1300) * DAY });
      }
      const handles = rng.shuffle([...KOL_HANDLES]);
      for (const spec of POPULATION) {
        const n = spec.role === 'sandwich' ? Math.max(2, Math.round(spec.count * scale)) : Math.round(spec.count * scale);
        for (let i = 0; i < n; i++) {
          const bank = Math.max(20, rng.lognormal(spec.bank[0], spec.bank[1]));
          const mem: AgentMemory = { role: spec.role, bank };
          const opts: Parameters<World['createWallet']>[2] = {
            createdAt: now - (3 + rng.exp(120)) * DAY,
            skill: rng.float(spec.skill[0], spec.skill[1]),
            aggression: rng.float(0.2, 0.9),
          };
          if (spec.role === 'kol') {
            opts.label = handles[i % handles.length];
            opts.xFollowers = Math.round(Math.exp(rng.float(Math.log(5000), Math.log(800_000))));
            opts.tags = ['kol'];
            mem.dumper = rng.chance(0.5);
          } else if (spec.role === 'serialDev') {
            mem.rep = devReputation(rng.next(), rng.next());
            mem.bundlers = [];
            mem.insiders = [];
          }
          const w = this.create(chain, spec.archetype, mem, opts);
          this.fund(this.funder(chain), w, bank);
        }
      }
    }
  }

  /** A newly created retail-like wallet funded from an exchange. */
  spawnFresh(chain: ChainId): WalletState {
    const rng = this.world.rng;
    const bank = Math.max(30, rng.lognormal(400, 1));
    const w = this.create(chain, 'fresh', { role: 'fresh', bank }, { skill: rng.float(0.1, 0.5), aggression: rng.float(0.3, 0.9) });
    this.fund(this.funder(chain), w, bank);
    return w;
  }

  /**
   * A single-use dev wallet. Half are sock puppets funded by a serial rugger
   * (inheriting its reputation and crew); the rest are newcomers funded from an exchange.
   */
  spawnFreshDev(chain: ChainId): { dev: WalletState; boss: WalletState } {
    const rng = this.world.rng;
    const bank = Math.max(200, rng.lognormal(1500, 0.7));
    if (rng.chance(0.5)) {
      const boss = this.pickRugger(chain);
      const dev = this.create(chain, 'dev', { role: 'freshDev', bank, rep: memOf(boss).rep }, { skill: 0.5 });
      this.ensureNative(boss, bank * 1.5);
      this.fund(boss, dev, bank);
      return { dev, boss };
    }
    const dev = this.create(chain, 'dev', { role: 'freshDev', bank, rep: rng.float(0.25, 0.85), bundlers: [], insiders: [] }, { skill: 0.5 });
    this.fund(this.funder(chain), dev, bank);
    return { dev, boss: dev };
  }

  /** Make sure a wallet holds at least `usd` worth of native (withdrawing from an exchange). */
  ensureNative(w: WalletState, usd: number): void {
    const nu = this.world.nativeUsd(w.chain);
    const missing = usd - w.native * nu;
    if (missing > 0) this.fund(this.funder(w.chain), w, missing * 1.1);
  }

  /**
   * Bankroll maintenance for a few random trading agents: deposits when they
   * run dry, cash-outs to the exchange when they are far above their bankroll.
   */
  maintain(chain: ChainId, samples: number): void {
    const rng = this.world.rng;
    const nu = this.world.nativeUsd(chain);
    const lists = TRADING_ROLES.map((r) => this.list(chain, r));
    const total = lists.reduce((n, l) => n + l.length, 0);
    for (let i = 0; i < samples && total > 0; i++) {
      // uniform over all trading wallets, whatever their role
      let k = Math.floor(rng.next() * total);
      let li = 0;
      while (k >= lists[li].length) k -= lists[li++].length;
      const w = lists[li][k];
      const m = memOf(w);
      const usd = w.native * nu;
      if (usd < m.bank * 0.25) this.fund(this.funder(chain), w, m.bank * rng.float(0.4, 1));
      else if (usd > m.bank * 5) this.world.transferNative(w, this.funder(chain), w.native - (m.bank * 2) / nu);
    }
  }
}

/** 40% serial ruggers, 40% average, 20% builders. */
function devReputation(u: number, v: number): number {
  if (u < 0.4) return 0.02 + v * 0.18;
  if (u < 0.8) return 0.35 + v * 0.3;
  return 0.72 + v * 0.23;
}
