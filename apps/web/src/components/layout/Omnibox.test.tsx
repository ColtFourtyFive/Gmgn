import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SearchResult } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { Omnibox } from './Omnibox';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Omnibox search feedback', () => {
  it('announces an empty result and does not claim an open listbox', async () => {
    vi.spyOn(api, 'search').mockResolvedValue({ tokens: [], wallets: [] } as unknown as SearchResult);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Omnibox variant="sheet" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'zzzzqq' } });
    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toContain('No tokens or wallets match “zzzzqq”'));
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.hasAttribute('aria-controls')).toBe(false);
  });
});
