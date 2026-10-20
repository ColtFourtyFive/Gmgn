import { describe, expect, it } from 'vitest';
import { positionEventOf } from './PositionEvent';

describe('positionEventOf', () => {
  it('prefers the server event and falls back to the first-buy / close flags', () => {
    expect(positionEventOf({ positionEvent: 'add', isFirstBuy: false, isClose: false })).toBe('add');
    expect(positionEventOf({ positionEvent: 'open', isFirstBuy: false, isClose: false })).toBe('open');
    expect(positionEventOf({ isFirstBuy: true, isClose: false })).toBe('open');
    expect(positionEventOf({ isFirstBuy: false, isClose: true })).toBe('close');
    expect(positionEventOf({ isFirstBuy: false, isClose: false })).toBeNull();
  });
});
