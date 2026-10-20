import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatNative, type ChainId, type SwapRequest } from '@trenchscope/shared';
import { ConfirmDialog } from '@/components/account/ConfirmDialog';
import { Checkbox } from '@/components/ui';
import { useDisplaySettings, useTradeSettings } from '@/hooks/useSettings';
import { useIsLive } from '@/hooks/useMode';
import { useSwap } from '@/hooks/useSwap';
import { nativeSymbol } from '@/lib/chain';
import { isLiveMode } from '@/lib/mode';
import { requireAuth } from '@/store/session';
import { checkTradeGates, GateReasons, hasGates, type TradeGates } from './gates';
import { ensureLiveTradeAck } from './LiveTradeAck';

/** A one-click market order: buy a native amount or sell a percent of the position. */
export type QuickOrder = { side: 'buy'; amount: number } | { side: 'sell'; percent: number };

/** Stable id of an order (which button shows the spinner). */
export const quickOrderKey = (o: QuickOrder) => (o.side === 'buy' ? `buy:${o.amount}` : `sell:${o.percent}`);

export function quickOrderLabel(o: QuickOrder, chain: ChainId): string {
  return o.side === 'buy' ? `Buy ${formatNative(o.amount, nativeSymbol(chain))}` : `Sell ${o.percent}%`;
}

/** An order waiting for confirmation, with the token it was placed on and its gate reasons. */
interface Held {
  order: QuickOrder;
  token: string;
  symbol?: string;
  gates: TradeGates;
}

/**
 * One-click market trades on a token with the chain's active buy / sell
 * preset: prompts sign-in, runs the same safety gates as the trade panel
 * (high-risk / honeypot buys need "I understand the risks"; price impact,
 * falling knife and fees need an extra click), asks first when "Confirm
 * trades" is on, and toasts the fill (useSwap). Every one-click buy or sell
 * goes through here so the gates and the setting hold everywhere. Render
 * `dialog` once next to the buttons (`confirming` is true while it is
 * open); one order runs at a time (`active` is the key of the order being
 * checked or run). The order keeps the token it was placed on, even if
 * `token` changes while the dialog is open.
 */
export function useQuickTrade(chain: ChainId, token: string, symbol?: string): {
  submit: (o: QuickOrder) => void;
  pending: boolean;
  active: string | null;
  confirming: boolean;
  dialog: ReactNode;
} {
  const trade = useTradeSettings(chain);
  const { confirmTrades } = useDisplaySettings();
  const live = useIsLive();
  const { swap, pending } = useSwap();
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Held | null>(null);
  const [ack, setAck] = useState(false);

  const request = (o: QuickOrder, address: string): SwapRequest =>
    o.side === 'buy'
      ? { chain, token: address, side: 'buy', amount: o.amount, amountKind: 'native', presetId: trade.activeBuyPreset }
      : { chain, token: address, side: 'sell', amount: o.percent, amountKind: 'percent', presetId: trade.activeSellPreset };

  const run = ({ order: o, token: address, symbol: sym }: Held) => {
    setConfirm(null);
    setActive(quickOrderKey(o));
    void swap(request(o, address), { symbol: sym }).finally(() => setActive(null));
  };

  const submit = (o: QuickOrder) => {
    if (pending || checking || !token) return;
    const placed = { order: o, token, symbol };
    requireAuth(() => {
      const gate = () => {
        setChecking(quickOrderKey(o));
        void checkTradeGates(qc, request(o, token)).then((gates) => {
          setChecking(null);
          const held: Held = { ...placed, gates };
          if (hasGates(gates) || confirmTrades) {
            setAck(false);
            setConfirm(held);
          } else run(held);
        });
      };
      // Live: the one-time real-funds acknowledgement comes before the gates (demo stays synchronous).
      if (isLiveMode()) void ensureLiveTradeAck().then((ok) => ok && gate());
      else gate();
    });
  };

  const side = confirm?.order.side;
  const verb = side === 'sell' ? 'Sell' : 'Buy';
  const gates = confirm?.gates;
  const risky = (gates?.risk.length ?? 0) > 0;
  const gated = !!gates && hasGates(gates);
  const name = confirm?.symbol || 'this token';
  const label = confirm ? quickOrderLabel(confirm.order, chain) : '';
  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      onClose={() => setConfirm(null)}
      onConfirm={() => confirm && (!risky || ack) && run(confirm)}
      title={confirm ? (risky ? `High-risk token: ${name}` : `${label} of ${name}?`) : ''}
      description={
        live
          ? risky
            ? `${label} with preset ${trade.activeBuyPreset}. Automated security checks flagged this token. This trade uses real funds on Solana mainnet.`
            : `Market ${side ?? 'order'} with preset ${side === 'sell' ? trade.activeSellPreset : trade.activeBuyPreset}. Executes on Solana mainnet with real funds.`
          : risky
            ? `${label} with preset ${trade.activeBuyPreset}. Our simulated audit flagged this token. Paper trades only — but trade it like it’s real.`
            : `Market ${side ?? 'order'} with preset ${side === 'sell' ? trade.activeSellPreset : trade.activeBuyPreset}. Paper trade — no real funds.`
      }
      confirmLabel={gated ? `${verb} anyway` : verb}
      tone={side === 'sell' ? 'sell' : 'buy'}
      pending={pending}
      confirmDisabled={risky && !ack}
    >
      {gates && gated ? (
        <div className="flex flex-col gap-3">
          <GateReasons {...gates} />
          {risky && <Checkbox checked={ack} onChange={setAck} label="I understand the risks and want to buy" />}
        </div>
      ) : null}
    </ConfirmDialog>
  );

  return { submit, pending: pending || checking !== null, active: active ?? checking, confirming: confirm !== null, dialog };
}
