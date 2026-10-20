// Address poisoning: a scammer sprays dust from an address that copies the
// first and last characters of one its victims really transact with (here the
// exchange wallet that funds them), hoping a victim later copies the look-alike
// from its history and sends real funds to it. The dust transfers are
// observable on-chain; the wallet risk check (analytics/wallets/risk.ts) flags
// them without reading anything hidden.

import type { ChainId } from '@trenchscope/shared';
import { lookalikeAddress } from '../rng';
import type { WalletState, World } from '../world';
import { memOf, type Role, type Roster } from './roster';

const MIN = 60_000;
/** Who gets sprayed (exchange-funded traders), by relative weight. */
const VICTIM_ROLES: Role[] = ['retail', 'fresh', 'smart', 'kol', 'whale'];
const VICTIM_WEIGHTS = [10, 4, 2, 1, 1];
/** Wallets hit per campaign. */
const SPRAY = [3, 12] as const;
/** Each dust transfer is worth well under a cent. */
const DUST_USD = [0.0001, 0.004] as const;
/** Look-alike senders kept per chain (one per imitated address). */
const MAX_PHISHERS = 24;

export class Poisoner {
  constructor(
    private readonly world: World,
    private readonly roster: Roster,
  ) {}

  /** Run this chain's campaigns for `dtMs` at `perMinute` campaigns a minute (Poisson). */
  step(chain: ChainId, dtMs: number, perMinute: number): void {
    if (!(perMinute > 0)) return;
    for (let i = this.world.rng.poisson((perMinute * dtMs) / MIN); i > 0; i--) this.campaign(chain);
  }

  /** One spray: a victim's funder gets a look-alike that dusts the victim and others it funded. */
  campaign(chain: ChainId): void {
    const { world, roster } = this;
    const rng = world.rng;
    const victim = roster.pick(chain, rng.weighted(VICTIM_ROLES, VICTIM_WEIGHTS));
    const funder = victim?.fundedBy ? world.wallets.get(victim.fundedBy) : undefined;
    if (!victim || !funder) return;
    const phisher = this.lookalikeOf(funder);
    if (!phisher) return;
    const targets = new Set<WalletState>([victim]);
    const want = rng.int(SPRAY[0], SPRAY[1]);
    for (let tries = 0; targets.size < want && tries < want * 4; tries++) {
      const w = roster.pick(chain, rng.weighted(VICTIM_ROLES, VICTIM_WEIGHTS));
      if (w && w.fundedBy === funder.address) targets.add(w);
    }
    const nu = world.nativeUsd(chain);
    for (const w of targets) {
      const dust = rng.float(DUST_USD[0], DUST_USD[1]) / nu;
      if (phisher.native < dust) world.transferNative(null, phisher, (1 / nu) * 5);
      world.transferNative(phisher, w, dust);
    }
  }

  /** The chain's look-alike of `target`, created on first use (null once the chain's cap is reached). */
  private lookalikeOf(target: WalletState): WalletState | null {
    const { world, roster } = this;
    const list = roster.list(target.chain, 'phisher');
    const known = list.find((p) => memOf(p).mimics === target.address);
    if (known) return known;
    if (list.length >= MAX_PHISHERS) return null;
    let address = lookalikeAddress(world.rng, target.address);
    while (world.wallets.has(address) || world.tokens.has(address)) address = lookalikeAddress(world.rng, target.address);
    const p = roster.create(target.chain, 'phisher', { role: 'phisher', bank: 0, mimics: target.address }, { address, skill: 0 });
    world.transferNative(null, p, 5 / world.nativeUsd(target.chain));
    return p;
  }
}
