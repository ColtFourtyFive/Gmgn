import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Drawer } from './Drawer';
import { Tooltip } from './Tooltip';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function FilterDrawer() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Filters">
      <input aria-label="Market cap min" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <Tooltip content="Low-risk preset" delay={0}>
        <button type="button">Safe</button>
      </Tooltip>
    </Drawer>
  );
}

describe('Tooltip', () => {
  it('Escape hides a tooltip inside a drawer without closing the drawer (and losing its draft)', () => {
    vi.useFakeTimers();
    render(<FilterDrawer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Market cap min' }), { target: { value: '50000' } });
    act(() => screen.getByRole('button', { name: 'Safe' }).focus());
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe('Low-risk preset');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Market cap min' }) as HTMLInputElement).value).toBe('50000');

    // With no tooltip shown, Escape closes the drawer as before.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
