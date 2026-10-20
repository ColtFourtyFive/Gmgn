// Alert rules: price / market-cap level crossings, 5m price change, smart
// money buy clusters (evaluated every second), plus trades by a watched wallet
// and new launches matching a keyword (event driven). One-shot rules disable
// themselves after firing; repeating rules cool down for a minute.

import {
  CHAINS,
  formatNative,
  formatPercent,
  formatPrice,
  formatUsd,
  getLaunchpad,
  shortAddress,
  type AlertRule,
  type ChainId,
  type Trade,
} from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState } from '../sim/world';
import { badRequest, includesIgnoreCase, normalizeAddress, notFound, parse } from './common';
import { alertSchema, type AlertInput } from './schemas';

const MAX_ALERTS = 100;
const EVALUATE_EVERY_MS = 1000;
const REPEAT_COOLDOWN_MS = 60_000;
const SMART_WINDOW_MS = 5 * 60_000;

interface AlertRecord {
  accountId: string;
  rule: AlertRule;
  /** Last observed price / market cap, for crossing detection. */
  last: number | null;
}

export interface StoredAlert {
  accountId: string;
  rule: AlertRule;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function crossed(prev: number, current: number, level: number, direction: 'above' | 'below'): boolean {
  return direction === 'above' ? prev < level && current >= level : prev > level && current <= level;
}

export class Alerts {
  private readonly records = new Map<string, AlertRecord>();
  // Indexes over enabled rules, rebuilt whenever rules change.
  private readonly byWallet = new Map<string, AlertRecord[]>();
  private readonly newTokenRules = new Map<ChainId, AlertRecord[]>();
  private readonly smartTokens = new Set<string>();
  /** Smart-money buy timestamps per token watched by a smart_buys rule. */
  private readonly smartBuys = new Map<string, number[]>();

  constructor(private readonly ctx: AppContext) {}

  /** Tokens referenced by enabled alert rules (kept alive by market pruning). */
  *referencedTokens(): Iterable<string> {
    for (const r of this.records.values()) if (r.rule.enabled && r.rule.token) yield r.rule.token;
  }

  install(): void {
    const { world, engine } = this.ctx;
    world.on('trade', (trade) => this.onTrade(trade));
    world.on('tokenCreated', (token) => this.onTokenCreated(token));
    engine.addTicker('trading-alerts', () => this.evaluate(), { everyMs: EVALUATE_EVERY_MS });
  }

  list(accountId: string): AlertRule[] {
    return [...this.records.values()].filter((r) => r.accountId === accountId).map((r) => ({ ...r.rule }));
  }

  create(accountId: string, input: AlertInput): AlertRule {
    let count = 0;
    for (const r of this.records.values()) if (r.accountId === accountId) count++;
    if (count >= MAX_ALERTS) throw badRequest(`at most ${MAX_ALERTS} alerts`, 'limit_reached');
    const rule: AlertRule = { ...input, id: this.ctx.world.nextId('alert'), createdAt: this.ctx.world.now, lastTriggeredAt: null };
    const record: AlertRecord = { accountId, rule, last: null };
    this.apply(record, input);
    this.records.set(rule.id, record);
    this.reindex();
    return { ...rule };
  }

  update(accountId: string, id: string, patch: Record<string, unknown>): AlertRule {
    const record = this.owned(accountId, id);
    this.apply(record, parse(alertSchema, { ...record.rule, ...patch, chain: record.rule.chain }));
    this.reindex();
    return { ...record.rule };
  }

  remove(accountId: string, id: string): void {
    this.owned(accountId, id);
    this.records.delete(id);
    this.reindex();
  }

  private owned(accountId: string, id: string): AlertRecord {
    const record = this.records.get(id);
    if (!record || record.accountId !== accountId) throw notFound('alert');
    return record;
  }

  /** Validate references, infer a missing crossing direction and (re)arm crossing detection. */
  private apply(record: AlertRecord, input: AlertInput): void {
    const { world } = this.ctx;
    const token = input.token ? normalizeAddress(input.token) : null;
    const wallet = input.wallet ? normalizeAddress(input.wallet) : null;
    let current: number | null = null;
    if (token && input.kind !== 'new_token') {
      const t = world.getToken(token);
      if (!t || t.chain !== input.chain) throw notFound('token');
      current = input.kind === 'mcap' ? world.marketCapUsd(t) : world.priceUsd(t);
    }
    if (input.kind === 'wallet_trade' && world.getWallet(wallet!)?.chain !== input.chain) throw notFound('wallet');
    const levels = input.kind === 'price' || input.kind === 'mcap';
    Object.assign(record.rule, {
      ...input,
      token: input.kind === 'new_token' ? null : token,
      wallet: input.kind === 'wallet_trade' ? wallet : null,
      keyword: input.kind === 'new_token' ? input.keyword || null : null,
      direction: levels ? (input.direction ?? (input.value >= current! ? 'above' : 'below')) : input.direction,
    });
    record.last = levels ? current : null;
  }

  private reindex(): void {
    this.byWallet.clear();
    this.newTokenRules.clear();
    this.smartTokens.clear();
    for (const record of this.records.values()) {
      const { rule } = record;
      if (!rule.enabled) continue;
      if (rule.kind === 'wallet_trade') pushTo(this.byWallet, `${rule.chain}:${rule.wallet}`, record);
      else if (rule.kind === 'new_token') pushTo(this.newTokenRules, rule.chain, record);
      else if (rule.kind === 'smart_buys') this.smartTokens.add(rule.token!);
    }
    for (const token of this.smartBuys.keys()) if (!this.smartTokens.has(token)) this.smartBuys.delete(token);
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  evaluate(): void {
    const { world } = this.ctx;
    const now = world.now;
    for (const [token, times] of this.smartBuys) {
      const fresh = times.filter((t) => now - t < SMART_WINDOW_MS);
      if (fresh.length) this.smartBuys.set(token, fresh);
      else this.smartBuys.delete(token);
    }
    for (const record of this.records.values()) {
      const { rule } = record;
      if (!rule.enabled || !rule.token || rule.kind === 'wallet_trade') continue;
      const t = world.getToken(rule.token);
      if (!t) continue;
      const symbol = `$${t.symbol}`;
      switch (rule.kind) {
        case 'price':
        case 'mcap': {
          const isPrice = rule.kind === 'price';
          const value = isPrice ? world.priceUsd(t) : world.marketCapUsd(t);
          const prev = record.last;
          record.last = value;
          const direction = rule.direction ?? 'above';
          if (prev === null || !crossed(prev, value, rule.value, direction) || !this.ready(rule)) break;
          const fmt = isPrice ? formatPrice : formatUsd;
          this.fire(record, `${symbol} ${isPrice ? 'price' : 'market cap'} ${direction} ${fmt(rule.value)}`, `Now ${fmt(value)} · ${t.name}`);
          break;
        }
        case 'change': {
          const change = world.windowStats(t, '5m').priceChange;
          const hit = rule.direction === 'below' ? change * 100 <= -rule.value : change * 100 >= rule.value;
          if (hit && this.ready(rule)) this.fire(record, `${symbol} ${formatPercent(change)} in 5m`, `Price ${formatPrice(world.priceUsd(t))} · MC ${formatUsd(world.marketCapUsd(t))}`);
          break;
        }
        case 'smart_buys': {
          const buys = this.smartBuys.get(t.address)?.length ?? 0;
          if (buys >= rule.value && this.ready(rule)) this.fire(record, `${symbol}: ${buys} smart-money buys in 5m`, `MC ${formatUsd(world.marketCapUsd(t))} · ${t.name}`);
          break;
        }
      }
    }
  }

  private onTrade(trade: Trade): void {
    if (this.ctx.engine.warming) return;
    if (trade.side === 'buy' && this.smartTokens.has(trade.token) && trade.walletTags.includes('smart')) {
      pushTo(this.smartBuys, trade.token, trade.timestamp);
    }
    const records = this.byWallet.get(`${trade.chain}:${trade.wallet}`);
    if (!records) return;
    for (const record of records) {
      const { rule } = record;
      if (!rule.enabled || (rule.token && rule.token !== trade.token) || !this.ready(rule)) continue;
      const who = this.ctx.accounts.remarkFor(record.accountId, trade.chain, trade.wallet) || trade.walletLabel || shortAddress(trade.wallet);
      const amount = formatNative(trade.nativeAmount, CHAINS[trade.chain].nativeSymbol);
      this.fire(record, `${who} ${trade.side === 'buy' ? 'bought' : 'sold'} $${trade.tokenSymbol}`, `${amount} at ${formatUsd(trade.marketCapUsd)} MC`, trade.token);
    }
  }

  private onTokenCreated(token: TokenState): void {
    if (this.ctx.engine.warming) return;
    for (const record of this.newTokenRules.get(token.chain) ?? []) {
      const { rule } = record;
      if (!rule.enabled || !this.ready(rule)) continue;
      if (rule.keyword && !includesIgnoreCase(token.name, rule.keyword) && !includesIgnoreCase(token.symbol, rule.keyword)) continue;
      const venue = getLaunchpad(token.launchpad)?.name ?? token.launchpad;
      this.fire(record, `New token $${token.symbol}`, `${token.name} launched on ${venue}`, token.address);
    }
  }

  private ready(rule: AlertRule): boolean {
    return rule.enabled && (rule.lastTriggeredAt === null || this.ctx.world.now - rule.lastTriggeredAt >= REPEAT_COOLDOWN_MS);
  }

  private fire(record: AlertRecord, title: string, body: string, token: string | null = record.rule.token): void {
    const { rule } = record;
    rule.lastTriggeredAt = this.ctx.world.now;
    if (!rule.repeat) {
      rule.enabled = false;
      this.reindex();
    }
    this.ctx.accounts.notify(record.accountId, {
      kind: 'alert',
      title,
      body: rule.note ? `${body} · ${rule.note}` : body,
      chain: rule.chain,
      token,
      wallet: rule.wallet,
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  serialize(): StoredAlert[] {
    return [...this.records.values()].map(({ accountId, rule }) => ({ accountId, rule }));
  }

  restore(stored: StoredAlert[]): void {
    this.records.clear();
    this.smartBuys.clear();
    for (const { accountId, rule } of stored) this.records.set(rule.id, { accountId, rule, last: null });
    this.reindex();
  }
}
