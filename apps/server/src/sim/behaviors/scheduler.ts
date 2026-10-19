// Time-ordered queue of one-off agent actions (snipes, informed exit checks,
// KOL calls, migrations...). A binary min-heap over plain objects so the
// whole queue serializes with the snapshot as-is.

export type ActionKind =
  | 'snipe' //       sniper buy in the first blocks after launch
  | 'insider' //     dev-funded wallet accumulating in the first minute
  | 'smartEntry' //  informed early entry (wallet chosen at execution)
  | 'kolEntry' //    KOL early entry (wallet chosen at execution)
  | 'check' //       re-evaluate an informed holder's exit rules
  | 'kolCall' //     KOL shills a token they hold
  | 'kolDump' //     KOL sells into their own call
  | 'migrate' //     move a completed curve into its AMM pool
  | 'boost'; //      paid screener boost

export interface Action {
  at: number;
  seq: number;
  kind: ActionKind;
  token: string;
  /** Acting wallet ('' when chosen at execution time). */
  wallet: string;
  /** Kind-specific number: USD size for entries, peak price (USD) for checks. */
  x: number;
}

export interface SchedulerState {
  heap: Action[];
  seq: number;
}

function before(a: Action, b: Action): boolean {
  return a.at < b.at || (a.at === b.at && a.seq < b.seq);
}

export class Scheduler {
  private heap: Action[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(at: number, kind: ActionKind, token: string, wallet = '', x = 0): void {
    const h = this.heap;
    h.push({ at, seq: this.seq++, kind, token, wallet, x });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  /** Remove and return the earliest action due at or before `now`. */
  popDue(now: number): Action | undefined {
    const h = this.heap;
    if (h.length === 0 || h[0].at > now) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m])) m = l;
        if (r < h.length && before(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }

  serialize(): SchedulerState {
    return { heap: this.heap, seq: this.seq };
  }

  restore(s: SchedulerState): void {
    this.heap = s.heap;
    this.seq = s.seq;
  }
}
