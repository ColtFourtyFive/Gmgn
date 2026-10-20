// Display metadata for every SignalKind: friendly label, chart-marker code,
// icon, color token (index.css) and whether the signal reads bullish or bearish.

import type { SignalKind } from '@trenchscope/shared';
import { Boxes, Brain, Code, Flag, Handshake, Megaphone, MessageSquareQuote, MountainSnow, Rocket, Sparkles, Users, Waves, Zap, type LucideIcon } from 'lucide-react';

export interface SignalMeta {
  label: string;
  /** Short code drawn on chart markers. */
  short: string;
  icon: LucideIcon;
  /** CSS color token name, e.g. "smart" → rgb(var(--smart)). */
  token: string;
  /** bearish signals warn (dev / bundler dumps). */
  sentiment: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

export const SIGNAL_META: Record<SignalKind, SignalMeta> = {
  smart_buy: { label: 'Smart buy', short: 'SM', icon: Brain, token: 'smart', sentiment: 'bullish', description: 'A smart-money wallet bought the token.' },
  multi_buy: { label: 'Smart cluster', short: 'SM+', icon: Users, token: 'smart', sentiment: 'bullish', description: 'Three or more smart wallets bought within 30 minutes.' },
  kol_buy: { label: 'KOL buy', short: 'KOL', icon: Megaphone, token: 'kol', sentiment: 'bullish', description: 'A known influencer wallet bought the token.' },
  kol_call: { label: 'KOL call', short: 'Call', icon: MessageSquareQuote, token: 'kol', sentiment: 'bullish', description: 'An influencer publicly called the token.' },
  large_buy: { label: 'Whale buy', short: 'Whl', icon: Waves, token: 'whale', sentiment: 'bullish', description: 'A single large buy (size and share of supply).' },
  price_spike: { label: 'Price spike', short: 'Spk', icon: Zap, token: 'up', sentiment: 'bullish', description: 'Sharp 5-minute price increase on heavy swap activity.' },
  ath: { label: 'New ATH', short: 'ATH', icon: MountainSnow, token: 'accent', sentiment: 'bullish', description: 'The token printed a new all-time-high market cap.' },
  mcap_level: { label: 'MC milestone', short: 'MC', icon: Flag, token: 'info', sentiment: 'neutral', description: 'Market cap crossed a round milestone ($100K, $1M …).' },
  migration: { label: 'Migrated', short: 'Mig', icon: Rocket, token: 'up', sentiment: 'neutral', description: 'The bonding curve completed and the token moved to an AMM pool.' },
  cto: { label: 'CTO', short: 'CTO', icon: Handshake, token: 'info', sentiment: 'neutral', description: 'Community takeover: the community now runs the project.' },
  boost: { label: 'Boosted', short: 'Bst', icon: Sparkles, token: 'accent', sentiment: 'neutral', description: 'The token paid for a screener boost.' },
  dev_sell: { label: 'Dev sell', short: 'Dev↓', icon: Code, token: 'dev', sentiment: 'bearish', description: 'The developer (or dev team) sold a large part of their holdings.' },
  bundler_sell: { label: 'Bundler sell', short: 'Bnd↓', icon: Boxes, token: 'bundler', sentiment: 'bearish', description: 'A bundler wallet (bought in the launch block) sold.' },
};

/** Filter chip order: buys first, market events, then warnings. */
export const SIGNAL_ORDER: SignalKind[] = [
  'smart_buy',
  'multi_buy',
  'kol_buy',
  'kol_call',
  'large_buy',
  'price_spike',
  'ath',
  'mcap_level',
  'migration',
  'cto',
  'boost',
  'dev_sell',
  'bundler_sell',
];
