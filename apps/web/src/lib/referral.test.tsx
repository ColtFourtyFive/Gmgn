import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RootRedirect } from '@/App';
import { AuthModal } from '@/components/layout/AuthModal';
import { useSession } from '@/store/session';
import { captureReferral, clearReferral, pendingReferral } from './referral';

const initial = useSession.getState();

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  useSession.setState(initial, true);
});

function Probe() {
  const { pathname, search } = useLocation();
  return <p data-testid="at">{pathname + search}</p>;
}

describe('referral links', () => {
  it('captures ?ref= from the landing URL until cleared', () => {
    captureReferral('?foo=1');
    expect(pendingReferral()).toBe('');
    captureReferral('?ref=GBHEZ8H');
    expect(pendingReferral()).toBe('GBHEZ8H');
    clearReferral();
    expect(pendingReferral()).toBe('');
  });

  it('the root redirect keeps the query string', () => {
    render(
      <MemoryRouter initialEntries={['/?ref=GBHEZ8H']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/:chain/trenches" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('at').textContent).toMatch(/^\/\w+\/trenches\?ref=GBHEZ8H$/);
  });

  it('pre-fills the register form with the captured code after navigating away from the link', () => {
    captureReferral('?ref=GBHEZ8H');
    useSession.setState({ authPrompt: true, authTab: 'register' });
    render(
      <MemoryRouter initialEntries={['/sol/trending']}>
        <AuthModal />
      </MemoryRouter>,
    );
    expect((screen.getByLabelText('Referral code (optional)') as HTMLInputElement).value).toBe('GBHEZ8H');
  });
});
