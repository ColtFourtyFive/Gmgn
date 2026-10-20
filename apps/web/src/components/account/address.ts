// Address helpers for account forms (copy-trade targets, sniper devs, alerts,
// blacklists). Simulated addresses follow the real formats: Solana base58
// (32-44 chars) and EVM hex (0x + 40). EVM addresses are lower-case on the
// server, so comparisons and submissions normalize them.

import { CHAINS, type ChainId } from '@trenchscope/shared';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

const isEvm = (chain: ChainId) => CHAINS[chain].addressStyle === 'evm';

/** True when `value` is a well-formed address for `chain`. */
export function isAddressFor(chain: ChainId, value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return isEvm(chain) ? EVM.test(v) : BASE58.test(v);
}

/** Trimmed address, lower-cased on EVM chains (matches the server's form). */
export function normalizeAddress(chain: ChainId, value: string): string {
  const v = value.trim();
  return isEvm(chain) ? v.toLowerCase() : v;
}

/** Same address on `chain` (case-insensitive on EVM, exact on Solana). */
export function sameAddress(chain: ChainId, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeAddress(chain, a) === normalizeAddress(chain, b);
}

/** Validation message for an address field, or null when valid. */
export function addressError(chain: ChainId, value: string, what = 'address'): string | null {
  const v = value.trim();
  if (!v) return `Enter a ${what}`;
  if (isAddressFor(chain, v)) return null;
  return isEvm(chain)
    ? `Not a valid ${CHAINS[chain].name} ${what} (0x followed by 40 hex characters)`
    : `Not a valid Solana ${what} (32–44 base58 characters)`;
}

/** Placeholder text for an address input on `chain`. */
export function addressPlaceholder(chain: ChainId): string {
  return isEvm(chain) ? '0x…' : 'Solana address (base58)';
}
