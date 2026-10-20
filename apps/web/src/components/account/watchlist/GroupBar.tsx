// Watchlist group tabs: All + the account's groups with counts, a "New group"
// form and, on a group tab, rename / recolour / delete.

import { useState } from 'react';
import { WATCHLIST_LIMITS, type WatchlistGroup } from '@trenchscope/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Popover, Tabs } from '@/components/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { useWatchlistActions } from '../watchlist';
import { GroupDot, GroupForm } from './WatchGroups';

export interface GroupBarProps {
  groups: WatchlistGroup[];
  /** Rows per group id under the current chain filter. */
  counts: Map<string, number>;
  /** Rows on the All tab. */
  total: number;
  /** 'all' or a group id. */
  active: string;
  onChange: (group: string) => void;
}

export function GroupBar({ groups, counts, total, active, onChange }: GroupBarProps) {
  const actions = useWatchlistActions();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<WatchlistGroup | null>(null);
  const [pending, setPending] = useState(false);
  const current = groups.find((g) => g.id === active);

  const items = [
    { value: 'all', label: 'All', count: total },
    ...groups.map((g) => ({
      value: g.id,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <GroupDot color={g.color} />
          {g.name}
        </span>
      ),
      count: counts.get(g.id) ?? 0,
    })),
  ];

  return (
    <div className="flex min-w-0 items-center gap-1 border-b border-line px-2">
      <Tabs value={active} onChange={onChange} items={items} aria-label="Watchlist groups" className="min-w-0 flex-1 border-b-0" />
      {current && (
        <Popover
          open={editing}
          onOpenChange={setEditing}
          placement="bottom-end"
          aria-label={`Edit group ${current.name}`}
          className="w-72 p-3"
          trigger={<IconButton size="xs" label={`Edit group ${current.name}`} icon={<Pencil size={13} />} />}
        >
          {(close) => (
            <div className="flex flex-col gap-3">
              <GroupForm
                key={current.id}
                groups={groups}
                group={current}
                onCancel={close}
                onSubmit={async (name, color) => {
                  if (await actions.updateGroup(current.id, { name, color })) close();
                }}
              />
              <Button
                size="xs"
                variant="danger"
                icon={<Trash2 size={12} />}
                className="self-start"
                onClick={() => {
                  close();
                  setDeleting(current);
                }}
              >
                Delete group
              </Button>
            </div>
          )}
        </Popover>
      )}
      {groups.length < WATCHLIST_LIMITS.maxGroups && (
        <Popover
          open={creating}
          onOpenChange={setCreating}
          placement="bottom-end"
          aria-label="New watchlist group"
          className="w-72 p-3"
          trigger={
            <Button size="xs" variant="ghost" icon={<Plus size={12} />} className="shrink-0" aria-label="New group">
              <span className="hidden sm:inline">New group</span>
            </Button>
          }
        >
          {(close) => (
            <GroupForm
              groups={groups}
              onCancel={close}
              onSubmit={async (name, color) => {
                const g = await actions.createGroup(name, color ?? undefined);
                if (!g) return;
                close();
                onChange(g.id);
              }}
            />
          )}
        </Popover>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        pending={pending}
        danger
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="Its tokens stay on your watchlist under All; only the group goes."
        confirmLabel="Delete group"
        onConfirm={() => {
          if (!deleting) return;
          setPending(true);
          void actions.deleteGroup(deleting.id).then((ok) => {
            setPending(false);
            setDeleting(null);
            if (ok && active === deleting.id) onChange('all');
          });
        }}
      />
    </div>
  );
}
