// ERC-20 Transfer logs of the tokens followed since launch, kept in the
// HolderBook so trades carry exact post-transaction balances. Launchpads say
// which tokens launch in the window; their transfers (mint included) are
// fetched in the window's follow-up, later windows read them with the other
// emitter-filtered logs (no extra request).

import { TOPIC, topicAddress } from '../abi';
import type { HolderBook, TransferMove } from '../holders';
import type { LogInterest } from '../poller';
import type { RawLog } from '../rpc';
import type { FeedContext, FeedEvent, Venue } from './types';

interface TransferEvent extends FeedEvent {
  move: TransferMove;
}

export class TransfersVenue implements Venue {
  readonly id = 'transfers';
  private launchedNow: string[] = [];

  constructor(
    private readonly book: HolderBook,
    private readonly launchpads: () => Venue[],
  ) {}

  interests(): LogInterest[] {
    return this.book.size ? [{ address: [...this.book.tokens()], topics: [TOPIC.transfer] }] : [];
  }

  /** Transfers of the tokens launching in this window, from their mint on. */
  followUp(): LogInterest[] {
    const fresh: string[] = [];
    for (const v of this.launchpads()) {
      for (const token of v.launching?.() ?? []) {
        if (this.book.has(token)) continue;
        this.book.begin(token);
        if (this.book.has(token)) fresh.push(token);
      }
    }
    this.launchedNow = fresh;
    return fresh.length ? [{ address: fresh, topics: [TOPIC.transfer] }] : [];
  }

  decode(log: RawLog): TransferEvent | null {
    if (log.topics[0] !== TOPIC.transfer || log.topics.length !== 3 || !this.book.has(log.address) || log.data.length < 66) return null;
    const value = BigInt(log.data.slice(0, 66));
    return { venue: this, log, move: { token: log.address, from: topicAddress(log.topics[1]), to: topicAddress(log.topics[2]), value, txHash: log.transactionHash } };
  }

  async prepare(events: FeedEvent[]): Promise<void> {
    this.book.plan((events as TransferEvent[]).map((e) => e.move));
  }

  apply(event: FeedEvent): void {
    this.book.apply((event as TransferEvent).move);
  }

  /** Launches that did not make it into the ledger (non-native quote, excluded) stop being followed. */
  endWindow(ctx: FeedContext): void {
    for (const token of this.launchedNow) if (!ctx.token(token)) this.book.drop(token);
    this.launchedNow = [];
    this.book.endWindow();
  }

  untrack(token: string): void {
    this.book.drop(token);
  }
}
