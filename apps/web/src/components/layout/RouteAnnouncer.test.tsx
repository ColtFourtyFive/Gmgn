import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PageHeader } from './Page';
import { RouteAnnouncer } from './RouteAnnouncer';

afterEach(cleanup);

function Shell() {
  const { pathname } = useLocation();
  return (
    <>
      <Link to="/sol/trending">Trending</Link>
      <Routes>
        <Route path="/sol/trenches" element={<PageHeader title="Trenches" />} />
        <Route path="/sol/trending" element={<PageHeader title="Trending" />} />
        <Route path="/portfolio" element={<PageHeader title="Portfolio" />} />
      </Routes>
      <RouteAnnouncer pathname={pathname} />
    </>
  );
}

describe('page titles and route announcements', () => {
  it('titles each page and announces client-side navigation', async () => {
    document.head.innerHTML = '<title>Trenchscope</title>';
    render(
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <Shell />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Trenches · Solana · Trenchscope');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(''); // nothing on first load

    fireEvent.click(screen.getByRole('link', { name: 'Trending' }));
    expect(document.title).toBe('Trending · Solana · Trenchscope');
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(status.textContent).toBe('Trending · Solana');
  });

  it('global routes have no chain in the title', () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <Shell />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Portfolio · Trenchscope');
  });
});
