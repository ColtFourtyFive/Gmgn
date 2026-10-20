// On-chain security reads for the tokens that matter right now (open in a
// client, held by a user, watchlisted): mint / freeze authority (jsonParsed
// mint account) and the largest holders, whose balances are written into the
// World so holder lists and the top-10 concentration reflect the chain, not
// only the trades we happened to see. Reads are background priority on the
// shared RPC budget; a full queue just defers them to the next pass.

import type { Connection } from '@solana/web3.js';
import type { TokenState, World } from '../../sim/world';
import { BudgetExceeded, type RequestBudget } from './budget';
import { parseMintAccount, parsePublicKey, readTopHolders, type HolderBalance } from './onchain';

/** Authorities rarely change after launch; holders move with every trade. */
const AUTHORITY_TTL_MS = 10 * 60_000;
const HOLDERS_TTL_MS = 60_000;
/** Remembered per mint; old entries are dropped with the token. */
const MAX_TRACKED = 20_000;

export interface SecurityStats {
  authorityReads: number;
  holderReads: number;
  failures: number;
  deferred: number;
}

export interface SecurityDeps {
  world: World;
  /** The RPC connection, read at each pass (null = no RPC: nothing is read). */
  connection: () => Connection | null;
  budget: RequestBudget;
  now: () => number;
  /** Whether a holder is an account's own wallet (its balances come from the account's wallet sync). */
  isAccountWallet: (address: string) => boolean;
  log?: Pick<Console, 'warn'>;
}

export class OnchainSecurity {
  private readonly authorityAt = new Map<string, number>();
  private readonly holdersAt = new Map<string, number>();
  private readonly inflight = new Set<string>();
  readonly stats: SecurityStats = { authorityReads: 0, holderReads: 0, failures: 0, deferred: 0 };

  constructor(private readonly deps: SecurityDeps) {}

  /** Mark a token's authorities as known (read by the on-demand lookup just now). */
  noteAuthorities(mint: string): void {
    this.authorityAt.set(mint, this.deps.now());
  }

  /** Queue whatever reads are due for these mints. */
  refresh(mints: Iterable<string>): void {
    if (!this.deps.connection()) return;
    const now = this.deps.now();
    for (const mint of mints) {
      const t = this.deps.world.tokens.get(mint);
      if (!t || t.chain !== 'sol') continue;
      if (now - (this.authorityAt.get(mint) ?? -Infinity) >= AUTHORITY_TTL_MS) void this.readAuthorities(t);
      if (now - (this.holdersAt.get(mint) ?? -Infinity) >= HOLDERS_TTL_MS) void this.readHolders(t);
    }
    this.trim();
  }

  async readAuthorities(t: TokenState): Promise<void> {
    const key = `a|${t.address}`;
    const mint = parsePublicKey(t.address);
    const connection = this.deps.connection();
    if (!mint || !connection || this.inflight.has(key)) return;
    this.inflight.add(key);
    try {
      const res = await this.deps.budget.run(() => connection.getParsedAccountInfo(mint, 'confirmed'), 'low');
      this.stats.authorityReads++;
      this.authorityAt.set(t.address, this.deps.now());
      const info = parseMintAccount(res.value);
      if (!info) return;
      applyAuthorities(t, info.mintAuthority, info.freezeAuthority);
    } catch (err) {
      this.failed(err, t, 'authorities');
    } finally {
      this.inflight.delete(key);
    }
  }

  async readHolders(t: TokenState): Promise<void> {
    const key = `h|${t.address}`;
    const mint = parsePublicKey(t.address);
    const connection = this.deps.connection();
    if (!mint || !connection || this.inflight.has(key)) return;
    this.inflight.add(key);
    try {
      const holders = await readTopHolders(connection, mint, (fn) => this.deps.budget.run(fn, 'low'));
      this.stats.holderReads++;
      this.holdersAt.set(t.address, this.deps.now());
      if (this.deps.world.tokens.get(t.address) === t) applyHolders(this.deps.world, t, holders, this.deps.isAccountWallet);
    } catch (err) {
      this.failed(err, t, 'holders');
    } finally {
      this.inflight.delete(key);
    }
  }

  private failed(err: unknown, t: TokenState, what: string): void {
    if (err instanceof BudgetExceeded) {
      this.stats.deferred++;
      return;
    }
    if (this.stats.failures++ % 50 === 0) this.deps.log?.warn(`[live] ${what} read for ${t.address} failed: ${err instanceof Error ? err.message : 'error'}`);
  }

  private trim(): void {
    for (const map of [this.authorityAt, this.holdersAt]) {
      if (map.size <= MAX_TRACKED) continue;
      for (const mint of map.keys()) {
        if (map.size <= MAX_TRACKED * 0.9) break;
        map.delete(mint);
      }
    }
  }
}

/** Authorities as read on-chain (null authority = renounced). */
export function applyAuthorities(t: TokenState, mintAuthority: string | null, freezeAuthority: string | null): void {
  const renouncedMint = mintAuthority === null;
  const renouncedFreeze = freezeAuthority === null;
  if (t.renouncedMint === renouncedMint && t.renouncedFreeze === renouncedFreeze) return;
  t.renouncedMint = renouncedMint;
  t.renouncedFreeze = renouncedFreeze;
  t.version++;
}

/** Write the chain's largest holders into the World (account wallets are left to their own sync). */
export function applyHolders(world: World, t: TokenState, holders: HolderBalance[], isAccountWallet: (address: string) => boolean): void {
  for (const h of holders) {
    if (isAccountWallet(h.owner) || world.tokens.has(h.owner)) continue;
    world.syncHolderBalance(t, h.owner, h.balance);
  }
}
