import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Field, Input, NumberInput } from './Input';
import { Select } from './Select';

afterEach(cleanup);

const OPTIONS = [
  { value: 'hot', label: 'Hot (rank)' },
  { value: 'mc', label: 'Market cap' },
];

describe('Field', () => {
  it('describes its control by the error or hint under it', () => {
    render(
      <>
        <Field label="Target address" htmlFor="target" error="Enter a wallet address">
          <Input id="target" invalid />
        </Field>
        <Field label="Password" htmlFor="pw" hint="At least 6 characters.">
          <Input id="pw" type="password" aria-describedby="extra" />
        </Field>
        <Field label="Slippage" htmlFor="slip">
          <NumberInput id="slip" value={1} onChange={() => {}} />
        </Field>
      </>,
    );
    const target = screen.getByLabelText('Target address');
    expect(document.getElementById(target.getAttribute('aria-describedby')!)?.textContent).toBe('Enter a wallet address');
    const pw = screen.getByLabelText('Password');
    expect(pw.getAttribute('aria-describedby')?.split(' ')).toEqual(['extra', 'pw-note']);
    expect(document.getElementById('pw-note')?.textContent).toBe('At least 6 characters.');
    expect(screen.getByLabelText('Slippage').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Select trigger name', () => {
  it('includes the current value after an aria-label', () => {
    render(<Select aria-label="Sort trending by" value="hot" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('button', { name: 'Sort trending by Hot (rank)' })).toBeTruthy();
  });

  it('includes the current value after its Field label, and the Field note as description', () => {
    render(
      <Field label="Sort" htmlFor="sort" hint="Applies to the table">
        <Select id="sort" value="mc" onChange={() => {}} options={OPTIONS} />
      </Field>,
    );
    const trigger = screen.getByRole('button', { name: 'Sort Market cap' });
    expect(document.getElementById(trigger.getAttribute('aria-describedby')!)?.textContent).toBe('Applies to the table');
  });
});
