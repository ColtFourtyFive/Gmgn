import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { LaunchpadCurve } from '@trenchscope/shared';
import { ColorSwatches } from '@/components/account/watchlist/WatchGroups';
import { GroupChips } from '@/components/monitor/FollowingPanel';
import { LaunchpadCards } from './Pickers';

afterEach(cleanup);

const pad = (id: string, name: string) => ({ id, name, color: '#5EE6A8', launchMarketCapUsd: 5000, graduationMarketCapUsd: 69000, graduationNative: 85, feeRate: 0.01 }) as unknown as LaunchpadCurve;
const PADS = [pad('moonpit', 'Moonpit'), pad('bonkfire', 'Bonkfire'), pad('rayforge', 'Rayforge')];

function Launchpads() {
  const [value, setValue] = useState('moonpit');
  return <LaunchpadCards chain="sol" pads={PADS} value={value} onChange={setValue} />;
}
function Swatches() {
  const [value, setValue] = useState<string | null>(null);
  return <ColorSwatches value={value} onChange={setValue} />;
}
function Chips() {
  const [value, setValue] = useState('__all__');
  return <GroupChips groups={['Default', 'Whales']} value={value} onChange={setValue} />;
}

const checked = () => screen.getAllByRole('radio').map((r) => r.getAttribute('aria-checked') === 'true');
const tabStops = () => screen.getAllByRole('radio').filter((r) => r.tabIndex === 0).length;

describe.each([
  ['launchpad cards', Launchpads],
  ['group colour swatches', Swatches],
  ['wallet group chips', Chips],
])('%s', (_name, Group) => {
  it('is one Tab stop and arrow keys move the selection and focus', () => {
    render(<Group />);
    expect(tabStops()).toBe(1);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    expect(checked()[1]).toBe(true);
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(checked()[checked().length - 1]).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(checked()[0]).toBe(true);
    expect(tabStops()).toBe(1);
  });
});

it('keeps launchpad card content valid inside the button (no <dl>)', () => {
  render(<Launchpads />);
  for (const radio of screen.getAllByRole('radio')) expect(radio.querySelector('dl, dt, dd, div, p')).toBeNull();
});
