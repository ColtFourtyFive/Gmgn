import { describe, expect, it } from 'vitest';
// The server's defaults for a new account: what a signed-out visitor sees must match them.
import { defaultSettings } from '../../../server/src/accounts/settings';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from './useSettings';

describe('signed-out settings fallbacks', () => {
  it('match the defaults a new account gets from the server', () => {
    const server = defaultSettings();
    expect(DEFAULT_TRADE).toEqual(server.trade);
    expect(DEFAULT_DISPLAY).toEqual(server.display);
  });
});
