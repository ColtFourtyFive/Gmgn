import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

beforeEach(() => localStorage.clear());

describe('useLocalStorage', () => {
  it('persists values as JSON', () => {
    const { result } = renderHook(() => useLocalStorage('k', 1));
    act(() => result.current[1]((v) => v + 1));
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem('k')).toBe('2');
  });

  it('writes storage even when the component unmounts in the same update', () => {
    const { result, unmount } = renderHook(() => useLocalStorage<string[]>('recent', []));
    act(() => {
      result.current[1]((list) => ['a', ...list]);
      result.current[1]((list) => ['b', ...list]);
      unmount();
    });
    expect(localStorage.getItem('recent')).toBe('["b","a"]');
  });

  it('re-reads when the key changes', () => {
    localStorage.setItem('tab:sol', JSON.stringify('holders'));
    const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, 'trades'), { initialProps: { k: 'tab:bsc' } });
    expect(result.current[0]).toBe('trades');
    rerender({ k: 'tab:sol' });
    expect(result.current[0]).toBe('holders');
    act(() => result.current[1]('dev'));
    expect(localStorage.getItem('tab:sol')).toBe('"dev"');
    expect(localStorage.getItem('tab:bsc')).toBeNull();
  });
});
