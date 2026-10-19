// One shared 1s clock for every live-updating age/countdown on the page.
// Components subscribe through useSyncExternalStore; a single interval runs
// only while at least one component is mounted.

import { useSyncExternalStore } from 'react';

let offsetMs = 0;
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now() + offsetMs;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now() + offsetMs;
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number => now;

/** Server-aligned current time (ms); re-renders the caller once per second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Server-aligned current time without subscribing (event handlers, effects). */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Align the shared clock with the server's simulation clock (serverTime - Date.now()). */
export function setClockOffset(ms: number): void {
  offsetMs = Number.isFinite(ms) ? ms : 0;
  now = Date.now() + offsetMs;
}
