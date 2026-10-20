import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ChainId } from '@trenchscope/shared';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Menu, Popover } from '@/components/ui';
import { activeSection, NAV_ITEMS, type NavItem } from './nav';

// The nav clips its overflow (measure-and-fold), so the focus ring is drawn inside the item.
const ITEM = 'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors focus-visible:outline-offset-[-2px]';
const GAP = 2;

function itemClass(active: boolean) {
  return clsx(ITEM, active ? 'bg-panel-3 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg');
}

function Label({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <>
      <Icon size={14} className="shrink-0" aria-hidden />
      {item.label}
    </>
  );
}

/**
 * Primary section links. Measures itself and moves whatever does not fit
 * into a "More" menu, so it adapts to any width without breakpoints.
 */
export function MainNav({ chain, className }: { chain: ChainId; className?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = activeSection(pathname);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(NAV_ITEMS.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const widths = Array.from(measure.children, (el) => (el as HTMLElement).offsetWidth + GAP);
      const moreWidth = widths.pop() ?? 0;
      const available = container.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) {
        setVisible(widths.length);
        return;
      }
      let used = moreWidth;
      let count = 0;
      while (count < widths.length && used + widths[count] <= available) used += widths[count++];
      setVisible(count);
    };
    compute();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null;
    ro?.observe(container);
    ro?.observe(measure); // re-measure once web fonts load
    return () => ro?.disconnect();
  }, []);

  const shown = NAV_ITEMS.slice(0, visible);
  const overflow = NAV_ITEMS.slice(visible);
  const overflowActive = overflow.some((i) => i.section === section);

  return (
    <nav aria-label="Primary" ref={containerRef} className={clsx('relative flex min-w-0 flex-1 items-center overflow-hidden', className)} style={{ gap: GAP }}>
      {/* Invisible measuring row: natural widths of every item plus the More button. */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex" style={{ gap: GAP }}>
        {NAV_ITEMS.map((item) => (
          <span key={item.key} className={ITEM}>
            <Label item={item} />
          </span>
        ))}
        <span className={ITEM}>
          More <ChevronDown size={13} />
        </span>
      </div>

      {shown.map((item) => (
        <Link key={item.key} to={item.href(chain)} aria-current={item.section === section ? 'page' : undefined} className={itemClass(item.section === section)}>
          <Label item={item} />
        </Link>
      ))}

      {overflow.length > 0 && (
        <Popover
          placement="bottom-start"
          trigger={
            <button type="button" className={itemClass(overflowActive)}>
              More <ChevronDown size={13} />
            </button>
          }
          role="menu"
        >
          {(close) => (
            <Menu
              onDone={close}
              items={overflow.map((item) => ({
                key: item.key,
                label: <span className={clsx(item.section === section && 'text-accent')}>{item.label}</span>,
                icon: <item.icon size={14} />,
                onSelect: () => navigate(item.href(chain)),
              }))}
            />
          )}
        </Popover>
      )}
    </nav>
  );
}
