import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useToasts, type ToastKind } from '@/store/toasts';

const ICON: Record<ToastKind, ReactNode> = {
  success: <CircleCheck size={16} className="text-up" />,
  error: <CircleAlert size={16} className="text-down" />,
  info: <Info size={16} className="text-info" />,
};
const ACCENT: Record<ToastKind, string> = { success: 'before:bg-up', error: 'before:bg-down', info: 'before:bg-info' };

/** Renders the toast queue (store/toasts). Mounted once by the AppShell. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-14 z-toast flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-[340px]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'panel pointer-events-auto relative flex gap-2.5 overflow-hidden py-2.5 pl-3.5 pr-2 shadow-float animate-slide-in',
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
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="h-6 w-6 shrink-0 rounded text-faint hover:bg-panel-3 hover:text-fg">
            <X size={14} className="mx-auto" />
          </button>
        </div>
      ))}
    </div>
  );
}
