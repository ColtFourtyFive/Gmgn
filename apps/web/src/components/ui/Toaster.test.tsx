import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LINK_MIN_MS, RESUME_MIN_MS, toast, useToasts } from '@/store/toasts';
import { Toaster } from './Toaster';

beforeEach(() => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <Toaster />
    </MemoryRouter>,
  );
});

afterEach(() => {
  act(() => useToasts.getState().clear());
  cleanup();
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('toast auto-dismiss', () => {
  it('waits while the pointer is over the toast', () => {
    act(() => void toast.info('SLA hidden', undefined, { to: '/settings', label: 'Manage blacklist' }));
    const el = screen.getByRole('status');
    fireEvent.mouseEnter(el);
    advance(60_000);
    expect(screen.getByRole('link', { name: 'Manage blacklist' })).toBeTruthy();
    // The countdown continues where it stopped.
    fireEvent.mouseLeave(el);
    advance(LINK_MIN_MS - 100);
    expect(screen.queryByRole('status')).not.toBeNull();
    advance(200);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves a moment to read after a toast was held near its end', () => {
    act(() => void toast.info('Copied'));
    advance(4_900);
    const el = screen.getByRole('status');
    fireEvent.mouseEnter(el);
    advance(10_000);
    fireEvent.mouseLeave(el);
    advance(RESUME_MIN_MS - 100);
    expect(screen.queryByRole('status')).not.toBeNull();
    advance(200);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('waits while its link has keyboard focus', () => {
    act(() => void toast.success('Following', undefined, { to: '/sol/monitor', label: 'Open Monitor' }));
    const link = screen.getByRole('link', { name: 'Open Monitor' });
    act(() => link.focus());
    advance(60_000);
    expect(document.activeElement).toBe(link);
    act(() => link.blur());
    advance(LINK_MIN_MS + 100);
    expect(screen.queryByRole('link', { name: 'Open Monitor' })).toBeNull();
  });

  it('gives toasts with a link more time and plain ones their default', () => {
    act(() => void toast.success('Bought PEPE', undefined, { to: '/sol/token/x', label: 'View token' }));
    act(() => void toast.success('Saved'));
    advance(4_100);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Bought PEPE')).toBeTruthy();
    advance(LINK_MIN_MS - 4_000);
    expect(screen.queryByText('Bought PEPE')).toBeNull();
  });
});
