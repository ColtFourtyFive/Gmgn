import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'soft' | 'buy' | 'sell' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  soft: 'btn-soft',
  buy: 'btn-buy',
  sell: 'btn-sell',
  danger: 'btn-danger',
};
const SIZE: Record<ButtonSize, string> = { xs: 'btn-xs', sm: 'btn-sm', md: '' };
const ICON_PX: Record<ButtonSize, number> = { xs: 12, sm: 13, md: 14 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of `icon` and ignores clicks (the button keeps focus). */
  loading?: boolean;
  /** Leading icon (e.g. a lucide icon at size 14). */
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Full width. */
  block?: boolean;
}

/**
 * Text button. Variants map to the .btn-* classes in index.css.
 *
 * Natively disabling a focused button drops keyboard focus to <body> (after
 * Buy/Sell, Save, Retry...). So `loading` never sets `disabled`, and a button
 * that becomes `disabled` while focused stays focusable until focus leaves:
 * both are only aria-disabled, and clicks are ignored.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading = false, icon, iconRight, block, className, children, disabled, type = 'button', onClick, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inert = !!disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={!!disabled && !focused}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      className={clsx(VARIANT[variant], SIZE[size], block && 'w-full', className)}
      onClick={inert ? (e) => e.preventDefault() : onClick}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner size={ICON_PX[size]} label="" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});
