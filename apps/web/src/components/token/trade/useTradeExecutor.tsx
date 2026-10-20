// Manual swap execution for the trade panel: risk gate (honeypot / high
// risk), optional confirm-before-trade, execution through useSwap and the
// last result shown inline (fill details or the error with a fix).

import { useState, type ReactNode } from 'react';
import { CHAINS, formatCompact, formatPrice, type SwapReceipt, type SwapRequest, type TokenDetail } from '@trenchscope/shared';
import { ShieldAlert } from 'lucide-react';
import { Button, Checkbox, Modal } from '@/components/ui';
import { useDisplaySettings } from '@/hooks/useSettings';
import { useSwap } from '@/hooks/useSwap';
import { formatNativeFor } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';
import { riskReasons } from '../model';

export type TradeResult = { ok: true; receipt: SwapReceipt; at: number } | { ok: false; error: string; at: number };

interface Pending {
  req: SwapRequest;
  /** Order summary rows rendered in the dialog. */
  summary: ReactNode;
  risk: string[];
}

export function useTradeExecutor(token: TokenDetail) {
  const { swap, pending } = useSwap();
  const { confirmTrades } = useDisplaySettings();
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);

  const run = async (req: SwapRequest) => {
    setResult(null);
    const receipt = await swap(req, { symbol: token.symbol, silent: true });
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
      // useSwap already toasted the failure; keep the reason inline with a fix.
      setResult({ ok: false, error: receipt?.error ?? 'The trade request failed', at });
    }
    return receipt;
  };

  /** Validate auth, then gate on risk / confirm setting, then execute. */
  const submit = (req: SwapRequest, summary: ReactNode) =>
    requireAuth(() => {
      const risk = req.side === 'buy' ? riskReasons(token) : [];
      if (risk.length > 0 || confirmTrades) {
        setAck(false);
        setConfirm({ req, summary, risk });
      } else void run(req);
    });

  const close = () => setConfirm(null);
  const isBuy = confirm?.req.side === 'buy';
  const risky = (confirm?.risk.length ?? 0) > 0;

  const dialog = (
    <Modal
      open={!!confirm}
      onClose={close}
      size="sm"
      title={risky ? `High-risk token: ${token.symbol}` : `Confirm ${isBuy ? 'buy' : 'sell'}`}
      description={risky ? 'Our simulated audit flagged this token. Paper trades only — but trade it like it’s real.' : `Paper trade on ${CHAINS[token.chain].name}.`}
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
            {risky ? 'Buy anyway' : isBuy ? 'Confirm buy' : 'Confirm sell'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {risky && (
          <div className="rounded border border-down/40 bg-down/10 p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-down">
              <ShieldAlert size={14} aria-hidden />
              Why this is risky
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
              {confirm?.risk.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded border border-line bg-panel-2 p-2.5 text-sm">{confirm?.summary}</div>
        {risky && <Checkbox checked={ack} onChange={setAck} label="I understand the risks and want to buy" />}
      </div>
    </Modal>
  );

  return { submit, pending, dialog, result, clearResult: () => setResult(null) };
}
