import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TokenSummary } from '@trenchscope/shared';
import { DEFAULT_DISPLAY } from '@/hooks/useSettings';
import { TOUCH_HOLD_MS, TrenchesColumn, type TrenchesColumnProps } from './TrenchesColumn';

// Plain cards: the column's pause logic is under test, not the card.
vi.mock('./TokenCard', () => ({
  TokenCard: ({ token }: { token: TokenSummary }) => (
    <li data-token={token.address}>
      <a href={`#${token.address}`}>{token.address}</a>
    </li>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tok = (address: string, createdAt: number) => ({ address, createdAt, creator: 'dev', stats: { '24h': { volumeUsd: 0 } } }) as unknown as TokenSummary;

const A = tok('AAA', 2);
const B = tok('BBB', 1);
const C = tok('CCC', 3); // a new launch, newest first

function setup() {
  const props: TrenchesColumnProps = {
    chain: 'sol',
    column: 'new',
    tokens: [A, B],
    filters: {},
    onFiltersChange: () => {},
    sort: { key: 'age', dir: 'desc' },
    onSortChange: () => {},
    thresholds: DEFAULT_DISPLAY.riskThresholds,
    buyAmount: 0.5,
    selected: null,
    devTags: () => [],
    isHidden: () => false,
  };
  const view = render(<TrenchesColumn {...props} />);
  const push = (tokens: TokenSummary[]) => view.rerender(<TrenchesColumn {...props} tokens={tokens} />);
  const order = () => Array.from(view.container.querySelectorAll('[data-token]')).map((el) => el.getAttribute('data-token'));
  const list = () => view.container.querySelector('ul')!.parentElement!;
  return { push, order, list };
}

describe('Trenches column pause', () => {
  it('holds still while a card has keyboard focus', () => {
    const { push, order } = setup();
    act(() => screen.getByRole('link', { name: 'AAA' }).focus());
    push([C, A, B]);
    expect(order()).toEqual(['AAA', 'BBB']);
    expect(screen.getByText('Paused · 1 new')).toBeTruthy();

    act(() => screen.getByRole('link', { name: 'AAA' }).blur());
    expect(order()).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('has a pause toggle for touch and keyboard users', () => {
    const { push, order } = setup();
    const toggle = screen.getByRole('button', { name: 'Pause New' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    push([C, A, B]);
    expect(order()).toEqual(['AAA', 'BBB']);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(order()).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('holds still under a finger and briefly after it lifts', () => {
    vi.useFakeTimers();
    const { push, order, list } = setup();
    fireEvent.pointerDown(list(), { pointerType: 'touch' });
    push([C, A, B]);
    expect(order()).toEqual(['AAA', 'BBB']);
    fireEvent.pointerUp(list(), { pointerType: 'touch' });
    act(() => void vi.advanceTimersByTime(TOUCH_HOLD_MS - 100));
    expect(order()).toEqual(['AAA', 'BBB']);
    act(() => void vi.advanceTimersByTime(200));
    expect(order()).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('announces the pause, not every new count', () => {
    const { push } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Pause New' }));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('New column paused');
    push([C, A, B]);
    push([tok('DDD', 4), C, A, B]);
    expect(screen.getByText('Paused · 2 new').closest('[role="status"],[aria-live]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status.textContent).toBe('New column paused');
  });
});
