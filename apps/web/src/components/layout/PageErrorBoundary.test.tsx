import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageErrorBoundary } from './PageErrorBoundary';

afterEach(cleanup);

function Boom(): never {
  throw new Error('kaboom');
}

describe('PageErrorBoundary', () => {
  it('contains a crashing page and recovers when the route changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <PageErrorBoundary resetKey="/sol/trending">
        <Boom />
      </PageErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('kaboom');

    rerender(
      <PageErrorBoundary resetKey="/sol/trenches">
        <p>Trenches</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText('Trenches')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('PageErrorBoundary: failed page chunk', () => {
  it('offers a reload (Retry would rethrow the cached failed import) and says what happened', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    function LazyFail(): never {
      throw new TypeError('Failed to fetch dynamically imported module: http://localhost/src/pages/SignalsPage.tsx');
    }
    render(
      <PageErrorBoundary resetKey="/sol/signals" onReload={reload}>
        <LazyFail />
      </PageErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load this page');
    expect(alert.textContent).not.toContain('crashed');
    expect(alert.textContent).not.toContain('server unreachable');
    screen.getByRole('button', { name: 'Reload' }).click();
    expect(reload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
