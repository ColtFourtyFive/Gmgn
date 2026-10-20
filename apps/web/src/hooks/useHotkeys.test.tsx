import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { useHotkeys } from './useHotkeys';

afterEach(cleanup);

describe('useHotkeys', () => {
  it('leaves Enter to a focused link or button (it activates it)', () => {
    const enter = vi.fn();
    renderHook(() => useHotkeys({ enter }));
    const { getByRole } = render(
      <>
        <a href="/sol/trending">Trending</a>
        <button type="button">Account menu</button>
        <div role="menuitem" tabIndex={-1}>
          Watchlist
        </div>
      </>,
    );
    fireEvent.keyDown(getByRole('link'), { key: 'Enter' });
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });
    fireEvent.keyDown(getByRole('menuitem'), { key: 'Enter' });
    expect(enter).not.toHaveBeenCalled();

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('still handles letter shortcuts on a focused button', () => {
    const b = vi.fn();
    renderHook(() => useHotkeys({ b }));
    const { getByRole } = render(<button type="button">Buy</button>);
    fireEvent.keyDown(getByRole('button'), { key: 'b' });
    expect(b).toHaveBeenCalledTimes(1);
  });
});
