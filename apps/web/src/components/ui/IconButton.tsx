import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export type IconButtonSize = 'xs' | 'sm' | 'md';

const SIZE: Record<IconButtonSize, string> = { xs: 'h-6 w-6', sm: 'h-7 w-7', md: 'h-8 w-8' };
const VARIANT = {
  ghost: 'text-muted hover:bg-panel-3 hover:text-fg',
  outline: 'border border-line text-muted hover:border-line-strong hover:bg-panel-2 hover:text-fg',
  soft: 'bg-panel-3 text-fg hover:bg-line-strong/60',
} as const;

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: keyof typeof VARIANT;
  /** Pressed/selected look (sets aria-pressed). */
  active?: boolean;
  /** Small count/dot rendered on the top-right corner. */
  badge?: ReactNode;
}

/** Square icon-only button with a required aria label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', variant = 'ghost', active, badge, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZE[size],
        VARIANT[variant],
        active && 'bg-panel-3 text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
      {badge !== undefined && badge !== null && badge !== false && (
        <span className="num pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-down px-1 text-2xs font-semibold leading-none text-down-fg">
          {badge}
        </span>
      )}
    </button>
  );
});
