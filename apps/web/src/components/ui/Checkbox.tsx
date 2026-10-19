import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import clsx from 'clsx';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  /** Mixed state ("some selected"); shows a dash. */
  indeterminate?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Required when there is no visible label. */
  'aria-label'?: string;
}

/** Styled native checkbox (keyboard + form semantics come from the input). */
export function Checkbox({ checked, onChange, label, indeterminate = false, disabled, id, className, 'aria-label': ariaLabel }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <label className={clsx('inline-flex cursor-pointer select-none items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={clsx(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent',
          on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-panel-2',
        )}
      >
        {indeterminate ? <Minus size={10} strokeWidth={3} /> : checked ? <Check size={10} strokeWidth={3} /> : null}
      </span>
      {label && <span className="text-fg">{label}</span>}
    </label>
  );
}
