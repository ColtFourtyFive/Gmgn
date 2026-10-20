// Manual swap execution for the trade panel: safety gates (hard: honeypot /
// high risk; soft: price impact, falling knife, fees — components/trade/gates),
// optional confirm-before-trade, execution through useSwap and the last
// result shown inline (fill details or the error with a fix).

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatCompact, formatPrice, type SwapReceipt, type SwapRequest, type TokenDetail } from '@trenchscope/shared';
import { checkTradeGates, GateReasons } from '@/components/trade/gates';
import { ensureLiveTradeAck } from '@/components/trade/LiveTradeAck';
import { Button, Checkbox, Modal } from '@/components/ui';
import { useIsLive } from '@/hooks/useMode';
import { useDisplaySettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { formatNativeFor } from '@/lib/format';
import { isLiveMode } from '@/lib/mode';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';

export type TradeResult = { ok: true; receipt: SwapReceipt; at: number } | { ok: false; error: string; at: number };

interface Pending {
  req: SwapRequest;
  /** Order summary rows rendered in the dialog. */
  summary: ReactNode;
  /** Hard gates: need "I understand the risks". */
  risk: string[];
  /** Soft gates: need the extra click. */
  soft: string[];
}

export function useTradeExecutor(token: TokenDetail) {
  const { swap, pending, error } = useSwap();
  const { confirmTrades } = useDisplaySettings();
  const live = useIsLive();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);

  const run = async (req: SwapRequest) => {
    setResult(null);
    // The outcome shows inline (TradeResultLine): no fill toast from useSwap, no failure toast either.
    const receipt = await swap(req, { symbol: token.symbol, silent: true, silentError: true });
    const at = Date.now();
    if (receipt?.ok) {
      const verb = req.side === 'buy' ? 'Bought' : 'Sold';
      const mev = receipt.mevLossNative > 0 ? ` · MEV −${formatNativeFor(token.chain, receipt.mevLossNative)}` : '';
      const exits = receipt.orders.length ? ` · ${receipt.orders.length} exit order${receipt.orders.length === 1 ? '' : 's'}` : '';
      toast.success(
        `${verb} ${token.symbol}`,
        `${formatCompact(receipt.tokenAmount)} ${token.symbol} for ${formatNativeFor(token.chain, receipt.nativeAmount)} @ ${formatPrice(receipt.priceUsd)} · ${receipt.latencyMs}ms${exits}${mev}`,
      );
      setResult({ ok: true, receipt, at });
    } else {
      // A rejected request has no receipt: its reason is useSwap's `error`, read at render.
      setResult({ ok: false, error: receipt?.error ?? '', at });
    }
    return receipt;
  };

  /** Validate auth (and, live, the one-time real-funds acknowledgement), then gate on risk / soft gates (quote of this exact order) / confirm setting, then execute. */
  const submit = (req: SwapRequest, summary: ReactNode) =>
    requireAuth(() => {
      if (checking) return;
      const gate = () => {
        setChecking(true);
        void checkTradeGates(qc, req, token).then(({ risk, soft }) => {
          setChecking(false);
          if (risk.length > 0 || soft.length > 0 || confirmTrades) {
            setAck(false);
            setConfirm({ req, summary, risk, soft });
          } else void run(req);
        });
      };
      if (isLiveMode()) void ensureLiveTradeAck().then((ok) => ok && gate());
      else gate();
    });

  const close = () => setConfirm(null);
  const isBuy = confirm?.req.side === 'buy';
  const risky = (confirm?.risk.length ?? 0) > 0;
  const soft = (confirm?.soft.length ?? 0) > 0;

  const dialog = (
    <Modal
      open={!!confirm}
      onClose={close}
      size="sm"
      title={risky ? `High-risk token: ${token.symbol}` : soft ? `Check this ${isBuy ? 'buy' : 'sell'}` : `Confirm ${isBuy ? 'buy' : 'sell'}`}
      description={
        live
          ? risky
            ? 'Automated security checks flagged this token. This trade uses real funds on Solana mainnet.'
            : `Executes on ${CHAINS[token.chain].name} mainnet with real funds.`
          : risky
            ? 'Our simulated audit flagged this token. Paper trades only — but trade it like it’s real.'
            : `Paper trade on ${CHAINS[token.chain].name}.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={isBuy ? 'buy' : 'sell'}
            disabled={risky && !ack}
            loading={pending}
            data-autofocus={risky ? undefined : true}
            onClick={() => {
              const req = confirm?.req;
              close();
              if (req) void run(req);
            }}
          >
            {risky || soft ? `${isBuy ? 'Buy' : 'Sell'} anyway` : isBuy ? 'Confirm buy' : 'Confirm sell'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {confirm && <GateReasons risk={confirm.risk} soft={confirm.soft} />}
        <div className="rounded border border-line bg-panel-2 p-2.5 text-sm">{confirm?.summary}</div>
        {risky && <Checkbox checked={ack} onChange={setAck} label="I understand the risks and want to buy" />}
      </div>
    </Modal>
  );

  const shown: TradeResult | null = result && !result.ok && !result.error ? { ...result, error: error ?? 'The trade request failed' } : result;
  return { submit, pending: pending || checking, dialog, result: shown, clearResult: () => setResult(null) };
}
