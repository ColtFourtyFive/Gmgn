// Offline stand-ins for the live stack: a fake Solana RPC Connection that
// implements only the methods the live modules call, an in-memory DurableStore,
// a fixture loader with address placeholders, and a minimal live AppContext.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  VersionedTransaction,
  type Connection,
  type SignatureStatus,
  type TransactionError,
} from '@solana/web3.js';
import bs58 from 'bs58';
import type { ChainId, WalletTransfer } from '@trenchscope/shared';
import { defaultSettings } from '../../../src/accounts/settings';
import { defaultConfig } from '../../../src/app';
import type { AccountsApi, AppContext, AuditRecord, DurableStore, EmbeddedWalletRef, LiveFillRecord, LiveServices, SignerApi } from '../../../src/context';
import type { LiveConfig } from '../../../src/live/config';
import { Engine } from '../../../src/sim/engine';
import { World, type TokenState, type WalletState } from '../../../src/sim/world';
import { Hub } from '../../../src/ws/hub';

export const FIXTURES = join(__dirname, '..');

/** A fixture file with `<NAME>` placeholders replaced. */
export function fixture<T = unknown>(path: string, vars: Record<string, string> = {}): T {
  let text = readFileSync(join(FIXTURES, path), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.split(`<${k}>`).join(v);
  return JSON.parse(text) as T;
}

export const newAddress = () => Keypair.generate().publicKey.toBase58();

interface TokenAccount {
  pubkey: string;
  mint: string;
  raw: bigint;
  decimals: number;
  program: string;
}

export interface SentTx {
  raw: Uint8Array;
  tx: VersionedTransaction;
  signature: string;
  via: 'rpc' | 'jito';
  skipPreflight: boolean;
}

/** The parts of web3.js's Connection the live modules use, backed by in-memory state. */
export class FakeConnection {
  lamports = new Map<string, bigint>();
  tokenAccounts = new Map<string, TokenAccount[]>();
  accounts = new Map<string, { owner: PublicKey; lamports: number; data: Buffer }>();
  lookupTables = new Map<string, AddressLookupTableAccount>();
  sent: SentTx[] = [];
  blockHeight = 1000;
  lastValidBlockHeight = 1150;
  /** Signature -> status the RPC reports (null = unknown). Defaults to confirmed on the first poll. */
  statuses = new Map<string, SignatureStatus | null>();
  /** Signature -> getTransaction response. */
  transactions = new Map<string, unknown>();
  /** Built per send when no transaction was registered for its signature. */
  onSend: ((s: SentTx) => void) | null = null;
  sendError: Error | null = null;
  signaturesFor = new Map<string, { signature: string; err: TransactionError | null; blockTime: number | null }[]>();
  calls: string[] = [];
  autoConfirm = true;

  setBalance(owner: string, lamports: bigint): void {
    this.lamports.set(owner, lamports);
  }

  setToken(owner: string, mint: string, raw: bigint, decimals: number, program = TOKEN_PROGRAM_ID.toBase58()): void {
    const list = (this.tokenAccounts.get(owner) ?? []).filter((t) => t.mint !== mint);
    list.push({ pubkey: newAddress(), mint, raw, decimals, program });
    this.tokenAccounts.set(owner, list);
  }

  async getBalance(owner: PublicKey): Promise<number> {
    this.calls.push('getBalance');
    return Number(this.lamports.get(owner.toBase58()) ?? 0n);
  }

  async getParsedTokenAccountsByOwner(owner: PublicKey, filter: { mint?: PublicKey; programId?: PublicKey }) {
    this.calls.push('getParsedTokenAccountsByOwner');
    const list = (this.tokenAccounts.get(owner.toBase58()) ?? []).filter(
      (t) => (!filter.mint || t.mint === filter.mint.toBase58()) && (!filter.programId || t.program === filter.programId.toBase58()),
    );
    return {
      context: { slot: 1 },
      value: list.map((t) => ({
        pubkey: new PublicKey(t.pubkey),
        account: {
          owner: new PublicKey(t.program),
          lamports: 2039280,
          executable: false,
          data: { program: 'spl-token', space: 165, parsed: { type: 'account', info: { mint: t.mint, owner: owner.toBase58(), tokenAmount: { amount: t.raw.toString(), decimals: t.decimals } } } },
        },
      })),
    };
  }

  async getAccountInfo(key: PublicKey) {
    this.calls.push('getAccountInfo');
    const a = this.accounts.get(key.toBase58());
    return a ? { ...a, executable: false, rentEpoch: 0 } : null;
  }

  async getAddressLookupTable(key: PublicKey) {
    this.calls.push('getAddressLookupTable');
    return { context: { slot: 1 }, value: this.lookupTables.get(key.toBase58()) ?? null };
  }

  async getLatestBlockhash() {
    this.calls.push('getLatestBlockhash');
    return { blockhash: bs58.encode(Keypair.generate().publicKey.toBytes()), lastValidBlockHeight: this.lastValidBlockHeight };
  }

  async getBlockHeight() {
    return this.blockHeight;
  }

  async sendRawTransaction(raw: Uint8Array, opts: { skipPreflight?: boolean } = {}): Promise<string> {
    this.calls.push('sendRawTransaction');
    if (this.sendError) throw this.sendError;
    return this.record(raw, 'rpc', !!opts.skipPreflight);
  }

  /** Book a transaction that reached a send endpoint (RPC or the Jito stub). */
  record(raw: Uint8Array, via: 'rpc' | 'jito', skipPreflight: boolean): string {
    const tx = VersionedTransaction.deserialize(raw);
    const signature = bs58.encode(tx.signatures[0]);
    const s: SentTx = { raw, tx, signature, via, skipPreflight };
    this.sent.push(s);
    if (this.autoConfirm && !this.statuses.has(signature)) {
      this.statuses.set(signature, { slot: 300000123, confirmations: 1, err: null, confirmationStatus: 'confirmed' });
    }
    this.onSend?.(s);
    return signature;
  }

  async getSignatureStatuses(sigs: string[]) {
    this.calls.push('getSignatureStatuses');
    return { context: { slot: 1 }, value: sigs.map((s) => this.statuses.get(s) ?? null) };
  }

  async getTransaction(sig: string) {
    this.calls.push('getTransaction');
    return this.transactions.get(sig) ?? null;
  }

  async getSignaturesForAddress(owner: PublicKey, opts: { until?: string; before?: string; limit?: number } = {}) {
    this.calls.push('getSignaturesForAddress');
    let list = this.signaturesFor.get(owner.toBase58()) ?? []; // newest first
    if (opts.before) list = list.slice(list.findIndex((s) => s.signature === opts.before) + 1);
    if (opts.until) {
      const i = list.findIndex((s) => s.signature === opts.until);
      if (i >= 0) list = list.slice(0, i);
    }
    return list.slice(0, opts.limit ?? 1000).map((s) => ({ ...s, slot: 1, memo: null, confirmationStatus: 'confirmed' as const }));
  }

  asConnection(): Connection {
    return this as unknown as Connection;
  }
}

/** An address lookup table holding `addresses`. */
export function lookupTable(key: string, addresses: string[]): AddressLookupTableAccount {
  return new AddressLookupTableAccount({
    key: new PublicKey(key),
    state: { deactivationSlot: BigInt('18446744073709551615'), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: addresses.map((a) => new PublicKey(a)) },
  });
}

export class MemoryStore implements DurableStore {
  states = new Map<string, unknown>();
  audits: AuditRecord[] = [];
  fills: LiveFillRecord[] = [];
  transfers = new Map<string, { accountId: string; transfer: WalletTransfer; clientId?: string }>();
  upserts: WalletTransfer[] = [];

  getState(key: string): unknown {
    return this.states.get(key) ?? null;
  }
  putState(key: string, value: unknown): void {
    this.states.set(key, structuredClone(value));
  }
  appendAudit(rec: AuditRecord): void {
    this.audits.push(rec);
  }
  auditFor(accountId: string, limit: number): AuditRecord[] {
    return this.audits.filter((a) => a.accountId === accountId).reverse().slice(0, limit);
  }
  appendFill(fill: LiveFillRecord): boolean {
    if (this.fills.some((f) => f.accountId === fill.accountId && f.signature === fill.signature)) return false;
    this.fills.push(fill);
    return true;
  }
  fillsFor(accountId: string, opts: { token?: string; limit: number }): LiveFillRecord[] {
    return this.fills.filter((f) => f.accountId === accountId && (!opts.token || f.token === opts.token)).reverse().slice(0, opts.limit);
  }
  upsertTransfer(accountId: string, t: WalletTransfer, clientId?: string): void {
    const prev = this.transfers.get(t.id);
    this.transfers.set(t.id, { accountId, transfer: { ...t }, clientId: clientId ?? prev?.clientId });
    this.upserts.push({ ...t });
  }
  transfersFor(accountId: string, limit: number): WalletTransfer[] {
    return [...this.transfers.values()]
      .filter((r) => r.accountId === accountId)
      .map((r) => r.transfer)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
  transferByClientId(accountId: string, clientId: string): WalletTransfer | null {
    for (const r of this.transfers.values()) if (r.accountId === accountId && r.clientId === clientId) return r.transfer;
    return null;
  }
  openTransfers(): { accountId: string; transfer: WalletTransfer }[] {
    return [...this.transfers.values()].filter((r) => r.transfer.status === 'pending' || r.transfer.status === 'sent').map(({ accountId, transfer }) => ({ accountId, transfer }));
  }
  close(): void {}
}

/** Signs with in-memory keypairs (one per wallet address), optionally after a delay (to observe send ordering). */
export class KeypairSigner implements SignerApi {
  readonly provider = 'local-dev';
  delayMs = 0;
  signed: string[] = [];
  /** Event log: `sign-start:<address>` / `sign-end:<address>`. */
  events: string[] = [];
  readonly keys = new Map<string, Keypair>();
  async createWallet(_accountId: string, chain: ChainId): Promise<EmbeddedWalletRef> {
    const kp = Keypair.generate();
    this.keys.set(kp.publicKey.toBase58(), kp);
    return { chain, address: kp.publicKey.toBase58(), provider: this.provider, providerWalletId: 'kp' };
  }
  async signTransaction(ref: EmbeddedWalletRef, tx: VersionedTransaction): Promise<VersionedTransaction> {
    this.events.push(`sign-start:${ref.address}`);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const kp = this.keys.get(ref.address);
    if (!kp) throw new Error('unknown wallet');
    tx.sign([kp]);
    this.signed.push(bs58.encode(tx.signatures[0]));
    this.events.push(`sign-end:${ref.address}`);
    return tx;
  }
}

export const FEE_WALLET = newAddress();

export function liveConfig(patch: Partial<LiveConfig> = {}): LiveConfig {
  return {
    chain: 'sol',
    rpcUrl: 'http://rpc.test.invalid',
    wsUrl: null,
    feed: { pumpPortalUrl: 'wss://feed.test.invalid', maxTrackedTokens: 100 },
    jupiter: { baseUrl: 'https://jup.test.invalid', apiKey: 'test-key' },
    jitoUrl: 'https://jito.test.invalid',
    signer: { provider: 'local-dev', turnkey: null, localKeystoreKey: null },
    fees: { platformFeeBps: 80, feeWallet: FEE_WALLET },
    ipfsGateways: [],
    ...patch,
  };
}

export interface LiveUser {
  accountId: string;
  keypair: Keypair;
  ref: EmbeddedWalletRef;
  wallet: WalletState;
}

export interface LiveHarness {
  ctx: AppContext;
  world: World;
  conn: FakeConnection;
  store: MemoryStore;
  signer: KeypairSigner;
  users: Map<string, LiveUser>;
  addUser(accountId?: string, keypair?: Keypair): LiveUser;
  accounts: AccountsApi & {
    notify: ReturnType<typeof vi.fn>;
    pushBalance: ReturnType<typeof vi.fn>;
    recordTradeVolume: ReturnType<typeof vi.fn>;
    audit: ReturnType<typeof vi.fn>;
    secondFactor: Map<string, string>;
    whitelist: Set<string>;
  };
  publishUser: ReturnType<typeof vi.spyOn>;
}

/**
 * A live-mode context over the fake chain: real World / Engine / Hub, accounts reduced to the
 * hooks the live modules use (2FA and whitelist answers are configurable per test).
 */
export function liveHarness(opts: { config?: Partial<LiveConfig>; signer?: boolean } = {}): LiveHarness {
  const world = new World('live-test', 1_760_000_000_000);
  world.setNativeUsd('sol', 200);
  const engine = new Engine(world);
  const hub = new Hub();
  const conn = new FakeConnection();
  const store = new MemoryStore();
  const users = new Map<string, LiveUser>();
  const settings = new Map<string, ReturnType<typeof defaultSettings>>();
  const signer = new KeypairSigner();
  const live: LiveServices = { config: liveConfig(opts.config), connection: conn.asConnection(), signer: opts.signer === false ? null : signer };
  const secondFactor = new Map<string, string>();
  const whitelist = new Set<string>();
  const accounts = {
    secondFactor,
    whitelist,
    resolveToken: () => null,
    getAccount: (id: string) => {
      const u = users.get(id);
      return u ? ({ id, username: id, createdAt: 0, referralCode: 'X', referredBy: null, wallets: { sol: { chain: 'sol', address: u.wallet.address, nativeBalance: u.wallet.native, nativeBalanceUsd: 0 } } } as never) : null;
    },
    walletFor: (id: string) => users.get(id)!.wallet,
    accountIdForWallet: (address: string) => [...users.values()].find((u) => u.wallet.address === address)?.accountId ?? null,
    getSettings: (id: string) => {
      if (!settings.has(id)) settings.set(id, defaultSettings());
      return settings.get(id)!;
    },
    isFollowing: () => false,
    remarkFor: () => null,
    followedWallets: () => [],
    followersOf: () => [],
    followerCount: () => 0,
    watchedWallets: () => new Set<string>(),
    watchlist: () => [],
    notify: vi.fn((_id: string, n: object) => ({ ...n, id: 'n', createdAt: 0, read: false })),
    recordTradeVolume: vi.fn(),
    pushBalance: vi.fn(),
    walletRef: (id: string) => users.get(id)?.ref ?? null,
    hasSecondFactor: (id: string) => secondFactor.has(id),
    verifySecondFactor: (id: string, code: string) => secondFactor.get(id) === code,
    canWithdrawTo: (_id: string, _chain: ChainId, address: string) => whitelist.has(address),
    audit: vi.fn((accountId: string | null, action: string, detail: Record<string, unknown>) => store.appendAudit({ at: world.now, accountId, action, ip: null, detail })),
    serialize: () => null,
    restore: () => {},
  } as unknown as LiveHarness['accounts'];
  const config = defaultConfig({ mode: 'live', live: live.config, liveProblems: [], warmupMinutes: 0, snapshotEveryMs: 0 });
  const ctx = {
    config,
    world,
    engine,
    hub,
    accounts,
    analytics: {} as AppContext['analytics'],
    trading: {} as AppContext['trading'],
    market: { mode: 'live', ensureToken: vi.fn(async () => null) } as unknown as AppContext['market'],
    live,
    store,
  } as AppContext;
  const publishUser = vi.spyOn(hub, 'publishUser');
  const addUser = (accountId = `acc_${users.size + 1}`, keypair = Keypair.generate()): LiveUser => {
    const address = keypair.publicKey.toBase58();
    signer.keys.set(address, keypair);
    const wallet = world.createWallet('sol', 'user', { address, accountId, native: 0 });
    const ref: EmbeddedWalletRef = { chain: 'sol', address, provider: 'local-dev', providerWalletId: 'kp' };
    const user = { accountId, keypair, ref, wallet };
    users.set(accountId, user);
    return user;
  };
  return { ctx, world, conn, store, signer, users, addUser, accounts, publishUser };
}

/** A token in the World: on its pump.fun curve, or migrated to a pool (routed through Jupiter). */
export function addToken(world: World, opts: { status: 'curve' | 'migrated'; address?: string; decimals?: number }): TokenState {
  const address = opts.address ?? newAddress();
  return world.addExternalToken({
    chain: 'sol',
    address,
    launchpad: 'pump',
    symbol: 'TEST',
    name: 'Test Token',
    description: '',
    imageUrl: null,
    metadataUri: null,
    creator: newAddress(),
    createdAt: world.now - 3 * 3_600_000,
    decimals: opts.decimals ?? 6,
    totalSupply: 1e9,
    status: opts.status,
    curve:
      opts.status === 'curve'
        ? { virtualNative: 30, virtualTokens: 1_073_000_000, realNative: 0, realTokens: 793_100_000, initialRealTokens: 793_100_000, feeRate: 0.0125 }
        : null,
    pool: opts.status === 'migrated' ? { address: newAddress(), dex: 'PumpSwap', feeRate: 0.0025, native: 85, tokens: 206_900_000, lpBurnedRate: 1 } : null,
    socials: {},
    narrative: 'meme',
    logoGlyph: 'T',
  });
}

/** fetch stub routing Jupiter and Jito requests to handlers; records every request. */
export function fakeFetch(routes: { quote?: (url: URL) => unknown; swapInstructions?: (body: Record<string, unknown>) => unknown; jito?: (body: { params: [string, unknown] }) => unknown }) {
  const requests: { url: URL; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body });
    const respond = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/swap/v1/quote') && routes.quote) {
      const out = routes.quote(url) as { status?: number; json?: unknown } | object;
      return 'status' in out && 'json' in out ? respond(out.status as number, out.json) : respond(200, out);
    }
    if (url.pathname.endsWith('/swap/v1/swap-instructions') && routes.swapInstructions) return respond(200, routes.swapInstructions(body));
    if (url.pathname.endsWith('/api/v1/transactions') && routes.jito) return respond(200, routes.jito(body));
    return respond(404, { error: 'not found' });
  });
  return { fetch: fn as unknown as typeof fetch, requests };
}
