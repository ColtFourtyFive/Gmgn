// Focus restore when a dialog closes: back to the opener, or, when the
// dialog's own action removed the opener (confirm-delete), to the control
// that took its place, never to <body>.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './Modal';

// jsdom has no layout: treat every attached element as rendered.
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.isConnected ? this.parentElement : null; } });
});
afterAll(() => {
  if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', desc);
});
afterEach(cleanup);

function Tasks() {
  const [tasks, setTasks] = useState(['T0', 'T1', 'T2']);
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <main tabIndex={-1}>
      <ul>
        {tasks.map((t) => (
          <li key={t}>
            {t}
            <button type="button" onClick={() => setDeleting(t)}>
              Delete {t}
            </button>
          </li>
        ))}
      </ul>
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete task"
        footer={
          <button
            type="button"
            data-autofocus
            onClick={() => {
              setTasks((list) => list.filter((t) => t !== deleting));
              setDeleting(null);
            }}
          >
            Confirm delete
          </button>
        }
      >
        <p>Gone for good.</p>
      </Modal>
    </main>
  );
}

describe('overlay focus restore', () => {
  it('returns focus to the opener when it is still there', () => {
    render(<Tasks />);
    const opener = screen.getByRole('button', { name: 'Delete T1' });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete T1' }));
  });

  it('moves focus to the next row when the confirmed action deleted the opener', () => {
    render(<Tasks />);
    const opener = screen.getByRole('button', { name: 'Delete T1' });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(screen.queryByRole('button', { name: 'Delete T1' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete T2' }));
  });

  it('falls back to the previous row when the last one was deleted', () => {
    render(<Tasks />);
    const opener = screen.getByRole('button', { name: 'Delete T2' });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete T1' }));
  });
});
