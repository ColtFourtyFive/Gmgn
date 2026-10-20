import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { useSession } from '@/store/session';
import { playCue } from './sounds';

const initial = useSession.getState();
const oscillators: { frequency: { value: number } }[] = [];

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  createOscillator() {
    const osc = { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
    oscillators.push(osc);
    return osc;
  }
  createGain() {
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    return { gain: param, connect: (n: unknown) => n };
  }
}

const withSounds = (sounds: boolean): UserSettings => ({ trade: DEFAULT_TRADE, display: { ...DEFAULT_DISPLAY, sounds } });

beforeEach(() => {
  oscillators.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
  useSession.setState(initial, true);
});

describe('playCue', () => {
  it('is silent unless the Sounds setting is on', () => {
    playCue('fill');
    useSession.setState({ settings: withSounds(false) });
    playCue('fill');
    expect(oscillators).toHaveLength(0);
  });

  it('plays a short tone sequence when sounds are on', () => {
    useSession.setState({ settings: withSounds(true) });
    playCue('fill');
    expect(oscillators.map((o) => o.frequency.value)).toEqual([660, 990]);
    playCue('alert');
    expect(oscillators).toHaveLength(3);
  });
});
