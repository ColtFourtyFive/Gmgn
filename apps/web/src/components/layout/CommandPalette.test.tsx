import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useUi } from '@/store/ui';
import { CommandPalette } from './CommandPalette';
import { RECENT_KEY } from './palette';

// jsdom has no layout: the palette scrolls the active option into view.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  useUi.setState({ paletteOpen: false });
});

function open() {
  useUi.setState({ paletteOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <CommandPalette />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('listbox', { name: 'Results' });
}

describe('command palette listbox', () => {
  it('holds only groups of options (the Clear recent button lives outside it)', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ type: 'command', id: 'action:settings' }]));
    const listbox = open();
    expect(within(listbox).getByRole('group', { name: 'Recent' })).toBeTruthy();
    expect(within(listbox).queryAllByRole('button')).toHaveLength(0);
    for (const group of within(listbox).getAllByRole('group')) {
      expect(group.tagName).not.toBe('LI');
      for (const child of Array.from(group.children)) expect(['option', 'presentation']).toContain(child.getAttribute('role'));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Clear recent' }));
    expect(within(listbox).queryByRole('group', { name: 'Recent' })).toBeNull();
  });

  it('keeps focus in the search field when Clear recent removes itself', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ type: 'command', id: 'action:settings' }]));
    open();
    const clear = screen.getByRole('button', { name: 'Clear recent' });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: 'Clear recent' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('is its own scroll container, controlled by the combobox', () => {
    const listbox = open();
    expect(listbox.className).toContain('overflow-y-auto');
    expect(screen.getByRole('combobox').getAttribute('aria-controls')).toBe(listbox.id);
  });
});
