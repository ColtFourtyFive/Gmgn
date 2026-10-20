import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FlashValue } from './FlashValue';

const animate = vi.fn((_keyframes: Keyframe[], _opts?: KeyframeAnimationOptions) => ({ cancel: vi.fn() }) as unknown as Animation);

beforeEach(() => {
  animate.mockClear();
  (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as { animate?: typeof animate }).animate;
});

describe('FlashValue', () => {
  it('flashes by fading a tinted overlay (compositor-only opacity, never background-color)', () => {
    const { container, rerender } = render(<FlashValue value={1}>one</FlashValue>);
    expect(animate).not.toHaveBeenCalled();

    rerender(<FlashValue value={2}>two</FlashValue>);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0];
    for (const frame of keyframes) expect(Object.keys(frame)).toEqual(['opacity']);
    const target = animate.mock.contexts[0] as HTMLElement;
    expect(target.getAttribute('aria-hidden')).toBe('true');
    expect(target.dataset.dir).toBe('up');
    expect(container.textContent).toBe('two');

    rerender(<FlashValue value={1}>one</FlashValue>);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(target.dataset.dir).toBe('down');
  });

  it('does not flash when the value is unchanged or disabled', () => {
    const { rerender } = render(<FlashValue value={1} />);
    rerender(<FlashValue value={1} />);
    rerender(<FlashValue value={3} disabled />);
    expect(animate).not.toHaveBeenCalled();
  });
});
