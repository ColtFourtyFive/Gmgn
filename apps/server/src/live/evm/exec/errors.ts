// Engine error codes. Every failure the orchestrator may need to act on has a
// stable code; messages are for logs and users.

export type EvmExecErrorCode =
  | 'unsupported_chain' //         chain not configured for live trading
  | 'invalid_intent' //            bad amount / amountKind / slippage
  | 'no_route' //                  no venue can trade this token
  | 'quote_failed' //              every candidate venue failed to quote
  | 'quote_expired' //             quote older than its validity window
  | 'insufficient_funds' //        native balance below amount + fees + gas
  | 'insufficient_token_balance' //token balance below the sell amount
  | 'proceeds_below_fees' //       a sell too small to pay its fees
  | 'not_allowlisted' //           a step targets a contract / spender outside the allow-list
  | 'invalid_build' //             aggregator calldata failed validation
  | 'simulation_failed' //         the plan reverts in simulation
  | 'slippage' //                  simulated or on-chain output below minOut
  | 'gas_price_cap' //             current fees exceed the chain's cap
  | 'nonce_too_low' //             nonce already used (after a resync retry)
  | 'replacement_underpriced' //   a pending tx holds the nonce at a higher fee (after a resync retry)
  | 'send_failed' //               the RPC refused the transaction
  | 'tx_reverted' //               mined but reverted
  | 'tx_dropped' //                never mined within the timeout
  | 'rpc_error' //                 RPC / API unreachable
  | 'signer_error'; //             the signer refused or failed

export class EvmExecError extends Error {
  constructor(
    public readonly code: EvmExecErrorCode,
    message: string,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'EvmExecError';
  }
}

export function isEvmExecError(err: unknown, code?: EvmExecErrorCode): err is EvmExecError {
  return err instanceof EvmExecError && (code === undefined || err.code === code);
}

/** Map a node's sendRawTransaction / estimateGas error text to an engine code (null = unknown). */
export function classifyRpcError(err: unknown): EvmExecErrorCode | null {
  const text = errorText(err).toLowerCase();
  if (/nonce too low|nonce has already been used|already known.*nonce|invalid nonce|oldnonce/.test(text)) return 'nonce_too_low';
  if (/replacement transaction underpriced|replacement fee too low|underpriced/.test(text)) return 'replacement_underpriced';
  if (/insufficient funds|insufficient balance for transfer|exceeds balance|gas \* price \+ value/.test(text)) return 'insufficient_funds';
  if (/max fee per gas less than block base fee|fee cap less than block base fee|maxfeepergas.*base fee/.test(text)) return 'gas_price_cap';
  if (/execution reverted|revert/.test(text)) return 'simulation_failed';
  return null;
}

/** Custom errors of the routers we call, by selector (names from the openchain signature database). */
export const KNOWN_REVERTS: Record<string, string> = {
  '0x8b063d73': 'V4TooLittleReceived',
  '0x39d35496': 'V3TooLittleReceived',
  '0x849eaf98': 'V2TooLittleReceived',
  '0xc9f52c71': 'TooLittleReceived',
  '0x6a12f104': 'InsufficientETH',
  '0x675cae38': 'InsufficientToken',
  '0x7a5ed734': 'NotEnoughLiquidity',
  '0x5bf6f916': 'TransactionDeadlinePassed',
  '0xd81b2f2e': 'AllowanceExpired',
  '0xf96fb071': 'InsufficientAllowance',
  '0xd4e0248e': 'V3InvalidAmountOut',
  '0x12bacdd3': 'V4TooMuchRequested',
  '0x1ab7da6b': 'DeadlineExpired',
  '0x90bfb865': 'WrappedError',
  '0xac5f6092': 'FeatureDisabled',
  '0x90b8ec18': 'TransferFailed',
  '0xe450d38c': 'ERC20InsufficientBalance',
  '0xfb8f41b2': 'ERC20InsufficientAllowance',
};

/** "execution reverted: <reason>" text for a revert payload (custom error name when known). */
export function describeRevert(message: string, data: string | undefined): string {
  if (!data || data === '0x' || data.length < 10) return message;
  const name = KNOWN_REVERTS[data.slice(0, 10).toLowerCase()];
  return name ? `${message} (${name})` : `${message} (${data.slice(0, 10)})`;
}

export function errorText(err: unknown): string {
  if (err instanceof Error) {
    const details = (err as { details?: string; shortMessage?: string }).details ?? '';
    const short = (err as { shortMessage?: string }).shortMessage ?? '';
    return [err.message, short, details].filter(Boolean).join(' | ');
  }
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}
