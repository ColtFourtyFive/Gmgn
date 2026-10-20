import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Signal } from '@trenchscope/shared';
import { Summary } from './SignalsPage';

afterEach(cleanup);

const signal = (maxMultiple: number): Signal => ({ id: `s${maxMultiple}`, kind: 'smart_buy', maxMultiple, token: { symbol: 'PEPE' }, createdAt: 0 }) as unknown as Signal;

describe('Signals summary', () => {
  it('shows the hit rate of the listed signals', () => {
    render(<Summary signals={[signal(3), signal(1.2)]} hitsOnly={false} />);
    expect(screen.getByText('50% hit rate')).toBeTruthy();
  });

  it('does not claim a 100% hit rate when only hits are listed', () => {
    render(<Summary signals={[signal(3), signal(2.4)]} hitsOnly />);
    expect(screen.getByText('hits filter on')).toBeTruthy();
    expect(screen.queryByText(/100%/)).toBeNull();
  });
});
