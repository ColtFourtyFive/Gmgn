// Deposits and withdrawals of the live wallet, newest first, with status and
// Solscan links.

import { useMemo } from 'react';
import { shortAddress, type TransferStatus, type WalletTransfer } from '@trenchscope/shared';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { Age, Compact, ExplorerLink, TxHash } from '@/components/common';
import { Badge, DataTable, EmptyState, Tooltip, type BadgeTone, type Column } from '@/components/ui';

const STATUS: Record<TransferStatus, { label: string; tone: BadgeTone; hint: string }> = {
  pending: { label: 'Pending', tone: 'warn', hint: 'Being prepared or waiting for the network' },
  sent: { label: 'Sent', tone: 'info', hint: 'Sent to Solana, waiting for confirmation' },
  confirmed: { label: 'Confirmed', tone: 'up', hint: 'Confirmed on Solana' },
  failed: { label: 'Failed', tone: 'down', hint: 'The transfer did not go through' },
};

export function TransferStatusBadge({ transfer: t }: { transfer: Pick<WalletTransfer, 'status' | 'error'> }) {
  const s = STATUS[t.status] ?? STATUS.pending;
  const badge = (
    <Badge tone={s.tone} title={t.error ? undefined : s.hint}>
      {s.label}
    </Badge>
  );
  if (!t.error) return badge;
  return (
    <Tooltip content={t.error}>
      <span tabIndex={0} className="inline-flex" aria-label={`${s.label}: ${t.error}`}>
        {badge}
      </span>
    </Tooltip>
  );
}

/** "1.5 SOL", "120K BONK" with a deposit/withdrawal sign. */
export function TransferAmount({ transfer: t }: { transfer: WalletTransfer }) {
  const deposit = t.direction === 'deposit';
  return (
    <span className={deposit ? 'text-up' : 'text-fg'}>
      {deposit ? '+' : '−'}
      <Compact value={t.amount} suffix={` ${t.symbol}`} />
    </span>
  );
}

export function TransfersTable({ rows, loading, compact }: { rows: WalletTransfer[]; loading: boolean; compact?: boolean }) {
  const columns = useMemo<Column<WalletTransfer>[]>(
    () => [
      {
        key: 'type',
        header: 'Type',
        render: (t) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            {t.direction === 'deposit' ? <ArrowDownLeft size={14} className="text-up" aria-hidden /> : <ArrowUpRight size={14} className="text-down" aria-hidden />}
            {t.direction === 'deposit' ? 'Deposit' : 'Withdrawal'}
          </span>
        ),
      },
      { key: 'amount', header: 'Amount', align: 'right', render: (t) => <TransferAmount transfer={t} /> },
      {
        key: 'counterparty',
        header: 'From / to',
        hideBelow: 'md',
        render: (t) =>
          t.counterparty ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted" title={t.counterparty}>
              <span className="num font-mono">{shortAddress(t.counterparty, 4, 4)}</span>
              <ExplorerLink chain={t.chain} kind="address" value={t.counterparty} />
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      { key: 'status', header: 'Status', render: (t) => <TransferStatusBadge transfer={t} /> },
      {
        key: 'time',
        header: 'Time',
        align: 'right',
        sortable: true,
        sortValue: (t) => t.createdAt,
        render: (t) => <Age ts={t.createdAt} suffix=" ago" className="text-muted" />,
      },
      {
        key: 'tx',
        header: 'Tx',
        align: 'right',
        hideBelow: 'sm',
        render: (t) => (t.signature ? <TxHash chain={t.chain} hash={t.signature} className="text-2xs text-faint" /> : <span className="text-faint">—</span>),
      },
    ],
    [],
  );
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(t) => t.id}
      defaultSort={{ key: 'time', dir: 'desc' }}
      loading={loading}
      skeletonRows={3}
      compact={compact}
      aria-label="Deposits and withdrawals"
      empty={
        <EmptyState
          compact
          icon={<ArrowLeftRight size={16} />}
          title="No deposits or withdrawals yet"
          description="Deposits show up here once Solana confirms them; withdrawals as soon as you send one."
        />
      }
    />
  );
}
