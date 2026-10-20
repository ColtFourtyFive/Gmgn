// Trade panel "Sell initials" (PRD §6.8.3 TK-T, §7.7): sized live from the
// server's quote, so the panel shows what the click sells and returns; under
// water the action is disabled and the reason is spelled out next to it.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PresetId, SellInitialsQuote, TokenDetail } from '@trenchscope/shared';
import { HandCoins } from 'lucide-react';
import { fetchSellInitials, initialsSummary, initialsUnavailableReason, useSellInitialsQuote } from '@/components/trade/sellInitials';
import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';

export interface SellInitialsRowProps {
  token: TokenDetail;
  presetId: PresetId;
  /** Tokens held (the row only shows with a position). */
  balance: number;
  /** Place the sized sell (through the panel's gates and confirmation). */
  onSell: (quote: SellInitialsQuote) => void;
  pending: boolean;
}

export function SellInitialsRow({ token, presetId, balance, onSell, pending }: SellInitialsRowProps) {
  const qc = useQueryClient();
  const live = useSellInitialsQuote(token.chain, token.address, presetId, true, balance);
  const [sizing, setSizing] = useState(false);
  const q = live.data;
  const reason = q ? initialsUnavailableReason(q, token.symbol) : null;

  const click = () => {
    setSizing(true);
    fetchSellInitials(qc, token.chain, token.address, presetId)
      .then((fresh) => {
        const why = initialsUnavailableReason(fresh, token.symbol);
        if (why || fresh.tokens === null) toast.info('Nothing to take out', why ?? undefined);
        else onSell(fresh);
      })
      .catch((err: unknown) => toast.error('Couldn’t size the sell', errorMessage(err)))
      .finally(() => setSizing(false));
  };

  return (
    <div className="flex flex-col gap-1 rounded border border-line bg-panel-2 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="soft" icon={<HandCoins size={12} />} disabled={!q || q.status !== 'ok'} loading={sizing || pending} onClick={click} aria-describedby={`initials-${token.address}`}>
          Sell initials
        </Button>
        <span className="text-2xs text-faint">Get your cost back, keep the rest</span>
      </div>
      <p id={`initials-${token.address}`} className="text-2xs leading-snug text-muted" aria-live="polite">
        {!q ? (live.isError ? 'Couldn’t size it right now.' : 'Sizing…') : reason ? <span className={q.status === 'under_water' ? 'text-down' : undefined}>{reason}</span> : initialsSummary(q, token.symbol)}
      </p>
    </div>
  );
}
