// A token / wallet that does not exist gets its own document title (read by
// the route announcer) and an h1, instead of keeping the previous page's title.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import TokenPage from './TokenPage';
import WalletPage from './WalletPage';

vi.mock('@/lib/ws', () => ({
  realtime: { connect: () => {}, epoch: 1 },
  useConnectionState: () => 'open',
  useChannel: () => {},
  useChannelState: () => null,
}));

beforeEach(() => {
  document.title = 'Trending · Solana · Trenchscope';
  vi.spyOn(api, 'search').mockResolvedValue({ tokens: [], wallets: [] } as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:chain/token/:address" element={<TokenPage />} />
          <Route path="/:chain/address/:address" element={<WalletPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('not-found pages', () => {
  it('an unknown token is titled "Token not found"', async () => {
    vi.spyOn(api, 'token').mockRejectedValue(new ApiError(404, 'token not found'));
    renderAt('/sol/token/UnknownMint1111111111111111111111111111111');
    await screen.findByRole('heading', { level: 1, name: 'Token not found' });
    await waitFor(() => expect(document.title).toBe('Token not found · Solana · Trenchscope'));
  });

  it('an unknown wallet is titled "Wallet not found" and the message is the page heading', async () => {
    vi.spyOn(api, 'wallet').mockRejectedValue(new ApiError(404, 'wallet not found'));
    renderAt('/sol/address/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
    await screen.findByRole('heading', { level: 1, name: 'Wallet not found' });
    expect(document.title).toBe('Wallet not found · Trenchscope');
  });
});
