// Onboarding tour overlay: a spotlight cut out around each step's element
// (the rest of the app dimmed and inert) and a card with Back / Next / Skip.
// Desktop places the card beside the element; phones show a bottom sheet
// (top sheet when the element sits low). Escape skips, ←/→ step through.
// Starts by itself on the first visit to Trenches or a token page (never in
// automated browsers, whose fresh profiles would always see it); startTour()
// replays it.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import clsx from 'clsx';
import { Button, computePosition, IconButton } from '@/components/ui';
import { useOverlay } from '@/components/ui/overlay';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { startTour, tourSeen, useTour } from '@/store/tour';
import { resolveTourSteps, sheetEdge, TOUR_STEPS, tourPage, tourStartPath, unionBox, type Box, type TourStep } from './tour';

/** Delay before the first-visit tour, so the page has rendered its live data. */
const AUTO_START_MS = 1500;
/** Re-measure cadence (live boards shift under the spotlight). */
const MEASURE_MS = 150;
const PAD = 6;
const CARD_WIDTH = 320;

function visibleRect(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

/** Elements of the first selector with a visible match. */
function findTargets(step: TourStep): Element[] {
  for (const selector of step.target) {
    const hits = Array.from(document.querySelectorAll(selector)).filter((el) => visibleRect(el));
    if (hits.length) return step.union ? hits : hits.slice(0, 1);
  }
  return [];
}

const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** Live box of a step's target (measured before paint, then every MEASURE_MS); null while missing. */
function useTargetBox(step: TourStep, reducedMotion: boolean): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    let scrolled = false;
    const measure = () => {
      const els = findTargets(step);
      if (els.length && !scrolled) {
        scrolled = true;
        els[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
      const next = unionBox(els.map(visibleRect).filter((b): b is Box => b !== null));
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };
    measure();
    const timer = setInterval(measure, MEASURE_MS);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, reducedMotion]);
  return box;
}

function TourRun() {
  const mobile = useIsMobile();
  const reducedMotion = usePrefersReducedMotion();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const chain = useActiveChain();
  // Started somewhere without page steps: go to Trenches once, then follow wherever the visitor is.
  const [startPath] = useState(() => tourStartPath(pathname, chain));
  const [arrived, setArrived] = useState(!startPath);
  useEffect(() => {
    if (startPath) navigate(startPath);
  }, [startPath, navigate]);
  useEffect(() => {
    if (pathname === startPath) setArrived(true);
  }, [pathname, startPath]);

  const page = tourPage(pathname);
  const steps = useMemo(() => resolveTourSteps(TOUR_STEPS, { page, mobile }), [page, mobile]);
  const index = Math.min(useTour((s) => s.index), steps.length - 1);
  const step = steps[index];
  const box = useTargetBox(step, reducedMotion);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const titleId = useId();
  const bodyId = useId();
  const { finish, setIndex } = useTour.getState();

  useOverlay({ open: arrived, onClose: finish, ref: rootRef, trapFocus: true });

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [step, mobile, arrived]);

  const last = index === steps.length - 1;
  const next = () => (last ? finish() : setIndex(index + 1));
  const back = () => index > 0 && setIndex(index - 1);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
  };

  if (!arrived) return null;
  const spot = box && { top: box.top - PAD, left: box.left - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD };
  const motion = reducedMotion ? undefined : 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease';
  const vp = { width: window.innerWidth, height: window.innerHeight };
  let cardStyle: CSSProperties | undefined;
  if (mobile) {
    cardStyle = sheetEdge(spot, vp.height) === 'bottom' ? { bottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' } : { top: '0.5rem' };
  } else if (spot) {
    const anchor = { ...spot, bottom: spot.top + spot.height, right: spot.left + spot.width };
    const pos = computePosition(anchor, { width: CARD_WIDTH, height: cardHeight }, step.placement ?? 'bottom', 10, vp);
    cardStyle = { top: Math.min(Math.max(pos.top, 8), vp.height - cardHeight - 8), left: pos.left, width: CARD_WIDTH, transition: motion };
  } else {
    // No element to point at: centered.
    cardStyle = { inset: 0, margin: 'auto', height: 'fit-content', width: CARD_WIDTH };
  }

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} onKeyDown={onKeyDown} className="fixed inset-0 z-overlay">
      {spot ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-md ring-2 ring-accent"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)', transition: motion }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      )}
      <div
        ref={cardRef}
        className={clsx('panel fixed flex flex-col gap-2 p-3.5 shadow-float', mobile ? 'inset-x-2 rounded-lg animate-slide-up' : 'animate-fade-in')}
        style={cardStyle}
      >
        <div className="flex items-center gap-2">
          <span className="num text-2xs font-medium uppercase tracking-wide text-accent">
            Tour · {index + 1} of {steps.length}
          </span>
          <span className="flex flex-1 gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span key={s.id} className={clsx('h-1 flex-1 rounded-full', i <= index ? 'bg-accent' : 'bg-panel-3')} />
            ))}
          </span>
          <IconButton size="xs" label="Skip tour" icon={<X size={14} />} onClick={finish} className="-mr-1" />
        </div>
        <div aria-live="polite">
          <h2 id={titleId} className="text-md font-semibold text-fg">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1 text-sm text-muted">
            {step.body}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={finish} className="-ml-2">
            Skip
          </Button>
          <span className="flex-1" />
          {index > 0 && (
            <Button size="sm" icon={<ArrowLeft size={13} />} onClick={back}>
              Back
            </Button>
          )}
          <Button variant="primary" size="sm" iconRight={last ? undefined : <ArrowRight size={13} />} onClick={next} data-autofocus>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** First visit: start once the visitor lands on Trenches or a token page with no dialog open. */
function useAutoStart(): void {
  const page = tourPage(useLocation().pathname);
  useEffect(() => {
    if (page === 'other' || tourSeen() || navigator.webdriver) return;
    const timer = setTimeout(() => {
      if (!tourSeen() && !useTour.getState().open && !document.querySelector('[aria-modal="true"]')) startTour();
    }, AUTO_START_MS);
    return () => clearTimeout(timer);
  }, [page]);
}

/** Mounted once by the AppShell. */
export function Tour() {
  const open = useTour((s) => s.open);
  const run = useTour((s) => s.run);
  useAutoStart();
  return open ? <TourRun key={run} /> : null;
}
