import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PauseStatus } from './PauseStatus';

afterEach(cleanup);

describe('PauseStatus', () => {
  it('announces only pausing and resuming', () => {
    const view = render(<PauseStatus paused={false} what="Feed" />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    view.rerender(<PauseStatus paused what="Feed" />);
    expect(status.textContent).toBe('Feed paused');
    // Re-renders while paused (new trades arriving) change nothing.
    view.rerender(<PauseStatus paused what="Feed" />);
    expect(status.textContent).toBe('Feed paused');
    view.rerender(<PauseStatus paused={false} what="Feed" />);
    expect(status.textContent).toBe('Feed resumed');
  });
});
