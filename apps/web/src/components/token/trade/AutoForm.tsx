// Auto orders. Buy side: a market buy carrying an exit strategy (TP / SL /
// trailing / dev-sell / migration exits created on fill) plus a migration
// snipe. Sell side: one-click dev-sell and migration exits, and an exit
// ladder for an existing position (measured from the current price).

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatNative, type CreateOrderRequest, type StrategySpec, type SwapRequest } from '@trenchscope/shared';
import { Code, Rocket, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Compact, Native } from '@/components/common';
import { DEFAULT_STRATEGY, describeStrategy, EMPTY_STRATEGY, isStrategyEmpty, StrategyEditor, strategyOrderCount } from '@/components/trade/StrategyEditor';
import { Button, Heading, SegmentedControl, Select } from '@/components/ui';
import { invalidateTradingQueries } from '@/hooks/useUserChannel';
import { api } from '@/lib/api';
import { nativeSymbol } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { requireAuth } from '@/store/session';
import { toast } from '@/store/toasts';
import { useCreateOrder } from '../queries';
import { BuyAmount } from './AmountFields';
import { slippageLabel } from './PresetBar';
import { StartTradingCta, SummaryRow, TradeResultLine, type TradeFormProps } from './shared';
import { useTradeExecutor } from './useTradeExecutor';

function Section({ icon, title, hint, children, className }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('flex flex-col gap-2 rounded border border-line p-2.5', className)}>
      <header>
        <Heading className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <span className="text-accent">{icon}</span>
          {title}
        </Heading>
        {hint && <p className="mt-0.5 text-2xs text-muted">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

const PERCENT_ITEMS = [25, 50, 100].map((p) => ({ value: String(p) as '25' | '50' | '100', label: `${p}%` }));
const DEV_THRESHOLDS = [
  { value: 0.1, label: '≥ 10% of dev bag' },
  { value: 0.2, label: '≥ 20% of dev bag' },
  { value: 0.5, label: '≥ 50% of dev bag' },
  { value: 0.8, label: '≥ 80% of dev bag' },
];

/** Exit ladder for a held position → individual orders (relative to the price at creation). */
function strategyOrders(s: StrategySpec, base: Pick<CreateOrderRequest, 'chain' | 'token' | 'presetId'>, migrated: boolean): CreateOrderRequest[] {
  const out: CreateOrderRequest[] = [];
  for (const tp of s.takeProfits) out.push({ ...base, kind: 'take_profit', triggerType: 'change', triggerValue: tp.changePct, amount: tp.sellPercent, amountKind: 'percent' });
  for (const sl of s.stopLosses) out.push({ ...base, kind: 'stop_loss', triggerType: 'change', triggerValue: sl.lossPct, amount: sl.sellPercent, amountKind: 'percent' });
  if (s.trailing) {
    out.push({
      ...base,
      kind: 'trailing_stop',
      triggerType: 'change',
      triggerValue: s.trailing.drawdownPct,
      amount: s.trailing.sellPercent,
      amountKind: 'percent',
      activateAtChangePct: s.trailing.activateAtChangePct || undefined,
    });
  }
  if (s.devSellPercent > 0) out.push({ ...base, kind: 'dev_sell', triggerType: 'event', triggerValue: 0, amount: s.devSellPercent, amountKind: 'percent' });
  if (s.migrationSellPercent > 0 && !migrated) out.push({ ...base, kind: 'migration_sell', triggerType: 'event', triggerValue: 0, amount: s.migrationSellPercent, amountKind: 'percent' });
  return out;
}

export function AutoForm(props: TradeFormProps) {
  return props.side === 'buy' ? <AutoBuy {...props} /> : <AutoSell {...props} />;
}

function AutoBuy({ token, presetId, preset, trade, signedIn, balance, maxBuy, inputRef, onTopUp, topUpPending, onRaiseSlippage }: TradeFormProps) {
  const [amount, setAmount] = useState<number | null>(trade.instantBuyAmount);
  const [strategy, setStrategy] = useState<StrategySpec>(DEFAULT_STRATEGY);
  const exec = useTradeExecutor(token);
  const { create, pending: snipePending } = useCreateOrder();
  const migrated = token.status === 'migrated';
  const exits = strategyOrderCount(strategy);
  const invalid = !amount || amount <= 0 || (maxBuy !== null && amount > maxBuy);
  const sym = nativeSymbol(token.chain);

  const buy = () => {
    if (!amount) return;
    const req: SwapRequest = { chain: token.chain, token: token.address, side: 'buy', amount, amountKind: 'native', presetId, strategy: isStrategyEmpty(strategy) ? undefined : strategy };
    exec.submit(
      req,
      <>
        <SummaryRow label="Spend">
          <Native value={amount} chain={token.chain} />
        </SummaryRow>
        <SummaryRow label="Exit strategy">{describeStrategy(strategy)}</SummaryRow>
        <SummaryRow label={`Preset ${presetId}`}>{slippageLabel(preset)} slippage</SummaryRow>
      </>,
    );
  };

  const snipe = () =>
    requireAuth(() => {
      if (!amount) return;
      void create(
        { chain: token.chain, token: token.address, kind: 'migration_buy', triggerType: 'event', triggerValue: 0, amount, amountKind: 'native', presetId },
        { title: 'Migration snipe armed', body: `Buys ${formatNative(amount, sym)} of ${token.symbol} the moment it migrates to its pool.` },
      );
    });

  return (
    <div className="flex flex-col gap-2.5">
      <BuyAmount ref={inputRef} chain={token.chain} value={amount} onChange={setAmount} quickAmounts={trade.quickBuyAmounts} balance={balance} max={maxBuy} onTopUp={signedIn ? onTopUp : undefined} topUpPending={topUpPending} />
      <Section icon={<Sparkles size={13} />} title="Buy with exit strategy" hint="Exit orders are created from your fill price and run server-side.">
        <StrategyEditor value={strategy} onChange={setStrategy} hideMigration={migrated} compact />
        <div className="flex gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setStrategy(DEFAULT_STRATEGY)}>
            Default ladder
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setStrategy(EMPTY_STRATEGY)}>
            Clear
          </Button>
        </div>
      </Section>
      {signedIn ? (
        <Button variant="buy" block className="!h-9 text-md" loading={exec.pending} disabled={invalid} onClick={buy}>
          Buy {amount ? formatNative(amount, sym) : ''}
          {exits > 0 && <span className="font-normal opacity-80">+ {exits} exits</span>}
        </Button>
      ) : (
        <StartTradingCta />
      )}
      <TradeResultLine result={exec.result} token={token} onRaiseSlippage={onRaiseSlippage} onDismiss={exec.clearResult} />
      {!migrated && (
        <Section icon={<Rocket size={13} />} title="Migration snipe" hint={`Buy the moment ${token.symbol} graduates from the bonding curve to its AMM pool.`}>
          <Button variant="outline" block loading={snipePending} disabled={!amount || amount <= 0} onClick={snipe}>
            Buy {amount ? formatNative(amount, sym) : ''} on migration
          </Button>
        </Section>
      )}
      {exec.dialog}
    </div>
  );
}

function AutoSell({ token, presetId, position, signedIn }: TradeFormProps) {
  const qc = useQueryClient();
  const held = position?.balance ?? 0;
  const migrated = token.status === 'migrated';
  const [devPct, setDevPct] = useState<'25' | '50' | '100'>('100');
  const [devThreshold, setDevThreshold] = useState(0.2);
  const [migPct, setMigPct] = useState<'25' | '50' | '100'>('100');
  const [ladder, setLadder] = useState<StrategySpec>({ ...EMPTY_STRATEGY, takeProfits: [{ changePct: 100, sellPercent: 50 }], stopLosses: [{ lossPct: 40, sellPercent: 100 }] });
  const [ladderPending, setLadderPending] = useState(false);
  const { create, pending } = useCreateOrder();
  const base = { chain: token.chain, token: token.address, presetId };
  const noPosition = signedIn && held <= 0;

  const devSell = () =>
    requireAuth(() => {
      void create(
        { ...base, kind: 'dev_sell', triggerType: 'event', triggerValue: 0, amount: Number(devPct), amountKind: 'percent', devSellThreshold: devThreshold },
        { title: 'Dev-sell exit armed', body: `Sells ${devPct}% of your ${token.symbol} when the dev dumps ≥ ${Math.round(devThreshold * 100)}% of their bag in one trade.` },
      );
    });

  const migrationSell = () =>
    requireAuth(() => {
      void create(
        { ...base, kind: 'migration_sell', triggerType: 'event', triggerValue: 0, amount: Number(migPct), amountKind: 'percent' },
        { title: 'Migration exit armed', body: `Sells ${migPct}% of your ${token.symbol} when it migrates.` },
      );
    });

  const placeLadder = () =>
    requireAuth(async () => {
      const reqs = strategyOrders(ladder, base, migrated);
      if (reqs.length === 0) return;
      setLadderPending(true);
      let ok = 0;
      let lastError: unknown = null;
      for (const r of reqs) {
        try {
          await api.createOrder(r);
          ok++;
        } catch (err) {
          lastError = err;
        }
      }
      setLadderPending(false);
      invalidateTradingQueries(qc);
      if (ok === reqs.length) toast.success(`${ok} exit order${ok === 1 ? '' : 's'} placed`, describeStrategy(ladder));
      else toast.error(`${ok}/${reqs.length} exit orders placed`, errorMessage(lastError));
    });

  return (
    <div className="flex flex-col gap-2.5">
      {signedIn && (
        <p className="flex items-center justify-between gap-2 rounded bg-panel-2 px-2 py-1.5 text-xs text-muted">
          Position
          <span className="num text-fg">{held > 0 ? <Compact value={held} suffix={` ${token.symbol}`} /> : 'None'}</span>
        </p>
      )}
      {noPosition && <p className="text-xs text-muted">Auto sells need a {token.symbol} position. Buy first — or attach exits to a buy on the Buy side.</p>}
      <Section icon={<Code size={13} />} title="Sell on dev sell" hint="Exit when the creator dumps a large part of their holdings in one trade.">
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedControl size="sm" value={devPct} onChange={setDevPct} items={PERCENT_ITEMS} aria-label="Percent to sell on dev sell" />
          <Select size="sm" value={devThreshold} onChange={setDevThreshold} options={DEV_THRESHOLDS} aria-label="Dev sell size that triggers the exit" className="min-w-0 flex-1" />
        </div>
        <Button variant="outline" block loading={pending} disabled={noPosition} onClick={devSell}>
          Sell {devPct}% on dev sell
        </Button>
      </Section>
      {!migrated && (
        <Section icon={<Rocket size={13} />} title="Sell on migration" hint="Exit the moment the token graduates to its AMM pool.">
          <SegmentedControl size="sm" value={migPct} onChange={setMigPct} items={PERCENT_ITEMS} aria-label="Percent to sell on migration" />
          <Button variant="outline" block loading={pending} disabled={noPosition} onClick={migrationSell}>
            Sell {migPct}% on migration
          </Button>
        </Section>
      )}
      <Section icon={<Sparkles size={13} />} title="Exit ladder" hint="Take profits and stops for your current position, measured from the price now.">
        <StrategyEditor value={ladder} onChange={setLadder} hideMigration={migrated} compact />
        {signedIn ? (
          <Button variant="sell" block loading={ladderPending} disabled={noPosition || isStrategyEmpty(ladder)} onClick={placeLadder}>
            Place {strategyOrders(ladder, base, migrated).length} exit orders
          </Button>
        ) : (
          <StartTradingCta />
        )}
      </Section>
    </div>
  );
}
