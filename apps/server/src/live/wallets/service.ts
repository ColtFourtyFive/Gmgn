// Live wallets: keeps the World's view of each embedded wallet in step with
// the chain and records deposits.
//
//   balance sync   every ~20s for accounts active in the last 15 minutes (API calls, fills), and
//                  right after their fills and withdrawals: SOL and every token account under both
//                  token programs. The World's native balance and positions follow the chain;
//                  tokens held but unknown to the World are handed to the market to track. A read
//                  that raced one of the account's own transactions is dropped (the next one wins).
//   deposits       getSignaturesForAddress since the last seen signature; incoming SOL / SPL from
//                  transactions others paid for become 'deposit' transfers (idempotent ids) and a
//                  notification.
//   withdrawals    see withdrawals.ts; open ones resume at start.

import { PublicKey } from '@solana/web3.js';
import { formatNative, shortAddress, type DepositInfo, type UserWallet, type WalletTransfer } from '@trenchscope/shared';
import { HttpError, type AppContext } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { fromBaseUnits } from '../execution/amounts';
import type { TxLike } from '../execution/fills';
import { lanesFor } from '../execution/lanes';
import { readChainBalances, uiAmount } from './balances';
import { depositId, parseDeposits } from './deposits';
import { FEE_RESERVE_SOL, Withdrawals, type WithdrawalDeps } from './withdrawals';

const SYNC_EVERY_MS = 20_000;
const ACTIVE_FOR_MS = 15 * 60_000;
const AFTER_FILL_DELAY_MS = 1500;
const REFRESH_MIN_INTERVAL_MS = 3000;
const SIGNATURE_PAGE = 100;
const MAX_PAGES = 5;
const FIRST_SCAN_LIMIT = 20;
const STATE_KEY = 'live-wallets';

interface WalletsState {
  version: 1;
  /** Wallet address -> newest signature already scanned for deposits. */
  cursors: Record<string, string>;
}

export class LiveWallets {
  readonly withdrawals: Withdrawals;
  /** accountId -> wall time of its last activity. */
  private readonly active = new Map<string, number>();
  private cursors: Record<string, string> = {};
  private readonly syncing = new Map<string, Promise<UserWallet | null>>();
  private readonly scanning = new Map<string, Promise<WalletTransfer[]>>();
  private readonly pendingAfterFill = new Set<string>();
  private readonly lastRefresh = new Map<string, number>();
  private passRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private now: () => number;

  constructor(
    private readonly ctx: AppContext,
    deps: Partial<WithdrawalDeps> = {},
  ) {
    this.withdrawals = new Withdrawals(ctx, (accountId) => void this.sync(accountId), deps);
    this.now = deps.now ?? (() => Date.now());
  }

  /** Re-read balances shortly after any trade of one of our users lands in the World. */
  install(): void {
    this.ctx.world.on('trade', (_trade, _token, wallet: WalletState) => {
      if (wallet.archetype !== 'user' || !wallet.accountId) return;
      this.touch(wallet.accountId);
      this.syncSoon(wallet.accountId);
    });
  }

  /** Resume open withdrawals and start the periodic pass. */
  start(): void {
    const saved = this.ctx.store?.getState(STATE_KEY) as WalletsState | null | undefined;
    if (saved && saved.version === 1 && saved.cursors && typeof saved.cursors === 'object') this.cursors = { ...saved.cursors };
    this.withdrawals.resume();
    this.timer = setInterval(() => void this.pass(), SYNC_EVERY_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist();
  }

  /** The account is using the app: keep its wallet in sync. */
  touch(accountId: string): void {
    this.active.set(accountId, this.now());
  }

  /** One sync + deposit scan of every recently active account (sequential: a small user base). */
  async pass(): Promise<void> {
    if (this.passRunning) return;
    this.passRunning = true;
    try {
      const now = this.now();
      for (const [accountId, at] of [...this.active]) {
        if (now - at > ACTIVE_FOR_MS) {
          this.active.delete(accountId);
          continue;
        }
        await this.scanDeposits(accountId).catch((err) => console.warn('[wallets] deposit scan failed', errText(err)));
        await this.sync(accountId).catch((err) => console.warn('[wallets] balance sync failed', errText(err)));
      }
    } finally {
      this.passRunning = false;
    }
  }

  private syncSoon(accountId: string): void {
    if (this.pendingAfterFill.has(accountId)) return;
    this.pendingAfterFill.add(accountId);
    const t = setTimeout(() => {
      this.pendingAfterFill.delete(accountId);
      void this.sync(accountId).catch(() => undefined);
    }, AFTER_FILL_DELAY_MS);
    t.unref?.();
  }

  /** A user's "refresh": a chain read at most every few seconds per account (each costs several RPC calls). */
  refresh(accountId: string): Promise<UserWallet | null> {
    const now = this.now();
    if (now - (this.lastRefresh.get(accountId) ?? -Infinity) < REFRESH_MIN_INTERVAL_MS) return Promise.resolve(null);
    this.lastRefresh.set(accountId, now);
    return this.sync(accountId);
  }

  /** Re-read the wallet from the chain into the World and push the balance; null when not possible now. */
  sync(accountId: string): Promise<UserWallet | null> {
    const running = this.syncing.get(accountId);
    if (running) return running;
    const job = this.doSync(accountId).finally(() => this.syncing.delete(accountId));
    this.syncing.set(accountId, job);
    return job;
  }

  private async doSync(accountId: string): Promise<UserWallet | null> {
    const { ctx } = this;
    const connection = ctx.live?.connection;
    const ref = ctx.accounts.walletRef(accountId, 'sol');
    if (!connection || !ref) return null;
    const lanes = lanesFor(ctx.live!);
    const version = lanes.version(accountId);
    const balances = await readChainBalances(connection, new PublicKey(ref.address));
    // One of the account's transactions moved its balances meanwhile: the next read will see them.
    if (lanes.busy(accountId) || lanes.version(accountId) !== version) return null;
    const wallet = ctx.accounts.walletFor(accountId, 'sol');
    const tokens = new Map<string, number>();
    for (const b of balances.tokens.values()) tokens.set(b.mint, uiAmount(b));
    const before = wallet.native;
    const { changed, unknown } = ctx.world.syncWalletBalances(wallet, fromBaseUnits(balances.lamports, 9), balances.complete ? tokens : undefined);
    // Held tokens the World does not track yet: the market loads them (their positions sync on the next pass).
    for (const mint of unknown) void ctx.market.ensureToken?.('sol', mint)?.catch(() => null);
    if (before !== wallet.native || changed.length) ctx.accounts.pushBalance(accountId, 'sol');
    return { chain: 'sol', address: wallet.address, nativeBalance: wallet.native, nativeBalanceUsd: wallet.native * ctx.world.nativeUsd('sol') };
  }

  /** Record deposits that landed since the last scan; returns the new ones (oldest first). */
  scanDeposits(accountId: string): Promise<WalletTransfer[]> {
    const running = this.scanning.get(accountId);
    if (running) return running;
    const job = this.doScan(accountId).finally(() => this.scanning.delete(accountId));
    this.scanning.set(accountId, job);
    return job;
  }

  private async doScan(accountId: string): Promise<WalletTransfer[]> {
    const { ctx } = this;
    const connection = ctx.live?.connection;
    const ref = ctx.accounts.walletRef(accountId, 'sol');
    if (!connection || !ref) return [];
    const owner = new PublicKey(ref.address);
    const cursor = this.cursors[ref.address];
    // Newest first, down to the cursor (exclusive); paged when more landed than one page.
    const sigs: { signature: string; err: unknown; blockTime?: number | null }[] = [];
    let before: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const limit = cursor ? SIGNATURE_PAGE : FIRST_SCAN_LIMIT;
      const batch = await connection.getSignaturesForAddress(owner, { until: cursor, before, limit }, 'confirmed');
      sigs.push(...batch);
      if (!cursor || batch.length < limit) break;
      before = batch[batch.length - 1].signature;
    }
    if (!sigs.length) return [];

    const known = new Set((ctx.store?.transfersFor(accountId, 500) ?? []).map((t) => t.id));
    const found: WalletTransfer[] = [];
    let newest = cursor;
    for (const s of [...sigs].reverse()) {
      if (!s.err) {
        const tx = (await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })) as TxLike | null;
        if (!tx) break; // not readable yet: resume from here next pass
        for (const d of parseDeposits(tx, ref.address)) {
          const id = depositId(s.signature, d.mint);
          if (known.has(id)) continue;
          known.add(id);
          const transfer = this.recordDeposit(accountId, id, s.signature, tx, d);
          found.push(transfer);
        }
      }
      newest = s.signature;
    }
    if (newest && newest !== cursor) {
      this.cursors[ref.address] = newest;
      this.persist();
    }
    if (found.length) void this.sync(accountId).catch(() => undefined);
    return found;
  }

  private recordDeposit(accountId: string, id: string, signature: string, tx: TxLike, d: ReturnType<typeof parseDeposits>[number]): WalletTransfer {
    const { ctx } = this;
    const token: TokenState | undefined = d.mint ? ctx.world.getToken(d.mint) : undefined;
    const symbol = d.mint ? (token?.symbol ?? 'tokens') : 'SOL';
    const amount = fromBaseUnits(d.raw, d.decimals);
    const at = tx.blockTime ? tx.blockTime * 1000 : ctx.world.now;
    const transfer: WalletTransfer = {
      id,
      chain: 'sol',
      direction: 'deposit',
      mint: d.mint,
      symbol,
      amount,
      counterparty: d.from,
      signature,
      status: 'confirmed',
      networkFee: 0,
      createdAt: at,
      confirmedAt: at,
    };
    ctx.store?.upsertTransfer(accountId, transfer);
    ctx.accounts.audit(accountId, 'deposit', { id, signature, mint: d.mint, amount: d.raw.toString(), from: d.from });
    ctx.accounts.notify(accountId, {
      kind: 'system',
      title: 'Deposit received',
      body: `${d.mint ? `${amount} ${symbol}` : formatNative(amount, 'SOL')}${d.from ? ` from ${shortAddress(d.from)}` : ''}`,
      chain: 'sol',
      token: d.mint,
      wallet: d.from,
      level: 'success',
    });
    return transfer;
  }

  depositInfo(accountId: string): DepositInfo {
    const ref = this.ctx.accounts.walletRef(accountId, 'sol');
    if (!ref) throw new HttpError(503, 'your wallet is not provisioned yet', 'wallets_unavailable');
    return { chain: 'sol', address: ref.address, feeReserve: FEE_RESERVE_SOL, commitment: 'confirmed' };
  }

  transfers(accountId: string, limit: number): WalletTransfer[] {
    return this.ctx.store?.transfersFor(accountId, limit) ?? [];
  }

  private persist(): void {
    try {
      this.ctx.store?.putState(STATE_KEY, { version: 1, cursors: this.cursors } satisfies WalletsState);
    } catch (err) {
      console.warn('[wallets] could not persist scan cursors', errText(err));
    }
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
