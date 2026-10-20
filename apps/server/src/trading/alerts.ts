// Alert rules: price / market-cap level crossings, 5m price change, smart
// money buy clusters (evaluated every second), plus trades by a watched wallet
// and new launches matching a keyword (event driven), and signal subscriptions
// (signalSubs.ts: fired signals matched by (chain, kind), a token's matches
// merged within a minute into one notification, capped per rule per hour).
// Holding rules watch the account's own positions on a chain (every second:
// moves vs cost or in 5m, liquidity draining from its high; on trades: a dev
// sell). One-shot rules disable themselves after firing; repeating rules cool
// down for a minute (subscriptions: per token, through the merge window;
// holdings: per position and trigger, for the rule's cooldownMin).

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
  type NotificationKind,
  type Signal,
  type Trade,
} from '@trenchscope/shared';
import type { AppContext } from '../context';
import type { TokenState } from '../sim/world';
import { badRequest, includesIgnoreCase, normalizeAddress, notFound, parse } from './common';
import { alertSchema, type AlertInput } from './schemas';
import { HOUR_MS, SIGNAL_MERGE_MS, matchesSubscription, subscriptionTitle } from './signalSubs';

const MAX_ALERTS = 100;
const EVALUATE_EVERY_MS = 1000;
const REPEAT_COOLDOWN_MS = 60_000;
const SMART_WINDOW_MS = 5 * 60_000;
/** Holding rules' dev-sell trigger: the dev (team) sells at least this share of its bag in one trade (the dev_sell signal's bar). */
export const HOLDING_DEV_SELL_SHARE = 0.2;

type HoldingTrigger = 'up' | 'down' | 'dev' | 'liquidity';

/** One position a holding rule watches: liquidity high since watched, last fire per trigger. */
interface HoldingWatch {
  peakLiq: number;
  fired: Partial<Record<HoldingTrigger, number>>;
}

const pctText = (r: number) => formatPercent(Math.abs(r), { sign: false, digits: 0 });

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

/** A subscription's matches on one token waiting for its merge window. */
interface PendingSignals {
  record: AlertRecord;
  token: string;
  signals: Signal[];
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

  /** Wallets the chain's wallet-trade alerts watch. */
  watchedWallets(chain: ChainId): string[] {
    const prefix = `${chain}:`;
    return [...this.byWallet.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
  private readonly newTokenRules = new Map<ChainId, AlertRecord[]>();
  private readonly smartTokens = new Set<string>();
  /** Smart-money buy timestamps per token watched by a smart_buys rule. */
  private readonly smartBuys = new Map<string, number[]>();
  /** Enabled signal subscriptions by `${chain}:${kind}` (and `${chain}:*` for rules matching any kind). */
  private readonly signalRules = new Map<string, AlertRecord[]>();
  private unsubscribeSignals: (() => void) | null = null;
  /** `${ruleId}|${token}` -> matches waiting to be sent / when the last notification for it went out. */
  private readonly pendingSignals = new Map<string, PendingSignals>();
  private readonly lastSignalNote = new Map<string, number>();
  /** ruleId -> times of its notifications in the last hour (maxPerHour). */
  private readonly signalLog = new Map<string, number[]>();
  /** Enabled holding rules per chain (all / with the dev-sell trigger on). */
  private readonly holdingRules = new Map<ChainId, AlertRecord[]>();
  private readonly holdingDevRules = new Map<ChainId, AlertRecord[]>();
  /** `${ruleId}|${token}` -> the watched position's state (dropped when the position closes). */
  private readonly holdingState = new Map<string, HoldingWatch>();

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
    // Live mode: a valid address not seen yet becomes an observed wallet (its trades are then streamed).
    const watched = input.kind === 'wallet_trade' ? (world.getWallet(wallet!) ?? (this.ctx.config.mode === 'live' ? this.ctx.market.ensureWallet?.(input.chain, wallet!) : undefined)) : undefined;
    if (input.kind === 'wallet_trade' && watched?.chain !== input.chain) throw notFound('wallet');
    const levels = input.kind === 'price' || input.kind === 'mcap';
    const subscription = input.kind === 'signal_subscription';
    Object.assign(record.rule, {
      ...input,
      token: input.kind === 'new_token' || subscription ? null : token,
      wallet: input.kind === 'wallet_trade' ? wallet : null,
      keyword: input.kind === 'new_token' ? input.keyword || null : null,
      direction: levels ? (input.direction ?? (input.value >= current! ? 'above' : 'below')) : input.direction,
      signals: subscription ? input.signals : null,
      holding: input.kind === 'holding' ? input.holding : null,
    });
    record.last = levels ? current : null;
  }

  private reindex(): void {
    this.byWallet.clear();
    this.newTokenRules.clear();
    this.smartTokens.clear();
    this.signalRules.clear();
    this.holdingRules.clear();
    this.holdingDevRules.clear();
    for (const record of this.records.values()) {
      const { rule } = record;
      if (!rule.enabled) continue;
      if (rule.kind === 'wallet_trade') pushTo(this.byWallet, `${rule.chain}:${rule.wallet}`, record);
      else if (rule.kind === 'new_token') pushTo(this.newTokenRules, rule.chain, record);
      else if (rule.kind === 'smart_buys') this.smartTokens.add(rule.token!);
      else if (rule.kind === 'signal_subscription' && rule.signals) {
        const kinds = new Set<string>();
        for (const g of rule.signals.groups) for (const k of g.kinds.length ? g.kinds : ['*']) kinds.add(k);
        for (const k of kinds) pushTo(this.signalRules, `${rule.chain}:${k}`, record);
      } else if (rule.kind === 'holding' && rule.holding) {
        pushTo(this.holdingRules, rule.chain, record);
        if (rule.holding.devSell) pushTo(this.holdingDevRules, rule.chain, record);
      }
    }
    for (const key of this.holdingState.keys()) {
      const r = this.records.get(key.slice(0, key.indexOf('|')));
      if (!r || !r.rule.enabled || r.rule.kind !== 'holding') this.holdingState.delete(key);
    }
    for (const token of this.smartBuys.keys()) if (!this.smartTokens.has(token)) this.smartBuys.delete(token);
    for (const [key, p] of this.pendingSignals) if (!p.record.rule.enabled || this.records.get(p.record.rule.id) !== p.record) this.pendingSignals.delete(key);
    // Signal DTOs are built for listeners: listen only while a subscription is enabled.
    if (this.signalRules.size > 0 && !this.unsubscribeSignals) this.unsubscribeSignals = this.ctx.analytics.onSignal((s) => this.onSignal(s));
    else if (this.signalRules.size === 0 && this.unsubscribeSignals) {
      this.unsubscribeSignals();
      this.unsubscribeSignals = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  evaluate(): void {
    const { world } = this.ctx;
    const now = world.now;
    this.flushSignals(now);
    for (const records of this.holdingRules.values()) for (const record of records) this.checkHoldings(record, now);
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
    if (trade.side === 'sell' && trade.isDev && this.holdingDevRules.has(trade.chain)) this.onDevSell(trade);
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

  // ---------------------------------------------------------------------------
  // Holdings
  // ---------------------------------------------------------------------------

  /** The rule's watch on a held position (created at its first look, liquidity high = now). */
  private watchOf(record: AlertRecord, token: string, liquidityUsd: number): HoldingWatch {
    const key = `${record.rule.id}|${token}`;
    let st = this.holdingState.get(key);
    if (!st) this.holdingState.set(key, (st = { peakLiq: liquidityUsd, fired: {} }));
    return st;
  }

  /** Moves vs cost (or in 5m) and liquidity drawdowns of every position the rule watches. */
  private checkHoldings(record: AlertRecord, now: number): void {
    const { rule } = record;
    const h = rule.holding;
    if (!rule.enabled || !h) return;
    const { world, accounts } = this.ctx;
    const wallet = accounts.walletFor(record.accountId, rule.chain);
    for (const pos of wallet.positions.values()) {
      if (rule.token && pos.token !== rule.token) continue;
      if (pos.balance <= 0) {
        // a closed position starts over if it is opened again
        this.holdingState.delete(`${rule.id}|${pos.token}`);
        continue;
      }
      const t = world.getToken(pos.token);
      if (!t) continue;
      const value = pos.balance * world.priceUsd(t);
      if (value < h.minPositionUsd) continue;
      const liq = world.liquidityUsd(t);
      const st = this.watchOf(record, t.address, liq);
      st.peakLiq = Math.max(st.peakLiq, liq);
      const sym = `$${t.symbol}`;
      const vsCost = h.basis === 'vs_cost';
      const change = vsCost ? (pos.costBasisUsd > 0 ? value / pos.costBasisUsd - 1 : null) : world.windowStats(t, '5m').priceChange;
      const held = vsCost ? `You hold ${formatUsd(value)} (cost ${formatUsd(pos.costBasisUsd)})` : `You hold ${formatUsd(value)}`;
      const where = vsCost ? 'vs your cost' : 'in 5m';
      const mc = `MC ${formatUsd(world.marketCapUsd(t))}`;
      if (change !== null && h.upPct !== null && change * 100 >= h.upPct) this.fireHolding(record, st, 'up', now, `${sym} up ${pctText(change)} ${where}`, `${held} · ${mc}`, t.address);
      if (change !== null && h.downPct !== null && change * 100 <= -h.downPct) this.fireHolding(record, st, 'down', now, `${sym} down ${pctText(change)} ${where}`, `${held} · ${mc}`, t.address);
      if (h.liquidityDropPct !== null && st.peakLiq > 0 && liq <= st.peakLiq * (1 - h.liquidityDropPct / 100)) {
        this.fireHolding(record, st, 'liquidity', now, `${sym} liquidity down ${pctText(1 - liq / st.peakLiq)}`, `Liquidity ${formatUsd(liq)} (high ${formatUsd(st.peakLiq)}) · you hold ${formatUsd(value)}`, t.address);
      }
      if (!rule.enabled) return; // a one-shot rule has fired
    }
  }

  /** A dev (team) sell of at least HOLDING_DEV_SELL_SHARE of its bag: alert the holders whose rules ask for it. */
  private onDevSell(trade: Trade): void {
    const { world, accounts } = this.ctx;
    const t = world.getToken(trade.token);
    if (!t) return;
    const before = trade.makerHoldRate * t.totalSupply + trade.tokenAmount;
    const share = before > 0 ? trade.tokenAmount / before : 0;
    if (share < HOLDING_DEV_SELL_SHARE) return;
    const now = world.now;
    for (const record of this.holdingDevRules.get(trade.chain) ?? []) {
      const { rule } = record;
      const h = rule.holding;
      if (!rule.enabled || !h || (rule.token && rule.token !== t.address)) continue;
      const wallet = accounts.walletFor(record.accountId, rule.chain);
      if (wallet.address === trade.wallet) continue; // the account's own sell of its launch
      const pos = wallet.positions.get(t.address);
      if (!pos || pos.balance <= 0) continue;
      const value = pos.balance * world.priceUsd(t);
      if (value < h.minPositionUsd) continue;
      const st = this.watchOf(record, t.address, world.liquidityUsd(t));
      const who = trade.wallet === t.creator ? 'Dev' : 'Dev team';
      this.fireHolding(record, st, 'dev', now, `${who} sold ${pctText(share)} of their $${t.symbol}`, `${formatUsd(trade.usdAmount)} sold · you hold ${formatUsd(value)} · MC ${formatUsd(trade.marketCapUsd)}`, t.address);
    }
  }

  /** Fire one trigger of a watched position unless it is cooling down (repeating rules) or the rule is off. */
  private fireHolding(record: AlertRecord, st: HoldingWatch, trigger: HoldingTrigger, now: number, title: string, body: string, token: string): void {
    const { rule } = record;
    if (!rule.enabled || !rule.holding) return;
    const last = st.fired[trigger];
    if (last !== undefined && now - last < rule.holding.cooldownMin * 60_000) return;
    st.fired[trigger] = now;
    this.fire(record, title, body, token);
  }

  // ---------------------------------------------------------------------------
  // Signal subscriptions
  // ---------------------------------------------------------------------------

  /** A fired signal (never during warmup): queue it for every enabled subscription it matches. */
  private onSignal(signal: Signal): void {
    if (this.ctx.engine.warming) return;
    const seen = new Set<AlertRecord>();
    const candidates = [...(this.signalRules.get(`${signal.chain}:${signal.kind}`) ?? []), ...(this.signalRules.get(`${signal.chain}:*`) ?? [])];
    let smart: number | null | undefined;
    const smartHolders = () => {
      if (smart === undefined) {
        const t = this.ctx.world.getToken(signal.token.address);
        smart = t ? this.ctx.analytics.tokenSummary(t).smartDegenCount : null;
      }
      return smart;
    };
    for (const record of candidates) {
      if (seen.has(record)) continue;
      seen.add(record);
      const { rule } = record;
      if (!rule.enabled || !rule.signals || !matchesSubscription(rule.signals, signal, { now: this.ctx.world.now, smartHolders })) continue;
      const key = `${rule.id}|${signal.token.address}`;
      const pending = this.pendingSignals.get(key);
      if (pending) pending.signals.push(signal);
      else this.pendingSignals.set(key, { record, token: signal.token.address, signals: [signal] });
    }
  }

  /**
   * Send what the merge windows allow: a token's first match goes out at the next evaluation, later ones
   * wait until SIGNAL_MERGE_MS after the last notification for that token and go out together. Past a
   * rule's maxPerHour, matches are dropped.
   */
  private flushSignals(now: number): void {
    for (const [key, p] of this.pendingSignals) {
      const { rule } = p.record;
      if (!rule.enabled || !rule.signals) {
        this.pendingSignals.delete(key);
        continue;
      }
      if (now - (this.lastSignalNote.get(key) ?? -Infinity) < SIGNAL_MERGE_MS) continue;
      this.pendingSignals.delete(key);
      const log = (this.signalLog.get(rule.id) ?? []).filter((t) => now - t < HOUR_MS);
      this.signalLog.set(rule.id, log);
      if (log.length >= rule.signals.maxPerHour) continue;
      log.push(now);
      this.lastSignalNote.set(key, now);
      const latest = p.signals[p.signals.length - 1];
      const extra = p.signals.length > 1 ? ` · ${p.signals.length} signals` : '';
      const name = rule.signals.name ? ` · ${rule.signals.name}` : '';
      this.fire(p.record, subscriptionTitle(latest.token.symbol, p.signals), `${latest.detail} · MC ${formatUsd(latest.token.marketCapUsd)}${extra}${name}`, p.token, 'signal');
    }
    // forget merge windows long past
    for (const [key, at] of this.lastSignalNote) if (now - at > SIGNAL_MERGE_MS * 2 && !this.pendingSignals.has(key)) this.lastSignalNote.delete(key);
  }

  private ready(rule: AlertRule): boolean {
    return rule.enabled && (rule.lastTriggeredAt === null || this.ctx.world.now - rule.lastTriggeredAt >= REPEAT_COOLDOWN_MS);
  }

  private fire(record: AlertRecord, title: string, body: string, token: string | null = record.rule.token, kind: NotificationKind = 'alert'): void {
    const { rule } = record;
    rule.lastTriggeredAt = this.ctx.world.now;
    if (!rule.repeat) {
      rule.enabled = false;
      this.reindex();
    }
    this.ctx.accounts.notify(record.accountId, {
      kind,
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
    this.pendingSignals.clear();
    this.lastSignalNote.clear();
    this.signalLog.clear();
    this.holdingState.clear();
    for (const { accountId, rule } of stored) this.records.set(rule.id, { accountId, rule, last: null });
    this.reindex();
  }
}
