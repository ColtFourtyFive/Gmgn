// Simulator scenario presets (PRD SIM-27), picked with SIM_SCENARIO in demo
// mode. A scenario shifts the market's hidden mix without touching how any
// agent behaves: launch rate, order-flow activity, the fate mix of launches,
// how often launches are bundled (and how much they take), EVM honeypots,
// community takeovers and revivals, the agent population, and address
// poisoning. `normal` changes nothing.

import type { TokenFate } from './world';
import type { Role } from './behaviors/roster';

export const SCENARIO_IDS = ['normal', 'rug_wave', 'cto_pump', 'bundle_launch', 'honeypot_evm', 'quiet'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface Scenario {
  id: ScenarioId;
  description: string;
  /** Launches per minute (every chain) x this. */
  launchRate: number;
  /** Order flow per unit of activity (trades/s a token sees) x this. */
  activity: number;
  /** Launch fate weights x these (absent = 1); copycats keep their own mix. */
  fateWeights: Partial<Record<TokenFate, number>>;
  /** Chance a launch is bundled x this (capped at 1) ... */
  bundleRate: number;
  /** ... and the supply share its bundle takes x this (still capped below graduation). */
  bundleShare: number;
  /** EVM honeypot chance x this, for launches of these fates (only rugs in the normal market). */
  honeypotRate: number;
  honeypotFates: TokenFate[];
  /** Community-takeover chance per housekeeping pass x this, and the holders a takeover needs. */
  ctoRate: number;
  ctoMinHolders: number;
  /** Rediscovery of dormant tokens x this. */
  reviveRate: number;
  /** Seeded population x these, by role (absent = 1). */
  population: Partial<Record<Role, number>>;
  /** Address-poisoning campaigns x this. */
  phishing: number;
}

const NORMAL: Scenario = {
  id: 'normal',
  description: 'The calibrated default market.',
  launchRate: 1,
  activity: 1,
  fateWeights: {},
  bundleRate: 1,
  bundleShare: 1,
  honeypotRate: 1,
  honeypotFates: ['rug'],
  ctoRate: 1,
  ctoMinHolders: 40,
  reviveRate: 1,
  population: {},
  phishing: 1,
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  normal: NORMAL,
  rug_wave: {
    ...NORMAL,
    id: 'rug_wave',
    description: 'A rug wave: serial ruggers launch more, most launches are rugs, slow rugs or pump-and-dumps, bundles everywhere.',
    launchRate: 1.25,
    fateWeights: { rug: 3, slow_rug: 2.5, pump_dump: 2, runner: 0.5, moon: 0.4 },
    bundleRate: 1.5,
    population: { serialDev: 1.4 },
    phishing: 1.5,
  },
  cto_pump: {
    ...NORMAL,
    id: 'cto_pump',
    description: 'Devs abandon their tokens and communities take them over: dev exits, frequent CTOs and revivals.',
    fateWeights: { dud: 1.3, slow_rug: 1.5 },
    ctoRate: 8,
    ctoMinHolders: 15,
    reviveRate: 4,
    population: { retail: 1.2 },
  },
  bundle_launch: {
    ...NORMAL,
    id: 'bundle_launch',
    description: 'Bundled launches: most launches are bundled with bigger bundles, more pump-and-dumps, more snipers.',
    fateWeights: { pump_dump: 1.8 },
    bundleRate: 4,
    bundleShare: 1.5,
    population: { sniper: 1.5 },
  },
  honeypot_evm: {
    ...NORMAL,
    id: 'honeypot_evm',
    description: 'Honeypot season on the EVM chains: many more sell-blocking contracts, also on slow rugs and pump-and-dumps.',
    fateWeights: { rug: 1.5 },
    honeypotRate: 4,
    honeypotFates: ['rug', 'slow_rug', 'pump_dump'],
  },
  quiet: {
    ...NORMAL,
    id: 'quiet',
    description: 'A quiet market: a third of the launches, half the order flow, fewer retail traders, bots and snipers.',
    launchRate: 0.35,
    activity: 0.5,
    population: { retail: 0.6, bot: 0.5, sniper: 0.6 },
    phishing: 0.3,
  },
};

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && (SCENARIO_IDS as readonly string[]).includes(v);
}

/** SIM_SCENARIO as a scenario id: blank = normal, unknown = null (callers warn and fall back to normal). */
export function parseScenario(raw: string | undefined): ScenarioId | null {
  const v = raw?.trim().toLowerCase() ?? '';
  if (v === '') return 'normal';
  return isScenarioId(v) ? v : null;
}
