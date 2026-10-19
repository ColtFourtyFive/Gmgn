import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Floating, type Placement } from './Floating';

export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Right-aligned secondary text in the menu. */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: ReactNode;
  size?: 'sm' | 'md';
  /** `input` looks like a form field; `ghost` is a borderless toolbar control. */
  variant?: 'input' | 'ghost';
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  placement?: Placement;
  /** Custom trigger content (defaults to the selected option's icon + label). */
  renderValue?: (option: SelectOption<T> | undefined) => ReactNode;
  id?: string;
  'aria-label'?: string;
}

/**
 * Custom dropdown (listbox pattern). Keyboard: ArrowUp/Down, Home/End,
 * Enter/Space to pick, Escape/Tab to close. Controlled.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  size = 'md',
  variant = 'input',
  disabled,
  className,
  menuClassName,
  placement = 'bottom-start',
  renderValue,
  id,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const step = (from: number, dir: 1 | -1): number => {
    for (let n = 1; n <= options.length; n++) {
      const i = (from + dir * n + options.length * 2) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const openMenu = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : step(-1, 1));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close(true);
  };

  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const onTriggerKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => step(a, 1)),
      ArrowUp: () => setActive((a) => step(a, -1)),
      Home: () => setActive(step(-1, 1)),
      End: () => setActive(step(0, -1)),
      Enter: () => choose(active),
      ' ': () => choose(active),
    };
    // Refocus the trigger first so Tab continues from it, like a native <select>.
    if (e.key === 'Tab') close(true);
    else if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  const sm = size === 'sm';
  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
        className={clsx(
          'inline-flex min-w-0 items-center gap-1.5 rounded text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          sm ? 'h-7 px-2 text-xs' : 'h-8 px-2 text-sm',
          variant === 'input' ? 'border border-line bg-panel-2 text-fg hover:border-line-strong' : 'text-muted hover:bg-panel-3 hover:text-fg',
          open && variant === 'input' && 'border-accent',
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {renderValue ? (
            renderValue(selected)
          ) : selected ? (
            <>
              {selected.icon}
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="truncate text-faint">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={sm ? 12 : 14} className={clsx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      <Floating
        open={open}
        anchorRef={triggerRef}
        placement={placement}
        offset={4}
        matchWidth
        onClose={() => close(!!listRef.current?.contains(document.activeElement))}
        className={clsx('panel animate-pop-in p-1 shadow-float', menuClassName)}
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onKeyDown={onListKey}
          className="outline-none"
        >
          {options.map((o, i) => {
            const isSelected = i === selectedIndex;
            return (
              <li
                key={String(o.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onClick={() => choose(i)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded px-2 text-sm',
                  sm ? 'h-7' : 'h-8',
                  i === active && 'bg-panel-3',
                  o.disabled ? 'cursor-not-allowed opacity-40' : 'text-fg',
                )}
              >
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="num text-xs text-faint">{o.hint}</span>}
                <Check size={13} className={clsx('shrink-0 text-accent', !isSelected && 'invisible')} />
              </li>
            );
          })}
        </ul>
      </Floating>
    </>
  );
}
