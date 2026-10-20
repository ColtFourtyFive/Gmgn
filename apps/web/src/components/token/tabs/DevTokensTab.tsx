// Other tokens launched by this token's creator.

import { useMemo } from 'react';
import type { DevToken, TokenDetail } from '@trenchscope/shared';
import { Age, TokenLink, Usd } from '@/components/common';
import { Badge, DataTable, EmptyState, type Column } from '@/components/ui';

export function DevTokensTab({ token, maxHeight }: { token: TokenDetail; maxHeight: number | string }) {
  const rows = token.dev.tokens;
  const columns = useMemo<Column<DevToken>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        render: (d) => <TokenLink token={d} size={22} showName extra={d.address === token.address ? <Badge tone="accent">This</Badge> : undefined} />,
      },
      { key: 'created', header: 'Created', align: 'right', sortable: true, sortValue: (d) => d.createdAt, render: (d) => <Age ts={d.createdAt} suffix=" ago" className="text-muted" /> },
      {
        key: 'status',
        header: 'Status',
        render: (d) =>
          d.rugged ? (
            <Badge tone="down">Rugged</Badge>
          ) : d.status === 'migrated' ? (
            <Badge tone="up">Migrated</Badge>
          ) : d.status === 'migrating' ? (
            <Badge tone="info">Migrating</Badge>
          ) : (
            <Badge tone="neutral">On curve</Badge>
          ),
      },
      { key: 'mc', header: 'Market cap', align: 'right', sortable: true, sortValue: (d) => d.marketCapUsd, render: (d) => <Usd value={d.marketCapUsd} /> },
      { key: 'ath', header: 'ATH MC', align: 'right', sortable: true, sortValue: (d) => d.athMarketCapUsd, render: (d) => <Usd value={d.athMarketCapUsd} className="text-muted" /> },
    ],
    [token.address],
  );
  return (
    <DataTable
      aria-label="Dev tokens"
      columns={columns}
      rows={rows}
      rowKey={(d) => d.address}
      defaultSort={{ key: 'created', dir: 'desc' }}
      compact
      maxHeight={maxHeight}
      minWidth={560}
      empty={<EmptyState compact title="No other launches" description="This is the creator’s only token so far." />}
    />
  );
}
