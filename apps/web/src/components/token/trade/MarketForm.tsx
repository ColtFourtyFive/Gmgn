// Market order: buy a native amount or sell a percent / token amount now,
// or "sell initials" (just enough to get the position's cost back).

import { useEffect, useState } from 'react';
import { formatCompact, formatNative, formatPercent, type SellInitialsQuote, type SwapRequest, PRESET_LABELS } from '@trenchscope/shared';
import { Button } from '@/components/ui';
import { nativeSymbol } from '@/lib/chain';
import { Compact, Native, Pct, Usd } from '@/components/common';
import { slippageLabel } from './PresetBar';
import { BuyAmount, SellAmount, type SellUnit } from './AmountFields';
import { QuotePreview, useLiveQuote } from './QuotePreview';
import { SellInitialsRow } from './SellInitials';
import { StartTradingCta, SummaryRow, TradeResultLine, type TradeFormProps } from './shared';
import { useTradeExecutor } from './useTradeExecutor';

export function MarketForm(props: TradeFormProps) {
  const { token, side, presetId, preset, trade, position, signedIn, balance, maxBuy, inputRef, onTopUp, topUpPending, onRaiseSlippage } = props;
  const buy = side === 'buy';
  const [buyAmount, setBuyAmount] = useState<number | null>(trade.instantBuyAmount);
  const [sellUnit, setSellUnit] = useState<SellUnit>('percent');
  const [sellValue, setSellValue] = useState<number | null>(trade.quickSellPercents[1] ?? 50);
  const exec = useTradeExecutor(token);
  useEffect(() => exec.clearResult(), [side]); // eslint-disable-line react-hooks/exhaustive-deps

  const held = position?.balance ?? 0;
  const amount = buy ? buyAmount : sellValue;
  const amountKind = buy ? 'native' : sellUnit;
  const quote = useLiveQuote({ chain: token.chain, token: token.address, side, amount, amountKind, presetId }, buy || held > 0);

  const invalid = !amount || amount <= 0 || (buy ? maxBuy !== null && amount > maxBuy : held <= 0 || (sellUnit === 'percent' && amount > 100));
  const symbol = nativeSymbol(token.chain);
  const label = buy
    ? `Buy ${amount ? formatNative(amount, symbol) : ''}`
    : sellUnit === 'percent'
      ? `Sell ${amount ? `${formatCompact(amount)}%` : ''}`
      : `Sell ${amount ? formatCompact(amount) : ''} ${token.symbol}`;

  const submit = () => {
    if (!amount) return;
    const req: SwapRequest = { chain: token.chain, token: token.address, side, amount, amountKind, presetId };
    const q = quote.data;
    exec.submit(
      req,
      <>
        <SummaryRow label={buy ? 'Spend' : 'Sell'}>
          {buy ? <Native value={amount} chain={token.chain} /> : sellUnit === 'percent' ? `${amount}% of position` : <Compact value={amount} suffix={` ${token.symbol}`} />}
        </SummaryRow>
        {q && (
          <SummaryRow label="Receive ≈">
            {buy ? <Compact value={q.expectedOut} suffix={` ${token.symbol}`} /> : <Native value={q.expectedOut} chain={token.chain} />}
          </SummaryRow>
        )}
        {q && (
          <SummaryRow label="Price impact">
            <Pct value={q.priceImpact} sign={false} colored={false} />
          </SummaryRow>
        )}
        <SummaryRow label={`Preset ${PRESET_LABELS[presetId]}`}>
          {slippageLabel(preset)} slippage · {preset.antiMev ? 'anti-MEV' : 'public'}
        </SummaryRow>
        <SummaryRow label="Market cap">
          <Usd value={token.marketCapUsd} />
        </SummaryRow>
      </>,
    );
  };

  const sellInitials = (q: SellInitialsQuote) => {
    if (q.tokens === null) return;
    exec.submit(
      { chain: token.chain, token: token.address, side: 'sell', amount: q.tokens, amountKind: 'tokens', presetId },
      <>
        <SummaryRow label="Sell initials">
          <Compact value={q.tokens} suffix={` ${token.symbol}`} /> ({formatPercent(q.sellRate ?? 0, { sign: false, digits: 1 })})
        </SummaryRow>
        <SummaryRow label="Receive ≈">
          <Native value={q.expectedOutNative} chain={token.chain} />
        </SummaryRow>
        <SummaryRow label="Cost basis">
          <Native value={q.targetNative} chain={token.chain} />
        </SummaryRow>
        <SummaryRow label="Keeps">
          <Compact value={q.balance - q.tokens} suffix={` ${token.symbol}`} />
        </SummaryRow>
        <SummaryRow label={`Preset ${PRESET_LABELS[presetId]}`}>
          {slippageLabel(preset)} slippage · {preset.antiMev ? 'anti-MEV' : 'public'}
        </SummaryRow>
      </>,
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
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
      {!buy && signedIn && held > 0 && <SellInitialsRow token={token} presetId={presetId} balance={held} onSell={sellInitials} pending={exec.pending} />}
      {!buy && signedIn && held <= 0 ? (
        <p className="rounded bg-panel-2 px-2 py-1.5 text-xs text-muted">You don’t hold {token.symbol} yet. Buy first, or set a limit buy.</p>
      ) : (
        <QuotePreview query={quote} chain={token.chain} symbol={token.symbol} side={side} nativeUsd={token.nativeUsd} signedIn={signedIn} hasAmount={!!amount && amount > 0} />
      )}
      {signedIn ? (
        <Button variant={buy ? 'buy' : 'sell'} block className="!h-9 text-md" loading={exec.pending} disabled={invalid} onClick={submit}>
          {label}
        </Button>
      ) : (
        <StartTradingCta />
      )}
      <TradeResultLine result={exec.result} token={token} onRaiseSlippage={onRaiseSlippage} onDismiss={exec.clearResult} />
      {exec.dialog}
    </div>
  );
}
