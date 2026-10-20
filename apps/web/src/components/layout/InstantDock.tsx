// Instant trade dock (PRD SH-11: the Positions and Instant Trade panels).
// Desktop: a floating panel, bottom-left by default (clear of the token
// page's trade column), dragged by its header or moved with the grip's arrow
// keys, resized from its top-right corner (pointer or arrow keys) and
// collapsible to its header. Its rect is remembered per viewport class in
// localStorage and re-clamped when the window resizes. Phones: the same tabs
// in a bottom sheet. Opened from the top bar, the "i" hotkey, the command
// palette and the phone menu (useDock().toggle).

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, GripVertical, MoveDiagonal, Wallet, X, Zap } from 'lucide-react';
import clsx from 'clsx';
import { DockPositions, InstantTradeTab } from '@/components/trade/InstantTrade';
import { Drawer, IconButton, Tabs, type TabItem } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useDisplaySettings } from '@/hooks/useSettings';
import { useDock, type DockTab } from '@/store/dock';
import {
  arrowDelta,
  clampDockRect,
  collapsedTop,
  defaultDockRect,
  DOCK_HEADER,
  moveDockRect,
  parseDockRects,
  resizeDockRect,
  viewportKey,
  type DockInsets,
  type DockRect,
  type Viewport,
} from './dockLayout';
import { tokenRoute } from './nav';

/** Top bar (h-12) and status bar (h-7) heights. */
const INSETS: DockInsets = { top: 48, bottom: 28 };
const RECTS_KEY = 'ts.dock.rects';

const TABS: TabItem<DockTab>[] = [
  { value: 'trade', label: 'Instant trade', icon: <Zap size={13} /> },
  { value: 'positions', label: 'Positions', icon: <Wallet size={13} /> },
];

function viewportNow(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function useViewport(): Viewport {
  const [vp, setVp] = useState(viewportNow);
  useEffect(() => {
    const onResize = () => setVp(viewportNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

/** Body of the active tab: Instant trade targets the token page on screen, else the last one viewed. */
function DockBody({ tab }: { tab: DockTab }) {
  const route = tokenRoute(useLocation().pathname);
  const lastToken = useDock((s) => s.lastToken);
  const chain = useActiveChain();
  return tab === 'trade' ? <InstantTradeTab target={route ?? lastToken} onPage={!!route} /> : <DockPositions chain={chain} />;
}

interface Gesture {
  mode: 'move' | 'resize';
  pointerId: number;
  x: number;
  y: number;
  rect: DockRect;
}

function FloatingDock() {
  const tab = useDock((s) => s.tab);
  const collapsed = useDock((s) => s.collapsed);
  const vp = useViewport();
  const key = viewportKey(vp.width);
  const [saved, setSaved] = useLocalStorage<unknown>(RECTS_KEY, {});
  // Live rect while a pointer gesture runs (saved on release).
  const [live, setLive] = useState<DockRect | null>(null);
  const liveRef = useRef<DockRect | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const rect = clampDockRect(live ?? parseDockRects(saved)[key] ?? defaultDockRect(vp, INSETS), vp, INSETS);
  const save = (next: DockRect) => setSaved((prev: unknown) => ({ ...parseDockRects(prev), [key]: next }));

  const begin = (mode: Gesture['mode']) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // The header drags from its empty space and the grip; its tabs and buttons keep their clicks.
    if (mode === 'move' && (e.target as HTMLElement).closest('[role="tab"],button:not([data-dock-grip])')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { mode, pointerId: e.pointerId, x: e.clientX, y: e.clientY, rect };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const next = g.mode === 'move' ? moveDockRect(g.rect, dx, dy, viewportNow(), INSETS) : resizeDockRect(g.rect, dx, dy, viewportNow(), INSETS);
    liveRef.current = next;
    setLive(next);
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (liveRef.current) save(liveRef.current);
    liveRef.current = null;
    setLive(null);
  };
  const gestureHandlers = (mode: Gesture['mode']) => ({ onPointerDown: begin(mode), onPointerMove, onPointerUp: end, onPointerCancel: end });

  const onKey = (mode: Gesture['mode']) => (e: KeyboardEvent) => {
    const d = arrowDelta(e.key, e.shiftKey);
    if (!d) return;
    e.preventDefault();
    save(mode === 'move' ? moveDockRect(rect, d[0], d[1], vp, INSETS) : resizeDockRect(rect, d[0], d[1], vp, INSETS));
  };

  const dock = useDock.getState();
  const top = collapsed ? collapsedTop(rect, vp) : rect.y;
  return (
    <section
      aria-label="Instant trade dock"
      className={clsx('fixed z-[40] flex flex-col overflow-hidden rounded border border-line-strong bg-panel shadow-float animate-pop-in', live && 'select-none')}
      style={{ left: rect.x, top, width: rect.width, height: collapsed ? DOCK_HEADER : rect.height }}
    >
      <header
        {...gestureHandlers('move')}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && dock.setCollapsed(!collapsed)}
        className="flex h-10 shrink-0 cursor-move touch-none items-center gap-1 border-b border-line pl-1 pr-1.5"
      >
        <button
          type="button"
          data-dock-grip
          aria-label="Move dock (arrow keys)"
          title="Drag to move · arrow keys move it too"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          onKeyDown={onKey('move')}
          className="flex h-7 w-5 shrink-0 cursor-move items-center justify-center rounded text-faint hover:bg-panel-3 hover:text-fg"
        >
          <GripVertical size={14} aria-hidden />
        </button>
        <Tabs
          size="sm"
          value={tab}
          onChange={(t) => {
            dock.setTab(t);
            dock.setCollapsed(false);
          }}
          items={TABS}
          aria-label="Dock panels"
          className="min-w-0 flex-1 border-b-0 [&>button]:h-10 [&>button]:px-2"
        />
        <IconButton
          size="xs"
          label={collapsed ? 'Expand dock' : 'Collapse dock'}
          icon={collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          onClick={() => dock.setCollapsed(!collapsed)}
        />
        <IconButton size="xs" label="Close dock (I)" icon={<X size={14} />} onClick={() => dock.setOpen(false)} />
      </header>
      {!collapsed && (
        <>
          <div role="tabpanel" aria-label={tab === 'trade' ? 'Instant trade' : 'Positions'} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <DockBody tab={tab} />
          </div>
          <button
            type="button"
            {...gestureHandlers('resize')}
            onKeyDown={onKey('resize')}
            aria-label="Resize dock (arrow keys)"
            title="Drag to resize · arrow keys resize too"
            className="absolute right-0 top-0 z-[1] flex h-4 w-4 cursor-nesw-resize touch-none items-start justify-end text-faint opacity-60 hover:text-fg hover:opacity-100 focus-visible:opacity-100"
          >
            <MoveDiagonal size={10} aria-hidden className="rotate-90" />
          </button>
        </>
      )}
    </section>
  );
}

function DockSheet() {
  const open = useDock((s) => s.sheetOpen);
  const tab = useDock((s) => s.tab);
  return (
    <Drawer open={open} onClose={() => useDock.getState().setSheetOpen(false)} side="bottom" title="Instant trade" className="h-[80dvh]" bodyClassName="flex flex-col">
      <Tabs value={tab} onChange={(t) => useDock.getState().setTab(t)} items={TABS} aria-label="Dock panels" className="shrink-0 px-2 [&>button]:flex-1 [&>button]:justify-center" />
      <div role="tabpanel" aria-label={tab === 'trade' ? 'Instant trade' : 'Positions'} className="min-h-0 flex-1">
        <DockBody tab={tab} />
      </div>
    </Drawer>
  );
}

/** Mounted once by the AppShell: floating panel (≥md) or bottom sheet (phones), plus the "i" hotkey. */
export function InstantDock() {
  const mobile = useIsMobile();
  const open = useDock((s) => s.open);
  const { hotkeys } = useDisplaySettings();
  useHotkeys({ i: () => useDock.getState().toggle() }, { enabled: hotkeys && !mobile });
  if (mobile) return <DockSheet />;
  return open ? <FloatingDock /> : null;
}
