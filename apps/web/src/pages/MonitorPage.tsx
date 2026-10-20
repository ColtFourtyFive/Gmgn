// Monitor (/:chain/monitor): live trades of smart money, KOLs, followed
// wallets or all tagged wallets, with side / size / rug-risk filters, pause,
// a "hot by smart money" list and the followed-wallets manager.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHAINS, type ChainId, type FeedItem, type WalletTag } from '@trenchscope/shared';
import { Brain, Flame, Megaphone, Pause, Play, Radar, RotateCcw, Star, Users } from 'lucide-react';
import clsx from 'clsx';
import { PauseStatus } from '@/components/common';
import { LiveStatus, QuickBuyAmount, useQuickBuyAmount } from '@/components/discovery';
import { useViewerTags } from '@/components/discovery/useViewerTags';
import { Page, PageHeader } from '@/components/layout';
import {
  ALL_GROUPS,
  FeedHeader,
  FeedRow,
  FollowingPanel,
  GroupChips,
  HotBySmartMoney,
  tokenRisk,
  useLiveFeed,
  type FeedKind,
} from '@/components/monitor';
import { Button, EmptyState, ErrorState, Kbd, NumberInput, SegmentedControl, Skeleton, Tabs, Toggle } from '@/components/ui';
import { DEFAULT_GROUP, mergeTags, useChainFollows } from '@/components/wallet';
import { useBreakpoint, useDisplaySettings, useHotkeys, useLocalStorage } from '@/hooks';
import { routes, useChain } from '@/lib/chain';
import { requireAuth, useSession } from '@/store/session';

type Side = 'all' | 'buy' | 'sell';
type Section = 'feed' | 'hot' | 'following';

interface Filters {
  side: Side;
  minUsd: number | null;
  hideRisky: boolean;
}

const DEFAULT_FILTERS: Filters = { side: 'all', minUsd: null, hideRisky: false };
const RENDER_CAP = 200;

const KIND_TABS: { value: FeedKind; label: string; icon: ReactNode; title: string }[] = [
  { value: 'smart', label: 'Smart Money', icon: <Brain size={14} />, title: 'Trades by smart-money wallets' },
  { value: 'kol', label: 'KOL', icon: <Megaphone size={14} />, title: 'Trades by known influencer wallets' },
  { value: 'follow', label: 'Following', icon: <Star size={14} />, title: 'Trades by wallets you follow' },
  { value: 'all', label: 'All', icon: <Radar size={14} />, title: 'Smart money, KOLs, whales and snipers' },
];

function validFilters(f: unknown): Filters {
  const v = (f ?? {}) as Partial<Filters>;
  return {
    side: v.side === 'buy' || v.side === 'sell' ? v.side : 'all',
    minUsd: typeof v.minUsd === 'number' && v.minUsd > 0 ? v.minUsd : null,
    hideRisky: v.hideRisky === true,
  };
}

export default function MonitorPage() {
  const chain = useChain();
  return <Monitor key={chain} chain={chain} />;
}

function FeedSkeleton() {
  return (
    <ul aria-busy className="flex flex-col">
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line/60 px-3 py-2.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton width={18} height={18} />
          <Skeleton className={clsx('h-3', i % 2 ? 'w-24' : 'w-32')} />
          <Skeleton className="ml-auto h-3 w-40" />
        </li>
      ))}
    </ul>
  );
}

function Monitor({ chain }: { chain: ChainId }) {
  const navigate = useNavigate();
  const signedIn = useSession((s) => !!s.token);
  const wide = useBreakpoint('lg');
  const mobile = !useBreakpoint('md');
  const display = useDisplaySettings();
  const [storedKind, setKind] = useLocalStorage<FeedKind>('ts.monitor.kind', 'smart');
  const kind: FeedKind = KIND_TABS.some((t) => t.value === storedKind) ? (storedKind === 'follow' && !signedIn ? 'smart' : storedKind) : 'smart';
  const [storedFilters, setFilters] = useLocalStorage<Filters>('ts.monitor.filters', DEFAULT_FILTERS);
  const filters = validFilters(storedFilters);
  const patch = (p: Partial<Filters>) => setFilters({ ...filters, ...p });
  const [paused, setPaused] = useState(false);
  const [group, setGroup] = useState(ALL_GROUPS);
  const [section, setSection] = useState<Section>('feed');
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);

  useHotkeys({ p: () => setPaused((p) => !p) }, { enabled: display.hotkeys });

  const feed = useLiveFeed({ chain, kind, paused, enabled: kind !== 'follow' || signedIn });
  const viewerTags = useViewerTags(chain);
  // Stable merged-tag arrays per wallet + tags, so memoized rows skip re-rendering.
  const tagCache = useRef(new Map<string, WalletTag[]>());
  const tagsFor = (wallet: string, base: WalletTag[]): WalletTag[] => {
    const extra = viewerTags(wallet);
    if (extra.length === 0) return base;
    const k = `${wallet}|${base.join(',')}|${extra.join(',')}`;
    let tags = tagCache.current.get(k);
    if (!tags) {
      if (tagCache.current.size > 2000) tagCache.current.clear();
      tags = mergeTags(base, extra);
      tagCache.current.set(k, tags);
    }
    return tags;
  };
  const follows = useChainFollows(chain);
  const remarks = useMemo(() => new Map(follows.list.filter((f) => f.remark).map((f) => [f.address, f.remark])), [follows.list]);
  const groupMembers = useMemo(
    () => (group === ALL_GROUPS ? null : new Set(follows.list.filter((f) => f.group === group).map((f) => f.address))),
    [follows.list, group],
  );
  const followGroups = useMemo(() => [...new Set([DEFAULT_GROUP, ...follows.list.map((f) => f.group)])], [follows.list]);

  // Risk from the freshest ref of each token (feed refs carry its latest security read).
  const riskOf = (it: FeedItem) => tokenRisk(feed.tokens.get(it.trade.token) ?? it.token);

  const visible = useMemo(() => {
    const out: FeedItem[] = [];
    for (const it of feed.items) {
      const t = it.trade;
      if (filters.side !== 'all' && t.side !== filters.side) continue;
      if (filters.minUsd !== null && t.usdAmount < filters.minUsd) continue;
      if (kind === 'follow' && groupMembers && !groupMembers.has(t.wallet)) continue;
      if (filters.hideRisky && tokenRisk(feed.tokens.get(t.token) ?? it.token) === 'risky') continue;
      out.push(it);
      if (out.length >= RENDER_CAP) break;
    }
    return out;
  }, [feed.items, feed.tokens, filters.side, filters.minUsd, filters.hideRisky, kind, groupMembers]);

  const filtered = filters.side !== 'all' || filters.minUsd !== null || filters.hideRisky || (kind === 'follow' && group !== ALL_GROUPS);

  const onKind = (k: FeedKind) => {
    if (k === 'follow') requireAuth(() => setKind(k));
    else setKind(k);
  };

  const feedPanel = (
    <section className="panel flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Live trades">
      <Tabs
        aria-label="Feed"
        value={kind}
        onChange={onKind}
        className="shrink-0 px-2"
        items={KIND_TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon, title: t.title, count: t.value === 'follow' && signedIn ? follows.list.length : null }))}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <SegmentedControl
          size="sm"
          aria-label="Side"
          value={filters.side}
          onChange={(side) => patch({ side })}
          items={[
            { value: 'all', label: 'All' },
            { value: 'buy', label: 'Buys' },
            { value: 'sell', label: 'Sells' },
          ]}
        />
        <NumberInput
          size="sm"
          value={filters.minUsd}
          onChange={(minUsd) => patch({ minUsd: minUsd !== null && minUsd > 0 ? minUsd : null })}
          min={0}
          step={50}
          prefix="≥ $"
          placeholder="Min size"
          aria-label="Minimum trade size in USD"
          wrapperClassName="!w-[112px]"
        />
        <Toggle size="sm" checked={filters.hideRisky} onChange={(hideRisky) => patch({ hideRisky })} label="Hide high rug risk" />
        {kind === 'follow' && <GroupChips groups={followGroups} value={group} onChange={setGroup} />}
        <span className="num ml-auto text-xs text-muted">{visible.length} trades</span>
      </div>
      {/* Not a live region itself: the waiting count changes with every batch. */}
      <PauseStatus paused={paused} what="Feed" />
      {paused && (
        <div className="flex shrink-0 items-center gap-2 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-sm">
          <Pause size={13} className="text-warn" />
          <span className="text-fg">Paused</span>
          <span className="text-muted">{feed.pending > 0 ? `${feed.pending} new trade${feed.pending === 1 ? '' : 's'} waiting` : 'New trades will wait here'}</span>
          <Button size="xs" variant="soft" icon={<Play size={12} />} onClick={() => setPaused(false)} className="ml-auto">
            Resume{feed.pending > 0 ? ` (${feed.pending})` : ''}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FeedHeader />
        {feed.error ? (
          <ErrorState error={feed.error} onRetry={feed.retry} retrying={feed.retrying} />
        ) : feed.loading ? (
          <FeedSkeleton />
        ) : visible.length === 0 ? (
          kind === 'follow' && follows.list.length === 0 ? (
            <EmptyState
              icon={<Users size={18} />}
              title="You don’t follow any wallets yet"
              description="Follow wallets from the leaderboard or a wallet page and their trades stream in here."
              action={
                <Button size="sm" variant="primary" onClick={() => navigate(routes.leaderboard(chain))}>
                  Find wallets to follow
                </Button>
              }
            />
          ) : filtered ? (
            <EmptyState
              icon={<Radar size={18} />}
              title="No trades match your filters"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RotateCcw size={13} />}
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setGroup(ALL_GROUPS);
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<Radar size={18} />} title="Waiting for trades" description="New trades appear here the moment they happen." />
          )
        ) : (
          <ul aria-label={`${KIND_TABS.find((t) => t.value === kind)?.label} trades`} aria-live="off">
            {visible.map((it) => (
              <FeedRow
                key={it.trade.id}
                item={it}
                chain={chain}
                currentMcap={feed.tokens.get(it.trade.token)?.marketCapUsd ?? it.token.marketCapUsd}
                tags={tagsFor(it.trade.wallet, it.trade.walletTags)}
                label={remarks.get(it.trade.wallet) || it.trade.walletLabel}
                buyAmount={buyAmount}
                fresh={feed.freshIds.has(it.trade.id)}
                risk={riskOf(it)}
                mobile={mobile}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );

  const headerActions = (
    <>
      <LiveStatus live={feed.live} error={!!feed.error} cadence="0.5s" />
      <Button
        size="sm"
        variant={paused ? 'primary' : 'outline'}
        icon={paused ? <Play size={13} /> : <Pause size={13} />}
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        title="Pause the feed (P)"
      >
        {paused ? 'Resume' : 'Pause'}
        {display.hotkeys && !mobile && <Kbd>P</Kbd>}
      </Button>
      <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} className={mobile ? 'ml-auto' : undefined} />
    </>
  );

  const hot = <HotBySmartMoney chain={chain} buyAmount={buyAmount} className="shrink-0" />;
  const following = <FollowingPanel chain={chain} group={group} onGroupChange={setGroup} className={wide ? 'min-h-[280px] flex-1' : 'min-h-0 flex-1'} />;

  return (
    <Page fullHeight className="max-w-[1800px]">
      <PageHeader
        title="Monitor"
        icon={<Radar size={16} />}
        subtitle={`Live ${CHAINS[chain].name} trades from smart money, KOLs and wallets you follow`}
        actions={mobile ? undefined : headerActions}
      />
      {mobile && <div className="mb-3 flex flex-wrap items-center gap-2">{headerActions}</div>}
      {!wide && (
        <SegmentedControl
          aria-label="Monitor section"
          value={section}
          onChange={setSection}
          className="mb-3 w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            { value: 'feed', label: 'Live feed', icon: <Radar size={13} /> },
            { value: 'hot', label: 'Hot', icon: <Flame size={13} /> },
            { value: 'following', label: 'Following', icon: <Star size={13} />, count: signedIn ? follows.list.length : null },
          ]}
        />
      )}
      {wide ? (
        <div className="flex min-h-0 flex-1 gap-3">
          {feedPanel}
          <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto" aria-label="Hot tokens and followed wallets">
            {hot}
            {following}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {section === 'feed' && feedPanel}
          {section === 'hot' && <div className="min-h-0 flex-1 overflow-y-auto">{hot}</div>}
          {section === 'following' && following}
        </div>
      )}
    </Page>
  );
}
