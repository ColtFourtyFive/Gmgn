// Holder structure: concentration / cohort risk chips plus tagged-holder
// counts and the share of supply each cohort holds.

import { memo } from 'react';
import { formatPercent, type TokenDetail, type WalletTag } from '@trenchscope/shared';
import { Bot, Boxes, Crown, Crosshair, Layers, Sprout, Users, VenetianMask } from 'lucide-react';
import { Compact, RiskChip, WALLET_TAG_META } from '@/components/common';
import { DevChip, FRESH_THRESHOLD } from '@/components/discovery';
import { Panel, Tooltip } from '@/components/ui';
import { useDisplaySettings } from '@/hooks/useSettings';

/** No user setting exists for these two; red past these shares. */
const TOP100_THRESHOLD = 0.7;
const BOT_THRESHOLD = 0.3;

const pct = (v: number) => formatPercent(v, { sign: false, digits: v < 0.1 ? 1 : 0 });

interface CohortRow {
  tag: WalletTag;
  count: number;
  rate: number | null;
}

export const HolderStrip = memo(function HolderStrip({ token, className, onOpenHolders }: { token: TokenDetail; className?: string; onOpenHolders?: () => void }) {
  const s = token.security;
  const h = token.holderTags;
  const th = useDisplaySettings().riskThresholds;
  const rows: CohortRow[] = [
    { tag: 'smart', count: h.smartCount, rate: h.smartHoldRate },
    { tag: 'kol', count: h.kolCount, rate: h.kolHoldRate },
    { tag: 'whale', count: h.whaleCount, rate: h.whaleHoldRate },
    { tag: 'insider', count: h.insiderCount, rate: h.insiderHoldRate },
    { tag: 'sniper', count: h.sniperCount, rate: h.sniperHoldRate },
    { tag: 'bundler', count: h.bundlerCount, rate: h.bundlerHoldRate },
    { tag: 'fresh', count: h.freshCount, rate: h.freshHoldRate },
    { tag: 'bot', count: h.botCount, rate: h.botHoldRate },
  ];
  const maxRate = Math.max(0.05, ...rows.map((r) => r.rate ?? 0));

  return (
    <Panel
      className={className}
      title="Holders"
      icon={<Users size={14} />}
      subtitle={<Compact value={token.holderCount} suffix=" holders" />}
      actions={
        onOpenHolders && (
          <button type="button" className="text-xs text-muted hover:text-fg" onClick={onOpenHolders}>
            View all
          </button>
        )
      }
    >
      <div className="flex flex-wrap gap-1">
        <RiskChip label="Top 10" value={s.top10HolderRate} threshold={th.top10} icon={<Crown size={10} aria-hidden />} hint={`Top 10 holders (excluding pools) own this share. Red above ${pct(th.top10)}.`} />
        <RiskChip label="Top 100" value={s.top100HolderRate} threshold={TOP100_THRESHOLD} icon={<Layers size={10} aria-hidden />} hint={`Cumulative top-100 share — concentration beyond the top 10. Red above ${pct(TOP100_THRESHOLD)}.`} />
        <DevChip status={s.devStatus} holdRate={s.devHoldRate} threshold={th.dev} />
        <RiskChip label="Insiders" value={s.insiderHoldRate} threshold={th.insiders} icon={<VenetianMask size={10} aria-hidden />} hint={`Dev-linked wallets hold this share. Red above ${pct(th.insiders)}.`} />
        <RiskChip label="Snipers" value={s.sniperHoldRate} threshold={th.snipers} icon={<Crosshair size={10} aria-hidden />} hint={`${s.sniperCount} first-block buyers hold this share. Red above ${pct(th.snipers)}.`} />
        <RiskChip label="Bundlers" value={s.bundlerRate} threshold={th.bundlers} icon={<Boxes size={10} aria-hidden />} hint={`Share of volume from bundler wallets. Red above ${pct(th.bundlers)}.`} />
        <RiskChip label="Fresh" value={s.freshWalletRate} threshold={FRESH_THRESHOLD} icon={<Sprout size={10} aria-hidden />} hint={`Share of holders that are fresh wallets. Red above ${pct(FRESH_THRESHOLD)}.`} />
        <RiskChip label="Bots" value={s.botDegenRate} threshold={BOT_THRESHOLD} icon={<Bot size={10} aria-hidden />} hint={`Share of holders that are trading bots. Red above ${pct(BOT_THRESHOLD)}.`} />
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Tagged holders">
        {rows.map((r) => {
          const meta = WALLET_TAG_META[r.tag];
          const Icon = meta.icon;
          const color = `rgb(var(--${meta.token}))`;
          return (
            <li key={r.tag} className="flex min-w-0 flex-col gap-0.5">
              <Tooltip content={`${r.count} ${meta.label.toLowerCase()} holder${r.count === 1 ? '' : 's'} hold ${r.rate === null ? '--' : pct(r.rate)} of supply. ${meta.description}`}>
                <span className="flex items-center gap-1 text-xs" tabIndex={0}>
                  <Icon size={11} style={{ color }} aria-hidden />
                  <span className="text-muted">{meta.label}</span>
                  <span className="num ml-auto font-medium text-fg">{r.count}</span>
                  <span className="num w-10 text-right text-faint">{r.rate === null ? '--' : pct(r.rate)}</span>
                </span>
              </Tooltip>
              <span className="h-0.5 w-full overflow-hidden rounded-full bg-panel-3">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, ((r.rate ?? 0) / maxRate) * 100)}%`, background: color }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
});
