// Wallet risk check (PRD §6.9 card 2, §8.4.5): address poisoning, wash
// trading, a flagged funder, new wallet with size, rugs created, honeypots and
// bot-speed flips, from observable data only. Each flag shows its level, the
// number behind it, and its definition in a tooltip (and to screen readers).
// Look-alike addresses are shown without a copy button: copying one out of a
// history is exactly what address poisoning is after.

import { memo } from 'react';
import { shortAddress, type ChainId, type RiskLevel, type WalletRiskFlag, type WalletRiskFlagLevel, type WalletRiskReport } from '@trenchscope/shared';
import { CircleCheck, CircleHelp, Info, OctagonAlert, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink } from '@/components/common';
import { ErrorState, Panel, Skeleton, Tooltip } from '@/components/ui';
import { useWalletRisk } from './queries';

const LEVEL: Record<WalletRiskFlagLevel, { icon: LucideIcon; className: string; text: string }> = {
  ok: { icon: CircleCheck, className: 'text-up', text: 'OK' },
  warn: { icon: TriangleAlert, className: 'text-warn', text: 'Caution' },
  bad: { icon: OctagonAlert, className: 'text-down', text: 'Red flag' },
  unknown: { icon: CircleHelp, className: 'text-faint', text: 'Unknown' },
};

const OVERALL: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: 'Low risk', className: 'bg-up/15 text-up' },
  medium: { label: 'Some flags', className: 'bg-warn/15 text-warn' },
  high: { label: 'Red flags', className: 'bg-down/15 text-down' },
};

function FlagRow({ chain, flag: f }: { chain: ChainId; flag: WalletRiskFlag }) {
  const meta = LEVEL[f.level];
  const Icon = meta.icon;
  return (
    <li className={clsx('flex min-w-0 flex-col gap-1 rounded border px-2.5 py-2', f.level === 'bad' ? 'border-down/40 bg-down/5' : f.level === 'warn' ? 'border-warn/40 bg-warn/5' : 'border-line bg-panel-2')}>
      <div className="flex items-center gap-1.5">
        <Icon size={14} className={clsx('shrink-0', meta.className)} aria-hidden />
        <span className="sr-only">{meta.text}:</span>
        <span className="min-w-0 truncate text-xs font-medium text-fg">{f.label}</span>
        <Tooltip content={f.definition} placement="top">
          <button type="button" className="ml-auto shrink-0 rounded p-0.5 text-faint hover:text-fg" aria-label={`What “${f.label}” means`}>
            <Info size={12} aria-hidden />
          </button>
        </Tooltip>
      </div>
      <p className={clsx('num text-sm', f.level === 'ok' || f.level === 'unknown' ? 'text-muted' : meta.className)}>{f.value}</p>
      {/* the tooltip's definition, read in order by screen readers */}
      <span className="sr-only">{f.definition}</span>
      {f.addresses && f.addresses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-2xs">
          {f.key === 'phishing' ? (
            <>
              <span className="text-down">Look-alike, never send to:</span>
              {f.addresses.map((a) => (
                <span key={a} className="num rounded bg-down/10 px-1 font-mono text-down" title="Look-alike address (not copyable)">
                  {shortAddress(a, 6, 6)}
                </span>
              ))}
            </>
          ) : (
            f.addresses.map((a) => <AddressLink key={a} chain={chain} address={a} copy={false} />)
          )}
        </div>
      )}
    </li>
  );
}

/** The risk card for one wallet, fetched on its own (the profile does not carry it). */
export const RiskCard = memo(function RiskCard({ chain, address, className }: { chain: ChainId; address: string; className?: string }) {
  const q = useWalletRisk(chain, address);
  return <RiskCardView chain={chain} report={q.data} loading={q.isPending} error={q.isError && !q.data ? q.error : null} onRetry={() => void q.refetch()} className={className} />;
});

export interface RiskCardViewProps {
  chain: ChainId;
  report: WalletRiskReport | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function RiskCardView({ chain, report, loading, error, onRetry, className }: RiskCardViewProps) {
  const overall = report ? OVERALL[report.level] : null;
  const flagged = report ? report.flags.filter((f) => f.level === 'warn' || f.level === 'bad').length : 0;
  return (
    <Panel
      title="Risk check"
      subtitle={report ? `${flagged} of ${report.flags.length} checks flagged` : undefined}
      icon={<ShieldAlert size={14} />}
      className={className}
      actions={overall ? <span className={clsx('chip font-semibold', overall.className)}>{overall.label}</span> : undefined}
    >
      {error ? (
        <ErrorState compact title="Risk check unavailable" error={error} onRetry={onRetry} />
      ) : !report ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[62px]" />
          ))}
        </div>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Risk flags">
            {report.flags.map((f) => (
              <FlagRow key={f.key} chain={chain} flag={f} />
            ))}
          </ul>
          <p className="mt-2 text-2xs text-faint">From observable on-chain activity only (transfers, trades, launches). Flags are prompts to look closer, not verdicts.</p>
        </>
      )}
    </Panel>
  );
}
