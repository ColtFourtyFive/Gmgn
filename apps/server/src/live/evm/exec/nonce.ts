// Per wallet+chain serialization and nonce management.
//
// Every send for a (chain, wallet) runs inside one queue slot, so two trades
// (or a trade and a withdrawal) from the same wallet never race for a nonce.
// The next nonce is max(chain 'pending' count, the local counter): the local
// counter covers transactions sent through a private RPC (invisible to the
// public mempool), the chain count covers transactions sent elsewhere. A
// 'nonce too low' answer resyncs from the chain; a dropped transaction resets
// the counter to the chain's 'latest' count so later sends do not wait on a gap.

import type { Address } from 'viem';
import type { EvmChainId } from '../chains';

export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  /** Run `fn` after every earlier task with the same key settled (errors do not block the queue). */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }

  /** Keys with queued or running work (for tests and diagnostics). */
  busyKeys(): string[] {
    return [...this.tails.keys()];
  }
}

export type NonceSource = (chain: EvmChainId, address: Address, blockTag: 'pending' | 'latest') => Promise<number>;

export function walletKey(chain: EvmChainId, address: Address): string {
  return `${chain}:${address.toLowerCase()}`;
}

export class NonceManager {
  private readonly next = new Map<string, number>();

  constructor(private readonly source: NonceSource) {}

  /** The nonce to use for the next transaction (call inside the wallet's queue slot). */
  async peek(chain: EvmChainId, address: Address): Promise<number> {
    const chainNonce = await this.source(chain, address, 'pending');
    const local = this.next.get(walletKey(chain, address));
    return local === undefined ? chainNonce : Math.max(local, chainNonce);
  }

  /** Record that `nonce` was accepted by the node. */
  commit(chain: EvmChainId, address: Address, nonce: number): void {
    const key = walletKey(chain, address);
    const cur = this.next.get(key);
    if (cur === undefined || nonce + 1 > cur) this.next.set(key, nonce + 1);
  }

  /** Forget the local counter: the next peek uses the chain's pending count. */
  resync(chain: EvmChainId, address: Address): void {
    this.next.delete(walletKey(chain, address));
  }

  /** After a dropped transaction: continue from the chain's mined count. */
  async resetToLatest(chain: EvmChainId, address: Address): Promise<number> {
    const latest = await this.source(chain, address, 'latest');
    this.next.set(walletKey(chain, address), latest);
    return latest;
  }

  localNext(chain: EvmChainId, address: Address): number | undefined {
    return this.next.get(walletKey(chain, address));
  }
}
