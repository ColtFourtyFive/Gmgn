import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from './TopBar';
import { TOUR_STEPS } from './tour';

// A viewport where `min-width` queries match (desktop) or not (phone).
function viewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? desktop : !desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHeader() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <TopBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;
const matches = (id: string) => step(id).target.some((sel) => document.querySelector(sel) !== null);

describe('tour targets in the header', () => {
  it.each([true, false])('finds the chain switcher (desktop: %s)', (desktop) => {
    viewport(desktop);
    renderHeader();
    expect(matches('chain')).toBe(true);
    const hit = document.querySelector(step('chain').target[0])!;
    expect(hit.querySelector('button[aria-haspopup="listbox"]')).not.toBeNull();
  });

  it('finds every header step on desktop', () => {
    viewport(true);
    renderHeader();
    for (const id of ['chain', 'search', 'monitor', 'dock']) expect(matches(id), id).toBe(true);
  });
});
