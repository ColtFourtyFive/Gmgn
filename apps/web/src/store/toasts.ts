// Toast queue. Rendered by <Toaster/> (mounted once in the AppShell).
// Call `toast.success(...)` etc. from anywhere, including non-React code.

import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastInput {
  kind: ToastKind;
  title: string;
  body?: string;
  /** In-app route rendered as a link under the body. */
  link?: { to: string; label?: string };
  /** Auto-dismiss delay; 0 keeps the toast until closed. Defaults by kind. */
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
}

interface ToastState {
  toasts: Toast[];
  push(input: ToastInput): number;
  dismiss(id: number): void;
  clear(): void;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION: Record<ToastKind, number> = { success: 4000, info: 5000, error: 7000 };

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push(input) {
    const id = ++seq;
    set((s) => {
      const next = [...s.toasts, { ...input, id }];
      // Drop the oldest beyond the visible cap (and their timers).
      for (const old of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) clearTimer(old.id);
      return { toasts: next.slice(-MAX_VISIBLE) };
    });
    const ms = input.durationMs ?? DEFAULT_DURATION[input.kind];
    if (ms > 0) timers.set(id, setTimeout(() => get().dismiss(id), ms));
    return id;
  },

  dismiss(id) {
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clear() {
    for (const id of timers.keys()) clearTimer(id);
    set({ toasts: [] });
  },
}));

type Shortcut = (title: string, body?: string, link?: ToastInput['link']) => number;

const shortcut =
  (kind: ToastKind): Shortcut =>
  (title, body, link) =>
    useToasts.getState().push({ kind, title, body, link });

/** Imperative helpers: `toast.success('Bought PEPE', '0.5 SOL @ $0.0₅12')`. */
export const toast = {
  success: shortcut('success'),
  error: shortcut('error'),
  info: shortcut('info'),
  push: (input: ToastInput) => useToasts.getState().push(input),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
