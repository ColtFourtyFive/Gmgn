// Jito block engine: MEV-protected sends. An anti-MEV swap carries a tip to
// one of Jito's tip accounts and goes only to the block engine
// (POST {jitoUrl}/api/v1/transactions, base64), never to public RPC, so it
// cannot be seen and sandwiched before it lands.

import { PublicKey } from '@solana/web3.js';

/** Jito mainnet tip accounts (published by Jito; a tip may go to any of them). */
export const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

/** The block engine ignores bundles tipping less than this. */
export const JITO_MIN_TIP_LAMPORTS = 1000n;

const SEND_TIMEOUT_MS = 8000;

export function pickTipAccount(random: () => number = Math.random): PublicKey {
  return new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(random() * JITO_TIP_ACCOUNTS.length) % JITO_TIP_ACCOUNTS.length]);
}

export function isJitoTipAccount(address: string): boolean {
  return JITO_TIP_ACCOUNTS.includes(address);
}

/** The block engine's sendTransaction endpoint; bundleOnly keeps the transaction off the public path. */
export function jitoTransactionsUrl(jitoUrl: string): string {
  return `${jitoUrl.replace(/\/+$/, '')}/api/v1/transactions?bundleOnly=true`;
}

export class JitoSendError extends Error {
  constructor(
    message: string,
    /** True when the request may have reached the block engine (network error, timeout): the transaction may still land. */
    readonly ambiguous: boolean,
  ) {
    super(message);
  }
}

/** Send a signed transaction to the block engine; resolves with the signature it reports. */
export async function sendViaJito(fetchFn: typeof fetch, jitoUrl: string, raw: Uint8Array): Promise<string> {
  const body = { jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [Buffer.from(raw).toString('base64'), { encoding: 'base64' }] };
  let res: Response;
  try {
    res = await fetchFn(jitoTransactionsUrl(jitoUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    throw new JitoSendError(`block engine unreachable: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  const json = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
  if (!res.ok || !json || json.error || typeof json.result !== 'string') {
    const reason = json?.error?.message ?? `HTTP ${res.status}`;
    throw new JitoSendError(`block engine rejected the transaction: ${reason}`, res.status >= 500);
  }
  return json.result;
}
