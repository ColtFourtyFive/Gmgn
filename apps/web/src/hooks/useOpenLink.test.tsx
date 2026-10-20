import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useOpenLink } from './useOpenLink';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
}
const COLUMNS: Column<Row>[] = [{ key: 'id', header: 'Id', render: (r) => r.id }];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function Board() {
  const openLink = useOpenLink();
  return <DataTable columns={COLUMNS} rows={[{ id: 'alpha' }]} rowKey={(r) => r.id} onRowClick={(r, e) => openLink(`/sol/address/${r.id}`, e)} />;
}

function setup() {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  render(
    <MemoryRouter initialEntries={['/sol/leaderboard']}>
      <Routes>
        <Route path="*" element={<Board />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
  return { open, where: () => screen.getByTestId('where').textContent };
}

describe('row links (useOpenLink + DataTable)', () => {
  it('Ctrl/Cmd-click opens the row in a new tab and keeps the page', () => {
    const { open, where } = setup();
    fireEvent.click(screen.getByText('alpha'), { ctrlKey: true });
    fireEvent.click(screen.getByText('alpha'), { metaKey: true });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('/sol/address/alpha', '_blank', 'noopener');
    expect(where()).toBe('/sol/leaderboard');
  });

  it('a middle click opens a new tab too', () => {
    const { open, where } = setup();
    fireEvent(screen.getByText('alpha'), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(open).toHaveBeenCalledWith('/sol/address/alpha', '_blank', 'noopener');
    expect(where()).toBe('/sol/leaderboard');
  });

  it('a plain click navigates in place', () => {
    const { open, where } = setup();
    fireEvent.click(screen.getByText('alpha'));
    expect(open).not.toHaveBeenCalled();
    expect(where()).toBe('/sol/address/alpha');
  });
});
