import { Link } from 'react-router-dom';
import clsx from 'clsx';

/** Trenchscope mark: a scope reticle over a rising trench line. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={clsx('shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-panel-3" />
      <circle cx="16" cy="16" r="9" fill="none" strokeWidth="2.4" className="stroke-accent" />
      <path d="M16 3.5v4.5M16 24v4.5M3.5 16H8M24 16h4.5" strokeWidth="2.4" strokeLinecap="round" className="stroke-accent" />
      <path d="M10.6 18.6l3-3.1 2.6 2.4 5.2-5.3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-fg" />
    </svg>
  );
}

/** Home link with mark + wordmark (wordmark hidden when `compact`). */
export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" aria-label="Trenchscope home" className={clsx('flex shrink-0 items-center gap-2 rounded', className)}>
      <LogoMark />
      {!compact && (
        <span className="text-md font-semibold tracking-tight text-fg">
          Trench<span className="text-accent">scope</span>
        </span>
      )}
    </Link>
  );
}
