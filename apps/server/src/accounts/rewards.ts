// Rewards program: referral rebates by volume tier, cashback for referred
// traders, and points for volume.

export interface RewardTier {
  name: string;
  /** Own + invitee volume (USD) required. */
  minVolumeUsd: number;
  /** Share of invitee platform fees paid to the referrer. */
  rebateRate: number;
}

export const REWARD_TIERS: RewardTier[] = [
  { name: 'Bronze', minVolumeUsd: 0, rebateRate: 0.2 },
  { name: 'Silver', minVolumeUsd: 50_000, rebateRate: 0.25 },
  { name: 'Gold', minVolumeUsd: 250_000, rebateRate: 0.3 },
  { name: 'Platinum', minVolumeUsd: 1_000_000, rebateRate: 0.35 },
  { name: 'Diamond', minVolumeUsd: 5_000_000, rebateRate: 0.4 },
];

/** Share of their own platform fees refunded to traders who joined via a referral. */
export const REFERRED_CASHBACK_RATE = 0.1;
/** 1 point per $10 traded. */
export const USD_PER_POINT = 10;

export interface RewardsCounters {
  volumeUsd: number;
  feesPaidUsd: number;
  cashbackUsd: number;
  /** Fractional; reported floored. */
  points: number;
  /** Volume of everyone this account invited. */
  inviteeVolumeUsd: number;
  rebatesEarnedUsd: number;
  /** Rebates this account's fees generated for its referrer. */
  rebateGeneratedUsd: number;
}

export function emptyRewards(): RewardsCounters {
  return { volumeUsd: 0, feesPaidUsd: 0, cashbackUsd: 0, points: 0, inviteeVolumeUsd: 0, rebatesEarnedUsd: 0, rebateGeneratedUsd: 0 };
}

export function tierIndexFor(volumeUsd: number): number {
  let index = 0;
  for (let i = 0; i < REWARD_TIERS.length; i++) if (volumeUsd >= REWARD_TIERS[i].minVolumeUsd) index = i;
  return index;
}

/** Volume that counts toward the referral tier. */
export function tierVolume(r: RewardsCounters): number {
  return r.volumeUsd + r.inviteeVolumeUsd;
}
