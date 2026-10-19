import { FlaskConical } from 'lucide-react';
import clsx from 'clsx';

export const SIM_NOTICE = 'Simulated market · paper trading';

/** Small notice that all market data is simulated and trades are paper trades. */
export function SimBanner({ className, variant = 'inline' }: { className?: string; variant?: 'inline' | 'card' }) {
  if (variant === 'card') {
    return (
      <div className={clsx('flex items-start gap-2 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted', className)}>
        <FlaskConical size={14} className="mt-px shrink-0 text-accent" />
        <p>
          <span className="font-medium text-fg">{SIM_NOTICE}.</span> Prices, tokens and wallets come from Trenchscope’s built-in market simulator. No real funds
          are used.
        </p>
      </div>
    );
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted', className)}>
      <FlaskConical size={12} className="text-accent" />
      {SIM_NOTICE}
    </span>
  );
}
