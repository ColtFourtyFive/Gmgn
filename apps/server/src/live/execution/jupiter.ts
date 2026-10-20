// Jupiter Swap API v1 client: quotes (GET {base}/swap/v1/quote) and swap
// instructions (POST {base}/swap/v1/swap-instructions) that the venue
// assembles into its own transaction, with our compute budget, platform fee
// and Jito tip around them. Responses are validated before use.
//
// Checked against lite-api.jup.ag (October 2026; trimmed real responses in
// test/fixtures/jupiter): route steps carry `percent` and a `bps` that may be
// null; refusals are 400 {error, errorCode} (seen: NO_ROUTES_FOUND,
// TOKEN_NOT_TRADABLE, CIRCULAR_ARBITRAGE_IS_DISABLED; the older
// COULD_NOT_FIND_ANY_ROUTE is still accepted);
// swap-instructions answers 200 even when its own simulation of the route
// fails, with `simulationError` {errorCode, error} and computeUnitLimit 1,400,000:
// TRANSACTION_ERROR when the route fails for the wallet, other codes when Jupiter
// could not simulate ("Failed to simulate the swap: RPC failed"). The route
// instruction carries quoted_out_amount and slippage_bps and checks its minimum on
// chain (Jupiter error 6001); the quote's otherAmountThreshold is not sent.

import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { z } from 'zod';

const TIMEOUT_MS = 8000;
/** errorCode values of a 400 that mean "this pair / size cannot be routed" (seen on lite-api.jup.ag). */
const ROUTE_ERROR_CODES = new Set(['NO_ROUTES_FOUND', 'COULD_NOT_FIND_ANY_ROUTE', 'TOKEN_NOT_TRADABLE', 'CIRCULAR_ARBITRAGE_IS_DISABLED']);
/** Leaves room in the 1232-byte transaction for our fee, tip and compute budget instructions. */
const MAX_ROUTE_ACCOUNTS = 54;

const u64String = z.string().regex(/^\d+$/, 'expected an integer string');

export const jupiterQuoteSchema = z
  .object({
    inputMint: z.string(),
    inAmount: u64String,
    outputMint: z.string(),
    outAmount: u64String,
    otherAmountThreshold: u64String,
    swapMode: z.string(),
    slippageBps: z.number(),
    priceImpactPct: z.union([z.string(), z.number()]).optional(),
    routePlan: z.array(
      z
        .object({
          swapInfo: z.object({ ammKey: z.string().optional(), label: z.string().optional(), inputMint: z.string(), outputMint: z.string() }).passthrough(),
          percent: z.number().nullish(),
          bps: z.number().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type JupiterQuote = z.infer<typeof jupiterQuoteSchema>;

const instructionSchema = z.object({
  programId: z.string(),
  accounts: z.array(z.object({ pubkey: z.string(), isSigner: z.boolean(), isWritable: z.boolean() })),
  data: z.string(),
});

export type JupiterInstruction = z.infer<typeof instructionSchema>;

export const swapInstructionsSchema = z
  .object({
    computeBudgetInstructions: z.array(instructionSchema).optional().default([]),
    setupInstructions: z.array(instructionSchema).optional().default([]),
    swapInstruction: instructionSchema,
    cleanupInstruction: instructionSchema.nullable().optional(),
    otherInstructions: z.array(instructionSchema).optional().default([]),
    addressLookupTableAddresses: z.array(z.string()).optional().default([]),
    computeUnitLimit: z.number().optional(),
    /** Jupiter's own simulation of the route for this user failed (the route would fail for us too). */
    simulationError: z.object({ errorCode: z.string().optional(), error: z.string().optional() }).passthrough().nullish(),
  })
  .passthrough();

export type JupiterSwapInstructions = z.infer<typeof swapInstructionsSchema>;

/** No route for this pair / size, or a route that fails for this wallet (a business failure the user can act on). */
export class JupiterRouteError extends Error {}
/** Router unreachable, rate limited or misbehaving (an infrastructure failure). */
export class JupiterUnavailableError extends Error {}

export interface JupiterConfig {
  baseUrl: string;
  apiKey: string | null;
}

export class JupiterClient {
  constructor(
    private readonly config: JupiterConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/swap/v1/${path}`;
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/json' };
    if (json) h['content-type'] = 'application/json';
    if (this.config.apiKey) h['x-api-key'] = this.config.apiKey;
    return h;
  }

  /** ExactIn quote: `amount` base units of inputMint. */
  async quote(params: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number }): Promise<JupiterQuote> {
    const q = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
      slippageBps: String(params.slippageBps),
      swapMode: 'ExactIn',
      restrictIntermediateTokens: 'true',
      maxAccounts: String(MAX_ROUTE_ACCOUNTS),
    });
    const json = await this.request(`${this.url('quote')}?${q}`, { method: 'GET', headers: this.headers(false) });
    const parsed = jupiterQuoteSchema.safeParse(json);
    if (!parsed.success) throw new JupiterUnavailableError(`unexpected quote response: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    if (BigInt(parsed.data.outAmount) <= 0n) throw new JupiterRouteError('no route found for this token');
    return parsed.data;
  }

  /** The instructions of a quoted swap for `user` (SOL wrapped/unwrapped, compute limit simulated). */
  async swapInstructions(quote: JupiterQuote, user: string): Promise<JupiterSwapInstructions> {
    const body = { quoteResponse: quote, userPublicKey: user, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true };
    const json = await this.request(this.url('swap-instructions'), { method: 'POST', headers: this.headers(true), body: JSON.stringify(body) });
    const parsed = swapInstructionsSchema.safeParse(json);
    if (!parsed.success) throw new JupiterUnavailableError(`unexpected swap-instructions response: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    const failed = parsed.data.simulationError;
    if (!failed) return parsed.data;
    // The route itself failed for this wallet (TRANSACTION_ERROR: insufficient funds, ...): ours would too.
    const error = failed.error ?? failed.errorCode ?? 'unknown error';
    if (failed.errorCode === 'TRANSACTION_ERROR' || /Error processing Instruction|custom program error/i.test(error)) throw new JupiterRouteError(simulationFailure(error));
    // Jupiter could not simulate at all ("Failed to simulate the swap: RPC failed"): the instructions stand,
    // but the compute limit it reports (1,400,000) is a default, not a measurement.
    return { ...parsed.data, computeUnitLimit: undefined, computeBudgetInstructions: [] };
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new JupiterUnavailableError(`swap router unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    const json = (await res.json().catch(() => null)) as { error?: unknown; errorCode?: unknown } | null;
    if (res.ok && json) return json;
    const message = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`;
    const code = typeof json?.errorCode === 'string' ? json.errorCode : '';
    // 4xx with a route complaint: the pair or size cannot be routed (e.g. NO_ROUTES_FOUND, TOKEN_NOT_TRADABLE).
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403 && res.status !== 429) {
      if (ROUTE_ERROR_CODES.has(code) || /route|tradable|liquidity|amount/i.test(`${code} ${message}`)) throw new JupiterRouteError(`no route: ${message}`);
    }
    throw new JupiterUnavailableError(`swap router error: ${message}`);
  }
}

/** Jupiter's simulation error ("Error processing Instruction 3: custom program error: 0x1771") in words. */
export function simulationFailure(error: string): string {
  const code = /custom program error: 0x([0-9a-f]+)/i.exec(error);
  if (code && parseInt(code[1], 16) === 6001) return 'slippage exceeded: the price moved past your tolerance';
  if (code && parseInt(code[1], 16) === 1) return 'the swap would fail: insufficient balance';
  return `the swap would fail: ${error}`;
}

/** A Jupiter instruction (base64 data) as a web3.js instruction. */
export function toInstruction(ix: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

/**
 * The compute unit limit Jupiter simulated for the route: its computeUnitLimit field,
 * else the SetComputeUnitLimit instruction it returned (discriminator 2, u32 LE units).
 */
export function routeComputeUnits(res: JupiterSwapInstructions): number | null {
  if (typeof res.computeUnitLimit === 'number' && res.computeUnitLimit > 0) return res.computeUnitLimit;
  for (const ix of res.computeBudgetInstructions) {
    if (ix.programId !== COMPUTE_BUDGET_PROGRAM) continue;
    const data = Buffer.from(ix.data, 'base64');
    if (data.length >= 5 && data[0] === 2) return data.readUInt32LE(1);
  }
  return null;
}

/** "Raydium + PumpSwap" from the route plan, for the quote's venue label. */
export function routeLabel(quote: JupiterQuote): string {
  const labels = [...new Set(quote.routePlan.map((r) => r.swapInfo.label).filter((l): l is string => !!l))];
  return labels.length ? labels.join(' + ') : 'Jupiter';
}
