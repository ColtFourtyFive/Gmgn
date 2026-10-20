import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Compact, Native, Pct, Price, Usd } from './numbers';

afterEach(cleanup);

describe('Price', () => {
  it('renders the zero count of tiny prices as a real subscript', () => {
    const { container } = render(<Price value={0.000001234} />);
    const sub = container.querySelector('sub');
    expect(sub?.textContent).toBe('5');
    expect(sub?.closest('[aria-hidden="true"]')?.textContent).toBe('$0.051234');
  });

  it('gives assistive tech the plain decimal, not the concatenated digits', () => {
    // What a screen reader reads: the text outside aria-hidden subtrees.
    const spoken = (node: Node): string =>
      node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : Array.from(node.childNodes, spoken).join('');
    expect(spoken(render(<Price value={0.0000004485} />).container)).toBe('$0.0000004485');
    expect(spoken(render(<Price value={0.00002205} symbol="SOL" />).container)).toBe('0.00002205 SOL');
    expect(spoken(render(<Price value={3.5} />).container)).toBe('$3.5');
  });

  it('renders regular prices without subscript', () => {
    const { container } = render(<Price value={3.5} />);
    expect(container.querySelector('sub')).toBeNull();
    expect(container.textContent).toBe('$3.5');
  });

  it('formats native prices with the symbol', () => {
    const { container } = render(<Price value={0.25} symbol="SOL" />);
    expect(container.textContent).toBe('0.25 SOL');
  });

  it('shows -- for missing values', () => {
    expect(render(<Price value={null} />).container.textContent).toBe('--');
  });
});

describe('Pct', () => {
  it('colors by sign and prefixes +', () => {
    const up = render(<Pct value={0.1234} />).container.firstElementChild!;
    expect(up.textContent).toBe('+12.34%');
    expect(up.className).toContain('text-up');
    const down = render(<Pct value={-0.05} />).container.firstElementChild!;
    expect(down.textContent).toBe('-5%');
    expect(down.className).toContain('text-down');
    const flat = render(<Pct value={0} />).container.firstElementChild!;
    expect(flat.className).toContain('text-muted');
  });

  it('uses arrows instead of signs when asked', () => {
    const el = render(<Pct value={-0.31} arrow />).container.firstElementChild!;
    expect(el.textContent).toBe('▼31%');
  });

  it('can stay uncolored', () => {
    const el = render(<Pct value={0.2} colored={false} />).container.firstElementChild!;
    expect(el.className).not.toContain('text-up');
  });
});

describe('Usd / Native / Compact', () => {
  it('formats compact USD with optional sign and tone', () => {
    expect(render(<Usd value={4_560_000} />).container.textContent).toBe('$4.56M');
    const pnl = render(<Usd value={1520} signed colored />).container.firstElementChild!;
    expect(pnl.textContent).toBe('+$1.52K');
    expect(pnl.className).toContain('text-up');
    expect(render(<Usd value={-820.5} />).container.textContent).toBe('-$820.5');
  });

  it('appends the chain native symbol', () => {
    expect(render(<Native value={1.25} chain="sol" />).container.textContent).toBe('1.25 SOL');
    expect(render(<Native value={2} chain="bsc" />).container.textContent).toBe('2 BNB');
  });

  it('renders compact counts', () => {
    expect(render(<Compact value={12_345} />).container.textContent).toBe('12.35K');
    expect(render(<Compact value={undefined} />).container.textContent).toBe('--');
  });
});
