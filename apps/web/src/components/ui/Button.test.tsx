import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('keeps keyboard focus while loading and ignores clicks meanwhile', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Buy 0.5 SOL</Button>);
    const button = screen.getByRole('button', { name: 'Buy 0.5 SOL' }) as HTMLButtonElement;
    act(() => button.focus());

    rerender(
      <Button onClick={onClick} loading>
        Buy 0.5 SOL
      </Button>,
    );
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Button onClick={onClick}>Buy 0.5 SOL</Button>);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a focused button that becomes disabled (e.g. Save once saved) keeps focus until it is left', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    act(() => button.focus());
    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    act(() => button.blur());
    expect(button.disabled).toBe(true);
  });

  it('a disabled button that never had focus is natively disabled', () => {
    render(<Button disabled>Nope</Button>);
    expect((screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
