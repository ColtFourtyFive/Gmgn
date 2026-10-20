// Live wallets: keeps the World's view of each embedded wallet in step with
// the chain and records deposits.
//
//   balance sync   every ~20s for accounts active in the last 15 minutes (API calls, fills), and
//                  right after their fills and withdrawals: SOL and every token account under both
//                  token programs. The World's native balance and positions follow the chain;
//                  tokens held but unknown to the World are handed to the market to track. A read
//                  that raced one of the account's own transactions is dropped (the next one wins).
//   deposits       getSignaturesForAddress since the last seen signature, for the wallet and for each
//                  of its token accounts (a transfer into a token account the wallet already has does
//                  not list the wallet itself); incoming SOL / SPL from transactions others paid for
//                  become 'deposit' transfers (idempotent ids) and a notification. A token account is
//                  re-read when its balance moved since its last scan (and every account on a slow
//                  sweep); more signatures than one pass reads are caught up oldest first, so none
//                  in between is skipped.
//   withdrawals    see withdrawals.ts; open ones resume at start.

import { PublicKey, type Connection } from '@solana/web3.js';
import { formatNative, shortAddress, type DepositInfo, type UserWallet, type WalletTransfer } from '@trenchscope/shared';
import { HttpError, type AppContext } from '../../context';
import type { TokenState, WalletState } from '../../sim/world';
import { fromBaseUnits } from '../execution/amounts';
import type { TxLike } from '../execution/fills';
import { lanesFor } from '../execution/lanes';
import { readChainBalances, uiAmount, type ChainBalances } from './balances';
import { depositId, parseDeposits, readTransaction } from './deposits';
import { FEE_RESERVE_SOL, Withdrawals, type WithdrawalDeps } from './withdrawals';

const SYNC_EVERY_MS = 20_000;
const ACTIVE_FOR_MS = 15 * 60_000;
const AFTER_FILL_DELAY_MS = 1500;
const REFRESH_MIN_INTERVAL_MS = 3000;
const SIGNATURE_PAGE = 100;
const MAX_PAGES = 5;
const FIRST_SCAN_LIMIT = 20;
/** Every token account of an active wallet is re-read at least this often, moved or not. */
const TOKEN_SWEEP_EVERY_MS = 30 * 60_000;
/** Signatures already read, per wallet: the wallet's and its token accounts' scans share them. */
const READ_SIGNATURES_KEPT = 2000;
const STATE_KEY = 'live-wallets';

interface WalletsState {
  version: 1;
  /** Wallet or token account address -> newest signature already scanned for deposits. */
  cursors: Record<string, string>;
}

interface ScanJob {
  accountId: string;
  wallet: string;
  known: Set<string>;
  found: WalletTransfer[];
  /** Signatures of this wallet already read (bounded, oldest dropped first). */
  read: Set<string>;
  cursorsMoved: boolean;
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
  /** Wallet address -> its token accounts and their raw balances at the last complete read. */
  private readonly holdings = new Map<string, Map<string, bigint>>();
  /** Token account -> raw balance when its signatures were last scanned. */
  private readonly scannedRaw = new Map<string, bigint>();
  /** Wallet address -> when all its token accounts were last scanned. */
  private readonly sweptAt = new Map<string, number>();
  /** Address -> oldest signature fetched while catching up on a backlog (read further back next pass). */
  private readonly backlog = new Map<string, string>();
  /** Wallet address -> signatures already read. */
  private readonly readSignatures = new Map<string, Set<string>>();
  private readonly warnedVersions = new Set<number>();
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
        // Balances first: the deposit scan re-reads the token accounts whose balance moved.
        await this.sync(accountId).catch((err) => console.warn('[wallets] balance sync failed', errText(err)));
        await this.scanDeposits(accountId).catch((err) => console.warn('[wallets] deposit scan failed', errText(err)));
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
    // What the chain holds is true whatever raced it: the deposit scan uses it to pick token accounts.
    if (balances.complete) this.noteHoldings(ref.address, balances);
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
    const wallet = ref.address;
    let read = this.readSignatures.get(wallet);
    if (!read) this.readSignatures.set(wallet, (read = new Set()));
    const job: ScanJob = {
      accountId,
      wallet,
      known: new Set((ctx.store?.transfersFor(accountId, 500) ?? []).map((t) => t.id)),
      found: [],
      read,
      cursorsMoved: false,
    };
    try {
      // The wallet itself: SOL in, and token transfers that created one of its token accounts.
      await this.scanAddress(connection, job, wallet);
      // Its token accounts: a transfer into an existing one lists only the token account.
      const { due, sweep } = this.tokenAccountsDue(wallet);
      for (const [account, raw] of due) {
        // One not caught up yet (a backlog, a transaction not readable yet) stays due.
        if (await this.scanAddress(connection, job, account)) this.scannedRaw.set(account, raw);
      }
      if (sweep) this.sweptAt.set(wallet, this.now());
    } finally {
      if (job.cursorsMoved) this.persist();
      while (read.size > READ_SIGNATURES_KEPT) read.delete(read.values().next().value as string);
      if (job.found.length) void this.sync(accountId).catch(() => undefined);
    }
    return job.found;
  }

  /** Record the deposits among `address`'s signatures since its cursor (oldest first); true when caught up. */
  private async scanAddress(connection: Connection, job: ScanJob, address: string): Promise<boolean> {
    const cursor = this.cursors[address];
    const key = new PublicKey(address);
    // Newest first, down to the cursor (exclusive); paged when more landed than one page. A first
    // scan (no cursor) looks at the newest few only.
    const limit = cursor ? SIGNATURE_PAGE : FIRST_SCAN_LIMIT;
    const sigs: { signature: string; err: unknown }[] = [];
    let before = cursor ? this.backlog.get(address) : undefined;
    let complete = !cursor;
    for (let page = 0; cursor || page === 0; page++) {
      // Past the last page: one probe for anything left between this window and the cursor.
      const probe = page === MAX_PAGES;
      const batch = await connection.getSignaturesForAddress(key, { until: cursor, before, limit: probe ? 1 : limit }, 'confirmed');
      if (probe) {
        complete = batch.length === 0;
        break;
      }
      sigs.push(...batch);
      if (!cursor) break;
      if (batch.length < limit) {
        complete = true;
        break;
      }
      before = batch[batch.length - 1].signature;
    }
    if (!complete) {
      // More landed since the cursor than one pass reads: go further back next pass and process
      // from the cursor up, so nothing between the cursor and this window is skipped.
      this.backlog.set(address, before!);
      return false;
    }
    this.backlog.delete(address);
    let newest = cursor;
    let caughtUp = true;
    try {
      for (const s of [...sigs].reverse()) {
        if (!s.err && !job.read.has(s.signature)) {
          const res = await readTransaction(connection, s.signature);
          if (res.status === 'missing') {
            caughtUp = false; // not readable yet: resume from here next pass
            break;
          }
          if (res.status === 'unsupported') {
            if (!this.warnedVersions.has(res.version)) {
              this.warnedVersions.add(res.version);
              console.warn(`[wallets] transaction version ${res.version} is not readable yet (first: ${s.signature}); the deposit scan skips such transactions`);
            }
          } else {
            for (const d of parseDeposits(res.tx, job.wallet)) {
              const id = depositId(s.signature, d.mint);
              if (job.known.has(id)) continue;
              job.known.add(id);
              job.found.push(this.recordDeposit(job.accountId, id, s.signature, res.tx, d));
            }
          }
          job.read.add(s.signature);
        }
        newest = s.signature;
      }
    } finally {
      if (newest && newest !== cursor) {
        this.cursors[address] = newest;
        job.cursorsMoved = true;
      }
    }
    return caughtUp;
  }

  /** The wallet's token accounts as of a complete read; closed ones forget their scan state. */
  private noteHoldings(wallet: string, balances: ChainBalances): void {
    const next = new Map<string, bigint>();
    for (const b of balances.tokens.values()) for (const p of b.parts) next.set(p.address, p.raw);
    let pruned = false;
    for (const account of this.holdings.get(wallet)?.keys() ?? []) {
      if (next.has(account)) continue;
      this.scannedRaw.delete(account);
      this.backlog.delete(account);
      if (this.cursors[account] !== undefined) {
        delete this.cursors[account];
        pruned = true;
      }
    }
    this.holdings.set(wallet, next);
    if (pruned) this.persist();
  }

  /** Token accounts to scan now: never scanned, balance moved since their last scan, or all of them on a sweep. */
  private tokenAccountsDue(wallet: string): { due: [string, bigint][]; sweep: boolean } {
    const held = this.holdings.get(wallet);
    if (!held?.size) return { due: [], sweep: false };
    const sweep = this.now() - (this.sweptAt.get(wallet) ?? -Infinity) >= TOKEN_SWEEP_EVERY_MS;
    return { due: [...held].filter(([account, raw]) => sweep || this.cursors[account] === undefined || this.scannedRaw.get(account) !== raw), sweep };
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
