import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, nextSort, sortRows, type Column } from './DataTable';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  value: number | null;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', value: 2 },
  { id: 'b', name: 'Bravo', value: null },
  { id: 'c', name: 'Charlie', value: 10 },
  { id: 'd', name: 'Delta', value: -1 },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, sortValue: (r) => r.name, render: (r) => r.name },
  { key: 'value', header: 'Value', align: 'right', sortable: true, sortValue: (r) => r.value, render: (r) => String(r.value ?? '--') },
  { key: 'action', header: 'Action', render: (r) => <button type="button">act {r.id}</button> },
];

const bodyNames = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('row')
    .map((tr) => tr.querySelector('td')!.textContent);

describe('sorting helpers', () => {
  it('nextSort starts descending and flips on the same key', () => {
    expect(nextSort(null, 'x')).toEqual({ key: 'x', dir: 'desc' });
    expect(nextSort({ key: 'x', dir: 'desc' }, 'x')).toEqual({ key: 'x', dir: 'asc' });
    expect(nextSort({ key: 'x', dir: 'asc' }, 'x')).toEqual({ key: 'x', dir: 'desc' });
    expect(nextSort({ key: 'x', dir: 'asc' }, 'y')).toEqual({ key: 'y', dir: 'desc' });
  });

  it('sortRows keeps nulls last in both directions and is stable', () => {
    const get = (r: Row) => r.value;
    expect(sortRows(ROWS, get, 'desc').map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(sortRows(ROWS, get, 'asc').map((r) => r.id)).toEqual(['d', 'a', 'c', 'b']);
  });
});

describe('DataTable', () => {
  it('sorts client-side when clicking sortable headers (desc, then asc)', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(bodyNames()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    const valueHeader = screen.getByRole('columnheader', { name: /value/i });
    fireEvent.click(within(valueHeader).getByRole('button'));
    expect(valueHeader.getAttribute('aria-sort')).toBe('descending');
    expect(bodyNames()).toEqual(['Charlie', 'Alpha', 'Delta', 'Bravo']);

    fireEvent.click(within(valueHeader).getByRole('button'));
    expect(valueHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyNames()).toEqual(['Delta', 'Alpha', 'Charlie', 'Bravo']);
  });

  it('in controlled + manualSort mode reports sort changes without reordering', () => {
    const onSortChange = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} sort={{ key: 'name', dir: 'asc' }} onSortChange={onSortChange} manualSort />);
    fireEvent.click(within(screen.getByRole('columnheader', { name: /value/i })).getByRole('button'));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'value', dir: 'desc' });
    expect(bodyNames()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('fires onRowClick for the row but not for interactive children', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Charlie'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toMatchObject({ id: 'c' });
    fireEvent.click(screen.getByRole('button', { name: 'act c' }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton rows while loading and an empty state when there is no data', () => {
    const { rerender, container } = render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} loading skeletonRows={3} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(container.querySelector('.skeleton')).not.toBeNull();
    rerender(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty={<p>Nothing here</p>} />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});
