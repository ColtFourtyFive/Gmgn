// Real data presentation: token images with the generated-avatar fallback,
// Solscan links (live only) and an unknown wallet age.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { WalletProfile } from '@trenchscope/shared';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { enterLive, leaveLive } from '@/testing/live';
import { Age } from './Age';
import { ExplorerLink, TxHash } from './ExplorerLink';
import { TokenAvatar, tokenImageSrc } from './TokenAvatar';

afterEach(() => {
  cleanup();
  leaveLive();
});

const IMG = 'https://ipfs.example/ipfs/bafy123';
const SIG = '5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv';
const ADDR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('TokenAvatar image', () => {
  it('draws the real image (no referrer, lazy, fixed size) over the generated avatar', () => {
    const { container } = render(<TokenAvatar seed="s" glyph="🐸" size={32} imageUrl={IMG} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(IMG);
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('32');
    expect(img.getAttribute('height')).toBe('32');
    expect(img.getAttribute('alt')).toBe('');
    expect(container.querySelector('svg')).toBeTruthy(); // the gradient stays underneath
    expect(container.textContent).not.toContain('🐸');
  });

  it('falls back to the generated avatar when the image fails, and retries a new URL', () => {
    const { container, rerender } = render(<TokenAvatar seed="s" glyph="🐸" imageUrl={IMG} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('🐸');
    rerender(<TokenAvatar seed="s" glyph="🐸" imageUrl={`${IMG}?v=2`} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`${IMG}?v=2`);
  });

  it('only loads https images', () => {
    expect(tokenImageSrc('http://x.test/a.png')).toBeNull();
    expect(tokenImageSrc('javascript:alert(1)')).toBeNull();
    expect(tokenImageSrc('data:image/png;base64,AAAA')).toBeNull();
    expect(tokenImageSrc(null)).toBeNull();
    const { container } = render(<TokenAvatar seed="s" glyph="🐸" imageUrl="http://x.test/a.png" />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('explorer links', () => {
  it('render nothing in demo (simulated hashes are not on-chain)', () => {
    const { container } = render(<ExplorerLink chain="sol" kind="tx" value={SIG} />);
    expect(container.innerHTML).toBe('');
  });

  it('link transactions, wallets and mints to Solscan in live, in a new tab', () => {
    enterLive();
    render(
      <>
        <ExplorerLink chain="sol" kind="tx" value={SIG} />
        <ExplorerLink chain="sol" kind="address" value={ADDR} />
        <ExplorerLink chain="sol" kind="token" value={ADDR} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'View transaction on Solscan' }).getAttribute('href')).toBe(`https://solscan.io/tx/${SIG}`);
    expect(screen.getByRole('link', { name: 'View wallet on Solscan' }).getAttribute('href')).toBe(`https://solscan.io/account/${ADDR}`);
    const token = screen.getByRole('link', { name: 'View token on Solscan' });
    expect(token.getAttribute('href')).toBe(`https://solscan.io/token/${ADDR}`);
    expect(token.getAttribute('target')).toBe('_blank');
    expect(token.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('TxHash shows the short hash with copy, plus Solscan in live', () => {
    enterLive();
    render(<TxHash chain="sol" hash={SIG} />);
    expect(screen.getByText('5h6x...sUYv')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy transaction hash' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View transaction on Solscan' })).toBeTruthy();
  });
});

describe('token age', () => {
  it('shows -- for an unknown creation time (createdAt 0 from an on-demand chain lookup), never a 1970 age', () => {
    render(<Age ts={0} />);
    expect(screen.getByText('--')).toBeTruthy();
    expect(document.querySelector('time')).toBeNull();
  });

  it('still shows a real age', () => {
    render(<Age ts={Date.now() - 5 * 60_000} />);
    expect(document.querySelector('time')?.textContent).toBe('5m');
  });
});

describe('wallet header', () => {
  const profile = {
    chain: 'sol',
    address: ADDR,
    avatarSeed: ADDR,
    label: null,
    remark: null,
    tags: [],
    nativeBalance: 1,
    nativeBalanceUsd: 180,
    lastActiveAt: Date.now(),
    createdAt: 0,
    fundedBy: null,
    fundAmountNative: null,
    xFollowers: null,
    followerCount: 0,
    isFollowed: false,
  } as unknown as WalletProfile;

  it('says the wallet age is unknown when its first funding is not indexed, and links the wallet to Solscan', () => {
    enterLive();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WalletHeader chain="sol" profile={profile} tags={[]} isOwn={false} period="7d" onPeriodChange={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('unknown')).toBeTruthy();
    expect(screen.getByTitle('First funding not indexed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View wallet on Solscan' }).getAttribute('href')).toBe(`https://solscan.io/account/${ADDR}`);
  });
});
