import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PLATFORM_FEE_RATE, formatPercent, formatUsd, type RewardsSummary } from '@trenchscope/shared';
import { Coins, Gift, Link2, Percent, Sparkles, Trophy, Users } from 'lucide-react';
import { AccountGate, accountKeys, useSignedIn } from '@/components/account';
import { Age, Compact, Pct, SimBanner, StatTile, Usd } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { Badge, CopyButton, DataTable, EmptyState, ErrorState, Panel, Skeleton, type Column } from '@/components/ui';
import { useIsLive, useMeta } from '@/hooks';
import { api } from '@/lib/api';

/** Cashback share for traders who joined with a referral code (server: REFERRED_CASHBACK_RATE). */
const INVITEE_CASHBACK = 0.1;

type Invitee = RewardsSummary['invitees'][number];

export default function RewardsPage() {
  const signedIn = useSignedIn();
  const q = useQuery({ queryKey: accountKeys.rewards, queryFn: api.rewards, enabled: signedIn, refetchInterval: 30_000 });
  return (
    <Page className="max-w-[1280px]">
      <PageHeader title="Rewards" subtitle="Referral rebates, cashback and points" icon={<Gift size={16} />} />
      <AccountGate
        icon={<Gift size={22} />}
        title="Invite friends, earn rebates"
        description="Share your referral link: you earn a share of the trading fees your invitees pay, and they get cashback on their own fees."
        features={['Rebates grow with your volume tier', `Invitees get ${formatPercent(INVITEE_CASHBACK, { sign: false, digits: 0 })} cashback`, 'Points for every dollar traded']}
      >
        {q.isError && !q.data ? (
          <Panel>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
          </Panel>
        ) : !q.data ? (
          <RewardsSkeleton />
        ) : (
          <RewardsBody r={q.data} />
        )}
      </AccountGate>
    </Page>
  );
}

function RewardsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[58px]" />
        ))}
      </div>
    </div>
  );
}

function RewardsBody({ r }: { r: RewardsSummary }) {
  const feeRate = useMeta().data?.platformFeeRate ?? PLATFORM_FEE_RATE;
  const link = `${location.origin}${r.referralLink}`;
  const tierVolume = r.ownVolumeUsd + r.inviteeVolumeUsd;
  const progress = r.nextTier ? Math.min(1, tierVolume / r.nextTier.volumeUsd) : 1;
  const live = useIsLive();
  const message = live
    ? `Trade Solana memecoins with me on Trenchscope — join with my link: ${link}`
    : `Paper-trade memecoins on a live simulated market with me on Trenchscope — join with my link: ${link}`;

  const columns = useMemo<Column<Invitee>[]>(
    () => [
      { key: 'user', header: 'Invitee', render: (i) => <span className="font-medium text-fg">{i.username}</span> },
      { key: 'joined', header: 'Joined', sortable: true, sortValue: (i) => i.joinedAt, render: (i) => <Age ts={i.joinedAt} suffix=" ago" className="text-muted" /> },
      { key: 'volume', header: 'Volume', align: 'right', sortable: true, sortValue: (i) => i.volumeUsd, render: (i) => <Usd value={i.volumeUsd} /> },
      { key: 'rebate', header: 'Your rebate', align: 'right', sortable: true, sortValue: (i) => i.rebateUsd, render: (i) => <Usd value={i.rebateUsd} className="text-up" /> },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Invite friends" icon={<Link2 size={14} />}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-muted">Your referral code</p>
                <p className="flex items-center gap-1.5">
                  <span className="font-mono text-2xl font-semibold tracking-wider text-accent">{r.referralCode}</span>
                  <CopyButton text={r.referralCode} label="Copy code" size={14} />
                </p>
              </div>
              <div className="pb-1 text-sm text-muted">
                <span className="num font-semibold text-fg">{r.invitedCount}</span> invited · <Usd value={r.inviteeVolumeUsd} className="font-semibold text-fg" /> traded by invitees
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Referral link</p>
              <div className="flex items-center gap-1 rounded border border-line bg-panel-2 py-1 pl-2.5 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={link}>
                  {link}
                </span>
                <CopyButton text={link} label="Copy link" showLabel size={13} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={message} label="Copy invite message" showLabel size={13} className="border border-line" />
              <span className="text-xs text-faint">Anyone opening the link gets the code pre-filled when they sign up.</span>
            </div>
          </div>
        </Panel>

        <Panel title="Your tier" icon={<Trophy size={14} />} actions={<Badge tone="accent">{r.tier}</Badge>}>
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Rebate rate</p>
                <Pct value={r.rebateRate} sign={false} colored={false} digits={0} className="text-2xl font-semibold text-fg" />
                <p className="text-xs text-muted">of your invitees’ platform fees</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Tier volume</p>
                <Usd value={tierVolume} className="text-md font-semibold text-fg" />
                <p className="text-xs text-muted">yours + invitees’</p>
              </div>
            </div>
            {r.nextTier ? (
              <div className="flex flex-col gap-1.5">
                <div
                  className="relative h-2 overflow-hidden rounded-full bg-panel-3"
                  role="progressbar"
                  aria-label={`Progress to ${r.nextTier.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(progress * 100, 1.5)}%` }} />
                </div>
                <p className="flex justify-between gap-2 text-xs text-muted">
                  <span>
                    <span className="font-medium text-fg">{formatUsd(Math.max(0, r.nextTier.volumeUsd - tierVolume))}</span> more volume to reach{' '}
                    <span className="font-medium text-fg">{r.nextTier.name}</span>
                  </span>
                  <Pct value={progress} sign={false} colored={false} digits={0} />
                </p>
              </div>
            ) : (
              <p className="text-sm text-up">Top tier reached — you earn the highest rebate rate.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile icon={<Coins size={12} />} label="Rebates earned" value={<Usd value={r.rebatesEarnedUsd} className="text-up" />} sub="from invitees’ fees" />
        <StatTile
          icon={<Percent size={12} />}
          label="Cashback"
          value={<Usd value={r.cashbackUsd} className={r.cashbackUsd > 0 ? 'text-up' : undefined} />}
          sub={r.cashbackRate > 0 ? `${formatPercent(r.cashbackRate, { sign: false, digits: 0 })} of your fees` : 'Join via a referral to earn it'}
        />
        <StatTile icon={<Sparkles size={12} />} label="Points" value={<Compact value={r.points} />} sub="earned with volume" />
        <StatTile icon={<Users size={12} />} label="Invitees" value={r.invitedCount} sub={<>volume <Usd value={r.inviteeVolumeUsd} /></>} />
        <StatTile label="Your volume" value={<Usd value={r.ownVolumeUsd} />} />
        <StatTile label="Fees paid" value={<Usd value={r.feesPaidUsd} />} sub={`${formatPercent(feeRate, { sign: false, digits: 1 })} platform fee`} />
        <StatTile label="Net fees" hint="Fees paid minus cashback" value={<Usd value={r.feesPaidUsd - r.cashbackUsd} />} />
        <StatTile label="Rebate tier" value={r.tier} sub={r.nextTier ? `next: ${r.nextTier.name}` : 'top tier'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Invitees" icon={<Users size={14} />} subtitle={r.invitees.length ? `${r.invitees.length} joined` : undefined} padded={false}>
          {r.invitees.length === 0 ? (
            <EmptyState
              compact
              icon={<Users size={16} />}
              title="No invitees yet"
              description="Share your link — everyone who signs up with it appears here with their volume and the rebates you earned."
              action={<CopyButton text={link} label="Copy referral link" showLabel size={13} className="border border-line" />}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={r.invitees}
              rowKey={(i) => `${i.username}:${i.joinedAt}`}
              defaultSort={{ key: 'volume', dir: 'desc' }}
              minWidth={420}
              maxHeight={420}
              aria-label="Invitees"
            />
          )}
        </Panel>

        <Panel title="How it works" icon={<Gift size={14} />}>
          <ol className="flex flex-col gap-3 text-sm">
            <Step n={1} title={`${formatPercent(feeRate, { sign: false, digits: 1 })} platform fee`}>
              {live
                ? 'Every trade pays the platform fee on its size, on top of network and priority fees.'
                : 'Every paper trade pays a simulated platform fee on its size, on top of network and priority fees.'}
            </Step>
            <Step n={2} title="Referrers earn rebates">
              You receive {formatPercent(r.rebateRate, { sign: false, digits: 0 })} of the platform fees your invitees pay at the {r.tier} tier. The rate rises as your
              combined volume reaches higher tiers.
            </Step>
            <Step n={3} title={`Invitees get ${formatPercent(INVITEE_CASHBACK, { sign: false, digits: 0 })} cashback`}>
              Traders who join with a referral code get part of their own platform fees back on every trade.
            </Step>
            <Step n={4} title="Points">
              Points accrue with your trading volume and show your activity on the platform.
            </Step>
          </ol>
          <SimBanner variant="card" className="mt-3" />
        </Panel>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{n}</span>
      <div className="min-w-0">
        <p className="font-medium text-fg">{title}</p>
        <p className="text-xs text-muted">{children}</p>
      </div>
    </li>
  );
}
