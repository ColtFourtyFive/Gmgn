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
  /** Auto-dismiss delay; 0 keeps the toast until closed. Defaults by kind (longer with a link). */
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
}

interface ToastState {
  toasts: Toast[];
  push(input: ToastInput): number;
  dismiss(id: number): void;
  /** Stop the auto-dismiss countdown (pointer over the toast, or focus in it). */
  pause(id: number): void;
  /** Continue the countdown, with at least RESUME_MIN_MS left. */
  resume(id: number): void;
  clear(): void;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION: Record<ToastKind, number> = { success: 4000, info: 5000, error: 7000 };
/** Toasts with a link stay at least this long: there is something to reach. */
export const LINK_MIN_MS = 8000;
/** Time left after the pointer or focus leaves a paused toast. */
export const RESUME_MIN_MS = 2000;

let seq = 0;
/** Auto-dismiss countdowns: running (`handle` set) or paused with `remaining` ms left. */
const timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>();

function clearTimer(id: number): void {
  const t = timers.get(id);
  if (t?.handle) clearTimeout(t.handle);
  timers.delete(id);
}

function startTimer(id: number, ms: number): void {
  timers.set(id, { handle: setTimeout(() => useToasts.getState().dismiss(id), ms), remaining: ms, startedAt: Date.now() });
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],

  push(input) {
    const id = ++seq;
    set((s) => {
      const next = [...s.toasts, { ...input, id }];
      // Drop the oldest beyond the visible cap (and their timers).
      for (const old of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) clearTimer(old.id);
      return { toasts: next.slice(-MAX_VISIBLE) };
    });
    const ms = input.durationMs ?? (input.link ? Math.max(LINK_MIN_MS, DEFAULT_DURATION[input.kind]) : DEFAULT_DURATION[input.kind]);
    if (ms > 0) startTimer(id, ms);
    return id;
  },

  pause(id) {
    const t = timers.get(id);
    if (!t?.handle) return;
    clearTimeout(t.handle);
    timers.set(id, { handle: null, remaining: t.remaining - (Date.now() - t.startedAt), startedAt: 0 });
  },

  resume(id) {
    const t = timers.get(id);
    if (!t || t.handle) return;
    startTimer(id, Math.max(RESUME_MIN_MS, t.remaining));
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
