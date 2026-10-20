// Reading an embedded wallet's balances from the chain: SOL (getBalance) and
// every token account it owns under both token programs
// (getParsedTokenAccountsByOwner for SPL Token and Token-2022), summed per mint.

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, type Connection } from '@solana/web3.js';
import { fromBaseUnits } from '../execution/amounts';

export interface ChainTokenBalance {
  mint: string;
  raw: bigint;
  decimals: number;
  /** Token program owning the account(s). */
  program: string;
  /** The token accounts holding it (usually just the associated one). */
  accounts: string[];
}

export interface ChainBalances {
  lamports: bigint;
  tokens: Map<string, ChainTokenBalance>;
  /** Both token programs answered: a mint missing from `tokens` is really not held. */
  complete: boolean;
}

interface ParsedTokenAccount {
  pubkey: PublicKey;
  account: { owner: PublicKey; data: unknown };
}

function tokenAmountOf(data: unknown): { mint: string; amount: string; decimals: number } | null {
  const info = (data as { parsed?: { info?: { mint?: unknown; tokenAmount?: { amount?: unknown; decimals?: unknown } } } })?.parsed?.info;
  const amount = info?.tokenAmount?.amount;
  const decimals = info?.tokenAmount?.decimals;
  if (typeof info?.mint !== 'string' || typeof amount !== 'string' || !/^\d+$/.test(amount) || typeof decimals !== 'number') return null;
  return { mint: info.mint, amount, decimals };
}

function addAccounts(into: Map<string, ChainTokenBalance>, accounts: readonly ParsedTokenAccount[]): void {
  for (const { pubkey, account } of accounts) {
    const t = tokenAmountOf(account.data);
    if (!t) continue;
    const cur = into.get(t.mint);
    if (cur) {
      cur.raw += BigInt(t.amount);
      cur.accounts.push(pubkey.toBase58());
    } else {
      into.set(t.mint, { mint: t.mint, raw: BigInt(t.amount), decimals: t.decimals, program: account.owner.toBase58(), accounts: [pubkey.toBase58()] });
    }
  }
}

/** SOL and every token the wallet holds. */
export async function readChainBalances(connection: Connection, owner: PublicKey): Promise<ChainBalances> {
  const [lamports, spl, t22] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed').catch(() => null),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed').catch(() => null),
  ]);
  const tokens = new Map<string, ChainTokenBalance>();
  if (spl) addAccounts(tokens, spl.value as ParsedTokenAccount[]);
  if (t22) addAccounts(tokens, t22.value as ParsedTokenAccount[]);
  return { lamports: BigInt(lamports), tokens, complete: !!spl && !!t22 };
}

/** The wallet's balance of one mint (null when it holds no account of it). */
export async function readTokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<ChainTokenBalance | null> {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
  const tokens = new Map<string, ChainTokenBalance>();
  addAccounts(tokens, res.value as ParsedTokenAccount[]);
  return tokens.get(mint.toBase58()) ?? null;
}

export const uiAmount = (b: Pick<ChainTokenBalance, 'raw' | 'decimals'>): number => fromBaseUnits(b.raw, b.decimals);
