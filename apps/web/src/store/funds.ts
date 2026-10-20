// Which funding dialog is open (live mode). Deposit / Withdraw open from the
// balance pill, the portfolio wallet card, the command palette, the phone
// menu and trade errors; the dialogs are mounted once by the shell.

import { create } from 'zustand';

export type FundsDialog = 'deposit' | 'withdraw';

interface FundsState {
  open: FundsDialog | null;
  /** Asset preselected in the Withdraw dialog (null: SOL). */
  mint: string | null;
}

export const useFunds = create<FundsState>(() => ({ open: null, mint: null }));

export function openFunds(dialog: FundsDialog, opts: { mint?: string | null } = {}): void {
  useFunds.setState({ open: dialog, mint: opts.mint ?? null });
}

export function closeFunds(): void {
  useFunds.setState({ open: null, mint: null });
}
