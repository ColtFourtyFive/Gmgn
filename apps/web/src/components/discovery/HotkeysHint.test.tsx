import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HotkeysHint } from './HotkeysHint';

afterEach(cleanup);

describe('HotkeysHint', () => {
  it('links to the Display tab (where the toggle is) and carries the trading-hotkeys opt-in', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <HotkeysHint rows={[{ keys: ['B'], label: 'Quick buy selected', trading: true }]} enabled={false} trading={{ enabled: false, onChange }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings?section=display');
    expect(screen.getByText('Quick buy selected').textContent).toBe('Quick buy selected (off)');
    const toggle = screen.getByRole('switch', { name: /Trading hotkeys/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
