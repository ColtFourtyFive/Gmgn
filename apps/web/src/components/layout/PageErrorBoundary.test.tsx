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
