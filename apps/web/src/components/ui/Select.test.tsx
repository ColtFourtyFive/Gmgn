import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Field } from './Input';
import { Select } from './Select';

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no layout: the open menu scrolls its active option into view.
  Element.prototype.scrollIntoView ??= () => {};
});

const OPTIONS = [
  { value: 'sol', label: 'Solana', hint: 'SOL' },
  { value: 'bsc', label: 'BNB Chain', hint: 'BNB' },
];

describe('Select', () => {
  it('names its open listbox after the Field label when it has no aria-label (axe aria-input-field-name)', () => {
    render(
      <Field label="Chain" htmlFor="chain">
        <Select id="chain" value="sol" onChange={() => {}} options={OPTIONS} />
      </Field>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Chain/ }));
    expect(screen.getByRole('listbox', { name: 'Chain' })).toBeTruthy();
  });

  it('names the listbox with its aria-label', () => {
    render(<Select value={0} onChange={() => {}} options={[{ value: 0, label: 'Any size' }]} aria-label="Minimum trade size" />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimum trade size Any size' }));
    expect(screen.getByRole('listbox', { name: 'Minimum trade size' })).toBeTruthy();
  });

  it('draws option hints in text-muted: the active row is panel-3, where text-faint misses 4.5:1', () => {
    render(<Select value="sol" onChange={() => {}} options={OPTIONS} aria-label="Switch chain" />);
    fireEvent.click(screen.getByRole('button', { name: /Switch chain/ }));
    const hint = screen.getByText('SOL');
    expect(hint.className).toContain('text-muted');
    expect(hint.className).not.toContain('text-faint');
  });
});
