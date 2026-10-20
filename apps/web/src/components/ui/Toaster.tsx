import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useToasts, type Toast, type ToastKind } from '@/store/toasts';

const ICON: Record<ToastKind, ReactNode> = {
  success: <CircleCheck size={16} className="text-up" />,
  error: <CircleAlert size={16} className="text-down" />,
  info: <Info size={16} className="text-info" />,
};
const ACCENT: Record<ToastKind, string> = { success: 'before:bg-up', error: 'before:bg-down', info: 'before:bg-info' };

/**
 * Renders the toast queue (store/toasts). Mounted once by the AppShell.
 * Phones: under the top bar, newest first. Desktop (md+): bottom-right just
 * above the status bar, newest nearest the corner, so toasts stay clear of
 * the top-right trade panel on token pages.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-14 z-toast flex flex-col-reverse items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-[340px] md:bottom-10 md:top-auto md:flex-col"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/** One toast. Its auto-dismiss countdown waits while the pointer is over it or focus is in it (WCAG 2.2.1). */
function ToastItem({ toast: t }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    const { pause, resume } = useToasts.getState();
    if (held) pause(t.id);
    else resume(t.id);
  }, [held, t.id]);
  return (
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={clsx(
        'panel pointer-events-auto relative flex gap-2.5 overflow-hidden py-2.5 pl-3.5 pr-2 shadow-float animate-slide-in md:animate-slide-up',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        ACCENT[t.kind],
      )}
    >
      <span className="mt-px shrink-0">{ICON[t.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{t.title}</p>
        {t.body && <p className="num mt-0.5 break-words text-xs text-muted">{t.body}</p>}
        {t.link && (
          <Link to={t.link.to} onClick={() => dismiss(t.id)} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
            {t.link.label ?? 'Open'}
          </Link>
        )}
        {t.action && (
          <button
            type="button"
            onClick={() => {
              dismiss(t.id);
              t.action?.run();
            }}
            className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="h-6 w-6 shrink-0 rounded text-faint hover:bg-panel-3 hover:text-fg">
        <X size={14} className="mx-auto" />
      </button>
    </div>
  );
}
