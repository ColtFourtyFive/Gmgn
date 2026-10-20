// Followed wallets side panel: add by address, group filter, remark/group
// editor, per-wallet notifications, unfollow, and bulk import / export.

import { memo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CHAINS, shortAddress, type ChainId, type FollowedWallet } from '@trenchscope/shared';
import { ArrowDownToLine, Bell, BellOff, FileDown, FileUp, LogIn, MoreHorizontal, Pencil, Plus, Star, X } from 'lucide-react';
import clsx from 'clsx';
import { WalletAvatar, WalletTags } from '@/components/common';
import { Button, EmptyState, ErrorState, IconButton, Input, Menu, Panel, Popover, Skeleton } from '@/components/ui';
import { DEFAULT_GROUP, FollowEditor, isWalletAddress, sameWallet, useChainFollows, useFollowActions } from '@/components/wallet';
import { serverNow } from '@/hooks';
import { routes } from '@/lib/chain';
import { requireAuth, useSession } from '@/store/session';
import { downloadFollows, FollowsImportDialog } from './FollowsImport';

export const ALL_GROUPS = '__all__';

/** Group chips: All + every group of the chain's follows. */
export function GroupChips({ groups, value, onChange, counts }: { groups: string[]; value: string; onChange: (g: string) => void; counts?: Map<string, number> }) {
  if (groups.length <= 1) return null;
  const items = [ALL_GROUPS, ...groups];
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto" role="radiogroup" aria-label="Wallet group">
      {items.map((g) => {
        const active = g === value;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(g)}
            className={clsx(
              'chip shrink-0 border transition-colors',
              active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {g === ALL_GROUPS ? 'All' : g}
            {counts && g !== ALL_GROUPS && <span className="num text-faint">{counts.get(g) ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}

function AddWalletForm({ chain, group, existing }: { chain: ChainId; group: string; existing: FollowedWallet[] }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { follow, busy } = useFollowActions();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!isWalletAddress(chain, v)) {
      setError(CHAINS[chain].addressStyle === 'evm' ? 'Enter a 0x address (40 hex characters)' : 'Enter a Solana address (32–44 base58 characters)');
      return;
    }
    if (existing.some((f) => sameWallet(chain, f.address, v))) {
      setError('You already follow this wallet');
      return;
    }
    setError(null);
    const f = await follow(chain, v, group !== ALL_GROUPS ? { group } : {});
    if (f) setValue('');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1" noValidate>
      <div className="flex gap-1.5">
        <Input
          size="sm"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={CHAINS[chain].addressStyle === 'evm' ? 'Add wallet 0x…' : 'Add wallet address'}
          aria-label="Wallet address to follow"
          invalid={!!error}
          className="num font-mono"
          wrapperClassName="min-w-0 flex-1"
        />
        <Button size="sm" variant="primary" type="submit" icon={<Plus size={13} />} loading={busy} disabled={!value.trim()}>
          Follow
        </Button>
      </div>
      {error && (
        <p className="text-xs text-down" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

const FollowRow = memo(function FollowRow({ chain, follow }: { chain: ChainId; follow: FollowedWallet }) {
  const { update, unfollow, busy } = useFollowActions();
  // Label + platform tags (KOL handle, smart …) come with the follow; viewer tags are implied here.
  const label = follow.label;
  const tags = follow.tags.filter((t) => t !== 'following' && t !== 'you');
  const name = follow.remark || label || shortAddress(follow.address);
  return (
    <li className="group flex items-center gap-2 border-b border-line/60 px-3 py-1.5 last:border-b-0 hover:bg-panel-2">
      <WalletAvatar seed={follow.address} size={22} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <Link to={routes.wallet(chain, follow.address)} className={clsx('link truncate', follow.remark || label ? 'font-medium' : 'num font-mono text-xs')} title={follow.address}>
            {name}
          </Link>
          {tags.length > 0 && <WalletTags tags={tags} max={2} className="shrink-0 flex-nowrap" />}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-2xs text-faint">
          <span className="truncate">{follow.group}</span>
          {(follow.remark || label) && <span className="num truncate font-mono">· {shortAddress(follow.address)}</span>}
        </span>
      </span>
      <IconButton
        size="xs"
        label={follow.notify ? 'Notifications on — turn off' : 'Notifications off — turn on'}
        icon={follow.notify ? <Bell size={13} className="text-accent" /> : <BellOff size={13} />}
        disabled={busy}
        onClick={() => void update(chain, follow.address, { notify: !follow.notify })}
      />
      <Popover placement="bottom-end" aria-label="Edit followed wallet" trigger={<IconButton size="xs" label={`Edit ${name}`} icon={<Pencil size={12} />} />}>
        {(close) => <FollowEditor chain={chain} follow={follow} onDone={close} />}
      </Popover>
      <IconButton size="xs" label={`Unfollow ${name}`} icon={<X size={13} />} disabled={busy} onClick={() => void unfollow(chain, follow.address)} />
    </li>
  );
});

export interface FollowingPanelProps {
  chain: ChainId;
  group: string;
  onGroupChange: (g: string) => void;
  className?: string;
}

/** The viewer's followed wallets on this chain. */
export const FollowingPanel = memo(function FollowingPanel({ chain, group, onGroupChange, className }: FollowingPanelProps) {
  const signedIn = useSession((s) => !!s.token);
  const follows = useChainFollows(chain);
  const [importing, setImporting] = useState(false);
  const all = follows.data ?? [];
  const groups = [...new Set([DEFAULT_GROUP, ...follows.list.map((f) => f.group)])];
  const counts = new Map<string, number>();
  for (const f of follows.list) counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
  const visible = group === ALL_GROUPS ? follows.list : follows.list.filter((f) => f.group === group);

  return (
    <Panel
      title="Following"
      subtitle={signedIn && follows.data ? `${follows.list.length} wallet${follows.list.length === 1 ? '' : 's'}` : undefined}
      icon={<Star size={14} />}
      actions={
        signedIn && follows.data ? (
          <Popover placement="bottom-end" aria-label="Import or export follows" trigger={<IconButton size="xs" label="Import or export follows" icon={<MoreHorizontal size={14} />} />}>
            {(close) => (
              <Menu
                onDone={close}
                items={[
                  { key: 'import', label: 'Import follows…', icon: <FileUp size={14} />, onSelect: () => setImporting(true) },
                  { key: 'json', label: `Export JSON (${all.length})`, icon: <FileDown size={14} />, disabled: all.length === 0, onSelect: () => downloadFollows(all, 'json', serverNow()) },
                  { key: 'csv', label: `Export CSV (${all.length})`, icon: <ArrowDownToLine size={14} />, disabled: all.length === 0, onSelect: () => downloadFollows(all, 'csv', serverNow()) },
                ]}
              />
            )}
          </Popover>
        ) : undefined
      }
      padded={false}
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      <FollowsImportDialog open={importing} onClose={() => setImporting(false)} chain={chain} existing={all} />
      {!signedIn ? (
        <EmptyState
          compact
          icon={<Star size={16} />}
          title="Follow wallets you trust"
          description="Get their trades in your Following feed and a bell notification on every move."
          action={
            <Button size="sm" variant="primary" icon={<LogIn size={13} />} onClick={() => requireAuth(() => undefined)}>
              Sign in
            </Button>
          }
        />
      ) : follows.isError && !follows.data ? (
        <ErrorState compact error={follows.error} onRetry={() => void follows.refetch()} retrying={follows.isFetching} />
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <AddWalletForm chain={chain} group={group} existing={follows.list} />
            <GroupChips groups={groups} value={group} onChange={onGroupChange} counts={counts} />
          </div>
          {follows.isLoading ? (
            <ul className="flex flex-col gap-3 p-3" aria-busy>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Skeleton width={22} height={22} />
                  <Skeleton className="h-3 flex-1" />
                </li>
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <EmptyState
              compact
              icon={<Star size={16} />}
              title={follows.list.length === 0 ? 'No followed wallets yet' : 'No wallets in this group'}
              description={
                follows.list.length === 0 ? (
                  <>
                    Paste an address above, or find traders on the{' '}
                    <Link to={routes.leaderboard(chain)} className="text-accent hover:underline">
                      leaderboard
                    </Link>
                    .
                  </>
                ) : undefined
              }
              action={
                follows.list.length === 0 ? (
                  <Button size="sm" variant="outline" icon={<FileUp size={13} />} onClick={() => setImporting(true)}>
                    Import a list
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {[...visible].reverse().map((f) => (
                <FollowRow key={f.address} chain={chain} follow={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
});
