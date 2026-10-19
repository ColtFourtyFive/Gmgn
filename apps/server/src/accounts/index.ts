// STUB — replaced by the accounts implementation.
import type { FastifyInstance } from 'fastify';
import type { AccountsApi, AppContext } from '../context';

const todo = (): never => {
  throw new Error('accounts: not implemented');
};

export class Accounts implements AccountsApi {
  constructor(private ctx: AppContext) {}
  install(): void {}
  resolveToken(_token: string): string | null {
    return null;
  }
  getAccount = todo;
  walletFor = todo;
  accountIdForWallet = (): string | null => null;
  getSettings = todo;
  isFollowing = (): boolean => false;
  remarkFor = (): string | null => null;
  followedWallets = () => [];
  followersOf = (): string[] => [];
  followerCount = (): number => 0;
  watchlist = () => [];
  notify = todo;
  recordTradeVolume = (): void => {};
  pushBalance = (): void => {};
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}

export async function registerAccountRoutes(_app: FastifyInstance, _ctx: AppContext): Promise<void> {}
