// Onboarding tour run state and its "seen" flag. startTour() (re)plays the
// tour from anywhere (account menu, phone menu, command palette, settings);
// finishing or skipping marks it seen, so it never starts on its own again.

import { create } from 'zustand';

const SEEN_KEY = 'ts.tour.seen';

/** True once the tour was finished or skipped in this browser (or storage is unavailable: never nag). */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

interface TourState {
  open: boolean;
  /** Step shown (index into the steps resolved for the page). */
  index: number;
  /** Bumped per start, so a replay always begins at the first step. */
  run: number;
  setIndex(index: number): void;
  /** Close and remember it was seen. */
  finish(): void;
}

export const useTour = create<TourState>((set) => ({
  open: false,
  index: 0,
  run: 0,
  setIndex: (index) => set({ index }),
  finish() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    set({ open: false, index: 0 });
  },
}));

/** Start (or restart) the onboarding tour. */
export function startTour(): void {
  useTour.setState((s) => ({ open: true, index: 0, run: s.run + 1 }));
}
