import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

afterEach(cleanup);

function setup(onSave: () => Promise<boolean> = async () => true) {
  function Settings() {
    const [dirty, setDirty] = useState(false);
    const [, setParams] = useSearchParams();
    return (
      <>
        <h1>Settings</h1>
        <button type="button" onClick={() => setDirty(true)}>
          Edit slippage
        </button>
        <button type="button" onClick={() => setParams({ section: 'display' })}>
          Display tab
        </button>
        <Link to="/sol/trending">Trending</Link>
        <UnsavedChangesGuard dirty={dirty} onSave={onSave} />
      </>
    );
  }
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <Settings /> },
      { path: '/sol/trending', element: <h1>Trending</h1> },
    ],
    { initialEntries: ['/settings'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('UnsavedChangesGuard', () => {
  it('lets a clean page go', () => {
    setup();
    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    expect(heading()).toBe('Trending');
  });

  it('asks before an in-app navigation drops unsaved edits: Stay keeps them, Discard leaves', () => {
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit slippage' }));
    // Switching sections on the page is not leaving it.
    fireEvent.click(screen.getByRole('button', { name: 'Display tab' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    expect(screen.getByRole('dialog', { name: 'Leave with unsaved changes?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/settings');

    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(heading()).toBe('Trending');
  });

  it('Save and leave saves first, and stays when saving fails', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const router = setup(onSave);
    fireEvent.click(screen.getByRole('button', { name: 'Edit slippage' }));
    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save and leave' })));
    expect(router.state.location.pathname).toBe('/settings');

    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save and leave' })));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(heading()).toBe('Trending');
  });
});
