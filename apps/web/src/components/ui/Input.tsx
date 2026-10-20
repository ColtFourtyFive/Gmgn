import { forwardRef, useEffect, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import type { Range } from '@trenchscope/shared';
import clsx from 'clsx';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>;

export interface InputProps extends NativeInputProps {
  /** Leading adornment (icon or unit), rendered inside the field. */
  prefix?: ReactNode;
  /** Trailing adornment (unit, Kbd, clear button). */
  suffix?: ReactNode;
  size?: 'sm' | 'md';
  invalid?: boolean;
  /** Classes for the outer field box (the <input> gets `className`). */
  wrapperClassName?: string;
}

/** Text field styled like `.input`, with optional prefix/suffix adornments; dims when disabled. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, size = 'md', invalid, wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <div className={clsx('input-group', size === 'sm' && '!h-7 text-xs', invalid && '!border-down', wrapperClassName)}>
      {prefix && <span className="flex shrink-0 items-center text-faint">{prefix}</span>}
      <input ref={ref} aria-invalid={invalid || undefined} className={clsx('input-bare', className)} {...rest} />
      {suffix && <span className="flex shrink-0 items-center text-xs text-muted">{suffix}</span>}
    </div>
  );
});

function decimalsOf(n: number): number {
  const s = String(n);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
}

function parse(text: string): number | null {
  if (text.trim() === '' || text === '-' || text === '.') return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function display(value: number | null): string {
  return value === null ? '' : String(value);
}

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  value: number | null;
  /** Called with the parsed number (null when empty). */
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Arrow-key increment; also rounds stepped values to its precision. */
  step?: number;
  /** Quick-pick values rendered as buttons under the field. */
  presets?: number[];
  formatPreset?: (v: number) => ReactNode;
}

/**
 * Numeric field that keeps the user's raw text while typing ("0.", "1e")
 * and clamps to min/max on blur. ArrowUp/Down step by `step`.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, min, max, step = 1, presets, formatPreset = String, onBlur, onKeyDown, wrapperClassName, ...rest },
  ref,
) {
  const [text, setText] = useState(() => display(value));

  // Follow external value changes (presets, resets) unless the text already means it.
  useEffect(() => {
    setText((t) => (parse(t) === value ? t : display(value)));
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (n: number | null) => {
    setText(display(n));
    onChange(n);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    const next = clamp((parse(text) ?? min ?? 0) + dir * step * (e.shiftKey ? 10 : 1));
    commit(Number(next.toFixed(Math.max(decimalsOf(step), 0))));
  };

  const input = (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      wrapperClassName={presets ? undefined : wrapperClassName}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?[\d,]*\.?\d*(e-?\d*)?$/i.test(raw)) return;
        setText(raw);
        onChange(parse(raw));
      }}
      onBlur={(e) => {
        const n = parse(text);
        if (n !== null && clamp(n) !== n) commit(clamp(n));
        onBlur?.(e);
      }}
      onKeyDown={handleKey}
      {...rest}
    />
  );

  if (!presets?.length) return input;
  return (
    <div className={clsx('flex flex-col gap-1.5', wrapperClassName)}>
      {input}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => commit(p)}
            disabled={rest.disabled}
            className={clsx(
              'num h-6 rounded border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              value === p ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {formatPreset(p)}
          </button>
        ))}
      </div>
    </div>
  );
});

export interface RangeInputProps {
  value: Range | undefined;
  /** Emits undefined when both bounds are cleared. */
  onChange: (value: Range | undefined) => void;
  /** Display multiplier: 100 shows ratios (0..1) as percents. */
  scale?: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Accessible name prefix: "<label> min" / "<label> max". */
  label?: string;
}

/** Min/max pair for numeric filters (TokenFilters ranges). */
export function RangeInput({ value, onChange, scale = 1, prefix, suffix, minPlaceholder = 'Min', maxPlaceholder = 'Max', size = 'sm', className, label }: RangeInputProps) {
  const toView = (v: number | undefined) => (v === undefined ? null : Number((v * scale).toPrecision(12)));
  const fromView = (v: number | null) => (v === null ? undefined : v / scale);
  const set = (key: 'min' | 'max', v: number | null) => {
    const next: Range = { ...value, [key]: fromView(v) };
    if (next.min === undefined) delete next.min;
    if (next.max === undefined) delete next.max;
    onChange(next.min === undefined && next.max === undefined ? undefined : next);
  };
  return (
    <div className={clsx('flex items-center gap-1.5', className)}>
      <NumberInput size={size} value={toView(value?.min)} onChange={(v) => set('min', v)} placeholder={minPlaceholder} prefix={prefix} suffix={suffix} aria-label={label ? `${label} min` : 'Minimum'} />
      <span className="text-faint">–</span>
      <NumberInput size={size} value={toView(value?.max)} onChange={(v) => set('max', v)} placeholder={maxPlaceholder} prefix={prefix} suffix={suffix} aria-label={label ? `${label} max` : 'Maximum'} />
    </div>
  );
}

export interface FieldProps {
  label: ReactNode;
  /** id of the control, wires the <label>. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Label left, control right (settings rows). */
  inline?: boolean;
  className?: string;
  children: ReactNode;
}

/** Form row: label + control + hint/error text (below the row when `inline`). */
export function Field({ label, htmlFor, hint, error, inline, className, children }: FieldProps) {
  const labelEl = (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
      {label}
    </label>
  );
  const note = (error || hint) && <p className={clsx('text-xs', error ? 'text-down' : 'text-faint', inline && 'text-right')}>{error ?? hint}</p>;
  if (inline) {
    return (
      <div className={clsx('flex flex-col gap-1', className)}>
        <div className="flex items-center justify-between gap-3">
          {labelEl}
          {children}
        </div>
        {note}
      </div>
    );
  }
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {labelEl}
      {children}
      {note}
    </div>
  );
}
