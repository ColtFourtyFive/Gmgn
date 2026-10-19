import { useId, type ReactNode } from 'react';
import clsx from 'clsx';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label (clicking it toggles). */
  label?: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  size?: 'sm' | 'md';
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Required when there is no visible label. */
  'aria-label'?: string;
}

/** On/off switch (role="switch"). Label sits left, switch right. */
export function Toggle({ checked, onChange, label, description, size = 'md', disabled, id, className, 'aria-label': ariaLabel }: ToggleProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const sm = size === 'sm';
  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        sm ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-panel-3',
      )}
    >
      <span
        className={clsx(
          'inline-block rounded-full shadow transition-transform',
          sm ? 'h-3 w-3' : 'h-3.5 w-3.5',
          checked ? clsx('bg-accent-fg', sm ? 'translate-x-[13px]' : 'translate-x-[18px]') : 'translate-x-[2px] bg-muted',
        )}
      />
    </button>
  );
  if (!label) return <span className={className}>{control}</span>;
  return (
    <div className={clsx('flex items-center justify-between gap-3', className)}>
      <label htmlFor={switchId} className={clsx('min-w-0 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
      {control}
    </div>
  );
}
