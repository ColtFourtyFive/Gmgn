import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ChainPicker } from './ChainSwitcher';

afterEach(cleanup);

function At() {
  return <p data-testid="at">{useLocation().pathname}</p>;
}

describe('ChainPicker (phone drawer)', () => {
  it('is one Tab stop and arrow keys pick the next chain', () => {
    render(
      <MemoryRouter initialEntries={['/sol/trending']}>
        <Routes>
          <Route
            path="/:chain/trending"
            element={
              <>
                <ChainPicker />
                <At />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    expect(screen.getByTestId('at').textContent).toBe('/base/trending');
    const now = screen.getAllByRole('radio');
    expect(now[1].getAttribute('aria-checked')).toBe('true');
    expect(now.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    expect(document.activeElement).toBe(now[1]);
  });
});
