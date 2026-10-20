import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { Floating, type Placement } from './Floating';

/** A menu popover's label, carried by the <Menu> inside (the panel itself is a plain container). */
const MenuLabelContext = createContext<string | undefined>(undefined);

export interface PopoverProps {
  /** Trigger element; receives aria-expanded / aria-haspopup / aria-controls. */
  trigger: ReactElement;
  /** Content, or a render function receiving `close`. Rendered only while open. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Controlled open state (omit for uncontrolled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Click toggles (default) or hover/focus opens with delays. */
  triggerOn?: 'click' | 'hover';
  placement?: Placement;
  offset?: number;
  /** Hover mode delays (ms). */
  openDelay?: number;
  closeDelay?: number;
  /** Classes for the floating panel. */
  className?: string;
  /** Classes for the inline-flex wrapper around the trigger. */
  anchorClassName?: string;
  /** Skip the default panel chrome (bg, border, shadow). */
  unstyled?: boolean;
  /** Popup kind for the trigger's aria-haspopup. With 'menu', put a <Menu> inside (it carries the menu role). */
  role?: 'dialog' | 'menu' | 'listbox';
  'aria-label'?: string;
  disabled?: boolean;
}

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const POPUP_ROLES = new Set(['button', 'link', 'combobox', 'menuitem', 'tab', 'treeitem', 'gridcell', 'row']);

/**
 * Popup state (aria-expanded / -haspopup / -controls) is only valid on a
 * control. Components (Button, IconButton, Link...) render one; a plain
 * wrapper element (e.g. the span around an avatar with a hover preview) does
 * not, so it gets no popup attributes.
 */
function interactiveTrigger(el: ReactElement): boolean {
  if (typeof el.type !== 'string') return true;
  const { role } = el.props as { role?: string };
  return role ? POPUP_ROLES.has(role) : INTERACTIVE_TAGS.has(el.type);
}

/**
 * Anchored floating panel (portal, auto-flip, Escape/outside-click close).
 * Click popovers move focus inside (first [data-autofocus] or focusable),
 * keep Tab within the panel and return focus to the trigger on close.
 * Use for menus, filter panels and pickers; for passive hints use Tooltip.
 */
export function Popover({
  trigger,
  children,
  open: openProp,
  onOpenChange,
  triggerOn = 'click',
  placement = 'bottom-start',
  offset,
  openDelay = 120,
  closeDelay = 150,
  className,
  anchorClassName,
  unstyled,
  role = 'dialog',
  'aria-label': ariaLabel,
  disabled,
}: PopoverProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = (controlled ? openProp : innerOpen) && !disabled;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();
  const hover = triggerOn === 'hover';

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A disabled popover's trigger is a plain control (e.g. FollowButton before there is a follow to edit): no popup state.
  const triggerEl =
    isValidElement(trigger) && interactiveTrigger(trigger) && !disabled
      ? cloneElement(trigger as ReactElement<Record<string, unknown>>, { 'aria-expanded': open, 'aria-haspopup': role, 'aria-controls': open ? id : undefined })
      : trigger;

  return (
    <>
      <span
        ref={anchorRef}
        className={clsx('inline-flex', anchorClassName)}
        onClick={hover || disabled ? undefined : () => setOpen(!open)}
        onMouseEnter={hover && !disabled ? () => schedule(true, openDelay) : undefined}
        onMouseLeave={hover ? () => schedule(false, closeDelay) : undefined}
        onFocus={hover && !disabled ? () => schedule(true, openDelay) : undefined}
        onBlur={hover ? () => schedule(false, closeDelay) : undefined}
      >
        {triggerEl}
      </span>
      {/* Mounted only while open: rows can each carry a hover card or menu. */}
      {open && (
        <Floating
          open
          anchorRef={anchorRef}
          placement={placement}
          offset={offset}
          onClose={close}
          trapFocus={!hover}
          id={id}
          role={role === 'menu' ? undefined : role}
          aria-label={role === 'menu' ? undefined : ariaLabel}
          onMouseEnter={hover ? cancel : undefined}
          onMouseLeave={hover ? () => schedule(false, closeDelay) : undefined}
          className={clsx(!unstyled && 'panel animate-pop-in shadow-float', className)}
        >
          <MenuLabelContext.Provider value={role === 'menu' ? ariaLabel : undefined}>{typeof children === 'function' ? children(close) : children}</MenuLabelContext.Provider>
        </Floating>
      )}
    </>
  );
}

export type HoverCardProps = Omit<PopoverProps, 'triggerOn'>;

/**
 * Rich preview on hover/focus (token or wallet previews). Opens after
 * `openDelay` (350ms), stays open while the pointer is over the card.
 * Pass `open`/`onOpenChange` to control it, e.g. to open it from a key
 * press for keyboard users; hover and focus still report through
 * `onOpenChange`, and Escape or an outside click closes it.
 */
export function HoverCard({ openDelay = 350, closeDelay = 150, placement = 'bottom-start', className, ...rest }: HoverCardProps) {
  return <Popover {...rest} triggerOn="hover" openDelay={openDelay} closeDelay={closeDelay} placement={placement} className={clsx('p-3', className)} />;
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Arrow/Home/End move focus between the enabled items of a menu. */
function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
  if (items.length === 0) return;
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  const last = items.length - 1;
  const next: Record<string, number> = {
    ArrowDown: i < 0 || i === last ? 0 : i + 1,
    ArrowUp: i <= 0 ? last : i - 1,
    Home: 0,
    End: last,
  };
  if (!(e.key in next)) return;
  e.preventDefault();
  items[next[e.key]].focus();
}

/**
 * Simple action list for use inside a Popover (account menu, row "more"
 * menus). The popover focuses the first item; arrows move between items.
 */
export function Menu({ items, onDone, className }: { items: MenuItem[]; onDone?: () => void; className?: string }) {
  const label = useContext(MenuLabelContext);
  return (
    <div role="menu" aria-label={label} onKeyDown={onMenuKeyDown} className={clsx('flex min-w-[180px] flex-col p-1', className)}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            it.onSelect();
            onDone?.();
          }}
          className={clsx(
            // Keeps the global 2px accent focus ring: the hover tint alone is ~1.2:1 against the menu.
            'flex h-8 items-center gap-2 rounded px-2 text-left text-sm transition-colors disabled:opacity-40',
            it.danger ? 'text-down hover:bg-down/10 focus-visible:bg-down/10' : 'text-fg hover:bg-panel-3 focus-visible:bg-panel-3',
          )}
        >
          {it.icon && <span className="flex w-4 justify-center text-muted">{it.icon}</span>}
          {it.label}
        </button>
      ))}
    </div>
  );
}
