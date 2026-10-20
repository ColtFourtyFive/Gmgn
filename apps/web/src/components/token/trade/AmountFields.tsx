// Amount inputs of the trade panel: native amount for buys (quick amounts,
// custom value, balance + Max) and percent / token amount for sells.

import { forwardRef } from 'react';
import { CHAINS, formatCompact, type ChainId, type TokenPositionRow } from '@trenchscope/shared';
import { Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Compact, Native, Pct, Price, Usd } from '@/components/common';
import { Button, NumberInput, SegmentedControl } from '@/components/ui';

function quickClass(active: boolean, tone: 'buy' | 'sell') {
  return clsx(
    'num h-7 rounded border text-sm font-medium transition-colors disabled:opacity-50',
    active
      ? tone === 'buy'
        ? 'border-up/60 bg-up/10 text-up'
        : 'border-down/60 bg-down/10 text-down'
      : 'border-line bg-panel-2 text-fg hover:border-line-strong',
  );
}

export interface BuyAmountProps {
  chain: ChainId;
  value: number | null;
  onChange: (v: number | null) => void;
  quickAmounts: number[];
  /** Native balance (null signed out). */
  balance: number | null;
  /** Largest affordable amount after fees (null hides Max). */
  max: number | null;
  label?: string;
  /** Top up link for a low balance. */
  onTopUp?: () => void;
  topUpPending?: boolean;
}

export const BuyAmount = forwardRef<HTMLInputElement, BuyAmountProps>(function BuyAmount(
  { chain, value, onChange, quickAmounts, balance, max, label = 'Amount', onTopUp, topUpPending },
  ref,
) {
  const symbol = CHAINS[chain].nativeSymbol;
  const over = balance !== null && value !== null && max !== null && value > max;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="flex min-w-0 items-center gap-1 text-muted">
          <Wallet size={12} className="shrink-0 text-faint" aria-hidden />
          {balance === null ? <span className="text-faint">—</span> : <Native value={balance} chain={chain} className="text-fg" />}
          {max !== null && max > 0 && (
            <button type="button" className="ml-1 rounded px-1 text-2xs font-semibold uppercase text-accent hover:bg-accent/10" onClick={() => onChange(max)}>
              Max
            </button>
          )}
          {onTopUp && balance !== null && (max === null || max <= quickAmounts[0]) && (
            <Button size="xs" variant="ghost" className="!h-5 !px-1 text-accent" loading={topUpPending} onClick={onTopUp}>
              Top up
            </Button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {quickAmounts.slice(0, 4).map((a) => (
          <button key={a} type="button" className={quickClass(value === a, 'buy')} onClick={() => onChange(a)} aria-pressed={value === a}>
            {formatCompact(a, 3)}
          </button>
        ))}
      </div>
      <NumberInput ref={ref} value={value} onChange={onChange} min={0} step={0.1} suffix={symbol} placeholder="Custom amount" aria-label={`${label} in ${symbol}`} invalid={over} />
      {over && <p className="text-2xs text-down">Exceeds your balance after fees.</p>}
    </div>
  );
});

export type SellUnit = 'percent' | 'tokens';

export interface SellAmountProps {
  symbol: string;
  unit: SellUnit;
  onUnitChange: (u: SellUnit) => void;
  value: number | null;
  onChange: (v: number | null) => void;
  quickPercents: number[];
  position: TokenPositionRow | null;
  /** Live token price (position value). */
  priceUsd: number;
  signedIn: boolean;
  label?: string;
}

export const SellAmount = forwardRef<HTMLInputElement, SellAmountProps>(function SellAmount(
  { symbol, unit, onUnitChange, value, onChange, quickPercents, position, priceUsd, signedIn, label = 'Amount' },
  ref,
) {
  const balance = position?.balance ?? 0;
  const tokens = unit === 'percent' ? (value ?? 0) * 0.01 * balance : (value ?? 0);
  const unrealized = position && balance > 0 ? balance * priceUsd - position.costBasisUsd : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="flex min-w-0 items-center gap-1 text-muted">
          <Wallet size={12} className="shrink-0 text-faint" aria-hidden />
          {!signedIn ? (
            <span className="text-faint">—</span>
          ) : (
            <>
              <Compact value={balance} className="text-fg" suffix={` ${symbol}`} />
              {balance > 0 && (
                <span className="text-faint">
                  (<Usd value={balance * priceUsd} />)
                </span>
              )}
            </>
          )}
        </span>
      </div>
      {position && balance > 0 && unrealized !== null && (
        <p className="num flex items-center justify-between gap-2 rounded bg-panel-2 px-2 py-1 text-2xs text-muted">
          <span>
            Avg buy <Price value={position.avgBuyPriceUsd} className="text-fg" />
          </span>
          <span>
            PnL <Usd value={unrealized} colored signed />
            {position.costBasisUsd > 0 && (
              <>
                {' '}
                (<Pct value={unrealized / position.costBasisUsd} digits={1} />)
              </>
            )}
          </span>
        </p>
      )}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(quickPercents.length, 4)}, minmax(0, 1fr))` }}>
        {quickPercents.slice(0, 4).map((p) => {
          const active = unit === 'percent' && value === p;
          return (
            <button
              key={p}
              type="button"
              className={quickClass(active, 'sell')}
              aria-pressed={active}
              onClick={() => {
                onUnitChange('percent');
                onChange(p);
              }}
            >
              {p}%
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <NumberInput
          ref={ref}
          value={value}
          onChange={onChange}
          min={0}
          max={unit === 'percent' ? 100 : undefined}
          step={unit === 'percent' ? 5 : 1000}
          placeholder={unit === 'percent' ? 'Custom %' : `Amount of ${symbol}`}
          aria-label={unit === 'percent' ? 'Percent of position to sell' : `${symbol} amount to sell`}
          wrapperClassName="flex-1"
        />
        <SegmentedControl
          size="sm"
          value={unit}
          onChange={(u) => {
            onUnitChange(u);
            onChange(u === 'percent' ? 50 : balance > 0 ? Math.floor(balance / 2) : null);
          }}
          items={[
            { value: 'percent', label: '%' },
            { value: 'tokens', label: symbol.length > 6 ? 'Qty' : symbol },
          ]}
          aria-label="Sell amount unit"
        />
      </div>
      {signedIn && balance > 0 && tokens > 0 && (
        <p className="num text-2xs text-muted">
          ≈ <Compact value={Math.min(tokens, balance)} suffix={` ${symbol}`} /> · <Usd value={Math.min(tokens, balance) * priceUsd} />
        </p>
      )}
    </div>
  );
});
