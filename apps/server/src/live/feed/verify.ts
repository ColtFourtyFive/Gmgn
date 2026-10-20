// Launch verification: a pump.fun create frame does not say what its curve is
// quoted in, and a quarter to nearly half of launches are quoted in another mint
// (24-46% over the captures of 2026-10-20: the PUMP token, CARDS, other pump
// coins...). For those PumpPortal's SOL fields hold
// the program's legacy shadow values (30 SOL virtual), not SOL, so booking them
// would show made-up prices, market caps and dev buys. Each launch is therefore
// held until its bonding-curve account (derived from the mint: the frame's
// bondingCurveKey is wrong for some mayhem launches) has been read, batched with
// the other launches of the moment:
//   quoted in SOL (or a SOL-like mint)  released, with the curve's fee rate and mayhem flag
//   quoted in anything else             rejected (its mint's later events are ignored)
//   not visible yet                     read again a few times, then released unverified
//   no RPC / read failed                released unverified (counted)
// A held launch's later events (its first trades, a quick migration) wait behind
// it so they apply in order; every other event passes straight through.

import { PublicKey, type AccountInfo, type Connection } from '@solana/web3.js';
import { loadPumpSdk } from '../enrich/onchain';
import type { FeedEvent } from './messages';

/** What a launch's curve account says, for the checks above. */
export interface CurveFacts {
  quoteMint: string;
  /** Quoted in SOL or a SOL-like mint (the program's own list). */
  solQuoted: boolean;
  mayhem: boolean;
  /** The coin's own creator fee (0 = the program's default rate). */
  creatorFeeBps: number;
}

/** Reads the curves of `mints` in one batch; null where no curve account exists (yet). */
export type CurveReader = (mints: string[]) => Promise<(CurveFacts | null)[]>;

/** pump.fun curve fees seen on mainnet trades: protocol 0.95% + creator 0.30% (unless the coin sets its own). */
export const PUMP_PROTOCOL_FEE_BPS = 95;
export const PUMP_DEFAULT_CREATOR_FEE_BPS = 30;

export function curveFeeRate(facts: Pick<CurveFacts, 'creatorFeeBps'>): number {
  return (PUMP_PROTOCOL_FEE_BPS + (facts.creatorFeeBps > 0 ? facts.creatorFeeBps : PUMP_DEFAULT_CREATOR_FEE_BPS)) / 10_000;
}

/** Decode a pump.fun BondingCurve account (null when it is not one). */
export function decodeCurveFacts(info: AccountInfo<Buffer> | null): CurveFacts | null {
  const sdk = loadPumpSdk();
  // (The SDK logs a stack for data shorter than its oldest layout: 8-byte discriminator + 5 u64 + bool.)
  if (!sdk || !info || !info.owner.equals(sdk.PUMP_PROGRAM_ID) || info.data.length < 49) return null;
  try {
    const c = sdk.PUMP_SDK.decodeBondingCurveNullable(info);
    if (!c) return null;
    const quote = c.quoteMint ?? PublicKey.default;
    return {
      quoteMint: quote.toBase58(),
      solQuoted: quote.equals(PublicKey.default) || sdk.isSolLikeQuoteMint(quote),
      mayhem: c.isMayhemMode === true,
      creatorFeeBps: c.creatorFeeBps ? Number(c.creatorFeeBps.toString()) : 0,
    };
  } catch {
    return null;
  }
}

/** The production reader: one getMultipleAccountsInfo of the curve PDAs at 'processed' (launches are that fresh). */
export function rpcCurveReader(connection: Connection, run: <T>(fn: () => Promise<T>) => Promise<T>): CurveReader {
  return async (mints) => {
    const sdk = loadPumpSdk();
    if (!sdk) throw new Error('pump SDK unavailable');
    const keys = mints.map((m) => sdk.bondingCurvePda(new PublicKey(m)));
    const infos = await run(() => connection.getMultipleAccountsInfo(keys, { commitment: 'processed' }));
    return infos.map((info) => decodeCurveFacts(info));
  };
}

export interface LaunchVerifierOptions {
  /** The reader to use now, or null (no RPC): launches then pass unverified. */
  reader: () => CurveReader | null;
  /** Verified and pass-through events, in arrival order per mint. */
  emit: (e: FeedEvent) => void;
  /** A launch quoted in another mint: none of its events were emitted. */
  reject: (mint: string, facts: CurveFacts) => void;
  /** Wait this long to batch launches together (ms). */
  batchMs?: number;
  /** Curves per read (getMultipleAccounts takes up to 100 on most RPCs). */
  maxBatch?: number;
  /** A curve not visible yet is read again after this long, at most maxAttempts reads in all. */
  retryMs?: number;
  maxAttempts?: number;
  /** Launches held at once (beyond it they pass unverified) and events held per launch. */
  maxPending?: number;
  maxHeldPerMint?: number;
  now?: () => number;
  log?: Pick<Console, 'warn'>;
}

export interface VerifierStats {
  verified: number;
  rejected: number;
  /** Released without a check (no RPC, read failed, never visible, too many pending). */
  unverified: number;
  retried: number;
  readErrors: number;
  /** Events of a pending launch dropped beyond maxHeldPerMint. */
  dropped: number;
}

interface Pending {
  events: FeedEvent[];
  attempts: number;
  dueAt: number;
}

export class LaunchVerifier {
  readonly stats: VerifierStats = { verified: 0, rejected: 0, unverified: 0, retried: 0, readErrors: 0, dropped: 0 };
  private readonly pending = new Map<string, Pending>();
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private closed = false;
  private readonly batchMs: number;
  private readonly maxBatch: number;
  private readonly retryMs: number;
  private readonly maxAttempts: number;
  private readonly maxPending: number;
  private readonly maxHeld: number;
  private readonly now: () => number;

  constructor(private readonly opts: LaunchVerifierOptions) {
    this.batchMs = opts.batchMs ?? 300;
    this.maxBatch = Math.max(1, opts.maxBatch ?? 100);
    this.retryMs = opts.retryMs ?? 500;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 4);
    this.maxPending = opts.maxPending ?? 2000;
    this.maxHeld = opts.maxHeldPerMint ?? 200;
    this.now = opts.now ?? Date.now;
  }

  /** Launches waiting for their curve read. */
  get size(): number {
    return this.pending.size;
  }

  push(e: FeedEvent): void {
    const held = this.pending.get(e.mint);
    if (held) {
      if (held.events.length < this.maxHeld) held.events.push(e);
      else this.stats.dropped++;
      return;
    }
    // Only pump.fun launches are checked (other launchpads' are ignored by ingest anyway).
    if (e.kind !== 'create' || (e.pool && e.pool !== 'pump') || this.closed) {
      this.opts.emit(e);
      return;
    }
    if (!this.opts.reader() || this.pending.size >= this.maxPending) {
      this.stats.unverified++;
      this.opts.emit(e);
      return;
    }
    this.pending.set(e.mint, { events: [e], attempts: 0, dueAt: this.now() + this.batchMs });
    this.schedule();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }

  private schedule(): void {
    if (this.closed || this.inFlight || this.timer || this.pending.size === 0) return;
    let next = Infinity;
    for (const p of this.pending.values()) next = Math.min(next, p.dueAt);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, Math.max(0, next - this.now()));
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    const now = this.now();
    const mints: string[] = [];
    for (const [mint, p] of this.pending) {
      if (p.dueAt <= now) mints.push(mint);
      if (mints.length >= this.maxBatch) break;
    }
    const reader = this.opts.reader();
    if (mints.length === 0 || !reader) {
      if (!reader) for (const mint of [...this.pending.keys()]) this.release(mint, null);
      this.schedule();
      return;
    }
    this.inFlight = true;
    let facts: (CurveFacts | null)[] | null = null;
    try {
      facts = await reader(mints);
    } catch (err) {
      this.stats.readErrors++;
      if (this.stats.readErrors % 100 === 1) this.opts.log?.warn(`[live] launch verification read failed: ${err instanceof Error ? err.message : 'error'}`);
    }
    this.inFlight = false;
    if (this.closed) return;
    mints.forEach((mint, i) => {
      const p = this.pending.get(mint);
      if (!p) return;
      const f = facts ? facts[i] ?? null : null;
      if (!facts) {
        this.release(mint, null);
      } else if (f) {
        if (f.solQuoted) {
          this.release(mint, f);
        } else {
          this.pending.delete(mint);
          this.stats.rejected++;
          this.opts.reject(mint, f);
        }
      } else if (++p.attempts < this.maxAttempts) {
        this.stats.retried++;
        p.dueAt = this.now() + this.retryMs;
      } else {
        this.release(mint, null);
      }
    });
    this.schedule();
  }

  /** Emit a launch (with what its curve says, when read) and the events held behind it. */
  private release(mint: string, facts: CurveFacts | null): void {
    const p = this.pending.get(mint);
    if (!p) return;
    this.pending.delete(mint);
    if (facts) this.stats.verified++;
    else this.stats.unverified++;
    for (const e of p.events) {
      if (facts && e.kind === 'create') this.opts.emit({ ...e, mayhem: facts.mayhem, curveFeeRate: curveFeeRate(facts) });
      else this.opts.emit(e);
    }
  }
}
