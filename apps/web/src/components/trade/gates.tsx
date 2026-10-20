// Safety gates for market orders, shared by the token page's trade panel
// (useTradeExecutor) and every one-click trade (useQuickTrade: ⚡ buttons,
// the Instant-trade dock, quick sells, the Trenches B hotkey). Hard gates
// (honeypot / high risk) need an acknowledgement; soft gates (PRD TE-82:
// price impact, falling knife, fees) need an extra click.

import type { QueryClient } from '@tanstack/react-query';
import type { QuoteRequest, TokenDetail } from '@trenchscope/shared';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { riskReasons, softGateReasons } from '@/components/token/model';
import { tokenKeys } from '@/components/token/queries';
import { api } from '@/lib/api';

export interface TradeGates {
  /** Hard gates (buys only): the trade needs "I understand the risks". */
  risk: string[];
  /** Soft gates: the trade needs an extra click. */
  soft: string[];
}

export const NO_GATES: TradeGates = { risk: [], soft: [] };

export const hasGates = (g: TradeGates) => g.risk.length > 0 || g.soft.length > 0;

/**
 * Gate reasons for a market order. The token's security comes from `token`
 * (the page's live detail) or the detail cache (fetched when cold); the
 * quote for exactly this order from the quote cache (the panel's live quote)
 * or a fresh request. A lookup that fails only drops the reasons it would
 * have given: the swap itself still reports trade errors.
 */
export async function checkTradeGates(qc: QueryClient, req: QuoteRequest, token?: TokenDetail): Promise<TradeGates> {
  const { chain, token: address, side, amount, amountKind, presetId } = req;
  const [detail, quote] = await Promise.all([
    token ??
      qc.fetchQuery({ queryKey: tokenKeys.detail(chain, address), queryFn: () => api.token(chain, address), staleTime: 30_000, retry: false }).catch(() => null),
    qc
      .fetchQuery({
        // Same key as the trade panel's live quote (useLiveQuote), so a fresh one is reused.
        queryKey: tokenKeys.quote({ chain, token: address, side, amount, amountKind, presetId }),
        queryFn: () => api.quote({ chain, token: address, side, amount, amountKind, presetId }),
        staleTime: 2_000,
        retry: false,
      })
      .catch(() => null),
  ]);
  if (!detail) return NO_GATES;
  return { risk: side === 'buy' ? riskReasons(detail) : [], soft: softGateReasons(detail, side, quote) };
}

/** The gate reasons of a trade confirmation: "Why this is risky" (hard) and "Check before you trade" (soft). */
export function GateReasons({ risk, soft }: TradeGates) {
  return (
    <>
      {risk.length > 0 && (
        <div className="rounded border border-down/40 bg-down/10 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-down">
            <ShieldAlert size={14} aria-hidden />
            Why this is risky
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
            {risk.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {soft.length > 0 && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warn">
            <TriangleAlert size={14} aria-hidden />
            Check before you trade
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
            {soft.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
