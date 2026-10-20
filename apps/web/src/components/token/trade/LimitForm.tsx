// Limit order: trigger by price or market cap. The direction follows from
// the trigger vs. the current value — buys below = dip, above = breakout;
// sells above = take profit, below = stop loss.

import { useEffect, useState } from 'react';
import { formatPercent, formatPrice, formatUsd, type CreateOrderRequest } from '@trenchscope/shared';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { Native, Price, Usd } from '@/components/common';
import { Button, Field, NumberInput, SegmentedControl } from '@/components/ui';
import { PRESET_LABEL } from '@/hooks/useSettings';
import { formatNativeFor } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { changeVs } from '../model';
import { useCreateOrder } from '../queries';
import { BuyAmount, SellAmount, type SellUnit } from './AmountFields';
import { StartTradingCta, type TradeFormProps } from './shared';

type TriggerType = 'price' | 'mcap';
type Expiry = '1' | '24' | '72' | 'gtc';

const EXPIRY_ITEMS: { value: Expiry; label: string }[] = [
  { value: '1', label: '1h' },
  { value: '24', label: '24h' },
  { value: '72', label: '3d' },
  { value: 'gtc', label: 'GTC' },
];
const BUY_OFFSETS = [-0.5, -0.25, -0.1, 0.2];
const SELL_OFFSETS = [-0.2, 0.25, 0.5, 1];

function sigRound(v: number, digits = 4): number {
  if (!Number.isFinite(v) || v === 0) return v;
  return Number(v.toPrecision(digits));
}

export function LimitForm(props: TradeFormProps & { defaultTrigger: TriggerType }) {
  const { token, side, presetId, trade, position, signedIn, balance, maxBuy, inputRef, onTopUp, topUpPending, defaultTrigger } = props;
  const buy = side === 'buy';
  const [triggerType, setTriggerType] = useState<TriggerType>(defaultTrigger);
  const current = triggerType === 'mcap' ? token.marketCapUsd : token.priceUsd;
  const [trigger, setTrigger] = useState<number | null>(null);
  const [buyAmount, setBuyAmount] = useState<number | null>(trade.instantBuyAmount);
  const [sellUnit, setSellUnit] = useState<SellUnit>('percent');
  const [sellValue, setSellValue] = useState<number | null>(100);
  const [expiry, setExpiry] = useState<Expiry>('24');
  const { create, pending } = useCreateOrder();

  // Prefill a sensible trigger when the side or trigger type changes.
  useEffect(() => {
    setTrigger(sigRound(current * (buy ? 0.75 : 1.5)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, triggerType]);

  const delta = changeVs(trigger, current);
  const above = delta !== null && delta > 0;
  const intent = delta === null ? null : buy ? (above ? 'Breakout buy' : 'Buy the dip') : above ? 'Take profit' : 'Stop loss';
  const held = position?.balance ?? 0;
  const amount = buy ? buyAmount : sellValue;
  const invalid = !trigger || trigger <= 0 || !amount || amount <= 0 || (!buy && held <= 0) || (buy && maxBuy !== null && amount > maxBuy);
  const fmt = (v: number) => (triggerType === 'mcap' ? formatUsd(v) : formatPrice(v));

  const submit = () =>
    requireAuth(() => {
      if (!trigger || !amount) return;
      const req: CreateOrderRequest = {
        chain: token.chain,
        token: token.address,
        kind: buy ? 'limit_buy' : 'limit_sell',
        triggerType,
        triggerValue: trigger,
        amount,
        amountKind: buy ? 'native' : sellUnit,
        presetId,
        direction: above ? 'above' : 'below',
        expiresInHours: expiry === 'gtc' ? undefined : Number(expiry),
      };
      const what = buy ? `Buy ${formatNativeFor(token.chain, amount)}` : sellUnit === 'percent' ? `Sell ${amount}%` : `Sell ${amount} ${token.symbol}`;
      void create(req, {
        title: `${intent ?? 'Limit'} order placed`,
        body: `${what} of ${token.symbol} when ${triggerType === 'mcap' ? 'MC' : 'price'} ${above ? '≥' : '≤'} ${fmt(trigger)}${expiry === 'gtc' ? '' : ` · expires in ${EXPIRY_ITEMS.find((e) => e.value === expiry)?.label}`}`,
      });
    });

  const offsets = buy ? BUY_OFFSETS : SELL_OFFSETS;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">
            Trigger
          </span>
          <SegmentedControl
            size="sm"
            value={triggerType}
            onChange={setTriggerType}
            items={[
              { value: 'mcap', label: 'MC' },
              { value: 'price', label: 'Price' },
            ]}
            aria-label="Trigger on"
          />
        </div>
        <NumberInput
          value={trigger}
          onChange={setTrigger}
          min={0}
          step={triggerType === 'mcap' ? 1000 : current / 100 || 0.000001}
          prefix="$"
          aria-label={triggerType === 'mcap' ? 'Trigger market cap (USD)' : 'Trigger price (USD)'}
          suffix={<span className="text-2xs text-faint">{triggerType === 'mcap' ? 'MC' : 'USD'}</span>}
        />
        <div className="grid grid-cols-4 gap-1">
          {offsets.map((o) => (
            <button
              key={o}
              type="button"
              className="num h-6 rounded border border-line text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
              onClick={() => setTrigger(sigRound(current * (1 + o)))}
            >
              {formatPercent(o, { digits: 0 })}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 rounded bg-panel-2 px-2 py-1.5 text-xs">
        <span className="flex items-center justify-between gap-2 text-muted">
          Current {triggerType === 'mcap' ? 'MC' : 'price'}
          <span className="num text-fg">{triggerType === 'mcap' ? <Usd value={current} /> : <Price value={current} />}</span>
        </span>
        {intent && delta !== null && (
          <span className={clsx('flex items-center gap-1 font-medium', above ? 'text-up' : 'text-down')}>
            {above ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
            {intent} · fires {above ? 'above' : 'below'} {formatPercent(delta, { digits: Math.abs(delta) < 0.1 ? 1 : 0 })} from now
          </span>
        )}
      </div>
      {buy ? (
        <BuyAmount
          ref={inputRef}
          chain={token.chain}
          value={buyAmount}
          onChange={setBuyAmount}
          quickAmounts={trade.quickBuyAmounts}
          balance={balance}
          max={maxBuy}
          onTopUp={signedIn ? onTopUp : undefined}
          topUpPending={topUpPending}
        />
      ) : (
        <SellAmount
          ref={inputRef}
          symbol={token.symbol}
          unit={sellUnit}
          onUnitChange={setSellUnit}
          value={sellValue}
          onChange={setSellValue}
          quickPercents={trade.quickSellPercents}
          position={position}
          priceUsd={token.priceUsd}
          signedIn={signedIn}
        />
      )}
      <Field label="Expires">
        <SegmentedControl size="sm" value={expiry} onChange={setExpiry} items={EXPIRY_ITEMS} aria-label="Order expiry" className="w-full [&>button]:flex-1 [&>button]:justify-center" />
      </Field>
      {!buy && signedIn && held <= 0 && <p className="rounded bg-panel-2 px-2 py-1.5 text-xs text-muted">You need a {token.symbol} position to place a limit sell.</p>}
      {signedIn ? (
        <Button variant={buy ? 'buy' : 'sell'} block className="!h-9 text-md" loading={pending} disabled={invalid} onClick={submit}>
          {buy ? 'Place limit buy' : 'Place limit sell'}
          {buy && buyAmount ? (
            <span className="font-normal opacity-80">
              · <Native value={buyAmount} chain={token.chain} />
            </span>
          ) : null}
        </Button>
      ) : (
        <StartTradingCta />
      )}
      <p className="text-2xs text-faint">Executes with preset {PRESET_LABEL[presetId].long} when the trigger is crossed. Orders run server-side, even with this page closed.</p>
    </div>
  );
}
