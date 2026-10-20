// Account pages copy: portfolio and settings headers and sign-in prompts.

import type { CopyEntry } from './entry';

export const ACCOUNT_COPY = {
  'portfolio.subtitle': { demo: 'Paper wallets, positions, orders and trade history', live: 'Wallet, deposits and withdrawals, positions, orders and trade history' },
  /** Signed-out prompt (AccountGate). */
  'portfolio.gate.title': { demo: 'Track your paper portfolio', live: 'Track your portfolio' },
  'portfolio.gate.description': {
    demo: 'Sign in to see your balances, open positions, PnL and every trade across Solana, Base, Robinhood Chain, BNB Chain and Ethereum.',
    live: 'Sign in to see your wallets, deposits and withdrawals, open positions, PnL and every trade.',
  },

  'settings.subtitle': { demo: 'Trading presets, display preferences, blacklist and your account', live: 'Trading presets, display preferences, blacklist, your account and security' },
} satisfies Record<string, CopyEntry>;
