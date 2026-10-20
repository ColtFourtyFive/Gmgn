import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { startTour, useTour } from '@/store/tour';
import { Tour } from './Tour';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  act(() => useTour.getState().finish());
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const stepLabel = () => screen.getByText(/^Tour · \d of \d$/).textContent;

describe('Tour keyboard', () => {
  it('keeps focus in the dialog when Back returns to the first step', () => {
    render(
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <button type="button">Opener</button>
        <Tour />
      </MemoryRouter>,
    );
    act(() => startTour());
    const next = screen.getByRole('button', { name: /^Next/ });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(stepLabel()).toBe('Tour · 2 of 6');

    const back = screen.getByRole('button', { name: 'Back' });
    act(() => back.focus());
    fireEvent.click(back);
    expect(stepLabel()).toBe('Tour · 1 of 6');
    // Back is gone on step 1: focus moves to Next instead of falling to <body>.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Next/ }));

    // So the arrow keys keep working.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(stepLabel()).toBe('Tour · 2 of 6');
  });
});
