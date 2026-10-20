// Trading copy: order confirmations and the live real-funds acknowledgement.

import { liveOnly, type CopyEntry } from './entry';

export const TRADE_COPY = {
  /** Confirm dialog: a market order's funds note, after "Market buy with preset P1." */
  'trade.confirm.funds': { demo: 'Paper trade — no real funds.', live: 'Executes on Solana mainnet with real funds.' },
  /** Confirm dialog: a buy of a token the security checks flagged, after "Buy 0.5 SOL with preset P1." */
  'trade.confirm.flagged': {
    demo: 'Our simulated audit flagged this token. Paper trades only — but trade it like it’s real.',
    live: 'Automated security checks flagged this token. This trade uses real funds on Solana mainnet.',
  },

  /** One-time acknowledgement before the first live trade (LiveTradeAck). */
  'liveAck.title': liveOnly('Real funds on Solana mainnet'),
  'liveAck.wallet': liveOnly('Orders execute on Solana mainnet with the SOL and tokens in your wallet.'),
  'liveAck.checkbox': liveOnly('I understand that orders execute on Solana mainnet with real funds'),
} satisfies Record<string, CopyEntry>;
